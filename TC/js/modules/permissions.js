/*
 * permissions.js — applies the saved Permission Matrix to the form panels.
 *
 * No role names or role-specific rules live here. Each panel section maps to a
 * matrix section ID (e.g. '1.2'); GSSPerms (global.js) resolves the signed-in
 * user's effective permissions from the server and this file only reflects them:
 *   no view            → section hidden
 *   view, no add/edit  → data controls locked (read-only)
 *   add or edit        → left editable (the server re-checks every request)
 * Acknowledgment toggles follow the edit/add permission of their own tab.
 */
(() => {
  'use strict';

  /** Panel → legend key → matrix section ID. */
  /** @type {Record<string, Record<string, string>>} */
  const SECTION_MAP = {
    'panel-registration': {
      secPersonal: '1.1', secEducation: '1.1', secHealth: '1.1', secFees: '1.1', secDecl: '1.1',
      secAdmin: '1.2',
    },
    'panel-conditions': { secDecl: '2.1' },
    'panel-reglement': { secDecl: '3.1' },
    'panel-engagement': { engSecIdentity: '4.1', secDecl: '4.1' },
    'panel-presences': { presSecInfo: '5.1', presSecTable: '5.1', presSecSummary: '5.1' },
    'panel-exam': { examSecResult: '6.1', examSecObs: '6.1', examSecValidation: '6.1' },
    'panel-evaluation': {
      evalSecGrid: '7.1', evalSecSummary: '7.1', evalSecResult: '7.2', evalSecSig: '7.2',
    },
    'panel-mensuration': {
      measSecMens: '8.1', measSecMedical: '8.1', measSecUrgence: '8.1', measSecObs: '8.1',
    },
    'panel-dossier': { dossierSec2: '9.1' },
  };

  /** Acknowledgment toggle → matrix section governing it. */
  /** @type {Record<string, string>} */
  const ACK_SECTION = {
    'ack-conditions': '2.1', 'ack-rules': '3.1', 'ack-engagement': '4.1',
    'ack-presences': '5.1', 'ack-exam': '6.1', 'ack-mensuration': '8.1', 'ack-dossier': '9.1',
  };

  const perms = () => /** @type {any} */ (window).GSSPerms;
  const governed = () => {
    const p = perms();
    return !!(p && p.loaded && typeof GSSSession !== 'undefined' && GSSSession.get());
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

  /** Apply the saved matrix for the signed-in user. Safe to call repeatedly. */
  const applyPermissions = () => {
    resetAll();
    if (!governed()) return;
    const p = perms();

    Object.keys(SECTION_MAP).forEach((panelId) => {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const sections = SECTION_MAP[panelId];
      Object.keys(sections).forEach((legendKey) => {
        const sec = sections[legendKey];
        const container = findSection(/** @type {HTMLElement} */ (panel), legendKey);
        if (!container) return;
        if (!p.canSection(sec, 'view')) {
          container.classList.add('gss-perm-hidden');
          container.style.display = 'none';
        } else if (!p.canSection(sec, 'add') && !p.canSection(sec, 'edit')) {
          lockSection(container);
        }
      });
    });

    // Acknowledgment toggles sit outside the tagged sections.
    Object.keys(ACK_SECTION).forEach((id) => {
      const sec = ACK_SECTION[id];
      if (p.canSection(sec, 'edit') || p.canSection(sec, 'add')) return;
      const el = document.getElementById(id);
      if (!el) return;
      const label = el.closest('label');
      const box = /** @type {HTMLElement|null} */ ((label && label.parentElement) || el.parentElement);
      if (box) {
        lockSection(box);
        box.style.opacity = '0.6';
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
