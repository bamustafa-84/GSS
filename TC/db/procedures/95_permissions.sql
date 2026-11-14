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

-- ── Seed template (one-time) ────────────────────────────────────
-- The pre-matrix role defaults, expressed with the current section IDs.
-- This is NOT consulted for authorization: it only seeds user_permission
-- once per login (see permissions_seed_missing). After seeding, the saved
-- Permission Matrix (user_permission) is the single source of truth.
CREATE OR REPLACE FUNCTION role_default_permissions(p_role text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r     text   := lower(coalesce(p_role, ''));
  secs  text[] := ARRAY['1.1','1.2','2.1','3.1','4.1','5.1','6.1','7.1','7.2','8.1','9.1','10.1','10.2','10.3','10.4','10.5','10.6'];
  s     text;
  acts  text[];
  out   jsonb  := '{}'::jsonb;
BEGIN
  FOREACH s IN ARRAY secs LOOP
    acts := ARRAY[]::text[];

    IF r = 'admin' THEN
      acts := ARRAY['view','add','edit','delete','approve','print'];

    ELSIF r = 'instructor' THEN
      acts := CASE s
        WHEN '1.1'  THEN ARRAY['view','add','edit','print']
        WHEN '1.2'  THEN ARRAY['view','add','print']
        WHEN '2.1'  THEN ARRAY['view','add','edit','print']
        WHEN '3.1'  THEN ARRAY['view','add','edit','print']
        WHEN '4.1'  THEN ARRAY['view']
        WHEN '5.1'  THEN ARRAY['view','add','edit','delete','approve','print']
        WHEN '6.1'  THEN ARRAY['view']
        WHEN '7.1'  THEN ARRAY['view']
        WHEN '7.2'  THEN ARRAY['view','add','edit']
        WHEN '10.2' THEN ARRAY['view','add','edit','print']
        ELSE ARRAY[]::text[]
      END;

    ELSIF r = 'head of training' THEN
      acts := ARRAY['view','print'];
      IF s IN ('6.1','7.1','7.2') THEN acts := acts || ARRAY['add','edit']; END IF;
      IF s = '6.1' THEN acts := acts || ARRAY['approve']; END IF;
      IF s IN ('10.3','10.5','10.6') THEN acts := ARRAY[]::text[]; END IF;
      IF s = '10.4' THEN acts := ARRAY['view']; END IF;

    ELSIF r = 'secretary' THEN
      IF s IN ('1.1','1.2','2.1','3.1') THEN
        acts := ARRAY['view','add','edit','print'];
      ELSIF s = '10.1' THEN
        acts := ARRAY['view','print'];
      ELSIF s = '10.2' THEN
        -- Secretary records attendance for assigned courses (sheet editing).
        acts := ARRAY['view','add','edit','print'];
      ELSIF s IN ('10.3','10.6') THEN
        acts := ARRAY[]::text[];
      ELSE
        acts := ARRAY['view'];
      END IF;

    ELSIF r = 'candidate' THEN
      IF s IN ('1.1','2.1','3.1','4.1') THEN acts := ARRAY['view','add','edit'];
      ELSIF s IN ('5.1','6.1') THEN acts := ARRAY['view'];
      END IF;
    END IF;

    IF array_length(acts, 1) > 0 THEN
      out := out || jsonb_build_object(s, to_jsonb(acts));
    END IF;
  END LOOP;

  RETURN out;
END;
$$;

-- One-time seeding marker: a login is seeded at most once, so later
-- revocations in the matrix are never undone by a restart.
CREATE TABLE IF NOT EXISTS permission_seed (
  login_id  bigint PRIMARY KEY REFERENCES login(login_id) ON DELETE CASCADE,
  seeded_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION permissions_seed_missing()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_n integer := 0;
  l   record;
BEGIN
  FOR l IN
    SELECT login_id, role FROM login
    WHERE login_id NOT IN (SELECT login_id FROM permission_seed)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM user_permission WHERE login_id = l.login_id) THEN
      INSERT INTO user_permission (login_id, section_no, action, allowed, updated_by)
      SELECT l.login_id, e.key, a.value, true, 'SEED'
      FROM jsonb_each(role_default_permissions(l.role)) e,
           jsonb_array_elements_text(e.value) a
      ON CONFLICT DO NOTHING;
    END IF;
    INSERT INTO permission_seed (login_id) VALUES (l.login_id) ON CONFLICT DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
-- ── Read: permissions for the admin modal (by login_id) ─────────
-- Returns the saved matrix rows only (no role-based fallback).
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
-- Resolves ONLY from the saved Permission Matrix (user_permission).
-- Deny by default: unknown user, disabled account, missing row, or an
-- action not explicitly granted. No role name grants anything here.
CREATE OR REPLACE FUNCTION user_can(p_login_id bigint, p_section text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v login%ROWTYPE;
BEGIN
  SELECT * INTO v FROM login WHERE login_id = p_login_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT coalesce(v.is_active, true) THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_permission
    WHERE login_id = v.login_id AND section_no = p_section
      AND action = lower(p_action) AND allowed
  );
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

-- ── Record-level rule: does this login own (teach) the training? ─
-- Non-instructors are not restricted here (their section permissions
-- decide); Instructors may only touch trainings where trainer = their name.
CREATE OR REPLACE FUNCTION instructor_owns_training(p_login_id bigint, p_training_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(l.role, '')) <> 'instructor' THEN true
    ELSE EXISTS (
      SELECT 1 FROM training tr
      WHERE tr.training_id = p_training_id
        AND lower(trim(tr.trainer)) = lower(trim(l.full_name))
    )
  END
  FROM login l WHERE l.login_id = p_login_id;
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

-- ── One-time migration: System Features 10.3–10.6 ───────────────
-- Grants the new sections to existing logins so their toolbar access is
-- unchanged (Signatures/Exams: Admin; Pending to Reviews: Admin, Head of
-- Training, Secretary; Applicants to Process: Admin, Secretary). Runs once;
-- afterwards the matrix alone decides and revocations are never undone.
CREATE TABLE IF NOT EXISTS permission_migration (
  name       text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM permission_migration WHERE name = 'system_features_10_3_to_10_6') THEN
    INSERT INTO user_permission (login_id, section_no, action, allowed, updated_by)
    SELECT l.login_id, s.sec, a.act, true, 'MIGRATION'
    FROM login l
    JOIN (VALUES
      ('admin','10.3'),('admin','10.4'),('admin','10.5'),('admin','10.6'),
      ('head of training','10.4'),
      ('secretary','10.4'),('secretary','10.5')
    ) AS s(role_name, sec) ON lower(coalesce(l.role,'')) = s.role_name
    CROSS JOIN LATERAL (
      SELECT unnest(CASE WHEN s.role_name = 'admin'
                         THEN ARRAY['view','add','edit','delete','approve','print']
                         ELSE ARRAY['view'] END) AS act
    ) a
    ON CONFLICT (login_id, section_no, action) DO NOTHING;
    INSERT INTO permission_migration (name) VALUES ('system_features_10_3_to_10_6');
  END IF;
END $$;

-- ── One-time migration: Secretary attendance-sheet editing (10.2) ──
-- The attendance sheet now derives its edit rights from the matrix (section
-- 10.2) instead of a hardcoded role list. Secretaries previously had implicit
-- edit access, so grant existing Secretary logins add/edit on 10.2 to keep
-- their behaviour unchanged. Runs once; later matrix edits are authoritative.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM permission_migration WHERE name = 'secretary_attendance_edit_10_2') THEN
    INSERT INTO user_permission (login_id, section_no, action, allowed, updated_by)
    SELECT l.login_id, '10.2', a.act, true, 'MIGRATION'
    FROM login l
    CROSS JOIN (VALUES ('add'), ('edit')) AS a(act)
    WHERE lower(coalesce(l.role,'')) = 'secretary'
    ON CONFLICT (login_id, section_no, action) DO NOTHING;
    INSERT INTO permission_migration (name) VALUES ('secretary_attendance_edit_10_2');
  END IF;
END $$;
-- Seed the matrix once for logins that predate it (new users: see server).
SELECT permissions_seed_missing();
