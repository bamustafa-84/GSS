// @ts-check
/// <reference path="../utils/translation.js" />

/**
 * GSS · Monthly attendance tick sheet
 * ------------------------------------------------------------------
 * A standalone, Tailwind-only modal that lets an Instructor (or Admin)
 * tick daily attendance for the participants of each training they run.
 *
 *   • Role-gated trigger       — the #attSheetBtn button is only shown to
 *                                Admin / Instructor / Secretary / Head of
 *                                Training via admin.js `data-role-any`.
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
  const exportBtn = document.getElementById('attSheetExport');
  const tabsWrap = document.getElementById('attSheetTabs');
  const tableWrap = document.getElementById('attSheetTableWrap');
  const theadRow = overlay ? overlay.querySelector('#attSheetTable thead tr') : null;
  const tbody = document.getElementById('attSheetBody');
  const emptyEl = document.getElementById('attSheetEmpty');
  const yearInput = /** @type {HTMLInputElement | null} */ (document.getElementById('attSheetDate'));
  const yearLabel = document.getElementById('attSheetYearLabel');
  const monthLabel = document.getElementById('attSheetMonthLabel');
  const daysLabel = document.getElementById('attSheetDaysLabel');
  const clearBtn = document.getElementById('attSheetClear');
  const saveBtn = document.getElementById('attSheetSave');
  const instructorBar = document.getElementById('attSheetInstructorBar');
  const instructorName = document.getElementById('attSheetInstructorName');
  const rangePills = document.getElementById('attSheetRangePills');

  if (!overlay || !openBtn || !tabsWrap || !tbody || !theadRow || !yearInput) return;

  // Selected year + month (0-based) driving the grid. Defaults to the current
  // month (Part 3); preserved across tab switches once the sheet is open.
  let selectedYear = new Date().getFullYear();
  let selectedMonth = new Date().getMonth();

  /** @type {{ code: string, label: string }[]} */
  let titles = [];
  /** @type {string} currently active training-title code */
  let activeTitle = '';
  /** @type {Record<string, { from: string, to: string, dateFrom: string, dateTo: string, trainer: string }>} title code → default times + date range */
  let trainingMeta = {};

  // Instructor, Admin and Secretary may edit (tick / clear / save). Head of
  // Training can open the sheet but sees it strictly read-only.
  const currentRole = () => {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    return session && session.role ? String(session.role) : '';
  };
  const canEdit = () => ['Instructor', 'Admin', 'Secretary'].includes(currentRole());

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
  const dayNames = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  };

  /** @returns {{ year: number, month: number }} zero-based month */
  const currentMonth = () => ({ year: selectedYear, month: selectedMonth });

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
   * Titles the signed-in user may open. Visibility rule: a user sees only the
   * trainings whose Trainer matches their full name. Admin and Head of Training
   * see every course and instructor (Part 5). The list is sourced from the
   * `training` table so that only titles that actually exist appear.
   * @returns {Promise<{ code: string, label: string }[]>}
   */
  const getInstructorTitles = async () => {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    const role = session && session.role ? String(session.role) : '';
    const fullName = session && session.full_name ? String(session.full_name) : '';
    const canSeeAll = role === 'Admin' || role === 'Head of Training' || role === 'Secretary';

    // Non-privileged roles are restricted to their own trainings (trainer == name).
    const query = canSeeAll || !fullName ? '' : `?trainer=${encodeURIComponent(fullName)}`;

    trainingMeta = {};
    try {
      const data = await fetch(`${API_BASE}/api/training${query}`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json());
      const rows = Array.isArray(data.trainings) ? data.trainings : [];
      // Same title can now appear more than once (different dates/times are
      // separate sessions). Count titles so duplicates can be disambiguated by
      // their date range in the tab label.
      /** @type {Record<string, number>} */
      const titleCounts = {};
      rows.forEach((/** @type {any} */ row) => {
        const tt = row.training_title || '';
        if (tt) titleCounts[tt] = (titleCounts[tt] || 0) + 1;
      });
      // A course is keyed by its training_id (the exact session), not its title.
      const mapped = rows.map((/** @type {any} */ row) => {
        const code = row.training_id != null ? String(row.training_id) : '';
        const title = row.training_title || '';
        if (!code || !title) return { code: '', label: '' };
        trainingMeta[code] = {
          title,
          from: timePart(row.date_from),
          to: timePart(row.date_to),
          dateFrom: row.date_from || '',
          dateTo: row.date_to || '',
          trainer: row.trainer || '',
        };
        const label = titleCounts[title] > 1
          ? `${title} · ${rangeLabel(row.date_from, row.date_to)}`
          : title;
        return { code, label };
      }).filter((x) => x.code);
      if (mapped.length) return mapped;
    } catch (_) { /* fall through to dictionary */ }

    // No training rows: privileged roles still see every dictionary title; a
    // restricted user with no assigned training sees nothing.
    if (!canSeeAll && fullName) return [];
    return dictTitles();
  };

  /** Extract the HH:MM part from an ISO timestamp string. */
  const timePart = (/** @type {any} */ isoTs) => {
    if (!isoTs) return '';
    const m = /T(\d{2}:\d{2})/.exec(String(isoTs));
    if (m) return m[1];
    const d = new Date(isoTs);
    if (!Number.isNaN(d.getTime())) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return '';
  };

  /** DD/MM/YYYY for an ISO date/timestamp string (empty when unparseable). */
  const dmy = (/** @type {any} */ iso) => {
    const s = String(iso || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };

  /** A compact "from → to" date range label used to tell same-title sessions apart. */
  const rangeLabel = (/** @type {any} */ from, /** @type {any} */ to) => {
    const f = dmy(from);
    const tt = dmy(to);
    if (f && tt && f !== tt) return `${f}→${tt}`;
    return f || tt || '';
  };

  // ── Participants for a given title ─────────────────────────────
  /**
   * The students assigned to a training as { id, name } pairs. A student is
   * "assigned" once they have attendance for the training (see training_students).
   * `id` is the candidate_no used to persist attendance.
   * @param {string} titleCode
   * @returns {Promise<{ id: string, name: string }[]>}
   */
  const getParticipants = (code) => {
    const title = (trainingMeta[code] && trainingMeta[code].title) || code;
    return fetch(`${API_BASE}/api/training/students?training_id=${encodeURIComponent(code)}&title=${encodeURIComponent(title)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((data) => (Array.isArray(data.students) ? data.students : [])
        .map((/** @type {any} */ s) => ({ id: s.candidate_no != null ? String(s.candidate_no) : '', name: s.full_name || '' }))
        .filter((p) => p.id && p.name))
      .catch(() => []);
  };

  /**
   * Keep only the titles that actually have at least one assigned student, so
   * empty courses never appear in the overlay. Empty courses are also pruned
   * from `trainingMeta` so the month picker ignores them.
   * @param {{ code: string, label: string }[]} list
   * @returns {Promise<{ code: string, label: string }[]>}
   */
  const filterTitlesWithStudents = async (list) => {
    const counts = await Promise.all(
      list.map((x) => getParticipants(x.code).then((p) => p.length).catch(() => 0))
    );
    const kept = list.filter((_, i) => counts[i] > 0);
    const keepCodes = new Set(kept.map((x) => x.code));
    Object.keys(trainingMeta).forEach((code) => {
      if (!keepCodes.has(code)) delete trainingMeta[code];
    });
    return kept;
  };

  // ── Attendance data store (DB-backed, per title + month) ──────
  // records[candidateNo][day] = { status, arrival, departure, observation }
  /** @type {Record<string, Record<string, { status: string, arrival: string, departure: string, observation: string }>>} */
  let records = {};

  const pad2 = pad;

  /** ISO date (YYYY-MM-DD) for a given day of the active month. */
  const isoForDay = (/** @type {number} */ day) => {
    const { year, month } = currentMonth();
    return `${year}-${pad2(month + 1)}-${pad2(day)}`;
  };

  /**
   * True when a day of the active month falls within the active training's
   * From/To date range (inclusive of both endpoints). Days outside the range
   * are locked (non-editable).
   * @param {number} day
   */
  const isDayInTrainingRange = (day) => {
    const meta = trainingMeta[activeTitle];
    if (!meta) return false;
    const fromIso = String(meta.dateFrom || '').slice(0, 10);
    if (!fromIso) return false;
    const toIso = String(meta.dateTo || '').slice(0, 10) || fromIso;
    const iso = isoForDay(day);
    return iso >= fromIso && iso <= toIso;
  };

  /** Default status for a brand-new cell. */
  const DEFAULT_STATUS = 'AH';

  /** Is a status one that counts as "present" (shows a tick)? */
  const isPresent = (/** @type {string} */ status) => status === 'AH' || status === 'AR';

  /** Default arrival/departure times for the active training (from the From/To). */
  const defaultTimes = () => {
    const meta = trainingMeta[activeTitle] || { from: '', to: '' };
    return { arrival: meta.from || '', departure: meta.to || '' };
  };

  /**
   * Load every attendance cell for the active title + month into `records`,
   * keyed by candidate_no.
   * @param {string} titleCode
   */
  const loadRecords = async (titleCode) => {
    records = {};
    if (!titleCode) return;
    const { year, month } = currentMonth();
    const from = `${year}-${pad2(month + 1)}-01`;
    const to = `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`;
    const title = (trainingMeta[titleCode] && trainingMeta[titleCode].title) || titleCode;
    try {
      const data = await fetch(
        `${API_BASE}/api/attendance?training_id=${encodeURIComponent(titleCode)}&title=${encodeURIComponent(title)}&from=${from}&to=${to}`,
        { headers: { Accept: 'application/json' } }
      ).then((r) => r.json());
      const rows = Array.isArray(data.attendance) ? data.attendance : [];
      rows.forEach((/** @type {any} */ row) => {
        const id = row.candidate_no != null ? String(row.candidate_no) : '';
        const dayMatch = /-(\d{2})$/.exec(String(row.attendance_date || ''));
        const day = dayMatch ? String(Number(dayMatch[1])) : '';
        if (!id || !day) return;
        if (!records[id]) records[id] = {};
        records[id][day] = {
          status: row.status || DEFAULT_STATUS,
          arrival: row.arrival_time || '',
          departure: row.departure_time || '',
          observation: row.observation || '',
        };
      });
    } catch (_) { /* offline → empty sheet */ }
  };

  /**
   * Persist a single cell to the DB (upsert), or delete it when `cell` is null.
   * No-op for participants without a candidate_no (sample fallback rows).
   * @param {string} id candidate_no
   * @param {number} day
   * @param {{ status: string, arrival: string, departure: string, observation: string } | null} cell
   */
  const saveCell = (id, day, cell) => {
    if (!id) return Promise.resolve();
    const title = (trainingMeta[activeTitle] && trainingMeta[activeTitle].title) || activeTitle;
    const body = cell
      ? {
          candidate_no: id,
          training_id: activeTitle,
          training_title: title,
          att_date: isoForDay(day),
          status: cell.status,
          arrival_time: cell.arrival,
          departure_time: cell.departure,
          observation: cell.observation,
        }
      : {
          candidate_no: id,
          training_id: activeTitle,
          training_title: title,
          att_date: isoForDay(day),
          delete: true,
        };
    return fetch(`${API_BASE}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => { /* best-effort */ });
  };

  // ── Tabs ───────────────────────────────────────────────────────

  /** A course is "completed" once its training end date is before today. */
  const isCompleted = (/** @type {string} */ code) => {
    const meta = trainingMeta[code];
    if (!meta || !meta.dateTo) return false;
    const end = new Date(meta.dateTo);
    if (Number.isNaN(end.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return end < today;
  };

  // ── Year picker + 12-month picker (colour-coded by course state) ──

  /** Distinct years that have courses, plus the current year, ascending. */
  const availableYears = () => {
    /** @type {Set<number>} */
    const set = new Set();
    set.add(new Date().getFullYear());
    Object.keys(trainingMeta).forEach((code) => {
      const meta = trainingMeta[code];
      [meta && meta.dateFrom, meta && meta.dateTo].forEach((d) => {
        if (!d) return;
        const dt = new Date(d);
        if (!Number.isNaN(dt.getTime())) set.add(dt.getFullYear());
      });
    });
    return Array.from(set).sort((a, b) => a - b);
  };

  /** Does a course's date span cover the given year + month (0-based)? */
  const courseCoversMonth = (/** @type {string} */ code, /** @type {number} */ year, /** @type {number} */ m) => {
    const meta = trainingMeta[code];
    if (!meta || !meta.dateFrom) return false;
    const start = new Date(meta.dateFrom);
    if (Number.isNaN(start.getTime())) return false;
    const end = meta.dateTo ? new Date(meta.dateTo) : start;
    const last = Number.isNaN(end.getTime()) ? start : end;
    const ym = `${year}-${pad(m + 1)}`;
    const startYM = `${start.getFullYear()}-${pad(start.getMonth() + 1)}`;
    const endYM = `${last.getFullYear()}-${pad(last.getMonth() + 1)}`;
    return ym >= startYM && ym <= endYM;
  };

  /** The course codes scheduled in a given year + month (Part 2). */
  const codesForMonth = (/** @type {number} */ year, /** @type {number} */ m) =>
    Object.keys(trainingMeta).filter((code) => courseCoversMonth(code, year, m));

  /**
   * Classify a month of a year by the courses scheduled in it:
   *   'active'    → at least one ongoing course overlaps the month (orange)
   *   'completed' → only finished courses overlap the month (green)
   *   'none'      → no course overlaps the month (grey)
   * @returns {'active'|'completed'|'none'}
   */
  const monthState = (/** @type {number} */ year, /** @type {number} */ m) => {
    const codes = codesForMonth(year, m);
    if (!codes.length) return 'none';
    return codes.some((code) => !isCompleted(code)) ? 'active' : 'completed';
  };

  /** Base colour classes for a month pill by its course state. */
  const monthStateClasses = (/** @type {'active'|'completed'|'none'} */ state) => {
    switch (state) {
      case 'active': return 'bg-orange-100 text-orange-700 ring-1 ring-orange-300 hover:bg-orange-200';
      case 'completed': return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-200';
      // 'none' months are dimmed and disabled (Part 4).
      default: return 'bg-slate-50 text-slate-300 ring-1 ring-slate-200 cursor-not-allowed opacity-60';
    }
  };

  /** Reflect the selected year in the date picker + its visible label. */
  const syncYearControl = () => {
    if (yearLabel) yearLabel.textContent = String(selectedYear);
    if (yearInput) {
      // Keep the underlying date within the selected year and bound the picker
      // to the years that actually have courses.
      const years = availableYears();
      yearInput.min = `${years[0]}-01-01`;
      yearInput.max = `${years[years.length - 1]}-12-31`;
      const cur = yearInput.value ? new Date(yearInput.value) : null;
      if (!cur || cur.getFullYear() !== selectedYear) {
        yearInput.value = `${selectedYear}-${pad(selectedMonth + 1)}-01`;
      }
    }
  };

  /**
   * Render the year control + the 12 month pills for the selected year,
   * colour-coded by course state. Months without courses are disabled (Part 4).
   */
  const applyMonthRange = () => {
    const years = availableYears();
    if (!years.includes(selectedYear)) selectedYear = years[years.length - 1];
    syncYearControl();

    if (!rangePills) return;
    rangePills.innerHTML = '';
    for (let m = 0; m < 12; m++) {
      const state = monthState(selectedYear, m);
      const disabled = state === 'none';
      const selected = m === selectedMonth;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.dataset.month = String(m);
      pill.disabled = disabled;
      pill.className = `rounded-lg px-2 py-1 text-[11px] font-semibold transition ${monthStateClasses(state)} ${selected ? 'outline outline-2 outline-offset-1 outline-[#042F8D]' : ''}`;
      pill.textContent = (monthNames[lang()][m] || '').slice(0, 3);
      pill.title = `${monthNames[lang()][m]} ${selectedYear}`;
      if (!disabled) {
        pill.addEventListener('click', () => {
          if (m === selectedMonth) return;
          selectedMonth = m;
          applyMonthRange();
          renderTabs();
          renderGrid();
        });
      }
      rangePills.appendChild(pill);
    }
  };

  const renderTabs = () => {
    tabsWrap.innerHTML = '';
    // Part 2: only the courses scheduled in the selected month are shown.
    const visibleCodes = new Set(codesForMonth(selectedYear, selectedMonth));
    const visible = titles.filter((x) => visibleCodes.has(x.code));

    // Keep the active tab valid for this month (or fall back to the first one).
    if (!visible.some((x) => x.code === activeTitle)) {
      activeTitle = visible.length ? visible[0].code : '';
    }

    visible.forEach((title) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.dataset.code = title.code;
      const active = title.code === activeTitle;
      const done = isCompleted(title.code);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) {
        btn.className = `rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition ${done ? 'bg-[#0a6b3c] ring-2 ring-emerald-300' : 'bg-[#042F8D]'}`;
      } else if (done) {
        btn.className = 'rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-500 hover:bg-emerald-100';
      } else {
        btn.className = 'rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#042F8D] hover:text-[#042F8D]';
      }
      btn.textContent = (done ? '✓ ' : '') + (title.label || title.code);
      if (done) btn.title = t('attSheetCompleted', 'Completed course');
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

  /** Localized status label for a code (uses PRES_STATUS_OPTS from translations). */
  const statusLabel = (/** @type {string} */ status) => {
    try {
      const opts = /** @type {any} */ (typeof PRES_STATUS_OPTS !== 'undefined' ? PRES_STATUS_OPTS : null);
      const list = opts && (opts[lang()] || opts.en);
      const found = list && list.find((/** @type {any} */ o) => o.value === status);
      if (found) return found.text;
    } catch (_) { /* noop */ }
    return status;
  };

  /** Visual classes for a cell button by status (present = tick). */
  const cellClasses = (/** @type {string} */ status) => {
    switch (status) {
      case 'AH': return 'bg-emerald-50 text-emerald-700 ring-emerald-300';
      case 'AR': return 'bg-amber-50 text-amber-700 ring-amber-300';
      case 'ABS': return 'bg-red-50 text-red-600 ring-red-300';
      case 'EX': return 'bg-slate-100 text-slate-500 ring-slate-300';
      default: return 'bg-white text-slate-300 ring-slate-200';
    }
  };

  /** Glyph shown inside a cell button. Present statuses show a tick; the
   *  status meaning is conveyed by colour and explained in the legend below. */
  const cellGlyph = (/** @type {string} */ status) => {
    switch (status) {
      case 'AH': return '✓';
      case 'AR': return '✓';
      default: return '';
    }
  };

  /** Repaint one cell button from the current `records` state. */
  const paintCell = (/** @type {HTMLButtonElement} */ btn) => {
    const key = btn.dataset.key || '';
    const day = btn.dataset.day || '';
    const cell = records[key] && records[key][day];
    const status = cell ? cell.status : '';
    btn.textContent = cellGlyph(status);
    const inRange = isDayInTrainingRange(Number(day));
    const stateClass = inRange
      ? (canEdit() ? 'cursor-pointer hover:scale-110' : 'cursor-default opacity-95')
      : 'cursor-not-allowed opacity-30';
    btn.className = `mx-auto flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ring-1 transition ${cellClasses(status)} ${stateClass}`;
    btn.disabled = !inRange || !canEdit();
    btn.setAttribute('aria-label', `${btn.dataset.name || ''} · ${day}${status ? ' · ' + status : ''}`);
    if (cell && cell.observation) btn.title = cell.observation;
    else if (!inRange) btn.title = t('attSheetOutsideRange', 'Outside the training date range');
    else btn.removeAttribute('title');
  };

  /** Sync a day-column header checkbox with whether all its students are present. */
  const syncDayHeader = (/** @type {number} */ day) => {
    const cb = /** @type {HTMLInputElement | null} */ (theadRow.querySelector(`input[data-day-all="${day}"]`));
    if (!cb) return;
    const buttons = Array.from(tbody.querySelectorAll(`button[data-day="${day}"]`));
    const keys = buttons.map((b) => /** @type {HTMLElement} */ (b).dataset.key || '');
    const allPresent = keys.length > 0 && keys.every((k) => {
      const c = records[k] && records[k][String(day)];
      return c && isPresent(c.status);
    });
    cb.checked = allPresent;
  };

  const renderGrid = async () => {
    const { year, month } = currentMonth();
    const total = daysInMonth(year, month);
    const li = dayInitials[lang()];
    const editable = canEdit();

    // No course scheduled in the selected month → show an empty-state message.
    if (!activeTitle) {
      if (tableWrap) tableWrap.classList.add('hidden');
      if (instructorBar) { instructorBar.classList.add('hidden'); instructorBar.classList.remove('flex'); }
      if (emptyEl) {
        emptyEl.textContent = t('attSheetNoCoursesMonth', 'No courses scheduled for this month.');
        emptyEl.classList.remove('hidden');
      }
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableWrap) tableWrap.classList.remove('hidden');

    // Footer meta
    if (monthLabel) monthLabel.textContent = `${monthNames[lang()][month]} ${year}`;
    if (daysLabel) daysLabel.textContent = String(total);

    // Instructor assigned to the selected training.
    const trainer = (trainingMeta[activeTitle] && trainingMeta[activeTitle].trainer) || '';
    if (instructorBar && instructorName) {
      instructorName.textContent = trainer || '—';
      instructorBar.classList.toggle('hidden', !activeTitle);
      if (activeTitle) instructorBar.classList.add('flex');
      else instructorBar.classList.remove('flex');
    }

    // Header: Name + one column per day (with a select-all checkbox per day).
    theadRow.innerHTML =
      `<th class="sticky left-0 z-10 whitespace-nowrap rounded-tl-2xl border-b-2 border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">${t('attSheetColName', 'Name')}</th>`;
    for (let d = 1; d <= total; d++) {
      const weekday = new Date(year, month, d).getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const th = document.createElement('th');
      th.className = `w-10 min-w-10 border-b-2 border-slate-200 px-1 py-2 text-center text-[11px] font-semibold ${isWeekend ? 'bg-[#042F8D]/10 text-[#042F8D]' : 'bg-slate-100 text-slate-600'}`;

      const label = document.createElement('div');
      label.innerHTML = `${d}<span class="mt-0.5 block text-[9px] font-normal ${isWeekend ? 'text-[#042F8D]/60' : 'text-slate-400'}">${li[weekday]}</span>`;
      th.appendChild(label);

      // Part 4: per-day select/deselect all students.
      const all = document.createElement('input');
      all.type = 'checkbox';
      all.dataset.dayAll = String(d);
      all.className = 'mt-1 h-3.5 w-3.5 rounded border-slate-300 accent-[#0a6b3c]';
      all.title = t('attSheetSelectAllDay', 'Select/deselect all students for this day');
      all.setAttribute('aria-label', `${t('attSheetSelectAllDay', 'Select all')} · ${d}`);
      if (!editable || !isDayInTrainingRange(d)) all.disabled = true;
      else all.addEventListener('change', () => toggleDay(d, all.checked));
      th.appendChild(all);

      theadRow.appendChild(th);
    }

    if (!activeTitle) {
      tbody.innerHTML = '';
      return;
    }

    await loadRecords(activeTitle);
    const participants = await getParticipants(activeTitle);

    tbody.innerHTML = '';
    participants.forEach((p) => {
      const key = p.id || ('n:' + p.name);
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/60';
      const nameTd = document.createElement('td');
      nameTd.className = 'sticky left-0 z-10 whitespace-nowrap border-r border-slate-100 bg-white px-4 py-2 text-left font-medium text-slate-800';
      nameTd.textContent = p.name;
      tr.appendChild(nameTd);

      for (let d = 1; d <= total; d++) {
        const td = document.createElement('td');
        const weekday = new Date(year, month, d).getDay();
        const isWeekend = weekday === 0 || weekday === 6;
        td.className = `px-1 py-1.5 text-center ${isWeekend ? 'bg-[#042F8D]/[0.05]' : ''}`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.key = key;
        btn.dataset.cand = p.id;
        btn.dataset.name = p.name;
        btn.dataset.day = String(d);
        paintCell(btn);
        if (editable && isDayInTrainingRange(d)) btn.addEventListener('click', () => openCellEditor(key, p.id, p.name, d));
        else btn.disabled = true;
        td.appendChild(btn);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });

    for (let d = 1; d <= total; d++) syncDayHeader(d);
  };

  // ── Part 4: tick / untick every student for one day ─────────────
  const toggleDay = async (/** @type {number} */ day, /** @type {boolean} */ checked) => {
    if (!canEdit() || !activeTitle) return;
    if (!isDayInTrainingRange(day)) return;
    const { arrival, departure } = defaultTimes();
    const buttons = Array.from(tbody.querySelectorAll(`button[data-day="${day}"]`));
    const jobs = [];
    buttons.forEach((el) => {
      const btn = /** @type {HTMLButtonElement} */ (el);
      const key = btn.dataset.key || '';
      const id = btn.dataset.cand || '';
      if (!key) return;
      if (checked) {
        const existing = records[key] && records[key][String(day)];
        const cell = {
          status: DEFAULT_STATUS,
          arrival: existing ? existing.arrival || arrival : arrival,
          departure: existing ? existing.departure || departure : departure,
          observation: existing ? existing.observation || '' : '',
        };
        if (!records[key]) records[key] = {};
        records[key][String(day)] = cell;
        jobs.push(saveCell(id, day, cell));
      } else if (records[key] && records[key][String(day)]) {
        delete records[key][String(day)];
        jobs.push(saveCell(id, day, null));
      }
      paintCell(btn);
    });
    await Promise.all(jobs);
  };

  // ── Cell editor modal ──────────────────────────────────────────
  const cellOverlay = document.getElementById('attCellOverlay');
  const cellStatus = /** @type {HTMLSelectElement | null} */ (document.getElementById('attCellStatus'));
  const cellArrival = /** @type {HTMLInputElement | null} */ (document.getElementById('attCellArrival'));
  const cellDeparture = /** @type {HTMLInputElement | null} */ (document.getElementById('attCellDeparture'));
  const cellObs = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('attCellObs'));
  const cellMeta = document.getElementById('attCellMeta');
  const cellSave = document.getElementById('attCellSave');
  const cellReset = document.getElementById('attCellReset');
  const cellCancel = document.getElementById('attCellCancel');
  const cellClose = document.getElementById('attCellClose');

  /** @type {{ key: string, id: string, name: string, day: number } | null} */
  let editing = null;

  const closeCellEditor = () => {
    editing = null;
    if (cellOverlay) {
      cellOverlay.classList.add('hidden');
      cellOverlay.setAttribute('aria-hidden', 'true');
    }
  };

  /**
   * Open the editor for a single cell, pre-filled from the stored record or the
   * training defaults (status AH, arrival = From time, departure = To time).
   * @param {string} key   in-memory record key
   * @param {string} id    candidate_no (empty for sample rows)
   * @param {string} name  display name
   * @param {number} day
   */
  const openCellEditor = (key, id, name, day) => {
    if (!cellOverlay || !cellStatus || !cellArrival || !cellDeparture || !cellObs) return;
    if (!isDayInTrainingRange(day)) return;
    editing = { key, id, name, day };
    const existing = records[key] && records[key][String(day)];
    const defaults = defaultTimes();

    cellStatus.value = existing ? existing.status : DEFAULT_STATUS;
    cellArrival.value = existing && existing.arrival ? existing.arrival : defaults.arrival;
    cellDeparture.value = existing && existing.departure ? existing.departure : defaults.departure;
    cellObs.value = existing ? existing.observation : '';
    const weekday = new Date(selectedYear, selectedMonth, day).getDay();
    const dayName = (dayNames[lang()] || dayNames.en)[weekday];
    if (cellMeta) cellMeta.textContent = `${name} · ${dayName} · ${isoForDay(day)}`;

    cellOverlay.classList.remove('hidden');
    cellOverlay.setAttribute('aria-hidden', 'false');
    cellStatus.focus();
  };

  const commitCellEditor = async () => {
    if (!editing || !cellStatus || !cellArrival || !cellDeparture || !cellObs) return;
    const { key, id, day } = editing;
    const cell = {
      status: cellStatus.value || DEFAULT_STATUS,
      arrival: cellArrival.value || '',
      departure: cellDeparture.value || '',
      observation: cellObs.value || '',
    };
    if (!records[key]) records[key] = {};
    records[key][String(day)] = cell;

    const btn = /** @type {HTMLButtonElement | null} */ (tbody.querySelector(`button[data-key="${cssEscape(key)}"][data-day="${day}"]`));
    if (btn) paintCell(btn);
    syncDayHeader(day);
    closeCellEditor();
    await saveCell(id, day, cell);
  };

  /** Minimal CSS.escape fallback for attribute selectors. */
  const cssEscape = (/** @type {string} */ v) => {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(v);
    return String(v).replace(/["\\]/g, '\\$&');
  };

  /** Remove an incorrectly selected value: clear the cell + delete it in the DB. */
  const resetCellEditor = async () => {
    if (!editing) return;
    const { key, id, day } = editing;
    if (records[key]) delete records[key][String(day)];
    const btn = /** @type {HTMLButtonElement | null} */ (tbody.querySelector(`button[data-key="${cssEscape(key)}"][data-day="${day}"]`));
    if (btn) paintCell(btn);
    syncDayHeader(day);
    closeCellEditor();
    await saveCell(id, day, null);
  };

  cellSave?.addEventListener('click', commitCellEditor);
  cellReset?.addEventListener('click', resetCellEditor);
  cellCancel?.addEventListener('click', closeCellEditor);
  cellClose?.addEventListener('click', closeCellEditor);
  // The cell editor closes only via its Close/Cancel buttons (or Save) —
  // clicking the backdrop or pressing Escape is intentionally disabled so an
  // in-progress edit isn't dismissed by accident.
  // document.addEventListener('keydown', (e) => {
  //   if (e.key === 'Escape' && cellOverlay && !cellOverlay.classList.contains('hidden')) closeCellEditor();
  // });

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

    // Default to the current month (Part 3).
    const now = new Date();
    selectedYear = now.getFullYear();
    selectedMonth = now.getMonth();

    titles = await getInstructorTitles();
    // Only surface courses that have at least one student.
    titles = await filterTitlesWithStudents(titles);
    const hasTitles = titles.length > 0;

    if (!hasTitles) {
      if (emptyEl) {
        emptyEl.textContent = t('attSheetNoTitles', 'No training titles are assigned to you yet.');
        emptyEl.classList.remove('hidden');
      }
      if (tableWrap) tableWrap.classList.add('hidden');
      tabsWrap.innerHTML = '';
      tbody.innerHTML = '';
      if (instructorBar) { instructorBar.classList.add('hidden'); instructorBar.classList.remove('flex'); }
      if (rangePills) rangePills.innerHTML = '';
      if (yearLabel) yearLabel.textContent = String(selectedYear);
      return;
    }
    // Render the year picker + colour-coded 12-month picker, then the tabs/grid
    // for the current month (renderTabs picks a valid activeTitle for it).
    applyMonthRange();
    renderTabs();
    renderGrid();
  };

  const close = () => {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  };

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  // The attendance sheet closes only via the Close button — clicking the
  // backdrop or pressing Escape is intentionally disabled to avoid losing the
  // current view/selection by accident.

  // Year picked from the (year-only) date picker → re-render everything.
  yearInput.addEventListener('change', () => {
    if (!isOpen() || !yearInput.value) return;
    const y = new Date(yearInput.value).getFullYear();
    if (Number.isFinite(y)) selectedYear = y;
    applyMonthRange();
    renderTabs();
    renderGrid();
  });

  // Clear every cell for the active title + month (deletes the stored rows).
  clearBtn?.addEventListener('click', async () => {
    if (!canEdit() || !activeTitle) return;
    const jobs = [];
    Object.keys(records).forEach((key) => {
      const id = key.indexOf('n:') === 0 ? '' : key;
      Object.keys(records[key] || {}).forEach((day) => {
        jobs.push(saveCell(id, Number(day), null));
      });
    });
    records = {};
    tbody.querySelectorAll('button[data-day]').forEach((el) => paintCell(/** @type {HTMLButtonElement} */ (el)));
    theadRow.querySelectorAll('input[data-day-all]').forEach((el) => { /** @type {HTMLInputElement} */ (el).checked = false; });
    await Promise.all(jobs);
  });

  // Cells persist on edit, so Save just reloads to confirm the stored state.
  saveBtn?.addEventListener('click', async () => {
    if (!activeTitle || !canEdit() || !saveBtn) return;
    const original = saveBtn.textContent;
    await renderGrid();
    saveBtn.textContent = t('attSheetSaved', 'Saved ✓');
    saveBtn.setAttribute('disabled', 'true');
    window.setTimeout(() => { saveBtn.textContent = original; saveBtn.removeAttribute('disabled'); }, 1400);
  });

  // Re-render labels/day names when the language changes while open.
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => { if (isOpen()) { applyMonthRange(); renderTabs(); renderGrid(); } })
  );

  // ── Export the current sheet to a real .xlsx workbook ──────────
  // Minimal Office Open XML writer (store/no-compression ZIP) — no external deps.
  const xmlEsc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const colLetter = (/** @type {number} */ n) => {
    let s = '';
    let x = n + 1;
    while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
    return s;
  };

  /** @type {Uint32Array | null} */
  let CRC_TABLE = null;
  const crc32 = (/** @type {Uint8Array} */ bytes) => {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[i] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  const zipStore = (/** @type {{ name: string, data: Uint8Array }[]} */ files) => {
    const enc = new TextEncoder();
    const u16 = (/** @type {number} */ v) => [v & 0xFF, (v >>> 8) & 0xFF];
    const u32 = (/** @type {number} */ v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    /** @type {Uint8Array[]} */
    const parts = [];
    /** @type {Uint8Array[]} */
    const central = [];
    let offset = 0;
    files.forEach((f) => {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;
      const local = Uint8Array.from([].concat(
        // @ts-ignore
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0)
      ));
      parts.push(local, nameBytes, data);
      central.push(Uint8Array.from([].concat(
        // @ts-ignore
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset)
      )), nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    let cdSize = 0;
    central.forEach((c) => { cdSize += c.length; });
    const eocd = Uint8Array.from([].concat(
      // @ts-ignore
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cdSize), u32(offset), u16(0)
    ));
    const all = parts.concat(central, [eocd]);
    let total = 0;
    all.forEach((a) => { total += a.length; });
    const out = new Uint8Array(total);
    let p = 0;
    all.forEach((a) => { out.set(a, p); p += a.length; });
    return out;
  };

  /** Static stylesheet: fonts, status fills and a thin border, referenced by the
   * `s` (style) index on each exported cell. */
  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="8">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE6CCE6"/></patternFill></fill>' + // 2 lavender
      '<fill><patternFill patternType="solid"><fgColor rgb="FFC9DAF8"/></patternFill></fill>' + // 3 header blue
      '<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/></patternFill></fill>' + // 4 AH green
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFEB9C"/></patternFill></fill>' + // 5 AR yellow
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill>' + // 6 ABS pink
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill>' + // 7 EX gray
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border>' +
        '<left style="thin"><color rgb="FF000000"/></left>' +
        '<right style="thin"><color rgb="FF000000"/></right>' +
        '<top style="thin"><color rgb="FF000000"/></top>' +
        '<bottom style="thin"><color rgb="FF000000"/></bottom>' +
        '<diagonal/>' +
      '</border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="14">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // 0 default
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 1 meta label
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 2 meta value
      '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 3 header blue
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 4 header day
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 5 data name
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 6 data no
      '<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 7 AH
      '<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 8 AR
      '<xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 9 ABS
      '<xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 10 EX
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 11 empty cell
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 12 legend title
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 13 legend meaning
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /**
   * Build + download a single-sheet workbook from a row model. Each cell is
   * either a primitive (default style) or `{ v, s }` where `s` is a cellXfs
   * index from {@link STYLES_XML}. `opts.cols` sets column widths and
   * `opts.merges` a list of A1-style merge ranges.
   * @param {(string|number|{v: string|number, s: number})[][]} rows
   * @param {{ cols?: {min:number,max:number,width:number}[], merges?: string[] }} [opts]
   */
  const downloadXlsx = (/** @type {string} */ filename, /** @type {string} */ sheetName, rows, opts) => {
    const o = opts || {};
    const valOf = (/** @type {any} */ cell) => (cell && typeof cell === 'object' && 'v' in cell) ? cell.v : cell;
    const styleOf = (/** @type {any} */ cell) => (cell && typeof cell === 'object' && 's' in cell) ? (cell.s || 0) : 0;
    let rowsXml = '';
    rows.forEach((row, r) => {
      let cellsXml = '';
      row.forEach((cell, c) => {
        const ref = colLetter(c) + (r + 1);
        const s = styleOf(cell);
        const sAttr = s ? ` s="${s}"` : '';
        cellsXml += `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(valOf(cell))}</t></is></c>`;
      });
      rowsXml += `<row r="${r + 1}">${cellsXml}</row>`;
    });
    const colsXml = (o.cols && o.cols.length)
      ? '<cols>' + o.cols.map((c) => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`).join('') + '</cols>'
      : '';
    const mergeXml = (o.merges && o.merges.length)
      ? `<mergeCells count="${o.merges.length}">` + o.merges.map((m) => `<mergeCell ref="${m}"/>`).join('') + '</mergeCells>'
      : '';
    const safeSheet = xmlEsc(String(sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      colsXml + '<sheetData>' + rowsXml + '</sheetData>' + mergeXml + '</worksheet>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';
    const enc = new TextEncoder();
    const zip = zipStore([
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rootRels) },
      { name: 'xl/workbook.xml', data: enc.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
      { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml) },
    ]);
    const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  /**
   * Export the currently displayed attendance sheet (active training title +
   * selected month) to a styled Excel workbook: a "No." + Name grid with one
   * colour-coded column per day (AH green / AR yellow / ABS pink / EX grey) and
   * a colour legend below.
   */
  const exportToExcel = () => {
    if (!activeTitle) {
      window.alert(t('attSheetNoCoursesMonth', 'No courses scheduled for this month.'));
      return;
    }
    const { year, month } = currentMonth();
    const total = daysInMonth(year, month);
    const li = dayInitials[lang()];
    const titleLabel = (titles.find((x) => x.code === activeTitle) || {}).label
      || (trainingMeta[activeTitle] && trainingMeta[activeTitle].title)
      || activeTitle;
    const monthYear = `${monthNames[lang()][month]} ${year}`;

    // Style indexes into STYLES_XML.
    const ST = { metaLabel: 1, metaVal: 2, hBlue: 3, hDay: 4, name: 5, no: 6, empty: 11, legendTitle: 12, legendMeaning: 13 };
    const statusStyle = (/** @type {string} */ s) =>
      s === 'AH' ? 7 : s === 'AR' ? 8 : s === 'ABS' ? 9 : s === 'EX' ? 10 : ST.empty;

    /** @type {(string|number|{v: string|number, s: number})[][]} */
    const rows = [];

    // Meta: Course + Month/Year (column A is a slim spacer to mirror the layout).
    rows.push([]);
    rows.push(['', { v: t('attSheetExportCourse', 'Course'), s: ST.metaLabel }, { v: String(titleLabel), s: ST.metaVal }]);
    rows.push(['', { v: t('attSheetExportMonth', 'Month'), s: ST.metaLabel }, { v: monthYear, s: ST.metaVal }]);
    rows.push([]);

    // Header: No. + Name + each day of the month.
    const header = ['', { v: t('attSheetColNo', 'No.'), s: ST.hBlue }, { v: t('attSheetColName', 'Name'), s: ST.hBlue }];
    for (let d = 1; d <= total; d++) {
      header.push({ v: `${d} ${li[new Date(year, month, d).getDay()]}`, s: ST.hDay });
    }
    rows.push(header);

    // Data rows: sequential No., participant name, then one status cell per day.
    let seq = 0;
    Array.from(tbody.querySelectorAll('tr')).forEach((tr) => {
      seq += 1;
      const nameCell = /** @type {HTMLElement | null} */ (tr.querySelector('td'));
      /** @type {(string|number|{v: string|number, s: number})[]} */
      const row = ['', { v: pad(seq), s: ST.no }, { v: nameCell ? (nameCell.textContent || '') : '', s: ST.name }];
      for (let d = 1; d <= total; d++) {
        const btn = /** @type {HTMLElement | null} */ (tr.querySelector(`button[data-day="${d}"]`));
        const key = btn ? (btn.dataset.key || '') : '';
        const cell = records[key] && records[key][String(d)];
        const status = cell ? cell.status : '';
        row.push({ v: status || '', s: statusStyle(status) });
      }
      rows.push(row);
    });

    // Legend: title (merged over the No.+Name columns) then a colour swatch per code.
    rows.push([]);
    const legendTitleRow = rows.length + 1; // 1-based row for the merge range
    rows.push(['', { v: t('attSheetExportLegend', 'Legend'), s: ST.legendTitle }, { v: '', s: ST.legendTitle }]);
    ['AH', 'AR', 'ABS', 'EX'].forEach((code) => {
      const full = String(statusLabel(code));
      const parts = full.split('—');
      const meaning = parts.length > 1 ? parts[1].trim() : full;
      rows.push(['', { v: code, s: statusStyle(code) }, { v: meaning, s: ST.legendMeaning }]);
    });

    const cols = [
      { min: 1, max: 1, width: 3 },          // A spacer
      { min: 2, max: 2, width: 6 },          // B No.
      { min: 3, max: 3, width: 24 },         // C Name
      { min: 4, max: 3 + total, width: 5 },  // day columns
    ];
    const merges = [`B${legendTitleRow}:C${legendTitleRow}`];

    const sheetName = monthYear;
    const safeTitle = String(titleLabel).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'attendance';
    downloadXlsx(`attendance-${safeTitle}-${year}-${pad(month + 1)}.xlsx`, sheetName, rows, { cols, merges });
  };

  exportBtn?.addEventListener('click', exportToExcel);
})();
