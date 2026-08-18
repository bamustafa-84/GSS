// @ts-check
/// <reference path="../utils/translation.js" />
/**
 * GSS · Exam configuration (Admin)
 * ------------------------------------------------------------------
 * Build one exam template per training course by dragging questions from the
 * DB-backed library (left) into the exam configuration (right). Supports the
 * full question-type set, per-question grading (points), inline editing of the
 * question text / answers / correct answer, drag-and-drop add + reorder, and
 * saving the whole thing back as the training's exam template.
 *
 * Data model (source of truth is `examConfig.questions`, an ordered list of
 * full question records). The DOM is only a rendering of it.
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
  const libCount = document.getElementById('examLibCount');
  const dropzone = document.getElementById('examDropzone');
  const configCount = document.getElementById('examConfigCount');
  const statusEl = document.getElementById('examStatus');
  const newQuestionBtn = document.getElementById('examNewQuestion');
  const instructorEl = document.getElementById('examInstructor');
  const instructionsEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('examInstructions'));
  const previewBtn = document.getElementById('examPreview');
  const examDateEl = /** @type {HTMLInputElement | null} */ (document.getElementById('examDate'));
  const examDurationEl = /** @type {HTMLInputElement | null} */ (document.getElementById('examDuration'));
  const examPassingEl = /** @type {HTMLInputElement | null} */ (document.getElementById('examPassing'));
  const examStatusBadge = document.getElementById('examStatusBadge');
  const publishBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('examPublish'));
  const credentialsBtn = document.getElementById('examCredentialsBtn');

  const currentUserId = () => {
    try { const s = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null; return s ? (s.user_id || s.login_id || null) : null; } catch (_) { return null; }
  };

  if (!overlay || !openBtn || !trainingSelect || !libraryEl || !dropzone) return;

  /** @type {Map<number, string>} training_id → trainer/instructor name */
  const trainerById = new Map();

  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const TYPES = [
    { v: 'MULTIPLE_CHOICE', label: 'Multiple choice' },
    { v: 'TRUE_FALSE', label: 'True / False' },
    { v: 'MATCH_ITEMS', label: 'Match items' },
    { v: 'CHRONOLOGICAL_ORDERING', label: 'Ordering' },
    { v: 'DEFINITION', label: 'Definition' },
    { v: 'ANALYTICAL', label: 'Analytical' },
  ];
  const typeLabel = (/** @type {string} */ v) => (TYPES.find((x) => x.v === v) || { label: v }).label;
  const isChoice = (/** @type {string} */ v) => v === 'MULTIPLE_CHOICE' || v === 'TRUE_FALSE';
  const isText = (/** @type {string} */ v) => v === 'DEFINITION' || v === 'ANALYTICAL';

  /** @type {{ examId:number|null, training_id:number|null, instructions:string, status:string, questions:any[] }} */
  let examConfig = { examId: null, training_id: null, instructions: '', status: 'DRAFT', questions: [] };
  /** @type {Map<number, any>} questionId → library record */
  let libraryById = new Map();

  const esc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  const typeBadge = (/** @type {string} */ type) => {
    const color = isChoice(type) ? 'indigo' : isText(type) ? 'amber' : 'teal';
    return `<span class="inline-flex items-center gap-1 rounded-full bg-${color}-50 px-2 py-0.5 text-[11px] font-semibold text-${color}-700 ring-1 ring-${color}-200">${esc(typeLabel(type))}</span>`;
  };

  // ── Load training courses into the selector ────────────────────
  const loadTrainings = async () => {
    try {
      const data = await fetch(`${API_BASE}/api/training`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      const rows = Array.isArray(data.trainings) ? data.trainings : [];
      const current = trainingSelect.value;
      trainerById.clear();
      trainingSelect.innerHTML = `<option value="">${t('examPickCourse', 'Select a course…')}</option>`;
      rows.forEach((/** @type {any} */ row) => {
        const opt = document.createElement('option');
        opt.value = String(row.training_id);
        opt.textContent = row.training_title || row.title;
        trainingSelect.appendChild(opt);
        trainerById.set(Number(row.training_id), row.trainer || '');
      });
      if (current) trainingSelect.value = current;
      renderInstructor();
    } catch (_) { /* noop */ }
  };

  // ── Show the instructor for the selected training ──────────────
  const renderInstructor = () => {
    if (!instructorEl) return;
    const id = Number.parseInt(trainingSelect.value, 10);
    const name = Number.isFinite(id) ? (trainerById.get(id) || '') : '';
    if (name) {
      instructorEl.textContent = `${t('examInstructor', 'Instructor')}: ${name}`;
      instructorEl.classList.remove('hidden');
    } else {
      instructorEl.textContent = '';
      instructorEl.classList.add('hidden');
    }
  };

  // ── Load the training's questions (library) and existing exam config ──
  const loadQuestions = async () => {
    libraryById = new Map();
    const trainingId = Number.parseInt(trainingSelect.value, 10);
    examConfig = { examId: null, training_id: Number.isFinite(trainingId) ? trainingId : null, instructions: '', status: 'DRAFT', questions: [] };
    updateActions();

    if (!Number.isFinite(trainingId)) {
      libraryEl.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examSelectFirst', 'Please select a training course to load its questions.')}</p>`;
      if (libCount) libCount.textContent = '';
      if (instructionsEl) instructionsEl.value = '';
      if (examDateEl) examDateEl.value = '';
      if (examDurationEl) examDurationEl.value = '';
      if (examPassingEl) examPassingEl.value = '';
      renderExamStatus();
      updatePublishState();
      renderConfig();
      return;
    }

    try {
      const [data, preview] = await Promise.all([
        fetch(`${API_BASE}/api/questions?training_id=${trainingId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json()),
        fetch(`${API_BASE}/api/exam/preview?training_id=${trainingId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json()).catch(() => null),
      ]);
      const questions = Array.isArray(data.questions) ? data.questions : [];
      // @ts-ignore
      questions.forEach((q) => libraryById.set(Number(q.question_id), q));
      // The exam configuration = library questions flagged as in_exam, ordered.
      examConfig.questions = questions
        // @ts-ignore
        .filter((q) => q.in_exam !== false)
        // @ts-ignore
        .sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0))
        // @ts-ignore
        .map((q) => cloneQ(q));
      examConfig.instructions = (preview && preview.exam && preview.exam.instructions) || '';
      if (instructionsEl) instructionsEl.value = examConfig.instructions;
      // Populate the publishing settings from the saved exam meta.
      const ex = (preview && preview.exam) || {};
      examConfig.examId = ex.exam_id != null ? Number(ex.exam_id) : examConfig.examId;
      examConfig.status = ex.status || 'DRAFT';
      if (examDateEl) examDateEl.value = ex.exam_date ? String(ex.exam_date).slice(0, 10) : '';
      if (examDurationEl) examDurationEl.value = ex.duration_minutes != null ? String(ex.duration_minutes) : '';
      if (examPassingEl) examPassingEl.value = ex.passing_score != null ? String(ex.passing_score) : '';
      renderExamStatus();
      renderLibrary();
      renderConfig();
      updatePublishState();
    } catch (_) {
      libraryEl.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('examLoadError', 'Could not load questions. Is the server running?')}</p>`;
      if (libCount) libCount.textContent = '';
    }
  };

  // Enable/disable the toolbar actions based on whether a training is selected.
  const updateActions = () => {
    const hasTraining = Number.isFinite(Number.parseInt(trainingSelect.value, 10));
    [newQuestionBtn, previewBtn].forEach((btn) => {
      if (!btn) return;
      /** @type {HTMLButtonElement} */ (btn).disabled = !hasTraining;
      btn.classList.toggle('opacity-50', !hasTraining);
      btn.classList.toggle('cursor-not-allowed', !hasTraining);
    });
    if (instructionsEl) instructionsEl.disabled = !hasTraining;
  };

  const cloneQ = (/** @type {any} */ q) => ({
    question_id: Number(q.question_id),
    question_text: q.question_text || '',
    question_type: q.question_type,
    points: Number(q.points) || 1,
    is_required: q.is_required !== false,
    image_url: q.image_url || '',
    // @ts-ignore
    answers: (Array.isArray(q.answers) ? q.answers : []).map((a) => ({
      answer_id: a.answer_id,
      answer_key: a.answer_key || '',
      answer_text: a.answer_text || '',
      is_correct: !!a.is_correct,
      match_key: a.match_key || '',
      match_value: a.match_value || '',
    })),
  });

  // ── Question library (left) ────────────────────────────────────
  const renderLibrary = () => {
    const questions = Array.from(libraryById.values());
    if (libCount) libCount.textContent = String(questions.length);
    if (!questions.length) {
      libraryEl.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('examNoQuestions', 'No questions yet. Use “New question” to create one for this training.')}</p>`;
      return;
    }
    libraryEl.innerHTML = '';
    questions.forEach((q) => {
      const used = examConfig.questions.some((x) => x.question_id === Number(q.question_id));
      const card = document.createElement('div');
      card.dataset.qid = String(q.question_id);
      card.draggable = !used;
      card.className = `exam-lib-card group rounded-xl border bg-white p-3 shadow-sm transition ${used ? 'border-emerald-200' : 'cursor-grab border-slate-200 hover:border-[#042F8D] hover:shadow'}`;
      const thumb = q.image_url
        ? `<img src="${esc(q.image_url)}" alt="" class="mb-2 h-16 w-full rounded-md border border-slate-100 object-cover" />` : '';
      card.innerHTML = `
        <div class="mb-1.5 flex items-center justify-between gap-2">
          ${typeBadge(q.question_type)}
          <span class="text-[11px] font-semibold ${used ? 'text-emerald-600' : 'text-slate-400'}">${used ? t('examAdded', 'In exam') : `${Number(q.points) || 1} ${t('examPts', 'pts')}`}</span>
        </div>
        ${thumb}
        <p class="text-sm font-medium text-slate-800">${esc(q.question_text)}</p>
        <div class="mt-2 flex items-center gap-1.5">
          <button type="button" class="lib-add rounded-full px-2.5 py-1 text-xs font-semibold transition ${used ? 'cursor-not-allowed border border-slate-200 text-slate-300' : 'bg-[#042F8D] text-white hover:-translate-y-px'}" ${used ? 'disabled' : ''}>${used ? t('examAdded', 'In exam') : t('examAddToExam', 'Add to exam')}</button>
          <button type="button" class="lib-edit rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-[#042F8D] hover:text-[#042F8D]">${t('examEdit', 'Edit')}</button>
          <button type="button" class="lib-delete ml-auto rounded-full border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:border-red-500 hover:bg-red-50">${t('examDelete', 'Delete')}</button>
        </div>`;
      if (!used) {
        card.addEventListener('dragstart', (e) => {
          card.classList.add('opacity-60');
          e.dataTransfer?.setData('text/plain', String(q.question_id));
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
        });
        card.addEventListener('dragend', () => card.classList.remove('opacity-60'));
        card.querySelector('.lib-add')?.addEventListener('click', () => addQuestion(Number(q.question_id)));
      }
      card.querySelector('.lib-edit')?.addEventListener('click', () => openEditor(cloneQ(q), { persist: true }));
      card.querySelector('.lib-delete')?.addEventListener('click', () => deleteLibraryQuestion(q));
      libraryEl.appendChild(card);
    });
  };

  // ── Persisted library CRUD (create / edit / delete) ────────────
  const saveQuestion = async (/** @type {any} */ payload) => {
    const resp = await fetch(`${API_BASE}/api/question/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || !data.ok) throw new Error('save failed');
    return data;
  };

  const deleteLibraryQuestion = async (/** @type {any} */ q) => {
    const ok = await confirmDialog(
      t('examDeleteTitle', 'Delete question'),
      t('examDeleteMsg', 'This permanently deletes the question from this training. This cannot be undone.'),
      esc(q.question_text));
    if (!ok) return;
    try {
      const resp = await fetch(`${API_BASE}/api/question/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: Number(q.question_id) }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || !data.ok) throw new Error('delete failed');
      examConfig.questions = examConfig.questions.filter((x) => x.question_id !== Number(q.question_id));
      await loadQuestions();
      setStatus(t('examDeleted', 'Question deleted ✓'), true);
    } catch (_) {
      setStatus(t('examDeleteErr', 'Could not delete the question.'), false);
    }
  };

  // Lightweight confirmation dialog (returns a Promise<boolean>).
  const confirmDialog = (/** @type {string} */ title, /** @type {string} */ msg, /** @type {string} */ detail) =>
    new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-4';
      wrap.innerHTML = `
        <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
          <h3 class="mb-2 text-sm font-bold text-red-600">${esc(title)}</h3>
          <p class="text-sm text-slate-600">${esc(msg)}</p>
          ${detail ? `<p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">“${detail}”</p>` : ''}
          <div class="mt-4 flex justify-end gap-2">
            <button type="button" data-cd="0" class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">${t('examCancel', 'Cancel')}</button>
            <button type="button" data-cd="1" class="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">${t('examDelete', 'Delete')}</button>
          </div>
        </div>`;
      const done = (/** @type {boolean} */ v) => { wrap.remove(); resolve(v); };
      wrap.addEventListener('click', (e) => {
        const el = /** @type {HTMLElement} */ (e.target);
        if (el === wrap) return done(false);
        if (el.dataset && el.dataset.cd != null) done(el.dataset.cd === '1');
      });
      document.body.appendChild(wrap);
    });

  // ── Config operations ──────────────────────────────────────────
  const addQuestion = (/** @type {number} */ questionId) => {
    if (examConfig.questions.some((x) => x.question_id === questionId)) return;
    const q = libraryById.get(questionId);
    if (!q) return;
    examConfig.questions.push(cloneQ(q));
    renderConfig();
    renderLibrary();
  };

  const removeQuestion = (/** @type {number} */ questionId) => {
    examConfig.questions = examConfig.questions.filter((x) => x.question_id !== questionId);
    renderConfig();
    renderLibrary();
  };

  // ── Render answers by type (read view) ─────────────────────────
  const renderAnswers = (/** @type {any} */ q) => {
    const type = q.question_type;
    if (isChoice(type)) {
      // @ts-ignore
      return `<ul class="mt-2 space-y-1.5">${(q.answers || []).map((/** @type {any} */ o, i) => `
        <li class="flex items-start gap-2 rounded-lg px-2 py-1 text-sm ${o.is_correct ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'text-slate-700'}">
          <span class="font-bold text-[#042F8D]">${esc(o.answer_key || letters[i] || (i + 1))}.</span>
          <span>${esc(o.answer_text)}</span>
          ${o.is_correct ? `<span class="ml-auto shrink-0 text-[11px] font-semibold text-emerald-600">${t('examCorrect', 'Correct')}</span>` : ''}
        </li>`).join('')}</ul>`;
    }
    if (type === 'MATCH_ITEMS') {
      return `<ul class="mt-2 space-y-1.5">${(q.answers || []).map((/** @type {any} */ o) => `
        <li class="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-700">
          <span class="rounded bg-slate-100 px-2 py-0.5 font-medium">${esc(o.match_key)}</span>
          <span class="text-slate-400">→</span>
          <span class="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">${esc(o.match_value)}</span>
        </li>`).join('')}</ul>`;
    }
    if (type === 'CHRONOLOGICAL_ORDERING') {
      return `<ol class="mt-2 list-decimal space-y-1 pl-6 text-sm text-slate-700">${(q.answers || []).map((/** @type {any} */ o) => `<li>${esc(o.answer_text)}</li>`).join('')}</ol>`;
    }
    // DEFINITION / ANALYTICAL
    return `<p class="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-700">${t('examManualGrade', 'Free-text answer — graded manually by an administrator.')}</p>`;
  };

  const renderConfig = () => {
    const items = examConfig.questions;
    if (configCount) configCount.textContent = String(items.length);
    if (!items.length) {
      dropzone.innerHTML = `<p id="examEmpty" class="flex h-full min-h-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-400">${t('examDropHint', 'Drag and drop questions here to configure the exam.')}</p>`;
      return;
    }
    const totalPts = items.reduce((s, q) => s + (Number(q.points) || 0), 0);
    dropzone.innerHTML = `<div class="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500"><span>${items.length} ${t('examQuestions', 'questions')}</span><span>${t('examTotal', 'Total')}: ${totalPts} ${t('examPts', 'pts')}</span></div>`;

    items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.dataset.qid = String(item.question_id);
      card.draggable = true;
      card.className = 'exam-cfg-card rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition';
      const thumb = item.image_url
        ? `<img src="${esc(item.image_url)}" alt="" class="mt-2 max-h-32 w-auto rounded-md border border-slate-100 object-contain" />` : '';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center gap-2">
              <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">${idx + 1}</span>
              ${typeBadge(item.question_type)}
              <label class="ml-auto flex items-center gap-1 text-[11px] font-semibold text-slate-500">${t('examGrade', 'Points')}
                <input type="number" min="0" step="0.5" value="${Number(item.points) || 0}" class="exam-pts w-16 rounded-md border border-slate-200 px-1.5 py-0.5 text-right text-xs text-slate-800 focus:border-[#042F8D] focus:outline-none" />
              </label>
            </div>
            <p class="text-sm font-semibold text-slate-800">${esc(item.question_text)}</p>
            ${thumb}
            ${renderAnswers(item)}
          </div>
          <div class="flex shrink-0 flex-col items-center gap-2">
            <span class="cursor-grab text-slate-300" title="${t('examReorder', 'Drag to reorder')}">⋮⋮</span>
            <button type="button" class="exam-edit rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-[#042F8D] hover:text-[#042F8D]">${t('examEdit', 'Edit')}</button>
            <button type="button" class="exam-remove rounded-full border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:border-red-500 hover:bg-red-50">${t('examRemove', 'Remove')}</button>
          </div>
        </div>`;
      const ptsInput = /** @type {HTMLInputElement} */ (card.querySelector('.exam-pts'));
      ptsInput?.addEventListener('change', () => { item.points = Number(ptsInput.value) || 0; renderConfig(); });
      card.querySelector('.exam-remove')?.addEventListener('click', () => removeQuestion(item.question_id));
      card.querySelector('.exam-edit')?.addEventListener('click', () => openEditor(item, { persist: true }));
      wireReorder(card);
      dropzone.appendChild(card);
    });
  };

  // ── Question editor (create / edit + persist) ──────────────────
  const blankQuestion = () => ({
    question_id: null,
    question_text: '',
    question_type: 'MULTIPLE_CHOICE',
    points: 1,
    is_required: true,
    image_url: '',
    answers: [
      { answer_key: 'A', answer_text: '', is_correct: true },
      { answer_key: 'B', answer_text: '', is_correct: false },
      { answer_key: 'C', answer_text: '', is_correct: false },
      { answer_key: 'D', answer_text: '', is_correct: false },
    ],
  });

  // Sensible default answers when switching a question to a given type.
  const defaultAnswersFor = (/** @type {string} */ type) => {
    if (type === 'TRUE_FALSE') {
      return [
        { answer_key: 'T', answer_text: t('examTrue', 'True'), is_correct: true },
        { answer_key: 'F', answer_text: t('examFalse', 'False'), is_correct: false },
      ];
    }
    if (type === 'MULTIPLE_CHOICE') {
      return [
        { answer_key: 'A', answer_text: '', is_correct: true },
        { answer_key: 'B', answer_text: '', is_correct: false },
        { answer_key: 'C', answer_text: '', is_correct: false },
        { answer_key: 'D', answer_text: '', is_correct: false },
      ];
    }
    if (type === 'MATCH_ITEMS') {
      return [{ match_key: '', match_value: '' }, { match_key: '', match_value: '' }];
    }
    if (type === 'CHRONOLOGICAL_ORDERING') {
      return [{ answer_text: '' }, { answer_text: '' }, { answer_text: '' }];
    }
    return [];
  };

  /**
   * @param {any} source  question record (blank for create)
   * @param {{ persist?: boolean }} [opts]
   */
  const openEditor = (source, opts) => {
    const persist = !(opts && opts.persist === false); // persist by default
    const draft = cloneQ(source && source.question_id != null ? source : blankQuestion());
    // @ts-ignore
    if (source && source.question_id == null) { draft.question_id = null; draft.question_type = source.question_type || 'MULTIPLE_CHOICE'; }
    const isNew = draft.question_id == null;
    let workingType = draft.question_type;
    let imageUrl = draft.image_url || '';
    // Working answers array (mutated as the admin edits).
    // @ts-ignore
    let answers = (draft.answers && draft.answers.length) ? draft.answers.map((a) => ({ ...a })) : defaultAnswersFor(workingType);

    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4';
    wrap.innerHTML = `
      <div class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 class="text-sm font-bold text-[#042F8D]">${isNew ? t('examNewQuestionTitle', 'New question') : t('examEditQuestion', 'Edit question')}</h3>
          <button id="ed-x" class="rounded-full px-2 text-lg leading-none text-slate-400 hover:text-slate-700">×</button>
        </div>
        <div class="flex-1 overflow-auto px-5 py-4">
          <label class="mb-1 block text-xs font-semibold text-slate-500">${t('examType', 'Question type')}</label>
          <select id="ed-type" class="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            ${TYPES.map((x) => `<option value="${x.v}" ${x.v === workingType ? 'selected' : ''}>${esc(t('type_' + x.v, x.label))}</option>`).join('')}
          </select>

          <label class="mb-1 block text-xs font-semibold text-slate-500">${t('examQuestionText', 'Question text')}</label>
          <textarea id="ed-qtext" rows="3" class="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="${t('examQuestionPlaceholder', 'Enter the question…')}">${esc(draft.question_text)}</textarea>

          <div class="mb-3">
            <label class="mb-1 block text-xs font-semibold text-slate-500">${t('examGrade', 'Points')}</label>
            <input id="ed-points" type="number" min="0" step="0.5" value="${Number(draft.points) || 0}" class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
          </div>

          <label class="mb-1 block text-xs font-semibold text-slate-500">${t('examImage', 'Image (optional)')}</label>
          <div class="mb-3">
            <div id="ed-image-box" class="${imageUrl ? '' : 'hidden'} mb-2">
              <img id="ed-image-preview" src="${esc(imageUrl)}" alt="" class="max-h-40 w-auto rounded-lg border border-slate-200 object-contain" />
              <button type="button" id="ed-image-remove" class="mt-1 text-xs font-semibold text-red-600 hover:underline">${t('examRemoveImage', 'Remove image')}</button>
            </div>
            <input id="ed-image" type="file" accept="image/*" class="block w-full text-xs text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-[#042F8D] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
          </div>

          <div class="mb-1 flex items-center justify-between">
            <label class="text-xs font-semibold text-slate-500">${t('examAnswers', 'Answers')}</label>
            <button type="button" id="ed-add" class="hidden rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-[#042F8D] hover:border-[#042F8D]">+ ${t('examAddOption', 'Add option')}</button>
          </div>
          <div id="ed-answers" class="space-y-2"></div>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button id="ed-cancel" class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">${t('examCancel', 'Cancel')}</button>
          <button id="ed-ok" class="rounded-full bg-[#042F8D] px-4 py-2 text-sm font-semibold text-white">${isNew ? t('examCreate', 'Create question') : t('examApply', 'Save question')}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const $ = (/** @type {string} */ sel) => wrap.querySelector(sel);
    const answersEl = /** @type {HTMLElement} */ ($('#ed-answers'));
    const addBtn = /** @type {HTMLButtonElement} */ ($('#ed-add'));
    const errEl = document.createElement('p');
    errEl.className = 'mt-2 hidden text-xs font-semibold text-red-600';
    answersEl.after(errEl);

    // Render the answer editor for the current working type.
    const renderAnswerEditor = () => {
      const type = workingType;
      addBtn.classList.toggle('hidden', !(type === 'MULTIPLE_CHOICE' || type === 'MATCH_ITEMS' || type === 'CHRONOLOGICAL_ORDERING'));
      if (isText(type)) {
        answersEl.innerHTML = `<p class="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-700">${t('examManualGrade', 'Free-text answer — graded manually by an administrator.')}</p>`;
        return;
      }
      answersEl.innerHTML = '';
      // @ts-ignore
      answers.forEach((a, i) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        row.dataset.arow = String(i);
        if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') {
          row.innerHTML = `
            <span class="w-5 shrink-0 text-xs font-bold text-[#042F8D]">${esc(a.answer_key || letters[i] || (i + 1))}</span>
            <input class="ed-atext flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm" value="${esc(a.answer_text)}" placeholder="${t('examOptionPlaceholder', 'Answer option')}" ${type === 'TRUE_FALSE' ? 'readonly' : ''} />
            <label class="flex items-center gap-1 whitespace-nowrap text-xs text-slate-500"><input type="radio" name="ed-correct" class="ed-correct accent-[#042F8D]" ${a.is_correct ? 'checked' : ''}/> ${t('examCorrect', 'Correct')}</label>
            ${type === 'MULTIPLE_CHOICE' ? `<button type="button" class="ed-del text-slate-300 hover:text-red-500" title="${t('examRemoveOption', 'Remove')}">✕</button>` : ''}`;
        } else if (type === 'MATCH_ITEMS') {
          row.innerHTML = `
            <input class="ed-mkey flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm" value="${esc(a.match_key)}" placeholder="${t('examMatchLeft', 'Item')}" />
            <span class="text-slate-400">→</span>
            <input class="ed-mval flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm" value="${esc(a.match_value)}" placeholder="${t('examMatchRight', 'Match')}" />
            <button type="button" class="ed-del text-slate-300 hover:text-red-500" title="${t('examRemoveOption', 'Remove')}">✕</button>`;
        } else { // CHRONOLOGICAL_ORDERING
          row.innerHTML = `
            <span class="w-5 shrink-0 text-xs font-bold text-[#042F8D]">${i + 1}</span>
            <input class="ed-atext flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm" value="${esc(a.answer_text)}" placeholder="${t('examStepPlaceholder', 'Step / item')}" />
            <button type="button" class="ed-del text-slate-300 hover:text-red-500" title="${t('examRemoveOption', 'Remove')}">✕</button>`;
        }
        answersEl.appendChild(row);
      });
      // Wire correctness + text sync + delete for each row.
      Array.from(answersEl.querySelectorAll('[data-arow]')).forEach((row, i) => {
        const at = /** @type {HTMLInputElement} */ (row.querySelector('.ed-atext'));
        at?.addEventListener('input', () => { answers[i].answer_text = at.value; });
        const cr = /** @type {HTMLInputElement} */ (row.querySelector('.ed-correct'));
        // @ts-ignore
        cr?.addEventListener('change', () => { answers.forEach((a, j) => { a.is_correct = (j === i); }); });
        const mk = /** @type {HTMLInputElement} */ (row.querySelector('.ed-mkey'));
        mk?.addEventListener('input', () => { answers[i].match_key = mk.value; });
        const mv = /** @type {HTMLInputElement} */ (row.querySelector('.ed-mval'));
        mv?.addEventListener('input', () => { answers[i].match_value = mv.value; });
        row.querySelector('.ed-del')?.addEventListener('click', () => { answers.splice(i, 1); renderAnswerEditor(); });
      });
    };

    renderAnswerEditor();

    addBtn.addEventListener('click', () => {
      if (workingType === 'MULTIPLE_CHOICE') answers.push({ answer_key: letters[answers.length] || '', answer_text: '', is_correct: false });
      else if (workingType === 'MATCH_ITEMS') answers.push({ match_key: '', match_value: '' });
      else if (workingType === 'CHRONOLOGICAL_ORDERING') answers.push({ answer_text: '' });
      renderAnswerEditor();
    });

    /** @type {HTMLSelectElement} */ ($('#ed-type')).addEventListener('change', (e) => {
      workingType = /** @type {HTMLSelectElement} */ (e.target).value;
      answers = defaultAnswersFor(workingType);
      renderAnswerEditor();
    });

    // Image upload → base64 data URL.
    /** @type {HTMLInputElement} */ ($('#ed-image')).addEventListener('change', (e) => {
      const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showErr(t('examImageTooBig', 'Image must be under 2 MB.')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        imageUrl = String(reader.result || '');
        const box = /** @type {HTMLElement} */ ($('#ed-image-box'));
        /** @type {HTMLImageElement} */ ($('#ed-image-preview')).src = imageUrl;
        box.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    });
    $('#ed-image-remove')?.addEventListener('click', () => {
      imageUrl = '';
      /** @type {HTMLElement} */ ($('#ed-image-box')).classList.add('hidden');
      /** @type {HTMLInputElement} */ ($('#ed-image')).value = '';
    });

    const showErr = (/** @type {string} */ m) => { errEl.textContent = m; errEl.classList.remove('hidden'); };
    const done = () => wrap.remove();
    $('#ed-x')?.addEventListener('click', done);
    $('#ed-cancel')?.addEventListener('click', done);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(); });

    /** @type {HTMLButtonElement} */ ($('#ed-ok')).addEventListener('click', async () => {
      errEl.classList.add('hidden');
      const text = /** @type {HTMLTextAreaElement} */ ($('#ed-qtext')).value.trim();
      const points = Number(/** @type {HTMLInputElement} */ ($('#ed-points')).value) || 0;
      if (!text) { showErr(t('examErrText', 'Please enter the question text.')); return; }

      // Normalise answers per type.
      let outAnswers = [];
      if (workingType === 'MULTIPLE_CHOICE' || workingType === 'TRUE_FALSE') {
        outAnswers = answers
          // @ts-ignore
          .map((a, i) => ({ answer_key: a.answer_key || letters[i] || String(i + 1), answer_text: (a.answer_text || '').trim(), is_correct: !!a.is_correct }))
          // @ts-ignore
          .filter((a) => a.answer_text !== '');
        if (outAnswers.length < 2) { showErr(t('examErrOptions', 'Provide at least two answer options.')); return; }
        // @ts-ignore
        if (!outAnswers.some((a) => a.is_correct)) { showErr(t('examErrCorrect', 'Select the correct answer.')); return; }
      } else if (workingType === 'MATCH_ITEMS') {
        outAnswers = answers
          // @ts-ignore
          .map((a) => ({ match_key: (a.match_key || '').trim(), match_value: (a.match_value || '').trim() }))
          // @ts-ignore
          .filter((a) => a.match_key !== '' && a.match_value !== '');
        if (outAnswers.length < 2) { showErr(t('examErrMatch', 'Provide at least two complete match pairs.')); return; }
      } else if (workingType === 'CHRONOLOGICAL_ORDERING') {
        outAnswers = answers
          // @ts-ignore
          .map((a, i) => ({ answer_text: (a.answer_text || '').trim(), display_order: i + 1 }))
          // @ts-ignore
          .filter((a) => a.answer_text !== '');
        if (outAnswers.length < 2) { showErr(t('examErrOrder', 'Provide at least two items to order.')); return; }
      }

      const payload = {
        question_id: draft.question_id || undefined,
        training_id: examConfig.training_id,
        question_text: text,
        question_type: workingType,
        points,
        is_required: true,
        image_url: imageUrl,
        answers: outAnswers,
      };

      if (!persist) { done(); return; }
      const okBtn = /** @type {HTMLButtonElement} */ ($('#ed-ok'));
      okBtn.disabled = true; okBtn.textContent = t('examSaving', 'Saving…');
      try {
        const data = await saveQuestion(payload);
        const savedId = Number(data.question_id);
        const savedRecord = {
          question_id: savedId,
          exam_id: (libraryById.get(savedId) || {}).exam_id,
          question_text: text,
          question_type: workingType,
          points,
          is_required: true,
          image_url: imageUrl,
          in_exam: libraryById.has(savedId) ? libraryById.get(savedId).in_exam : false,
          display_order: libraryById.has(savedId) ? libraryById.get(savedId).display_order : 9999,
          // @ts-ignore
          answers: outAnswers.map((a, i) => ({ ...a, display_order: a.display_order || i + 1 })),
        };
        libraryById.set(savedId, savedRecord);
        // Reflect edits into any config item already using this question.
        const cfg = examConfig.questions.find((x) => x.question_id === savedId);
        if (cfg) Object.assign(cfg, cloneQ(savedRecord), { points });
        done();
        renderLibrary();
        renderConfig();
        setStatus(isNew ? t('examCreated', 'Question created ✓') : t('examUpdated', 'Question updated ✓'), true);
      } catch (_) {
        okBtn.disabled = false; okBtn.textContent = isNew ? t('examCreate', 'Create question') : t('examApply', 'Save question');
        showErr(t('examErrSaveQ', 'Could not save the question.'));
      }
    });
  };

  // ── Reordering within the config ───────────────────────────────
  /** @type {number|null} */
  let dragQid = null;
  const wireReorder = (/** @type {HTMLElement} */ card) => {
    card.addEventListener('dragstart', (e) => {
      dragQid = Number(card.dataset.qid);
      card.classList.add('opacity-50', 'ring-2', 'ring-[#042F8D]');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
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
    const from = examConfig.questions.findIndex((x) => x.question_id === qid);
    const to = examConfig.questions.findIndex((x) => x.question_id === beforeQid);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = examConfig.questions.splice(from, 1);
    examConfig.questions.splice(to, 0, moved);
    renderConfig();
  };

  // ── Dropzone (accept from library) ─────────────────────────────
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
    if (e.dataTransfer?.getData('application/x-exam-reorder')) return;
    const qid = Number.parseInt(e.dataTransfer?.getData('text/plain') || '', 10);
    if (Number.isFinite(qid)) addQuestion(qid);
  });

  // ── Save the whole template ────────────────────────────────────
  const setStatus = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('text-red-600', !ok);
    statusEl.classList.toggle('text-emerald-600', ok);
  };

  const save = async (/** @type {boolean} */ quiet) => {
    if (!examConfig.training_id) { setStatus(t('examSelectFirst', 'Please select a training course first.'), false); return; }

    // Non-destructive: persist which questions are in the exam, their order and
    // points, the instructions and the publishing settings (date/duration/pass).
    const payload = {
      training_id: examConfig.training_id,
      instructions: instructionsEl ? instructionsEl.value : (examConfig.instructions || ''),
      exam_date: examDateEl && examDateEl.value ? examDateEl.value : undefined,
      duration_minutes: examDurationEl && examDurationEl.value ? Number(examDurationEl.value) : undefined,
      passing_score: examPassingEl && examPassingEl.value ? Number(examPassingEl.value) : undefined,
      created_by: currentUserId(),
      questions: examConfig.questions.map((q, i) => ({
        question_id: q.question_id,
        display_order: i + 1,
        points: q.points,
      })),
    };
    try {
      const resp = await fetch(`${API_BASE}/api/exam/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || !data.ok) throw new Error('save failed');
      examConfig.examId = data.exam_id;
      examConfig.instructions = payload.instructions;
      if (!quiet) setStatus(t('examSaved', 'Exam configuration saved ✓'), true);
    } catch (_) {
      if (!quiet) setStatus(t('examErrSave', 'Could not save the exam configuration.'), false);
    }
  };

  // ── Preview as candidate (uses the current, possibly unsaved, config) ──
  const previewAsCandidate = () => {
    if (!examConfig.training_id) { setStatus(t('examSelectFirst', 'Please select a training course first.'), false); return; }
    if (!examConfig.questions.length) { setStatus(t('examErrEmpty', 'Add at least one question before previewing.'), false); return; }
    const api = /** @type {any} */ (window).GSSExamPreview;
    if (!api || typeof api.openPayload !== 'function') {
      setStatus(t('examPreviewUnavailable', 'Preview is unavailable.'), false);
      return;
    }
    const title = trainingSelect.options[trainingSelect.selectedIndex]?.textContent || '';
    api.openPayload({
      ok: true,
      exam: {
        exam_id: examConfig.examId,
        training_id: examConfig.training_id,
        training_title: title,
        instructor: trainerById.get(Number(examConfig.training_id)) || '',
        instructions: instructionsEl ? instructionsEl.value : (examConfig.instructions || ''),
        exam_title: '',
      },
      questions: examConfig.questions.map((q, i) => ({
        question_id: q.question_id,
        question_text: q.question_text,
        question_type: q.question_type,
        display_order: i + 1,
        points: q.points,
        is_required: q.is_required,
        image_url: q.image_url,
        answers: q.answers || [],
      })),
    });
  };

  // ── Publishing: status badge, publish gating, publish action ───
  const renderExamStatus = () => {
    if (!examStatusBadge) return;
    const s = (examConfig.status || 'DRAFT').toUpperCase();
    const published = s === 'PUBLISHED';
    examStatusBadge.textContent = published ? t('examStatusPublished', 'PUBLISHED') : t('examStatusDraft', 'DRAFT');
    examStatusBadge.className = 'inline-flex items-center justify-center rounded-full px-2 py-1.5 text-xs font-semibold ' +
      (published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600');
  };

  const validExamDate = () => {
    const v = examDateEl ? examDateEl.value : '';
    if (!v) return false;
    const d = new Date(v + 'T00:00:00');
    return !Number.isNaN(d.getTime());
  };

  // The Publish button stays disabled until a valid Exam Date is entered.
  const updatePublishState = () => {
    if (!publishBtn) return;
    const ok = !!examConfig.training_id && validExamDate();
    publishBtn.disabled = !ok;
    const published = (examConfig.status || '').toUpperCase() === 'PUBLISHED';
    publishBtn.textContent = published ? t('examRepublish', 'Update & re-publish') : t('examPublish', 'Publish exam');
  };

  const publish = async () => {
    if (!examConfig.training_id) { setStatus(t('examSelectFirst', 'Please select a training course first.'), false); return; }
    if (!validExamDate()) { setStatus(t('examNeedDate', 'Enter a valid exam date before publishing.'), false); return; }
    if (!examConfig.questions.length) { setStatus(t('examErrEmpty', 'Add at least one question before publishing.'), false); return; }
    // Persist the current configuration first so the published exam matches.
    await save(true);
    setStatus(t('examPublishing', 'Publishing and generating exam accounts…'), undefined);
    if (publishBtn) publishBtn.disabled = true;
    try {
      const payload = {
        training_id: examConfig.training_id,
        exam_id: examConfig.examId || undefined,
        exam_date: examDateEl ? examDateEl.value : '',
        duration_minutes: examDurationEl && examDurationEl.value ? Number(examDurationEl.value) : undefined,
        passing_score: examPassingEl && examPassingEl.value ? Number(examPassingEl.value) : undefined,
        published_by: currentUserId(),
      };
      const data = await fetch(`${API_BASE}/api/exam/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!data || !data.ok) throw new Error((data && data.error) || 'publish failed');
      examConfig.status = 'PUBLISHED';
      examConfig.examId = data.exam_id || examConfig.examId;
      renderExamStatus();
      updatePublishState();
      setStatus(t('examPublished', 'Exam published ✓ Temporary accounts generated: ') + (data.total || 0), true);
      showPublishResult(data);
    } catch (err) {
      setStatus(t('examPublishErr', 'Could not publish the exam.'), false);
      updatePublishState();
    }
  };

  // One-time modal listing the freshly generated credentials (plaintext shown
  // once here so the admin can copy them; passwords are hashed at rest).
  const showPublishResult = (/** @type {any} */ data) => {
    const rows = Array.isArray(data.created) ? data.created : [];
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-4';
    const list = rows.length
      ? rows.map((r) => `<tr class="border-b border-slate-100">
          <td class="px-3 py-1.5 font-medium text-slate-700">${esc(r.candidate_no)}</td>
          <td class="px-3 py-1.5 text-slate-700">${esc(r.candidate_name || '')}</td>
          <td class="px-3 py-1.5 font-mono text-[#042F8D]">${esc(r.username)}</td>
          <td class="px-3 py-1.5 font-mono font-bold text-slate-800">${esc(r.password)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" class="px-3 py-4 text-center text-slate-400">${t('examNoNewAccounts', 'No new accounts were generated (all assigned candidates already have credentials).')}</td></tr>`;
    wrap.innerHTML = `
      <div class="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-center justify-between bg-emerald-600 px-5 py-3 text-white">
          <h3 class="text-sm font-bold">${t('examPublishedTitle', 'Exam published — temporary accounts')}</h3>
          <button type="button" class="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30" data-close>${t('closeBtn', 'Close')}</button>
        </div>
        <div class="max-h-[60vh] overflow-auto p-4">
          <p class="mb-3 text-xs text-amber-700">${t('examPwOnce', 'These passwords are shown once. Copy them now or use “Send credential” later.')}</p>
          <table class="w-full text-left text-sm">
            <thead><tr class="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th class="px-3 py-1.5">${t('credCandidateNo', 'No.')}</th><th class="px-3 py-1.5">${t('credCandidate', 'Candidate')}</th>
              <th class="px-3 py-1.5">${t('credUsername', 'Username')}</th><th class="px-3 py-1.5">${t('credPassword', 'Password')}</th>
            </tr></thead><tbody>${list}</tbody>
          </table>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" data-copy class="rounded-full border border-[#042F8D]/30 px-4 py-2 text-sm font-semibold text-[#042F8D] hover:bg-[#042F8D]/5">${t('examCopyAll', 'Copy all')}</button>
          <button type="button" data-manage class="rounded-full bg-[#042F8D] px-4 py-2 text-sm font-semibold text-white">${t('examManageCreds', 'Manage credentials')}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const remove = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap) remove(); });
    wrap.querySelector('[data-close]')?.addEventListener('click', remove);
    wrap.querySelector('[data-copy]')?.addEventListener('click', () => {
      const text = rows.map((r) => `${r.candidate_no}\t${r.candidate_name || ''}\t${r.username}\t${r.password}`).join('\n');
      navigator.clipboard?.writeText(text);
    });
    wrap.querySelector('[data-manage]')?.addEventListener('click', () => {
      remove();
      openCredentials();
    });
  };

  const openCredentials = () => {
    const api = /** @type {any} */ (window).GSSExamCreds;
    if (api && typeof api.open === 'function') api.open({ training_id: examConfig.training_id, exam_id: examConfig.examId });
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
  trainingSelect.addEventListener('change', () => { setStatus('', true); renderInstructor(); loadQuestions(); });
  saveBtn?.addEventListener('click', () => save(false));
  newQuestionBtn?.addEventListener('click', () => {
    if (!examConfig.training_id) { setStatus(t('examSelectFirst', 'Please select a training course first.'), false); return; }
    openEditor(blankQuestion(), { persist: true });
  });
  previewBtn?.addEventListener('click', previewAsCandidate);
  publishBtn?.addEventListener('click', publish);
  credentialsBtn?.addEventListener('click', openCredentials);
  examDateEl?.addEventListener('input', updatePublishState);
  examDateEl?.addEventListener('change', updatePublishState);
  instructionsEl?.addEventListener('input', () => { examConfig.instructions = instructionsEl.value; });

  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      if (overlay.classList.contains('hidden')) return;
      renderLibrary();
      renderConfig();
    })
  );
})();
