// @ts-check
/// <reference path="../global.js" />
/// <reference path="../modules/attendance.js" />

// Tab indicator classes (TAB_ACTIVE_BORDER, TAB_DONE_BG, …) and
// GSS_LANG_KEY now live in js/global.js, which loads before this file.

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
    psTitle: 'Rechercher', psAllPanels: 'Tous les panneaux', psSearchPlaceholder: 'Rechercher une info dans le panneau sélectionné…', noPanelFound: 'Aucun résultat',
    psGrid: 'Grille', psGridTitle: 'Panneaux et filtres', psGridExport: 'Exporter vers Excel', psSortHint: 'Cliquer pour trier',
    psGridChoose: 'Choisir un panneau', psGridChoosePlaceholder: 'Choisir un panneau…', psGridSearchPanel: 'Rechercher un panneau…', psApplicant: 'Candidat',
    psGridPick: 'Sélectionnez un panneau pour afficher sa grille de données.',
    psColSection: 'Section', psColInfo: 'Information', psColType: 'Type', psFilter: 'Filtrer',
    psTypeSection: 'Section', psTypeField: 'Champ', psTypeItem: 'Élément', psTypeText: 'Texte',
    // ── Grid column customizer + applicant grid ──────────────
    psColsBtn: 'Colonnes', psColsTitle: 'Personnaliser les colonnes', psColsReset: 'Réinitialiser',
    psColsHint: 'Glissez les colonnes entre les listes pour les afficher ou les masquer, et réordonnez les colonnes affichées par glisser-déposer.',
    psColsAvailable: 'Colonnes disponibles', psColsDisplayed: 'Colonnes affichées', psColsApply: 'Appliquer',
    psGridLoading: 'Chargement…', psGridError: 'Impossible de charger les données. Le serveur est-il démarré ?', psGridNoData: 'Aucun enregistrement trouvé.',
    psGridNoTable: 'Aucune table de données n\'est associée à ce panneau pour le moment.',
    psSearchNoTable: 'Aucune table de données n\'est associée à ce panneau.',
    gcCandidateNo: 'N° Candidat', gcFullName: 'Nom complet', gcRegistrationDate: 'Date d\'inscription',
    gcNationality: 'Nationalité', gcPlaceOfBirth: 'Lieu de naissance', gcGender: 'Sexe',
    gcDateOfBirth: 'Date de naissance', gcPhone1: 'Téléphone (1)', gcPhone2: 'Téléphone (2)', gcEmail: 'Email',
    gcFatherName: 'Nom du père', gcMotherName: 'Nom de la mère', gcMaritalStatus: 'État civil',
    gcEducationLevel: 'Niveau d\'études', gcFullAddress: 'Adresse complète', gcIdPassNo: 'N° carte / passeport', gcInterviewResult: 'Résultat entretien', gcIsPaid: 'Paiement (25 000 CDF)',
    gcIsFrenchLiterate: 'Sait lire et écrire en français ?', gcHasSecurityExperience: 'Expérience dans la sécurité ?', gcHasHealthIssues: 'Souffre d\'une maladie ?', gcRemarks: 'Observations',
    // ── Signature manager ────────────────────────────────────
    sigBtn: 'Signatures', sigTitle: 'Signatures', sigNew: 'Ajouter une signature',
    sigLbName: 'Nom de la signature', sigLbSignature: 'Signature', sigUpload: 'Importer une image',
    sigSaveBtn: 'Enregistrer', sigSaved: 'Signatures enregistrées', sigRefresh: 'Actualiser', sigNone: 'Aucune signature enregistrée.',
    sigSavedOk: 'Signature enregistrée.', sigSaving: 'Enregistrement…', sigImgReady: 'Image prête — ajoutez un nom puis enregistrez.',
    sigErrName: 'Le nom de la signature est requis.', sigErrDraw: 'Dessinez ou importez d\'abord une signature.',
    sigErrImage: 'Veuillez choisir un fichier image.', sigErrSave: 'Impossible d\'enregistrer la signature.',
    sigLoadErr: 'Impossible de charger les signatures. Le serveur est-il démarré ?', sigUnnamed: 'Signature',
    sigSearchPlaceholder: 'Rechercher des signatures…', sigMore: 'Affichage des 10 premières — saisissez pour rechercher toutes les signatures.', sigNoMatch: 'Aucune signature ne correspond à votre recherche.',
    sigOfficer: 'Formateur', sigOfficerHint: 'Désigner cette signature comme celle du Formateur.', sigOfficerLocked: 'Un Formateur a déjà été désigné et ne peut plus être modifié.', sigOfficerNone: 'Aucune signature du Formateur enregistrée',
    sigDelete: 'Supprimer', sigDeletedOk: 'Signature supprimée.', sigErrDelete: 'Impossible de supprimer la signature.', confirmDeleteSignature: 'Supprimer cette signature ? Cette action est irréversible.',
    confirmConditions: 'Êtes-vous sûr de vouloir accepter les Conditions d\'inscription ?',
    confirmRules: 'Êtes-vous sûr de vouloir accepter le Règlement intérieur ?',
    confirmCommitment: 'Êtes-vous sûr de vouloir accepter l\'Engagement de confidentialité ?',
    psColEdit: 'Modifier',
    dictManage: 'Gestion du dictionnaire', dictTitle: 'Gestion du dictionnaire', dictEduTitle: 'Niveaux d\'études',
    dictLbValue: 'Valeur', dictLbFrValue: 'Valeur (français)', dictLbEnValue: 'Valeur (anglais)', dictSaveBtn: 'Enregistrer', dictUpdateBtn: 'Mettre à jour', dictCancelBtn: 'Annuler',
    dictSavedValues: 'Valeurs enregistrées', dictNone: 'Aucune valeur pour le moment.', dictEdit: 'Modifier', dictDelete: 'Supprimer',
    dictSaving: 'Enregistrement…', dictSavedOk: 'Valeur enregistrée.', dictDeletedOk: 'Valeur supprimée.',
    dictErrValue: 'Une valeur est requise.', dictErrFrValue: 'La valeur en français est requise.', dictErrEnValue: 'La valeur en anglais est requise.', dictErrSave: 'Impossible d\'enregistrer la valeur.', dictErrDelete: 'Impossible de supprimer la valeur.',
    dictConfirmDelete: 'Supprimer cette valeur ? Cette action est irréversible.', dictLoadErr: 'Impossible de charger les valeurs. Le serveur est-il démarré ?',
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
    lbDossier: 'N° Candidat', lbDateInscription: 'Date d\'inscription', lbNom: 'Nom complet',
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
    lbHeader: 'Service de Gardiennage et de Sécurité',
    lbHeaderName: 'Centre de formation',
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
    engLbFaitA: 'Fait à', engLbLe: 'Date',
    engLbNomComplet: 'Nom du candidat', engLbSig: 'Signature',
    engLbCachet: 'Signature et cachet de GSS',
    ackEngagement: 'Je m\'engage librement à respecter le présent <strong>Engagement de Confidentialité</strong>, qui prend effet à compter de sa date de signature.',
    condBody: `<p class="text-sm leading-7 text-slate-600">GSS Security Services annonce l'ouverture des inscriptions à la formation des agents de sécurité. Tout candidat souhaitant participer doit remplir les conditions suivantes.</p>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">A. Conditions d'inscription</h4>
        <ul class="space-y-2">
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Être de bonne moralité et avoir une bonne conduite.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Être âgé(e) d'au moins 18 ans.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Être physiquement et médicalement apte.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Ne pas avoir de condamnation incompatible avec la fonction.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Réussir l'entretien de sélection.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Fournir une pièce d'identité valide.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Fournir deux photos d'identité récentes.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Remplir le formulaire d'inscription.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Savoir lire et écrire en français.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Respecter le règlement de la formation.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Payer <strong>25 000 CDF</strong> pour les frais de syllabus.</li>
        </ul>
        <p class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">L'inscription est définitive après dépôt des documents et paiement. Les candidats qui réussissent l'examen final seront éligibles à un emploi d'agent de sécurité au sein de GSS, selon les besoins de recrutement de l'entreprise.</p>
      </section>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">B. Obligations du candidat</h4>
        <ul class="space-y-2">
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Respecter les formateurs et le règlement.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Assurer une présence régulière.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Préserver la confidentialité des informations de l'entreprise.</li>
        </ul>
      </section>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">C. Absences et exclusion</h4>
        <ul class="space-y-2">
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">!</span>Toute absence de trois (3) jours consécutifs sans justification valable entraîne l'exclusion définitive sans remboursement.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">!</span>GSS se réserve le droit d'exclure tout candidat ayant un comportement inapproprié.</li>
        </ul>
      </section>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">D. Évaluation finale</h4>
        <ul class="space-y-2">
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Évaluation théorique et pratique.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Les décisions du jury sont définitives.</li>
        </ul>
      </section>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">E. Opportunité d'emploi</h4>
        <p class="text-sm leading-7 text-slate-600">La réussite à l'examen final permet au candidat d'être considéré parmi les candidats éligibles au recrutement, selon les besoins de l'entreprise.</p>
      </section>`,
    reglBody: `<div class="grid gap-3">
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 1 — Objet</h4><p class="text-sm leading-6 text-slate-600">Le présent règlement intérieur a pour objet de définir les règles d'organisation, de discipline et de fonctionnement de la formation.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 2 — Respect des horaires</h4><p class="text-sm leading-6 text-slate-600">Les candidats sont tenus de respecter les horaires fixés.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 3 — Présence obligatoire</h4><p class="text-sm leading-6 text-slate-600">La présence à tous les cours et évaluations est obligatoire.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 4 — Tenue vestimentaire</h4><p class="text-sm leading-6 text-slate-600">Le port d'une chemise blanche ou d'un polo blanc sans inscription, logo ou graffiti, accompagné d'un pantalon noir, est obligatoire pendant toute la durée de la prestation.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 5 — Discipline</h4><p class="text-sm leading-6 text-slate-600">Les candidats doivent respecter les formateurs et les autres participants.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 6 — Téléphone</h4><p class="text-sm leading-6 text-slate-600">L'utilisation du téléphone est interdite pendant les cours.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 7 — Confidentialité</h4><p class="text-sm leading-6 text-slate-600">Les candidats doivent préserver la confidentialité des informations de GSS.</p></div>
        <div class="rounded-[14px] border border-amber-100 bg-amber-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-amber-800">Article 8 — Absences</h4><p class="text-sm leading-6 text-amber-900">Trois absences consécutives non justifiées entraînent l'exclusion définitive sans remboursement.</p></div>
        <div class="rounded-[14px] border border-amber-100 bg-amber-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-amber-800">Article 9 — Faute grave</h4><p class="text-sm leading-6 text-amber-900">Toute faute grave peut entraîner une exclusion immédiate.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 10 — Matériel</h4><p class="text-sm leading-6 text-slate-600">Les équipements doivent être utilisés avec soin.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 11 — Sanctions</h4><p class="text-sm leading-6 text-slate-600">Avertissement verbal, avertissement écrit, exclusion temporaire ou exclusion définitive.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 12 — Pouvoir de décision</h4><p class="text-sm leading-6 text-slate-600">La Direction se réserve le droit de prendre toute décision nécessaire.</p></div>
      </div>`,
    engBody: `<p class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">Reconnais avoir reçu ou avoir accès à certains documents et données administratives appartenant à <strong>GSS Security Services</strong>.</p>
      <section class="mt-4">
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">Je m'engage à :</h4>
        <ol class="space-y-3">
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">1</span><span class="text-sm leading-6 text-slate-700">Préserver la confidentialité de tous les documents administratifs, dossiers, données, formulaires et informations mis à ma disposition.</span></li>
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">2</span><span class="text-sm leading-6 text-slate-700">Ne pas remettre, partager, copier, reproduire, photographier ou transmettre ces documents à une tierce personne sans autorisation écrite préalable de GSS Security Services.</span></li>
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">3</span><span class="text-sm leading-6 text-slate-700">Utiliser ces documents uniquement dans le cadre autorisé par l'entreprise.</span></li>
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">4</span><span class="text-sm leading-6 text-slate-700">Protéger les informations contre toute perte, divulgation ou utilisation non autorisée.</span></li>
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">5</span><span class="text-sm leading-6 text-slate-700">Restituer immédiatement tout document appartenant à l'entreprise à la demande de celle-ci.</span></li>
        </ol>
      </section>
      <div class="mt-4 rounded-[14px] border border-amber-100 bg-amber-50 p-4 text-sm leading-7 text-amber-900">Je reconnais qu'en cas de violation du présent engagement, GSS Security Services se réserve le droit d'engager toute procédure administrative ou judiciaire nécessaire conformément aux lois en vigueur, ainsi que de réclamer réparation pour tout préjudice subi.</div>`,
    presLegend: '<span class="font-semibold text-[#042F8D]">AH</span> = À l\'heure &nbsp;·&nbsp; <span class="font-semibold text-amber-600">AR</span> = En retard &nbsp;·&nbsp; <span class="font-semibold text-red-600">ABS</span> = Absent &nbsp;·&nbsp; <span class="font-semibold text-slate-700">EX</span> = Exclu',
    evalLegend: '<span class="font-semibold text-[#042F8D]">TB</span> = Très Bien (≥80%) &nbsp;·&nbsp; <span class="font-semibold text-green-600">B</span> = Bien (65–79%) &nbsp;·&nbsp; <span class="font-semibold text-amber-600">AB</span> = Assez Bien (50–64%) &nbsp;·&nbsp; <span class="font-semibold text-red-600">I</span> = Insuffisant (&lt;50%)',
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
    ackPresences: 'Je certifie l\'exactitude des informations du présent <strong>Rapport de Présence</strong>.',
    // ── Panel 6 · Fiche d'Évaluation Individuelle ────────────
    tabEvaluation: 'Évaluation',
    evalTitle: "Fiche d'Évaluation Individuelle",
    evalSubtitle: 'Évaluation des compétences — GSS',
    evalSecInfo: 'INFORMATIONS DU CANDIDAT',
    evalLbNumCandidat: 'N° Candidat',
    evalLbNom: 'Nom et Prénom',
    evalLbNumFormation: 'N° Formation',
    evalLbIntitule: 'Intitulé de la formation',
    evalLbFormateur: 'Formateur',
    evalLbDate: "Date d'évaluation",
    evalSecGrid: "GRILLE D'ÉVALUATION",
    evalColModule: 'Module / Matière',
    evalColNoteMax: 'Note max',
    evalColNoteObt: 'Note obtenue',
    evalSubj1: 'Présence et discipline',
    evalSubj2: 'Ponctualité',
    evalSubj3: 'Respect des consignes',
    evalSubj4: 'Présentation professionnelle',
    evalSubj5: 'Communication en français',
    evalSubj6: "Capacité d'observation",
    evalSubj7: 'Aptitude physique',
    evalSubj8: 'Examen théorique',
    evalSecSummary: 'RÉSUMÉ',
    evalLbTotalMax: 'Total max',
    evalLbTotalObt: 'Total obtenu',
    evalLbResultCat: 'Résultat',
    evalOptExcellent: 'Excellent (85-100)',
    evalOptVeryGood: 'Très Bon (70-84)',
    evalOptAcceptable: 'Acceptable (60-69)',
    evalOptNotRecommended: 'Non recommandé (<60)',
    evalSecResult: 'RÉSULTAT FINAL',
    evalLbResultat: 'Décision finale',
    evalOptRecommande: 'Recommandé pour recrutement',
    evalOptAttente: "Liste d'attente",
    evalOptNonRecommande: 'Non recommandé',
    evalLbObsGen: 'Observations générales',
    evalSecSig: 'SIGNATURES',
    evalLbSigFormateur: 'Formateur',
    evalLbSigResponsable: 'Responsable / Directeur',
    ackEvaluation: "Je certifie l'exactitude des informations de la présente <strong>Fiche d'Évaluation</strong>.",
    // ── Panel 7 · Résultat Individuel de l'Examen ─────────────
    tabExam: 'Examen',
    examTitle: "Résultat Individuel de l'Examen",
    examSubtitle: 'Centre de Formation — GSS',
    examSecInfo: 'INFORMATIONS DU CANDIDAT',
    examLbNumCandidat: 'N° Candidat',
    examLbNumFormation: 'N° Formation',
    examLbNom: 'Nom et Prénom',
    examLbIntitule: 'Intitulé de la formation',
    examLbDate: "Date de l'examen",
    examLbFormateur: 'Formateur',
    examSecResult: "RÉSULTAT DE L'EXAMEN",
    examColElement: 'Élément',
    examColResultat: 'Résultat',
    examLbNoteObtenue: 'Note obtenue',
    examLbResultat: 'Résultat',
    examOptReussi: ' Réussi',
    examOptEchec: ' Échec',
    examLbDecision: 'Décision',
    examOptRecommande: ' Recommandé pour recrutement',
    examOptAttente: " Liste d'attente",
    examOptNonRecommande: ' Non recommandé',
    examSecObs: 'OBSERVATIONS DU FORMATEUR',
    examLbObs: 'Observations…',
    examSecValidation: 'VALIDATION',
    examLbCachet: 'Cachet du Centre de Formation',
    examLbVisa: 'Visa de la Direction',
    ackExam: "Je certifie l'exactitude des informations du présent <strong>Résultat d'Examen</strong>.",
    // ── Panel 8 · Fiche de Mensuration et Informations Complémentaires ──
    tabMensuration: 'Mensuration',
    measTitle: 'Fiche de Mensuration et Informations Complémentaires',
    measSubtitle: 'Dossier individuel — GSS',
    measSecInfo: 'A. INFORMATIONS DU CANDIDAT',
    measLbNumCandidat: 'N° Candidat',
    measLbNumFormation: 'N° Formation',
    measLbNom: 'Nom et Prénom',
    measLbDate: 'Date',
    measSecMens: 'B. MENSURATIONS',
    measColDesignation: 'Désignation',
    measColValeur: 'Valeur',
    measLbTaille: 'Taille (cm)',
    measLbPoids: 'Poids (kg)',
    measLbPointure: 'Pointure',
    measLbChemise: 'Taille de chemise',
    measLbPantalon: 'Taille du pantalon',
    measLbVeste: 'Taille de veste (si applicable)',
    measSecMedical: 'C. INFORMATIONS MÉDICALES',
    measColInfo: 'Information',
    measLbGroupeSanguin: 'Groupe sanguin',
    measLbAllergies: 'Allergies connues',
    measLbObsMedicales: 'Observations médicales particulières',
    measSecUrgence: "D. PERSONNE À CONTACTER EN CAS D'URGENCE",
    measLbUrgenceNom: 'Nom et Prénom',
    measLbUrgenceLien: 'Lien de parenté',
    measLbUrgenceTel: 'Téléphone',
    measLbUrgenceAdresse: 'Adresse',
    measSecObs: 'E. OBSERVATIONS',
    measSecValidation: 'F. VALIDATION',
    measLbCachet: 'Cachet du Centre de Formation',
    measNbText: 'NB : Cette fiche est établie après l’admission du candidat à la formation. Les informations recueillies sont utilisées exclusivement pour la gestion administrative, la préparation des effets d’uniforme, la sécurité du personnel et la constitution du dossier individuel du candidat.',
    ackMensuration: "Je certifie l'exactitude des informations de la présente <strong>Fiche de Mensuration</strong>.",
    // ── Panel 9 · Lettre d'Engagement avec Période d'Essai ──
    tabLettre: "Lettre d'Engagement",
    lettreTitle: "Lettre d'Engagement avec Période d'Essai",
    lettreSubtitle: 'GSS Security Services',
    lettreObjet: "Objet\u00a0: Proposition d'engagement avec période d'essai",
    lettreSecDestinataire: 'DESTINATAIRE',
    lettreLbNom: 'Monsieur / Madame',
    lettreLbAdresse: 'Adresse',
    lettreLbTel: 'Téléphone',
    lettreLbNumCandidat: 'N° Candidat',
    lettreBodyP1: "À la suite de votre réussite à la formation des agents de sécurité organisée par GSS Security Services et après évaluation favorable de votre dossier, nous avons le plaisir de vous informer que vous êtes retenu(e) pour intégrer notre entreprise en qualité d'Agent de Sécurité.",
    lettreBodyP2Intro: "Votre engagement débute par une période d'essai d'une durée de\u00a0:",
    lettreDuree1m: ' Un (1) mois',
    lettreDuree2m: ' Deux (2) mois',
    lettreDuree3m: ' Trois (3) mois',
    lettreBodyP3: "Durant cette période, votre comportement, votre discipline, votre ponctualité, votre aptitude professionnelle ainsi que votre capacité à accomplir les missions confiées feront l'objet d'une évaluation continue.",
    lettreBodyP4: "À l'issue de cette période d'essai, et si les résultats sont jugés satisfaisants par la Direction Générale, votre engagement pourra être confirmé par un contrat de travail.",
    lettreBodyP5: "GSS Security Services se réserve le droit de mettre fin à la période d'essai en cas d'insuffisance professionnelle, de faute disciplinaire grave ou de non-respect du règlement intérieur.",
    lettreSecAffectation: 'AFFECTATION',
    lettreLbDatePrise: 'Date de prise de fonction',
    lettreLbLieu: "Lieu d'affectation",
    lettreSecAcceptation: 'ACCEPTATION DU CANDIDAT',
    lettreLbCandidatNom: 'Nom et Prénom',
    lettreLbCandidatSig: 'Signature du candidat',
    lettreLbCandidatDate: 'Date',
    lettreSecDirection: 'DIRECTION GÉNÉRALE',
    lettreLbDirectionSign: 'Guarde Security Service — Direction Générale',
    ackLettre: "J'ai pris connaissance et j'accepte les termes de la présente <strong>Lettre d'Engagement avec Période d'Essai</strong>.",
    // ── Panel 10 · Engagement de Remise des Effets d'Uniforme ──
    tabUniforme: 'Uniforme',
    uniformeTitle: "Engagement de Remise des Effets d'Uniforme et Autorisation de Retenue Salariale",
    uniformeSubtitle: 'Guarde Security Service',
    uniformeIntro: 'Je soussigné(e),',
    uniformeSecAgent: "IDENTIFICATION DE L'AGENT",
    uniformeLbNom: 'Nom et Prénom',
    uniformeLbCni: "N° de la pièce d'identité",
    uniformeLbFonction: 'Fonction',
    uniformeSecEquip: 'ÉQUIPEMENTS REMIS',
    uniformeEquipIntro: 'Déclare avoir reçu de GSS Security Services les équipements suivants\u00a0:',
    uniformeOptUniforme: 'Uniforme',
    uniformeOptCasquette: 'Casquette',
    uniformeOptChaussures: 'Chaussures',
    uniformeOptCeinture: 'Ceinture',
    uniformeOptBadge: "Badge d'identification",
    uniformeOptAutres: 'Autres',
    uniformeLbValeur: 'Valeur totale des équipements',
    uniformeBodyP1: "Je reconnais que ces équipements représentent une valeur financière supportée par l'entreprise.",
    uniformeBodyP2: "J'autorise GSS Security Services à effectuer une retenue mensuelle sur mon salaire selon le montant convenu entre les deux parties jusqu'au remboursement complet.",
    uniformeLbRetenue: 'Montant de la retenue mensuelle',
    uniformeBodyP3: "Je m'engage à prendre soin des équipements remis et à les restituer en cas de cessation de mes fonctions conformément au règlement interne.",
    uniformeLbFaitA: 'Fait à',
    uniformeLbLe: 'Date',
    uniformeSecSign: 'SIGNATURES',
    uniformeLbSignAgent: "Signature de l'Agent",
    uniformeLbSignDirection: 'Direction Générale',
    ackUniforme: "Je reconnais avoir reçu les équipements listés et j'accepte les termes du présent <strong>Engagement de Remise des Effets d'Uniforme</strong>.",
    // ── Panel 11 · Dossier Individuel du Candidat ──
    tabDossier: 'Dossier',
    dossierTitle: 'Dossier Individuel du Candidat',
    dossierSubtitle: 'Centre de Formation — Guarde Security Service',
    dossierSec1: '1. INFORMATIONS GÉNÉRALES',
    dossierLbNumCandidat: 'N° Candidat',
    dossierLbNumFormation: 'N° Formation',
    dossierLbIntitule: 'Intitulé de la formation',
    dossierLbNom: 'Nom et Prénom',
    dossierLbTel: 'Téléphone',
    dossierLbDateDebut: 'Date de début',
    dossierLbDateFin: 'Date de fin',
    dossierLbObs: 'Observations',
    dossierSec2: '2. LISTE DE VÉRIFICATION DES DOCUMENTS',
    dossierColDoc: 'Document',
    dossierColPresent: 'Présent (✓)',
    dossierCat1: '1. Documents administratifs',
    dossierDoc11: "Formulaire d'inscription",
    dossierDoc12: "Conditions d'inscription signées",
    dossierDoc13: "Copie de la pièce d'identité",
    dossierDoc14: "Deux photos d'identité",
    dossierDoc15: 'Curriculum Vitae (si requis)',
    dossierDoc16: 'Casier judiciaire (si requis)',
    dossierDoc17: 'Certificat médical (si requis)',
    dossierCat2: '2. Formation',
    dossierDoc21: 'Fiche de mensuration',
    dossierDoc22: 'Règlement intérieur signé',
    dossierDoc23: 'Engagement de confidentialité',
    dossierDoc24: 'Liste de présence',
    dossierDoc25: 'Rapport(s) disciplinaire(s) (si applicable)',
    dossierCat3: '3. Évaluations',
    dossierDoc31: "Fiche d'évaluation individuelle",
    dossierDoc32: "Résultat de l'examen final",
    dossierDoc33: 'Décision finale',
    dossierCat4: '4. Recrutement',
    dossierDoc41: "Lettre d'engagement",
    dossierDoc42: "Engagement de remise des effets d'uniforme",
    dossierDoc43: 'Autres documents',
    ackDossier: "Je certifie l'exactitude des informations et la complétude du présent <strong>Dossier Individuel du Candidat</strong>."
  },
  en: {
    // ── Hero / page ──────────────────────────────────────────
    title: 'GSS | Join our security agents',
    eyebrow: 'Professional security',
    heroTitle: 'Join an exceptional training program to become a security officer.',
    heroText: 'A structured1 path, serious guidance, and a simplified registration process to begin your journey with GSS.',
    openBtn: 'Fill the form', conditionsBtn: 'View terms',
    stat1: 'trainees trained', stat2: 'personalized support', stat3: 'administrative support',
    whyTitle: 'Why choose GSS?',
    benefit1: 'Recognized and professional training', benefit2: 'Practical and theoretical modules',
    benefit3: 'Quick registration process', benefit4: 'Team available at every step',
    // ── Modal / tabs ─────────────────────────────────────────
    modalTitle: 'Application Process', closeBtn: 'Close',
    psTitle: 'Find in form', psAllPanels: 'All panels', psSearchPlaceholder: 'Search any info in the selected panel…', noPanelFound: 'No results found',
    psGrid: 'Grid', psGridTitle: 'Panels & filters', psGridExport: 'Export to Excel', psSortHint: 'Click to sort',
    psGridChoose: 'Select a panel', psGridChoosePlaceholder: 'Choose a panel…', psGridSearchPanel: 'Search panel…', psApplicant: 'Applicant',
    psGridPick: 'Select a panel to display its data grid.',
    psColSection: 'Section', psColInfo: 'Information', psColType: 'Type', psFilter: 'Filter',
    psTypeSection: 'Section', psTypeField: 'Field', psTypeItem: 'Item', psTypeText: 'Text',
    // ── Grid column customizer + applicant grid ──────────────
    psColsBtn: 'Columns', psColsTitle: 'Customize columns', psColsReset: 'Reset',
    psColsHint: 'Drag columns between the lists to show or hide them, and reorder the displayed columns by dragging.',
    psColsAvailable: 'Available columns', psColsDisplayed: 'Displayed columns', psColsApply: 'Apply',
    psGridLoading: 'Loading…', psGridError: 'Could not load data. Is the server running?', psGridNoData: 'No records found.',
    psGridNoTable: 'No data table is associated with this panel yet.',
    psSearchNoTable: 'No data table is associated with this panel.',
    gcCandidateNo: 'Candidate No.', gcFullName: 'Full Name', gcRegistrationDate: 'Registration Date',
    gcNationality: 'Nationality', gcPlaceOfBirth: 'Place of Birth', gcGender: 'Gender',
    gcDateOfBirth: 'Date of Birth', gcPhone1: 'Phone (1)', gcPhone2: 'Phone (2)', gcEmail: 'Email',
    gcFatherName: "Father's Name", gcMotherName: "Mother's Name", gcMaritalStatus: 'Marital Status',
    gcEducationLevel: 'Education Level', gcFullAddress: 'Full Address', gcIdPassNo: 'Card ID / Passport No.', gcInterviewResult: 'Interview Result', gcIsPaid: 'Payment (25,000 CDF)',
    gcIsFrenchLiterate: 'Can read and write in French?', gcHasSecurityExperience: 'Has security experience?', gcHasHealthIssues: 'Has a health condition?', gcRemarks: 'Remarks',
    // ── Signature manager ────────────────────────────────────
    sigBtn: 'Signatures', sigTitle: 'Signatures', sigNew: 'Add a signature',
    sigLbName: 'Signature Name', sigLbSignature: 'Signature', sigUpload: 'Upload an image',
    sigSaveBtn: 'Save signature', sigSaved: 'Saved signatures', sigRefresh: 'Refresh', sigNone: 'No signatures saved yet.',
    sigSavedOk: 'Signature saved.', sigSaving: 'Saving…', sigImgReady: 'Image ready — add a name and save.',
    sigErrName: 'A signature name is required.', sigErrDraw: 'Draw or upload a signature first.',
    sigErrImage: 'Please choose an image file.', sigErrSave: 'Could not save the signature.',
    sigLoadErr: 'Could not load signatures. Is the server running?', sigUnnamed: 'Signature',
    sigSearchPlaceholder: 'Search signatures…', sigMore: 'Showing the first 10 — type to search all signatures.', sigNoMatch: 'No signatures match your search.',
    sigOfficer: 'Training Officer', sigOfficerHint: 'Designate this signature as the Training Officer.', sigOfficerLocked: 'A Training Officer has already been designated and can no longer be changed.', sigOfficerNone: 'No Training Officer signature on file',
    sigDelete: 'Delete', sigDeletedOk: 'Signature deleted.', sigErrDelete: 'Could not delete the signature.', confirmDeleteSignature: 'Delete this signature? This action cannot be undone.',
    confirmConditions: 'Are you sure you want to accept the Registration Conditions?',
    confirmRules: 'Are you sure you want to accept the Internal Regulations?',
    confirmCommitment: 'Are you sure you want to accept the Confidentiality Agreement?',
    psColEdit: 'Edit',
    dictManage: 'Dictionary Management', dictTitle: 'Dictionary Management', dictEduTitle: 'Education Levels',
    dictLbValue: 'Value', dictLbFrValue: 'French value', dictLbEnValue: 'English value', dictSaveBtn: 'Save', dictUpdateBtn: 'Update', dictCancelBtn: 'Cancel',
    dictSavedValues: 'Saved values', dictNone: 'No values yet.', dictEdit: 'Edit', dictDelete: 'Delete',
    dictSaving: 'Saving…', dictSavedOk: 'Value saved.', dictDeletedOk: 'Value deleted.',
    dictErrValue: 'A value is required.', dictErrFrValue: 'The French value is required.', dictErrEnValue: 'The English value is required.', dictErrSave: 'Could not save the value.', dictErrDelete: 'Could not delete the value.',
    dictConfirmDelete: 'Delete this value? This action cannot be undone.', dictLoadErr: 'Could not load values. Is the server running?',
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
    lbDossier: 'Candidate No.', lbDateInscription: 'Registration Date', lbNom: 'Full Name',
    lbTel1: 'Phone (1)', lbTel2: 'Phone (2)', lbPere: "Father's Name", lbMere: "Mother's Name",
    lbEmail: 'Email', lbDateNaissance: 'Date of Birth', lbLieuNaissance: 'Place of Birth',
    lbNationalite: 'Nationality', lbSexe: 'Gender', lbEtatCivil: 'Marital Status', lbAdresse: 'Full Address',
    optSelectCountry: '', optSelectCity: 'Select your city', optSelectCountryFirst: 'Select a Nationality first',
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
    // ── Panel 3 · Rules ──────────────────────────────────
    reglTitle: 'Internal Regulations',
    reglSubtitle: 'Security Guard Training — GSS',
    reglLbNomCandidat: "Applicant's Name", reglLbDate: 'Date', reglLbSig: 'Signature',
    ackReglement: 'I have read, understood, and accept the <strong>Internal Regulations</strong> of GSS Security Services.',
    lbHeader: 'GUARDE SECURITY SERVICE',
    lbHeaderName: 'Training Center',

    // ── Panel 4 · Commitment ─────────────────────────────────
    engTitle: 'Confidentiality Agreement',
    engSubtitle: 'Administrative Document Protection — GSS',
    engSecIdentity: "Signatory's Identity",
    engLbNom: 'I, the undersigned', engLbNaissance: 'Born on',
    engLbTelephone: 'Phone Number', engLbPiece: 'ID Card / Passport Number',
    engCommitTitle: 'I hereby undertake to:',
    engSecSig: "APPLICANT'S DECLARATION",
    engLbFaitA: 'Done at', engLbLe: 'Date',
    engLbNomComplet: 'Full Name', engLbSig: 'Signature',
    engLbCachet: 'Training Officer Signature',
    ackEngagement: 'I freely undertake to comply with this <strong>Confidentiality Agreement</strong>, which takes effect from the date of signature.',
    condBody: `<p class="text-sm leading-7 text-slate-600">GSS Security Services announces the opening of registrations for the Security Guard Training Program. Any candidate wishing to participate must meet the following conditions.</p>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">A. Registration Requirements</h4>
        <ul class="space-y-2">
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Be of good moral character and conduct.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Be at least 18 years of age.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Be physically and medically fit.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Have no criminal conviction incompatible with the position.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Successfully pass the selection interview.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Provide a valid identity document.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Provide two recent passport-size photographs.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Complete the registration form.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Be able to read and write in French.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Comply with the training regulations.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Pay <strong>25,000 CDF</strong> to cover the cost of the training syllabus.</li>
        </ul>
        <p class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">Registration becomes final upon submission of the required documents and payment. Candidates who successfully pass the final examination will be considered eligible for employment as Security Guards with GSS, subject to the company's recruitment needs.</p>
      </section>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">B. Applicant's Obligations</h4>
        <ul class="space-y-2">
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Respect the trainers and comply with the training regulations.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Maintain regular attendance.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Maintain the confidentiality of the company's information.</li>
        </ul>
      </section>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">C. Absences and Exclusion</h4>
        <ul class="space-y-2">
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">!</span>Any absence of three (3) consecutive days without valid justification will result in permanent exclusion without refund.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">!</span>GSS reserves the right to exclude any applicant who displays inappropriate behavior.</li>
        </ul>
      </section>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">D. Final Assessment</h4>
        <ul class="space-y-2">
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>Theoretical and practical assessment.</li>
          <li class="flex items-start gap-2.5 text-sm text-slate-700"><span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#042F8D]/10 text-xs font-bold text-[#042F8D]">✓</span>The decisions of the evaluation panel are final.</li>
        </ul>
      </section>
      <section>
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">E. Employment Opportunity</h4>
        <p class="text-sm leading-7 text-slate-600">Successfully passing the final examination allows the applicant to be considered among the candidates eligible for recruitment, subject to the company's staffing needs.</p>
      </section>`,
    reglBody: `<div class="grid gap-3">
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 1 — Purpose</h4><p class="text-sm leading-6 text-slate-600">These internal regulations set out the rules of organization, discipline, and operation of the training program.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 2 — Timekeeping</h4><p class="text-sm leading-6 text-slate-600">Candidates are required to comply with the established schedule.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 3 — Mandatory Attendance</h4><p class="text-sm leading-6 text-slate-600">Attendance at all classes and assessments is mandatory.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 4 — Dress Code</h4><p class="text-sm leading-6 text-slate-600">Wearing a white shirt or a plain white polo without any inscription, logo, or graffiti, together with black trousers, is mandatory throughout the entire duration of the service.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 5 — Discipline</h4><p class="text-sm leading-6 text-slate-600">Candidates must respect the trainers and other participants.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 6 — Mobile Phones</h4><p class="text-sm leading-6 text-slate-600">The use of mobile phones is prohibited during classes.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 7 — Confidentiality</h4><p class="text-sm leading-6 text-slate-600">Candidates must maintain the confidentiality of GSS information.</p></div>
        <div class="rounded-[14px] border border-amber-100 bg-amber-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-amber-800">Article 8 — Absences</h4><p class="text-sm leading-6 text-amber-900">Three consecutive unjustified absences result in permanent exclusion without refund.</p></div>
        <div class="rounded-[14px] border border-amber-100 bg-amber-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-amber-800">Article 9 — Serious Misconduct</h4><p class="text-sm leading-6 text-amber-900">Any serious misconduct may result in immediate exclusion.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 10 — Equipment</h4><p class="text-sm leading-6 text-slate-600">Equipment must be used with care.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 11 — Sanctions</h4><p class="text-sm leading-6 text-slate-600">Verbal warning, written warning, temporary exclusion, or permanent exclusion.</p></div>
        <div class="rounded-[14px] border border-slate-200 bg-slate-50 p-4"><h4 class="mb-1.5 text-sm font-bold text-[#042F8D]">Article 12 — Decision-Making Authority</h4><p class="text-sm leading-6 text-slate-600">Management reserves the right to take any necessary decision.</p></div>
      </div>`,
    engBody: `<p class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">Acknowledge that I have received or have access to certain administrative documents and data belonging to <strong>GSS Security Services</strong>.</p>
      <section class="mt-4">
        <h4 class="mb-3 text-base font-bold text-[#042F8D]">I hereby undertake to:</h4>
        <ol class="space-y-3">
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">1</span><span class="text-sm leading-6 text-slate-700">Maintain confidentiality of all administrative documents, files, data, forms, and information provided to me.</span></li>
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">2</span><span class="text-sm leading-6 text-slate-700">Not share, copy, reproduce, photograph, or transmit any documents to third parties without prior written authorization from GSS Security Services.</span></li>
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">3</span><span class="text-sm leading-6 text-slate-700">Use these documents only within the scope authorized by the company.</span></li>
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">4</span><span class="text-sm leading-6 text-slate-700">Protect the information against any loss, disclosure, or unauthorized use.</span></li>
          <li class="flex items-start gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#042F8D] text-xs font-bold text-white">5</span><span class="text-sm leading-6 text-slate-700">Immediately return any company-owned documents upon request.</span></li>
        </ol>
      </section>
      <div class="mt-4 rounded-[14px] border border-amber-100 bg-amber-50 p-4 text-sm leading-7 text-amber-900">I acknowledge that in the event of a breach of this agreement, GSS Security Services reserves the right to initiate any administrative or legal proceedings in accordance with applicable laws, and to claim compensation for any damages suffered.</div>`,
    presLegend: '<span class="font-semibold text-[#042F8D]">AH</span> = On time &nbsp;·&nbsp; <span class="font-semibold text-amber-600">AR</span> = Late &nbsp;·&nbsp; <span class="font-semibold text-red-600">ABS</span> = Absent &nbsp;·&nbsp; <span class="font-semibold text-slate-700">EX</span> = Excluded',
    evalLegend: '<span class="font-semibold text-[#042F8D]">TB</span> = Very Good (≥80%) &nbsp;·&nbsp; <span class="font-semibold text-green-600">B</span> = Good (65–79%) &nbsp;·&nbsp; <span class="font-semibold text-amber-600">AB</span> = Fair (50–64%) &nbsp;·&nbsp; <span class="font-semibold text-red-600">I</span> = Insufficient (&lt;50%)',
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
    ackPresences: 'I certify the accuracy of the information in this <strong>Attendance Report</strong>.',
    // ── Panel 6 · Individual Evaluation Sheet ────────────────
    tabEvaluation: 'Evaluation',
    evalTitle: 'Individual Evaluation Sheet',
    evalSubtitle: 'Competency Assessment — GSS',
    evalSecInfo: 'CANDIDATE INFORMATION',
    evalLbNumCandidat: 'Candidate No.',
    evalLbNom: 'Full Name',
    evalLbNumFormation: 'Training No.',
    evalLbIntitule: 'Training Title',
    evalLbFormateur: 'Trainer',
    evalLbDate: 'Evaluation Date',
    evalSecGrid: 'EVALUATION GRID',
    evalColModule: 'Module / Subject',
    evalColNoteMax: 'Max score',
    evalColNoteObt: 'Score obtained',
    evalSubj1: 'Presence and discipline',
    evalSubj2: 'Punctuality',
    evalSubj3: 'Compliance with instructions',
    evalSubj4: 'Professional appearance',
    evalSubj5: 'Communication in French',
    evalSubj6: 'Observation skills',
    evalSubj7: 'Physical aptitude',
    evalSubj8: 'Theoretical exam',
    evalSecSummary: 'SUMMARY',
    evalLbTotalMax: 'Total max',
    evalLbTotalObt: 'Total obtained',
    evalLbResultCat: 'Result',
    evalOptExcellent: 'Excellent (85–100)',
    evalOptVeryGood: 'Very Good (70–84)',
    evalOptAcceptable: 'Acceptable (60–69)',
    evalOptNotRecommended: 'Not Recommended (<60)',
    evalSecResult: 'FINAL RESULT',
    evalLbResultat: 'Final Decision',
    evalOptRecommande: 'Recommended for recruitment',
    evalOptAttente: 'Waiting list',
    evalOptNonRecommande: 'Not recommended',
    evalLbObsGen: 'General Observations',
    evalSecSig: 'SIGNATURES',
    evalLbSigFormateur: 'Trainer',
    evalLbSigResponsable: 'Manager / Director',
    ackEvaluation: 'I certify the accuracy of the information in this <strong>Evaluation Sheet</strong>.',
    // ── Panel 7 · Individual Exam Result ─────────────────────
    tabExam: 'Exam Result',
    examTitle: 'Individual Exam Result',
    examSubtitle: 'Training Centre — GSS',
    examSecInfo: 'CANDIDATE INFORMATION',
    examLbNumCandidat: 'Candidate No.',
    examLbNumFormation: 'Training No.',
    examLbNom: 'Full Name',
    examLbIntitule: 'Training Title',
    examLbDate: 'Exam Date',
    examLbFormateur: 'Trainer',
    examSecResult: 'EXAM RESULT',
    examColElement: 'Element',
    examColResultat: 'Result',
    examLbNoteObtenue: 'Score obtained',
    examLbResultat: 'Result',
    examOptReussi: ' Pass',
    examOptEchec: ' Fail',
    examLbDecision: 'Decision',
    examOptRecommande: ' Recommended for recruitment',
    examOptAttente: ' Waiting list',
    examOptNonRecommande: ' Not recommended',
    examSecObs: "TRAINER'S OBSERVATIONS",
    examLbObs: 'Observations…',
    examSecValidation: 'VALIDATION',
    examLbCachet: 'Training Centre Stamp',
    examLbVisa: "Director's Visa",
    ackExam: 'I certify the accuracy of the information in this <strong>Exam Result</strong>.',
    // ── Panel 8 · Measurements and Additional Information Sheet ──
    tabMensuration: 'Measurements',
    measTitle: 'Measurements and Additional Information Sheet',
    measSubtitle: 'Individual File — GSS',
    measSecInfo: 'A. CANDIDATE INFORMATION',
    measLbNumCandidat: 'Candidate No.',
    measLbNumFormation: 'Training No.',
    measLbNom: 'Full Name',
    measLbDate: 'Date',
    measSecMens: 'B. MEASUREMENTS',
    measColDesignation: 'Designation',
    measColValeur: 'Value',
    measLbTaille: 'Height (cm)',
    measLbPoids: 'Weight (kg)',
    measLbPointure: 'Shoe Size',
    measLbChemise: 'Shirt Size',
    measLbPantalon: 'Trouser Size',
    measLbVeste: 'Jacket Size (if applicable)',
    measSecMedical: 'C. MEDICAL INFORMATION',
    measColInfo: 'Information',
    measLbGroupeSanguin: 'Blood Group',
    measLbAllergies: 'Known Allergies',
    measLbObsMedicales: 'Special Medical Observations',
    measSecUrgence: 'D. EMERGENCY CONTACT PERSON',
    measLbUrgenceNom: 'Full Name',
    measLbUrgenceLien: 'Relationship',
    measLbUrgenceTel: 'Phone Number',
    measLbUrgenceAdresse: 'Address',
    measSecObs: 'E. OBSERVATIONS',
    measSecValidation: 'F. VALIDATION',
    measLbCachet: 'Training Centre Stamp',
    measNbText: 'NB: This form is completed after the admission of the candidate to the training program. The information collected is used exclusively for administrative management, uniform preparation, personnel safety, and the compilation of the individual candidate file.',
    ackMensuration: 'I certify the accuracy of the information in this <strong>Measurements Sheet</strong>.',
    // ── Panel 9 · Letter of Engagement with Trial Period ──
    tabLettre: 'Engagement Letter',
    lettreTitle: 'Letter of Engagement with Trial Period',
    lettreSubtitle: 'GSS Security Services',
    lettreObjet: 'Subject: Engagement proposal with trial period',
    lettreSecDestinataire: 'ADDRESSEE',
    lettreLbNom: 'Mr / Ms',
    lettreLbAdresse: 'Address',
    lettreLbTel: 'Phone',
    lettreLbNumCandidat: 'Candidate No.',
    lettreBodyP1: "Following your successful completion of the security officers training organized by GSS Security Services and after a favourable review of your file, we are pleased to inform you that you have been selected to join our company as a Security Officer.",
    lettreBodyP2Intro: 'Your engagement begins with a trial period of:',
    lettreDuree1m: ' One (1) month',
    lettreDuree2m: ' Two (2) months',
    lettreDuree3m: ' Three (3) months',
    lettreBodyP3: 'During this period, your conduct, discipline, punctuality, professional aptitude, and your ability to carry out assigned missions will be subject to continuous evaluation.',
    lettreBodyP4: 'At the end of this trial period, and if the results are deemed satisfactory by General Management, your engagement may be confirmed by an employment contract.',
    lettreBodyP5: 'GSS Security Services reserves the right to terminate the trial period in the event of professional inadequacy, serious disciplinary misconduct, or non-compliance with the internal regulations.',
    lettreSecAffectation: 'ASSIGNMENT',
    lettreLbDatePrise: 'Start Date',
    lettreLbLieu: 'Place of Assignment',
    lettreSecAcceptation: 'CANDIDATE ACCEPTANCE',
    lettreLbCandidatNom: 'Full Name',
    lettreLbCandidatSig: 'Candidate Signature',
    lettreLbCandidatDate: 'Date',
    lettreSecDirection: 'GENERAL MANAGEMENT',
    lettreLbDirectionSign: 'Guarde Security Service — General Management',
    ackLettre: 'I have read and accept the terms of this <strong>Letter of Engagement with Trial Period</strong>.',
    // ── Panel 10 · Uniform Equipment Handover Commitment ──
    tabUniforme: 'Uniform',
    uniformeTitle: 'Uniform Equipment Handover Commitment and Salary Deduction Authorization',
    uniformeSubtitle: 'Guarde Security Service',
    uniformeIntro: 'I the undersigned,',
    uniformeSecAgent: 'AGENT IDENTIFICATION',
    uniformeLbNom: 'Full Name',
    uniformeLbCni: 'ID Card No.',
    uniformeLbFonction: 'Position',
    uniformeSecEquip: 'EQUIPMENT RECEIVED',
    uniformeEquipIntro: 'Declares having received from GSS Security Services the following equipment:',
    uniformeOptUniforme: 'Uniform',
    uniformeOptCasquette: 'Cap',
    uniformeOptChaussures: 'Shoes',
    uniformeOptCeinture: 'Belt',
    uniformeOptBadge: 'Identification Badge',
    uniformeOptAutres: 'Other',
    uniformeLbValeur: 'Total equipment value',
    uniformeBodyP1: 'I acknowledge that this equipment represents a financial value borne by the company.',
    uniformeBodyP2: 'I authorize GSS Security Services to make a monthly deduction from my salary at the agreed amount between both parties until full reimbursement.',
    uniformeLbRetenue: 'Monthly deduction amount',
    uniformeBodyP3: 'I commit to taking care of the equipment provided and to return it upon cessation of my duties in accordance with internal regulations.',
    uniformeLbFaitA: 'Done at',
    uniformeLbLe: 'Date',
    uniformeSecSign: 'SIGNATURES',
    uniformeLbSignAgent: 'Agent Signature',
    uniformeLbSignDirection: 'General Management',
    ackUniforme: 'I acknowledge receipt of the listed equipment and accept the terms of this <strong>Uniform Equipment Handover Commitment</strong>.',
    // ── Panel 9 · Individual Candidate File ──
    tabDossier: 'CheckList',
    dossierTitle: 'Individual Candidate File',
    dossierSubtitle: 'Training Centre — Guarde Security Service',
    dossierSec1: '1. GENERAL INFORMATION',
    dossierLbNumCandidat: 'Candidate No.',
    dossierLbNumFormation: 'Training No.',
    dossierLbIntitule: 'Training Title',
    dossierLbNom: 'Full Name',
    dossierLbTel: 'Phone',
    dossierLbDateDebut: 'Start Date',
    dossierLbDateFin: 'End Date',
    dossierLbObs: 'Observations',
    dossierSec2: '2. DOCUMENT CHECKLIST',
    dossierColDoc: 'Document',
    dossierColPresent: 'Present (✓)',
    dossierCat1: '1. Administrative Documents',
    dossierDoc11: 'Registration form',
    dossierDoc12: 'Signed registration conditions',
    dossierDoc13: 'Copy of identity document',
    dossierDoc14: 'Two ID photos',
    dossierDoc15: 'Curriculum Vitae (if required)',
    dossierDoc16: 'Criminal record (if required)',
    dossierDoc17: 'Medical certificate (if required)',
    dossierCat2: '2. Training',
    dossierDoc21: 'Measurements sheet',
    dossierDoc22: 'Signed internal regulations',
    dossierDoc23: 'Confidentiality commitment',
    dossierDoc24: 'Attendance list',
    dossierDoc25: 'Disciplinary report(s) (if applicable)',
    dossierCat3: '3. Evaluations',
    dossierDoc31: 'Individual evaluation sheet',
    dossierDoc32: 'Final exam result',
    dossierDoc33: 'Final decision',
    dossierCat4: '4. Recruitment',
    dossierDoc41: 'Letter of engagement',
    dossierDoc42: 'Uniform equipment handover commitment',
    dossierDoc43: 'Other documents',
    ackDossier: 'I certify the accuracy of the information and the completeness of this <strong>Individual Candidate File</strong>.'
  }
};

