-- ================================================================
-- GSS · Measurements panel (Panel-Mensuration) schema + procedures
-- ----------------------------------------------------------------
-- Backing store for the "Measurements and Additional Information
-- Sheet". One row per candidate (candidate_no PK / FK → applicant).
-- Naming convention: <PanelName>_<Transaction>
--   measurements_get / measurements_upsert
-- Idempotent: safe to re-run on every server start.
-- ================================================================

CREATE TABLE IF NOT EXISTS measurements (
    candidate_no                 integer      NOT NULL,
    height_cm                    decimal      NOT NULL,
    weight_kg                    decimal      NOT NULL,
    shoe_size                    integer      NOT NULL,
    shirt_size                   varchar(10)  NOT NULL,
    trouser_size                 varchar(10)  NOT NULL,
    jacket_size                  varchar(10)  NOT NULL,
    blood_group                  varchar(10)  NOT NULL,
    known_allergies              varchar(255),
    special_medical_observations varchar(255),
    full_name                    varchar(100) NOT NULL,
    relationship                 varchar(40)  NOT NULL,
    phone_number                 varchar(30)  NOT NULL,
    address                      varchar(255) NOT NULL,
    observation                  varchar(255),
    ack_mensuration              boolean,

    PRIMARY KEY (candidate_no),
    FOREIGN KEY (candidate_no) REFERENCES applicant(candidate_no)
);

-- measurements_get: return the single measurements row for a candidate as
-- jsonb, or NULL when the candidate has no measurements yet.
CREATE OR REPLACE FUNCTION measurements_get(p_candidate_no integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT to_jsonb(m.*) FROM measurements m WHERE m.candidate_no = p_candidate_no;
$$;

-- measurements_upsert: insert or update the measurements row for a candidate
-- from a jsonb payload. Column types are enforced by jsonb_populate_record and
-- the table's NOT NULL constraints; values are never string-concatenated.
-- Returns { ok, status, measurement } on success or { ok:false, status, error }.
CREATE OR REPLACE FUNCTION measurements_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cand integer := nullif(p_data->>'candidate_no', '')::integer;
  v_who  bigint  := nullif(p_data->>'updated_by', '')::bigint;
  v_row  measurements;
BEGIN
  IF v_cand IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'candidate_no required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM applicant WHERE candidate_no = v_cand) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'error', 'unknown candidate');
  END IF;

  v_row := jsonb_populate_record(NULL::measurements, p_data);

  INSERT INTO measurements AS m (
    candidate_no, height_cm, weight_kg, shoe_size, shirt_size, trouser_size,
    jacket_size, blood_group, known_allergies, special_medical_observations,
    full_name, relationship, phone_number, address, observation, ack_mensuration,
    created_by, updated_by
  ) VALUES (
    v_row.candidate_no, v_row.height_cm, v_row.weight_kg, v_row.shoe_size,
    v_row.shirt_size, v_row.trouser_size, v_row.jacket_size, v_row.blood_group,
    v_row.known_allergies, v_row.special_medical_observations, v_row.full_name,
    v_row.relationship, v_row.phone_number, v_row.address, v_row.observation,
    coalesce(v_row.ack_mensuration, false),
    v_who, v_who
  )
  ON CONFLICT (candidate_no) DO UPDATE SET
    height_cm                    = EXCLUDED.height_cm,
    weight_kg                    = EXCLUDED.weight_kg,
    shoe_size                    = EXCLUDED.shoe_size,
    shirt_size                   = EXCLUDED.shirt_size,
    trouser_size                 = EXCLUDED.trouser_size,
    jacket_size                  = EXCLUDED.jacket_size,
    blood_group                  = EXCLUDED.blood_group,
    known_allergies              = EXCLUDED.known_allergies,
    special_medical_observations = EXCLUDED.special_medical_observations,
    full_name                    = EXCLUDED.full_name,
    relationship                 = EXCLUDED.relationship,
    phone_number                 = EXCLUDED.phone_number,
    address                      = EXCLUDED.address,
    observation                  = EXCLUDED.observation,
    ack_mensuration              = EXCLUDED.ack_mensuration,
    updated_by                   = v_who,
    updated_at                   = CURRENT_TIMESTAMP;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'saved',
    'measurement', (SELECT to_jsonb(m2.*) FROM measurements m2 WHERE m2.candidate_no = v_cand)
  );
END $$;
