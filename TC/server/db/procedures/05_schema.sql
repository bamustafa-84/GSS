
-- ================================================================
-- GSS · Schema additions (idempotent)
-- ----------------------------------------------------------------
-- New columns required by the Conditions / Rules / Commitment
-- acceptance flow and the Training Officer signature feature. Safe to
-- run on every startup thanks to IF NOT EXISTS.
-- ================================================================

-- Applicant: ID/passport number mapped from the Commitment panel.
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS id_pass_no varchar(100);

-- Applicant: per-panel acceptance flags.
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS conditions_accepted boolean DEFAULT false;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS rules_accepted      boolean DEFAULT false;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS commitment_accepted boolean DEFAULT false;

-- Applicant: acknowledgement flags used by the Conditions / Rules / Commitment
-- panels (green tab + read-only when TRUE). These are the columns the
-- front-end reads/writes; the *_accepted columns above are kept for
-- backwards compatibility.
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS ack_conditions boolean DEFAULT false;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS ack_rules      boolean DEFAULT false;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS ack_commitment boolean DEFAULT false;

-- Applicant: Exam panel instructor-entered outcome + signature.
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS exam_decision varchar(50);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS exam_observations text;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS exam_instructor_signature_id integer;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS ack_exam boolean DEFAULT false;

-- Applicant: Individual Attendance Report (panel-presences) acknowledgement.
-- TRUE once the candidate's attendance information is confirmed (green tab +
-- read-only). Written by the Attendance panel's Candidate Information checkbox.
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS ack_presences boolean DEFAULT false;

-- Applicant: Individual Candidate File (Dossier) checklist certification flag.
-- TRUE once an authorised user (Admin / Secretary / Head of Training) certifies
-- that every checklist document is present (green Dossier tab + read-only).
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS ack_dossier boolean DEFAULT false;

-- Applicant: Dossier optional ("if required") documents. Persisted alongside the
-- certification (ack_dossier) so their ticked state is restored on reload.
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS doss_cv boolean DEFAULT false;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS doss_criminal_record boolean DEFAULT false;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS doss_medical_certificate boolean DEFAULT false;

-- Applicant: Individual Evaluation Sheet (Panel-Evaluation).
-- Grade cells (auto + instructor-entered), final decision, observations, the two
-- signatures and the dual (instructor + admin) acknowledgement flags.
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_presence_discipline     numeric(5,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_punctuality             numeric(5,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_instructions_compliance numeric(5,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_professional_appearance numeric(5,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_french_communication    numeric(5,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_observation_skills      numeric(5,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_physical_aptitude       numeric(5,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_theoretical_exam        numeric(5,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_total                   numeric(6,2);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_final_decision          varchar(50);
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_observations            text;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_trainer_signature_id    integer;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_manager_signature_id    integer;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_instructor_ack          boolean DEFAULT false;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS eval_admin_ack               boolean DEFAULT false;

-- Signature: flags the designated Training Officer.
ALTER TABLE signature ADD COLUMN IF NOT EXISTS is_training_officer boolean DEFAULT false;

-- ── Exam question management additions ───────────────────────────
-- Optional image associated with a question (stored inline as a base64
-- data URL so no separate file storage is required).
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url text;

-- Separates the training's *question library* from the *exam*. A question
-- can exist for a training (library) without being part of the exam; it is
-- only delivered to candidates once it has been explicitly added to the exam.
-- Existing rows default to TRUE so previously-configured exams are unchanged.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS in_exam boolean NOT NULL DEFAULT true;

-- Free-text instructions shown to the candidate at the top of the exam.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS instructions text;

-- applicant_training: audit fields. Added here (before the sample-data seed in
-- 46_sample_data.sql) so the seed can populate created_by/updated_by. The same
-- statements are repeated idempotently in 80_exam_access.sql.
ALTER TABLE applicant_training ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE applicant_training ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE applicant_training ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE applicant_training ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- applicant: audit fields. created_by / updated_by hold the login id of the
-- acting user (stamped by the server from the actor headers); the timestamps
-- default on insert and are forced on update by dynamic_crud.
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE applicant ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- measurements / attendance / training: audit fields (same BIGINT-id convention
-- as applicant_training). Stamped by their upsert procedures from the actor id.
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE training ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE training ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE training ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE training ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;