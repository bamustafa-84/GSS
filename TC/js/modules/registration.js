// @ts-check
/// <reference path="../utils/translation.js" />
/// <reference path="../utils/commonUtils.js" />

const initInscriptionForm = () => {
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById('inscriptionForm'));
  const status = document.getElementById('formStatus');
  if (!form || !status) return;

  // ── Localized messages live in translation.js (REGISTRATION_MESSAGES) ──
  const t = () => REGISTRATION_MESSAGES[/** @type {keyof typeof REGISTRATION_MESSAGES} */ (document.documentElement.lang)] || REGISTRATION_MESSAGES.en;

  // ── Element refs ───────────────────────────────────────
  /** @param {string} name @returns {any} */
  const field = (name) => form.elements.namedItem(name);
  const countrySelect = field('Nationality');
  const citySelect = field('PlaceOfBirth');
  const dobInput = field('DateOfBirth');

  // ── Visual filled-state indicator ──────────────────────
  const markFilled = (/** @type {Element | null} */ element) => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      // Completed fields stay in the default style (border-[#dbe2f0]);
      // the amber highlight is intentionally not applied.
      element.classList.remove('border-amber-400', 'bg-amber-50');
    }
  };

  form.querySelectorAll('input, textarea, select').forEach((element) => {
    markFilled(element);
    element.addEventListener('input', () => markFilled(element));
    element.addEventListener('change', () => markFilled(element));
  });

  // ── Field error helpers ─────────────────────────────────────
  const setError = (/** @type {Element | null} */ element, /** @type {boolean} */ hasError) => {
    if (!element) return;
    element.classList.toggle('border-red-500', hasError);
    element.classList.toggle('ring-2', hasError);
    element.classList.toggle('ring-red-200', hasError);
  };
  const clearError = (/** @type {Element | null} */ element) => setError(element, false);

  // ── Validators ─────────────────────────────────────
  const isValidPhone = (/** @type {string} */ value) => {
    if (value.trim() === '') return true; // optional unless flagged required
    if (!/^\+?[0-9\s().-]{7,20}$/.test(value)) return false;
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  };
  const isValidEmail = (/** @type {string} */ value) => {
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

  const populateCities = (/** @type {string} */ country) => {
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

  // Enhance both dropdowns with a searchable combobox UI.
  const countryCombo = initSearchableSelect(countrySelect);
  const cityCombo = initSearchableSelect(citySelect);

  // Same fancy dropdown UI (without search) for short lists.
  const maritalCombo = initSearchableSelect(field('MaritalStatus'), { searchable: false });
  const educationSelect = field('EducationLevel');
  const educationCombo = initSearchableSelect(educationSelect, { searchable: false });

  // Expose a hook so the Dictionary manager can (re)populate the Education
  // Level options straight from the `dictionary` table (category edu_lvl).
  /** @type {any} */ (window).GSSEducationLevel = {
    setOptions(/** @type {{ code?: string, label: string }[]} */ items) {
      if (!educationSelect) return;
      const current = educationSelect.value;
      const placeholder = educationSelect.querySelector('option[value=""]');
      educationSelect.innerHTML = '';
      if (placeholder) educationSelect.appendChild(placeholder);
      (Array.isArray(items) ? items : []).forEach((it) => {
        const opt = document.createElement('option');
        opt.value = it.code || it.label;
        opt.textContent = it.label;
        educationSelect.appendChild(opt);
      });
      // Restore the previous selection when it still exists.
      if (current) educationSelect.value = current;
      if (educationCombo) educationCombo.refresh();
    },
    /** Re-sync the combo's visible label with the native select value. */
    refresh() {
      if (educationCombo) educationCombo.refresh();
    },
  };

  if (countrySelect) {
    countrySelect.addEventListener('change', () => {
      populateCities(countrySelect.value);
      if (cityCombo) cityCombo.refresh();
      markFilled(citySelect);
    });
  }

  // ── Date of birth bounds: must be 18+ and not in the future ──
  if (dobInput) {
    const today = new Date();
    const maxDob = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const minDob = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
    const toISO = (/** @type {Date} */ d) => {
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tz).toISOString().split('T')[0];
    };
    dobInput.max = toISO(maxDob);
    dobInput.min = toISO(minDob);
  }

  // ── Submit ──────────────────────────────────────────────────
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const m = t();

    [
      field('FullName'),
      field('Phone1'),
      field('Phone2'),
      field('Email'),
      dobInput
    ].forEach(clearError);

    // Full required-field validation via the shared engine (it highlights every
    // missing field, respects conditional/hidden fields, and shows the message).
    const gssV = /** @type {any} */ (window).GSSValidation;
    // Reviewer edit mode (Admin / Head of Training changing a Pending outcome):
    // only the Interview Result + Remarks are editable, so validate just those
    // and skip the full-panel check on the read-only registration fields.
    const reviewOnly = form.dataset.reviewOnly === 'true';
    if (reviewOnly) {
      const remarks = field('Remarks');
      if (remarks) clearError(remarks);
      const interview = /** @type {any} */ (form.elements.namedItem('InterviewResult'));
      const rejected = interview && interview.value === 'Rejected';
      if (rejected && remarks && remarks.value.trim() === '') {
        setError(remarks, true);
        remarks.focus();
        status.textContent = m.remarksRequired || m.required;
        status.className = 'min-h-6 text-sm font-semibold text-red-600';
        return;
      }
    } else if (gssV && typeof gssV.validatePanel === 'function') {
      if (!gssV.validatePanel('registration')) return;
    } else {
      // Fallback minimal check when the validation engine is unavailable.
      const requiredFields = ['FullName', 'Phone1'];
      const missing = requiredFields.filter((name) => {
        const f = field(name);
        return !f || f.value.trim() === '';
      });
      if (missing.length) {
        missing.forEach((name) => setError(field(name), true));
        status.textContent = m.required;
        status.className = 'min-h-6 text-sm font-semibold text-red-600';
        return;
      }
    }

    // Phone format
    for (const name of ['Phone1', 'Phone2']) {
      const f = field(name);
      if (!reviewOnly && f && !isValidPhone(f.value)) {
        setError(f, true);
        f.focus();
        status.textContent = m.phone;
        status.className = 'min-h-6 text-sm font-semibold text-red-600';
        return;
      }
    }

    // Email format
    const emailField = field('Email');
    if (!reviewOnly && emailField && !isValidEmail(emailField.value)) {
      setError(emailField, true);
      emailField.focus();
      status.textContent = m.email;
      status.className = 'min-h-6 text-sm font-semibold text-red-600';
      return;
    }

    // Date of birth validation
    if (!reviewOnly && dobInput && dobInput.value.trim() !== '') {
      const dobIso = /** @type {any} */ (window).GSSDate ? /** @type {any} */ (window).GSSDate.toISO(dobInput.value) : dobInput.value;
      const dob = new Date(dobIso);
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

    // Persist the applicant, then mark the Registration panel completed.
    try {
      let row;
      if (reviewOnly) {
        // Reviewer edit: touch ONLY the interview outcome + remarks so the
        // read-only registration fields (and empty combos) are never sent.
        const candNo = field('CandidateNo');
        const interview = /** @type {any} */ (form.elements.namedItem('InterviewResult'));
        const remarksEl = field('Remarks');
        row = {
          candidate_no: candNo ? candNo.value : '',
          interview_result: interview ? interview.value : null,
          remarks: remarksEl ? remarksEl.value.trim() : null,
        };
      } else {
        row = await collectDbValues(form);
      }
      const res = await fetch(`${API_BASE}/api/applicants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Save failed');
      status.textContent = m.submitted;
      status.className = 'min-h-6 text-sm font-semibold text-emerald-600';
      const linker = /** @type {any} */ (window).GSSApplicant;
      if (!reviewOnly && linker && typeof linker.completeRegistration === 'function') {
        linker.completeRegistration(payload.applicant);
      }
      // Refresh the toolbar notification counts (a new Pending applicant).
      try { /** @type {any} */ (window).GSSAdmin?.refreshCounts?.(); } catch (_) { /* noop */ }
      // Show the success message briefly, then close the modal.
      window.setTimeout(() => {
        const modalEl = document.getElementById('formModal');
        if (modalEl) { modalEl.classList.add('hidden'); modalEl.classList.remove('flex'); }
        try { if (linker && typeof linker.reset === 'function') linker.reset(); } catch (_) { /* noop */ }
      }, 1400);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Save failed';
      status.className = 'min-h-6 text-sm font-semibold text-red-600';
    }
  });

  [countryCombo, cityCombo, maritalCombo, educationCombo].forEach((c) => c && c.refresh());
};

// ── Reusable digital signature pads ──────────────────────────
const initSignaturePads = () => {
  document.querySelectorAll('.gss-sign').forEach((wrapper) => {
    const canvas = /** @type {HTMLCanvasElement | null} */ (wrapper.querySelector('.gss-sign-canvas'));
    const input = /** @type {HTMLInputElement | null} */ (wrapper.querySelector('.gss-sign-input'));
    const hint = wrapper.querySelector('.gss-sign-hint');
    const clearBtn = wrapper.querySelector('.gss-sign-clear');
    if (!canvas || !input || canvas.dataset.signReady) return;
    canvas.dataset.signReady = 'true';

    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
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

    const pointerPos = (/** @type {any} */ event) => {
      const rect = canvas.getBoundingClientRect();
      const source = event.touches ? event.touches[0] : event;
      return { x: source.clientX - rect.left, y: source.clientY - rect.top };
    };

    const startDraw = (/** @type {any} */ event) => {
      event.preventDefault();
      drawing = true;
      const { x, y } = pointerPos(event);
      lastX = x;
      lastY = y;
    };

    const moveDraw = (/** @type {any} */ event) => {
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
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(syncCanvasSize).observe(canvas);
    } else {
      window.addEventListener('resize', syncCanvasSize);
    }
  });
};

// ── Dynamic DB mapping via the `dbname` attribute ────────────
// Every form control that carries a `dbname` attribute maps to a
// PostgreSQL column of that name. These helpers read/write the form
// purely from those attributes, so no column name is hard-coded and
// all control types are supported (text, textarea, select, radio,
// checkbox, date, hidden and file inputs).

/** @param {File} file @returns {Promise<string>} */
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Build a `{ column: value }` object from every `[dbname]` control in a form.
 * @param {HTMLFormElement} form
 * @returns {Promise<Record<string, any>>}
 */
const collectDbValues = async (form) => {
  /** @type {Record<string, any>} */
  const row = {};
  const controls = /** @type {HTMLElement[]} */ (Array.from(form.querySelectorAll('[dbname]')));

  for (const el of controls) {
    const column = el.getAttribute('dbname');
    if (!column) continue;
    const input = /** @type {any} */ (el);
    const type = String(input.type || '').toLowerCase();

    if (type === 'radio') {
      if (input.checked) row[column] = input.value;
      else if (!(column in row)) row[column] = null;
      continue;
    }
    if (type === 'checkbox') {
      // Multiple checkboxes may share a column → OR their checked state.
      row[column] = Boolean(row[column]) || input.checked;
      continue;
    }
    if (type === 'file') {
      if (input.files && input.files.length) 
        row[column] = await readFileAsDataUrl(input.files[0]);
      else if (!(column in row)) 
        row[column] = null;
      continue;
    }

    // text, tel, email, date, hidden, textarea, select, …
    let value = typeof input.value === 'string' ? input.value.trim() : input.value;
    // dd/MM/yyyy date fields are stored/sent as ISO (yyyy-MM-dd).
    if (value !== '' && el.getAttribute && el.getAttribute('data-date') && /** @type {any} */ (window).GSSDate) {
      value = /** @type {any} */ (window).GSSDate.toISO(value);
    }
    row[column] = value === '' ? null : value;
  }

  return row;
};

/**
 * Fill every `[dbname]` control in a form from a `{ column: value }` DB row.
 * @param {HTMLFormElement} form
 * @param {Record<string, any> | null | undefined} row
 */
const applyDbValues = (form, row) => {
  if (!row) return;
  const controls = /** @type {HTMLElement[]} */ (Array.from(form.querySelectorAll('[dbname]')));

  controls.forEach((el) => {
    const column = el.getAttribute('dbname');
    if (!column || !(column in row)) return;
    const input = /** @type {any} */ (el);
    const type = String(input.type || '').toLowerCase();
    const value = row[column];

    // dd/MM/yyyy date fields: show the ISO DB value in dd/MM/yyyy.
    if (el.getAttribute('data-date')) {
      input.value = (value == null || value === '')
        ? ''
        : (/** @type {any} */ (window).GSSDate ? /** @type {any} */ (window).GSSDate.toDMY(value) : value);
      return;
    }

    if (type === 'radio') {
      // Boolean columns (e.g. is_french_literate, has_security_experience,
      // has_health_issues, ispaid) map to Yes/No or Paid/Unpaid radios.
      if (typeof value === 'boolean') {
        const v = String(input.value).trim().toLowerCase();
        const truthy = ['yes', 'paid', 'true', 'on', '1', 'y'];
        const falsy = ['no', 'unpaid', 'false', 'off', '0', 'n'];
        input.checked = value ? truthy.includes(v) : falsy.includes(v);
      } else {
        input.checked = String(input.value) === String(value);
      }
    } else if (type === 'checkbox') {
      input.checked = value === true || value === 'true' || value === input.value;
    } else if (type === 'file') {
      // File inputs cannot be set programmatically for security reasons.
      return;
    } 
    else if (type === 'select-one') {
        // update hidden select
        input.value = String(value ?? '').trim();;

        // update visible text
        const span = input
            .closest('.relative')
            ?.querySelector('button span');

        if (span) {
            span.textContent = value;
            span.classList.remove('text-slate-400');
        }
    }
    else //if (type === 'select-one'){
      input.value = value == null ? '' : value;
    
    //input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
