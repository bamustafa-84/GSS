-- ================================================================
-- GSS · Exam sample-data seeder
-- ----------------------------------------------------------------
-- Populates one exam template per training with a DEDICATED set of
-- security-scenario questions covering every supported question type:
--   MULTIPLE_CHOICE, TRUE_FALSE, MATCH_ITEMS,
--   CHRONOLOGICAL_ORDERING, DEFINITION, ANALYTICAL
--
-- Each training gets its own theme so questions never overlap between
-- trainings. Idempotent: a training that already has an exam is skipped,
-- so re-running on server start will not duplicate or clobber edits.
-- ================================================================

CREATE OR REPLACE FUNCTION exam_seed_samples()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_themes text[] := ARRAY[
    'Securing a Retail Store',
    'Securing a Construction Site',
    'Securing a Supermarket',
    'Securing a Pharmacy',
    'Securing an Office Building',
    'Access Control & Visitor Management'
  ];
  v_tr   record;
  v_idx  int := 0;
  v_theme text;
  v_seeded int := 0;
BEGIN
  FOR v_tr IN SELECT training_id, title FROM training ORDER BY training_id
  LOOP
    v_idx := v_idx + 1;
    -- Skip trainings that already have an exam (keep admin edits).
    CONTINUE WHEN EXISTS (SELECT 1 FROM exams WHERE training_id = v_tr.training_id);

    v_theme := v_themes[((v_idx - 1) % array_length(v_themes, 1)) + 1];

    PERFORM exam_upsert(jsonb_build_object(
      'training_id', v_tr.training_id,
      'exam_title', v_tr.title || ' · ' || v_theme,
      'duration_minutes', 30,
      'passing_score', 12,
      'questions', jsonb_build_array(

        -- 1) MULTIPLE_CHOICE
        jsonb_build_object(
          'question_text', 'While guarding this site (' || v_theme || '), you notice an unattended bag near the main entrance. What is the correct FIRST action?',
          'question_type', 'MULTIPLE_CHOICE', 'points', 5,
          'answers', jsonb_build_array(
            jsonb_build_object('answer_key','A','answer_text','Open the bag to inspect the contents yourself','is_correct',false),
            jsonb_build_object('answer_key','B','answer_text','Cordon off the area, keep people away and alert your supervisor','is_correct',true),
            jsonb_build_object('answer_key','C','answer_text','Ignore it; unattended bags are common','is_correct',false),
            jsonb_build_object('answer_key','D','answer_text','Move the bag to the lost-and-found room','is_correct',false)
          )
        ),

        -- 2) TRUE_FALSE
        jsonb_build_object(
          'question_text', 'A security guard at ' || v_theme || ' is permitted to physically detain any person they merely suspect of shoplifting, without any evidence.',
          'question_type', 'TRUE_FALSE', 'points', 3,
          'answers', jsonb_build_array(
            jsonb_build_object('answer_key','T','answer_text','True','is_correct',false),
            jsonb_build_object('answer_key','F','answer_text','False','is_correct',true)
          )
        ),

        -- 3) MATCH_ITEMS
        jsonb_build_object(
          'question_text', 'Match each security situation at ' || v_theme || ' with the correct response.',
          'question_type', 'MATCH_ITEMS', 'points', 4,
          'answers', jsonb_build_array(
            jsonb_build_object('match_key','Fire alarm activates','match_value','Begin evacuation procedure'),
            jsonb_build_object('match_key','Medical emergency','match_value','Call for first aid / ambulance'),
            jsonb_build_object('match_key','Suspicious intruder','match_value','Observe, report and alert supervisor'),
            jsonb_build_object('match_key','Power outage','match_value','Deploy backup lighting and secure exits')
          )
        ),

        -- 4) CHRONOLOGICAL_ORDERING
        jsonb_build_object(
          'question_text', 'Put the incident-response steps for ' || v_theme || ' in the correct order (first to last).',
          'question_type', 'CHRONOLOGICAL_ORDERING', 'points', 4,
          'answers', jsonb_build_array(
            jsonb_build_object('answer_text','Assess the situation and ensure personal safety','display_order',1),
            jsonb_build_object('answer_text','Contain the incident and protect people','display_order',2),
            jsonb_build_object('answer_text','Notify supervisor and relevant authorities','display_order',3),
            jsonb_build_object('answer_text','Document the incident in the log book','display_order',4)
          )
        ),

        -- 5) DEFINITION (manual grade)
        jsonb_build_object(
          'question_text', 'Define "access control" in the context of ' || v_theme || ' and give one example of how you would apply it on shift.',
          'question_type', 'DEFINITION', 'points', 5,
          'answers', '[]'::jsonb
        ),

        -- 6) ANALYTICAL (manual grade)
        jsonb_build_object(
          'question_text', 'You are the only guard on duty at ' || v_theme || ' when two separate incidents happen at once: a theft in progress and a visitor who has collapsed. Explain how you would prioritise and handle both.',
          'question_type', 'ANALYTICAL', 'points', 6,
          'answers', '[]'::jsonb
        )
      )
    ));

    v_seeded := v_seeded + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'seeded', v_seeded);
END;
$$;

-- Run the seeder now (idempotent).
SELECT exam_seed_samples();