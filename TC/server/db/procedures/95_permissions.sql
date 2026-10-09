-- ================================================================
-- GSS · Per-user permissions, instructor courses & training stats
-- ----------------------------------------------------------------
-- Backs the Roles & Permissions panel (System Management) with real
-- persistence and server-side enforcement, plus two read helpers used
-- by the home dashboard (trainees-trained statistic) and the
-- permissions panel (instructor courses).
--
-- Runs last (file prefix 95) so every table it references already
-- exists. Safe to re-run on every startup.
-- ================================================================

-- ── Storage ─────────────────────────────────────────────────────
-- One row per (user, section, action). section_no/action are free
-- text so new sections or new action verbs need NO schema change —
-- the model is fully dynamic and forward-compatible.
CREATE TABLE IF NOT EXISTS user_permission (
  login_id    bigint      NOT NULL REFERENCES login(login_id) ON DELETE CASCADE,
  section_no  text        NOT NULL,   -- e.g. '1.1', '10.7'
  action      text        NOT NULL,   -- view | add | edit | delete | approve | print | export | …
  allowed     boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  PRIMARY KEY (login_id, section_no, action)
);

CREATE INDEX IF NOT EXISTS user_permission_login_idx ON user_permission (login_id);

-- ── Role default matrix ─────────────────────────────────────────
-- Mirrors the client-side defaults (system-management.js) so a user
-- without any stored rows still resolves sensible, role-based access.
-- Returns a jsonb map: { "1.1": ["view","add"], … }.
CREATE OR REPLACE FUNCTION role_default_permissions(p_role text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r     text   := lower(coalesce(p_role, ''));
  secs  text[] := ARRAY['1.1','1.2','2.1','2.2','3.1','3.2','4.1','4.2','5.1','5.2',
                        '6.1','6.2','6.3','6.4','7.1','7.2','7.3','7.4','8.1','8.2',
                        '8.3','9.1','9.2','10.1','10.2','10.3','10.4','10.5','10.6','10.7'];
  s     text;
  acts  text[];
  out   jsonb  := '{}'::jsonb;
BEGIN
  FOREACH s IN ARRAY secs LOOP
    acts := ARRAY[]::text[];

    IF r = 'admin' THEN
      acts := ARRAY['view','add','edit','delete','approve','print','export'];

    ELSIF r = 'instructor' THEN
      acts := CASE s
        WHEN '1.1'  THEN ARRAY['view','add','edit','print']
        WHEN '1.2'  THEN ARRAY['view','add','print']
        WHEN '2.1'  THEN ARRAY['view','add','edit','print']
        WHEN '2.2'  THEN ARRAY['view','add','print']
        WHEN '3.1'  THEN ARRAY['view','add','edit','print']
        WHEN '3.2'  THEN ARRAY['view','add','print']
        WHEN '4.1'  THEN ARRAY['view']
        WHEN '4.2'  THEN ARRAY['view']
        WHEN '5.1'  THEN ARRAY['view','add','edit','delete','approve','print']
        WHEN '5.2'  THEN ARRAY['view','print']
        WHEN '6.1'  THEN ARRAY['view']
        WHEN '6.2'  THEN ARRAY['view','add','edit']
        WHEN '6.3'  THEN ARRAY['view','add','edit']
        WHEN '6.4'  THEN ARRAY['view']
        WHEN '7.1'  THEN ARRAY['view']
        WHEN '7.2'  THEN ARRAY['view','add','edit']
        WHEN '7.3'  THEN ARRAY['view','add','edit']
        WHEN '7.4'  THEN ARRAY['view','add']
        WHEN '10.5' THEN ARRAY['view','edit']
        WHEN '10.6' THEN ARRAY['view','add','edit','print']
        ELSE ARRAY[]::text[]
      END;

    ELSIF r = 'head of training' THEN
      acts := ARRAY['view','print','export'];
      IF s IN ('6.1','6.2','6.3','6.4','7.1','7.2','7.3','7.4') THEN
        acts := acts || ARRAY['add','edit'];
      END IF;
      IF s IN ('6.4','9.2') THEN
        acts := acts || ARRAY['approve'];
      END IF;

    ELSIF r = 'secretary' THEN
      IF s LIKE '1.%' OR s LIKE '2.%' OR s LIKE '3.%' THEN
        acts := ARRAY['view','add','edit','print'];
      ELSIF s IN ('10.1','10.6') THEN
        acts := ARRAY['view','print'];
      ELSE
        acts := ARRAY['view'];
      END IF;
    END IF;
    -- Candidate / unknown → no staff access (acts stays empty).

    IF array_length(acts, 1) > 0 THEN
      out := out || jsonb_build_object(s, to_jsonb(acts));
    END IF;
  END LOOP;

  RETURN out;
END;
$$;

-- ── Read: permissions for the admin modal (by login_id) ─────────
-- Returns stored rows when present, otherwise the role defaults so the
-- grid pre-checks sensible boxes for users not yet customized.
CREATE OR REPLACE FUNCTION user_permissions_get(p_login_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v     login%ROWTYPE;
  v_map jsonb;
  v_has boolean;
BEGIN
  SELECT * INTO v FROM login WHERE login_id = p_login_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  SELECT coalesce(jsonb_object_agg(section_no, acts), '{}'::jsonb) INTO v_map
  FROM (
    SELECT section_no, jsonb_agg(action ORDER BY action) AS acts
    FROM user_permission
    WHERE login_id = v.login_id AND allowed
    GROUP BY section_no
  ) t;

  v_has := (v_map <> '{}'::jsonb);
  IF NOT v_has THEN
    v_map := role_default_permissions(v.role);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'login_id', v.login_id,
    'username', v.username,
    'role', v.role,
    'has_custom', v_has,
    'permissions', v_map
  );
END;
$$;

-- ── Read: effective permissions for the signed-in user ──────────
-- Used by the UI gating layer and (via user_can) by server enforcement.
CREATE OR REPLACE FUNCTION user_effective_permissions(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v     login%ROWTYPE;
  v_map jsonb;
BEGIN
  SELECT * INTO v FROM login WHERE lower(username) = lower(p_username) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'permissions', '{}'::jsonb);
  END IF;

  SELECT coalesce(jsonb_object_agg(section_no, acts), '{}'::jsonb) INTO v_map
  FROM (
    SELECT section_no, jsonb_agg(action ORDER BY action) AS acts
    FROM user_permission
    WHERE login_id = v.login_id AND allowed
    GROUP BY section_no
  ) t;

  IF v_map = '{}'::jsonb THEN
    v_map := role_default_permissions(v.role);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'login_id', v.login_id,
    'username', v.username,
    'role', v.role,
    'is_active', coalesce(v.is_active, true),
    'permissions', v_map
  );
