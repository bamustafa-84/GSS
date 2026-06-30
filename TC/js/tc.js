const translations = {
  fr: {
    // ── Hero / page ──────────────────────────────────────────
    title: 'GSS | Rejoignez nos agents de sécurité',
    eyebrow: 'Sécurité professionnelle',
    heroTitle: 'Rejoignez une formation d\'exception pour devenir agent de sécurité.',
    heroText: 'Un parcours structuré, un encadrement sérieux et une procédure d\'inscription simplifiée pour démarrer votre aventure avec GSS.',
    openBtn: 'Remplir le formulaire',
    conditionsBtn: 'Consulter les conditions',
    stat1: 'candidats formés', stat2: 'encadrement personnalisé', stat3: 'support administratif',
    whyTitle: 'Pourquoi choisir GSS ?',
    benefit1: 'Formation reconnue et professionnelle', benefit2: 'Module pratique et théorique',
    benefit3: 'Procédure d\'inscription rapide', benefit4: 'Équipe disponible à chaque étape',
    // ── Modal / tabs ─────────────────────────────────────────
    modalTitle: 'Processus d\'inscription', closeBtn: 'Fermer',
    tabRegistration: 'Inscription', tabConditions: 'Conditions', tabReglement: 'Règlement', tabEngagement: 'Engagement',
    // ── Panel 1 · Registration Form ──────────────────────────
    formTag: 'Formulaire d\'inscription',
    formTitle: 'Candidature GSS',
    formSubtitle: 'Formation des Agents de Sécurité – GSS Security Services',
    formDesc: 'Remplissez ce formulaire avec soin pour finaliser votre inscription et préparer votre parcours de formation.',
    formBadge: 'Sécurisé',
    // sections
    secPersonal: 'INFORMATIONS PERSONNELLES',
    secEducation: 'NIVEAU D\'ÉTUDES ET EXPÉRIENCE',
    secHealth: 'ÉTAT DE SANTÉ',
    secFees: 'FRAIS D\'INSCRIPTION',
    secDecl: 'DÉCLARATION DU CANDIDAT',
    secAdmin: 'PARTIE RÉSERVÉE À L\'ADMINISTRATION',
    // personal labels
    lbDossier: 'N° Dossier', lbDateInscription: 'Date d\'inscription', lbNom: 'Nom complet',
    lbTel1: 'Téléphone (1)', lbTel2: 'Téléphone (2)', lbPere: 'Nom du père', lbMere: 'Nom de la mère',
    lbEmail: 'E-mail', lbDateNaissance: 'Date de naissance', lbLieuNaissance: 'Lieu de naissance',
    lbNationalite: 'Nationalité', lbSexe: 'Sexe', lbEtatCivil: 'État civil', lbAdresse: 'Adresse complète',
    optSelectCountry: 'Sélectionnez votre pays', optSelectCity: 'Sélectionnez votre ville', optSelectCountryFirst: 'Sélectionnez d\'abord le pays',
    optMale: ' Masculin', optFemale: ' Féminin',
    optSingle: ' Célibataire', optMarried: ' Marié(e)', optDivorced: ' Divorcé(e)', optWidowed: ' Veuf(ve)',
    // education labels
    lbNiveauEtudes: 'Niveau d\'études',
    optPrimary: ' Primaire', optSecondary: ' Secondaire', optUniversity: ' Universitaire', optOther: ' Autre',
    lbFrancais: 'Savez-vous lire et écrire en français ?',
    optYes: ' Oui', optNo: ' Non',
    lbExperience: 'Avez-vous une expérience dans le domaine de la sécurité ?',
    lbPrecisionExp: 'Si oui, précisez',
    // health labels
    lbSante: 'Souffrez-vous d\'une maladie pouvant affecter votre travail ?',
    lbPrecisionSante: 'Si oui, précisez',
    lbDocuments: 'DOCUMENTS À FOURNIR',
    docIdCard: ' Copie de la carte d\'identité ou du passeport',
    docPhotos: ' Deux photos d\'identité récentes',
    docOther: ' Autres documents (si nécessaire)',
    // fees + declaration
    feesText: 'Je reconnais être informé(e) du paiement de <span class="font-semibold text-slate-800">25 000 CDF</span> couvrant les frais de syllabus.',
    optPaid: ' Payé', optNotPaid: ' Non payé',
    declText: 'Je certifie que les informations fournies sont exactes et m\'engage à respecter le règlement de la formation.',
    lbCandidatName: 'Nom du candidat', lbSignature: 'Signature', lbDate: 'Date',
    sigHint: 'Signez dans le cadre', sigClear: 'Effacer',
    // admin labels
    lbResultat: 'Résultat de l\'entretien',
    optAccepted: ' Accepté', optRejected: ' Refusé', optPending: ' En attente',
    lbObservations: 'Observations',
    lbResponsable: 'Nom du responsable', lbCachet: 'Signature et cachet',
    btnClear: 'Effacer', btnSubmit: 'Envoyer le formulaire',
    // ── Panel 2 · Conditions ─────────────────────────────────
    condTitle: 'Conditions d\'Inscription',
    condSubtitle: 'Formation des Agents de Sécurité — GSS',
    condDeclTitle: 'Déclaration du candidat',
    condLbNom: 'Nom', condLbDate: 'Date', condLbSig: 'Signature',
    ackConditions: 'J\'ai lu, compris et j\'accepte les <strong>Conditions d\'Inscription</strong> de GSS Security Services.',
    // ── Panel 3 · Règlement ──────────────────────────────────
    reglTitle: 'Règlement Intérieur',
    reglSubtitle: 'Formation des Agents de Sécurité — GSS',
    reglLbNomCandidat: 'Nom du candidat', reglLbDate: 'Date', reglLbSig: 'Signature',
    ackReglement: 'J\'ai lu, compris et j\'accepte le <strong>Règlement Intérieur</strong> de GSS Security Services.',
    // ── Panel 4 · Engagement ─────────────────────────────────
    engTitle: 'Engagement de Confidentialité',
    engSubtitle: 'Protection des Documents Administratifs — GSS',
    engSecIdentity: 'Identité du signataire',
    engLbNom: 'Je soussigné(e)', engLbNaissance: 'Né(e) le',
    engLbTelephone: 'Téléphone', engLbPiece: 'Numéro de la pièce d\'identité',
    engCommitTitle: 'Je m\'engage à :',
    engSecSig: 'Signature',
    engLbFaitA: 'Fait à', engLbLe: 'Le',
    engLbNomComplet: 'Nom complet', engLbSig: 'Signature',
    engLbCachet: 'Signature et cachet de GSS',
    ackEngagement: 'Je m\'engage librement à respecter le présent <strong>Engagement de Confidentialité</strong>, qui prend effet à compter de sa date de signature.',
    // ── Panel 5 · Rapport de Présences ───────────────────────
    tabPresences: 'Présences',
    presTitle: 'Rapport Individuel de Présence',
    presSubtitle: 'Suivi de présence — GSS',
    presSecInfo: 'INFORMATIONS DU CANDIDAT',
    presLbNumCandidat: 'N° Candidat',
    presLbNom: 'Nom et Prénom',
    presLbNumFormation: 'N° Formation',
    presLbIntitule: 'Intitulé de la formation',
    presLbFormateur: 'Formateur',
    presLbPeriodeDu: 'Du',
    presLbPeriodeAu: 'Au',
    presSecTable: 'HISTORIQUE DES PRÉSENCES',
    presColDate: 'Date',
    presColJour: 'Jour',
    presColStatut: 'Statut',
    presColArrivee: 'Heure d\'arrivée',
    presColDepart: 'Heure de départ',
    presColObs: 'Observations',
    presBtnAddRow: 'Ajouter une ligne',
    presBtnRemove: 'Supprimer',
    presSecSummary: 'RÉSUMÉ',
    presLbNbJours: 'Nombre de jours',
    presLbAH: 'Arrivé à l\'heure (AH)',
    presLbAR: 'Arrivé en retard (AR)',
    presLbABS: 'Absent (ABS)',
    presLbEX: 'Exclu (EX)',
    presLbTaux: 'Taux de présence',
    presSecSig: 'SIGNATURES',
    presLbCachet: 'Cachet du Centre de Formation',
    presLbVisa: 'Visa de la Direction',
    ackPresences: 'Je certifie l\'exactitude des informations du présent <strong>Rapport de Présence</strong>.'
  },
  en: {
    // ── Hero / page ──────────────────────────────────────────
    title: 'GSS | Join our security agents',
    eyebrow: 'Professional security',
    heroTitle: 'Join an exceptional training program to become a security officer.',
    heroText: 'A structured path, serious guidance, and a simplified registration process to begin your journey with GSS.',
    openBtn: 'Fill the form', conditionsBtn: 'View terms',
    stat1: 'trainees trained', stat2: 'personalized support', stat3: 'administrative support',
    whyTitle: 'Why choose GSS?',
    benefit1: 'Recognized and professional training', benefit2: 'Practical and theoretical modules',
    benefit3: 'Fast registration process', benefit4: 'A team available at every step',
    // ── Modal / tabs ─────────────────────────────────────────
    modalTitle: 'Application Process', closeBtn: 'Close',
    tabRegistration: 'Registration', tabConditions: 'Conditions', tabReglement: 'Rules', tabEngagement: 'Commitment',
    // ── Panel 1 · Registration Form ──────────────────────────
    formTag: 'Registration Form',
    formTitle: 'GSS Application',
    formSubtitle: 'Security Guard Training – GSS Security Services',
    formDesc: 'Fill out this form carefully to complete your registration and prepare your training journey.',
    formBadge: 'Secure',
    // sections
    secPersonal: 'PERSONAL INFORMATION',
    secEducation: 'EDUCATION LEVEL AND EXPERIENCE',
    secHealth: 'HEALTH STATUS',
    secFees: 'REGISTRATION FEES',
    secDecl: "APPLICANT'S DECLARATION",
    secAdmin: 'FOR ADMINISTRATION USE ONLY',
    // personal labels
    lbDossier: 'File No.', lbDateInscription: 'Registration Date', lbNom: 'Full Name',
    lbTel1: 'Phone (1)', lbTel2: 'Phone (2)', lbPere: "Father's Name", lbMere: "Mother's Name",
    lbEmail: 'Email', lbDateNaissance: 'Date of Birth', lbLieuNaissance: 'Place of Birth',
    lbNationalite: 'Nationality', lbSexe: 'Gender', lbEtatCivil: 'Marital Status', lbAdresse: 'Full Address',
    optSelectCountry: 'Select your country', optSelectCity: 'Select your city', optSelectCountryFirst: 'Select a country first',
    optMale: ' Male', optFemale: ' Female',
    optSingle: ' Single', optMarried: ' Married', optDivorced: ' Divorced', optWidowed: ' Widowed',
    // education labels
    lbNiveauEtudes: 'Education Level',
    optPrimary: ' Primary', optSecondary: ' Secondary', optUniversity: ' University', optOther: ' Other',
    lbFrancais: 'Can you read and write in French?',
    optYes: ' Yes', optNo: ' No',
    lbExperience: 'Do you have experience in the security field?',
    lbPrecisionExp: 'If yes, please specify',
    // health labels
    lbSante: 'Do you suffer from any illness that could affect your work?',
    lbPrecisionSante: 'If yes, please specify',
    lbDocuments: 'REQUIRED DOCUMENTS',
    docIdCard: ' Copy of National ID Card or Passport',
    docPhotos: ' Two Recent Passport Photos',
    docOther: ' Other Documents (if required)',
    // fees + declaration
    feesText: 'I acknowledge that I have been informed of the payment of <span class="font-semibold text-slate-800">25,000 CDF</span> covering the cost of the training syllabus.',
    optPaid: ' Paid', optNotPaid: ' Unpaid',
    declText: 'I certify that the information provided is accurate and undertake to comply with the training regulations.',
    lbCandidatName: "Applicant's Name", lbSignature: 'Signature', lbDate: 'Date',
    sigHint: 'Sign within the box', sigClear: 'Clear',
    // admin labels
    lbResultat: 'Interview Result',
    optAccepted: ' Accepted', optRejected: ' Rejected', optPending: ' Pending',
    lbObservations: 'Remarks',
    lbResponsable: 'Name of the Officer in Charge', lbCachet: 'Signature and Official Stamp',
    btnClear: 'Clear', btnSubmit: 'Submit form',
    // ── Panel 2 · Conditions ─────────────────────────────────
    condTitle: 'Registration Conditions',
    condSubtitle: 'Security Guard Training — GSS',
    condDeclTitle: "Applicant's Declaration",
    condLbNom: 'Name', condLbDate: 'Date', condLbSig: 'Signature',
    ackConditions: 'I have read, understood, and accept the <strong>Registration Conditions</strong> of GSS Security Services.',
    // ── Panel 3 · Règlement ──────────────────────────────────
    reglTitle: 'Internal Regulations',
    reglSubtitle: 'Security Guard Training — GSS',
    reglLbNomCandidat: "Candidate's Name", reglLbDate: 'Date', reglLbSig: 'Signature',
    ackReglement: 'I have read, understood, and accept the <strong>Internal Regulations</strong> of GSS Security Services.',
    // ── Panel 4 · Engagement ─────────────────────────────────
    engTitle: 'Confidentiality Agreement',
    engSubtitle: 'Administrative Document Protection — GSS',
    engSecIdentity: "Signatory's Identity",
    engLbNom: 'I, the undersigned', engLbNaissance: 'Born on',
    engLbTelephone: 'Phone Number', engLbPiece: 'ID Card / Passport Number',
    engCommitTitle: 'I hereby undertake to:',
    engSecSig: 'Signature',
    engLbFaitA: 'Done at', engLbLe: 'Date',
    engLbNomComplet: 'Full Name', engLbSig: 'Signature',
    engLbCachet: 'Signature and GSS Official Stamp',
    ackEngagement: 'I freely undertake to comply with this <strong>Confidentiality Agreement</strong>, which takes effect from the date of signature.',
    // ── Panel 5 · Rapport de Présences ───────────────────────
    tabPresences: 'Attendance',
    presTitle: 'Individual Attendance Report',
    presSubtitle: 'Attendance tracking — GSS',
    presSecInfo: 'CANDIDATE INFORMATION',
    presLbNumCandidat: 'Candidate No.',
    presLbNom: 'Full Name',
    presLbNumFormation: 'Training No.',
    presLbIntitule: 'Training Title',
    presLbFormateur: 'Trainer',
    presLbPeriodeDu: 'From',
    presLbPeriodeAu: 'To',
    presSecTable: 'ATTENDANCE HISTORY',
    presColDate: 'Date',
    presColJour: 'Day',
    presColStatut: 'Status',
    presColArrivee: 'Arrival Time',
    presColDepart: 'Departure Time',
    presColObs: 'Observations',
    presBtnAddRow: 'Add row',
    presBtnRemove: 'Remove',
    presSecSummary: 'SUMMARY',
    presLbNbJours: 'Number of days',
    presLbAH: 'Arrived on time (AH)',
    presLbAR: 'Arrived late (AR)',
    presLbABS: 'Absent (ABS)',
    presLbEX: 'Excluded (EX)',
    presLbTaux: 'Attendance rate',
    presSecSig: 'SIGNATURES',
    presLbCachet: 'Training Centre Stamp',
    presLbVisa: "Director's Visa",
    ackPresences: 'I certify the accuracy of the information in this <strong>Attendance Report</strong>.'
  }
};

