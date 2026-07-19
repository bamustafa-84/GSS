// @ts-check
// ── Searchable <select> enhancer ─────────────────────────────
// Turns a native <select> into an accessible combobox with a search
// box shown when the list is open. The native select stays in the DOM
// (visually hidden) so form submission and change events keep working.
/**
 * @param {HTMLSelectElement} select
 * @param {{ searchable?: boolean }} [options]
 */
const initSearchableSelect = (select, { searchable = true } = {}) => {
  if (!select || select.dataset.comboReady) return null;
  select.dataset.comboReady = 'true';

  // Combobox strings live in translation.js (COMBO_STRINGS).
  const s = () => COMBO_STRINGS[/** @type {keyof typeof COMBO_STRINGS} */ (document.documentElement.lang)] || COMBO_STRINGS.en;

  const ACTIVE_CLASSES = ['bg-[#042F8D]/[0.06]', 'text-[#042F8D]'];
  const SELECTED_CLASSES = ['bg-[#042F8D]/[0.08]', 'font-semibold', 'text-[#042F8D]'];

  const wrapper = document.createElement('div');
  wrapper.className = 'relative w-full';
  select.parentNode?.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('sr-only');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flex w-full items-center justify-between gap-2 rounded-xl border-[1.5px] border-[#dbe2f0] bg-white px-3 py-2.5 text-left text-sm text-slate-800 transition hover:border-[#042F8D] focus:border-[#042F8D] focus:bg-[#fbfcff] focus:outline-none focus:ring-4 focus:ring-[#042F8D]/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  label.className = 'truncate';
  button.appendChild(label);
  button.insertAdjacentHTML('beforeend',
    '<svg class="h-4 w-4 flex-none text-slate-500 transition-transform duration-200" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 8 10 12 14 8"/></svg>');
  const chevron = button.querySelector('svg');
  wrapper.appendChild(button);

  const panel = document.createElement('div');
  panel.className = 'absolute inset-x-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(4,47,141,0.16)]';
  panel.hidden = true;
  let search = null;
  let empty = null;
  if (searchable) {
    const searchWrap = document.createElement('div');
    searchWrap.className = 'border-b border-slate-100 p-2';
    search = document.createElement('input');
    search.type = 'text';
    search.className = 'w-full rounded-lg border-[1.5px] border-[#dbe2f0] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#042F8D] focus:outline-none focus:ring-4 focus:ring-[#042F8D]/10';
    search.setAttribute('autocomplete', 'off');
    searchWrap.appendChild(search);
    panel.appendChild(searchWrap);
  }
  const list = document.createElement('ul');
  list.className = 'm-0 max-h-60 list-none overflow-y-auto py-1';
  list.setAttribute('role', 'listbox');
  panel.appendChild(list);
  if (searchable) {
    empty = document.createElement('div');
    empty.className = 'px-3 py-3 text-sm text-slate-400';
    empty.hidden = true;
    panel.appendChild(empty);
  }
  wrapper.appendChild(panel);

  let activeIndex = -1;
  const visibleOptions = () => /** @type {HTMLElement[]} */ (Array.from(list.querySelectorAll('li:not([hidden])')));

  const updateLabel = () => {
    const selected = select.options[select.selectedIndex];
    const hasValue = selected && selected.value;
    const placeholder = select.querySelector('option[value=""]');
    label.textContent = hasValue ? selected.textContent : (placeholder ? placeholder.textContent : '');
    label.classList.toggle('text-slate-400', !hasValue);
  };

  const buildList = () => {
    list.innerHTML = '';
    Array.from(select.options).forEach((opt) => {
      if (!opt.value) return;
      const li = document.createElement('li');
      li.className = 'cursor-pointer px-3 py-2 text-sm text-slate-700 hover:bg-[#042F8D]/[0.06] hover:text-[#042F8D]';
      li.setAttribute('role', 'option');
      li.dataset.value = opt.value;
      li.textContent = opt.textContent;
      if (opt.value === select.value) {
        li.classList.add(...SELECTED_CLASSES);
        li.setAttribute('aria-selected', 'true');
      }
      li.addEventListener('click', () => choose(opt.value));
      list.appendChild(li);
    });
  };

  const setActive = (/** @type {number} */ idx) => {
    const items = visibleOptions();
    items.forEach((li) => li.classList.remove(...ACTIVE_CLASSES));
    if (!items.length) { activeIndex = -1; return; }
    activeIndex = Math.max(0, Math.min(idx, items.length - 1));
    const el = items[activeIndex];
    el.classList.add(...ACTIVE_CLASSES);
    el.scrollIntoView({ block: 'nearest' });
  };

  const filter = (/** @type {string} */ query) => {
    const q = query.trim().toLowerCase();
    let visible = 0;
    list.querySelectorAll('li').forEach((li) => {
      const match = li.textContent.toLowerCase().includes(q);
      li.hidden = !match;
      if (match) visible++;
    });
    if (empty) {
      empty.textContent = s().empty;
      empty.hidden = visible > 0;
    }
    setActive(0);
  };

  const isOpen = () => !panel.hidden;

  const open = () => {
    if (select.disabled) return;
    panel.hidden = false;
    chevron?.classList.add('rotate-180');
    button.setAttribute('aria-expanded', 'true');
    if (search) search.value = '';
    filter('');
    const items = visibleOptions();
    const selIdx = items.findIndex((li) => li.dataset.value === select.value);
    setActive(selIdx >= 0 ? selIdx : 0);
    if (search) setTimeout(() => search.focus(), 0);
  };

  const close = () => {
    panel.hidden = true;
    chevron?.classList.remove('rotate-180');
    button.setAttribute('aria-expanded', 'false');
  };

  const choose = (/** @type {string} */ value) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    updateLabel();
    buildList();
    close();
    button.focus();
  };

  const onKeydown = (/** @type {KeyboardEvent} */ e) => {
    if (!isOpen()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const items = visibleOptions();
      const active = items[activeIndex];
      if (active && active.dataset.value) choose(active.dataset.value);
    } else if (e.key === 'Escape') { e.preventDefault(); close(); button.focus(); }
  };

  button.addEventListener('click', () => { isOpen() ? close() : open(); });
  button.addEventListener('keydown', onKeydown);
  if (search) {
    search.addEventListener('input', () => filter(search.value));
    search.addEventListener('keydown', onKeydown);
  }
  document.addEventListener('click', (e) => { if (e.target instanceof Node && !wrapper.contains(e.target)) close(); });

  const refresh = () => {
    buildList();
    updateLabel();
    button.disabled = select.disabled;
    if (search) search.placeholder = s().search;
  };

  refresh();
  return { refresh };
};

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

    // Required fields
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

    // Phone format
    for (const name of ['Phone1', 'Phone2']) {
      const f = field(name);
      if (f && !isValidPhone(f.value)) {
        setError(f, true);
        f.focus();
        status.textContent = m.phone;
        status.className = 'min-h-6 text-sm font-semibold text-red-600';
        return;
      }
    }

    // Email format
    const emailField = field('Email');
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

    // Persist the applicant, then mark the Registration panel completed.
    const API_BASE = (location.protocol.startsWith('http') && location.port !== '5500') ? '' : 'http://localhost:3000';
    try {
      const row = await collectDbValues(form);
      const res = await fetch(`${API_BASE}/api/applicants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Save failed');
      status.textContent = m.ready(1);
      status.className = 'min-h-6 text-sm font-semibold text-emerald-600';
      const linker = /** @type {any} */ (window).GSSApplicant;
      if (linker && typeof linker.completeRegistration === 'function') {
        linker.completeRegistration(payload.applicant);
      }
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
      if (input.files && input.files.length) row[column] = await readFileAsDataUrl(input.files[0]);
      else if (!(column in row)) row[column] = null;
      continue;
    }

    // text, tel, email, date, hidden, textarea, select, …
    const value = typeof input.value === 'string' ? input.value.trim() : input.value;
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
    } else {
      input.value = value == null ? '' : value;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
