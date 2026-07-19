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

-- Signature: flags the designated Training Officer.
ALTER TABLE signature ADD COLUMN IF NOT EXISTS is_training_officer boolean DEFAULT false;
