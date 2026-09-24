// @ts-check
// ── Panel 7 · Fiche d'Évaluation Individuelle — functions ──

/** Clamp a score cell to its [min, max] range so a value above the field's
 * cap (e.g. 10) can never be entered. */
function clampEvalNote(/** @type {HTMLInputElement} */ input) {
  if (!input || input.value === '') return;
  const v = parseFloat(input.value);
  if (Number.isNaN(v)) return;
  const max = input.max !== '' ? parseFloat(input.max) : Infinity;
  const min = input.min !== '' ? parseFloat(input.min) : 0;
  let clamped = v;
  if (clamped > max) clamped = max;
  if (clamped < min) clamped = min;
  const s = String(clamped);
  if (input.value !== s) input.value = s;
}

function updateEvalSummary() {
  const rows = document.querySelectorAll('#eval-tbody tr');
  let totalObt = 0;
  let hasAny = false;
  rows.forEach(row => {
    const obtInput = /** @type {HTMLInputElement | null} */ (row.querySelector('.eval-note-obt'));
    const val = obtInput && obtInput.value !== '' ? parseFloat(obtInput.value) : NaN;
    if (!isNaN(val)) { totalObt += val; hasAny = true; }
  });

  const el = (/** @type {string} */ id) => document.getElementById(id);
  const totalObtEl = el('eval-total-obt');
  if (totalObtEl) totalObtEl.textContent = hasAny ? String(totalObt) : '—';

  const t = translations[currentLang] || translations.en;
  let cat = '—', catColor = 'text-slate-500';
  if (hasAny) {
    if (totalObt >= 85)      { cat = t.evalOptExcellent      || 'Excellent (85–100)';      catColor = 'text-[#042F8D]'; }
    else if (totalObt >= 70) { cat = t.evalOptVeryGood       || 'Very Good (70–84)';       catColor = 'text-green-600'; }
    else if (totalObt >= 60) { cat = t.evalOptAcceptable     || 'Acceptable (60–69)';      catColor = 'text-amber-600'; }
    else                     { cat = t.evalOptNotRecommended || 'Not Recommended (<60)';   catColor = 'text-red-600'; }
  }
  const resultCatEl = el('eval-result-cat');
  if (resultCatEl) {
    resultCatEl.textContent = cat;
    resultCatEl.className = `mb-1 block text-base font-bold ${catColor}`;
  }
}

(function initEvaluationPanel() { 
  document.querySelectorAll('#eval-tbody .eval-note-obt').forEach(inp => {
    const input = /** @type {HTMLInputElement} */ (inp);
    input.addEventListener('input', () => { clampEvalNote(input); updateEvalSummary(); });
  });
  updateEvalSummary();
}());