// @ts-check
/**
 * GSS · Reports dropdown
 * ==================================================================
 * Wires the "Reports" toolbar dropdown (tc.html). Visibility is handled
 * by admin.js role gating (`data-role-any="Admin,Head of Training"`); this
 * module only manages the open/close behaviour and routing to each report
 * page under /reports.
 *
 * Each menu item carries `data-report="<folder>"`. Reports that ship a page
 * are listed in REPORT_PAGES; the rest show a localized "coming soon" toast
 * so the same dropdown scales as new reports are added.
 */
(() => {
  'use strict';

  /** Reports that already have a dedicated page (folder → entry html). */
  const REPORT_PAGES = {
    'training-register': './reports/training-register/training-register.html',
    'attendance-sheet': './reports/attendance-sheet/attendance-sheet.html',
    'candidate-details': './reports/candidate-details/candidate-details.html',
  };

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

    // Route each item.
    menu.querySelectorAll('[data-report]').forEach((item) => {
      item.addEventListener('click', () => {
        const key = /** @type {HTMLElement} */ (item).dataset.report || '';
        setOpen(false);
        const url = /** @type {any} */ (REPORT_PAGES)[key];
        if (url) {
          window.open(url, '_blank', 'noopener');
        } else {
          showToast(t('trReportComingSoon', 'This report is coming soon.'));
        }
      });
    });
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
