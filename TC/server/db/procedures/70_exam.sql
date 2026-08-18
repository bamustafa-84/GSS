-- ================================================================
-- GSS · Exam configuration & delivery procedures
-- ----------------------------------------------------------------
-- Data model (one exam template per training):
--   training (existing)
--     └─ exams            1 row per training  (UNIQUE training_id)
--          └─ questions   ordered, typed, graded (points)
--               └─ question_answers  options / correct answers / matches
--
-- Delivery / grading:
--   exam_attempts   one row per (exam, candidate) attempt
--     └─ exam_responses  one row per answered question (+ auto score)
--
-- Naming convention: <area>_<transaction>, every function returns jsonb
-- (or a scalar) and is invoked through callProc() in the Node backend.
--
-- This file is idempotent: it is re-run on every server start. It also
-- DROPs the stale question/question_option/exam/exam_question functions
-- from the previous schema generation so the API stops referencing
-- tables that no longer exist.
-- ================================================================

-- ── Tables the earlier schema generation already created are kept as-is.
--    We only ADD what is missing (attempt/response tables + indexes) and
--    make sure the option-facing columns needed by grading exist.

CREATE TABLE IF NOT EXISTS exam_attempts (
    attempt_id      BIGSERIAL PRIMARY KEY,
    exam_id         BIGINT  NOT NULL,
    candidate_no    INTEGER NOT NULL,
    training_id     BIGINT  NOT NULL,

    status          VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS | SUBMITTED | GRADED
    total_score     NUMERIC(7,2),
    max_score       NUMERIC(7,2),
    passed          BOOLEAN,

    started_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at    TIMESTAMP,
    graded_at       TIMESTAMP,

    CONSTRAINT fk_attempt_exam
        FOREIGN KEY (exam_id) REFERENCES exams(exam_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_responses (
    response_id     BIGSERIAL PRIMARY KEY,
    attempt_id      BIGINT  NOT NULL,
    question_id     BIGINT  NOT NULL,

    -- Free-text / definition / analytical answers (stored for manual review).
    response_text   TEXT,
    -- Selected option ids (MC / TRUE_FALSE): a JSON array of answer_id values.
    selected_ids    JSONB   NOT NULL DEFAULT '[]'::jsonb,
    -- Ordering / matching submissions: JSON array/object as submitted.
    response_json   JSONB,

    awarded_score   NUMERIC(7,2) NOT NULL DEFAULT 0,
    max_points      NUMERIC(7,2) NOT NULL DEFAULT 0,
    is_correct      BOOLEAN,          -- NULL when it needs manual grading
    needs_review    BOOLEAN NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_response_attempt
        FOREIGN KEY (attempt_id) REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    CONSTRAINT fk_response_question
        FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
);

-- Helpful indexes for the common access paths.
CREATE INDEX IF NOT EXISTS idx_questions_exam        ON questions(exam_id, display_order);
CREATE INDEX IF NOT EXISTS idx_answers_question      ON question_answers(question_id, display_order);
CREATE INDEX IF NOT EXISTS idx_attempts_candidate    ON exam_attempts(candidate_no);
CREATE INDEX IF NOT EXISTS idx_attempts_exam         ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_responses_attempt     ON exam_responses(attempt_id);

-- ── Retire stale functions from the previous schema generation ────────
DROP FUNCTION IF EXISTS questions_for_training(integer);
DROP FUNCTION IF EXISTS exam_save(jsonb);

-- ================================================================
-- Read side
-- ================================================================

-- exam_for_training: the single exam template row for a training (or NULL row).
CREATE OR REPLACE FUNCTION exam_for_training(p_training_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT to_jsonb(e.*)
  FROM exams e
  WHERE e.training_id = p_training_id
  ORDER BY e.exam_id
  LIMIT 1;
$$;

-- questions_for_training: every question (with its answers) for a training's
-- exam, ordered by display_order. Returns [] when the training has no exam yet.
CREATE OR REPLACE FUNCTION questions_for_training(p_training_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY display_order, question_id), '[]'::jsonb)
  FROM (
    SELECT
      q.question_id,
      q.display_order,
      jsonb_build_object(
        'question_id',   q.question_id,
        'exam_id',       q.exam_id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'display_order', q.display_order,
        'points',        q.points,
        'is_required',   q.is_required,
        'in_exam',       q.in_exam,
        'image_url',     q.image_url,
        'answers', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'answer_id',     a.answer_id,
            'answer_key',    a.answer_key,
            'answer_text',   a.answer_text,
            'is_correct',    a.is_correct,
            'display_order', a.display_order,
            'match_key',     a.match_key,
            'match_value',   a.match_value
          ) ORDER BY a.display_order, a.answer_id)
          FROM question_answers a
          WHERE a.question_id = q.question_id
        ), '[]'::jsonb)
      ) AS row
    FROM questions q
    JOIN exams e ON e.exam_id = q.exam_id
    WHERE e.training_id = p_training_id
      AND q.is_active = TRUE
  ) t;
