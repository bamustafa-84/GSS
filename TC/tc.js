const modal = document.getElementById('formModal');

const closeModalBtn = document.getElementById('closeModalBtn');

// ── Tab state ──────────────────────────────────────────────
const tabState = { registration: true, conditions: false, reglement: false, engagement: false, presences: false, 
                   evaluation: false, exam: false, mensuration: false, lettre: false, uniforme: false, dossier: false };


//#region FILL THE FORM BUTTON / TABS
const openFormBtn = document.getElementById('openFormBtn');

// ── Modal open/close ───────────────────────────────────────
const openModal = () => {
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('overflow-hidden');
  switchTab('registration');
};

openFormBtn.addEventListener('click', openModal);
//#endregion

//#region SWITCH TABS
let currentTab = 'registration';

const switchTab = (tabId) => {
  // Hide all panels
  document.querySelectorAll('.gss-tab-panel').forEach(p => p.classList.add('hidden'));

  // Reset all tabs
  document.querySelectorAll('.gss-tab-btn').forEach(btn => {
    btn.classList.remove(TAB_ACTIVE_BORDER, TAB_ACTIVE_TEXT,'font-bold');
    btn.classList.add('border-b-transparent');
  });

  // Show selected panel
  const panel = document.getElementById(`panel-${tabId}`);
  panel?.classList.remove('hidden');
  panel?.classList.add('overflow-auto');

  // Restore tab indicators
  Object.keys(tabState).forEach(id => {
    const dot = document.querySelector(`#tab-btn-${id} .gss-tab-dot`);
    if (!dot) return;

    dot.classList.remove(TAB_DONE_BG, TAB_PENDING_BG, TAB_ACTIVE_BG);

    if (tabState[id]){
       markTab(id, dot);
       currentTab = tabId;
    } else dot.classList.add(TAB_PENDING_BG);
  });

  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.remove('border-b-transparent');

    activeBtn.classList.add(
      TAB_ACTIVE_BORDER,
      TAB_ACTIVE_TEXT,
      'font-bold'
    );

    const dot = activeBtn.querySelector('.gss-tab-dot');

    if (dot && !tabState[tabId]) {
      dot.classList.remove(TAB_PENDING_BG);
      dot.classList.add(TAB_ACTIVE_BG);
    }
  }

  // Scroll to top
  document.getElementById('formContent')?.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

  currentTab = tabId;
}

const markTab = (tabId, dot, bgColor = TAB_DONE_BG, text = '✓') => {
  tabState[tabId] = true;
  dot.classList.add(bgColor); 
  dot.textContent = text;
}
//#endregion

//#region CLOSE MODAL
const closeModal = () => {
  modal.classList.remove('flex');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('overflow-hidden');
};

closeModalBtn.addEventListener('click', closeModal);

modal.addEventListener('click', (event) => {
  if (event.target === modal) 
    closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') 
    closeModal();
});
//#endregion



//── Tab button clicks ──────────────────────────────────────
document.querySelectorAll('.gss-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Acknowledgment checkboxes (tabs 2, 3, 4) ──────────────
document.querySelectorAll('.gss-ack-check').forEach(checkbox => {
  checkbox.addEventListener('change', () => {
    const tabId = checkbox.dataset.tab;
    const dot = document.querySelector(`#tab-btn-${tabId} .gss-tab-dot`);
    if (checkbox.checked) {
      markTab(tabId, dot);
    } else {
      tabState[tabId] = false;
      if (dot) {
        dot.style.background = currentTab === tabId ? TAB_ACTIVE_BG : TAB_PENDING_BG;
        const TAB_NUMS = { registration: '1', conditions: '2', reglement: '3', engagement: '4', presences: '5', evaluation: '6', exam: '7', mensuration: '8', lettre: '9', uniforme: '10', dossier: '11' };
        dot.textContent = TAB_NUMS[tabId] || '?';
      }
    }
  });
});



let presRowCounter = 0;

// ── Panel 5 · Rapport Individuel de Présences — functions ──

function getPresDayName(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue + 'T00:00:00');
  const names = PRES_DAY_NAMES[currentLang] || PRES_DAY_NAMES.en;
  return names[d.getDay()];
}

function updatePresenceSummary() {
  const rows = document.querySelectorAll('#presences-tbody tr');
  let ah = 0, ar = 0, abs = 0, ex = 0;
  rows.forEach(row => {
    const sel = row.querySelector('.pres-status-select');
    if (!sel) return;
    if (sel.value === 'AH') ah++;
    else if (sel.value === 'AR') ar++;
    else if (sel.value === 'ABS') abs++;
    else if (sel.value === 'EX') ex++;
  });
  const total = rows.length;
  const present = ah + ar;
  const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';

  const el = (id) => document.getElementById(id);
  if (el('pres-nb-jours'))  el('pres-nb-jours').textContent  = total;
  if (el('pres-count-ah'))  el('pres-count-ah').textContent  = ah;
  if (el('pres-count-ar'))  el('pres-count-ar').textContent  = ar;
  if (el('pres-count-abs')) el('pres-count-abs').textContent = abs;
  if (el('pres-count-ex'))  el('pres-count-ex').textContent  = ex;
  if (el('pres-taux'))      el('pres-taux').textContent      = rate + ' %';
}

