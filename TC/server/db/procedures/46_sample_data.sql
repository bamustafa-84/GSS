-- ================================================================
-- GSS · Sample data seed for attendance / exam testing
-- ----------------------------------------------------------------
-- Idempotent seed that assigns a representative set of existing
-- applicants to the default Safety Training course and creates
-- realistic attendance records across several months.
-- Safe to re-run on every server start.
-- ================================================================

DO $$
DECLARE
  v_tid      integer;
  v_tids     integer[] := ARRAY[]::integer[];
  v_cands    integer[] := ARRAY[25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
  v_cand     integer;
  v_date     date;
  v_status   text;
  v_arrival  time;
  v_depart   time;
  v_obs      text;
  v_statuses text[]    := ARRAY['AH', 'AH', 'AH', 'AR', 'AR', 'ABS', 'EX'];
  v_instr    text;
  v_title    text;
BEGIN
  -- Target trainings to seed. Attendance is only visible to an instructor whose
  -- name matches a course's trainer, so we seed one dedicated demo course per
  -- Instructor account (unique title → no cross-instructor data bleed) in
  -- addition to the default 'Safety Training' course used by privileged roles.

  -- 1) Default Safety Training (trainer 'System'), seen by Admin / Head of
  --    Training / Secretary.
  SELECT training_id INTO v_tid FROM training WHERE title = 'Safety Training' ORDER BY training_id DESC LIMIT 1;
  IF v_tid IS NOT NULL THEN
    v_tids := array_append(v_tids, v_tid);
  END IF;

  -- 2) One demo course per Instructor account, with the instructor as trainer.
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
      VALUES (v_title, v_instr, CURRENT_TIMESTAMP - INTERVAL '25 days', CURRENT_TIMESTAMP + INTERVAL '5 days')
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

  -- Seed candidate assignments + attendance for every target training.
  FOREACH v_tid IN ARRAY v_tids
  LOOP
    -- Assign the sample candidates to this training if not already assigned.
    FOREACH v_cand IN ARRAY v_cands
    LOOP
      IF EXISTS (SELECT 1 FROM applicant WHERE candidate_no = v_cand) THEN
        INSERT INTO applicant_training (candidate_no, training_id, assigned_at, created_by, updated_by)
        VALUES (v_cand, v_tid, CURRENT_TIMESTAMP, 1, 1)
        ON CONFLICT (candidate_no, training_id) DO NOTHING;
      END IF;
    END LOOP;

    -- Seed attendance records for the current month and the two preceding months
    -- (up to today), computed relative to CURRENT_DATE so the monthly tick sheet
    -- always has data for "today". Weekdays get a realistic mix of On Time (AH),
    -- Late (AR), Absent (ABS) and Excluded (EX); weekends are left blank.
    FOR v_date IN
      SELECT d::date
      FROM generate_series(
        (date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date,
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS d
    LOOP
      -- Only weekdays.
      CONTINUE WHEN EXTRACT(DOW FROM v_date) IN (0, 6);

      FOREACH v_cand IN ARRAY v_cands
      LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM applicant WHERE candidate_no = v_cand);

        -- Deterministic but varied status based on candidate + date.
        v_status := v_statuses[1 + ((v_cand + EXTRACT(DAY FROM v_date)::int + EXTRACT(MONTH FROM v_date)::int) % array_length(v_statuses, 1))];

        -- Avoid duplicating existing rows.
        IF EXISTS (
          SELECT 1 FROM attendance
          WHERE candidate_no = v_cand AND training_id = v_tid AND attendance_date = v_date
        ) THEN
          CONTINUE;
        END IF;

        v_arrival := NULL;
        v_depart  := NULL;
        v_obs     := NULL;

        IF v_status = 'AH' THEN
          v_arrival := '08:00:00'::time;
          v_depart  := '16:00:00'::time;
        ELSIF v_status = 'AR' THEN
          v_arrival := ('08:' || lpad((10 + (v_cand % 20))::text, 2, '0') || ':00')::time;
          v_depart  := '16:00:00'::time;
          v_obs     := 'Arrived late';
        ELSIF v_status = 'ABS' THEN
          v_obs     := 'Absent without justification';
        ELSIF v_status = 'EX' THEN
          v_obs     := 'Excluded from session';
        END IF;

        INSERT INTO attendance (candidate_no, training_id, attendance_date, status, arrival_time, departure_time, observations)
        VALUES (v_cand, v_tid, v_date, v_status, v_arrival, v_depart, v_obs);
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Sample attendance data seeded for % training(s).', array_length(v_tids, 1);
END $$;
