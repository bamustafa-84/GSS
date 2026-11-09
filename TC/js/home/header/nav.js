// @ts-check

/** Primary header navigation: action buttons, dropdown state, and logout. */
(() => {
  'use strict';

  debugger;
  const menus = [
    { button: 'sysMgmtBtn', menu: 'sysMgmtMenu' },
    { button: 'reportsBtn', menu: 'reportsDropdown' },
    { button: 'notifBell', menu: 'notifMenu' },
    { button: 'userMenuBtn', menu: 'userMenu' },
  ].map(({ button, menu }) => ({
    button: /** @type {HTMLButtonElement | null} */ (document.getElementById(button)),
    menu: document.getElementById(menu),
  })).filter((item) => item.button && item.menu);

  const isOpen = (/** @type {{ button: HTMLButtonElement|null, menu: HTMLElement|null }} */ item) =>
    !!item.menu && !item.menu.classList.contains('hidden');

  const closeMenu = (/** @type {{ button: HTMLButtonElement|null, menu: HTMLElement|null }} */ item, focus = false) => {
    item.menu?.classList.add('hidden');
    item.button?.setAttribute('aria-expanded', 'false');
    if (focus) item.button?.focus();
  };

  const closeAllMenus = () => menus.forEach((item) => closeMenu(item));

  menus.forEach((item) => {
    item.button?.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !isOpen(item);
      closeAllMenus();
      item.menu?.classList.toggle('hidden', !willOpen);
      item.button?.setAttribute('aria-expanded', String(willOpen));
    });

    item.menu?.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[role="menuitem"]')) closeMenu(item);
    });
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node)) return;
    const target = /** @type {Node} */ (event.target);
    menus.forEach((item) => {
      if (isOpen(item) && !item.menu?.contains(target) && !item.button?.contains(target)) {
        closeMenu(item);
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    menus.forEach((item) => {
      if (isOpen(item)) closeMenu(item, true);
    });
  });

  /** @type {any} */ (window).GSSNav = {
    closeMenu: (/** @type {string} */ buttonId) => {
      const item = menus.find((menu) => menu.button?.id === buttonId);
      if (item) closeMenu(item);
    },
    closeAllMenus,
  };

  document.getElementById('psGridBtn')?.addEventListener('click', () => {
    const grid = /** @type {any} */ (window).GSSGrid;
    if (!grid) return;
    if (typeof grid.isOpen === 'function' && grid.isOpen()) grid.close?.();
    else grid.open?.();
  });

  const bindFeatureButton = (/** @type {string} */ buttonId, /** @type {string} */ apiName) => {
    document.getElementById(buttonId)?.addEventListener('click', () => {
      const api = /** @type {any} */ (window)[apiName];
      if (api && typeof api.open === 'function') api.open();
    });
  };
  bindFeatureButton('sigBtn', 'GSSSignatures');
  bindFeatureButton('attSheetBtn', 'GSSAttendanceSheet');
  bindFeatureButton('examConfigBtn', 'GSSExamConfig');
  bindFeatureButton('examTakeBtn', 'GSSExamTake');

 //#region USER PROFILE (USERNAME, ROLE, AVATAR)
  const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
  if (!session) {
    window.location.replace('./login.html');
    return;
  }
  // Render the current role as a fancy header badge. Exposed on window so
  // admin.js can refresh it once the live role is fetched from the server.
  const applyRoleBadge = (/** @type {string | undefined} */ roleName) => {
    const badge = document.getElementById('userChipRole');
    const text = document.getElementById('userChipRoleText');
    const current = (typeof GSSSession !== 'undefined' ? GSSSession.get() : null) || {};
    const r = String(roleName || current.role || '').trim();
    if (!badge || !text) return;
    if (!r) { badge.classList.add('hidden'); badge.classList.remove('inline-flex'); return; }
    let label = r;
    try {
      const lang = document.documentElement.lang || 'en';
      const key = 'role' + r.replace(/[^a-z]/gi, '');
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) label = dict[lang][key];
    } catch (_) { /* noop */ }
    text.textContent = label;
    badge.classList.remove('hidden');
    badge.classList.add('inline-flex');
  };

  /** @type {any} */ (window).GSSChip = { applyRoleBadge };
  // Render the header avatar from the session: show the uploaded picture when
  // one exists (streamed + browser-cached via /api/me/avatar), otherwise keep
  // the default SVG. onerror falls back to the SVG if the image is missing.
  const applyAvatar = () => {
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById('userChipAvatarImg'));
    const wrap = document.getElementById('userChipAvatar');
    const zoom = document.getElementById('userChipAvatarZoom');
    const zoomImg = /** @type {HTMLImageElement | null} */ (document.getElementById('userChipAvatarZoomImg'));
    if (!img || !wrap) return;
    const svg = wrap.querySelector('svg');
    const cur = (typeof GSSSession !== 'undefined' ? GSSSession.get() : null) || {};
    const showSvg = () => {
      img.classList.add('hidden'); img.removeAttribute('src'); svg?.classList.remove('hidden');
      // No picture → disable the hover zoom so it never shows an empty card.
      zoom?.classList.remove('peer-hover:block');
      if (zoomImg) zoomImg.removeAttribute('src');
    };
    if (!cur.has_avatar || !cur.username) { showSvg(); return; }
    const url = `${API_BASE}/api/me/avatar?username=${encodeURIComponent(String(cur.username))}&v=${encodeURIComponent(String(cur.avatar_ver || 0))}`;
    img.onerror = showSvg;
    img.onload = () => {
      img.classList.remove('hidden'); svg?.classList.add('hidden');
      // Reuse the same cached URL for the hover preview and enable the zoom.
      if (zoomImg) zoomImg.src = url;
      zoom?.classList.add('peer-hover:block');
    };
    img.src = url;
  };

  /** @type {any} */ (window).GSSChip.applyAvatar = applyAvatar;
  const applyChip = () => {
    const chip = document.getElementById('userChip');
    const name = document.getElementById('userChipName');
    if (name) name.textContent = session.full_name || session.username || 'User';
    if (chip) { chip.classList.remove('hidden'); chip.classList.add('flex'); }
    applyRoleBadge(session.role);
    applyAvatar();
  };

   document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (typeof GSSSession !== 'undefined') GSSSession.clear();
    window.location.replace('./login.html');
  });
  
  if (document.readyState === 'loading') 
    document.addEventListener('DOMContentLoaded', applyChip);
  else applyChip();
  //#endregion
  
})();