const modal = document.getElementById('formModal');
const openFormBtn = document.getElementById('openFormBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const langButtons = Array.from(document.querySelectorAll('[data-lang]')).slice(0, 2); //document.querySelectorAll('[data-lang]');

// ── Tab state ──────────────────────────────────────────────
const tabState = { registration: false, conditions: false, reglement: false, engagement: false, presences: false };

const TAB_ACTIVE_BG   = '#042F8D';
const TAB_DONE_BG     = '#16a34a';
const TAB_PENDING_BG  = '#94a3b8';

const setTabIndicator = (tabId, state) => {
  const dot = document.querySelector(`#tab-btn-${tabId} .gss-tab-dot`);
  const btn = document.getElementById(`tab-btn-${tabId}`);
  if (!dot || !btn) return;
  if (state === 'active') {
    //dot.style.background = TAB_ACTIVE_BG;
    btn.style.borderBottomColor = TAB_ACTIVE_BG;
    btn.style.color = TAB_ACTIVE_BG;
    btn.style.fontWeight = '700';
  } else if (state === 'done') {
    //dot.style.background = TAB_DONE_BG;
    dot.textContent = '✓';
    btn.style.borderBottomColor = tabState[tabId] && currentTab === tabId ? TAB_ACTIVE_BG : 'transparent';
    btn.style.color = '';
    btn.style.fontWeight = '';
  } else {
    dot.style.background = TAB_PENDING_BG;
    btn.style.borderBottomColor = 'transparent';
    btn.style.color = '';
    btn.style.fontWeight = '';
  }
};

let currentTab = 'registration';
let currentLang = 'en';

const switchTab = (tabId) => {
  // Hide all panels, reset all tab styles
  document.querySelectorAll('.gss-tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.gss-tab-btn').forEach(b => {
    b.style.borderBottomColor = 'transparent';
    b.style.color = '';
    b.style.fontWeight = '';
  });

  // Show target panel
  const panel = document.getElementById(`panel-${tabId}`);
  if (panel) panel.classList.remove('hidden');

  // Restore done indicators for all tabs
  Object.keys(tabState).forEach(id => {
    if (tabState[id]) {
      const dot = document.querySelector(`#tab-btn-${id} .gss-tab-dot`);
      if (dot) { dot.style.background = TAB_DONE_BG; dot.textContent = '✓'; }
    } else {
      const dot = document.querySelector(`#tab-btn-${id} .gss-tab-dot`);
      if (dot && !dot.textContent.includes('✓')) dot.style.background = TAB_PENDING_BG;
    }
  });

  // Highlight active tab
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.style.borderBottomColor = TAB_ACTIVE_BG;
    activeBtn.style.color = TAB_ACTIVE_BG;
    activeBtn.style.fontWeight = '700';
    // Active indicator: blue if not done, green-stays if done
    const dot = activeBtn.querySelector('.gss-tab-dot');
    if (dot && !tabState[tabId]) {
      dot.style.background = TAB_ACTIVE_BG;
    }
  }

  // Scroll content to top
  const fc = document.getElementById('formContent');
  if (fc) fc.scrollTop = 0;

  currentTab = tabId;
};

