// @ts-check
///<reference path="../utils/translation.js" />
///<reference path="../tc.js" />
/**
 * GSS · Applicant → form linker
 * ------------------------------------------------------------------
 * When an applicant record is opened (from a search result or the grid
 * Edit icon), this module:
 *   • Fills the editable Registration panel (via GSSForm.applyDbValues).
 *   • Shows the DB-generated Candidate No.
 *   • Mirrors read-only fields on the Conditions, Rules and Commitment
 *     panels directly from the Applicant record.
 *   • Renders the applicant's stored signature on the form + those panels.
 *   • Handles the per-panel acceptance flow (confirm → green tab →
 *     read-only → persist).
 *   • Resets the form to "New" mode when the Fill-the-form button is used.
 */
const SIG_IDS = ['Cond-ApplicantSignature', 'rules-ApplicantSignature', 'Comm-ApplicantSignature'];
const byId = (/** @type {string} */ id) => /** @type {HTMLInputElement | null} */ (document.getElementById(id));

const ACCEPT = /** @type {Record<string, any>} */ ({
    conditions: {
      ack: 'ack-conditions', tab: 'conditions', col: 'ack_conditions', dot: '2',
      confirmKey: 'confirmConditions', confirmMsg: 'Are you sure you want to accept the Registration Conditions?',
    },
    reglement: {
      ack: 'ack-rules', tab: 'reglement', col: 'ack_rules', dot: '3',
      confirmKey: 'confirmRules', confirmMsg: 'Are you sure you want to accept the Internal Regulations?',
    },
    engagement: {
      ack: 'ack-engagement', tab: 'engagement', col: 'ack_commitment', dot: '4',
      confirmKey: 'confirmCommitment', confirmMsg: 'Are you sure you want to accept the Confidentiality Agreement?',
      extra: { 'Comm-IDPassportNumber': 'id_pass_no' },
    },
});

