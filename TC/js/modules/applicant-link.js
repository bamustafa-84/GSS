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
    if (!el) return;

    el.disabled = true;
    el.classList.add('bg-slate-100', 'opacity-80', 'cursor-not-allowed');
    el.classList.remove('bg-white');

    // el.readOnly = true;
    el.setAttribute('aria-readonly', 'true');
    el.tabIndex = -1;
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
   
    /** @type {NodeListOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>} */
      const elements = form.querySelectorAll('input, select, textarea');

      elements.forEach((el) => {
        if(el.id ==='CandidateNo') return; // the DB-generated candidate number is always read-only
        
          el.disabled = ro;
           if(ro){
            el.classList.add('bg-slate-100', 'opacity-80', 'cursor-not-allowed');
            el.classList.remove('bg-white');
            el.setAttribute('aria-readonly', 'true');
            el.tabIndex = -1;
           }
           else{
            el.classList.add('bg-white');
            el.classList.remove(
                'bg-slate-100',
                'opacity-80',
                'cursor-not-allowed'
            );
            el.setAttribute('aria-readonly', 'false');
            el.removeAttribute('tabindex');
           }
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

    // Clear the presences panel for a brand-new applicant.
    clearPresences();
    // Reset the Panel-Exam + Attendance panels to follow the normal sequential
    // lock again (they are force-unlocked only when editing existing applicants).
    try {
      const banner = document.getElementById('exam-result-status');
      if (banner) banner.classList.add('hidden');
      const tabs = /** @type {any} */ (window).GSSTabs;
      if (tabs && typeof tabs.setForcedUnlock === 'function') {
        tabs.setForcedUnlock('exam', false);
        tabs.setForcedUnlock('presences', false);
      }
    } catch (_) { /* noop */ }

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
    // 'presences' is owned by attendance.js (it also saves the training + locks
    // the panel + advances), so it is intentionally excluded here.
    GENERIC_TABS.forEach((tab) => {
      if (tab === 'presences') return;
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

    // Live-clear the mandatory-field error styling as the user types.
    if (cfg.extra) {
      Object.keys(cfg.extra).forEach((id) => {
        const el = byId(id);
        if (el) el.addEventListener('input', () => el.classList.remove('border-red-500', 'ring-2', 'ring-red-300'));
      });
    }

    ack.addEventListener('change', () => {
      if (!ack.checked) return;

      // Mandatory extra fields (e.g. the Commitment ID Card / Passport Number)
      // must be filled before the acknowledgement can be accepted.
      if (cfg.extra) {
        for (const id of Object.keys(cfg.extra)) {
          const el = byId(id);
          if (el && String(el.value || '').trim() === '') {
            ack.checked = false;
            el.classList.add('border-red-500', 'ring-2', 'ring-red-300');
            try { /** @type {any} */ (el).focus(); } catch (_) { /* noop */ }
            window.alert(t('engErrIdRequired', 'Please enter the ID Card / Passport Number before accepting.'));
            return;
          }
        }
      }

      const ok = window.confirm(t(cfg.confirmKey, cfg.confirmMsg));
      if (!ok) { ack.checked = false; return; }
      applyAcceptance(key, true, true);
      // Mirror the Registration behaviour: once this step is confirmed (green),
      // move the user straight to the next step in the workflow.
      goToNextTab(cfg.tab);
    });
  };

// ── Individual Attendance Report (panel-presences) ─────────────
// Populate the read-only presences panel from the DB when an applicant is
// opened: Training Title / Trainer / From / To (from the training table) plus
// the candidate's attendance history (sorted by date) and summary.

/** @type {any[]} All attendance rows for the currently loaded candidate. */
let presRowsAll = [];

const presSetVal = (/** @type {string} */ id, /** @type {any} */ value) => {
  const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
  if (el) el.value = value == null ? '' : String(value);
};

/** Ensure a <select> has an option for `value`, then select it. */
const presEnsureOption = (/** @type {string} */ selectId, /** @type {string} */ value, /** @type {string} */ label) => {
  const sel = /** @type {HTMLSelectElement | null} */ (document.getElementById(selectId));
  if (!sel || !value) return;
  let opt = Array.prototype.find.call(sel.options, (/** @type {HTMLOptionElement} */ o) => o.value === value);
  if (!opt) {
    opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label || value;
    sel.appendChild(opt);
  }
  sel.value = value;
};

const presTimeOf = (/** @type {any} */ isoTs) => {
  if (!isoTs) return '';
  const m = /T(\d{2}:\d{2})/.exec(String(isoTs));
  if (m) return m[1];
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const presDmyOf = (/** @type {any} */ isoTs) => {
  if (!isoTs) return '';
  const iso = String(isoTs).slice(0, 10);
  return /** @type {any} */ (window).GSSDate ? /** @type {any} */ (window).GSSDate.toDMY(iso) : iso;
};

/** Render the header fields + history + summary for one training of the candidate. */
const renderPresencesFor = (/** @type {any} */ trainingId) => {
  const meta = presRowsAll.find((r) => String(r.training_id) === String(trainingId));
  const pres = /** @type {any} */ (window).GSSPresences;
  if (!meta) { if (pres) pres.setRows([]); return; }

  presEnsureOption('att-Trainer', meta.trainer, meta.trainer);
  presSetVal('att-From-date', presDmyOf(meta.date_from));
  presSetVal('att-From-time', presTimeOf(meta.date_from));
  presSetVal('att-To-date', presDmyOf(meta.date_to));
  presSetVal('att-To-time', presTimeOf(meta.date_to));
  presSetVal('att-From', meta.date_from || '');
  presSetVal('att-To', meta.date_to || '');

  const rows = presRowsAll
    .filter((r) => String(r.training_id) === String(trainingId))
    .map((r) => ({
      date: r.attendance_date,
      status: r.status || '',
      arrival: r.arrival_time || '',
      departure: r.departure_time || '',
      observations: r.observation || '',
    }));
  if (pres) pres.setRows(rows);
};

const clearPresences = () => {
  presRowsAll = [];
  try { if (/** @type {any} */ (window).GSSPresences) /** @type {any} */ (window).GSSPresences.clear(); } catch (_) { /* noop */ }
  ['att-TrainingTitle', 'att-Trainer', 'att-From-date', 'att-From-time', 'att-To-date', 'att-To-time', 'att-From', 'att-To']
    .forEach((id) => presSetVal(id, ''));
  // Unlock the panel so a freshly loaded applicant can be edited/acknowledged.
  try { if (typeof /** @type {any} */ (window).setPresencesReadonly === 'function') /** @type {any} */ (window).setPresencesReadonly(false); } catch (_) { /* noop */ }
};

/**
 * Fetch and display the candidate's attendance. Defaults to their most recent
 * training; switching the Training Title select re-scopes the report.
 * @param {number|null} candidateNo
 */
const loadPresences = async (candidateNo) => {
  clearPresences();
  if (candidateNo == null) return;
  try {
    const data = await fetch(
      `${API_BASE}/api/attendance/candidate?candidate_no=${encodeURIComponent(String(candidateNo))}`,
      { headers: { Accept: 'application/json' } }
    ).then((r) => r.json());
    presRowsAll = Array.isArray(data.attendance) ? data.attendance : [];
    const pres = /** @type {any} */ (window).GSSPresences;
    if (!presRowsAll.length) { if (pres) pres.setRows([]); return; }

    // Distinct trainings, and the "primary" one = the most recent (max date_from).
    /** @type {Record<string, any>} */
    const metaById = {};
    presRowsAll.forEach((r) => { if (!metaById[r.training_id]) metaById[r.training_id] = r; });
    let primary = presRowsAll[0].training_id;
    let bestFrom = '';
    Object.keys(metaById).forEach((tid) => {
      const f = String(metaById[tid].date_from || '');
      if (f > bestFrom) { bestFrom = f; primary = metaById[tid].training_id; }
    });

    // Populate the Training Title select with this candidate's trainings.
    Object.keys(metaById).forEach((tid) => {
      presEnsureOption('att-TrainingTitle', metaById[tid].training_title, metaById[tid].training_title);
    });
    presEnsureOption('att-TrainingTitle', metaById[primary].training_title, metaById[primary].training_title);

    renderPresencesFor(primary);
  } catch (_) {
    const pres = /** @type {any} */ (window).GSSPresences;
    if (pres) pres.setRows([]);
  }
};

// Switching the Training Title re-scopes the report to that training.
(() => {
  const sel = document.getElementById('att-TrainingTitle');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const title = /** @type {HTMLSelectElement} */ (sel).value;
    const match = presRowsAll.find((r) => r.training_title === title);
    if (match) renderPresencesFor(match.training_id);
  });
})();

/**
 * Populate the "Individual Exam Result" panel (Panel-Exam) from the candidate's
 * real exam attempt. The Panel-Exam only opens with the final result once the
 * exam has been finished AND corrected (the backend decides via `viewable`);
 * otherwise a status banner explains the current state and the panel is not
 * force-opened. Nothing here is trusted from the client — the score, pass/fail
 * and correction status all come from the server.
 * @param {number|null} candidateNo
 */
const loadExamResult = async (candidateNo) => {
  const banner = document.getElementById('exam-result-status');
  const setBanner = (/** @type {string} */ html, /** @type {string} */ cls) => {
    if (!banner) return;
    banner.className = 'rounded-2xl border px-4 py-3 text-sm font-semibold ' + cls;
    banner.innerHTML = html;
    banner.classList.remove('hidden');
  };
  // Default: exam panel follows the normal sequential flow.
  try { if (/** @type {any} */ (window).GSSTabs) /** @type {any} */ (window).GSSTabs.setForcedUnlock('exam', false); } catch (_) { /* noop */ }
  if (banner) banner.classList.add('hidden');
  if (candidateNo == null) return;

  const tt = (/** @type {string} */ k, /** @type {string} */ f) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const d = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (d && d[lang] && d[lang][k]) return d[lang][k];
    } catch (_) { /* noop */ }
    return f;
  };
  const byIdLocal = (/** @type {string} */ id) => document.getElementById(id);
  const setVal = (/** @type {string} */ id, /** @type {any} */ v) => {
    const el = /** @type {HTMLInputElement|HTMLSelectElement|null} */ (byIdLocal(id));
    if (el && v != null && v !== '') el.value = String(v);
  };
  const ensureOption = (/** @type {string} */ id, /** @type {string} */ val) => {
    const sel = /** @type {HTMLSelectElement|null} */ (byIdLocal(id));
    if (!sel || !val) return;
    if (!Array.from(sel.options).some((o) => o.value === val)) {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = val; sel.appendChild(opt);
    }
    sel.value = val;
  };

  try {
    const data = await fetch(
      `${API_BASE}/api/exam/candidate-result?candidate_no=${encodeURIComponent(String(candidateNo))}`,
      { headers: { Accept: 'application/json' } }
    ).then((r) => r.json());

    if (!data || !data.ok || !data.has_attempt) {
      setBanner(tt('examPanelNone', 'This candidate has not taken an exam yet.'),
        'border-slate-200 bg-slate-50 text-slate-500');
      return;
    }

    // Always reflect the candidate identity + exam meta on the panel.
    setVal('exam-CandidateNo', data.candidate_no);
    setVal('exam-FullName', data.candidate_name);
    setVal('exam-Trainer', data.instructor);
    if (data.exam_date) setVal('exam-ExamDate', String(data.exam_date).slice(0, 10));
    ensureOption('exam-TrainingTitle', data.training_title);

    if (!data.viewable) {
      // Finished-but-waiting or still in progress → do NOT open with a result.
      const msg = data.state === 'in_progress'
        ? tt('examPanelInProgress', 'The candidate is currently taking the exam. The result will appear here once it is submitted and corrected.')
        : tt('examPanelWaiting', 'The candidate has finished the exam. It is awaiting correction — the result will appear here once corrected.');
      setBanner('⏳ ' + msg, 'border-amber-200 bg-amber-50 text-amber-800');
      return;
    }

    // Corrected → open the Panel-Exam with the final result.
    setVal('Score', data.total_score != null ? data.total_score : '');
    const resInputs = document.querySelectorAll('input[name="Result"]');
    resInputs.forEach((el) => {
      const r = /** @type {HTMLInputElement} */ (el);
      r.checked = (data.passed === true && r.value === 'Reussi') || (data.passed === false && r.value === 'Echec');
    });

    const scoreLine = `${data.total_score}${data.max_score != null ? ' / ' + data.max_score : ''}`;
    const passLine = data.passed == null ? ''
      : (data.passed
        ? ` · <span class="text-emerald-700">${tt('examPanelPass', 'PASS')}</span>`
        : ` · <span class="text-red-700">${tt('examPanelFail', 'FAIL')}</span>`);
    setBanner(
      `✓ ${tt('examPanelCorrected', 'Exam completed and corrected')} — <span class="font-bold">${scoreLine}</span>${passLine}` +
      (data.passing_score != null ? ` <span class="font-normal text-slate-500">(${tt('examPanelPassMark', 'pass mark')}: ${data.passing_score})</span>` : ''),
      'border-emerald-200 bg-emerald-50 text-emerald-800');

    // Make the Panel-Exam reachable now that the exam is finished + corrected.
    try { if (/** @type {any} */ (window).GSSTabs) /** @type {any} */ (window).GSSTabs.setForcedUnlock('exam', true); } catch (_) { /* noop */ }
  } catch (_) {
    if (banner) banner.classList.add('hidden');
  }
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

    // Individual Attendance Report: pull the candidate's attendance from the DB.
    loadPresences(currentId);

    // Editing an existing applicant from the grid: the attendance phase is
    // treated as recorded, so mark the Attendance panel completed (green ✓) and
    // lock all its fields read-only.
    try {
      const pres = /** @type {any} */ (window).GSSPresences;
      if (pres && typeof pres.markComplete === 'function') pres.markComplete();
    } catch (_) { /* noop */ }

    // Individual Exam Result (Panel-Exam): reflect the candidate's real exam
    // attempt. Opens with the final result only once the exam is corrected.
    loadExamResult(currentId);

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
