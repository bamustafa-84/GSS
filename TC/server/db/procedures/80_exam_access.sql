-- ================================================================
-- GSS · Exam publishing, temporary credentials, delivery, correction
-- ----------------------------------------------------------------
-- Adds the "publish exam → temporary exam accounts → candidate sits the
-- exam with a server-enforced timer → instructor correction → panel-exam
-- result" workflow on top of the existing exam template model.
--
-- Design highlights (see the feature spec):
--   • Temporary exam accounts live in `exam_access`, NEVER in `applicant`
--     or `login`. They authenticate for ONE exam only and are disabled when
--     the exam expires (is_active = false) — history is always preserved.
--   • Passwords are stored as a pgcrypto bcrypt HASH (never plaintext). A
--     separate pgp-encrypted copy lets an authorised admin re-reveal/re-send
--     the credential; it is decrypted only inside admin-facing procedures.
--   • A per-login opaque `session_token` binds the candidate to their own
--     attempt. The client only ever holds the token; candidate_no / exam_id /
--     attempt_id / scores / status are always resolved & enforced server-side.
--   • The backend clock is authoritative: attempt.expires_at is computed from
--     exams.duration_minutes and enforced on every save/submit + a sweeper.
--
-- Idempotent: re-run safely on every server start.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Schema additions ────────────────────────────────────────────

-- Exam: publishing metadata. exam_date is mandatory to publish.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_date     DATE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT'; -- DRAFT | PUBLISHED
ALTER TABLE exams ADD COLUMN IF NOT EXISTS published_at  TIMESTAMP;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS published_by  BIGINT;

-- Exam attempts: audit + correction workflow + server-enforced expiry.
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS access_id        BIGINT;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMP;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS correction_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED';
                                    -- NOT_STARTED | WAITING_FOR_CORRECTION | CORRECTING | CORRECTED
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS corrected_by     BIGINT;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS corrected_at     TIMESTAMP;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS final_score      NUMERIC(7,2);
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS instructor_comment TEXT;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS created_by       BIGINT;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS updated_by       BIGINT;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Exam responses: audit + manual-grading trail.
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS instructor_comment TEXT;
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS graded_by        BIGINT;
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS graded_at        TIMESTAMP;
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS created_by       BIGINT;
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS updated_by       BIGINT;
ALTER TABLE exam_responses ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- One stored response per (attempt, question) so auto-save can UPSERT.
CREATE UNIQUE INDEX IF NOT EXISTS uq_response_attempt_question
  ON exam_responses(attempt_id, question_id);

