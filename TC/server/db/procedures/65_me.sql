-- ================================================================
-- GSS · Current-user role lookup
-- ----------------------------------------------------------------
-- Lets the front-end reconcile a possibly-stale session with the live
-- role/status stored in the `login` table, so role-based UI (admin
-- section, Manage Users, notifications) always reflects the database.
-- ================================================================

CREATE OR REPLACE FUNCTION auth_user_role(p_username text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'login_id', l.login_id,
    'username', l.username,
    'full_name', l.full_name,
    'role', l.role,
    'is_active', l.is_active
  )
  FROM login l
  WHERE lower(l.username) = lower(p_username)
  LIMIT 1;
$$;
