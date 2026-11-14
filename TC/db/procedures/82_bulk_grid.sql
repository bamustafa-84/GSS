-- ================================================================
-- GSS · Bulk grid helpers (performance)
-- ----------------------------------------------------------------
-- The applicant data grid previously issued one HTTP + DB round-trip
-- per row to fetch each candidate's exam result (and, for instructors,
-- their trainings) — an N+1 pattern that does not scale. These two
-- set-based functions return the same data for ALL candidates in a
-- single query, letting the front-end build O(1) lookup maps.
-- ================================================================

-- Latest exam attempt per candidate, keyed by candidate_no → payload.
-- Mirrors the fields exam_candidate_result() exposes that the grid uses.
CREATE OR REPLACE FUNCTION exam_candidate_results_map()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_object_agg(candidate_no::text, payload), '{}'::jsonb)
  FROM (
    SELECT DISTINCT ON (att.candidate_no)
      att.candidate_no,
      jsonb_build_object(
        'ok', true,
        'has_attempt', true,
        'viewable', (att.correction_status = 'CORRECTED'),
        'state', CASE
                   WHEN att.correction_status = 'CORRECTED' THEN 'corrected'
                   WHEN att.status = 'IN_PROGRESS' THEN 'in_progress'
                   ELSE 'waiting'
                 END,
        'attempt_id',        att.attempt_id,
        'candidate_no',      att.candidate_no,
        'exam_id',           att.exam_id,
        'status',            att.status,
        'correction_status', att.correction_status,
        'total_score',       coalesce(att.final_score, att.total_score),
        'max_score',         att.max_score,
        'passing_score',     e.passing_score,
        'passed',            att.passed
      ) AS payload
    FROM exam_attempts att
    LEFT JOIN exams e ON e.exam_id = att.exam_id
    ORDER BY att.candidate_no, att.submitted_at DESC NULLS LAST, att.attempt_id DESC
  ) s;
$$;

-- Every candidate's training assignments, keyed by candidate_no → array.
-- Only the fields the grid grouping needs (training_id + trainer/title).
CREATE OR REPLACE FUNCTION applicant_trainings_map()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_object_agg(candidate_no::text, rows), '{}'::jsonb)
  FROM (
    SELECT at.candidate_no,
           jsonb_agg(jsonb_build_object(
             'training_id',    at.training_id,
             'training_title', tr.title,
             'trainer',        tr.trainer
           ) ORDER BY at.training_id) AS rows
    FROM applicant_training at
    LEFT JOIN training tr ON tr.training_id = at.training_id
    GROUP BY at.candidate_no
  ) s;
$$;
