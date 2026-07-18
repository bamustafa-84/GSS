-- ================================================================
-- GSS · Generic dynamic CRUD stored function (engine)
-- ----------------------------------------------------------------
-- A single, table-agnostic PL/pgSQL function that performs INSERT,
-- SELECT, UPDATE and DELETE from a JSONB payload. All SQL is built
-- and executed inside the database (not the application):
--   • Table + column names validated against information_schema and
--     safely interpolated with format() %I (quote_ident).
--   • Values passed as JSONB and materialised through
--     jsonb_populate_record(NULL::table, payload), so PostgreSQL casts
--     each value to the real column type (no string concatenation of
--     user data → safe against SQL injection).
-- Named panel procedures below build on this engine.
-- ================================================================

CREATE OR REPLACE FUNCTION dynamic_crud(
  p_action  text,
  p_table   text,
  p_data    jsonb DEFAULT '{}'::jsonb,
  p_filters jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_schema text := current_schema();
  v_pk     text;
  v_cols   text;
  v_set    text;
  v_where  text;
  v_where_upd text;
  v_sql    text;
  v_result jsonb;
BEGIN
  -- 1. Validate the action.
  p_action := lower(coalesce(p_action, ''));
  IF p_action NOT IN ('insert', 'select', 'update', 'delete') THEN
    RAISE EXCEPTION 'Unsupported action: %', p_action USING ERRCODE = '22023';
  END IF;

  -- 2. Validate the target table exists in the current schema.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = v_schema
      AND table_name = p_table
      AND table_type = 'BASE TABLE'
  ) THEN
    RAISE EXCEPTION 'Unknown table: %', p_table USING ERRCODE = '42P01';
  END IF;

  -- 3. Resolve the identity column (fallback: first column) for ordering / keys.
  SELECT column_name INTO v_pk
  FROM information_schema.columns
  WHERE table_schema = v_schema AND table_name = p_table AND is_identity = 'YES'
  ORDER BY ordinal_position
  LIMIT 1;
  IF v_pk IS NULL THEN
    SELECT column_name INTO v_pk
    FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = p_table
    ORDER BY ordinal_position
    LIMIT 1;
  END IF;

  -- 4. Build a validated equality WHERE from p_filters (real columns only).
  SELECT string_agg(format('%I = %L', f.key, f.value), ' AND ')
  INTO v_where
  FROM jsonb_each_text(coalesce(p_filters, '{}'::jsonb)) AS f
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = v_schema AND c.table_name = p_table AND c.column_name = f.key
  );

  -- Same predicate, qualified with the UPDATE target alias so it is never
  -- ambiguous against the jsonb_populate_record source row.
  SELECT string_agg(format('target.%I = %L', f.key, f.value), ' AND ')
  INTO v_where_upd
  FROM jsonb_each_text(coalesce(p_filters, '{}'::jsonb)) AS f
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = v_schema AND c.table_name = p_table AND c.column_name = f.key
  );

  -- ── SELECT ────────────────────────────────────────────────
  IF p_action = 'select' THEN
    v_sql := format(
      'SELECT coalesce(jsonb_agg(to_jsonb(t.*) ORDER BY t.%I DESC), ''[]''::jsonb) FROM %I.%I AS t %s',
      v_pk, v_schema, p_table,
      CASE WHEN v_where IS NOT NULL THEN 'WHERE ' || v_where ELSE '' END
    );
    EXECUTE v_sql INTO v_result;
    RETURN v_result;
  END IF;

  -- ── INSERT ────────────────────────────────────────────────
  IF p_action = 'insert' THEN
    SELECT string_agg(quote_ident(c.column_name), ', ')
    INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = v_schema AND c.table_name = p_table
      AND c.is_identity = 'NO' AND c.is_generated = 'NEVER'
      AND p_data ? c.column_name;

    IF v_cols IS NULL THEN
      RAISE EXCEPTION 'No valid columns supplied for insert' USING ERRCODE = '22023';
    END IF;

    v_sql := format(
      'INSERT INTO %I.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::%I.%I, $1) RETURNING to_jsonb(%I.*)',
      v_schema, p_table, v_cols, v_cols, v_schema, p_table, p_table
    );
    EXECUTE v_sql INTO v_result USING p_data;
    RETURN v_result;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────
  IF p_action = 'update' THEN
    IF v_where IS NULL THEN
      RAISE EXCEPTION 'Update requires at least one valid filter' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(format('%I = x.%I', c.column_name, c.column_name), ', ')
    INTO v_set
    FROM information_schema.columns c
    WHERE c.table_schema = v_schema AND c.table_name = p_table
      AND c.is_identity = 'NO' AND c.is_generated = 'NEVER'
      AND p_data ? c.column_name;

    IF v_set IS NULL THEN
      RAISE EXCEPTION 'No valid columns supplied for update' USING ERRCODE = '22023';
    END IF;

    v_sql := format(
      'UPDATE %I.%I AS target SET %s FROM jsonb_populate_record(NULL::%I.%I, $1) AS x WHERE %s RETURNING to_jsonb(target.*)',
      v_schema, p_table, v_set, v_schema, p_table, v_where_upd
    );
    EXECUTE v_sql INTO v_result USING p_data;
    RETURN coalesce(v_result, 'null'::jsonb);
  END IF;

  -- ── DELETE ────────────────────────────────────────────────
  IF p_action = 'delete' THEN
    IF v_where IS NULL THEN
      RAISE EXCEPTION 'Delete requires at least one valid filter' USING ERRCODE = '22023';
    END IF;

    v_sql := format(
      'DELETE FROM %I.%I WHERE %s RETURNING to_jsonb(%I.*)',
      v_schema, p_table, v_where, p_table
    );
    EXECUTE v_sql INTO v_result;
    RETURN coalesce(v_result, 'null'::jsonb);
  END IF;

  RETURN NULL;
END;
$$;
