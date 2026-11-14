-- ================================================================
-- GSS · User management procedures (admin) — backed by `login`
-- ----------------------------------------------------------------
-- Used by the admin-only "Manage Users" screen. Never returns the
-- password hash.
-- ================================================================

-- Login_Users_List: every account (newest first) without the password hash.
CREATE OR REPLACE FUNCTION login_users_list()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY (row->>'login_id')::bigint DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'login_id', l.login_id,
      'username', l.username,
      'full_name', l.full_name,
      'email', l.email,
      'notify_email', coalesce(l.notify_email, false),
      'role', l.role,
      'is_active', l.is_active,
      'must_change_password', l.must_change_password,
      'failed_attempts', l.failed_attempts,
      'locked_until', l.locked_until,
      'is_locked', (l.locked_until IS NOT NULL AND l.locked_until > now()),
      'created_at', l.created_at,
      'last_login_at', l.last_login_at,
      'has_avatar', (l.profile_image IS NOT NULL),
      'avatar_ver', coalesce(extract(epoch FROM coalesce(l.updated_at, l.created_at))::bigint, 0)
    ) AS row
    FROM login l
  ) t;
$$;

-- Login_User_Update: update a user's editable fields from a JSON payload.
-- Only the keys present in p_data are applied (full_name, role, is_active,
-- username, email, must_change_password). When a non-empty `password` key is
-- supplied the password hash is rotated (never stored or returned in plain
-- text). Returns the updated row (without the password) or an error status.
CREATE OR REPLACE FUNCTION login_user_update(p_login_id bigint, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user login%ROWTYPE;
  v_new_password text := NULLIF(p_data->>'password', '');
BEGIN
  -- Reject a username change that collides with another account.
  IF p_data ? 'username'
     AND coalesce(trim(p_data->>'username'), '') <> ''
     AND EXISTS (
       SELECT 1 FROM login
       WHERE lower(username) = lower(trim(p_data->>'username'))
         AND login_id <> p_login_id
     ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'exists');
  END IF;

  -- Enforce the same minimum-length rule as account creation.
  IF v_new_password IS NOT NULL AND length(v_new_password) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'weak');
  END IF;

  UPDATE login SET
    full_name = CASE WHEN p_data ? 'full_name'
                     THEN coalesce(NULLIF(trim(p_data->>'full_name'), ''), full_name)
                     ELSE full_name END,
    username  = CASE WHEN p_data ? 'username'
                     THEN coalesce(NULLIF(trim(p_data->>'username'), ''), username)
                     ELSE username END,
    email     = CASE WHEN p_data ? 'email'
                     THEN NULLIF(trim(p_data->>'email'), '')
                     ELSE email END,
    notify_email = CASE WHEN p_data ? 'notify_email'
                     THEN coalesce((p_data->>'notify_email')::boolean, false)
                     ELSE notify_email END,
    role      = CASE WHEN p_data ? 'role' THEN auth_valid_role(p_data->>'role') ELSE role END,
    is_active = CASE WHEN p_data ? 'is_active' THEN (p_data->>'is_active')::boolean ELSE is_active END,
    -- Profile picture: a `profile_image` hex string sets/replaces it; a truthy
    -- `clear_profile_image` removes it. Absent keys leave the avatar untouched.
    profile_image = CASE
                     WHEN coalesce((p_data->>'clear_profile_image')::boolean, false) THEN NULL
                     WHEN p_data ? 'profile_image' AND coalesce(p_data->>'profile_image', '') <> ''
                       THEN decode(p_data->>'profile_image', 'hex')
                     ELSE profile_image END,
    profile_image_type = CASE
                     WHEN coalesce((p_data->>'clear_profile_image')::boolean, false) THEN NULL
                     WHEN p_data ? 'profile_image' AND coalesce(p_data->>'profile_image', '') <> ''
                       THEN NULLIF(trim(coalesce(p_data->>'profile_image_type', '')), '')
                     ELSE profile_image_type END,
    password  = CASE WHEN v_new_password IS NOT NULL
                     THEN crypt(v_new_password, gen_salt('bf'))
                     ELSE password END,
    must_change_password = CASE
                     WHEN p_data ? 'must_change_password' THEN (p_data->>'must_change_password')::boolean
                     WHEN v_new_password IS NOT NULL THEN true
                     ELSE must_change_password END,
    -- Admin "unlock": clear the brute-force lock and failed-attempt counter.
    failed_attempts = CASE WHEN coalesce((p_data->>'unlock')::boolean, false)
                          THEN 0 ELSE failed_attempts END,
    locked_until    = CASE WHEN coalesce((p_data->>'unlock')::boolean, false)
                          THEN NULL ELSE locked_until END,
    updated_by = coalesce(nullif(p_data->>'updated_by_name', ''), 'ADMIN'),
    updated_at = now()
  WHERE login_id = p_login_id
  RETURNING * INTO v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ok',
    'password_changed', v_new_password IS NOT NULL,
    'user', jsonb_build_object(
      'login_id', v_user.login_id,
      'username', v_user.username,
      'full_name', v_user.full_name,
      'email', v_user.email,
      'notify_email', coalesce(v_user.notify_email, false),
      'role', v_user.role,
      'is_active', v_user.is_active,
      'must_change_password', v_user.must_change_password,
      'failed_attempts', v_user.failed_attempts,
      'locked_until', v_user.locked_until,
      'is_locked', (v_user.locked_until IS NOT NULL AND v_user.locked_until > now()),
      'created_at', v_user.created_at,
      'last_login_at', v_user.last_login_at,
      'has_avatar', (v_user.profile_image IS NOT NULL),
      'avatar_ver', coalesce(extract(epoch FROM coalesce(v_user.updated_at, v_user.created_at))::bigint, 0)
    )
  );
END;
$$;
