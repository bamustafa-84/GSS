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
  modal?.setAttribute('aria-hidden', 'false');
  switchTab(defaultTab);
};
openFormBtn?.addEventListener('click', openModal);
//#endregion

//#region SWITCH TABS
const TAB_ORDER = ['registration', 'conditions', 'reglement', 'engagement', 'presences', 'exam', 'evaluation', 'mensuration', 'dossier'];

// Tabs that are force-locked regardless of the sequential flow (e.g. the
// Conditions tab stays disabled until an applicant's interview is Accepted).
/** @type {Set<string>} */
const forcedLockedTabs = new Set();

// Tabs that are force-UNLOCKED regardless of the sequential flow (e.g. the
// Exam result panel becomes reachable once the candidate has finished the exam).
/** @type {Set<string>} */
const forcedUnlockedTabs = new Set();

// Tabs an Instructor may never open (intake workflow handled by other roles).
/** @type {Set<string>} */
const INSTRUCTOR_LOCKED_TABS = new Set(['registration', 'conditions', 'reglement']);

// A tab unlocks only once the previous tab in the flow is completed (green).
/** @param {string} name @returns {boolean} */
const isTabUnlocked = (name) => {
  // Instructors never handle intake: the Registration / Conditions / Rules
  // tabs stay locked for them regardless of any forced-unlock overrides.
  if (INSTRUCTOR_LOCKED_TABS.has(name)) {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    if (session && String(session.role) === 'Instructor') return false;
  }
  if (forcedLockedTabs.has(name)) return false; // explicit lock wins.
  if (forcedUnlockedTabs.has(name)) return true; // explicit unlock overrides sequence.
  // The Dossier (checklist) panel is reachable for every user. Attendance and
  // Exam stay strictly sequential for all roles (Exam is force-unlocked via
  // applicant-link.js only once the candidate has a live/corrected attempt).
  if (name === 'dossier') return true;
  const idx = TAB_ORDER.indexOf(name);
  if (idx <= 0) return true; // Registration is always reachable.
  return !!tabState[TAB_ORDER[idx - 1]];
};

/** Whether the workflow has sequentially reached a tab's step for the loaded
 *  record (ignores forced unlocks — it reflects real candidate progress). */
/** @param {string} name @returns {boolean} */
const isStepReached = (name) => {
  const idx = TAB_ORDER.indexOf(name);
  if (idx <= 0) return true; // Registration is the first step.
  return !!tabState[TAB_ORDER[idx - 1]];
};

/** Replace a panel's content with an "In Progress" placeholder. */
const showPanelInProgress = (/** @type {HTMLElement} */ panel) => {
  if (panel.dataset.progressGate === '1') return;
  panel.dataset.progressGate = '1';
  Array.from(panel.children).forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    el.dataset.progressPrevDisplay = el.style.display;
    el.style.display = 'none';
  });
  let label = 'In progress';
  try {
    const lang = document.documentElement.lang || 'en';
    const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
    if (dict && dict[lang] && dict[lang].stepInProgress) label = dict[lang].stepInProgress;
  } catch (_) { /* noop */ }
  const ph = document.createElement('div');
  ph.className = 'gss-progress-ph flex flex-col items-center justify-center gap-3 py-20 text-center';
  ph.innerHTML = `
    <span class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
    </span>
    <p class="max-w-md text-base font-bold text-slate-500" data-i18n="stepInProgress">${label}</p>`;
  panel.appendChild(ph);
};

/** Restore a panel previously replaced by showPanelInProgress. */
const clearPanelInProgress = (/** @type {HTMLElement} */ panel) => {
  if (panel.dataset.progressGate !== '1') return;
  delete panel.dataset.progressGate;
  Array.from(panel.children).forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    if (el.classList.contains('gss-progress-ph')) { el.remove(); return; }
    el.style.display = el.dataset.progressPrevDisplay || '';
    delete el.dataset.progressPrevDisplay;
  });
};

/** Instructors only see a panel's content once its workflow step is reached;
 *  earlier panels show an "In Progress" placeholder (no fields, no buttons). */
const applyInstructorStepGates = () => {
  const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
  const gate = !!session && String(session.role) === 'Instructor';
  TAB_ORDER.forEach((name) => {
    const panel = document.getElementById(`panel-${name}`);
    if (!panel) return;
    // Intake panels are never the Instructor's to view; his own panels stay
    // "In Progress" until the workflow sequentially reaches their step.
    const notReached = INSTRUCTOR_LOCKED_TABS.has(name) || !isStepReached(name);
    if (gate && notReached) showPanelInProgress(/** @type {HTMLElement} */ (panel));
    else clearPanelInProgress(/** @type {HTMLElement} */ (panel));
  });
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
  applyInstructorStepGates();
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

    // Bring the active tab into view in the horizontal tab strip so panels near
    // the end (e.g. Checklist) are visible without manual scrolling.
    try {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } catch (_) { /* noop */ }
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

  // Opening the Exam Result panel means the candidate's attendance phase is over,
  // so mark the Attendance panel completed (green ✓) and lock all its fields.
  if (tabName === 'exam') {
    try {
      const pres = /** @type {any} */ (window).GSSPresences;
      if (pres && typeof pres.markComplete === 'function') pres.markComplete();
    } catch (_) { /* noop */ }
    // Re-check the real exam status so a candidate who has not taken the exam
    // sees only the "not taken yet" message instead of a stale result form.
    try {
      const linker = /** @type {any} */ (window).GSSApplicant;
      if (linker && typeof linker.refreshExamPanel === 'function') linker.refreshExamPanel();
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

// Role-based tab overrides: the Dossier (checklist) panel is always reachable.
// Attendance and Exam stay sequential for every role (Exam is force-unlocked
// via applicant-link.js only when the candidate has a live/corrected attempt).
const currentRole = (typeof GSSSession !== 'undefined' ? GSSSession.get()?.role : '') || '';
// Instructors never handle intake: the Registration, Conditions and Rules
// tabs stay dimmed and unclickable for them (enforced in isTabUnlocked).
if (currentRole === 'Instructor') {
  defaultTab = 'exam';
}
forcedUnlockedTabs.add('dossier');

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
  setForcedUnlock: (/** @type {string} */ tab, /** @type {boolean} */ unlocked) => {
    if (unlocked) forcedUnlockedTabs.add(tab);
    else forcedUnlockedTabs.delete(tab);
    updateTabLocks();
  },
};
//#endregion

//#region CLOSE MODAL
const closeModal = () => {
  // Move focus out first so no focused descendant is left inside an
  // aria-hidden ancestor (accessibility requirement).
  try {
    const active = document.activeElement;
    if (active && modal && modal.contains(active)) /** @type {HTMLElement} */ (active).blur();
  } catch (_) { /* noop */ }
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  modal?.setAttribute('aria-hidden', 'true');
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