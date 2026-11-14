-- ================================================================
-- GSS · Multi-session trainings
-- ----------------------------------------------------------------
-- Historically the `training` table allowed only ONE row per title
-- (unique index training_title_lower_uk), and every lookup resolved a
-- course by title (training_id_for_title). That made it impossible to
-- run the same course twice with different dates/times: the second save
-- overwrote the first.
--
-- A session is now identified by the full combination of
-- Title + Trainer + From + To. Same title + trainer but different
-- start/end date or time is a DIFFERENT course and gets its own row.
-- Everything downstream resolves a course by training_id; the *_by_id
-- helpers below back the id-keyed API, while the legacy title helpers
-- are kept for backward compatibility.
--
-- Runs after 83_audit_wiring.sql (order matters for CREATE OR REPLACE).
-- ================================================================

-- 1) Replace the one-row-per-title constraint with a session-key unique
--    index. Idempotent so it is safe to re-run on every startup.
DROP INDEX IF EXISTS training_title_lower_uk;
CREATE UNIQUE INDEX IF NOT EXISTS training_session_uk
  ON training (lower((title)::text), lower(coalesce((trainer)::text, '')), "from", "to");

-- 2) Students of a specific session, resolved by training_id (not title).
CREATE OR REPLACE FUNCTION training_students_by_id(p_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'candidate_no', at.candidate_no,
    'full_name', ap.full_name
  ) ORDER BY ap.full_name), '[]'::jsonb)
  FROM applicant_training at
  JOIN applicant ap ON ap.candidate_no = at.candidate_no
  WHERE at.training_id = p_id;
$$;

-- 3) Attendance cells for a specific session, resolved by training_id.
CREATE OR REPLACE FUNCTION attendance_list_by_id(
  p_id integer, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'candidate_no', a.candidate_no,
    'attendance_date', a.attendance_date,
    'status', a.status,
    'arrival_time', to_char(a.arrival_time, 'HH24:MI'),
    'departure_time', to_char(a.departure_time, 'HH24:MI'),
    'observation', a.observations
  ) ORDER BY a.candidate_no, a.attendance_date), '[]'::jsonb)
  FROM attendance a
  WHERE a.training_id = p_id
    AND (p_from IS NULL OR a.attendance_date >= p_from)
    AND (p_to   IS NULL OR a.attendance_date <= p_to);
$$;

-- 4) Attendance delete now prefers the exact session id.
CREATE OR REPLACE FUNCTION attendance_delete(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cand  integer := nullif(p_data->>'candidate_no', '')::integer;
  v_train integer := coalesce(
                       nullif(p_data->>'training_id', '')::integer,
                       training_id_for_title(p_data->>'training_title'));
  v_date  date    := nullif(p_data->>'att_date', '')::date;
BEGIN
  IF v_cand IS NULL OR v_train IS NULL OR v_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  DELETE FROM attendance
   WHERE candidate_no = v_cand
     AND training_id = v_train
     AND attendance_date = v_date;

  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- 5) Unassign now prefers the exact session id (a title may map to many).
CREATE OR REPLACE FUNCTION applicant_training_unassign(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cand  integer := nullif(p_data->>'candidate_no', '')::integer;
  v_train bigint  := coalesce(
                       nullif(p_data->>'training_id', '')::bigint,
                       training_id_for_title(p_data->>'training_title'));
BEGIN
  IF v_cand IS NULL OR v_train IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  DELETE FROM applicant_training
   WHERE candidate_no = v_cand AND training_id = v_train;

  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;