// ── Login page translations (consumed by login.js) ─────────
const loginTranslations = {
  en: {
    title: 'GSS | Login',
    loginEyebrow: 'Secure area',
    loginHeroTitle: 'Welcome to your GSS portal.',
    loginHeroText:
      'Sign in to manage registrations, training and the follow-up of security agents in complete confidentiality.',
    loginFeat1: 'Encrypted and protected access',
    loginFeat2: 'Centralized file management',
    loginFeat3: '24/7 administrative support',
    brandSub: 'Security Service',
    loginRights: 'All rights reserved.',
    loginTitle: 'Login',
    loginSubtitle: 'Enter your credentials to access your dashboard.',
    loginEmailLabel: 'Email address',
    loginEmailPh: 'name@example.com',
    loginPasswordLabel: 'Password',
    loginForgot: 'Forgot password?',
    loginRemember: 'Remember me',
    loginSubmit: 'Sign in',
    loginOr: 'or',
    loginNoAccount: "Don't have an account yet?",
    loginCreate: 'Create an account',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    errRequired: 'Please fill in all fields.',
    errEmail: 'Invalid email address.',
    signingIn: 'Signing in…',
    // ── Sign up modal ──
    signupTitle: 'Create your account',
    signupSubtitle: 'Fill in your details to get started with GSS.',
    signupNameLabel: 'Full name',
    signupNamePh: 'John Doe',
    signupEmailLabel: 'Email address',
    signupEmailPh: 'name@example.com',
    signupPhoneLabel: 'Phone number',
    signupPhonePh: '+243 999 000 000',
    signupPasswordLabel: 'Password',
    signupPasswordPh: 'At least 8 characters',
    signupConfirmLabel: 'Confirm password',
    signupConfirmPh: 'Re-enter your password',
    signupTerms: 'I agree to the Terms of Service and Privacy Policy.',
    signupSubmit: 'Create account',
    signupHaveAccount: 'Already have an account?',
    signupLogin: 'Sign in',
    signupErrName: 'Please enter your full name.',
    signupErrEmail: 'Please enter a valid email address.',
    signupErrPwShort: 'Password must be at least 8 characters.',
    signupErrPwMatch: 'Passwords do not match.',
    signupErrTerms: 'Please accept the Terms to continue.',
    signupSuccess: 'Account created! You can now sign in.',
  },
  fr: {
    title: 'GSS | Connexion',
    loginEyebrow: 'Espace sécurisé',
    loginHeroTitle: 'Bienvenue sur votre portail GSS.',
    loginHeroText:
      'Connectez-vous pour gérer les inscriptions, les formations et le suivi des agents de sécurité en toute confidentialité.',
    loginFeat1: 'Accès chiffré et protégé',
    loginFeat2: 'Gestion centralisée des dossiers',
    loginFeat3: 'Support administratif 24/7',
    brandSub: 'Security Service',
    loginRights: 'Tous droits réservés.',
    loginTitle: 'Connexion',
    loginSubtitle: 'Entrez vos identifiants pour accéder à votre tableau de bord.',
    loginEmailLabel: 'Adresse e-mail',
    loginEmailPh: 'nom@exemple.com',
    loginPasswordLabel: 'Mot de passe',
    loginForgot: 'Mot de passe oublié ?',
    loginRemember: 'Se souvenir de moi',
    loginSubmit: 'Se connecter',
    loginOr: 'ou',
    loginNoAccount: 'Pas encore de compte ?',
    loginCreate: 'Créer un compte',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    errRequired: 'Veuillez remplir tous les champs.',
    errEmail: 'Adresse e-mail invalide.',
    signingIn: 'Connexion en cours…',
    // ── Sign up modal ──
    signupTitle: 'Créer votre compte',
    signupSubtitle: 'Renseignez vos informations pour démarrer avec GSS.',
    signupNameLabel: 'Nom complet',
    signupNamePh: 'Jean Dupont',
    signupEmailLabel: 'Adresse e-mail',
    signupEmailPh: 'nom@exemple.com',
    signupPhoneLabel: 'Numéro de téléphone',
    signupPhonePh: '+243 999 000 000',
    signupPasswordLabel: 'Mot de passe',
    signupPasswordPh: 'Au moins 8 caractères',
    signupConfirmLabel: 'Confirmer le mot de passe',
    signupConfirmPh: 'Ressaisissez votre mot de passe',
    signupTerms: 'J\'accepte les Conditions d\'utilisation et la Politique de confidentialité.',
    signupSubmit: 'Créer le compte',
    signupHaveAccount: 'Vous avez déjà un compte ?',
    signupLogin: 'Se connecter',
    signupErrName: 'Veuillez saisir votre nom complet.',
    signupErrEmail: 'Veuillez saisir une adresse e-mail valide.',
    signupErrPwShort: 'Le mot de passe doit comporter au moins 8 caractères.',
    signupErrPwMatch: 'Les mots de passe ne correspondent pas.',
    signupErrTerms: 'Veuillez accepter les Conditions pour continuer.',
    signupSuccess: 'Compte créé ! Vous pouvez maintenant vous connecter.',
  },
};

