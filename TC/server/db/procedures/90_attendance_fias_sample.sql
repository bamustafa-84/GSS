-- ================================================================
-- GSS · Initial Security Agent Training (FIAS) — attendance sample
-- ----------------------------------------------------------------
-- Ensures the FIAS session that runs
-- 09/11/2026 -> 09/12/2026 is fully populated with realistic daily
-- attendance for its enrolled candidates, so the Attendance Sheet
-- can be tested end-to-end across the whole training period.
--
-- On every run it REMOVES the session's existing attendance and
-- INSERTS a fresh dataset. Runs after 89_reports_sample.sql, which
-- creates the course sessions. Safe to re-run on every server start.
-- ================================================================

DO $$
DECLARE
  v_title    text    := 'FIAS - Initial Security Agent Training';
  v_title_fr text    := 'FIAS - Formation Initiale Agent de Sécurité';
  v_trainer  text    := 'Bilal Mustafa';
  v_from     date    := DATE '2026-11-09';
  v_to       date    := DATE '2026-12-09';
  v_tid      integer;
  v_cands    integer[];
  v_pool     integer[];
  v_cand     integer;
  v_idx      integer;
  v_profile  text;
  v_profiles text[];
  -- Behaviour profile templates, cycled across the enrolled cohort.
  v_proftpl  text[]  := ARRAY['perfect', 'perfect', 'good', 'good', 'late',
                              'late', 'absent', 'expelled', 'mixed', 'mixed'];
  v_mix      text[]  := ARRAY['AH', 'AH', 'AR', 'AH', 'ABS', 'AH', 'AH', 'AR', 'AH', 'AH'];
  v_date     date;
  v_dom      integer;
  v_dow      integer;
  v_status   text;
  v_arrival  time;
  v_depart   time;
  v_obs      text;
  v_late_min integer;
  v_n        integer;
