// @ts-check

const modal = document.getElementById('formModal');
const openFormBtn = document.getElementById('openFormBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// ── Tab state ──────────────────────────────────────────────
/** @type {Record<string, boolean>} */
const tabState = { registration: true, conditions: false, reglement: false, engagement: false, presences: false, 
                   evaluation: false, exam: false, mensuration: false, 
                   // lettre: false, uniforme: false, 
                   dossier: false };

let defaultTab = 'registration';

//#region FILL THE FORM BUTTON / OPEN DEFAULT TAB (REGISTRATION FOR NOW)
const openModal = () => {
  modal?.classList.add('flex');
  modal?.classList.remove('hidden');
  switchTab(defaultTab);
};
openFormBtn?.addEventListener('click', openModal);
//#endregion

//#region SWITCH TABS
/** @param {string} tabName */
const switchTab = (tabName) => {
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

  defaultTab = tabName;
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
//#endregion

//#region CLOSE MODAL
const closeModal = () => {
  modal?.classList.add('hidden');
};
closeModalBtn?.addEventListener('click', closeModal);
//#endregion