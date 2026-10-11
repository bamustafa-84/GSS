-- ================================================================
-- GSS · Role-based permission TEMPLATES
-- ----------------------------------------------------------------
-- A reusable permission template system layered on top of the
-- per-user Permission Matrix (user_permission, see 95_permissions.sql).
--
--   • One "system" template per role (Admin, Head of Training,
--     Instructor, Secretary) seeded from role_default_permissions().
--   • Admins may edit a template, duplicate it, create fully custom
--     templates, apply a template to one or many users, and reset a
--     single user back to a template.
--   • A template is the single definition of a permission set; many
--     users can share it. Applying a template COPIES its items into
--     each user's matrix, so editing a template never silently changes
--     existing users — the admin must explicitly re-apply.
--
-- Runs after 95 (prefix 96) so user_permission / role_default_permissions
-- / permission_seed / permission_migration already exist. Idempotent;
-- safe to re-run on every startup.
-- ================================================================

-- ── Storage ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permission_template (
  template_id bigserial    PRIMARY KEY,
  name        text         NOT NULL,
  role        text,                       -- associated role (system) or suggested base role (custom)
  is_system   boolean      NOT NULL DEFAULT false,
  created_by  text,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  text,
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Template names are unique (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS permission_template_name_uidx
  ON permission_template (lower(name));

-- At most one SYSTEM template per role.
CREATE UNIQUE INDEX IF NOT EXISTS permission_template_role_sys_uidx
  ON permission_template (lower(role)) WHERE is_system;

CREATE TABLE IF NOT EXISTS permission_template_item (
  template_id bigint NOT NULL REFERENCES permission_template(template_id) ON DELETE CASCADE,
  section_no  text   NOT NULL,   -- e.g. '1.1', '10.6'
  action      text   NOT NULL,   -- view | add | edit | delete | approve | print | export | …
  PRIMARY KEY (template_id, section_no, action)
);

CREATE INDEX IF NOT EXISTS permission_template_item_tpl_idx
  ON permission_template_item (template_id);

-- Which template a login is currently based on (informational + reset target).
-- Editing permissions directly does NOT clear this link.
ALTER TABLE login
  ADD COLUMN IF NOT EXISTS template_id bigint
  REFERENCES permission_template(template_id) ON DELETE SET NULL;

-- ── Helper: a template's permissions as { "1.1": ["view", …] } ──
CREATE OR REPLACE FUNCTION template_permissions_map(p_template_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_object_agg(section_no, acts), '{}'::jsonb)
  FROM (
    SELECT section_no, jsonb_agg(action ORDER BY action) AS acts
    FROM permission_template_item
    WHERE template_id = p_template_id
    GROUP BY section_no
  ) t;
$$;

-- ── Seed: one system template per role (one-time per role) ──────
-- Only creates a template when none exists for the role, so later admin
-- edits are never overwritten on restart.
CREATE OR REPLACE FUNCTION permission_templates_seed_system()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  roles text[] := ARRAY['Admin','Head of Training','Instructor','Secretary'];
  r     text;
  v_id  bigint;
  v_n   integer := 0;
BEGIN
  FOREACH r IN ARRAY roles LOOP
    SELECT template_id INTO v_id
    FROM permission_template
    WHERE is_system AND lower(role) = lower(r)
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO permission_template (name, role, is_system, created_by, updated_by)
      VALUES (r, r, true, 'SYSTEM', 'SYSTEM')
      RETURNING template_id INTO v_id;

      INSERT INTO permission_template_item (template_id, section_no, action)
      SELECT v_id, e.key, a.value
      FROM jsonb_each(role_default_permissions(r)) e,
           jsonb_array_elements_text(e.value) a
      ON CONFLICT DO NOTHING;

      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

-- ── Read: list all templates (with light history + usage) ──────
CREATE OR REPLACE FUNCTION permission_templates_list()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'template_id', pt.template_id,
           'name',        pt.name,
           'role',        pt.role,
           'is_system',   pt.is_system,
           'created_by',  pt.created_by,
           'created_at',  pt.created_at,
           'updated_by',  pt.updated_by,
           'updated_at',  pt.updated_at,
           'user_count',  (SELECT count(*) FROM login l WHERE l.template_id = pt.template_id)
         ) ORDER BY pt.is_system DESC, lower(pt.name)), '[]'::jsonb)
  FROM permission_template pt;
$$;