$$;

-- exam_template_for_candidate: the exam a candidate should sit, derived from
-- their assigned training(s) via applicant_training. Returns the exam meta and
-- its ordered questions+answers, or {ok:false} when nothing is assigned.
CREATE OR REPLACE FUNCTION exam_template_for_candidate(p_candidate_no integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_exam   exams%ROWTYPE;
  v_train  training%ROWTYPE;
BEGIN
  SELECT e.* INTO v_exam
  FROM applicant_training at
  JOIN exams e ON e.training_id = at.training_id AND e.is_active = TRUE
  WHERE at.candidate_no = p_candidate_no
  ORDER BY at.assigned_at DESC NULLS LAST, e.exam_id DESC
  LIMIT 1;

  IF v_exam.exam_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_exam');
  END IF;

  SELECT * INTO v_train FROM training WHERE training_id = v_exam.training_id;

  RETURN jsonb_build_object(
    'ok', true,
    'exam', jsonb_build_object(
      'exam_id',          v_exam.exam_id,
      'training_id',      v_exam.training_id,
      'training_title',   v_train.title,
      'instructor',       v_train.trainer,
      'instructions',     v_exam.instructions,
      'exam_title',       v_exam.exam_title,
      'exam_date',        v_exam.exam_date,
      'status',           v_exam.status,
      'duration_minutes', v_exam.duration_minutes,
      'passing_score',    v_exam.passing_score
    ),
    -- Deliver WITHOUT is_correct so the client cannot see the answer key.
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
            'answer_id',     a.answer_id,
            'answer_key',    a.answer_key,
            'answer_text',   a.answer_text,
            'display_order', a.display_order,
            'match_key',     a.match_key,
            'match_value',   a.match_value
          ) ORDER BY a.display_order, a.answer_id)
          FROM question_answers a WHERE a.question_id = q.question_id
        ), '[]'::jsonb)
      ) ORDER BY q.display_order, q.question_id)
      FROM questions q
      WHERE q.exam_id = v_exam.exam_id AND q.is_active = TRUE AND q.in_exam = TRUE
    ), '[]'::jsonb)
  );
END;
$$;

-- ================================================================
-- Write side · exam template configuration (admin)
-- ================================================================

-- exams_for_candidate: every exam the candidate can sit (one per assigned
-- training that has an active exam), so the client can let them choose.
CREATE OR REPLACE FUNCTION exams_for_candidate(p_candidate_no integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
    'exam_id',        e.exam_id,
    'training_id',    e.training_id,
    'training_title', tr.title,
    'exam_title',     e.exam_title,
    'passing_score',  e.passing_score
  )), '[]'::jsonb)
  FROM applicant_training at
  JOIN exams e    ON e.training_id = at.training_id AND e.is_active = TRUE
  JOIN training tr ON tr.training_id = e.training_id
  WHERE at.candidate_no = p_candidate_no;
$$;

-- exam_template_by_id: the delivery payload (questions WITHOUT the answer key)
-- for a specific exam. Used once the candidate has chosen which exam to sit.
CREATE OR REPLACE FUNCTION exam_template_by_id(p_exam_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_exam  exams%ROWTYPE;
  v_train training%ROWTYPE;
BEGIN
  SELECT * INTO v_exam FROM exams WHERE exam_id = p_exam_id AND is_active = TRUE;
  IF v_exam.exam_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_exam');
  END IF;
  SELECT * INTO v_train FROM training WHERE training_id = v_exam.training_id;

  RETURN jsonb_build_object(
    'ok', true,
    'exam', jsonb_build_object(
      'exam_id',          v_exam.exam_id,
      'training_id',      v_exam.training_id,
      'training_title',   v_train.title,
      'instructor',       v_train.trainer,
      'instructions',     v_exam.instructions,
      'exam_title',       v_exam.exam_title,
      'exam_date',        v_exam.exam_date,
      'status',           v_exam.status,
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
            'answer_id',     a.answer_id,
            'answer_key',    a.answer_key,
            'answer_text',   a.answer_text,
            'display_order', a.display_order,
            'match_key',     a.match_key,
            'match_value',   a.match_value
          ) ORDER BY a.display_order, a.answer_id)
          FROM question_answers a WHERE a.question_id = q.question_id
        ), '[]'::jsonb)
      ) ORDER BY q.display_order, q.question_id)
      FROM questions q
      WHERE q.exam_id = v_exam.exam_id AND q.is_active = TRUE AND q.in_exam = TRUE
    ), '[]'::jsonb)
  );