const markTabDone = (tabId) => {
  tabState[tabId] = true;
  const dot = document.querySelector(`#tab-btn-${tabId} .gss-tab-dot`);
  if (dot) { dot.style.background = TAB_DONE_BG; dot.textContent = '✓'; }
};

// ── Modal open/close ───────────────────────────────────────
const openModal = () => {
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('overflow-hidden');
  switchTab('registration');
};

const closeModal = () => {
  if (modal.classList.contains('flex') && document.activeElement && modal.contains(document.activeElement)) {
    openFormBtn.focus();
  }
  modal.classList.remove('flex');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('overflow-hidden');
};

openFormBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);

modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

// ── Tab button clicks ──────────────────────────────────────
document.querySelectorAll('.gss-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Acknowledgment checkboxes (tabs 2, 3, 4) ──────────────
document.querySelectorAll('.gss-ack-check').forEach(checkbox => {
  checkbox.addEventListener('change', () => {
    const tabId = checkbox.dataset.tab;
    if (checkbox.checked) {
      markTabDone(tabId);
    } else {
      tabState[tabId] = false;
      const dot = document.querySelector(`#tab-btn-${tabId} .gss-tab-dot`);
      if (dot) {
        dot.style.background = currentTab === tabId ? TAB_ACTIVE_BG : TAB_PENDING_BG;
        const TAB_NUMS = { registration: '1', conditions: '2', reglement: '3', engagement: '4', presences: '5' };
        dot.textContent = TAB_NUMS[tabId] || '?';
      }
    }
  });
});

// ── Tab 1: mark done on successful form submission ─────────
document.addEventListener('DOMContentLoaded', () => {
  const inscriptionForm = document.getElementById('inscriptionForm');
  if (inscriptionForm) {
    inscriptionForm.addEventListener('submit', () => {
      // Give formulaire-inscription.js time to validate & update status
      setTimeout(() => {
        const status = document.getElementById('formStatus');
        if (status && !status.classList.contains('text-red-600') && status.textContent.trim() !== '') {
          markTabDone('registration');
        }
      }, 100);
    });
  }
});

const applyLanguage = (lang) => {
  document.documentElement.lang = lang;
  document.title = translations[lang].title;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (translations[lang][key]) {
      element.textContent = translations[lang][key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (translations[lang][key]) {
      element.placeholder = translations[lang][key];
    }
  });

  // innerHTML-based translations (for elements containing HTML like <span>)
  document.querySelectorAll('[data-i18n-html]').forEach((element) => {
    const key = element.getAttribute('data-i18n-html');
    if (translations[lang][key]) {
      element.innerHTML = translations[lang][key];
    }
  });

  currentLang = lang;

  // Show/hide language-specific content blocks (FR / EN document panels)
  document.querySelectorAll('.lang-content').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.lang !== lang);
  });

  // Update presences panel language-dependent elements
  if (typeof updatePresStatusOptions === 'function') updatePresStatusOptions();
  if (typeof updatePresDayCells === 'function') updatePresDayCells();

  langButtons.forEach((button) => {
    const isActive = button.getAttribute('data-lang') === lang;
    button.classList.toggle(`bg-[${TAB_ACTIVE_BG}]`, isActive);
    button.classList.toggle('text-white', isActive);
    button.classList.toggle(`text-[${TAB_ACTIVE_BG}]`, !isActive);
    button.classList.toggle('bg-white', !isActive);
  });
};

