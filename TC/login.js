// ── GSS login page · UI logic ─────────────────────────────────────
// Translation strings live in translation.js (see `loginTranslations`),
// which is loaded before this file. Wrapped in an IIFE so its locals
// never collide with translation.js globals.
(() => {
  'use strict';

  // `loginTranslations` and `GSS_LANG_KEY` come from translation.js.
  const dictFor = (lang) => loginTranslations[lang] || loginTranslations.en;

  // Read the shared language; anything other than 'fr' defaults to English.
  const getStoredLang = () => {
    const saved = localStorage.getItem(GSS_LANG_KEY);
    return saved === 'fr' || saved === 'en' ? saved : 'en';
  };

  let currentLang = getStoredLang();

  const langButtons = Array.from(document.querySelectorAll('[data-lang]')).slice(0, 2);

  // ── DOM references ──────────────────────────────────────────────
  const pwd = document.getElementById('password');
  const toggleBtn = document.getElementById('togglePassword');
  const eyeOpen = document.getElementById('eyeOpen');
  const eyeClosed = document.getElementById('eyeClosed');
  const form = document.getElementById('loginForm');
  const statusEl = document.getElementById('formStatus');
  const yearEl = document.getElementById('year');

  // ── Apply the selected language across the login page ───────────
  const applyLanguage = (lang) => {
    const dict = dictFor(lang);
    currentLang = lang;

    document.documentElement.lang = lang;
    document.title = dict.title;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] != null) el.textContent = dict[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] != null) el.placeholder = dict[key];
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
      eyeOpen.classList.toggle('hidden', show);
      eyeClosed.classList.toggle('hidden', !show);
      const dict = dictFor(currentLang);
      toggleBtn.setAttribute('aria-label', show ? dict.hidePassword : dict.showPassword);
    });
  }

  // ── Language switcher wiring ────────────────────────────────────
  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyLanguage(btn.getAttribute('data-lang')));
  });

  // ── Footer year ─────────────────────────────────────────────────
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ── Lightweight client-side validation feedback ─────────────────
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dict = dictFor(currentLang);
      statusEl.classList.remove('text-emerald-600');
      statusEl.classList.add('text-red-600');

      if (!form.email.value.trim() || !form.password.value.trim()) {
        statusEl.textContent = dict.errRequired;
        return;
      }
      if (!form.email.checkValidity()) {
        statusEl.textContent = dict.errEmail;
        return;
      }

      statusEl.classList.remove('text-red-600');
      statusEl.classList.add('text-emerald-600');
      statusEl.textContent = dict.signingIn;

      // The language choice is already saved; continue into the app.
      window.setTimeout(() => {
        window.location.href = './tc.html';
      }, 600);
    });
  }

  // ── Sign up modal ───────────────────────────────────────────────
  const signupModal = document.getElementById('signupModal');
  const openSignupBtn = document.getElementById('openSignupBtn');
  const closeSignupBtn = document.getElementById('closeSignupBtn');
  const signupToLogin = document.getElementById('signupToLogin');
  const signupForm = document.getElementById('signupForm');
  const signupStatus = document.getElementById('signupStatus');
  const suToggle = document.getElementById('suTogglePassword');
  const suPwd = document.getElementById('suPassword');
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
      suEyeOpen.classList.toggle('hidden', show);
      suEyeClosed.classList.toggle('hidden', !show);
      const dict = dictFor(currentLang);
      suToggle.setAttribute('aria-label', show ? dict.hidePassword : dict.showPassword);
    });
  }

  // Validate + submit the sign-up form.
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const dict = dictFor(currentLang);
      const name = signupForm.name.value.trim();
      const email = signupForm.email.value.trim();
      const pw = signupForm.password.value;
      const confirm = signupForm.confirm.value;
      const terms = document.getElementById('suTerms').checked;

      signupStatus.classList.remove('text-emerald-600');
      signupStatus.classList.add('text-red-600');

      if (!name) {
        signupStatus.textContent = dict.signupErrName;
        return;
      }
      if (!signupForm.email.checkValidity() || !email) {
        signupStatus.textContent = dict.signupErrEmail;
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

      // Success (front-end only). Prefill the login email and close.
      signupStatus.classList.remove('text-red-600');
      signupStatus.classList.add('text-emerald-600');
      signupStatus.textContent = dict.signupSuccess;

      const loginEmail = document.getElementById('email');
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
})();
