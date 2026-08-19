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

    // Clear the Dossier checklist + certification for a brand-new applicant.
    try { resetDossierChecklist(); } catch (_) { /* noop */ }

    // Clear the Evaluation panel for a brand-new applicant.
    try { resetEvaluation(); } catch (_) { /* noop */ }

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
    // 'exam' has its own dedicated handler below.
    GENERIC_TABS.forEach((tab) => {
      if (tab === 'presences' || tab === 'exam' || tab === 'dossier' || tab === 'evaluation') return;
      const ack = byId('ack-' + tab);
      if (!ack) return;
      ack.addEventListener('change', () => {
        if (!ack.checked) return;
        setGreenTab(tab, true, DOT_ALL[tab]);
        ack.disabled = true;
        try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }
      });
    });

    // Exam panel ack: restricted to Instructor / Head of Training / Admin.
    // When ticked, the instructor signature is auto-populated from the
    // signatures table by matching the current user's full_name.
    const examAck = byId('ack-exam');
    if (examAck) {
      examAck.disabled = !canAckExam();
      examAck.addEventListener('change', async () => {
        if (!examAck.checked) return;
        if (!canAckExam()) {
          examAck.checked = false;
          return;
        }

        // Required Exam-panel fields before the result can be acknowledged:
        // Score Obtained, Result (Pass/Fail) and Decision.
        const scoreEl = byId('Score');
        const scoreVal = scoreEl ? String(scoreEl.value).trim() : '';
        const resultChecked = document.querySelector('input[name="Result"]:checked');
        const decisionChecked = document.querySelector('input[name="Decision"]:checked');
        if (scoreVal === '' || !resultChecked || !decisionChecked) {
          examAck.checked = false;
          window.alert(t('examErrRequired', 'Please provide the Score, Result and Decision before acknowledging the exam.'));
          return;
        }

        const confirmed = window.confirm(
          'Are you sure you want to acknowledge the exam?'
        );

        if (!confirmed) {
          examAck.checked = false;
          return;
        }

        const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
        const userName = session ? (session.full_name || session.username || '') : '';
        const sig = userName ? await findTrainerSignature(userName) : null;
        if (sig && sig.signature_id) {
          showSignatureImage('exam-sig-cachet', `${API_BASE}/api/signatures/image?id=${encodeURIComponent(String(sig.signature_id))}`);
          const input = byId('exam-sig-cachet-data');
          if (input) input.value = String(sig.signature_id);
        }
        setGreenTab('exam', true, DOT_ALL['exam']);
        examAck.disabled = true;
        setExamPanelReadonly(true);
        await saveExamAck();
        try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }
        try { goToNextTab('exam'); } catch (_) { /* noop */ }
      });
    }

    // Show the current Training Officer signature (read-only) on Panel 4.
    loadOfficerSignature();

    // ── Individual Evaluation Sheet (Panel-Evaluation) ───────────
    // The two eval signatures are always auto-applied, never hand-drawn.
    ['eval-sig-formateur', 'eval-sig-resp'].forEach((cid) => {
      const canvas = document.getElementById(cid);
      if (canvas) canvas.style.pointerEvents = 'none';
      const wrap = canvas ? canvas.closest('.gss-sign') : null;
      const clear = wrap ? wrap.querySelector('.gss-sign-clear') : null;
      if (clear) clear.classList.add('hidden');
    });

    // Recompute the auto-graded cells + refresh the workflow state whenever the
    // Evaluation panel is opened.
    const evalBtn = document.getElementById('tab-btn-evaluation');
    if (evalBtn) evalBtn.addEventListener('click', () => window.setTimeout(() => {
      if (!evalInstructorAck) populateEvalAutoFields();
      applyEvaluationState();
    }, 0));

    // Keep the summary total live as the Instructor edits the manual cells.
    EVAL_MANUAL_IDS.forEach((id) => {
      const el = byId(id);
      if (el) el.addEventListener('input', () => { try { if (typeof updateEvalSummary === 'function') updateEvalSummary(); } catch (_) { /* noop */ } });
    });

    // ack-evaluation: two-stage sign-off (Instructor → Admin).
    const evalAck = byId('ack-evaluation');
    if (evalAck) {
      evalAck.addEventListener('change', async () => {
        if (!evalAck.checked) return;

        // Stage 2 — Admin finalises.
        if (evalInstructorAck && !evalAdminAck) {
          if (!isEvalAdminRole()) {
            evalAck.checked = false;
            window.alert(t('evalErrAdminOnly', 'Only an Admin can set the Final Result and finalise the evaluation.'));
            return;
          }
          const fd = document.querySelector('#panel-evaluation input[name="Final_Decision"]:checked');
          if (!fd) {
            evalAck.checked = false;
            window.alert(t('evalErrFinalRequired', 'Please select the Final Result before finalising the evaluation.'));
            return;
          }
          if (!window.confirm(t('evalConfirmAdmin', 'Finalise this evaluation and record the Manager/Director signature? This will be saved.'))) {
            evalAck.checked = false;
            return;
          }
          const sig = await currentUserSignature();
          if (sig && sig.signature_id) setEvalSignature('resp', sig.signature_id);
          evalAdminAck = true;
          const respInput = byId('eval-sig-resp-data');
          await saveEvaluation({
            eval_final_decision: /** @type {HTMLInputElement} */ (fd).value,
            eval_observations: (byId('eval-Observations') || {}).value || '',
            eval_manager_signature_id: respInput && respInput.value ? Number(respInput.value) : null,
            eval_admin_ack: true,
          });
          setGreenTab('evaluation', true, DOT_ALL['evaluation']);
          setEvalFullReadonly();
          if (evalAck) { evalAck.checked = true; evalAck.disabled = true; }
          applyEvaluationState();
          try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }
          // Req 12: open the Measurements panel once the Admin finalises.
          try { if (/** @type {any} */ (window).GSSTabs) /** @type {any} */ (window).GSSTabs.setForcedUnlock('mensuration', true); } catch (_) { /* noop */ }
          try { if (typeof switchTab === 'function') switchTab('mensuration'); } catch (_) { /* noop */ }
          return;
        }

        // Stage 1 — Instructor completes + signs.
        if (!evalInstructorAck) {
          if (!isEvalTrainerRole()) {
            evalAck.checked = false;
            window.alert(t('evalErrInstructorOnly', 'Only the Instructor can complete and sign the evaluation.'));
            return;
          }
          if (!evalGradesFilled()) {
            evalAck.checked = false;
            window.alert(t('evalErrGradesRequired', 'Please fill in every grade before signing the evaluation.'));
            return;
          }
          if (!window.confirm(t('evalConfirmInstructor', 'Sign this evaluation as Instructor? The grades will be locked and saved.'))) {
            evalAck.checked = false;
            return;
          }
          const sig = await currentUserSignature();
          if (sig && sig.signature_id) setEvalSignature('formateur', sig.signature_id);
          evalInstructorAck = true;
          setEvalGradesEditable(false);
          const trainerInput = byId('eval-sig-formateur-data');
          /** @type {Record<string, any>} */
          const payload = { eval_instructor_ack: true, eval_total: evalTotalObtained() };
          Object.entries(EVAL_FIELD_COLS).forEach(([id, col]) => {
            const el = byId(id);
            if (el && el.value !== '') payload[col] = Number(el.value);
          });
          payload.eval_trainer_signature_id = trainerInput && trainerInput.value ? Number(trainerInput.value) : null;
          await saveEvaluation(payload);
          // The Instructor's part is done; hand over to the Admin.
          applyEvaluationState();
          return;
        }

        // Already fully acknowledged.
        evalAck.checked = true;
      });
    }

    // ── Individual Candidate File (Dossier) checklist ────────────
    // Recompute the read-only checklist every time the Dossier panel is opened,
    // so it reflects the latest panel-completion state.
    const dossierBtn = document.getElementById('tab-btn-dossier');
    if (dossierBtn) dossierBtn.addEventListener('click', () => window.setTimeout(syncDossierChecklist, 0));

    // Establish the initial read-only checklist + ack lock state.
    try { syncDossierChecklist(); } catch (_) { /* noop */ }

    // ack-dossier: certifies the whole file. Restricted to Admin / Secretary /
    // Head of Training, only allowed once every checklist item is present, and
    // confirmed + persisted before it is committed.
    const dossierAck = byId('ack-dossier');
    if (dossierAck) {
      dossierAck.addEventListener('change', async () => {
        if (!dossierAck.checked) return;
        if (dossierAck.dataset.committed === 'true') return;

        if (!canAckDossier()) {
          dossierAck.checked = false;
          window.alert(t('dossierAckRole', 'You are not authorised to certify this candidate file.'));
          return;
        }
        if (!allDossierChecked()) {
          dossierAck.checked = false;
          window.alert(t('dossierAckIncomplete', 'All checklist documents must be present before certifying the file.'));
          return;
        }

        const ok = window.confirm(t('dossierAckConfirm',
          'Are you sure you want to certify this Individual Candidate File? This will be saved.'));
        if (!ok) { dossierAck.checked = false; return; }

        setGreenTab('dossier', true, DOT_ALL['dossier']);
        dossierAck.disabled = true;
        dossierAck.dataset.committed = 'true';
        try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }
        await saveAcceptance({ ack_dossier: true });
      });
    }

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

