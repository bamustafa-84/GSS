<<<<<<< HEAD
-- ================================================================
-- GSS · Exam credential management, candidate delivery & correction
-- ----------------------------------------------------------------
-- Companion to 80_exam_access.sql. All candidate-facing procedures take the
-- opaque session_token (never candidate_no / exam_id / attempt_id from the
-- client) and re-derive + re-validate the full chain server-side:
--   token → exam_access → candidate_no → applicant_training → training_id →
--   exam_id → attempt.  Idempotent; safe to re-run on startup.
-- ================================================================

-- ── Credential-management table (Admin / Instructor / Head of Training) ──
-- One row per assigned candidate for the exam, joined to attempt + credential
-- state. Passwords are NEVER included here. Accepts exam_id or training_id.
CREATE OR REPLACE FUNCTION exam_credentials_list(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_exam  bigint := nullif(p_data->>'exam_id', '')::bigint;
  v_train bigint := nullif(p_data->>'training_id', '')::bigint;
BEGIN
  IF v_exam IS NULL AND v_train IS NOT NULL THEN
    SELECT exam_id INTO v_exam FROM exams WHERE training_id = v_train ORDER BY exam_id LIMIT 1;
  END IF;
  IF v_exam IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_exam', 'rows', '[]'::jsonb);
  END IF;
  SELECT training_id INTO v_train FROM exams WHERE exam_id = v_exam;

  RETURN jsonb_build_object(
    'ok', true,
    'exam', (
      SELECT jsonb_build_object(
        'exam_id', e.exam_id, 'exam_title', e.exam_title, 'training_id', e.training_id,
        'training_title', tr.title, 'instructor', tr.trainer,
        'exam_date', e.exam_date, 'duration_minutes', e.duration_minutes,
        'passing_score', e.passing_score, 'status', e.status,
        'published_at', e.published_at
      )
      FROM exams e JOIN training tr ON tr.training_id = e.training_id
      WHERE e.exam_id = v_exam
    ),
    'rows', coalesce((
      SELECT jsonb_agg(row ORDER BY candidate_no)
      FROM (
        SELECT
          at.candidate_no,
          jsonb_build_object(
            'candidate_no',      at.candidate_no,
            'candidate_name',    a.full_name,
            'training_title',    tr.title,
            'instructor',        tr.trainer,
            'exam_date',         e.exam_date,
            'username',          ac.username,
            'access_id',         ac.access_id,
            'credential_status', coalesce(ac.credential_status, 'Not Generated'),
            'is_active',         coalesce(ac.is_active, false),
            'sent_at',           ac.sent_at,
            'attempt_id',        att.attempt_id,
            'exam_status',       coalesce(att.status, 'Not Started'),
            'correction_status', att.correction_status,
            'started_at',        att.started_at,
            'submitted_at',      att.submitted_at,
            'expires_at',        att.expires_at,
            'total_score',       att.total_score,
            'max_score',         att.max_score,
            'final_score',       att.final_score,
            'passing_score',     e.passing_score,
            'passed',            att.passed
          ) AS row
        FROM applicant_training at
        JOIN applicant a  ON a.candidate_no = at.candidate_no
        JOIN training  tr ON tr.training_id = at.training_id
        JOIN exams     e  ON e.exam_id = v_exam
        LEFT JOIN exam_access ac ON ac.exam_id = v_exam AND ac.candidate_no = at.candidate_no
        LEFT JOIN exam_attempts att ON att.exam_id = v_exam AND att.candidate_no = at.candidate_no
        WHERE at.training_id = v_train
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Reveal the temporary password (admin action; decrypts the stored copy) ──
CREATE OR REPLACE FUNCTION exam_access_reveal(p_access_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_ac exam_access%ROWTYPE;
  v_pw text;
BEGIN
  SELECT * INTO v_ac FROM exam_access WHERE access_id = p_access_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;
  BEGIN
    v_pw := pgp_sym_decrypt(v_ac.password_enc, exam_cred_key());
  EXCEPTION WHEN OTHERS THEN
    v_pw := NULL;
  END;
  RETURN jsonb_build_object(
    'ok', v_pw IS NOT NULL, 'status', CASE WHEN v_pw IS NULL THEN 'unavailable' ELSE 'ok' END,
    'username', v_ac.username, 'password', v_pw
  );
END;
$$;

-- ── Build the ready-to-send credential message + mark it Sent ──
CREATE OR REPLACE FUNCTION exam_access_send(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id   bigint := nullif(p_data->>'access_id', '')::bigint;
  v_who  bigint := nullif(p_data->>'updated_by', '')::bigint;
  v_ac   exam_access%ROWTYPE;
  v_pw   text;
  v_ex   record;
  v_name text;
  v_msg  text;
BEGIN
  SELECT * INTO v_ac FROM exam_access WHERE access_id = v_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  SELECT e.exam_title, e.exam_date, e.duration_minutes, e.instructions,
         tr.title AS training_title, tr.trainer AS instructor
    INTO v_ex
  FROM exams e JOIN training tr ON tr.training_id = e.training_id
  WHERE e.exam_id = v_ac.exam_id;

  SELECT full_name INTO v_name FROM applicant WHERE candidate_no = v_ac.candidate_no;

  BEGIN
    v_pw := pgp_sym_decrypt(v_ac.password_enc, exam_cred_key());
  EXCEPTION WHEN OTHERS THEN v_pw := NULL; END;

  v_msg :=
    'Dear ' || coalesce(v_name, 'Candidate') || ',' || chr(10) || chr(10) ||
    'You are scheduled to sit the following exam.' || chr(10) || chr(10) ||
    'Training: ' || coalesce(v_ex.training_title, '') || chr(10) ||
    'Exam: ' || coalesce(v_ex.exam_title, '') || chr(10) ||
    'Instructor: ' || coalesce(v_ex.instructor, '') || chr(10) ||
    'Exam date: ' || coalesce(to_char(v_ex.exam_date, 'DD Mon YYYY'), 'TBA') || chr(10) ||
    'Duration: ' || coalesce(v_ex.duration_minutes::text, '?') || ' minutes' || chr(10) || chr(10) ||
    'Your temporary exam login (valid for this exam only):' || chr(10) ||
    'Username: ' || v_ac.username || chr(10) ||
    'Password: ' || coalesce(v_pw, '(unavailable — please regenerate)') || chr(10) || chr(10) ||
    'Instructions:' || chr(10) ||
    coalesce(v_ex.instructions, 'Log in at the exam start time. Once you begin, a countdown starts and the exam closes automatically when the time is up. Answer all questions before the timer ends.') || chr(10) || chr(10) ||
    'Good luck.';

  UPDATE exam_access SET
    credential_status = CASE WHEN credential_status IN ('Used','Expired','Disabled') THEN credential_status ELSE 'Sent' END,
    sent_at = CURRENT_TIMESTAMP, sent_by = v_who,
    updated_by = v_who, updated_at = CURRENT_TIMESTAMP
  WHERE access_id = v_id;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok',
    'username', v_ac.username, 'password', v_pw,
    'candidate_name', v_name, 'message', v_msg
  );
END;
$$;

-- ── Disable a credential (admin action; history preserved) ──
CREATE OR REPLACE FUNCTION exam_access_disable(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id  bigint := nullif(p_data->>'access_id', '')::bigint;
  v_who bigint := nullif(p_data->>'updated_by', '')::bigint;
BEGIN
  UPDATE exam_access SET
    is_active = FALSE, credential_status = 'Disabled',
    disabled_at = CURRENT_TIMESTAMP, session_token = NULL, session_expires = NULL,
    updated_by = v_who, updated_at = CURRENT_TIMESTAMP
  WHERE access_id = v_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- ================================================================
-- Candidate: log in with the temporary exam credential
-- ================================================================
-- Validates credential → training assignment → exam published → availability,
-- then loads/creates the attempt and returns a session token + the delivery
-- payload (questions WITHOUT the answer key) + any previously saved answers so
-- a browser refresh resumes the same attempt. Returns different "state"s:
--   in_progress | submitted (waiting) | result (corrected) | expired
CREATE OR REPLACE FUNCTION exam_login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_ac    exam_access%ROWTYPE;
  v_exam  exams%ROWTYPE;
  v_train training%ROWTYPE;
  v_att   exam_attempts%ROWTYPE;
  v_token text;
  v_now   timestamp := CURRENT_TIMESTAMP;
BEGIN
  PERFORM exam_expire_due();

  IF coalesce(p_username,'') = '' OR coalesce(p_password,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  -- Username equals the candidate number and may appear for multiple exams,
  -- so resolve the credential by username+password rather than username alone.
  SELECT * INTO v_ac
  FROM exam_access
  WHERE lower(username) = lower(trim(p_username))
    AND crypt(p_password, password_hash) = password_hash
  ORDER BY access_id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;
  IF v_ac.is_active IS NOT TRUE OR v_ac.credential_status = 'Disabled' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'disabled');
  END IF;
  IF v_ac.expires_at IS NOT NULL AND v_ac.expires_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;

  -- Re-verify the assignment chain (never trust anything but the credential).
  IF NOT EXISTS (
    SELECT 1 FROM applicant_training
    WHERE candidate_no = v_ac.candidate_no AND training_id = v_ac.training_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_assigned');
  END IF;

  SELECT * INTO v_exam FROM exams WHERE exam_id = v_ac.exam_id;
  IF v_exam.exam_id IS NULL OR v_exam.status <> 'PUBLISHED' OR v_exam.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 'exam_unavailable');
  END IF;
  IF v_ac.available_from IS NOT NULL AND v_ac.available_from > v_now THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_yet_available', 'available_from', v_ac.available_from);
  END IF;

  SELECT * INTO v_train FROM training WHERE training_id = v_exam.training_id;

  -- Load or create THIS candidate's single attempt for THIS exam.
  SELECT * INTO v_att FROM exam_attempts
  WHERE exam_id = v_ac.exam_id AND candidate_no = v_ac.candidate_no
  ORDER BY attempt_id LIMIT 1;

  IF v_att.attempt_id IS NULL THEN
    INSERT INTO exam_attempts (
      exam_id, candidate_no, training_id, access_id, status,
      started_at, expires_at, correction_status, created_by, updated_by
    ) VALUES (
      v_ac.exam_id, v_ac.candidate_no, v_ac.training_id, v_ac.access_id, 'IN_PROGRESS',
      v_now, v_now + make_interval(mins => coalesce(v_exam.duration_minutes, 30)),
      'NOT_STARTED', v_ac.candidate_no, v_ac.candidate_no
    ) RETURNING * INTO v_att;
  END IF;

  -- If the timer has already elapsed on an in-progress attempt, close it now.
  IF v_att.status = 'IN_PROGRESS' AND v_att.expires_at IS NOT NULL AND v_att.expires_at <= v_now THEN
    PERFORM exam_finalize_attempt(v_att.attempt_id, 'EXPIRED');
    SELECT * INTO v_att FROM exam_attempts WHERE attempt_id = v_att.attempt_id;
  END IF;

  -- Terminal states → return the appropriate read-only view, no token.
  IF v_att.status <> 'IN_PROGRESS' THEN
    IF v_att.correction_status = 'CORRECTED' THEN
      RETURN exam_result_payload(v_att.attempt_id) || jsonb_build_object('state', 'result');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'state', 'submitted',
      'exam', jsonb_build_object(
        'exam_title', v_exam.exam_title, 'training_title', v_train.title,
        'instructor', v_train.trainer, 'exam_date', v_exam.exam_date),
      'submitted_at', v_att.submitted_at, 'status', v_att.status
    );
  END IF;

  -- Active attempt → issue a fresh session token bound to this attempt.
  v_token := encode(gen_random_bytes(24), 'hex');
  UPDATE exam_access SET
    session_token = v_token, session_expires = v_att.expires_at,
    credential_status = CASE WHEN credential_status IN ('Disabled','Expired') THEN credential_status ELSE 'Used' END,
    used_at = coalesce(used_at, v_now), updated_at = v_now
  WHERE access_id = v_ac.access_id;

  UPDATE exam_attempts SET updated_at = v_now WHERE attempt_id = v_att.attempt_id;

  RETURN jsonb_build_object(
    'ok', true, 'state', 'in_progress', 'token', v_token,
    'server_now', v_now, 'expires_at', v_att.expires_at, 'started_at', v_att.started_at,
    'exam', jsonb_build_object(
      'exam_id',          v_exam.exam_id,
      'training_id',      v_exam.training_id,
      'training_title',   v_train.title,
      'instructor',       v_train.trainer,
      'instructions',     v_exam.instructions,
      'exam_title',       v_exam.exam_title,
      'exam_date',        v_exam.exam_date,
      'duration_minutes', v_exam.duration_minutes,
      'passing_score',    v_exam.passing_score
    ),
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'question_id',   q.question_id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'display_order', q.display_order,
        'points',        q.points,
        'is_required',   q.is_required,
        'image_url',     q.image_url,
        'answers', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'answer_id', a.answer_id, 'answer_key', a.answer_key, 'answer_text', a.answer_text,
            'display_order', a.display_order, 'match_key', a.match_key, 'match_value', a.match_value
          ) ORDER BY a.display_order, a.answer_id)
          FROM question_answers a WHERE a.question_id = q.question_id
        ), '[]'::jsonb)
      ) ORDER BY q.display_order, q.question_id)
      FROM questions q
      WHERE q.exam_id = v_exam.exam_id AND q.is_active = TRUE AND q.in_exam = TRUE
    ), '[]'::jsonb),
    -- Previously saved answers so a refresh restores the candidate's progress.
    'saved', coalesce((
      SELECT jsonb_object_agg(r.question_id::text, jsonb_build_object(
        'selected_ids', r.selected_ids, 'response_text', r.response_text, 'response_json', r.response_json
      ))
      FROM exam_responses r WHERE r.attempt_id = v_att.attempt_id
    ), '{}'::jsonb)
  );
