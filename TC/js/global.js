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
const API_BASE = (() => {
  try {
    if (/^https?:$/.test(location.protocol) && location.port !== '5500') return location.origin;
  } catch (_) { /* non-browser context */ }
  return 'http://localhost:4000';
})();

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
