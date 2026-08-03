// @ts-check
let presRowCounter = 0;

// ── Panel 5 · Rapport Individuel de Présences — functions ──

function getPresDayName(/** @type {string} */ dateValue) {
  if (!dateValue) return '';
  // The date field may hold dd/MM/yyyy (masked) or ISO — normalise to ISO.
  const iso = /** @type {any} */ (window).GSSDate ? /** @type {any} */ (window).GSSDate.toISO(dateValue) : dateValue;
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const names = PRES_DAY_NAMES[currentLang] || PRES_DAY_NAMES.en;
  return names[d.getDay()];
}

function updatePresenceSummary() {
  const rows = document.querySelectorAll('#presences-tbody tr');
  let ah = 0, ar = 0, abs = 0, ex = 0;
  rows.forEach(row => {
    const sel = /** @type {HTMLSelectElement | null} */ (row.querySelector('.pres-status-select'));
    if (!sel) return;
    if (sel.value === 'AH') ah++;
    else if (sel.value === 'AR') ar++;
    else if (sel.value === 'ABS') abs++;
    else if (sel.value === 'EX') ex++;
  });
  const total = rows.length;
  const present = ah + ar;
  const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';

  const el = (/** @type {string} */ id) => document.getElementById(id);
  const nbJours = el('pres-nb-jours');   if (nbJours) nbJours.textContent = String(total);
  const countAh = el('pres-count-ah');   if (countAh) countAh.textContent = String(ah);
  const countAr = el('pres-count-ar');   if (countAr) countAr.textContent = String(ar);
  const countAbs = el('pres-count-abs'); if (countAbs) countAbs.textContent = String(abs);
  const countEx = el('pres-count-ex');   if (countEx) countEx.textContent = String(ex);
  const taux = el('pres-taux');          if (taux) taux.textContent = rate + ' %';
}

function updatePresStatusOptions() {
  const opts = PRES_STATUS_OPTS[currentLang] || PRES_STATUS_OPTS.en;
  document.querySelectorAll('.pres-status-select').forEach(el => {
    const sel = /** @type {HTMLSelectElement} */ (el);
    const currentVal = sel.value;
    sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
    sel.value = currentVal;
  });
}

function updatePresDayCells() {
  document.querySelectorAll('#presences-tbody tr').forEach(row => {
    const dateInput = /** @type {HTMLInputElement | null} */ (row.querySelector('.pres-date-input'));
    const dayCell   = /** @type {HTMLInputElement | null} */ (row.querySelector('.pres-day-cell'));
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
  const dateInput = /** @type {HTMLInputElement | null} */ (tr.querySelector('.pres-date-input'));
  const dayCell   = /** @type {HTMLInputElement | null} */ (tr.querySelector('.pres-day-cell'));
  if (dateInput && dayCell) {
    dateInput.addEventListener('change', () => {
      dayCell.value = getPresDayName(dateInput.value);
      updatePresenceSummary();
    });
  }

  tr.querySelector('.pres-status-select')?.addEventListener('change', updatePresenceSummary);

  tr.querySelector('.pres-remove-btn')?.addEventListener('click', () => {
    tr.remove();
    updatePresenceSummary();
  });

  tbody.appendChild(tr);
  // Convert the row's native date field to a dd/MM/yyyy masked text input.
  if (/** @type {any} */ (window).GSSDate) /** @type {any} */ (window).GSSDate.dateify(tr);
  updatePresenceSummary();
}

// Wire up add-row button and add one initial row
(function initPresencesPanel() {
  const addRowBtn = document.getElementById('pres-add-row-btn');
  if (addRowBtn) addRowBtn.addEventListener('click', addPresenceRow);
  addPresenceRow(); // start with one empty row
}());