END;
$$;

-- Resolve a session token to its attempt, enforcing expiry. Returns the
-- attempt row id + exam id, or NULL when invalid/closed.
CREATE OR REPLACE FUNCTION exam_token_attempt(p_token text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_ac  exam_access%ROWTYPE;
  v_att exam_attempts%ROWTYPE;
BEGIN
  IF coalesce(p_token,'') = '' THEN RETURN NULL; END IF;
  SELECT * INTO v_ac FROM exam_access WHERE session_token = p_token LIMIT 1;
  IF NOT FOUND OR v_ac.is_active IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT * INTO v_att FROM exam_attempts
  WHERE access_id = v_ac.access_id AND exam_id = v_ac.exam_id AND candidate_no = v_ac.candidate_no
  ORDER BY attempt_id DESC LIMIT 1;
  IF v_att.attempt_id IS NULL OR v_att.status <> 'IN_PROGRESS' THEN RETURN NULL; END IF;

  IF v_att.expires_at IS NOT NULL AND v_att.expires_at <= CURRENT_TIMESTAMP THEN
    PERFORM exam_finalize_attempt(v_att.attempt_id, 'EXPIRED');
    RETURN NULL;  -- time is up; caller should re-login to see status
  END IF;
  RETURN v_att.attempt_id;
END;
$$;

-- ── Auto-save a single answer (UPSERT keyed by attempt+question) ──
-- Payload: { token, question_id, selected_ids?, response_text?, response_json? }
CREATE OR REPLACE FUNCTION exam_answer_save(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_att   bigint := exam_token_attempt(p_data->>'token');
  v_qid   bigint := nullif(p_data->>'question_id', '')::bigint;
  v_exam  bigint;
  v_cand  integer;
  v_now   timestamp := CURRENT_TIMESTAMP;
  v_exp   timestamp;
BEGIN
  IF v_att IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;
  IF v_qid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  SELECT exam_id, candidate_no, expires_at INTO v_exam, v_cand, v_exp
  FROM exam_attempts WHERE attempt_id = v_att;

  -- The question must belong to this exam's delivered set.
  IF NOT EXISTS (
    SELECT 1 FROM questions WHERE question_id = v_qid AND exam_id = v_exam AND is_active = TRUE AND in_exam = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid_question');
  END IF;

  INSERT INTO exam_responses (
    attempt_id, question_id, response_text, selected_ids, response_json,
    max_points, needs_review, created_by, updated_by, created_at, updated_at
  ) VALUES (
    v_att, v_qid,
    nullif(p_data->>'response_text', ''),
    coalesce(p_data->'selected_ids', '[]'::jsonb),
    p_data->'response_json',
    coalesce((SELECT points FROM questions WHERE question_id = v_qid), 0),
    FALSE, v_cand, v_cand, v_now, v_now
  )
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET
    response_text = EXCLUDED.response_text,
    selected_ids  = EXCLUDED.selected_ids,
    response_json = EXCLUDED.response_json,
    updated_by    = EXCLUDED.updated_by,
    updated_at    = EXCLUDED.updated_at;

  UPDATE exam_attempts SET updated_at = v_now, updated_by = v_cand WHERE attempt_id = v_att;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'server_now', v_now, 'expires_at', v_exp);
END;
$$;

-- ── Submit the attempt (token-authenticated) ──
-- Optionally accepts a final { responses: [...] } batch (last-write) before
-- finalizing, so a submit never loses the latest edits.
CREATE OR REPLACE FUNCTION exam_submit_token(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_att  bigint := exam_token_attempt(p_data->>'token');
  v_r    jsonb;
  v_qid  bigint;
  v_exam bigint;
  v_cand integer;
BEGIN
  IF v_att IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired',
      'message', 'The exam time is up or the session is no longer active.');
  END IF;
  SELECT exam_id, candidate_no INTO v_exam, v_cand FROM exam_attempts WHERE attempt_id = v_att;

  -- Persist any final answers supplied with the submit.
  FOR v_r IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'responses', '[]'::jsonb))
  LOOP
    v_qid := nullif(v_r->>'question_id', '')::bigint;
    CONTINUE WHEN v_qid IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM questions WHERE question_id = v_qid AND exam_id = v_exam AND is_active AND in_exam
    );
    INSERT INTO exam_responses (
      attempt_id, question_id, response_text, selected_ids, response_json,
      max_points, needs_review, created_by, updated_by
    ) VALUES (
      v_att, v_qid, nullif(v_r->>'response_text', ''),
      coalesce(v_r->'selected_ids', '[]'::jsonb), v_r->'response_json',
      coalesce((SELECT points FROM questions WHERE question_id = v_qid), 0),
      FALSE, v_cand, v_cand
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      response_text = EXCLUDED.response_text,
      selected_ids  = EXCLUDED.selected_ids,
      response_json = EXCLUDED.response_json,
      updated_by    = EXCLUDED.updated_by,
      updated_at    = CURRENT_TIMESTAMP;
  END LOOP;

  PERFORM exam_finalize_attempt(v_att, 'SUBMITTED');

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok', 'state', 'submitted',
    'message', 'Your exam has been submitted and is awaiting correction.'
  );