const DATE_COLS = new Set(['registration_date', 'date_of_birth', 'applicant_date']);


  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };

  // Read-only text/date fields → applicant column they mirror.
  const TEXT_MAP = /** @type {Record<string, string>} */ ({
    'Cond-ApplicantName': 'full_name',
    'Cond-ApplicantDate': 'registration_date',
    'rules-ApplicantName': 'full_name',
    'rules-ApplicantDate': 'registration_date',
    'Comm-ApplicantName': 'full_name',
    'Comm-DateOfBirth': 'date_of_birth',
    'Comm-Phone1': 'phone_1',
    'Comm-ApplicantDate': 'registration_date',
    'Comm-ApplicantName1': 'full_name',
  });

  // Read-only signature canvases on panels 2/3/4 (always read-only).

  // The Registration panel signature pad (editable for new applicants).
  const REG_SIG_ID = 'ApplicantSignature';

  

  // Per-panel acceptance configuration.
  

  /** @type {number | null} The candidate number of the loaded applicant. */
  let currentId = null;

  /** @type {string} The current applicant signature source (image URL or data URL). */
  let currentSignatureSrc = '';

  // Tabs that gate the flow but have no DB acceptance column.
  const GENERIC_TABS = ['presences', 'exam', 'evaluation', 'mensuration', 'dossier'];
  // Original dot numbers per tab (restored when a tab is un-greened).
  const DOT_ALL = /** @type {Record<string, string>} */ ({
    registration: '1', conditions: '2', reglement: '3', engagement: '4',
    presences: '5', exam: '6', evaluation: '7', mensuration: '8', dossier: '9',
  });

  // ── Field helpers ──────────────────────────────────────────────
  /** Coerce a DB/API value (boolean, 't'/'f', 'true'/'false', 1/0) to boolean. */
  const isTruthy = (/** @type {any} */ value) =>
    value === true || value === 1 || value === 't' || value === 'true' || value === 'yes' || value === 'on';

  const formatValue = (/** @type {any} */ value, /** @type {boolean} */ isDate) => {
    if (value === null || value === undefined) return '';
    if (isDate) {
      return /** @type {any} */ (window).GSSDate ? /** @type {any} */ (window).GSSDate.toDMY(value) : String(value);
    }
    return String(value);
  };

  const makeReadonly = (/** @type {HTMLInputElement | HTMLTextAreaElement | null} */ el) => {
    // if (!el) return;
    // el.readOnly = true;
    // el.setAttribute('aria-readonly', 'true');
    // el.tabIndex = -1;
    // el.classList.add('bg-slate-100', 'opacity-80', 'cursor-not-allowed');
    // el.classList.remove('bg-white');
    // if (String(el.type || '').toLowerCase() === 'date') el.classList.add('pointer-events-none');

    //  if (!el) return;

    // const tag = el.tagName.toLowerCase();
    // const type = (el.getAttribute("type") || "").toLowerCase();

    // // Textbox, date, number, email, etc.
    // if (tag === "input" || tag === "textarea") {
    //     el.readOnly = true;
    // }

    // // Dropdown
    // else if (tag === "select") {
    //     el.disabled = true;
    // }

    // // Checkbox / Radio
    // else if (type === "checkbox" || type === "radio") {
    //     el.disabled = true;
    // }

    // // Visual style
    // el.setAttribute("aria-readonly", "true");
    // el.classList.add(
    //     "bg-slate-100",
    //     "opacity-80",
    //     "cursor-not-allowed"
    // );

    // el.classList.remove("bg-white");
  };

  const unmakeReadonly = (/** @type {HTMLInputElement | null} */ el) => {
    if (!el) return;
    el.readOnly = false;
    el.removeAttribute('aria-readonly');
    el.tabIndex = 0;
    el.classList.remove('bg-slate-100', 'opacity-80', 'cursor-not-allowed', 'pointer-events-none');
    el.classList.add('bg-white');
  };

  const setTarget = (/** @type {string} */ id, /** @type {any} */ value, /** @type {boolean} */ isDate) => {
    const el = byId(id);
    if (el) el.value = formatValue(value, isDate);
  };

  /** Re-enable an editable signature pad (used for New mode / no stored image). */
  const enableSignaturePad = (/** @type {string} */ canvasId) => {
    const p = padParts(canvasId);
    if (!p) return;
    p.canvas.style.pointerEvents = '';
    p.clear?.classList.remove('hidden');
    p.img.removeAttribute('src');
    p.img.classList.add('hidden');
    p.hint?.classList.remove('hidden');
    if (p.input) p.input.value = '';
    const ctx = p.canvas.getContext ? p.canvas.getContext('2d') : null;
    if (ctx) ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
  };

  // ── Tab colouring ──────────────────────────────────────────────
  const setGreenTab = (/** @type {string} */ tab, /** @type {boolean} */ green, /** @type {string} */ dotNum) => {
    const dot = document.querySelector(`#tab-btn-${tab} .gss-tab-dot`);
    if (!dot) return;
    if (green) {
      if (typeof markTab === 'function') markTab(tab, dot);
      else { dot.classList.add('bg-green-500'); dot.textContent = '✓'; }
    } else {
      try { if (typeof tabState !== 'undefined' && tabState) tabState[tab] = false; } catch (_) { /* noop */ }
      try {
        dot.classList.remove(TAB_DONE_BG, TAB_ACTIVE_BG);
        dot.classList.add(TAB_PENDING_BG);
      } catch (_) { /* noop */ }
      dot.textContent = dotNum || '';
    }
  };

  // ── Commitment (engagement) panel read-only lock ───────────────
  /**
   * Lock or unlock the Commitment panel. When accepted, every control is
   * made read-only; when editable, only the ID/passport number is re-enabled
   * (the other fields mirror the Registration panel and stay read-only).
   * @param {boolean} ro
   */
  const setEngagementReadonly = (ro) => {
    const panel = document.getElementById('panel-engagement');
    if (!panel) return;
    if (ro) {
      panel.querySelectorAll('input, textarea, select').forEach((el) => {
        const input = /** @type {HTMLInputElement} */ (el);
        if (input.id === 'ack-engagement') return; // the acknowledgment toggle drives the state
        makeReadonly(input);
      });
      const p = padParts('Comm-ApplicantSignature');
      if (p) p.canvas.style.pointerEvents = 'none';
    } else {
      unmakeReadonly(byId('Comm-IDPassportNumber'));
    }
  };

  // ── Persist acceptance to the applicant row ────────────────────
  const saveAcceptance = async (/** @type {Record<string, any>} */ payload) => {
    if (!currentId) return; // brand-new, unsaved applicant → client-side only
    try {
      await fetch(`${API_BASE}/api/applicants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_no: currentId, ...payload }),
      });
    } catch (_) { /* noop */ }
  };

  /**
   * Apply (or clear) the accepted state for a panel.
   * @param {string} key
   * @param {boolean} accepted
   * @param {boolean} persist
   */
  const applyAcceptance = (key, accepted, persist) => {
    const cfg = ACCEPT[key];
    if (!cfg) return;
    const ack = byId(cfg.ack);
    if (ack) {
      ack.checked = accepted;
      ack.disabled = accepted;
    }
    setGreenTab(cfg.tab, accepted, cfg.dot);
    try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }

    // The Commitment panel becomes fully read-only once accepted.
    if (key === 'engagement') setEngagementReadonly(accepted);

    if (cfg.extra) {
      Object.keys(cfg.extra).forEach((id) => {
        const el = byId(id);
        if (accepted) makeReadonly(el);
        else unmakeReadonly(el);
      });
    }

    if (accepted && persist) {
      /** @type {Record<string, any>} */
      const payload = {};
      payload[cfg.col] = true;
      if (cfg.extra) {
        Object.entries(cfg.extra).forEach(([id, col]) => {
          const el = byId(id);
          if (el) payload[/** @type {string} */ (col)] = el.value;
        });
      }
      saveAcceptance(payload);
    }
  };

 

  /** Advance to the next tab after the given one is completed (green). */
  const goToNextTab = (/** @type {string} */ tab) => {
    try {
      const order = (typeof TAB_ORDER !== 'undefined' && Array.isArray(TAB_ORDER)) ? TAB_ORDER : null;
      if (!order) return;
      const next = order[order.indexOf(tab) + 1];
      if (next && typeof switchTab === 'function') switchTab(next);
    } catch (_) { /* noop */ }
  };

  // ── Registration completion / read-only ───────────────────────
  /** Enable or disable every control in the Registration form. */
  const setRegistrationReadonly = (/** @type {boolean} */ ro) => {
    const form = document.getElementById('inscriptionForm');
    if (!form) return;
    // Never leave a fieldset disabled: a disabled <fieldset> also disables the
    // always-available Dictionary Management button nested inside it.
    form.querySelectorAll('fieldset').forEach((fs) => { /** @type {HTMLFieldSetElement} */ (fs).disabled = false; });
    // Toggle the data controls directly (inputs, selects incl. the hidden
    // native selects behind the searchable combos, and textareas).
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      /** @type {HTMLInputElement} */ (el).disabled = ro;
    });
    // Buttons: disable everything (submit/reset + searchable-select triggers +
    // signature clear) EXCEPT admin actions like Dictionary Management, which
    // must stay usable regardless of the form's read-only state.
    form.querySelectorAll('button').forEach((b) => {
      /** @type {HTMLButtonElement} */ (b).disabled = b.hasAttribute('data-dict-category') ? false : ro;
    });
    const p = padParts(REG_SIG_ID);
    if (p) p.canvas.style.pointerEvents = ro ? 'none' : '';
  };

  /** Mark the Registration panel completed: green tab, read-only, unlock next. */
  const completeRegistration = (/** @type {Record<string, any> | null | undefined} */ applicant) => {
    if (applicant && applicant.candidate_no != null) {
      currentId = Number(applicant.candidate_no);
      const candNo = byId('CandidateNo');
      if (candNo) candNo.value = String(applicant.candidate_no);
    }
    mirrorFromForm();
    // Mirror the applicant's signature onto the Conditions / Rules / Commitment
    // panels. Prefer the stored image (the server returns its id after saving);
    // fall back to whatever is currently drawn on the Registration pad.
    const sigId = applicant && applicant.applicant_signature_id;
    if (sigId !== null && sigId !== undefined && sigId !== '') {
      const url = `${API_BASE}/api/signatures/image?id=${encodeURIComponent(String(sigId))}`;
      showSignatureImage(REG_SIG_ID, url);
      applyPanelSignature(url);
    } else {
      mirrorSignatureFromPad();
    }
    setRegistrationReadonly(true);
    setGreenTab('registration', true, '1');
    try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }
    // Step 1 is done and green → automatically move the user to Step 2.
    try { if (typeof switchTab === 'function') switchTab('conditions'); } catch (_) { /* noop */ }
  };

  /** Fetch + render the current Training Officer signature (read-only) on Panel 4. */
  const loadOfficerSignature = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/signatures/officer`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const officer = data && data.officer;
      const id = officer && (officer.signature_id != null ? officer.signature_id : officer.id);
      const url = id != null ? `${API_BASE}/api/signatures/image?id=${encodeURIComponent(String(id))}` : '';
      showSignatureImage('Comm-OfficerSignature', url);
    } catch (_) {
      showSignatureImage('Comm-OfficerSignature', '');
    }
  };

  // ── Reset the whole form to a blank "New" state ────────────────
  const resetToNewMode = () => {
    currentId = null;
    const form = /** @type {HTMLFormElement | null} */ (document.getElementById('inscriptionForm'));
    if (form) { delete form.dataset.reviewOnly; form.reset(); }

    // Education Level must start empty on a new form — clear it and refresh the
    // searchable combo so no stale value/label lingers.
    const edu = byId('EducationLevel');
    if (edu) edu.value = '';
    try {
      const eduHook = /** @type {any} */ (window).GSSEducationLevel;
      if (eduHook && typeof eduHook.refresh === 'function') eduHook.refresh();
    } catch (_) { /* noop */ }

    const candNo = byId('CandidateNo');
    if (candNo) candNo.value = '';

    Object.keys(TEXT_MAP).forEach((id) => setTarget(id, '', false));
    const idpass = byId('Comm-IDPassportNumber');
    if (idpass) idpass.value = '';

    // A brand-new form is not awaiting approval, and the applicant's declaration
    // date defaults to today.
    setPendingBanner(false);
    const appDate = byId('ApplicantDate');
    if (appDate) appDate.value = /** @type {any} */ (window).GSSDate ? /** @type {any} */ (window).GSSDate.today() : new Date().toISOString().split('T')[0];

    enableSignaturePad(REG_SIG_ID);
    applyPanelSignature('');

    Object.keys(ACCEPT).forEach((k) => applyAcceptance(k, false, false));

    // Registration editable + gray; re-lock the whole flow.
    setRegistrationReadonly(false);
    setGreenTab('registration', false, '1');
    GENERIC_TABS.forEach((tab) => {
      setGreenTab(tab, false, DOT_ALL[tab]);
      const ack = byId('ack-' + tab);
      if (ack) { ack.checked = false; ack.disabled = false; }
    });
    try { if (/** @type {any} */ (window).GSSTabs) /** @type {any} */ (window).GSSTabs.setForcedLock('conditions', false); } catch (_) { /* noop */ }
    try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }

    try { if (typeof switchTab === 'function') switchTab('registration'); } catch (_) { /* noop */ }
  };
  ///** @type {any} */ (window).GSSApplicant = { initApplicantForm, load, mirrorFromForm, reset: resetToNewMode, completeRegistration, loadOfficerSignature };




