const initInscriptionForm = () => {
  const form = document.getElementById('inscriptionForm');
  const status = document.getElementById('formStatus');
  if (!form || !status) return;

  // ── Localized messages (follows the page language) ──────────
  const messages = {
    fr: {
      required: 'Veuillez saisir au moins votre nom complet et votre téléphone principal.',
      phone: 'Veuillez saisir un numéro de téléphone valide (7 à 15 chiffres).',
      email: 'Veuillez saisir une adresse e-mail valide.',
      dobFuture: 'La date de naissance ne peut pas être dans le futur.',
      dobAge: 'Le candidat doit avoir au moins 18 ans.',
      dateInvalid: 'Veuillez saisir une date valide.',
      selectCity: 'Sélectionnez votre ville',
      selectCountryFirst: "Sélectionnez d'abord le pays",
      ready: (n) => `Formulaire prêt à être envoyé. ${n} champ(s) complété(s).`
    },
    en: {
      required: 'Please enter at least your full name and primary phone number.',
      phone: 'Please enter a valid phone number (7 to 15 digits).',
      email: 'Please enter a valid email address.',
      dobFuture: 'The date of birth cannot be in the future.',
      dobAge: 'The applicant must be at least 18 years old.',
      dateInvalid: 'Please enter a valid date.',
      selectCity: 'Select your city',
      selectCountryFirst: 'Select a country first',
      ready: (n) => `Form ready to be submitted. ${n} field(s) completed.`
    }
  };
  const t = () => messages[document.documentElement.lang] || messages.en;

  // ── Element refs ────────────────────────────────────────────
  const countrySelect = form.elements['nationalite'];
  const citySelect = form.elements['lieuNaissance'];
  const dobInput = form.elements['dateNaissance'];

  // ── Visual filled-state indicator ───────────────────────────
  const markFilled = (element) => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      const isFilled = element.value.trim() !== '';
      element.classList.toggle('border-amber-400', isFilled);
      element.classList.toggle('bg-amber-50', isFilled);
    }
  };

  form.querySelectorAll('input, textarea, select').forEach((element) => {
    markFilled(element);
    element.addEventListener('input', () => markFilled(element));
    element.addEventListener('change', () => markFilled(element));
  });

  // ── Field error helpers ─────────────────────────────────────
  const setError = (element, hasError) => {
    if (!element) return;
    element.classList.toggle('border-red-500', hasError);
    element.classList.toggle('ring-2', hasError);
    element.classList.toggle('ring-red-200', hasError);
  };
  const clearError = (element) => setError(element, false);

  // ── Validators ──────────────────────────────────────────────
  const isValidPhone = (value) => {
    if (value.trim() === '') return true; // optional unless flagged required
    if (!/^\+?[0-9\s().-]{7,20}$/.test(value)) return false;
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  };
  const isValidEmail = (value) => {
    if (value.trim() === '') return true; // optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  // ── Populate the country dropdown ───────────────────────────
  const locations = window.GSS_LOCATIONS || { countries: [], cities: {} };

  const populateCountries = () => {
    if (!countrySelect) return;
    const placeholder = countrySelect.querySelector('option[value=""]');
    countrySelect.innerHTML = '';
    if (placeholder) countrySelect.appendChild(placeholder);
    locations.countries.forEach((country) => {
      const option = document.createElement('option');
      option.value = country;
      option.textContent = country;
      countrySelect.appendChild(option);
    });
  };

  const populateCities = (country) => {
    if (!citySelect) return;
    const cities = locations.cities[country] || [];
    citySelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    if (!country) {
      placeholder.textContent = t().selectCountryFirst;
      placeholder.setAttribute('data-i18n', 'optSelectCountryFirst');
      citySelect.appendChild(placeholder);
      citySelect.disabled = true;
      return;
    }

    placeholder.textContent = t().selectCity;
    placeholder.setAttribute('data-i18n', 'optSelectCity');
    citySelect.appendChild(placeholder);

    cities.forEach((city) => {
      const option = document.createElement('option');
      option.value = city;
      option.textContent = city;
      citySelect.appendChild(option);
    });
    citySelect.disabled = false;
  };

  populateCountries();
  populateCities(countrySelect ? countrySelect.value : '');

  if (countrySelect) {
    countrySelect.addEventListener('change', () => {
      populateCities(countrySelect.value);
      markFilled(citySelect);
    });
  }

  // ── Date of birth bounds: must be 18+ and not in the future ──
  if (dobInput) {
    const today = new Date();
    const maxDob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const minDob = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
    const toISO = (d) => {
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d - tz).toISOString().split('T')[0];
    };
    dobInput.max = toISO(maxDob);
    dobInput.min = toISO(minDob);
  }

  // ── Submit ──────────────────────────────────────────────────
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const m = t();

    [
      form.elements['nom'],
      form.elements['telephone1'],
      form.elements['telephone2'],
      form.elements['email'],
      dobInput
    ].forEach(clearError);

    // Required fields
    const requiredFields = ['nom', 'telephone1'];
    const missing = requiredFields.filter((name) => {
      const field = form.elements[name];
      return !field || field.value.trim() === '';
    });
    if (missing.length) {
      missing.forEach((name) => setError(form.elements[name], true));
      status.textContent = m.required;
      status.className = 'min-h-6 text-sm font-semibold text-red-600';
      return;
    }

    // Phone format
    for (const name of ['telephone1', 'telephone2']) {
      const field = form.elements[name];
      if (field && !isValidPhone(field.value)) {
        setError(field, true);
        field.focus();
        status.textContent = m.phone;
        status.className = 'min-h-6 text-sm font-semibold text-red-600';
        return;
      }
    }

    // Email format
    const emailField = form.elements['email'];
    if (emailField && !isValidEmail(emailField.value)) {
      setError(emailField, true);
      emailField.focus();
      status.textContent = m.email;
      status.className = 'min-h-6 text-sm font-semibold text-red-600';
      return;
    }

    // Date of birth validation
    if (dobInput && dobInput.value.trim() !== '') {
      const dob = new Date(dobInput.value);
      if (Number.isNaN(dob.getTime())) {
        setError(dobInput, true);
        dobInput.focus();
        status.textContent = m.dateInvalid;
        status.className = 'min-h-6 text-sm font-semibold text-red-600';
        return;
      }
      const now = new Date();
      if (dob > now) {
        setError(dobInput, true);
        dobInput.focus();
        status.textContent = m.dobFuture;
        status.className = 'min-h-6 text-sm font-semibold text-red-600';
        return;
      }
      let age = now.getFullYear() - dob.getFullYear();
      const monthDiff = now.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
      if (age < 18) {
        setError(dobInput, true);
        dobInput.focus();
        status.textContent = m.dobAge;
        status.className = 'min-h-6 text-sm font-semibold text-red-600';
        return;
      }
    }

    // Success summary
    const data = new FormData(form);
    const summary = [];
    for (const [key, value] of data.entries()) {
      if (value && value.trim() !== '') summary.push(`${key}: ${value}`);
    }

    status.textContent = m.ready(summary.length);
    status.className = 'min-h-6 text-sm font-semibold text-emerald-600';
  });
};