-- applicant_training: audit fields (transaction table).
ALTER TABLE applicant_training ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE applicant_training ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE applicant_training ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE applicant_training ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── Temporary exam credentials ──────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_access (
    access_id        BIGSERIAL PRIMARY KEY,
    exam_id          BIGINT  NOT NULL,
    candidate_no     INTEGER NOT NULL,
    training_id      BIGINT  NOT NULL,

    username         VARCHAR(60) NOT NULL,
    password_hash    TEXT NOT NULL,          -- bcrypt hash (authentication)
    password_enc     BYTEA,                  -- pgp-encrypted copy (admin reveal only)

    credential_status VARCHAR(20) NOT NULL DEFAULT 'Generated',
                                             -- Generated | Sent | Used | Expired | Disabled
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,

    available_from   TIMESTAMP,
    expires_at       TIMESTAMP,
    used_at          TIMESTAMP,
    disabled_at      TIMESTAMP,
    sent_at          TIMESTAMP,
    sent_by          BIGINT,

    session_token    TEXT,
    session_expires  TIMESTAMP,

    created_by       BIGINT,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by       BIGINT,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_access_exam FOREIGN KEY (exam_id) REFERENCES exams(exam_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_access_username ON exam_access(lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_access_exam_cand ON exam_access(exam_id, candidate_no);
CREATE INDEX IF NOT EXISTS idx_exam_access_token ON exam_access(session_token);
CREATE INDEX IF NOT EXISTS idx_exam_access_exam  ON exam_access(exam_id);

-- ── Small helpers ───────────────────────────────────────────────

-- Symmetric key used to encrypt the reversible copy of the temporary
-- password. Internal app: a fixed application secret (defence-in-depth over
-- storing plaintext). Override with:  SET gss.cred_key = '...';
CREATE OR REPLACE FUNCTION exam_cred_key()
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(current_setting('gss.cred_key', true), ''), 'gss-exam-credential-key-2026');
$$;

-- Human-friendly random password: 8 chars, mixed case + digits, no ambiguous
-- characters (0/O/1/l/I) so credentials are easy to read out / type.
CREATE OR REPLACE FUNCTION exam_gen_password(p_len int DEFAULT 8)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  v_out   text := '';
  v_i     int;
BEGIN
  FOR v_i IN 1..greatest(p_len, 6) LOOP
    v_out := v_out || substr(v_alpha, (get_byte(gen_random_bytes(1), 0) % length(v_alpha)) + 1, 1);
  END LOOP;
  RETURN v_out;
END;
$$;

-- ================================================================
-- Publish an exam + generate temporary accounts
-- ================================================================
-- Payload: { training_id | exam_id, exam_date (YYYY-MM-DD, required),
--            duration_minutes?, passing_score?, published_by }
-- Returns: { ok, exam_id, exam_date, status, created:[{candidate_no,
--            candidate_name, username, password}], total }
-- The plaintext passwords are returned ONCE here (and are never stored in
-- plaintext); the admin can copy them immediately. Later reveal/send uses the
-- encrypted copy via exam_access_reveal / exam_access_send.
CREATE OR REPLACE FUNCTION exam_publish(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_exam    bigint  := nullif(p_data->>'exam_id', '')::bigint;
  v_train   bigint  := nullif(p_data->>'training_id', '')::bigint;
  v_who     bigint  := nullif(p_data->>'published_by', '')::bigint;
  v_date    date    := nullif(p_data->>'exam_date', '')::date;
  v_dur     int     := nullif(p_data->>'duration_minutes', '')::int;
  v_pass    numeric := nullif(p_data->>'passing_score', '')::numeric;
  v_cand    record;
  v_user    text;
  v_pwd     text;
  v_seq     int := 0;
  v_created jsonb := '[]'::jsonb;
  v_avail   timestamp := CURRENT_TIMESTAMP;
  v_expire  timestamp;
BEGIN
  IF v_exam IS NULL AND v_train IS NOT NULL THEN
    SELECT exam_id INTO v_exam FROM exams WHERE training_id = v_train ORDER BY exam_id LIMIT 1;
  END IF;
  IF v_exam IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'exam_id or training_id required');
  END IF;
  IF v_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_date', 'error', 'exam_date is required to publish');
  END IF;

  SELECT training_id INTO v_train FROM exams WHERE exam_id = v_exam;

  -- Credentials remain valid until the end of the exam day.
  v_expire := (v_date + INTERVAL '1 day')::timestamp;

  -- Flip the exam to PUBLISHED and pin the exam date/duration/pass mark.
  UPDATE exams SET
    exam_date        = v_date,
    duration_minutes = coalesce(v_dur, duration_minutes),
    passing_score    = coalesce(v_pass, passing_score),
    status           = 'PUBLISHED',
    is_active        = TRUE,
    published_at     = CURRENT_TIMESTAMP,
    published_by     = v_who,
    updated_by       = v_who,
    updated_at       = CURRENT_TIMESTAMP
  WHERE exam_id = v_exam;

  -- One temporary account per assigned candidate (idempotent per exam+cand).
  FOR v_cand IN
    SELECT at.candidate_no, a.full_name
    FROM applicant_training at
    JOIN applicant a ON a.candidate_no = at.candidate_no
    WHERE at.training_id = v_train
    ORDER BY at.candidate_no
  LOOP
    v_seq := v_seq + 1;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM exam_access WHERE exam_id = v_exam AND candidate_no = v_cand.candidate_no
    );

    -- Username: EX-<candidate>-<seq>. A candidate assigned to more than one
    -- exam would otherwise collide on the global-unique username, so fall back
    -- to a per-exam suffix (still unique thanks to the exam+candidate key).
    v_user := 'EX-' || v_cand.candidate_no || '-' || lpad(v_seq::text, 2, '0');
    IF EXISTS (SELECT 1 FROM exam_access WHERE lower(username) = lower(v_user)) THEN
      v_user := 'EX-' || v_cand.candidate_no || '-' || lpad(v_seq::text, 2, '0') || '-' || v_exam;
    END IF;
    v_pwd  := exam_gen_password(8);

    INSERT INTO exam_access (
      exam_id, candidate_no, training_id, username,
      password_hash, password_enc,
      credential_status, is_active, available_from, expires_at,
      created_by, updated_by
    ) VALUES (
      v_exam, v_cand.candidate_no, v_train, v_user,
      crypt(v_pwd, gen_salt('bf')),
      pgp_sym_encrypt(v_pwd, exam_cred_key()),
      'Generated', TRUE, v_avail, v_expire,
      v_who, v_who
    );

    v_created := v_created || jsonb_build_object(
      'candidate_no',   v_cand.candidate_no,
      'candidate_name', v_cand.full_name,
      'username',       v_user,
      'password',       v_pwd
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok',
    'exam_id', v_exam, 'exam_date', v_date, 'exam_status', 'PUBLISHED',
    'created', v_created,
    'total', jsonb_array_length(v_created)
  );
END;
$$;

-- ================================================================
-- Sweeper · expire overdue attempts + credentials (server-authoritative)
-- ================================================================
-- 1) Any IN_PROGRESS attempt past its expires_at is auto-closed: partial
--    answers are kept, it is graded (auto part) and marked EXPIRED and queued
--    for correction; the credential can no longer answer.
-- 2) Any credential past its overall expiry window is deactivated
--    (is_active=false, credential_status='Expired'). History is untouched.
CREATE OR REPLACE FUNCTION exam_expire_due()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_a       record;
  v_attempts int := 0;
  v_creds    int := 0;
