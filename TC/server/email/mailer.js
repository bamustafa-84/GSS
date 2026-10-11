// @ts-check
'use strict';

/**
 * GSS · Mail transport (optional, env-driven)
 * ------------------------------------------------------------------
 * Uses nodemailer when it is installed AND SMTP settings are present in the
 * environment. When neither is true the mailer degrades gracefully to a
 * no-op so account creation/updates never fail because mail is unconfigured.
 *
 * Security:
 *   • SMTP credentials come only from environment variables.
 *   • Passwords / secrets are never logged (we log subjects + recipients only).
 */

/** Lazily resolve nodemailer; returns null when the package is absent. */
let _nodemailer = /** @type {any} */ (undefined);
const getNodemailer = () => {
  if (_nodemailer !== undefined) return _nodemailer;
  try { _nodemailer = require('nodemailer'); }
  catch (_) { _nodemailer = null; }
  return _nodemailer;
};

const env = process.env;
const isConfigured = () => !!(env.SMTP_HOST && env.MAIL_FROM);

let _transport = /** @type {any} */ (undefined);
const getTransport = () => {
  if (_transport !== undefined) return _transport;
  const nm = getNodemailer();
  if (!nm || !isConfigured()) { _transport = null; return _transport; }
  _transport = nm.createTransport({
    host: env.SMTP_HOST,
    port: Number.parseInt(String(env.SMTP_PORT || '587'), 10),
    secure: String(env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined,
  });
  return _transport;
};

/**
 * Attempt to send one message. Always resolves (never throws) so callers can
 * treat delivery independently from the database operation.
 * @param {{ to: string, subject: string, html: string, text: string }} msg
 * @returns {Promise<{ sent: boolean, skipped?: boolean, reason?: string, error?: string }>}
 */
const sendMail = async (msg) => {
  if (!msg || !msg.to) return { sent: false, skipped: true, reason: 'no_recipient' };
  const transport = getTransport();
  if (!transport) {
    // Not an error — mail is simply not configured in this environment.
    return { sent: false, skipped: true, reason: getNodemailer() ? 'not_configured' : 'transport_unavailable' };
  }
  try {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return { sent: true };
  } catch (err) {
    // Log the failure without exposing message content or secrets.
    const e = /** @type {any} */ (err);
    console.error('[mailer] delivery failed:', e && e.message ? e.message : 'unknown error');
    return { sent: false, error: 'delivery_failed' };
  }
};

module.exports = { sendMail, isConfigured };