const initApplicantForm = () => {
    // Applicant-mapped panel fields are always read-only.
    //Object.keys(TEXT_MAP).forEach((id) => makeReadonly(byId(id)));
    SIG_IDS.forEach((cid) => showSignatureImage(cid, ''));

    MIRROR.forEach(({ source }) => {
      const src = byId(source);
      if (!src) return;
      src.addEventListener('input', mirrorFromForm);
      src.addEventListener('change', mirrorFromForm);
    });

    // Live-mirror the applicant's drawn signature (Registration pad) to the
    // read-only Conditions / Rules / Commitment panels as it is drawn/cleared.
    const regPad = padParts(REG_SIG_ID);
    if (regPad) {
      const mirrorLater = () => window.setTimeout(mirrorSignatureFromPad, 0);
      // Clearing / resetting the pad explicitly clears the panels (the clear
      // button is hidden while a stored signature is shown, so this only fires
      // in editable/new mode).
      const clearPanels = () => window.setTimeout(() => applyPanelSignature(''), 0);
      regPad.canvas.addEventListener('mouseup', mirrorLater);
      regPad.canvas.addEventListener('touchend', mirrorLater);
      window.addEventListener('mouseup', mirrorLater);
      regPad.clear?.addEventListener('click', clearPanels);
      const parentForm = regPad.canvas.closest('form');
      if (parentForm) parentForm.addEventListener('reset', clearPanels);
    }

    // Re-assert the signature whenever a signature-bearing panel is opened, so
    // it always shows even if the image was set while the panel was hidden.
    ['conditions', 'reglement', 'engagement'].forEach((tab) => {
      const btn = document.getElementById('tab-btn-' + tab);
      if (btn) btn.addEventListener('click', () => window.setTimeout(refreshPanelSignatures, 0));
    });

    Object.keys(ACCEPT).forEach(wireAcceptance);

    // Generic acks (panels without a DB acceptance column) just gate the flow.
    GENERIC_TABS.forEach((tab) => {
      const ack = byId('ack-' + tab);
      if (!ack) return;
      ack.addEventListener('change', () => {
        if (!ack.checked) return;
        setGreenTab(tab, true, DOT_ALL[tab]);
        ack.disabled = true;
        try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }
      });
    });

    // Show the current Training Officer signature (read-only) on Panel 4.
    loadOfficerSignature();

    // Fill-the-form button → open a blank form in New mode.
    document.getElementById('openFormBtn')?.addEventListener('click', resetToNewMode);
};

