-- ================================================================
-- GSS · Candidate Details report — data procedure
-- ----------------------------------------------------------------
-- Returns one row per candidate enrolled in a training session, joining
-- the applicant record with its measurements/emergency-contact row and the
-- owning training session. Shaped for the Candidate Details report grid
-- (reports/candidate-details).
--   p_training_id NULL → every candidate across every training session.
--   p_training_id set  → only that session's candidates.
-- Idempotent: safe to re-run on every server start.
-- ================================================================

CREATE OR REPLACE FUNCTION candidate_details_report(p_training_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(s.row ORDER BY s.sort_from DESC NULLS LAST, s.tid, s.cno), '[]'::jsonb)
  FROM (
    SELECT
      tr."from" AS sort_from,
      t.training_id AS tid,
      a.candidate_no AS cno,
      jsonb_build_object(
        'candidate_no',                 a.candidate_no,
        'full_name',                    a.full_name,
        'father_name',                  a.father_name,
        'mother_name',                  a.mother_name,
        'marital_status',               a.marital_status,
        'nationality',                  a.nationality,
        'place_of_birth',               a.place_of_birth,
        'date_of_birth',                a.date_of_birth,
        'gender',                       a.gender,
        'height_cm',                    m.height_cm,
        'shoe_size',                    m.shoe_size,
        'weight_kg',                    m.weight_kg,
        'shirt_size',                   m.shirt_size,
        'trouser_size',                 m.trouser_size,
        'jacket_size',                  m.jacket_size,
        'blood_group',                  m.blood_group,
        'known_allergies',              m.known_allergies,
        'special_medical_observations', m.special_medical_observations,
        'has_health_issues',            a.has_health_issues,
        'health_issues_details',        a.health_issues_details,
        'full_address',                 a.full_address,
        'phone_1',                      a.phone_1,
        'phone_2',                      a.phone_2,
        'emergency_name',               m.full_name,
        'emergency_relationship',       m.relationship,
        'emergency_phone',              m.phone_number,
        'emergency_address',            m.address,
        'education_level',              a.education_level,
        'is_french_literate',           a.is_french_literate,
        'has_security_experience',      a.has_security_experience,
        'security_experience_details',  a.security_experience_details,
        'ispaid',                       a.ispaid,
        'registration_date',            a.registration_date,
        'training_id',                  t.training_id,
        'training_title',               tr.title,
        'trainer',                      tr.trainer,
        'date_from',                    tr."from",
        'date_to',                      tr."to"
      ) AS row
    FROM applicant_training t
    JOIN applicant a   ON a.candidate_no = t.candidate_no
    JOIN training tr   ON tr.training_id = t.training_id
    LEFT JOIN measurements m ON m.candidate_no = a.candidate_no
    WHERE p_training_id IS NULL OR t.training_id = p_training_id
  ) s;
$$;