END;
$$;

-- ================================================================
-- Instructor / Admin / Head of Training · correction
-- ================================================================

-- Full attempt detail for grading: every question with the candidate's answer,
-- the correct answer(s), max + awarded points and any instructor comment.
CREATE OR REPLACE FUNCTION exam_attempt_for_correction(p_attempt bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_att exam_attempts%ROWTYPE;
  v_ex  record;
BEGIN
  SELECT * INTO v_att FROM exam_attempts WHERE attempt_id = p_attempt;
  IF v_att.attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  SELECT e.exam_title, e.passing_score, e.exam_date, e.duration_minutes,
         tr.title AS training_title, tr.trainer AS instructor,
         a.full_name AS candidate_name
    INTO v_ex
  FROM exams e
  JOIN training tr ON tr.training_id = e.training_id
  JOIN applicant a ON a.candidate_no = v_att.candidate_no
  WHERE e.exam_id = v_att.exam_id;

  RETURN jsonb_build_object(
    'ok', true,
    'attempt', jsonb_build_object(
      'attempt_id',        v_att.attempt_id,
      'candidate_no',      v_att.candidate_no,
      'candidate_name',    v_ex.candidate_name,
      'exam_id',           v_att.exam_id,
      'exam_title',        v_ex.exam_title,
      'training_title',    v_ex.training_title,
      'instructor',        v_ex.instructor,
      'exam_date',         v_ex.exam_date,
      'status',            v_att.status,
      'correction_status', v_att.correction_status,
      'total_score',       v_att.total_score,
      'max_score',         v_att.max_score,
      'final_score',       v_att.final_score,
      'passing_score',     v_ex.passing_score,
      'passed',            v_att.passed,
      'started_at',        v_att.started_at,
      'submitted_at',      v_att.submitted_at,
      'corrected_by',      v_att.corrected_by,
      'corrected_at',      v_att.corrected_at,
      'instructor_comment', v_att.instructor_comment
    ),
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'question_id',   q.question_id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'display_order', q.display_order,
        'max_points',    q.points,
        'auto_graded',   q.question_type NOT IN ('DEFINITION','ANALYTICAL'),
        'awarded_score', r.awarded_score,
        'is_correct',    r.is_correct,
        'needs_review',  r.needs_review,
        'instructor_comment', r.instructor_comment,
        'response_text', r.response_text,
        'selected_ids',  r.selected_ids,
        'response_json', r.response_json,
        'answers', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'answer_id', a.answer_id, 'answer_key', a.answer_key, 'answer_text', a.answer_text,
            'is_correct', a.is_correct, 'display_order', a.display_order,
            'match_key', a.match_key, 'match_value', a.match_value
          ) ORDER BY a.display_order, a.answer_id)
          FROM question_answers a WHERE a.question_id = q.question_id
        ), '[]'::jsonb)
      ) ORDER BY q.display_order, q.question_id)
      FROM questions q
      LEFT JOIN exam_responses r ON r.attempt_id = p_attempt AND r.question_id = q.question_id
      WHERE q.exam_id = v_att.exam_id AND q.is_active = TRUE AND q.in_exam = TRUE
    ), '[]'::jsonb)
  );
END;
$$;