// ── Reusable digital signature pads ──────────────────────────
const initSignaturePads = () => {
  document.querySelectorAll('.gss-sign').forEach((wrapper) => {
    const canvas = wrapper.querySelector('.gss-sign-canvas');
    const input = wrapper.querySelector('.gss-sign-input');
    const hint = wrapper.querySelector('.gss-sign-hint');
    const clearBtn = wrapper.querySelector('.gss-sign-clear');
    if (!canvas || !input || canvas.dataset.signReady) return;
    canvas.dataset.signReady = 'true';

    const ctx = canvas.getContext('2d');
    let drawing = false;
    let hasInk = false;
    let lastX = 0;
    let lastY = 0;

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      const previous = hasInk ? canvas.toDataURL() : null;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#042F8D';
      if (previous) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = previous;
      }
    };

    const pointerPos = (event) => {
      const rect = canvas.getBoundingClientRect();
      const source = event.touches ? event.touches[0] : event;
      return { x: source.clientX - rect.left, y: source.clientY - rect.top };
    };

    const startDraw = (event) => {
      event.preventDefault();
      drawing = true;
      const { x, y } = pointerPos(event);
      lastX = x;
      lastY = y;
    };

    const moveDraw = (event) => {
      if (!drawing) return;
      event.preventDefault();
      const { x, y } = pointerPos(event);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastX = x;
      lastY = y;
      if (!hasInk) {
        hasInk = true;
        if (hint) hint.classList.add('hidden');
      }
    };

    const endDraw = () => {
      if (!drawing) return;
      drawing = false;
      if (hasInk) input.value = canvas.toDataURL('image/png');
    };

    const clearSignature = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInk = false;
      input.value = '';
      if (hint) hint.classList.remove('hidden');
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', endDraw);

    if (clearBtn) clearBtn.addEventListener('click', clearSignature);
    const parentForm = canvas.closest('form');
    if (parentForm) parentForm.addEventListener('reset', () => setTimeout(clearSignature, 0));

    syncCanvasSize();
    if ('ResizeObserver' in window) {
      new ResizeObserver(syncCanvasSize).observe(canvas);
    } else {
      window.addEventListener('resize', syncCanvasSize);
    }
  });
};

// Auto-init when used as a standalone page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initInscriptionForm();
    initSignaturePads();
  });
} else {
  initInscriptionForm();
  initSignaturePads();
}


// Expose for dynamic initialization after modal injection
window.initInscriptionForm = initInscriptionForm;

