-- ================================================================
-- GSS · Dictionary (reference values) generic CRUD engine
-- ----------------------------------------------------------------
-- The `dictionary` table holds bilingual selectable values for many
-- categories (education level, …):
--   dictionary_id (identity), category, fr_title, en_title,
--   created_by, created_at, updated_by, updated_at
--
-- One generic stored function performs list/insert/update/delete for
-- ANY category, so the same procedure powers every dictionary-backed
-- dropdown. Values are read from a JSONB payload (never string-
-- concatenated) → safe against SQL injection and reusable as-is.
--
-- The table is created only when absent (fresh databases); existing
-- installations keep their data untouched.
-- ================================================================

CREATE TABLE IF NOT EXISTS dictionary (
  dictionary_id serial PRIMARY KEY,
  category      varchar(50)  NOT NULL,
  fr_title      varchar(200) NOT NULL,
  en_title      varchar(200) NOT NULL,
  created_by    varchar(100),
  created_at    timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by    varchar(100),
  updated_at    timestamp
);

CREATE INDEX IF NOT EXISTS dictionary_category_idx ON dictionary (category);

-- Safety net: ensure both bilingual columns exist (no-op when present).
ALTER TABLE dictionary ADD COLUMN IF NOT EXISTS fr_title varchar(200);
ALTER TABLE dictionary ADD COLUMN IF NOT EXISTS en_title varchar(200);

-- ----------------------------------------------------------------
-- Dictionary_CRUD: generic, category-agnostic reference-data engine.
--   action 'list'   → jsonb array of { dict_id, category, fr_title, en_title, label, code }
--   action 'insert' → inserts { category?, fr_title, en_title } (both required)
--   action 'update' → updates the row p_id from { fr_title, en_title }
--   action 'delete' → removes the row p_id, returns boolean
-- `label`/`code` mirror the English value (a stable, language-independent
-- key stored in the applicant record); the front-end chooses which of
-- fr_title / en_title to display based on the active language.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION dictionary_crud(
  p_action   text,
  p_category text  DEFAULT NULL,
  p_data     jsonb DEFAULT '{}'::jsonb,
  p_id       int   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
  v_cat    text;
  v_fr     text;
  v_en     text;
BEGIN
  p_action := lower(coalesce(p_action, ''));

  IF p_action = 'list' THEN
    SELECT coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'dict_id',  d.dictionary_id,
                 'category', d.category,
                 'fr_title', d.fr_title,
                 'en_title', d.en_title,
                 'label',    d.en_title,
                 'code',     d.en_title
               ) ORDER BY lower(d.en_title)
             ),
             '[]'::jsonb
           )
    INTO v_result
    FROM dictionary d
    WHERE p_category IS NULL OR d.category = p_category;
    RETURN v_result;

  ELSIF p_action = 'insert' THEN
    v_cat := coalesce(nullif(trim(p_data->>'category'), ''), p_category);
    v_fr  := nullif(trim(p_data->>'fr_title'), '');
    v_en  := nullif(trim(p_data->>'en_title'), '');
    IF v_cat IS NULL OR v_fr IS NULL OR v_en IS NULL THEN
      RAISE EXCEPTION 'category, fr_title and en_title are required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO dictionary (category, fr_title, en_title, created_by, updated_by, updated_at)
    VALUES (v_cat, v_fr, v_en, 'System', 'System', CURRENT_TIMESTAMP)
    RETURNING jsonb_build_object(
      'dict_id', dictionary_id, 'category', category,
      'fr_title', fr_title, 'en_title', en_title, 'label', en_title, 'code', en_title
    ) INTO v_result;
    RETURN v_result;

  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN
      RAISE EXCEPTION 'id is required for update' USING ERRCODE = '22023';
    END IF;
    UPDATE dictionary SET
      category   = coalesce(nullif(trim(p_data->>'category'), ''), category),
      fr_title   = coalesce(nullif(trim(p_data->>'fr_title'), ''), fr_title),
      en_title   = coalesce(nullif(trim(p_data->>'en_title'), ''), en_title),
      updated_by = 'System',
      updated_at = CURRENT_TIMESTAMP
    WHERE dictionary_id = p_id
    RETURNING jsonb_build_object(
      'dict_id', dictionary_id, 'category', category,
      'fr_title', fr_title, 'en_title', en_title, 'label', en_title, 'code', en_title
    ) INTO v_result;
    RETURN coalesce(v_result, 'null'::jsonb);

  ELSIF p_action = 'delete' THEN
    IF p_id IS NULL THEN
      RAISE EXCEPTION 'id is required for delete' USING ERRCODE = '22023';
    END IF;
    DELETE FROM dictionary WHERE dictionary_id = p_id;
    RETURN to_jsonb(FOUND);
  END IF;

  RAISE EXCEPTION 'Unsupported dictionary action: %', p_action USING ERRCODE = '22023';
END;
$$;