// ── Panel 5 · Rapport Individuel de Présences — language constants ─
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

// ── Searchable <select> combobox strings (used by registration.js) ─
const COMBO_STRINGS = {
  fr: { search: 'Rechercher…', empty: 'Aucun résultat' },
  en: { search: 'Search…', empty: 'No results' }
};

// ── Registration form status messages (used by registration.js) ───
const REGISTRATION_MESSAGES = {
  fr: {
    required: 'Veuillez saisir au moins votre nom complet et votre téléphone principal.',
    phone: 'Veuillez saisir un numéro de téléphone valide (7 à 15 chiffres).',
    email: 'Veuillez saisir une adresse e-mail valide.',
    dobFuture: 'La date de naissance ne peut pas être dans le futur.',
    dobAge: 'Le candidat doit avoir au moins 18 ans.',
    dateInvalid: 'Veuillez saisir une date valide.',
    selectCity: 'Sélectionnez votre ville',
    selectCountryFirst: "Sélectionnez d'abord le pays",
    ready: (/** @type {number} */ n) => `Formulaire prêt à être envoyé. ${n} champ(s) complété(s).`
  },
  en: {
    required: 'Please enter at least your full name and primary phone number.',
    phone: 'Please enter a valid phone number (7 to 15 digits).',
    email: 'Please enter a valid email address.',
    dobFuture: 'The date of birth cannot be in the future.',
    dobAge: 'The applicant must be at least 18 years old.',
    dateInvalid: 'Please enter a valid date.',
    selectCity: '',
    selectCountryFirst: 'Select a country first',
    ready: (/** @type {number} */ n) => `Form ready to be submitted. ${n} field(s) completed.`
  }
};