-- Mark that correction has started (WAITING_FOR_CORRECTION → CORRECTING).
CREATE OR REPLACE FUNCTION exam_grade_start(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_att bigint := nullif(p_data->>'attempt_id', '')::bigint;
  v_who bigint := nullif(p_data->>'updated_by', '')::bigint;
BEGIN
  UPDATE exam_attempts SET
    correction_status = CASE WHEN correction_status = 'CORRECTED' THEN 'CORRECTED' ELSE 'CORRECTING' END,
    corrected_by = v_who, updated_by = v_who, updated_at = CURRENT_TIMESTAMP
  WHERE attempt_id = v_att;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- Save instructor grading. Payload:
-- { attempt_id, updated_by, finalize?:bool, comment?,
--   grades: [{ question_id, points_awarded, comment? }] }
-- Manual scores are stored on the responses; the attempt total is recomputed
-- from ALL responses (auto + manual). finalize=true marks it CORRECTED.
CREATE OR REPLACE FUNCTION exam_grade_save(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_att   bigint := nullif(p_data->>'attempt_id', '')::bigint;
  v_who   bigint := nullif(p_data->>'updated_by', '')::bigint;
  v_final boolean := coalesce((p_data->>'finalize')::boolean, false);
  v_g     jsonb;
  v_qid   bigint;
  v_pts   numeric;
  v_max   numeric;
  v_total numeric;
  v_grand numeric;
  v_pass  numeric;
  v_exam  bigint;
BEGIN
  IF v_att IS NULL THEN RETURN jsonb_build_object('ok', false, 'status', 'invalid'); END IF;
  SELECT exam_id INTO v_exam FROM exam_attempts WHERE attempt_id = v_att;
  IF v_exam IS NULL THEN RETURN jsonb_build_object('ok', false, 'status', 'not_found'); END IF;

  FOR v_g IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'grades', '[]'::jsonb))
  LOOP
    v_qid := nullif(v_g->>'question_id', '')::bigint;
    CONTINUE WHEN v_qid IS NULL;
    SELECT points INTO v_max FROM questions WHERE question_id = v_qid;
    -- Clamp the awarded score to [0, max_points]; never trust the client value.
    v_pts := least(greatest(coalesce(nullif(v_g->>'points_awarded','')::numeric, 0), 0), coalesce(v_max, 0));

    UPDATE exam_responses SET
      awarded_score = v_pts,
      instructor_comment = nullif(v_g->>'comment', ''),
      graded_by = v_who, graded_at = CURRENT_TIMESTAMP,
      updated_by = v_who, updated_at = CURRENT_TIMESTAMP
    WHERE attempt_id = v_att AND question_id = v_qid;
  END LOOP;

  -- Recompute totals from every stored response.
  SELECT coalesce(sum(awarded_score), 0) INTO v_total FROM exam_responses WHERE attempt_id = v_att;
  -- Max score = sum of ALL in-exam questions' points (not only answered ones).
  SELECT coalesce(sum(points), 0) INTO v_grand FROM questions
   WHERE exam_id = v_exam AND is_active AND in_exam;
  SELECT passing_score INTO v_pass FROM exams WHERE exam_id = v_exam;

  UPDATE exam_attempts SET
    total_score       = v_total,
    max_score         = v_grand,
    instructor_comment = coalesce(nullif(p_data->>'comment', ''), instructor_comment),
    correction_status = CASE WHEN v_final THEN 'CORRECTED' ELSE 'CORRECTING' END,
    status            = CASE WHEN v_final THEN 'CORRECTED' ELSE status END,
    passed            = CASE WHEN v_pass IS NULL THEN NULL ELSE (v_total >= v_pass) END,
    final_score       = CASE WHEN v_final THEN v_total ELSE final_score END,
    corrected_by      = v_who,
    corrected_at      = CASE WHEN v_final THEN CURRENT_TIMESTAMP ELSE corrected_at END,
    updated_by        = v_who,
    updated_at        = CURRENT_TIMESTAMP
  WHERE attempt_id = v_att;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok',
    'total_score', v_total, 'max_score', v_grand,
    'passing_score', v_pass, 'passed', CASE WHEN v_pass IS NULL THEN NULL ELSE (v_total >= v_pass) END,
    'correction_status', CASE WHEN v_final THEN 'CORRECTED' ELSE 'CORRECTING' END
  );
END;
$$;

-- ================================================================
-- Panel-Exam · the candidate's final result (only when CORRECTED)
-- ================================================================
-- Internal payload builder shared by exam_login (result state) and the
-- result endpoint. Assumes the attempt is corrected; returns full breakdown.
CREATE OR REPLACE FUNCTION exam_result_payload(p_attempt bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_att exam_attempts%ROWTYPE;
  v_ex  record;
BEGIN
  SELECT * INTO v_att FROM exam_attempts WHERE attempt_id = p_attempt;
  SELECT e.exam_title, e.passing_score, e.exam_date,
         tr.title AS training_title, tr.trainer AS instructor,
         a.full_name AS candidate_name
    INTO v_ex
  FROM exams e JOIN training tr ON tr.training_id = e.training_id
  JOIN applicant a ON a.candidate_no = v_att.candidate_no
  WHERE e.exam_id = v_att.exam_id;

  RETURN jsonb_build_object(
    'ok', true,
    'result', jsonb_build_object(
      'exam_title',     v_ex.exam_title,
      'training_title', v_ex.training_title,
      'instructor',     v_ex.instructor,
      'exam_date',      v_ex.exam_date,
      'candidate_name', v_ex.candidate_name,
      'total_score',    coalesce(v_att.final_score, v_att.total_score),
      'max_score',      v_att.max_score,
      'passing_score',  v_ex.passing_score,
      'passed',         v_att.passed,
      'corrected_at',   v_att.corrected_at,
      'instructor_comment', v_att.instructor_comment,
      'questions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'question_text', q.question_text,
          'question_type', q.question_type,
          'max_points',    q.points,
          'awarded_score', r.awarded_score,
          'is_correct',    r.is_correct,
          'instructor_comment', r.instructor_comment
        ) ORDER BY q.display_order, q.question_id)
        FROM questions q
        LEFT JOIN exam_responses r ON r.attempt_id = p_attempt AND r.question_id = q.question_id
        WHERE q.exam_id = v_att.exam_id AND q.is_active AND q.in_exam
      ), '[]'::jsonb)
    )
  );
END;
$$;

-- ── Staff-facing: a candidate's exam result summary (by candidate_no) ──
-- Used by the applicant form's "Individual Exam Result" panel (Panel-Exam) so
-- staff see the real attempt. Returns the latest attempt for the candidate with
-- exam + training meta and a 'viewable' flag (true only once CORRECTED), so the
-- panel opens with the final result once the candidate has finished.
CREATE OR REPLACE FUNCTION exam_candidate_result(p_candidate_no integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_att exam_attempts%ROWTYPE;
  v_ex  record;
BEGIN
  SELECT * INTO v_att FROM exam_attempts
  WHERE candidate_no = p_candidate_no
  ORDER BY submitted_at DESC NULLS LAST, attempt_id DESC
  LIMIT 1;

  IF v_att.attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'has_attempt', false, 'state', 'none');
  END IF;

  SELECT e.exam_title, e.passing_score, e.exam_date, e.duration_minutes,
         tr.title AS training_title, tr.trainer AS instructor,
         a.full_name AS candidate_name
    INTO v_ex
  FROM exams e
  JOIN training tr ON tr.training_id = e.training_id
  JOIN applicant a ON a.candidate_no = v_att.candidate_no
  WHERE e.exam_id = v_att.exam_id;

  RETURN jsonb_build_object(
    'ok', true,
    'has_attempt', true,
    -- The panel is "viewable" (final result shown) only once corrected.
    'viewable', (v_att.correction_status = 'CORRECTED'),
    'state', CASE
               WHEN v_att.correction_status = 'CORRECTED' THEN 'corrected'
               WHEN v_att.status = 'IN_PROGRESS' THEN 'in_progress'
               ELSE 'waiting'
             END,
    'attempt_id',        v_att.attempt_id,
    'candidate_no',      v_att.candidate_no,
    'candidate_name',    v_ex.candidate_name,
    'exam_id',           v_att.exam_id,
    'exam_title',        v_ex.exam_title,
    'training_title',    v_ex.training_title,
    'instructor',        v_ex.instructor,
    'exam_date',         v_ex.exam_date,
    'status',            v_att.status,
    'correction_status', v_att.correction_status,
    'started_at',        v_att.started_at,
    'submitted_at',      v_att.submitted_at,
    'total_score',       coalesce(v_att.final_score, v_att.total_score),
    'max_score',         v_att.max_score,
    'passing_score',     v_ex.passing_score,
    'passed',            v_att.passed,
    'instructor_comment', v_att.instructor_comment
  );
END;
$$;

-- when the attempt is CORRECTED, and only for the credential's own candidate
-- (identity comes from the token, never the client).
CREATE OR REPLACE FUNCTION exam_result_for_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_ac  exam_access%ROWTYPE;
  v_att exam_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_ac FROM exam_access WHERE session_token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'invalid'); END IF;
  SELECT * INTO v_att FROM exam_attempts
  WHERE access_id = v_ac.access_id AND candidate_no = v_ac.candidate_no
  ORDER BY attempt_id DESC LIMIT 1;
  IF v_att.attempt_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'status', 'no_attempt'); END IF;
  IF v_att.correction_status <> 'CORRECTED' THEN
    RETURN jsonb_build_object('ok', true, 'state', 'waiting', 'status', 'not_corrected');
  END IF;
  RETURN exam_result_payload(v_att.attempt_id) || jsonb_build_object('state', 'result');
