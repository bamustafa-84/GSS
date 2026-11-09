// @ts-check
/// <reference path="../js/utils/translation.js" />
// ── GSS login page · UI logic ─────────────────────────────────────
// Translation strings live in translation.js (see `loginTranslations`),
// which is loaded before this file. Wrapped in an IIFE so its locals
// never collide with translation.js globals.
(() => {

  //#region GET LANGUAGE
  // `loginTranslations` and `GSS_LANG_KEY` come from translation.js.
  const dictFor = (/** @type {string} */ lang) =>
    /** @type {Record<string, string>} */ (
      loginTranslations[/** @type {keyof typeof loginTranslations} */ (lang)] || loginTranslations.en
  );

  // Read the shared language; anything other than 'fr' defaults to English.
  let currentLang = localStorage.getItem(GSS_LANG_KEY) || 'en';
  const langButtons = Array.from(document.querySelectorAll('[data-lang]')).slice(0, 2);
  //#endregion
 
  //#region APPLY DEFAULT LANGUAGE (ENG)                                                                 E
  // ── Apply the selected language across the login page ───────────
    const applyLanguage = (/** @type {string} */ lang) => {
      const dict = dictFor(lang);
      currentLang = lang;

      document.documentElement.lang = lang;
      document.title = dict.title;

      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key && dict[key] != null) el.textContent = dict[key];
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key && dict[key] != null) /** @type {HTMLInputElement} */ (el).placeholder = dict[key];
      });

      // Active/inactive states for the FR/EN buttons (mirrors tc.html).
      langButtons.forEach((btn) => {
        const active = btn.getAttribute('data-lang') === lang;
        btn.classList.toggle('bg-[#042F8D]', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('text-[#042F8D]', !active);
      });

      // Persist so every other page/panel follows the same language.
      localStorage.setItem(GSS_LANG_KEY, lang);
    };
  //#endregion

  //#region LANGUAGE SWITCHER
  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyLanguage(btn.getAttribute('data-lang') ?? currentLang));
  });
  //#endregion

  //#region PASSWORD VISIBILITY TOGGLE
   // This section handles the toggling of the password visibility in the login form.
  const toggleBtn = document.getElementById('togglePassword');
  const pwd = /** @type {HTMLInputElement | null} */ (document.getElementById('password'));
  if (toggleBtn && pwd) {
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');
    toggleBtn.addEventListener('click', () => {
      const show = pwd.type === 'password';
      pwd.type = show ? 'text' : 'password';
      eyeOpen?.classList.toggle('hidden', show);
      eyeClosed?.classList.toggle('hidden', !show);
      const dict = dictFor(currentLang);
      toggleBtn.setAttribute('aria-label', show ? dict.hidePassword : dict.showPassword);
    });
  }
  //#endregion

  //#region REMEMBER ME CHECKBOX
  const rememberEl = /** @type {HTMLInputElement | null} */ (document.getElementById('remember'));
  if (rememberEl) 
    rememberEl.checked = true;
  //#endregion

  //#region SET YEAR IN FOOTER
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  //#endregion


  //#region COMMON UTILS
  const enterApp = () => { window.location.href = './tc.html'; };

  const storeUser = (/** @type {any} */ user) => {
    const remember = !!(rememberEl && rememberEl.checked);
    if (typeof GSSSession !== 'undefined') GSSSession.set(user || {}, remember);
    else {
      try {
        (remember ? window.localStorage : window.sessionStorage).setItem('gss-user', JSON.stringify(user || {}));
      } catch (_) { /* storage may be unavailable */ }
    }
  };

  let pendingUsername = '';
  const changePwdModal = document.getElementById('changePwdModal');
  const changePwdForm = /** @type {HTMLFormElement | null} */ (document.getElementById('changePwdForm'));
  const changePwdStatus = document.getElementById('changePwdStatus');
  const cpCurrent = /** @type {HTMLInputElement | null} */ (document.getElementById('cpCurrent'));

  // The username of an account that authenticated but must change its password
  // before entering the app (first-login flow).
  const openChangePwd = (/** @type {string} */ username) => {
    pendingUsername = username;
    if (!changePwdModal) { enterApp(); return; }
    changePwdModal.classList.remove('hidden');
    changePwdModal.classList.add('flex');
    changePwdModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
    if (changePwdForm) changePwdForm.reset();
    if (changePwdStatus) changePwdStatus.textContent = '';
    if (cpCurrent) window.setTimeout(() => cpCurrent.focus(), 50);
  };
  //#endregion

  //#region CHANGE-PASSWORD (FIRST LOGIN) MODAL OVERLAY
  const cpNew = /** @type {HTMLInputElement | null} */ (document.getElementById('cpNew'));
  const cpConfirm = /** @type {HTMLInputElement | null} */ (document.getElementById('cpConfirm'));

  if (changePwdForm) {
    changePwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!changePwdStatus) return;
      const dict = dictFor(currentLang);
      const current = cpCurrent ? cpCurrent.value : '';
      const next = cpNew ? cpNew.value : '';
      const confirm = cpConfirm ? cpConfirm.value : '';

      changePwdStatus.classList.remove('text-emerald-600');
      changePwdStatus.classList.add('text-red-600');

      if (!current || !next || !confirm) { changePwdStatus.textContent = dict.cpErrRequired; return; }
      if (next.length < 8) { changePwdStatus.textContent = dict.cpErrShort; return; }
      if (next !== confirm) { changePwdStatus.textContent = dict.cpErrMatch; return; }
      if (next === current) { changePwdStatus.textContent = dict.cpErrSame; return; }

      try {
        const res = await fetch(`${API_BASE}/api/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: pendingUsername, currentPassword: current, newPassword: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.ok) {
          changePwdStatus.classList.remove('text-red-600');
          changePwdStatus.classList.add('text-emerald-600');
          changePwdStatus.textContent = dict.cpSuccess;
          // Sign in again with the new password to obtain an API token.
          try {
            const relogin = await fetch(`${API_BASE}/api/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: pendingUsername, password: next }),
            }).then((r) => r.json());
            if (relogin && relogin.ok && relogin.token) {
              storeUser(Object.assign({}, relogin.user || { username: pendingUsername }, { token: relogin.token }));
              window.setTimeout(enterApp, 800);
              return;
            }
          } catch (_) { /* fall through to manual sign-in */ }
          // No token issued: keep the user on the sign-in screen to retry.
          changePwdStatus.textContent = dict.cpSuccess;
          return;
        }
        changePwdStatus.textContent = data && data.status === 'weak' ? dict.cpErrShort : dict.cpErrCurrent;
      } catch (_) {
        changePwdStatus.textContent = dict.errServer;
      }
    });
  }

  // If a user is already signed in and their account is still valid, skip the
  // login form and enter the app directly. The stored session is reconciled
  // against the live account (/api/me) so disabled/deleted users are forced to
  // sign in again; a network error falls back to the stored session (offline).
  const attemptAutoLogin = async () => {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    if (!session || !session.username) return;

    // A stored session without an API token cannot authorize protected calls
    // (e.g. a legacy session saved before tokens existed). Force a fresh
    // sign-in so the server issues a token instead of entering the app blind.
    if (!session.token) { if (typeof GSSSession !== 'undefined') GSSSession.clear(); return; }

    // Optimistically hide the auth UI to avoid a flash of the login form.
    document.body.classList.add('gss-auto-login');

    try {
      const info = await fetch(`${API_BASE}/api/me?username=${encodeURIComponent(session.username)}`, {
        headers: { Accept: 'application/json' },
      }).then((r) => r.json());

      if (info && info.ok && info.is_active !== false) {
        // Refresh the stored role/name from the live account, then enter.
        if (typeof GSSSession !== 'undefined' && GSSSession.update) {
          GSSSession.update({ role: info.role, full_name: info.full_name });
        }
        enterApp();
        return;
      }
      // Account is disabled or no longer exists → force a fresh sign-in.
      if (typeof GSSSession !== 'undefined') GSSSession.clear();
      document.body.classList.remove('gss-auto-login');
    } catch (_) {
      // Server unreachable — trust the stored session and enter the app.
      enterApp();
    }
  };
  //#endregion

  //#region SIGN IN FORM
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById('loginForm'));
  const statusEl = document.getElementById('formStatus'); // Display Error Messages for User
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!statusEl) return;
      const dict = dictFor(currentLang);
      statusEl.classList.remove('text-emerald-600');
      statusEl.classList.add('text-red-600');

      const emailField = /** @type {HTMLInputElement} */ (form.elements.namedItem('email'));
      const passwordField = /** @type {HTMLInputElement} */ (form.elements.namedItem('password'));
      const username = emailField.value.trim();
      const password = passwordField.value;

      if (!username || !password) {
        statusEl.textContent = dict.errRequired;
        return;
      }

      statusEl.classList.remove('text-red-600');
      statusEl.classList.add('text-emerald-600');
      statusEl.textContent = dict.signingIn;

      const loginBtn = /** @type {HTMLButtonElement | null} */ (form.querySelector('button[type="submit"]'));
      const shimmer = /** @type {any} */ (window).GSSShimmer;
      if (shimmer && loginBtn) shimmer.button(loginBtn, true);
      try {
        const res = await fetch(`${API_BASE}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json().catch(() => ({}));

        if (data && data.ok) {
          // First login / forced reset: the server withholds the API token
          // until the password is changed. Route to the change-password modal
          // (which re-logs in to obtain a token) instead of entering tokenless.
          if (data.must_change_password || !data.token) {
            statusEl.textContent = '';
            openChangePwd(username);
            return;
          }
          const user = (data.user && typeof data.user === 'object') ? Object.assign({}, data.user) : { username };
          user.token = data.token;
          storeUser(user);

          statusEl.textContent = dict.loginSuccess;
          window.setTimeout(enterApp, 500);
          return;
        }

        // Authentication failed — map the server status to a message.
        statusEl.classList.remove('text-emerald-600');
        statusEl.classList.add('text-red-600');
        const status = data && data.status;
        if (status === 'locked') statusEl.textContent = dict.errLocked;
        else if (status === 'inactive') statusEl.textContent = dict.errInactive;
        else statusEl.textContent = dict.errInvalidCreds;
      } catch (_) {
        statusEl.classList.remove('text-emerald-600');
        statusEl.classList.add('text-red-600');
        statusEl.textContent = dict.errServer;
      } finally {
        if (shimmer && loginBtn) shimmer.button(loginBtn, false);
      }
    });
  }
  //#endregion

  // Initial apply (default English unless French was chosen) ────
  applyLanguage(currentLang);

  // Enter the app automatically when a valid session already exists.
  attemptAutoLogin();
})();