// ── Panel validation status messages (used by validation.js) ──────
const VALIDATION_MESSAGES = {
  fr: {
    required: 'Veuillez remplir tous les champs obligatoires mis en évidence.',
    success: 'Tous les champs obligatoires sont remplis.'
  },
  en: {
    required: 'Please complete all required fields highlighted below.',
    success: 'All required fields are completed.'
  }
};

// ── Language state ─────────────────────────────────────────
const langButtons = Array.from(document.querySelectorAll('[data-lang]')).slice(0, 2);

// Shared across all pages/panels (set on the login page). Default: English.
// GSS_LANG_KEY is defined in js/global.js.
let currentLang = /** @type {'fr' | 'en'} */ ((() => {
  const saved = localStorage.getItem(GSS_LANG_KEY);
  return saved === 'fr' || saved === 'en' ? saved : 'en';
})());


// ── Apply the selected language across the page ────────────
const applyLanguage = (/** @type {'fr' | 'en'} */ lang) => {
  const dict = /** @type {Record<string, string>} */ (translations[lang]);
  document.documentElement.lang = lang;
  document.title = dict.title;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (key && dict[key]) {
      element.textContent = dict[key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (key && dict[key]) {
      /** @type {HTMLInputElement} */ (element).placeholder = dict[key];
    }
  });

  // innerHTML-based translations (for elements containing HTML like <span>)
  document.querySelectorAll('[data-i18n-html]').forEach((element) => {
    const key = element.getAttribute('data-i18n-html');
    if (key && dict[key]) {
      element.innerHTML = dict[key];
    }
  });

  currentLang = lang;

  // Persist so every other page/panel keeps the same language.
  localStorage.setItem(GSS_LANG_KEY, lang);

  // Show/hide language-specific content blocks (FR / EN document panels)
  document.querySelectorAll('.lang-content').forEach((el) => {
    el.classList.toggle('hidden', /** @type {HTMLElement} */ (el).dataset.lang !== lang);
  });

  // Update presences panel language-dependent elements
  if (typeof updatePresStatusOptions === 'function') updatePresStatusOptions();
  if (typeof updatePresDayCells === 'function') updatePresDayCells();

  // Update evaluation panel language-dependent elements
  const updateEvalAppreciationsFn = /** @type {any} */ (globalThis).updateEvalAppreciations;
  if (typeof updateEvalAppreciationsFn === 'function') updateEvalAppreciationsFn();
  // Update evalBtnRemove labels in dynamically added rows
  document.querySelectorAll('#eval-tbody .eval-remove-btn [data-i18n="evalBtnRemove"]').forEach(el => {
    if (dict.evalBtnRemove) el.textContent = dict.evalBtnRemove;
  });

  langButtons.forEach((button) => {
    const isActive = button.getAttribute('data-lang') === lang;
    button.classList.toggle(`${TAB_ACTIVE_BG}`, isActive);
    button.classList.toggle('text-white', isActive);
    button.classList.toggle(`text-[${TAB_ACTIVE_BG}]`, !isActive);
    button.classList.toggle('bg-white', !isActive);
  });
};

// ── Language switcher wiring (tc.html only; login.js handles login) ──
if (document.getElementById('gssTabBar')) {
  langButtons.forEach((button) => {
    button.addEventListener('click', () => applyLanguage(/** @type {'fr' | 'en'} */ (button.getAttribute('data-lang'))));
  });

  applyLanguage(currentLang);
}