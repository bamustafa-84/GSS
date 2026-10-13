// @ts-check
/**
 * GSS · Centralised shimmer / skeleton loading system
 * ==================================================================
 * A single, reusable loading-feedback layer shared by every page and
 * module. Classic <script> (no ES modules): everything hangs off the
 * global `window.GSSShimmer` object, mirroring the rest of the app.
 *
 * Load order: immediately AFTER js/global.js on every page, so it can
 * chain the API `fetch` wrapper installed there and be available to all
 * later modules (panelJump, registration, reports, …).
 *
 * What it provides
 * ----------------
 *  • A thin top progress bar that tracks every in-flight API request
 *    (automatic, zero per-module wiring) with reference counting so one
 *    finished request never hides a bar another request still needs.
 *  • `button(el, on)`  – inline button spinner + disabled + aria-busy,
 *    preserving the button's child nodes/listeners and blocking double
 *    submits.
 *  • `overlay(el, on)` – a localised shimmer veil over any container
 *    (reference counted, so overlapping loads are safe).
 *  • `tableSkeleton(el, opts)` / `cards(el, opts)` – structural skeleton
 *    placeholders that resemble the real content.
 *  • `fullPage(on)`    – a sparing, app-level veil for whole-page waits.
 *
 * Design: navy (#042F8D) identity with a soft light-blue sheen, rounded
 * corners, restrained motion, and a `prefers-reduced-motion` fallback.
 * Accessibility: decorative visuals are aria-hidden; host regions get
 * `aria-busy` so assistive tech announces the busy state.
 */
