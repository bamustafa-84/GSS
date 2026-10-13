'use strict';
/**
 * RBAC helpers (pure, no DB access):
 *  - signed bearer tokens (HMAC-SHA256, no external dependency)
 *  - module/section mapping for applicant columns
 *  - permission resolution (deny by default, exact section + action match)
 *
 * Module → tab mapping:
 *   1.1 Registration General          → registration
 *   1.2 For Administration Use Only   → registration (#adminFieldset)
 *   2.1 Conditions                    → conditions
 *   3.1 Rules                         → reglement
 *   4.1 Commitment                    → engagement
 *   5.1 Attendance / Candidate Info   → presences
 *   6.1 Exam Results General          → exam
 *   7.1 Evaluation Grid, 7.2 Final Result → evaluation
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ACTIONS = ['view', 'add', 'edit', 'delete', 'approve', 'print'];
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

let secretCache = null;
const getSecret = () => {
  if (secretCache) return secretCache;
  if (process.env.AUTH_SECRET) { secretCache = process.env.AUTH_SECRET; return secretCache; }
  const file = path.join(__dirname, '.auth-secret');
  try {
    secretCache = fs.readFileSync(file, 'utf8').trim();
  } catch (_) {
    secretCache = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(file, secretCache, { mode: 0o600 }); } catch (_) { /* in-memory only */ }
  }
  return secretCache;
};

const b64 = (buf) => Buffer.from(buf).toString('base64url');

/** @param {{ id: number, name: string, role: string }} user */
const signToken = (user, now = Date.now()) => {
  const payload = b64(JSON.stringify({
    id: user.id, name: user.name, role: user.role,
    exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS,
  }));
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
};

/** @returns {{ id: number, name: string, role: string } | null} */
const verifyToken = (token, now = Date.now()) => {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', getSecret()).update(parts[0]).digest();
  let given;
  try { given = Buffer.from(parts[1], 'base64url'); } catch (_) { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!data || typeof data.exp !== 'number' || data.exp * 1000 < now) return null;
    const id = Number(data.id);
    if (!Number.isFinite(id)) return null;
    return { id, name: String(data.name || ''), role: String(data.role || '') };
  } catch (_) { return null; }
};

const bearerOf = (req) => {
  const h = (req.headers && req.headers.authorization) || '';
  const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(h) ? h[0] : h);
  return m ? m[1].trim() : '';
};

// ── Applicant column → module section ────────────────────────────
const ADMIN_COLUMNS = new Set(['interview_result', 'remarks', 'officer_signature_id']);
const ACK_SECTIONS = {
  ack_conditions: '2.1',
  ack_rules: '3.1',
  ack_commitment: '4.1',
  ack_presences: '5.1',
  ack_exam: '6.1',
  ack_mensuration: '8.1',
  ack_dossier: '9.1',
};
// Final Result (section 7.2) columns, set by the Admin at stage 2.
// NOTE: eval_instructor_ack is deliberately NOT here — it is the Instructor's
// sign-off on the grid (section 7.1, evalSecGrid), saved at stage 1 by a role
// that may have 7.1-edit but not 7.2-edit. It falls through to the generic
// `eval_` → 7.1 rule below so the stage-1 acknowledgement actually persists.
const FINAL_RESULT_COLUMNS = new Set([
  'eval_final_decision', 'eval_observations', 'eval_trainer_signature_id',
  'eval_admin_ack',
]);
// System/audit columns are never classified (no permission required).
const IGNORED_COLUMNS = new Set([
  'candidate_no', 'candidateno', 'created_by', 'updated_by', 'created_at', 'updated_at',
  'created_by_name', 'updated_by_name',
]);

/** @returns {string | null} section id for a column, or null when not governed. */
const sectionForColumn = (column) => {
  const c = String(column || '').toLowerCase();
  if (IGNORED_COLUMNS.has(c)) return null;
  if (/^(measure|mens|meas)/.test(c)) return '8.1';
  if (/^dossier/.test(c)) return '9.1';
  if (ADMIN_COLUMNS.has(c)) return '1.2';
  if (ACK_SECTIONS[c]) return ACK_SECTIONS[c];
  if (c.startsWith('exam_')) return '6.1';
  if (FINAL_RESULT_COLUMNS.has(c)) return '7.2';
  if (c.startsWith('eval_')) return '7.1';
  return '1.1';
};

/**
 * Permission requirements for an applicant save.
 * @param {string[]} columns posted column names
 * @param {boolean} isUpdate
 * @returns {{ section: string, action: string }[]}
 */
const requirementsForSave = (columns, isUpdate) => {
  const action = isUpdate ? 'edit' : 'add';
  const sections = new Set();
  for (const col of columns) {
    const s = sectionForColumn(col);
    if (s) sections.add(s);
  }
  return [...sections].sort().map((section) => ({ section, action }));
};

/**
 * Exact-match resolver over an effective permission map
 * ({ "1.1": { view: true, ... } }). Deny by default; no action implies another.
 */
const can = (perms, section, action) => {
  if (!perms || typeof perms !== 'object') return false;
  if (!ACTIONS.includes(action)) return false;
  const row = Object.prototype.hasOwnProperty.call(perms, section) ? perms[section] : null;
  return !!(row && row[action] === true);
};

module.exports = {
  ACTIONS, signToken, verifyToken, bearerOf, sectionForColumn,
  requirementsForSave, can,
};