END;
$$;
=======
-- ================================================================
-- GSS · Exam credential management, candidate delivery & correction
-- ----------------------------------------------------------------
-- Companion to 80_exam_access.sql. All candidate-facing procedures take the
-- opaque session_token (never candidate_no / exam_id / attempt_id from the
-- client) and re-derive + re-validate the full chain server-side:
--   token → exam_access → candidate_no → applicant_training → training_id →
--   exam_id → attempt.  Idempotent; safe to re-run on startup.
-- ================================================================

-- ── Credential-management table (Admin / Instructor / Head of Training) ──
-- One row per assigned candidate for the exam, joined to attempt + credential
-- state. Passwords are NEVER included here. Accepts exam_id or training_id.
CREATE OR REPLACE FUNCTION exam_credentials_list(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_exam  bigint := nullif(p_data->>'exam_id', '')::bigint;
  v_train bigint := nullif(p_data->>'training_id', '')::bigint;
BEGIN
  IF v_exam IS NULL AND v_train IS NOT NULL THEN
    SELECT exam_id INTO v_exam FROM exams WHERE training_id = v_train ORDER BY exam_id LIMIT 1;
  END IF;
  IF v_exam IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_exam', 'rows', '[]'::jsonb);
  END IF;
  SELECT training_id INTO v_train FROM exams WHERE exam_id = v_exam;

  RETURN jsonb_build_object(
    'ok', true,
    'exam', (
      SELECT jsonb_build_object(
        'exam_id', e.exam_id, 'exam_title', e.exam_title, 'training_id', e.training_id,
        'training_title', tr.title, 'instructor', tr.trainer,
        'exam_date', e.exam_date, 'duration_minutes', e.duration_minutes,
        'passing_score', e.passing_score, 'status', e.status,
        'published_at', e.published_at
      )
      FROM exams e JOIN training tr ON tr.training_id = e.training_id
      WHERE e.exam_id = v_exam
    ),
    'rows', coalesce((
      SELECT jsonb_agg(row ORDER BY candidate_no)
      FROM (
        SELECT
          at.candidate_no,
          jsonb_build_object(
            'candidate_no',      at.candidate_no,
            'candidate_name',    a.full_name,
            'training_title',    tr.title,
            'instructor',        tr.trainer,
            'exam_date',         e.exam_date,
            'username',          ac.username,
            'access_id',         ac.access_id,
            'credential_status', coalesce(ac.credential_status, 'Not Generated'),
            'is_active',         coalesce(ac.is_active, false),
            'sent_at',           ac.sent_at,
            'attempt_id',        att.attempt_id,
            'exam_status',       coalesce(att.status, 'Not Started'),
            'correction_status', att.correction_status,
            'started_at',        att.started_at,
            'submitted_at',      att.submitted_at,
            'expires_at',        att.expires_at,
            'total_score',       att.total_score,
            'max_score',         att.max_score,
            'final_score',       att.final_score,
            'passing_score',     e.passing_score,
            'passed',            att.passed
          ) AS row
        FROM applicant_training at
        JOIN applicant a  ON a.candidate_no = at.candidate_no
        JOIN training  tr ON tr.training_id = at.training_id
        JOIN exams     e  ON e.exam_id = v_exam
        LEFT JOIN exam_access ac ON ac.exam_id = v_exam AND ac.candidate_no = at.candidate_no
        LEFT JOIN exam_attempts att ON att.exam_id = v_exam AND att.candidate_no = at.candidate_no
        WHERE at.training_id = v_train
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Reveal the temporary password (admin action; decrypts the stored copy) ──
CREATE OR REPLACE FUNCTION exam_access_reveal(p_access_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_ac exam_access%ROWTYPE;
  v_pw text;
BEGIN
  SELECT * INTO v_ac FROM exam_access WHERE access_id = p_access_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;
  BEGIN
    v_pw := pgp_sym_decrypt(v_ac.password_enc, exam_cred_key());
  EXCEPTION WHEN OTHERS THEN
    v_pw := NULL;
  END;
  RETURN jsonb_build_object(
    'ok', v_pw IS NOT NULL, 'status', CASE WHEN v_pw IS NULL THEN 'unavailable' ELSE 'ok' END,
    'username', v_ac.username, 'password', v_pw
  );
END;
$$;

-- ── Build the ready-to-send credential message + mark it Sent ──
CREATE OR REPLACE FUNCTION exam_access_send(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id   bigint := nullif(p_data->>'access_id', '')::bigint;
  v_who  bigint := nullif(p_data->>'updated_by', '')::bigint;
  v_ac   exam_access%ROWTYPE;
  v_pw   text;
  v_ex   record;
  v_name text;
  v_msg  text;
BEGIN
  SELECT * INTO v_ac FROM exam_access WHERE access_id = v_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  SELECT e.exam_title, e.exam_date, e.duration_minutes, e.instructions,
         tr.title AS training_title, tr.trainer AS instructor
    INTO v_ex
  FROM exams e JOIN training tr ON tr.training_id = e.training_id
  WHERE e.exam_id = v_ac.exam_id;

  SELECT full_name INTO v_name FROM applicant WHERE candidate_no = v_ac.candidate_no;

  BEGIN
    v_pw := pgp_sym_decrypt(v_ac.password_enc, exam_cred_key());
  EXCEPTION WHEN OTHERS THEN v_pw := NULL; END;

  v_msg :=
    'Dear ' || coalesce(v_name, 'Candidate') || ',' || chr(10) || chr(10) ||
    'You are scheduled to sit the following exam.' || chr(10) || chr(10) ||
    'Training: ' || coalesce(v_ex.training_title, '') || chr(10) ||
    'Exam: ' || coalesce(v_ex.exam_title, '') || chr(10) ||
    'Instructor: ' || coalesce(v_ex.instructor, '') || chr(10) ||
    'Exam date: ' || coalesce(to_char(v_ex.exam_date, 'DD Mon YYYY'), 'TBA') || chr(10) ||
    'Duration: ' || coalesce(v_ex.duration_minutes::text, '?') || ' minutes' || chr(10) || chr(10) ||
    'Your temporary exam login (valid for this exam only):' || chr(10) ||
    'Username: ' || v_ac.username || chr(10) ||
    'Password: ' || coalesce(v_pw, '(unavailable — please regenerate)') || chr(10) || chr(10) ||
    'Instructions:' || chr(10) ||
    coalesce(v_ex.instructions, 'Log in at the exam start time. Once you begin, a countdown starts and the exam closes automatically when the time is up. Answer all questions before the timer ends.') || chr(10) || chr(10) ||
    'Good luck.';

  UPDATE exam_access SET
    credential_status = CASE WHEN credential_status IN ('Used','Expired','Disabled') THEN credential_status ELSE 'Sent' END,
    sent_at = CURRENT_TIMESTAMP, sent_by = v_who,
    updated_by = v_who, updated_at = CURRENT_TIMESTAMP
  WHERE access_id = v_id;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok',
    'username', v_ac.username, 'password', v_pw,
    'candidate_name', v_name, 'message', v_msg
  );
END;
$$;

-- ── Disable a credential (admin action; history preserved) ──
CREATE OR REPLACE FUNCTION exam_access_disable(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id  bigint := nullif(p_data->>'access_id', '')::bigint;
  v_who bigint := nullif(p_data->>'updated_by', '')::bigint;
BEGIN
  UPDATE exam_access SET
    is_active = FALSE, credential_status = 'Disabled',
    disabled_at = CURRENT_TIMESTAMP, session_token = NULL, session_expires = NULL,
    updated_by = v_who, updated_at = CURRENT_TIMESTAMP
  WHERE access_id = v_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- ================================================================
-- Candidate: log in with the temporary exam credential
-- ================================================================
-- Validates credential → training assignment → exam published → availability,
-- then loads/creates the attempt and returns a session token + the delivery
-- payload (questions WITHOUT the answer key) + any previously saved answers so
-- a browser refresh resumes the same attempt. Returns different "state"s:
--   in_progress | submitted (waiting) | result (corrected) | expired
CREATE OR REPLACE FUNCTION exam_login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_ac    exam_access%ROWTYPE;
  v_exam  exams%ROWTYPE;
  v_train training%ROWTYPE;
  v_att   exam_attempts%ROWTYPE;
  v_token text;
  v_now   timestamp := CURRENT_TIMESTAMP;
BEGIN
  PERFORM exam_expire_due();

  IF coalesce(p_username,'') = '' OR coalesce(p_password,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  SELECT * INTO v_ac FROM exam_access WHERE lower(username) = lower(trim(p_username)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;
  IF crypt(p_password, v_ac.password_hash) <> v_ac.password_hash THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;
  IF v_ac.is_active IS NOT TRUE OR v_ac.credential_status = 'Disabled' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'disabled');
  END IF;
  IF v_ac.expires_at IS NOT NULL AND v_ac.expires_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;

  -- Re-verify the assignment chain (never trust anything but the credential).
  IF NOT EXISTS (
    SELECT 1 FROM applicant_training
    WHERE candidate_no = v_ac.candidate_no AND training_id = v_ac.training_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_assigned');
  END IF;

  SELECT * INTO v_exam FROM exams WHERE exam_id = v_ac.exam_id;
  IF v_exam.exam_id IS NULL OR v_exam.status <> 'PUBLISHED' OR v_exam.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 'exam_unavailable');
  END IF;
  IF v_ac.available_from IS NOT NULL AND v_ac.available_from > v_now THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_yet_available', 'available_from', v_ac.available_from);
  END IF;

  SELECT * INTO v_train FROM training WHERE training_id = v_exam.training_id;

  -- Load or create THIS candidate's single attempt for THIS exam.
  SELECT * INTO v_att FROM exam_attempts
  WHERE exam_id = v_ac.exam_id AND candidate_no = v_ac.candidate_no
  ORDER BY attempt_id LIMIT 1;

  IF v_att.attempt_id IS NULL THEN
    INSERT INTO exam_attempts (
      exam_id, candidate_no, training_id, access_id, status,
      started_at, expires_at, correction_status, created_by, updated_by
    ) VALUES (
      v_ac.exam_id, v_ac.candidate_no, v_ac.training_id, v_ac.access_id, 'IN_PROGRESS',
      v_now, v_now + make_interval(mins => coalesce(v_exam.duration_minutes, 30)),
      'NOT_STARTED', v_ac.candidate_no, v_ac.candidate_no
    ) RETURNING * INTO v_att;
  END IF;

  -- If the timer has already elapsed on an in-progress attempt, close it now.
  IF v_att.status = 'IN_PROGRESS' AND v_att.expires_at IS NOT NULL AND v_att.expires_at <= v_now THEN
    PERFORM exam_finalize_attempt(v_att.attempt_id, 'EXPIRED');
    SELECT * INTO v_att FROM exam_attempts WHERE attempt_id = v_att.attempt_id;
  END IF;

  -- Terminal states → return the appropriate read-only view, no token.
  IF v_att.status <> 'IN_PROGRESS' THEN
    IF v_att.correction_status = 'CORRECTED' THEN
      RETURN exam_result_payload(v_att.attempt_id) || jsonb_build_object('state', 'result');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'state', 'submitted',
      'exam', jsonb_build_object(
        'exam_title', v_exam.exam_title, 'training_title', v_train.title,
        'instructor', v_train.trainer, 'exam_date', v_exam.exam_date),
      'submitted_at', v_att.submitted_at, 'status', v_att.status
    );
  END IF;

  -- Active attempt → issue a fresh session token bound to this attempt.
  v_token := encode(gen_random_bytes(24), 'hex');
  UPDATE exam_access SET
    session_token = v_token, session_expires = v_att.expires_at,
    credential_status = CASE WHEN credential_status IN ('Disabled','Expired') THEN credential_status ELSE 'Used' END,
    used_at = coalesce(used_at, v_now), updated_at = v_now
  WHERE access_id = v_ac.access_id;

  UPDATE exam_attempts SET updated_at = v_now WHERE attempt_id = v_att.attempt_id;

  RETURN jsonb_build_object(
    'ok', true, 'state', 'in_progress', 'token', v_token,
    'server_now', v_now, 'expires_at', v_att.expires_at, 'started_at', v_att.started_at,
    'exam', jsonb_build_object(
      'exam_id',          v_exam.exam_id,
      'training_id',      v_exam.training_id,
      'training_title',   v_train.title,
      'instructor',       v_train.trainer,
      'instructions',     v_exam.instructions,
      'exam_title',       v_exam.exam_title,
      'exam_date',        v_exam.exam_date,
      'duration_minutes', v_exam.duration_minutes,
      'passing_score',    v_exam.passing_score
    ),
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'question_id',   q.question_id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'display_order', q.display_order,
        'points',        q.points,
        'is_required',   q.is_required,
        'image_url',     q.image_url,
        'answers', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'answer_id', a.answer_id, 'answer_key', a.answer_key, 'answer_text', a.answer_text,
            'display_order', a.display_order, 'match_key', a.match_key, 'match_value', a.match_value
          ) ORDER BY a.display_order, a.answer_id)
          FROM question_answers a WHERE a.question_id = q.question_id
        ), '[]'::jsonb)
      ) ORDER BY q.display_order, q.question_id)
      FROM questions q
      WHERE q.exam_id = v_exam.exam_id AND q.is_active = TRUE AND q.in_exam = TRUE
    ), '[]'::jsonb),
    -- Previously saved answers so a refresh restores the candidate's progress.
    'saved', coalesce((
      SELECT jsonb_object_agg(r.question_id::text, jsonb_build_object(
        'selected_ids', r.selected_ids, 'response_text', r.response_text, 'response_json', r.response_json
      ))
      FROM exam_responses r WHERE r.attempt_id = v_att.attempt_id
    ), '{}'::jsonb)
  );
