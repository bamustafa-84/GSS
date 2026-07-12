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
