// @ts-check

//#region SEARCH CONTRACT
/** @typedef {{
 * tableFor: (tab: string) => string,
 * columns: { key: string }[],
 * fetchTable: (table: string) => Promise<{ records: any[] }>,
 * colOf: (key: string) => any,
 * colLabel: (column: any) => string,
 * prettify: (value: string) => string,
 * getGridTab: () => string,
 * setGridTab: (tab: string) => void,
 * open: () => void,
 * close: () => void,
 * localize: (key: string, fallback: string) => string
 * }} SearchDependencies */
//#endregion

//#region PANEL SEARCH MODULE
(() => {
  'use strict';

  //#region SHARED STATE
  // Keep result closing and grid-row opening callable by the rest of the app.
  /** @type {() => void} */
  let closeResults = () => {};
  /** @type {(tab: string, record: any, fromGrid?: boolean, focusKey?: string) => void} */
  let openRecordForm = () => {};
  let returnToGridTab = '';
  /** @type {HTMLElement[]} */
  let greenHits = [];
  const GREEN_CLS = ['ring-2', 'ring-green-500', 'bg-green-50', 'rounded-lg', 'transition'];
  //#endregion

  /** @param {SearchDependencies} deps */
  const init = (deps) => {
    //#region RECORD NAVIGATION AND FIELD HIGHLIGHTING
    // Open an applicant record, jump to its owning form tab, and highlight the matched field.
    const clearFieldHighlights = () => {
      greenHits.forEach((element) => element.classList.remove(...GREEN_CLS, 'border-green-500'));
      greenHits = [];
    };
    const markGreen = (/** @type {HTMLElement} */ element) => {
      element.classList.add(...GREEN_CLS);
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) element.classList.add('border-green-500');
      greenHits.push(element);
    };
    const fieldForColumn = (/** @type {string} */ key) => {
      if (!key) return null;
      const safe = key.replace(/["\\]/g, '\\$&');
      return /** @type {HTMLElement | null} */ (document.querySelector(`[dbname="${safe}"]`));
    };
    const tabOfElement = (/** @type {HTMLElement | null} */ element) => {
      const panel = element && element.closest ? element.closest('.gss-tab-panel') : null;
      const id = panel ? panel.id : '';
      return id.indexOf('panel-') === 0 ? id.slice(6) : 'registration';
    };
    const highlightTargetFor = (/** @type {HTMLElement} */ element) => {
      const type = ((element.getAttribute && element.getAttribute('type')) || '').toLowerCase();
      if (type === 'radio' || type === 'checkbox' || element.tagName === 'LABEL') {
        return /** @type {HTMLElement} */ (element.closest('fieldset') || element.parentElement || element);
      }
      return element;
    };
    const focusField = (/** @type {string} */ key) => {
      clearFieldHighlights();
      const element = fieldForColumn(key);
      if (!element) return;
      document.getElementById(`tab-btn-${tabOfElement(element)}`)?.click();
      window.setTimeout(() => {
        if (window.GSSCollapsible && element.closest) window.GSSCollapsible.expand(element.closest('fieldset'));
        const target = highlightTargetFor(element);
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        markGreen(target);
      }, 90);
      window.setTimeout(clearFieldHighlights, 6000);
    };

    const openGridForTab = (/** @type {string} */ tab) => {
      deps.setGridTab(tab);
      closeResults();
      deps.open();
    };
    openRecordForm = (tab, record, fromGrid, focusKey) => {
      returnToGridTab = fromGrid ? (deps.getGridTab() || tab) : '';
      const modal = document.getElementById('formModal');
      if (modal && modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
      const field = focusKey ? fieldForColumn(focusKey) : null;
      document.getElementById(`tab-btn-${field ? tabOfElement(field) : tab}`)?.click();
      closeResults();
      deps.close();
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
    document.getElementById('closeModalBtn')?.addEventListener('click', () => {
      clearFieldHighlights();
      if (!returnToGridTab) return;
      const tab = returnToGridTab;
      returnToGridTab = '';
      openGridForTab(tab);
    });
    //#endregion

    //#region SEARCH DOM AND RESULT NAVIGATION
    // Bind the search controls and manage result selection/keyboard focus.
    const searchRoot = document.getElementById('psSearch');
    const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('psSearchInput'));
    const results = document.getElementById('psResults');
    const resultsList = document.getElementById('psResultsList');
    const empty = document.getElementById('psEmpty');
    if (!searchRoot || !searchInput || !results || !resultsList || !empty) return;

    const panelNameOf = (/** @type {string} */ tab) => {
      const button = Array.from(document.querySelectorAll('.gss-tab-btn'))
        .find((/** @type {Element} */ element) => /** @type {HTMLElement} */ (element).dataset.tab === tab);
      if (!button) return tab;
      const tabButton = /** @type {HTMLElement} */ (button);
      const label = /** @type {HTMLElement | null} */ (tabButton.querySelector('[data-i18n^="tab"]'));
      return (label?.textContent || tabButton.textContent || '').trim() || tab;
    };

    let activeIndex = -1;
    const visibleResults = () =>
      /** @type {HTMLElement[]} */ (Array.prototype.slice.call(resultsList.querySelectorAll('[role="option"]')));

    const highlightResult = (/** @type {number} */ index) => {
      const options = visibleResults();
      activeIndex = Math.max(-1, Math.min(index, options.length - 1));
      options.forEach((option, i) => {
        const active = i === activeIndex;
        option.classList.toggle('bg-[#042F8D]/10', active);
        option.classList.toggle('text-[#042F8D]', active);
        option.setAttribute('aria-selected', String(active));
        if (active) option.scrollIntoView({ block: 'nearest' });
      });
    };

    closeResults = () => {
      results.classList.add('hidden');
      activeIndex = -1;
    };

    const highlightMatch = (/** @type {string} */ text, /** @type {string} */ query) => {
      const escapeHtml = (/** @type {string} */ value) =>
        value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
      const index = text.toLowerCase().indexOf(query);
      if (index < 0) return escapeHtml(text);
      return escapeHtml(text.slice(0, index))
        + '<mark class="rounded bg-yellow-200 px-0.5 text-slate-900">'
        + escapeHtml(text.slice(index, index + query.length))
        + '</mark>'
        + escapeHtml(text.slice(index + query.length));
    };
    //#endregion

    //#region QUERY, RESULT RENDERING, AND EVENTS
    // Fetch matching applicants, render safe result labels, and wire input/keyboard/outside-click events.
    const fetchRegistrationSearch = async (/** @type {string} */ query) => {
      try {
        const response = await fetch(`${API_BASE}/api/registration/search?q=${encodeURIComponent(query)}&limit=25`, { headers: { Accept: 'application/json' } });
        const data = await response.json();
        return Array.isArray(data.applicants) ? data.applicants : [];
      } catch (_) {
        return [];
      }
    };
    const recordPrimary = (/** @type {any} */ record) => {
      for (const key of ['full_name', 'applicant_name', 'contact_name', 'name']) {
        if (record[key]) return String(record[key]);
      }
      for (const value of Object.values(record)) {
        if (typeof value === 'string' && value.trim()) return value;
      }
      return '';
    };
    const recordSecondary = (/** @type {any} */ record) => {
      for (const key of ['candidate_no', 'signature_id', 'id']) {
        if (record[key] != null && record[key] !== '') return '#' + record[key];
      }
      return '';
    };

    const runSearch = async () => {
      const query = searchInput.value.replace(/\s+/g, ' ').trim().toLowerCase();
      clearFieldHighlights();
      if (!query) {
        closeResults();
        resultsList.innerHTML = '';
        return;
      }

      const tab = 'registration';
      const table = deps.tableFor(tab);
      resultsList.innerHTML = '';
      if (!table) {
        empty.textContent = deps.localize('psSearchNoTable', 'No data table is associated with this panel.');
        empty.classList.remove('hidden');
        results.classList.remove('hidden');
        highlightResult(-1);
        return;
      }

      const searchKeys = deps.columns.map((column) => column.key);
      const matchedColumn = (/** @type {any} */ record) => {
        for (const key of searchKeys) {
          const value = record[key];
          if (value != null && String(value).toLowerCase().includes(query)) return key;
        }
        return '';
      };
      const matchesRole = (/** @type {any} */ record) => matchedColumn(record) !== '';
      const records = tab === 'registration'
        ? (await fetchRegistrationSearch(query)).filter(matchesRole)
        : (await deps.fetchTable(table)).records.filter(matchesRole);

      if (searchInput.value.replace(/\s+/g, ' ').trim().toLowerCase() !== query) return;

      const matches = records.slice(0, 40);
      matches.forEach((/** @type {any} */ record) => {
        const item = document.createElement('li');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        item.className = 'flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2 transition-colors hover:bg-[#042F8D]/10';

        const badge = document.createElement('span');
        badge.className = 'flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-[#042F8D]/70';
        const badgeName = document.createElement('span');
        badgeName.textContent = panelNameOf(tab);
        badge.appendChild(badgeName);
        const secondary = recordSecondary(record);
        if (secondary) {
          const badgeSecondary = document.createElement('span');
          badgeSecondary.className = 'text-slate-400';
          badgeSecondary.textContent = secondary;
          badge.appendChild(badgeSecondary);
        }

        const name = document.createElement('span');
        name.className = 'truncate text-sm font-semibold text-slate-800';
        name.textContent = recordPrimary(record) || secondary || '';
        const matchedKey = matchedColumn(record);
        item.appendChild(badge);
        item.appendChild(name);

        if (matchedKey && matchedKey !== 'full_name') {
          const column = deps.colOf(matchedKey);
          const hit = document.createElement('span');
          hit.className = 'truncate text-xs text-slate-500';
          const label = document.createElement('span');
          label.className = 'font-semibold text-slate-600';
          label.textContent = (column ? deps.colLabel(column) : deps.prettify(matchedKey)) + ': ';
          const value = document.createElement('span');
          value.innerHTML = highlightMatch(String(record[matchedKey]), query);
          hit.appendChild(label);
          hit.appendChild(value);
          item.appendChild(hit);
        } else {
          name.innerHTML = highlightMatch(recordPrimary(record) || secondary || query, query);
        }

        item.addEventListener('click', () => openRecordForm(tab, record, false, matchedKey));
        item.addEventListener('mousemove', () => highlightResult(visibleResults().indexOf(item)));
        resultsList.appendChild(item);
      });

      empty.textContent = deps.localize('noPanelFound', 'No results found');
      empty.classList.toggle('hidden', matches.length > 0);
      results.classList.remove('hidden');
      highlightResult(matches.length ? 0 : -1);
    };

    searchInput.addEventListener('input', runSearch);
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim()) runSearch();
    });
    searchInput.addEventListener('keydown', (event) => {
      const options = visibleResults();
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (results.classList.contains('hidden')) runSearch();
          else highlightResult(activeIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          highlightResult(activeIndex - 1);
          break;
        case 'Enter': {
          event.preventDefault();
          const item = options[activeIndex] || options[0];
          if (item) item.click();
          break;
        }
        case 'Escape':
          closeResults();
          break;
        default:
          break;
      }
    });
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Node)) return;
      if (!results.classList.contains('hidden') && !searchRoot.contains(event.target)) closeResults();
    });
    //#endregion
  };

  //#region PUBLIC API AND AUTO-INITIALIZATION
  // Expose search actions and initialize from the shared grid service.
  const openGridRecord = /** @type {(tab: string, record: any, fromGrid?: boolean, focusKey?: string) => void} */ (
    (tab, record, fromGrid, focusKey) => openRecordForm(tab, record, fromGrid, focusKey)
  );

  /** @type {any} */ (window).GSSPanelSearch = {
    init,
    closeResults: () => closeResults(),
    openRecordForm: openGridRecord,
  };

  const grid = /** @type {any} */ (window).GSSGrid;
  if (grid) {
    init(grid);
    grid.openRecordForm = openGridRecord;
  }
  //#endregion
})();

//#endregion // PANEL SEARCH MODULE
