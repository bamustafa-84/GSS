// @ts-check
'use strict';

/**
 * GSS · Account-notification orchestration
 * ------------------------------------------------------------------
 * Bridges the HTTP layer and the mail transport: validates the recipient,
 * builds the correct bilingual template, and sends it. Every function
 * resolves to a small status object; delivery never throws so a failed
 * email can be reported distinctly from a successful DB write.
 */

const templates = require('./templates');
const mailer = require('./mailer');

/** RFC-5322-lite format check (same intent as the front-end validation). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (/** @type {any} */ value) =>
  typeof value === 'string' && value.length <= 255 && EMAIL_RE.test(value.trim());

/** Build the absolute login URL from APP_BASE_URL (falls back to localhost). */
const loginUrl = () => {
  const base = String(process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
  return `${base}/login.html`;
};

/**
 * Validate + send an account notification.
 * @param {'newAccount'|'passwordChanged'|'accountUpdated'} kind
 * @param {{ email?: string, fullName?: string, username?: string, lang?: string, mustChange?: boolean, changes?: string[] }} user
 * @returns {Promise<{ attempted: boolean, sent: boolean, skipped?: boolean, reason?: string, error?: string }>}
 */
const notify = async (kind, user = {}) => {
  const to = String(user.email || '').trim();
  if (!isValidEmail(to)) return { attempted: false, sent: false, skipped: true, reason: 'no_valid_email' };

  const url = loginUrl();
  const msg = templates.build(kind, {
    lang: user.lang,
    fullName: user.fullName,
    username: user.username,
    loginUrl: url,
    setupUrl: url,
    mustChange: user.mustChange,
    changes: user.changes,
  });
  const result = await mailer.sendMail({ to, subject: msg.subject, html: msg.html, text: msg.text });
  return Object.assign({ attempted: true }, result);
};

module.exports = { notify, isValidEmail };