END;
$$;


-- replace its questions+answers with the supplied set (source of truth is the
-- client's configured list). Payload shape:
-- {
--   training_id, exam_title?, duration_minutes?, passing_score?, created_by?,
--   questions: [{
--     question_id?, question_text, question_type, display_order, points,
--     is_required?, answers: [{ answer_key?, answer_text?, is_correct?,
--       display_order?, match_key?, match_value? }]
--   }]
-- }
CREATE OR REPLACE FUNCTION exam_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_train  bigint := nullif(p_data->>'training_id', '')::bigint;
  v_who    bigint := nullif(p_data->>'created_by', '')::bigint;
  v_title  text   := nullif(trim(coalesce(p_data->>'exam_title', '')), '');
  v_exam   bigint;
  v_q      jsonb;
  v_a      jsonb;
  v_qid    bigint;
  v_ord    int := 0;
  v_aord   int;
BEGIN
  IF v_train IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'training_id required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM training WHERE training_id = v_train) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'unknown training');
  END IF;

  -- Keep any existing exam title when the caller doesn't supply one, so a
  -- plain "save configuration" from the admin UI never overwrites the title.
  v_title := coalesce(
    v_title,
    (SELECT exam_title FROM exams WHERE training_id = v_train),
    (SELECT 'Exam · ' || title FROM training WHERE training_id = v_train));

  -- Upsert the single exam row for this training.
  INSERT INTO exams (training_id, exam_title, duration_minutes, passing_score, created_by, updated_by)
  VALUES (
    v_train, v_title,
    nullif(p_data->>'duration_minutes', '')::int,
    nullif(p_data->>'passing_score', '')::numeric,
    v_who, v_who
  )
  ON CONFLICT (training_id) DO UPDATE SET
    exam_title       = EXCLUDED.exam_title,
    duration_minutes = EXCLUDED.duration_minutes,
    passing_score    = EXCLUDED.passing_score,
    updated_by       = EXCLUDED.updated_by,
    updated_at       = CURRENT_TIMESTAMP
  RETURNING exam_id INTO v_exam;

  -- Replace the question set wholesale (templates are the source of truth).
  DELETE FROM questions WHERE exam_id = v_exam;

  FOR v_q IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'questions', '[]'::jsonb))
  LOOP
    v_ord := v_ord + 1;
    INSERT INTO questions (
      exam_id, question_text, question_type, display_order, points, is_required, created_by, updated_by
    ) VALUES (
      v_exam,
      coalesce(v_q->>'question_text', ''),
      coalesce(v_q->>'question_type', 'DEFINITION'),
      coalesce(nullif(v_q->>'display_order', '')::int, v_ord),
      coalesce(nullif(v_q->>'points', '')::numeric, 1),
      coalesce((v_q->>'is_required')::boolean, true),
      v_who, v_who
    )
    RETURNING question_id INTO v_qid;

    v_aord := 0;
    FOR v_a IN SELECT * FROM jsonb_array_elements(coalesce(v_q->'answers', '[]'::jsonb))
    LOOP
      v_aord := v_aord + 1;
      INSERT INTO question_answers (
        question_id, answer_key, answer_text, is_correct, display_order,
        match_key, match_value, created_by, updated_by
      ) VALUES (
        v_qid,
        nullif(v_a->>'answer_key', ''),
        nullif(v_a->>'answer_text', ''),
        coalesce((v_a->>'is_correct')::boolean, false),
        coalesce(nullif(v_a->>'display_order', '')::int, v_aord),
        nullif(v_a->>'match_key', ''),
        nullif(v_a->>'match_value', ''),
        v_who, v_who
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'exam_id', v_exam);
END;
$$;

