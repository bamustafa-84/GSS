// @ts-check
/**
 * GSS · Manage Users
 * ------------------------------------------------------------------
 * Loaded on tc.html (Admin only). Responsibilities:
 *   • Toolbar dropdown — "Manage Users" button revealing two entries:
 *       Users  → opens the existing Manage Users modal (admin.js).
 *       Roles & Permissions → opens the Permissions Management modal.
 *   • Password visibility toggles for the Add-New-User form.
 *   • Permissions Management modal — a per-user access grid (UI-first; the
 *     Save action acknowledges locally and real persistence is wired later).
 */
(() => {
  'use strict';

  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };

  const esc = (/** @type {any} */ s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  // ── Permission columns ─────────────────────────────────────────
  const COLS = ['view', 'add', 'edit', 'delete'];

  // Section colour themes (group cell + row tint).
  // One distinct tint per module (indexed by section number).
  const MODULE_THEMES = [
    { group: 'bg-indigo-100 text-indigo-800',   row: 'hover:bg-indigo-50/60',   icon: 'bg-indigo-200 text-indigo-800' },
    { group: 'bg-sky-100 text-sky-800',         row: 'hover:bg-sky-50/60',      icon: 'bg-sky-200 text-sky-800' },
    { group: 'bg-teal-100 text-teal-800',       row: 'hover:bg-teal-50/60',     icon: 'bg-teal-200 text-teal-800' },
    { group: 'bg-emerald-100 text-emerald-800', row: 'hover:bg-emerald-50/60',  icon: 'bg-emerald-200 text-emerald-800' },
    { group: 'bg-lime-100 text-lime-800',       row: 'hover:bg-lime-50/60',     icon: 'bg-lime-200 text-lime-800' },
    { group: 'bg-amber-100 text-amber-800',     row: 'hover:bg-amber-50/60',    icon: 'bg-amber-200 text-amber-800' },
    { group: 'bg-orange-100 text-orange-800',   row: 'hover:bg-orange-50/60',   icon: 'bg-orange-200 text-orange-800' },
    { group: 'bg-rose-100 text-rose-800',       row: 'hover:bg-rose-50/60',     icon: 'bg-rose-200 text-rose-800' },
    { group: 'bg-fuchsia-100 text-fuchsia-800', row: 'hover:bg-fuchsia-50/60',  icon: 'bg-fuchsia-200 text-fuchsia-800' },
    { group: 'bg-violet-100 text-violet-800',   row: 'hover:bg-violet-50/60',   icon: 'bg-violet-200 text-violet-800' },
  ];

  const ICON = {
    clipboard: '<path d="M9 2h6a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a2 2 0 0 1 2-2z"/><path d="M9 5h6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
    teacher: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
    ruler: '<path d="M16 2 22 8 8 22 2 16z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  };

  const svg = (/** @type {string} */ paths) =>
    `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  // ── Grid data ──────────────────────────────────────────────────
  /** @type {Array<{n:number,title:string,color:string,icon:string,rows:Array<{no:string,label:string,remark:string}>}>} */
  const SECTIONS = [
    { n: 1, title: 'Registration', color: 'blue', icon: ICON.clipboard, rows: [
      { no: '1.1', label: 'General', remark: 'Register and update trainee registration information.' },
      { no: '1.2', label: 'For Administration Use Only', remark: 'Interview result and remarks. Restricted to Administration.' },
    ] },
    { n: 2, title: 'Conditions', color: 'blue', icon: ICON.calendar, rows: [
      { no: '2.1', label: 'General', remark: 'View and update the training conditions.' },
    ] },
    { n: 3, title: 'Rules ', color: 'blue', icon: ICON.users, rows: [
      { no: '3.1', label: 'General', remark: 'View and update the training rules.' },
    ] },
    { n: 4, title: 'Commitment', color: 'blue', icon: ICON.teacher, rows: [
      { no: '4.1', label: 'General', remark: 'View and update the training commitment.' },
    ] },
    { n: 5, title: 'Attendance', color: 'blue', icon: ICON.check, rows: [
      { no: '5.1', label: 'Candidate Info', remark: 'Each instructor may register and update attendance only for assigned courses.' },
    ] },
    { n: 6, title: 'Exam Results', color: 'red', icon: ICON.file, rows: [
      { no: '6.1', label: 'General', remark: 'Display Exam Result of the candidate' },
    ] },
    { n: 7, title: 'Evaluation', color: 'amber', icon: ICON.chart, rows: [
      { no: '7.1', label: 'Evaluation Grid', remark: 'Grades to be displayed to candidate in details.' },
      { no: '7.2', label: 'Final Result', remark: 'Enter and update evaluation final results.' },
    ] },
    { n: 8, title: 'Measurements', color: 'pink', icon: ICON.ruler, rows: [
      { no: '8.1', label: 'General', remark: 'Display measurements of the candidate.' },
    ] },
    { n: 9, title: 'CheckList', color: 'red', icon: ICON.gear, rows: [
      { no: '9.1', label: 'General', remark: 'View and update the candidate checklist.' },
    ] },
    { n: 10, title: 'System Features', color: 'green', icon: ICON.lock, rows: [
      { no: '10.1', label: 'Reports', remark: 'Access to reports.' },
      { no: '10.2', label: 'Attendance Sheet', remark: 'Record attendance for assigned courses only.' },
      { no: '10.3', label: 'Signatures', remark: 'Signatures manager (sigBtn).' },
      { no: '10.4', label: 'Pending Candidates to Reviews', remark: 'Update the Pending-to-Review Queue (pendingBell) so that when a candidate submits the Registration form (the first tab), the application is automatically added to the queue for review.' },
      { no: '10.5', label: 'Applicants to Process', remark: 'Update the Secretary Applicant Queue (secretaryBell) so that, once a candidate is accepted, the Secretary can proceed directly to the next form in the workflow: the Conditions tab.' },
      { no: '10.6', label: 'Exams', remark: 'Exam configuration and credentials (examConfigBtn).' },
    ] },
  ];

  // ── Elements ───────────────────────────────────────────────────
  const $ = (/** @type {string} */ id) => document.getElementById(id);
  const sysWrap = $('sysMgmtWrap');
  const sysBtn = $('sysMgmtBtn');
  const sysMenu = $('sysMgmtMenu');
  const openUsersBtn = $('openUsersBtn');
  const openPermsBtn = $('openPermsBtn');
  const openDictConfigBtn = $('openDictConfigBtn');
  const userViewPermsBtn = $('userViewPermsBtn');

  const dictConfigOverlay = $('dictConfigOverlay');
  const dictConfigClose = $('dictConfigClose');

  const permsOverlay = $('permsOverlay');
  const permsClose = $('permsClose');
  const permsCancel = $('permsCancel');
  const permsUserSelect = /** @type {HTMLSelectElement | null} */ ($('permsUserSelect'));
  const permsRole = $('permsRole');
  const permsStatusBox = $('permsStatus');
  const permsCardName = $('permsCardName');
  const permsCardUser = $('permsCardUser');
  const permsCardRole = $('permsCardRole');
  const permsGrid = $('permsGrid');
  const permsClearAll = $('permsClearAll');
  const permsSave = $('permsSave');
  const permsStatusMsg = $('permsStatusMsg');

  // Templates tab
  const permsUserTplSelect = /** @type {HTMLSelectElement | null} */ ($('permsUserTplSelect'));
  const permsTplSelect = /** @type {HTMLSelectElement | null} */ ($('permsTplSelect'));
  const permsTplHistory = $('permsTplHistory');
  const permsTplCreate = $('permsTplCreate');
  const permsTplDelete = $('permsTplDelete');
  const permsTplGrid = $('permsTplGrid');
  const permsTplClearAll = $('permsTplClearAll');
  const permsTplSave = $('permsTplSave');
  const permsTplStatusMsg = $('permsTplStatusMsg');
  const permsTplAssignedList = $('permsTplAssignedList');
  const permsTplAssignedCount = $('permsTplAssignedCount');
  const permsTplAssignedSearch = /** @type {HTMLInputElement | null} */ ($('permsTplAssignedSearch'));
  const permsTplUserList = $('permsTplUserList');
  const permsTplUserSearch = /** @type {HTMLInputElement | null} */ ($('permsTplUserSearch'));
  const permsTplSelectedCount = $('permsTplSelectedCount');
  const permsTplApply = $('permsTplApply');
  const permsTplApplyMsg = $('permsTplApplyMsg');

  /** @type {any[]} */ let usersCache = [];
  /** @type {any} */ let currentUser = null;
  /** @type {any[]} */ let templatesCache = [];
  /** @type {any} */ let currentTpl = null;
  /** @type {Set<number>} */ const applySelected = new Set();
  // Monotonic request tokens: a slower/earlier fetch must never overwrite the
  // grid for a newer selection (templates tab + per-user permissions tab).
  let tplLoadSeq = 0;
  let permLoadSeq = 0;

  // ── Password visibility toggles (Add-New-User form) ────────────
  document.querySelectorAll('[data-pw-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-pw-toggle') || '';
      const input = /** @type {HTMLInputElement | null} */ (document.getElementById(targetId));
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // ── Dropdown ───────────────────────────────────────────────────
  // System Management is a fixed, Admin-only feature (not matrix-driven).
  const isAdminRole = () => {
    const s = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    return !!s && String(s.role || '').trim().toLowerCase() === 'admin';
  };
  // Reveal the Admin-only entry point. This is the permission-management
  // bootstrap (the tool that edits the matrix), so it stays role-gated here
  // rather than via `data-perm`; the server mirrors it with requireAdmin.
  const applyAdminVisibility = () => {
    if (!sysWrap) return;
    const on = isAdminRole();
    sysWrap.classList.toggle('hidden', !on);
    sysWrap.style.display = on ? 'inline-flex' : 'none';
  };
  applyAdminVisibility();
  /** @type {any} */ (window).GSSSysMgmt = { applyAdminVisibility };
  const closeMenu = () => {
    sysMenu?.classList.add('hidden');
    sysBtn?.setAttribute('aria-expanded', 'false');
  };
  const toggleMenu = () => {
    if (!sysMenu || !isAdminRole()) return;
    const willOpen = sysMenu.classList.contains('hidden');
    sysMenu.classList.toggle('hidden', !willOpen);
    sysBtn?.setAttribute('aria-expanded', String(willOpen));
  };
  sysBtn?.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => {
    if (sysWrap && !sysWrap.contains(/** @type {Node} */ (e.target))) closeMenu();
  });

  openUsersBtn?.addEventListener('click', () => {
    closeMenu();
    if (!isAdminRole()) return;
    /** @type {any} */ (window).GSSAdmin?.openUsers?.();
  });
  openPermsBtn?.addEventListener('click', () => { closeMenu(); if (isAdminRole()) openPerms(); });
  // Dictionary Configuration — centralized manager for all reference lists.
  const openDictConfig = () => {
    if (!dictConfigOverlay) return;
    dictConfigOverlay.classList.remove('hidden');
    dictConfigOverlay.setAttribute('aria-hidden', 'false');
  };
  const closeDictConfig = () => {
    if (!dictConfigOverlay) return;
    dictConfigOverlay.classList.add('hidden');
    dictConfigOverlay.setAttribute('aria-hidden', 'true');
  };
  openDictConfigBtn?.addEventListener('click', () => { closeMenu(); if (isAdminRole()) openDictConfig(); });
  dictConfigClose?.addEventListener('click', closeDictConfig);
  // Overlay closes only via its explicit Close button (no backdrop/Escape).
  userViewPermsBtn?.addEventListener('click', () => {
    const uname = /** @type {HTMLInputElement | null} */ (document.getElementById('userUsername'));
    /** @type {any} */ (window).GSSAdmin?.closeUsers?.();
    openPerms(uname && uname.value ? uname.value.trim() : '');
  });

  // ── Permissions modal ──────────────────────────────────────────
  const COL_TINT = {
    view: 'bg-sky-50/70', add: 'bg-emerald-50/70', edit: 'bg-amber-50/70', delete: 'bg-rose-50/70',
    approve: 'bg-violet-50/70', print: 'bg-slate-50', export: 'bg-teal-50/70',
  };

  const renderGrid = () => {
    if (!permsGrid) return;
    let html = '';
    SECTIONS.forEach((sec) => {
      const theme = MODULE_THEMES[(sec.n - 1) % MODULE_THEMES.length];
      sec.rows.forEach((row, idx) => {
        const first = idx === 0;
        const top = first ? 'border-t-2 border-t-slate-200' : 'border-t border-t-slate-100';
        html += `<tr class="group transition-colors ${theme.row}">`;
        if (first) {
          html += `<td rowspan="${sec.rows.length}" class="w-[200px] border-r border-t-2 border-slate-200 px-4 py-3 align-middle ${theme.group}">` +
            `<div class="flex items-center gap-3">` +
              `<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${theme.icon}">${svg(sec.icon)}</span>` +
              `<span class="text-[13px] font-bold leading-tight">${sec.n}. ${esc(t('permSecTitle_' + sec.n, sec.title))}</span>` +
            `</div></td>`;
        }
        html += `<td class="whitespace-nowrap ${top} bg-white px-3 py-3 align-middle text-xs font-semibold tabular-nums text-slate-400 transition-colors group-hover:bg-transparent">${esc(row.no)}</td>`;
        html += `<td class="whitespace-nowrap ${top} bg-white px-3 py-3 align-middle text-sm font-medium text-slate-700 transition-colors group-hover:bg-transparent">${esc(t('permRowLabel_' + row.no.replace('.', '_'), row.label))}</td>`;
        COLS.forEach((col) => {
          html += `<td class="${top} ${COL_TINT[col]} px-2 py-3 text-center align-middle"><input type="checkbox" data-no="${row.no}" data-col="${col}" class="block mx-auto h-4 w-4 cursor-pointer rounded border-slate-300 accent-[#042F8D] transition-transform hover:scale-110" /></td>`;
        });
        html += `<td class="w-[260px] ${top} bg-white px-4 py-3 align-middle text-xs leading-snug text-slate-500 transition-colors group-hover:bg-transparent">${esc(t('permRowRemark_' + row.no.replace('.', '_'), row.remark))}</td>`;
        html += '</tr>';
      });
    });
    return html;
  };
  /** @returns {HTMLInputElement[]} */
  const boxesIn = (/** @type {HTMLElement | null} */ tbody) => Array.from(tbody ? tbody.querySelectorAll('input[type="checkbox"]') : []);
  /** @returns {HTMLInputElement[]} */
  const boxes = () => boxesIn(permsGrid);

  // Apply a stored permission map { "1.1": ["view", …] } to a grid body.
  const applyMapInto = (/** @type {HTMLElement | null} */ tbody, /** @type {Record<string, string[]>} */ map) => {
    const m = map || {};
    boxesIn(tbody).forEach((cb) => {
      const no = cb.getAttribute('data-no') || '';
      const col = cb.getAttribute('data-col') || '';
      cb.checked = Array.isArray(m[no]) && m[no].indexOf(col) !== -1;
    });
  };
  const applyPermMap = (/** @type {Record<string, string[]>} */ map) => applyMapInto(permsGrid, map);

  const clearAll = () => {
    boxes().forEach((cb) => { cb.checked = false; });
  };

  const statusPill = (/** @type {boolean} */ active) => active
    ? '<span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">' + t('usersEnabled', 'Enabled') + '</span>'
    : '<span class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">' + t('usersDisabled', 'Disabled') + '</span>';

  // ── Instructor courses (dynamic, by trainer full name) ─────────
  const emptyCourses = (/** @type {string} */ msg) =>
    '<div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-400">' +
    '<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
    '<p class="text-sm font-medium">' + esc(msg) + '</p></div>';
  const courseStatusBadge = (/** @type {string} */ s) => {
    const map = { Completed: 'bg-emerald-100 text-emerald-700', 'In Progress': 'bg-amber-100 text-amber-700', Planned: 'bg-sky-100 text-sky-700' };
    return `<span class="rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[s] || 'bg-slate-100 text-slate-600'}">${esc(s)}</span>`;
  };
  const fmtDate = (/** @type {string} */ iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString();
  };
  const loadCourses = async (/** @type {any} */ u, /** @type {HTMLElement=} */ hostArg) => {
    const host = hostArg || document.getElementById('permsCourses');
    if (!host) return;
    const role = u ? String(u.role || '').toLowerCase() : '';
    if (!u || role !== 'instructor') {
      host.innerHTML = emptyCourses(t('permsCoursesNotInstructor', 'Select an instructor to view their assigned courses.'));
      return;
    }
    host.innerHTML = '<p class="px-2 py-6 text-center text-sm text-slate-400">' + esc(t('permsCoursesLoading', 'Loading courses…')) + '</p>';
    try {
      const d = await fetch(`${API_BASE}/api/instructor-courses?trainer=${encodeURIComponent(u.full_name || '')}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      const courses = (d && Array.isArray(d.courses)) ? d.courses : [];
      if (!courses.length) { host.innerHTML = emptyCourses(t('permsCoursesEmpty', 'No courses are assigned to this instructor yet.')); return; }
      host.innerHTML =
        '<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table class="w-full border-collapse text-sm">' +
        '<thead><tr class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">' +
        `<th class="px-3 py-2.5">${esc(t('permsCourseTitle', 'Course'))}</th>` +
        `<th class="px-3 py-2.5">${esc(t('permsCourseFrom', 'From'))}</th>` +
        `<th class="px-3 py-2.5">${esc(t('permsCourseTo', 'To'))}</th>` +
        `<th class="px-3 py-2.5 text-center">${esc(t('permsCourseTrainees', 'Trainees'))}</th>` +
        `<th class="px-3 py-2.5">${esc(t('permsCourseStatus', 'Status'))}</th>` +
        '</tr></thead><tbody>' +
        courses.map((c) =>
          '<tr class="border-t border-slate-100">' +
          `<td class="px-3 py-2 font-medium text-slate-700">${esc(c.title)}</td>` +
          `<td class="px-3 py-2 text-slate-600">${fmtDate(c.date_from)}</td>` +
          `<td class="px-3 py-2 text-slate-600">${fmtDate(c.date_to)}</td>` +
          `<td class="px-3 py-2 text-center text-slate-600">${Number(c.trainees) || 0}</td>` +
          `<td class="px-3 py-2">${courseStatusBadge(String(c.status || ''))}</td>` +
          '</tr>'
        ).join('') +
        '</tbody></table></div>';
    } catch (_) {
      host.innerHTML = emptyCourses(t('permsCoursesError', 'Could not load courses.'));
    }
  };

  // Load the user's saved permission set (the matrix is the only source).
  const loadStoredPerms = async (/** @type {any} */ u) => {
    const seq = ++permLoadSeq;
    if (!u || u.login_id == null) { clearAll(); return; }
    try {
      const d = await fetch(`${API_BASE}/api/permissions?login_id=${encodeURIComponent(u.login_id)}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (seq !== permLoadSeq) return; // a newer selection won the race
      if (d && d.ok) applyPermMap(d.permissions || {});
      else clearAll();
    } catch (_) { if (seq === permLoadSeq) clearAll(); }
  };

  const onUserChange = () => {
    const uname = permsUserSelect ? permsUserSelect.value : '';
    const u = usersCache.find((x) => String(x.username) === uname);
    currentUser = u || null;
    const role = u ? String(u.role || '') : '';
    const active = u ? u.is_active !== false : true;
    if (permsRole) permsRole.textContent = role || '—';
    if (permsStatusBox) permsStatusBox.innerHTML = u ? statusPill(active) : '—';
    if (permsCardName) permsCardName.textContent = u ? String(u.full_name || u.username) : '—';
    if (permsCardUser) permsCardUser.textContent = u ? t('usersUsername', 'Username') + ': ' + String(u.username) : '';
    if (permsCardRole) permsCardRole.textContent = u && role ? t('usersRole', 'Role') + ': ' + role : '';
    loadStoredPerms(u);
    setMsg('', true);
  };

  const loadUsers = async (/** @type {string} */ preselect) => {
    if (!permsUserSelect) return;
    try {
      const d = await fetch(`${API_BASE}/api/users`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      usersCache = Array.isArray(d.users) ? d.users : [];
    } catch (_) { usersCache = []; }
    permsUserSelect.innerHTML = usersCache.map((u) =>
      `<option value="${esc(u.username)}">${esc(u.full_name || u.username)} (${esc(u.username)}) — ${esc(u.role || '')}</option>`
    ).join('');
    if (preselect && usersCache.some((u) => String(u.username) === preselect)) {
      permsUserSelect.value = preselect;
    }
    renderApplyList();
    onUserChange();
  };

  const setMsg = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!permsStatusMsg) return;
    permsStatusMsg.textContent = msg;
    permsStatusMsg.className = 'mr-1 min-h-5 text-sm font-semibold ' + (ok ? 'text-emerald-600' : 'text-red-600');
  };

  // ── Permission templates ───────────────────────────────────────
  const setTplMsg = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!permsTplStatusMsg) return;
    permsTplStatusMsg.textContent = msg;
    permsTplStatusMsg.className = 'mr-1 min-h-5 text-sm font-semibold ' + (ok ? 'text-emerald-600' : 'text-red-600');
  };
  const setApplyMsg = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!permsTplApplyMsg) return;
    permsTplApplyMsg.textContent = msg;
    permsTplApplyMsg.className = 'min-h-5 text-xs font-semibold ' + (ok ? 'text-emerald-600' : 'text-red-600');
  };
  const fmtDateTime = (/** @type {string} */ iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  };

  // Refresh the live session's gating if any of the given logins is the
  // currently signed-in user (so permission changes take effect at once).
  const refreshLiveIfAffected = (/** @type {number[]} */ ids) => {
    const sess = (typeof GSSSession !== 'undefined' && GSSSession) ? GSSSession.get() : null;
    if (!sess) return;
    const me = usersCache.find((u) => String(u.username) === String(sess.username));
    const live = /** @type {any} */ (window).GSSPerms;
    if (me && ids.indexOf(Number(me.login_id)) !== -1 && live && typeof live.refresh === 'function') live.refresh();
  };

  const fillTemplateSelects = () => {
    const opts = templatesCache.map((tpl) =>
      `<option value="${esc(tpl.template_id)}">${esc(tpl.name)}${tpl.is_system ? '' : ' · ' + t('permsTplTypeCustomShort', 'Custom')}</option>`
    ).join('');
    if (permsTplSelect) {
      const cur = permsTplSelect.value;
      permsTplSelect.innerHTML = opts || `<option value="">${esc(t('permsTplNone', 'No templates available.'))}</option>`;
      if (cur && templatesCache.some((x) => String(x.template_id) === cur)) permsTplSelect.value = cur;
    }
    if (permsUserTplSelect) {
      // Always a chooser headed by a placeholder — selecting applies to the current user.
      permsUserTplSelect.innerHTML = `<option value="">${esc(t('permsApplyTplChoose', 'Choose a template…'))}</option>` + opts;
      permsUserTplSelect.value = '';
    }
  };

  const listNote = (/** @type {string} */ msg) =>
    '<p class="px-1 py-3 text-center text-xs text-slate-400">' + esc(msg) + '</p>';

  // Users compatible with the current template (same role). A template with no
  // role accepts any user.
  const compatibleUsers = () => {
    const role = currentTpl && currentTpl.role ? String(currentTpl.role).toLowerCase() : '';
    return usersCache.filter((u) => !role || String(u.role || '').toLowerCase() === role);
  };
  const assignedIdSet = () => new Set(
    (currentTpl && Array.isArray(currentTpl.assigned_users) ? currentTpl.assigned_users : [])
      .map((u) => Number(u.login_id))
  );
  const matchUser = (/** @type {any} */ u, /** @type {string} */ q) =>
    !q || (String(u.full_name || '') + ' ' + String(u.username || '')).toLowerCase().includes(q);

  const updateSelectedCount = () => {
    if (!permsTplSelectedCount) return;
    permsTplSelectedCount.textContent = applySelected.size + ' ' + t('permsTplSelectedWord', 'selected');
  };

  // Read-only list of users currently assigned to the selected template.
  const renderAssignedList = () => {
    if (!permsTplAssignedList) return;
    const list = currentTpl && Array.isArray(currentTpl.assigned_users) ? currentTpl.assigned_users : [];
    if (permsTplAssignedCount) permsTplAssignedCount.textContent = String(list.length);
    if (!currentTpl) { permsTplAssignedList.innerHTML = listNote(t('permsSelectTplFirst', 'Select a template first.')); return; }
    if (!list.length) { permsTplAssignedList.innerHTML = listNote(t('permsTplNoAssigned', 'No users are assigned to this template yet.')); return; }
    const q = (permsTplAssignedSearch && permsTplAssignedSearch.value || '').trim().toLowerCase();
    const rows = list.filter((u) => matchUser(u, q));
    if (!rows.length) { permsTplAssignedList.innerHTML = listNote(t('permsTplNoMatch', 'No users match your search.')); return; }
    permsTplAssignedList.innerHTML = rows.map((u) =>
      '<div class="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">' +
        '<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m20 6-11 11-5-5"/></svg></span>' +
        `<span class="min-w-0 truncate text-sm text-slate-700">${esc(u.full_name || u.username)} <span class="text-slate-400">(${esc(u.username)})</span></span>` +
        `<span class="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">${esc(u.role || '')}</span>` +
      '</div>'
    ).join('');
  };

  // Selectable list of eligible users for bulk apply. Selections persist across
  // searches and re-renders via applySelected.
  const renderApplyList = () => {
    if (!permsTplUserList) return;
    if (!currentTpl) { permsTplUserList.innerHTML = listNote(t('permsSelectTplFirst', 'Select a template first.')); updateSelectedCount(); return; }
    const assigned = assignedIdSet();
    const users = compatibleUsers();
    if (!users.length) { permsTplUserList.innerHTML = listNote(t('permsTplNoEligible', 'No eligible users for this template role.')); updateSelectedCount(); return; }
    const q = (permsTplUserSearch && permsTplUserSearch.value || '').trim().toLowerCase();
    const rows = users.filter((u) => matchUser(u, q));
    if (!rows.length) { permsTplUserList.innerHTML = listNote(t('permsTplNoMatch', 'No users match your search.')); updateSelectedCount(); return; }
    permsTplUserList.innerHTML = rows.map((u) => {
      const id = Number(u.login_id);
      const isAssigned = assigned.has(id);
      const checked = applySelected.has(id) ? 'checked' : '';
      return '<label class="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">' +
        `<input type="checkbox" class="perms-tpl-user h-4 w-4 rounded border-slate-300 accent-[#042F8D]" value="${id}" ${checked} />` +
        `<span class="min-w-0 truncate text-sm text-slate-700">${esc(u.full_name || u.username)} <span class="text-slate-400">(${esc(u.username)}) — ${esc(u.role || '')}</span></span>` +
        (isAssigned ? `<span class="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">${esc(t('permsTplAssignedBadge', 'Assigned'))}</span>` : '') +
      '</label>';
    }).join('');
    updateSelectedCount();
  };

  const loadTemplate = async (/** @type {string|number} */ id) => {
    const tid = Number.parseInt(String(id), 10);
    const seq = ++tplLoadSeq;
    if (!Number.isFinite(tid)) {
      currentTpl = null; applySelected.clear();
      renderAssignedList(); renderApplyList();
      return;
    }
    if (permsTplAssignedList) permsTplAssignedList.innerHTML = listNote(t('permsTplLoading', 'Loading…'));
    if (permsTplUserList) permsTplUserList.innerHTML = listNote(t('permsTplLoading', 'Loading…'));
    try {
      const d = await fetch(`${API_BASE}/api/permission-templates?template_id=${encodeURIComponent(tid)}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      // Ignore a stale response: the admin already picked another template.
      if (seq !== tplLoadSeq) return;
      if (!d || !d.ok) {
        currentTpl = null; applySelected.clear();
        renderAssignedList(); renderApplyList();
        setTplMsg(t('permsTplErr', 'Operation failed.'), false);
        return;
      }
      currentTpl = d;
      applySelected.clear();
      if (permsTplHistory) {
        permsTplHistory.textContent =
          t('permsTplCreatedBy', 'Created by') + ' ' + (d.created_by || '—') + ' ' + t('permsTplOn', 'on') + ' ' + fmtDateTime(d.created_at) +
          ' · ' + t('permsTplUpdatedBy', 'Updated by') + ' ' + (d.updated_by || '—') + ' ' + t('permsTplOn', 'on') + ' ' + fmtDateTime(d.updated_at);
      }
      if (permsTplDelete) {
        const sys = !!d.is_system;
        /** @type {HTMLButtonElement} */ (permsTplDelete).disabled = sys;
        permsTplDelete.classList.toggle('opacity-40', sys);
        permsTplDelete.classList.toggle('cursor-not-allowed', sys);
      }
      applyMapInto(permsTplGrid, d.permissions || {});
      renderAssignedList();
      renderApplyList();
      setTplMsg('', true);
    } catch (_) {
      if (seq !== tplLoadSeq) return; // stale failure: keep the newer selection
      currentTpl = null; applySelected.clear();
      renderAssignedList(); renderApplyList();
    }
  };

  const loadTemplates = async (/** @type {string|number=} */ preselectId) => {
    try {
      const d = await fetch(`${API_BASE}/api/permission-templates`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      templatesCache = (d && Array.isArray(d.templates)) ? d.templates : [];
    } catch (_) { templatesCache = []; }
    fillTemplateSelects();
    if (permsTplSelect) {
      if (preselectId != null && templatesCache.some((x) => String(x.template_id) === String(preselectId))) {
        permsTplSelect.value = String(preselectId);
      }
      await loadTemplate(permsTplSelect.value);
    }
  };

  const tplItems = () => boxesIn(permsTplGrid).filter((c) => c.checked).map((c) => ({ no: c.getAttribute('data-no'), action: c.getAttribute('data-col') }));
  const postTpl = (/** @type {any} */ payload) => fetch(`${API_BASE}/api/permission-templates`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }).then((r) => r.json());

  const saveTemplate = async () => {
    if (!currentTpl || currentTpl.template_id == null) { setTplMsg(t('permsSelectTplFirst', 'Select a template first.'), false); return; }
    setTplMsg(t('permsSaving', 'Saving…'), true);
    try {
      const d = await postTpl({ op: 'save', template_id: currentTpl.template_id, items: tplItems() });
      if (d && d.ok) { setTplMsg(t('permsTplSaved', 'Template saved.'), true); await loadTemplates(currentTpl.template_id); }
      else setTplMsg(t('permsTplErr', 'Operation failed.'), false);
    } catch (_) { setTplMsg(t('permsTplErr', 'Operation failed.'), false); }
  };

  const createTemplate = async () => {
    const name = (window.prompt(t('permsTplNamePrompt', 'Enter a unique template name:'), '') || '').trim();
    if (!name) return;
    const role = currentTpl ? (currentTpl.role || '') : '';
    try {
      const d = await postTpl({ op: 'create', name, role, items: tplItems() });
      if (d && d.ok) { setTplMsg(t('permsTplCreated', 'Template created.'), true); await loadTemplates(d.template_id); }
      else if (d && d.status === 'exists') setTplMsg(t('permsTplExists', 'A template with that name already exists.'), false);
      else setTplMsg(t('permsTplErr', 'Operation failed.'), false);
    } catch (_) { setTplMsg(t('permsTplErr', 'Operation failed.'), false); }
  };

  const deleteTemplate = async () => {
    if (!currentTpl || currentTpl.template_id == null) return;
    if (currentTpl.is_system) { setTplMsg(t('permsTplDeleteSystem', 'System templates cannot be deleted.'), false); return; }
    if (!window.confirm(t('permsTplDeleteConfirm', 'Delete this custom template? Users keep their current permissions.'))) return;
    try {
      const d = await postTpl({ op: 'delete', template_id: currentTpl.template_id });
      if (d && d.ok) { setTplMsg(t('permsTplDeleted', 'Template deleted.'), true); await loadTemplates(); }
      else setTplMsg(t('permsTplErr', 'Operation failed.'), false);
    } catch (_) { setTplMsg(t('permsTplErr', 'Operation failed.'), false); }
  };

  const applyTemplateToUsers = async () => {
    if (!currentTpl || currentTpl.template_id == null) { setApplyMsg(t('permsSelectTplFirst', 'Select a template first.'), false); return; }
    const ids = Array.from(applySelected).filter((n) => Number.isFinite(n));
    if (!ids.length) { setApplyMsg(t('permsTplApplyNoUsers', 'Select at least one user.'), false); return; }
    const summary = t('permsTplApplyConfirm', 'Apply template "{name}" to {n} user(s)? This overwrites their custom permissions.')
      .replace('{name}', String(currentTpl.name || '')).replace('{n}', String(ids.length));
    if (!window.confirm(summary)) return;
    setApplyMsg(t('permsSaving', 'Saving…'), true);
    try {
      const d = await postTpl({ op: 'apply', template_id: currentTpl.template_id, login_ids: ids });
      if (d && d.ok) {
        setApplyMsg(t('permsTplApplied', 'Template applied.') + ' (' + (d.count != null ? d.count : ids.length) + ')', true);
        refreshLiveIfAffected(ids);
        applySelected.clear();
        await loadTemplates(currentTpl.template_id);
        if (currentUser && ids.indexOf(Number(currentUser.login_id)) !== -1) loadStoredPerms(currentUser);
      } else setApplyMsg(t('permsTplErr', 'Operation failed.'), false);
    } catch (_) { setApplyMsg(t('permsTplErr', 'Operation failed.'), false); }
  };

  // Permission tab: apply a template to the currently-selected user (reset).
  const applyTplToCurrentUser = async () => {
    if (!permsUserTplSelect) return;
    const tid = Number.parseInt(permsUserTplSelect.value, 10);
    if (!Number.isFinite(tid)) return; // placeholder chosen
    if (!currentUser || currentUser.login_id == null) {
      setMsg(t('permsNoUser', 'Select a user first.'), false);
      permsUserTplSelect.value = '';
      return;
    }
    const tpl = templatesCache.find((x) => String(x.template_id) === String(tid));
    const summary = t('permsApplyTplConfirm', 'Reset {user} to template "{name}"? This overwrites their custom permissions.')
      .replace('{user}', String(currentUser.full_name || currentUser.username))
      .replace('{name}', String(tpl ? tpl.name : ''));
    if (!window.confirm(summary)) { permsUserTplSelect.value = ''; return; }
    setMsg(t('permsSaving', 'Saving…'), true);
    try {
      const d = await postTpl({ op: 'reset', template_id: tid, login_ids: [currentUser.login_id] });
      if (d && d.ok) {
        setMsg(t('permsResetDone', 'User reset to template.'), true);
        await loadStoredPerms(currentUser);
        refreshLiveIfAffected([Number(currentUser.login_id)]);
        if (currentTpl && String(currentTpl.template_id) === String(tid)) await loadTemplate(tid);
      } else setMsg(t('permsSaveErr', 'Could not save permissions.'), false);
    } catch (_) { setMsg(t('permsSaveErr', 'Could not save permissions.'), false); }
    finally { permsUserTplSelect.value = ''; }
  };

  // Tabs
  const setTab = (/** @type {string} */ name) => {
    document.querySelectorAll('.perms-tab').forEach((b) => {
      const on = b.getAttribute('data-perms-tab') === name;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('bg-white', on);
      b.classList.toggle('text-[#042F8D]', on);
      b.classList.toggle('shadow-sm', on);
      b.classList.toggle('text-slate-500', !on);
    });
    document.querySelectorAll('[data-perms-panel]').forEach((p) => {
      p.classList.toggle('hidden', p.getAttribute('data-perms-panel') !== name);
    });
    // The shared footer "Save Permissions / Clear All" act on the per-user
    // grid only; hide them while the Templates tab is active.
    const onTemplates = name === 'templates';
    permsClearAll?.classList.toggle('hidden', onTemplates);
    permsSave?.classList.toggle('hidden', onTemplates);
  };
  document.querySelectorAll('.perms-tab').forEach((b) => {
    b.addEventListener('click', () => setTab(b.getAttribute('data-perms-tab') || 'permissions'));
  });

  let gridBuilt = false;
  let returnToUsersOnClose = false;
  function openPerms(/** @type {string} */ preselect, /** @type {string} */ tab, /** @type {boolean=} */ returnToUsers) {
    if (!permsOverlay) return;
    returnToUsersOnClose = !!returnToUsers;
    if (!gridBuilt) {
      const html = renderGrid() || '';
      if (permsGrid) permsGrid.innerHTML = html;
      if (permsTplGrid) permsTplGrid.innerHTML = html;
      gridBuilt = true;
    }
    permsOverlay.classList.remove('hidden');
    permsOverlay.setAttribute('aria-hidden', 'false');
    setTab('permissions');
    setMsg('', true);
    setTplMsg('', true);
    setApplyMsg('', true);
    applySelected.clear();
    if (permsTplAssignedSearch) permsTplAssignedSearch.value = '';
    if (permsTplUserSearch) permsTplUserSearch.value = '';
    loadUsers(preselect || '');
    loadTemplates();
  }
  const closePerms = () => {
    if (!permsOverlay) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && permsOverlay.contains(active)) active.blur();
    permsOverlay.classList.add('hidden');
    permsOverlay.setAttribute('aria-hidden', 'true');
    if (returnToUsersOnClose) {
      returnToUsersOnClose = false;
      /** @type {any} */ (window).GSSAdmin?.openUsers?.();
    }
  };

  permsUserSelect?.addEventListener('change', onUserChange);
  permsClearAll?.addEventListener('click', () => { clearAll(); setMsg(t('permsCleared', 'All permissions cleared.'), true); });
  permsSave?.addEventListener('click', async () => {
    if (!currentUser || currentUser.login_id == null) { setMsg(t('permsNoUser', 'Select a user first.'), false); return; }
    const items = boxes().filter((c) => c.checked).map((c) => ({ no: c.getAttribute('data-no'), action: c.getAttribute('data-col') }));
    setMsg(t('permsSaving', 'Saving…'), true);
    try {
      const d = await fetch(`${API_BASE}/api/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: currentUser.login_id, items }),
      }).then((r) => r.json());
      if (d && d.ok) {
        setMsg(t('permsSaved', 'Permissions saved.') + ' (' + (d.count != null ? d.count : items.length) + ')', true);
        const sess = (typeof GSSSession !== 'undefined' && GSSSession) ? GSSSession.get() : null;
        const live = /** @type {any} */ (window).GSSPerms;
        if (sess && String(sess.username) === String(currentUser.username) && live && typeof live.refresh === 'function') live.refresh();
      } else {
        setMsg(t('permsSaveErr', 'Could not save permissions.'), false);
      }
    } catch (_) {
      setMsg(t('permsSaveErr', 'Could not save permissions.'), false);
    }
  });
  permsClose?.addEventListener('click', closePerms);
  permsCancel?.addEventListener('click', closePerms);
  permsUserTplSelect?.addEventListener('change', applyTplToCurrentUser);
  permsTplSelect?.addEventListener('change', () => { if (permsTplSelect) loadTemplate(permsTplSelect.value); });
  permsTplClearAll?.addEventListener('click', () => { boxesIn(permsTplGrid).forEach((cb) => { cb.checked = false; }); setTplMsg(t('permsCleared', 'All permissions cleared.'), true); });
  permsTplSave?.addEventListener('click', saveTemplate);
  permsTplCreate?.addEventListener('click', createTemplate);
  permsTplDelete?.addEventListener('click', deleteTemplate);
  permsTplApply?.addEventListener('click', applyTemplateToUsers);
  permsTplAssignedSearch?.addEventListener('input', renderAssignedList);
  permsTplUserSearch?.addEventListener('input', renderApplyList);
  permsTplUserList?.addEventListener('change', (e) => {
    const cb = /** @type {HTMLInputElement} */ (e.target);
    if (!cb || !cb.classList || !cb.classList.contains('perms-tpl-user')) return;
    const id = Number(cb.value);
    if (!Number.isFinite(id)) return;
    if (cb.checked) applySelected.add(id); else applySelected.delete(id);
    updateSelectedCount();
  });
  // Overlay closes only via its explicit Close button (no backdrop/Escape).

  /** @type {any} */ (window).GSSSystemMgmt = {
    openPerms,
    renderInstructorCourses: (/** @type {HTMLElement} */ host, /** @type {any} */ u) => loadCourses(u, host),
  };
})();
