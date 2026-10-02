// @ts-check
/// <reference path="../../js/global.js" />
/// <reference path="../../js/utils/translation.js" />
/**
 * GSS · Attendance Report
 * ==================================================================
 * Standalone reporting dashboard (reports/attendance-sheet/*.html).
 *
 * Flow: pick a Year → a Month → a Course conducted that month. The report
 * then shows the course instructor, an Attendance Summary (days / AH / AR /
 * ABS / EX / rate) and an Attendance Details matrix (candidates × dates).
 * Export to a native .xlsx workbook and print via the browser.
 *
 * Data sources (all resolved by training_id — see TC/server/index.js):
 *   • /api/reports/training-register  → every session (year/month/course/instructor)
 *   • /api/training/students          → the course roster
 *   • /api/attendance                 → the daily AH/AR/ABS/EX cells
 *
 * Localization reuses the shared `translations` dictionary (translation.js)
 * and the `gss-lang` localStorage key, so no user-facing text is hard-coded.
 * The structure is intentionally modular so richer analytics can be layered
 * on later without reworking the selection / summary / details pipeline.
 */
(() => {
  'use strict';

  /** @type {any[]} full session list from the API */
  let sessions = [];
  let lang = 'en';
  let selectedYear = new Date().getFullYear();
  /** @type {number|null} zero-based month */
  let selectedMonth = null;
  /** @type {any|null} the selected session row */
  let current = null;
  /** @type {string[]} ISO (YYYY-MM-DD) date columns for the current course */
  let currentDates = [];
  /** @type {Record<string, string>} `${candidate_no}|${iso}` → status */
  let statusMap = {};
  /** @type {{ no: string, name: string }[]} roster for the current course */
  let roster = [];
  let printing = false;
  let search = '';

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
  const fmtTime = (/** @type {string} */ iso) => { const d = toDate(iso); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—'; };
  const esc = (/** @type {any} */ s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

  const trainingCode = (/** @type {any} */ r) => {
    const d = toDate(r.date_from);
    const year = d ? d.getFullYear() : new Date().getFullYear();
    return `GSS-TR-${year}-${String(r.training_id).padStart(3, '0')}`;
  };

  // Training titles are stored as "CODE - Description" (e.g. "FIAS - Initial
  // Security Agent Training"): the code (before the dash) labels the course,
  // the description (after the dash) is the readable title. Titles without a
  // dash fall back to their initials for the code and themselves for the title.
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

  const monthNames = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  };
  const monthShort = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    fr: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
  };
  const dayInitials = {
    en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    fr: ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'],
  };
  const lc = () => (lang === 'fr' ? 'fr' : 'en');

  const isoOf = (/** @type {string} */ iso) => String(iso || '').slice(0, 10);

  // ── Localization ─────────────────────────────────────────
  const applyLang = () => {
    const d = dict();
    document.documentElement.lang = lang;
    document.title = `GSS · ${t('arReportTitle', 'Attendance Report')}`;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key && d[key]) el.textContent = d[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key && d[key]) /** @type {HTMLInputElement} */ (el).placeholder = d[key];
    });
  };

  const setLang = (/** @type {string} */ next) => {
    const resolved = next === 'fr' ? 'fr' : 'en';
    if (resolved === lang) return;
    lang = resolved;
    applyLang();
    renderYearOptions();
    renderMonths();
    renderCourses();
    renderInstructor();
    renderSummary();
    renderDetails();
    updateGenDate();
  };

  const updateGenDate = () => {
    const now = new Date();
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
    const text = now.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    const el = $('arGenDate'); if (el) el.textContent = text;
    const pdf = $('arGenDatePdf'); if (pdf) pdf.textContent = text;
  };

  // ── Data ─────────────────────────────────────────────────
  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reports/training-register`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = /** @type {any} */ (await res.json());
      sessions = Array.isArray(data && data.trainings) ? data.trainings : [];
    } catch (err) {
      console.error('Attendance report load failed:', err);
      sessions = [];
    }
    initSelection();
    hideSkeleton();
  };

  /** Sessions whose start date falls in the given year/month (zero-based). */
  const sessionsIn = (/** @type {number} */ year, /** @type {number} */ month) =>
    sessions.filter((s) => { const d = toDate(s.date_from); return d && d.getFullYear() === year && d.getMonth() === month; });

  /** Months (zero-based) of the selected year that have at least one course. */
  const monthsWithCourses = (/** @type {number} */ year) => {
    const set = new Set();
    sessions.forEach((s) => { const d = toDate(s.date_from); if (d && d.getFullYear() === year) set.add(d.getMonth()); });
    return set;
  };

  /** State of a month: 'none' | 'active' | 'completed'. */
  const monthState = (/** @type {number} */ year, /** @type {number} */ month) => {
    const list = sessionsIn(year, month);
    if (!list.length) return 'none';
    return list.every((s) => s.status === 'Completed') ? 'completed' : 'active';
  };

  const availableYears = () => {
    const now = new Date().getFullYear();
    const set = new Set();
    for (let y = now; y <= now + 4; y++) set.add(y);
    sessions.forEach((s) => { const d = toDate(s.date_from); if (d) set.add(d.getFullYear()); });
    return Array.from(/** @type {Set<number>} */ (set)).sort((a, b) => a - b);
  };

  const initSelection = () => {
    const years = availableYears();
    const now = new Date();
    // Prefer the current year; else the most recent year that actually has courses.
    if (sessions.some((s) => { const d = toDate(s.date_from); return d && d.getFullYear() === now.getFullYear(); })) {
      selectedYear = now.getFullYear();
    } else {
      const withCourses = years.filter((y) => monthsWithCourses(y).size > 0);
      selectedYear = withCourses.length ? withCourses[withCourses.length - 1] : (years[0] || now.getFullYear());
    }
    renderYearOptions();
    /** @type {HTMLSelectElement} */ ($('arYear')).value = String(selectedYear);
    selectYear(selectedYear);
    updateGenDate();
  };

  // ── Selection rendering ──────────────────────────────────
  const renderYearOptions = () => {
    const sel = /** @type {HTMLSelectElement} */ ($('arYear'));
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = availableYears().map((y) => `<option value="${y}">${y}</option>`).join('');
    if (prev) sel.value = prev;
  };

  const selectYear = (/** @type {number} */ year) => {
    selectedYear = year;
    const withCourses = monthsWithCourses(year);
    const now = new Date();
    // Default month: the current month (if it has courses) else the most recent.
    if (year === now.getFullYear() && withCourses.has(now.getMonth())) {
      selectedMonth = now.getMonth();
    } else if (withCourses.size) {
      selectedMonth = Math.max(...Array.from(/** @type {Set<number>} */ (withCourses)).map(Number));
    } else {
      selectedMonth = null;
    }
    renderMonths();
    selectMonth(selectedMonth);
  };

  const renderMonths = () => {
    const wrap = $('arMonths');
    if (!wrap) return;
    const names = monthShort[lc()];
    wrap.innerHTML = '';
    for (let m = 0; m < 12; m++) {
      const state = monthState(selectedYear, m);
      const selected = m === selectedMonth;
      const btn = document.createElement('button');
      btn.type = 'button';
      const base = 'rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors';
      let tone = 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed';
      if (state === 'active') tone = 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100';
      else if (state === 'completed') tone = 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
      const ring = selected ? ' ring-2 ring-[#042F8D] ring-offset-1' : '';
      btn.className = `${base} ${tone}${ring}`;
      btn.textContent = names[m];
      if (state === 'none') { btn.disabled = true; } else { btn.addEventListener('click', () => selectMonth(m)); }
      wrap.appendChild(btn);
    }
  };

  const selectMonth = (/** @type {number|null} */ month) => {
    selectedMonth = month;
    renderMonths();
    renderCourses();
    const list = month == null ? [] : sessionsIn(selectedYear, month);
    // Auto-select the first course so the summary / details populate.
    selectCourse(list.length ? list[0] : null);
  };

  const renderCourses = () => {
    const wrap = $('arCourses');
    const empty = $('arCoursesEmpty');
    if (!wrap || !empty) return;
    const list = selectedMonth == null ? [] : sessionsIn(selectedYear, selectedMonth);
    wrap.innerHTML = '';
    empty.classList.toggle('hidden', list.length > 0);
    list.forEach((s) => {
      const selected = current && current.training_id === s.training_id;
      const btn = document.createElement('button');
      btn.type = 'button';
      const base = 'flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors';
      const tone = selected
        ? 'border-[#042F8D] bg-[#042F8D]/10 ring-2 ring-[#042F8D]/30'
        : 'border-slate-200 bg-white hover:border-[#042F8D]/40 hover:bg-[#042F8D]/5';
      btn.className = `${base} ${tone}`;
      btn.innerHTML = `<span class="flex items-center gap-1.5 text-sm font-semibold text-slate-800">`
        + `<span class="rounded bg-[#042F8D]/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-bold text-[#042F8D]">${esc(courseCode(s))}</span>`
        + `${esc(courseTitleFromTitle(s.training_title))}</span>`
        + `<span class="text-xs text-slate-400">${esc(fmtDate(s.date_from))} → ${esc(fmtDate(s.date_to))}</span>`;
      btn.addEventListener('click', () => selectCourse(s));
      wrap.appendChild(btn);
    });
  };

  const renderInstructor = () => {
    const bar = $('arInstructorBar');
    const name = $('arInstructorName');
    if (!bar || !name) return;
    if (current) {
      bar.classList.remove('hidden');
      bar.classList.add('flex');
      name.textContent = current.trainer || '—';
    } else {
      bar.classList.add('hidden');
      bar.classList.remove('flex');
    }
  };

  const selectCourse = async (/** @type {any|null} */ s) => {
    current = s;
    search = '';
    renderCourses();
    renderInstructor();
    if (!s) {
      currentDates = []; statusMap = {}; roster = [];
      renderSummary();
      renderDetails();
      return;
    }
    await loadDetail(s.training_id);
    renderSummary();
    renderDetails();
  };

  const loadDetail = async (/** @type {number} */ trainingId) => {
    currentDates = []; statusMap = {}; roster = [];
    try {
      const [attRes, stuRes] = await Promise.all([
        fetch(`${API_BASE}/api/attendance?training_id=${encodeURIComponent(String(trainingId))}`, { headers: { Accept: 'application/json' } }),
        fetch(`${API_BASE}/api/training/students?training_id=${encodeURIComponent(String(trainingId))}`, { headers: { Accept: 'application/json' } }),
      ]);
      const attData = /** @type {any} */ (await attRes.json());
      const stuData = /** @type {any} */ (await stuRes.json());
      const att = Array.isArray(attData && attData.attendance) ? attData.attendance : [];
      const students = Array.isArray(stuData && stuData.students) ? stuData.students : [];

      const dateSet = new Set();
      att.forEach((/** @type {any} */ a) => {
        const iso = isoOf(a.attendance_date);
        if (iso) dateSet.add(iso);
        statusMap[`${a.candidate_no}|${iso}`] = String(a.status || '');
      });
      // Always lay out every calendar day across the training span so the grid
      // reads as a continuous timeline (empty days included); any attendance
      // dated outside the declared range is folded in defensively.
      if (current) {
        const from = toDate(current.date_from);
        const to = toDate(current.date_to);
        if (from && to) {
          const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
          const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
          while (d <= end) { dateSet.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); d.setDate(d.getDate() + 1); }
        }
      }
      currentDates = Array.from(/** @type {Set<string>} */ (dateSet)).sort();

      // Roster: prefer the enrolled list; else derive from attendance rows.
      const rosterMap = new Map();
      students.forEach((/** @type {any} */ s) => {
        const no = s.candidate_no != null ? String(s.candidate_no) : '';
        if (no) rosterMap.set(no, s.full_name || '');
      });
      if (!rosterMap.size) att.forEach((/** @type {any} */ a) => { const no = String(a.candidate_no); if (no) rosterMap.set(no, ''); });
      roster = Array.from(rosterMap.entries())
        .map(([no, name]) => ({ no, name: /** @type {string} */ (name) }))
        .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0) || a.no.localeCompare(b.no));
    } catch (err) {
      console.error('Attendance detail load failed:', err);
    }
  };

  // ── Summary ──────────────────────────────────────────────
  const AT_RISK_THRESHOLD = 80; // % below which a candidate is flagged "at risk"

  const tally = () => {
    let ah = 0; let ar = 0; let abs = 0; let ex = 0;
    const dayset = new Set();
    Object.keys(statusMap).forEach((k) => {
      const iso = k.slice(k.indexOf('|') + 1);
      if (iso) dayset.add(iso);
      switch (statusMap[k]) {
        case 'AH': ah++; break;
        case 'AR': ar++; break;
        case 'ABS': abs++; break;
        case 'EX': ex++; break;
        default: break;
      }
    });
    const denom = ah + ar + abs;
    const rate = denom ? Math.round(((ah + ar) / denom) * 100) : 0;
    const punctual = (ah + ar) ? Math.round((ah / (ah + ar)) * 100) : 0;

    // Per-candidate pass: count at-risk and perfect attendees.
    let atRisk = 0; let perfect = 0;
    roster.forEach((p) => {
      let pAh = 0; let pAr = 0; let pAbs = 0;
      currentDates.forEach((iso) => {
        switch (statusMap[`${p.no}|${iso}`]) {
          case 'AH': pAh++; break;
          case 'AR': pAr++; break;
          case 'ABS': pAbs++; break;
          default: break;
        }
      });
      const pDenom = pAh + pAr + pAbs;
      if (!pDenom) return;
      const pRate = Math.round(((pAh + pAr) / pDenom) * 100);
      if (pRate < AT_RISK_THRESHOLD) atRisk++;
      if (pAbs === 0 && pAr === 0) perfect++;
    });

    return { days: dayset.size, ah, ar, abs, ex, rate, punctual, enrolled: roster.length, atRisk, perfect };
  };

  const renderSummary = () => {
    const s = current ? tally() : { days: 0, ah: 0, ar: 0, abs: 0, ex: 0, rate: 0, punctual: 0, enrolled: 0, atRisk: 0, perfect: 0 };
    const set = (/** @type {string} */ id, /** @type {string|number} */ v) => { const el = $(id); if (el) el.textContent = String(v); };
    set('arSumDays', s.days);
    set('arSumEnrolled', s.enrolled);
    set('arSumOnTime', s.ah);
    set('arSumLate', s.ar);
    set('arSumAbsent', s.abs);
    set('arSumExcluded', s.ex);
    set('arSumRate', `${s.rate}%`);
    set('arSumPunctual', `${s.punctual}%`);
    set('arSumPerfect', s.perfect);
    set('arSumAtRisk', s.atRisk);
  };

  // ── Details matrix ───────────────────────────────────────
  const CELL_STYLES = {
    AH: 'bg-emerald-100 text-emerald-700',
    AR: 'bg-amber-100 text-amber-700',
    ABS: 'bg-rose-100 text-rose-700',
    EX: 'bg-slate-200 text-slate-600',
  };

  // ── Analysis charts (SVG, no external dependencies) ──────
  const STATUS_HEX = { AH: '#10b981', AR: '#f59e0b', ABS: '#f43f5e', EX: '#94a3b8' };

  const renderAnalysis = () => {
    const wrap = $('arAnalysis');
    const donut = $('arDonut');
    const legend = $('arDonutLegend');
    const daily = $('arDaily');
    if (!wrap || !donut || !legend || !daily) return;
    if (!current) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');

    const s = tally();
    const segs = [
      { label: t('arLegendAH', 'Arrived On Time'), val: s.ah, color: STATUS_HEX.AH },
      { label: t('arLegendAR', 'Arrived Late'), val: s.ar, color: STATUS_HEX.AR },
      { label: t('arLegendABS', 'Absent'), val: s.abs, color: STATUS_HEX.ABS },
      { label: t('arLegendEX', 'Permanently Expelled'), val: s.ex, color: STATUS_HEX.EX },
    ];
    const total = segs.reduce((a, b) => a + b.val, 0);

    // Donut: concatenated arc segments drawn with stroke-dasharray.
    const R = 54; const C = 2 * Math.PI * R; const cx = 70; const cy = 70;
    let off = 0;
    const arcs = total
      ? segs.filter((x) => x.val > 0).map((seg) => {
        const dash = (seg.val / total) * C;
        const el = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${seg.color}" stroke-width="20" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
        off += dash;
        return el;
      }).join('')
      : `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#e2e8f0" stroke-width="20"></circle>`;
    donut.innerHTML = `<svg viewBox="0 0 140 140" class="h-40 w-40">${arcs}`
      + `<text x="70" y="66" text-anchor="middle" fill="#0f172a" style="font-size:22px;font-weight:700">${s.rate}%</text>`
      + `<text x="70" y="84" text-anchor="middle" fill="#94a3b8" style="font-size:8px;letter-spacing:.1em">${esc(t('arSumRate', 'Attendance rate').toUpperCase())}</text></svg>`;
    legend.innerHTML = segs.map((seg) => {
      const pct = total ? Math.round((seg.val / total) * 100) : 0;
      return `<span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${seg.color}"></span>`
        + `<span class="truncate font-medium text-slate-600">${esc(seg.label)}</span>`
        + `<span class="ml-auto whitespace-nowrap font-bold text-slate-800">${seg.val} · ${pct}%</span></span>`;
    }).join('');

    // Daily attendance rate: one bar per recorded day, coloured by threshold.
    const days = currentDates.filter((iso) => roster.some((p) => statusMap[`${p.no}|${iso}`]));
    if (!days.length) {
      daily.innerHTML = `<p class="py-10 text-center text-sm text-slate-400">${esc(t('arChartNoData', 'No attendance data to display.'))}</p>`;
      return;
    }
    const barW = 26; const gap = 10; const H = 150; const PAD = 24;
    const width = PAD + days.length * (barW + gap);
    const bars = days.map((iso, i) => {
      let ah = 0; let ar = 0; let abs = 0;
      roster.forEach((p) => { const st = statusMap[`${p.no}|${iso}`]; if (st === 'AH') ah++; else if (st === 'AR') ar++; else if (st === 'ABS') abs++; });
      const denom = (ah + ar + abs) || 1;
      const rate = Math.round(((ah + ar) / denom) * 100);
      const x = PAD + i * (barW + gap);
      const barH = Math.max(2, Math.round((rate / 100) * H));
      const y = PAD + (H - barH);
      const d = toDate(iso);
      const lbl = d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : '';
      const color = rate >= 80 ? STATUS_HEX.AH : rate >= 50 ? STATUS_HEX.AR : STATUS_HEX.ABS;
      return `<g>`
        + `<rect x="${x}" y="${PAD}" width="${barW}" height="${H}" rx="4" fill="#f1f5f9"></rect>`
        + `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${color}"><title>${lbl}: ${rate}%</title></rect>`
        + `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" fill="#475569" style="font-size:8px;font-weight:700">${rate}</text>`
        + `<text x="${x + barW / 2}" y="${PAD + H + 14}" text-anchor="middle" fill="#94a3b8" style="font-size:8px">${lbl}</text>`
        + `</g>`;
    }).join('');
    daily.innerHTML = `<svg viewBox="0 0 ${width} ${H + PAD + 24}" style="min-width:${width}px" class="h-56">${bars}</svg>`;
  };

  const isWeekend = (/** @type {string} */ iso) => { const d = toDate(iso); return !!d && (d.getDay() === 0 || d.getDay() === 6); };

  const dateHeadHtml = (/** @type {string} */ iso) => {
    const d = toDate(iso);
    if (!d) return `<th class="px-1 py-2 text-center font-semibold">—</th>`;
    const wd = dayInitials[lc()][d.getDay()];
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const cls = weekend ? ' bg-white/10' : '';
    const numCls = weekend ? ' text-sky-200' : '';
    return `<th class="whitespace-nowrap px-1.5 py-2 text-center font-semibold${cls}">`
      + `<span class="block${numCls}">${pad(d.getDate())}/${pad(d.getMonth() + 1)}</span>`
      + `<span class="block text-[0.6rem] font-normal opacity-80">${wd}</span></th>`;
  };

  const renderDetails = () => {
    const empty = $('arDetailsEmpty');
    const box = $('arDetails');
    if (!empty || !box) return;
    if (!current) {
      empty.classList.remove('hidden');
      box.classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    box.classList.remove('hidden');

    // Meta block
    const setTxt = (/** @type {string} */ id, /** @type {string} */ v) => { const el = $(id); if (el) el.textContent = v; };
    setTxt('arMetaNo', trainingCode(current));
    setTxt('arMetaTitle', courseTitle(current) || '—');
    setTxt('arMetaStart', fmtDate(current.date_from));
    setTxt('arMetaEnd', fmtDate(current.date_to));
    setTxt('arMetaStartTime', fmtTime(current.date_from));
    setTxt('arMetaEndTime', fmtTime(current.date_to));
    setTxt('arMetaTrainer', current.trainer || '—');

    // Header row
    const head = $('arGridHead');
    if (head) {
      head.innerHTML = `<th class="sticky left-0 z-10 min-w-[7rem] bg-[#042F8D] px-3 py-2 text-left font-semibold">`
        + `${esc(t('arCandidateNo', 'Candidate No.'))}</th>`
        + currentDates.map(dateHeadHtml).join('');
    }

    // Body rows
    const body = $('arGridBody');
    if (body) {
      const q = search.trim().toLowerCase();
      const visible = q
        ? roster.filter((p) => p.no.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
        : roster;
      if (!roster.length) {
        body.innerHTML = `<tr><td class="px-3 py-6 text-center text-sm text-slate-400" colspan="${currentDates.length + 1}">`
          + `${esc(t('arNoRoster', 'No candidates enrolled for this course.'))}</td></tr>`;
      } else if (!visible.length) {
        body.innerHTML = `<tr><td class="px-3 py-6 text-center text-sm text-slate-400" colspan="${currentDates.length + 1}">`
          + `${esc(t('arNoMatch', 'No candidate matches your search.'))}</td></tr>`;
      } else {
        body.innerHTML = visible.map((p) => {
          const cells = currentDates.map((iso) => {
            const st = statusMap[`${p.no}|${iso}`] || '';
            const tone = /** @type {any} */ (CELL_STYLES)[st] || '';
            const wkCls = isWeekend(iso) ? ' bg-slate-50' : '';
            return `<td class="px-1.5 py-1.5 text-center${wkCls}"><span class="inline-flex min-w-[2.2rem] items-center justify-center rounded px-1 py-0.5 text-[0.65rem] font-bold ${tone}">${esc(st)}</span></td>`;
          }).join('');
          const label = `C${esc(p.no)}`;
          const title = p.name ? ` title="${esc(p.name)}"` : '';
          return `<tr class="hover:bg-slate-50/60"><td${title} class="sticky left-0 z-10 whitespace-nowrap border-r border-slate-100 bg-white px-3 py-1.5 font-mono font-semibold text-slate-800">${label}</td>${cells}</tr>`;
        }).join('');
      }
    }
    renderAnalysis();
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

  // cellXfs order: 0 default, 1 metaLabel, 2 metaVal, 3 header(blue), 4 candNo,
  // 5 AH, 6 AR, 7 ABS, 8 EX, 9 blank-border, 10 legendTitle, 11 titleBanner, 12 subtitle.
  const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="4">'
    + '<font><sz val="11"/><name val="Calibri"/><color rgb="FF000000"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF000000"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>'
    + '<font><b/><sz val="16"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>'
    + '</fonts>'
    + '<fills count="8">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF042F8D"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFDE68A"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFECACA"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/></patternFill></fill>'
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
    + '<cellXfs count="13">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
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
    if (!current) { window.alert(t('arSelectCourse', 'Select a month and a course to view attendance details.')); return; }
    const ST = { metaLabel: 1, metaVal: 2, header: 3, candNo: 4, blank: 9, legendTitle: 10, banner: 11, subtitle: 12 };
    const statusStyle = (/** @type {string} */ s) => s === 'AH' ? 5 : s === 'AR' ? 6 : s === 'ABS' ? 7 : s === 'EX' ? 8 : ST.blank;

    const totalCols = 3 + currentDates.length; // col A spacer + No. + Candidate No. + dates
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
    rows.push(bannerRow(t('arReportTitle', 'Attendance Report'), ST.banner));
    rowHeights[0] = 30;
    merges.push(`B1:${lastCol}1`);
    const subtitle = `${trainingCode(current)} — ${courseTitle(current) || ''}`.trim();
    rows.push(bannerRow(subtitle, ST.subtitle));
    rowHeights[1] = 20;
    merges.push(`B2:${lastCol}2`);
    rows.push([]);

    rows.push(['', { v: t('arTrainingNo', 'Training No.'), s: ST.metaLabel }, { v: trainingCode(current), s: ST.metaVal }]);
    rows.push(['', { v: t('arTrainingTitle', 'Training Title'), s: ST.metaLabel }, { v: courseTitle(current) || '', s: ST.metaVal }]);
    rows.push(['', { v: t('arTrainer', 'Trainer'), s: ST.metaLabel }, { v: current.trainer || '', s: ST.metaVal }]);
    rows.push(['',
      { v: t('arStartDate', 'Start Date'), s: ST.metaLabel }, { v: fmtDate(current.date_from), s: ST.metaVal },
      { v: t('arEndDate', 'End Date'), s: ST.metaLabel }, { v: fmtDate(current.date_to), s: ST.metaVal }]);
    rows.push(['',
      { v: t('arStartTime', 'Start Time'), s: ST.metaLabel }, { v: fmtTime(current.date_from), s: ST.metaVal },
      { v: t('arEndTime', 'End Time'), s: ST.metaLabel }, { v: fmtTime(current.date_to), s: ST.metaVal }]);
    rows.push([]);

    // Header: No. | Candidate No. | dates
    const header = ['', { v: t('trColNo', 'No.'), s: ST.header }, { v: t('arCandidateNo', 'Candidate No.'), s: ST.header }];
    currentDates.forEach((iso) => {
      const d = toDate(iso);
      header.push({ v: d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : iso, s: ST.header });
    });
    rowHeights[rows.length] = 26;
    rows.push(/** @type {any} */ (header));

    roster.forEach((p, i) => {
      /** @type {any[]} */
      const row = ['', { v: String(i + 1).padStart(3, '0'), s: ST.candNo }, { v: `C${p.no}`, s: ST.candNo }];
      currentDates.forEach((iso) => {
        const st = statusMap[`${p.no}|${iso}`] || '';
        row.push({ v: st, s: statusStyle(st) });
      });
      rows.push(row);
    });

    rows.push([]);
    rows.push(['', { v: t('arLegendTitle', 'Legend'), s: ST.legendTitle }]);
    rows.push(['', { v: 'AH', s: 5 }, { v: t('arLegendAH', 'Arrived On Time'), s: ST.metaVal }]);
    rows.push(['', { v: 'AR', s: 6 }, { v: t('arLegendAR', 'Arrived Late'), s: ST.metaVal }]);
    rows.push(['', { v: 'ABS', s: 7 }, { v: t('arLegendABS', 'Absent'), s: ST.metaVal }]);
    rows.push(['', { v: 'EX', s: 8 }, { v: t('arLegendEX', 'Permanently Expelled'), s: ST.metaVal }]);

    const cols = [
      { min: 1, max: 1, width: 3 },
      { min: 2, max: 2, width: 8 },
      { min: 3, max: 3, width: 16 },
      { min: 4, max: 3 + currentDates.length, width: 6 },
    ];
    const safe = String(courseCode(current)).replace(/[^A-Za-z0-9_-]/g, '');
    const stamp = new Date().toISOString().slice(0, 10);
    downloadXlsx(`attendance-${safe}-${stamp}.xlsx`, t('arReportTitle', 'Attendance Report'), rows, { cols, merges, rowHeights });
  };

  const doPrint = () => {
    printing = true;
    window.print();
    printing = false;
  };

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
    $('arYear')?.addEventListener('change', () => {
      selectYear(Number(/** @type {HTMLSelectElement} */ ($('arYear')).value));
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
      <p class="max-w-sm text-sm text-slate-500">${esc(t('arAccessDenied', 'Access denied'))}</p>
      <a href="../../tc.html" class="rounded-lg bg-[#042F8D] px-4 py-2 text-sm font-semibold text-white">${esc(t('arBack', 'Back'))}</a>
    </div>`;
  };

  const init = () => {
    const saved = (() => { try { return localStorage.getItem(GSS_LANG_KEY); } catch (_) { return null; } })();
    lang = saved === 'fr' || saved === 'en' ? saved : 'en';

    applyLang();
    if (!GSSAccess.canViewReports()) { denyAccess(); return; }

    wire();
    initCollapsible();
    load();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
