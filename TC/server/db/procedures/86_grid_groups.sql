-- ================================================================
-- GSS · Hybrid grouped pagination for the applicant grid
-- ----------------------------------------------------------------
-- The applicant grid groups candidates by training. To scale to very
-- large datasets the client first loads lightweight group summaries
-- (header + candidate count) and then lazily pages each group's rows on
-- expand. Two functions back this:
--   • grid_group_summaries(trainer) — one row per training + a count,
--     optionally scoped to an instructor's own trainings, plus the count
--     of candidates with no training assignment.
--   • grid_group_rows(training_id, limit, offset) — one ordered page of
--     the candidates in a group, with the latest exam attempt merged in
--     (so the client needs no per-row exam fetch).
-- ================================================================

CREATE OR REPLACE FUNCTION grid_group_summaries(p_trainer text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_groups     jsonb;
  v_unassigned bigint := 0;
  v_has_trainer boolean := coalesce(nullif(trim(coalesce(p_trainer, '')), ''), '') <> '';
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.date_from DESC NULLS LAST, g.training_title), '[]'::jsonb)
  INTO v_groups
  FROM (
    SELECT tr.training_id,
           tr.title   AS training_title,
           tr.trainer AS trainer,
           tr."from"  AS date_from,
           tr."to"    AS date_to,
           count(at.candidate_no) AS candidate_count
    FROM training tr
    LEFT JOIN applicant_training at ON at.training_id = tr.training_id
    WHERE NOT v_has_trainer
       OR lower(trim(tr.trainer)) = lower(trim(coalesce(p_trainer, '')))
    GROUP BY tr.training_id, tr.title, tr.trainer, tr."from", tr."to"
  ) g;

  -- "No training assigned" bucket is only meaningful for non-instructor roles.
  IF NOT v_has_trainer THEN
    SELECT count(*) INTO v_unassigned
    FROM applicant a
    WHERE NOT EXISTS (SELECT 1 FROM applicant_training at WHERE at.candidate_no = a.candidate_no);
  END IF;

  RETURN jsonb_build_object('groups', v_groups, 'unassigned', v_unassigned);
END;
$$;

CREATE OR REPLACE FUNCTION grid_group_rows(
  p_training_id bigint,
  p_limit       int DEFAULT 100,
  p_offset      int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lim   int := least(greatest(coalesce(p_limit, 100), 1), 5000);
  v_off   int := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows  jsonb;
BEGIN
  IF p_training_id IS NULL THEN
    SELECT count(*) INTO v_total
    FROM applicant a
    WHERE NOT EXISTS (SELECT 1 FROM applicant_training at WHERE at.candidate_no = a.candidate_no);
  ELSE
    SELECT count(*) INTO v_total
    FROM applicant_training at
    WHERE at.training_id = p_training_id;
  END IF;

  SELECT coalesce(jsonb_agg(row_json ORDER BY candidate_no DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT a.candidate_no,
           to_jsonb(a) || jsonb_build_object('__exam',
             CASE WHEN att.attempt_id IS NULL THEN '{}'::jsonb
                  ELSE jsonb_build_object(
                    'ok', true,
                    'has_attempt', true,
                    'correction_status', att.correction_status,
                    'status', att.status,
                    'passed', att.passed,
                    'total_score', coalesce(att.final_score, att.total_score),
                    'passing_score', e.passing_score
                  )
             END) AS row_json
    FROM (
      SELECT a.*
      FROM applicant a
      WHERE (p_training_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM applicant_training at WHERE at.candidate_no = a.candidate_no))
         OR (p_training_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM applicant_training at WHERE at.candidate_no = a.candidate_no AND at.training_id = p_training_id))
      ORDER BY a.candidate_no DESC
      LIMIT v_lim OFFSET v_off
    ) a
    LEFT JOIN LATERAL (
      SELECT ea.attempt_id, ea.exam_id, ea.status, ea.correction_status,
             ea.passed, ea.total_score, ea.final_score
      FROM exam_attempts ea
      WHERE ea.candidate_no = a.candidate_no
      ORDER BY ea.submitted_at DESC NULLS LAST, ea.attempt_id DESC
      LIMIT 1
    ) att ON true
    LEFT JOIN exams e ON e.exam_id = att.exam_id
  ) s;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'limit', v_lim, 'offset', v_off);
END;
$$;
