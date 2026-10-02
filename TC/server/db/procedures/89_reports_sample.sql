-- ================================================================
-- GSS · Training Register report — sample data seed
-- ----------------------------------------------------------------
-- Idempotent seed that provides realistic test data for the
-- Training Register report: the five official training courses,
-- multiple sessions per course (past / current / future so every
-- status is represented), and a pool of sample candidates assigned
-- at varying attendance levels (varied recommended / non-recommended
-- outcomes). Safe to re-run on every server start.
-- ================================================================

DO $$
DECLARE
  -- Official courses stored as "CODE - Description" (see 47_training_title_codes.sql).
  v_courses   text[] := ARRAY[
                  'FIAS - Initial Security Agent Training',
                  'FRAS - Security Agent Refresher Training',
                  'FCP - Post Chief Training',
                  'FSUP - Supervisor Training',
                  'FINSP - Inspector Training'
                ];
  v_courses_fr text[] := ARRAY[
                  'FIAS - Formation Initiale Agent de Sécurité',
                  'FRAS - Formation de Recyclage Agent de Sécurité',
                  'FCP - Formation Chef de Poste',
                  'FSUP - Formation Superviseur',
                  'FINSP - Formation Inspecteur'
                ];
  v_trainers  text[] := ARRAY[
                  'Bilal Mustafa', 'Omar Farouk', 'Sara Kone',
                  'Nadia Salem', 'Karim Toure', 'Awa Diallo'
                ];
  -- Session windows relative to today (days) → drives derived status.
  v_from_off  int[]  := ARRAY[-75, -45, -7, 10, 40];
  v_to_off    int[]  := ARRAY[-60, -30,  7, 25, 70];
  v_start     time[] := ARRAY['08:00'::time, '09:00'::time, '08:30'::time, '08:00'::time, '09:00'::time];
  v_end       time[] := ARRAY['16:00'::time, '17:00'::time, '16:30'::time, '16:00'::time, '17:00'::time];
  v_decisions text[] := ARRAY['recommended', 'recommended', 'recommended', 'not-recommended', 'waiting'];
  -- Distinct session count per course so the "Top 5 Most-Taken Courses" cards
  -- compare meaningfully (aligned with v_courses order). Sessions beyond the
  -- five window templates above cycle the templates shifted further back.
  v_sessions  int[]  := ARRAY[9, 8, 7, 6, 5];

  v_cands     integer[];
  v_i         int;
  v_ci        int;
  v_si        int;
  v_count     int;
  v_n         int;
  v_k         int;
  v_tid       integer;
  v_fromts    timestamp;
  v_tots      timestamp;
  v_trainer   text;
  v_have      int;
  v_want      int;
  v_tpl       int;
  v_shift     int;
  v_tplcount  int := array_length(ARRAY[-75, -45, -7, 10, 40], 1);
BEGIN
  -- 1) Register the five official course titles in the dictionary so they
  --    surface in the Training Title selects.
  FOR v_ci IN 1 .. array_length(v_courses, 1) LOOP
    INSERT INTO dictionary (category, fr_title, en_title, created_by, updated_by, updated_at)
    SELECT 'training_title', v_courses_fr[v_ci], v_courses[v_ci], 'System', 'System', CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1 FROM dictionary WHERE category = 'training_title' AND en_title = v_courses[v_ci]
    );
  END LOOP;

  -- 2) Seed a pool of sample candidates once (tagged created_by = 'REPORT_SEED'),
  --    with a varied eval_final_decision so recommended / non-recommended KPIs
  --    are meaningful.
  IF NOT EXISTS (SELECT 1 FROM applicant WHERE created_by = 'REPORT_SEED') THEN
    FOR v_i IN 1 .. 40 LOOP
      INSERT INTO applicant (
        full_name, phone_1, father_name, mother_name,
        date_of_birth, nationality, place_of_birth, gender, marital_status,
        full_address, is_french_literate, has_security_experience,
        has_health_issues, has_id_or_passport_copy, ispaid, applicant_name,
        interview_result, eval_final_decision, created_by
      )
      VALUES (
        'Sample Candidate ' || lpad(v_i::text, 2, '0'),
        '07' || lpad(v_i::text, 8, '0'),
        'Father ' || v_i, 'Mother ' || v_i,
        DATE '1995-01-01' + (v_i * 37),
        'Ivorian', 'Abidjan',
        CASE WHEN v_i % 2 = 0 THEN 'Male' ELSE 'Female' END,
        'Single',
        'Sample address ' || v_i || ', Abidjan',
        true, false, false, true, true,
        'Sample Candidate ' || lpad(v_i::text, 2, '0'),
        'accepted',
        v_decisions[1 + (v_i % array_length(v_decisions, 1))],
        'REPORT_SEED'
      );
    END LOOP;
  END IF;

  SELECT array_agg(candidate_no ORDER BY candidate_no)
    INTO v_cands
    FROM applicant
   WHERE created_by = 'REPORT_SEED';

  IF v_cands IS NULL OR array_length(v_cands, 1) IS NULL THEN
    RAISE NOTICE 'No sample candidates available; skipping session seed.';
    RETURN;
  END IF;

  -- 3) Create the sessions per course. Each course is topped up to its target
  --    count (v_sessions), so the seed is idempotent AND self-healing when the
  --    target distribution changes: existing sessions are kept, only the
  --    missing ones are added. A varying slice of sample candidates is then
  --    assigned to each new session.
  FOR v_ci IN 1 .. array_length(v_courses, 1) LOOP
    SELECT count(*) INTO v_have FROM training WHERE title = v_courses[v_ci];
    v_want := v_sessions[v_ci];

    FOR v_si IN 1 .. v_want LOOP
      -- Skip sessions that already exist for this course (top-up only).
      CONTINUE WHEN v_si <= v_have;

      -- Cycle the five window templates; each extra cycle is shifted ~12 weeks
      -- further into the past so dates never collide and statuses stay varied.
      v_tpl   := 1 + ((v_si - 1) % v_tplcount);
      v_shift := ((v_si - 1) / v_tplcount) * 84;
      v_trainer := v_trainers[1 + ((v_ci + v_si) % array_length(v_trainers, 1))];
      v_fromts  := (CURRENT_DATE + v_from_off[v_tpl] - v_shift)::timestamp + v_start[v_tpl];
      v_tots    := (CURRENT_DATE + v_to_off[v_tpl]   - v_shift)::timestamp + v_end[v_tpl];

      INSERT INTO training (title, trainer, "from", "to")
      VALUES (v_courses[v_ci], v_trainer, v_fromts, v_tots)
      RETURNING training_id INTO v_tid;

      -- Varied attendance level per session (3 .. ~36), capped to pool size.
      v_count := 3 + ((v_ci * 7 + v_si * 5) % 33);
      v_n := least(v_count, array_length(v_cands, 1));

      FOR v_k IN 1 .. v_n LOOP
        INSERT INTO applicant_training (candidate_no, training_id, assigned_at, created_by, updated_by)
        VALUES (v_cands[v_k], v_tid, CURRENT_TIMESTAMP, 1, 1)
        ON CONFLICT (candidate_no, training_id) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Training Register sample sessions ensured (targets: %).', v_sessions;
END $$;
