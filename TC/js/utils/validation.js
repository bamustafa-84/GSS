// @ts-check
/**
 * GSS – Panel validation
 * ------------------------------------------------------------------
 * Centralised required-field validation for the training-centre form.
 * Each panel declares its required fields; the same engine can be
 * reused as more panels are added.
 *
 * Field types:
 *   'input'     – text / date / select / textarea (value must be non-empty)
 *   'radio'     – radio group referenced by name (one option must be chosen)
 *   'checkbox'  – single checkbox referenced by name (must be checked)
 *   'signature' – hidden input fed by a signature pad (must hold data)
 */
(() => {
  'use strict';

  // ── Localised status messages live in translation.js (VALIDATION_MESSAGES) ──
  const t = () => VALIDATION_MESSAGES[/** @type {keyof typeof VALIDATION_MESSAGES} */ (document.documentElement.lang)] || VALIDATION_MESSAGES.en;

  // ── Required-field definitions per panel ──────────────────
  /** @type {Record<string, GSSPanelRule>} */
  const panelRules = {
    registration: {
      formId: 'inscriptionForm',
      statusId: 'formStatus',
      fields: [
        // Personal information
        { key: 'RegistrationDate', type: 'input' },
        { key: 'FullName', type: 'input' },
        { key: 'Phone1', type: 'input' },
        { key: 'FatherName', type: 'input' },
        { key: 'MotherName', type: 'input' },
        { key: 'DateOfBirth', type: 'input' },
        { key: 'Nationality', type: 'input' },
        { key: 'PlaceOfBirth', type: 'input' },
        { key: 'Gender', type: 'radio' },
        { key: 'MaritalStatus', type: 'input' },
        { key: 'FullAddress', type: 'input' },
        // Education & experience
        { key: 'IsFrenchLiterate', type: 'radio' },
        { key: 'HasSecurityExperience', type: 'radio' },
        { key: 'SecurityExperienceDetails', type: 'input', requiredIf: { field: 'HasSecurityExperience', equals: 'Yes' } },
        // Health & documents
        { key: 'HasHealthIssues', type: 'radio' },
        { key: 'HealthIssuesDetails', type: 'input', requiredIf: { field: 'HasHealthIssues', equals: 'Yes' } },
        { key: 'HasIdOrPassportCopy', type: 'checkbox' },
        // Fees
        { key: 'IsPaid', type: 'radio' },
        // Applicant's declaration
        { key: 'ApplicantName', type: 'input' },
        { key: 'ApplicantSignature', type: 'signature' },
        { key: 'ApplicantDate', type: 'input' },
        // Administration use
        { key: 'InterviewResult', type: 'radio' }
      ]
    }
  };

  // ── Error highlight helpers ───────────────────────────────────
  const setError = (/** @type {Element | null} */ element, /** @type {boolean} */ hasError) => {
    if (!element) return;
    const isControl = element.matches && element.matches('input, select, textarea');
    if (isControl) {
      element.classList.toggle('border-red-500', hasError);
      element.classList.toggle('ring-2', hasError);
      element.classList.toggle('ring-red-300', hasError);
    } else {
      // Radio / checkbox group or signature container: a clearly visible box.
      element.classList.toggle('rounded-lg', hasError);
      element.classList.toggle('ring-2', hasError);
      element.classList.toggle('ring-red-400', hasError);
      element.classList.toggle('ring-offset-2', hasError);
    }
  };

  // Locate the element to highlight when a field is invalid.
  const highlightFor = (/** @type {HTMLElement} */ form, /** @type {GSSValidationField} */ field, /** @type {any} */ control) => {
    switch (field.type) {
      case 'radio': {
        const first = form.querySelector(`input[name="${field.key}"]`);
        return (first && first.closest('.flex')) || first;
      }
      case 'checkbox':
        return control ? control.closest('label') || control : null;
      case 'signature':
        return control ? control.closest('.gss-sign') || control : null;
      default:
        return control || null;
    }
  };

  // A field is "active" (subject to validation) unless it declares a requiredIf
  // condition that is not currently satisfied by its trigger field.
  const isFieldActive = (/** @type {HTMLFormElement} */ form, /** @type {GSSValidationField} */ field) => {
    if (!field.requiredIf) return true;
    const { field: triggerName, equals } = field.requiredIf;
    const radios = form.querySelectorAll(`input[name="${triggerName}"]`);
    if (radios.length) {
      return Array.prototype.some.call(radios, (radio) => radio.checked && radio.value === equals);
    }
    const control = /** @type {any} */ (form.elements.namedItem(triggerName));
    return !!control && control.value === equals;
  };

  // Tailwind classes that render the red required asterisk (same as static ones).
  const REQUIRED_MARKER_CLASSES = ["after:content-['_*']", 'after:text-red-500', 'after:font-bold'];

  // Show/hide the asterisk on a conditional field's label to match its state.
  const updateRequiredMarker = (/** @type {HTMLFormElement} */ form, /** @type {GSSValidationField} */ field) => {
    if (!field.requiredIf) return;
    const label = form.querySelector(`label[for="${field.key}"]`);
    if (!label) return;
    const active = isFieldActive(form, field);
    REQUIRED_MARKER_CLASSES.forEach((cls) => label.classList.toggle(cls, active));
  };

  // Evaluate a single field: is it filled, and what should be highlighted.
  const evaluateField = (/** @type {HTMLFormElement} */ form, /** @type {GSSValidationField} */ field) => {
    const control = /** @type {any} */ (form.elements.namedItem(field.key));

    // Conditionally-required fields count as valid until their trigger is met.
    if (!isFieldActive(form, field)) {
      return { valid: true, highlight: highlightFor(form, field, control), control };
    }

    let valid = false;

    switch (field.type) {
      case 'radio': {
        const radios = form.querySelectorAll(`input[type="radio"][name="${field.key}"]`);
        valid = Array.prototype.some.call(radios, (radio) => radio.checked);
        break;
      }
      case 'checkbox': {
        const box = form.querySelector(`input[type="checkbox"][name="${field.key}"]`) || control;
        valid = !!box && box.checked === true;
        break;
      }
      case 'signature':
        valid = !!control && (control.value || '').trim() !== '';
        break;
      default:
        valid = !!control && typeof control.value === 'string' && control.value.trim() !== '';
    }

    return { valid, highlight: highlightFor(form, field, control), control };
  };

  // ── Validate an entire panel ──────────────────────────────────
  const validatePanel = (/** @type {string} */ panelKey) => {
    const rule = panelRules[panelKey];
    if (!rule) return true;

    const form = /** @type {HTMLFormElement | null} */ (document.getElementById(rule.formId));
    if (!form) return true;

    /** @type {any} */
    let firstInvalid = null;
    let allValid = true;

    rule.fields.forEach((field) => {
      const result = evaluateField(form, field);
      setError(result.highlight, !result.valid);
      if (!result.valid) {
        allValid = false;
        if (!firstInvalid) firstInvalid = result.highlight || result.control;
      }
    });

    const status = document.getElementById(rule.statusId);
    if (status) {
      const m = t();
      status.textContent = allValid ? m.success : m.required;
      status.className =
        'min-h-6 text-sm font-semibold ' + (allValid ? 'text-emerald-600' : 'text-red-600');
    }

    if (!allValid && firstInvalid) {
      // Reveal the section if the first invalid field is inside a collapsed fieldset.
      if (window.GSSCollapsible && firstInvalid.closest) {
        window.GSSCollapsible.expand(firstInvalid.closest('fieldset'));
      }
      if (typeof firstInvalid.scrollIntoView === 'function') {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (typeof firstInvalid.focus === 'function') {
        try {
          firstInvalid.focus({ preventScroll: true });
        } catch (_) {
          /* focus may be unavailable on non-control containers */
        }
      }
    }

    return allValid;
  };

  // ── Clear a field's error once the user provides a value ──────
  const clearFieldError = (/** @type {HTMLFormElement} */ form, /** @type {string} */ panelKey, /** @type {any} */ target) => {
    const rule = panelRules[panelKey];
    if (!rule) return;
    rule.fields.forEach((field) => {
      const isTrigger = target.name === field.key || target.id === field.key;
      const isDependent =
        field.requiredIf &&
        (field.requiredIf.field === target.name || field.requiredIf.field === target.id);
      if (!isTrigger && !isDependent) return;

      // Keep the conditional asterisk in sync when a trigger changes.
      if (isDependent) updateRequiredMarker(form, field);

      const result = evaluateField(form, field);
      if (isTrigger) {
        // Direct edits reflect the field's live state.
        setError(result.highlight, !result.valid);
      } else if (result.valid) {
        // A trigger change can only relax a dependent field's error, never add it.
        setError(result.highlight, false);
      }
    });
  };

  // Signature pads write to a hidden input without firing input events,
  // so re-check signature fields whenever a pad is drawn on.
  const clearSignatureErrors = (/** @type {HTMLFormElement} */ form, /** @type {string} */ panelKey) => {
    const rule = panelRules[panelKey];
    if (!rule) return;
    rule.fields
      .filter((f) => f.type === 'signature')
      .forEach((field) => {
        const result = evaluateField(form, field);
        setError(result.highlight, !result.valid);
      });
  };

  // ── Send the validated registration form to the backend API ───
  const submitRegistration = async (/** @type {HTMLFormElement} */ form) => {
    const status = document.getElementById(panelRules.registration.statusId);

    // Build the payload dynamically from every control's `dbname` attribute
    // (column names come straight from tc.html — nothing is hard-coded here).
    const gssForm = /** @type {any} */ (window).GSSForm;
    const payload = gssForm
      ? await gssForm.collectDbValues(form)
      : Object.fromEntries(new FormData(form).entries());

    // The API lives on the Node server (port 3000). When the page is served
    // from somewhere else (e.g. Live Server on 5500, or file://), target the
    // Node server directly; otherwise use a same-origin relative path.
    const apiBase = /^https?:\/\/(localhost|127\.0\.0\.1):3000$/.test(location.origin)
      ? ''
      : 'http://localhost:3000';

    fetch(`${apiBase}/api/applicants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        if (status) {
          status.textContent = `Saved \u2713`;
          status.className = 'min-h-6 text-sm font-semibold text-emerald-600';
        }
      })
      .catch((err) => {
        if (status) {
          status.textContent = `Save failed: ${err.message}`;
          status.className = 'min-h-6 text-sm font-semibold text-red-600';
        }
      });
  };

  // ── Wire the registration panel ───────────────────────────────
  const attachRegistration = () => {
    const rule = panelRules.registration;
    const form = /** @type {HTMLFormElement | null} */ (document.getElementById(rule.formId));
    if (!form || form.dataset.gssValidationReady) return;
    form.dataset.gssValidationReady = 'true';

    // Take over submission: block the form when required fields are missing.
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (validatePanel('registration')) {
        submitRegistration(form);
      }
    });

    form.addEventListener('input', (event) => clearFieldError(form, 'registration', event.target), true);
    form.addEventListener('change', (event) => clearFieldError(form, 'registration', event.target), true);

    // Set the initial state of conditional required asterisks.
    rule.fields.filter((field) => field.requiredIf).forEach((field) => updateRequiredMarker(form, field));

    form.querySelectorAll('.gss-sign .gss-sign-canvas').forEach((canvas) => {
      const revalidate = () => clearSignatureErrors(form, 'registration');
      canvas.addEventListener('mouseup', revalidate);
      canvas.addEventListener('touchend', revalidate);
    });
    form.querySelectorAll('.gss-sign .gss-sign-clear').forEach((button) => {
      button.addEventListener('click', () => setTimeout(() => clearSignatureErrors(form, 'registration'), 0));
    });
  };

  const init = () => {
    attachRegistration();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for reuse / dynamic re-init after modal injection.
  window.GSSValidation = {
    rules: panelRules,
    validatePanel,
    registerPanel(/** @type {string} */ key, /** @type {GSSPanelRule} */ rule) {
      panelRules[key] = rule;
    },
    init
  };
})();