-- question_save: create or update a single question (and optionally its
-- answers) in-place, without rewriting the whole exam. Used by the inline
-- question editor. Payload: { question_id?, exam_id | training_id,
--   question_text, question_type, points?, display_order?, is_required?,
--   answers?: [ ... ] }  — answers, when provided, replace the question's set.
CREATE OR REPLACE FUNCTION question_save(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_qid   bigint := nullif(p_data->>'question_id', '')::bigint;
  v_exam  bigint := nullif(p_data->>'exam_id', '')::bigint;
  v_train bigint := nullif(p_data->>'training_id', '')::bigint;
  v_who   bigint := nullif(p_data->>'updated_by', '')::bigint;
  v_a     jsonb;
  v_aord  int := 0;
BEGIN
  IF v_exam IS NULL AND v_train IS NOT NULL THEN
    SELECT exam_id INTO v_exam FROM exams WHERE training_id = v_train ORDER BY exam_id LIMIT 1;
    -- Create the training's exam on first use so questions can be added.
    IF v_exam IS NULL THEN
      INSERT INTO exams (training_id, exam_title, created_by, updated_by)
      VALUES (v_train, (SELECT 'Exam · ' || title FROM training WHERE training_id = v_train), v_who, v_who)
      RETURNING exam_id INTO v_exam;
    END IF;
  END IF;

  IF v_qid IS NULL THEN
    IF v_exam IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'exam_id or training_id required');
    END IF;
    INSERT INTO questions (exam_id, question_text, question_type, display_order, points, is_required, in_exam, image_url, created_by, updated_by)
    VALUES (
      v_exam,
      coalesce(p_data->>'question_text', ''),
      coalesce(p_data->>'question_type', 'DEFINITION'),
      coalesce(nullif(p_data->>'display_order', '')::int,
        (SELECT coalesce(max(display_order), 0) + 1 FROM questions WHERE exam_id = v_exam)),
      coalesce(nullif(p_data->>'points', '')::numeric, 1),
      coalesce((p_data->>'is_required')::boolean, true),
      -- Newly created questions live in the library only until explicitly added.
      coalesce((p_data->>'in_exam')::boolean, false),
      nullif(p_data->>'image_url', ''),
      v_who, v_who
    )
    RETURNING question_id INTO v_qid;
  ELSE
    UPDATE questions SET
      question_text = coalesce(p_data->>'question_text', question_text),
      question_type = coalesce(p_data->>'question_type', question_type),
      points        = coalesce(nullif(p_data->>'points', '')::numeric, points),
      display_order = coalesce(nullif(p_data->>'display_order', '')::int, display_order),
      is_required   = coalesce((p_data->>'is_required')::boolean, is_required),
      in_exam       = coalesce((p_data->>'in_exam')::boolean, in_exam),
      image_url     = CASE WHEN p_data ? 'image_url' THEN nullif(p_data->>'image_url', '') ELSE image_url END,
      updated_by    = v_who,
      updated_at    = CURRENT_TIMESTAMP
    WHERE question_id = v_qid;
  END IF;

  -- Replace answers only when the caller supplied an 'answers' array.
  IF p_data ? 'answers' THEN
    DELETE FROM question_answers WHERE question_id = v_qid;
    FOR v_a IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'answers', '[]'::jsonb))
    LOOP
      v_aord := v_aord + 1;
      INSERT INTO question_answers (
        question_id, answer_key, answer_text, is_correct, display_order,
        match_key, match_value, created_by, updated_by
      ) VALUES (
        v_qid,
        nullif(v_a->>'answer_key', ''),
        nullif(v_a->>'answer_text', ''),
        coalesce((v_a->>'is_correct')::boolean, false),
        coalesce(nullif(v_a->>'display_order', '')::int, v_aord),
        nullif(v_a->>'match_key', ''),
        nullif(v_a->>'match_value', ''),
        v_who, v_who
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'question_id', v_qid);
END;
$$;

