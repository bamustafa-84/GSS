-- ================================================================
-- GSS · Audit wiring for transaction upserts
-- ----------------------------------------------------------------
-- attendance_upsert / training_upsert / applicant_training_assign were
-- previously created directly in the database (not tracked here) and did
-- not stamp audit fields. These tracked versions add created_by / updated_by
-- (the acting login id, injected by the server) plus updated_at maintenance.
-- Runs after the tables + helper functions (training_id_for_title,
-- training_row_json) already exist in the database.
-- ================================================================

-- Attendance cell upsert (one status per candidate/training/date).
CREATE OR REPLACE FUNCTION attendance_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cand   integer := nullif(p_data->>'candidate_no', '')::integer;
  -- Prefer the exact session id; fall back to a title lookup only for legacy
  -- callers that still send a title (ambiguous when titles repeat).
  v_train  integer := coalesce(
                        nullif(p_data->>'training_id', '')::integer,
                        training_id_for_title(p_data->>'training_title'));
  v_date   date    := nullif(p_data->>'att_date', '')::date;
  v_status text    := upper(nullif(trim(coalesce(p_data->>'status', '')), ''));
  v_who    bigint  := nullif(p_data->>'updated_by', '')::bigint;
  v_row    attendance%ROWTYPE;
BEGIN
  IF v_cand IS NULL OR v_train IS NULL OR v_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;
  IF v_status IS NULL OR v_status NOT IN ('AH', 'AR', 'ABS', 'EX') THEN
    v_status := 'AH';
  END IF;

  UPDATE attendance
     SET status         = v_status,
         arrival_time   = nullif(trim(coalesce(p_data->>'arrival_time', '')), '')::time,
         departure_time = nullif(trim(coalesce(p_data->>'departure_time', '')), '')::time,
         observations   = nullif(p_data->>'observation', ''),
         updated_by     = v_who,
         updated_at     = CURRENT_TIMESTAMP
   WHERE candidate_no = v_cand
     AND training_id = v_train
     AND attendance_date = v_date
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    INSERT INTO attendance (candidate_no, training_id, attendance_date, status,
                            arrival_time, departure_time, observations,
                            created_by, updated_by)
    VALUES (
      v_cand, v_train, v_date, v_status,
      nullif(trim(coalesce(p_data->>'arrival_time', '')), '')::time,
      nullif(trim(coalesce(p_data->>'departure_time', '')), '')::time,
      nullif(p_data->>'observation', ''),
      v_who, v_who
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'attendance', jsonb_build_object(
    'candidate_no', v_row.candidate_no,
    'attendance_date', v_row.attendance_date,
    'status', v_row.status,
    'arrival_time', to_char(v_row.arrival_time, 'HH24:MI'),
    'departure_time', to_char(v_row.departure_time, 'HH24:MI'),
    'observation', v_row.observations
  ));
END;
$$;

-- Training row upsert. A course/session is uniquely identified by the full
-- combination of Title + Trainer + From + To. Two rows that share a title and
-- trainer but differ in start/end date or time are DIFFERENT sessions and must
-- never overwrite each other. An explicit training_id (edit) targets one row.
CREATE OR REPLACE FUNCTION training_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_title   text := nullif(trim(coalesce(p_data->>'training_title', '')), '');
  v_trainer text := nullif(trim(coalesce(p_data->>'trainer', '')), '');
  v_from    timestamp := nullif(p_data->>'date_from', '')::timestamp;
  v_to      timestamp := nullif(p_data->>'date_to', '')::timestamp;
  v_who     bigint := nullif(p_data->>'updated_by', '')::bigint;
  v_id_in   bigint := nullif(p_data->>'training_id', '')::bigint;
  v_id      integer;
  v_row     training%ROWTYPE;
BEGIN
  -- Title is always required; From/To are required because the `training`
  -- table declares them NOT NULL (return a clean error instead of a crash).
  IF v_title IS NULL OR v_from IS NULL OR v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  -- Resolve the target row. An explicit training_id edits that exact session;
  -- otherwise a row is matched ONLY when the whole session key is identical
  -- (title + trainer + from + to). Any difference in date/time is a DIFFERENT
  -- session and gets its own row (enforced by the training_session_uk index).
  IF v_id_in IS NOT NULL THEN
    SELECT training_id INTO v_id FROM training WHERE training_id = v_id_in;
  ELSE
    SELECT training_id INTO v_id
    FROM training
    WHERE lower(title) = lower(v_title)
      AND lower(coalesce(trainer, '')) = lower(coalesce(v_trainer, ''))
      AND "from" = v_from
      AND "to"   = v_to
    ORDER BY training_id
    LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE training
       SET title      = v_title,
           trainer    = v_trainer,
           "from"     = v_from,
           "to"       = v_to,
           updated_by = v_who,
           updated_at = CURRENT_TIMESTAMP
     WHERE training_id = v_id
     RETURNING * INTO v_row;
  ELSE
    INSERT INTO training (title, trainer, "from", "to", created_by, updated_by)
    VALUES (v_title, v_trainer, v_from, v_to, v_who, v_who)
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok',
    'training_id', v_row.training_id,
    'training', training_row_json(v_row));
EXCEPTION
  -- An in-place edit (explicit training_id) whose new Title+Trainer+From+To
  -- would duplicate another existing session hits the unique index; report a
  -- clean conflict instead of a raw error.
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 'conflict',
      'error', 'Another course already exists with the same title, trainer and schedule.');
END;
$$;

-- Assign an applicant to a training (idempotent on candidate/training).
CREATE OR REPLACE FUNCTION applicant_training_assign(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cand  integer := nullif(p_data->>'candidate_no', '')::integer;
  -- Prefer an explicit training_id (the exact session) over a title lookup,
  -- which cannot distinguish same-title sessions with different date ranges.
  v_train bigint  := coalesce(
                       nullif(p_data->>'training_id', '')::bigint,
                       training_id_for_title(p_data->>'training_title'));
  v_who   bigint  := nullif(p_data->>'updated_by', '')::bigint;
  v_row   applicant_training%ROWTYPE;
BEGIN
  IF v_cand IS NULL OR v_train IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  INSERT INTO applicant_training (candidate_no, training_id, created_by, updated_by)
  VALUES (v_cand, v_train, v_who, v_who)
  ON CONFLICT (candidate_no, training_id) DO UPDATE
    SET candidate_no = EXCLUDED.candidate_no,
        updated_by   = v_who,
        updated_at   = CURRENT_TIMESTAMP
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'assignment', jsonb_build_object(
    'app_tr_id', v_row.app_tr_id,
    'candidate_no', v_row.candidate_no,
    'training_id', v_row.training_id,
    'assigned_at', v_row.assigned_at
  ));
END;
$$;