-- ── Read: a single template (meta + permission map) ────────────
CREATE OR REPLACE FUNCTION permission_template_get(p_template_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v permission_template%ROWTYPE;
BEGIN
  SELECT * INTO v FROM permission_template WHERE template_id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'template_id', v.template_id,
    'name', v.name,
    'role', v.role,
    'is_system', v.is_system,
    'created_by', v.created_by,
    'created_at', v.created_at,
    'updated_by', v.updated_by,
    'updated_at', v.updated_at,
    'user_count', (SELECT count(*) FROM login l WHERE l.template_id = v.template_id),
    'assigned_users', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'login_id',  l.login_id,
               'username',  l.username,
               'full_name', l.full_name,
               'role',      l.role,
               'is_active', l.is_active
             ) ORDER BY lower(coalesce(l.full_name, l.username))), '[]'::jsonb)
      FROM login l
      WHERE l.template_id = v.template_id
    ),
    'permissions', template_permissions_map(v.template_id)
  );
END;
$$;

-- ── Write: replace a template's permission set ─────────────────
-- p_data accepts { "items": [ { "no": "1.1", "action": "view" }, … ] }
-- or a bare array of the same objects. Existing user matrices are NOT
-- touched — the admin must explicitly (re)apply the template.
CREATE OR REPLACE FUNCTION permission_template_save(p_template_id bigint, p_data jsonb, p_actor text DEFAULT 'ADMIN')
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_items jsonb := coalesce(p_data -> 'items', p_data, '[]'::jsonb);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM permission_template WHERE template_id = p_template_id) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  DELETE FROM permission_template_item WHERE template_id = p_template_id;

  INSERT INTO permission_template_item (template_id, section_no, action)
  SELECT p_template_id, trim(e ->> 'no'), lower(trim(e ->> 'action'))
  FROM jsonb_array_elements(v_items) e
  WHERE coalesce(trim(e ->> 'no'), '') <> ''
    AND coalesce(trim(e ->> 'action'), '') <> ''
  ON CONFLICT DO NOTHING;

  UPDATE permission_template
     SET updated_by = coalesce(nullif(p_actor, ''), 'ADMIN'), updated_at = now()
   WHERE template_id = p_template_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ok',
    'count', (SELECT count(*) FROM permission_template_item WHERE template_id = p_template_id)
  );
END;
$$;

-- ── Create: a new CUSTOM template ──────────────────────────────
CREATE OR REPLACE FUNCTION permission_template_create(p_name text, p_role text, p_data jsonb, p_actor text DEFAULT 'ADMIN')
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id    bigint;
  v_items jsonb := coalesce(p_data -> 'items', p_data, '[]'::jsonb);
  v_name  text  := trim(coalesce(p_name, ''));
  v_actor text  := coalesce(nullif(p_actor, ''), 'ADMIN');
BEGIN
  IF v_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid_name');
  END IF;
  IF EXISTS (SELECT 1 FROM permission_template WHERE lower(name) = lower(v_name)) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'exists');
  END IF;

  INSERT INTO permission_template (name, role, is_system, created_by, updated_by)
  VALUES (v_name, nullif(trim(coalesce(p_role, '')), ''), false, v_actor, v_actor)
  RETURNING template_id INTO v_id;

  INSERT INTO permission_template_item (template_id, section_no, action)
  SELECT v_id, trim(e ->> 'no'), lower(trim(e ->> 'action'))
  FROM jsonb_array_elements(v_items) e
  WHERE coalesce(trim(e ->> 'no'), '') <> ''
    AND coalesce(trim(e ->> 'action'), '') <> ''
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'template_id', v_id);
END;
$$;

-- ── Duplicate: copy an existing template into a new custom one ──
CREATE OR REPLACE FUNCTION permission_template_duplicate(p_template_id bigint, p_new_name text, p_actor text DEFAULT 'ADMIN')
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_src   permission_template%ROWTYPE;
  v_id    bigint;
  v_name  text := trim(coalesce(p_new_name, ''));
  v_actor text := coalesce(nullif(p_actor, ''), 'ADMIN');
