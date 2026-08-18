-- ================================================================
-- GSS · Catalog helper functions
-- ----------------------------------------------------------------
-- Small stored functions the application calls instead of running
-- information_schema queries directly.
-- ================================================================

-- Does a base table with this name exist in the current schema?
CREATE OR REPLACE FUNCTION app_table_exists(p_table text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = p_table
      AND table_type = 'BASE TABLE'
  );
$$;

-- Ordered column metadata for a table as a JSON array of
-- { name, data_type, is_identity, is_generated }.
CREATE OR REPLACE FUNCTION app_table_columns(p_table text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', column_name,
        'data_type', data_type,
        'is_identity', is_identity,
        'is_generated', is_generated
      ) ORDER BY ordinal_position
    ),
    '[]'::jsonb
  )
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = p_table;
$$;
