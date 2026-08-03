// @ts-check
/// <reference path="./modules/registration.js" />
/// <reference path="./modules/applicant-link.js" />

// ── Authenticated session guard ────────────────────────────────
// Redirect to the login page when there is no active session, and wire the
// header user chip + logout button. GSSSession lives in js/global.js.
(() => {
  const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
  if (!session) {
    window.location.replace('./login.html');
    return;
  }
  // Render the current role as a fancy header badge. Exposed on window so
  // admin.js can refresh it once the live role is fetched from the server.
  const applyRoleBadge = (/** @type {string | undefined} */ roleName) => {
    const badge = document.getElementById('userChipRole');
    const text = document.getElementById('userChipRoleText');
    const current = (typeof GSSSession !== 'undefined' ? GSSSession.get() : null) || {};
    const r = String(roleName || current.role || '').trim();
    if (!badge || !text) return;
    if (!r) { badge.classList.add('hidden'); badge.classList.remove('inline-flex'); return; }
    let label = r;
    try {
      const lang = document.documentElement.lang || 'en';
      const key = 'role' + r.replace(/[^a-z]/gi, '');
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) label = dict[lang][key];
    } catch (_) { /* noop */ }
    text.textContent = label;
    badge.classList.remove('hidden');
    badge.classList.add('inline-flex');
  };
  /** @type {any} */ (window).GSSChip = { applyRoleBadge };
  const applyChip = () => {
    const chip = document.getElementById('userChip');
    const name = document.getElementById('userChipName');
    if (name) name.textContent = session.full_name || session.username || 'User';
    if (chip) { chip.classList.remove('hidden'); chip.classList.add('flex'); }
    applyRoleBadge(session.role);
    const btn = document.getElementById('logoutBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (typeof GSSSession !== 'undefined') GSSSession.clear();
        window.location.replace('./login.html');
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyChip);
  else applyChip();
})();