/** @type {number | null} The corrected exam score (out of 100) of the loaded candidate. */
let lastExamScore = null;

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
  lastExamScore = null;
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
    lastExamScore = data.total_score != null ? Number(data.total_score) : null;
    const resInputs = document.querySelectorAll('input[name="Result"]');
    resInputs.forEach((el) => {
      const r = /** @type {HTMLInputElement} */ (el);
      r.checked = (data.passed === true && r.value === 'Reussi') || (data.passed === false && r.value === 'Echec');
    });

    // The Exam Result (Score + Pass/Fail) is now set → the Attendance phase is
    // finished, so mark the Attendance panel green + read-only.
    try {
      const pres = /** @type {any} */ (window).GSSPresences;
      if (pres && typeof pres.markComplete === 'function') pres.markComplete();
    } catch (_) { /* noop */ }

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

/** Current signed-in role, used to gate the Exam panel ack/signature flow. */
const getCurrentRole = () => {
  const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
  return session && session.role ? String(session.role) : '';
};

/** True for the three roles allowed to acknowledge / sign the Exam panel. */
const canAckExam = () => {
  const role = getCurrentRole();
  return role === 'Admin' || role === 'Head of Training' || role === 'Instructor';
};

/** Populate the Exam panel decision / observations fields from the record.
    These controls live outside the registration form, so applyDbValues does
    not reach them. */
