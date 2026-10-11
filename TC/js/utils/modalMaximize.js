// @ts-check
/*
 * Adds a Maximize / Restore toggle to every full-screen modal overlay so users
 * on small screens can expand a dialog to fill the viewport. Generic: it finds
 * each overlay's panel (card) and injects the button next to its Close control.
 */
(function () {
  'use strict';

  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };

  const ICON_MAX = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  const ICON_MIN = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

  // Inject the maximize CSS once.
  const style = document.createElement('style');
  style.textContent =
    '.gss-modal-max{padding:0 !important;}' +
    '.gss-modal-max>.gss-modal-panel{max-width:100% !important;width:100% !important;max-height:100% !important;height:100% !important;border-radius:0 !important;margin:0 !important;}';
  document.head.appendChild(style);

  /** The card is the first element child of the overlay. */
  const findPanel = (/** @type {Element} */ overlay) => {
    const kids = Array.from(overlay.children).filter((el) => el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE');
    return /** @type {HTMLElement | null} */ (kids[0] || null);
  };

  const register = (/** @type {HTMLElement} */ overlay) => {
    if (!overlay || overlay.dataset.gssMaxReady) return;
    if (!(overlay.classList.contains('fixed') && overlay.classList.contains('inset-0'))) return;
    const panel = findPanel(overlay);
    if (!panel) return;
    overlay.dataset.gssMaxReady = '1';
    panel.classList.add('gss-modal-panel');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gss-modal-max-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60';
    btn.innerHTML = ICON_MAX;
    const relabel = (/** @type {boolean} */ on) => {
      const label = on ? t('modalRestore', 'Restore') : t('modalMaximize', 'Maximize');
      btn.title = label;
      btn.setAttribute('aria-label', label);
    };
    relabel(false);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = overlay.classList.toggle('gss-modal-max');
      btn.innerHTML = on ? ICON_MIN : ICON_MAX;
      relabel(on);
    });

    const closeBtn = panel.querySelector('[id$="Close"], [id$="ModalBtn"], [data-i18n="closeBtn"], [aria-label="Close"]');
    if (closeBtn && closeBtn.parentElement) {
      // Group both controls so a flex `justify-between` header keeps them together on the right.
      const group = document.createElement('div');
      group.className = 'gss-modal-max-group inline-flex items-center gap-2';
      closeBtn.parentElement.insertBefore(group, closeBtn);
      group.appendChild(btn);
      group.appendChild(closeBtn);
    } else {
      btn.classList.add('absolute', 'right-3', 'top-3', 'z-10');
      if (getComputedStyle(panel).position === 'static') panel.classList.add('relative');
      panel.appendChild(btn);
    }
  };

  const scan = () => {
    document.querySelectorAll('div[id$="Overlay"], #formModal').forEach((el) => register(/** @type {HTMLElement} */ (el)));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
