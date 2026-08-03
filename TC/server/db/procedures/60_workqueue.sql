-- ================================================================
-- GSS · Applicant work-queue procedures
-- ----------------------------------------------------------------
-- Powers the toolbar notifications:
--   • Pending interviews   → applicants with interview_result = 'Pending'
--   • Secretary work queue → applicants ACCEPTED at interview but who have
--     NOT yet completed the four required forms. "Completed" means the three
--     acceptance flags are all true (Conditions + Rules + Commitment; the
--     Registration form itself is implied by the applicant existing).
--
-- A single reusable predicate keeps the count and the list in sync.
-- ================================================================

-- Applicant_Pending_Count: how many applicants await an interview decision.
CREATE OR REPLACE FUNCTION applicant_pending_count()
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::int FROM applicant WHERE coalesce(interview_result, 'Pending') = 'Pending';
$$;

-- Applicant_Pending_List: those applicants (newest first).
CREATE OR REPLACE FUNCTION applicant_pending_list()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a.*) ORDER BY a.candidate_no DESC), '[]'::jsonb)
  FROM applicant a
  WHERE coalesce(a.interview_result, 'Pending') = 'Pending';
$$;

-- Secretary work-queue predicate: accepted at interview but not yet fully
-- processed (at least one of the three acceptance forms is still outstanding).
CREATE OR REPLACE FUNCTION applicant_is_wip(a applicant)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT a.interview_result = 'Accepted'
     AND NOT (coalesce(a.ack_conditions, false)
              AND coalesce(a.ack_rules, false)
              AND coalesce(a.ack_commitment, false));
$$;

-- Applicant_Secretary_Count: accepted applicants still missing paperwork.
CREATE OR REPLACE FUNCTION applicant_secretary_count()
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::int FROM applicant a WHERE applicant_is_wip(a);
$$;

-- Applicant_Secretary_List: that work queue (newest first).
CREATE OR REPLACE FUNCTION applicant_secretary_list()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a.*) ORDER BY a.candidate_no DESC), '[]'::jsonb)
  FROM applicant a
  WHERE applicant_is_wip(a);
$$;
