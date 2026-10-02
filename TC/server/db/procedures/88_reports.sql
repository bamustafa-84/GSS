-- ================================================================
-- GSS · Reports
-- ----------------------------------------------------------------
-- Read-only, set-based helpers that back the reporting dashboards
-- under /reports. Each function returns a single jsonb payload so the
-- Node layer can forward it verbatim (see callProc + /api/reports/*).
--
-- Runs after 87_training_sessions.sql (order matters for the training
-- helpers it depends on). Safe to re-run on every startup.
-- ================================================================

-- Training Register report ---------------------------------------
-- One enriched row per training session with the metrics the register
-- dashboard needs. Status is derived from the session window; the
-- registered / recommended / non-recommended counts come from the
-- candidates assigned to the session (applicant_training + applicant).
-- All filter arguments are optional (NULL / '' = no filter).
--   p_from / p_to : bound the session start date (inclusive).
--   p_trainer     : exact trainer match (case-insensitive).
--   p_status      : Planned | In Progress | Completed (case-insensitive).
--   p_search      : substring match on title or trainer.
CREATE OR REPLACE FUNCTION training_register_report(
  p_from    date DEFAULT NULL,
  p_to      date DEFAULT NULL,
  p_trainer text DEFAULT NULL,
  p_status  text DEFAULT NULL,
  p_search  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH latest_exam_results AS (
    SELECT DISTINCT ON (att.training_id, att.candidate_no)
      att.training_id,
      att.candidate_no,
      att.passed
    FROM exam_attempts att
    WHERE att.correction_status = 'CORRECTED'
      AND att.passed IS NOT NULL
    ORDER BY att.training_id, att.candidate_no,
             att.submitted_at DESC NULLS LAST, att.attempt_id DESC
  ), exam_grade_counts AS (
    SELECT training_id,
      count(*) FILTER (WHERE passed IS TRUE)::int AS pass_count,
      count(*) FILTER (WHERE passed IS FALSE)::int AS fail_count
    FROM latest_exam_results
    GROUP BY training_id
  ), base AS (
    SELECT
      tr.training_id,
      tr.title    AS training_title,
      tr.trainer  AS trainer,
      tr."from"   AS date_from,
      tr."to"     AS date_to,
      CASE
        WHEN now() < tr."from" THEN 'Planned'
        WHEN now() > tr."to"   THEN 'Completed'
        ELSE 'In Progress'
      END AS status,
      count(at.candidate_no)                                              AS registered,
      count(*) FILTER (WHERE ap.eval_final_decision = 'recommended')      AS recommended,
      count(*) FILTER (WHERE ap.eval_final_decision = 'not-recommended')  AS non_recommended,
      coalesce(max(eg.pass_count), 0)::int                                AS pass_count,
      coalesce(max(eg.fail_count), 0)::int                                AS fail_count,
      -- Daily session length in hours (end time-of-day − start time-of-day).
      greatest(
        EXTRACT(EPOCH FROM (tr."to"::time - tr."from"::time)) / 3600.0,
        0
      ) AS session_hours
    FROM training tr
    LEFT JOIN applicant_training at ON at.training_id = tr.training_id
    LEFT JOIN applicant ap          ON ap.candidate_no = at.candidate_no
    LEFT JOIN exam_grade_counts eg  ON eg.training_id = tr.training_id
    GROUP BY tr.training_id, tr.title, tr.trainer, tr."from", tr."to"
  )
  SELECT coalesce(
           jsonb_agg(to_jsonb(b) ORDER BY b.date_from DESC NULLS LAST, b.training_title),
           '[]'::jsonb)
  FROM base b
  WHERE (p_from IS NULL OR b.date_from::date >= p_from)
    AND (p_to   IS NULL OR b.date_from::date <= p_to)
    AND (coalesce(nullif(trim(p_trainer), ''), '') = ''
         OR lower(b.trainer) = lower(trim(p_trainer)))
    AND (coalesce(nullif(trim(p_status), ''), '') = ''
         OR lower(b.status) = lower(trim(p_status)))
    AND (coalesce(nullif(trim(p_search), ''), '') = ''
         OR b.training_title ILIKE '%' || trim(p_search) || '%'
         OR b.trainer        ILIKE '%' || trim(p_search) || '%');
$$;
