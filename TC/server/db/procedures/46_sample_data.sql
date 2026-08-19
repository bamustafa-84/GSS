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
  v_cands    integer[] := ARRAY[25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
  v_cand     integer;
  v_year     integer   := 2026;
  v_month    integer;
  v_day      integer;
  v_date     date;
  v_status   text;
  v_arrival  time;
  v_depart   time;
  v_obs      text;
  v_statuses text[]    := ARRAY['AH', 'AH', 'AH', 'AR', 'AR', 'ABS', 'EX'];
BEGIN
  -- Resolve the default training id by title.
  SELECT training_id INTO v_tid FROM training WHERE title = 'Safety Training' ORDER BY training_id DESC LIMIT 1;
  IF v_tid IS NULL THEN
    RAISE NOTICE 'Safety Training not found; skipping sample data seed.';
    RETURN;
  END IF;

  -- Assign the sample candidates to Safety Training if they exist and are not
  -- already assigned.
  FOREACH v_cand IN ARRAY v_cands
  LOOP
    IF EXISTS (SELECT 1 FROM applicant WHERE candidate_no = v_cand) THEN
      INSERT INTO applicant_training (candidate_no, training_id, assigned_at, created_by, updated_by)
      VALUES (v_cand, v_tid, CURRENT_TIMESTAMP, 1, 1)
      ON CONFLICT (candidate_no, training_id) DO NOTHING;
    END IF;
  END LOOP;

  -- Seed attendance records for June, July and August 2026.
  -- Weekdays get a realistic mix of On Time (AH), Late (AR), Absent (ABS) and
  -- Excluded (EX). Weekends are left blank.
  FOR v_month IN 6 .. 8
  LOOP
    FOR v_day IN 1 .. EXTRACT(DAY FROM (make_date(v_year, v_month, 1) + INTERVAL '1 month - 1 day')::date)
    LOOP
      v_date := make_date(v_year, v_month, v_day);
      -- Only weekdays.
      CONTINUE WHEN EXTRACT(DOW FROM v_date) IN (0, 6);

      FOREACH v_cand IN ARRAY v_cands
      LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM applicant WHERE candidate_no = v_cand);

        -- Deterministic but varied status based on candidate + date.
        v_status := v_statuses[1 + ((v_cand + v_day + v_month) % array_length(v_statuses, 1))];

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

  RAISE NOTICE 'Sample attendance data seeded for Safety Training (id=%).', v_tid;
END $$;