// ── Panel 5 · Rapport Individuel de Présences — constants ─
const PRES_DAY_NAMES = {
  fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};

const PRES_STATUS_OPTS = {
  fr: [
    { value: 'AH', text: 'AH — À l\'heure' },
    { value: 'AR', text: 'AR — En retard' },
    { value: 'ABS', text: 'ABS — Absent' },
    { value: 'EX', text: 'EX — Exclu' }
  ],
  en: [
    { value: 'AH', text: 'AH — On time' },
    { value: 'AR', text: 'AR — Late' },
    { value: 'ABS', text: 'ABS — Absent' },
    { value: 'EX', text: 'EX — Excluded' }
  ]
};

let presRowCounter = 0;

langButtons.forEach((button) => {
  button.addEventListener('click', () => applyLanguage(button.getAttribute('data-lang')));
});

applyLanguage('en');

// ── Panel 5 · Rapport Individuel de Présences — functions ──

function getPresDayName(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue + 'T00:00:00');
  const names = PRES_DAY_NAMES[currentLang] || PRES_DAY_NAMES.en;
  return names[d.getDay()];
}

function updatePresenceSummary() {
  const rows = document.querySelectorAll('#presences-tbody tr');
  let ah = 0, ar = 0, abs = 0, ex = 0;
  rows.forEach(row => {
    const sel = row.querySelector('.pres-status-select');
    if (!sel) return;
    if (sel.value === 'AH') ah++;
    else if (sel.value === 'AR') ar++;
    else if (sel.value === 'ABS') abs++;
    else if (sel.value === 'EX') ex++;
  });
  const total = rows.length;
  const present = ah + ar;
  const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';

  const el = (id) => document.getElementById(id);
  if (el('pres-nb-jours'))  el('pres-nb-jours').textContent  = total;
  if (el('pres-count-ah'))  el('pres-count-ah').textContent  = ah;
  if (el('pres-count-ar'))  el('pres-count-ar').textContent  = ar;
  if (el('pres-count-abs')) el('pres-count-abs').textContent = abs;
  if (el('pres-count-ex'))  el('pres-count-ex').textContent  = ex;
  if (el('pres-taux'))      el('pres-taux').textContent      = rate + ' %';
}