END;
$$;

-- ── Write: replace a user's permission set ──────────────────────
-- p_data accepts { "items": [ { "no": "1.1", "action": "view" }, … ] }
-- or a bare array of the same objects. The set is replaced wholesale.
CREATE OR REPLACE FUNCTION user_permissions_save(p_login_id bigint, p_data jsonb, p_actor text DEFAULT 'ADMIN')
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_items jsonb := coalesce(p_data -> 'items', p_data, '[]'::jsonb);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM login WHERE login_id = p_login_id) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  DELETE FROM user_permission WHERE login_id = p_login_id;

  INSERT INTO user_permission (login_id, section_no, action, allowed, updated_by)
  SELECT p_login_id,
         trim(e ->> 'no'),
         lower(trim(e ->> 'action')),
         true,
         coalesce(nullif(p_actor, ''), 'ADMIN')
  FROM jsonb_array_elements(v_items) e
  WHERE coalesce(trim(e ->> 'no'), '') <> ''
    AND coalesce(trim(e ->> 'action'), '') <> ''
  ON CONFLICT (login_id, section_no, action) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ok',
    'count', (SELECT count(*) FROM user_permission WHERE login_id = p_login_id)
  );
END;
$$;

-- ── Enforcement: can this user perform (section, action)? ───────
-- Admins always pass; disabled accounts always fail. Falls back to the
-- role default matrix when the user has no stored rows.
CREATE OR REPLACE FUNCTION user_can(p_login_id bigint, p_section text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v     login%ROWTYPE;
  v_has boolean;
BEGIN
  SELECT * INTO v FROM login WHERE login_id = p_login_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT coalesce(v.is_active, true) THEN RETURN false; END IF;
  IF lower(coalesce(v.role, '')) = 'admin' THEN RETURN true; END IF;

  SELECT count(*) > 0 INTO v_has FROM user_permission WHERE login_id = v.login_id;
  IF v_has THEN
    RETURN EXISTS (
      SELECT 1 FROM user_permission
      WHERE login_id = v.login_id AND section_no = p_section
        AND action = lower(p_action) AND allowed
    );
  END IF;

  RETURN (role_default_permissions(v.role) -> p_section) ? lower(p_action);
END;
$$;

-- Username-keyed convenience wrapper.
CREATE OR REPLACE FUNCTION user_can(p_username text, p_section text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT user_can(l.login_id, p_section, p_action)
  FROM login l WHERE lower(l.username) = lower(p_username) LIMIT 1;
$$;

-- ── Read: instructor courses (by trainer full name) ─────────────
CREATE OR REPLACE FUNCTION instructor_courses(p_trainer text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(c ORDER BY (c->>'date_from') DESC NULLS LAST), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'training_id', tr.training_id,
      'title',       tr.title,
      'trainer',     tr.trainer,
      'date_from',   tr."from",
      'date_to',     tr."to",
      'status', CASE
                  WHEN now() < tr."from" THEN 'Planned'
                  WHEN now() > tr."to"   THEN 'Completed'
                  ELSE 'In Progress'
                END,
      'trainees', (SELECT count(*) FROM applicant_training at WHERE at.training_id = tr.training_id)
    ) AS c
    FROM training tr
    WHERE coalesce(nullif(trim(p_trainer), ''), '') <> ''
      AND lower(trim(tr.trainer)) = lower(trim(p_trainer))
  ) t;
$$;

-- ── Read: active instructors (for the Attendance trainer dropdown) ─
CREATE OR REPLACE FUNCTION instructors_list()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'login_id',  l.login_id,
           'username',  l.username,
           'full_name', l.full_name
         ) ORDER BY l.full_name), '[]'::jsonb)
  FROM login l
  WHERE lower(l.role) = 'instructor'
    AND coalesce(l.is_active, true);
$$;

-- ── Read: trainees who have completed their training ────────────
-- Distinct candidates assigned to a training whose window has ended
-- (status = Completed). Each trainee is counted once even across many
-- completed courses.
CREATE OR REPLACE FUNCTION trainees_trained_count()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object('ok', true, 'count', (
    SELECT count(DISTINCT at.candidate_no)
    FROM applicant_training at
    JOIN training tr ON tr.training_id = at.training_id
    WHERE now() > tr."to"
  ));
$$;