BEGIN
  -- Resolve the FIAS session that starts in
  -- November 2026 (created by the report seed); else create a dedicated one.
  SELECT training_id INTO v_tid
  FROM training
  WHERE title = v_title AND date_trunc('month', "from") = DATE '2026-11-01'
  ORDER BY training_id DESC LIMIT 1;

  IF v_tid IS NULL THEN
    INSERT INTO training (title, trainer, "from", "to")
    VALUES (v_title, v_trainer, v_from + TIME '08:00', v_to + TIME '16:00')
    RETURNING training_id INTO v_tid;
  ELSE
    UPDATE training
    SET "from" = v_from + TIME '08:00', "to" = v_to + TIME '16:00'
    WHERE training_id = v_tid;
  END IF;

  -- Ensure the title is selectable in the Training Title dictionary.
  INSERT INTO dictionary (category, fr_title, en_title, created_by, updated_by, updated_at)
  SELECT 'training_title', v_title_fr, v_title, 'System', 'System', CURRENT_TIMESTAMP
  WHERE NOT EXISTS (
    SELECT 1 FROM dictionary WHERE category = 'training_title' AND en_title = v_title
  );

  -- Roster: the candidates already enrolled in this session.
  SELECT array_agg(candidate_no ORDER BY candidate_no) INTO v_cands
  FROM applicant_training WHERE training_id = v_tid;

  -- If the session has no roster yet, enrol a cohort of sample candidates.
  IF v_cands IS NULL OR array_length(v_cands, 1) IS NULL THEN
    SELECT array_agg(candidate_no) INTO v_pool
    FROM (
      SELECT candidate_no FROM applicant WHERE created_by = 'REPORT_SEED'
      ORDER BY candidate_no LIMIT 18
    ) q;
    IF v_pool IS NULL THEN
      SELECT array_agg(candidate_no) INTO v_pool
      FROM (SELECT candidate_no FROM applicant ORDER BY candidate_no LIMIT 18) q;
    END IF;
    IF v_pool IS NULL THEN
      RAISE NOTICE 'No candidates available; skipping FIAS attendance seed.';
      RETURN;
    END IF;
    FOREACH v_cand IN ARRAY v_pool LOOP
      INSERT INTO applicant_training (candidate_no, training_id, assigned_at, created_by, updated_by)
      VALUES (v_cand, v_tid, v_from + TIME '08:00', 1, 1)
      ON CONFLICT (candidate_no, training_id) DO NOTHING;
    END LOOP;
    SELECT array_agg(candidate_no ORDER BY candidate_no) INTO v_cands
    FROM applicant_training WHERE training_id = v_tid;
  END IF;

  v_n := array_length(v_cands, 1);

  -- Assign one behaviour profile per enrolled candidate (cycled).
  v_profiles := ARRAY[]::text[];
  FOR v_idx IN 1 .. v_n LOOP
    v_profiles := array_append(v_profiles, v_proftpl[1 + ((v_idx - 1) % array_length(v_proftpl, 1))]);
  END LOOP;

  -- Clean slate, then populate weekday attendance across the whole period.
  DELETE FROM attendance WHERE training_id = v_tid;

  FOR v_date IN
    SELECT d::date FROM generate_series(v_from, v_to, INTERVAL '1 day') AS d
  LOOP
    CONTINUE WHEN EXTRACT(DOW FROM v_date) IN (0, 6);  -- weekdays only
    v_dom := EXTRACT(DAY FROM v_date)::int;
    v_dow := EXTRACT(DOW FROM v_date)::int;            -- 1 = Monday

    FOR v_idx IN 1 .. v_n LOOP
      v_cand    := v_cands[v_idx];
      v_profile := v_profiles[v_idx];

      -- Deterministic, realistic status per behaviour profile. 'expelled'
      -- stays AH until the expulsion day, then EX (Permanently Expelled)
      -- for the remainder of the course.
      v_status := CASE v_profile
        WHEN 'perfect'  THEN 'AH'
        WHEN 'good'     THEN CASE WHEN v_dom IN (16, 27) THEN 'AR' ELSE 'AH' END
        WHEN 'late'     THEN CASE WHEN v_dow = 1 THEN 'AR' ELSE 'AH' END
        WHEN 'absent'   THEN CASE WHEN v_dom IN (12, 24) THEN 'ABS'
                                  WHEN v_dom = 17 THEN 'AR' ELSE 'AH' END
        WHEN 'expelled' THEN CASE WHEN v_date >= v_from + 14 THEN 'EX' ELSE 'AH' END
        ELSE v_mix[1 + (v_dom % array_length(v_mix, 1))]
      END;

      v_arrival  := NULL;
      v_depart   := NULL;
      v_obs      := NULL;
      v_late_min := 0;

      IF v_status = 'AH' THEN
        v_arrival := ('07:' || lpad((50 + ((v_cand + v_dom) % 10))::text, 2, '0') || ':00')::time;
        v_depart  := '16:00:00'::time;
      ELSIF v_status = 'AR' THEN
        v_late_min := 6 + ((v_cand * 7 + v_dom) % 25);           -- 6-30 min late
        v_arrival  := ('08:' || lpad(v_late_min::text, 2, '0') || ':00')::time;
        v_depart   := '16:00:00'::time;
        v_obs      := 'Arrived ' || v_late_min || ' min late';
      ELSIF v_status = 'ABS' THEN
        v_obs := CASE WHEN v_dom % 2 = 0 THEN 'Absent — unjustified'
                      ELSE 'Absent — family emergency' END;
      ELSIF v_status = 'EX' THEN
        v_obs := 'Permanently expelled from the training';
      END IF;

      INSERT INTO attendance (candidate_no, training_id, attendance_date, status, arrival_time, departure_time, observations)
      VALUES (v_cand, v_tid, v_date, v_status, v_arrival, v_depart, v_obs);
    END LOOP;
  END LOOP;

  RAISE NOTICE 'FIAS attendance seeded (training_id=%, % candidates, % -> %).',
    v_tid, v_n, v_from, v_to;
END $$;