BEGIN
  SELECT * INTO v_src FROM permission_template WHERE template_id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  IF v_name = '' THEN v_name := v_src.name || ' (Copy)'; END IF;
  IF EXISTS (SELECT 1 FROM permission_template WHERE lower(name) = lower(v_name)) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'exists');
  END IF;

  INSERT INTO permission_template (name, role, is_system, created_by, updated_by)
  VALUES (v_name, v_src.role, false, v_actor, v_actor)
  RETURNING template_id INTO v_id;

  INSERT INTO permission_template_item (template_id, section_no, action)
  SELECT v_id, section_no, action
  FROM permission_template_item
  WHERE template_id = p_template_id;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'template_id', v_id);
END;
$$;

-- ── Delete: remove a CUSTOM template (system templates protected) ─
-- Users linked to it keep their current matrix; their template_id is
-- cleared by the ON DELETE SET NULL FK.
CREATE OR REPLACE FUNCTION permission_template_delete(p_template_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_sys boolean;
BEGIN
  SELECT is_system INTO v_sys FROM permission_template WHERE template_id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;
  IF v_sys THEN
    RETURN jsonb_build_object('ok', false, 'status', 'system_protected');
  END IF;

  DELETE FROM permission_template WHERE template_id = p_template_id;
  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- ── Apply: copy a template's items into one or many users ───────
-- p_login_ids is a jsonb array of login_id (e.g. [1,5,9]). Each user's
-- matrix is replaced wholesale with the template, and the user is linked
-- to the template. Marks the users as seeded so lazy seeding never undoes
-- an explicit apply.
CREATE OR REPLACE FUNCTION permission_template_apply(p_template_id bigint, p_login_ids jsonb, p_actor text DEFAULT 'ADMIN')
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_ids   bigint[];
  v_id    bigint;
  v_actor text := coalesce(nullif(p_actor, ''), 'ADMIN');
  v_n     integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM permission_template WHERE template_id = p_template_id) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  SELECT array_agg((x)::bigint)
    INTO v_ids
  FROM jsonb_array_elements_text(coalesce(p_login_ids, '[]'::jsonb)) x
  WHERE coalesce(trim(x), '') <> '';

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_users');
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    IF EXISTS (SELECT 1 FROM login WHERE login_id = v_id) THEN
      DELETE FROM user_permission WHERE login_id = v_id;

      INSERT INTO user_permission (login_id, section_no, action, allowed, updated_by)
      SELECT v_id, section_no, action, true, v_actor
      FROM permission_template_item
      WHERE template_id = p_template_id
      ON CONFLICT (login_id, section_no, action) DO NOTHING;

      UPDATE login SET template_id = p_template_id WHERE login_id = v_id;
      INSERT INTO permission_seed (login_id) VALUES (v_id) ON CONFLICT DO NOTHING;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'count', v_n);
END;
$$;

-- ── Apply the role's system template to a freshly created user ──
-- Called by the server right after auth_register. Roles without a system
-- template (e.g. Candidate) fall through to permissions_seed_missing().
CREATE OR REPLACE FUNCTION user_apply_role_template(p_login_id bigint, p_actor text DEFAULT 'ADMIN')
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
  v_tpl  bigint;
BEGIN
  SELECT role INTO v_role FROM login WHERE login_id = p_login_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  SELECT template_id INTO v_tpl
  FROM permission_template
  WHERE is_system AND lower(role) = lower(coalesce(v_role, ''))
  LIMIT 1;

  IF v_tpl IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', 'no_template');
  END IF;

  RETURN permission_template_apply(v_tpl, jsonb_build_array(p_login_id), p_actor);
END;
$$;

-- ── Seed system templates now, then backfill template links ────
SELECT permission_templates_seed_system();

-- One-time: rename any legacy system templates ('<Role> (Default)') to the
-- plain role name, unless a different template already owns that name.
UPDATE permission_template pt
   SET name = pt.role
 WHERE pt.is_system
   AND pt.name = pt.role || ' (Default)'
   AND NOT EXISTS (
     SELECT 1 FROM permission_template x
      WHERE lower(x.name) = lower(pt.role) AND x.template_id <> pt.template_id
   );

-- One-time: link existing logins to their role's system template WITHOUT
-- changing any permissions (purely the informational template_id link).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM permission_migration WHERE name = 'link_role_templates') THEN
    UPDATE login l
       SET template_id = pt.template_id
      FROM permission_template pt
     WHERE pt.is_system
       AND lower(pt.role) = lower(coalesce(l.role, ''))
       AND l.template_id IS NULL;
    INSERT INTO permission_migration (name) VALUES ('link_role_templates');
  END IF;
END $$;
