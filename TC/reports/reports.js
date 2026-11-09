// @ts-check
/**
 * GSS · Reports dropdown
 * ==================================================================
 * Wires the "Reports" toolbar dropdown (tc.html). The report list is
 * discovered dynamically from the server (/api/reports/list — one entry
 * per folder under /reports), so new reports appear automatically without
 * touching this file or tc.html.
 *
 * Per-report visibility is governed by the Permissions matrix: each report
 * is section "10.1.<folder>" and is shown only when the signed-in user has
 * View on it (GSSPerms.canViewReport). The whole dropdown hides when no
 * report is viewable. The server still enforces access on every report page.
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
    /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c));

  /** Entry page for a report folder. */
  const reportUrl = (/** @type {string} */ key) => `./reports/${key}/${key}.html`;

  /** May the current user view/open a specific report? (permissive if no engine) */
  const canViewReport = (/** @type {string} */ key) => {
    const gp = /** @type {any} */ (window).GSSPerms;
    if (!gp || typeof gp.canViewReport !== 'function') return true;
    return gp.canViewReport(key);
  };

  const ICON = '<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h3"/></svg>';

  /** @type {Array<{key:string,label:string}>} */
  let catalog = [];

  /** Render the dropdown items for every report the user may view. */
  const renderMenu = (/** @type {HTMLElement} */ menu, /** @type {HTMLElement} */ wrap) => {
    const allowed = catalog.filter((r) => canViewReport(r.key));
    if (!allowed.length) {
      menu.innerHTML = '';
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    menu.innerHTML = allowed.map((r) =>
      `<button type="button" role="menuitem" data-report="${esc(r.key)}"` +
      ` class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none">` +
      `<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#042F8D]/10 text-[#042F8D]">${ICON}</span>` +
      `<span>${esc(r.label)}</span></button>`
    ).join('');
  };

  const init = async () => {
    const wrap = document.getElementById('reportsMenu');
    const menu = document.getElementById('reportsDropdown');
    if (!wrap || !menu) return;

    // Route each item (delegated — the list is rendered dynamically).
    menu.addEventListener('click', (e) => {
      const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-report]'));
      if (!item || !menu.contains(item)) return;
      const key = item.dataset.report || '';
      const nav = /** @type {any} */ (window).GSSNav;
      if (nav && typeof nav.closeMenu === 'function') nav.closeMenu('reportsBtn');
      if (!canViewReport(key)) { showToast(t('trReportNoAccess', 'You do not have access to this report.')); return; }
      window.open(reportUrl(key), '_blank', 'noopener');
    });

    // Discover reports, then build the menu once permissions are known.
    try {
      const d = await fetch(`${API_BASE}/api/reports/list`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      catalog = (d && Array.isArray(d.reports)) ? d.reports : [];
    } catch (_) { catalog = []; }

    const gp = /** @type {any} */ (window).GSSPerms;
    const build = () => renderMenu(menu, wrap);
    if (gp && gp.ready && typeof gp.ready.then === 'function') gp.ready.then(build).catch(build);
    build();
    // Re-evaluate when the tab regains focus (admin may have changed perms).
    window.addEventListener('focus', build);
  };

  /** Minimal transient toast (Tailwind classes, no persistent DOM). */
  const showToast = (/** @type {string} */ message) => {
    const el = document.createElement('div');
    el.className = 'fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-[#042F8D] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(4,47,141,0.35)] transition-opacity duration-300';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 2200);
    setTimeout(() => { el.remove(); }, 2600);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
