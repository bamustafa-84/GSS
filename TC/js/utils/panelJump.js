// @ts-check
/// <reference path="./translation.js" />

/**
 * GSS – Top "Find in form" panel search
 * ------------------------------------------------------------------
 * A top toolbar with two controls:
 *   1. A panel selector dropdown (All panels + every form panel).
 *   2. A text search box beside it that searches any info (field
 *      labels, section titles, headings, list items, paragraphs)
 *      inside the selected panel (or across all panels).
 *
 * Picking a result opens the application modal, switches to the
 * matching tab, expands a collapsed section if needed, then scrolls
 * to and briefly highlights the matching element.
 */
(() => {
  'use strict';

  const searchRoot = document.getElementById('psSearch');
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('psSearchInput'));
  const results = document.getElementById('psResults');
  const resultsList = document.getElementById('psResultsList');
  const empty = document.getElementById('psEmpty');

  // Grid overlay (optional — feature-detected).
  const gridBtn = document.getElementById('psGridBtn');
  const gridOverlay = document.getElementById('psGridOverlay');
  const gridBody = document.getElementById('psGridBody');
  const gridClose = document.getElementById('psGridClose');
  const gridCount = document.getElementById('psGridCount');
  const gridEmptyState = document.getElementById('psGridEmptyState');

  if (!searchRoot || !searchInput || !results || !resultsList || !empty) return;

  /** @type {number} highlighted result index (-1 = none). */
  let activeIndex = -1;
  /** @type {string} panel to reopen in the grid when the modal closes ('' = none). */
  let returnToGridTab = '';

  // ── Panels available (read live from the tab buttons) ──────────
  /** @returns {{ tab: string, name: string }[]} */
  const collectPanels = () =>
    /** @type {{ tab: string, name: string }[]} */ (
      Array.prototype.map
        .call(document.querySelectorAll('.gss-tab-btn'), (el) => {
          const tabBtn = /** @type {HTMLElement} */ (el);
          const lbl = /** @type {HTMLElement | null} */ (tabBtn.querySelector('[data-i18n^="tab"]'));
          return {
            tab: tabBtn.dataset.tab || '',
            name: (lbl?.textContent || tabBtn.textContent || '').trim()
          };
        })
        .filter((p) => /** @type {{ tab: string, name: string }} */ (p).tab && /** @type {{ tab: string, name: string }} */ (p).name)
    );

  const panelNameOf = (/** @type {string} */ tab) =>
    collectPanels().find((p) => p.tab === tab)?.name || tab;

  // ══════════════════════ INFO SEARCH ══════════════════════════
  // Elements that count as searchable "info" within a panel.
  const ITEM_SELECTOR = 'label, legend, h3, h4, h5, li, p';

  /** Own trimmed text of an element (single line). */
  const textOf = (/** @type {Element} */ el) =>
    (el.textContent || '').replace(/\s+/g, ' ').trim();

  /** Build the searchable items for one panel. */
  // @ts-ignore
  const itemsForPanel = (/** @type {string} */ tab) => {
    const panel = document.getElementById(`panel-${tab}`);
    if (!panel) return [];
    const seen = new Set();
    /** @type {{ tab: string, text: string, el: HTMLElement }[]} */
    const out = [];
    panel.querySelectorAll(ITEM_SELECTOR).forEach((node) => {
      const el = /** @type {HTMLElement} */ (node);
      // Skip elements that only wrap other searchable elements.
      if (el.querySelector(ITEM_SELECTOR)) return;
      const text = textOf(el);
      if (text.length < 2) return;
      const key = tab + '|' + text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ tab, text, el });
    });
    return out;
  };

  const visibleResults = () =>
    /** @type {HTMLElement[]} */ (Array.prototype.slice.call(resultsList.querySelectorAll('[role="option"]')));

  const highlightResult = (/** @type {number} */ index) => {
    const opts = visibleResults();
    activeIndex = Math.max(-1, Math.min(index, opts.length - 1));
    opts.forEach((opt, i) => {
      const on = i === activeIndex;
      opt.classList.toggle('bg-[#042F8D]/10', on);
      opt.classList.toggle('text-[#042F8D]', on);
      opt.setAttribute('aria-selected', String(on));
      if (on) opt.scrollIntoView({ block: 'nearest' });
    });
  };

  const closeResults = () => {
    results.classList.add('hidden');
    activeIndex = -1;
  };

  /** Bold the matched portion of the text (escaped). */
  const highlightMatch = (/** @type {string} */ text, /** @type {string} */ q) => {
    const esc = (/** @type {string} */ s) =>
      s.replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
      ));
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return esc(text);
    return (
      esc(text.slice(0, i)) +
      '<mark class="rounded bg-yellow-200 px-0.5 text-slate-900">' +
      esc(text.slice(i, i + q.length)) +
      '</mark>' +
      esc(text.slice(i + q.length))
    );
  };

  // Pick a human-friendly primary label + secondary id for a record.
  const recordPrimary = (/** @type {any} */ rec) => {
    for (const k of ['full_name', 'applicant_name', 'contact_name', 'name']) {
      if (rec[k]) return String(rec[k]);
    }
    for (const k of Object.keys(rec)) {
      const v = rec[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return '';
  };
  const recordSecondary = (/** @type {any} */ rec) => {
    for (const k of ['candidate_no', 'signature_id', 'id']) {
      if (rec[k] != null && rec[k] !== '') return '#' + rec[k];
    }
    return '';
  };

  // ── Field-level navigation + green highlight for a search hit ───
  /** @type {HTMLElement[]} Fields currently marked green from a search hit. */
  let greenHits = [];
  const GREEN_CLS = ['ring-2', 'ring-green-500', 'bg-green-50', 'rounded-lg', 'transition'];
  const clearFieldHighlights = () => {
    greenHits.forEach((el) => el.classList.remove(...GREEN_CLS, 'border-green-500'));
    greenHits = [];
  };
  const markGreen = (/** @type {HTMLElement} */ el) => {
    el.classList.add(...GREEN_CLS);
    if (['INPUT', 'SELECT', 'TEXTAREA'].indexOf(el.tagName) !== -1) el.classList.add('border-green-500');
    greenHits.push(el);
  };

  /** The form control that stores a given applicant column (via its dbname). */
  const fieldForColumn = (/** @type {string} */ key) => {
    if (!key) return null;
    const safe = key.replace(/["\\]/g, '\\$&');
    return /** @type {HTMLElement | null} */ (document.querySelector(`[dbname="${safe}"]`));
  };
  /** The tab/panel that owns a form element (defaults to registration). */
  const tabOfElement = (/** @type {HTMLElement | null} */ el) => {
    const panel = el && el.closest ? el.closest('.gss-tab-panel') : null;
    const id = panel ? panel.id : '';
    return id.indexOf('panel-') === 0 ? id.slice(6) : 'registration';
  };
  /** Element to flash: the control itself, or its group for radio/checkbox. */
  const highlightTargetFor = (/** @type {HTMLElement} */ el) => {
    const type = ((el.getAttribute && el.getAttribute('type')) || '').toLowerCase();
    if (type === 'radio' || type === 'checkbox' || el.tagName === 'LABEL') {
      return /** @type {HTMLElement} */ (el.closest('fieldset') || el.parentElement || el);
    }
    return el;
  };
  /** Switch to a column's tab, reveal it, scroll to it, and mark it green. */
  const focusField = (/** @type {string} */ key) => {
    clearFieldHighlights();
    const el = fieldForColumn(key);
    if (!el) return;
    document.getElementById(`tab-btn-${tabOfElement(el)}`)?.click();
    window.setTimeout(() => {
      if (window.GSSCollapsible && el.closest) {
        window.GSSCollapsible.expand(el.closest('fieldset'));
      }
      const target = highlightTargetFor(el);
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      markGreen(target);
    }, 90);
    window.setTimeout(clearFieldHighlights, 6000); // don't stay green forever
  };

  /** Open the grid overlay focused on a given panel. */
  // @ts-ignore
  const openGridForTab = (/** @type {string} */ tab) => {
    gridTab = tab;
    closeResults();
    openGrid();
  };

  /**
   * Open the form modal for a record: switch to the panel and populate every
   * field (editable Registration + read-only Conditions/Rules/Commitment).
   * @param {string} tab
   * @param {Record<string, any>} record
   * @param {boolean} [fromGrid] When true, closing the modal returns to the grid.
   * @param {string} [focusKey] Column that matched a search: its panel is shown
   *   and its field is highlighted green once the record loads.
   */
  const openRecordForm = (tab, record, fromGrid, focusKey) => {

    // Remember the grid panel so the modal's Close button can return to it.
    returnToGridTab = fromGrid ? (gridTab || tab) : '';

    const modal = document.getElementById('formModal');
    // Open the modal directly (do NOT click #openFormBtn — that resets to New mode).
    if (modal && modal.classList.contains('hidden')) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    // Show the panel that owns the matched field (falls back to the record tab).
    const field = focusKey ? fieldForColumn(focusKey) : null;
    document.getElementById(`tab-btn-${field ? tabOfElement(field) : tab}`)?.click();
    closeResults();
    closeGrid();
    const linker = /** @type {any} */ (window).GSSApplicant;
    if (tab === 'registration' && linker && typeof linker.load === 'function') {
      window.setTimeout(() => {
        linker.load(record);
        if (focusKey) window.setTimeout(() => focusField(focusKey), 140);
      }, 60);
    } else if (focusKey) {
      window.setTimeout(() => focusField(focusKey), 140);
    }
  };

  // When the modal was opened from the grid, its Close button reopens the grid.
  document.getElementById('closeModalBtn')?.addEventListener('click', () => {
    clearFieldHighlights();
    if (!returnToGridTab) return;
    const tab = returnToGridTab;
    returnToGridTab = '';
    openGridForTab(tab);
  });

  /**
   * Global applicant search across every authorized column. Each result shows
   * the applicant's name and which field matched; selecting one opens the
   * record, jumps to the panel that owns the matched field, and highlights that
   * field green.
   */
  const runSearch = async () => {
    const q = searchInput.value.replace(/\s+/g, ' ').trim().toLowerCase();
    clearFieldHighlights();
    if (!q) {
      closeResults();
      resultsList.innerHTML = '';
      return;
    }

    const tab = 'registration';
    const table = tableFor(tab);

    resultsList.innerHTML = '';
    if (!table) {
      empty.textContent = gridI18n('psSearchNoTable', 'No data table is associated with this panel.');
      empty.classList.remove('hidden');
      results.classList.remove('hidden');
      highlightResult(-1);
      return;
    }

    // Search across every authorized applicant column (all fields exposed by the
    // app), and remember which column matched so we can jump to its panel.
    const searchKeys = APPLICANT_COLUMNS.map((c) => c.key);
    const matchedColumn = (/** @type {any} */ rec) => {
      for (const k of searchKeys) {
        const v = rec[k];
        if (v != null && String(v).toLowerCase().includes(q)) return k;
      }
      return '';
    };
    const matchesRole = (/** @type {any} */ rec) => matchedColumn(rec) !== '';

    let records;
    if (tab === 'registration') {
      // Server-side search over every column, then confirm the hit client-side.
      records = (await fetchRegistrationSearch(q)).filter(matchesRole);
    } else {
      const res = await fetchTable(table);
      records = res.records.filter(matchesRole);
    }
    // Ignore stale async results if the query changed meanwhile.
    if (searchInput.value.replace(/\s+/g, ' ').trim().toLowerCase() !== q) return;

    const matches = records.slice(0, 40);

    matches.forEach((/** @type {any} */ rec) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.className =
        'flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2 transition-colors hover:bg-[#042F8D]/10';

      const badge = document.createElement('span');
      badge.className = 'flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-[#042F8D]/70';
      const badgeName = document.createElement('span');
      badgeName.textContent = panelNameOf(tab);
      badge.appendChild(badgeName);
      const sub = recordSecondary(rec);
      if (sub) {
        const badgeSub = document.createElement('span');
        badgeSub.className = 'text-slate-400';
        badgeSub.textContent = sub;
        badge.appendChild(badgeSub);
      }

      // Applicant name (always shown so the user can identify the record).
      const name = document.createElement('span');
      name.className = 'truncate text-sm font-semibold text-slate-800';
      name.textContent = recordPrimary(rec) || sub || '';

      const matchedKey = matchedColumn(rec);

      li.appendChild(badge);
      li.appendChild(name);

      // Which field matched + the value, with the match emphasised.
      if (matchedKey && matchedKey !== 'full_name') {
        const col = colOf(matchedKey);
        const hit = document.createElement('span');
        hit.className = 'truncate text-xs text-slate-500';
        const lab = document.createElement('span');
        lab.className = 'font-semibold text-slate-600';
        lab.textContent = (col ? colLabel(col) : prettify(matchedKey)) + ': ';
        const val = document.createElement('span');
        val.innerHTML = highlightMatch(String(rec[matchedKey]), q);
        hit.appendChild(lab);
        hit.appendChild(val);
        li.appendChild(hit);
      } else {
        // Name matched: emphasise the match on the name line itself.
        name.innerHTML = highlightMatch(recordPrimary(rec) || sub || q, q);
      }

      li.addEventListener('click', () => openRecordForm(tab, rec, false, matchedKey));
      li.addEventListener('mousemove', () => highlightResult(visibleResults().indexOf(li)));
      resultsList.appendChild(li);
    });

    empty.textContent = gridI18n('noPanelFound', 'No results found');
    empty.classList.toggle('hidden', matches.length > 0);
    results.classList.remove('hidden');
    highlightResult(matches.length ? 0 : -1);
  };

  // ── Navigate to a matched element and highlight it ─────────────
  // @ts-ignore
  const goTo = (/** @type {{ tab: string, el: HTMLElement }} */ item) => {
    // Open the modal if it is currently closed.
    const modal = document.getElementById('formModal');
    if (modal && modal.classList.contains('hidden')) {
      document.getElementById('openFormBtn')?.click();
    }
    // Switch to the right tab.
    document.getElementById(`tab-btn-${item.tab}`)?.click();

    closeResults();
    closeGrid();

    // Prefer the actual input a label points to.
    let target = item.el;
    if (item.el.tagName === 'LABEL') {
      const forId = item.el.getAttribute('for');
      const field = forId ? document.getElementById(forId) : null;
      if (field) target = /** @type {HTMLElement} */ (field);
    }

    // Reveal a collapsed fieldset if needed, then scroll + flash.
    window.setTimeout(() => {
      if (window.GSSCollapsible && target.closest) {
        window.GSSCollapsible.expand(target.closest('fieldset'));
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash(target);
      if (typeof (/** @type {any} */ (target).focus) === 'function') {
        try { /** @type {any} */ (target).focus({ preventScroll: true }); } catch (_) { /* noop */ }
      }
    }, 120);
  };

  /** Briefly outline an element to draw the eye. */
  const flash = (/** @type {HTMLElement} */ el) => {
    const cls = ['ring-4', 'ring-[#042F8D]/40', 'rounded-lg', 'transition'];
    el.classList.add(...cls);
    window.setTimeout(() => el.classList.remove(...cls), 1800);
  };

  // ── Search input events ────────────────────────────────────────
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) runSearch();
  });
  searchInput.addEventListener('keydown', (e) => {
    const opts = visibleResults();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (results.classList.contains('hidden')) runSearch();
        else highlightResult(activeIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        highlightResult(activeIndex - 1);
        break;
      case 'Enter': {
        e.preventDefault();
        const li = opts[activeIndex] || opts[0];
        if (li) li.click();
        break;
      }
      case 'Escape':
        closeResults();
        break;
      default:
        break;
    }
  });

  // ── Close popovers on outside click ────────────────────────────
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Node)) return;
    if (!results.classList.contains('hidden') && !searchRoot.contains(e.target)) closeResults();
  });

  // ══════════════ APPLICANT DATA GRID (customizable columns) ═════
  // Which panel is currently shown in the grid ('' = none).
  let gridTab = '';

  /** @type {((record: Record<string, any>) => boolean) | null} External row
   * filter applied on top of the column filters (used by the toolbar
   * notification bells to show only Pending / Secretary-queue applicants). */
  let externalRowFilter = null;

  /** @type {{ key: string, dir: number }} Current grid sort (dir: 1 asc, -1 desc). */
  let gridSort = { key: '', dir: 1 };

  /** @type {string} Selected course (training group key) filter ('' = all). */
  let gridCourseFilter = '';
  /** @type {string} Selected year filter ('' = all). */
  let gridYearFilter = '';
  /** @type {{ key: string, title: string }[]} Courses present in the current grid. */
  let gridCourseList = [];
  /** @type {Set<string>} Years present in the current grid. */
  let gridYearSet = new Set();
  /** @type {number} Grand total of candidates across all groups (hybrid grouped
   * pagination). 0 when the grid is not server-paged. Lets the counter report the
   * true dataset size while only a subset of rows is loaded in the DOM. */
  let gridGrandTotal = 0;
  /** @type {((key: string) => Promise<void>) | null} Expand + lazily load a
   * training group by key (set while a hybrid grouped grid is mounted). */
  let gridExpandGroup = null;
  /** @type {(() => Promise<void>) | null} Fully page-in every currently visible
   * group (used before exporting so the export isn't limited to loaded rows). */
  let gridLoadAllVisible = null;
  /** @type {(() => Promise<void>) | null} Expand every group (set while a hybrid
   * grouped grid is mounted). */
  let gridExpandAll = null;
  /** @type {(() => void) | null} Collapse every group (set while a hybrid grouped
   * grid is mounted). */
  let gridCollapseAll = null;
  /** @type {(() => Promise<void>) | null} Fully page-in every group (used before a
   * column filter runs so the search covers the whole dataset, not just loaded
   * rows). Set while a hybrid grouped grid is mounted. */
  let gridLoadAllGroups = null;
  /** @type {ReturnType<typeof setTimeout> | null} Debounce for column filtering. */
  let colFilterTimer = null;

  const gridIsOpen = () => !!gridOverlay && !gridOverlay.classList.contains('hidden');

  // Column customizer DOM.
  const gridColsRoot = document.getElementById('gridCols');
  const gridColsBtn = document.getElementById('gridColsBtn');
  const gridColsPanel = document.getElementById('gridColsPanel');
  const colsAvailable = document.getElementById('colsAvailable');
  const colsDisplayed = document.getElementById('colsDisplayed');
  const gridColsApply = document.getElementById('gridColsApply');
  const gridColsCancel = document.getElementById('gridColsCancel');
  const gridColsReset = document.getElementById('gridColsReset');

  // Course / Year filter DOM.
  const gridFiltersRoot = document.getElementById('psGridFilters');
  const gridCourseSel = /** @type {HTMLSelectElement | null} */ (document.getElementById('psGridCourse'));
  const gridYearSel = /** @type {HTMLSelectElement | null} */ (document.getElementById('psGridYear'));
  const gridExpandAllBtn = document.getElementById('psGridExpandAll');
  const gridCollapseAllBtn = document.getElementById('psGridCollapseAll');

  // Localize a key from the shared translation dictionary (falls back to text).
  const gridI18n = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };

  // ── Applicant columns: the full pool the user can pick from ────
  // Each column carries a `group` (its owning tab/section) so the column
  // customizer can list columns under a "Tab Name" header.
  /** @type {{ key: string, i18n: string, label: string, type?: string, group: string }[]} */
  const APPLICANT_COLUMNS = [
    { key: 'candidate_no', i18n: 'gcCandidateNo', label: 'Candidate No.', group: 'personal' },
    { key: 'full_name', i18n: 'gcFullName', label: 'Full Name', group: 'personal' },
    { key: 'registration_date', i18n: 'gcRegistrationDate', label: 'Registration Date', type: 'date', group: 'personal' },
    { key: 'nationality', i18n: 'gcNationality', label: 'Nationality', group: 'personal' },
    { key: 'place_of_birth', i18n: 'gcPlaceOfBirth', label: 'Place of Birth', group: 'personal' },
    { key: 'gender', i18n: 'gcGender', label: 'Gender', group: 'personal' },
    { key: 'date_of_birth', i18n: 'gcDateOfBirth', label: 'Date of Birth', type: 'date', group: 'personal' },
    { key: 'phone_1', i18n: 'gcPhone1', label: 'Phone (1)', group: 'personal' },
    { key: 'phone_2', i18n: 'gcPhone2', label: 'Phone (2)', group: 'personal' },
    { key: 'email', i18n: 'gcEmail', label: 'Email', group: 'personal' },
    { key: 'father_name', i18n: 'gcFatherName', label: "Father's Name", group: 'personal' },
    { key: 'mother_name', i18n: 'gcMotherName', label: "Mother's Name", group: 'personal' },
    { key: 'marital_status', i18n: 'gcMaritalStatus', label: 'Marital Status', group: 'personal' },
    { key: 'full_address', i18n: 'gcFullAddress', label: 'Full Address', group: 'personal' },
    { key: 'id_pass_no', i18n: 'gcIdPassNo', label: 'Card ID / Passport No.', group: 'personal' },
    { key: 'education_level', i18n: 'gcEducationLevel', label: 'Education Level', group: 'education' },
    { key: 'is_french_literate', i18n: 'gcIsFrenchLiterate', label: 'Can you read and write in French?', group: 'education' },
    { key: 'has_security_experience', i18n: 'gcHasSecurityExperience', label: 'Do you have experience in the security field?', group: 'education' },
    { key: 'has_health_issues', i18n: 'gcHasHealthIssues', label: 'Do you suffer from any illness that could affect your work?', group: 'health' },
    { key: 'ispaid', i18n: 'gcIsPaid', label: 'Payment (25,000 CDF training syllabus)', group: 'fees' },
    { key: 'interview_result', i18n: 'gcInterviewResult', label: 'Interview Result', group: 'admin' },
    { key: 'remarks', i18n: 'gcRemarks', label: 'Remarks', group: 'admin' },
    // Exam-result columns. `exam_result` (Pass/Failed) and `exam_score` are
    // merged onto each applicant record at render time from the candidate's
    // corrected exam attempt; `eval_final_decision` is read straight from the
    // applicant record.
    { key: 'exam_result', i18n: 'gcExamResult', label: 'Exam Result', group: 'exam' },
    { key: 'exam_score', i18n: 'gcExamScore', label: 'Total Score Obtained', group: 'exam' },
    { key: 'exam_status', i18n: 'gcExamStatus', label: 'Exam Status', group: 'exam' },
    { key: 'eval_final_decision', i18n: 'gcFinalDecision', label: 'Final Decision', group: 'exam' }
  ];

  // Column groups (Tab Names) shown as headers in the column customizer.
  /** @type {{ key: string, i18n: string, label: string }[]} */
  const COL_GROUPS = [
    { key: 'personal', i18n: 'gGrpPersonal', label: 'Personal Information' },
    { key: 'education', i18n: 'gGrpEducation', label: 'Education & Experience' },
    { key: 'health', i18n: 'gGrpHealth', label: 'Health Status' },
    { key: 'fees', i18n: 'gGrpFees', label: 'Registration Fees' },
    { key: 'admin', i18n: 'gGrpAdmin', label: 'Administration' },
    { key: 'exam', i18n: 'gGrpExam', label: 'Exam Result' },
  ];
  const groupLabelOf = (/** @type {string} */ key) => {
    const g = COL_GROUPS.find((x) => x.key === key);
    return g ? gridI18n(g.i18n, g.label) : gridI18n('psColsOther', 'Other');
  };

  const COLS_STORAGE = 'gss-grid-columns-v4';

  // ── Session role helpers (drive the exam-result grid behaviour) ──
  const sessionRole = () => {
    try {
      const s = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
      return s && s.role ? String(s.role) : '';
    } catch (_) { return ''; }
  };
  const sessionFullName = () => {
    try {
      const s = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
      return s && s.full_name ? String(s.full_name) : '';
    } catch (_) { return ''; }
  };
  const isInstructor = () => sessionRole().toLowerCase() === 'instructor';

  // Non-instructor roles get the exam-result columns by default; the Instructor
  // grid keeps the identity columns (its rows are already scoped to the exams
  // awaiting their correction). Admin / Secretary also get the Exam Status
  // column so they can see who is waiting for correction.
  const DEFAULT_DISPLAYED_EXAM = ['candidate_no', 'full_name', 'registration_date', 'exam_result', 'exam_score', 'eval_final_decision'];
  const DEFAULT_DISPLAYED_ADMIN = ['candidate_no', 'full_name', 'registration_date', 'exam_result', 'exam_score', 'exam_status', 'eval_final_decision'];
  const DEFAULT_DISPLAYED_INSTRUCTOR = ['candidate_no', 'full_name', 'registration_date', 'exam_status', 'exam_result', 'exam_score'];
  const defaultDisplayed = () => {
    const role = sessionRole().toLowerCase();
    if (role === 'instructor') return DEFAULT_DISPLAYED_INSTRUCTOR.slice();
    if (role === 'admin' || role === 'secretary') return DEFAULT_DISPLAYED_ADMIN.slice();
    return DEFAULT_DISPLAYED_EXAM.slice();
  };

  const colOf = (/** @type {string} */ key) => APPLICANT_COLUMNS.find((c) => c.key === key);
  const colLabel = (/** @type {{ i18n: string, label: string }} */ col) => gridI18n(col.i18n, col.label);

  /** @returns {string[]} */
  const loadDisplayed = () => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const valid = arr.filter((k) => APPLICANT_COLUMNS.some((c) => c.key === k));
          if (valid.length) return valid;
        }
      }
    } catch (_) { /* noop */ }
    return defaultDisplayed();
  };
  const saveDisplayed = () => {
    try { localStorage.setItem(COLS_STORAGE, JSON.stringify(displayedKeys)); } catch (_) { /* noop */ }
  };

  /** @type {string[]} Currently displayed columns, in order. */
  let displayedKeys = loadDisplayed();

  // ── Panel → PostgreSQL table (only registration→applicant today) ──
  /** @type {Record<string, string>} */
  const PANEL_TABLE = { registration: 'applicant' };
  const tableFor = (/** @type {string} */ tab) => PANEL_TABLE[tab] || '';
  /** Reverse lookup: which panel/tab owns this table (for the Edit column). */
  const panelForTable = (/** @type {string} */ table) =>
    Object.keys(PANEL_TABLE).find((t) => PANEL_TABLE[t] === table) || '';

  /** Turn a snake_case column name into a readable header. */
  const prettify = (/** @type {string} */ name) =>
    String(name || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

  const isDateType = (/** @type {string | undefined} */ type) => !!type && /date|timestamp/i.test(type);

  // ── Table data cache: name → { columns, records, error, exists } ──
  /** @type {Record<string, { columns: any[], records: any[], error: boolean, exists: boolean }>} */
  const tableCache = {};
  const clearTableCache = () => {
    Object.keys(tableCache).forEach((k) => delete tableCache[k]);
    trainingMetaCache = null;
    Object.keys(applicantTrainingsCache).forEach((k) => delete applicantTrainingsCache[k]);
    Object.keys(applicantExamCache).forEach((k) => delete applicantExamCache[k]);
  };

  // ── Exam-result cache: candidate_no → latest attempt summary ──
  // Feeds the applicant grid's Exam Result / Total Score columns and the
  // Instructor "waiting for my correction" row filter.
  /** @type {Record<string, any>} */
  const applicantExamCache = {};
  const fetchExamResult = async (/** @type {any} */ cno) => {
    const key = String(cno);
    if (applicantExamCache[key]) return applicantExamCache[key];
    let out = {};
    try {
      const data = await fetch(
        `${API_BASE}/api/exam/candidate-result?candidate_no=${encodeURIComponent(key)}`,
        { headers: { Accept: 'application/json' } }
      ).then((r) => r.json());
      if (data && data.ok && data.has_attempt) out = data;
    } catch (_) { out = {}; }
    applicantExamCache[key] = out;
    return out;
  };

  // One request returns the latest exam result for every candidate, seeding the
  // per-candidate cache so the grid avoids an N+1 fetch storm on large datasets.
  let examBulkLoaded = false;
  const primeExamResultsBulk = async () => {
    if (examBulkLoaded) return;
    try {
      const data = await fetch(`${API_BASE}/api/exam/candidate-results`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json());
      const map = data && data.results ? data.results : {};
      Object.keys(map).forEach((k) => { applicantExamCache[k] = map[k] || {}; });
      examBulkLoaded = true;
    } catch (_) { /* fall back to per-row fetches */ }
  };

  /** Human-readable exam/correction status for the applicant grid. */
  const examStatusLabel = (/** @type {any} */ ex, /** @type {boolean} */ mine) => {
    const cs = ex && ex.correction_status;
    const st = ex && ex.status;
    if (cs === 'WAITING_FOR_CORRECTION') {
      return mine
        ? gridI18n('examStWaitingYou', 'Waiting for your correction')
        : gridI18n('examStWaiting', 'Waiting for correction');
    }
    if (cs === 'CORRECTING') return gridI18n('examStCorrecting', 'Correcting');
    if (cs === 'CORRECTED') return gridI18n('examStCorrected', 'Corrected');
    if (st === 'IN_PROGRESS') return gridI18n('examStInProgress', 'In progress');
    if (st === 'SUBMITTED') return gridI18n('examStWaiting', 'Waiting for correction');
    return gridI18n('examStNone', 'Not started');
  };

  // ── Training assignments (used to group the applicant grid) ────
  // The applicant record carries no training columns, so grouping the grid by
  // Training Title / From / To requires the training list (for the date range)
  // plus each candidate's assignments (applicant_training).
  /** @type {Record<string, any> | null} training_id → training row. */
  let trainingMetaCache = null;
  const fetchTrainingMeta = async () => {
    if (trainingMetaCache) return trainingMetaCache;
    /** @type {Record<string, any>} */
    const map = {};
    try {
      const data = await fetch(`${API_BASE}/api/training`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      (Array.isArray(data.trainings) ? data.trainings : []).forEach((/** @type {any} */ t) => {
        if (t && t.training_id != null) map[String(t.training_id)] = t;
      });
    } catch (_) { /* noop */ }
    trainingMetaCache = map;
    return map;
  };

  /** @type {Record<string, any[]>} candidate_no → assigned training rows. */
  const applicantTrainingsCache = {};
  const fetchApplicantTrainings = async (/** @type {any} */ cno) => {
    const key = String(cno);
    if (applicantTrainingsCache[key]) return applicantTrainingsCache[key];
    let rows = [];
    try {
      const data = await fetch(
        `${API_BASE}/api/applicant-trainings?candidate_no=${encodeURIComponent(key)}`,
        { headers: { Accept: 'application/json' } }
      ).then((r) => r.json());
      rows = Array.isArray(data.trainings) ? data.trainings : [];
    } catch (_) { rows = []; }
    applicantTrainingsCache[key] = rows;
    return rows;
  };

  // One request returns every candidate's training assignments, seeding the
  // per-candidate cache so grouping avoids an N+1 fetch storm on large datasets.
  let trainingsBulkLoaded = false;
  const primeApplicantTrainingsBulk = async () => {
    if (trainingsBulkLoaded) return;
    try {
      const data = await fetch(`${API_BASE}/api/applicant-trainings-all`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json());
      const map = data && data.trainings ? data.trainings : {};
      Object.keys(map).forEach((k) => { applicantTrainingsCache[k] = Array.isArray(map[k]) ? map[k] : []; });
      trainingsBulkLoaded = true;
    } catch (_) { /* fall back to per-row fetches */ }
  };

  const fetchTable = async (/** @type {string} */ table) => {
    if (!table) return { columns: [], records: [], error: false, exists: false };
    if (tableCache[table]) return tableCache[table];
    let out = { columns: [], records: [], error: false, exists: false };
    try {
      const res = await fetch(`${API_BASE}/api/records?table=${encodeURIComponent(table)}`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      out = {
        columns: Array.isArray(data.columns) ? data.columns : [],
        records: Array.isArray(data.records) ? data.records : [],
        error: false,
        exists: data.exists !== false
      };
    } catch (_) {
      out = { columns: [], records: [], error: true, exists: false };
    }
    tableCache[table] = out;
    return out;
  };

  // ── Hybrid grouped pagination (applicant grid) ─────────────────
  // The applicant grid can hold very large numbers of candidates, so instead of
  // loading every row it first fetches lightweight group summaries (one row per
  // training + a count) and then pages each group's candidates on demand.

  /** Fetch the training group summaries (scoped to the instructor's trainings
   * when the current user is an Instructor). */
  const fetchGridGroups = async () => {
    const trainer = isInstructor() ? sessionFullName().trim() : '';
    const qs = trainer ? `?trainer=${encodeURIComponent(trainer)}` : '';
    try {
      const data = await fetch(`${API_BASE}/api/grid/groups${qs}`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json());
      return {
        groups: Array.isArray(data.groups) ? data.groups : [],
        unassigned: Number(data.unassigned) || 0,
      };
    } catch (_) {
      return { groups: [], unassigned: 0 };
    }
  };

  /** Fetch one ordered page of a group's candidates (with exam fields merged).
   * @param {number|null} trainingId null = the "no training assigned" bucket. */
  const fetchGroupRows = async (/** @type {number|null} */ trainingId, /** @type {number} */ limit, /** @type {number} */ offset) => {
    const tid = trainingId == null ? 'null' : encodeURIComponent(String(trainingId));
    try {
      const data = await fetch(
        `${API_BASE}/api/grid/group-rows?training_id=${tid}&limit=${limit}&offset=${offset}`,
        { headers: { Accept: 'application/json' } }
      ).then((r) => r.json());
      return { rows: Array.isArray(data.rows) ? data.rows : [], total: Number(data.total) || 0 };
    } catch (_) {
      return { rows: [], total: 0 };
    }
  };

  /** Compute the Exam Result / Total Score / Exam Status display fields on a
   * candidate record from its merged `__exam` payload. Shared by the eager
   * (search) and lazy (grouped pagination) render paths. */
  const decorateExamFields = (/** @type {any} */ rec) => {
    const ex = (rec && rec.__exam) || {};
    const corrected = ex.correction_status === 'CORRECTED';
    const passLabel = gridI18n('gcExamPass', 'Pass');
    const failLabel = gridI18n('gcExamFail', 'Failed');
    rec.exam_result = (corrected && ex.passed != null) ? (ex.passed ? passLabel : failLabel) : '';
    rec.exam_score = (corrected && ex.total_score != null) ? ex.total_score : '';
    rec.exam_status = examStatusLabel(ex, isInstructor());
    return rec;
  };
  const fetchRegistrationSearch = async (/** @type {string} */ q) => {
    try {
      const res = await fetch(`${API_BASE}/api/registration/search?q=${encodeURIComponent(q)}&limit=25`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      return Array.isArray(data.applicants) ? data.applicants : [];
    } catch (_) {
      return [];
    }
  };

  /** Columns to display for a table: the customizable set for applicant, else all. */
  const columnsForTable = (/** @type {string} */ table, /** @type {any[]} */ serverColumns) => {
    if (table === 'applicant') return displayedKeys.map(colOf).filter(Boolean);
    return serverColumns.map((c) => ({ key: c.name, label: prettify(c.name), type: c.data_type }));
  };

  const headerLabel = (/** @type {any} */ col) =>
    col && col.i18n ? gridI18n(col.i18n, col.label) : (col ? col.label : '');

  /** Format one cell for display. */
  const formatCell = (/** @type {any} */ row, /** @type {any} */ col) => {
    const v = row ? row[col.key] : undefined;
    if (v === null || v === undefined || v === '') return '';
    if (col.type === 'date' || isDateType(col.type)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        const [y, m, day] = d.toISOString().split('T')[0].split('-');
        return `${day}/${m}/${y}`;
      }
    }
    if (typeof v === 'boolean') return v ? gridI18n('optYes', 'Yes').trim() : gridI18n('optNo', 'No').trim();
    return String(v);
  };

  /** Show a centered message in the grid body and reset the counter. */
  const showGridMessage = (/** @type {string} */ msg) => {
    if (!gridBody) return;
    gridBody.innerHTML =
      '<div class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-slate-400">' + msg + '</div>';
    if (gridCount) gridCount.textContent = '';
  };

  // ── Nested (expandable) sub-grids per applicant row ────────────
  // Each Applicant row can be expanded to reveal five nested grids that mirror
  // the applicant tabs: Attendance, Exam, Evaluation, Measurement, Checklist.
  // Exam / Evaluation / Checklist are read straight from the applicant record
  // already fetched by /api/records; Attendance and Measurement are fetched
  // on demand (per candidate) the first time their section is opened.

  /** @type {{ key: string, i18n: string, label: string }[]} */
  const NESTED_TABS = [
    { key: 'attendance', i18n: 'tabPresences', label: 'Attendance' },
    { key: 'exam', i18n: 'tabExam', label: 'Exam Result' },
    { key: 'evaluation', i18n: 'tabEvaluation', label: 'Evaluation' },
    { key: 'measurement', i18n: 'tabMensuration', label: 'Measurements' },
    { key: 'checklist', i18n: 'tabDossier', label: 'Checklist' },
  ];

  /** @type {[string, string][]} field → label for record-backed nested grids. */
  const NESTED_EXAM_FIELDS = [
    ['exam_decision', 'Exam Decision'],
    ['exam_observations', "Trainer's Observations"],
    ['ack_exam', 'Acknowledged'],
  ];
  const NESTED_EVAL_FIELDS = [
    ['eval_presence_discipline', 'Presence & Discipline'],
    ['eval_punctuality', 'Punctuality'],
    ['eval_instructions_compliance', 'Instructions Compliance'],
    ['eval_professional_appearance', 'Professional Appearance'],
    ['eval_french_communication', 'French Communication'],
    ['eval_observation_skills', 'Observation Skills'],
    ['eval_physical_aptitude', 'Physical Aptitude'],
    ['eval_theoretical_exam', 'Theoretical Exam'],
    ['eval_total', 'Total'],
    ['eval_final_decision', 'Final Decision'],
    ['eval_observations', 'Observations'],
  ];
  const NESTED_CHECKLIST_FIELDS = [
    ['conditions_accepted', 'Conditions Accepted'],
    ['rules_accepted', 'Rules Accepted'],
    ['commitment_accepted', 'Commitment Accepted'],
    ['ack_conditions', 'Conditions Acknowledged'],
    ['ack_rules', 'Rules Acknowledged'],
    ['ack_commitment', 'Commitment Acknowledged'],
    ['ack_dossier', 'Checklist Acknowledged'],
  ];

  /** Format a raw value for a nested grid cell. */
  const nestedVal = (/** @type {any} */ v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? gridI18n('optYes', 'Yes').trim() : gridI18n('optNo', 'No').trim();
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        const [y, m, day] = d.toISOString().split('T')[0].split('-');
        return `${day}/${m}/${y}`;
      }
    }
    return s;
  };

  /** A small "no data" note for an empty nested section. */
  const nestedNote = (/** @type {string} */ msg) => {
    const div = document.createElement('div');
    div.className = 'px-3 py-2 text-xs text-slate-400';
    div.textContent = msg;
    return div;
  };

  /** Render a two-column Field / Value table from [label, value] pairs. */
  const renderNestedKV = (/** @type {[string, any][]} */ pairs) => {
    const tbl = document.createElement('table');
    tbl.className = 'w-full border-collapse text-xs';
    const tb = document.createElement('tbody');
    pairs.forEach(([label, value]) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 last:border-0';
      const th = document.createElement('td');
      th.className = 'w-1/2 px-3 py-1.5 font-semibold text-slate-500';
      th.textContent = label;
      const td = document.createElement('td');
      td.className = 'px-3 py-1.5 text-slate-700';
      td.textContent = nestedVal(value);
      tr.appendChild(th);
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    return tbl;
  };

  /** Render a multi-row table from an array of records (dynamic columns). */
  const renderNestedRows = (/** @type {any[]} */ rows) => {
    if (!Array.isArray(rows) || !rows.length) return nestedNote(gridI18n('psGridNoData', 'No records found.'));
    const keys = Object.keys(rows[0]).filter((k) => !/_id$/.test(k));
    const tbl = document.createElement('table');
    tbl.className = 'w-full border-collapse text-xs';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.className = 'bg-slate-100 text-slate-600';
    keys.forEach((k) => {
      const th = document.createElement('th');
      th.className = 'whitespace-nowrap px-3 py-1.5 text-left font-bold uppercase tracking-wide';
      th.textContent = prettify(k);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);
    const tb = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 last:border-0';
      keys.forEach((k) => {
        const td = document.createElement('td');
        td.className = 'whitespace-nowrap px-3 py-1.5 text-slate-700';
        td.textContent = nestedVal(r[k]);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    return tbl;
  };

  /** Populate a nested section body for one applicant + tab (lazy). */
  const fillNestedBody = async (
    /** @type {string} */ key,
    /** @type {any} */ record,
    /** @type {HTMLElement} */ body
  ) => {
    body.innerHTML = '';
    const cno = record ? record.candidate_no : null;
    try {
      if (key === 'exam') {
        // Once presence is acknowledged the Exam Result is hidden and replaced
        // by a message until the candidate has actually taken the exam.
        const isTruthy = (/** @type {any} */ v) =>
          v === true || v === 1 || v === '1' || v === 't' || v === 'true';
        if (isTruthy(record && record.ack_presences)) {
          body.appendChild(nestedNote(gridI18n('examPanelNone', 'This candidate has not taken an exam yet.')));
        } else {
          body.appendChild(renderNestedKV(NESTED_EXAM_FIELDS.map(([k, l]) => [l, record[k]])));
        }
      } else if (key === 'evaluation') {
        body.appendChild(renderNestedKV(NESTED_EVAL_FIELDS.map(([k, l]) => [l, record[k]])));
      } else if (key === 'checklist') {
        body.appendChild(renderNestedKV(NESTED_CHECKLIST_FIELDS.map(([k, l]) => [l, record[k]])));
      } else if (key === 'attendance') {
        if (cno == null) { body.appendChild(nestedNote(gridI18n('psGridNoData', 'No records found.'))); return; }
        body.appendChild(nestedNote(gridI18n('psGridLoading', 'Loading…')));
        const data = await fetch(
          `${API_BASE}/api/attendance/candidate?candidate_no=${encodeURIComponent(String(cno))}`,
          { headers: { Accept: 'application/json' } }
        ).then((r) => r.json());
        body.innerHTML = '';
        body.appendChild(renderNestedRows(Array.isArray(data && data.attendance) ? data.attendance : []));
      } else if (key === 'measurement') {
        if (cno == null) { body.appendChild(nestedNote(gridI18n('psGridNoData', 'No records found.'))); return; }
        body.appendChild(nestedNote(gridI18n('psGridLoading', 'Loading…')));
        const data = await fetch(
          `${API_BASE}/api/measurements?candidate_no=${encodeURIComponent(String(cno))}`,
          { headers: { Accept: 'application/json' } }
        ).then((r) => r.json());
        body.innerHTML = '';
        const meas = data && data.ok ? data.measurement : null;
        if (!meas || typeof meas !== 'object') {
          body.appendChild(nestedNote(gridI18n('psGridNoData', 'No records found.')));
        } else {
          const pairs = Object.keys(meas)
            .filter((k) => !/_id$/.test(k) && k !== 'candidate_no' && meas[k] !== null && meas[k] !== '')
            .map((k) => /** @type {[string, any]} */([prettify(k), meas[k]]));
          body.appendChild(pairs.length ? renderNestedKV(pairs) : nestedNote(gridI18n('psGridNoData', 'No records found.')));
        }
      }
    } catch (_) {
      body.innerHTML = '';
      body.appendChild(nestedNote(gridI18n('psGridError', 'Could not load data. Is the server running?')));
    }
  };

  /** Build the full nested detail content (five collapsible sub-grids). */
  const buildNestedDetail = (/** @type {any} */ record) => {
    const wrap = document.createElement('div');
    wrap.className = 'space-y-2 bg-slate-50 p-3';
    NESTED_TABS.forEach((tab) => {
      const sec = document.createElement('div');
      sec.className = 'overflow-hidden rounded-lg border border-slate-200 bg-white';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[#042F8D] transition hover:bg-[#042F8D]/5';
      const icon = document.createElement('span');
      icon.className = 'inline-flex h-4 w-4 items-center justify-center rounded border border-[#042F8D]/40 text-[11px] leading-none';
      icon.textContent = '+';
      const lbl = document.createElement('span');
      lbl.textContent = gridI18n(tab.i18n, tab.label);
      btn.appendChild(icon);
      btn.appendChild(lbl);
      const secBody = document.createElement('div');
      secBody.className = 'hidden border-t border-slate-100';
      let loaded = false;
      btn.addEventListener('click', () => {
        const willOpen = secBody.classList.contains('hidden');
        secBody.classList.toggle('hidden', !willOpen);
        icon.textContent = willOpen ? '−' : '+';
        if (willOpen && !loaded) {
          loaded = true;
          fillNestedBody(tab.key, record, secBody);
        }
      });
      sec.appendChild(btn);
      sec.appendChild(secBody);
      wrap.appendChild(sec);
    });
    return wrap;
  };

  /** Collapse every open nested detail row and reset its expander button. */
  const collapseAllDetails = () => {
    if (!gridBody) return;
    gridBody.querySelectorAll('#psGridRows tr[data-detail]').forEach((el) => el.remove());
    gridBody.querySelectorAll('#psGridRows [data-expander]').forEach((el) => {
      const btn = /** @type {HTMLElement} */ (el);
      btn.textContent = '+';
      btn.setAttribute('aria-expanded', 'false');
      const parent = /** @type {any} */ (btn.closest('tr'));
      if (parent) parent.__detailRow = null;
    });
  };

  /** dd/mm/yyyy for a group header date (empty when unparseable). */
  const fmtGridDate = (/** @type {any} */ v) => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    const [y, m, day] = d.toISOString().split('T')[0].split('-');
    return `${day}/${m}/${y}`;
  };

  /** Build a group header label: "Title — Trainer — from to to". */
  const groupLabelFor = (/** @type {any} */ meta) => {
    const parts = [meta.training_title || gridI18n('psGridUngrouped', 'No training assigned')];
    if (meta.trainer) parts.push(String(meta.trainer));
    const from = fmtGridDate(meta.date_from);
    const to = fmtGridDate(meta.date_to);
    if (from || to) parts.push(`${from || '—'} ${gridI18n('psGridTo', 'to')} ${to || '—'}`);
    return parts.join(' — ');
  };

  /** Admin-only: hard-delete a candidate and all their records, then reload. */
  const deleteCandidate = async (/** @type {any} */ row, /** @type {HTMLButtonElement} */ btn) => {
    const cno = row && row.candidate_no;
    if (cno == null) return;
    const name = (row && (row.full_name || row.applicant_name)) || ('#' + cno);
    const msg = gridI18n('psDeleteConfirm', 'Delete this candidate and all their records? This cannot be undone.');
    if (!window.confirm(msg + '\n\n' + name)) return;
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/applicants?id=${encodeURIComponent(String(cno))}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'delete failed'); 
      clearTableCache();
      await renderDataGrid();
    } catch (_) {
      btn.disabled = false;
      window.alert(gridI18n('psDeleteError', 'Could not delete the candidate.'));
    }
  };

  /** How many rows to append per animation frame during progressive render. */
  const GRID_RENDER_CHUNK = 200;

  /** Bumped on every renderDataGrid() call so a stale progressive stream from a
   * previous panel can detect it was superseded and stop appending. */
  let gridRenderToken = 0;

  /**
   * Append a render plan (group headers + data rows) to the tbody in chunks so
   * very large datasets don't block the main thread. Resolves once every row is
   * in the DOM, preserving the await contract of {@link renderDataGrid}.
   * @param {HTMLElement} tbody
   * @param {any[]} plan
   * @param {(rec: any) => HTMLElement} buildRow
   * @param {number} token
   * @returns {Promise<void>}
   */
  const renderRowsProgressive = (tbody, plan, buildRow, token) => new Promise((resolve) => {
    if (!plan.length) { resolve(); return; }
    const schedule = window.requestAnimationFrame
      ? (/** @type {FrameRequestCallback} */ cb) => window.requestAnimationFrame(cb)
      : (/** @type {Function} */ cb) => setTimeout(cb, 0);
    let i = 0;
    const flush = () => {
      if (token !== gridRenderToken) { resolve(); return; } // superseded
      const frag = document.createDocumentFragment();
      const end = Math.min(i + GRID_RENDER_CHUNK, plan.length);
      for (; i < end; i++) {
        const item = plan[i];
        if (item.kind === 'group') {
          frag.appendChild(item.el);
        } else {
          const tr = buildRow(item.rec);
          if (item.group !== undefined) {
            tr.dataset.group = item.group;
            tr.dataset.groupYear = item.years || '';
          }
          /** @type {any} */ (tr).__origIndex = item.order;
          frag.appendChild(tr);
        }
      }
      tbody.appendChild(frag);
      if (i < plan.length) schedule(flush);
      else resolve();
    };
    // Render the first chunk synchronously for an instant first paint, then
    // stream the rest across frames.
    flush();
  });

  /** Render the data grid for the selected panel's table. */
  const renderDataGrid = async () => {
    if (!gridBody) return;
    const renderToken = ++gridRenderToken;
    gridEmptyState?.remove();
    if (!gridTab) {
      showGridMessage(gridI18n('psGridPick', 'Select a panel to display its data grid.'));
      return;
    }
    const table = tableFor(gridTab);
    if (!table) {
      showGridMessage(gridI18n('psGridNoTable', 'No data table is associated with this panel yet.'));
      return;
    }

    gridBody.innerHTML =
      '<div class="p-8 text-center text-sm text-slate-400">' + gridI18n('psGridLoading', 'Loading…') + '</div>';
    gridGrandTotal = 0;
    // The applicant grid uses hybrid grouped pagination: its rows are loaded
    // lazily per training group (see the render tail), so we do NOT eagerly pull
    // the whole table here. Other tables load their full record set as before.
    const nestable = table === 'applicant';
    /** @type {any[]} */ let serverColumns = [];
    /** @type {any[]} */ let records = [];
    let error = false;
    let exists = true;
    if (!nestable) {
      const fetched = await fetchTable(table);
      serverColumns = fetched.columns;
      records = fetched.records;
      error = fetched.error;
      exists = fetched.exists;
    }
    const cols = columnsForTable(table, serverColumns);
    const editTab = panelForTable(table);
    gridBody.innerHTML = '';

    const tableEl = document.createElement('table');
    tableEl.className = 'w-full border-collapse text-sm';

    const thead = document.createElement('thead');
    thead.className = 'sticky top-0 z-10';

    // Admins can hard-delete a candidate directly from the applicant grid.
    const currentRole = (() => {
      try {
        const s = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
        return s && s.role ? String(s.role) : '';
      } catch (_) { return ''; }
    })();
    const canDelete = nestable && currentRole === 'Admin';
    // A trailing Print column is shown on the applicant grid for every role
    // except Instructor; the button itself only appears on passed exams.
    const showPrintCol = nestable && !isInstructor();

    const titleRow = document.createElement('tr');
    titleRow.className = 'bg-[#042F8D] text-white';
    if (nestable) {
      const th = document.createElement('th');
      th.dataset.expanderCol = '1';
      th.className = 'w-10 px-2 py-2.5';
      th.setAttribute('aria-label', gridI18n('psColExpand', 'Expand'));
      titleRow.appendChild(th);
    }
    if (editTab) {
      const th = document.createElement('th');
      th.dataset.editCol = '1';
      th.className = 'w-14 whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide';
      th.textContent = gridI18n('psColEdit', 'Edit');
      titleRow.appendChild(th);
    }
    if (canDelete) {
      const th = document.createElement('th');
      th.dataset.deleteCol = '1';
      th.className = 'w-14 whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide';
      th.textContent = gridI18n('psColDelete', 'Delete');
      titleRow.appendChild(th);
    }
    cols.forEach((col) => {
      const c = /** @type {any} */ (col);
      const th = document.createElement('th');
      th.dataset.col = c.key;
      th.className = 'group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide transition-colors hover:bg-white/10';
      th.title = gridI18n('psSortHint', 'Click to sort');
      const wrap = document.createElement('span');
      wrap.className = 'inline-flex items-center gap-1';
      const lbl = document.createElement('span');
      lbl.textContent = headerLabel(col);
      wrap.appendChild(lbl);
      const arrow = document.createElement('span');
      arrow.className = 'gss-sort-arrow text-[10px] opacity-70';
      arrow.textContent = gridSort.key === c.key ? (gridSort.dir === 1 ? '▲' : '▼') : '↕';
      wrap.appendChild(arrow);
      th.appendChild(wrap);
      th.addEventListener('click', () => sortGridBy(c));
      titleRow.appendChild(th);
    });
    if (showPrintCol) {
      const th = document.createElement('th');
      th.dataset.printCol = '1';
      th.className = 'w-16 whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide';
      th.textContent = gridI18n('psColPrint', 'Print');
      titleRow.appendChild(th);
    }

    const filterRow = document.createElement('tr');
    filterRow.className = 'bg-slate-100 shadow-sm';
    if (nestable) {
      const th = document.createElement('th');
      th.className = 'p-1.5';
      filterRow.appendChild(th);
    }
    if (editTab) {
      const th = document.createElement('th');
      th.className = 'p-1.5';
      filterRow.appendChild(th);
    }
    if (canDelete) {
      const th = document.createElement('th');
      th.className = 'p-1.5';
      filterRow.appendChild(th);
    }
    cols.forEach((col) => {
      const th = document.createElement('th');
      th.className = 'p-1.5';
      const input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.dataset.col = /** @type {any} */ (col).key;
      input.placeholder = gridI18n('psFilter', 'Filter') + '…';
      input.className =
        'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 transition focus:border-[#042F8D] focus:outline-none focus:ring-2 focus:ring-[#042F8D]/20';
      input.addEventListener('input', onColumnFilterInput);
      th.appendChild(input);
      filterRow.appendChild(th);
    });
    if (showPrintCol) {
      const th = document.createElement('th');
      th.className = 'p-1.5';
      filterRow.appendChild(th);
    }

    thead.appendChild(titleRow);
    thead.appendChild(filterRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = 'psGridRows';
    tbody.className = 'divide-y divide-slate-100 bg-white';

    /** Build one data-row <tr> for a record (no ordering/group metadata). */
    const buildDataRow = (/** @type {any} */ row) => {
      const tr = document.createElement('tr');
      tr.dataset.row = '1';
      tr.className = 'transition-colors hover:bg-[#042F8D]/5';
      /** @type {Record<string, string>} */
      const cells = {};
      if (nestable) {
        const expTd = document.createElement('td');
        expTd.className = 'px-2 py-2 align-top';
        const expBtn = document.createElement('button');
        expBtn.type = 'button';
        expBtn.dataset.expander = '1';
        expBtn.setAttribute('aria-expanded', 'false');
        expBtn.title = gridI18n('psColExpand', 'Expand');
        expBtn.className = 'inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-sm font-bold leading-none text-[#042F8D] transition hover:border-[#042F8D] hover:bg-[#042F8D]/10';
        expBtn.textContent = '+';
        expBtn.addEventListener('click', () => {
          const trAny = /** @type {any} */ (tr);
          if (trAny.__detailRow) {
            trAny.__detailRow.remove();
            trAny.__detailRow = null;
            expBtn.textContent = '+';
            expBtn.setAttribute('aria-expanded', 'false');
            return;
          }
          const detailTr = document.createElement('tr');
          detailTr.dataset.detail = '1';
          detailTr.className = 'bg-slate-50';
          const detailTd = document.createElement('td');
          detailTd.colSpan = titleRow.children.length;
          detailTd.className = 'p-0';
          detailTd.appendChild(buildNestedDetail(row));
          detailTr.appendChild(detailTd);
          tr.after(detailTr);
          trAny.__detailRow = detailTr;
          expBtn.textContent = '−';
          expBtn.setAttribute('aria-expanded', 'true');
        });
        expTd.appendChild(expBtn);
        tr.appendChild(expTd);
      }
      if (editTab) {
        const editTd = document.createElement('td');
        editTd.className = 'px-3 py-2 align-top';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = gridI18n('psColEdit', 'Edit');
        btn.className = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-[#042F8D] transition hover:border-[#042F8D] hover:bg-[#042F8D]/10';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
        btn.addEventListener('click', () => openRecordForm(editTab, row, true));
        editTd.appendChild(btn);
        tr.appendChild(editTd);
      }
      if (canDelete) {
        const delTd = document.createElement('td');
        delTd.className = 'px-3 py-2 align-top';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = gridI18n('psColDelete', 'Delete');
        btn.className = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-red-600 transition hover:border-red-500 hover:bg-red-50';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        btn.addEventListener('click', () => deleteCandidate(row, btn));
        delTd.appendChild(btn);
        tr.appendChild(delTd);
      }
      cols.forEach((col) => {
        const c = /** @type {any} */ (col);
        const text = formatCell(row, c);
        cells[c.key] = text.toLowerCase();
        const td = document.createElement('td');
        td.className = 'whitespace-nowrap px-3 py-2 align-top text-slate-700';
        // Colour the Exam Result cell: green for a pass, red for a fail.
        if (c.key === 'exam_result' && text) {
          const ex = /** @type {any} */ (row).__exam || {};
          td.className = 'whitespace-nowrap px-3 py-2 align-top font-semibold '
            + (ex.passed === true ? 'text-emerald-600' : 'text-red-600');
        }
        // Highlight the Exam Status: amber while awaiting correction, green once corrected.
        if (c.key === 'exam_status' && text) {
          const ex = /** @type {any} */ (row).__exam || {};
          const cs = ex.correction_status;
          const cls = cs === 'CORRECTED' ? 'text-emerald-600'
            : (cs === 'WAITING_FOR_CORRECTION' || ex.status === 'SUBMITTED') ? 'text-amber-600'
            : cs === 'CORRECTING' ? 'text-indigo-600'
            : ex.status === 'IN_PROGRESS' ? 'text-blue-600'
            : 'text-slate-500';
          td.className = 'whitespace-nowrap px-3 py-2 align-top font-semibold ' + cls;
        }
        td.textContent = text;
        tr.appendChild(td);
      });
      if (showPrintCol) {
        const printTd = document.createElement('td');
        printTd.className = 'px-3 py-2 align-top';
        const ex = /** @type {any} */ (row).__exam || {};
        const passed = ex.correction_status === 'CORRECTED' && ex.passed === true;
        if (passed) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.title = gridI18n('psColPrint', 'Print');
          btn.className = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-[#042F8D] transition hover:border-[#042F8D] hover:bg-[#042F8D]/10';
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
          printTd.appendChild(btn);
        }
        tr.appendChild(printTd);
      }
      /** @type {any} */ (tr).__cells = cells;
      /** @type {any} */ (tr).__record = row;
      return tr;
    };

    // Progressive render plan for non-grouped tables: a flat list of data-row
    // jobs flushed to the DOM in chunks so large datasets stay responsive.
    /** @type {({ kind: 'group', el: HTMLElement } | { kind: 'row', rec: any, group?: string, years?: string, order: number })[]} */
    const renderPlan = [];
    let orderIndex = 0;

    tableEl.appendChild(tbody);
    gridBody.appendChild(tableEl);
    gridExpandGroup = null;
    gridLoadAllVisible = null;
    gridExpandAll = null;
    gridCollapseAll = null;
    gridLoadAllGroups = null;
    if (nestable) {
      // ── Hybrid grouped pagination ──────────────────────────────
      // Fetch lightweight group summaries (header + count), render a collapsible
      // header per training, and page each group's candidate rows lazily on
      // expand. The DOM stays small no matter how many candidates exist.
      const { groups: groupSummaries, unassigned } = await fetchGridGroups();
      if (renderToken !== gridRenderToken) return;
      const UNASSIGNED = '__none__';
      const PAGE_SIZE = 100;

      /** @type {{ key: string, tid: number|null, count: number, meta: any }[]} */
      const groupDescs = groupSummaries.map((/** @type {any} */ g) => ({
        key: g.training_id != null ? String(g.training_id) : UNASSIGNED,
        tid: g.training_id != null ? Number(g.training_id) : null,
        count: Number(g.candidate_count) || 0,
        meta: {
          training_title: g.training_title || '',
          trainer: g.trainer || '',
          date_from: g.date_from || '',
          date_to: g.date_to || '',
        },
      }));
      if (unassigned > 0) groupDescs.push({ key: UNASSIGNED, tid: null, count: unassigned, meta: {} });

      // Hide empty group-by buckets: a training with zero candidates gets no header.
      const visibleGroups = groupDescs.filter((d) => d.count > 0);

      gridCourseList = [];
      gridYearSet = new Set();
      let grand = 0;
      visibleGroups.forEach((d) => {
        grand += d.count;
        if (d.key !== UNASSIGNED) {
          const title = String(d.meta.training_title || '').trim();
          gridCourseList.push({ key: d.key, title: title || d.key });
          [d.meta.date_from, d.meta.date_to].forEach((dt) => {
            const y = String(dt || '').slice(0, 4);
            if (/^\d{4}$/.test(y)) gridYearSet.add(y);
          });
        }
      });
      gridGrandTotal = grand;
      populateGridFilters();

      let orderSeq = 0;
      /** @type {Map<string, { setExpanded: (open: boolean) => Promise<void>, loadAll: (cap: number) => Promise<void> }>} */
      const controllers = new Map();

      /** Build one collapsible group header with a lazy row loader. */
      const buildGroup = (/** @type {any} */ d) => {
        /** @type {string[]} */
        const years = [];
        [d.meta.date_from, d.meta.date_to].forEach((/** @type {any} */ dt) => {
          const y = String(dt || '').slice(0, 4);
          if (/^\d{4}$/.test(y) && !years.includes(y)) years.push(y);
        });
        const yearsCsv = years.join(',');
        const label = d.key === UNASSIGNED
          ? gridI18n('psGridUngrouped', 'No training assigned')
          : groupLabelFor(d.meta);

        const hr = document.createElement('tr');
        hr.dataset.groupHeader = d.key;
        hr.dataset.groupYear = yearsCsv;
        hr.dataset.expanded = 'false';
        hr.className = 'cursor-pointer select-none bg-[#042F8D]/5 hover:bg-[#042F8D]/10';
        const htd = document.createElement('td');
        htd.colSpan = titleRow.children.length;
        htd.className = 'border-y border-[#042F8D]/20 px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#042F8D]';
        const caret = document.createElement('span');
        caret.className = 'mr-1 inline-block';
        caret.textContent = '▸';
        const txt = document.createElement('span');
        txt.textContent = ' ' + label;
        const badge = document.createElement('span');
        badge.className = 'ml-2 rounded-full bg-[#042F8D]/10 px-2 py-0.5 text-[10px] font-semibold text-[#042F8D]';
        badge.textContent = String(d.count);
        htd.appendChild(caret);
        htd.appendChild(txt);
        htd.appendChild(badge);
        hr.appendChild(htd);
        tbody.appendChild(hr);

        // Anchor row: insertion point for this group's data rows and host for the
        // "Load more" / loading indicator. Always the last node of the group.
        const anchor = document.createElement('tr');
        anchor.dataset.groupAnchor = d.key;
        anchor.className = 'hidden';
        const anchorTd = document.createElement('td');
        anchorTd.colSpan = titleRow.children.length;
        anchorTd.className = 'px-3 py-2 text-center';
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'rounded-lg border border-[#042F8D]/30 px-3 py-1 text-xs font-semibold text-[#042F8D] transition hover:bg-[#042F8D]/10 disabled:opacity-50';
        anchorTd.appendChild(moreBtn);
        anchor.appendChild(anchorTd);
        tbody.appendChild(anchor);

        let loaded = 0;
        let expanded = false;
        let busy = false;

        const syncMore = () => {
          const remaining = d.count - loaded;
          if (expanded && remaining > 0 && loaded > 0) {
            anchor.classList.remove('hidden');
            moreBtn.disabled = false;
            moreBtn.textContent = gridI18n('psGridLoadMore', 'Load more') + ` (${remaining})`;
          } else {
            anchor.classList.add('hidden');
          }
        };

        const loadPage = async () => {
          if (busy) return;
          busy = true;
          moreBtn.disabled = true;
          anchor.classList.remove('hidden');
          moreBtn.textContent = gridI18n('psGridLoading', 'Loading…');
          const { rows } = await fetchGroupRows(d.tid, PAGE_SIZE, loaded);
          if (renderToken !== gridRenderToken) { busy = false; return; }
          rows.forEach((/** @type {any} */ rec) => {
            decorateExamFields(rec);
            const tr = buildDataRow(rec);
            tr.dataset.group = d.key;
            tr.dataset.groupYear = yearsCsv;
            /** @type {any} */ (tr).__origIndex = orderSeq++;
            tbody.insertBefore(tr, anchor);
          });
          loaded += rows.length;
          busy = false;
          syncMore();
          if (gridSort.key) applyGridSort();
          if (hasActiveGridFilter()) applyColumnFilters();
          updateGridCount();
        };

        moreBtn.addEventListener('click', (e) => { e.stopPropagation(); loadPage(); });

        const setExpanded = async (/** @type {boolean} */ open) => {
          expanded = open;
          hr.dataset.expanded = open ? 'true' : 'false';
          caret.textContent = open ? '▾' : '▸';
          Array.prototype.forEach.call(
            tbody.querySelectorAll('tr[data-row]'),
            (/** @type {HTMLElement} */ r) => {
              if (r.dataset.group === d.key) r.classList.toggle('hidden', !open);
            }
          );
          if (open) {
            if (loaded === 0 && d.count > 0) await loadPage();
            else syncMore();
          } else {
            anchor.classList.add('hidden');
          }
        };

        // Page-in every remaining row of this group (bounded by `cap` rows).
        const loadAll = async (/** @type {number} */ cap) => {
          await setExpanded(true);
          while (loaded < d.count && (!cap || loaded < cap)) {
            const before = loaded;
            await loadPage(); // eslint-disable-line no-await-in-loop
            if (loaded === before) break; // no progress → stop
          }
        };

        hr.addEventListener('click', () => setExpanded(!expanded));
        controllers.set(d.key, { setExpanded, loadAll });
      };

      visibleGroups.forEach(buildGroup);
      gridExpandGroup = async (/** @type {string} */ key) => {
        const c = controllers.get(key);
        if (c) await c.setExpanded(true);
      };
      gridLoadAllVisible = async () => {
        const CAP = 50000; // safety ceiling for an in-browser export
        for (const [key, ctl] of controllers) {
          const header = gridBody
            ? gridBody.querySelector(`#psGridRows tr[data-group-header="${cssAttr(key)}"]`)
            : null;
          if (header && header.classList.contains('hidden')) continue; // filtered out
          const loadedNow = gridBody ? gridBody.querySelectorAll('#psGridRows tr[data-row]').length : 0;
          if (loadedNow >= CAP) break;
          await ctl.loadAll(CAP - loadedNow); // eslint-disable-line no-await-in-loop
        }
      };
      gridExpandAll = async () => {
        for (const [, ctl] of controllers) {
          await ctl.setExpanded(true); // eslint-disable-line no-await-in-loop
        }
      };
      gridCollapseAll = () => {
        for (const [, ctl] of controllers) ctl.setExpanded(false);
      };
      gridLoadAllGroups = async () => {
        const CAP = 50000; // safety ceiling for in-browser search
        for (const [, ctl] of controllers) {
          const loadedNow = gridBody ? gridBody.querySelectorAll('#psGridRows tr[data-row]').length : 0;
          if (loadedNow >= CAP) break;
          await ctl.loadAll(CAP - loadedNow); // eslint-disable-line no-await-in-loop
        }
      };
      // Auto-expand the first group so the grid is not empty on open.
      if (visibleGroups.length) {
        const first = controllers.get(visibleGroups[0].key);
        if (first) await first.setExpanded(true);
      }
    } else {
      records.forEach((row) => {
        renderPlan.push({ kind: 'row', rec: row, order: orderIndex++ });
      });
      gridCourseList = [];
      gridYearSet = new Set();
      gridGrandTotal = 0;
      populateGridFilters();
      await renderRowsProgressive(tbody, renderPlan, buildDataRow, renderToken);
    }
    if (renderToken !== gridRenderToken) return; // a newer render superseded us

    // Empty / error state.
    const note = document.createElement('div');
    note.id = 'psGridNoRows';
    note.className = 'p-8 text-center text-sm text-slate-400';
    if (error) {
      note.textContent = gridI18n('psGridError', 'Could not load data. Is the server running?');
    } else if (!exists) {
      note.textContent = gridI18n('psGridNoTable', 'No data table is associated with this panel yet.');
    } else if (nestable ? gridGrandTotal === 0 : records.length === 0) {
      note.textContent = gridI18n('psGridNoData', 'No records found.');
    } else {
      note.classList.add('hidden');
    }
    gridBody.appendChild(note);
    // Re-apply an active sort to the freshly rendered rows (if the sorted
    // column is still present); otherwise reset the sort state.
    if (gridSort.key && cols.some((c) => /** @type {any} */ (c).key === gridSort.key)) {
      applyGridSort();
    } else {
      gridSort = { key: '', dir: 1 };
    }
    if (gridCourseFilter || gridYearFilter) applyColumnFilters();
    updateGridCount();
  };

  /** Update the ▲/▼/↕ arrow on every sortable header. */
  const updateSortArrows = () => {
    if (!gridBody) return;
    gridBody.querySelectorAll('thead th[data-col]').forEach((el) => {
      const th = /** @type {HTMLElement} */ (el);
      const arrow = th.querySelector('.gss-sort-arrow');
      if (!arrow) return;
      arrow.textContent = th.dataset.col === gridSort.key
        ? (gridSort.dir === 1 ? '▲' : '▼')
        : '↕';
    });
  };

  const isNumeric = (/** @type {string} */ s) => s !== '' && /^-?\d+(?:\.\d+)?$/.test(s.replace(/\s/g, ''));

  /** Sort an array of data rows in place by the active gridSort. */
  const sortRowList = (/** @type {any[]} */ rows) => {
    if (!gridSort.key) {
      rows.sort((a, b) =>
        (/** @type {any} */ (a).__origIndex || 0) - (/** @type {any} */ (b).__origIndex || 0));
      return;
    }
    const key = gridSort.key;
    const dir = gridSort.dir;
    rows.sort((a, b) => {
      const av = (/** @type {any} */ (a).__cells || {})[key] || '';
      const bv = (/** @type {any} */ (b).__cells || {})[key] || '';
      if (av === bv) return 0;
      // Empty cells always sort to the bottom regardless of direction.
      if (av === '') return 1;
      if (bv === '') return -1;
      let cmp;
      if (isNumeric(av) && isNumeric(bv)) {
        cmp = parseFloat(av) - parseFloat(bv);
      } else {
        const ad = Date.parse(av);
        const bd = Date.parse(bv);
        if (!Number.isNaN(ad) && !Number.isNaN(bd)) cmp = ad - bd;
        else cmp = av.localeCompare(bv);
      }
      return cmp * dir;
    });
  };

  /**
   * Reorder the currently rendered rows. When gridSort has a key, rows are
   * sorted by that column (asc/desc). When no key is set, the grid is restored
   * to its original/default order (the server order captured at render time).
   * When the grid is grouped (applicant), sorting stays within each group.
   */
  const applyGridSort = () => {
    if (!gridBody) return;
    collapseAllDetails();
    const tbody = gridBody.querySelector('#psGridRows');
    if (!tbody) return;

    const headers = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-group-header]'));
    if (headers.length) {
      headers.forEach((h) => {
        const header = /** @type {HTMLElement} */ (h);
        const key = header.dataset.groupHeader || '';
        const rows = Array.prototype.slice
          .call(tbody.querySelectorAll('tr[data-row]'))
          .filter((r) => /** @type {HTMLElement} */ (r).dataset.group === key);
        sortRowList(rows);
        let ref = /** @type {Node} */ (header);
        rows.forEach((r) => { tbody.insertBefore(r, ref.nextSibling); ref = r; });
      });
      updateSortArrows();
      return;
    }

    const rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-row]'));
    sortRowList(rows);
    rows.forEach((r) => tbody.appendChild(r));
    updateSortArrows();
  };

  /**
   * Three-state column sorting on header click:
   *   1st click → ascending, 2nd → descending, 3rd → clear (original order).
   */
  function sortGridBy(/** @type {any} */ col) {
    const key = col && col.key;
    if (!key) return;
    if (gridSort.key !== key) {
      gridSort = { key, dir: 1 };          // ascending
    } else if (gridSort.dir === 1) {
      gridSort = { key, dir: -1 };         // descending
    } else {
      gridSort = { key: '', dir: 1 };      // clear → restore default order
    }
    applyGridSort();
  }

  // ── Minimal XLSX (Office Open XML) writer — no external deps ────
  const xmlEsc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  /** 0-based column index → spreadsheet column letters (A, B, …, Z, AA…). */
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

  /** Build a ZIP archive (store / no compression) from named byte entries. */
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

  const XLSX_CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';
  const XLSX_ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const XLSX_WORKBOOK = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const XLSX_WB_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  // Style indexes (cellXfs order below): 0 default, 1 header, 2 group header,
  // 3 data text, 4 data number.
  const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF1F3864"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF042F8D"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="4">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE4DFEC"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFCCC0DA"/><bgColor indexed="64"/></patternFill></fill>' +
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
    '<cellXfs count="5">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /**
   * Export the grid to a genuine .xlsx workbook that opens directly in
   * Microsoft Excel. Only the currently visible (filtered) rows are exported,
   * in their current (sorted) order. The Expand, Edit, Delete and Print columns
   * are excluded.
   */
  const exportGridToExcel = async () => {
    if (!gridBody) return;
    // Hybrid grouped grid: page-in every visible group first so the export
    // reflects the full dataset (not just the rows lazily loaded on screen).
    if (gridLoadAllVisible) await gridLoadAllVisible();
    // Re-apply the active filters so freshly paged-in rows that don't match are
    // marked hidden and therefore excluded from the export.
    if (hasActiveGridFilter()) applyColumnFilters();
    collapseAllDetails();
    const headerRow = gridBody.querySelector('thead tr:first-child');
    const bodyRows = gridBody.querySelectorAll('#psGridRows tr[data-row], #psGridRows tr[data-group-header]');
    if (!headerRow || !bodyRows.length) return;

    const ths = Array.prototype.slice.call(headerRow.querySelectorAll('th'));
    // Column indexes to include (skip the Expand, Edit, Delete and Print columns).
    const includeIdx = ths
      .map((/** @type {HTMLElement} */ th, /** @type {number} */ i) => ({
        i,
        skip: th.hasAttribute('data-edit-col') || th.hasAttribute('data-expander-col')
          || th.hasAttribute('data-delete-col') || th.hasAttribute('data-print-col'),
      }))
      .filter((x) => !x.skip)
      .map((x) => x.i);
    // Header text without the ↕/▲/▼ sort-arrow glyphs.
    const headers = includeIdx.map((i) => (ths[i].textContent || '').replace(/[↕▲▼]/g, '').trim());

    // Row model: type drives the Excel styling (header / group / data).
    /** @type {{ type: 'header' | 'group' | 'data', cells: string[] }[]} */
    const model = [{ type: 'header', cells: headers }];
    bodyRows.forEach((el) => {
      const tr = /** @type {HTMLElement} */ (el);
      if (tr.classList.contains('hidden')) return; // filtered out
      if (tr.hasAttribute('data-group-header')) {
        const label = (tr.textContent || '').trim();
        model.push({ type: 'group', cells: includeIdx.map((_, j) => (j === 0 ? label : '')) });
        return;
      }
      const tds = Array.prototype.slice.call(tr.children);
      model.push({ type: 'data', cells: includeIdx.map((i) => (tds[i] ? (tds[i].textContent || '').trim() : '')) });
    });

    const colCount = headers.length;
    const isNum = (/** @type {string} */ v) => v !== '' && /^-?\d+(?:\.\d+)?$/.test(v);

    // A slim empty spacer column (A) and an empty first row precede the table.
    const COL0 = 1;
    const ROW0 = 1;

    // Auto column widths from the longest cell in each column.
    const widths = new Array(colCount).fill(10);
    model.forEach((row) => {
      if (row.type === 'group') return; // spans all columns; ignore for width
      row.cells.forEach((val, c) => {
        widths[c] = Math.max(widths[c], String(val).length + 2);
      });
    });
    let colsXml = '<cols>';
    colsXml += '<col min="1" max="1" width="3" customWidth="1"/>'; // spacer column A
    for (let c = 0; c < colCount; c++) {
      const w = Math.min(Math.max(widths[c], 10), 60);
      colsXml += `<col min="${c + 1 + COL0}" max="${c + 1 + COL0}" width="${w}" customWidth="1"/>`;
    }
    colsXml += '</cols>';

    /** @type {string[]} */
    const merges = [];
    let rowsXml = '';
    model.forEach((row, r) => {
      const rowNum = r + 1 + ROW0;
      let cellsXml = '';
      if (row.type === 'group') {
        // Merge the label across every column for a clean banner row.
        if (colCount > 1) merges.push(`${colLetter(COL0)}${rowNum}:${colLetter(colCount - 1 + COL0)}${rowNum}`);
        for (let c = 0; c < colCount; c++) {
          const ref = colLetter(c + COL0) + rowNum;
          const val = c === 0 ? row.cells[0] : '';
          cellsXml += `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
        }
        rowsXml += `<row r="${rowNum}">${cellsXml}</row>`;
        return;
      }
      row.cells.forEach((val, c) => {
        const ref = colLetter(c + COL0) + rowNum;
        if (row.type === 'header') {
          cellsXml += `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
        } else if (isNum(val)) {
          cellsXml += `<c r="${ref}" s="4"><v>${val}</v></c>`;
        } else {
          cellsXml += `<c r="${ref}" s="3" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
        }
      });
      rowsXml += `<row r="${rowNum}"${row.type === 'header' ? ' ht="22" customHeight="1"' : ''}>${cellsXml}</row>`;
    });
    const mergeXml = merges.length
      ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
    const dim = `A1:${colLetter(colCount - 1 + COL0)}${model.length + ROW0}`;
    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<dimension ref="${dim}"/>` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      colsXml +
      '<sheetData>' + rowsXml + '</sheetData>' +
      mergeXml +
      '</worksheet>';

    const enc = new TextEncoder();
    const zip = zipStore([
      { name: '[Content_Types].xml', data: enc.encode(XLSX_CONTENT_TYPES) },
      { name: '_rels/.rels', data: enc.encode(XLSX_ROOT_RELS) },
      { name: 'xl/workbook.xml', data: enc.encode(XLSX_WORKBOOK) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(XLSX_WB_RELS) },
      { name: 'xl/styles.xml', data: enc.encode(XLSX_STYLES) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml) },
    ]);

    const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.download = `${gridTab || 'grid'}-${stamp}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const gridExportBtn = document.getElementById('psGridExport');
  gridExportBtn?.addEventListener('click', exportGridToExcel);

  gridExpandAllBtn?.addEventListener('click', async () => {
    if (gridExpandAll) await gridExpandAll();
    if (gridCourseFilter || gridYearFilter) applyColumnFilters();
    updateGridCount();
  });
  gridCollapseAllBtn?.addEventListener('click', () => {
    if (gridCollapseAll) gridCollapseAll();
    updateGridCount();
  });

  /** Rebuild the Course / Year dropdown options from the current grid, and
   * show or hide the filter controls when no groups are present. */
  function populateGridFilters() {
    const hasFilters = gridCourseList.length > 0 || gridYearSet.size > 0;
    if (gridFiltersRoot) gridFiltersRoot.style.display = hasFilters ? 'flex' : 'none';
    if (gridCourseSel) {
      const courses = gridCourseList
        .filter((c, i, a) => a.findIndex((x) => x.key === c.key) === i)
        .sort((a, b) => a.title.localeCompare(b.title));
      if (!courses.some((c) => c.key === gridCourseFilter)) gridCourseFilter = '';
      const allLabel = gridI18n('psGridAllCourses', 'All courses');
      gridCourseSel.innerHTML = '';
      const optAll = document.createElement('option');
      optAll.value = '';
      optAll.textContent = allLabel;
      gridCourseSel.appendChild(optAll);
      courses.forEach((c) => {
        const o = document.createElement('option');
        o.value = c.key;
        o.textContent = c.title;
        gridCourseSel.appendChild(o);
      });
      gridCourseSel.value = gridCourseFilter;
    }
    if (gridYearSel) {
      const years = Array.from(gridYearSet).sort((a, b) => Number(b) - Number(a));
      if (!years.includes(gridYearFilter)) gridYearFilter = '';
      const allLabel = gridI18n('psGridAllYears', 'All years');
      gridYearSel.innerHTML = '';
      const optAll = document.createElement('option');
      optAll.value = '';
      optAll.textContent = allLabel;
      gridYearSel.appendChild(optAll);
      years.forEach((y) => {
        const o = document.createElement('option');
        o.value = y;
        o.textContent = y;
        gridYearSel.appendChild(o);
      });
      gridYearSel.value = gridYearFilter;
    }
  }

  gridCourseSel?.addEventListener('change', async () => {
    gridCourseFilter = gridCourseSel.value;
    // Selecting a specific course expands + lazily loads that group so its rows
    // are present to display.
    if (gridCourseFilter && gridExpandGroup) await gridExpandGroup(gridCourseFilter);
    applyColumnFilters();
  });
  gridYearSel?.addEventListener('change', async () => {
    gridYearFilter = gridYearSel.value;
    // A year filter can match several groups; expand each matching one so their
    // rows load before filtering.
    if (gridYearFilter && gridExpandGroup && gridBody) {
      /** @type {string[]} */
      const keys = [];
      gridBody.querySelectorAll('#psGridRows tr[data-group-header]').forEach((h) => {
        const header = /** @type {HTMLElement} */ (h);
        if ((header.dataset.groupYear || '').split(',').indexOf(gridYearFilter) !== -1) {
          keys.push(header.dataset.groupHeader || '');
        }
      });
      for (const k of keys) await gridExpandGroup(k); // eslint-disable-line no-await-in-loop
    }
    applyColumnFilters();
  });

  /** True when any grid filter (course, year, or a column text box) is active. */
  function hasActiveGridFilter() {
    if (gridCourseFilter || gridYearFilter) return true;
    if (!gridBody) return false;
    return Array.prototype.some.call(
      gridBody.querySelectorAll('thead input[data-col]'),
      (/** @type {HTMLInputElement} */ i) => i.value.trim() !== ''
    );
  }

  /** Column-filter input handler. When a text filter is active on a grouped grid
   * we first page-in every group so the search spans the whole dataset, then
   * reveal matches under their (auto-expanded) group headers. Debounced so we
   * don't page-load on every keystroke. */
  function onColumnFilterInput() {
    if (colFilterTimer) clearTimeout(colFilterTimer);
    colFilterTimer = setTimeout(async () => {
      const anyText = gridBody
        ? Array.prototype.some.call(
            gridBody.querySelectorAll('thead input[data-col]'),
            (/** @type {HTMLInputElement} */ i) => i.value.trim() !== ''
          )
        : false;
      if (anyText && gridLoadAllGroups) await gridLoadAllGroups();
      applyColumnFilters();
    }, 180);
  }

  /** Filter grid rows by every column filter (AND across columns). */
  function applyColumnFilters() {
    if (!gridBody) return;
    collapseAllDetails();
    const inputs = gridBody.querySelectorAll('thead input[data-col]');
    /** @type {Record<string, string>} */
    const query = {};
    inputs.forEach((el) => {
      const input = /** @type {HTMLInputElement} */ (el);
      query[input.dataset.col || ''] = input.value.trim().toLowerCase();
    });
    const hasColFilter = Object.keys(query).some((k) => query[k]);

    const rows = gridBody.querySelectorAll('#psGridRows tr[data-row]');
    let shown = 0;
    /** @type {Set<string>} Groups holding at least one matching row. */
    const matchedGroups = new Set();
    rows.forEach((el) => {
      const tr = /** @type {any} */ (el);
      const cells = tr.__cells || {};
      const colMatch = Object.keys(query).every((k) => !query[k] || (cells[k] || '').includes(query[k]));
      const extMatch = !externalRowFilter || externalRowFilter(tr.__record || {});
      const courseMatch = !gridCourseFilter || tr.dataset.group === gridCourseFilter;
      const yearMatch = !gridYearFilter
        || (tr.dataset.groupYear || '').split(',').indexOf(gridYearFilter) !== -1;
      const contentMatch = colMatch && extMatch && courseMatch && yearMatch;
      let match;
      if (hasColFilter) {
        // Text filter: reveal matching rows under their group regardless of the
        // group's collapsed state, and remember which groups matched.
        match = contentMatch;
        if (match && tr.dataset.group != null) matchedGroups.add(tr.dataset.group);
      } else {
        // No text filter: a collapsed group's rows stay hidden.
        const header = tr.dataset.group != null
          ? gridBody.querySelector(`#psGridRows tr[data-group-header="${cssAttr(tr.dataset.group)}"]`)
          : null;
        const groupOpen = !header || /** @type {HTMLElement} */ (header).dataset.expanded !== 'false';
        match = contentMatch && groupOpen;
      }
      tr.classList.toggle('hidden', !match);
      if (match) shown += 1;
    });

    // Group headers: hidden when a course/year filter excludes the whole group,
    // and — while a text filter is active — when the group has no matching rows.
    // Matching groups are shown expanded so their filtered rows are visible.
    gridBody.querySelectorAll('#psGridRows tr[data-group-header]').forEach((h) => {
      const header = /** @type {HTMLElement} */ (h);
      const key = header.dataset.groupHeader || '';
      let visible = true;
      if (gridCourseFilter) visible = key === gridCourseFilter;
      if (visible && gridYearFilter) {
        visible = (header.dataset.groupYear || '').split(',').indexOf(gridYearFilter) !== -1;
      }
      if (visible && hasColFilter) {
        visible = matchedGroups.has(key);
        if (visible) {
          header.dataset.expanded = 'true';
          const caret = header.querySelector('span');
          if (caret) caret.textContent = '▾';
        }
      }
      header.classList.toggle('hidden', !visible);
      const anchor = gridBody.querySelector(`#psGridRows tr[data-group-anchor="${cssAttr(key)}"]`);
      if (anchor && !visible) anchor.classList.add('hidden');
    });

    const noRows = document.getElementById('psGridNoRows');
    if (noRows && rows.length) noRows.classList.toggle('hidden', shown > 0);
    updateGridCount(shown);
  }

  const updateGridCount = (/** @type {number} */ shown = -1) => {
    if (!gridCount) return;
    const loaded = gridBody ? gridBody.querySelectorAll('#psGridRows tr[data-row]').length : 0;
    // Hybrid grouped grid: report the true dataset size plus how many rows are
    // currently loaded in the DOM (only a subset is paged in).
    if (gridGrandTotal > 0) {
      gridCount.textContent = `${gridI18n('psGridTotal', 'Total')}: ${gridGrandTotal} · `
        + `${gridI18n('psGridLoaded', 'loaded')} ${loaded}`;
      return;
    }
    const n = shown >= 0 ? shown : loaded;
    gridCount.textContent = loaded ? `${gridI18n('psGridTotal', 'Total')}: ${n}` : '';
  };

  /** Escape a value for safe use inside a CSS attribute selector ("..."). */
  const cssAttr = (/** @type {string} */ v) => String(v == null ? '' : v).replace(/["\\]/g, '\\$&');

  // ── Column customizer (drag & drop between the two lists) ──────
  /** @type {HTMLElement | null} */
  let dragEl = null;

  const makeColItem = (/** @type {string} */ key) => {
    const col = colOf(key);
    if (!col) return null;
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.key = key;
    li.className =
      'flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition active:cursor-grabbing';
    li.insertAdjacentHTML(
      'afterbegin',
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>'
    );
    const span = document.createElement('span');
    span.className = 'truncate';
    span.textContent = colLabel(col);
    li.appendChild(span);
    li.addEventListener('dragstart', () => {
      dragEl = li;
      li.classList.add('opacity-50');
    });
    li.addEventListener('dragend', () => {
      dragEl = null;
      li.classList.remove('opacity-50');
    });
    return li;
  };

  // Non-draggable header shown above each Tab Name group in the Available list.
  const makeGroupHeader = (/** @type {string} */ label) => {
    const li = document.createElement('li');
    li.dataset.groupHeader = '1';
    li.draggable = false;
    li.className = 'mt-2 mb-0.5 px-1 text-[10px] font-bold uppercase tracking-wide text-[#042F8D]/70 first:mt-0';
    li.textContent = label;
    return li;
  };

  const renderColumnLists = (/** @type {string[]} */ displayedArr) => {
    if (!colsAvailable || !colsDisplayed) return;
    colsDisplayed.innerHTML = '';
    colsAvailable.innerHTML = '';
    displayedArr.forEach((k) => {
      const li = makeColItem(k);
      if (li) colsDisplayed.appendChild(li);
    });
    // Available (hidden) columns, grouped under their Tab Name header so users
    // can see which columns belong to each tab.
    const availKeys = APPLICANT_COLUMNS.filter((c) => !displayedArr.includes(c.key)).map((c) => c.key);
    const groupOrder = COL_GROUPS.map((g) => g.key).concat(['__other']);
    groupOrder.forEach((gk) => {
      const cols = APPLICANT_COLUMNS.filter((c) =>
        availKeys.includes(c.key) &&
        (gk === '__other' ? !COL_GROUPS.some((g) => g.key === c.group) : c.group === gk));
      if (!cols.length) return;
      colsAvailable.appendChild(makeGroupHeader(gk === '__other' ? gridI18n('psColsOther', 'Other') : groupLabelOf(gk)));
      cols.forEach((c) => {
        const li = makeColItem(c.key);
        if (li) colsAvailable.appendChild(li);
      });
    });
  };

  const getDragAfter = (/** @type {HTMLElement} */ zone, /** @type {number} */ y) => {
    const items = /** @type {HTMLElement[]} */ (
      Array.prototype.slice.call(zone.querySelectorAll('li:not(.opacity-50):not([data-group-header])'))
    );
    let closest = /** @type {{ offset: number, element: HTMLElement | null }} */ ({ offset: -Infinity, element: null });
    items.forEach((child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
    });
    return closest.element;
  };

  [colsAvailable, colsDisplayed].forEach((zone) => {
    if (!zone) return;
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragEl) return;
      const after = getDragAfter(/** @type {HTMLElement} */ (zone), /** @type {DragEvent} */ (e).clientY);
      if (after == null) zone.appendChild(dragEl);
      else zone.insertBefore(dragEl, after);
    });
  });

  const colsOpen = () => !!gridColsPanel && !gridColsPanel.classList.contains('hidden');
  const openCols = () => {
    if (!gridColsPanel) return;
    renderColumnLists(displayedKeys.slice());
    gridColsPanel.classList.remove('hidden');
    gridColsBtn?.setAttribute('aria-expanded', 'true');
  };
  const closeCols = () => {
    gridColsPanel?.classList.add('hidden');
    gridColsBtn?.setAttribute('aria-expanded', 'false');
  };

  gridColsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    colsOpen() ? closeCols() : openCols();
  });
  gridColsCancel?.addEventListener('click', closeCols);
  gridColsReset?.addEventListener('click', () => renderColumnLists(defaultDisplayed()));
  gridColsApply?.addEventListener('click', () => {
    if (colsDisplayed) {
      const keys = /** @type {string[]} */ (
        Array.prototype.slice.call(colsDisplayed.querySelectorAll('li'))
          .map((li) => /** @type {HTMLElement} */ (li).dataset.key)
          .filter(Boolean)
      );
      if (keys.length) {
        displayedKeys = keys;
        saveDisplayed();
      }
    }
    closeCols();
    renderDataGrid();
  });
  document.addEventListener('click', (e) => {
    if (colsOpen() && e.target instanceof Node && gridColsRoot && !gridColsRoot.contains(e.target)) {
      closeCols();
    }
  });

  //#region RENDER GRI VIEW
  // ── Open / close the grid overlay ──────────────────────────────
  // The grid is Applicant-only: it always renders the applicant table.
  const openGrid = () => {
    if (!gridOverlay) return;
    externalRowFilter = null;
    gridTab = 'registration';
    gridOverlay.classList.remove('hidden');
    gridOverlay.setAttribute('aria-hidden', 'false');
    // Re-fetch fresh data each time the grid is opened.
    clearTableCache();
    renderDataGrid();
  };
  const closeGrid = () => {
    if (!gridOverlay) return;
    gridOverlay.classList.add('hidden');
    gridOverlay.setAttribute('aria-hidden', 'true');
  };

  gridBtn?.addEventListener('click', () => (gridIsOpen() ? closeGrid() : openGrid()));
  gridClose?.addEventListener('click', closeGrid);
  gridOverlay?.addEventListener('click', (e) => {
    if (e.target === gridOverlay) closeGrid();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gridIsOpen()) closeGrid();
  });
  //#endregion






  // ── Language sync ──────────────────────────────────────────────
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      window.setTimeout(() => {
        // Re-render the grid + column customizer in the new language.
        if (gridIsOpen()) renderDataGrid();
        if (colsOpen()) renderColumnLists(displayedKeys.slice());
      }, 0);
    })
  );

  // ── Public grid API (toolbar notification bells) ───────────────
  // Opens the applicant grid pre-filtered. `filterByColumn` sets a column
  // filter (e.g. interview_result = Pending); `filterByPredicate` applies an
  // arbitrary record predicate (e.g. the Secretary work queue).
  const openGridFiltered = async (/** @type {string} */ tab) => {
    if (!gridOverlay) return;
    gridTab = tab;
    gridOverlay.classList.remove('hidden');
    gridOverlay.setAttribute('aria-hidden', 'false');
    clearTableCache();
    await renderDataGrid();
  };

  /** @type {any} */ (window).GSSGrid = {
    async filterByColumn(/** @type {string} */ tab, /** @type {string} */ colKey, /** @type {string} */ value) {
      externalRowFilter = null;
      await openGridFiltered(tab || 'registration');
      const input = gridBody && /** @type {HTMLInputElement | null} */ (gridBody.querySelector(`thead input[data-col="${colKey}"]`));
      if (input) input.value = value;
      applyColumnFilters();
    },
    async filterByPredicate(/** @type {string} */ tab, /** @type {(r: Record<string, any>) => boolean} */ predicate) {
      externalRowFilter = typeof predicate === 'function' ? predicate : null;
      await openGridFiltered(tab || 'registration');
      applyColumnFilters();
    },
  };
})();