const modal = document.getElementById('formModal');
const openFormBtn = document.getElementById('openFormBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// ── Tab state ──────────────────────────────────────────────
/** @type {Record<string, boolean>} */
const tabState = { registration: false, conditions: false, reglement: false, engagement: false, presences: false, 
                   evaluation: false, exam: false, mensuration: false, 
                   // lettre: false, uniforme: false, 
                   dossier: false };

let defaultTab = Object.keys(tabState)[0];; //'registration';

//#region FILL THE FORM BUTTON / OPEN DEFAULT TAB (REGISTRATION FOR NOW)
const openModal = () => {
  modal?.classList.add('flex');
  modal?.classList.remove('hidden');
  switchTab(defaultTab);
};
openFormBtn?.addEventListener('click', openModal);
//#endregion

//#region SWITCH TABS
const TAB_ORDER = Object.keys(tabState);

// Tabs that are force-locked regardless of the sequential flow (e.g. the
// Conditions tab stays disabled until an applicant's interview is Accepted).
/** @type {Set<string>} */
const forcedLockedTabs = new Set();

// A tab unlocks only once the previous tab in the flow is completed (green).
/** @param {string} name @returns {boolean} */
const isTabUnlocked = (name) => {
  if (forcedLockedTabs.has(name)) return false; // explicit override wins.
  const idx = TAB_ORDER.indexOf(name);
  if (idx <= 0) return true; // Registration is always reachable.
  return !!tabState[TAB_ORDER[idx - 1]];
};

/** Dim + disable every tab that is not yet unlocked. */
const updateTabLocks = () => {
  TAB_ORDER.forEach((name) => {
    const btn = document.getElementById(`tab-btn-${name}`);
    if (!btn) return;
    const locked = !isTabUnlocked(name);
    btn.classList.toggle('opacity-40', locked);
    btn.classList.toggle('cursor-not-allowed', locked);
    btn.classList.toggle('pointer-events-none', locked);
    btn.setAttribute('aria-disabled', String(locked));
  });
};

/** @param {string} tabName */
const switchTab = (tabName) => {
  // Enforce the sequential workflow: locked tabs cannot be opened.
  if (!isTabUnlocked(tabName)) return;

  // Hide all panels
  document.querySelectorAll('.gss-tab-panel').forEach(p => p.classList.add('hidden'));

  // Reset all tabs
  document.querySelectorAll('.gss-tab-btn').forEach(btn => {
    btn.classList.remove(TAB_ACTIVE_BORDER, TAB_ACTIVE_TEXT,'font-bold');
    btn.classList.add('border-b-transparent');
  });

  // Show selected panel
  const panel = document.getElementById(`panel-${tabName}`);
  panel?.classList.remove('hidden');
  panel?.classList.add('overflow-auto');

  // Restore tab indicators
  Object.keys(tabState).forEach(name => {
    const dot = document.querySelector(`#tab-btn-${name} .gss-tab-dot`);
    if (!dot) return;

    dot.classList.remove(TAB_DONE_BG, TAB_PENDING_BG, TAB_ACTIVE_BG);

    if (tabState[name]){
       markTab(name, dot);
       defaultTab = name;
    } else dot.classList.add(TAB_PENDING_BG);
  });

  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.remove('border-b-transparent');

    activeBtn.classList.add(
      TAB_ACTIVE_BORDER,
      TAB_ACTIVE_TEXT,
      'font-bold'
    );

    const dot = activeBtn.querySelector('.gss-tab-dot');

    if (dot && !tabState[tabName]) {
      dot.classList.remove(TAB_PENDING_BG);
      dot.classList.add(TAB_ACTIVE_BG);
    }
  }

  // Scroll to top
  document.getElementById('formContent')?.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

  // Refresh the read-only Training Officer signature whenever the
  // Commitment (engagement) panel is opened, so a signature designated
  // after page load shows up without needing a reload.
  if (tabName === 'engagement') {
    try {
      const linker = /** @type {any} */ (window).GSSApplicant;
      if (linker && typeof linker.loadOfficerSignature === 'function') linker.loadOfficerSignature();
    } catch (_) { /* noop */ }
  }

  defaultTab = tabName;
  updateTabLocks();
}

/**
 * @param {string} tabName
 * @param {Element} dot
 * @param {string} [bgColor]
 * @param {string} [text]
 */
const markTab = (tabName, dot, bgColor = TAB_DONE_BG, text = '✓') => {
  tabState[tabName] = true;
  dot.classList.add(bgColor); 
  dot.textContent = text;
}

// REGISTER CLICK EVENT OF ALL TABS
document.querySelectorAll('.gss-tab-btn').forEach(btn => {
  const tabBtn = /** @type {HTMLElement} */ (btn);
  tabBtn.addEventListener('click', () => switchTab(tabBtn.dataset.tab ?? defaultTab));
});

// Apply the initial lock state (only Registration is reachable at first).
updateTabLocks();

// Public helper so other modules (e.g. applicant-link.js) can force a tab to be
// locked/unlocked independently of the sequential flow, then refresh the UI.
/** @type {any} */ (window).GSSTabs = {
  setForcedLock: (/** @type {string} */ tab, /** @type {boolean} */ locked) => {
    if (locked) forcedLockedTabs.add(tab);
    else forcedLockedTabs.delete(tab);
    updateTabLocks();
  },
};
//#endregion

//#region CLOSE MODAL
const closeModal = () => {
  modal?.classList.add('hidden');
};
closeModalBtn?.addEventListener('click', closeModal);
//#endregion

// LOAD APP
async function initializeApp() {
    try {
        // Convert every native date field to a dd/MM/yyyy masked text input so the
        // format is identical in every browser (value stays ISO for the backend).
        if (/** @type {any} */ (window).GSSDate) /** @type {any} */ (window).GSSDate.dateify(document);

        await Promise.all([
            initInscriptionForm(),
            initSignaturePads(),
            
            initApplicantForm()
        ]);

        console.log('Application initialized');

    } catch (error) {
        console.error('Initialization failed:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}