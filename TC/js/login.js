// @ts-check
/// <reference path="../js/utils/translation.js" />
// ── GSS login page · UI logic ─────────────────────────────────────
// Translation strings live in translation.js (see `loginTranslations`),
// which is loaded before this file. Wrapped in an IIFE so its locals
// never collide with translation.js globals.
(() => {
  'use strict';

  // `loginTranslations` and `GSS_LANG_KEY` come from translation.js.
  const dictFor = (/** @type {string} */ lang) =>
    /** @type {Record<string, string>} */ (
      loginTranslations[/** @type {keyof typeof loginTranslations} */ (lang)] || loginTranslations.en
    );

  // Read the shared language; anything other than 'fr' defaults to English.
  const getStoredLang = () => {
    const saved = localStorage.getItem(GSS_LANG_KEY);
    return saved === 'fr' || saved === 'en' ? saved : 'en';
  };

  let currentLang = getStoredLang();

  const langButtons = Array.from(document.querySelectorAll('[data-lang]')).slice(0, 2);

  // ── DOM references ──────────────────────────────────────────────
  const pwd = /** @type {HTMLInputElement | null} */ (document.getElementById('password'));
  const toggleBtn = document.getElementById('togglePassword');
  const eyeOpen = document.getElementById('eyeOpen');
  const eyeClosed = document.getElementById('eyeClosed');
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById('loginForm'));
  const statusEl = document.getElementById('formStatus');
  const yearEl = document.getElementById('year');
  const rememberEl = /** @type {HTMLInputElement | null} */ (document.getElementById('remember'));


  // The username of an account that authenticated but must change its password
  // before entering the app (first-login flow).
  let pendingUsername = '';

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

    // Keep the password toggle's aria-label localized.
    if (toggleBtn) {
      const shown = pwd && pwd.type === 'text';
      toggleBtn.setAttribute('aria-label', shown ? dict.hidePassword : dict.showPassword);
    }

    // Persist so every other page/panel follows the same language.
    localStorage.setItem(GSS_LANG_KEY, lang);
  };

  // ── Password visibility toggle ──────────────────────────────────
  if (toggleBtn && pwd) {
    toggleBtn.addEventListener('click', () => {
      const show = pwd.type === 'password';
      pwd.type = show ? 'text' : 'password';
      eyeOpen?.classList.toggle('hidden', show);
      eyeClosed?.classList.toggle('hidden', !show);
      const dict = dictFor(currentLang);
      toggleBtn.setAttribute('aria-label', show ? dict.hidePassword : dict.showPassword);
    });
  }

  // ── Language switcher wiring ────────────────────────────────────
  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyLanguage(btn.getAttribute('data-lang') ?? currentLang));
  });

  // ── Footer year ─────────────────────────────────────────────────
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // ── Change-password (first login) modal ────────────────────────
  const changePwdModal = document.getElementById('changePwdModal');
  const changePwdForm = /** @type {HTMLFormElement | null} */ (document.getElementById('changePwdForm'));
  const changePwdStatus = document.getElementById('changePwdStatus');
  const cpCurrent = /** @type {HTMLInputElement | null} */ (document.getElementById('cpCurrent'));
  const cpNew = /** @type {HTMLInputElement | null} */ (document.getElementById('cpNew'));
  const cpConfirm = /** @type {HTMLInputElement | null} */ (document.getElementById('cpConfirm'));

  /** Persist the signed-in user then enter the application. */
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

  // ── Auto-login / session persistence (GitHub-like) ──────────────
  // If a user is already signed in and their account is still valid, skip the
  // login form and enter the app directly. The stored session is reconciled
  // against the live account (/api/me) so disabled/deleted users are forced to
  // sign in again; a network error falls back to the stored session (offline).
  const attemptAutoLogin = async () => {
    const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
    if (!session || !session.username) return;

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
          window.setTimeout(enterApp, 800);
          return;
        }
        changePwdStatus.textContent = data && data.status === 'weak' ? dict.cpErrShort : dict.cpErrCurrent;
      } catch (_) {
        changePwdStatus.textContent = dict.errServer;
      }
    });
  }

  // ── Forgot password modal ───────────────────────────────────────
  const forgotLink = document.getElementById('forgotLink');
  const forgotModal = document.getElementById('forgotModal');
  const forgotForm = /** @type {HTMLFormElement | null} */ (document.getElementById('forgotForm'));
  const forgotStatus = document.getElementById('forgotStatus');
  const closeForgotBtn = document.getElementById('closeForgotBtn');
  const forgotToLogin = document.getElementById('forgotToLogin');
  const fpUsername = /** @type {HTMLInputElement | null} */ (document.getElementById('fpUsername'));
  const fpResult = document.getElementById('fpResult');
  const fpTempPassword = document.getElementById('fpTempPassword');
  const fpSubmitBtn = document.getElementById('fpSubmitBtn');

  const openForgot = () => {
    if (!forgotModal) return;
    forgotModal.classList.remove('hidden');
    forgotModal.classList.add('flex');
    forgotModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
    if (forgotForm) forgotForm.reset();
    if (forgotStatus) forgotStatus.textContent = '';
    fpResult?.classList.add('hidden');
    fpSubmitBtn?.classList.remove('hidden');
    // Prefill with whatever is already typed in the login username field.
    const loginEmail = /** @type {HTMLInputElement | null} */ (document.getElementById('email'));
    if (fpUsername && loginEmail) fpUsername.value = loginEmail.value.trim();
    if (fpUsername) window.setTimeout(() => fpUsername.focus(), 50);
  };

  const closeForgot = () => {
    if (!forgotModal) return;
    forgotModal.classList.add('hidden');
    forgotModal.classList.remove('flex');
    forgotModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');
  };

  if (forgotLink) forgotLink.addEventListener('click', (e) => { e.preventDefault(); openForgot(); });
  if (closeForgotBtn) closeForgotBtn.addEventListener('click', closeForgot);
  if (forgotToLogin) forgotToLogin.addEventListener('click', closeForgot);
  if (forgotModal) forgotModal.addEventListener('click', (e) => { if (e.target === forgotModal) closeForgot(); });

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!forgotStatus) return;
      const dict = dictFor(currentLang);
      const username = fpUsername ? fpUsername.value.trim() : '';

      forgotStatus.classList.remove('text-emerald-600');
      forgotStatus.classList.add('text-red-600');
      if (!username) { forgotStatus.textContent = dict.fpErrRequired; return; }

      try {
        const res = await fetch(`${API_BASE}/api/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        const data = await res.json().catch(() => ({}));

        forgotStatus.classList.remove('text-red-600');
        forgotStatus.classList.add('text-emerald-600');
        forgotStatus.textContent = dict.fpSent;

        // No email in this environment: reveal the temporary password and
        // prefill the login form so the user can sign in and change it.
        if (data && data.temp_password && fpResult && fpTempPassword) {
          fpTempPassword.textContent = data.temp_password;
          fpResult.classList.remove('hidden');
          fpSubmitBtn?.classList.add('hidden');
          const loginEmail = /** @type {HTMLInputElement | null} */ (document.getElementById('email'));
          const loginPwd = /** @type {HTMLInputElement | null} */ (document.getElementById('password'));
          if (loginEmail) loginEmail.value = username;
          if (loginPwd) loginPwd.value = data.temp_password;
        }
      } catch (_) {
        forgotStatus.classList.remove('text-emerald-600');
        forgotStatus.classList.add('text-red-600');
        forgotStatus.textContent = dict.errServer;
      }
    });
  }

  // ── Login submit → authenticate against the server ─────────────
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

      try {
        const res = await fetch(`${API_BASE}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json().catch(() => ({}));

        if (data && data.ok) {
          const user = (data.user && typeof data.user === 'object') ? data.user : { username };
          storeUser(user);

          // First-login / forced change: gather a new password before entering.
          if (data.must_change_password) {
            statusEl.textContent = '';
            openChangePwd(user.username || username);
            return;
          }

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
      }
    });
  }

  // ── Sign up modal ───────────────────────────────────────────────
  const signupModal = document.getElementById('signupModal');
  const openSignupBtn = document.getElementById('openSignupBtn');
  const closeSignupBtn = document.getElementById('closeSignupBtn');
  const signupToLogin = document.getElementById('signupToLogin');
  const signupForm = /** @type {HTMLFormElement | null} */ (document.getElementById('signupForm'));
  const signupStatus = document.getElementById('signupStatus');
  const suToggle = document.getElementById('suTogglePassword');
  const suPwd = /** @type {HTMLInputElement | null} */ (document.getElementById('suPassword'));
  const suEyeOpen = document.getElementById('suEyeOpen');
  const suEyeClosed = document.getElementById('suEyeClosed');

  const openSignup = () => {
    if (!signupModal) return;
    signupModal.classList.remove('hidden');
    signupModal.classList.add('flex');
    signupModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
    const firstField = document.getElementById('suName');
    if (firstField) window.setTimeout(() => firstField.focus(), 50);
  };

  const closeSignup = () => {
    if (!signupModal) return;
    signupModal.classList.add('hidden');
    signupModal.classList.remove('flex');
    signupModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');
  };

  if (openSignupBtn) {
    openSignupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openSignup();
    });
  }
  if (closeSignupBtn) closeSignupBtn.addEventListener('click', closeSignup);
  if (signupToLogin) signupToLogin.addEventListener('click', closeSignup);

  // Close on backdrop click.
  if (signupModal) {
    signupModal.addEventListener('click', (e) => {
      if (e.target === signupModal) closeSignup();
    });
  }
  // Close on Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && signupModal && !signupModal.classList.contains('hidden')) {
      closeSignup();
    }
  });

  // Show/hide the sign-up password.
  if (suToggle && suPwd) {
    suToggle.addEventListener('click', () => {
      const show = suPwd.type === 'password';
      suPwd.type = show ? 'text' : 'password';
      suEyeOpen?.classList.toggle('hidden', show);
      suEyeClosed?.classList.toggle('hidden', !show);
      const dict = dictFor(currentLang);
      suToggle.setAttribute('aria-label', show ? dict.hidePassword : dict.showPassword);
    });
  }

  // Validate + submit the sign-up form.
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!signupStatus) return;
      const dict = dictFor(currentLang);
      const nameField = /** @type {HTMLInputElement} */ (signupForm.elements.namedItem('name'));
      const emailField = /** @type {HTMLInputElement} */ (signupForm.elements.namedItem('email'));
      const passwordField = /** @type {HTMLInputElement} */ (signupForm.elements.namedItem('password'));
      const confirmField = /** @type {HTMLInputElement} */ (signupForm.elements.namedItem('confirm'));
      const name = nameField.value.trim();
      const email = emailField.value.trim();
      const pw = passwordField.value;
      const confirm = confirmField.value;
      const termsEl = /** @type {HTMLInputElement | null} */ (document.getElementById('suTerms'));
      const terms = !!termsEl && termsEl.checked;

      signupStatus.classList.remove('text-emerald-600');
      signupStatus.classList.add('text-red-600');

      if (!name) {
        signupStatus.textContent = dict.signupErrName;
        return;
      }
      if (!email) {
        signupStatus.textContent = dict.signupErrUsername;
        return;
      }
      if (pw.length < 8) {
        signupStatus.textContent = dict.signupErrPwShort;
        return;
      }
      if (pw !== confirm) {
        signupStatus.textContent = dict.signupErrPwMatch;
        return;
      }
      if (!terms) {
        signupStatus.textContent = dict.signupErrTerms;
        return;
      }

      // Create the account on the server. New accounts are flagged to change
      // their password on first login.
      try {
        const forceChangeCb = /** @type {HTMLInputElement | null} */ (document.getElementById('suForceChange'));
        const mustChange = !forceChangeCb || forceChangeCb.checked;
        const roleSel = /** @type {HTMLSelectElement | null} */ (document.getElementById('suRole'));
        const role = roleSel && roleSel.value ? roleSel.value : 'Candidate';
        const res = await fetch(`${API_BASE}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: email, fullName: name, password: pw, mustChange, role }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data || !data.ok) {
          if (data && data.status === 'exists') signupStatus.textContent = dict.signupErrExists;
          else if (data && data.status === 'weak') signupStatus.textContent = dict.signupErrPwShort;
          else signupStatus.textContent = dict.signupErrUsername;
          return;
        }
      } catch (_) {
        signupStatus.textContent = dict.errServer;
        return;
      }

      // Success. Prefill the login username and close the modal.
      signupStatus.classList.remove('text-red-600');
      signupStatus.classList.add('text-emerald-600');
      signupStatus.textContent = dict.signupSuccess;

      const loginEmail = /** @type {HTMLInputElement | null} */ (document.getElementById('email'));
      if (loginEmail) loginEmail.value = email;

      window.setTimeout(() => {
        closeSignup();
        signupForm.reset();
        signupStatus.textContent = '';
      }, 1200);
    });
  }

  // ── Initial apply (default English unless French was chosen) ────
  applyLanguage(currentLang);

  // Default "remember me" on so sessions persist across browser restarts.
  if (rememberEl) rememberEl.checked = true;

  // Enter the app automatically when a valid session already exists.
  attemptAutoLogin();
})();