-- question_delete: soft-remove a question from its exam template.
CREATE OR REPLACE FUNCTION question_delete(p_question_id integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM questions WHERE question_id = p_question_id;
  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- questions_reorder: persist a new display order. Payload:
--   { order: [question_id, question_id, ...] }  (index = new order)
CREATE OR REPLACE FUNCTION questions_reorder(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id   bigint;
  v_ord  int := 0;
BEGIN
  FOR v_id IN SELECT (value)::text::bigint FROM jsonb_array_elements(coalesce(p_data->'order', '[]'::jsonb))
  LOOP
    v_ord := v_ord + 1;
    UPDATE questions SET display_order = v_ord, updated_at = CURRENT_TIMESTAMP WHERE question_id = v_id;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'status', 'ok');
END;
$$;

-- ================================================================
-- Delivery + grading
-- ================================================================

-- Auto-gradable types: everything except the free-text ones.
--   MULTIPLE_CHOICE / TRUE_FALSE / MATCH_ITEMS / CHRONOLOGICAL_ORDERING → auto
--   DEFINITION / ANALYTICAL                                            → manual

-- exam_attempt_submit: record a candidate's answers, auto-grade what can be
-- graded, flag the rest for manual review, and store the totals. Payload:
-- {
--   exam_id, candidate_no, training_id?,
--   responses: [{
--     question_id,
--     selected_ids?: [answer_id, ...],   -- MC / TRUE_FALSE
--     response_text?: '...',             -- DEFINITION / ANALYTICAL
--     response_json?: [...] | {...}      -- ORDERING / MATCH
--   }]
-- }
CREATE OR REPLACE FUNCTION exam_attempt_submit(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_exam    bigint := nullif(p_data->>'exam_id', '')::bigint;
  v_cand    integer := nullif(p_data->>'candidate_no', '')::integer;
  v_train   bigint := nullif(p_data->>'training_id', '')::bigint;
  v_attempt bigint;
  v_pass    numeric;
  v_r       jsonb;
  v_qid     bigint;
  v_qtype   text;
  v_points  numeric;
  v_award   numeric;
  v_correct boolean;
  v_review  boolean;
  v_total   numeric := 0;
  v_max     numeric := 0;
  v_needs   boolean := false;
  -- MC helpers
  v_sel     bigint[];
  v_correct_ids bigint[];
  -- ordering / match helpers
  v_ok      boolean;
BEGIN
  IF v_exam IS NULL OR v_cand IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'exam_id and candidate_no required');
  END IF;

  IF v_train IS NULL THEN
    SELECT training_id INTO v_train FROM exams WHERE exam_id = v_exam;
  END IF;
  SELECT passing_score INTO v_pass FROM exams WHERE exam_id = v_exam;

  INSERT INTO exam_attempts (exam_id, candidate_no, training_id, status, started_at, submitted_at)
  VALUES (v_exam, v_cand, v_train, 'SUBMITTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  RETURNING attempt_id INTO v_attempt;

  FOR v_r IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'responses', '[]'::jsonb))
  LOOP
    v_qid := nullif(v_r->>'question_id', '')::bigint;
    CONTINUE WHEN v_qid IS NULL;

    SELECT question_type, points INTO v_qtype, v_points FROM questions WHERE question_id = v_qid;
    CONTINUE WHEN v_qtype IS NULL;
    v_points := coalesce(v_points, 0);
    v_max := v_max + v_points;
    v_award := 0;
    v_correct := NULL;
    v_review := false;

    IF v_qtype IN ('MULTIPLE_CHOICE', 'TRUE_FALSE') THEN
      SELECT array_agg((value)::text::bigint) INTO v_sel
      FROM jsonb_array_elements(coalesce(v_r->'selected_ids', '[]'::jsonb));
      v_sel := coalesce(v_sel, '{}'::bigint[]);

      SELECT array_agg(answer_id ORDER BY answer_id) INTO v_correct_ids
      FROM question_answers WHERE question_id = v_qid AND is_correct = TRUE;
      v_correct_ids := coalesce(v_correct_ids, '{}'::bigint[]);

      -- Exact-match: the selected set equals the correct set.
      v_correct := (
        SELECT coalesce(array_agg(x ORDER BY x), '{}'::bigint[]) FROM unnest(v_sel) x
      ) = v_correct_ids AND array_length(v_correct_ids, 1) IS NOT NULL;
      IF v_correct THEN v_award := v_points; END IF;

    ELSIF v_qtype = 'CHRONOLOGICAL_ORDERING' THEN
      -- The client submits the ordered list of answer_id values. Correct when
      -- that order equals the stored order (answers sorted by display_order).
      SELECT (
        (SELECT array_agg((elem)::text::bigint ORDER BY ord)
         FROM jsonb_array_elements_text(coalesce(v_r->'response_json', '[]'::jsonb))
              WITH ORDINALITY AS r(elem, ord))
        =
        (SELECT array_agg(answer_id ORDER BY display_order, answer_id)
         FROM question_answers WHERE question_id = v_qid)
      ) INTO v_ok;
      v_correct := coalesce(v_ok, false);
      IF v_correct THEN v_award := v_points; END IF;

    ELSIF v_qtype = 'MATCH_ITEMS' THEN
      -- response_json: { match_key: match_value, ... }. Correct when every
      -- pair matches the stored pairing.
      SELECT NOT EXISTS (
        SELECT 1 FROM question_answers a
        WHERE a.question_id = v_qid
          AND coalesce(v_r->'response_json'->>a.match_key, '') IS DISTINCT FROM coalesce(a.match_value, '')
      ) INTO v_ok;
      v_correct := coalesce(v_ok, false);
      IF v_correct THEN v_award := v_points; END IF;

    ELSE
      -- DEFINITION / ANALYTICAL → store for manual review.
      v_review := true;
      v_needs := true;
    END IF;

    v_total := v_total + v_award;

    INSERT INTO exam_responses (
      attempt_id, question_id, response_text, selected_ids, response_json,
      awarded_score, max_points, is_correct, needs_review
    ) VALUES (
      v_attempt, v_qid,
      nullif(v_r->>'response_text', ''),
      coalesce(v_r->'selected_ids', '[]'::jsonb),
      v_r->'response_json',
      v_award, v_points, v_correct, v_review
    );
  END LOOP;

  UPDATE exam_attempts SET
    total_score = v_total,
    max_score   = v_max,
    passed      = CASE WHEN v_pass IS NULL THEN NULL ELSE (v_total >= v_pass) END,
    status      = CASE WHEN v_needs THEN 'SUBMITTED' ELSE 'GRADED' END,
    graded_at   = CASE WHEN v_needs THEN NULL ELSE CURRENT_TIMESTAMP END
  WHERE attempt_id = v_attempt;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'ok',
    'attempt_id', v_attempt,
    'total_score', v_total,
    'max_score', v_max,
    'passing_score', v_pass,
    'passed', CASE WHEN v_pass IS NULL THEN NULL ELSE (v_total >= v_pass) END,
    'needs_review', v_needs
  );
