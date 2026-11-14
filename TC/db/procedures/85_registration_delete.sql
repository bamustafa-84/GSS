-- ================================================================
-- GSS · Registration (Applicant) hard-delete procedure
-- ----------------------------------------------------------------
-- Removes a candidate and every dependent row (exam, attendance,
-- training assignment, measurements) so the applicant can be deleted
-- without tripping foreign-key constraints. Each dependent table is
-- guarded with to_regclass so a missing table never aborts the delete.
-- ================================================================

CREATE OR REPLACE FUNCTION registration_delete(p_id integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'candidate_no required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM applicant WHERE candidate_no = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not found');
  END IF;

  -- Remove dependent rows first so FK constraints don't block the delete.
  IF to_regclass('exam_responses') IS NOT NULL THEN
    DELETE FROM exam_responses
    WHERE attempt_id IN (SELECT attempt_id FROM exam_attempts WHERE candidate_no = p_id);
  END IF;
  IF to_regclass('exam_attempts') IS NOT NULL THEN
    DELETE FROM exam_attempts WHERE candidate_no = p_id;
  END IF;
  IF to_regclass('exam_access') IS NOT NULL THEN
    DELETE FROM exam_access WHERE candidate_no = p_id;
  END IF;
  IF to_regclass('attendance') IS NOT NULL THEN
    DELETE FROM attendance WHERE candidate_no = p_id;
  END IF;
  IF to_regclass('applicant_training') IS NOT NULL THEN
    DELETE FROM applicant_training WHERE candidate_no = p_id;
  END IF;
  IF to_regclass('measurements') IS NOT NULL THEN
    DELETE FROM measurements WHERE candidate_no = p_id;
  END IF;

  DELETE FROM applicant WHERE candidate_no = p_id;

  RETURN jsonb_build_object('ok', true, 'candidate_no', p_id);
END;
$$;
