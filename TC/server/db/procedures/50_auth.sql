-- ================================================================
-- GSS · Authentication procedures (backed by the `login` table)
-- ----------------------------------------------------------------
-- All authentication transactions (account creation, login, first-login
-- password change, self-service reset) operate on the existing `login`
-- table so every created user is persisted there.
--
--   login(login_id PK identity, username, password, full_name,
--         created_by, created_at, updated_by, updated_at, …)
--
-- The `password` column stores a pgcrypto Blowfish (bf) hash — the salt is
-- embedded in the hash, so verification is a constant-time
-- `crypt(candidate, stored) = stored` comparison (never plaintext).
--
-- A few auth-support columns are added to `login` (idempotently) for the
-- first-login flow and brute-force protection.
--
-- Naming convention: Auth_<Transaction>
--   auth_register / auth_login / auth_change_password / auth_forgot_password
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Auth-support columns on the existing login table (no-ops when present).
ALTER TABLE login ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE login ADD COLUMN IF NOT EXISTS is_active            boolean NOT NULL DEFAULT true;
ALTER TABLE login ADD COLUMN IF NOT EXISTS failed_attempts      int     NOT NULL DEFAULT 0;
ALTER TABLE login ADD COLUMN IF NOT EXISTS locked_until         timestamp;
ALTER TABLE login ADD COLUMN IF NOT EXISTS last_login_at        timestamp;
ALTER TABLE login ADD COLUMN IF NOT EXISTS role                 varchar(50) NOT NULL DEFAULT 'Candidate';

-- Case-insensitive uniqueness on username.
CREATE UNIQUE INDEX IF NOT EXISTS login_username_lower_idx ON login (lower(username));

-- Normalise an arbitrary role string to one of the five supported roles,
-- falling back to 'Candidate' for anything unrecognised.
CREATE OR REPLACE FUNCTION auth_valid_role(p_role text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(coalesce(p_role, '')) = ANY (ARRAY['admin','head of training','secretary','candidate','instructor'])
    THEN (ARRAY['Admin','Head of Training','Secretary','Candidate','Instructor'])[
           array_position(ARRAY['admin','head of training','secretary','candidate','instructor'], lower(p_role))]
    ELSE 'Candidate'
  END;
$$;

-- Seed a default administrator on a fresh install. Flagged to force a password
-- change on first login. (username: admin / password: admin123)
INSERT INTO login (username, full_name, password, created_by, created_at, must_change_password, role)
SELECT 'admin', 'Administrator', crypt('admin123', gen_salt('bf')), 'SYSTEM', now(), true, 'Admin'
WHERE NOT EXISTS (SELECT 1 FROM login WHERE lower(username) = 'admin');

-- Ensure the built-in admin always keeps the Admin role.
UPDATE login SET role = 'Admin' WHERE lower(username) = 'admin' AND coalesce(role, '') <> 'Admin';

-- ----------------------------------------------------------------
-- Auth_Register: create a new account (used by the sign-up form). Inserts the
-- user into the `login` table.
--   Returns jsonb: { ok, status, user? }  status ∈ 'ok' | 'exists' | 'weak' | 'invalid'
--   p_must_change: flag the account to change its password on first login.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_register(
  p_username     text,
  p_full_name    text,
  p_password     text,
  p_must_change  boolean DEFAULT false,
  p_role         text    DEFAULT 'Candidate'
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user login%ROWTYPE;
BEGIN
  IF coalesce(trim(p_username), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;
  IF length(coalesce(p_password, '')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'weak');
  END IF;

  IF EXISTS (SELECT 1 FROM login WHERE lower(username) = lower(p_username)) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'exists');
  END IF;

  INSERT INTO login (username, full_name, password, created_by, created_at, must_change_password, role)
  VALUES (
    trim(p_username),
    coalesce(NULLIF(trim(coalesce(p_full_name, '')), ''), trim(p_username)),
    crypt(p_password, gen_salt('bf')),
    trim(p_username),
    now(),
    coalesce(p_must_change, false),
    auth_valid_role(p_role)
  )
  RETURNING * INTO v_user;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ok',
    'user', jsonb_build_object(
      'user_id', v_user.login_id,
      'username', v_user.username,
      'full_name', v_user.full_name,
      'role', v_user.role
    )
  );
END;
$$;

-- ----------------------------------------------------------------
-- Auth_Login: verify a username/password pair against the `login` table.
--   Returns jsonb:
--     { ok, status, user?, must_change_password?, attempts_left?, locked_until? }
--   status ∈ 'ok' | 'invalid' | 'inactive' | 'locked'
--   p_force_change: when true, the account is flagged so the caller must
--     change the password before continuing.
-- Brute-force guard: 5 consecutive failures lock the account for 15 minutes.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_login(
  p_username     text,
  p_password     text,
  p_force_change boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user   login%ROWTYPE;
  v_max    int := 5;
  v_locked interval := interval '15 minutes';
BEGIN
  IF coalesce(p_username, '') = '' OR coalesce(p_password, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  SELECT * INTO v_user
  FROM login
  WHERE lower(username) = lower(p_username)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  IF v_user.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 'inactive');
  END IF;

  IF v_user.locked_until IS NOT NULL AND v_user.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'status', 'locked', 'locked_until', v_user.locked_until);
  END IF;

  -- Wrong password → count the failure and lock after too many attempts.
  IF crypt(p_password, v_user.password) <> v_user.password THEN
    UPDATE login
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE
             WHEN failed_attempts + 1 >= v_max THEN now() + v_locked
             ELSE locked_until
           END,
           updated_by = 'SYSTEM',
           updated_at = now()
     WHERE login_id = v_user.login_id
     RETURNING * INTO v_user;

    IF v_user.locked_until IS NOT NULL AND v_user.locked_until > now() THEN
      RETURN jsonb_build_object('ok', false, 'status', 'locked', 'locked_until', v_user.locked_until);
    END IF;

    RETURN jsonb_build_object(
      'ok', false, 'status', 'invalid',
      'attempts_left', GREATEST(v_max - v_user.failed_attempts, 0)
    );
  END IF;

  -- Correct password → reset counters, record the login, honour force-change.
  UPDATE login
     SET failed_attempts = 0,
         locked_until = NULL,
         last_login_at = now(),
         must_change_password = must_change_password OR coalesce(p_force_change, false),
         updated_by = v_user.username,
         updated_at = now()
   WHERE login_id = v_user.login_id
   RETURNING * INTO v_user;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ok',
    'must_change_password', v_user.must_change_password,
    'user', jsonb_build_object(
      'user_id', v_user.login_id,
      'username', v_user.username,
      'full_name', v_user.full_name,
      'role', v_user.role
    )
  );
