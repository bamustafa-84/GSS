<<<<<<< HEAD
// @ts-check
/// <reference path="../utils/translation.js" />
/**
 * GSS · Take exam (Candidate)
 * ------------------------------------------------------------------
 * Loads the exam template for the candidate's assigned training (via
 * applicant_training), renders each question according to its type, collects
 * the answers, submits them for auto-grading and shows the score. Free-text
 * questions (DEFINITION / ANALYTICAL) are stored for administrator review.
 */
(() => {
  'use strict';

  const overlay = document.getElementById('examTakeOverlay');
  const openBtn = document.getElementById('examTakeBtn');
  const closeBtn = document.getElementById('examTakeClose');
  const body = document.getElementById('examTakeBody');
  const subtitle = document.getElementById('examTakeSubtitle');
  const statusEl = document.getElementById('examTakeStatus');
  const submitBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('examTakeSubmit'));

  if (!overlay || !openBtn || !body) return;

  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const esc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  /** @type {any} */ let exam = null;
  /** @type {any[]} */ let questions = [];
  let candidateNo = null;
  let previewMode = false;

  const metaHtml = (/** @type {any} */ e) => {
    if (!e) return '';
    const rows = [];
    if (e.training_title) rows.push(`<span><span class="font-semibold text-slate-500">${t('examTakeCourse', 'Training')}:</span> ${esc(e.training_title)}</span>`);
    if (e.instructor) rows.push(`<span><span class="font-semibold text-slate-500">${t('examTakeInstructor', 'Instructor')}:</span> ${esc(e.instructor)}</span>`);
    const info = rows.length
      ? `<div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">${rows.join('')}</div>` : '';
    const instructions = e.instructions
      ? `<p class="mt-2 whitespace-pre-line rounded-lg border border-[#042F8D]/15 bg-[#042F8D]/5 px-3 py-2 text-sm text-slate-700">${esc(e.instructions)}</p>` : '';
    if (!info && !instructions) return '';
    return `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        ${e.exam_title ? `<h3 class="mb-1 text-sm font-bold text-[#042F8D]">${esc(e.exam_title)}</h3>` : ''}
        ${info}${instructions}
      </div>`;
  };

  const previewBanner = () => previewMode
    ? `<div class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">${t('examPreviewBanner', 'Preview mode — this is how the exam looks to a candidate. Answers will not be saved.')}</div>`
    : '';

  const setStatus = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('text-red-600', ok === false);
    statusEl.classList.toggle('text-emerald-600', ok === true);
  };

  const resolveCandidateNo = () => {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    const fromSession = session && (session.candidate_no || session.candidateNo);
    if (fromSession) return Number(fromSession);
    const entered = window.prompt(t('examTakeAskCandidate', 'Enter your candidate number to load your exam:'));
    const n = Number.parseInt(String(entered || ''), 10);
    return Number.isFinite(n) ? n : null;
  };

  // ── Render one question according to its type ──────────────────
  const renderQuestion = (/** @type {any} */ q, /** @type {number} */ idx) => {
    const type = q.question_type;
    const img = q.image_url
      ? `<img src="${esc(q.image_url)}" alt="" class="mb-3 max-h-56 w-auto rounded-lg border border-slate-200 object-contain" />`
      : '';
    const head = `
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">${idx + 1}</span>
        <span class="text-[11px] font-semibold text-slate-400">${Number(q.points) || 0} ${t('examPts', 'pts')}</span>
      </div>
      <p class="mb-3 text-sm font-semibold text-slate-800">${esc(q.question_text)}</p>${img}`;

    let field = '';
    if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') {
      field = `<div class="space-y-2">${(q.answers || []).map((/** @type {any} */ a, i) => `
        <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-[#042F8D]">
          <input type="radio" name="q${q.question_id}" value="${a.answer_id}" class="accent-[#042F8D]" />
          <span class="font-bold text-[#042F8D]">${esc(a.answer_key || letters[i] || (i + 1))}.</span>
          <span>${esc(a.answer_text)}</span>
        </label>`).join('')}</div>`;
    } else if (type === 'MATCH_ITEMS') {
      const values = (q.answers || []).map((/** @type {any} */ a) => a.match_value);
      // Present each left item with a dropdown of all possible right values.
      field = `<div class="space-y-2">${(q.answers || []).map((/** @type {any} */ a) => `
        <div class="flex items-center gap-2 text-sm">
          <span class="min-w-[40%] rounded bg-slate-100 px-2 py-1 font-medium">${esc(a.match_key)}</span>
          <span class="text-slate-400">→</span>
          <select data-matchkey="${esc(a.match_key)}" class="flex-1 rounded-md border border-slate-200 px-2 py-1">
            <option value="">${t('examSelect', 'Select…')}</option>
            ${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}
          </select>
        </div>`).join('')}</div>`;
    } else if (type === 'CHRONOLOGICAL_ORDERING') {
      // Present each item with an order number input.
      field = `<div class="space-y-2" data-ordering="1">${(q.answers || []).map((/** @type {any} */ a) => `
        <div class="flex items-center gap-2 text-sm">
          <input type="number" min="1" max="${(q.answers || []).length}" data-answerid="${a.answer_id}" class="w-14 rounded-md border border-slate-200 px-2 py-1 text-center" />
          <span>${esc(a.answer_text)}</span>
        </div>`).join('')}<p class="text-[11px] text-slate-400">${t('examOrderHint', 'Number the items from 1 (first) to last.')}</p></div>`;
    } else {
      // DEFINITION / ANALYTICAL
      field = `<textarea data-text="1" rows="4" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="${t('examAnswerPlaceholder', 'Type your answer…')}"></textarea>`;
    }

    return `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-qid="${q.question_id}" data-type="${type}">${head}${field}</div>`;
  };

  // ── Collect responses from the DOM ─────────────────────────────
  const collectResponses = () => {
    const cards = Array.from(body.querySelectorAll('[data-qid]'));
    return cards.map((card) => {
      const qid = Number(/** @type {HTMLElement} */ (card).dataset.qid);
      const type = /** @type {HTMLElement} */ (card).dataset.type;
      /** @type {any} */
      const r = { question_id: qid };
      if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') {
        const sel = /** @type {HTMLInputElement} */ (card.querySelector('input[type=radio]:checked'));
        r.selected_ids = sel ? [Number(sel.value)] : [];
      } else if (type === 'MATCH_ITEMS') {
        const obj = {};
        card.querySelectorAll('select[data-matchkey]').forEach((s) => {
          obj[/** @type {HTMLSelectElement} */ (s).dataset.matchkey] = /** @type {HTMLSelectElement} */ (s).value;
        });
        r.response_json = obj;
      } else if (type === 'CHRONOLOGICAL_ORDERING') {
        const rows = Array.from(card.querySelectorAll('input[data-answerid]'));
        const ordered = rows
          .map((el) => ({ id: Number(/** @type {HTMLInputElement} */ (el).dataset.answerid), pos: Number(/** @type {HTMLInputElement} */ (el).value) || 0 }))
          .filter((x) => x.pos > 0)
          .sort((a, b) => a.pos - b.pos)
          .map((x) => x.id);
        r.response_json = ordered;
      } else {
        const ta = /** @type {HTMLTextAreaElement} */ (card.querySelector('textarea[data-text]'));
        r.response_text = ta ? ta.value.trim() : '';
      }
      return r;
    });
  };

  // ── Load + render the exam ─────────────────────────────────────
  const load = async () => {
    body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeLoading', 'Loading your exam…')}</p>`;
    if (submitBtn) submitBtn.classList.add('hidden');
    setStatus('', undefined);

    candidateNo = resolveCandidateNo();
    if (!Number.isFinite(candidateNo)) {
      body.innerHTML = `<p class="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-10 text-center text-sm text-amber-700">${t('examTakeNoCandidate', 'A candidate number is required to load your exam.')}</p>`;
      return;
    }

    try {
      const list = await fetch(`${API_BASE}/api/exam/available?candidate_no=${candidateNo}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      const exams = (list && Array.isArray(list.exams)) ? list.exams : [];
      if (!exams.length) {
        body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeNone', 'No exam is available for your assigned training.')}</p>`;
        return;
      }
      if (exams.length === 1) {
        await loadExam(exams[0].exam_id);
        return;
      }
      // Multiple assigned trainings → let the candidate choose which to sit.
      if (subtitle) subtitle.textContent = t('examTakePick', 'Choose which exam to take');
      body.innerHTML = `<div class="space-y-2">${exams.map((e) => `
        <button type="button" data-examid="${e.exam_id}" class="exam-pick flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-[#042F8D]">
          <span>${esc(e.exam_title)}</span>
          <span class="text-xs font-medium text-slate-400">${esc(e.training_title)}</span>
        </button>`).join('')}</div>`;
      body.querySelectorAll('.exam-pick').forEach((btn) =>
        btn.addEventListener('click', () => loadExam(Number(/** @type {HTMLElement} */ (btn).dataset.examid))));
    } catch (_) {
      body.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('examLoadError', 'Could not load the exam. Is the server running?')}</p>`;
    }
  };

  // Render a delivery payload ({ ok, exam, questions }) into the overlay body.
  const renderExam = (/** @type {any} */ data) => {
    exam = data.exam;
    questions = Array.isArray(data.questions) ? data.questions : [];
    if (subtitle) subtitle.textContent = [exam.training_title, exam.instructor].filter(Boolean).join(' · ');
    if (!questions.length) {
      body.innerHTML = `${previewBanner()}${metaHtml(exam)}<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeEmpty', 'This exam has no questions yet.')}</p>`;
      if (submitBtn) submitBtn.classList.add('hidden');
      return;
    }
    body.innerHTML = `${previewBanner()}${metaHtml(exam)}` + questions.map((q, i) => renderQuestion(q, i)).join('');
    if (submitBtn) {
      submitBtn.classList.remove('hidden');
      submitBtn.removeAttribute('disabled');
      submitBtn.textContent = previewMode ? t('examPreviewFinish', 'Finish preview') : t('examTakeSubmit', 'Submit exam');
    }
  };

  const loadExam = async (/** @type {number} */ examId) => {
    body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeLoading', 'Loading your exam…')}</p>`;
    try {
      const data = await fetch(`${API_BASE}/api/exam/by-id?exam_id=${examId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (!data || !data.ok) {
        body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeNone', 'No exam is available for your assigned training.')}</p>`;
        return;
      }
      renderExam(data);
    } catch (_) {
      body.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('examLoadError', 'Could not load the exam. Is the server running?')}</p>`;
    }
  };

  const submit = async () => {
    if (!exam) return;
    // In preview mode nothing is persisted — just acknowledge and close.
    if (previewMode) {
      setStatus(t('examPreviewDone', 'Preview finished — no answers were saved.'), true);
      close();
      return;
    }
    const responses = collectResponses();
    setStatus(t('examTakeSubmitting', 'Submitting…'), undefined);
    if (submitBtn) submitBtn.setAttribute('disabled', 'true');
    try {
      const resp = await fetch(`${API_BASE}/api/exam/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.exam_id, candidate_no: candidateNo, training_id: exam.training_id, responses }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || !data.ok) throw new Error('submit failed');
      renderResult(data);
    } catch (_) {
      setStatus(t('examTakeErr', 'Could not submit your exam.'), false);
      if (submitBtn) submitBtn.removeAttribute('disabled');
    }
  };

  const renderResult = (/** @type {any} */ data) => {
    if (submitBtn) submitBtn.classList.add('hidden');
    const passLine = data.passing_score == null
      ? ''
      : `<p class="text-sm ${data.passed ? 'text-emerald-600' : 'text-red-600'} font-semibold">${data.passed ? t('examPassed', 'Passed') : t('examFailed', 'Did not pass')} (${t('examPassMark', 'pass mark')}: ${data.passing_score})</p>`;
    const reviewLine = data.needs_review
      ? `<p class="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">${t('examReviewNote', 'Some free-text answers will be graded manually by an administrator; your final score may change.')}</p>`
      : '';
    body.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h3 class="mb-2 text-lg font-bold text-[#042F8D]">${t('examResultTitle', 'Exam submitted')}</h3>
        <p class="text-3xl font-extrabold text-slate-800">${data.total_score} <span class="text-lg font-semibold text-slate-400">/ ${data.max_score}</span></p>
        ${passLine}
        ${reviewLine}
      </div>`;
    setStatus(t('examTakeDone', 'Your answers were recorded ✓'), true);
  };

  const titleEl = document.getElementById('examTakeTitle');
  const setTitle = (/** @type {string} */ txt) => { if (titleEl) titleEl.textContent = txt; };

  const open = async () => {
    previewMode = false;
    setTitle(t('examTakeTitle', 'Your exam'));
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.setAttribute('aria-hidden', 'false');
    await load();
  };
  const close = () => {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    overlay.setAttribute('aria-hidden', 'true');
    previewMode = false;
    setTitle(t('examTakeTitle', 'Your exam'));
  };

  const showOverlay = () => {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.setAttribute('aria-hidden', 'false');
  };

  // Open the overlay in preview mode from an in-memory delivery payload
  // (used by the admin "Preview as candidate" button — reflects unsaved edits).
  const openPreviewPayload = (/** @type {any} */ data) => {
    previewMode = true;
    setTitle(t('examPreviewTitle', 'Preview as candidate'));
    setStatus('', undefined);
    showOverlay();
    renderExam(data || {});
  };

  // Open the overlay in preview mode by fetching a training's saved exam
  // (used by the shareable preview route: tc.html#preview=<training_id>).
  const openPreviewByTraining = async (/** @type {number} */ trainingId) => {
    previewMode = true;
    setTitle(t('examPreviewTitle', 'Preview as candidate'));
    setStatus('', undefined);
    showOverlay();
    body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeLoading', 'Loading your exam…')}</p>`;
    try {
      const data = await fetch(`${API_BASE}/api/exam/preview?training_id=${trainingId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (!data || !data.ok) {
        body.innerHTML = `<p class="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-10 text-center text-sm text-amber-700">${t('examPreviewNone', 'This training has no configured exam to preview yet.')}</p>`;
        if (submitBtn) submitBtn.classList.add('hidden');
        return;
      }
      renderExam(data);
    } catch (_) {
      body.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('examLoadError', 'Could not load the exam. Is the server running?')}</p>`;
    }
  };

  // Expose a small public API so the admin config module can trigger previews.
  /** @type {any} */ (window).GSSExamPreview = {
    openPayload: openPreviewPayload,
    openByTraining: openPreviewByTraining,
  };

  // Shareable preview route: tc.html#preview=<training_id>
  const handlePreviewHash = () => {
    const m = /(?:^|[#&])preview=(\d+)/.exec(location.hash || '');
    if (m) openPreviewByTraining(Number(m[1]));
  };
  window.addEventListener('hashchange', handlePreviewHash);
  handlePreviewHash();

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  submitBtn?.addEventListener('click', submit);
})();
=======
// @ts-check
/// <reference path="../utils/translation.js" />
/**
 * GSS · Take exam (Candidate)
 * ------------------------------------------------------------------
 * Loads the exam template for the candidate's assigned training (via
 * applicant_training), renders each question according to its type, collects
 * the answers, submits them for auto-grading and shows the score. Free-text
 * questions (DEFINITION / ANALYTICAL) are stored for administrator review.
 */
(() => {
  'use strict';

  const overlay = document.getElementById('examTakeOverlay');
  const openBtn = document.getElementById('examTakeBtn');
  const closeBtn = document.getElementById('examTakeClose');
  const body = document.getElementById('examTakeBody');
  const subtitle = document.getElementById('examTakeSubtitle');
  const statusEl = document.getElementById('examTakeStatus');
  const submitBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('examTakeSubmit'));

  if (!overlay || !openBtn || !body) return;

  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const esc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  /** @type {any} */ let exam = null;
  /** @type {any[]} */ let questions = [];
  let candidateNo = null;
  let previewMode = false;

  const metaHtml = (/** @type {any} */ e) => {
    if (!e) return '';
    const rows = [];
    if (e.training_title) rows.push(`<span><span class="font-semibold text-slate-500">${t('examTakeCourse', 'Training')}:</span> ${esc(e.training_title)}</span>`);
    if (e.instructor) rows.push(`<span><span class="font-semibold text-slate-500">${t('examTakeInstructor', 'Instructor')}:</span> ${esc(e.instructor)}</span>`);
    const info = rows.length
      ? `<div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">${rows.join('')}</div>` : '';
    const instructions = e.instructions
      ? `<p class="mt-2 whitespace-pre-line rounded-lg border border-[#042F8D]/15 bg-[#042F8D]/5 px-3 py-2 text-sm text-slate-700">${esc(e.instructions)}</p>` : '';
    if (!info && !instructions) return '';
    return `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        ${e.exam_title ? `<h3 class="mb-1 text-sm font-bold text-[#042F8D]">${esc(e.exam_title)}</h3>` : ''}
        ${info}${instructions}
      </div>`;
  };

  const previewBanner = () => previewMode
    ? `<div class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">${t('examPreviewBanner', 'Preview mode — this is how the exam looks to a candidate. Answers will not be saved.')}</div>`
    : '';

  const setStatus = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('text-red-600', ok === false);
    statusEl.classList.toggle('text-emerald-600', ok === true);
  };

  const resolveCandidateNo = () => {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    const fromSession = session && (session.candidate_no || session.candidateNo);
    if (fromSession) return Number(fromSession);
    const entered = window.prompt(t('examTakeAskCandidate', 'Enter your candidate number to load your exam:'));
    const n = Number.parseInt(String(entered || ''), 10);
    return Number.isFinite(n) ? n : null;
  };

  // ── Render one question according to its type ──────────────────
  const renderQuestion = (/** @type {any} */ q, /** @type {number} */ idx) => {
    const type = q.question_type;
    const img = q.image_url
      ? `<img src="${esc(q.image_url)}" alt="" class="mb-3 max-h-56 w-auto rounded-lg border border-slate-200 object-contain" />`
      : '';
    const head = `
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">${idx + 1}</span>
        <span class="text-[11px] font-semibold text-slate-400">${Number(q.points) || 0} ${t('examPts', 'pts')}</span>
      </div>
      <p class="mb-3 text-sm font-semibold text-slate-800">${esc(q.question_text)}</p>${img}`;

    let field = '';
    if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') {
      field = `<div class="space-y-2">${(q.answers || []).map((/** @type {any} */ a, i) => `
        <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-[#042F8D]">
          <input type="radio" name="q${q.question_id}" value="${a.answer_id}" class="accent-[#042F8D]" />
          <span class="font-bold text-[#042F8D]">${esc(a.answer_key || letters[i] || (i + 1))}.</span>
          <span>${esc(a.answer_text)}</span>
        </label>`).join('')}</div>`;
    } else if (type === 'MATCH_ITEMS') {
      const values = (q.answers || []).map((/** @type {any} */ a) => a.match_value);
      // Present each left item with a dropdown of all possible right values.
      field = `<div class="space-y-2">${(q.answers || []).map((/** @type {any} */ a) => `
        <div class="flex items-center gap-2 text-sm">
          <span class="min-w-[40%] rounded bg-slate-100 px-2 py-1 font-medium">${esc(a.match_key)}</span>
          <span class="text-slate-400">→</span>
          <select data-matchkey="${esc(a.match_key)}" class="flex-1 rounded-md border border-slate-200 px-2 py-1">
            <option value="">${t('examSelect', 'Select…')}</option>
            ${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}
          </select>
        </div>`).join('')}</div>`;
    } else if (type === 'CHRONOLOGICAL_ORDERING') {
      // Present each item with an order number input.
      field = `<div class="space-y-2" data-ordering="1">${(q.answers || []).map((/** @type {any} */ a) => `
        <div class="flex items-center gap-2 text-sm">
          <input type="number" min="1" max="${(q.answers || []).length}" data-answerid="${a.answer_id}" class="w-14 rounded-md border border-slate-200 px-2 py-1 text-center" />
          <span>${esc(a.answer_text)}</span>
        </div>`).join('')}<p class="text-[11px] text-slate-400">${t('examOrderHint', 'Number the items from 1 (first) to last.')}</p></div>`;
    } else {
      // DEFINITION / ANALYTICAL
      field = `<textarea data-text="1" rows="4" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="${t('examAnswerPlaceholder', 'Type your answer…')}"></textarea>`;
    }

    return `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-qid="${q.question_id}" data-type="${type}">${head}${field}</div>`;
  };

  // ── Collect responses from the DOM ─────────────────────────────
  const collectResponses = () => {
    const cards = Array.from(body.querySelectorAll('[data-qid]'));
    return cards.map((card) => {
      const qid = Number(/** @type {HTMLElement} */ (card).dataset.qid);
      const type = /** @type {HTMLElement} */ (card).dataset.type;
      /** @type {any} */
      const r = { question_id: qid };
      if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') {
        const sel = /** @type {HTMLInputElement} */ (card.querySelector('input[type=radio]:checked'));
        r.selected_ids = sel ? [Number(sel.value)] : [];
      } else if (type === 'MATCH_ITEMS') {
        const obj = {};
        card.querySelectorAll('select[data-matchkey]').forEach((s) => {
          obj[/** @type {HTMLSelectElement} */ (s).dataset.matchkey] = /** @type {HTMLSelectElement} */ (s).value;
        });
        r.response_json = obj;
      } else if (type === 'CHRONOLOGICAL_ORDERING') {
        const rows = Array.from(card.querySelectorAll('input[data-answerid]'));
        const ordered = rows
          .map((el) => ({ id: Number(/** @type {HTMLInputElement} */ (el).dataset.answerid), pos: Number(/** @type {HTMLInputElement} */ (el).value) || 0 }))
          .filter((x) => x.pos > 0)
          .sort((a, b) => a.pos - b.pos)
          .map((x) => x.id);
        r.response_json = ordered;
      } else {
        const ta = /** @type {HTMLTextAreaElement} */ (card.querySelector('textarea[data-text]'));
        r.response_text = ta ? ta.value.trim() : '';
      }
      return r;
    });
  };

  // ── Load + render the exam ─────────────────────────────────────
  const load = async () => {
    body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeLoading', 'Loading your exam…')}</p>`;
    if (submitBtn) submitBtn.classList.add('hidden');
    setStatus('', undefined);

    candidateNo = resolveCandidateNo();
    if (!Number.isFinite(candidateNo)) {
      body.innerHTML = `<p class="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-10 text-center text-sm text-amber-700">${t('examTakeNoCandidate', 'A candidate number is required to load your exam.')}</p>`;
      return;
    }

    try {
      const list = await fetch(`${API_BASE}/api/exam/available?candidate_no=${candidateNo}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      const exams = (list && Array.isArray(list.exams)) ? list.exams : [];
      if (!exams.length) {
        body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeNone', 'No exam is available for your assigned training.')}</p>`;
        return;
      }
      if (exams.length === 1) {
        await loadExam(exams[0].exam_id);
        return;
      }
      // Multiple assigned trainings → let the candidate choose which to sit.
      if (subtitle) subtitle.textContent = t('examTakePick', 'Choose which exam to take');
      body.innerHTML = `<div class="space-y-2">${exams.map((e) => `
        <button type="button" data-examid="${e.exam_id}" class="exam-pick flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-[#042F8D]">
          <span>${esc(e.exam_title)}</span>
          <span class="text-xs font-medium text-slate-400">${esc(e.training_title)}</span>
        </button>`).join('')}</div>`;
      body.querySelectorAll('.exam-pick').forEach((btn) =>
        btn.addEventListener('click', () => loadExam(Number(/** @type {HTMLElement} */ (btn).dataset.examid))));
    } catch (_) {
      body.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('examLoadError', 'Could not load the exam. Is the server running?')}</p>`;
    }
  };

  // Render a delivery payload ({ ok, exam, questions }) into the overlay body.
  const renderExam = (/** @type {any} */ data) => {
    exam = data.exam;
    questions = Array.isArray(data.questions) ? data.questions : [];
    if (subtitle) subtitle.textContent = [exam.training_title, exam.instructor].filter(Boolean).join(' · ');
    if (!questions.length) {
      body.innerHTML = `${previewBanner()}${metaHtml(exam)}<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeEmpty', 'This exam has no questions yet.')}</p>`;
      if (submitBtn) submitBtn.classList.add('hidden');
      return;
    }
    body.innerHTML = `${previewBanner()}${metaHtml(exam)}` + questions.map((q, i) => renderQuestion(q, i)).join('');
    if (submitBtn) {
      submitBtn.classList.remove('hidden');
      submitBtn.removeAttribute('disabled');
      submitBtn.textContent = previewMode ? t('examPreviewFinish', 'Finish preview') : t('examTakeSubmit', 'Submit exam');
    }
  };

  const loadExam = async (/** @type {number} */ examId) => {
    body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeLoading', 'Loading your exam…')}</p>`;
    try {
      const data = await fetch(`${API_BASE}/api/exam/by-id?exam_id=${examId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (!data || !data.ok) {
        body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeNone', 'No exam is available for your assigned training.')}</p>`;
        return;
      }
      renderExam(data);
    } catch (_) {
      body.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('examLoadError', 'Could not load the exam. Is the server running?')}</p>`;
    }
  };

  const submit = async () => {
    if (!exam) return;
    // In preview mode nothing is persisted — just acknowledge and close.
    if (previewMode) {
      setStatus(t('examPreviewDone', 'Preview finished — no answers were saved.'), true);
      close();
      return;
    }
    const responses = collectResponses();
    setStatus(t('examTakeSubmitting', 'Submitting…'), undefined);
    if (submitBtn) submitBtn.setAttribute('disabled', 'true');
    try {
      const resp = await fetch(`${API_BASE}/api/exam/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.exam_id, candidate_no: candidateNo, training_id: exam.training_id, responses }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || !data.ok) throw new Error('submit failed');
      renderResult(data);
    } catch (_) {
      setStatus(t('examTakeErr', 'Could not submit your exam.'), false);
      if (submitBtn) submitBtn.removeAttribute('disabled');
    }
  };

  const renderResult = (/** @type {any} */ data) => {
    if (submitBtn) submitBtn.classList.add('hidden');
    const passLine = data.passing_score == null
      ? ''
      : `<p class="text-sm ${data.passed ? 'text-emerald-600' : 'text-red-600'} font-semibold">${data.passed ? t('examPassed', 'Passed') : t('examFailed', 'Did not pass')} (${t('examPassMark', 'pass mark')}: ${data.passing_score})</p>`;
    const reviewLine = data.needs_review
      ? `<p class="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">${t('examReviewNote', 'Some free-text answers will be graded manually by an administrator; your final score may change.')}</p>`
      : '';
    body.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h3 class="mb-2 text-lg font-bold text-[#042F8D]">${t('examResultTitle', 'Exam submitted')}</h3>
        <p class="text-3xl font-extrabold text-slate-800">${data.total_score} <span class="text-lg font-semibold text-slate-400">/ ${data.max_score}</span></p>
        ${passLine}
        ${reviewLine}
      </div>`;
    setStatus(t('examTakeDone', 'Your answers were recorded ✓'), true);
  };

  const titleEl = document.getElementById('examTakeTitle');
  const setTitle = (/** @type {string} */ txt) => { if (titleEl) titleEl.textContent = txt; };

  const open = async () => {
    previewMode = false;
    setTitle(t('examTakeTitle', 'Your exam'));
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.setAttribute('aria-hidden', 'false');
    await load();
  };
  const close = () => {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    overlay.setAttribute('aria-hidden', 'true');
    previewMode = false;
    setTitle(t('examTakeTitle', 'Your exam'));
  };

  const showOverlay = () => {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.setAttribute('aria-hidden', 'false');
  };

  // Open the overlay in preview mode from an in-memory delivery payload
  // (used by the admin "Preview as candidate" button — reflects unsaved edits).
  const openPreviewPayload = (/** @type {any} */ data) => {
    previewMode = true;
    setTitle(t('examPreviewTitle', 'Preview as candidate'));
    setStatus('', undefined);
    showOverlay();
    renderExam(data || {});
  };

  // Open the overlay in preview mode by fetching a training's saved exam
  // (used by the shareable preview route: tc.html#preview=<training_id>).
  const openPreviewByTraining = async (/** @type {number} */ trainingId) => {
    previewMode = true;
    setTitle(t('examPreviewTitle', 'Preview as candidate'));
    setStatus('', undefined);
    showOverlay();
    body.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examTakeLoading', 'Loading your exam…')}</p>`;
    try {
      const data = await fetch(`${API_BASE}/api/exam/preview?training_id=${trainingId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (!data || !data.ok) {
        body.innerHTML = `<p class="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-10 text-center text-sm text-amber-700">${t('examPreviewNone', 'This training has no configured exam to preview yet.')}</p>`;
        if (submitBtn) submitBtn.classList.add('hidden');
        return;
      }
      renderExam(data);
    } catch (_) {
      body.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('examLoadError', 'Could not load the exam. Is the server running?')}</p>`;
    }
  };

  // Expose a small public API so the admin config module can trigger previews.
  /** @type {any} */ (window).GSSExamPreview = {
    openPayload: openPreviewPayload,
    openByTraining: openPreviewByTraining,
  };

  // Shareable preview route: tc.html#preview=<training_id>
  const handlePreviewHash = () => {
    const m = /(?:^|[#&])preview=(\d+)/.exec(location.hash || '');
    if (m) openPreviewByTraining(Number(m[1]));
  };
  window.addEventListener('hashchange', handlePreviewHash);
  handlePreviewHash();

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  submitBtn?.addEventListener('click', submit);
})();
>>>>>>> 58843b751bc0aaa1d0cd6dd2761671070c1334b5
