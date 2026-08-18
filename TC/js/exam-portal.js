// @ts-check
/**
 * GSS · Candidate Exam Portal
 * ------------------------------------------------------------------
 * Standalone page for trainees to sit an exam using ONLY a temporary exam
 * credential (no permanent account). The backend is authoritative for the
 * timer, the attempt, auto-save, expiry and result visibility — this page is
 * a thin, resilient client:
 *   • login  → POST /api/exam/login  (returns token + questions + saved answers)
 *   • change → POST /api/exam/answer (auto-save, one call per question)
 *   • submit → POST /api/exam/submit (final batch + finalize)
 *   • result → POST /api/exam/result / re-login (panel-exam once corrected)
 * The visual countdown is derived from the server clock; the server rejects any
 * write once the attempt has expired, so a tampered client timer cannot help.
 */
(() => {
  'use strict';

  const $ = (/** @type {string} */ id) => document.getElementById(id);
  const esc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const loginCard = $('loginCard');
  const examCard = $('examCard');
  const statePanel = $('statePanel');
  const questionsEl = $('examQuestions');
  const metaEl = $('examMeta');
  const timerEl = $('examTimer');
  const timerText = $('examTimerText');
  const saveStatus = $('examSaveStatus');
  const subtitle = $('portalSubtitle');

  /** @type {string|null} */ let token = null;
  /** @type {any[]} */ let questions = [];
  /** @type {number} */ let clockOffset = 0;      // serverNow - clientNow (ms)
  /** @type {number} */ let expiresAtMs = 0;
  /** @type {any} */ let timerHandle = null;
  let submitting = false;
  let creds = { username: '', password: '' };

  const serverNow = () => Date.now() + clockOffset;

  const setLoginStatus = (/** @type {string} */ msg, ok) => {
    const el = $('loginStatus'); if (!el) return;
    el.textContent = msg;
    el.classList.toggle('text-red-600', ok === false);
    el.classList.toggle('text-emerald-600', ok === true);
  };
  const setSaveStatus = (/** @type {string} */ msg, ok) => {
    if (!saveStatus) return;
    saveStatus.textContent = msg;
    saveStatus.classList.toggle('text-red-600', ok === false);
    saveStatus.classList.toggle('text-emerald-600', ok === true);
    saveStatus.classList.toggle('text-slate-500', ok === undefined);
  };

  const show = (/** @type {HTMLElement|null} */ el) => { if (el) { el.classList.remove('hidden'); el.classList.add('block'); } };
  const hide = (/** @type {HTMLElement|null} */ el) => { if (el) { el.classList.add('hidden'); el.classList.remove('block'); } };

  // ── Render one question by type ─────────────────────────────────
  const renderQuestion = (/** @type {any} */ q, /** @type {number} */ idx, /** @type {any} */ saved) => {
    const type = q.question_type;
    const img = q.image_url ? `<img src="${esc(q.image_url)}" alt="" class="mb-3 max-h-56 w-auto rounded-lg border border-slate-200 object-contain" />` : '';
    const head = `
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">${idx + 1}</span>
        <span class="text-[11px] font-semibold text-slate-400">${Number(q.points) || 0} pts</span>
      </div>
      <p class="mb-3 text-sm font-semibold text-slate-800">${esc(q.question_text)}</p>${img}`;

    const sv = saved && saved[String(q.question_id)] ? saved[String(q.question_id)] : null;
    const selectedIds = sv && Array.isArray(sv.selected_ids) ? sv.selected_ids.map(Number) : [];
    const savedText = sv ? (sv.response_text || '') : '';
    const savedJson = sv ? sv.response_json : null;

    let field = '';
    if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') {
      field = `<div class="space-y-2">${(q.answers || []).map((/** @type {any} */ a, i) => `
        <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-[#042F8D]">
          <input type="radio" name="q${q.question_id}" value="${a.answer_id}" class="accent-[#042F8D]" ${selectedIds.includes(Number(a.answer_id)) ? 'checked' : ''} />
          <span class="font-bold text-[#042F8D]">${esc(a.answer_key || letters[i] || (i + 1))}.</span>
          <span>${esc(a.answer_text)}</span>
        </label>`).join('')}</div>`;
    } else if (type === 'MATCH_ITEMS') {
      const values = (q.answers || []).map((/** @type {any} */ a) => a.match_value);
      field = `<div class="space-y-2">${(q.answers || []).map((/** @type {any} */ a) => {
        const cur = savedJson && savedJson[a.match_key] != null ? savedJson[a.match_key] : '';
        return `<div class="flex items-center gap-2 text-sm">
          <span class="min-w-[40%] rounded bg-slate-100 px-2 py-1 font-medium">${esc(a.match_key)}</span>
          <span class="text-slate-400">→</span>
          <select data-matchkey="${esc(a.match_key)}" class="flex-1 rounded-md border border-slate-200 px-2 py-1">
            <option value="">Select…</option>
            ${values.map((v) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select></div>`;
      }).join('')}</div>`;
    } else if (type === 'CHRONOLOGICAL_ORDERING') {
      const order = Array.isArray(savedJson) ? savedJson.map(Number) : [];
      field = `<div class="space-y-2" data-ordering="1">${(q.answers || []).map((/** @type {any} */ a) => {
        const pos = order.indexOf(Number(a.answer_id));
        return `<div class="flex items-center gap-2 text-sm">
          <input type="number" min="1" max="${(q.answers || []).length}" data-answerid="${a.answer_id}" value="${pos >= 0 ? pos + 1 : ''}" class="w-14 rounded-md border border-slate-200 px-2 py-1 text-center" />
          <span>${esc(a.answer_text)}</span></div>`;
      }).join('')}<p class="text-[11px] text-slate-400">Number the items from 1 (first) to last.</p></div>`;
    } else {
      field = `<textarea data-text="1" rows="4" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Type your answer…">${esc(savedText)}</textarea>`;
    }
    return `<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-qid="${q.question_id}" data-type="${type}">${head}${field}</div>`;
  };

  // ── Collect one question's response object ──────────────────────
  const collectOne = (/** @type {HTMLElement} */ card) => {
    const type = card.dataset.type;
    /** @type {any} */ const r = { question_id: Number(card.dataset.qid) };
    if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') {
      const sel = /** @type {HTMLInputElement|null} */ (card.querySelector('input[type=radio]:checked'));
      r.selected_ids = sel ? [Number(sel.value)] : [];
    } else if (type === 'MATCH_ITEMS') {
      const obj = {};
      card.querySelectorAll('select[data-matchkey]').forEach((s) => {
        const el = /** @type {HTMLSelectElement} */ (s);
        if (el.value) obj[el.dataset.matchkey || ''] = el.value;
      });
      r.response_json = obj;
    } else if (type === 'CHRONOLOGICAL_ORDERING') {
      const items = Array.from(card.querySelectorAll('input[data-answerid]')).map((i) => {
        const el = /** @type {HTMLInputElement} */ (i);
        return { id: Number(el.dataset.answerid), pos: Number.parseInt(el.value, 10) };
      }).filter((x) => Number.isFinite(x.pos)).sort((a, b) => a.pos - b.pos);
      r.response_json = items.map((x) => x.id);
    } else {
      const ta = /** @type {HTMLTextAreaElement|null} */ (card.querySelector('textarea[data-text]'));
      r.response_text = ta ? ta.value : '';
    }
    return r;
  };
  const collectAll = () => Array.from(questionsEl.querySelectorAll('[data-qid]')).map((c) => collectOne(/** @type {HTMLElement} */ (c)));

  // ── Auto-save (debounced per question) ──────────────────────────
  const saveTimers = new Map();
  const autoSave = (/** @type {HTMLElement} */ card) => {
    const qid = card.dataset.qid;
    if (saveTimers.has(qid)) clearTimeout(saveTimers.get(qid));
    saveTimers.set(qid, setTimeout(async () => {
      if (!token || submitting) return;
      setSaveStatus('Saving…');
      try {
        const payload = Object.assign({ token }, collectOne(card));
        const r = await fetch(`${API_BASE}/api/exam/answer`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        }).then((x) => x.json());
        if (r && r.ok) {
          if (r.expires_at) { expiresAtMs = new Date(r.expires_at).getTime(); }
          if (r.server_now) { clockOffset = new Date(r.server_now).getTime() - Date.now(); }
          setSaveStatus('Saved ✓', true);
        } else if (r && r.status === 'expired') {
          setSaveStatus('Time is up.', false);
          finishByTimeout();
        } else {
          setSaveStatus('Could not save.', false);
        }
      } catch (_) { setSaveStatus('Offline — will retry on submit.', false); }
    }, 700));
  };

  const wireInputs = () => {
    questionsEl.querySelectorAll('[data-qid]').forEach((card) => {
      const el = /** @type {HTMLElement} */ (card);
      el.addEventListener('change', () => autoSave(el));
      el.querySelectorAll('textarea[data-text]').forEach((ta) =>
        ta.addEventListener('input', () => autoSave(el)));
    });
  };

  // ── Timer ───────────────────────────────────────────────────────
  const fmt = (/** @type {number} */ ms) => {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
  const tickTimer = () => {
    const remaining = expiresAtMs - serverNow();
    if (timerText) timerText.textContent = fmt(remaining);
    if (timerEl) {
      timerEl.classList.toggle('bg-red-500/80', remaining <= 60 * 1000);
      timerEl.classList.toggle('bg-white/15', remaining > 60 * 1000);
    }
    if (remaining <= 0) { finishByTimeout(); }
  };
  const startTimer = () => {
    show(timerEl); if (timerEl) { timerEl.classList.remove('hidden'); timerEl.classList.add('flex'); }
    tickTimer();
    timerHandle = setInterval(tickTimer, 1000);
  };
  const stopTimer = () => { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } if (timerEl) { timerEl.classList.add('hidden'); timerEl.classList.remove('flex'); } };

  const finishByTimeout = async () => {
    if (submitting) return;
    stopTimer();
    await doSubmit(true);
  };

  // ── Submit ──────────────────────────────────────────────────────
  const doSubmit = async (/** @type {boolean} */ auto) => {
    if (submitting || !token) return;
    submitting = true;
    const btn = /** @type {HTMLButtonElement|null} */ ($('examSubmitBtn'));
    if (btn) btn.setAttribute('disabled', 'true');
    setSaveStatus(auto ? 'Time is up — submitting…' : 'Submitting…');
    try {
      const r = await fetch(`${API_BASE}/api/exam/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, responses: collectAll() }),
      }).then((x) => x.json());
      stopTimer();
      // After submit the token session is closed; re-login to read state.
      await refreshState(auto);
    } catch (_) {
      submitting = false;
      if (btn) btn.removeAttribute('disabled');
      setSaveStatus('Could not submit — check your connection and try again.', false);
    }
  };

  // ── State screens (waiting / result) ────────────────────────────
  const showWaiting = (/** @type {any} */ data, auto) => {
    hide(examCard); hide(loginCard); stopTimer();
    if (statePanel) {
      statePanel.classList.remove('hidden');
      statePanel.innerHTML = `
        <div class="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-[0_20px_60px_rgba(4,47,141,0.14)]">
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          </div>
          <h2 class="text-lg font-bold text-slate-800">${auto ? 'Time is up' : 'Exam submitted'}</h2>
          <p class="mt-2 text-sm text-slate-600">Your answers were recorded. Your exam is now awaiting correction by the instructor. Your result will be available here once it has been corrected.</p>
          <button id="checkResultBtn" type="button" class="mt-5 rounded-full bg-[#042F8D] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px">Check result</button>
          <a href="./login.html" class="mt-3 block text-xs font-semibold text-slate-400 hover:text-[#042F8D]">Leave the exam portal</a>
        </div>`;
      $('checkResultBtn')?.addEventListener('click', () => refreshState(false));
    }
  };

  const showResult = (/** @type {any} */ res) => {
    hide(examCard); hide(loginCard); stopTimer();
    const pass = res.passed === true;
    const badge = res.passed == null
      ? `<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">No pass mark</span>`
      : `<span class="rounded-full px-3 py-1 text-xs font-bold ${pass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">${pass ? 'PASSED' : 'DID NOT PASS'}</span>`;
    const qhtml = (res.questions || []).map((/** @type {any} */ q, i) => `
      <div class="rounded-xl border border-slate-200 bg-white p-3">
        <div class="flex items-start justify-between gap-3">
          <p class="text-sm font-semibold text-slate-700">${i + 1}. ${esc(q.question_text)}</p>
          <span class="shrink-0 rounded-full bg-[#042F8D]/10 px-2 py-0.5 text-xs font-bold text-[#042F8D]">${Number(q.awarded_score) || 0} / ${Number(q.max_points) || 0}</span>
        </div>
        ${q.instructor_comment ? `<p class="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">${esc(q.instructor_comment)}</p>` : ''}
      </div>`).join('');
    if (statePanel) {
      statePanel.classList.remove('hidden');
      statePanel.innerHTML = `
        <div class="mx-auto max-w-2xl space-y-4">
          <div class="rounded-3xl bg-white p-6 text-center shadow-[0_20px_60px_rgba(4,47,141,0.14)] sm:p-8">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">${esc(res.exam_title || 'Exam result')}</h2>
            <p class="mt-1 text-xs text-slate-500">${esc(res.training_title || '')}${res.instructor ? ' · ' + esc(res.instructor) : ''}${res.exam_date ? ' · ' + esc(String(res.exam_date).slice(0, 10)) : ''}</p>
            <p class="mt-4 text-4xl font-extrabold text-slate-800">${res.total_score} <span class="text-xl font-semibold text-slate-400">/ ${res.max_score}</span></p>
            <div class="mt-3 flex items-center justify-center gap-2">${badge}
              ${res.passing_score != null ? `<span class="text-xs text-slate-500">pass mark: ${res.passing_score}</span>` : ''}</div>
            ${res.instructor_comment ? `<p class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">${esc(res.instructor_comment)}</p>` : ''}
          </div>
          ${qhtml ? `<div class="space-y-2">${qhtml}</div>` : ''}
          <div class="text-center"><a href="./login.html" class="text-xs font-semibold text-slate-400 hover:text-[#042F8D]">Leave the exam portal</a></div>
        </div>`;
    }
  };

  // Re-authenticate with the stored credential to read the latest state.
  const refreshState = async (/** @type {boolean} */ auto) => {
    submitting = false;
    try {
      const data = await fetch(`${API_BASE}/api/exam/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      }).then((r) => r.json());
      applyLogin(data, auto);
    } catch (_) { setSaveStatus('Could not refresh — please retry.', false); }
  };

  // ── Apply a login/state payload ─────────────────────────────────
  const statusMessage = (/** @type {string} */ s) => ({
    invalid: 'Invalid username or password.',
    disabled: 'This exam credential has been disabled.',
    expired: 'This exam credential has expired.',
    not_assigned: 'You are not assigned to this training.',
    exam_unavailable: 'This exam is not currently available.',
    not_yet_available: 'This exam is not available yet. Please try again at the scheduled time.',
  }[s] || 'Unable to sign in.');

  const applyLogin = (/** @type {any} */ data, auto) => {
    if (!data || data.ok === false) { setLoginStatus(statusMessage(data && data.status), false); return; }
    const state = data.state;
    if (state === 'result' && data.result) { showResult(data.result); return; }
    if (state === 'submitted' || (data.ok && state !== 'in_progress' && !data.result)) { showWaiting(data, auto); return; }
    if (state === 'result') { showResult(data.result || data); return; }

    // in_progress → render the exam.
    token = data.token;
    questions = Array.isArray(data.questions) ? data.questions : [];
    clockOffset = data.server_now ? new Date(data.server_now).getTime() - Date.now() : 0;
    expiresAtMs = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    const e = data.exam || {};
    if (subtitle) subtitle.textContent = [e.exam_title, e.training_title].filter(Boolean).join(' · ');
    if (metaEl) {
      metaEl.innerHTML = `<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="text-sm font-bold text-[#042F8D]">${esc(e.exam_title || '')}</h3>
        <p class="mt-0.5 text-xs text-slate-500">${esc(e.training_title || '')}${e.instructor ? ' · ' + esc(e.instructor) : ''}${e.duration_minutes ? ' · ' + e.duration_minutes + ' min' : ''}</p>
        ${e.instructions ? `<p class="mt-2 whitespace-pre-line rounded-lg border border-[#042F8D]/15 bg-[#042F8D]/5 px-3 py-2 text-sm text-slate-700">${esc(e.instructions)}</p>` : ''}</div>`;
    }
    if (!questions.length) {
      questionsEl.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">This exam has no questions.</p>`;
    } else {
      questionsEl.innerHTML = questions.map((q, i) => renderQuestion(q, i, data.saved)).join('');
      wireInputs();
    }
    hide(loginCard); hide(statePanel); show(examCard);
    if (examCard) examCard.classList.remove('hidden');
    setSaveStatus('Answers auto-save as you go.');
    startTimer();
  };

  // ── Login form ──────────────────────────────────────────────────
  $('examLoginForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const u = /** @type {HTMLInputElement} */ ($('examUsername')).value.trim();
    const p = /** @type {HTMLInputElement} */ ($('examPassword')).value;
    if (!u || !p) { setLoginStatus('Enter your username and password.', false); return; }
    creds = { username: u, password: p };
    setLoginStatus('Signing in…');
    try {
      const data = await fetch(`${API_BASE}/api/exam/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds),
      }).then((r) => r.json());
      applyLogin(data, false);
    } catch (_) { setLoginStatus('Could not reach the server.', false); }
  });

  $('examSubmitBtn')?.addEventListener('click', () => {
    if (window.confirm('Submit your exam? You will not be able to change your answers afterwards.')) doSubmit(false);
  });

  // Warn before leaving an active exam.
  window.addEventListener('beforeunload', (e) => {
    if (token && examCard && !examCard.classList.contains('hidden') && !submitting) {
      e.preventDefault(); e.returnValue = '';
    }
  });
})();
