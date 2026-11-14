// @ts-check
/**
 * GSS · Reports dropdown
 * ==================================================================
 * Builds the Reports dropdown from available report pages and the signed-in
 * user's report-specific grants in the shared permission matrix.
 */
const GSSReportAccess = Object.freeze({
  /**
   * @param {string} reportId
   * @param {'view'|'print'|'export'} action
   * @returns {Promise<boolean>}
   */
  async authorizeReport(reportId, action = 'view') {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(reportId) || !['view', 'print', 'export'].includes(action)) return false;
    const session = GSSSession.get();
    if (!session || !session.token) return false;
    try {
      const response = await fetch(
        `${API_BASE}/api/reports/authorize?report=${encodeURIComponent(reportId)}&action=${encodeURIComponent(action)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        if (action === 'print' && document.body) document.body.dataset.gssPrintAllowed = 'false';
        return false;
      }
      const data = await response.json();
      const allowed = !!(data && data.ok);
      if (action === 'print' && document.body) document.body.dataset.gssPrintAllowed = String(allowed);
      return allowed;
    } catch (error) {
      console.error(`Unable to authorize ${action} for report ${reportId}:`, error);
      if (action === 'print' && document.body) document.body.dataset.gssPrintAllowed = 'false';
      return false;
    }
  },
});

(() => {
  if (typeof document === 'undefined' || !document.head ||
    !/(?:^|\/)reports\/[a-z0-9][a-z0-9-]*\/[^/]+\.html$/i.test(window.location.pathname) ||
    document.getElementById('gssReportPrintPermission')) return;
  const style = document.createElement('style');
  style.id = 'gssReportPrintPermission';
  style.textContent = '@media print { body:not([data-gss-print-allowed="true"]) > * { display: none !important; } body:not([data-gss-print-allowed="true"])::after { content: attr(data-gss-print-message); display: block; padding: 2rem; color: #334155; font: 16px sans-serif; } }';
  document.head.appendChild(style);
})();

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

  const init = () => {
    const wrap = document.getElementById('reportsMenu');
    const btn = document.getElementById('reportsBtn');
    const menu = document.getElementById('reportsDropdown');
    if (!wrap || !btn || !menu) return;

    const setOpen = (/** @type {boolean} */ open) => {
      menu.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    const isOpen = () => !menu.classList.contains('hidden');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    // Close on outside click / Escape.
    document.addEventListener('click', (e) => {
      if (isOpen() && !wrap.contains(/** @type {Node} */ (e.target))) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); btn.focus(); }
    });

    void loadReports(wrap, menu, setOpen);
  };

  /**
   * @param {HTMLElement} wrap
   * @param {HTMLElement} menu
   * @param {(open: boolean) => void} setOpen
   */
  const loadReports = async (wrap, menu, setOpen) => {
    try {
      const response = await fetch(`${API_BASE}/api/reports/list`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Reports request failed (${response.status})`);
      const data = await response.json();
      if (!data || !Array.isArray(data.reports)) throw new Error('Invalid reports response');

      const reports = await Promise.all(data.reports.map(async (/** @type {any} */ report) => {
        if (!report || typeof report.id !== 'string' || typeof report.url !== 'string' ||
          !/^[a-z0-9][a-z0-9-]*$/i.test(report.id)) return null;
        const allowed = await GSSReportAccess.authorizeReport(report.id, 'view');
        return allowed ? report : null;
      }));
      menu.replaceChildren();
      reports.filter(Boolean).forEach((/** @type {any} */ report) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.dataset.report = report.id;
        item.className = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none';
        const label = document.createElement('span');
        label.textContent = report.title;
        item.appendChild(label);
        item.addEventListener('click', () => {
          setOpen(false);
          window.open(report.url, '_blank', 'noopener');
        });
        menu.appendChild(item);
      });
      wrap.classList.toggle('hidden', !menu.childElementCount);
    } catch (error) {
      console.error('Unable to load reports menu:', error);
      wrap.classList.add('hidden');
      showToast(t('trReportLoadErr', 'Reports could not be loaded.'));
    }
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
