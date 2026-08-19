-- ================================================================
-- GSS · Training course cleanup + default course seed
-- ----------------------------------------------------------------
-- Removes the legacy TR1-TR6 training titles from both the
-- dictionary (dropdown choices) and the training table, cascading
-- through any dependent exam data. Then seeds the single default
-- bilingual training title:
--   English: Safety Training
--   French:  Formation en sécurité
--
-- Idempotent: safe to re-run on every server start.
-- ================================================================

-- 1) Remove TR1-TR6 from the training_title dictionary so they no
--    longer appear in dropdowns.
DELETE FROM dictionary
WHERE category = 'training_title'
  AND en_title IN ('TR1', 'TR2', 'TR3', 'TR4', 'TR5', 'TR6');

-- 2) Cascade-delete any exam data tied to the legacy trainings,
--    then remove the training rows themselves.  We delete in
--    child-to-parent order so the operation succeeds regardless of
--    whether the foreign keys are declared with ON DELETE CASCADE.
DO $$
DECLARE
  v_tid integer;
  v_exam_ids bigint[];
BEGIN
  FOR v_tid IN
    SELECT training_id FROM training
    WHERE title IN ('TR1', 'TR2', 'TR3', 'TR4', 'TR5', 'TR6')
  LOOP
    -- Collect exam ids for this training.
    SELECT array_agg(exam_id) INTO v_exam_ids FROM exams WHERE training_id = v_tid;

    -- Remove dependent rows first so the training row can be deleted.
    DELETE FROM attendance WHERE training_id = v_tid;
    DELETE FROM applicant_training WHERE training_id = v_tid;

    IF v_exam_ids IS NOT NULL THEN
      -- Responses → attempts → access → questions → exams.
      DELETE FROM exam_responses
        WHERE attempt_id IN (SELECT attempt_id FROM exam_attempts WHERE exam_id = ANY(v_exam_ids));
      DELETE FROM exam_attempts WHERE exam_id = ANY(v_exam_ids);
      DELETE FROM exam_access WHERE exam_id = ANY(v_exam_ids);
      DELETE FROM question_answers
        WHERE question_id IN (SELECT question_id FROM questions WHERE exam_id = ANY(v_exam_ids));
      DELETE FROM questions WHERE exam_id = ANY(v_exam_ids);
      DELETE FROM exams WHERE exam_id = ANY(v_exam_ids);
    END IF;

    -- Finally remove the training row.
    DELETE FROM training WHERE training_id = v_tid;
  END LOOP;
END $$;

-- 3) Ensure the default training title exists in the dictionary.
--    The code value is the English title; the UI shows fr_title or
--    en_title based on the active language.
INSERT INTO dictionary (category, fr_title, en_title, created_by, updated_by, updated_at)
SELECT 'training_title', 'Formation en sécurité', 'Safety Training', 'System', 'System', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM dictionary
  WHERE category = 'training_title' AND en_title = 'Safety Training'
);

-- 4) Ensure one default training course row exists in the training table
--    so the exam module and attendance sheet have a course to work with.
INSERT INTO training (title, trainer, "from", "to")
SELECT 'Safety Training', 'System', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days'
WHERE NOT EXISTS (
  SELECT 1 FROM training WHERE title = 'Safety Training'
);
