-- ================================================================
-- GSS · Training title → "CODE - Description" migration
-- ----------------------------------------------------------------
-- Stores each of the five official courses as "CODE - Description"
-- (e.g. "FIAS - Initial Security Agent Training") in the Dictionary
-- (category training_title) and on every training session. The report
-- UI splits on the dash: the code shows in the grid, the description
-- in the charts.
--
-- Converts from either legacy state — the bare description or the bare
-- code — to the combined form, so it is safe on any existing database.
-- Runs before the sample seed (89) so the seed recognises the combined
-- titles and does not duplicate rows/sessions. Idempotent.
-- ================================================================

DO $$
DECLARE
  v_code text[] := ARRAY['FIAS', 'FRAS', 'FCP', 'FSUP', 'FINSP'];
  v_en   text[] := ARRAY[
      'Initial Security Agent Training',
      'Security Agent Refresher Training',
      'Post Chief Training',
      'Supervisor Training',
      'Inspector Training'
    ];
  v_fr   text[] := ARRAY[
      'Formation Initiale Agent de Sécurité',
      'Formation de Recyclage Agent de Sécurité',
      'Formation Chef de Poste',
      'Formation Superviseur',
      'Formation Inspecteur'
    ];
  v_i       int;
  v_en_full text;
  v_fr_full text;
BEGIN
  FOR v_i IN 1 .. array_length(v_code, 1) LOOP
    v_en_full := v_code[v_i] || ' - ' || v_en[v_i];
    v_fr_full := v_code[v_i] || ' - ' || v_fr[v_i];

    -- Dictionary: English/French fields carry "CODE - Description".
    UPDATE dictionary
       SET en_title = v_en_full, fr_title = v_fr_full,
           updated_by = 'System', updated_at = CURRENT_TIMESTAMP
     WHERE category = 'training_title'
       AND en_title IN (v_code[v_i], v_en[v_i], v_en_full);

    -- Sessions reference the training by its title text (English form).
    UPDATE training
       SET title = v_en_full
     WHERE title IN (v_code[v_i], v_en[v_i], v_en_full);
  END LOOP;

  -- Collapse any duplicate dictionary rows left by earlier seeds.
  DELETE FROM dictionary d
   USING dictionary k
   WHERE d.category = 'training_title'
     AND k.category = 'training_title'
     AND d.en_title = k.en_title
     AND d.dictionary_id > k.dictionary_id;
END $$;
