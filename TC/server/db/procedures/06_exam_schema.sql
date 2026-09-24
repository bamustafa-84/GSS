-- ================================================================
-- GSS · Exam subsystem schema alignment (idempotent)
-- ----------------------------------------------------------------
-- The exam procedures (70/75/80/81) target an EXAM-scoped question
-- model: every question belongs to an `exams` row (exam_id) and its
-- options live in a `question_answers` table. The base database still
-- carries the earlier TRAINING-scoped shape (questions.training_id,
-- exam_question / question_option), so this migration brings `exams`,
-- `questions` and `question_answers` up to what those procedures need.
--
-- Runs early (file 06, before 45/70/75/80) and is safe to re-run on
-- every server start.
-- ================================================================

-- ── exams: fields used by the exam builder / delivery ────────────
ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_title       varchar(255);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS passing_score    numeric(7,2);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_active        boolean NOT NULL DEFAULT true;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS updated_by       bigint;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS updated_at       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- created_by is written as a numeric user id (BIGINT) by the procedures.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'exams' AND column_name = 'created_by') <> 'bigint' THEN
    ALTER TABLE exams
      ALTER COLUMN created_by TYPE bigint USING nullif(created_by, '')::bigint;
  END IF;
END $$;

-- One exam template per training (required for exam_upsert's ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_exams_training ON exams(training_id);

-- ── questions: move from training-scoped to exam-scoped ──────────
ALTER TABLE questions ADD COLUMN IF NOT EXISTS exam_id       bigint;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS display_order integer;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS points        numeric(7,2);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_required   boolean NOT NULL DEFAULT true;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by    bigint;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS updated_by    bigint;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS updated_at    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Exam-scoped questions no longer require training_id (kept for legacy rows).
ALTER TABLE questions ALTER COLUMN training_id DROP NOT NULL;

-- Link every question to its exam.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_questions_exam' AND table_name = 'questions'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT fk_questions_exam
      FOREIGN KEY (exam_id) REFERENCES exams(exam_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── question_answers: options / correct answers / match pairs ────
CREATE TABLE IF NOT EXISTS question_answers (
    answer_id     BIGSERIAL PRIMARY KEY,
    question_id   BIGINT  NOT NULL,
    answer_key    VARCHAR(50),
    answer_text   TEXT,
    is_correct    BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER,
    match_key     TEXT,
    match_value   TEXT,
    created_by    BIGINT,
    updated_by    BIGINT,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_answer_question
        FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
);
