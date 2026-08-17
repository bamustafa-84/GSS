// @ts-check
/// <reference path="../utils/translation.js" />
/**
 * GSS · Exam configuration
 * ------------------------------------------------------------------
 * Admin-only modal to build an exam for a training course by dragging
 * questions from the DB-backed library (left) into the exam configuration
 * (right). Questions are scoped to the selected training course. The exam
 * configuration is kept in a JS data model (the source of truth); the DOM is
 * only a rendering of it.
 *
 *   examConfig = { examId: null, training_id, questions: [{ questionId, order, type }] }
 */
(() => {
  'use strict';

  const overlay = document.getElementById('examOverlay');
  const openBtn = document.getElementById('examConfigBtn');
  const closeBtn = document.getElementById('examClose');
  const cancelBtn = document.getElementById('examCancel');
  const saveBtn = document.getElementById('examSave');
  const trainingSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('examTraining'));
  const libraryEl = document.getElementById('examLibrary');
  const libHint = document.getElementById('examLibHint');
  const libCount = document.getElementById('examLibCount');
  const dropzone = document.getElementById('examDropzone');
  const emptyEl = document.getElementById('examEmpty');
  const configCount = document.getElementById('examConfigCount');
  const statusEl = document.getElementById('examStatus');

  if (!overlay || !openBtn || !trainingSelect || !libraryEl || !dropzone) return;

  // ── i18n helper ────────────────────────────────────────────────
  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // ── Data model (source of truth) ───────────────────────────────
  /** @type {{ examId: number|null, training_id: number|null, questions: {questionId:number, order:number, type:string}[] }} */
  let examConfig = { examId: null, training_id: null, questions: [] };
  /** @type {Map<number, any>} questionId → full question record (text/type/options) */
  let questionsById = new Map();

  const typeLabel = (/** @type {string} */ type) =>
    type === 'multiple_choice' ? t('examTypeMC', 'Multiple choice') : t('examTypeText', 'Text answer');

  const typeBadge = (/** @type {string} */ type) => {
    if (type === 'multiple_choice') {
      return `<span class="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        ${typeLabel(type)}</span>`;
    }
    return `<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
      ${typeLabel(type)}</span>`;
  };

  const esc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  // ── Load training courses into the selector ────────────────────
  const loadTrainings = async () => {
    try {
      const data = await fetch(`${API_BASE}/api/training`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      const rows = Array.isArray(data.trainings) ? data.trainings : [];
      const current = trainingSelect.value;
      trainingSelect.innerHTML = `<option value="">${t('examPickCourse', 'Select a course…')}</option>`;
      rows.forEach((/** @type {any} */ row) => {
        const opt = document.createElement('option');
        opt.value = String(row.training_id);
        opt.textContent = row.training_title + (row.trainer ? ` · ${row.trainer}` : '');
        trainingSelect.appendChild(opt);
      });
      if (current) trainingSelect.value = current;
    } catch (_) { /* noop */ }
  };

  // ── Load questions for the selected training ───────────────────
  const loadQuestions = async () => {
    questionsById = new Map();
    const trainingId = Number.parseInt(trainingSelect.value, 10);
    examConfig = { examId: null, training_id: Number.isFinite(trainingId) ? trainingId : null, questions: [] };
    renderConfig();

    if (!Number.isFinite(trainingId)) {
      libraryEl.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examSelectFirst', 'Please select a training course to load its questions.')}</p>`;
      if (libCount) libCount.textContent = '';
      return;
    }

    try {
      const data = await fetch(`${API_BASE}/api/questions?training_id=${trainingId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      const questions = Array.isArray(data.questions) ? data.questions : [];
      questions.forEach((q) => questionsById.set(Number(q.question_id), q));
      renderLibrary(questions);
    } catch (_) {
      libraryEl.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('examLoadError', 'Could not load questions. Is the server running?')}</p>`;
      if (libCount) libCount.textContent = '';
    }
  };

  // ── Render the question library (left) ─────────────────────────
  const renderLibrary = (/** @type {any[]} */ questions) => {
    if (libCount) libCount.textContent = String(questions.length);
    if (!questions.length) {
      libraryEl.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examNoQuestions', 'No questions are available for this training course.')}</p>`;
      return;
    }
    libraryEl.innerHTML = '';
    questions.forEach((q) => {
      const used = examConfig.questions.some((x) => x.questionId === Number(q.question_id));
      const card = document.createElement('div');
      card.dataset.qid = String(q.question_id);
      card.dataset.type = q.question_type;
      card.draggable = !used;
      card.className = `exam-lib-card group rounded-xl border bg-white p-3 shadow-sm transition ${used ? 'cursor-not-allowed border-slate-100 opacity-50' : 'cursor-grab border-slate-200 hover:border-[#042F8D] hover:shadow'}`;
      card.innerHTML = `
        <div class="mb-1.5 flex items-center justify-between gap-2">
          ${typeBadge(q.question_type)}
          ${used ? `<span class="text-[11px] font-semibold text-emerald-600">${t('examAdded', 'Added')}</span>` : `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-300 group-hover:text-[#042F8D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`}
        </div>
        <p class="text-sm font-medium text-slate-800">${esc(q.question_text)}</p>`;
      if (!used) {
        card.addEventListener('dragstart', (e) => {
          card.classList.add('opacity-60');
          e.dataTransfer?.setData('text/plain', String(q.question_id));
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
        });
        card.addEventListener('dragend', () => card.classList.remove('opacity-60'));
        // Double-click also adds (accessibility / convenience).
        card.addEventListener('dblclick', () => addQuestion(Number(q.question_id)));
      }
      libraryEl.appendChild(card);
    });
  };

  // ── Config model operations ────────────────────────────────────
  const addQuestion = (/** @type {number} */ questionId) => {
    if (examConfig.questions.some((x) => x.questionId === questionId)) return; // no duplicates
    const q = questionsById.get(questionId);
    if (!q) return;
    examConfig.questions.push({ questionId, order: examConfig.questions.length + 1, type: q.question_type });
    reindex();
    renderConfig();
    // Refresh library to grey out the added card.
    renderLibrary(Array.from(questionsById.values()));
  };

  const removeQuestion = (/** @type {number} */ questionId) => {
    examConfig.questions = examConfig.questions.filter((x) => x.questionId !== questionId);
    reindex();
    renderConfig();
    renderLibrary(Array.from(questionsById.values()));
  };

  const reindex = () => { examConfig.questions.forEach((x, i) => { x.order = i + 1; }); };

  // ── Render one configured question (right) ─────────────────────
  const renderQuestionBody = (/** @type {any} */ q) => {
    if (q.question_type === 'multiple_choice') {
      const opts = Array.isArray(q.options) ? q.options : [];
      return `<ul class="mt-2 space-y-1.5">${opts.map((/** @type {any} */ o, i) => `
        <li class="flex items-start gap-2 rounded-lg px-2 py-1 text-sm ${o.is_correct ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'text-slate-700'}">
          <span class="font-bold text-[#042F8D]">${letters[i] || (i + 1)}.</span>
          <span>${esc(o.option_text)}</span>
          ${o.is_correct ? `<span class="ml-auto shrink-0 text-[11px] font-semibold text-emerald-600" data-i18n="examCorrect">Correct</span>` : ''}
        </li>`).join('')}</ul>`;
    }
    // Text answer
    const multiline = (q.input_mode || 'multiline') !== 'single';
    const field = multiline
      ? `<textarea rows="2" disabled class="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400" placeholder="${t('examAnswerPlaceholder', 'Student answer…')}"></textarea>`
      : `<input type="text" disabled class="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400" placeholder="${t('examAnswerPlaceholder', 'Student answer…')}" />`;
    return field;
  };

  const renderConfig = () => {
    const items = examConfig.questions;
    if (configCount) configCount.textContent = String(items.length);
    if (!dropzone) return;

    // Empty state.
    if (!items.length) {
      dropzone.innerHTML = `<p id="examEmpty" class="flex h-full min-h-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-400">${t('examDropHint', 'Drag and drop questions here to configure the exam.')}</p>`;
      return;
    }

    dropzone.innerHTML = '';
    items.forEach((item) => {
      const q = questionsById.get(item.questionId);
      if (!q) return;
      const card = document.createElement('div');
      card.dataset.qid = String(item.questionId);
      card.draggable = true;
      card.className = 'exam-cfg-card rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center gap-2">
              <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">${item.order}</span>
              ${typeBadge(q.question_type)}
            </div>
            <p class="text-sm font-semibold text-slate-800">${esc(q.question_text)}</p>
            ${renderQuestionBody(q)}
          </div>
          <div class="flex shrink-0 flex-col items-center gap-2">
            <span class="cursor-grab text-slate-300" title="${t('examReorder', 'Drag to reorder')}"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg></span>
            <button type="button" class="exam-remove inline-flex items-center gap-1 rounded-full border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:border-red-500 hover:bg-red-50" data-i18n="examRemove">${t('examRemove', 'Remove')}</button>
          </div>
        </div>`;
      card.querySelector('.exam-remove')?.addEventListener('click', () => removeQuestion(item.questionId));
      wireReorder(card);
      dropzone.appendChild(card);
    });
  };

  // ── Reordering within the config (drag & drop) ─────────────────
  /** @type {number|null} */
  let dragQid = null;
  const wireReorder = (/** @type {HTMLElement} */ card) => {
    card.addEventListener('dragstart', (e) => {
      dragQid = Number(card.dataset.qid);
      card.classList.add('opacity-50', 'ring-2', 'ring-[#042F8D]');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      // Mark as an internal reorder so the dropzone handler can distinguish it.
      e.dataTransfer?.setData('application/x-exam-reorder', String(dragQid));
    });
    card.addEventListener('dragend', () => {
      dragQid = null;
      card.classList.remove('opacity-50', 'ring-2', 'ring-[#042F8D]');
    });
    card.addEventListener('dragover', (e) => {
      if (dragQid == null) return;
      e.preventDefault();
      const target = Number(card.dataset.qid);
      if (target === dragQid) return;
      moveBefore(dragQid, target);
    });
  };

  const moveBefore = (/** @type {number} */ qid, /** @type {number} */ beforeQid) => {
    const from = examConfig.questions.findIndex((x) => x.questionId === qid);
    const to = examConfig.questions.findIndex((x) => x.questionId === beforeQid);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = examConfig.questions.splice(from, 1);
    examConfig.questions.splice(to, 0, moved);
    reindex();
    renderConfig();
  };

  // ── Dropzone: accept new questions from the library ────────────
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('bg-[#042F8D]/5', 'ring-2', 'ring-inset', 'ring-[#042F8D]/40');
  });
  dropzone.addEventListener('dragleave', (e) => {
    if (e.target === dropzone) dropzone.classList.remove('bg-[#042F8D]/5', 'ring-2', 'ring-inset', 'ring-[#042F8D]/40');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('bg-[#042F8D]/5', 'ring-2', 'ring-inset', 'ring-[#042F8D]/40');
    // Internal reorders are handled by card dragover; ignore them here.
    if (e.dataTransfer?.getData('application/x-exam-reorder')) return;
    const qid = Number.parseInt(e.dataTransfer?.getData('text/plain') || '', 10);
    if (Number.isFinite(qid)) addQuestion(qid);
  });

  // ── Save ───────────────────────────────────────────────────────
  const setStatus = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('text-red-600', !ok);
    statusEl.classList.toggle('text-emerald-600', ok);
  };

  const save = async () => {
    if (!examConfig.training_id) { setStatus(t('examSelectFirst', 'Please select a training course first.'), false); return; }
    if (!examConfig.questions.length) { setStatus(t('examErrEmpty', 'Add at least one question before saving.'), false); return; }

    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    const payload = {
      training_id: examConfig.training_id,
      created_by: session && (session.full_name || session.username) ? String(session.full_name || session.username) : '',
      questions: examConfig.questions.map((x) => ({ question_id: x.questionId, order: x.order, type: x.type })),
    };
    try {
      const resp = await fetch(`${API_BASE}/api/exams`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || !data.ok) throw new Error('save failed');
      examConfig.examId = data.exam_id;
      setStatus(t('examSaved', 'Exam configuration saved ✓'), true);
      if (saveBtn) { saveBtn.setAttribute('disabled', 'true'); window.setTimeout(() => saveBtn.removeAttribute('disabled'), 1200); }
    } catch (_) {
      setStatus(t('examErrSave', 'Could not save the exam configuration.'), false);
    }
  };

  // ── Open / close ───────────────────────────────────────────────
  const open = async () => {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.setAttribute('aria-hidden', 'false');
    setStatus('', true);
    await loadTrainings();
    await loadQuestions();
  };
  const close = () => {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    overlay.setAttribute('aria-hidden', 'true');
  };

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  trainingSelect.addEventListener('change', () => { setStatus('', true); loadQuestions(); });
  saveBtn?.addEventListener('click', save);

  // Re-render labels on language switch while open.
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      if (overlay.classList.contains('hidden')) return;
      renderLibrary(Array.from(questionsById.values()));
      renderConfig();
    })
  );
})();
