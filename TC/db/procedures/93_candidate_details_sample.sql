-- ================================================================
-- GSS · Candidate Details report — demographic & measurement seed
-- ----------------------------------------------------------------
-- The Training Register seed (89_reports_sample.sql) creates a flat pool of
-- REPORT_SEED candidates (all Ivorian / Single / no measurements). This seed
-- UPDATES those same records with varied demographics and upserts a
-- measurements row for each, so the Candidate Details report KPIs
-- (marital status, nationality, health, education, clothing sizes) show
-- meaningful variation. It never creates duplicate candidates — it only
-- enriches the existing REPORT_SEED rows. Idempotent: safe to re-run.
-- ================================================================

DO $$
DECLARE
  v_marital text[] := ARRAY['Single', 'Married', 'Divorced', 'Widowed'];
  v_nat     text[] := ARRAY['Ivorian', 'Congolese', 'Malian', 'Senegalese', 'Guinean', 'Burkinabe'];
  v_city    text[] := ARRAY['Abidjan', 'Bouaké', 'Yamoussoukro', 'San-Pédro', 'Korhogo', 'Daloa'];
  v_edu     text[] := ARRAY['Primary', 'Secondary', 'High School', 'Diploma', 'University'];
  v_shirt   text[] := ARRAY['S', 'M', 'L', 'XL', 'XXL'];
  v_trouser text[] := ARRAY['38', '40', '42', '44', '46'];
  v_jacket  text[] := ARRAY['S', 'M', 'L', 'XL', 'XXL'];
  v_blood   text[] := ARRAY['A+', 'B+', 'O+', 'AB+', 'O-', 'A-'];
  v_rel     text[] := ARRAY['Spouse', 'Parent', 'Sibling', 'Friend', 'Relative'];
  v_rec     record;
  v_i       int := 0;
BEGIN
  FOR v_rec IN
    SELECT candidate_no FROM applicant WHERE created_by = 'REPORT_SEED' ORDER BY candidate_no
  LOOP
    v_i := v_i + 1;

    UPDATE applicant SET
      marital_status              = v_marital[1 + (v_i % 4)],
      nationality                 = v_nat[1 + (v_i % 6)],
      place_of_birth              = v_city[1 + (v_i % 6)],
      education_level             = v_edu[1 + (v_i % 5)],
      gender                      = CASE WHEN v_i % 3 = 0 THEN 'Female' ELSE 'Male' END,
      is_french_literate          = (v_i % 4 <> 0),
      has_security_experience     = (v_i % 3 = 0),
      security_experience_details = CASE WHEN v_i % 3 = 0 THEN (1 + (v_i % 8))::text || ' years' ELSE NULL END,
      has_health_issues           = (v_i % 5 = 0),
      health_issues_details       = CASE WHEN v_i % 5 = 0 THEN 'Mild asthma — cleared for duty' ELSE NULL END,
      ispaid                      = (v_i % 4 <> 0),
      phone_2                     = '06' || lpad((v_i * 7)::text, 8, '0')
    WHERE candidate_no = v_rec.candidate_no;

    INSERT INTO measurements (
      candidate_no, height_cm, weight_kg, shoe_size, shirt_size, trouser_size,
      jacket_size, blood_group, special_medical_observations,
      full_name, relationship, phone_number, address
    ) VALUES (
      v_rec.candidate_no,
      160 + (v_i % 30),
      55 + (v_i % 35),
      38 + (v_i % 8),
      v_shirt[1 + (v_i % 5)],
      v_trouser[1 + (v_i % 5)],
      v_jacket[1 + (v_i % 5)],
      v_blood[1 + (v_i % 6)],
      CASE WHEN v_i % 5 = 0 THEN 'Requires periodic review' ELSE NULL END,
      'Emergency Contact ' || lpad(v_i::text, 2, '0'),
      v_rel[1 + (v_i % 5)],
      '05' || lpad((v_i * 3)::text, 8, '0'),
      'Emergency address ' || v_i || ', ' || v_city[1 + (v_i % 6)]
    )
    ON CONFLICT (candidate_no) DO UPDATE SET
      height_cm                    = EXCLUDED.height_cm,
      weight_kg                    = EXCLUDED.weight_kg,
      shoe_size                    = EXCLUDED.shoe_size,
      shirt_size                   = EXCLUDED.shirt_size,
      trouser_size                 = EXCLUDED.trouser_size,
      jacket_size                  = EXCLUDED.jacket_size,
      blood_group                  = EXCLUDED.blood_group,
      special_medical_observations = EXCLUDED.special_medical_observations,
      full_name                    = EXCLUDED.full_name,
      relationship                 = EXCLUDED.relationship,
      phone_number                 = EXCLUDED.phone_number,
      address                      = EXCLUDED.address;
  END LOOP;

  RAISE NOTICE 'Candidate Details demographic/measurement seed applied to % candidates.', v_i;
END $$;
