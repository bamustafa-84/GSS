// @ts-check
/// <reference path="../utils/translation.js" />
/**
 * GSS · Exam credential management (Admin / Instructor / Head of Training)
 * ------------------------------------------------------------------
 * Professional table of every candidate assigned to a training's exam, with
 * their temporary credential + attempt state and per-row actions:
 *   View credential · Copy username · Reveal/Copy password · Send credential ·
 *   Disable credential · View answers · Correct exam.
 * Passwords are never listed in bulk; they are fetched on demand from the
 * backend (which decrypts the stored copy) only for the single row acted upon.
 */
(() => {
  'use strict';

  const overlay = document.getElementById('examCredsOverlay');
  const openBtn = document.getElementById('examCredsBtn');
  const closeBtn = document.getElementById('examCredsClose');
  const refreshBtn = document.getElementById('examCredsRefresh');
  const copyAllBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('examCredsCopyAll'));
  const trainingSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('examCredsTraining'));
  const bodyEl = document.getElementById('examCredsBody');
  const statusEl = document.getElementById('examCredsStatus');
  const subtitle = document.getElementById('examCredsSubtitle');
  if (!overlay || !bodyEl || !trainingSelect) return;

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
  // Copy text to the clipboard with a legacy fallback (works even when the
  // async Clipboard API is blocked, e.g. no focus / insecure context).
  const copyText = async (/** @type {string} */ text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (_) { /* fall through to legacy path */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
  };
  const fmtDate = (/** @type {any} */ v) => v ? String(v).slice(0, 10) : '—';
  const fmtDT = (/** @type {any} */ v) => {
    if (!v) return '—';
    const d = new Date(v); if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  };

  const setStatus = (/** @type {string} */ msg, ok) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('text-red-600', ok === false);
    statusEl.classList.toggle('text-emerald-600', ok === true);
    statusEl.classList.toggle('text-slate-500', ok === undefined);
  };

  const credBadge = (/** @type {string} */ s) => {
    const map = {
      'Not Generated': 'bg-slate-100 text-slate-500', 'Generated': 'bg-blue-50 text-blue-700',
      'Sent': 'bg-indigo-50 text-indigo-700', 'Used': 'bg-amber-50 text-amber-700',
      'Expired': 'bg-slate-200 text-slate-600', 'Disabled': 'bg-red-50 text-red-700',
    };
    return `<span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[s] || 'bg-slate-100 text-slate-600'}">${esc(s)}</span>`;
  };
  const examBadge = (/** @type {string} */ s, /** @type {string} */ corr) => {
    const label = corr === 'WAITING_FOR_CORRECTION' ? 'Waiting for correction'
      : corr === 'CORRECTING' ? 'Correcting'
      : corr === 'CORRECTED' ? 'Corrected'
      : ({ 'Not Started': 'Not started', IN_PROGRESS: 'In progress', SUBMITTED: 'Submitted', EXPIRED: 'Expired', CORRECTED: 'Corrected' }[s] || s);
    const cls = corr === 'CORRECTED' || s === 'CORRECTED' ? 'bg-emerald-50 text-emerald-700'
      : corr === 'WAITING_FOR_CORRECTION' ? 'bg-amber-50 text-amber-700'
      : corr === 'CORRECTING' ? 'bg-indigo-50 text-indigo-700'
      : s === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700'
      : s === 'EXPIRED' ? 'bg-red-50 text-red-700'
      : s === 'SUBMITTED' ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-500';
    return `<span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}">${esc(label)}</span>`;
  };
  const resultCell = (/** @type {any} */ r) => {
    if (r.correction_status !== 'CORRECTED' && r.exam_status !== 'CORRECTED') return '<span class="text-slate-400">—</span>';
    if (r.passed == null) return '<span class="text-slate-500">—</span>';
    return r.passed
      ? '<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">PASS</span>'
      : '<span class="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">FAIL</span>';
  };
  const scoreCell = (/** @type {any} */ r) => {
    const sc = r.final_score != null ? r.final_score : r.total_score;
    if (sc == null) return '<span class="text-slate-400">—</span>';
    return `<span class="font-semibold text-slate-700">${sc}${r.max_score != null ? ' / ' + r.max_score : ''}</span>`;
  };

  /** @type {number|null} */ let currentExamId = null;
  /** @type {any[]} */ let currentRows = [];

  const api = (/** @type {string} */ m, /** @type {string} */ u, /** @type {any} */ b) =>
    fetch(`${API_BASE}${u}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

  const loadTrainings = async () => {
    try {
      const data = await fetch(`${API_BASE}/api/training`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      const rows = Array.isArray(data.trainings) ? data.trainings : [];
      const cur = trainingSelect.value;
      trainingSelect.innerHTML = `<option value="">${t('examPickCourse', 'Select a course…')}</option>`;
      rows.forEach((/** @type {any} */ row) => {
        const opt = document.createElement('option');
        opt.value = String(row.training_id);
        opt.textContent = row.training_title || row.title;
        trainingSelect.appendChild(opt);
      });
      if (cur) trainingSelect.value = cur;
    } catch (_) { /* noop */ }
  };

  const render = (/** @type {any} */ data) => {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    currentRows = rows;
    const ex = data.exam || {};
    currentExamId = ex.exam_id != null ? Number(ex.exam_id) : null;
    if (copyAllBtn) copyAllBtn.disabled = !rows.some((/** @type {any} */ r) => r.access_id);
    if (subtitle) subtitle.textContent = ex.exam_title
      ? `${ex.exam_title} · ${ex.status || ''} · ${rows.length} ${t('credsCandidates', 'candidates')}`
      : '';
    if (!rows.length) {
      bodyEl.innerHTML = `<p class="px-4 py-10 text-center text-sm text-slate-400">${t('credsEmpty', 'No candidates are assigned to this training yet, or the exam has not been published.')}</p>`;
      return;
    }
    const head = `<thead class="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
      <tr>
        <th class="px-3 py-2 text-left">${t('credCandidateNo', 'No.')}</th>
        <th class="px-3 py-2 text-left">${t('credCandidate', 'Candidate')}</th>
        <th class="px-3 py-2 text-left">${t('credTraining', 'Training')}</th>
        <th class="px-3 py-2 text-left">${t('credInstructor', 'Instructor')}</th>
        <th class="px-3 py-2 text-left">${t('credExamDate', 'Exam date')}</th>
        <th class="px-3 py-2 text-left">${t('credUsername', 'Username')}</th>
        <th class="px-3 py-2 text-left">${t('credStatus', 'Credential')}</th>
        <th class="px-3 py-2 text-left">${t('credExamStatus', 'Exam status')}</th>
        <th class="px-3 py-2 text-left">${t('credStarted', 'Started')}</th>
        <th class="px-3 py-2 text-left">${t('credSubmitted', 'Submitted')}</th>
        <th class="px-3 py-2 text-left">${t('credScore', 'Score')}</th>
        <th class="px-3 py-2 text-left">${t('credResult', 'Result')}</th>
        <th class="px-3 py-2 text-left">${t('credActions', 'Actions')}</th>
      </tr></thead>`;
    const bodyRows = rows.map((/** @type {any} */ r) => {
      const hasCred = r.credential_status && r.credential_status !== 'Not Generated' && r.access_id;
      const canDisable = hasCred && r.is_active;
      const hasAttempt = !!r.attempt_id;
      const canCorrect = hasAttempt && r.exam_status !== 'Not Started' && r.exam_status !== 'IN_PROGRESS';
      return `<tr class="border-t border-slate-100 text-sm hover:bg-slate-50/60" data-access="${r.access_id || ''}" data-attempt="${r.attempt_id || ''}" data-username="${esc(r.username || '')}" data-name="${esc(r.candidate_name || '')}">
        <td class="px-3 py-2 font-medium text-slate-700">${esc(r.candidate_no)}</td>
        <td class="px-3 py-2 text-slate-700">${esc(r.candidate_name || '')}</td>
        <td class="px-3 py-2 text-slate-600">${esc(r.training_title || '')}</td>
        <td class="px-3 py-2 text-slate-600">${esc(r.instructor || '')}</td>
        <td class="px-3 py-2 text-slate-600">${fmtDate(r.exam_date)}</td>
        <td class="px-3 py-2 font-mono text-[#042F8D]">${esc(r.username || '—')}</td>
        <td class="px-3 py-2">${credBadge(r.credential_status || 'Not Generated')}</td>
        <td class="px-3 py-2">${examBadge(r.exam_status, r.correction_status)}</td>
        <td class="px-3 py-2 text-slate-600">${fmtDT(r.started_at)}</td>
        <td class="px-3 py-2 text-slate-600">${fmtDT(r.submitted_at)}</td>
        <td class="px-3 py-2">${scoreCell(r)}</td>
        <td class="px-3 py-2">${resultCell(r)}</td>
        <td class="px-3 py-2">
          <div class="flex flex-wrap items-center gap-1">
            ${hasCred ? `<button type="button" data-act="view" class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-[#042F8D] hover:bg-[#042F8D]/10" title="${t('credView', 'View credential')}">${t('credView', 'View')}</button>` : ''}
            ${hasCred ? `<button type="button" data-act="copyuser" class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100" title="${t('credCopyUser', 'Copy username')}">${t('credCopyUserShort', 'Copy user')}</button>` : ''}
            ${hasCred ? `<button type="button" data-act="send" class="rounded-md border border-indigo-200 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50" title="${t('credSend', 'Send credential')}">${t('credSend', 'Send')}</button>` : ''}
            ${canDisable ? `<button type="button" data-act="disable" class="rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50" title="${t('credDisable', 'Disable credential')}">${t('credDisable', 'Disable')}</button>` : ''}
            ${canCorrect ? `<button type="button" data-act="correct" class="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50" title="${t('credCorrect', 'Correct exam')}">${r.correction_status === 'CORRECTED' ? t('credViewAnswers', 'View answers') : t('credCorrect', 'Correct')}</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
    bodyEl.innerHTML = `<table class="min-w-full border-collapse">${head}<tbody>${bodyRows}</tbody></table>`;
    bodyEl.querySelectorAll('button[data-act]').forEach((btn) =>
      btn.addEventListener('click', () => onAction(/** @type {HTMLElement} */ (btn))));
  };

  const load = async (/** @type {string|number} */ trainingId, /** @type {string|number|undefined} */ examId) => {
    setStatus(t('credsLoading', 'Loading…'));
    try {
      const q = examId ? `exam_id=${examId}` : `training_id=${trainingId}`;
      const data = await fetch(`${API_BASE}/api/exam/credentials?${q}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      render(data || {});
      setStatus('');
    } catch (_) {
      bodyEl.innerHTML = `<p class="px-4 py-10 text-center text-sm text-red-500">${t('credsError', 'Could not load credentials. Is the server running?')}</p>`;
      setStatus('');
    }
  };

  // ── Row actions ─────────────────────────────────────────────────
  const onAction = async (/** @type {HTMLElement} */ btn) => {
    const tr = btn.closest('tr'); if (!tr) return;
    const el = /** @type {HTMLElement} */ (tr);
    const accessId = Number(el.dataset.access) || null;
    const attemptId = Number(el.dataset.attempt) || null;
    const username = el.dataset.username || '';
    const name = el.dataset.name || '';
    const act = btn.dataset.act;

    if (act === 'copyuser') {
      await copyText(username);
      setStatus(t('credCopiedUser', 'Username copied ✓'), true);
      return;
    }
    if (act === 'view') {
      if (!accessId) return;
      const r = await api('POST', '/api/exam/credential/reveal', { access_id: accessId });
      showCredentialModal(name, username, r && r.ok ? r.password : null);
      return;
    }
    if (act === 'send') {
      if (!accessId) return;
      setStatus(t('credSending', 'Preparing message…'));
      const r = await api('POST', '/api/exam/credential/send', { access_id: accessId, updated_by: currentUserId() });
      if (r && r.ok) { showSendModal(r); setStatus(''); await refresh(); }
      else setStatus(t('credSendErr', 'Could not prepare the credential.'), false);
      return;
    }
    if (act === 'disable') {
      if (!accessId) return;
      if (!window.confirm(t('credConfirmDisable', 'Disable this exam credential? The candidate will no longer be able to sign in. Exam history is preserved.'))) return;
      const r = await api('POST', '/api/exam/credential/disable', { access_id: accessId, updated_by: currentUserId() });
      if (r && r.ok) { setStatus(t('credDisabled', 'Credential disabled ✓'), true); await refresh(); }
      else setStatus(t('credDisableErr', 'Could not disable the credential.'), false);
      return;
    }
    if (act === 'correct') {
      if (!attemptId) return;
      const capi = /** @type {any} */ (window).GSSExamCorrect;
      if (capi && typeof capi.open === 'function') capi.open(attemptId, () => refresh());
      return;
    }
  };

  const modalShell = (/** @type {string} */ title, /** @type {string} */ inner, /** @type {string} */ color) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-4';
    wrap.innerHTML = `<div class="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div class="flex items-center justify-between ${color || 'bg-[#042F8D]'} px-5 py-3 text-white">
        <h3 class="text-sm font-bold">${esc(title)}</h3>
        <button type="button" data-close class="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30">${t('closeBtn', 'Close')}</button>
      </div>${inner}</div>`;
    document.body.appendChild(wrap);
    const remove = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap) remove(); });
    wrap.querySelector('[data-close]')?.addEventListener('click', remove);
    return wrap;
  };

  const showCredentialModal = (/** @type {string} */ name, /** @type {string} */ username, /** @type {string|null} */ password) => {
    const pwHtml = password
      ? `<div class="flex items-center gap-2"><code class="rounded bg-slate-100 px-2 py-1 font-mono font-bold text-slate-800" data-pw>${esc(password)}</code>
           <button type="button" data-copypw class="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-[#042F8D] hover:bg-[#042F8D]/10">${t('credCopyPw', 'Copy')}</button></div>`
      : `<span class="text-sm text-slate-400">${t('credPwUnavailable', 'Unavailable — regenerate by re-publishing.')}</span>`;
    const wrap = modalShell(t('credView', 'View credential'), `
      <div class="space-y-3 p-5 text-sm">
        <p class="text-slate-500">${esc(name)}</p>
        <div><span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">${t('credUsername', 'Username')}</span>
          <div class="flex items-center gap-2"><code class="rounded bg-slate-100 px-2 py-1 font-mono font-bold text-[#042F8D]">${esc(username)}</code>
          <button type="button" data-copyuser class="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-[#042F8D] hover:bg-[#042F8D]/10">${t('credCopyPw', 'Copy')}</button></div></div>
        <div><span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">${t('credPassword', 'Password')}</span>${pwHtml}</div>
        <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">${t('credSecurity', 'Only share credentials with the intended candidate.')}</p>
      </div>`);
    wrap.querySelector('[data-copyuser]')?.addEventListener('click', () => copyText(username));
    wrap.querySelector('[data-copypw]')?.addEventListener('click', () => { if (password) copyText(password); });
  };

  const showSendModal = (/** @type {any} */ r) => {
    const wrap = modalShell(t('credSendTitle', 'Send credential'), `
      <div class="space-y-3 p-5">
        <p class="text-sm text-slate-500">${t('credSendHint', 'A ready-to-send message has been prepared. Copy it and send it to the candidate through your usual channel (email / SMS / print).')}</p>
        <textarea readonly rows="12" class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" data-msg>${esc(r.message || '')}</textarea>
        <div class="flex justify-end gap-2">
          <button type="button" data-copymsg class="rounded-full bg-[#042F8D] px-4 py-2 text-sm font-semibold text-white">${t('credCopyMsg', 'Copy message')}</button>
        </div>
      </div>`, 'bg-indigo-600');
    wrap.querySelector('[data-copymsg]')?.addEventListener('click', () => {
      const ta = /** @type {HTMLTextAreaElement|null} */ (wrap.querySelector('[data-msg]'));
      if (ta) copyText(ta.value);
    });
  };

  // ── Copy all credentials (name, username, password) ─────────────
  const copyAll = async () => {
    const rows = (currentRows || []).filter((r) => r.access_id);
    if (!rows.length) { setStatus(t('credsCopyNone', 'No credentials to copy yet.'), false); return; }
    setStatus(t('credsCopying', 'Fetching passwords…'));
    if (copyAllBtn) copyAllBtn.disabled = true;
    try {
      // Passwords are not in the list payload; fetch each on demand.
      const lines = [`${t('credCandidate', 'Candidate')}\t${t('credUsername', 'Username')}\t${t('credPassword', 'Password')}`];
      for (const r of rows) {
        let pw = '';
        try {
          const rev = await api('POST', '/api/exam/credential/reveal', { access_id: r.access_id });
          pw = rev && rev.ok ? (rev.password || '') : '';
        } catch (_) { pw = ''; }
        lines.push(`${r.candidate_name || ''}\t${r.username || ''}\t${pw}`);
      }
      await copyText(lines.join('\n'));
      setStatus(t('credsCopiedAll', 'All credentials copied to the clipboard ✓'), true);
    } catch (_) {
      setStatus(t('credsCopyErr', 'Could not copy the credentials.'), false);
    } finally {
      if (copyAllBtn) copyAllBtn.disabled = false;
    }
  };

  // ── Open / close ────────────────────────────────────────────────
  const showOverlay = () => {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.setAttribute('aria-hidden', 'false');
  };
  const open = async (/** @type {{training_id?:any, exam_id?:any}} */ opts) => {
    showOverlay();
    setStatus('');
    currentRows = [];
    if (copyAllBtn) copyAllBtn.disabled = true;
    await loadTrainings();
    const tid = opts && opts.training_id;
    if (tid) {
      trainingSelect.value = String(tid);
      await load(tid, opts && opts.exam_id);
    } else {
      bodyEl.innerHTML = `<p class="px-4 py-10 text-center text-sm text-slate-400">${t('credsPick', 'Select a training course to view its assigned candidates and credentials.')}</p>`;
    }
  };
  const close = () => {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    overlay.setAttribute('aria-hidden', 'true');
  };
  const refresh = () => {
    const tid = trainingSelect.value;
    if (tid) return load(tid, currentExamId || undefined);
    return Promise.resolve();
  };

  openBtn?.addEventListener('click', () => open({}));
  closeBtn?.addEventListener('click', close);
  copyAllBtn?.addEventListener('click', copyAll);
  refreshBtn?.addEventListener('click', () => refresh());
  trainingSelect.addEventListener('change', () => { currentExamId = null; refresh(); });

  /** @type {any} */ (window).GSSExamCreds = { open, refresh };
})();