const showSignatureImage = (/** @type {string} */ canvasId, /** @type {string} */ url) => {
    const p = padParts(canvasId);
    if (!p) return;
    p.canvas.style.pointerEvents = 'none';
    p.clear?.classList.add('hidden');
    if (url) {
      // If the image fails to load (missing/deleted signature, server down),
      // hide the broken-image icon and fall back to the placeholder hint.
      p.img.onerror = () => {
        p.img.removeAttribute('src');
        p.img.classList.add('hidden');
        p.hint?.classList.remove('hidden');
      };
      p.img.onload = () => {
        p.img.classList.remove('hidden');
        p.hint?.classList.add('hidden');
      };
      p.img.classList.add('hidden');
      p.hint?.classList.remove('hidden');
      p.img.src = url;
    } else {
      p.img.onerror = null;
      p.img.removeAttribute('src');
      p.img.classList.add('hidden');
      p.hint?.classList.remove('hidden');
    }
};

// Live mirror: applicant column → { source registration field id, targets }.
const MIRROR = /** @type {{ col: string, source: string, targets: string[] }[]} */ ([
  { col: 'full_name', source: 'FullName', targets: ['Cond-ApplicantName', 'rules-ApplicantName', 'Comm-ApplicantName', 'Comm-ApplicantName1'] },
  { col: 'registration_date', source: 'RegistrationDate', targets: ['Cond-ApplicantDate', 'rules-ApplicantDate', 'Comm-ApplicantDate'] },
  { col: 'date_of_birth', source: 'DateOfBirth', targets: ['Comm-DateOfBirth'] },
  { col: 'phone_1', source: 'Phone1', targets: ['Comm-Phone1'] },
]);

