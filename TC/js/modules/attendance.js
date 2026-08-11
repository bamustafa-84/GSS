// @ts-check

// ── Panel 5 · Rapport Individuel de Présences — functions ──
// The attendance history table is READ-ONLY: every cell is rendered as
// plain text (no inputs, no per-row Remove button). Rows are fed in via
// window.GSSPresences.setRows(...) once applicant data is available.

function getPresDayName(/** @type {string} */ dateValue) {
  if (!dateValue) return '';
  // The date field may hold dd/MM/yyyy (masked) or ISO — normalise to ISO.
  const iso = /** @type {any} */ (window).GSSDate ? /** @type {any} */ (window).GSSDate.toISO(dateValue) : dateValue;
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const names = PRES_DAY_NAMES[currentLang] || PRES_DAY_NAMES.en;
  return names[d.getDay()];
}

/** Map a status code (AH/AR/ABS/EX) to its localized label. */
function getPresStatusLabel(/** @type {string} */ value) {
  if (!value) return '';
  const opts = PRES_STATUS_OPTS[currentLang] || PRES_STATUS_OPTS.en;
  const found = opts.find(o => o.value === value);
  return found ? found.text : value;
}

/** Tailwind classes for the status pill by code. */
function getPresStatusClass(/** @type {string} */ value) {
  switch (value) {
    case 'AH': return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'AR': return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'ABS': return 'bg-red-50 text-red-600 ring-red-200';
    case 'EX': return 'bg-slate-100 text-slate-600 ring-slate-300';
    default: return 'bg-slate-50 text-slate-500 ring-slate-200';
  }
}

function updatePresenceSummary() {
  const rows = document.querySelectorAll('#presences-tbody tr[data-pres-row]');
  let ah = 0, ar = 0, abs = 0, ex = 0;
  rows.forEach(row => {
    const status = /** @type {HTMLElement} */ (row).dataset.status || '';
    if (status === 'AH') ah++;
    else if (status === 'AR') ar++;
    else if (status === 'ABS') abs++;
    else if (status === 'EX') ex++;
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

// Re-label the read-only status pills when the language changes.
function updatePresStatusOptions() {
  document.querySelectorAll('#presences-tbody tr[data-pres-row]').forEach(row => {
    const status = /** @type {HTMLElement} */ (row).dataset.status || '';
    const cell = /** @type {HTMLElement | null} */ (row.querySelector('.pres-status-cell'));
    if (cell) cell.textContent = getPresStatusLabel(status);
  });
}

// Re-compute the read-only day names when the language changes.
function updatePresDayCells() {
  document.querySelectorAll('#presences-tbody tr[data-pres-row]').forEach(row => {
    const date = /** @type {HTMLElement} */ (row).dataset.date || '';
    const dayCell = /** @type {HTMLElement | null} */ (row.querySelector('.pres-day-cell'));
    if (dayCell && date) dayCell.textContent = getPresDayName(date);
  });
}

/**
 * Render a single read-only attendance row.
 * @param {{ date?: string, status?: string, arrival?: string, departure?: string, observations?: string }} data
 */
function renderPresenceRow(data) {
  const tbody = document.getElementById('presences-tbody');
  if (!tbody) return;

  const date = data.date || '';
  const status = data.status || '';
  const cellCls = 'px-3 py-2.5 align-middle text-slate-700';

  const tr = document.createElement('tr');
  tr.setAttribute('data-pres-row', '');
  tr.dataset.date = date;
  tr.dataset.status = status;
  tr.className = 'hover:bg-slate-50/60';
  tr.innerHTML = `
    <td class="${cellCls} whitespace-nowrap font-medium text-slate-800 pres-date-cell">${date || '—'}</td>
    <td class="${cellCls} whitespace-nowrap pres-day-cell">${date ? getPresDayName(date) : '—'}</td>
    <td class="${cellCls}">
      <span class="pres-status-cell inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${getPresStatusClass(status)}">${getPresStatusLabel(status) || '—'}</span>
    </td>
    <td class="${cellCls} whitespace-nowrap pres-arrival-cell">${data.arrival || '—'}</td>
    <td class="${cellCls} whitespace-nowrap pres-depart-cell">${data.departure || '—'}</td>
    <td class="${cellCls} pres-obs-cell">${data.observations || '—'}</td>`;

  tbody.appendChild(tr);
}

/**
 * Replace all attendance rows with the given read-only data set.
 * @param {Array<{ date?: string, status?: string, arrival?: string, departure?: string, observations?: string }>} rows
 */
function setPresenceRows(rows) {
  const tbody = document.getElementById('presences-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (Array.isArray(rows) ? rows : []).forEach(renderPresenceRow);
  updatePresenceSummary();
}

// Exposed so applicant loading / other modules can feed read-only rows.
/** @type {any} */ (window).GSSPresences = {
  setRows: setPresenceRows,
  clear: () => setPresenceRows([]),
};

// ── Dictionary-backed dropdown hooks (Training Title & Trainer) ──
// Mirror the registration module's GSSEducationLevel contract so the
// shared Dictionary manager can (re)populate these selects from the DB.
/**
 * @param {HTMLSelectElement | null} select
 * @returns {{ setOptions: (items: { code?: string, label: string }[]) => void }}
 */
function makeSelectHook(select) {
  return {
    setOptions(items) {
      if (!select) return;
      // Keep the static fallback options when the dictionary is empty/unreachable.
      if (!Array.isArray(items) || !items.length) return;
      const current = select.value;
      const placeholder = select.querySelector('option[value=""]');
      select.innerHTML = '';
      if (placeholder) select.appendChild(placeholder);
      items.forEach((it) => {
        const opt = document.createElement('option');
        opt.value = it.code || it.label;
        opt.textContent = it.label;
        select.appendChild(opt);
      });
      if (current) select.value = current;
    },
  };
}

(function initPresencesPanel() {
  const trainingSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('att-TrainingTitle'));
  const trainerSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('att-Trainer'));
  /** @type {any} */ (window).GSSTrainingTitle = makeSelectHook(trainingSelect);
  /** @type {any} */ (window).GSSTrainer = makeSelectHook(trainerSelect);

  // Read-only history starts empty; rows arrive via GSSPresences.setRows().
  updatePresenceSummary();
}());