END;
$$;

-- Resolve a session token to its attempt, enforcing expiry. Returns the
-- attempt row id + exam id, or NULL when invalid/closed.
CREATE OR REPLACE FUNCTION exam_token_attempt(p_token text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_ac  exam_access%ROWTYPE;
  v_att exam_attempts%ROWTYPE;
BEGIN
  IF coalesce(p_token,'') = '' THEN RETURN NULL; END IF;
  SELECT * INTO v_ac FROM exam_access WHERE session_token = p_token LIMIT 1;
  IF NOT FOUND OR v_ac.is_active IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT * INTO v_att FROM exam_attempts
  WHERE access_id = v_ac.access_id AND exam_id = v_ac.exam_id AND candidate_no = v_ac.candidate_no
  ORDER BY attempt_id DESC LIMIT 1;
  IF v_att.attempt_id IS NULL OR v_att.status <> 'IN_PROGRESS' THEN RETURN NULL; END IF;

  IF v_att.expires_at IS NOT NULL AND v_att.expires_at <= CURRENT_TIMESTAMP THEN
    PERFORM exam_finalize_attempt(v_att.attempt_id, 'EXPIRED');
    RETURN NULL;  -- time is up; caller should re-login to see status
  END IF;
  RETURN v_att.attempt_id;
END;
$$;

-- ── Auto-save a single answer (UPSERT keyed by attempt+question) ──
-- Payload: { token, question_id, selected_ids?, response_text?, response_json? }
CREATE OR REPLACE FUNCTION exam_answer_save(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_att   bigint := exam_token_attempt(p_data->>'token');
  v_qid   bigint := nullif(p_data->>'question_id', '')::bigint;
  v_exam  bigint;
  v_cand  integer;
  v_now   timestamp := CURRENT_TIMESTAMP;
  v_exp   timestamp;
BEGIN
  IF v_att IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;
  IF v_qid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid');
  END IF;

  SELECT exam_id, candidate_no, expires_at INTO v_exam, v_cand, v_exp
  FROM exam_attempts WHERE attempt_id = v_att;

  -- The question must belong to this exam's delivered set.
  IF NOT EXISTS (
    SELECT 1 FROM questions WHERE question_id = v_qid AND exam_id = v_exam AND is_active = TRUE AND in_exam = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid_question');
  END IF;

  INSERT INTO exam_responses (
    attempt_id, question_id, response_text, selected_ids, response_json,
    max_points, needs_review, created_by, updated_by, created_at, updated_at
  ) VALUES (
    v_att, v_qid,
    nullif(p_data->>'response_text', ''),
    coalesce(p_data->'selected_ids', '[]'::jsonb),
    p_data->'response_json',
    coalesce((SELECT points FROM questions WHERE question_id = v_qid), 0),
    FALSE, v_cand, v_cand, v_now, v_now
  )
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET
    response_text = EXCLUDED.response_text,
    selected_ids  = EXCLUDED.selected_ids,
    response_json = EXCLUDED.response_json,
    updated_by    = EXCLUDED.updated_by,
    updated_at    = EXCLUDED.updated_at;

  UPDATE exam_attempts SET updated_at = v_now, updated_by = v_cand WHERE attempt_id = v_att;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'server_now', v_now, 'expires_at', v_exp);
END;
$$;

-- ── Submit the attempt (token-authenticated) ──
-- Optionally accepts a final { responses: [...] } batch (last-write) before
-- finalizing, so a submit never loses the latest edits.
CREATE OR REPLACE FUNCTION exam_submit_token(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_att  bigint := exam_token_attempt(p_data->>'token');
  v_r    jsonb;
  v_qid  bigint;
  v_exam bigint;
  v_cand integer;
BEGIN
  IF v_att IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'expired',
      'message', 'The exam time is up or the session is no longer active.');
  END IF;
  SELECT exam_id, candidate_no INTO v_exam, v_cand FROM exam_attempts WHERE attempt_id = v_att;

  -- Persist any final answers supplied with the submit.
  FOR v_r IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'responses', '[]'::jsonb))
  LOOP
    v_qid := nullif(v_r->>'question_id', '')::bigint;
    CONTINUE WHEN v_qid IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM questions WHERE question_id = v_qid AND exam_id = v_exam AND is_active AND in_exam
    );
    INSERT INTO exam_responses (
      attempt_id, question_id, response_text, selected_ids, response_json,
      max_points, needs_review, created_by, updated_by
    ) VALUES (
      v_att, v_qid, nullif(v_r->>'response_text', ''),
      coalesce(v_r->'selected_ids', '[]'::jsonb), v_r->'response_json',
      coalesce((SELECT points FROM questions WHERE question_id = v_qid), 0),
      FALSE, v_cand, v_cand
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      response_text = EXCLUDED.response_text,
      selected_ids  = EXCLUDED.selected_ids,
      response_json = EXCLUDED.response_json,
      updated_by    = EXCLUDED.updated_by,
      updated_at    = CURRENT_TIMESTAMP;
  END LOOP;

  PERFORM exam_finalize_attempt(v_att, 'SUBMITTED');

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok', 'state', 'submitted',
    'message', 'Your exam has been submitted and is awaiting correction.'
  );
