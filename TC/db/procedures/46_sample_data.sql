-- ================================================================
-- GSS · Sample data seed for attendance / exam testing
-- ----------------------------------------------------------------
-- Idempotent seed that assigns a representative set of existing
-- applicants to the default Safety Training course and creates
-- realistic attendance records across several months.
-- Safe to re-run on every server start.
-- ================================================================

-- ================================================================
-- GSS · Sample data seed for attendance / exam testing
-- ----------------------------------------------------------------
-- Seeds a clean, PROFESSIONAL monthly training dataset. Every demo
-- course spans one FULL calendar month (the previous month, e.g.
-- 01/09/2026 -> 30/09/2026) and is populated with realistic, per-
-- student attendance profiles.
--
-- On every run it REMOVES the existing attendance rows for the
-- seeded demo courses and INSERTS a fresh month, so the Attendance
-- Sheet always shows a complete, consistent set of records.
-- Safe to re-run on every server start.
-- ================================================================

DO $$
DECLARE
  v_tid       integer;
  v_tids      integer[] := ARRAY[]::integer[];
  v_cands     integer[] := ARRAY[25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
  -- One behaviour profile per candidate (parallel to v_cands).
  v_profiles  text[]    := ARRAY[
    'perfect', 'perfect', 'good', 'good', 'late',
    'late', 'expelled', 'absent', 'mixed', 'mixed'
  ];
  v_mix       text[]    := ARRAY['AH', 'AH', 'AR', 'AH', 'ABS', 'AH', 'AH', 'AR', 'AH', 'AH'];
  v_cand      integer;
  v_idx       integer;
  v_profile   text;
  v_date      date;
  v_dom       integer;
  v_dow       integer;
  v_status    text;
  v_arrival   time;
  v_depart    time;
  v_obs       text;
  v_late_min  integer;
  v_instr     text;
  v_title     text;
  -- Full previous calendar month window.
  v_from      date := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date;
  v_to        date := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date;
BEGIN
  -- Target trainings to seed. Attendance is only visible to an instructor whose
  -- name matches a course's trainer, so we seed one dedicated demo course per
  -- Instructor account (unique title → no cross-instructor data bleed) in
  -- addition to the default 'Safety Training' course used by privileged roles.

  -- ── Build the list of demo trainings (all made MONTHLY) ──────────
  -- Attendance is only visible to an instructor whose name matches a
  -- course's trainer, so we seed one dedicated demo course per
  -- Instructor account in addition to the default 'System' courses.

  -- 1) Default Safety Training (trainer 'System') — Admin / Head of Training.
  SELECT training_id INTO v_tid FROM training WHERE title = 'Safety Training'
  ORDER BY training_id DESC LIMIT 1;
  IF v_tid IS NULL THEN
    INSERT INTO training (title, trainer, "from", "to")
    VALUES ('Safety Training', 'System', v_from + TIME '08:00', v_to + TIME '16:00')
    RETURNING training_id INTO v_tid;
  END IF;
  v_tids := array_append(v_tids, v_tid);

  -- 2) A dedicated monthly compliance course (trainer 'System').
  v_title := 'Monthly Compliance Program';
  SELECT training_id INTO v_tid FROM training WHERE title = v_title
  ORDER BY training_id DESC LIMIT 1;
  IF v_tid IS NULL THEN
    INSERT INTO training (title, trainer, "from", "to")
    VALUES (v_title, 'System', v_from + TIME '08:00', v_to + TIME '16:00')
    RETURNING training_id INTO v_tid;
  END IF;
  INSERT INTO dictionary (category, fr_title, en_title, created_by, updated_by, updated_at)
  SELECT 'training_title', v_title, v_title, 'System', 'System', CURRENT_TIMESTAMP
  WHERE NOT EXISTS (
    SELECT 1 FROM dictionary WHERE category = 'training_title' AND en_title = v_title
  );
  v_tids := array_append(v_tids, v_tid);

  -- 3) One monthly demo course per Instructor account (trainer = instructor).
  FOR v_instr IN
    SELECT DISTINCT full_name FROM login
    WHERE role = 'Instructor' AND coalesce(trim(full_name), '') <> ''
  LOOP
    v_title := 'Safety Training (' || v_instr || ')';

    SELECT training_id INTO v_tid
    FROM training WHERE title = v_title AND trainer = v_instr
    ORDER BY training_id DESC LIMIT 1;

    IF v_tid IS NULL THEN
      INSERT INTO training (title, trainer, "from", "to")
      VALUES (v_title, v_instr, v_from + TIME '08:00', v_to + TIME '16:00')
      RETURNING training_id INTO v_tid;
    END IF;

    -- Surface the title in the Training Title dictionary (used by selects).
    INSERT INTO dictionary (category, fr_title, en_title, created_by, updated_by, updated_at)
    SELECT 'training_title', v_title, v_title, 'System', 'System', CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1 FROM dictionary WHERE category = 'training_title' AND en_title = v_title
    );

    v_tids := array_append(v_tids, v_tid);
  END LOOP;

  IF array_length(v_tids, 1) IS NULL THEN
    RAISE NOTICE 'No trainings found; skipping sample data seed.';
    RETURN;
  END IF;

  -- Normalise every demo course to the SAME full-month window.
  UPDATE training SET "from" = v_from + TIME '08:00', "to" = v_to + TIME '16:00'
  WHERE training_id = ANY (v_tids);

  -- ── Reseed attendance for every demo training ───────────────────
  FOREACH v_tid IN ARRAY v_tids
  LOOP
    -- Remove existing demo attendance so each run starts from a clean month.
    DELETE FROM attendance WHERE training_id = v_tid;

    -- Ensure the sample candidates are assigned to this training.
    FOREACH v_cand IN ARRAY v_cands
    LOOP
      IF EXISTS (SELECT 1 FROM applicant WHERE candidate_no = v_cand) THEN
        INSERT INTO applicant_training (candidate_no, training_id, assigned_at, created_by, updated_by)
        VALUES (v_cand, v_tid, v_from + TIME '08:00', 1, 1)
        ON CONFLICT (candidate_no, training_id) DO NOTHING;
      END IF;
    END LOOP;

    -- Weekday attendance across the FULL month, per student profile.
    FOR v_date IN
      SELECT d::date FROM generate_series(v_from, v_to, INTERVAL '1 day') AS d
    LOOP
      CONTINUE WHEN EXTRACT(DOW FROM v_date) IN (0, 6);  -- skip weekends
      v_dom := EXTRACT(DAY FROM v_date)::int;
      v_dow := EXTRACT(DOW FROM v_date)::int;            -- 1 = Monday

      FOREACH v_cand IN ARRAY v_cands
      LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM applicant WHERE candidate_no = v_cand);

        v_idx     := array_position(v_cands, v_cand);
        v_profile := v_profiles[v_idx];

        -- Deterministic, realistic status derived from the student profile.
        v_status := CASE v_profile
          WHEN 'perfect' THEN 'AH'
          WHEN 'good'    THEN CASE WHEN v_dom = 15 THEN 'AR' ELSE 'AH' END
          WHEN 'late'    THEN CASE WHEN v_dow = 1 OR v_dom = 23 THEN 'AR' ELSE 'AH' END
          WHEN 'expelled' THEN CASE WHEN v_date >= v_from + 14 THEN 'EX' ELSE 'AH' END
          WHEN 'absent'  THEN CASE WHEN v_dom IN (4, 18) THEN 'ABS'
                                   WHEN v_dom = 11 THEN 'AR' ELSE 'AH' END
          ELSE v_mix[1 + (v_dom % array_length(v_mix, 1))]
        END;

        v_arrival  := NULL;
        v_depart   := NULL;
        v_obs      := NULL;
        v_late_min := 0;

        IF v_status = 'AH' THEN
          -- Arrive a few minutes early, leave on schedule.
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
  END LOOP;

  RAISE NOTICE 'Monthly sample attendance seeded for % training(s): % -> %.',
    array_length(v_tids, 1), v_from, v_to;
END $$;
