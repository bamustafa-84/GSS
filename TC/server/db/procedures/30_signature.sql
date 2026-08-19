-- ================================================================
-- GSS · Signature panel procedures
-- ----------------------------------------------------------------
-- Naming convention: <PanelName>_<Transaction>
--   Signature_Search / Signature_Insert / Signature_Image
-- The heavy `signature_image` bytea is never returned by search.
-- ================================================================

-- Signature_Search: search across every signature column except the
-- binary image. Empty search returns the newest rows. Incremental
-- loading via p_limit / p_offset (default first 10).
CREATE OR REPLACE FUNCTION signature_search(
  p_search text DEFAULT '',
  p_limit  int  DEFAULT 10,
  p_offset int  DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(t.row ORDER BY t.signature_id DESC), '[]'::jsonb)
  FROM (
    SELECT s.signature_id, (to_jsonb(s.*) - 'signature_image') AS row
    FROM signature s
    WHERE coalesce(p_search, '') = ''
       OR (to_jsonb(s.*) - 'signature_image')::text ILIKE '%' || p_search || '%'
    ORDER BY s.signature_id DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  ) t;
$$;

-- Signature_Insert: create a signature row from a JSON payload
-- (image passed as a \x-hex string). The image is stripped from the
-- returned row.
CREATE OR REPLACE FUNCTION signature_insert(p_data jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT dynamic_crud('insert', 'signature', p_data, '{}'::jsonb) - 'signature_image';
$$;

-- Signature_Image: return one signature's bytes (hex) + content type
-- so the application can stream the image back to the browser.
CREATE OR REPLACE FUNCTION signature_image(p_id int)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
           'content_type', s.content_type,
           'image_hex', encode(s.signature_image, 'hex')
         )
  FROM signature s
  WHERE s.signature_id = p_id;
$$;

-- Signature_HasOfficer: whether a Training Officer has already been designated.
CREATE OR REPLACE FUNCTION signature_has_officer()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM signature WHERE is_training_officer IS TRUE);
$$;

-- Signature_Officer: the current Training Officer signature (without image bytes).
CREATE OR REPLACE FUNCTION signature_officer()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT (to_jsonb(s.*) - 'signature_image')
  FROM signature s
  WHERE s.is_training_officer IS TRUE
  ORDER BY s.signature_id DESC
  LIMIT 1;
$$;
-- Signature_FindByContact: the most recent signature whose contact_name
-- matches the supplied name (case-insensitive). Used to auto-populate the
-- instructor signature on the Exam panel from the selected trainer.
CREATE OR REPLACE FUNCTION signature_find_by_contact(p_contact_name text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT (to_jsonb(s.*) - 'signature_image')
  FROM signature s
  WHERE coalesce(p_contact_name, '') <> ''
    AND coalesce(s.contact_name, '') ILIKE p_contact_name
  ORDER BY s.signature_id DESC
  LIMIT 1;
$$;
-- Signature_Delete: remove a signature by id. Any applicant rows that
-- reference it keep their data but lose the (now-deleted) foreign key.
-- Returns TRUE when a row was actually deleted.
CREATE OR REPLACE FUNCTION signature_delete(p_id int)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  -- Null out any applicant references first (columns may or may not exist).
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'applicant' AND column_name = 'applicant_signature_id') THEN
    EXECUTE 'UPDATE applicant SET applicant_signature_id = NULL WHERE applicant_signature_id = $1' USING p_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'applicant' AND column_name = 'officer_signature_id') THEN
    EXECUTE 'UPDATE applicant SET officer_signature_id = NULL WHERE officer_signature_id = $1' USING p_id;
  END IF;
  DELETE FROM signature WHERE signature_id = p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;