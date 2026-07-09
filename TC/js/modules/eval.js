// ── Panel 7 · Fiche d'Évaluation Individuelle — functions ──

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