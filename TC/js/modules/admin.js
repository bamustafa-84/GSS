// @ts-check
/**
 * GSS · Admin & role features
 * ------------------------------------------------------------------
 * Loaded on tc.html. Responsibilities:
 *   • Role gating   — show/hide elements marked `data-role-any` based on the
 *                     signed-in user's role (from GSSSession).
 *   • Notifications — pending-interview bell + secretary work-queue bell; both
 *                     open the applicant grid pre-filtered (via window.GSSGrid).
 *   • Manage Users  — admin-only modal to list / create / edit accounts and
 *                     enable/disable them and change roles.
 */
(() => {
  'use strict';

  const API = (typeof API_BASE === 'string' && API_BASE) ? API_BASE : 'http://localhost:4000';

  const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
  let role = (session && session.role) ? String(session.role) : 'Candidate';

  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };

  // ── Role gating ────────────────────────────────────────────────
  const showEl = (/** @type {HTMLElement} */ el, /** @type {boolean} */ on) => {
    const disp = el.dataset.roleDisplay || (el.tagName === 'FIELDSET' ? 'block' : 'inline-flex');
    if (on) { el.classList.remove('hidden'); el.style.display = disp; }
    else { el.classList.add('hidden'); el.style.display = 'none'; }
  };

  const applyRoleGating = () => {
    document.querySelectorAll('[data-role-any]').forEach((el) => {
      const allowed = (/** @type {HTMLElement} */ (el).dataset.roleAny || '')
        .split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
      showEl(/** @type {HTMLElement} */ (el), allowed.includes(role.toLowerCase()));
    });
  };

  // ── Notifications (pending interviews + secretary queue) ───────
  const setBadge = (/** @type {string} */ id, /** @type {number} */ n) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('hidden', !(n > 0));
  };

  const refreshCounts = async () => {
    const pendingBell = document.getElementById('pendingBell');
    const secretaryBell = document.getElementById('secretaryBell');
    try {
      if (pendingBell && !pendingBell.classList.contains('hidden')) {
        const d = await fetch(`${API}/api/applicants/pending`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
        setBadge('pendingBadge', Number(d && d.count) || 0);
      }
      if (secretaryBell && !secretaryBell.classList.contains('hidden')) {
        const d = await fetch(`${API}/api/applicants/secretary-queue`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
        setBadge('secretaryBadge', Number(d && d.count) || 0);
      }
    } catch (_) { /* server may be down */ }
  };

  const wireNotifications = () => {
    const pendingBell = document.getElementById('pendingBell');
    const secretaryBell = document.getElementById('secretaryBell');

    pendingBell?.addEventListener('click', () => {
      const grid = /** @type {any} */ (window).GSSGrid;
      if (grid && typeof grid.filterByPredicate === 'function') {
        grid.filterByPredicate('registration', (rec) => String((rec && rec.interview_result) || 'Pending') === 'Pending');
      }
    });

    secretaryBell?.addEventListener('click', async () => {
      const grid = /** @type {any} */ (window).GSSGrid;
      if (!grid || typeof grid.filterByPredicate !== 'function') return;
      let ids = new Set();
      try {
        const d = await fetch(`${API}/api/applicants/secretary-queue`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
        (d && Array.isArray(d.applicants) ? d.applicants : []).forEach((a) => ids.add(Number(a.candidate_no)));
      } catch (_) { /* noop */ }
      grid.filterByPredicate('registration', (rec) => ids.has(Number(rec.candidate_no)));
    });
  };

  // ── Manage Users ───────────────────────────────────────────────
  const usersOverlay = document.getElementById('usersOverlay');
  const usersBtn = document.getElementById('usersBtn');
  const usersClose = document.getElementById('usersClose');
  const usersRefresh = document.getElementById('usersRefresh');
  const usersAddBtn = document.getElementById('usersAddBtn');
  const usersTableWrap = document.getElementById('usersTableWrap');
  const usersListEmpty = document.getElementById('usersListEmpty');
  const usersStatus = document.getElementById('usersStatus');
  const userForm = /** @type {HTMLFormElement | null} */ (document.getElementById('userForm'));
  const userId = /** @type {HTMLInputElement | null} */ (document.getElementById('userId'));
  const userUsername = /** @type {HTMLInputElement | null} */ (document.getElementById('userUsername'));
  const userFullName = /** @type {HTMLInputElement | null} */ (document.getElementById('userFullName'));
  const userRole = /** @type {HTMLSelectElement | null} */ (document.getElementById('userRole'));
  const userPassword = /** @type {HTMLInputElement | null} */ (document.getElementById('userPassword'));
  const userPasswordWrap = document.getElementById('userPasswordWrap');
  const userActive = /** @type {HTMLInputElement | null} */ (document.getElementById('userActive'));
  const userCancel = document.getElementById('userCancel');
  const userFormStatus = document.getElementById('userFormStatus');

  const setUsersStatus = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!usersStatus) return;
    usersStatus.textContent = msg;
    usersStatus.className = 'mt-2 min-h-5 text-sm font-semibold ' + (ok ? 'text-emerald-600' : 'text-red-600');
  };
  const setFormStatus = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!userFormStatus) return;
    userFormStatus.textContent = msg;
    userFormStatus.className = 'ml-1 min-h-5 text-sm font-semibold ' + (ok ? 'text-emerald-600' : 'text-red-600');
  };

  const openUsers = () => {
    if (!usersOverlay) return;
    usersOverlay.classList.remove('hidden');
    usersOverlay.setAttribute('aria-hidden', 'false');
    hideForm();
    loadUsers();
  };
  const closeUsers = () => {
    if (!usersOverlay) return;
    usersOverlay.classList.add('hidden');
    usersOverlay.setAttribute('aria-hidden', 'true');
  };

  const hideForm = () => {
    userForm?.classList.add('hidden');
    if (userForm) userForm.reset();
    setFormStatus('', true);
  };
  const showForm = (/** @type {any} */ user) => {
    if (!userForm) return;
    userForm.classList.remove('hidden');
    setFormStatus('', true);
    if (userId) userId.value = user ? String(user.login_id) : '';
    if (userUsername) { userUsername.value = user ? String(user.username || '') : ''; userUsername.disabled = false; }
    if (userFullName) userFullName.value = user ? String(user.full_name || '') : '';
    if (userRole) userRole.value = user ? String(user.role || 'Candidate') : 'Candidate';
    if (userActive) userActive.checked = user ? user.is_active !== false : true;
    // Password is only set when creating a new user.
    if (userPasswordWrap) userPasswordWrap.style.display = user ? 'none' : '';
    if (userPassword) userPassword.value = '';
  };

  const roleLabel = (/** @type {string} */ r) => {
    const map = { 'Admin': 'roleAdmin', 'Head of Training': 'roleHeadOfTraining', 'Secretary': 'roleSecretary', 'Candidate': 'roleCandidate', 'Instructor': 'roleInstructor' };
    return t(map[r] || '', r);
  };

  const renderUsers = (/** @type {any[]} */ users) => {
    if (!usersTableWrap) return;
    usersTableWrap.innerHTML = '';
    if (!users.length) { usersListEmpty?.classList.remove('hidden'); return; }
    usersListEmpty?.classList.add('hidden');

    const table = document.createElement('table');
    table.className = 'w-full border-collapse text-sm';
    table.innerHTML =
      '<thead><tr class="bg-[#042F8D] text-white text-left text-xs font-bold uppercase tracking-wide">' +
      `<th class="px-3 py-2.5">${t('usersUsername', 'Username')}</th>` +
      `<th class="px-3 py-2.5">${t('usersFullName', 'Full name')}</th>` +
      `<th class="px-3 py-2.5">${t('usersRole', 'Role')}</th>` +
      `<th class="px-3 py-2.5">${t('usersStatusCol', 'Status')}</th>` +
      `<th class="px-3 py-2.5 text-right">${t('usersActions', 'Actions')}</th>` +
      '</tr></thead>';
    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-slate-100 bg-white';

    users.forEach((u) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-[#042F8D]/5';
      const active = u.is_active !== false;
      const statusPill = active
        ? `<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">${t('usersEnabled', 'Enabled')}</span>`
        : `<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">${t('usersDisabled', 'Disabled')}</span>`;
      tr.innerHTML =
        `<td class="px-3 py-2 align-middle font-semibold text-slate-800">${esc(u.username)}</td>` +
        `<td class="px-3 py-2 align-middle text-slate-700">${esc(u.full_name || '')}</td>` +
        `<td class="px-3 py-2 align-middle text-slate-700">${esc(roleLabel(u.role))}</td>` +
        `<td class="px-3 py-2 align-middle">${statusPill}</td>`;

      const actions = document.createElement('td');
      actions.className = 'px-3 py-2 align-middle';
      const wrap = document.createElement('div');
      wrap.className = 'flex items-center justify-end gap-2';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-[#042F8D] transition hover:border-[#042F8D] hover:bg-[#042F8D]/10';
      editBtn.textContent = t('dictEdit', 'Edit');
      editBtn.addEventListener('click', () => showForm(u));

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition ' +
        (active ? 'border-red-200 text-red-600 hover:border-red-500 hover:bg-red-50'
                : 'border-emerald-200 text-emerald-600 hover:border-emerald-500 hover:bg-emerald-50');
      toggleBtn.textContent = active ? t('usersDisable', 'Disable') : t('usersEnable', 'Enable');
      toggleBtn.addEventListener('click', () => updateUser({ login_id: u.login_id, is_active: !active }, true));

      wrap.appendChild(editBtn);
      wrap.appendChild(toggleBtn);
      actions.appendChild(wrap);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    usersTableWrap.appendChild(table);
  };

  const esc = (/** @type {any} */ s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  const loadUsers = async () => {
    try {
      const d = await fetch(`${API}/api/users`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      renderUsers(Array.isArray(d.users) ? d.users : []);
      setUsersStatus('', true);
    } catch (_) {
      renderUsers([]);
      setUsersStatus(t('usersLoadErr', 'Could not load users. Is the server running?'), false);
    }
  };

  const updateUser = async (/** @type {Record<string, any>} */ payload, /** @type {boolean} */ fromRow) => {
    try {
      const res = await fetch(`${API}/api/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const msg = data.status === 'exists' ? t('usersErrExists', 'That username is already taken.') : t('usersErrSave', 'Could not save the user.');
        if (fromRow) setUsersStatus(msg, false); else setFormStatus(msg, false);
        return false;
      }
      if (!fromRow) { setFormStatus(t('usersSavedOk', 'User saved.'), true); hideForm(); }
      else setUsersStatus(t('usersSavedOk', 'User saved.'), true);
      loadUsers();
      return true;
    } catch (_) {
      if (fromRow) setUsersStatus(t('usersErrSave', 'Could not save the user.'), false);
      else setFormStatus(t('usersErrSave', 'Could not save the user.'), false);
      return false;
    }
  };

  if (userForm) {
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = userId && userId.value ? Number(userId.value) : null;
      const username = userUsername ? userUsername.value.trim() : '';
      const fullName = userFullName ? userFullName.value.trim() : '';
      const roleVal = userRole ? userRole.value : 'Candidate';
      const isActive = !!(userActive && userActive.checked);

      if (!username) { setFormStatus(t('usersErrUsername', 'A username is required.'), false); return; }

      if (id != null) {
        await updateUser({ login_id: id, username, full_name: fullName, role: roleVal, is_active: isActive }, false);
      } else {
        const password = userPassword ? userPassword.value : '';
        if (password.length < 8) { setFormStatus(t('usersErrPw', 'Password must be at least 8 characters.'), false); return; }
        await updateUser({ username, full_name: fullName, role: roleVal, password, mustChange: true }, false);
      }
    });
  }

  usersBtn?.addEventListener('click', openUsers);
  usersClose?.addEventListener('click', closeUsers);
  usersRefresh?.addEventListener('click', loadUsers);
  usersAddBtn?.addEventListener('click', () => showForm(null));
  userCancel?.addEventListener('click', hideForm);
  usersOverlay?.addEventListener('click', (e) => { if (e.target === usersOverlay) closeUsers(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && usersOverlay && !usersOverlay.classList.contains('hidden')) closeUsers();
  });

  // ── Init ───────────────────────────────────────────────────────
  // Reconcile a possibly-stale session role with the live value in the DB so
  // admin features appear correctly without forcing a re-login.
  const refreshRoleFromServer = async () => {
    const s = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    if (!s || !s.username) return;
    try {
      const d = await fetch(`${API}/api/me?username=${encodeURIComponent(s.username)}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (d && d.ok && d.role && d.role !== role) {
        role = String(d.role);
        if (typeof GSSSession !== 'undefined' && GSSSession.update) GSSSession.update({ role: role, full_name: d.full_name });
        applyRoleGating();
        refreshCounts();
        try { /** @type {any} */ (window).GSSChip?.applyRoleBadge(role); } catch (_) { /* noop */ }
      }
    } catch (_) { /* server may be down */ }
  };

  const init = () => {
    applyRoleGating();
    wireNotifications();
    refreshCounts();
    refreshRoleFromServer();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Let other modules refresh the notification counts after data changes.
  /** @type {any} */ (window).GSSAdmin = { refreshCounts, get role() { return role; } };
})();