END;
$$;

-- ================================================================
-- Instructor / Admin / Head of Training · correction
-- ================================================================

-- Full attempt detail for grading: every question with the candidate's answer,
-- the correct answer(s), max + awarded points and any instructor comment.
CREATE OR REPLACE FUNCTION exam_attempt_for_correction(p_attempt bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_att exam_attempts%ROWTYPE;
  v_ex  record;
BEGIN
  SELECT * INTO v_att FROM exam_attempts WHERE attempt_id = p_attempt;
  IF v_att.attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  SELECT e.exam_title, e.passing_score, e.exam_date, e.duration_minutes,
         tr.title AS training_title, tr.trainer AS instructor,
         a.full_name AS candidate_name
    INTO v_ex
  FROM exams e
  JOIN training tr ON tr.training_id = e.training_id
  JOIN applicant a ON a.candidate_no = v_att.candidate_no
  WHERE e.exam_id = v_att.exam_id;

  RETURN jsonb_build_object(
    'ok', true,
    'attempt', jsonb_build_object(
      'attempt_id',        v_att.attempt_id,
      'candidate_no',      v_att.candidate_no,
      'candidate_name',    v_ex.candidate_name,
      'exam_id',           v_att.exam_id,
      'exam_title',        v_ex.exam_title,
      'training_title',    v_ex.training_title,
      'instructor',        v_ex.instructor,
      'exam_date',         v_ex.exam_date,
      'status',            v_att.status,
      'correction_status', v_att.correction_status,
      'total_score',       v_att.total_score,
      'max_score',         v_att.max_score,
      'final_score',       v_att.final_score,
      'passing_score',     v_ex.passing_score,
      'passed',            v_att.passed,
      'started_at',        v_att.started_at,
      'submitted_at',      v_att.submitted_at,
      'corrected_by',      v_att.corrected_by,
      'corrected_at',      v_att.corrected_at,
      'instructor_comment', v_att.instructor_comment
    ),
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'question_id',   q.question_id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'display_order', q.display_order,
        'max_points',    q.points,
        'auto_graded',   q.question_type NOT IN ('DEFINITION','ANALYTICAL'),
        'awarded_score', r.awarded_score,
        'is_correct',    r.is_correct,
        'needs_review',  r.needs_review,
        'instructor_comment', r.instructor_comment,
        'response_text', r.response_text,
        'selected_ids',  r.selected_ids,
        'response_json', r.response_json,
        'answers', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'answer_id', a.answer_id, 'answer_key', a.answer_key, 'answer_text', a.answer_text,
            'is_correct', a.is_correct, 'display_order', a.display_order,
            'match_key', a.match_key, 'match_value', a.match_value
          ) ORDER BY a.display_order, a.answer_id)
          FROM question_answers a WHERE a.question_id = q.question_id
        ), '[]'::jsonb)
      ) ORDER BY q.display_order, q.question_id)
      FROM questions q
      LEFT JOIN exam_responses r ON r.attempt_id = p_attempt AND r.question_id = q.question_id
      WHERE q.exam_id = v_att.exam_id AND q.is_active = TRUE AND q.in_exam = TRUE
    ), '[]'::jsonb)
  );
END;
$$;

