// @ts-check
/**
 * GSS · Training Register report
 * ==================================================================
 * Standalone reporting dashboard (reports/training-register/*.html).
 *
 * Responsibilities: data retrieval, client-side filtering, KPI/chart/table
 * rendering, sorting, pagination, export (Excel / PDF / Print), localization
 * and UI state (loading / empty / error).
 *
 * Localization reuses the app's shared `translations` dictionary (loaded via
 * translation.js) plus the `gss-lang` localStorage key, so no user-facing
 * text is hard-coded here.
 */
(() => {
  'use strict';

  const STATUS_STYLES = {
    Planned: 'bg-blue-100 text-blue-700',
    'In Progress': 'bg-amber-100 text-amber-700',
    Completed: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-rose-100 text-rose-700',
  };
  const STATUS_I18N = {
    Planned: 'trStatusPlanned',
    'In Progress': 'trStatusInProgress',
    Completed: 'trStatusCompleted',
    Cancelled: 'trStatusCancelled',
  };
  const CHART_COLORS = ['bg-[#042F8D]', 'bg-[#0b4dc2]', 'bg-indigo-500', 'bg-sky-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500'];
  const BATCH_SIZE = 15;   // rows appended per lazy-load batch

  /** @type {any[]} */
  let master = [];        // full dataset from the API
  /** @type {any[]} */
  let filtered = [];      // after filters + search
  /** @type {any[]} */
  let sorted = [];        // filtered rows after sorting (source for lazy render)
  /** @type {string[]} course titles sourced from the Dictionary (training_title) */
  let dictCourses = [];
  let lang = 'en';
  let rendered = 0;       // number of rows currently in the DOM
  let loadingMore = false;
  let sort = { key: /** @type {string} */ ('start'), dir: /** @type {'asc'|'desc'} */ ('desc') };
  let printing = false;
  /** @type {IntersectionObserver|null} */
  let observer = null;
  /** @type {number|undefined} */
  let searchTimer;

  // ── Helpers ──────────────────────────────────────────────
  const $ = (/** @type {string} */ id) => document.getElementById(id);
  const dict = () => /** @type {any} */ ((typeof translations !== 'undefined' && /** @type {any} */ (translations)[lang]) || {});
  const t = (/** @type {string} */ key, /** @type {string} */ fallback = '') => dict()[key] || fallback || key;

  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const toDate = (/** @type {string} */ iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
  const fmtDate = (/** @type {string} */ iso) => { const d = toDate(iso); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—'; };
  const fmtTime = (/** @type {string} */ iso) => { const d = toDate(iso); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—'; };
  const esc = (/** @type {any} */ s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  const trainingCode = (/** @type {any} */ r) => {
    const d = toDate(r.date_from);
    const year = d ? d.getFullYear() : new Date().getFullYear();
    return `GSS-TR-${year}-${String(r.training_id).padStart(3, '0')}`;
  };

  // Training titles are stored as "CODE - Description" (e.g. "FIAS - Initial
  // Security Agent Training"). The code (before the dash) shows in the grid;
  // the description (after the dash) shows in the charts. Titles without a dash
  // fall back to their initials for the code and themselves for the title.
  const courseCodeFromTitle = (/** @type {string} */ title) => {
    const s = String(title || '').trim();
    const i = s.indexOf('-');
    if (i >= 0) return s.slice(0, i).trim().toUpperCase();
    if (!/\s/.test(s)) return s.toUpperCase();
    return s.split(/\s+/).map((w) => (w.match(/[a-z0-9]/i) || [''])[0]).join('').toUpperCase().slice(0, 5);
  };
  const courseTitleFromTitle = (/** @type {string} */ title) => {
    const s = String(title || '').trim();
    const i = s.indexOf('-');
    return (i >= 0 ? s.slice(i + 1) : s).trim();
  };
  const courseCode = (/** @type {any} */ r) => courseCodeFromTitle(r.training_title) || trainingCode(r);
  const courseTitle = (/** @type {any} */ r) => courseTitleFromTitle(r.training_title) || String(r.training_title || '');

  // ── Localization ─────────────────────────────────────────
  // The report has no local toggle: it follows the application's master
  // language (persisted under GSS_LANG_KEY) and reacts to `storage` changes.
  const applyLang = () => {
    const d = dict();
    document.documentElement.lang = lang;
    document.title = `GSS · ${t('trReportTitle', 'Training Register')}`;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key && d[key]) el.textContent = d[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key && d[key]) /** @type {HTMLInputElement} */ (el).placeholder = d[key];
    });
  };

  const setLang = (/** @type {string} */ next) => {
    const resolved = next === 'fr' ? 'fr' : 'en';
    if (resolved === lang) return;
    lang = resolved;
    applyLang();
    renderAll();
  };

  // ── UI state switching ───────────────────────────────────
  // Hide the skeleton shimmer once the report has first rendered (or errored).
  let skeletonHidden = false;
  const hideSkeleton = () => {
    if (skeletonHidden) return;
    skeletonHidden = true;
    const sk = $('reportSkeleton');
    if (!sk) return;
    sk.classList.add('is-hidden');
    setTimeout(() => { sk.remove(); }, 400);
  };

  const show = (/** @type {HTMLElement|null} */ el, /** @type {boolean} */ on, /** @type {string} */ display = 'flex') => {
    if (!el) return;
    el.classList.toggle('hidden', !on);
    if (on && display) el.classList.add(display);
  };
  const setState = (/** @type {'loading'|'error'|'empty'|'table'} */ state) => {
    show($('tableLoading'), state === 'loading', 'block');
    show($('tableError'), state === 'error', 'flex');
    show($('tableEmpty'), state === 'empty', 'flex');
    show($('tableWrap'), state === 'table', 'block');
    if (state !== 'loading') hideSkeleton();
  };

  // ── Data ─────────────────────────────────────────────────
  // Training course names are sourced from the Dictionary (category
  // `training_title`) so the Course filter lists every configured course —
  // not only the ones that happen to have sessions in the current dataset —
  // and nothing is hard-coded here.
  const loadDictCourses = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dictionary?category=training_title`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data && data.items) ? data.items : [];
      dictCourses = items
        .map((/** @type {any} */ it) => String(it.en_title || it.label || it.fr_title || '').trim())
        .filter(Boolean);
    } catch (err) {
      console.error('Dictionary training_title load failed:', err);
      dictCourses = [];
    }
  };

  const load = async () => {
    setState('loading');
    try {
      await loadDictCourses();
      const res = await fetch(`${API_BASE}/api/reports/training-register`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      master = Array.isArray(data && data.trainings) ? data.trainings : [];
      buildFilterOptions();
      applyFilters();
    } catch (err) {
      console.error('Training register load failed:', err);
      setState('error');
    }
  };

  const buildFilterOptions = () => {
    const courseSel = /** @type {HTMLSelectElement} */ ($('fltCourse'));
    const trainerSel = /** @type {HTMLSelectElement} */ ($('fltTrainer'));
    // Union the Dictionary course list with any titles present in the data so
    // the filter stays complete even if the dictionary is unavailable.
    const courses = Array.from(new Set([
      ...dictCourses,
      ...master.map((r) => r.training_title).filter(Boolean),
    ])).sort((a, b) => String(a).localeCompare(String(b)));
    const trainers = Array.from(new Set(master.map((r) => r.trainer).filter(Boolean))).sort();
    const fill = (/** @type {HTMLSelectElement} */ sel, /** @type {string[]} */ items, /** @type {(v:string)=>string} */ label = (v) => v) => {
      if (!sel) return;
      const keep = sel.value;
      sel.querySelectorAll('option:not([data-i18n])').forEach((o) => o.remove());
      items.forEach((v) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = label ? label(v) : v;
        sel.appendChild(o);
      });
      sel.value = keep;
    };
    // Course options already carry "CODE - Title"; show them verbatim.
    fill(courseSel, courses);
    fill(trainerSel, trainers);
  };

  // ── Filtering ────────────────────────────────────────────
  const currentFilters = () => ({
    from: /** @type {HTMLInputElement} */ ($('fltFrom')).value || '',
    to: /** @type {HTMLInputElement} */ ($('fltTo')).value || '',
    course: /** @type {HTMLSelectElement} */ ($('fltCourse')).value || '',
    trainer: /** @type {HTMLSelectElement} */ ($('fltTrainer')).value || '',
    status: /** @type {HTMLSelectElement} */ ($('fltStatus')).value || '',
    search: (/** @type {HTMLInputElement} */ ($('fltSearch')).value || '').trim().toLowerCase(),
  });

  // Default reporting window: the whole current calendar year.
  const yearRange = () => {
    const y = new Date().getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  };
  const applyDefaultDates = () => {
    const { from, to } = yearRange();
    const fromEl = /** @type {HTMLInputElement} */ ($('fltFrom'));
    const toEl = /** @type {HTMLInputElement} */ ($('fltTo'));
    if (fromEl) fromEl.value = from;
    if (toEl) toEl.value = to;
  };

  const applyFilters = () => {
    const f = currentFilters();
    filtered = master.filter((r) => {
      const d = toDate(r.date_from);
      const day = d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
      if (f.from && day && day < f.from) return false;
      if (f.to && day && day > f.to) return false;
      if (f.course && r.training_title !== f.course) return false;
      if (f.trainer && r.trainer !== f.trainer) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.search) {
        const hay = `${r.training_title} ${r.trainer} ${trainingCode(r)} ${courseCode(r)}`.toLowerCase();
        if (!hay.includes(f.search)) return false;
      }
      return true;
    });
    renderAll();
    renderActiveFilters(f);
  };

  const resetFilters = () => {
    ['fltSearch'].forEach((id) => { /** @type {HTMLInputElement} */ ($(id)).value = ''; });
    ['fltCourse', 'fltTrainer', 'fltStatus'].forEach((id) => { /** @type {HTMLSelectElement} */ ($(id)).value = ''; });
    applyDefaultDates(); // reset restores the current-year window, not an empty range
    applyFilters();
  };

  const renderActiveFilters = (/** @type {any} */ f) => {
    const wrap = $('activeFilters');
    if (!wrap) return;
    wrap.innerHTML = '';
    const def = yearRange();
    const chips = [];
    // Hide the date chips while the default current-year window is in effect.
    if (f.from && f.from !== def.from) chips.push([`${t('trDateFrom')}: ${f.from}`, () => { applyDefaultDates(); }]);
    if (f.to && f.to !== def.to) chips.push([`${t('trDateTo')}: ${f.to}`, () => { applyDefaultDates(); }]);
    if (f.course) chips.push([`${t('trCourse')}: ${f.course}`, () => { /** @type {HTMLSelectElement} */ ($('fltCourse')).value = ''; }]);
    if (f.trainer) chips.push([`${t('trTrainer')}: ${f.trainer}`, () => { /** @type {HTMLSelectElement} */ ($('fltTrainer')).value = ''; }]);
    if (f.status) chips.push([`${t('trStatus')}: ${t(STATUS_I18N[/** @type {keyof typeof STATUS_I18N} */ (f.status)] || '', f.status)}`, () => { /** @type {HTMLSelectElement} */ ($('fltStatus')).value = ''; }]);
    if (f.search) chips.push([`${t('trSearch')}: ${f.search}`, () => { /** @type {HTMLInputElement} */ ($('fltSearch')).value = ''; }]);
    if (!chips.length) return;
    const label = document.createElement('span');
    label.className = 'text-xs font-semibold uppercase tracking-wide text-slate-400';
    label.textContent = t('trActiveFilters', 'Active filters');
    wrap.appendChild(label);
    chips.forEach(([text, clear]) => {
      const chip = document.createElement('span');
      chip.className = 'inline-flex items-center gap-1.5 rounded-full bg-[#042F8D]/10 px-3 py-1 text-xs font-medium text-[#042F8D]';
      chip.textContent = /** @type {string} */ (text);
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'text-[#042F8D]/60 transition-colors hover:text-[#042F8D]';
      x.textContent = '✕';
      x.addEventListener('click', () => { /** @type {Function} */ (clear)(); applyFilters(); });
      chip.appendChild(x);
      wrap.appendChild(chip);
    });
  };

  // ── KPIs ─────────────────────────────────────────────────
  const renderKpis = () => {
    const totalCandidates = filtered.reduce((s, r) => s + (Number(r.registered) || 0), 0);
    const completed = filtered.filter((r) => r.status === 'Completed').length;
    const inProgress = filtered.filter((r) => r.status === 'In Progress').length;
    const upcoming = filtered.filter((r) => r.status === 'Planned').length;
    // Evaluation source → the human "Final Decision After Exam" (eval_final_decision).
    const recommended = filtered.reduce((s, r) => s + (Number(r.recommended) || 0), 0);
    const notRecommended = filtered.reduce((s, r) => s + (Number(r.non_recommended) || 0), 0);
    const waiting = filtered.reduce((s, r) => s + (Number(r.waiting_list) || 0), 0);
    // Exam source → the graded exam attempts (exam_attempts.passed).
    const passed = filtered.reduce((s, r) => s + (Number(r.pass_count) || 0), 0);
    const failed = filtered.reduce((s, r) => s + (Number(r.fail_count) || 0), 0);
    const set = (/** @type {string} */ id, /** @type {any} */ v) => { const el = $(id); if (el) el.textContent = String(v); };
    set('kpiTrainings', filtered.length);
    set('kpiCandidates', totalCandidates);
    set('kpiCompleted', completed);
    set('kpiInProgress', inProgress);
    set('kpiUpcoming', upcoming);

    // ── Exam section ── every card derived from exam grades only.
    const examGraded = passed + failed;
    const examPending = Math.max(totalCandidates - examGraded, 0);
    const examPassRate = examGraded ? Math.round((passed / examGraded) * 100) : 0;
    const examFailRate = examGraded ? Math.round((failed / examGraded) * 100) : 0;
    set('kpiRecommended', passed);        // passing the exam ⇒ recommended by exam
    set('kpiNotRecommended', failed);
    set('kpiWaiting', examPending);       // registered but not yet graded
    set('kpiPassed', passed);
    set('kpiFailed', failed);
    set('kpiPassRate', `${examPassRate}%`);
    set('kpiFailRate', `${examFailRate}%`);
    set('kpiRecRate', `${examPassRate}%`);

    // ── Evaluation section ── every card derived from the final decision only.
    const evalDecided = recommended + notRecommended;
    const evalRecRate = evalDecided ? Math.round((recommended / evalDecided) * 100) : 0;
    const evalFailRate = evalDecided ? Math.round((notRecommended / evalDecided) * 100) : 0;
    set('kpiRecommendedEval', recommended);
    set('kpiNotRecommendedEval', notRecommended);
    set('kpiWaitingEval', waiting);
    set('kpiPassedEval', recommended);    // recommended ⇒ "passed" the evaluation
    set('kpiFailedEval', notRecommended);
    set('kpiPassRateEval', `${evalRecRate}%`);
    set('kpiFailRateEval', `${evalFailRate}%`);
    set('kpiRecRateEval', `${evalRecRate}%`);
  };

  const initStatsGroups = () => {
    const groups = $('trStatsGroups');
    const cards = $('trStatsCards');
    if (!groups || !cards) return;
    const frame = (/** @type {string} */ key, /** @type {string} */ label) => {
      const section = document.createElement('fieldset');
      section.className = 'min-w-0 rounded-lg border border-slate-200 p-3 sm:p-4';
      section.innerHTML = `<legend class="px-2 text-xs font-bold uppercase tracking-wide text-[#042F8D]"><span data-i18n="${key}">${esc(t(key, label))}</span></legend><div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"></div>`;
      return section;
    };
    const training = frame('trTrainingCategory', 'Training Category');
    groups.appendChild(training);
    ['kpiTrainings', 'kpiCompleted', 'kpiInProgress', 'kpiUpcoming'].forEach((id) => {
      const card = $(id)?.closest('.group');
      if (card) training.querySelector('div')?.appendChild(card);
    });
    const candidateCard = $('kpiCandidates')?.closest('.group');
    if (candidateCard) groups.appendChild(candidateCard);
    const tabs = document.createElement('div');
    tabs.className = 'flex gap-1 border-b border-slate-200 print:hidden';
    tabs.setAttribute('role', 'tablist');
    groups.appendChild(tabs);
    const exam = frame('trExamCategory', 'Exam');
    const evaluation = frame('trFinalDecisionAfterExam', 'Final Decision After Exam');
    exam.id = 'trExamStats';
    evaluation.id = 'trEvaluationStats';
    exam.setAttribute('role', 'tabpanel');
    evaluation.setAttribute('role', 'tabpanel');
    evaluation.classList.add('hidden', 'print:block');
    groups.append(exam, evaluation);
    const metricIds = ['kpiRecommended', 'kpiNotRecommended', 'kpiWaiting', 'kpiPassed', 'kpiFailed', 'kpiPassRate', 'kpiFailRate', 'kpiRecRate'];
    const waitingCard = document.createElement('div');
    waitingCard.className = 'group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm';
    waitingCard.innerHTML = `<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg></span><div class="min-w-0"><p id="kpiWaiting" class="text-xl font-bold leading-tight text-slate-900">0</p><p class="text-xs font-medium text-slate-500" data-i18n="trKpiWaiting">${esc(t('trKpiWaiting', 'Waiting List'))}</p></div>`;
    cards.appendChild(waitingCard);
    metricIds.forEach((id) => {
      const card = $(id)?.closest('.group');
      if (!card) return;
      exam.querySelector('div')?.appendChild(card);
      const copy = card.cloneNode(true);
      const value = /** @type {HTMLElement} */ (copy).querySelector(`#${id}`);
      if (value) value.id = `${id}Eval`;
      evaluation.querySelector('div')?.appendChild(copy);
    });
    cards.remove();
    [
      { key: 'trExamCategory', label: 'Exam', panel: exam },
      { key: 'trEvaluationCategory', label: 'Evaluation', panel: evaluation },
    ].forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `${item.panel.id}Tab`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', item.panel.id);
      item.panel.setAttribute('aria-labelledby', button.id);
      button.setAttribute('data-i18n', item.key);
      button.textContent = t(item.key, item.label);
      const activate = () => {
        Array.from(tabs.children).forEach((tab) => {
          const selected = tab === button;
          tab.setAttribute('aria-selected', String(selected));
          tab.className = `border-b-2 px-4 py-2 text-sm font-semibold ${selected ? 'border-[#042F8D] text-[#042F8D]' : 'border-transparent text-slate-500'}`;
        });
        exam.classList.toggle('hidden', item.panel !== exam);
        evaluation.classList.toggle('hidden', item.panel !== evaluation);
        exam.classList.add('print:block');
      };
      button.addEventListener('click', activate);
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next = /** @type {HTMLButtonElement} */ (tabs.children[index === 0 ? 1 : 0]);
        next?.click();
        next?.focus();
      });
      tabs.appendChild(button);
      if (index === 1) /** @type {HTMLButtonElement} */ (tabs.children[0]).click();
    });
  };

  // ── Top 5 most-taken courses (ranked by number of sessions) ─
  const renderTopCourses = () => {
    const box = $('topCourses');
    const empty = $('topCoursesEmpty');
    if (!box || !empty) return;
    box.innerHTML = '';
    // Aggregate sessions + candidates per course title.
    const agg = new Map();
    filtered.forEach((r) => {
      const key = r.training_title || '';
      if (!key) return;
      const cur = agg.get(key) || { sessions: 0, candidates: 0 };
      cur.sessions += 1;
      cur.candidates += Number(r.registered) || 0;
      agg.set(key, cur);
    });
    const totalCandidates = Array.from(agg.values()).reduce((s, a) => s + a.candidates, 0);
    // Rank by number of sessions (most-taken); candidate participation breaks
    // ties. The share badge/bar reflect each course's share of all candidates.
    const top = Array.from(agg.entries())
      .map(([title, a]) => ({ title, sessions: a.sessions, candidates: a.candidates }))
      .sort((a, b) => (b.sessions - a.sessions) || (b.candidates - a.candidates))
      .slice(0, 5);
    if (!top.length) {
      box.classList.add('hidden');
      show(empty, true, 'flex');
      return;
    }
    box.classList.remove('hidden');
    show(empty, false);
    const candLabel = t('trChartCandidates', 'candidates');
    const sessLabel = t('trTopCoursesTimesTaken', 'sessions');
    top.forEach((c, i) => {
      const pct = totalCandidates ? Math.round((c.candidates / totalCandidates) * 100) : 0;
      const code = courseCodeFromTitle(c.title);
      const title = courseTitleFromTitle(c.title);
      const card = document.createElement('div');
      card.className = 'flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md';
      card.innerHTML =
        `<div class="flex items-center justify-between">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">${i + 1}</span>
          <span title="${esc(title)}" class="rounded-md bg-[#042F8D]/10 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-[#042F8D]">${esc(code)}</span>
        </div>
        <p class="truncate text-sm font-semibold text-slate-800" title="${esc(title)}">${esc(title)}</p>
        <div class="flex items-end justify-between gap-2">
          <div class="min-w-0">
            <p class="text-2xl font-bold leading-none text-[#042F8D]">${c.sessions}</p>
            <p class="mt-1 text-[11px] font-medium text-slate-500">${esc(sessLabel)}</p>
          </div>
          <span title="${esc(candLabel)}" class="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-600">${pct}%</span>
        </div>
        <div class="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <svg class="h-3.5 w-3.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span><span class="font-bold text-slate-700">${c.candidates}</span> ${esc(candLabel)}</span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full bg-gradient-to-r from-[#042F8D] to-[#0b4dc2]" style="width:${pct}%"></div>
        </div>`;
      box.appendChild(card);
    });
  };

  // ── Chart (modern horizontal bars, Tailwind only) ────────
  const renderChart = () => {
    const box = $('chart');
    const empty = $('chartEmpty');
    if (!box || !empty) return;
    box.innerHTML = '';
    const top = filtered
      .filter((r) => (Number(r.registered) || 0) > 0)
      .sort((a, b) => (Number(b.registered) || 0) - (Number(a.registered) || 0))
      .slice(0, 8);
    if (!top.length) {
      box.classList.add('hidden');
      show(empty, true, 'flex');
      return;
    }
    box.classList.remove('hidden');
    show(empty, false);
    const max = Math.max(...top.map((r) => Number(r.registered) || 0));
    const unit = t('trChartCandidates', 'candidates');
    top.forEach((r, i) => {
      const count = Number(r.registered) || 0;
      const pct = max ? Math.max(4, Math.round((count / max) * 100)) : 0;
      const accent = i === 0 ? 'from-[#042F8D] to-[#0b4dc2]' : 'from-[#0b4dc2] to-sky-400';
      const row = document.createElement('div');
      row.className = 'group';
      row.title = `${courseTitleFromTitle(r.training_title)} · ${count} ${unit}`;
      row.innerHTML =
        `<div class="mb-1.5 flex items-end justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#042F8D]/10 text-[10px] font-bold text-[#042F8D]">${i + 1}</span>
            <span class="truncate text-sm font-medium text-slate-700">${esc(courseTitleFromTitle(r.training_title))}</span>
          </div>
          <span class="shrink-0 text-sm font-bold text-[#042F8D]">${count}<span class="ml-1 text-[11px] font-medium text-slate-400">${esc(unit)}</span></span>
        </div>
        <div class="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div class="chart-bar h-full rounded-full bg-gradient-to-r ${accent} transition-all duration-700 ease-out" data-pct="${pct}" style="width:0%"></div>
        </div>`;
      box.appendChild(row);
      // Animate width after paint.
      const bar = /** @type {HTMLElement} */ (row.querySelector('.chart-bar'));
      requestAnimationFrame(() => { bar.style.width = `${pct}%`; });
    });
  };

  // Apply final bar widths synchronously so the chart is fully painted before
  // the print snapshot is taken (rAF animations don't run during printing).
  const finalizeChartWidths = () => {
    document.querySelectorAll('.chart-bar').forEach((el) => {
      const pct = /** @type {HTMLElement} */ (el).dataset.pct;
      if (pct != null) /** @type {HTMLElement} */ (el).style.width = `${pct}%`;
    });
  };

  // ── Table ────────────────────────────────────────────────
  const sortRows = (/** @type {any[]} */ rows) => {
    const getters = {
      code: (/** @type {any} */ r) => courseCode(r),
      trainer: (/** @type {any} */ r) => String(r.trainer || '').toLowerCase(),
      start: (/** @type {any} */ r) => (toDate(r.date_from) || new Date(0)).getTime(),
      end: (/** @type {any} */ r) => (toDate(r.date_to) || new Date(0)).getTime(),
      registered: (/** @type {any} */ r) => Number(r.registered) || 0,
      recommended: (/** @type {any} */ r) => Number(r.recommended) || 0,
      nonrec: (/** @type {any} */ r) => Number(r.non_recommended) || 0,
      status: (/** @type {any} */ r) => String(r.status || '').toLowerCase(),
    };
    const get = /** @type {any} */ (getters)[sort.key] || getters.start;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const va = get(a); const vb = get(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  };

  const statusBadge = (/** @type {string} */ status) => {
    const cls = /** @type {any} */ (STATUS_STYLES)[status] || 'bg-slate-100 text-slate-600';
    const label = t(/** @type {any} */ (STATUS_I18N)[status] || '', status);
    return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}">${esc(label)}</span>`;
  };

  const rowHtml = (/** @type {any} */ r) => {
    const rec = Number(r.recommended) || 0;
    const nrec = Number(r.non_recommended) || 0;
    return `<tr class="transition-colors hover:bg-slate-50">
        <td class="px-3 py-2.5"><span title="${esc(courseTitle(r))}" class="inline-flex items-center rounded-md bg-[#042F8D]/10 px-2 py-1 font-mono text-xs font-bold tracking-wide text-[#042F8D]">${esc(courseCode(r))}</span></td>
        <td class="px-3 py-2.5 text-slate-600">${esc(r.trainer)}</td>
        <td class="whitespace-nowrap px-3 py-2.5 text-slate-600">${esc(fmtDate(r.date_from))}</td>
        <td class="whitespace-nowrap px-3 py-2.5 text-slate-600">${esc(fmtDate(r.date_to))}</td>
        <td class="whitespace-nowrap px-3 py-2.5 text-slate-600">${esc(fmtTime(r.date_from))}</td>
        <td class="whitespace-nowrap px-3 py-2.5 text-slate-600">${esc(fmtTime(r.date_to))}</td>
        <td class="px-3 py-2.5 text-center"><span class="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">${Number(r.registered) || 0}</span></td>
        <td class="px-3 py-2.5 text-center"><span class="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">${rec}</span></td>
        <td class="px-3 py-2.5 text-center"><span class="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">${nrec}</span></td>
        <td class="whitespace-nowrap px-3 py-2.5">${statusBadge(r.status)}</td>
      </tr>`;
  };

  // ── Lazy loading ─────────────────────────────────────────
  const setLoadIndicators = () => {
    const total = sorted.length;
    const done = rendered >= total;
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
    const grid = $('gridTotal');
    if (grid) grid.textContent = `(${total.toLocaleString(locale)})`;
    show($('loadMore'), loadingMore, 'flex');
    show($('allLoaded'), !loadingMore && done && total > BATCH_SIZE, 'flex');
  };

  const appendBatch = () => {
    const body = $('regBody');
    if (!body) return;
    const next = sorted.slice(rendered, rendered + BATCH_SIZE);
    if (!next.length) return;
    body.insertAdjacentHTML('beforeend', next.map(rowHtml).join(''));
    rendered += next.length;
  };

  // Keep appending until the grid's own scroll container actually overflows
  // past the observer's reach. Relying on the IntersectionObserver alone is not
  // enough here: it only fires on a state *change*, so when a short filtered
  // result (sentinel already visible) is reset back to the full dataset, the
  // sentinel can stay within reach without any transition and no further batch
  // would ever load. Measuring the overflow directly fills the first screen
  // deterministically; the observer then handles subsequent scrolling.
  const FILL_REACH = 300;   // must exceed the observer's 250px rootMargin
  const maybeFillViewport = () => {
    const scroller = $('gridScroll');
    if (!scroller || rendered >= sorted.length) return;
    if (scroller.scrollHeight <= scroller.clientHeight + FILL_REACH) requestMore();
  };

  const requestMore = () => {
    if (loadingMore || printing || rendered >= sorted.length) return;
    loadingMore = true;
    setLoadIndicators();
    // Small delay so the loading indicator is perceptible and scrolling stays smooth.
    setTimeout(() => {
      appendBatch();
      loadingMore = false;
      setLoadIndicators();
      maybeFillViewport();
    }, 220);
  };

  const ensureObserver = () => {
    if (observer || typeof IntersectionObserver === 'undefined') return;
    const sentinel = $('loadSentinel');
    const scroller = $('gridScroll');
    if (!sentinel || !scroller) return;
    // Observe within the grid's fixed-height scroll container, not the window.
    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) requestMore();
    }, { root: scroller, rootMargin: '250px 0px' });
    observer.observe(sentinel);
  };

  const renderTable = () => {
    const body = $('regBody');
    if (!body) return;
    sorted = sortRows(filtered);
    rendered = 0;
    loadingMore = false;
    body.innerHTML = '';
    if (!sorted.length) { setState('empty'); setLoadIndicators(); return; }
    setState('table');
    if (printing) {
      body.innerHTML = sorted.map(rowHtml).join('');
      rendered = sorted.length;
    } else {
      appendBatch();
      ensureObserver();
      maybeFillViewport();
    }
    setLoadIndicators();
    updateSortIndicators();
  };


  const updateSortIndicators = () => {
    document.querySelectorAll('th[data-sort]').forEach((th) => {
      const ind = th.querySelector('.sort-ind');
      if (!ind) return;
      if (th.getAttribute('data-sort') === sort.key) {
        ind.textContent = sort.dir === 'asc' ? '↑' : '↓';
        ind.classList.remove('opacity-40');
      } else {
        ind.textContent = '↕';
        ind.classList.add('opacity-40');
      }
    });
  };

  const renderAll = () => {
    renderKpis();
    renderTopCourses();
    renderChart();
    renderTable();
    updateGenDate();
  };

  const updateGenDate = () => {
    const now = new Date();
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
    const text = now.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    const el = $('trGenDate');
    if (el) el.textContent = text;
    const pdf = $('trGenDatePdf');
    if (pdf) pdf.textContent = text;
  };

  // ── Export (genuine .xlsx — Office Open XML, no external deps) ──
  // A real workbook avoids Excel's "format and extension don't match" warning
  // and renders native hairline borders instead of the heavy HTML gridlines.
  const xmlEsc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const colLetter = (/** @type {number} */ n) => {
    let s = ''; let x = n + 1;
    while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
    return s;
  };

  /** @type {Uint32Array | null} */
  let CRC_TABLE = null;
  const crc32 = (/** @type {Uint8Array} */ bytes) => {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[i] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  const zipStore = (/** @type {{ name: string, data: Uint8Array }[]} */ files) => {
    const enc = new TextEncoder();
    const u16 = (/** @type {number} */ v) => [v & 0xFF, (v >>> 8) & 0xFF];
    const u32 = (/** @type {number} */ v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    /** @type {Uint8Array[]} */ const parts = [];
    /** @type {Uint8Array[]} */ const central = [];
    let offset = 0;
    files.forEach((f) => {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;
      const local = Uint8Array.from(/** @type {number[]} */ ([]).concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
      ));
      parts.push(local, nameBytes, data);
      central.push(Uint8Array.from(/** @type {number[]} */ ([]).concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset),
      )), nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    let cdSize = 0; central.forEach((c) => { cdSize += c.length; });
    const eocd = Uint8Array.from(/** @type {number[]} */ ([]).concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cdSize), u32(offset), u16(0),
    ));
    const all = parts.concat(central, [eocd]);
    let total = 0; all.forEach((a) => { total += a.length; });
    const out = new Uint8Array(total);
    let p = 0; all.forEach((a) => { out.set(a, p); p += a.length; });
    return out;
  };

  // Style indexes (cellXfs order below): 1 header, 2 No. cell, 3 left, 4 centre,
  // 5 title banner, 6 subtitle.
  const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="3">'
    + '<font><sz val="11"/><name val="Calibri"/><color rgb="FF000000"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF000000"/></font>'
    + '<font><b/><sz val="16"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>'
    + '</fonts>'
    + '<fills count="4">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF042F8D"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2">'
    + '<border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border>'
    + '<left style="thin"><color rgb="FF000000"/></left>'
    + '<right style="thin"><color rgb="FF000000"/></right>'
    + '<top style="thin"><color rgb="FF000000"/></top>'
    + '<bottom style="thin"><color rgb="FF000000"/></bottom>'
    + '<diagonal/>'
    + '</border>'
    + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="7">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

  /**
   * @param {(string|number|{v: string|number, s: number})[][]} rows
   * @param {{ cols?: {min:number,max:number,width:number}[], merges?: string[], rowHeights?: Record<number, number> }} [opts]
   */
  const downloadXlsx = (/** @type {string} */ filename, /** @type {string} */ sheetName, rows, opts) => {
    const o = opts || {};
    const valOf = (/** @type {any} */ c) => (c && typeof c === 'object' && 'v' in c) ? c.v : c;
    const styleOf = (/** @type {any} */ c) => (c && typeof c === 'object' && 's' in c) ? (c.s || 0) : 0;
    const heights = o.rowHeights || {};
    let rowsXml = '';
    rows.forEach((row, r) => {
      let cellsXml = '';
      row.forEach((cell, c) => {
        const s = styleOf(cell);
        const sAttr = s ? ` s="${s}"` : '';
        cellsXml += `<c r="${colLetter(c) + (r + 1)}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(valOf(cell))}</t></is></c>`;
      });
      const ht = heights[r];
      const htAttr = ht ? ` ht="${ht}" customHeight="1"` : '';
      rowsXml += `<row r="${r + 1}"${htAttr}>${cellsXml}</row>`;
    });
    const colsXml = (o.cols && o.cols.length)
      ? '<cols>' + o.cols.map((c) => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`).join('') + '</cols>'
      : '';
    const mergeXml = (o.merges && o.merges.length)
      ? `<mergeCells count="${o.merges.length}">` + o.merges.map((m) => `<mergeCell ref="${m}"/>`).join('') + '</mergeCells>'
      : '';
    const safeSheet = xmlEsc(String(sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + colsXml + '<sheetData>' + rowsXml + '</sheetData>' + mergeXml + '</worksheet>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>';
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';
    const enc = new TextEncoder();
    const zip = zipStore([
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rootRels) },
      { name: 'xl/workbook.xml', data: enc.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
      { name: 'xl/styles.xml', data: enc.encode(XLSX_STYLES) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml) },
    ]);
    const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const exportExcel = () => {
    const ST = { header: 1, no: 2, left: 3, center: 4, banner: 5, subtitle: 6 };
    const headerKeys = ['trColNo', 'trColCode', 'trColTitle', 'trColTrainer', 'trColStartDate', 'trColEndDate', 'trColStartTime', 'trColEndTime', 'trColRegistered', 'trColRecommended', 'trColNonRecommended', 'trColStatus'];
    const totalCols = 1 + headerKeys.length; // A spacer + data columns
    const lastCol = colLetter(totalCols - 1);
    /** Full-width banner row: text in col B, styled fill across B..last. */
    const bannerRow = (/** @type {string} */ text, /** @type {number} */ style) => {
      /** @type {any[]} */ const r = [''];
      for (let i = 1; i < totalCols; i++) r.push({ v: i === 1 ? text : '', s: style });
      return r;
    };
    /** @type {(string|number|{v: string|number, s: number})[][]} */
    const rows = [];
    /** @type {Record<number, number>} */
    const rowHeights = {};
    /** @type {string[]} */
    const merges = [];

    // Report header banner (title + subtitle), merged across the table width.
    rows.push(bannerRow(t('trReportTitle', 'Training Register'), ST.banner));
    rowHeights[0] = 30;
    merges.push(`B1:${lastCol}1`);
    rows.push(bannerRow(t('trReportSubtitle', 'GSS Training Center — Training Register Report'), ST.subtitle));
    rowHeights[1] = 20;
    merges.push(`B2:${lastCol}2`);
    rows.push([]);                                                  // spacer row

    rowHeights[rows.length] = 26;
    rows.push([''].concat(/** @type {any} */ (headerKeys.map((k) => ({ v: t(k), s: ST.header }))))); // empty leading column
    sortRows(filtered).forEach((r, i) => {
      rows.push([
        '',
        { v: String(i + 1).padStart(4, '0'), s: ST.no },
        { v: courseCode(r), s: ST.left },
        { v: courseTitle(r), s: ST.left },
        { v: r.trainer, s: ST.left },
        { v: fmtDate(r.date_from), s: ST.center },
        { v: fmtDate(r.date_to), s: ST.center },
        { v: fmtTime(r.date_from), s: ST.center },
        { v: fmtTime(r.date_to), s: ST.center },
        { v: Number(r.registered) || 0, s: ST.center },
        { v: Number(r.recommended) || 0, s: ST.center },
        { v: Number(r.non_recommended) || 0, s: ST.center },
        { v: t(/** @type {any} */ (STATUS_I18N)[r.status] || '', r.status), s: ST.left },
      ]);
    });
    const cols = [
      { min: 1, max: 1, width: 3 },    // A spacer
      { min: 2, max: 2, width: 6 },    // No.
      { min: 3, max: 3, width: 10 },   // Course Code
      { min: 4, max: 4, width: 34 },   // Training Title
      { min: 5, max: 5, width: 16 },   // Trainer
      { min: 6, max: 7, width: 12 },   // Start/End Date
      { min: 8, max: 9, width: 10 },   // Start/End Time
      { min: 10, max: 10, width: 14 }, // Registered Candidates
      { min: 11, max: 11, width: 13 }, // Recommended
      { min: 12, max: 12, width: 15 }, // Non-Recommended
      { min: 13, max: 13, width: 12 }, // Status
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    downloadXlsx(`training-register-${stamp}.xlsx`, t('trReportTitle', 'Training Register'), rows, { cols, merges, rowHeights });
  };

  const doPrint = () => {
    printing = true;
    expandAllSections();      // collapsed sections would be omitted from the PDF
    renderTable();            // render every row (no lazy loading in print)
    finalizeChartWidths();    // ensure chart bars are painted before the snapshot
    window.print();
  };

  // ── Collapsible sections (mirrors panel-registration behaviour) ──
  const makeChevron = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('h-3.5', 'w-3.5', 'shrink-0', 'transition-transform', 'duration-200');
    svg.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
    return svg;
  };

  const initCollapsibles = () => {
    document.querySelectorAll('fieldset').forEach((fs) => {
      const legend = /** @type {HTMLElement|null} */ (fs.querySelector(':scope > legend'));
      if (!legend || legend.dataset.collapsibleReady) return;
      const body = Array.prototype.filter.call(fs.children, (el) => el !== legend);
      if (!body.length) return;
      legend.dataset.collapsibleReady = 'true';
      legend.classList.add('cursor-pointer', 'select-none', 'justify-between');
      legend.setAttribute('role', 'button');
      legend.setAttribute('tabindex', '0');
      legend.setAttribute('aria-expanded', 'true');
      const chevron = makeChevron();
      legend.appendChild(chevron);
      const toggle = () => {
        const willCollapse = legend.getAttribute('aria-expanded') === 'true';
        body.forEach((el) => el.classList.toggle('hidden', willCollapse));
        chevron.classList.toggle('-rotate-90', willCollapse);
        legend.setAttribute('aria-expanded', String(!willCollapse));
        if (willCollapse) return;                 // just collapsed
        if (fs.querySelector('#chart')) { renderChart(); finalizeChartWidths(); }
        if (fs.querySelector('#gridScroll')) maybeFillViewport();
      };
      legend.addEventListener('click', toggle);
      legend.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  };

  const expandAllSections = () => {
    document.querySelectorAll('fieldset > legend[aria-expanded="false"]').forEach((lg) => /** @type {HTMLElement} */ (lg).click());
  };

  // ── Wiring ───────────────────────────────────────────────
  const wire = () => {
    $('btnReset')?.addEventListener('click', resetFilters);
    $('btnRetry')?.addEventListener('click', load);
    $('btnExcel')?.addEventListener('click', exportExcel);
    $('btnPrint')?.addEventListener('click', doPrint);
    // Also cover the browser's native print (Ctrl+P): expand every section and
    // paint the chart bars synchronously so nothing is missing from the PDF.
    window.addEventListener('beforeprint', () => { printing = true; expandAllSections(); renderTable(); finalizeChartWidths(); });
    window.addEventListener('afterprint', () => { printing = false; renderTable(); });

    // Automatic filtering: any change re-runs the query immediately.
    ['fltFrom', 'fltTo', 'fltCourse', 'fltTrainer', 'fltStatus'].forEach((id) => {
      $(id)?.addEventListener('change', applyFilters);
    });
    // Search filters live while typing, debounced.
    $('fltSearch')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(applyFilters, 250);
    });

    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort') || 'start';
        if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
        else { sort.key = key; sort.dir = 'asc'; }
        renderTable();
      });
    });

    // Follow the application's master language toggle (changed on other pages).
    window.addEventListener('storage', (e) => {
      if (e.key === GSS_LANG_KEY && e.newValue) setLang(e.newValue);
    });
    // Also re-sync when the tab regains focus, in case the language changed.
    window.addEventListener('focus', () => {
      try {
        const saved = localStorage.getItem(GSS_LANG_KEY);
        if (saved === 'fr' || saved === 'en') setLang(saved);
      } catch (_) { /* noop */ }
    });
  };

  // ── Access control ───────────────────────────────────────
  const denyAccess = () => {
    document.body.innerHTML = `<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <span class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600"><svg class="h-8 w-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
      <h1 class="text-xl font-bold text-slate-900">403</h1>
      <p class="max-w-sm text-sm text-slate-500">${esc(t('trErrorTitle', 'Access denied'))}</p>
      <a href="../../tc.html" class="rounded-lg bg-[#042F8D] px-4 py-2 text-sm font-semibold text-white">${esc(t('trBack', 'Back'))}</a>
    </div>`;
  };

  const init = () => {
    const saved = (() => { try { return localStorage.getItem(GSS_LANG_KEY); } catch (_) { return null; } })();
    lang = saved === 'fr' || saved === 'en' ? saved : 'en';

    applyLang();
    if (!GSSAccess.canViewReports()) { denyAccess(); return; }

    wire();
    initStatsGroups();
    initCollapsibles();
    applyDefaultDates();  // open on the current-year window by default
    load();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