const loadExamPanelFields = (/** @type {Record<string, any> | null | undefined} */ record) => {
  const decision = record && record.exam_decision;
  document.querySelectorAll('input[name="Decision"][dbname="exam_decision"]').forEach((el) => {
    /** @type {HTMLInputElement} */ (el).checked = decision != null && decision !== '' && el.value === String(decision);
  });
  const obs = byId('exam-observation');
  if (obs) obs.value = (record && record.exam_observations) || '';
};

/** Render the stored instructor signature image on the Exam panel. */
const loadExamInstructorSignature = (/** @type {Record<string, any> | null | undefined} */ record) => {
  const sigId = record && record.exam_instructor_signature_id;
  if (sigId != null && sigId !== '') {
    const url = `${API_BASE}/api/signatures/image?id=${encodeURIComponent(String(sigId))}`;
    showSignatureImage('exam-sig-cachet', url);
    const input = byId('exam-sig-cachet-data');
    if (input) input.value = String(sigId);
  } else {
    showSignatureImage('exam-sig-cachet', '');
    const input = byId('exam-sig-cachet-data');
    if (input) input.value = '';
  }
};

/** Lock or unlock the Exam panel decision/observation/ack fields. */
const setExamPanelReadonly = (/** @type {boolean} */ ro) => {
  const panel = document.getElementById('panel-exam');
  if (!panel) return;
  const locked = ro || !canAckExam();
  const ack = byId('ack-exam');
  if (ack) {
    ack.disabled = locked;
    if (ro) ack.checked = true;
  }
  panel.querySelectorAll('input[name="Decision"], input[name="Result"], #Score, textarea#exam-observation').forEach((el) => {
    /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el).disabled = locked;
  });
  const canvas = document.getElementById('exam-sig-cachet');
  if (canvas) canvas.style.pointerEvents = 'none';
};

