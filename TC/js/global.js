// @ts-check
/**
 * GSS · Global configuration & shared state
 * ==================================================================
 * Single source of truth for values that must stay identical across
 * every page and module (login + training-centre form).
 *
 * Load order: this file must be the FIRST project script on any page,
 * so the constants below are defined before translation.js, tc.js and
 * the panel modules run.
 *
 * All members live on the global (window) scope on purpose — the app
 * is a set of classic <script> files, not ES modules.
 */
'use strict';

/* ------------------------------------------------------------------
 * Persistence keys (localStorage)
 * ---------------------------------------------------------------- */

/**
 * localStorage key holding the user's chosen language ('fr' | 'en').
 * Shared by the login page and the form so the choice persists.
 * @type {string}
 */
const GSS_LANG_KEY = 'gss-lang';

/**
 * Base URL for the JSON API. When the page is served by the Node server the API
 * lives at the same origin (whatever port that is), so we use `location.origin`.
 * When opened from Live Server (port 5500) or the file system, fall back to the
 * local Node server. Update the fallback port here if PORT changes in .env.
 * @type {string}
 */
const API_BASE = 'http://localhost:4000';


/* ------------------------------------------------------------------
 * Tab / progress indicator Tailwind classes
 * Kept as individual constants for backwards compatibility with the
 * existing modules, and mirrored on GSS_TAB_CLASSES for structured
 * access.
 * ---------------------------------------------------------------- */

/** Active tab underline colour. @type {string} */
const TAB_ACTIVE_BORDER = 'border-b-blue-600';
/** Active tab label colour. @type {string} */
const TAB_ACTIVE_TEXT = 'text-blue-600';
/** Completed tab dot background. @type {string} */
const TAB_DONE_BG = 'bg-green-500';
/** Pending tab dot background. @type {string} */
const TAB_PENDING_BG = 'bg-gray-300';
/** Active tab dot background. @type {string} */
const TAB_ACTIVE_BG = 'bg-blue-800';

/**
 * Structured view of the tab indicator classes above.
 * @type {Readonly<{
 *   activeBorder: string,
 *   activeText: string,
 *   doneBg: string,
 *   pendingBg: string,
 *   activeBg: string
 * }>}
 */
const GSS_TAB_CLASSES = Object.freeze({
  activeBorder: TAB_ACTIVE_BORDER,
  activeText: TAB_ACTIVE_TEXT,
  doneBg: TAB_DONE_BG,
  pendingBg: TAB_PENDING_BG,
  activeBg: TAB_ACTIVE_BG,
});

/* ------------------------------------------------------------------
 * Globals attached to window by other scripts
 * Declared here (as `var`) so their types are known project-wide and
 * `window.<name>` resolves without casts.
 * ---------------------------------------------------------------- */

/**
 * Countries & their cities dataset.
 * @typedef {{ countries: string[], cities: Record<string, string[]> }} GSSLocations
 */

/**
 * Countries & cities dataset (populated in js/utils/locations.js).
 * @type {GSSLocations | undefined}
 */
var GSS_LOCATIONS;

/**
 * Collapsible fieldset helper (defined in js/utils/collapsible.js).
 * @type {{ init: () => void, expand: (fieldset: Element | null) => void } | undefined}
 */
var GSSCollapsible;

/**
 * A conditional-requirement rule: the field is required only when the
 * referenced trigger field equals the given value.
 * @typedef {{ field: string, equals: string }} GSSRequiredIf
 */

/**
 * A single required-field definition inside a panel rule.
 * @typedef {{ key: string, type: string, requiredIf?: GSSRequiredIf }} GSSValidationField
 */

/**
 * The validation rule for one panel (form).
 * @typedef {{ formId: string, statusId: string, fields: GSSValidationField[] }} GSSPanelRule
 */

/**
 * Panel validation API (defined in js/utils/validation.js).
 * @type {{
 *   rules: Record<string, GSSPanelRule>,
 *   validatePanel: (panelKey: string) => boolean,
 *   registerPanel: (key: string, rule: GSSPanelRule) => void,
 *   init: () => void
 * } | undefined}
 */
var GSSValidation;

/* ------------------------------------------------------------------
 * Authenticated session (shared by the login page and the app)
 * The signed-in user is kept in Web Storage under GSS_USER_KEY:
 *   • localStorage  when "Remember me" is checked (persists across restarts)
 *   • sessionStorage otherwise (cleared when the tab/browser closes)
 * ---------------------------------------------------------------- */

/** localStorage/sessionStorage key holding the signed-in user JSON. */
const GSS_USER_KEY = 'gss-user';

