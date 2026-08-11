// @ts-check
/**
 * GSS · Monthly attendance tick sheet
 * ------------------------------------------------------------------
 * A standalone, Tailwind-only modal that lets an Instructor (or Admin)
 * tick daily attendance for the participants of each training they run.
 *
 *   • Role-gated trigger       — the #attSheetBtn button is only shown to
 *                                Admin / Instructor via admin.js `data-role-any`.
 *   • Training-title tabs      — one tab per title the instructor teaches, so
 *                                an instructor with several trainings switches
 *                                between their sheets without leaving the modal.
 *   • Monthly grid             — rows = participants, columns = every day of the
 *                                selected month, a checkbox per day (✔ = present).
 *   • Persistence              — ticks are stored per {title + month} so switching
 *                                tabs / months keeps each sheet's state. A Save
 *                                button flushes to storage (and to the API when a
 *                                backend endpoint becomes available).
 *
 * There is no server model linking instructors to trainings yet, so the list of
 * titles resolves in this order (first hit wins), all behind `getInstructorTitles`
 * for an easy future swap to a real endpoint:
 *   1. session.training_titles  (array on the signed-in user)
 *   2. the Training Title dictionary (category `training_title`) — Admin sees all
 */
(() => {
  'use strict';

  const overlay = document.getElementById('attSheetOverlay');
  const openBtn = document.getElementById('attSheetBtn');
  const closeBtn = document.getElementById('attSheetClose');
  const tabsWrap = document.getElementById('attSheetTabs');
  const tableWrap = document.getElementById('attSheetTableWrap');
  const theadRow = overlay ? overlay.querySelector('#attSheetTable thead tr') : null;
  const tbody = document.getElementById('attSheetBody');
  const emptyEl = document.getElementById('attSheetEmpty');
  const monthInput = /** @type {HTMLInputElement | null} */ (document.getElementById('attSheetMonth'));
  const monthLabel = document.getElementById('attSheetMonthLabel');
  const daysLabel = document.getElementById('attSheetDaysLabel');
  const clearBtn = document.getElementById('attSheetClear');
  const saveBtn = document.getElementById('attSheetSave');

  if (!overlay || !openBtn || !tabsWrap || !tbody || !theadRow || !monthInput) return;

  const STORAGE_PREFIX = 'gss-attsheet:';

  /** @type {{ code: string, label: string }[]} */
  let titles = [];
  /** @type {string} currently active training-title code */
  let activeTitle = '';

  // Only an Instructor may edit (tick / clear / save). Admin and Head of
  // Training can open the sheet but see it strictly read-only.
  const currentRole = () => {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    return session && session.role ? String(session.role) : '';
  };
  const canEdit = () => currentRole() === 'Instructor';

  // ── i18n helper ────────────────────────────────────────────────
  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };
  const lang = () => (document.documentElement.lang === 'fr' ? 'fr' : 'en');

  // ── Date helpers ───────────────────────────────────────────────
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const monthNames = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  };
  const dayInitials = {
    en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    fr: ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'],
  };

  /** @returns {{ year: number, month: number }} zero-based month */
  const currentMonth = () => {
    const v = monthInput.value; // YYYY-MM
    if (v && /^\d{4}-\d{2}$/.test(v)) {
      const [y, m] = v.split('-').map(Number);
      return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  };

  const daysInMonth = (/** @type {number} */ year, /** @type {number} */ month) =>
    new Date(year, month + 1, 0).getDate();

  // ── Resolve the instructor's training titles ───────────────────
  // Fallback: read the Training Title <select> options (kept in sync with the
  // dictionary) so the sheet still works when the API is unreachable.
  const selectTitles = () => {
    const sel = document.getElementById('att-TrainingTitle');
    if (!sel) return [];
    return Array.from(sel.querySelectorAll('option'))
      .map((o) => ({ code: /** @type {HTMLOptionElement} */ (o).value, label: o.textContent || '' }))
      .filter((x) => x.code);
  };

  const dictTitles = () =>
    fetch(`${API_BASE}/api/dictionary?category=training_title`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((data) => {
        const useFr = lang() === 'fr';
        const items = Array.isArray(data.items) ? data.items : [];
        const mapped = items.map((/** @type {any} */ it) => ({
          code: it.code || it.en_title || it.label || '',
          label: (useFr ? it.fr_title : it.en_title) || it.label || it.en_title || it.fr_title || '',
        })).filter((x) => x.code);
        return mapped.length ? mapped : selectTitles();
      })
      .catch(() => selectTitles());

  /**
   * Titles the signed-in user may open. Admin → all dictionary titles.
   * Instructor → the titles assigned on their session (falls back to all).
   * @returns {Promise<{ code: string, label: string }[]>}
   */
  const getInstructorTitles = async () => {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    const role = session && session.role ? String(session.role) : '';
    const all = await dictTitles();

    // A future backend can attach an explicit assignment list to the session.
    const assigned = session && Array.isArray(session.training_titles) ? session.training_titles.map(String) : null;

    if (role === 'Admin' || !assigned || !assigned.length) return all;

    const set = new Set(assigned);
    const filtered = all.filter((x) => set.has(x.code) || set.has(x.label));
    return filtered.length ? filtered : all;
  };

  // ── Participants for a given title ─────────────────────────────
  const SAMPLE_NAMES = ['Amara Okafor', 'James Carter', 'Maya Rodriguez', 'Liam Chen', 'Sophie Dupont', 'Elena Vogt', 'Marcus Tan'];

  const pickTitle = (/** @type {any} */ row) =>
    row && (row.training_title || row.att_training_title || row['att-TrainingTitle'] || row.TrainingTitle || row.training || '');
  const pickName = (/** @type {any} */ row) =>
    (row && (row.full_name || row.FullName || row.name || row.applicant_name)) || '';

  /**
   * @param {string} titleCode
   * @returns {Promise<string[]>}
   */
  const getParticipants = (titleCode) =>
    fetch(`${API_BASE}/api/applicants`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((data) => {
        const rows = Array.isArray(data.applicants) ? data.applicants : [];
        if (!rows.length) return SAMPLE_NAMES.slice();
        const hasTitleField = rows.some((row) => pickTitle(row));
        const filtered = hasTitleField
          ? rows.filter((row) => String(pickTitle(row)) === titleCode)
          : rows;
        const names = filtered.map(pickName).filter(Boolean);
        return names.length ? names : SAMPLE_NAMES.slice();
      })
      .catch(() => SAMPLE_NAMES.slice());

  // ── Tick persistence (per title + month) ───────────────────────
  const storageKey = (/** @type {string} */ titleCode) => {
    const { year, month } = currentMonth();
    return `${STORAGE_PREFIX}${titleCode}:${year}-${pad(month + 1)}`;
  };

  /** @returns {Record<string, Record<string, boolean>>} name → { day → checked } */
  const loadTicks = (/** @type {string} */ titleCode) => {
    try {
      const raw = window.localStorage.getItem(storageKey(titleCode));
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  };

  const saveTicks = (/** @type {string} */ titleCode, /** @type {Record<string, Record<string, boolean>>} */ ticks) => {
    try { window.localStorage.setItem(storageKey(titleCode), JSON.stringify(ticks)); } catch (_) { /* noop */ }
  };

  const collectTicks = () => {
    /** @type {Record<string, Record<string, boolean>>} */
    const ticks = {};
    tbody.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      const cb = /** @type {HTMLInputElement} */ (el);
      const name = cb.dataset.name || '';
      const day = cb.dataset.day || '';
      if (!name || !day) return;
      if (!ticks[name]) ticks[name] = {};
      if (cb.checked) ticks[name][day] = true;
    });
    return ticks;
  };

  // ── Tabs ───────────────────────────────────────────────────────
  const renderTabs = () => {
    tabsWrap.innerHTML = '';
    titles.forEach((title) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.dataset.code = title.code;
      const active = title.code === activeTitle;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.className = active
        ? 'rounded-full bg-[#042F8D] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition'
        : 'rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#042F8D] hover:text-[#042F8D]';
      btn.textContent = title.label || title.code;
      btn.addEventListener('click', () => {
        if (activeTitle === title.code) return;
        activeTitle = title.code;
        renderTabs();
        renderGrid();
      });
      tabsWrap.appendChild(btn);
    });
  };

  // ── Grid (participants × days) ─────────────────────────────────
  const renderGrid = async () => {
    const { year, month } = currentMonth();
    const total = daysInMonth(year, month);
    const li = dayInitials[lang()];

    // Footer meta
    if (monthLabel) monthLabel.textContent = `${monthNames[lang()][month]} ${year}`;
    if (daysLabel) daysLabel.textContent = String(total);

    // Header: Name + one column per day
    theadRow.innerHTML =
      `<th class="sticky left-0 z-10 whitespace-nowrap rounded-tl-2xl border-b-2 border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">${t('attSheetColName', 'Name')}</th>`;
    for (let d = 1; d <= total; d++) {
      const weekday = new Date(year, month, d).getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const th = document.createElement('th');
      th.className = `w-10 min-w-10 border-b-2 border-slate-200 px-1 py-2 text-center text-[11px] font-semibold ${isWeekend ? 'bg-slate-200/70 text-slate-500' : 'bg-slate-100 text-slate-600'}`;
      th.innerHTML = `${d}<span class="mt-0.5 block text-[9px] font-normal text-slate-400">${li[weekday]}</span>`;
      theadRow.appendChild(th);
    }

    if (!activeTitle) {
      tbody.innerHTML = '';
      return;
    }

    const [names, ticks] = [await getParticipants(activeTitle), loadTicks(activeTitle)];
    const editable = canEdit();

    tbody.innerHTML = '';
    names.forEach((name) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/60';
      const nameTd = document.createElement('td');
      nameTd.className = 'sticky left-0 z-10 whitespace-nowrap border-r border-slate-100 bg-white px-4 py-2 text-left font-medium text-slate-800';
      nameTd.textContent = name;
      tr.appendChild(nameTd);

      for (let d = 1; d <= total; d++) {
        const td = document.createElement('td');
        const weekday = new Date(year, month, d).getDay();
        const isWeekend = weekday === 0 || weekday === 6;
        td.className = `px-1 py-1.5 text-center ${isWeekend ? 'bg-slate-50/60' : ''}`;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = editable
          ? 'h-4 w-4 cursor-pointer rounded border-slate-300 accent-[#0a6b3c] transition hover:scale-110'
          : 'h-4 w-4 cursor-not-allowed rounded border-slate-300 accent-[#0a6b3c] opacity-90';
        cb.dataset.name = name;
        cb.dataset.day = String(d);
        cb.setAttribute('aria-label', `${name} · ${d}`);
        cb.checked = !!(ticks[name] && ticks[name][d]);
        if (editable) {
          cb.addEventListener('change', () => saveTicks(activeTitle, collectTicks()));
        } else {
          cb.disabled = true;
        }
        td.appendChild(cb);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
  };

  // Toggle the editing affordances based on the signed-in role.
  const applyEditMode = () => {
    const editable = canEdit();
    if (clearBtn) clearBtn.classList.toggle('hidden', !editable);
    if (saveBtn) saveBtn.classList.toggle('hidden', !editable);

    // A small "view only" badge for read-only roles (Admin / Head of Training).
    let badge = document.getElementById('attSheetReadonly');
    if (!editable) {
      if (!badge && saveBtn && saveBtn.parentElement) {
        badge = document.createElement('span');
        badge.id = 'attSheetReadonly';
        badge.className = 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500';
        badge.setAttribute('data-i18n', 'attSheetViewOnly');
        badge.textContent = t('attSheetViewOnly', 'View only');
        saveBtn.parentElement.appendChild(badge);
      } else if (badge) {
        badge.textContent = t('attSheetViewOnly', 'View only');
        badge.classList.remove('hidden');
      }
    } else if (badge) {
      badge.classList.add('hidden');
    }
  };

  // ── Open / close ───────────────────────────────────────────────
  const isOpen = () => !overlay.classList.contains('hidden');

  const open = async () => {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    applyEditMode();

    if (!monthInput.value) {
      const now = new Date();
      monthInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    }

    titles = await getInstructorTitles();
    const hasTitles = titles.length > 0;
    if (emptyEl) emptyEl.classList.toggle('hidden', hasTitles);
    if (tableWrap) tableWrap.classList.toggle('hidden', !hasTitles);

    if (!hasTitles) { tabsWrap.innerHTML = ''; tbody.innerHTML = ''; return; }
    if (!activeTitle || !titles.some((x) => x.code === activeTitle)) activeTitle = titles[0].code;
    renderTabs();
    renderGrid();
  };

  const close = () => {
    // Persist the current sheet before leaving (Instructor only).
    if (activeTitle && canEdit()) saveTicks(activeTitle, collectTicks());
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  };

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });

  monthInput.addEventListener('change', () => { if (isOpen()) renderGrid(); });

  clearBtn?.addEventListener('click', () => {
    if (!canEdit()) return;
    tbody.querySelectorAll('input[type="checkbox"]').forEach((el) => { /** @type {HTMLInputElement} */ (el).checked = false; });
    if (activeTitle) saveTicks(activeTitle, collectTicks());
  });

  saveBtn?.addEventListener('click', () => {
    if (!activeTitle || !canEdit()) return;
    saveTicks(activeTitle, collectTicks());
    const original = saveBtn.textContent;
    saveBtn.textContent = t('attSheetSaved', 'Saved ✓');
    saveBtn.setAttribute('disabled', 'true');
    window.setTimeout(() => { saveBtn.textContent = original; saveBtn.removeAttribute('disabled'); }, 1400);
  });

  // Re-render labels/day names when the language changes while open.
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => { if (isOpen()) { renderTabs(); renderGrid(); } })
  );
})();
