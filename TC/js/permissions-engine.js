// @ts-check
/*
 * GSS · Permission-aware UI gating engine (GSSPerms)
 * ==================================================================
 * Single source of truth for user-based module/section authorization.
 * Kept in its own file (separate from global.js) so the permission
 * schema logic is easy to locate, trace and troubleshoot in isolation.
 *
 * Load order: this file must come IMMEDIATELY AFTER global.js on every
 * page, because it depends on API_BASE and GSSSession defined there, and
 * it must come BEFORE any module that calls window.GSSPerms.*.
 *
 * What it does:
 *   • Fetches the signed-in user's effective permission map from
 *     /api/me/permissions (per-user — never role-derived).
 *   • Hides any element tagged data-perm="section:action" when the
 *     action is not granted for that user.
 *   • Governs tabs, sub-section fieldsets and save controls by section.
 *
 * Security note: this is a usability layer only. The server independently
 * enforces access on every protected endpoint, so hiding a control is
 * never the sole protection.
 */
'use strict';

const GSSPerms = (() => {
  /** @type {Record<string, string[]>} */
  let permMap = {};
  let loaded = false;
  /** @type {() => void} */
  let resolveReady = () => {};
  const ready = new Promise((r) => { resolveReady = () => r(true); });

  // Only these four actions are user-assignable in the Permissions matrix.
  const ACTIONS = ['view', 'add', 'edit', 'delete'];

  /** Tab → governing section IDs (a tab is visible when any one grants view). */
  const TAB_SECTIONS = Object.freeze({
    registration: ['1.1', '1.2'],
    conditions: ['2.1'],
    reglement: ['3.1'],
    engagement: ['4.1'],
    presences: ['5.1'],
    exam: ['6.1'],
    evaluation: ['7.1', '7.2'],
    mensuration: ['8.1'],
    dossier: ['9.1'],
  });

  /** Sub-sections hidden/locked independently of their tab. */
  const SECTION_ELEMENTS = Object.freeze([
    { section: '1.2', selector: '#adminFieldset' },
    { section: '7.1', selector: '#evalGridFieldset' },
    { section: '7.2', selector: '#evalResultFieldset' },
  ]);

  /** Save controls: shown when the user may add or edit the section. */
  const SAVE_CONTROLS = Object.freeze([
    { section: '1.1', selector: '#regSubmitBtn' },
    { section: '5.1', selector: '#attSheetSave' },
    { section: '5.1', selector: '#attCellSave' },
  ]);

  // Without a session there is nothing to authorize (pages redirect to login).
  // Every signed-in role, Candidate included, is resolved from the saved matrix.
  const isUngoverned = () => {
    try { return !GSSSession.get(); } catch (_) { return true; }
  };

  /**
   * Strict, centralized resolver: deny by default, exact section + action
   * match, no action implies another (add/edit/delete never infer from view).
   * @param {string} moduleId  e.g. '1'
   * @param {string} sectionId e.g. '1' or '1.1'
   * @param {string} action    view | add | edit | delete
   * @returns {boolean}
   */
  const canAccessModule = (moduleId, sectionId, action) => {
    if (isUngoverned()) return true;
    if (!ACTIONS.includes(action)) return false;
    if (!loaded) return false;
    const key = String(sectionId).indexOf('.') !== -1 ? String(sectionId) : `${moduleId}.${sectionId}`;
    if (!Object.prototype.hasOwnProperty.call(permMap, key)) return false;
    const a = permMap[key];
    return Array.isArray(a) && a.indexOf(action) !== -1;
  };

  /** @param {string} section e.g. '1.1' @param {string} action */
  const canSection = (section, action) => {
    const dot = String(section).indexOf('.');
    return canAccessModule(String(section).slice(0, dot), section, action);
  };

  /**
   * Legacy helper used by data-perm gating (permissive until loaded so
   * controls do not flash hidden; the server remains the authority).
   * @param {string} section @param {string} action
   */
  const can = (section, action) => {
    if (!loaded) return true;
    return canSection(section, action);
  };

  /** @param {string} tabName */
  const canViewTab = (tabName) => {
    const secs = /** @type {Record<string, string[]>} */ (TAB_SECTIONS)[tabName];
    if (!secs) return true; // tabs outside RBAC scope (e.g. measurements, dossier)
    return secs.some((s) => canSection(s, 'view'));
  };
  const canAdd = (/** @type {string} */ s) => canSection(s, 'add');
  const canEdit = (/** @type {string} */ s) => canSection(s, 'edit');
  const canDelete = (/** @type {string} */ s) => canSection(s, 'delete');

  /** First visible tab, used as a redirect target when a tab is denied. */
  const firstAllowedTab = () => Object.keys(TAB_SECTIONS).find((t) => canViewTab(t)) || null;

  const applyTabs = () => {
    Object.keys(TAB_SECTIONS).forEach((tab) => {
      const btn = document.getElementById(`tab-btn-${tab}`);
      if (!btn) return;
      const secs = /** @type {Record<string, string[]>} */ (TAB_SECTIONS)[tab];
      // A module with no permission at all (view/add/edit/delete all unchecked)
      // is "denied": the tab stays visible but grayed, disabled and tooltipped.
      const hasAny = secs.some((s) => ACTIONS.some((a) => canSection(s, a)));
      btn.dataset.permDenied = hasAny ? '0' : '1';
    });
    // Reconcile the dim/disable/tooltip styling with the sequential lock state.
    const gt = /** @type {any} */ (window).GSSTabs;
    if (gt && typeof gt.refreshLocks === 'function') gt.refreshLocks();
    SECTION_ELEMENTS.forEach(({ section, selector }) => {
      document.querySelectorAll(selector).forEach((el) => {
        el.classList.toggle('hidden', !canSection(section, 'view'));
        if (el instanceof HTMLFieldSetElement) {
          el.disabled = !(canSection(section, 'add') || canSection(section, 'edit'));
        }
      });
    });
    SAVE_CONTROLS.forEach(({ section, selector }) => {
      document.querySelectorAll(selector).forEach((el) => {
        el.classList.toggle('hidden', !(canSection(section, 'add') || canSection(section, 'edit')));
      });
    });
    // If the active tab was just denied, move to an allowed one.
    const active = document.querySelector('.gss-tab-panel:not(.hidden)');
    const activeName = active ? String(active.id || '').replace(/^panel-/, '') : '';
    if (activeName && !canViewTab(activeName)) {
      const next = firstAllowedTab();
      const gt2 = /** @type {any} */ (window).GSSTabs;
      if (next && gt2 && typeof gt2.switchTab === 'function') gt2.switchTab(next);
      else if (active) active.classList.add('hidden');
    }
  };

  const apply = () => {
    if (!loaded || typeof document === 'undefined') return;
    document.querySelectorAll('[data-perm]').forEach((el) => {
      const spec = String(el.getAttribute('data-perm') || '');
      const parts = spec.split(':');
      const section = (parts[0] || '').trim();
      const action = (parts[1] || '').trim();
      if (!section || !action) return;
      el.classList.toggle('hidden', !can(section, action));
    });
    if (!isUngoverned()) applyTabs();
    const gp = /** @type {any} */ (window).GSSPermissions;
    if (gp && typeof gp.apply === 'function') gp.apply();
  };

  const refresh = async () => {
    try {
      const sess = (typeof GSSSession !== 'undefined' && GSSSession.get()) || null;
      if (!sess || !sess.token) return;
      const d = await fetch(`${API_BASE}/api/me/permissions`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (d && d.permissions) { permMap = d.permissions; loaded = true; apply(); resolveReady(); }
    } catch (_) { /* leave UI ungated on error */ }
  };

  /**
   * Ensure the signed-in user's permissions are loaded before a gate is
   * evaluated. Resolves immediately when there is no session (ungoverned —
   * e.g. local development) or when the map is already loaded.
   * @returns {Promise<void>}
   */
  const ensure = async () => {
    if (isUngoverned() || loaded) return;
    await refresh();
  };

  /**
   * Centralized report-dashboard gate (Reports = section 10.1). Permissive
   * when ungoverned or when the map could not be loaded (the server still
   * enforces every protected endpoint), otherwise strictly matrix-driven.
   * @returns {boolean}
   */
  const canViewReports = () => {
    if (isUngoverned() || !loaded) return true;
    return canSection('10.1', 'view');
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
    else refresh();
    // Re-sync when the tab regains focus (picks up admin permission changes).
    window.addEventListener('focus', () => { refresh(); });
    // Bound how long a revoked permission can stay effective in an open session.
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  }

  return {
    can, refresh, ensure, apply, ready, canSection, canViewReports,
    canAccessModule, canViewTab, canAdd, canEdit, canDelete,
    get loaded() { return loaded; },
    get map() { return permMap; },
  };
})();
/** @type {any} */ (window).GSSPerms = GSSPerms;