/**
 * Minimal session store. All members are static so any page/module can call
 * `GSSSession.get()` / `.set()` / `.clear()` without instantiation.
 */
const GSSSession = Object.freeze({
  /**
   * Persist the signed-in user. When `remember` is true the session survives
   * browser restarts (localStorage); otherwise it lives only for the tab
   * session (sessionStorage). The other store is cleared to avoid stale copies.
   * @param {Record<string, any>} user
   * @param {boolean} [remember=false]
   */
  set(user, remember = false) {
    try {
      const store = remember ? window.localStorage : window.sessionStorage;
      const other = remember ? window.sessionStorage : window.localStorage;
      other.removeItem(GSS_USER_KEY);
      store.setItem(GSS_USER_KEY, JSON.stringify(user || {}));
    } catch (_) { /* storage unavailable */ }
  },
  /**
   * The current signed-in user, or null when there is no active session.
   * @returns {Record<string, any> | null}
   */
  get() {
    try {
      const raw = window.sessionStorage.getItem(GSS_USER_KEY) || window.localStorage.getItem(GSS_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },
  /** Remove the session from both stores (logout). */
  clear() {
    try {
      window.sessionStorage.removeItem(GSS_USER_KEY);
      window.localStorage.removeItem(GSS_USER_KEY);
    } catch (_) { /* storage unavailable */ }
  },
  /**
   * Merge a patch into the stored session in place (whichever store holds it),
   * e.g. to refresh the role from the server without a re-login.
   * @param {Record<string, any>} patch
   */
  update(patch) {
    try {
      const inLocal = !!window.localStorage.getItem(GSS_USER_KEY);
      const store = inLocal ? window.localStorage : window.sessionStorage;
      const cur = this.get() || {};
      store.setItem(GSS_USER_KEY, JSON.stringify(Object.assign({}, cur, patch || {})));
    } catch (_) { /* storage unavailable */ }
  },
});

/* ------------------------------------------------------------------
 * Centralized role / access control
 * ------------------------------------------------------------------
 * Single source of truth for role-based access so individual pages and
 * reports never redefine their own role lists. Roles are compared in a
 * case-insensitive way against the signed-in user's `role`.
 * ---------------------------------------------------------------- */

/**
 * Roles allowed to open the standalone reporting dashboards
 * (training-register, attendance-sheet, …). Lower-cased for comparison.
 * @type {readonly string[]}
 */
const GSS_REPORT_ROLES = Object.freeze(['admin', 'head of training']);

/**
 * Shared access helpers. All members are static so any page/module can call
 * `GSSAccess.role()` / `.hasAny()` / `.canViewReports()` without instantiation.
 */
const GSSAccess = Object.freeze({
  /**
   * The signed-in user's role, lower-cased. Empty string when there is no
   * active session or the role is unknown.
   * @returns {string}
   */
  role() {
    try {
      const s = GSSSession.get();
      return s && s.role ? String(s.role).toLowerCase() : '';
    } catch (_) {
      return '';
    }
  },
  /**
   * True when the current role matches any of the supplied roles
   * (case-insensitive). An unknown/empty role never matches.
   * @param {string[]} roles
   * @returns {boolean}
   */
  hasAny(roles) {
    const r = this.role();
    if (!r) return false;
    return (roles || []).some((x) => String(x).toLowerCase() === r);
  },
  /**
   * True when the current user may view the reporting dashboards. An
   * unknown/empty role is permitted so the reports remain usable when opened
   * without a session (e.g. local development / Live Server).
   * @returns {boolean}
   */
  canViewReports() {
    const r = this.role();
    return !r || GSS_REPORT_ROLES.includes(r);
  },
});

/* ------------------------------------------------------------------
 * Actor propagation
 * ------------------------------------------------------------------
 * Attach the signed-in user to every API request via headers so the
 * server can stamp created_by / updated_by audit fields uniformly. Done
 * once here (global.js loads first) so individual fetch call sites need
 * no changes. Only requests to our own API get the headers — third-party
 * URLs are never touched.
 * ---------------------------------------------------------------- */
(() => {
  if (typeof window === 'undefined' || !window.fetch || /** @type {any} */ (window).__gssActorPatched) return;
  /** @type {any} */ (window).__gssActorPatched = true;
  const nativeFetch = window.fetch.bind(window);
  const isApi = (/** @type {any} */ url) => {
    const s = String(url || '');
    return s.startsWith(API_BASE) || s.indexOf('/api/') !== -1;
  };
  window.fetch = (/** @type {any} */ input, /** @type {any} */ init) => {
    try {
      const url = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
      if (isApi(url)) {
        const sess = (typeof GSSSession !== 'undefined' && GSSSession.get()) || {};
        const actorId = sess.user_id || sess.login_id || '';
        const actorName = sess.full_name || sess.username || '';
        const role = sess.role || '';
        if (actorId || actorName || role) {
          const headers = new Headers((init && init.headers) || (input && input.headers) || {});
          if (actorId && !headers.has('X-GSS-User-Id')) headers.set('X-GSS-User-Id', String(actorId));
          if (actorName && !headers.has('X-GSS-User-Name')) headers.set('X-GSS-User-Name', String(actorName));
          if (role && !headers.has('X-GSS-Role')) headers.set('X-GSS-Role', String(role));
          init = Object.assign({}, init, { headers });
        }
        if (sess.token) {
          const headers = new Headers((init && init.headers) || (input && input.headers) || {});
          if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + sess.token);
          init = Object.assign({}, init, { headers });
        }
      }
    } catch (_) { /* fall through to the native fetch untouched */ }
    return nativeFetch(input, init).then((res) => {
      try {
        const url = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
        if (isApi(url) && !/\/api\/(login|change-password|forgot-password)/.test(String(url))) {
          if (res.status === 401 && typeof GSSSession !== 'undefined' && GSSSession.get()) {
            // Expired / invalid token: end the session and return to sign-in.
            GSSSession.clear();
            if (!/login\.html$/.test(window.location.pathname)) window.location.replace('./login.html');
          } else if (res.status === 403 && /** @type {any} */ (window).GSSPerms) {
            // Permissions changed server-side: re-sync the UI.
            /** @type {any} */ (window).GSSPerms.refresh();
          }
        }
      } catch (_) { /* never break the caller */ }
      return res;
    });
  };
})();

/* ------------------------------------------------------------------
 * Permission-aware UI gating (GSSPerms)
 * ------------------------------------------------------------------
 * Fetches the signed-in user's effective permission map and hides any
 * element tagged with data-perm="section:action" when the action is not
 * allowed. This is a usability layer only — the server independently
 * enforces access on sensitive endpoints, so hiding a control is never
 * the sole protection (header-based auth is best-effort by design).
 * ---------------------------------------------------------------- */
const GSSPerms = (() => {
  /** @type {Record<string, string[]>} */
  let permMap = {};
  let loaded = false;
  /** @type {() => void} */
  let resolveReady = () => {};
  const ready = new Promise((r) => { resolveReady = () => r(true); });

  const ACTIONS = ['view', 'add', 'edit', 'delete', 'approve', 'print'];

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
   * @param {string} action    view | add | edit | delete | approve | print
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
  const canApprove = (/** @type {string} */ s) => canSection(s, 'approve');
  const canPrint = (/** @type {string} */ s) => canSection(s, 'print');

  /** First visible tab, used as a redirect target when a tab is denied. */
  const firstAllowedTab = () => Object.keys(TAB_SECTIONS).find((t) => canViewTab(t)) || null;

  const applyTabs = () => {
    Object.keys(TAB_SECTIONS).forEach((tab) => {
      const btn = document.getElementById(`tab-btn-${tab}`);
      if (btn) btn.classList.toggle('hidden', !canViewTab(tab));
    });
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
      const gt = /** @type {any} */ (window).GSSTabs;
      if (next && gt && typeof gt.switchTab === 'function') gt.switchTab(next);
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

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
    else refresh();
    // Re-sync when the tab regains focus (picks up admin permission changes).
    window.addEventListener('focus', () => { refresh(); });
    // Bound how long a revoked permission can stay effective in an open session.
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  }

  return {
    can, refresh, apply, ready, canSection,
    canAccessModule, canViewTab, canAdd, canEdit, canDelete, canApprove, canPrint,
    get loaded() { return loaded; },
    get map() { return permMap; },
  };
})();/** @type {any} */ (window).GSSPerms = GSSPerms;

/* ------------------------------------------------------------------
 * Dashboard statistic: real number of trainees who completed training.
 * Replaces the hard-coded placeholder when the stat element is present.
 * ---------------------------------------------------------------- */
(() => {
  if (typeof document === 'undefined') return;
  const fill = () => {
    const el = document.getElementById('statTraineesTrained');
    if (!el) return;
    fetch(`${API_BASE}/api/stats/trainees-trained`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => { if (d && typeof d.count === 'number') el.textContent = '+' + d.count; })
      .catch(() => { /* keep the static fallback */ });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill);
  else fill();
})();
