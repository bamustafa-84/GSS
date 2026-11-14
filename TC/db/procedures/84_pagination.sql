-- ================================================================
-- GSS · Server-side pagination + scale indexes (performance)
-- ----------------------------------------------------------------
-- listRecords previously returned every row of a table in one payload
-- (dynamic_crud select), which does not scale. records_page returns a
-- single ordered window plus the total row count so the client can page
-- through large tables. The indexes below back the hot lookup / grouping
-- paths (exam results, training assignments, attendance).
-- ================================================================

-- One ordered page of a table (identity/first column DESC) + total count.
-- Table name is validated against the catalog and quoted with %I; limit and
-- offset are sanitised integers — safe against SQL injection.
CREATE OR REPLACE FUNCTION records_page(
  p_table  text,
  p_limit  int DEFAULT 100,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_schema text := current_schema();
  v_pk     text;
  v_total  bigint;
  v_rows   jsonb;
  v_lim    int := least(greatest(coalesce(p_limit, 100), 1), 5000);
  v_off    int := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = v_schema AND table_name = p_table AND table_type = 'BASE TABLE'
  ) THEN
    RAISE EXCEPTION 'Unknown table: %', p_table USING ERRCODE = '42P01';
  END IF;

  -- Order by the identity column when present, else the first column.
  SELECT column_name INTO v_pk
  FROM information_schema.columns
  WHERE table_schema = v_schema AND table_name = p_table AND is_identity = 'YES'
  ORDER BY ordinal_position LIMIT 1;
  IF v_pk IS NULL THEN
    SELECT column_name INTO v_pk
    FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = p_table
    ORDER BY ordinal_position LIMIT 1;
  END IF;

  EXECUTE format('SELECT count(*) FROM %I.%I', v_schema, p_table) INTO v_total;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(t.*)), ''[]''::jsonb) FROM '
    || '(SELECT * FROM %I.%I ORDER BY %I DESC LIMIT %s OFFSET %s) t',
    v_schema, p_table, v_pk, v_lim, v_off
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'limit', v_lim, 'offset', v_off);
END;
$$;

-- ── Scale indexes (idempotent) ────────────────────────────────
-- Exam result lookup / bulk map: latest attempt per candidate.
CREATE INDEX IF NOT EXISTS idx_exam_attempts_candidate
  ON exam_attempts (candidate_no, submitted_at DESC, attempt_id DESC);
-- Training-assignment grouping + bulk map.
CREATE INDEX IF NOT EXISTS idx_applicant_training_candidate
  ON applicant_training (candidate_no);
CREATE INDEX IF NOT EXISTS idx_applicant_training_training
  ON applicant_training (training_id);
-- Attendance sheet lookups.
CREATE INDEX IF NOT EXISTS idx_attendance_candidate
  ON attendance (candidate_no);
CREATE INDEX IF NOT EXISTS idx_attendance_training_date
  ON attendance (training_id, attendance_date);