END;
$$;

-- ----------------------------------------------------------------
-- Auth_Change_Password: verify the current password and set a new one.
--   Returns jsonb: { ok, status }  status ∈ 'ok' | 'invalid' | 'weak'
--   Clears the must_change_password flag on success.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_change_password(
  p_username     text,
  p_current      text,
  p_new_password text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user login%ROWTYPE;
BEGIN
  IF length(coalesce(p_new_password, '')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'weak');
  END IF;

  SELECT * INTO v_user
  FROM login
  WHERE lower(username) = lower(p_username)
  LIMIT 1;

  IF NOT FOUND OR v_user.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  IF crypt(coalesce(p_current, ''), v_user.password) <> v_user.password THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  UPDATE login
     SET password = crypt(p_new_password, gen_salt('bf')),
         must_change_password = false,
         failed_attempts = 0,
         locked_until = NULL,
         updated_by = v_user.username,
         updated_at = now()
   WHERE login_id = v_user.login_id;

  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- ----------------------------------------------------------------
-- Auth_Forgot_Password: self-service password reset.
--   Generates a random temporary password, stores its hash and flags the
--   account so the user must set a new password on their next login.
--   Returns jsonb: { ok, status:'sent', found, temp_password? }
--   `found` is false (and no temp password) when the username is unknown so
--   the caller can avoid revealing whether an account exists. In production the
--   temporary password would be emailed instead of returned.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_forgot_password(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user login%ROWTYPE;
  v_temp text;
BEGIN
  IF coalesce(trim(p_username), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  SELECT * INTO v_user
  FROM login
  WHERE lower(username) = lower(p_username)
  LIMIT 1;

  IF NOT FOUND OR v_user.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'status', 'sent', 'found', false);
  END IF;

  -- Readable temporary password (12 hex characters).
  v_temp := encode(gen_random_bytes(6), 'hex');

  UPDATE login
     SET password = crypt(v_temp, gen_salt('bf')),
         must_change_password = true,
         failed_attempts = 0,
         locked_until = NULL,
         updated_by = 'SYSTEM',
         updated_at = now()
   WHERE login_id = v_user.login_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'sent',
    'found', true,
    'temp_password', v_temp
  );
END;
$$;