function updatePresStatusOptions() {
  const opts = PRES_STATUS_OPTS[currentLang] || PRES_STATUS_OPTS.en;
  document.querySelectorAll('.pres-status-select').forEach(sel => {
    const currentVal = sel.value;
    sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
    sel.value = currentVal;
  });
}

function updatePresDayCells() {
  document.querySelectorAll('#presences-tbody tr').forEach(row => {
    const dateInput = row.querySelector('.pres-date-input');
    const dayCell   = row.querySelector('.pres-day-cell');
    if (dateInput && dayCell && dateInput.value) {
      dayCell.value = getPresDayName(dateInput.value);
    }
  });
}

function addPresenceRow() {
  presRowCounter++;
  const tbody = document.getElementById('presences-tbody');
  if (!tbody) return;

  const opts = PRES_STATUS_OPTS[currentLang] || PRES_STATUS_OPTS.en;
  const optsHTML = opts.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
  const inputCls = 'w-full rounded-xl border-[1.5px] border-[#dbe2f0] bg-white px-2 py-1.5 text-sm text-slate-800 transition focus:border-[#042F8D] focus:outline-none focus:ring-4 focus:ring-[#042F8D]/10';
  const removeLbl = translations[currentLang]?.presBtnRemove || 'Remove';

  const tr = document.createElement('tr');
  tr.className = 'border-b border-slate-100 hover:bg-slate-50/50';
  tr.innerHTML = `
    <td class="p-2 align-middle">
      <input type="date" class="pres-date-input ${inputCls} min-w-[130px]" />
    </td>
    <td class="p-2 align-middle">
      <input type="text" readonly class="pres-day-cell ${inputCls} min-w-[100px] cursor-default bg-slate-50 text-slate-500" />
    </td>
    <td class="p-2 align-middle">
      <select class="pres-status-select ${inputCls} min-w-[150px]">${optsHTML}</select>
    </td>
    <td class="p-2 align-middle">
      <input type="time" class="pres-arrival-input ${inputCls} min-w-[110px]" />
    </td>
    <td class="p-2 align-middle">
      <input type="time" class="pres-depart-input ${inputCls} min-w-[110px]" />
    </td>
    <td class="p-2 align-middle">
      <input type="text" class="pres-obs-input ${inputCls} min-w-[130px]" />
    </td>
    <td class="p-2 align-middle text-center">
      <button type="button" class="pres-remove-btn inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-100">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        <span data-i18n="presBtnRemove">${removeLbl}</span>
      </button>
    </td>`;

  // Auto-fill day name when date is picked
  const dateInput = tr.querySelector('.pres-date-input');
  const dayCell   = tr.querySelector('.pres-day-cell');
  dateInput.addEventListener('change', () => {
    dayCell.value = getPresDayName(dateInput.value);
    updatePresenceSummary();
  });

  tr.querySelector('.pres-status-select').addEventListener('change', updatePresenceSummary);

  tr.querySelector('.pres-remove-btn').addEventListener('click', () => {
    tr.remove();
    updatePresenceSummary();
  });

  tbody.appendChild(tr);
  updatePresenceSummary();
}

// Wire up add-row button and add one initial row
(function initPresencesPanel() {
  const addRowBtn = document.getElementById('pres-add-row-btn');
  if (addRowBtn) addRowBtn.addEventListener('click', addPresenceRow);
  addPresenceRow(); // start with one empty row
}());
