// @ts-check
/// <reference path="../utils/translation.js" />
/**
 * GSS · Exam correction / grading (Admin / Instructor / Head of Training)
 * ------------------------------------------------------------------
 * Opens a submitted attempt, shows every question with the candidate's answer
 * and the correct answer, auto-grades what can be graded and lets the grader
 * assign points + comments to free-text questions. Finishing correction marks
 * the attempt CORRECTED, which is what makes the candidate's Panel-Exam result
 * available (the backend enforces this — the client cannot fake it).
 */
(() => {
  'use strict';

  const overlay = document.getElementById('examCorrectOverlay');
  const closeBtn = document.getElementById('examCorrectClose');
  const bodyEl = document.getElementById('examCorrectBody');
  const subtitle = document.getElementById('examCorrectSubtitle');
  const statusEl = document.getElementById('examCorrectStatus');
  const totalEl = document.getElementById('examCorrectTotal');
  const saveDraftBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('examCorrectSaveDraft'));
  const finalizeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('examCorrectFinalize'));
  if (!overlay || !bodyEl) return;

  const t = (/** @type {string} */ k, /** @type {string} */ f) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const d = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (d && d[lang] && d[lang][k]) return d[lang][k];
    } catch (_) { /* noop */ }
    return f;
  };
  const esc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  const currentUserId = () => {
    try { const s = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null; return s ? (s.user_id || s.login_id || null) : null; } catch (_) { return null; }
  };
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const api = (/** @type {string} */ m, /** @type {string} */ u, /** @type {any} */ b) =>
    fetch(`${API_BASE}${u}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

  const setStatus = (/** @type {string} */ msg, ok) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('text-red-600', ok === false);
    statusEl.classList.toggle('text-emerald-600', ok === true);
    statusEl.classList.toggle('text-slate-500', ok === undefined);
  };

  /** @type {any} */ let attempt = null;
  /** @type {any[]} */ let questions = [];
  /** @type {number|null} */ let attemptId = null;
  /** @type {(() => void)|null} */ let onDone = null;

  // Render the candidate's answer for a question (read-only), by type.
  const candidateAnswerHtml = (/** @type {any} */ q) => {
    const type = q.question_type;
    if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') {
      const sel = Array.isArray(q.selected_ids) ? q.selected_ids.map(Number) : [];
      return `<div class="space-y-1">${(q.answers || []).map((/** @type {any} */ a, i) => {
        const picked = sel.includes(Number(a.answer_id));
        const correct = !!a.is_correct;
        const cls = correct ? 'border-emerald-300 bg-emerald-50' : (picked ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white');
        const mark = correct ? '✓' : (picked ? '✗' : '');
        return `<div class="flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${cls}">
          <span class="font-bold text-slate-500">${esc(a.answer_key || letters[i] || (i + 1))}.</span>
          <span class="flex-1">${esc(a.answer_text)}</span>
          ${picked ? `<span class="text-[11px] font-semibold text-slate-500">${t('correctChosen', 'candidate')}</span>` : ''}
          <span class="w-4 text-center font-bold ${correct ? 'text-emerald-600' : 'text-red-600'}">${mark}</span>
        </div>`;
      }).join('')}</div>`;
    }
    if (type === 'MATCH_ITEMS') {
      const resp = q.response_json || {};
      return `<div class="space-y-1 text-sm">${(q.answers || []).map((/** @type {any} */ a) => {
        const given = resp[a.match_key];
        const ok = String(given || '') === String(a.match_value || '');
        return `<div class="flex items-center gap-2">
          <span class="min-w-[35%] rounded bg-slate-100 px-2 py-0.5 font-medium">${esc(a.match_key)}</span>
          <span class="text-slate-400">→</span>
          <span class="rounded px-2 py-0.5 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}">${esc(given || '—')}</span>
          ${!ok ? `<span class="text-xs text-slate-400">(${t('correctExpected', 'expected')}: ${esc(a.match_value)})</span>` : ''}
        </div>`;
      }).join('')}</div>`;
    }
    if (type === 'CHRONOLOGICAL_ORDERING') {
      const order = Array.isArray(q.response_json) ? q.response_json.map(Number) : [];
      const byId = new Map((q.answers || []).map((/** @type {any} */ a) => [Number(a.answer_id), a]));
      const given = order.map((id, i) => `<li class="text-sm">${i + 1}. ${esc((byId.get(id) || {}).answer_text || id)}</li>`).join('');
      const correct = (q.answers || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => (a.display_order || 0) - (b.display_order || 0))
        .map((/** @type {any} */ a, i) => `<li class="text-xs text-slate-400">${i + 1}. ${esc(a.answer_text)}</li>`).join('');
      return `<div class="grid grid-cols-2 gap-3">
        <div><p class="text-[11px] font-semibold uppercase text-slate-400">${t('correctCandidateOrder', 'Candidate order')}</p><ol>${given || '<li class="text-sm text-slate-400">—</li>'}</ol></div>
        <div><p class="text-[11px] font-semibold uppercase text-slate-400">${t('correctCorrectOrder', 'Correct order')}</p><ol>${correct}</ol></div></div>`;
    }
    // DEFINITION / ANALYTICAL
    return `<div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 whitespace-pre-line">${q.response_text ? esc(q.response_text) : `<span class="text-slate-400">${t('correctNoAnswer', 'No answer provided.')}</span>`}</div>`;
  };

  const renderQuestion = (/** @type {any} */ q, /** @type {number} */ idx) => {
    const manual = !q.auto_graded;
    const awarded = q.awarded_score != null ? q.awarded_score : (manual ? '' : 0);
    const scoreControl = manual
      ? `<div class="flex items-center gap-2">
           <label class="text-[11px] font-semibold uppercase text-slate-400">${t('correctPoints', 'Points')}</label>
           <input type="number" min="0" max="${q.max_points}" step="0.5" value="${awarded === '' ? '' : awarded}" data-score class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm text-center focus:border-[#042F8D] focus:outline-none" />
           <span class="text-sm font-semibold text-slate-400">/ ${q.max_points}</span>
         </div>`
      : `<span class="rounded-full ${q.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} px-2.5 py-1 text-xs font-bold">${awarded} / ${q.max_points} · ${q.is_correct ? t('correctAuto', 'auto') : t('correctWrong', 'auto')}</span>`;
    const commentBox = manual
      ? `<textarea rows="2" data-comment placeholder="${t('correctCommentPlaceholder', 'Optional comment / observation for the candidate…')}" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#042F8D] focus:outline-none">${q.instructor_comment ? esc(q.instructor_comment) : ''}</textarea>`
      : '';
    return `<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-qid="${q.question_id}" data-manual="${manual ? '1' : '0'}" data-max="${q.max_points}">
      <div class="mb-2 flex items-start justify-between gap-3">
        <p class="text-sm font-semibold text-slate-800"><span class="mr-1 text-slate-400">${idx + 1}.</span>${esc(q.question_text)}</p>
        ${scoreControl}
      </div>
      ${manual ? `<p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">${t('correctCandidateAnswer', 'Candidate answer')}</p>` : ''}
      ${candidateAnswerHtml(q)}
      ${commentBox}
    </div>`;
  };

  const collectGrades = () => Array.from(bodyEl.querySelectorAll('[data-qid][data-manual="1"]')).map((card) => {
    const el = /** @type {HTMLElement} */ (card);
    const scoreEl = /** @type {HTMLInputElement|null} */ (el.querySelector('[data-score]'));
    const commentEl = /** @type {HTMLTextAreaElement|null} */ (el.querySelector('[data-comment]'));
    const max = Number(el.dataset.max) || 0;
    let pts = scoreEl && scoreEl.value !== '' ? Number(scoreEl.value) : 0;
    if (!Number.isFinite(pts) || pts < 0) pts = 0;
    if (pts > max) pts = max;
    return { question_id: Number(el.dataset.qid), points_awarded: pts, comment: commentEl ? commentEl.value : '' };
  });

  const updateTotal = () => {
    if (!totalEl) return;
    let total = 0; let max = 0;
    (questions || []).forEach((q) => { max += Number(q.max_points) || 0; });
    // auto part
    (questions || []).forEach((q) => { if (q.auto_graded) total += Number(q.awarded_score) || 0; });
    // manual live values
    bodyEl.querySelectorAll('[data-manual="1"]').forEach((card) => {
      const s = /** @type {HTMLInputElement|null} */ (card.querySelector('[data-score]'));
      const v = s && s.value !== '' ? Number(s.value) : 0;
      total += Number.isFinite(v) ? v : 0;
    });
    totalEl.textContent = `${t('correctTotal', 'Total')}: ${total} / ${max}`;
  };

  const render = () => {
    const a = attempt || {};
    if (subtitle) subtitle.textContent = [a.candidate_name, a.exam_title, a.training_title].filter(Boolean).join(' · ');
    const meta = `<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div><span class="text-slate-400">${t('correctCandidate', 'Candidate')}:</span> <span class="font-semibold text-slate-700">${esc(a.candidate_name || '')} (${esc(a.candidate_no || '')})</span></div>
        <div><span class="text-slate-400">${t('correctExam', 'Exam')}:</span> <span class="font-semibold text-slate-700">${esc(a.exam_title || '')}</span></div>
        <div><span class="text-slate-400">${t('correctInstructor', 'Instructor')}:</span> <span class="font-semibold text-slate-700">${esc(a.instructor || '')}</span></div>
        <div><span class="text-slate-400">${t('correctSubmitted', 'Submitted')}:</span> <span class="text-slate-600">${a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</span></div>
        <div><span class="text-slate-400">${t('correctPassMark', 'Pass mark')}:</span> <span class="text-slate-600">${a.passing_score != null ? a.passing_score : '—'}</span></div>
        <div><span class="text-slate-400">${t('correctStatus', 'Status')}:</span> <span class="font-semibold text-[#042F8D]">${esc(a.correction_status || '')}</span></div>
      </div></div>`;
    bodyEl.innerHTML = meta + questions.map((q, i) => renderQuestion(q, i)).join('');
    bodyEl.querySelectorAll('[data-score]').forEach((el) => el.addEventListener('input', updateTotal));
    updateTotal();
    const corrected = a.correction_status === 'CORRECTED';
    if (finalizeBtn) finalizeBtn.textContent = corrected ? t('correctReFinalize', 'Update result') : t('correctFinalize', 'Finish correction');
  };

  const save = async (/** @type {boolean} */ finalize) => {
    if (!attemptId) return;
    if (finalize && !window.confirm(t('correctConfirmFinalize', 'Finish correction and publish the result to the candidate? This makes the Panel-Exam result available.'))) return;
    setStatus(finalize ? t('correctFinalizing', 'Finalizing…') : t('correctSaving', 'Saving…'));
    if (saveDraftBtn) saveDraftBtn.disabled = true;
    if (finalizeBtn) finalizeBtn.disabled = true;
    try {
      const r = await api('POST', '/api/exam/grade', {
        attempt_id: attemptId, updated_by: currentUserId(), finalize, grades: collectGrades(),
      });
      if (!r || !r.ok) throw new Error('grade failed');
      setStatus(finalize
        ? t('correctDone', 'Correction complete ✓ Result is now available to the candidate.')
        : t('correctSaved', 'Progress saved ✓'), true);
      if (typeof onDone === 'function') onDone();
      if (finalize) { setTimeout(close, 900); }
      else { await load(attemptId, onDone); }
    } catch (_) {
      setStatus(t('correctErr', 'Could not save the correction.'), false);
    } finally {
      if (saveDraftBtn) saveDraftBtn.disabled = false;
      if (finalizeBtn) finalizeBtn.disabled = false;
    }
  };

  const load = async (/** @type {number} */ id, /** @type {(() => void)|null} */ done) => {
    attemptId = id; onDone = done || null;
    bodyEl.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">${t('correctLoading', 'Loading submitted exam…')}</p>`;
    try {
      // Mark correction as started (WAITING_FOR_CORRECTION → CORRECTING).
      await api('POST', '/api/exam/grade/start', { attempt_id: id, updated_by: currentUserId() });
      const data = await fetch(`${API_BASE}/api/exam/correction?attempt_id=${id}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (!data || !data.ok) throw new Error('load failed');
      attempt = data.attempt; questions = Array.isArray(data.questions) ? data.questions : [];
      render();
      setStatus('');
    } catch (_) {
      bodyEl.innerHTML = `<p class="rounded-xl border border-dashed border-red-300 bg-red-50 px-4 py-10 text-center text-sm text-red-500">${t('correctLoadErr', 'Could not load the submitted exam.')}</p>`;
    }
  };

  const open = async (/** @type {number} */ id, /** @type {(() => void)|undefined} */ done) => {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.setAttribute('aria-hidden', 'false');
    setStatus('');
    await load(id, done || null);
  };
  const close = () => {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    overlay.setAttribute('aria-hidden', 'true');
  };

  closeBtn?.addEventListener('click', close);
  saveDraftBtn?.addEventListener('click', () => save(false));
  finalizeBtn?.addEventListener('click', () => save(true));

  /** @type {any} */ (window).GSSExamCorrect = { open };
})();
