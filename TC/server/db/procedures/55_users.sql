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
      'role', l.role,
      'is_active', l.is_active,
      'must_change_password', l.must_change_password,
      'created_at', l.created_at,
      'last_login_at', l.last_login_at
    ) AS row
    FROM login l
  ) t;
$$;

-- Login_User_Update: update a user's editable fields from a JSON payload.
-- Only the keys present in p_data are applied (full_name, role, is_active,
-- username). Returns the updated row (without the password) or NULL.
CREATE OR REPLACE FUNCTION login_user_update(p_login_id bigint, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user login%ROWTYPE;
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

  UPDATE login SET
    full_name = CASE WHEN p_data ? 'full_name'
                     THEN coalesce(NULLIF(trim(p_data->>'full_name'), ''), full_name)
                     ELSE full_name END,
    username  = CASE WHEN p_data ? 'username'
                     THEN coalesce(NULLIF(trim(p_data->>'username'), ''), username)
                     ELSE username END,
    role      = CASE WHEN p_data ? 'role' THEN auth_valid_role(p_data->>'role') ELSE role END,
    is_active = CASE WHEN p_data ? 'is_active' THEN (p_data->>'is_active')::boolean ELSE is_active END,
    updated_by = 'ADMIN',
    updated_at = now()
  WHERE login_id = p_login_id
  RETURNING * INTO v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ok',
    'user', jsonb_build_object(
      'login_id', v_user.login_id,
      'username', v_user.username,
      'full_name', v_user.full_name,
      'role', v_user.role,
      'is_active', v_user.is_active,
      'must_change_password', v_user.must_change_password,
      'created_at', v_user.created_at,
      'last_login_at', v_user.last_login_at
    )
  );
END;
$$;