// ── Load an applicant record into the whole form ───────────────
const mirrorFromForm = () => {
  MIRROR.forEach(({ source, targets, col }) => {
    const src = byId(source);
    if (!src) return;
    const isDate = DATE_COLS.has(col);
    targets.forEach((tgt) => setTarget(tgt, src.value, isDate));
  });
};

// ── Live-mirror the drawn Registration signature onto the read-only panels ──
// Reads the Registration signature pad's current PNG data URL and paints it on
// the Conditions / Rules / Commitment panels so the applicant's signature is
// shown on every relevant form even before the record is saved.
const mirrorSignatureFromPad = () => {
  const p = padParts(REG_SIG_ID);
  if (!p) return;
  const value = p.input && p.input.value ? p.input.value : '';
  // Only mirror an actual freshly-drawn signature (a data: URL). After loading
  // an applicant, this input holds the numeric signature id (set from the
  // `applicant_signature_id` column by applyDbValues) — mirroring that as an
  // image source would 404 and wipe the signature off the panels on any click.
  if (!/^data:/.test(value)) return;
  applyPanelSignature(value);
};

// Paint (or clear) the applicant's signature on the Conditions / Rules /
// Commitment panels and remember it, so it can be re-applied whenever those
// tabs are opened (guards against any timing/visibility issue).
const applyPanelSignature = (/** @type {string} */ src) => {
  currentSignatureSrc = src || '';
  SIG_IDS.forEach((cid) => showSignatureImage(cid, currentSignatureSrc));
};