function updatePresStatusOptions() {
  const opts = PRES_STATUS_OPTS[currentLang] || PRES_STATUS_OPTS.en;
  document.querySelectorAll('.pres-status-select').forEach(sel => {
    const currentVal = sel.value;
    sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
    sel.value = currentVal;
  });
}

function updatePresDayCells() {
  document.querySelectorAll('#presences-tbody tr').forEach(row => {
    const dateInput = row.querySelector('.pres-date-input');
    const dayCell   = row.querySelector('.pres-day-cell');
    if (dateInput && dayCell && dateInput.value) {
      dayCell.value = getPresDayName(dateInput.value);
    }
  });
}

function addPresenceRow() {
  presRowCounter++;
  const tbody = document.getElementById('presences-tbody');
  if (!tbody) return;

  const opts = PRES_STATUS_OPTS[currentLang] || PRES_STATUS_OPTS.en;
  const optsHTML = opts.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
  const inputCls = 'w-full rounded-xl border-[1.5px] border-[#dbe2f0] bg-white px-2 py-1.5 text-sm text-slate-800 transition focus:border-[#042F8D] focus:outline-none focus:ring-4 focus:ring-[#042F8D]/10';
  const removeLbl = translations[currentLang]?.presBtnRemove || 'Remove';

  const tr = document.createElement('tr');
  tr.className = 'border-b border-slate-100 hover:bg-slate-50/50';
  tr.innerHTML = `
    <td class="p-2 align-middle">
      <input type="date" class="pres-date-input ${inputCls} min-w-[130px]" />
    </td>
    <td class="p-2 align-middle">
      <input type="text" readonly class="pres-day-cell ${inputCls} min-w-[100px] cursor-default bg-slate-50 text-slate-500" />
    </td>
    <td class="p-2 align-middle">
      <select class="pres-status-select ${inputCls} min-w-[150px]">${optsHTML}</select>
    </td>
    <td class="p-2 align-middle">
      <input type="time" class="pres-arrival-input ${inputCls} min-w-[110px]" />
    </td>
    <td class="p-2 align-middle">
      <input type="time" class="pres-depart-input ${inputCls} min-w-[110px]" />
    </td>
    <td class="p-2 align-middle">
      <input type="text" class="pres-obs-input ${inputCls} min-w-[130px]" />
    </td>
    <td class="p-2 align-middle text-center">
      <button type="button" class="pres-remove-btn inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-100">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        <span data-i18n="presBtnRemove">${removeLbl}</span>
      </button>
    </td>`;

  // Auto-fill day name when date is picked
  const dateInput = tr.querySelector('.pres-date-input');
  const dayCell   = tr.querySelector('.pres-day-cell');
  dateInput.addEventListener('change', () => {
    dayCell.value = getPresDayName(dateInput.value);
    updatePresenceSummary();
  });

  tr.querySelector('.pres-status-select').addEventListener('change', updatePresenceSummary);

  tr.querySelector('.pres-remove-btn').addEventListener('click', () => {
    tr.remove();
    updatePresenceSummary();
  });

  tbody.appendChild(tr);
  updatePresenceSummary();
}

// Wire up add-row button and add one initial row
(function initPresencesPanel() {
  const addRowBtn = document.getElementById('pres-add-row-btn');
  if (addRowBtn) addRowBtn.addEventListener('click', addPresenceRow);
  addPresenceRow(); // start with one empty row
}());

// ── Panel 6 · Fiche d'Évaluation Individuelle — functions ──

function updateEvalSummary() {
  const rows = document.querySelectorAll('#eval-tbody tr');
  let totalObt = 0;
  let hasAny = false;
  rows.forEach(row => {
    const obtInput = row.querySelector('.eval-note-obt');
    const val = obtInput?.value !== '' ? parseFloat(obtInput?.value) : NaN;
    if (!isNaN(val)) { totalObt += val; hasAny = true; }
  });

  const el = (id) => document.getElementById(id);
  if (el('eval-total-obt')) el('eval-total-obt').textContent = hasAny ? totalObt : '—';

  const t = translations[currentLang] || translations.en;
  let cat = '—', catColor = 'text-slate-500';
  if (hasAny) {
    if (totalObt >= 85)      { cat = t.evalOptExcellent      || 'Excellent (85–100)';      catColor = 'text-[#042F8D]'; }
    else if (totalObt >= 70) { cat = t.evalOptVeryGood       || 'Very Good (70–84)';       catColor = 'text-green-600'; }
    else if (totalObt >= 60) { cat = t.evalOptAcceptable     || 'Acceptable (60–69)';      catColor = 'text-amber-600'; }
    else                     { cat = t.evalOptNotRecommended || 'Not Recommended (<60)';   catColor = 'text-red-600'; }
  }
  if (el('eval-result-cat')) {
    el('eval-result-cat').textContent = cat;
    el('eval-result-cat').className = `mb-1 block text-base font-bold ${catColor}`;
  }
}

(function initEvaluationPanel() {
  document.querySelectorAll('#eval-tbody .eval-note-obt').forEach(inp => {
    inp.addEventListener('input', updateEvalSummary);
  });
  updateEvalSummary();
}());