BEGIN
  FOR v_a IN
    SELECT attempt_id FROM exam_attempts
    WHERE status = 'IN_PROGRESS' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
  LOOP
    PERFORM exam_finalize_attempt(v_a.attempt_id, 'EXPIRED');
    v_attempts := v_attempts + 1;
  END LOOP;

  WITH x AS (
    UPDATE exam_access SET
      is_active         = FALSE,
      credential_status = CASE WHEN credential_status = 'Disabled' THEN 'Disabled' ELSE 'Expired' END,
      disabled_at       = coalesce(disabled_at, CURRENT_TIMESTAMP),
      session_token     = NULL,
      updated_at        = CURRENT_TIMESTAMP
    WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
    RETURNING 1
  )
  SELECT count(*) INTO v_creds FROM x;

  RETURN jsonb_build_object('ok', true, 'attempts_expired', v_attempts, 'credentials_expired', v_creds);
END;
$$;

-- ================================================================
-- Auto-grade + finalize one attempt (used by submit and the sweeper)
-- ================================================================
-- Grades every stored response for the attempt, totals the score, marks the
-- attempt SUBMITTED/EXPIRED and queues manual review when needed. It does NOT
-- delete anything. p_status ∈ 'SUBMITTED' | 'EXPIRED'.
CREATE OR REPLACE FUNCTION exam_finalize_attempt(p_attempt bigint, p_status text DEFAULT 'SUBMITTED')
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_exam    bigint;
  v_pass    numeric;
  v_r       record;
  v_qtype   text;
  v_points  numeric;
  v_award   numeric;
  v_correct boolean;
  v_review  boolean;
  v_total   numeric := 0;
  v_max     numeric := 0;
  v_needs   boolean := false;
  v_sel     bigint[];
  v_correct_ids bigint[];
  v_ok      boolean;