/** Re-assert the remembered signature on the read-only panels. */
const refreshPanelSignatures = () => {
  SIG_IDS.forEach((cid) => showSignatureImage(cid, currentSignatureSrc));
};

const padParts = (/** @type {string} */ canvasId) => {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas ? canvas.closest('.gss-sign') : null;
  if (!canvas || !wrap) return null;
  let img = /** @type {HTMLImageElement | null} */ (wrap.querySelector('img.gss-sign-img'));
  if (!img) {
    img = document.createElement('img');
    img.className = 'gss-sign-img pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain p-2 hidden';
    img.alt = 'Signature';
    wrap.appendChild(img);
  }
  return {
    canvas: /** @type {HTMLCanvasElement} */ (canvas),
    wrap,
    img,
    hint: wrap.querySelector('.gss-sign-hint'),
    clear: wrap.querySelector('.gss-sign-clear'),
    input: /** @type {HTMLInputElement | null} */ (wrap.querySelector('.gss-sign-input')),
  };
};

 const wireAcceptance = (/** @type {string} */ key) => {
    const cfg = ACCEPT[key];
    const ack = byId(cfg.ack);
    if (!ack) return;
    ack.addEventListener('change', () => {
      if (!ack.checked) return;
      const ok = window.confirm(t(cfg.confirmKey, cfg.confirmMsg));
      if (!ok) { ack.checked = false; return; }
      applyAcceptance(key, true, true);
      // Mirror the Registration behaviour: once this step is confirmed (green),
      // move the user straight to the next step in the workflow.
      goToNextTab(cfg.tab);
    });
  };

