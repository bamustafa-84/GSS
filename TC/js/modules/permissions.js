// @ts-check
/*
 * permissions.js — client-side Permission Matrix enforcement.
 *
 * Applies a role → section access matrix over the applicant form panels.
 * Each panel section is identified by its <legend>/<h4> `data-i18n` key and
 * mapped to a matrix cell. For the current user's role a section is either:
 *   RW  → left fully editable
 *   R   → data controls locked (read-only); acknowledgment / navigation
 *         controls (which live outside the tagged sections) stay usable so a
 *         role can still complete its own workflow step
 *   NA  → section hidden entirely
 *
 * Admin is Read/Write everywhere and is never restricted. Candidate (and any
 * unknown role) is not governed by this staff matrix and is left untouched.
 *
 * The matrix "layers on top" of the existing workflow. Acknowledgment toggles
 * normally stay usable so a role can complete its own step; ACK_LOCK force-dims
 * specific ones per role (e.g. the Instructor's Commitment acknowledgment).
 */
(() => {
  'use strict';

  /** Which panel + legend key maps to which matrix section. */
  /** @type {Record<string, Record<string, string>>} */
  const SECTION_MAP = {
    'panel-registration': {
      secPersonal: 'registration.personal',
      secEducation: 'registration.education',
      secHealth: 'registration.health',
      secFees: 'registration.fees',
      secDecl: 'registration.declaration',
      secAdmin: 'registration.admin',
    },
    'panel-conditions': { secDecl: 'conditions.declaration' },
    'panel-reglement': { secDecl: 'rules.declaration' },
    'panel-engagement': { engSecIdentity: 'commitment.identity', secDecl: 'commitment.declaration' },
    'panel-presences': {
      presSecInfo: 'attendance.info',
      presSecTable: 'attendance.history',
      presSecSummary: 'attendance.history',
    },
    'panel-exam': {
      examSecResult: 'exam.result',
      examSecObs: 'exam.observations',
      examSecValidation: 'exam.validation',
    },
    'panel-evaluation': {
      evalSecGrid: 'evaluation.grid',
      evalSecSummary: 'evaluation.summary',
      evalSecResult: 'evaluation.result',
      evalSecSig: 'evaluation.signatures',
    },
    'panel-mensuration': {
      measSecMens: 'measurement.mens',
      measSecMedical: 'measurement.medical',
      measSecUrgence: 'measurement.urgence',
      measSecObs: 'measurement.obs',
    },
    'panel-dossier': { dossierSec2: 'checklist.documents' },
  };

  // Access per section for the three governed roles (Admin is always RW).
  // Values: 'RW' | 'R' | 'NA'. Order: [Head of Training, Instructor, Secretary].
  /** @type {Record<string, ['RW'|'R'|'NA', 'RW'|'R'|'NA', 'RW'|'R'|'NA']>} */
  const MATRIX = {
    'registration.personal':    ['R',  'NA', 'RW'],
    'registration.education':   ['R',  'NA', 'RW'],
    'registration.health':      ['R',  'NA', 'RW'],
    'registration.fees':        ['R',  'NA', 'RW'],
    'registration.declaration': ['R',  'NA', 'RW'],
    'registration.admin':       ['RW', 'NA', 'RW'],
    'conditions.declaration':   ['R',  'NA', 'RW'],
    'rules.declaration':        ['R',  'NA', 'RW'],
    'commitment.identity':      ['R',  'R',  'RW'],
    'commitment.declaration':   ['R',  'R',  'RW'],
    'attendance.info':          ['RW', 'R',  'RW'],
    'attendance.history':       ['RW', 'R',  'RW'],
    'exam.result':              ['R',  'RW', 'RW'],
    'exam.observations':        ['R',  'RW', 'RW'],
    'exam.validation':          ['R',  'RW', 'RW'],
    'evaluation.grid':          ['R',  'RW', 'RW'],
    'evaluation.summary':       ['R',  'RW', 'RW'],
    'evaluation.result':        ['RW', 'R',  'RW'],
    'evaluation.signatures':    ['R',  'RW', 'RW'],
    'measurement.mens':         ['R',  'R',  'RW'],
    'measurement.medical':      ['R',  'R',  'RW'],
    'measurement.urgence':      ['R',  'R',  'RW'],
    'measurement.obs':          ['R',  'R',  'RW'],
    'checklist.documents':      ['RW', 'R',  'RW'],
  };

  // Workflow exceptions: a role keeps Read/Write on sections it owns, even if
  // the matrix marks them read-only.
  /** @type {Record<string, Set<string>>} */
  const KEEP_WRITE = {};

  // Acknowledgment toggles live outside the tagged sections (so a role can
  // normally complete its own step); these are force-dimmed per role.
  /** @type {Record<string, string[]>} */
  const ACK_LOCK = {
    'Head of Training': ['ack-conditions', 'ack-rules', 'ack-engagement', 'ack-exam', 'ack-mensuration'],
    Instructor: ['ack-engagement', 'ack-mensuration', 'ack-presences'],
  };

  /** Column index into a MATRIX row for each governed role. */
  const ROLE_INDEX = { 'Head of Training': 0, Instructor: 1, Secretary: 2 };

  /** Read the current user's role from the session (best effort). */
  const currentRole = () => {
    try {
      const sess = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
      return sess && sess.role ? String(sess.role) : '';
    } catch (_) {
      return '';
    }
  };

  /** Lock a single form control, remembering whether it was already disabled. */
  const lockControl = (/** @type {any} */ el) => {
    if (el.dataset.permLock) return;
    el.dataset.permLock = el.disabled ? 'keep' : 'set';
    el.disabled = true;
  };
  const unlockControl = (/** @type {any} */ el) => {
    if (el.dataset.permLock === 'set') el.disabled = false;
    delete el.dataset.permLock;
  };

  /** Make a section read-only (data controls only). */
  const lockSection = (/** @type {HTMLElement} */ container) => {
    container.dataset.permRo = '1';
    if (container.tagName === 'FIELDSET') {
      /** @type {any} */ (container).disabled = true;
    } else {
      container.querySelectorAll('input, select, textarea, button').forEach((el) => lockControl(el));
    }
    // Signature pads are <canvas>, unaffected by disabled — neutralise them.
    container.querySelectorAll('.gss-sign, .gss-sign-canvas, canvas').forEach((el) => {
      const c = /** @type {HTMLElement} */ (el);
      c.dataset.permSign = '1';
      c.style.pointerEvents = 'none';
      c.style.opacity = '0.6';
    });
  };

  /** Reset every lock / hide applied by a previous run (idempotent). */
  const resetAll = () => {
    document.querySelectorAll('[data-perm-ro]').forEach((el) => {
      const c = /** @type {any} */ (el);
      if (c.tagName === 'FIELDSET') c.disabled = false;
      else c.querySelectorAll('[data-perm-lock]').forEach((x) => unlockControl(x));
      delete c.dataset.permRo;
    });
    document.querySelectorAll('[data-perm-sign]').forEach((el) => {
      const c = /** @type {HTMLElement} */ (el);
      c.style.pointerEvents = '';
      c.style.opacity = '';
      delete c.dataset.permSign;
    });
    document.querySelectorAll('.gss-perm-hidden').forEach((el) => {
      const c = /** @type {HTMLElement} */ (el);
      c.style.display = '';
      c.classList.remove('gss-perm-hidden');
    });
    document.querySelectorAll('[data-perm-dim]').forEach((el) => {
      const c = /** @type {HTMLElement} */ (el);
      c.style.opacity = '';
      c.style.pointerEvents = '';
      delete c.dataset.permDim;
    });
  };

  /** Locate the section container for a legend/heading key inside a panel. */
  const findSection = (/** @type {HTMLElement} */ panel, /** @type {string} */ key) => {
    const label = panel.querySelector(`[data-i18n="${key}"]`);
    if (!label) return null;
    return /** @type {HTMLElement|null} */ (label.closest('fieldset, section'));
  };

  /** Apply the matrix for the current role. Safe to call multiple times. */
  const applyPermissions = () => {
    resetAll();
    const role = currentRole();
    // Admin is unrestricted; Candidate / unknown roles are not governed here.
    if (!role || role === 'Admin') return;
    const idx = ROLE_INDEX[/** @type {keyof typeof ROLE_INDEX} */ (role)];
    if (idx === undefined) return;
    const keep = KEEP_WRITE[role] || new Set();

    Object.keys(SECTION_MAP).forEach((panelId) => {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const sections = SECTION_MAP[panelId];
      Object.keys(sections).forEach((legendKey) => {
        const permKey = sections[legendKey];
        const row = MATRIX[permKey];
        if (!row) return;
        let perm = row[idx];
        if (keep.has(permKey)) perm = 'RW';
        if (perm === 'RW') return;
        const container = findSection(/** @type {HTMLElement} */ (panel), legendKey);
        if (!container) return;
        if (perm === 'NA') {
          container.classList.add('gss-perm-hidden');
          container.style.display = 'none';
        } else if (perm === 'R') {
          lockSection(container);
        }
      });
    });

    // Dim acknowledgment toggles that live outside the tagged sections.
    (ACK_LOCK[role] || []).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const label = el.closest('label');
      const box = /** @type {HTMLElement|null} */ ((label && label.parentElement) || el.parentElement);
      if (box) {
        lockSection(box);
        box.style.opacity = '0.6';
        // Block clicks even if another module later re-enables the checkbox.
        box.style.pointerEvents = 'none';
        box.dataset.permDim = '1';
      } else {
        lockControl(el);
      }
    });
  };

  // Re-apply on language switches (the app re-renders labels, not structure,
  // but this keeps things consistent) and expose a manual hook.
  document.addEventListener('gss:language-changed', applyPermissions);
  /** @type {any} */ (window).GSSPermissions = { apply: applyPermissions };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPermissions);
  } else {
    applyPermissions();
  }
})();