END;
$$;

-- exam_attempt_result: full breakdown of one attempt (per-question scores).
CREATE OR REPLACE FUNCTION exam_attempt_result(p_attempt_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'attempt', to_jsonb(a.*),
    'responses', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'question_id',   r.question_id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'awarded_score', r.awarded_score,
        'max_points',    r.max_points,
        'is_correct',    r.is_correct,
        'needs_review',  r.needs_review,
        'response_text', r.response_text
      ) ORDER BY q.display_order, r.response_id)
      FROM exam_responses r JOIN questions q ON q.question_id = r.question_id
      WHERE r.attempt_id = a.attempt_id
    ), '[]'::jsonb)
  )
  FROM exam_attempts a WHERE a.attempt_id = p_attempt_id;
$$;

-- exam_attempts_for_candidate: history list for a candidate.
CREATE OR REPLACE FUNCTION exam_attempts_for_candidate(p_candidate_no integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'attempt_id',   a.attempt_id,
    'exam_id',      a.exam_id,
    'exam_title',   e.exam_title,
    'training_id',  a.training_id,
    'status',       a.status,
    'total_score',  a.total_score,
    'max_score',    a.max_score,
    'passed',       a.passed,
    'submitted_at', a.submitted_at
  ) ORDER BY a.submitted_at DESC NULLS LAST, a.attempt_id DESC), '[]'::jsonb)
  FROM exam_attempts a JOIN exams e ON e.exam_id = a.exam_id
  WHERE a.candidate_no = p_candidate_no;
$$;

-- ================================================================
-- Exam configuration save (non-destructive) + admin preview
-- ================================================================