const load = (/** @type {Record<string, any> | null | undefined} */ record) => {
    if (!record) return;
    currentId = record.candidate_no != null ? Number(record.candidate_no) : null;

    // Clear any prior acceptance state before applying this record's.
    Object.keys(ACCEPT).forEach((k) => applyAcceptance(k, false, false));
    GENERIC_TABS.forEach((tab) => {
      setGreenTab(tab, false, DOT_ALL[tab]);
      const ack = byId('ack-' + tab);
      if (ack) { ack.checked = false; ack.disabled = false; }
    });

    const form = /** @type {HTMLFormElement | null} */ (document.getElementById('inscriptionForm'));
    //const linker = /** @type {any} */ (window).GSSForm;
    if (form && record) {
      applyDbValues(form, record);
    }

    // Refresh the Education Level combo so the stored value (applied above) is
    // reflected in the searchable dropdown's visible label.
    try {
      const edu = /** @type {any} */ (window).GSSEducationLevel;
      if (edu && typeof edu.refresh === 'function') edu.refresh();
    } catch (_) { /* noop */ }

    // DB-generated candidate number.
    const candNo = byId('CandidateNo');
    if (candNo) candNo.value = record.candidate_no != null ? String(record.candidate_no) : '';

    // Read-only mapped fields on panels 2, 3, 4.
    Object.entries(TEXT_MAP).forEach(([id, col]) => setTarget(id, record[col], DATE_COLS.has(col)));

    // Commitment ID/passport number (editable until accepted).
    const idpass = byId('Comm-IDPassportNumber');
    if (idpass) idpass.value = record.id_pass_no != null ? String(record.id_pass_no) : '';

    // Applicant signature: show on the form pad + the read-only panels.
    const sigId = record.applicant_signature_id;
    const url = (sigId !== null && sigId !== undefined && sigId !== '')
      ? `${API_BASE}/api/signatures/image?id=${encodeURIComponent(String(sigId))}`
      : '';
    if (url) showSignatureImage(REG_SIG_ID, url); else enableSignaturePad(REG_SIG_ID);
    applyPanelSignature(url);

    // Restore each panel's accepted state from the record.
    if (isTruthy(record.ack_conditions)) applyAcceptance('conditions', true, false);
    if (isTruthy(record.ack_rules)) applyAcceptance('reglement', true, false);
    // Commitment panel: driven by the ack_commitment column. When true, tick
    // the checkbox (green + read-only); when false, leave it unticked so the
    // Card ID / Passport number stays editable.
    const ackCommitment = isTruthy(record.ack_commitment);
    applyAcceptance('engagement', ackCommitment, false);

    // An existing applicant means Registration is already completed.
    setRegistrationReadonly(true);
    setGreenTab('registration', true, '1');
    try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }

    // Reviewer override: while an applicant is still Pending, an Admin or Head
    // of Training may change the interview outcome. In that case the Interview
    // Result radios (and their Remarks) are the ONLY fields left editable — the
    // rest of the Registration panel stays read-only.
    try {
      const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
      const role = session && session.role ? String(session.role) : '';
      const canReview = role === 'Admin' || role === 'Head of Training';
      const isPending = String(record.interview_result || 'Pending').toLowerCase() === 'pending';
      const regForm = /** @type {HTMLFormElement | null} */ (document.getElementById('inscriptionForm'));
      if (regForm) delete regForm.dataset.reviewOnly;
      if (canReview && isPending && regForm) {
        regForm.querySelectorAll('input[name="InterviewResult"]').forEach((el) => {
          /** @type {HTMLInputElement} */ (el).disabled = false;
        });
        const remarks = byId('Remarks');
        if (remarks) remarks.disabled = false;
        const submitBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('regSubmitBtn'));
        if (submitBtn) submitBtn.disabled = false;
        // Flag the form so the submit handler validates ONLY the reviewer's
        // fields (Interview Result / Remarks) and skips the full-panel check,
        // which would otherwise fail on read-only combos that could not be
        // re-populated from stored free-text values.
        regForm.dataset.reviewOnly = 'true';
      }
    } catch (_) { /* noop */ }

    // Interview outcome drives navigation: Accepted → jump to the Conditions
    // tab; otherwise stay on Registration and show a "Pending Approval" banner.
    const accepted = String(record.interview_result || '').toLowerCase() === 'accepted';
    setPendingBanner(!accepted);
    // The Conditions tab is only reachable once the interview is Accepted.
    try { if (/** @type {any} */ (window).GSSTabs) /** @type {any} */ (window).GSSTabs.setForcedLock('conditions', !accepted); } catch (_) { /* noop */ }
    try {
      if (typeof switchTab === 'function') switchTab(accepted ? 'conditions' : 'registration');
    } catch (_) { /* noop */ }

    // On edit, drill straight down to the "For Administration Use" section so
    // the reviewer lands on the Interview Result / Remarks controls.
    try {
      if (!accepted) {
        const adminFs = document.getElementById('adminFieldset');
        if (adminFs && !adminFs.classList.contains('hidden')) {
          window.setTimeout(() => adminFs.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
        }
      }
    } catch (_) { /* noop */ }
};

/** Show or hide the "Pending Approval" banner at the top of the form modal. */
const setPendingBanner = (/** @type {boolean} */ show) => {
  const banner = document.getElementById('pendingApprovalBanner');
  if (!banner) return;
  banner.classList.toggle('hidden', !show);
  banner.classList.toggle('flex', show);
};

// ── Public API ─────────────────────────────────────────────────
// Exposed on window so the grid (panelJump.js), registration.js and
// signatures.js can drive the shared applicant flow. Assigned at the end of
// the file so every function above is already defined.
/** @type {any} */ (window).GSSApplicant = {
  initApplicantForm,
  load,
  mirrorFromForm,
  reset: resetToNewMode,
  completeRegistration,
  loadOfficerSignature,
};
