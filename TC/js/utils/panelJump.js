// @ts-check
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

  const panelRoot = document.getElementById('psPanel');
  const panelBtn = document.getElementById('psPanelBtn');
  const panelLabel = document.getElementById('psPanelLabel');
  const panelChevron = document.getElementById('psPanelChevron');
  const panelMenu = document.getElementById('psPanelMenu');

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

  // Grid's searchable panel dropdown.
  const gridPanel = document.getElementById('gridPanel');
  const gridPanelBtn = document.getElementById('gridPanelBtn');
  const gridPanelLabel = document.getElementById('gridPanelLabel');
  const gridPanelChevron = document.getElementById('gridPanelChevron');
  const gridPanelMenu = document.getElementById('gridPanelMenu');
  const gridPanelSearch = /** @type {HTMLInputElement | null} */ (document.getElementById('gridPanelSearch'));
  const gridPanelList = document.getElementById('gridPanelList');
  const gridPanelEmpty = document.getElementById('gridPanelEmpty');

  if (!panelRoot || !panelBtn || !panelLabel || !panelMenu ||
      !searchRoot || !searchInput || !results || !resultsList || !empty) return;

  /** @type {string} '' means all panels. */
  let selectedTab = '';
  /** @type {string} label shown for the "all panels" option. */
  let allPanelsLabel = panelLabel.textContent || 'All panels';
  /** @type {number} highlighted result index (-1 = none). */
  let activeIndex = -1;

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

  // ══════════════════ PANEL SELECTOR DROPDOWN ══════════════════
  const menuOpen = () => !panelMenu.classList.contains('hidden');

  const renderPanelMenu = () => {
    const items = [{ tab: '', name: allPanelsLabel }, ...collectPanels()];
    panelMenu.innerHTML = '';
    items.forEach(({ tab, name }) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.tab = tab;
      const active = tab === selectedTab;
      li.setAttribute('aria-selected', String(active));
      li.className =
        'flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-[#042F8D]/10 hover:text-[#042F8D] ' +
        (active ? 'bg-[#042F8D]/10 text-[#042F8D]' : 'text-slate-700');
      const span = document.createElement('span');
      span.className = 'truncate';
      span.textContent = name;
      li.appendChild(span);
      if (active) {
        li.insertAdjacentHTML(
          'beforeend',
          '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        );
      }
      li.addEventListener('click', () => {
        selectedTab = tab;
        panelLabel.textContent = tab ? name : allPanelsLabel;
        closePanelMenu();
        runSearch();
        searchInput.focus();
      });
      panelMenu.appendChild(li);
    });
  };

  const openPanelMenu = () => {
    renderPanelMenu();
    panelMenu.classList.remove('hidden');
    panelBtn.setAttribute('aria-expanded', 'true');
    panelChevron?.classList.add('rotate-180');
  };
  const closePanelMenu = () => {
    panelMenu.classList.add('hidden');
    panelBtn.setAttribute('aria-expanded', 'false');
    panelChevron?.classList.remove('rotate-180');
  };

  panelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuOpen() ? closePanelMenu() : openPanelMenu();
  });

  // ══════════════════════ INFO SEARCH ══════════════════════════
  // Elements that count as searchable "info" within a panel.
  const ITEM_SELECTOR = 'label, legend, h3, h4, h5, li, p';

  /** Own trimmed text of an element (single line). */
  const textOf = (/** @type {Element} */ el) =>
    (el.textContent || '').replace(/\s+/g, ' ').trim();

  /** Build the searchable items for one panel. */
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

  /** Open the grid overlay focused on a given panel. */
  const openGridForTab = (/** @type {string} */ tab) => {
    gridTab = tab;
    if (gridPanelLabel) gridPanelLabel.textContent = panelNameOf(tab);
    closeResults();
    openGrid();
  };

  /**
   * Open the form modal for a record: switch to the panel and populate every
   * field (editable Registration + read-only Conditions/Rules/Commitment).
   * @param {string} tab
   * @param {Record<string, any>} record
   */
  const openRecordForm = (/** @type {string} */ tab, /** @type {Record<string, any>} */ record) => {
    const modal = document.getElementById('formModal');
    // Open the modal directly (do NOT click #openFormBtn — that resets to New mode).
    if (modal && modal.classList.contains('hidden')) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    document.getElementById(`tab-btn-${tab}`)?.click();
    closeResults();
    closeGrid();
    const linker = /** @type {any} */ (window).GSSApplicant;
    if (tab === 'registration' && linker && typeof linker.load === 'function') {
      window.setTimeout(() => linker.load(record), 60);
    }
  };

  /** Search the PostgreSQL table associated with the selected panel. */
  const runSearch = async () => {
    const q = searchInput.value.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!q) {
      closeResults();
      resultsList.innerHTML = '';
      return;
    }

    const tab = selectedTab || 'registration';
    const table = tableFor(tab);

    resultsList.innerHTML = '';
    if (!table) {
      empty.textContent = gridI18n('psSearchNoTable', 'No data table is associated with this panel.');
      empty.classList.remove('hidden');
      results.classList.remove('hidden');
      highlightResult(-1);
      return;
    }

    let records;
    if (tab === 'registration') {
      // Server-side search through the registration_search stored procedure.
      records = await fetchRegistrationSearch(q);
    } else {
      const res = await fetchTable(table);
      records = res.records.filter((rec) => Object.values(rec).some((v) => v != null && String(v).toLowerCase().includes(q)));
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

      const text = document.createElement('span');
      text.className = 'truncate text-sm font-medium text-slate-700';
      text.innerHTML = highlightMatch(recordPrimary(rec) || sub || q, q);

      li.appendChild(badge);
      li.appendChild(text);
      li.addEventListener('click', () => openRecordForm(tab, rec));
      li.addEventListener('mousemove', () => highlightResult(visibleResults().indexOf(li)));
      resultsList.appendChild(li);
    });

    empty.textContent = gridI18n('noPanelFound', 'No results found');
    empty.classList.toggle('hidden', matches.length > 0);
    results.classList.remove('hidden');
    highlightResult(matches.length ? 0 : -1);
  };

  // ── Navigate to a matched element and highlight it ─────────────
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
    if (menuOpen() && !panelRoot.contains(e.target)) closePanelMenu();
    if (!results.classList.contains('hidden') && !searchRoot.contains(e.target)) closeResults();
  });

  // ══════════════ APPLICANT DATA GRID (customizable columns) ═════
  // Which panel is currently shown in the grid ('' = none).
  let gridTab = '';

  const gridIsOpen = () => !!gridOverlay && !gridOverlay.classList.contains('hidden');
  const gridMenuOpen = () => !!gridPanelMenu && !gridPanelMenu.classList.contains('hidden');

  // Column customizer DOM.
  const gridColsRoot = document.getElementById('gridCols');
  const gridColsBtn = document.getElementById('gridColsBtn');
  const gridColsPanel = document.getElementById('gridColsPanel');
  const colsAvailable = document.getElementById('colsAvailable');
  const colsDisplayed = document.getElementById('colsDisplayed');
  const gridColsApply = document.getElementById('gridColsApply');
  const gridColsCancel = document.getElementById('gridColsCancel');
  const gridColsReset = document.getElementById('gridColsReset');

  // API base: relative when served by the Node server, otherwise the local
  // test server (covers Live Server on :5500 and file:// previews).
  const API_BASE =
    (location.protocol.startsWith('http') && location.port !== '5500') ? '' : 'http://localhost:3000';

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
  /** @type {{ key: string, i18n: string, label: string, type?: string }[]} */
  const APPLICANT_COLUMNS = [
    { key: 'candidate_no', i18n: 'gcCandidateNo', label: 'Candidate No.' },
    { key: 'full_name', i18n: 'gcFullName', label: 'Full Name' },
    { key: 'registration_date', i18n: 'gcRegistrationDate', label: 'Registration Date', type: 'date' },
    { key: 'nationality', i18n: 'gcNationality', label: 'Nationality' },
    { key: 'place_of_birth', i18n: 'gcPlaceOfBirth', label: 'Place of Birth' },
    { key: 'gender', i18n: 'gcGender', label: 'Gender' },
    { key: 'date_of_birth', i18n: 'gcDateOfBirth', label: 'Date of Birth', type: 'date' },
    { key: 'phone_1', i18n: 'gcPhone1', label: 'Phone (1)' },
    { key: 'phone_2', i18n: 'gcPhone2', label: 'Phone (2)' },
    { key: 'email', i18n: 'gcEmail', label: 'Email' },
    { key: 'father_name', i18n: 'gcFatherName', label: "Father's Name" },
    { key: 'mother_name', i18n: 'gcMotherName', label: "Mother's Name" },
    { key: 'marital_status', i18n: 'gcMaritalStatus', label: 'Marital Status' },
    { key: 'education_level', i18n: 'gcEducationLevel', label: 'Education Level' },
    { key: 'full_address', i18n: 'gcFullAddress', label: 'Full Address' },
    { key: 'id_pass_no', i18n: 'gcIdPassNo', label: 'Card ID / Passport No.' },
    { key: 'is_french_literate', i18n: 'gcIsFrenchLiterate', label: 'Can you read and write in French?' },
    { key: 'has_security_experience', i18n: 'gcHasSecurityExperience', label: 'Do you have experience in the security field?' },
    { key: 'has_health_issues', i18n: 'gcHasHealthIssues', label: 'Do you suffer from any illness that could affect your work?' },
    { key: 'interview_result', i18n: 'gcInterviewResult', label: 'Interview Result' },
    { key: 'ispaid', i18n: 'gcIsPaid', label: 'Payment (25,000 CDF training syllabus)' },
    { key: 'remarks', i18n: 'gcRemarks', label: 'Remarks' }
  ];

  const DEFAULT_DISPLAYED = ['candidate_no', 'full_name', 'registration_date', 'nationality', 'place_of_birth', 'gender'];
  const COLS_STORAGE = 'gss-grid-columns';

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
    return DEFAULT_DISPLAYED.slice();
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
  const clearTableCache = () => { Object.keys(tableCache).forEach((k) => delete tableCache[k]); };

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

  /** Search the applicant table server-side via the registration_search proc. */
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
      if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
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

  /** Render the data grid for the selected panel's table. */
  const renderDataGrid = async () => {
    if (!gridBody) return;
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
    const { columns: serverColumns, records, error, exists } = await fetchTable(table);
    const cols = columnsForTable(table, serverColumns);
    const editTab = panelForTable(table);
    gridBody.innerHTML = '';

    const tableEl = document.createElement('table');
    tableEl.className = 'w-full border-collapse text-sm';

    const thead = document.createElement('thead');
    thead.className = 'sticky top-0 z-10';

    const titleRow = document.createElement('tr');
    titleRow.className = 'bg-[#042F8D] text-white';
    if (editTab) {
      const th = document.createElement('th');
      th.className = 'w-14 whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide';
      th.textContent = gridI18n('psColEdit', 'Edit');
      titleRow.appendChild(th);
    }
    cols.forEach((col) => {
      const th = document.createElement('th');
      th.className = 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide';
      th.textContent = headerLabel(col);
      titleRow.appendChild(th);
    });

    const filterRow = document.createElement('tr');
    filterRow.className = 'bg-slate-100 shadow-sm';
    if (editTab) {
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
      input.addEventListener('input', applyColumnFilters);
      th.appendChild(input);
      filterRow.appendChild(th);
    });

    thead.appendChild(titleRow);
    thead.appendChild(filterRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = 'psGridRows';
    tbody.className = 'divide-y divide-slate-100 bg-white';
    records.forEach((row) => {
      const tr = document.createElement('tr');
      tr.className = 'transition-colors hover:bg-[#042F8D]/5';
      /** @type {Record<string, string>} */
      const cells = {};
      if (editTab) {
        const editTd = document.createElement('td');
        editTd.className = 'px-3 py-2 align-top';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = gridI18n('psColEdit', 'Edit');
        btn.className = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-[#042F8D] transition hover:border-[#042F8D] hover:bg-[#042F8D]/10';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
        btn.addEventListener('click', () => openRecordForm(editTab, row));
        editTd.appendChild(btn);
        tr.appendChild(editTd);
      }
      cols.forEach((col) => {
        const c = /** @type {any} */ (col);
        const text = formatCell(row, c);
        cells[c.key] = text.toLowerCase();
        const td = document.createElement('td');
        td.className = 'whitespace-nowrap px-3 py-2 align-top text-slate-700';
        td.textContent = text;
        tr.appendChild(td);
      });
      /** @type {any} */ (tr).__cells = cells;
      tbody.appendChild(tr);
    });
    tableEl.appendChild(tbody);
    gridBody.appendChild(tableEl);

    // Empty / error state.
    const note = document.createElement('div');
    note.id = 'psGridNoRows';
    note.className = 'p-8 text-center text-sm text-slate-400';
    if (error) {
      note.textContent = gridI18n('psGridError', 'Could not load data. Is the server running?');
    } else if (!exists) {
      note.textContent = gridI18n('psGridNoTable', 'No data table is associated with this panel yet.');
    } else if (records.length === 0) {
      note.textContent = gridI18n('psGridNoData', 'No records found.');
    } else {
      note.classList.add('hidden');
    }
    gridBody.appendChild(note);
    updateGridCount();
  };

  /** Filter grid rows by every column filter (AND across columns). */
  function applyColumnFilters() {
    if (!gridBody) return;
    const inputs = gridBody.querySelectorAll('thead input[data-col]');
    /** @type {Record<string, string>} */
    const query = {};
    inputs.forEach((el) => {
      const input = /** @type {HTMLInputElement} */ (el);
      query[input.dataset.col || ''] = input.value.trim().toLowerCase();
    });

    const rows = gridBody.querySelectorAll('#psGridRows tr');
    let shown = 0;
    rows.forEach((el) => {
      const tr = /** @type {any} */ (el);
      const cells = tr.__cells || {};
      const match = Object.keys(query).every((k) => !query[k] || (cells[k] || '').includes(query[k]));
      tr.classList.toggle('hidden', !match);
      if (match) shown += 1;
    });

    const noRows = document.getElementById('psGridNoRows');
    if (noRows && rows.length) noRows.classList.toggle('hidden', shown > 0);
    updateGridCount(shown);
  }

  const updateGridCount = (/** @type {number} */ shown = -1) => {
    if (!gridCount) return;
    const total = gridBody ? gridBody.querySelectorAll('#psGridRows tr').length : 0;
    const n = shown >= 0 ? shown : total;
    gridCount.textContent = total ? `${n}/${total}` : '';
  };

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

  const renderColumnLists = (/** @type {string[]} */ displayedArr) => {
    if (!colsAvailable || !colsDisplayed) return;
    colsDisplayed.innerHTML = '';
    colsAvailable.innerHTML = '';
    displayedArr.forEach((k) => {
      const li = makeColItem(k);
      if (li) colsDisplayed.appendChild(li);
    });
    APPLICANT_COLUMNS.filter((c) => !displayedArr.includes(c.key)).forEach((c) => {
      const li = makeColItem(c.key);
      if (li) colsAvailable.appendChild(li);
    });
  };

  const getDragAfter = (/** @type {HTMLElement} */ zone, /** @type {number} */ y) => {
    const items = /** @type {HTMLElement[]} */ (
      Array.prototype.slice.call(zone.querySelectorAll('li:not(.opacity-50)'))
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
  gridColsReset?.addEventListener('click', () => renderColumnLists(DEFAULT_DISPLAYED.slice()));
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

  // ── Searchable panel dropdown inside the grid ──────────────────
  // The grid groups Registration / Conditions / Rules / Commitment under a
  // single "Applicant" entry (they all resolve to the applicant table); the
  // remaining operational panels are listed as-is.
  const GRID_PANEL_MERGED = ['registration', 'conditions', 'reglement', 'engagement'];
  const gridPanelItems = () => {
    const rest = collectPanels().filter((p) => !GRID_PANEL_MERGED.includes(p.tab));
    return [{ tab: 'registration', name: gridI18n('psApplicant', 'Applicant') }, ...rest];
  };

  const renderGridPanelList = () => {
    if (!gridPanelList) return;
    const q = (gridPanelSearch?.value || '').trim().toLowerCase();
    gridPanelList.innerHTML = '';
    let shown = 0;
    gridPanelItems().forEach(({ tab, name }) => {
      if (q && !name.toLowerCase().includes(q)) return;
      shown += 1;
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.tab = tab;
      const active = tab === gridTab;
      li.setAttribute('aria-selected', String(active));
      li.className =
        'flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-[#042F8D]/10 hover:text-[#042F8D] ' +
        (active ? 'bg-[#042F8D]/10 text-[#042F8D]' : 'text-slate-700');
      const span = document.createElement('span');
      span.className = 'truncate';
      span.textContent = name;
      li.appendChild(span);
      li.addEventListener('click', () => {
        gridTab = tab;
        if (gridPanelLabel) gridPanelLabel.textContent = name;
        closeGridMenu();
        renderDataGrid();
      });
      gridPanelList.appendChild(li);
    });
    gridPanelEmpty?.classList.toggle('hidden', shown > 0);
  };

  const openGridMenu = () => {
    if (!gridPanelMenu) return;
    renderGridPanelList();
    gridPanelMenu.classList.remove('hidden');
    gridPanelBtn?.setAttribute('aria-expanded', 'true');
    gridPanelChevron?.classList.add('rotate-180');
    if (gridPanelSearch) {
      gridPanelSearch.value = '';
      gridPanelSearch.focus();
    }
  };
  const closeGridMenu = () => {
    if (!gridPanelMenu) return;
    gridPanelMenu.classList.add('hidden');
    gridPanelBtn?.setAttribute('aria-expanded', 'false');
    gridPanelChevron?.classList.remove('rotate-180');
  };

  gridPanelBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    gridMenuOpen() ? closeGridMenu() : openGridMenu();
  });
  gridPanelSearch?.addEventListener('input', renderGridPanelList);

  // ── Open / close the grid overlay ──────────────────────────────
  const openGrid = () => {
    if (!gridOverlay) return;
    gridOverlay.classList.remove('hidden');
    gridOverlay.setAttribute('aria-hidden', 'false');
    // Re-fetch fresh data each time the grid is opened.
    clearTableCache();
    // Empty by default: only render once a panel is picked from the dropdown.
    renderDataGrid();
  };
  const closeGrid = () => {
    if (!gridOverlay) return;
    gridOverlay.classList.add('hidden');
    gridOverlay.setAttribute('aria-hidden', 'true');
    closeGridMenu();
  };

  gridBtn?.addEventListener('click', () => (gridIsOpen() ? closeGrid() : openGrid()));
  gridClose?.addEventListener('click', closeGrid);
  gridOverlay?.addEventListener('click', (e) => {
    if (e.target === gridOverlay) closeGrid();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gridIsOpen()) closeGrid();
  });
  document.addEventListener('click', (e) => {
    if (gridMenuOpen() && e.target instanceof Node && gridPanel && !gridPanel.contains(e.target)) {
      closeGridMenu();
    }
  });

  // ── Language sync ──────────────────────────────────────────────
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      window.setTimeout(() => {
        allPanelsLabel = document.querySelector('[data-i18n="psAllPanels"]')?.textContent || allPanelsLabel;
        panelLabel.textContent = selectedTab ? panelNameOf(selectedTab) : allPanelsLabel;
        // Re-render the grid + column customizer in the new language.
        if (gridIsOpen()) renderDataGrid();
        if (colsOpen()) renderColumnLists(displayedKeys.slice());
      }, 0);
    })
  );
})();