-- Mark that correction has started (WAITING_FOR_CORRECTION → CORRECTING).
CREATE OR REPLACE FUNCTION exam_grade_start(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_att bigint := nullif(p_data->>'attempt_id', '')::bigint;
  v_who bigint := nullif(p_data->>'updated_by', '')::bigint;
BEGIN
  UPDATE exam_attempts SET
    correction_status = CASE WHEN correction_status = 'CORRECTED' THEN 'CORRECTED' ELSE 'CORRECTING' END,
    corrected_by = v_who, updated_by = v_who, updated_at = CURRENT_TIMESTAMP
  WHERE attempt_id = v_att;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- Save instructor grading. Payload:
-- { attempt_id, updated_by, finalize?:bool, comment?,
--   grades: [{ question_id, points_awarded, comment? }] }
-- Manual scores are stored on the responses; the attempt total is recomputed
-- from ALL responses (auto + manual). finalize=true marks it CORRECTED.
CREATE OR REPLACE FUNCTION exam_grade_save(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_att   bigint := nullif(p_data->>'attempt_id', '')::bigint;
  v_who   bigint := nullif(p_data->>'updated_by', '')::bigint;
  v_final boolean := coalesce((p_data->>'finalize')::boolean, false);
  v_g     jsonb;
  v_qid   bigint;
  v_pts   numeric;
  v_max   numeric;
  v_total numeric;
  v_grand numeric;
  v_pass  numeric;
  v_exam  bigint;
BEGIN
  IF v_att IS NULL THEN RETURN jsonb_build_object('ok', false, 'status', 'invalid'); END IF;
  SELECT exam_id INTO v_exam FROM exam_attempts WHERE attempt_id = v_att;
  IF v_exam IS NULL THEN RETURN jsonb_build_object('ok', false, 'status', 'not_found'); END IF;

  FOR v_g IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'grades', '[]'::jsonb))
  LOOP
    v_qid := nullif(v_g->>'question_id', '')::bigint;
    CONTINUE WHEN v_qid IS NULL;
    SELECT points INTO v_max FROM questions WHERE question_id = v_qid;
    -- Clamp the awarded score to [0, max_points]; never trust the client value.
    v_pts := least(greatest(coalesce(nullif(v_g->>'points_awarded','')::numeric, 0), 0), coalesce(v_max, 0));

    UPDATE exam_responses SET
      awarded_score = v_pts,
      instructor_comment = nullif(v_g->>'comment', ''),
      graded_by = v_who, graded_at = CURRENT_TIMESTAMP,
      updated_by = v_who, updated_at = CURRENT_TIMESTAMP
    WHERE attempt_id = v_att AND question_id = v_qid;
  END LOOP;

  -- Recompute totals from every stored response.
  SELECT coalesce(sum(awarded_score), 0) INTO v_total FROM exam_responses WHERE attempt_id = v_att;
  -- Max score = sum of ALL in-exam questions' points (not only answered ones).
  SELECT coalesce(sum(points), 0) INTO v_grand FROM questions
   WHERE exam_id = v_exam AND is_active AND in_exam;
  SELECT passing_score INTO v_pass FROM exams WHERE exam_id = v_exam;

  UPDATE exam_attempts SET
    total_score       = v_total,
    max_score         = v_grand,
    instructor_comment = coalesce(nullif(p_data->>'comment', ''), instructor_comment),
    correction_status = CASE WHEN v_final THEN 'CORRECTED' ELSE 'CORRECTING' END,
    status            = CASE WHEN v_final THEN 'CORRECTED' ELSE status END,
    passed            = CASE WHEN v_pass IS NULL THEN NULL ELSE (v_total >= v_pass) END,
    final_score       = CASE WHEN v_final THEN v_total ELSE final_score END,
    corrected_by      = v_who,
    corrected_at      = CASE WHEN v_final THEN CURRENT_TIMESTAMP ELSE corrected_at END,
    updated_by        = v_who,
    updated_at        = CURRENT_TIMESTAMP
  WHERE attempt_id = v_att;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok',
    'total_score', v_total, 'max_score', v_grand,
    'passing_score', v_pass, 'passed', CASE WHEN v_pass IS NULL THEN NULL ELSE (v_total >= v_pass) END,
    'correction_status', CASE WHEN v_final THEN 'CORRECTED' ELSE 'CORRECTING' END
  );
END;
$$;

-- ================================================================
-- Panel-Exam · the candidate's final result (only when CORRECTED)
-- ================================================================
-- Internal payload builder shared by exam_login (result state) and the
-- result endpoint. Assumes the attempt is corrected; returns full breakdown.
CREATE OR REPLACE FUNCTION exam_result_payload(p_attempt bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_att exam_attempts%ROWTYPE;
  v_ex  record;
BEGIN
  SELECT * INTO v_att FROM exam_attempts WHERE attempt_id = p_attempt;
  SELECT e.exam_title, e.passing_score, e.exam_date,
         tr.title AS training_title, tr.trainer AS instructor,
         a.full_name AS candidate_name
    INTO v_ex
  FROM exams e JOIN training tr ON tr.training_id = e.training_id
  JOIN applicant a ON a.candidate_no = v_att.candidate_no
  WHERE e.exam_id = v_att.exam_id;

  RETURN jsonb_build_object(
    'ok', true,
    'result', jsonb_build_object(
      'exam_title',     v_ex.exam_title,
      'training_title', v_ex.training_title,
      'instructor',     v_ex.instructor,
      'exam_date',      v_ex.exam_date,
      'candidate_name', v_ex.candidate_name,
      'total_score',    coalesce(v_att.final_score, v_att.total_score),
      'max_score',      v_att.max_score,
      'passing_score',  v_ex.passing_score,
      'passed',         v_att.passed,
      'corrected_at',   v_att.corrected_at,
      'instructor_comment', v_att.instructor_comment,
      'questions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'question_text', q.question_text,
          'question_type', q.question_type,
          'max_points',    q.points,
          'awarded_score', r.awarded_score,
          'is_correct',    r.is_correct,
          'instructor_comment', r.instructor_comment
        ) ORDER BY q.display_order, q.question_id)
        FROM questions q
        LEFT JOIN exam_responses r ON r.attempt_id = p_attempt AND r.question_id = q.question_id
        WHERE q.exam_id = v_att.exam_id AND q.is_active AND q.in_exam
      ), '[]'::jsonb)
    )
  );
END;
$$;

-- ── Staff-facing: a candidate's exam result summary (by candidate_no) ──
-- Used by the applicant form's "Individual Exam Result" panel (Panel-Exam) so
-- staff see the real attempt. Returns the latest attempt for the candidate with
-- exam + training meta and a 'viewable' flag (true only once CORRECTED), so the
-- panel opens with the final result once the candidate has finished.
CREATE OR REPLACE FUNCTION exam_candidate_result(p_candidate_no integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_att exam_attempts%ROWTYPE;
  v_ex  record;
BEGIN
  SELECT * INTO v_att FROM exam_attempts
  WHERE candidate_no = p_candidate_no
  ORDER BY submitted_at DESC NULLS LAST, attempt_id DESC
  LIMIT 1;

  IF v_att.attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'has_attempt', false, 'state', 'none');
  END IF;

  SELECT e.exam_title, e.passing_score, e.exam_date, e.duration_minutes,
         tr.title AS training_title, tr.trainer AS instructor,
         a.full_name AS candidate_name
    INTO v_ex
  FROM exams e
  JOIN training tr ON tr.training_id = e.training_id
  JOIN applicant a ON a.candidate_no = v_att.candidate_no
  WHERE e.exam_id = v_att.exam_id;

  RETURN jsonb_build_object(
    'ok', true,
    'has_attempt', true,
    -- The panel is "viewable" (final result shown) only once corrected.
    'viewable', (v_att.correction_status = 'CORRECTED'),
    'state', CASE
               WHEN v_att.correction_status = 'CORRECTED' THEN 'corrected'
               WHEN v_att.status = 'IN_PROGRESS' THEN 'in_progress'
               ELSE 'waiting'
             END,
    'attempt_id',        v_att.attempt_id,
    'candidate_no',      v_att.candidate_no,
    'candidate_name',    v_ex.candidate_name,
    'exam_id',           v_att.exam_id,
    'exam_title',        v_ex.exam_title,
    'training_title',    v_ex.training_title,
    'instructor',        v_ex.instructor,
    'exam_date',         v_ex.exam_date,
    'status',            v_att.status,
    'correction_status', v_att.correction_status,
    'started_at',        v_att.started_at,
    'submitted_at',      v_att.submitted_at,
    'total_score',       coalesce(v_att.final_score, v_att.total_score),
    'max_score',         v_att.max_score,
    'passing_score',     v_ex.passing_score,
    'passed',            v_att.passed,
    'instructor_comment', v_att.instructor_comment
  );
END;
$$;

-- when the attempt is CORRECTED, and only for the credential's own candidate
-- (identity comes from the token, never the client).
CREATE OR REPLACE FUNCTION exam_result_for_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_ac  exam_access%ROWTYPE;
  v_att exam_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_ac FROM exam_access WHERE session_token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'invalid'); END IF;
  SELECT * INTO v_att FROM exam_attempts
  WHERE access_id = v_ac.access_id AND candidate_no = v_ac.candidate_no
  ORDER BY attempt_id DESC LIMIT 1;
  IF v_att.attempt_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'status', 'no_attempt'); END IF;
  IF v_att.correction_status <> 'CORRECTED' THEN
    RETURN jsonb_build_object('ok', true, 'state', 'waiting', 'status', 'not_corrected');
  END IF;
  RETURN exam_result_payload(v_att.attempt_id) || jsonb_build_object('state', 'result');
END;
$$;
>>>>>>> 58843b751bc0aaa1d0cd6dd2761671070c1334b5