(() => {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Guard against a double include on the same page.
  if (/** @type {any} */ (window).GSSShimmer) return;

  /* ────────────────────────────────────────────────────────────────
   * 1. One-time stylesheet
   * ──────────────────────────────────────────────────────────────── */
  const STYLE_ID = 'gss-shimmer-styles';
  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --gss-skel-base: #e2e8f0;
        --gss-navy: #042F8D;
      }
      /* Shimmer sweep — identical technique to the reports' skeleton: a static
         slate base with a glossy white highlight gliding across via ::after. */
      @keyframes gssShimmer { 100% { transform: translateX(100%); } }
      @keyframes gssBarIndeterminate {
        0%   { transform: translateX(-100%) scaleX(0.4); }
        50%  { transform: translateX(10%) scaleX(0.5); }
        100% { transform: translateX(100%) scaleX(0.6); }
      }
      @keyframes gssSpin { to { transform: rotate(360deg); } }
      @keyframes gssSkelPulse { 0%,100% { opacity: 1; } 50% { opacity: .6; } }

      .gss-skel {
        position: relative;
        overflow: hidden;
        border-radius: .5rem;
        background-color: var(--gss-skel-base);
      }
      .gss-skel::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
        animation: gssShimmer 1.5s infinite;
      }
      /* Lighter base so the sweep reads against the navy grid header. */
      .gss-skel--on-navy { background-color: rgba(255, 255, 255, 0.28); }
      .gss-skel--round { border-radius: 9999px; }

      /* Top progress bar (decorative, aria-hidden). */
      .gss-topbar {
        position: fixed;
        inset: 0 0 auto 0;
        height: 3px;
        z-index: 2147483000;
        pointer-events: none;
        overflow: hidden;
        opacity: 0;
        transition: opacity .25s ease;
      }
      .gss-topbar.is-active { opacity: 1; }
      .gss-topbar > span {
        display: block;
        height: 100%;
        width: 100%;
        transform-origin: left center;
        background: linear-gradient(90deg, rgba(4,47,141,0) 0%, #0b4dc2 45%, #4f86e8 75%, rgba(4,47,141,0) 100%);
        animation: gssBarIndeterminate 1.05s ease-in-out infinite;
      }

      /* Localised overlay veil. */
      .gss-overlay-host { position: relative; }
      .gss-overlay {
        position: absolute;
        inset: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(248, 250, 253, 0.72);
        backdrop-filter: blur(1px);
        border-radius: inherit;
      }
      .gss-overlay__spinner {
        width: 2rem;
        height: 2rem;
        border-radius: 9999px;
        border: 3px solid rgba(4, 47, 141, 0.18);
        border-top-color: var(--gss-navy);
        animation: gssSpin .7s linear infinite;
      }

      /* Inline button spinner. */
      .gss-btn-loading { position: relative; cursor: progress !important; }
      .gss-btn-loading > :not(.gss-btn-spinner) { opacity: .45; }
      .gss-btn-spinner {
        display: inline-block;
        width: 1em;
        height: 1em;
        margin-right: .5em;
        vertical-align: -0.15em;
        border-radius: 9999px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        animation: gssSpin .6s linear infinite;
      }

      /* Full-page veil (used sparingly). */
      .gss-fullpage {
        position: fixed;
        inset: 0;
        z-index: 2147482000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.62);
        backdrop-filter: blur(2px);
        opacity: 0;
        transition: opacity .2s ease;
      }
      .gss-fullpage.is-active { opacity: 1; }
      .gss-fullpage__spinner {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 9999px;
        border: 4px solid rgba(4, 47, 141, 0.18);
        border-top-color: var(--gss-navy);
        animation: gssSpin .7s linear infinite;
      }

      /* Full-page load preloader (app-shell skeleton shown until ready). */
      .gss-page-skel {
        position: fixed;
        inset: 0;
        z-index: 2147482500;
        overflow: hidden;
        background: #ffffff;
        transition: opacity .4s ease;
      }
      .gss-page-skel.is-hidden { opacity: 0; pointer-events: none; }
      /* Navy hero band mirrors the real landing hero backdrop. */
      .gss-page-hero {
        background:
          linear-gradient(to top, rgba(2, 16, 58, 0.55), transparent 55%),
          linear-gradient(to right, #02103a, #042F8D 55%, #02103a);
      }

      @media (prefers-reduced-motion: reduce) {
        .gss-skel::after { animation: none; }
        .gss-skel { animation: gssSkelPulse 1.8s ease-in-out infinite; }
        .gss-topbar > span,
        .gss-overlay__spinner,
        .gss-btn-spinner,
        .gss-fullpage__spinner { animation-duration: 2.2s; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.head) injectStyles();
  else document.addEventListener('DOMContentLoaded', injectStyles, { once: true });

  /* ────────────────────────────────────────────────────────────────
   * 2. Top progress bar (reference-counted)
   * ──────────────────────────────────────────────────────────────── */
  /** @type {HTMLElement | null} */
  let topBar = null;
  let pending = 0;
  /** @type {number | undefined} */
  let showTimer;
  /** @type {number | undefined} */
  let hideTimer;

  const ensureTopBar = () => {
    if (topBar && document.body.contains(topBar)) return topBar;
    injectStyles();
    topBar = document.createElement('div');
    topBar.className = 'gss-topbar';
    topBar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    topBar.appendChild(fill);
    (document.body || document.documentElement).appendChild(topBar);
    return topBar;
  };

  const showBar = () => {
    const bar = ensureTopBar();
    window.clearTimeout(hideTimer);
    // Small delay avoids a flash for sub-100ms requests.
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => bar.classList.add('is-active'), 90);
  };

  const hideBar = () => {
    window.clearTimeout(showTimer);
    if (!topBar) return;
    const bar = topBar;
    hideTimer = window.setTimeout(() => bar.classList.remove('is-active'), 120);
  };

  /** Signal the start of an async operation tracked by the global bar. */
  const begin = () => { pending += 1; if (pending === 1) showBar(); };
  /** Signal the end of a tracked async operation. */
  const end = () => { pending = Math.max(0, pending - 1); if (pending === 0) { hideBar(); maybeHidePage(); } };

  /* ────────────────────────────────────────────────────────────────
   * 3. API fetch interceptor → drives the top bar automatically
   * ──────────────────────────────────────────────────────────────── */
  if (!/** @type {any} */ (window).__gssShimmerFetch && typeof window.fetch === 'function') {
    /** @type {any} */ (window).__gssShimmerFetch = true;
    const chained = window.fetch.bind(window);
    const isApi = (/** @type {any} */ input) => {
      try {
        const url = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
        return /\/api\//.test(String(url || ''));
      } catch (_) { return false; }
    };
    window.fetch = (/** @type {any} */ input, /** @type {any} */ init) => {
      if (!isApi(input)) return chained(input, init);
      begin();
      let settled = false;
      const done = () => { if (!settled) { settled = true; end(); } };
      return chained(input, init).then(
        (res) => { done(); return res; },
        (err) => { done(); throw err; }
      );
    };
  }

  /* ────────────────────────────────────────────────────────────────
   * 4. Button loading state (preserves child nodes + listeners)
   * ──────────────────────────────────────────────────────────────── */
  /**
   * Toggle a button's loading state. While loading the button is disabled,
   * marked `aria-busy`, and shows an inline spinner — blocking double submits.
   * The original child nodes are kept (only dimmed), so event listeners on
   * them survive. Safe to call repeatedly.
   * @param {Element | null | undefined} el
   * @param {boolean} on
   */
  const button = (el, on) => {
    const btn = /** @type {HTMLButtonElement | null} */ (el && /** @type {any} */ (el));
    if (!btn) return;
    if (on) {
      if (btn.dataset.gssLoading === '1') return; // already loading → no-op
      btn.dataset.gssLoading = '1';
      btn.dataset.gssPrevDisabled = btn.disabled ? '1' : '0';
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      btn.classList.add('gss-btn-loading');
      const spin = document.createElement('span');
      spin.className = 'gss-btn-spinner';
      spin.dataset.gssSpinner = '1';
      spin.setAttribute('aria-hidden', 'true');
      btn.insertBefore(spin, btn.firstChild);
    } else {
      if (btn.dataset.gssLoading !== '1') return;
      const spin = btn.querySelector('[data-gss-spinner="1"]');
      if (spin) spin.remove();
      btn.classList.remove('gss-btn-loading');
      btn.removeAttribute('aria-busy');
      btn.disabled = btn.dataset.gssPrevDisabled === '1';
      delete btn.dataset.gssLoading;
      delete btn.dataset.gssPrevDisabled;
    }
  };

  /* ────────────────────────────────────────────────────────────────
   * 5. Localised overlay veil (reference-counted per element)
   * ──────────────────────────────────────────────────────────────── */
  /**
   * Show/hide a shimmer veil over a container without blocking the rest of
   * the page. Reference counted: N `overlay(el, true)` calls require N
   * `overlay(el, false)` calls before the veil is removed, so overlapping
   * loads on the same container are safe.
   * @param {Element | null | undefined} el
   * @param {boolean} on
   */
  const overlay = (el, on) => {
    const host = /** @type {HTMLElement | null} */ (el && /** @type {any} */ (el));
    if (!host) return;
    const count = parseInt(host.dataset.gssOverlay || '0', 10) || 0;
    if (on) {
      host.dataset.gssOverlay = String(count + 1);
      if (count === 0) {
        host.classList.add('gss-overlay-host');
        host.setAttribute('aria-busy', 'true');
        const veil = document.createElement('div');
        veil.className = 'gss-overlay';
        veil.dataset.gssVeil = '1';
        veil.setAttribute('aria-hidden', 'true');
        const sp = document.createElement('div');
        sp.className = 'gss-overlay__spinner';
        veil.appendChild(sp);
        host.appendChild(veil);
      }
    } else {
      const next = Math.max(0, count - 1);
      host.dataset.gssOverlay = String(next);
      if (next === 0) {
        const veil = host.querySelector(':scope > [data-gss-veil="1"]');
        if (veil) veil.remove();
        host.removeAttribute('aria-busy');
        delete host.dataset.gssOverlay;
      }
    }
  };

  /* ────────────────────────────────────────────────────────────────
   * 6. Structural skeletons
   * ──────────────────────────────────────────────────────────────── */
  /**
   * Fill a container with a skeleton table that resembles the real grid:
   * a navy gradient header strip with varied-width label placeholders plus
   * shimmering cell blocks. Columns stay flex-aligned (header ↔ rows) so there
   * is no horizontal shift when the real grid swaps in. Replaces the
   * container's current content and marks it `aria-busy`.
   * @param {Element | null | undefined} el
   * @param {{ rows?: number, cols?: number, header?: boolean }} [opts]
   */
  const tableSkeleton = (el, opts) => {
    const host = /** @type {HTMLElement | null} */ (el && /** @type {any} */ (el));
    if (!host) return;
    injectStyles();
    const rows = Math.max(1, (opts && opts.rows) || 8);
    const cols = Math.max(1, (opts && opts.cols) || 6);
    const header = !opts || opts.header !== false;
    host.setAttribute('aria-busy', 'true');
    // Deterministic, varied widths read as real labels/values while the flex
    // columns themselves stay equal-width so header and rows line up exactly.
    const headW = ['w-16', 'w-24', 'w-20', 'w-28', 'w-14', 'w-24', 'w-20'];
    const cellW = ['w-3/4', 'w-1/2', 'w-2/3', 'w-4/5', 'w-2/5', 'w-3/5', 'w-1/2'];
    const parts = [];
    parts.push('<div class="w-full overflow-hidden rounded-xl border border-slate-200" aria-hidden="true">');
    if (header) {
      parts.push('<div class="flex gap-4 bg-gradient-to-r from-[#042F8D] to-[#0b4dc2] px-4 py-3.5">');
      for (let c = 0; c < cols; c++) {
        const base = c === 0 ? 'w-10 flex-none' : 'flex-1';
        const w = c === 0 ? 'w-5' : headW[c % headW.length];
        parts.push('<div class="' + base + '"><div class="gss-skel gss-skel--on-navy h-3 ' + w + '"></div></div>');
      }
      parts.push('</div>');
    }
    for (let r = 0; r < rows; r++) {
      parts.push('<div class="flex items-center gap-4 border-t border-slate-100 px-4 py-3">');
      for (let c = 0; c < cols; c++) {
        const base = c === 0 ? 'w-10 flex-none' : 'flex-1';
        const w = c === 0 ? 'w-6' : cellW[(r + c) % cellW.length];
        parts.push('<div class="' + base + '"><div class="gss-skel h-3.5 ' + w + '"></div></div>');
      }
      parts.push('</div>');
    }
    parts.push('</div>');
    host.innerHTML = parts.join('');
  };

  /**
   * Overlay skeleton pills over a grid toolbar while it initialises. The real
   * toolbar stays in place underneath (no layout shift); an opaque skeleton
   * layer mirrors the pill layout and is removed once the toolbar is ready.
   * Reference-safe: a second call with `on=true` never stacks a duplicate.
   * @param {Element | null | undefined} el
   * @param {boolean} on
   */
  const toolbarSkeleton = (el, on) => {
    const host = /** @type {HTMLElement | null} */ (
      el && /** @type {any} */ (el).nodeType === 1 ? /** @type {any} */ (el) : null
    );
    if (!host) return;
    injectStyles();
    const existing = host.querySelector(':scope > [data-gss-toolbar-skel="1"]');
    if (on) {
      if (existing) return;
      host.classList.add('gss-overlay-host');
      const layer = document.createElement('div');
      layer.dataset.gssToolbarSkel = '1';
      layer.setAttribute('aria-hidden', 'true');
      layer.className = 'absolute inset-0 z-[6] flex items-center gap-3 bg-white px-4 py-3 sm:px-5';
      layer.innerHTML =
        '<div class="gss-skel h-9 w-28 rounded-full"></div>' +
        '<div class="gss-skel h-9 w-32 rounded-full"></div>' +
        '<div class="gss-skel h-9 w-32 rounded-full hidden sm:block"></div>' +
        '<div class="gss-skel h-9 w-24 rounded-full hidden md:block"></div>' +
        '<div class="gss-skel ml-auto h-3 w-16"></div>' +
        '<div class="gss-skel h-9 w-36 rounded-full"></div>';
      host.appendChild(layer);
    } else if (existing) {
      existing.remove();
    }
  };

  /**
   * Fill a container with skeleton cards (for dashboards / stat grids).
   * @param {Element | null | undefined} el
   * @param {{ count?: number, lines?: number }} [opts]
   */
  const cards = (el, opts) => {
    const host = /** @type {HTMLElement | null} */ (el && /** @type {any} */ (el));
    if (!host) return;
    injectStyles();
    const count = Math.max(1, (opts && opts.count) || 3);
    const lines = Math.max(1, (opts && opts.lines) || 3);
    host.setAttribute('aria-busy', 'true');
    const parts = ['<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">'];
    for (let i = 0; i < count; i++) {
      parts.push('<div class="rounded-xl border border-slate-200 bg-white p-4">');
      parts.push('<div class="gss-skel gss-skel--round h-10 w-10 mb-3"></div>');
      for (let l = 0; l < lines; l++) {
        const w = l === lines - 1 ? 'w-1/2' : 'w-full';
        parts.push('<div class="gss-skel h-3 mb-2 ' + w + '"></div>');
      }
      parts.push('</div>');
    }
    parts.push('</div>');
    host.innerHTML = parts.join('');
  };

  /** Clear the `aria-busy` marker a skeleton set on a container. */
  const clear = (/** @type {Element | null | undefined} */ el) => {
    const host = /** @type {HTMLElement | null} */ (el && /** @type {any} */ (el));
    if (host) host.removeAttribute('aria-busy');
  };

  /* ────────────────────────────────────────────────────────────────
   * 7. Full-page veil (reference-counted, used sparingly)
   * ──────────────────────────────────────────────────────────────── */
  /** @type {HTMLElement | null} */
  let fullPageEl = null;
  let fullPageCount = 0;
  const fullPage = (/** @type {boolean} */ on) => {
    if (on) {
      fullPageCount += 1;
      if (fullPageCount > 1) return;
      injectStyles();
      fullPageEl = document.createElement('div');
      fullPageEl.className = 'gss-fullpage';
      fullPageEl.setAttribute('role', 'status');
      fullPageEl.setAttribute('aria-live', 'polite');
      fullPageEl.setAttribute('aria-label', 'Loading');
      const sp = document.createElement('div');
      sp.className = 'gss-fullpage__spinner';
      fullPageEl.appendChild(sp);
      (document.body || document.documentElement).appendChild(fullPageEl);
      // Force reflow so the opacity transition runs.
      void fullPageEl.offsetWidth;
      fullPageEl.classList.add('is-active');
    } else {
      fullPageCount = Math.max(0, fullPageCount - 1);
      if (fullPageCount > 0 || !fullPageEl) return;
      const node = fullPageEl;
      fullPageEl = null;
      node.classList.remove('is-active');
      window.setTimeout(() => node.remove(), 220);
    }
  };

  /* ────────────────────────────────────────────────────────────────
   * 8. Convenience: run an async op with a chosen loader, always cleared
   * ──────────────────────────────────────────────────────────────── */
  /**
   * Wrap a promise-returning task so its loader is reliably cleared on both
   * success and failure (try/finally). `target` selects the loader:
   *   - a button-like element       → inline button spinner
   *   - { overlay: el }             → localised veil
   *   - { fullPage: true }          → full-page veil
   * @template T
   * @param {any} target
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  const run = async (target, task) => {
    let off = () => {};
    if (target && target.nodeType === 1) { button(target, true); off = () => button(target, false); }
    else if (target && target.overlay) { overlay(target.overlay, true); off = () => overlay(target.overlay, false); }
    else if (target && target.fullPage) { fullPage(true); off = () => fullPage(false); }
    try { return await task(); }
    finally { off(); }
  };

  /* ────────────────────────────────────────────────────────────────
   * 9. Page-load preloader (app-shell skeleton → no content/data jumping)
   * ──────────────────────────────────────────────────────────────── */
  /** @type {HTMLElement | null} */
  let pageSkelEl = null;
  let windowLoaded = false;

  /** Build the app-shell skeleton markup mirroring the real landing layout:
   *  a sticky top-panel search bar, then a navy hero with leftSideBody
   *  (headline + CTA + stat cards) and rightSideBody (logo card + benefits). */
  const pageSkeletonMarkup = () => {
    const nv = 'gss-skel gss-skel--on-navy';
    const stat = () =>
      '<div class="flex items-center gap-3 rounded-2xl bg-white/10 p-3.5">' +
        '<div class="' + nv + ' gss-skel--round h-11 w-11 shrink-0"></div>' +
        '<div class="flex-1 space-y-2">' +
          '<div class="' + nv + ' h-4 w-12"></div>' +
          '<div class="' + nv + ' h-2 w-16"></div>' +
        '</div>' +
      '</div>';
    const benefit = () =>
      '<div class="flex items-center gap-3">' +
        '<div class="' + nv + ' gss-skel--round h-9 w-9 shrink-0"></div>' +
        '<div class="' + nv + ' h-3 flex-1"></div>' +
      '</div>';
    const value = () =>
      '<div class="flex items-center gap-3 lg:justify-center">' +
        '<div class="' + nv + ' gss-skel--round h-11 w-11 shrink-0"></div>' +
        '<div class="space-y-2">' +
          '<div class="' + nv + ' h-3 w-24"></div>' +
          '<div class="' + nv + ' h-2 w-16"></div>' +
        '</div>' +
      '</div>';
    return `
      <div class="flex h-full flex-col">
        <!-- Top panel search bar (sticky white) -->
        <div class="border-b border-slate-200 bg-white">
          <div class="mx-auto flex w-full max-w-[1700px] items-center gap-3 px-5 py-3 sm:px-6 lg:px-8">
            <div class="flex shrink-0 items-center gap-2.5">
              <div class="gss-skel gss-skel--round h-10 w-10"></div>
              <div class="hidden flex-col gap-1.5 lg:flex">
                <div class="gss-skel h-3 w-44"></div>
                <div class="gss-skel h-2 w-28"></div>
              </div>
            </div>
            <div class="gss-skel h-11 min-w-0 flex-1 rounded-full"></div>
            <div class="flex shrink-0 items-center gap-4">
              <div class="gss-skel h-5 w-14"></div>
              <div class="hidden gss-skel h-5 w-16 sm:block"></div>
              <div class="hidden gss-skel h-5 w-16 md:block"></div>
            </div>
          </div>
        </div>
        <!-- Hero: leftSideBody + rightSideBody over navy -->
        <div class="gss-page-hero relative flex-1 overflow-hidden">
          <div class="mx-auto grid w-full max-w-[1700px] gap-6 px-5 py-8 sm:px-6 md:py-10 lg:grid-cols-[1.5fr_0.9fr] lg:items-center lg:gap-10 lg:px-8 lg:py-12">
            <!-- leftSideBody -->
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-3">
                <div class="${nv} h-px w-10"></div>
                <div class="${nv} h-3 w-40"></div>
              </div>
              <div class="space-y-3">
                <div class="${nv} h-9 w-11/12"></div>
                <div class="${nv} h-9 w-3/4"></div>
              </div>
              <div class="space-y-2">
                <div class="${nv} h-3 w-full max-w-xl"></div>
                <div class="${nv} h-3 w-4/5 max-w-xl"></div>
              </div>
              <div class="${nv} h-12 w-44 rounded-full"></div>
              <div class="mt-2 grid gap-3 sm:grid-cols-3">
                ${stat()}${stat()}${stat()}
              </div>
            </div>
            <!-- rightSideBody -->
            <div class="w-full rounded-[22px] border border-white/15 bg-white/5 p-5 sm:p-6 lg:ml-auto lg:max-w-[21rem]">
              <div class="flex flex-col items-center gap-2.5">
                <div class="${nv} gss-skel--round h-16 w-16"></div>
                <div class="${nv} h-3 w-40"></div>
                <div class="${nv} h-1 w-12 rounded-full"></div>
              </div>
              <div class="mt-4 ${nv} h-4 w-36"></div>
              <div class="mt-3 space-y-3">
                ${benefit()}${benefit()}${benefit()}${benefit()}
              </div>
            </div>
          </div>
        </div>
        <!-- Corporate values banner (footer) -->
        <div class="gss-page-hero border-t border-white/10">
          <div class="mx-auto grid w-full max-w-[1700px] grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 sm:px-6 md:py-6 lg:grid-cols-4 lg:divide-x lg:divide-white/15 lg:px-8">
            ${value()}${value()}${value()}${value()}
          </div>
        </div>
      </div>`;
  };

  /** Show the page preloader. No-op if already shown or reports own one. */
  const showPageSkeleton = () => {
    if (pageSkelEl || document.getElementById('reportSkeleton')) return;
    injectStyles();
    pageSkelEl = document.createElement('div');
    pageSkelEl.className = 'gss-page-skel';
    pageSkelEl.id = 'gssPageSkeleton';
    pageSkelEl.setAttribute('aria-hidden', 'true');
    pageSkelEl.innerHTML = pageSkeletonMarkup();
    (document.body || document.documentElement).appendChild(pageSkelEl);
  };

  /** Fade out and remove the page preloader. */
  const hidePageSkeleton = () => {
    if (!pageSkelEl) return;
    const node = pageSkelEl;
    pageSkelEl = null;
    node.classList.add('is-hidden');
    window.setTimeout(() => node.remove(), 450);
  };

  // Reveal the real page only once the window has loaded AND no API request
  // is still in flight — so data lands before the skeleton lifts (no jumping).
  const maybeHidePage = () => {
    if (windowLoaded && pending === 0) hidePageSkeleton();
  };

  /** @type {any} */ (window).GSSShimmer = {
    begin, end,
    button,
    overlay,
    tableSkeleton,
    toolbarSkeleton,
    cards,
    clear,
    fullPage,
    run,
    showPageSkeleton,
    hidePageSkeleton,
  };

  /* ────────────────────────────────────────────────────────────────
   * 10. Auto page-load preloader
   * ──────────────────────────────────────────────────────────────── */
  // Opt out per page with <html data-no-page-skeleton> or an existing
  // report skeleton (reports manage their own).
  const pageSkeletonOptedOut = () =>
    document.documentElement.hasAttribute('data-no-page-skeleton') ||
    !!document.getElementById('reportSkeleton');

  if (!pageSkeletonOptedOut()) {
    // Show as early as possible so the real layout never flashes in first.
    if (document.body) showPageSkeleton();
    else document.addEventListener('DOMContentLoaded', showPageSkeleton, { once: true });

    const onReady = () => { windowLoaded = true; maybeHidePage(); };
    if (document.readyState === 'complete') onReady();
    else window.addEventListener('load', onReady, { once: true });

    // Safety net: never leave the preloader stuck if load/fetches stall.
    window.setTimeout(() => { windowLoaded = true; hidePageSkeleton(); }, 9000);
  }
})();