/** Fetch the signature whose contact_name matches the supplied name. */
const findTrainerSignature = async (/** @type {string} */ name) => {
  if (!name) return null;
  try {
    const resp = await fetch(`${API_BASE}/api/signatures/by-contact?name=${encodeURIComponent(name)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await resp.json().catch(() => null);
    return data && data.ok && data.signature ? data.signature : null;
  } catch (_) {
    return null;
  }
};

/** Persist the Exam panel decision/observations/signature/ack state. */
const saveExamAck = async () => {
  if (!currentId) return;
  const decision = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="Decision"]:checked'));
  const observations = byId('exam-observation');
  const sigInput = byId('exam-sig-cachet-data');
  const payload = {
    candidate_no: currentId,
    ack_exam: true,
    exam_decision: decision ? decision.value : '',
    exam_observations: observations ? observations.value : '',
    exam_instructor_signature_id: sigInput && sigInput.value ? Number(sigInput.value) : null,
  };
  try {
    await fetch(`${API_BASE}/api/applicants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (_) { /* noop */ }
};

// ── Individual Candidate File (Dossier) checklist ──────────────
// The checklist mirrors the completion state of the other panels: each row is
// auto-ticked from the corresponding panel being green (or, for the ID photos,
// from the Registration "HasPassportPhotos" flag) and is always read-only.

/** True when a workflow tab has been completed (green). */
const isTabGreen = (/** @type {string} */ tab) => {
  try { return typeof tabState !== 'undefined' && !!tabState[tab]; } catch (_) { return false; }
};

/** True when the Registration "HasPassportPhotos" checkbox is ticked. */
const hasPassportPhotos = () => {
  const el = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="HasPassportPhotos"]'));
  return !!(el && el.checked);
};

// Checklist checkbox name → predicate deciding whether it is auto-ticked.
const DOSSIER_CHECKS = /** @type {{ name: string, when: () => boolean }[]} */ ([
  { name: 'doss-doc-1-1', when: () => isTabGreen('registration') }, // Registration form
  { name: 'doss-doc-1-2', when: () => isTabGreen('registration') }, // Signed registration conditions
  { name: 'doss-doc-1-3', when: () => isTabGreen('registration') }, // Copy of identity document
  { name: 'doss-doc-1-4', when: () => hasPassportPhotos() },        // Two ID photos
  { name: 'doss-doc-2-1', when: () => isTabGreen('mensuration') },  // Measurements sheet
  { name: 'doss-doc-2-2', when: () => isTabGreen('reglement') },    // Signed internal regulations
  { name: 'doss-doc-2-3', when: () => isTabGreen('engagement') },   // Confidentiality commitment
  { name: 'doss-doc-2-4', when: () => isTabGreen('presences') },    // Attendance list
  { name: 'doss-doc-3-1', when: () => isTabGreen('evaluation') },   // Individual evaluation sheet
  { name: 'doss-doc-3-2', when: () => isTabGreen('exam') },         // Final exam result
]);

const dossByName = (/** @type {string} */ name) =>
  /** @type {HTMLInputElement | null} */ (document.querySelector(`#panel-dossier input[name="${name}"]`));

/** True when every governed checklist document is ticked. */
const allDossierChecked = () =>
  DOSSIER_CHECKS.every(({ name }) => { const cb = dossByName(name); return !!(cb && cb.checked); });

/** Roles allowed to certify (tick ack-dossier) the candidate file. */
const canAckDossier = () => {
  const role = getCurrentRole();
  return role === 'Admin' || role === 'Secretary' || role === 'Head of Training';
};

/** Set an explanatory tooltip on ack-dossier (shown on hover) and its label. */
const setDossierAckReason = (/** @type {string} */ reason) => {
  const ack = byId('ack-dossier');
  if (!ack) return;
  if (reason) ack.setAttribute('title', reason); else ack.removeAttribute('title');
  const label = ack.closest('label');
  if (label) { if (reason) label.setAttribute('title', reason); else label.removeAttribute('title'); }
};

/** Enable/disable ack-dossier from the current role + checklist completeness. */
const updateDossierAckState = () => {
  const ack = byId('ack-dossier');
  if (!ack) return;
  if (ack.dataset.committed === 'true') {
    ack.disabled = true;
    setDossierAckReason(t('dossierAckDone', 'This candidate file has already been certified.'));
    return;
  }
  const roleOk = canAckDossier();
  const checklistOk = allDossierChecked();
  ack.disabled = !(roleOk && checklistOk);
  // Explain (on hover) exactly why the certification is currently disabled.
  let reason = '';
  if (!roleOk) reason = t('dossierAckRole', 'You are not authorised to certify this candidate file.');
  else if (!checklistOk) reason = t('dossierAckIncomplete', 'One or more required checklist documents are not yet checked.');
  setDossierAckReason(reason);
};

/** Recompute the read-only checklist from panel state and refresh the ack lock. */
const syncDossierChecklist = () => {
  DOSSIER_CHECKS.forEach(({ name, when }) => {
    const cb = dossByName(name);
    if (!cb) return;
    cb.checked = !!when();
    cb.disabled = true;
    cb.classList.add('cursor-not-allowed', 'opacity-80');
    cb.setAttribute('aria-readonly', 'true');
    cb.tabIndex = -1;
  });
  updateDossierAckState();
};

/** Reset the checklist + certification to a blank state (New mode / new record). */
const resetDossierChecklist = () => {
  const ack = byId('ack-dossier');
  if (ack) { ack.checked = false; ack.disabled = false; delete ack.dataset.committed; }
  syncDossierChecklist();
};

// ── Individual Evaluation Sheet (Panel-Evaluation) ─────────────
// Two-stage sign-off:
//   1. The Instructor (trainer) fills the manually-graded cells, checks
//      ack-evaluation → their signature is auto-applied, the grid locks and the
//      Final Result opens for the Admin.
//   2. The Admin sets the Final Result and checks ack-evaluation → the
//      Manager/Director signature is auto-applied, the panel becomes fully
//      read-only, the tab turns green and the Measurements panel opens.
// Auto-graded cells (Presence & Discipline, Punctuality, Theoretical exam) are
// computed from the attendance history + exam score and are always read-only.

const EVAL_AUTO_IDS = ['Presence_Discipline', 'Punctuality', 'Theoretical_Exam'];
const EVAL_MANUAL_IDS = ['Instructions_Compliance', 'Professional_Appearance', 'French_Communication', 'Observation_Skills', 'Physical_Aptitude'];

// Grade cell id → applicant column.
const EVAL_FIELD_COLS = /** @type {Record<string, string>} */ ({
  Presence_Discipline: 'eval_presence_discipline',
  Punctuality: 'eval_punctuality',
  Instructions_Compliance: 'eval_instructions_compliance',
  Professional_Appearance: 'eval_professional_appearance',
  French_Communication: 'eval_french_communication',
  Observation_Skills: 'eval_observation_skills',
  Physical_Aptitude: 'eval_physical_aptitude',
  Theoretical_Exam: 'eval_theoretical_exam',
});

/** @type {boolean} Instructor acknowledgement state of the loaded candidate. */
let evalInstructorAck = false;
/** @type {boolean} Admin (final) acknowledgement state of the loaded candidate. */
let evalAdminAck = false;

const round2 = (/** @type {number} */ n) => Math.round(n * 2) / 2;

/** Compute Presence & Discipline (/20) and Punctuality (/10) from attendance. */
const computeAttendanceGrades = () => {
  const rows = Array.isArray(presRowsAll) ? presRowsAll : [];
  let ah = 0, present = 0, total = 0;
  rows.forEach((r) => {
    const s = String(r && r.status || '').toUpperCase();
    if (s === 'AH') { ah++; present++; total++; }
    else if (s === 'AR') { present++; total++; }
    else if (s === 'ABS') { total++; }
    // 'EX' (excluded) days are ignored.
  });
  return {
    presenceDiscipline: total > 0 ? round2((present / total) * 20) : 0,
    punctuality: present > 0 ? round2((ah / present) * 10) : 0,
  };
};

const setEvalField = (/** @type {string} */ id, /** @type {any} */ value) => {
  const el = byId(id);
  if (el) el.value = value == null || value === '' ? '' : String(value);
};

/** Reliable enable/disable for a single form control (+ read-only styling). */
const setEvalInputEnabled = (/** @type {HTMLInputElement | HTMLTextAreaElement | null} */ el, /** @type {boolean} */ enabled) => {
  if (!el) return;
  el.disabled = !enabled;
  if (enabled) {
    el.readOnly = false;
    el.removeAttribute('aria-readonly');
    el.tabIndex = 0;
    el.classList.remove('bg-slate-100', 'opacity-80', 'cursor-not-allowed', 'pointer-events-none');
    el.classList.add('bg-white');
  } else {
    el.setAttribute('aria-readonly', 'true');
    el.tabIndex = -1;
    el.classList.add('bg-slate-100', 'opacity-80', 'cursor-not-allowed');
    el.classList.remove('bg-white');
  }
};

/** Populate the auto-graded cells (read-only) from attendance + exam score. */
const populateEvalAutoFields = () => {
  const g = computeAttendanceGrades();
  setEvalField('Presence_Discipline', g.presenceDiscipline);
  setEvalField('Punctuality', g.punctuality);
  // Theoretical exam (/20) = exam Score obtained (/100) ÷ 5.
  const scoreEl = byId('Score');
  const scoreVal = lastExamScore != null ? lastExamScore
    : (scoreEl && scoreEl.value !== '' ? Number(scoreEl.value) : null);
  if (scoreVal != null && !Number.isNaN(scoreVal)) setEvalField('Theoretical_Exam', round2(scoreVal / 5));
  EVAL_AUTO_IDS.forEach((id) => setEvalInputEnabled(byId(id), false));
  try { if (typeof updateEvalSummary === 'function') updateEvalSummary(); } catch (_) { /* noop */ }
};

/** Enable/disable the manually-graded cells (auto cells always stay read-only). */
const setEvalGradesEditable = (/** @type {boolean} */ editable) => {
  EVAL_MANUAL_IDS.forEach((id) => setEvalInputEnabled(byId(id), editable));
  EVAL_AUTO_IDS.forEach((id) => setEvalInputEnabled(byId(id), false));
};

/** Enable/disable the Final Result controls (radios + observations). */
const setEvalFinalEditable = (/** @type {boolean} */ editable) => {
  document.querySelectorAll('#panel-evaluation input[name="Final_Decision"]').forEach((el) => {
    /** @type {HTMLInputElement} */ (el).disabled = !editable;
  });
  setEvalInputEnabled(byId('eval-Observations'), editable);
};

/** Lock every control on the Evaluation panel (final complete state). */
const setEvalFullReadonly = () => {
  setEvalGradesEditable(false);
  setEvalFinalEditable(false);
  const ack = byId('ack-evaluation');
  if (ack) ack.disabled = true;
  ['eval-sig-formateur', 'eval-sig-resp'].forEach((cid) => {
    const canvas = document.getElementById(cid);
    if (canvas) canvas.style.pointerEvents = 'none';
  });
};

/** Show or hide the two-stage status banner on the Evaluation panel. */
const setEvalStatus = (/** @type {string} */ html, /** @type {string} */ cls) => {
  const banner = document.getElementById('eval-status');
  if (!banner) return;
  if (!html) { banner.classList.add('hidden'); return; }
  banner.className = 'rounded-2xl border px-4 py-3 text-sm font-semibold ' + cls;
  banner.innerHTML = html;
  banner.classList.remove('hidden');
};

const isEvalTrainerRole = () => {
  const role = getCurrentRole();
  return role === 'Instructor' || role === 'Head of Training';
};
const isEvalAdminRole = () => getCurrentRole() === 'Admin';

/** True once every grade cell (auto + manual) has a value. */
const evalGradesFilled = () =>
  [...EVAL_AUTO_IDS, ...EVAL_MANUAL_IDS].every((id) => {
    const el = byId(id);
    return !!(el && String(el.value).trim() !== '');
  });

/** Paint an auto-applied signature (trainer or manager) + store its id. */
const setEvalSignature = (/** @type {'formateur'|'resp'} */ which, /** @type {any} */ sigId) => {
  const canvasId = which === 'formateur' ? 'eval-sig-formateur' : 'eval-sig-resp';
  const input = byId(canvasId + '-data');
  if (sigId != null && sigId !== '') {
    showSignatureImage(canvasId, `${API_BASE}/api/signatures/image?id=${encodeURIComponent(String(sigId))}`);
    if (input) input.value = String(sigId);
  } else {
    showSignatureImage(canvasId, '');
    if (input) input.value = '';
  }
};

/** The signature record of the currently signed-in user (by full name). */
const currentUserSignature = async () => {
  const session = (typeof GSSSession !== 'undefined') ? GSSSession.get() : null;
  const userName = session ? (session.full_name || session.username || '') : '';
  return userName ? await findTrainerSignature(userName) : null;
};

/** Persist the current evaluation state (grades / decision / acks / signatures). */
const saveEvaluation = async (/** @type {Record<string, any>} */ payload) => {
  if (!currentId) return;
  try {
    await fetch(`${API_BASE}/api/applicants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_no: currentId, ...payload }),
    });
  } catch (_) { /* noop */ }
};

/** Current total of the eight grade cells (blank cells count as 0). */
const evalTotalObtained = () =>
  [...EVAL_AUTO_IDS, ...EVAL_MANUAL_IDS].reduce((sum, id) => {
    const el = byId(id);
    const v = el && el.value !== '' ? parseFloat(el.value) : NaN;
    return sum + (Number.isNaN(v) ? 0 : v);
  }, 0);

/**
 * Apply the correct editability / lock / status for the Evaluation panel based
 * on the current role and the two acknowledgement flags.
 */
const applyEvaluationState = () => {
  const ack = byId('ack-evaluation');
  const isTrainer = isEvalTrainerRole();
  const isAdmin = isEvalAdminRole();

  if (evalAdminAck) {
    setEvalFullReadonly();
    if (ack) { ack.checked = true; ack.disabled = true; }
    setGreenTab('evaluation', true, DOT_ALL['evaluation']);
    setEvalStatus('✓ ' + t('evalStComplete', 'Evaluation complete — validated by the Instructor and the Admin.'),
      'border-emerald-200 bg-emerald-50 text-emerald-800');
    try { if (typeof updateTabLocks === 'function') updateTabLocks(); } catch (_) { /* noop */ }
    return;
  }

  if (!evalInstructorAck) {
    // Stage 1 — Instructor fills + signs.
    setEvalGradesEditable(isTrainer);
    setEvalFinalEditable(false);
    if (ack) { ack.checked = false; ack.disabled = !isTrainer; }
    setEvalStatus(
      isTrainer
        ? '① ' + t('evalStInstructor', 'Please complete the grades and check the acknowledgement to sign as Instructor.')
        : '⏳ ' + t('evalStWaitInstructor', 'Waiting for the Instructor to complete and sign the evaluation.'),
      'border-amber-200 bg-amber-50 text-amber-800');
  } else {
    // Stage 2 — Admin sets the Final Result + signs.
    setEvalGradesEditable(false);
    setEvalFinalEditable(isAdmin);
    if (ack) { ack.checked = false; ack.disabled = !isAdmin; }
    setEvalStatus(
      isAdmin
        ? '② ' + t('evalStAdmin', 'The Instructor has signed. Set the Final Result and check the acknowledgement to finalise.')
        : '⏳ ' + t('evalStWaitAdmin', 'The Instructor has signed. Waiting for the Admin to set the Final Result and finalise.'),
      'border-amber-200 bg-amber-50 text-amber-800');
  }
};

/** Populate the Evaluation panel from the applicant record. */
const loadEvaluation = (/** @type {Record<string, any> | null | undefined} */ record) => {
  evalInstructorAck = isTruthy(record && record.eval_instructor_ack);
  evalAdminAck = isTruthy(record && record.eval_admin_ack);

  // Manual + (stored) auto grades from the record.
  Object.entries(EVAL_FIELD_COLS).forEach(([id, col]) => {
    const v = record ? record[col] : null;
    if (v != null && v !== '') setEvalField(id, v);
    else setEvalField(id, '');
  });

  // Final decision + observations.
  const fd = record && record.eval_final_decision;
  document.querySelectorAll('#panel-evaluation input[name="Final_Decision"]').forEach((el) => {
    const r = /** @type {HTMLInputElement} */ (el);
    r.checked = fd != null && fd !== '' && r.value === String(fd);
  });
  const obs = byId('eval-Observations');
  if (obs) obs.value = (record && record.eval_observations) || '';

  // Signatures.
  setEvalSignature('formateur', record && record.eval_trainer_signature_id);
  setEvalSignature('resp', record && record.eval_manager_signature_id);

  // Auto-graded cells: recompute only while the Instructor has not signed yet
  // (once signed, the stored values are authoritative).
  if (!evalInstructorAck) populateEvalAutoFields();
  else { EVAL_AUTO_IDS.forEach((id) => setEvalInputEnabled(byId(id), false)); try { if (typeof updateEvalSummary === 'function') updateEvalSummary(); } catch (_) { /* noop */ } }

  applyEvaluationState();
};

/** Reset the Evaluation panel to a blank state (New mode). */
const resetEvaluation = () => {
  evalInstructorAck = false;
  evalAdminAck = false;
  [...EVAL_AUTO_IDS, ...EVAL_MANUAL_IDS].forEach((id) => setEvalField(id, ''));
  document.querySelectorAll('#panel-evaluation input[name="Final_Decision"]').forEach((el) => { /** @type {HTMLInputElement} */ (el).checked = false; });
  const obs = byId('eval-Observations'); if (obs) obs.value = '';
  setEvalSignature('formateur', '');
  setEvalSignature('resp', '');
  const ack = byId('ack-evaluation'); if (ack) { ack.checked = false; ack.disabled = false; }
  setEvalStatus('', '');
  try { if (typeof updateEvalSummary === 'function') updateEvalSummary(); } catch (_) { /* noop */ }
};


const findLatestWorkflowTab = () => {
  if (typeof TAB_ORDER === 'undefined' || typeof isTabUnlocked !== 'function') return null;
  let latest = null;
  for (const tab of TAB_ORDER) {
    if (tab === 'dossier') continue; // checklist is always unlocked, ignore for auto-jump
    if (tabState[tab] || isTabUnlocked(tab)) latest = tab;
  }
  return latest;
};

const load = async (/** @type {Record<string, any> | null | undefined} */ record) => {
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
    await loadPresences(currentId);

    // Individual Exam Result (Panel-Exam): populate the Score + Pass/Fail from
    // the server once the exam has been corrected, and restore the
    // instructor-entered Decision / Observations / signature from the record.
    await loadExamResult(currentId);
    loadExamPanelFields(record);
    loadExamInstructorSignature(record);

    // Individual Evaluation Sheet (Panel-Evaluation): auto-graded cells come
    // from the attendance + exam data loaded just above, so this runs after them.
    loadEvaluation(record);

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

    // Restore the Exam panel completion (green) so the Dossier checklist can
    // reflect the "Final exam result" rule, then restore the Dossier
    // certification (ack-dossier) itself and recompute the read-only checklist.
    if (isTruthy(record.ack_exam)) {
      setGreenTab('exam', true, DOT_ALL['exam']);
      setExamPanelReadonly(true);
    }

    const ackDossier = byId('ack-dossier');
    if (ackDossier) { ackDossier.checked = false; ackDossier.disabled = false; delete ackDossier.dataset.committed; }
    if (isTruthy(record.ack_dossier)) {
      if (ackDossier) { ackDossier.checked = true; ackDossier.disabled = true; ackDossier.dataset.committed = 'true'; }
      setGreenTab('dossier', true, DOT_ALL['dossier']);
    }
    syncDossierChecklist();
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
    const examCorrected = isTruthy(record.ack_exam);
    setPendingBanner(!accepted);
    // The Conditions tab is only reachable once the interview is Accepted.
    try { if (/** @type {any} */ (window).GSSTabs) /** @type {any} */ (window).GSSTabs.setForcedLock('conditions', !accepted); } catch (_) { /* noop */ }
    try {
      let targetTab = accepted ? 'conditions' : 'registration';
      // Once the exam has been corrected, jump straight to the most advanced
      // reachable tab (e.g. Exam, Evaluation, or beyond).
      if (examCorrected) {
        const latest = findLatestWorkflowTab();
        if (latest) targetTab = latest;
      }
      if (typeof switchTab === 'function') switchTab(targetTab);
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
