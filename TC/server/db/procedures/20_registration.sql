-- ================================================================
-- GSS · Registration (Applicant) panel procedures
-- ----------------------------------------------------------------
-- Naming convention: <PanelName>_<Transaction>
--   Registration_Search / Registration_Get /
--   Registration_Insert / Registration_Update
-- All operate on the `applicant` table.
-- ================================================================

-- Registration_Search: full-text-ish search across every applicant
-- column. Empty search returns the most recent rows. Supports
-- incremental loading through p_limit / p_offset.
CREATE OR REPLACE FUNCTION registration_search(
  p_search text DEFAULT '',
  p_limit  int  DEFAULT 10,
  p_offset int  DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(t.row ORDER BY t.candidate_no DESC), '[]'::jsonb)
  FROM (
    SELECT a.candidate_no, to_jsonb(a.*) AS row
    FROM applicant a
    WHERE coalesce(p_search, '') = ''
       OR to_jsonb(a.*)::text ILIKE '%' || p_search || '%'
    ORDER BY a.candidate_no DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  ) t;
$$;

-- Registration_Get: fetch a single applicant by candidate number.
CREATE OR REPLACE FUNCTION registration_get(p_id int)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT to_jsonb(a.*) FROM applicant a WHERE a.candidate_no = p_id;
$$;

-- Registration_Insert: create an applicant from a JSON payload.
CREATE OR REPLACE FUNCTION registration_insert(p_data jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT dynamic_crud('insert', 'applicant', p_data, '{}'::jsonb);
$$;

-- Registration_Update: update an applicant by candidate number.
CREATE OR REPLACE FUNCTION registration_update(p_id int, p_data jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT dynamic_crud('update', 'applicant', p_data, jsonb_build_object('candidate_no', p_id));
$$;
