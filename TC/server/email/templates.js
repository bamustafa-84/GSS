// @ts-check
'use strict';

/**
 * GSS · Bilingual account-notification email templates (EN / FR)
 * ------------------------------------------------------------------
 * Pure, side-effect-free builders: each returns { subject, html, text }.
 * Content is kept separate from the mail transport and the HTTP layer.
 *
 * Security: templates never receive or render a password, password hash or
 * any secret. Credential delivery is link-based — the recipient sets their
 * own password through the login page's "Forgot password" flow.
 */

/** Escape user-provided values before inserting them into HTML. */
const esc = (/** @type {any} */ s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

/** Normalise an arbitrary language hint to 'fr' or 'en' (default 'en'). */
const normalizeLang = (/** @type {any} */ lang) =>
  String(lang || '').trim().toLowerCase().startsWith('fr') ? 'fr' : 'en';

const SIGNOFF = {
  en: 'GSS Training Centre Administration',
  fr: 'Administration du Centre de Formation GSS',
};

/** Wrap body HTML in a minimal, email-client-friendly layout. */
const layout = (/** @type {string} */ lang, /** @type {string} */ innerHtml) =>
  `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1"></head>` +
  `<body style="margin:0;background:#f1f5f9;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">` +
  `<tr><td style="background:linear-gradient(90deg,#042F8D,#0b4dc2);padding:20px 28px;color:#fff;font-size:18px;font-weight:700">GSS Training Centre</td></tr>` +
  `<tr><td style="padding:28px">${innerHtml}</td></tr>` +
  `</table></body></html>`;

/**
 * Build a notification email.
 * @param {'newAccount'|'passwordChanged'|'accountUpdated'} kind
 * @param {{ lang?: string, fullName?: string, username?: string, loginUrl?: string, setupUrl?: string, mustChange?: boolean, changes?: string[] }} data
 * @returns {{ subject: string, html: string, text: string }}
 */
const build = (kind, data = {}) => {
  const lang = normalizeLang(data.lang);
  const name = esc(data.fullName || data.username || (lang === 'fr' ? 'utilisateur' : 'user'));
  const username = esc(data.username || '');
  const loginUrl = esc(data.loginUrl || '');
  const setupUrl = esc(data.setupUrl || data.loginUrl || '');
  const signoff = SIGNOFF[lang];
  const changes = Array.isArray(data.changes) ? data.changes.filter(Boolean).map((c) => esc(c)) : [];

  // Plain-text counterpart lines are assembled per-kind below.
  /** @type {{ subject: string, lines: string[], mustChangeNote?: boolean, showLogin?: boolean, showSetup?: boolean, showChanges?: boolean, securityNote?: boolean }} */
  let spec;

  if (kind === 'newAccount') {
    spec = lang === 'fr' ? {
      subject: 'Votre compte GSS Training Centre',
      lines: [
        `Bonjour ${name},`,
        'Votre compte du Centre de Formation GSS a été créé avec succès.',
        `Nom d’utilisateur : ${username}`,
        'Pour des raisons de sécurité, définissez votre mot de passe via le lien « Mot de passe oublié » de la page de connexion.',
      ],
      mustChangeNote: !!data.mustChange, showSetup: true, showLogin: true,
    } : {
      subject: 'Your GSS Training Centre Account',
      lines: [
        `Hello ${name},`,
        'Your GSS Training Centre account has been created successfully.',
        `Username: ${username}`,
        'For security, please set your password using the "Forgot password" link on the login page.',
      ],
      mustChangeNote: !!data.mustChange, showSetup: true, showLogin: true,
    };
  } else if (kind === 'passwordChanged') {
    spec = lang === 'fr' ? {
      subject: 'Votre mot de passe GSS Training Centre a été modifié',
      lines: [
        `Bonjour ${name},`,
        'Un administrateur a mis à jour le mot de passe de votre compte.',
        'Connectez-vous à l’aide de vos identifiants pour accéder à votre compte.',
        'Si vous n’êtes pas à l’origine de cette demande, contactez immédiatement l’administrateur.',
      ],
      mustChangeNote: !!data.mustChange, showLogin: true, securityNote: true,
    } : {
      subject: 'Your GSS Training Centre Password Has Been Updated',
      lines: [
        `Hello ${name},`,
        'An administrator has updated your account password.',
        'Please sign in with your credentials to access your account.',
        'If you did not expect this change, contact the administrator immediately.',
      ],
      mustChangeNote: !!data.mustChange, showLogin: true, securityNote: true,
    };
  } else {
    spec = lang === 'fr' ? {
      subject: 'Votre compte GSS Training Centre a été mis à jour',
      lines: [
        `Bonjour ${name},`,
        'Les informations de votre compte ont été mises à jour.',
      ],
      showLogin: true, showChanges: true,
    } : {
      subject: 'Your GSS Training Centre Account Has Been Updated',
      lines: [
        `Hello ${name},`,
        'Your account information has been updated.',
      ],
      showLogin: true, showChanges: true,
    };
  }

  const L = {
    changesHeading: lang === 'fr' ? 'Résumé des modifications :' : 'Summary of changes:',
    mustChange: lang === 'fr'
      ? 'Un changement de mot de passe vous sera demandé lors de votre prochaine connexion.'
      : 'You will be required to change your password at your next login.',
    setup: lang === 'fr' ? 'Définir mon mot de passe' : 'Set my password',
    login: lang === 'fr' ? 'Accéder à la page de connexion' : 'Go to the login page',
    regards: lang === 'fr' ? 'Cordialement,' : 'Kind regards,',
  };

  // ── HTML body ──
  let html = spec.lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${l}</p>`).join('');
  if (spec.showChanges && changes.length) {
    html += `<p style="margin:0 0 6px;font-weight:600">${esc(L.changesHeading)}</p><ul style="margin:0 0 14px;padding-left:20px">` +
      changes.map((c) => `<li style="margin:0 0 4px">${c}</li>`).join('') + '</ul>';
  }
  if (spec.mustChangeNote) {
    html += `<p style="margin:0 0 14px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;font-size:14px;color:#9a3412">${esc(L.mustChange)}</p>`;
  }
  const btn = (/** @type {string} */ href, /** @type {string} */ label) =>
    `<a href="${href}" style="display:inline-block;margin:6px 8px 6px 0;padding:10px 18px;background:#042F8D;color:#fff;text-decoration:none;border-radius:9999px;font-weight:600;font-size:14px">${esc(label)}</a>`;
  let buttons = '';
  if (spec.showSetup && setupUrl) buttons += btn(setupUrl, L.setup);
  if (spec.showLogin && loginUrl) buttons += btn(loginUrl, L.login);
  if (buttons) html += `<p style="margin:10px 0 18px">${buttons}</p>`;
  html += `<p style="margin:18px 0 0;font-size:14px;color:#475569">${esc(L.regards)}<br><strong>${esc(signoff)}</strong></p>`;

  // ── Plain-text alternative ──
  const textParts = [...spec.lines];
  if (spec.showChanges && changes.length) textParts.push('', L.changesHeading, ...changes.map((c) => `- ${c}`));
  if (spec.mustChangeNote) textParts.push('', L.mustChange);
  if (spec.showSetup && data.setupUrl) textParts.push('', `${L.setup}: ${data.setupUrl || data.loginUrl || ''}`);
  if (spec.showLogin && data.loginUrl) textParts.push('', `${L.login}: ${data.loginUrl}`);
  textParts.push('', L.regards, signoff);

  return { subject: spec.subject, html: layout(lang, html), text: textParts.join('\n') };
};

module.exports = { build, normalizeLang };