BEGIN
  SELECT exam_id INTO v_exam FROM exam_attempts WHERE attempt_id = p_attempt;
  IF v_exam IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown attempt');
  END IF;
  SELECT passing_score INTO v_pass FROM exams WHERE exam_id = v_exam;

  -- Max score is ALWAYS the sum of every in-exam question (not only answered
  -- ones), and manual review is required whenever the exam contains any
  -- free-text question — even if the candidate left it blank / ran out of time.
  SELECT coalesce(sum(points), 0) INTO v_max FROM questions
    WHERE exam_id = v_exam AND is_active AND in_exam;
  SELECT EXISTS (
    SELECT 1 FROM questions
    WHERE exam_id = v_exam AND is_active AND in_exam
      AND question_type IN ('DEFINITION','ANALYTICAL')
  ) INTO v_needs;

  -- Score every stored response.
  FOR v_r IN SELECT * FROM exam_responses WHERE attempt_id = p_attempt
  LOOP
    SELECT question_type, points INTO v_qtype, v_points FROM questions WHERE question_id = v_r.question_id;
    v_points := coalesce(v_points, 0);
    v_award := 0;
    v_correct := NULL;
    v_review := false;

    IF v_qtype IN ('MULTIPLE_CHOICE', 'TRUE_FALSE') THEN
      SELECT array_agg((value)::text::bigint) INTO v_sel
      FROM jsonb_array_elements(coalesce(v_r.selected_ids, '[]'::jsonb));
      v_sel := coalesce(v_sel, '{}'::bigint[]);

      SELECT array_agg(answer_id ORDER BY answer_id) INTO v_correct_ids
      FROM question_answers WHERE question_id = v_r.question_id AND is_correct = TRUE;
      v_correct_ids := coalesce(v_correct_ids, '{}'::bigint[]);

      v_correct := (
        SELECT coalesce(array_agg(x ORDER BY x), '{}'::bigint[]) FROM unnest(v_sel) x
      ) = v_correct_ids AND array_length(v_correct_ids, 1) IS NOT NULL;
      IF v_correct THEN v_award := v_points; END IF;

    ELSIF v_qtype = 'CHRONOLOGICAL_ORDERING' THEN
      SELECT (
        (SELECT array_agg((elem)::text::bigint ORDER BY ord)
         FROM jsonb_array_elements_text(coalesce(v_r.response_json, '[]'::jsonb))
              WITH ORDINALITY AS r(elem, ord))
        =
        (SELECT array_agg(answer_id ORDER BY display_order, answer_id)
         FROM question_answers WHERE question_id = v_r.question_id)
      ) INTO v_ok;
      v_correct := coalesce(v_ok, false);
      IF v_correct THEN v_award := v_points; END IF;

    ELSIF v_qtype = 'MATCH_ITEMS' THEN
      SELECT NOT EXISTS (
        SELECT 1 FROM question_answers a
        WHERE a.question_id = v_r.question_id
          AND coalesce(v_r.response_json->>a.match_key, '') IS DISTINCT FROM coalesce(a.match_value, '')
      ) INTO v_ok;
      v_correct := coalesce(v_ok, false);
      IF v_correct THEN v_award := v_points; END IF;

    ELSE
      -- DEFINITION / ANALYTICAL → manual review. Keep any score already set
      -- by an instructor (re-finalize), otherwise 0 pending correction.
      v_review := true;
      v_needs  := true;
      v_award  := coalesce(v_r.awarded_score, 0);
    END IF;

    v_total := v_total + v_award;

    UPDATE exam_responses SET
      awarded_score = v_award,
      max_points    = v_points,
      is_correct    = v_correct,
      needs_review  = v_review,
      updated_at    = CURRENT_TIMESTAMP
    WHERE response_id = v_r.response_id;
  END LOOP;

  UPDATE exam_attempts SET
    total_score       = v_total,
    max_score         = v_max,
    passed            = CASE WHEN v_pass IS NULL THEN NULL ELSE (v_total >= v_pass) END,
    status            = p_status,
    submitted_at      = coalesce(submitted_at, CURRENT_TIMESTAMP),
    correction_status = CASE WHEN v_needs THEN 'WAITING_FOR_CORRECTION' ELSE 'CORRECTED' END,
    corrected_at      = CASE WHEN v_needs THEN corrected_at ELSE coalesce(corrected_at, CURRENT_TIMESTAMP) END,
    final_score       = CASE WHEN v_needs THEN NULL ELSE v_total END,
    updated_at        = CURRENT_TIMESTAMP
  WHERE attempt_id = p_attempt;

  -- The credential can no longer answer, but stays active so the candidate can
  -- return to view their result once corrected (until the exam fully expires).
  UPDATE exam_access SET
    credential_status = CASE WHEN credential_status IN ('Disabled','Expired') THEN credential_status ELSE 'Used' END,
    used_at           = coalesce(used_at, CURRENT_TIMESTAMP),
    session_token     = NULL,
    session_expires   = NULL,
    updated_at        = CURRENT_TIMESTAMP
  WHERE access_id = (SELECT access_id FROM exam_attempts WHERE attempt_id = p_attempt);

  RETURN jsonb_build_object(
    'ok', true, 'attempt_id', p_attempt,
    'total_score', v_total, 'max_score', v_max, 'needs_review', v_needs,
    'status', p_status
  );
END;
$$;