-- exam_config_save: persist which of the training's questions belong to the
-- exam, in what order and for how many points, WITHOUT deleting the library.
-- Questions are created/edited/deleted independently via question_save /
-- question_delete; this only toggles inclusion + order + points + exam meta.
-- Payload: {
--   training_id, exam_title?, duration_minutes?, passing_score?, instructions?,
--   created_by?, questions: [{ question_id, points?, display_order? }]
-- }
CREATE OR REPLACE FUNCTION exam_config_save(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_train bigint := nullif(p_data->>'training_id', '')::bigint;
  v_who   bigint := nullif(p_data->>'created_by', '')::bigint;
  v_title text   := nullif(trim(coalesce(p_data->>'exam_title', '')), '');
  v_exam  bigint;
  v_q     jsonb;
  v_qid   bigint;
  v_ord   int := 0;
BEGIN
  IF v_train IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'training_id required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM training WHERE training_id = v_train) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'unknown training');
  END IF;

  v_title := coalesce(
    v_title,
    (SELECT exam_title FROM exams WHERE training_id = v_train),
    (SELECT 'Exam · ' || title FROM training WHERE training_id = v_train));

  INSERT INTO exams (training_id, exam_title, duration_minutes, passing_score, instructions, exam_date, created_by, updated_by)
  VALUES (
    v_train, v_title,
    nullif(p_data->>'duration_minutes', '')::int,
    nullif(p_data->>'passing_score', '')::numeric,
    nullif(p_data->>'instructions', ''),
    nullif(p_data->>'exam_date', '')::date,
    v_who, v_who
  )
  ON CONFLICT (training_id) DO UPDATE SET
    exam_title       = EXCLUDED.exam_title,
    duration_minutes = coalesce(EXCLUDED.duration_minutes, exams.duration_minutes),
    passing_score    = coalesce(EXCLUDED.passing_score, exams.passing_score),
    instructions     = CASE WHEN p_data ? 'instructions' THEN EXCLUDED.instructions ELSE exams.instructions END,
    exam_date        = coalesce(EXCLUDED.exam_date, exams.exam_date),
    updated_by       = EXCLUDED.updated_by,
    updated_at       = CURRENT_TIMESTAMP
  RETURNING exam_id INTO v_exam;

  -- Start by excluding everything, then re-include what the admin configured.
  UPDATE questions SET in_exam = FALSE WHERE exam_id = v_exam;

  FOR v_q IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'questions', '[]'::jsonb))
  LOOP
    v_qid := nullif(v_q->>'question_id', '')::bigint;
    CONTINUE WHEN v_qid IS NULL;
    v_ord := v_ord + 1;
    UPDATE questions SET
      in_exam       = TRUE,
      display_order = coalesce(nullif(v_q->>'display_order', '')::int, v_ord),
      points        = coalesce(nullif(v_q->>'points', '')::numeric, points),
      updated_by    = v_who,
      updated_at    = CURRENT_TIMESTAMP
    WHERE question_id = v_qid AND exam_id = v_exam;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', 'ok', 'exam_id', v_exam);
END;
$$;

-- exam_preview_for_training: candidate-style delivery payload (questions
-- WITHOUT the answer key) for a training's exam. Used by the admin
-- "Preview as candidate" feature and the shareable preview route.
CREATE OR REPLACE FUNCTION exam_preview_for_training(p_training_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_exam  exams%ROWTYPE;
  v_train training%ROWTYPE;
BEGIN
  SELECT * INTO v_train FROM training WHERE training_id = p_training_id;
  IF v_train.training_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_training');
  END IF;

  SELECT * INTO v_exam FROM exams WHERE training_id = p_training_id ORDER BY exam_id LIMIT 1;
  IF v_exam.exam_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'no_exam');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'exam', jsonb_build_object(
      'exam_id',          v_exam.exam_id,
      'training_id',      v_exam.training_id,
      'training_title',   v_train.title,
      'instructor',       v_train.trainer,
      'instructions',     v_exam.instructions,
      'exam_title',       v_exam.exam_title,
      'exam_date',        v_exam.exam_date,
      'status',           v_exam.status,
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
            'answer_id',     a.answer_id,
            'answer_key',    a.answer_key,
            'answer_text',   a.answer_text,
            'display_order', a.display_order,
            'match_key',     a.match_key,
            'match_value',   a.match_value
          ) ORDER BY a.display_order, a.answer_id)
          FROM question_answers a WHERE a.question_id = q.question_id
        ), '[]'::jsonb)
      ) ORDER BY q.display_order, q.question_id)
      FROM questions q
      WHERE q.exam_id = v_exam.exam_id AND q.is_active = TRUE AND q.in_exam = TRUE
    ), '[]'::jsonb)
  );
END;
$$;
