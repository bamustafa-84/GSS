// @ts-check
/**
 * GSS · Date formatting (dd/MM/yyyy)
 * ------------------------------------------------------------------
 * Native <input type="date"> renders in the browser's regional format, which
 * cannot be reliably forced to dd/MM/yyyy. To guarantee dd/MM/yyyy across every
 * form, this utility converts those inputs into masked text inputs and exposes
 * ISO <-> dd/MM/yyyy helpers. The stored/submitted value is always ISO
 * (yyyy-MM-dd) so the backend is unaffected.
 *
 * Exposed as window.GSSDate:
 *   toISO(dmy)    'dd/MM/yyyy' | ISO | Date -> 'yyyy-MM-dd' (or '')
 *   toDMY(v)      ISO | Date | 'dd/MM/yyyy' -> 'dd/MM/yyyy' (or '')
 *   today()       -> 'dd/MM/yyyy' for the current date
 *   dateify(root) convert every <input type="date"> under root to dd/MM/yyyy text
 */
(() => {
  'use strict';

  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

  const toISO = (/** @type {any} */ v) => {
    if (v == null || v === '') return '';
    const s = String(v).trim();
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return '';
  };

  const toDMY = (/** @type {any} */ v) => {
    if (v == null || v === '') return '';
    const s = String(v).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s; // already dd/MM/yyyy
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    return s;
  };

  const today = () => {
    const d = new Date();
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  // Live mask: keep digits only, auto-insert slashes as dd/MM/yyyy.
  const onInput = (/** @type {any} */ e) => {
    const el = e.target;
    const digits = String(el.value).replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    else if (digits.length > 2) out = digits.slice(0, 2) + '/' + digits.slice(2);
    el.value = out;
  };

  const convert = (/** @type {any} */ el) => {
    if (!el || el.dataset.dateReady) return;
    const currentIso = el.value; // native date inputs hold an ISO value
    if (el.min) el.dataset.min = el.min;
    if (el.max) el.dataset.max = el.max;
    el.type = 'text';
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('placeholder', 'dd/mm/yyyy');
    el.setAttribute('maxlength', '10');
    el.setAttribute('data-date', '1');
    el.dataset.dateReady = '1';
    el.classList.add('gss-date');
    if (currentIso) el.value = toDMY(currentIso);
    el.addEventListener('input', onInput);
  };

  const dateify = (/** @type {ParentNode} */ root) => {
    (root || document).querySelectorAll('input[type="date"]').forEach(convert);
  };

  /** @type {any} */ (window).GSSDate = { toISO, toDMY, today, dateify };
})();
