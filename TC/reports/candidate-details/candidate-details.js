// @ts-check
/// <reference path="../../js/global.js" />
/// <reference path="../../js/utils/translation.js" />
/**
 * GSS · Candidate Details Report
 * ==================================================================
 * Standalone reporting dashboard (reports/candidate-details/*.html).
 *
 * Flow: pick a Year → a Month → a Course conducted that month. The report
 * then shows the course instructor, a Summary (enrolled / gender / paid /
 * French literate / security experience) and a Candidate Details grid whose
 * grouped columns mirror the printed registration sheet (Candidate
 * Information, Measurements, Medical, Contact, Emergency Contact, Education &
 * Experience, Registration Fees). Export to .xlsx and print via the browser.
 *
 * Data sources (resolved by training_id — see TC/server/index.js):
 *   • /api/reports/training-register  → every session (year/month/course/instructor)
 *   • /api/reports/candidate-details  → the enrolled candidates (+ measurements)
 *
 * Localization reuses the shared `translations` dictionary (translation.js)
 * and the `gss-lang` localStorage key, so no user-facing text is hard-coded.
 */
(() => {
  'use strict';

  let lang = 'en';
  /** @type {any[]} every candidate across every training session */
  let candidates = [];
  /** @type {any[]} candidates currently shown (after the search filter) */
  let filtered = [];
  /** current global search term (lower-cased) */
  let search = '';
  /** @type {number|undefined} */
  let filterTimer;
  const FILTERS = [
    { id: 'cdDateFrom', label: 'Start Date', key: 'cdFltStartDate', type: 'date' },
    { id: 'cdDateTo', label: 'End Date', key: 'cdFltEndDate', type: 'date' },
    { id: 'cdAgeFrom', label: 'Age From', key: 'cdAgeFrom', type: 'number', min: 0, max: 120 },
    { id: 'cdAgeTo', label: 'Age To', key: 'cdAgeTo', type: 'number', min: 0, max: 120 },
    { id: 'cdGender', label: 'Gender', key: 'gcGender', type: 'select' },
    { id: 'cdTraining', label: 'Training Title', key: 'cdTrainingTitle', type: 'select' },
    { id: 'cdTrainerFilter', label: 'Trainer', key: 'cdTrainer', type: 'select' },
    { id: 'cdHeightFrom', label: 'Height From (cm)', key: 'cdHeightFrom', type: 'number', min: 0, max: 300 },
    { id: 'cdHeightTo', label: 'Height To (cm)', key: 'cdHeightTo', type: 'number', min: 0, max: 300 },
    { id: 'cdBlood', label: 'Blood Group', key: 'cdColBlood', type: 'select' },
    { id: 'cdHealthFilter', label: 'Health Status', key: 'cdColHealth', type: 'select' },
    { id: 'cdEducation', label: 'Education Level', key: 'cdColEducation', type: 'select' },
    { id: 'cdFrench', label: 'French Reading/Writing', key: 'cdColFrench', type: 'select' },
    { id: 'cdExperience', label: 'Security Experience', key: 'cdColSecExp', type: 'select' },
    { id: 'cdPayment', label: 'Payment Status', key: 'cdColPayStatus', type: 'select' },
  ];
  const GRID_PAGE = 60; // grid rows rendered per lazy-load batch
  let gridRendered = 0; // grid rows currently mounted in the DOM
  /** @type {Set<string>} group keys currently collapsed (default: none → all expanded) */
  const collapsedGroups = new Set();
  const PH_W = 40; // width (px) of a collapsed group's placeholder column
  /** @type {any[]} render-column plan for the current grid (rebuilt on each renderDetails) */
  let gridRenderCols = [];

  // ── Helpers ──────────────────────────────────────────────
  const $ = (/** @type {string} */ id) => document.getElementById(id);

  // Hide the skeleton shimmer once the report has first rendered.
  let skeletonHidden = false;
  const hideSkeleton = () => {
    if (skeletonHidden) return;
    skeletonHidden = true;
    const sk = $('reportSkeleton');
    if (!sk) return;
    sk.classList.add('is-hidden');
    setTimeout(() => { sk.remove(); }, 400);
  };
  const dict = () => /** @type {any} */ ((typeof translations !== 'undefined' && /** @type {any} */ (translations)[lang]) || {});
  const t = (/** @type {string} */ key, /** @type {string} */ fallback = '') => dict()[key] || fallback || key;

  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const toDate = (/** @type {string} */ iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
  const fmtDate = (/** @type {string} */ iso) => { const d = toDate(iso); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—'; };
  const esc = (/** @type {any} */ s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  const trainingCode = (/** @type {any} */ r) => {
    const d = toDate(r.date_from);
    const year = d ? d.getFullYear() : new Date().getFullYear();
    return `GSS-TR-${year}-${String(r.training_id).padStart(3, '0')}`;
  };

  // Training titles are stored as "CODE - Description" (e.g. "FIAS - Initial
  // Security Agent Training"): the code (before the dash) labels the course,
  // the description (after the dash) is the readable title.
  const courseCodeFromTitle = (/** @type {string} */ title) => {
    const s = String(title || '').trim();
    const i = s.indexOf('-');
    if (i >= 0) return s.slice(0, i).trim().toUpperCase();
    if (!/\s/.test(s)) return s.toUpperCase();
    return s.split(/\s+/).map((w) => (w.match(/[a-z0-9]/i) || [''])[0]).join('').toUpperCase().slice(0, 5);
  };
  const courseTitleFromTitle = (/** @type {string} */ title) => {
    const s = String(title || '').trim();
    const i = s.indexOf('-');
    return (i >= 0 ? s.slice(i + 1) : s).trim();
  };
  const courseCode = (/** @type {any} */ r) => courseCodeFromTitle(r.training_title) || trainingCode(r);
  const courseTitle = (/** @type {any} */ r) => courseTitleFromTitle(r.training_title) || String(r.training_title || '');

  // Truthy-value helpers for the report cells.
  const isTrue = (/** @type {any} */ v) => v === true || v === 't' || v === 'true' || v === 1 || v === '1' || v === 'Yes';
  const yn = (/** @type {any} */ v) => (isTrue(v) ? t('cdYes', 'Yes') : t('cdNo', 'No'));
  const sex = (/** @type {any} */ v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'male' || s === 'm') return 'M';
    if (s === 'female' || s === 'f') return 'F';
    return v ? String(v) : '—';
  };
  const health = (/** @type {any} */ c) => (isTrue(c.has_health_issues)
    ? (c.health_issues_details || t('cdHealthIssues', 'Issues'))
    : t('cdHealthGood', 'Good'));
  const blank = () => '—';
  const or = (/** @type {any} */ v) => { const s = v == null ? '' : String(v).trim(); return s === '' ? '—' : s; };
  const currentAge = (/** @type {any} */ dob) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob || ''));
    if (!match) return null;
    const year = Number(match[1]); const month = Number(match[2]) - 1; const day = Number(match[3]);
    const date = new Date(year, month, day);
    const today = new Date();
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day || date > today) return null;
    return today.getFullYear() - year - (today.getMonth() < month || (today.getMonth() === month && today.getDate() < day) ? 1 : 0);
  };
  const booleanValue = (/** @type {any} */ value) => value == null ? '' : String(isTrue(value));
  const genderValue = (/** @type {any} */ value) => sex(value);
  const filterValue = (/** @type {string} */ id) => /** @type {HTMLInputElement|HTMLSelectElement|null} */ ($(id))?.value || '';

  const populateFilters = () => {
    const distinct = (/** @type {(row:any)=>any} */ getter) => Array.from(new Set(candidates.map(getter).filter((value) => value != null && value !== '')))
      .map((value) => ({ value: String(value), label: String(value) })).sort((first, second) => first.label.localeCompare(second.label));
    const binary = (/** @type {string} */ yes, /** @type {string} */ no) => [{ value: 'true', label: yes }, { value: 'false', label: no }];
    /** @type {Record<string, {value:string,label:string}[]>} */
    const options = {
      cdGender: distinct((row) => genderValue(row.gender)),
      cdTraining: distinct((row) => row.training_title),
      cdTrainerFilter: distinct((row) => row.trainer),
      cdBlood: distinct((row) => row.blood_group),
      cdHealthFilter: binary(t('cdHealthIssues', 'Issues'), t('cdHealthGood', 'Good')),
      cdEducation: distinct((row) => row.education_level),
      cdFrench: binary(t('cdYes', 'Yes'), t('cdNo', 'No')),
      cdExperience: binary(t('cdYes', 'Yes'), t('cdNo', 'No')),
      cdPayment: binary(t('cdPaid', 'Paid'), t('cdUnpaid', 'Unpaid')),
    };
    Object.entries(options).forEach(([id, values]) => {
      const select = /** @type {HTMLSelectElement|null} */ ($(id));
      if (!select) return;
      const keep = select.value;
      select.innerHTML = `<option value="">${esc(t('trAll', 'All'))}</option>` + values.map((option) => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join('');
      select.value = keep;
    });
  };

  const initFilters = () => {
    const root = $('cdFilters');
    if (!root) return;
    FILTERS.forEach((spec) => {
      const wrap = document.createElement('div');
      wrap.className = 'min-w-0';
      const label = document.createElement('label');
      label.htmlFor = spec.id;
      label.className = 'mb-1 block text-xs font-semibold text-slate-600';
      label.setAttribute('data-i18n', spec.key);
      label.textContent = t(spec.key, spec.label);
      const control = document.createElement(spec.type === 'select' ? 'select' : 'input');
      control.id = spec.id;
      control.className = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#042F8D] focus:ring-2 focus:ring-[#042F8D]/20';
      if (control instanceof HTMLInputElement && spec.type === 'number') {
        control.type = 'number';
        control.min = String(spec.min); control.max = String(spec.max);
        control.step = spec.id.startsWith('cdAge') ? '1' : '0.1';
        control.addEventListener('input', () => {
          clearTimeout(filterTimer);
          filterTimer = window.setTimeout(applyFilter, 180);
        });
      } else if (control instanceof HTMLInputElement && spec.type === 'date') {
        control.type = 'date';
      }
      control.addEventListener('change', () => { clearTimeout(filterTimer); applyFilter(); });
      wrap.append(label, control);
      root.appendChild(wrap);
    });
    const searchWrap = $('cdSearch')?.parentElement;
    if (searchWrap) $('cdFilterSearch')?.appendChild(searchWrap);
    populateFilters();
  };

  // ── Column model (mirrors the printed registration sheet) ────
  // Each group becomes a colspan header; each column a sub-header + getter.
  // The first group is `frozen`: its columns stay pinned while the rest of the
  // matrix scrolls horizontally. Frozen columns carry a fixed width `w` (px).
  const NO_W = 44; // width of the leading N° column (px)
  const FROZEN_COLS = 6; // how many leading Candidate Information columns stay pinned
  /** @type {{ key:string, label:string, frozen?:boolean, cols:{ key:string, label:string, w?:number, get:(c:any)=>string }[] }[]} */
  const GROUPS = [
    { key: 'cdGrpCandidate', label: 'Candidate Information', frozen: true, cols: [
      { key: 'cdColCandNo', label: 'Candidate No.', w: 70, get: (c) => (c.candidate_no != null ? `C${c.candidate_no}` : '—') },
      { key: 'cdColFullName', label: 'Full Name', w: 150, get: (c) => or(c.full_name) },
      { key: 'cdColFather', label: "Father's Name", w: 130, get: (c) => or(c.father_name) },
      { key: 'cdColMother', label: "Mother's Name", w: 130, get: (c) => or(c.mother_name) },
      { key: 'cdColMarital', label: 'Marital Status', w: 96, get: (c) => or(c.marital_status) },
      { key: 'cdColNationality', label: 'Nationality', w: 100, get: (c) => or(c.nationality) },
      { key: 'cdColPOB', label: 'Place of Birth', w: 110, get: (c) => or(c.place_of_birth) },
      { key: 'cdColDOB', label: 'Date of Birth', w: 100, get: (c) => fmtDate(c.date_of_birth) },
      { key: 'cdColChildren', label: 'No. of Children', w: 80, get: blank },
      { key: 'cdColSpouse', label: "Spouse's Name", w: 130, get: blank },
      { key: 'cdColSex', label: 'Sex (M/F)', w: 72, get: (c) => sex(c.gender) },
    ] },
    { key: 'cdGrpTraining', label: 'Training Information', cols: [
      { key: 'cdTrainingNo', label: 'Training No.', get: (c) => (c.training_id != null ? trainingCode(c) : '—') },
      { key: 'cdTrainingTitle', label: 'Training Title', get: (c) => or(courseTitleFromTitle(c.training_title)) },
      { key: 'cdTrainer', label: 'Trainer', get: (c) => or(c.trainer) },
      { key: 'cdStartDate', label: 'Start Date', get: (c) => fmtDate(c.date_from) },
      { key: 'cdEndDate', label: 'End Date', get: (c) => fmtDate(c.date_to) },
    ] },
    { key: 'cdGrpMeasure', label: 'Measurements and Additional Information', cols: [
      { key: 'cdColHeight', label: 'Height (cm)', get: (c) => or(c.height_cm) },
      { key: 'cdColShoe', label: 'Shoe Size', get: (c) => or(c.shoe_size) },
      { key: 'cdColWeight', label: 'Weight (kg)', get: (c) => or(c.weight_kg) },
      { key: 'cdColShirt', label: 'Shirt Size', get: (c) => or(c.shirt_size) },
      { key: 'cdColTrouser', label: 'Trouser Size', get: (c) => or(c.trouser_size) },
      { key: 'cdColJacket', label: 'Jacket Size', get: (c) => or(c.jacket_size) },
    ] },
    { key: 'cdGrpMedical', label: 'Medical Information', cols: [
      { key: 'cdColBlood', label: 'Blood Group', get: (c) => or(c.blood_group) },
      { key: 'cdColHealth', label: 'Health Status', get: (c) => health(c) },
      { key: 'cdColMedNotes', label: 'Special Medical Notes', get: (c) => or(c.special_medical_observations) },
    ] },
    { key: 'cdGrpContact', label: 'Contact Details', cols: [
      { key: 'cdColAddress', label: 'Full Address', get: (c) => or(c.full_address) },
      { key: 'cdColPhone1', label: 'Phone (1)', get: (c) => or(c.phone_1) },
      { key: 'cdColPhone2', label: 'Phone (2)', get: (c) => or(c.phone_2) },
    ] },
    { key: 'cdGrpEmergency', label: 'Emergency Contact', cols: [
      { key: 'cdColEmName', label: 'Full Name', get: (c) => or(c.emergency_name) },
      { key: 'cdColEmRel', label: 'Relationship', get: (c) => or(c.emergency_relationship) },
      { key: 'cdColEmPhone', label: 'Phone', get: (c) => or(c.emergency_phone) },
      { key: 'cdColEmAddress', label: 'Address', get: (c) => or(c.emergency_address) },
    ] },
    { key: 'cdGrpEducation', label: 'Education and Experience', cols: [
      { key: 'cdColEducation', label: 'Education Level', get: (c) => or(c.education_level) },
      { key: 'cdColFrench', label: 'French Reading/Writing', get: (c) => yn(c.is_french_literate) },
      { key: 'cdColSecExp', label: 'Security Experience', get: (c) => yn(c.has_security_experience) },
      { key: 'cdColSecYears', label: 'Years of Security Experience', get: (c) => or(c.security_experience_details) },
    ] },
    { key: 'cdGrpFees', label: 'Registration Fees', cols: [
      { key: 'cdColPayStatus', label: 'Payment Status', get: (c) => (isTrue(c.ispaid) ? t('cdPaid', 'Paid') : t('cdUnpaid', 'Unpaid')) },
      { key: 'cdColAmount', label: 'Amount (CDF)', get: blank },
      { key: 'cdColPayDate', label: 'Payment Date', get: blank },
      { key: 'cdColReceipt', label: 'Receipt No.', get: blank },
    ] },
  ];
  const flatCols = () => GROUPS.reduce((a, g) => a.concat(g.cols), /** @type {any[]} */ ([]));

  // ── Localization ─────────────────────────────────────────
  const applyLang = () => {
    const d = dict();
    document.documentElement.lang = lang;
    document.title = `GSS · ${t('cdReportTitle', 'Candidate Details Report')}`;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key || !d[key]) return;
      const attr = el.getAttribute('data-i18n-attr');
      if (attr) el.setAttribute(attr, d[key]);
      else el.textContent = d[key];
    });
  };

  const setLang = (/** @type {string} */ next) => {
    const resolved = next === 'fr' ? 'fr' : 'en';
    if (resolved === lang) return;
    lang = resolved;
    applyLang();
    populateFilters();
    renderSummary();
    renderDemographics();
    renderSizes();
    renderDetails();
    updateGenDate();
  };

  const updateGenDate = () => {
    const now = new Date();
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
    const text = now.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    const el = $('cdGenDate'); if (el) el.textContent = text;
    const pdf = $('cdGenDatePdf'); if (pdf) pdf.textContent = text;
  };

  // ── Data ─────────────────────────────────────────────────
  const load = async () => {
    const state = $('cdLoadState');
    const message = $('cdLoadMessage');
    const retry = $('cdRetry');
    state?.classList.remove('hidden'); state?.classList.add('flex');
    retry?.classList.add('hidden');
    if (message) { message.setAttribute('data-i18n', 'cdLoading'); message.textContent = t('cdLoading', 'Loading…'); }
    $('cdFiltersSection')?.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(`${API_BASE}/api/reports/candidate-details`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = /** @type {any} */ (await res.json());
      candidates = Array.isArray(data && data.candidates) ? data.candidates : [];
      state?.classList.add('hidden');
    } catch (err) {
      console.error('Candidate details report load failed:', err);
      candidates = [];
      if (message) { message.setAttribute('data-i18n', 'cdLoadError'); message.textContent = t('cdLoadError', 'Unable to load candidates.'); }
      retry?.classList.remove('hidden');
    }
    $('cdFiltersSection')?.setAttribute('aria-busy', 'false');
    populateFilters();
    applyFilter();
    updateGenDate();
    hideSkeleton();
  };

  // Summarise the active filters for the PDF (the Filters panel is screen-only,
  // so the printed report needs its own record of what was applied).
  const renderFilterSummary = () => {
    const box = $('cdFilterSummary');
    if (!box) return;
    /** @type {string[]} */
    const parts = [];
    FILTERS.forEach((spec) => {
      const el = /** @type {HTMLInputElement|HTMLSelectElement|null} */ ($(spec.id));
      const value = el?.value || '';
      if (!value) return;
      const text = el instanceof HTMLSelectElement ? (el.options[el.selectedIndex]?.text || value) : value;
      parts.push(`<span class="font-semibold text-slate-700">${esc(t(spec.key, spec.label))}:</span> ${esc(text)}`);
    });
    if (search.trim()) parts.push(`<span class="font-semibold text-slate-700">${esc(t('cdSearchLabel', 'Search'))}:</span> ${esc(search.trim())}`);
    const label = esc(t('cdAppliedFilters', 'Applied Filters'));
    box.innerHTML = parts.length
      ? `<span class="font-bold text-[#042F8D]">${label}:</span> ${parts.join(' &nbsp;·&nbsp; ')}`
      : `<span class="font-bold text-[#042F8D]">${label}:</span> ${esc(t('cdFilterNone', 'None — all candidates'))}`;
  };

  // ── Global search ────────────────────────────────────────
  // Match the term against every rendered grid cell so the search spans all
  // columns (candidate, training, measurements, medical, contact, …).
  const applyFilter = () => {
    const cols = flatCols();
    const q = search.trim().toLowerCase();
    const number = (/** @type {string} */ id) => filterValue(id) === '' ? null : Number(filterValue(id));
    const ageFrom = number('cdAgeFrom'); const ageTo = number('cdAgeTo');
    const heightFrom = number('cdHeightFrom'); const heightTo = number('cdHeightTo');
    const dateFrom = filterValue('cdDateFrom') || null; const dateTo = filterValue('cdDateTo') || null;
    const invalid = (ageFrom != null && ageTo != null && ageFrom > ageTo)
      || (heightFrom != null && heightTo != null && heightFrom > heightTo)
      || (dateFrom != null && dateTo != null && dateTo < dateFrom)
      || FILTERS.some((spec) => spec.type === 'number' && !/** @type {HTMLInputElement|null} */ ($(spec.id))?.validity.valid);
    $('cdRangeError')?.classList.toggle('hidden', !invalid);
    const matchValue = (/** @type {string} */ id, /** @type {any} */ value) => !filterValue(id) || String(value ?? '') === filterValue(id);
    const sessionDate = (/** @type {any} */ candidate) => String(candidate.date_from || '').slice(0, 10);
    filtered = invalid ? [] : candidates.filter((candidate) => {
      const age = currentAge(candidate.date_of_birth);
      const height = candidate.height_cm == null || candidate.height_cm === '' ? null : Number(candidate.height_cm);
      const sdate = sessionDate(candidate);
      if (ageFrom != null && (age == null || age < ageFrom)) return false;
      if (ageTo != null && (age == null || age > ageTo)) return false;
      if (heightFrom != null && (height == null || !Number.isFinite(height) || height < heightFrom)) return false;
      if (heightTo != null && (height == null || !Number.isFinite(height) || height > heightTo)) return false;
      if (dateFrom != null && (!sdate || sdate < dateFrom)) return false;
      if (dateTo != null && (!sdate || sdate > dateTo)) return false;
      return matchValue('cdGender', genderValue(candidate.gender))
        && matchValue('cdTraining', candidate.training_title)
        && matchValue('cdTrainerFilter', candidate.trainer)
        && matchValue('cdBlood', candidate.blood_group)
        && matchValue('cdHealthFilter', booleanValue(candidate.has_health_issues))
        && matchValue('cdEducation', candidate.education_level)
        && matchValue('cdFrench', booleanValue(candidate.is_french_literate))
        && matchValue('cdExperience', booleanValue(candidate.has_security_experience))
        && matchValue('cdPayment', booleanValue(candidate.ispaid))
        && (!q || cols.some((col) => String(col.get(candidate)).toLowerCase().includes(q)));
    });
    const scroll = $('cdGridScroll');
    if (scroll) scroll.scrollTop = 0;
    renderFilterSummary();
    renderSummary();
    renderDemographics();
    renderSizes();
    renderDetails();
  };

  const setSearch = (/** @type {string} */ term) => {
    search = term || '';
    applyFilter();
  };

  // ── Summary ──────────────────────────────────────────────
  const tally = () => {
    let male = 0; let female = 0; let paid = 0; let french = 0; let experienced = 0;
    filtered.forEach((c) => {
      const g = String(c.gender || '').trim().toLowerCase();
      if (g === 'male' || g === 'm') male++;
      else if (g === 'female' || g === 'f') female++;
      if (isTrue(c.ispaid)) paid++;
      if (isTrue(c.is_french_literate)) french++;
      if (isTrue(c.has_security_experience)) experienced++;
    });
    return { enrolled: filtered.length, male, female, paid, french, experienced };
  };

  const renderSummary = () => {
    const s = tally();
    const set = (/** @type {string} */ id, /** @type {string|number} */ v) => { const el = $(id); if (el) el.textContent = String(v); };
    set('cdSumEnrolled', s.enrolled);
    set('cdSumMale', s.male);
    set('cdSumFemale', s.female);
    set('cdSumPaid', s.paid);
    set('cdSumFrench', s.french);
    set('cdSumExperienced', s.experienced);
  };

  // ── Demographics & measurement analytics ─────────────────
  /** Count occurrences of a field across the current candidates, descending. */
  const distribution = (/** @type {(c:any)=>any} */ keyFn) => {
    /** @type {Map<string, number>} */
    const map = new Map();
    filtered.forEach((c) => {
      const raw = keyFn(c);
      const k = raw == null ? '' : String(raw).trim();
      const label = k || t('cdUnknown', 'Unknown');
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  const renderBreakdown = (/** @type {string} */ id, /** @type {{label:string,count:number}[]} */ dist) => {
    const el = $(id);
    if (!el) return;
    if (!dist.length) { el.innerHTML = `<p class="text-xs text-slate-400">${esc(t('cdNoData', 'No data'))}</p>`; return; }
    const max = dist[0].count || 1;
    /** @type {Record<string, string[]>} */
    const palettes = {
      cdKpiGender: ['bg-sky-600', 'bg-sky-400'],
      cdKpiAge: ['bg-amber-600', 'bg-amber-400'],
      cdKpiBlood: ['bg-rose-600', 'bg-rose-400'],
      cdKpiExperience: ['bg-orange-600', 'bg-orange-400'],
      cdKpiMarital: ['bg-indigo-600', 'bg-indigo-400'],
      cdKpiNationality: ['bg-violet-600', 'bg-violet-400'],
      cdKpiHealth: ['bg-emerald-600', 'bg-emerald-400'],
      cdKpiEducation: ['bg-teal-600', 'bg-teal-400'],
    };
    const palette = palettes[id] || ['bg-[#042F8D]'];
    el.innerHTML = dist.map((d, index) => {
      const pct = Math.round((d.count / max) * 100);
      return '<div class="flex items-center gap-2">'
        + `<span class="w-24 shrink-0 break-words text-xs font-medium text-slate-700" title="${esc(d.label)}">${esc(d.label)}</span>`
        + `<span class="relative h-2 min-w-4 flex-1 overflow-hidden rounded-full bg-slate-100"><span class="absolute inset-y-0 left-0 rounded-full ${palette[index % palette.length]}" style="width:${pct}%"></span></span>`
        + `<span class="w-10 shrink-0 text-right text-xs font-bold text-slate-700">${d.count}</span></div>`;
    }).join('');
  };

  const renderDemographics = () => {
    renderBreakdown('cdKpiGender', distribution((candidate) => {
      const value = genderValue(candidate.gender);
      return value === 'M' ? t('cdSumMale', 'Male') : value === 'F' ? t('cdSumFemale', 'Female') : t('cdUnknown', 'Unknown');
    }));
    renderBreakdown('cdKpiAge', distribution((candidate) => {
      const age = currentAge(candidate.date_of_birth);
      return age == null ? t('cdUnknown', 'Unknown') : age < 18 ? '<18' : age < 26 ? '18-25' : age < 36 ? '26-35' : age < 46 ? '36-45' : '46+';
    }));
    renderBreakdown('cdKpiBlood', distribution((candidate) => candidate.blood_group));
    renderBreakdown('cdKpiExperience', distribution((candidate) => candidate.has_security_experience == null ? t('cdUnknown', 'Unknown') : yn(candidate.has_security_experience)));
    renderBreakdown('cdKpiMarital', distribution((c) => c.marital_status));
    renderBreakdown('cdKpiNationality', distribution((c) => c.nationality));
    renderBreakdown('cdKpiHealth', distribution((c) => health(c)));
    renderBreakdown('cdKpiEducation', distribution((c) => c.education_level));
  };

  // Order measurement values ascending: lettered sizes by S→M→L→XL→XXL,
  // numeric sizes by value, everything else alphabetically.
  const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const sortSizesAsc = (/** @type {{label:string,count:number}[]} */ dist) => dist.slice().sort((a, b) => {
    const ra = SIZE_ORDER.indexOf(String(a.label).trim().toUpperCase());
    const rb = SIZE_ORDER.indexOf(String(b.label).trim().toUpperCase());
    if (ra !== -1 && rb !== -1) return ra - rb;
    const na = parseFloat(a.label); const nb = parseFloat(b.label);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.label.localeCompare(b.label);
  });

  const renderSizeCard = (/** @type {string} */ topId, /** @type {string} */ listId, /** @type {(c:any)=>any} */ keyFn) => {
    const dist = distribution(keyFn);
    const top = $(topId);
    const list = $(listId);
    if (top) top.textContent = dist.length ? String(dist[0].label) : '—';
    if (list) {
      list.innerHTML = dist.length
        ? sortSizesAsc(dist).map((d) => `<div class="flex items-center justify-between"><span class="text-slate-500">${esc(d.label)}</span><span class="font-semibold text-slate-700">${d.count}</span></div>`).join('')
        : `<p class="text-slate-400">${esc(t('cdNoData', 'No data'))}</p>`;
    }
  };

  const renderSizes = () => {
    renderSizeCard('cdSizeShoe', 'cdSizeShoeList', (c) => c.shoe_size);
    renderSizeCard('cdSizeShirt', 'cdSizeShirtList', (c) => c.shirt_size);
    renderSizeCard('cdSizeTrouser', 'cdSizeTrouserList', (c) => c.trouser_size);
    renderSizeCard('cdSizeJacket', 'cdSizeJacketList', (c) => c.jacket_size);
  };

  // ── Details grid ─────────────────────────────────────────
  // Build the render plan for the grid: a flat list of columns (real data
  // columns, or a single placeholder per collapsed group) plus the matching
  // group-header cells, with frozen left-offsets for the pinned columns.
  const buildColumns = () => {
    /** @type {any[]} */ const header = [];
    /** @type {any[]} */ const cols = [];
    let left = NO_W;
    GROUPS.forEach((g) => {
      const collapsed = collapsedGroups.has(g.key);
      if (collapsed) {
        const frozen = !!g.frozen;
        header.push({ key: g.key, label: g.label, collapsed: true, colspan: 1, frozen, left: frozen ? NO_W : null });
        cols.push({ kind: 'ph', key: g.key, frozen, left: frozen ? NO_W : null });
        if (frozen) left = NO_W + PH_W;
        return;
      }
      if (g.frozen) {
        const nFroze = Math.min(FROZEN_COLS, g.cols.length);
        header.push({ key: g.key, label: g.label, collapsed: false, colspan: nFroze, frozen: true, left: NO_W, toggle: true });
        const rest = g.cols.length - nFroze;
        if (rest > 0) header.push({ key: g.key, label: g.label, collapsed: false, colspan: rest, frozen: false, toggle: false });
        g.cols.forEach((col, i) => {
          if (i < nFroze) {
            const w = col.w || 100;
            cols.push({ kind: 'col', col, frozen: true, left, w, last: i === nFroze - 1 });
            left += w;
          } else {
            cols.push({ kind: 'col', col, frozen: false });
          }
        });
        return;
      }
      header.push({ key: g.key, label: g.label, collapsed: false, colspan: g.cols.length, frozen: false, toggle: true });
      g.cols.forEach((col) => cols.push({ kind: 'col', col, frozen: false }));
    });
    return { header, cols };
  };

  // +/− control that collapses or expands a single grid section.
  const toggleBtn = (/** @type {string} */ key, /** @type {boolean} */ collapsed) =>
    `<button type="button" data-cd-toggle="${key}" class="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/50 text-[11px] font-bold leading-none text-white hover:bg-white/25 print:hidden" aria-label="${collapsed ? 'expand' : 'collapse'}">${collapsed ? '+' : '−'}</button>`;

  // Inline sizing for a fixed-width (frozen or placeholder) cell.
  const sizeStyle = (/** @type {number} */ left, /** @type {number} */ w, /** @type {boolean} */ frozen) =>
    frozen ? `left:${left}px;min-width:${w}px;max-width:${w}px;width:${w}px` : `min-width:${w}px;max-width:${w}px;width:${w}px`;

  const renderDetails = () => {
    const { header, cols } = buildColumns();
    gridRenderCols = cols;

    const count = $('cdResultCount');
    if (count) count.textContent = String(filtered.length);

    // Group header row: N° (rowspan 2) + one cell per group (split for the
    // frozen group so its pinned part stays column-aligned).
    const groupRow = $('cdGridGroupRow');
    if (groupRow) {
      groupRow.innerHTML = `<th rowspan="2" class="cd-freeze border border-white/20 bg-[#042F8D] px-2 py-2 align-middle font-semibold" style="left:0;min-width:${NO_W}px;max-width:${NO_W}px;width:${NO_W}px">`
        + `${esc(t('cdColRowNo', 'N°'))}</th>`
        + header.map((h) => {
          const label = esc(t(h.key, h.label));
          const frozenCls = h.frozen ? 'cd-freeze cd-freeze-edge ' : '';
          if (h.collapsed) {
            const style = h.frozen ? ` style="${sizeStyle(h.left, PH_W, true)}"` : ` style="${sizeStyle(0, PH_W, false)}"`;
            return `<th class="${frozenCls}border border-white/20 bg-[#042F8D] px-1 py-2 text-center"${style} title="${label}">${toggleBtn(h.key, true)}</th>`;
          }
          const style = h.frozen ? ` style="left:${h.left}px"` : '';
          return `<th colspan="${h.colspan}" class="${frozenCls}border border-white/20 bg-[#042F8D] px-2 py-2 text-center font-bold uppercase tracking-wide"${style}>${label}${h.toggle ? toggleBtn(h.key, false) : ''}</th>`;
        }).join('');
    }

    // Sub-header row: one cell per render column (frozen cells stay pinned).
    const headRow = $('cdGridHeadRow');
    if (headRow) {
      headRow.innerHTML = cols.map((rc) => {
        if (rc.kind === 'ph') {
          const cls = rc.frozen ? 'cd-freeze cd-freeze-edge ' : '';
          return `<th class="${cls}whitespace-nowrap border border-white/20 bg-[#0b4dc2] px-1 py-1.5 text-center font-semibold" style="${sizeStyle(rc.left, PH_W, rc.frozen)}">·</th>`;
        }
        const cls = rc.frozen ? `cd-freeze ${rc.last ? 'cd-freeze-edge ' : ''}` : '';
        const style = rc.frozen ? ` style="${sizeStyle(rc.left, rc.w, true)}"` : '';
        return `<th class="${cls}whitespace-nowrap border border-white/20 bg-[#0b4dc2] px-2 py-1.5 text-center font-semibold"${style}>${esc(t(rc.col.key, rc.col.label))}</th>`;
      }).join('');
    }

    // Body rows are mounted lazily (see appendGridRows / onGridScroll) so the
    // whole dataset is never rendered at once.
    const body = $('cdGridBody');
    if (body) {
      body.innerHTML = '';
      gridRendered = 0;
      if (!filtered.length) {
        const msg = search.trim() ? t('cdNoMatch', 'No candidates match your search.') : t('cdNoCandidates', 'No candidates enrolled.');
        body.innerHTML = `<tr><td class="px-3 py-6 text-center text-sm text-slate-400" colspan="${cols.length + 1}">${esc(msg)}</td></tr>`;
      } else {
        appendGridRows();
        fillGridViewport();
      }
    }
  };

  // Append the next batch of grid rows. Rows already in the DOM are never
  // re-rendered, so repeated calls never duplicate records.
  const appendGridRows = () => {
    const body = $('cdGridBody');
    if (!body || gridRendered >= filtered.length) return;
    const cols = gridRenderCols;
    const next = Math.min(gridRendered + GRID_PAGE, filtered.length);
    let html = '';
    for (let i = gridRendered; i < next; i += 1) {
      const c = filtered[i];
      const cells = cols.map((rc) => {
        if (rc.kind === 'ph') {
          const cls = rc.frozen ? 'cd-freeze cd-freeze-edge ' : '';
          return `<td class="${cls}whitespace-nowrap border border-slate-100 px-1 py-1.5 text-center text-slate-300" style="${sizeStyle(rc.left, PH_W, rc.frozen)}">·</td>`;
        }
        const cls = rc.frozen ? `cd-freeze ${rc.last ? 'cd-freeze-edge ' : ''}` : '';
        const style = rc.frozen ? ` style="${sizeStyle(rc.left, rc.w, true)}"` : '';
        return `<td class="${cls}whitespace-nowrap border border-slate-100 px-2 py-1.5 text-center text-slate-700"${style}>${esc(rc.col.get(c))}</td>`;
      }).join('');
      html += '<tr class="hover:bg-slate-50/60">'
        + `<td class="cd-freeze border-r border-slate-100 bg-white px-2 py-1.5 text-center font-mono font-semibold text-slate-800" style="left:0;min-width:${NO_W}px;max-width:${NO_W}px;width:${NO_W}px">${String(i + 1).padStart(2, '0')}</td>`
        + `${cells}</tr>`;
    }
    body.insertAdjacentHTML('beforeend', html);
    gridRendered = next;
  };

  // Keep loading batches until the grid scrolls or every row is shown, so a
  // short first page still fills the visible area.
  const fillGridViewport = () => {
    const sc = $('cdGridScroll');
    if (!sc) return;
    let guard = 0;
    while (gridRendered < filtered.length && sc.scrollHeight <= sc.clientHeight + 40 && guard < 50) {
      appendGridRows();
      guard += 1;
    }
  };

  // Load more rows as the user nears the bottom of the grid's own scroll box.
  const onGridScroll = () => {
    const sc = $('cdGridScroll');
    if (!sc || gridRendered >= filtered.length) return;
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 200) appendGridRows();
  };

  // ── Export (genuine .xlsx — Office Open XML, no external deps) ──
  const xmlEsc = (/** @type {any} */ s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const colLetter = (/** @type {number} */ n) => {
    let s = ''; let x = n + 1;
    while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
    return s;
  };

  /** @type {Uint32Array | null} */
  let CRC_TABLE = null;
  const crc32 = (/** @type {Uint8Array} */ bytes) => {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[i] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  const zipStore = (/** @type {{ name: string, data: Uint8Array }[]} */ files) => {
    const enc = new TextEncoder();
    const u16 = (/** @type {number} */ v) => [v & 0xFF, (v >>> 8) & 0xFF];
    const u32 = (/** @type {number} */ v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    /** @type {Uint8Array[]} */ const parts = [];
    /** @type {Uint8Array[]} */ const central = [];
    let offset = 0;
    files.forEach((f) => {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;
      const local = Uint8Array.from(/** @type {number[]} */ ([]).concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
      ));
      parts.push(local, nameBytes, data);
      central.push(Uint8Array.from(/** @type {number[]} */ ([]).concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset),
      )), nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    let cdSize = 0; central.forEach((c) => { cdSize += c.length; });
    const eocd = Uint8Array.from(/** @type {number[]} */ ([]).concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cdSize), u32(offset), u16(0),
    ));
    const all = parts.concat(central, [eocd]);
    let total = 0; all.forEach((a) => { total += a.length; });
    const out = new Uint8Array(total);
    let p = 0; all.forEach((a) => { out.set(a, p); p += a.length; });
    return out;
  };

  // cellXfs order: 0 default, 1 metaLabel, 2 metaVal, 3 groupHeader(blue),
  // 4 rowNo, 5 dataCell, 6 subHeader(blue), 7 banner, 8 subtitle.
  const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="4">'
    + '<font><sz val="10"/><name val="Calibri"/><color rgb="FF000000"/></font>'
    + '<font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF000000"/></font>'
    + '<font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>'
    + '<font><b/><sz val="16"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>'
    + '</fonts>'
    + '<fills count="6">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF042F8D"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF0B4DC2"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2">'
    + '<border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border>'
    + '<left style="thin"><color rgb="FF000000"/></left>'
    + '<right style="thin"><color rgb="FF000000"/></right>'
    + '<top style="thin"><color rgb="FF000000"/></top>'
    + '<bottom style="thin"><color rgb="FF000000"/></bottom>'
    + '<diagonal/>'
    + '</border>'
    + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="9">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

  /**
   * @param {(string|number|{v: string|number, s: number})[][]} rows
   * @param {{ cols?: {min:number,max:number,width:number}[], merges?: string[], rowHeights?: Record<number, number> }} [opts]
   */
  const downloadXlsx = (/** @type {string} */ filename, /** @type {string} */ sheetName, rows, opts) => {
    const o = opts || {};
    const valOf = (/** @type {any} */ c) => (c && typeof c === 'object' && 'v' in c) ? c.v : c;
    const styleOf = (/** @type {any} */ c) => (c && typeof c === 'object' && 's' in c) ? (c.s || 0) : 0;
    const heights = o.rowHeights || {};
    let rowsXml = '';
    rows.forEach((row, r) => {
      let cellsXml = '';
      row.forEach((cell, c) => {
        const s = styleOf(cell);
        const sAttr = s ? ` s="${s}"` : '';
        cellsXml += `<c r="${colLetter(c) + (r + 1)}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(valOf(cell))}</t></is></c>`;
      });
      const ht = heights[r];
      const htAttr = ht ? ` ht="${ht}" customHeight="1"` : '';
      rowsXml += `<row r="${r + 1}"${htAttr}>${cellsXml}</row>`;
    });
    const colsXml = (o.cols && o.cols.length)
      ? '<cols>' + o.cols.map((c) => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`).join('') + '</cols>'
      : '';
    const mergeXml = (o.merges && o.merges.length)
      ? `<mergeCells count="${o.merges.length}">` + o.merges.map((m) => `<mergeCell ref="${m}"/>`).join('') + '</mergeCells>'
      : '';
    const safeSheet = xmlEsc(String(sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + colsXml + '<sheetData>' + rowsXml + '</sheetData>' + mergeXml + '</worksheet>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>';
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';
    const enc = new TextEncoder();
    const zip = zipStore([
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rootRels) },
      { name: 'xl/workbook.xml', data: enc.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
      { name: 'xl/styles.xml', data: enc.encode(XLSX_STYLES) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml) },
    ]);
    const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const exportExcel = () => {
    if (!filtered.length) { window.alert(t('cdNoCandidates', 'No candidates enrolled.')); return; }
    const ST = { metaLabel: 1, metaVal: 2, group: 3, rowNo: 4, data: 5, sub: 6, banner: 7 };
    const cols = flatCols();
    const totalCols = 2 + cols.length; // col A spacer + N° + data columns
    const lastCol = colLetter(totalCols - 1);

    /** Full-width banner row: text in col B, styled fill across B..last. */
    const bannerRow = (/** @type {string} */ text, /** @type {number} */ style) => {
      /** @type {any[]} */ const r = [''];
      for (let i = 1; i < totalCols; i++) r.push({ v: i === 1 ? text : '', s: style });
      return r;
    };

    /** @type {(string|number|{v: string|number, s: number})[][]} */
    const rows = [];
    /** @type {Record<number, number>} */
    const rowHeights = {};
    /** @type {string[]} */
    const merges = [];

    // Title banner + subtitle (merged across the full table width).
    rows.push(bannerRow(t('cdReportTitle', 'Candidate Details Report'), ST.banner));
    rowHeights[0] = 28;
    merges.push(`B1:${lastCol}1`);
    rows.push(bannerRow(`${t('cdSumEnrolled', 'Enrolled')}: ${filtered.length}`, ST.metaVal));
    merges.push(`B2:${lastCol}2`);
    rows.push([]);

    // Group header row: spacer, N° (merged down two rows), one merged cell per group.
    const groupHeaderRowIdx = rows.length;
    /** @type {any[]} */
    const groupRow = ['', { v: t('cdColRowNo', 'N°'), s: ST.group }];
    let colCursor = 2; // zero-based column index where the first group starts
    GROUPS.forEach((g) => {
      const start = colCursor;
      g.cols.forEach((_, idx) => { groupRow.push({ v: idx === 0 ? t(g.key, g.label) : '', s: ST.group }); });
      const end = colCursor + g.cols.length - 1;
      if (g.cols.length > 1) merges.push(`${colLetter(start) + (groupHeaderRowIdx + 1)}:${colLetter(end) + (groupHeaderRowIdx + 1)}`);
      colCursor = end + 1;
    });
    // Merge N° vertically across the two header rows.
    merges.push(`B${groupHeaderRowIdx + 1}:B${groupHeaderRowIdx + 2}`);
    rowHeights[groupHeaderRowIdx] = 24;
    rows.push(groupRow);

    // Sub-header row: spacer, blank under N°, one cell per column.
    /** @type {any[]} */
    const subRow = ['', { v: '', s: ST.group }];
    cols.forEach((col) => subRow.push({ v: t(col.key, col.label), s: ST.sub }));
    rowHeights[rows.length] = 30;
    rows.push(subRow);

    // Data rows
    filtered.forEach((c, i) => {
      /** @type {any[]} */
      const row = ['', { v: String(i + 1).padStart(2, '0'), s: ST.rowNo }];
      cols.forEach((col) => row.push({ v: col.get(c), s: ST.data }));
      rows.push(row);
    });

    const xcols = [{ min: 1, max: 1, width: 3 }, { min: 2, max: 2, width: 5 }, { min: 3, max: totalCols, width: 16 }];
    const stamp = new Date().toISOString().slice(0, 10);
    downloadXlsx(`candidate-details-${stamp}.xlsx`, t('cdReportTitle', 'Candidate Details Report'), rows, { cols: xcols, merges, rowHeights });
  };

  const doPrint = () => { window.print(); };

  // ── Collapsible sections ─────────────────────────────────
  const initCollapsible = () => {
    const legends = /** @type {HTMLElement[]} */ (Array.prototype.slice.call(document.querySelectorAll('fieldset > legend')));
    legends.forEach((legend) => {
      const fs = legend.parentElement;
      if (!fs || legend.dataset.collapsible === '1') return;
      const body = /** @type {HTMLElement[]} */ (Array.prototype.filter.call(fs.children, (/** @type {Element} */ el) => el !== legend));
      if (!body.length) return;
      legend.dataset.collapsible = '1';
      legend.classList.add('cursor-pointer', 'select-none');
      legend.setAttribute('role', 'button');
      legend.setAttribute('tabindex', '0');
      legend.setAttribute('aria-expanded', 'true');
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('viewBox', '0 0 24 24');
      chevron.setAttribute('fill', 'none');
      chevron.setAttribute('stroke', 'currentColor');
      chevron.setAttribute('stroke-width', '2.5');
      chevron.setAttribute('stroke-linecap', 'round');
      chevron.setAttribute('stroke-linejoin', 'round');
      chevron.setAttribute('class', 'h-3.5 w-3.5 shrink-0 transition-transform duration-200');
      chevron.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
      legend.appendChild(chevron);
      const setState = (/** @type {boolean} */ collapsed) => {
        body.forEach((el) => el.classList.toggle('hidden', collapsed));
        chevron.classList.toggle('-rotate-90', collapsed);
        legend.setAttribute('aria-expanded', String(!collapsed));
      };
      legend.addEventListener('click', () => setState(legend.getAttribute('aria-expanded') === 'true'));
      legend.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setState(legend.getAttribute('aria-expanded') === 'true'); }
      });
    });
    // Reveal every collapsed section before printing so nothing is lost in the PDF.
    window.addEventListener('beforeprint', () => {
      legends.forEach((legend) => { if (legend.getAttribute('aria-expanded') === 'false') legend.click(); });
    });
  };

  // ── Wiring ───────────────────────────────────────────────
  const wire = () => {
    $('btnExcel')?.addEventListener('click', exportExcel);
    $('btnPrint')?.addEventListener('click', doPrint);
    $('cdSearch')?.addEventListener('input', (e) => {
      search = /** @type {HTMLInputElement} */ (e.target).value;
      clearTimeout(filterTimer);
      filterTimer = window.setTimeout(applyFilter, 180);
    });
    $('cdRetry')?.addEventListener('click', load);
    $('cdResetFilters')?.addEventListener('click', () => {
      clearTimeout(filterTimer);
      FILTERS.forEach((spec) => { const control = /** @type {HTMLInputElement|HTMLSelectElement|null} */ ($(spec.id)); if (control) control.value = ''; });
      const searchInput = /** @type {HTMLInputElement|null} */ ($('cdSearch'));
      if (searchInput) searchInput.value = '';
      setSearch('');
    });
    $('cdGridScroll')?.addEventListener('scroll', onGridScroll, { passive: true });
    // Delegated +/− handler: collapse/expand a single grid section.
    $('cdGrid')?.addEventListener('click', (e) => {
      const btn = /** @type {HTMLElement} */ (e.target)?.closest?.('[data-cd-toggle]');
      const key = btn?.getAttribute('data-cd-toggle');
      if (!key) return;
      if (collapsedGroups.has(key)) collapsedGroups.delete(key); else collapsedGroups.add(key);
      renderDetails();
    });

    window.addEventListener('storage', (e) => {
      if (e.key === GSS_LANG_KEY && e.newValue) setLang(e.newValue);
    });
    window.addEventListener('focus', () => {
      try {
        const saved = localStorage.getItem(GSS_LANG_KEY);
        if (saved === 'fr' || saved === 'en') setLang(saved);
      } catch (_) { /* noop */ }
    });
  };

  // ── Access control ───────────────────────────────────────
  const denyAccess = () => {
    document.body.innerHTML = `<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <span class="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600"><svg class="h-8 w-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
      <h1 class="text-xl font-bold text-slate-900">403</h1>
      <p class="max-w-sm text-sm text-slate-500">${esc(t('cdAccessDenied', 'Access denied'))}</p>
      <a href="../../tc.html" class="rounded-lg bg-[#042F8D] px-4 py-2 text-sm font-semibold text-white">${esc(t('cdBack', 'Back'))}</a>
    </div>`;
  };

  const init = () => {
    const saved = (() => { try { return localStorage.getItem(GSS_LANG_KEY); } catch (_) { return null; } })();
    lang = saved === 'fr' || saved === 'en' ? saved : 'en';

    applyLang();
    if (!GSSAccess.canViewReports()) { denyAccess(); return; }

    wire();
    initFilters();
    initCollapsible();
    load();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
