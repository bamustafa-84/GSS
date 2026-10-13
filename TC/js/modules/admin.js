// @ts-check
/**
 * GSS · Admin & role features
 * ------------------------------------------------------------------
 * Loaded on tc.html. Responsibilities:
 *   • Notifications — pending-interview bell + secretary work-queue bell; both
 *                     open the applicant grid pre-filtered (via window.GSSGrid).
 *   • Manage Users  — admin-only modal to list / create / edit accounts and
 *                     enable/disable them and change roles.
 *
 * Feature access gating is NOT done here: every button/panel is governed by the
 * Permission Matrix via `data-perm` + GSSPerms (see js/global.js). The only
 * role still read below is for the admin-bootstrap user-management UI itself.
 */
(() => {
  'use strict';

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
  // Removed: feature visibility is now driven entirely by the Permission
  // Matrix (`data-perm` + GSSPerms in js/global.js). The `role` value above is
  // retained only for the admin-bootstrap Manage Users UI below.

  // ── Notifications (pending interviews + secretary queue) ───────
  const setBadge = (/** @type {string} */ id, /** @type {number} */ n) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('hidden', !(n > 0));
  };

  // Single bell: visible when the role may see at least one alert; the red
  // counter sums the alerts the user is permitted to see.
  const updateBellSummary = () => {
    const wrap = document.getElementById('notifWrap');
    const pRow = document.getElementById('pendingBell');
    const sRow = document.getElementById('secretaryBell');
    const pVis = !!pRow && !pRow.classList.contains('hidden');
    const sVis = !!sRow && !sRow.classList.contains('hidden');
    const visibleItems = (pVis ? 1 : 0) + (sVis ? 1 : 0);
    const anyVis = visibleItems > 0;
    if (wrap) wrap.classList.toggle('hidden', !anyVis);

    // Dropdown chevron only when the bell groups two or more alerts.
    const chevron = document.getElementById('notifChevron');
    if (chevron) chevron.classList.toggle('hidden', visibleItems < 2);

    const count = (/** @type {string} */ id) => {
      const b = document.getElementById(id);
      const n = b ? parseInt(b.textContent || '0', 10) : 0;
      return Number.isFinite(n) ? n : 0;
    };
    const total = (pVis ? count('pendingBadge') : 0) + (sVis ? count('secretaryBadge') : 0);
    const bellBadge = document.getElementById('notifBadge');
    if (bellBadge) {
      bellBadge.textContent = total > 99 ? '99+' : String(total);
      bellBadge.classList.toggle('hidden', !(total > 0));
    }
    // Tint the bell light-red while any pending/secretary item needs action.
    const notifBell = document.getElementById('notifBell');
    if (notifBell) {
      const needsAction = total > 0;
      notifBell.classList.toggle('text-red-400', needsAction);
      notifBell.classList.toggle('text-[#042F8D]', !needsAction);
    }
    const empty = document.getElementById('notifEmpty');
    if (empty) empty.classList.toggle('hidden', !anyVis || total > 0);
  };

  // Matrix check for a feature (central GSSPerms service); false until loaded.
  const permitted = (/** @type {string} */ section, /** @type {string} */ action) => {
    const gp = /** @type {any} */ (window).GSSPerms;
    return !!(gp && gp.loaded && gp.canSection(section, action));
  };

  const refreshCounts = async () => {
    const pendingBell = document.getElementById('pendingBell');
    const secretaryBell = document.getElementById('secretaryBell');
    try {
      if (pendingBell && !pendingBell.classList.contains('hidden') && permitted('10.4', 'view')) {
        const d = await fetch(`${API_BASE}/api/applicants/pending`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
        setBadge('pendingBadge', Number(d && d.count) || 0);
      }
      if (secretaryBell && !secretaryBell.classList.contains('hidden') && permitted('10.5', 'view')) {
        const d = await fetch(`${API_BASE}/api/applicants/secretary-queue`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
        setBadge('secretaryBadge', Number(d && d.count) || 0);
      }
    } catch (_) { /* server may be down */ }
    updateBellSummary();
  };

  const wireNotifications = () => {
    const pendingBell = document.getElementById('pendingBell');
    const secretaryBell = document.getElementById('secretaryBell');
    const notifBell = document.getElementById('notifBell');
    const notifMenu = document.getElementById('notifMenu');

    // Dropdown open/close for the single bell.
    const closeMenu = () => {
      notifMenu?.classList.add('hidden');
      notifBell?.setAttribute('aria-expanded', 'false');
    };
    if (notifBell && notifMenu) {
      notifBell.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = notifMenu.classList.contains('hidden');
        notifMenu.classList.toggle('hidden', !willOpen);
        notifBell.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
      document.addEventListener('click', (e) => {
        if (!notifMenu.classList.contains('hidden') &&
            !notifMenu.contains(/** @type {Node} */ (e.target)) &&
            !notifBell.contains(/** @type {Node} */ (e.target))) {
          closeMenu();
        }
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    }

    pendingBell?.addEventListener('click', () => {
      closeMenu();
      if (!permitted('10.4', 'view')) return;
      const grid = /** @type {any} */ (window).GSSGrid;
      if (grid && typeof grid.filterByPredicate === 'function') {
        grid.filterByPredicate('registration', (rec) => String((rec && rec.interview_result) || 'Pending') === 'Pending');
      }
    });

    secretaryBell?.addEventListener('click', async () => {
      closeMenu();
      if (!permitted('10.5', 'view')) return;
      const grid = /** @type {any} */ (window).GSSGrid;
      if (!grid || typeof grid.filterByPredicate !== 'function') return;
      let ids = new Set();
      try {
        const d = await fetch(`${API_BASE}/api/applicants/secretary-queue`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
        (d && Array.isArray(d.applicants) ? d.applicants : []).forEach((a) => ids.add(Number(a.candidate_no)));
      } catch (_) { /* noop */ }
      grid.filterByPredicate('registration', (rec) => ids.has(Number(rec.candidate_no)));
    });
  };

  // ── Manage Users ───────────────────────────────────────────────
  const usersOverlay = document.getElementById('usersOverlay');
  const usersTitle = document.getElementById('usersTitle');
  const usersBtn = document.getElementById('openUsersBtn');
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
  const userPasswordConfirm = /** @type {HTMLInputElement | null} */ (document.getElementById('userPasswordConfirm'));
  const userCredsSection = document.getElementById('userCredsSection');
  const userStatus = /** @type {HTMLSelectElement | null} */ (document.getElementById('userStatus'));
  const userMustChange = /** @type {HTMLInputElement | null} */ (document.getElementById('userMustChange'));
  const userCancel = document.getElementById('userCancel');
  const userFormStatus = document.getElementById('userFormStatus');
  const usersSearch = /** @type {HTMLInputElement | null} */ (document.getElementById('usersSearch'));
  const usersListView = document.getElementById('usersListView');
  const userStatusField = document.getElementById('userStatusField');
  const userPermsSectionWrap = document.getElementById('userPermsSectionWrap');
  const userCoursesSection = document.getElementById('userCoursesSection');
  const userCoursesHost = document.getElementById('userCoursesHost');
  const userEmail = /** @type {HTMLInputElement | null} */ (document.getElementById('userEmail'));
  const userEmailErr = document.getElementById('userEmailErr');
  const userNotifyField = document.getElementById('userNotifyField');
  const userNotifyEmail = /** @type {HTMLInputElement | null} */ (document.getElementById('userNotifyEmail'));
  const userPwHint = document.getElementById('userPwHint');
  const userConfirmPwField = document.getElementById('userConfirmPwField');
  const userPasswordReq = document.getElementById('userPasswordReq');
  const userPasswordLabel = document.getElementById('userPasswordLabel');
  const userPhotoInput = /** @type {HTMLInputElement | null} */ (document.getElementById('userPhotoInput'));
  const userPhotoImg = /** @type {HTMLImageElement | null} */ (document.getElementById('userPhotoImg'));
  const userPhotoPlaceholder = document.getElementById('userPhotoPlaceholder');
  const userPhotoRemove = document.getElementById('userPhotoRemove');
  const userPhotoErr = document.getElementById('userPhotoErr');

  /** @type {any[]} */ let usersCache = [];
  /** @type {any} */ let editingUser = null;
  // Pending profile-image state for the open form:
  //   dataUrl  — a newly chosen image (base64 data URL) to upload, or null.
  //   cleared  — true when the user removed an existing avatar.
  /** @type {{ dataUrl: string | null, cleared: boolean }} */
  let userPhotoState = { dataUrl: null, cleared: false };

  const AVATAR_ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const AVATAR_MAX_BYTES = 1024 * 1024; // 1 MB

  /** Show the chosen/existing avatar in the form preview (or the placeholder). */
  const setPhotoPreview = (/** @type {string | null} */ src) => {
    if (userPhotoImg) {
      if (src) { userPhotoImg.src = src; userPhotoImg.classList.remove('hidden'); }
      else { userPhotoImg.removeAttribute('src'); userPhotoImg.classList.add('hidden'); }
    }
    userPhotoPlaceholder?.classList.toggle('hidden', !!src);
    userPhotoRemove?.classList.toggle('hidden', !src);
  };

  /** Build a cache-bustable avatar stream URL for a username. */
  const avatarUrl = (/** @type {string} */ username, /** @type {any} */ ver) =>
    `${API_BASE}/api/me/avatar?username=${encodeURIComponent(String(username || ''))}&v=${encodeURIComponent(String(ver || 0))}`;

  /** Read a File into a base64 data URL. */
  const fileToDataUrl = (/** @type {File} */ file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read_failed'));
    reader.readAsDataURL(file);
  });

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

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmail = (/** @type {string} */ v) => {
    const s = String(v || '').trim();
    return s.length > 0 && s.length <= 255 && EMAIL_RE.test(s);
  };
  // "Notify by Email" is only offered when a valid address is present.
  const syncNotifyField = () => {
    const valid = isValidEmail(userEmail ? userEmail.value : '');
    userNotifyField?.classList.toggle('hidden', !valid);
    if (!valid && userNotifyEmail) userNotifyEmail.checked = false;
  };

  const openUsers = () => {
    if (!usersOverlay) return;
    usersOverlay.classList.remove('hidden');
    usersOverlay.setAttribute('aria-hidden', 'false');
    if (usersSearch) usersSearch.value = '';
    hideForm();
    loadUsers();
  };
  const closeUsers = () => {
    if (!usersOverlay) return;
    usersOverlay.classList.add('hidden');
    usersOverlay.setAttribute('aria-hidden', 'true');
  };

  const hideForm = () => {
    editingUser = null;
    userForm?.classList.add('hidden');
    if (userForm) userForm.reset();
    userPhotoState = { dataUrl: null, cleared: false };
    setPhotoPreview(null);
    if (userPhotoErr) userPhotoErr.classList.add('hidden');
    userCoursesSection?.classList.add('hidden');
    usersListView?.classList.remove('hidden');
    // Header search + Add belong to the listing view only.
    usersSearch?.parentElement?.classList.remove('hidden');
    usersAddBtn?.classList.remove('hidden');
    if (usersTitle) { usersTitle.setAttribute('data-i18n', 'usersTitle'); usersTitle.textContent = t('usersTitle', 'Manage Users'); }
    setFormStatus('', true);
  };

  // Show/hide the Instructor "Courses" section from the current form values.
  const syncCoursesSection = () => {
    if (!userCoursesSection) return;
    const isEdit = !!(userId && userId.value);
    const roleVal = userRole ? String(userRole.value || '') : '';
    const show = isEdit && roleVal.trim().toLowerCase() === 'instructor';
    userCoursesSection.classList.toggle('hidden', !show);
    if (show && userCoursesHost) {
      const u = { full_name: userFullName ? userFullName.value : '', role: roleVal };
      /** @type {any} */ (window).GSSSystemMgmt?.renderInstructorCourses?.(userCoursesHost, u);
    }
  };

  const showForm = (/** @type {any} */ user) => {
    if (!userForm) return;
    editingUser = user || null;
    const isEdit = !!user;
    userForm.classList.remove('hidden');
    setFormStatus('', true);
    if (usersTitle) {
      const key = isEdit ? 'usersEditUser' : 'usersAddNew';
      usersTitle.setAttribute('data-i18n', key);
      usersTitle.textContent = t(key, isEdit ? 'Edit User' : 'Add New User');
    }
    if (userId) userId.value = user ? String(user.login_id) : '';
    if (userUsername) { userUsername.value = user ? String(user.username || '') : ''; userUsername.disabled = false; }
    if (userFullName) userFullName.value = user ? String(user.full_name || '') : '';
    if (userRole) userRole.value = user ? String(user.role || 'Candidate') : 'Candidate';
    if (userStatus) userStatus.value = (user ? user.is_active !== false : true) ? 'enabled' : 'disabled';
    if (userEmail) userEmail.value = user ? String(user.email || '') : '';
    if (userEmailErr) userEmailErr.classList.add('hidden');
    // Restore the saved "notify by email" preference (default off for new users).
    if (userNotifyEmail) userNotifyEmail.checked = !!(user && user.notify_email);
    // Reset the profile-image picker, then show the existing avatar (if any).
    userPhotoState = { dataUrl: null, cleared: false };
    if (userPhotoInput) userPhotoInput.value = '';
    if (userPhotoErr) userPhotoErr.classList.add('hidden');
    setPhotoPreview(user && user.has_avatar ? avatarUrl(user.username, user.avatar_ver) : null);
    // Credentials section shows for both create and edit, but the labelling and
    // required-ness differ: on edit the password is optional ("Change Password").
    if (userCredsSection) userCredsSection.style.display = '';
    if (userMustChange) userMustChange.checked = user ? user.must_change_password === true : true;
    if (userPassword) userPassword.value = '';
    if (userPasswordConfirm) userPasswordConfirm.value = '';
    if (userPasswordLabel) userPasswordLabel.setAttribute('data-i18n', isEdit ? 'userChangePw' : 'usersPassword');
    if (userPasswordLabel) userPasswordLabel.textContent = isEdit ? t('userChangePw', 'Change Password') : t('usersPassword', 'Password');
    userPasswordReq?.classList.toggle('hidden', isEdit);
    userPwHint?.classList.toggle('hidden', !isEdit);
    userConfirmPwField?.classList.toggle('hidden', isEdit);
    // Add mode is a focused create form: no Status, no Role & Permissions, no grid.
    userStatusField?.classList.toggle('hidden', !isEdit);
    userPermsSectionWrap?.classList.toggle('hidden', !isEdit);
    // The listing (search + empty state) is hidden whenever the form is open.
    usersListView?.classList.add('hidden');
    usersSearch?.parentElement?.classList.add('hidden');
    usersAddBtn?.classList.add('hidden');
    syncNotifyField();
    syncCoursesSection();
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
      const locked = u.is_locked === true;
      const statusPill = active
        ? `<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">${t('usersEnabled', 'Enabled')}</span>`
        : `<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">${t('usersDisabled', 'Disabled')}</span>`;
      const lockPill = locked
        ? ` <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">${t('usersLocked', 'Locked')}</span>`
        : '';
      tr.innerHTML =
        `<td class="px-3 py-2 align-middle font-semibold text-slate-800">${esc(u.username)}</td>` +
        `<td class="px-3 py-2 align-middle text-slate-700">${esc(u.full_name || '')}</td>` +
        `<td class="px-3 py-2 align-middle text-slate-700">${esc(roleLabel(u.role))}</td>` +
        `<td class="px-3 py-2 align-middle">${statusPill}${lockPill}</td>`;

      const actions = document.createElement('td');
      actions.className = 'px-3 py-2 align-middle';
      const wrap = document.createElement('div');
      wrap.className = 'flex items-center justify-end gap-2';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-[#042F8D] transition hover:border-[#042F8D] hover:bg-[#042F8D]/10';
      editBtn.textContent = t('dictEdit', 'Edit');
      editBtn.addEventListener('click', () => showForm(u));

      const permsBtn = document.createElement('button');
      permsBtn.type = 'button';
      permsBtn.className = 'inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-[#042F8D] transition hover:border-[#042F8D] hover:bg-[#042F8D]/10';
      permsBtn.textContent = t('usersPermissions', 'Permissions');
      permsBtn.addEventListener('click', () => {
        closeUsers();
        /** @type {any} */ (window).GSSSystemMgmt?.openPerms?.(String(u.username || ''), 'permissions', true);
      });

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition ' +
        (active ? 'border-red-200 text-red-600 hover:border-red-500 hover:bg-red-50'
                : 'border-emerald-200 text-emerald-600 hover:border-emerald-500 hover:bg-emerald-50');
      toggleBtn.textContent = active ? t('usersDisable', 'Disable') : t('usersEnable', 'Enable');
      toggleBtn.addEventListener('click', () => updateUser({ login_id: u.login_id, is_active: !active }, true));

      wrap.appendChild(editBtn);
      wrap.appendChild(permsBtn);
      if (locked) {
        const unlockBtn = document.createElement('button');
        unlockBtn.type = 'button';
        unlockBtn.className = 'inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 px-2.5 text-xs font-semibold text-amber-600 transition hover:border-amber-500 hover:bg-amber-50';
        unlockBtn.textContent = t('usersUnlock', 'Unlock');
        unlockBtn.addEventListener('click', () => updateUser({ login_id: u.login_id, unlock: true }, true));
        wrap.appendChild(unlockBtn);
      }
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
      const d = await fetch(`${API_BASE}/api/users`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      usersCache = Array.isArray(d.users) ? d.users : [];
      renderFilteredUsers();
      setUsersStatus('', true);
    } catch (_) {
      usersCache = [];
      renderFilteredUsers();
      setUsersStatus(t('usersLoadErr', 'Could not load users. Is the server running?'), false);
    }
  };

  // Client-side filter over the cached list (username / full name / role).
  const renderFilteredUsers = () => {
    const q = (usersSearch && usersSearch.value ? usersSearch.value : '').trim().toLowerCase();
    const filtered = !q ? usersCache : usersCache.filter((u) => (
      [u.username, u.full_name, u.role, roleLabel(u.role)]
        .some((x) => String(x || '').toLowerCase().includes(q))
    ));
    renderUsers(filtered);
  };

  const updateUser = async (/** @type {Record<string, any>} */ payload, /** @type {boolean} */ fromRow) => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const msg = data.status === 'exists' ? t('usersErrExists', 'That username is already taken.')
          : data.status === 'invalid_email' ? t('usersEmailInvalid', 'Please enter a valid email address.')
          : data.status === 'weak' ? t('usersErrPw', 'Password must be at least 8 characters.')
          : (data.status === 'invalid_image' || data.status === 'invalid_image_type') ? t('usersPhotoBadType', 'Please choose a PNG, JPG, WEBP or GIF image.')
          : data.status === 'image_too_large' ? t('usersPhotoTooBig', 'Image is too large (max 1 MB).')
          : t('usersErrSave', 'Could not save the user.');
        if (fromRow) setUsersStatus(msg, false); else setFormStatus(msg, false);
        return false;
      }
      // If the admin edited their own account's avatar, refresh the header chip.
      try {
        const savedUser = data.user || {};
        const sess = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
        const savedName = String(savedUser.username || payload.username || '').toLowerCase();
        if (sess && savedName && String(sess.username || '').toLowerCase() === savedName) {
          if (typeof GSSSession !== 'undefined' && GSSSession.update) {
            GSSSession.update({ has_avatar: !!savedUser.has_avatar, avatar_ver: savedUser.avatar_ver });
          }
          /** @type {any} */ (window).GSSChip?.applyAvatar?.();
        }
      } catch (_) { /* noop */ }
      // Surface the email-notification outcome without blocking the save result.
      const note = data.notification;
      let okMsg = t('usersSavedOk', 'User saved.');
      if (note && note.attempted) {
        if (note.sent) okMsg += ' ' + t('usersNotifySent', 'Notification email sent.');
        else okMsg += ' ' + t('usersNotifyFailed', 'User saved, but the email could not be sent.');
      }
      if (!fromRow) { setFormStatus(okMsg, true); hideForm(); }
      else setUsersStatus(okMsg, true);
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
      const isActive = !(userStatus && userStatus.value === 'disabled');
      const emailVal = userEmail ? userEmail.value.trim() : '';
      const notify = !!(userNotifyEmail && userNotifyEmail.checked);
      const lang = (document.documentElement.getAttribute('lang') || 'en').toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en';

      if (!username) { setFormStatus(t('usersErrUsername', 'A username is required.'), false); return; }
      if (emailVal && !isValidEmail(emailVal)) {
        if (userEmailErr) userEmailErr.classList.remove('hidden');
        setFormStatus(t('usersEmailInvalid', 'Please enter a valid email address.'), false);
        return;
      }

      if (id != null) {
        const password = userPassword ? userPassword.value : '';
        if (password && password.length < 8) { setFormStatus(t('usersErrPw', 'Password must be at least 8 characters.'), false); return; }
        const mustChange = !!(userMustChange && userMustChange.checked);
        /** @type {Record<string, any>} */
        const payload = { login_id: id, username, full_name: fullName, role: roleVal, is_active: isActive, email: emailVal, must_change_password: mustChange, notify, notify_email: notify, lang };
        if (password) payload.password = password;
        if (userPhotoState.dataUrl) payload.profile_image = userPhotoState.dataUrl;
        else if (userPhotoState.cleared) payload.clear_profile_image = true;
        await updateUser(payload, false);
      } else {
        const password = userPassword ? userPassword.value : '';
        const confirm = userPasswordConfirm ? userPasswordConfirm.value : '';
        if (password.length < 8) { setFormStatus(t('usersErrPw', 'Password must be at least 8 characters.'), false); return; }
        if (password !== confirm) { setFormStatus(t('usersErrPwMatch', 'Passwords do not match.'), false); return; }
        const mustChange = !userMustChange || userMustChange.checked;
        /** @type {Record<string, any>} */
        const payload = { username, full_name: fullName, role: roleVal, password, mustChange, email: emailVal, notify, notify_email: notify, lang };
        if (userPhotoState.dataUrl) payload.profile_image = userPhotoState.dataUrl;
        await updateUser(payload, false);
      }
    });
  }

  usersBtn?.addEventListener('click', openUsers);
  usersClose?.addEventListener('click', closeUsers);
  usersRefresh?.addEventListener('click', loadUsers);
  usersAddBtn?.addEventListener('click', () => showForm(null));
  usersSearch?.addEventListener('input', renderFilteredUsers);
  userRole?.addEventListener('change', syncCoursesSection);
  userEmail?.addEventListener('input', () => { userEmailErr?.classList.add('hidden'); syncNotifyField(); });
  userCancel?.addEventListener('click', hideForm);

  // Profile-image picker: validate type/size, preview, and stage for upload.
  userPhotoInput?.addEventListener('change', async () => {
    const file = userPhotoInput.files && userPhotoInput.files[0];
    const showPhotoErr = (/** @type {string} */ msg) => {
      if (userPhotoErr) { userPhotoErr.textContent = msg; userPhotoErr.classList.remove('hidden'); }
    };
    if (userPhotoErr) userPhotoErr.classList.add('hidden');
    if (!file) return;
    if (!AVATAR_ALLOWED.includes(file.type)) {
      userPhotoInput.value = '';
      showPhotoErr(t('usersPhotoBadType', 'Please choose a PNG, JPG, WEBP or GIF image.'));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      userPhotoInput.value = '';
      showPhotoErr(t('usersPhotoTooBig', 'Image is too large (max 1 MB).'));
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      userPhotoState = { dataUrl, cleared: false };
      setPhotoPreview(dataUrl);
    } catch (_) {
      userPhotoInput.value = '';
      showPhotoErr(t('usersPhotoReadErr', 'Could not read the selected image.'));
    }
  });

  // Remove the avatar: clear the preview and stage a removal on save.
  userPhotoRemove?.addEventListener('click', () => {
    if (userPhotoInput) userPhotoInput.value = '';
    userPhotoState = { dataUrl: null, cleared: true };
    if (userPhotoErr) userPhotoErr.classList.add('hidden');
    setPhotoPreview(null);
  });
  // Overlay closes only via its explicit Close button (no backdrop/Escape).

  // ── Init ───────────────────────────────────────────────────────
  // Reconcile a possibly-stale session role with the live value in the DB so
  // admin features appear correctly without forcing a re-login.
  const refreshRoleFromServer = async () => {
    const s = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    if (!s || !s.username) return;
    try {
      const d = await fetch(`${API_BASE}/api/me?username=${encodeURIComponent(s.username)}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (d && d.ok) {
        // Keep the header avatar in sync with the live account (shows an image
        // uploaded from another session on the very next page load).
        if (d.has_avatar !== s.has_avatar || d.avatar_ver !== s.avatar_ver) {
          if (typeof GSSSession !== 'undefined' && GSSSession.update) {
            GSSSession.update({ has_avatar: !!d.has_avatar, avatar_ver: d.avatar_ver });
          }
          try { /** @type {any} */ (window).GSSChip?.applyAvatar?.(); } catch (_) { /* noop */ }
        }
        if (d.role && d.role !== role) {
          role = String(d.role);
          if (typeof GSSSession !== 'undefined' && GSSSession.update) GSSSession.update({ role: role, full_name: d.full_name });
          refreshCounts();
          try { /** @type {any} */ (window).GSSSysMgmt?.applyAdminVisibility?.(); } catch (_) { /* noop */ }
          try { /** @type {any} */ (window).GSSChip?.applyRoleBadge(role); } catch (_) { /* noop */ }
        }
      }
    } catch (_) { /* server may be down */ }
  };

  const init = () => {
    wireNotifications();
    refreshCounts();
    refreshRoleFromServer();
    const gp = /** @type {any} */ (window).GSSPerms;
    if (gp && gp.ready) gp.ready.then(refreshCounts);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Let other modules refresh the notification counts after data changes.
  /** @type {any} */ (window).GSSAdmin = { refreshCounts, openUsers, closeUsers, get role() { return role; } };
})();
