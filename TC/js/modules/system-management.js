// @ts-check
/**
 * GSS · System Management
 * ------------------------------------------------------------------
 * Loaded on tc.html (Admin only). Responsibilities:
 *   • Toolbar dropdown — "System Management" button revealing two entries:
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
  const COLS = ['view', 'add', 'edit', 'delete', 'approve', 'print', 'export'];

  // Section colour themes (group cell + row tint).
  const THEME = {
    blue:  { group: 'bg-[#042F8D]/10 text-[#042F8D]', row: 'bg-sky-50/40' },
    red:   { group: 'bg-red-100 text-red-600',        row: 'bg-red-50/40' },
    amber: { group: 'bg-amber-100 text-amber-600',    row: 'bg-amber-50/40' },
    pink:  { group: 'bg-pink-100 text-pink-600',      row: 'bg-pink-50/40' },
    green: { group: 'bg-emerald-100 text-emerald-600', row: 'bg-emerald-50/40' },
  };

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
  /** @type {Array<{n:number,title:string,color:keyof typeof THEME,icon:string,rows:Array<{no:string,label:string,remark:string}>}>} */
  const SECTIONS = [
    { n: 1, title: 'Registration', color: 'blue', icon: ICON.clipboard, rows: [
      { no: '1.1', label: 'Registration Information', remark: 'Register and update information of trainees and courses.' },
      { no: '1.2', label: 'Registration Templates', remark: 'Manage registration templates.' },
    ] },
    { n: 2, title: 'Courses', color: 'blue', icon: ICON.calendar, rows: [
      { no: '2.1', label: 'Course Schedule', remark: 'Create and update course schedules.' },
      { no: '2.2', label: 'Course Calendar', remark: 'Manage course and room schedules.' },
    ] },
    { n: 3, title: 'Groups', color: 'blue', icon: ICON.users, rows: [
      { no: '3.1', label: 'Groups', remark: 'Create and update trainer groups.' },
      { no: '3.2', label: 'Classes', remark: 'Manage training classes.' },
    ] },
    { n: 4, title: 'Instructors', color: 'blue', icon: ICON.teacher, rows: [
      { no: '4.1', label: 'Instructor Information', remark: 'Manage instructor information.' },
      { no: '4.2', label: 'Instructor Availability', remark: 'Manage instructor availability.' },
    ] },
    { n: 5, title: 'Attendance', color: 'blue', icon: ICON.check, rows: [
      { no: '5.1', label: 'Attendance Entry', remark: 'Each instructor may register and update attendance only for assigned courses.' },
      { no: '5.2', label: 'Attendance History', remark: 'View attendance history for assigned courses.' },
    ] },
    { n: 6, title: 'Exam Results', color: 'red', icon: ICON.file, rows: [
      { no: '6.1', label: 'Candidate Information', remark: 'Display candidate information.' },
      { no: '6.2', label: 'Exam Result', remark: 'Enter and update exam results.' },
      { no: '6.3', label: "Instructor's Observations", remark: 'Enter and update observations.' },
      { no: '6.4', label: 'Validation', remark: 'Final approval is restricted to Admin and Head of Training.' },
    ] },
    { n: 7, title: 'Evaluation', color: 'amber', icon: ICON.chart, rows: [
      { no: '7.1', label: 'Candidate Information', remark: 'Display candidate information.' },
      { no: '7.2', label: 'Evaluation Result', remark: 'Enter and update evaluation results.' },
      { no: '7.3', label: "Instructor's Observations", remark: 'Enter and update observations.' },
      { no: '7.4', label: 'Signatures', remark: 'Sign only evaluations assigned to you.' },
    ] },
    { n: 8, title: 'Measurements', color: 'pink', icon: ICON.ruler, rows: [
      { no: '8.1', label: 'Candidate Information', remark: 'Display candidate information.' },
      { no: '8.2', label: 'Measurements', remark: 'Enter and update measurements.' },
      { no: '8.3', label: "Instructor's Observations", remark: 'Enter and update observations.' },
    ] },
    { n: 9, title: 'Management', color: 'red', icon: ICON.gear, rows: [
      { no: '9.1', label: 'User Management', remark: 'Restricted to Administration only.' },
      { no: '9.2', label: 'Manage Approvals', remark: 'Restricted to Administration only.' },
    ] },
    { n: 10, title: 'System Features', color: 'green', icon: ICON.lock, rows: [
      { no: '10.1', label: 'Reports', remark: 'Access to reports.' },
      { no: '10.2', label: 'Backup & Restore', remark: 'Restricted to Administration only.' },
      { no: '10.3', label: 'Data Import', remark: 'Restricted to Administration only.' },
      { no: '10.4', label: 'Data Export', remark: 'Restricted to Administration only.' },
      { no: '10.5', label: 'Personal Data', remark: 'View and update own personal data.' },
      { no: '10.6', label: 'Attendance Sheet', remark: 'Record attendance for assigned courses only.' },
      { no: '10.7', label: 'Manage Libraries', remark: 'Manage libraries.' },
    ] },
  ];

  // Instructor defaults mirror the reference example.
  /** @type {Record<string, string[]>} */
  const INSTRUCTOR = {
    '1.1': ['view', 'add', 'edit', 'print'], '1.2': ['view', 'add', 'print'],
    '2.1': ['view', 'add', 'edit', 'print'], '2.2': ['view', 'add', 'print'],
    '3.1': ['view', 'add', 'edit', 'print'], '3.2': ['view', 'add', 'print'],
    '4.1': ['view'], '4.2': ['view'],
    '5.1': ['view', 'add', 'edit', 'delete', 'approve', 'print'], '5.2': ['view', 'print'],
    '6.1': ['view'], '6.2': ['view', 'add', 'edit'], '6.3': ['view', 'add', 'edit'], '6.4': ['view'],
    '7.1': ['view'], '7.2': ['view', 'add', 'edit'], '7.3': ['view', 'add', 'edit'], '7.4': ['view', 'add'],
    '8.1': [], '8.2': [], '8.3': [],
    '9.1': [], '9.2': [],
    '10.1': [], '10.2': [], '10.3': [], '10.4': [], '10.5': ['view', 'edit'], '10.6': ['view', 'add', 'edit', 'print'], '10.7': [],
  };

  /** Returns a function(no) -> string[] of default granted columns for a role. */
  const defaultsForRole = (/** @type {string} */ role) => {
    const r = String(role || '').toLowerCase();
    const all = COLS.slice();
    if (r === 'admin') return () => all.slice();
    if (r === 'instructor') return (/** @type {string} */ no) => (INSTRUCTOR[no] || []).slice();
    if (r === 'head of training') {
      return (/** @type {string} */ no) => {
        const base = ['view', 'print', 'export'];
        if (no === '6.4' || no === '9.2') base.push('approve');
        if (/^6\.|^7\./.test(no)) base.push('add', 'edit');
        return base;
      };
    }
    if (r === 'secretary') {
      return (/** @type {string} */ no) => {
        if (/^1\.|^2\.|^3\./.test(no)) return ['view', 'add', 'edit', 'print'];
        if (no === '10.1' || no === '10.6') return ['view', 'print'];
        return ['view'];
      };
    }
    // Candidate / unknown → no staff access.
    return () => [];
  };

  // ── Elements ───────────────────────────────────────────────────
  const $ = (/** @type {string} */ id) => document.getElementById(id);
  const sysWrap = $('sysMgmtWrap');
  const sysBtn = $('sysMgmtBtn');
  const sysMenu = $('sysMgmtMenu');
  const openUsersBtn = $('openUsersBtn');
  const openPermsBtn = $('openPermsBtn');
  const userViewPermsBtn = $('userViewPermsBtn');

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
  const permsLoadDefault = $('permsLoadDefault');
  const permsClearAll = $('permsClearAll');
  const permsSave = $('permsSave');
  const permsStatusMsg = $('permsStatusMsg');

  /** @type {any[]} */ let usersCache = [];
  /** @type {any} */ let currentUser = null;

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
  const closeMenu = () => {
    sysMenu?.classList.add('hidden');
    sysBtn?.setAttribute('aria-expanded', 'false');
  };
  const toggleMenu = () => {
    if (!sysMenu) return;
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
    /** @type {any} */ (window).GSSAdmin?.openUsers?.();
  });
  openPermsBtn?.addEventListener('click', () => { closeMenu(); openPerms(); });
  userViewPermsBtn?.addEventListener('click', () => {
    const uname = /** @type {HTMLInputElement | null} */ (document.getElementById('userUsername'));
    /** @type {any} */ (window).GSSAdmin?.closeUsers?.();
    openPerms(uname && uname.value ? uname.value.trim() : '');
  });

  // ── Permissions modal ──────────────────────────────────────────
  const renderGrid = () => {
    if (!permsGrid) return;
    let html = '';
    SECTIONS.forEach((sec) => {
      const theme = THEME[sec.color];
      sec.rows.forEach((row, idx) => {
        html += `<tr class="${theme.row} border-t border-slate-100">`;
        if (idx === 0) {
          html += `<td rowspan="${sec.rows.length}" class="w-[190px] border-r border-slate-100 p-2 align-top ${theme.group}">` +
            `<div class="flex items-start gap-2">` +
              `<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70">${svg(sec.icon)}</span>` +
              `<span class="leading-tight"><span class="block text-base font-extrabold">${sec.n}.</span>` +
              `<span class="block text-[13px] font-bold">${esc(sec.title)}</span></span>` +
            `</div></td>`;
        }
        html += `<td class="whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-500">${esc(row.no)}</td>`;
        html += `<td class="whitespace-nowrap px-3 py-2 text-sm font-medium text-slate-700">${esc(row.label)}</td>`;
        COLS.forEach((col) => {
          html += `<td class="px-2 py-2 text-center"><input type="checkbox" data-no="${row.no}" data-col="${col}" class="h-4 w-4 cursor-pointer rounded border-slate-300 accent-[#042F8D]" /></td>`;
        });
        html += `<td class="w-[150px] px-3 py-2 text-xs leading-snug text-slate-500">${esc(row.remark)}</td>`;
        html += '</tr>';
      });
    });
    permsGrid.innerHTML = html;
  };

  /** @returns {HTMLInputElement[]} */
  const boxes = () => Array.from(permsGrid ? permsGrid.querySelectorAll('input[type="checkbox"]') : []);

  const applyDefaults = (/** @type {string} */ role) => {
    const fn = defaultsForRole(role);
    boxes().forEach((cb) => {
      const no = cb.getAttribute('data-no') || '';
      const col = cb.getAttribute('data-col') || '';
      cb.checked = fn(no).includes(col);
    });
  };

  // Apply a stored permission map { "1.1": ["view", …] } to the grid.
  const applyPermMap = (/** @type {Record<string, string[]>} */ map) => {
    const m = map || {};
    boxes().forEach((cb) => {
      const no = cb.getAttribute('data-no') || '';
      const col = cb.getAttribute('data-col') || '';
      cb.checked = Array.isArray(m[no]) && m[no].indexOf(col) !== -1;
    });
  };

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
  const loadCourses = async (/** @type {any} */ u) => {
    const host = document.getElementById('permsCourses');
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

  // Load the user's stored permission set (server falls back to role defaults).
  const loadStoredPerms = async (/** @type {any} */ u) => {
    if (!u || u.login_id == null) { clearAll(); return; }
    try {
      const d = await fetch(`${API_BASE}/api/permissions?login_id=${encodeURIComponent(u.login_id)}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (d && d.ok) applyPermMap(d.permissions || {});
      else applyDefaults(String(u.role || ''));
    } catch (_) { applyDefaults(String(u.role || '')); }
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
    loadCourses(u);
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
    onUserChange();
  };

  const setMsg = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!permsStatusMsg) return;
    permsStatusMsg.textContent = msg;
    permsStatusMsg.className = 'mr-1 min-h-5 text-sm font-semibold ' + (ok ? 'text-emerald-600' : 'text-red-600');
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
  };
  document.querySelectorAll('.perms-tab').forEach((b) => {
    b.addEventListener('click', () => setTab(b.getAttribute('data-perms-tab') || 'permissions'));
  });

  let gridBuilt = false;
  function openPerms(/** @type {string} */ preselect) {
    if (!permsOverlay) return;
    if (!gridBuilt) { renderGrid(); gridBuilt = true; }
    permsOverlay.classList.remove('hidden');
    permsOverlay.setAttribute('aria-hidden', 'false');
    setTab('permissions');
    setMsg('', true);
    loadUsers(preselect || '');
  }
  const closePerms = () => {
    if (!permsOverlay) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && permsOverlay.contains(active)) active.blur();
    permsOverlay.classList.add('hidden');
    permsOverlay.setAttribute('aria-hidden', 'true');
  };

  permsUserSelect?.addEventListener('change', onUserChange);
  permsLoadDefault?.addEventListener('click', () => {
    const u = usersCache.find((x) => String(x.username) === (permsUserSelect ? permsUserSelect.value : ''));
    applyDefaults(u ? String(u.role || '') : '');
    setMsg(t('permsDefaultLoaded', 'Default permissions loaded.'), true);
  });
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
  permsOverlay?.addEventListener('click', (e) => { if (e.target === permsOverlay) closePerms(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && permsOverlay && !permsOverlay.classList.contains('hidden')) closePerms();
  });

  /** @type {any} */ (window).GSSSystemMgmt = { openPerms };
})();
