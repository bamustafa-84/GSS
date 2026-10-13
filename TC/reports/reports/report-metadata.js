// @ts-check
/// <reference path="../js/global.js" />
/// <reference path="../js/utils/translation.js" />
(() => {
  'use strict';

  const refresh = () => {
    const session = GSSSession.get();
    const name = session ? String(session.full_name || session.username || '').trim() : '';
    const language = document.documentElement.lang === 'fr' ? 'fr' : 'en';
    const label = translations[language].reportGeneratedBy;
    document.querySelectorAll('[data-report-author]').forEach((el) => {
      const labelEl = el.querySelector('[data-report-author-label]');
      const nameEl = el.querySelector('[data-report-author-name]');
      if (labelEl) labelEl.textContent = label;
      if (nameEl) nameEl.textContent = name || '\u2014';
    });
  };

  const init = () => {
    document.querySelectorAll('[id$="GenDate"], [id$="GenDatePdf"]').forEach((date) => {
      const dateLine = date.closest('p');
      if (!dateLine || dateLine.parentElement?.querySelector('[data-report-author]')) return;
      const author = document.createElement('p');
      author.setAttribute('data-report-author', '');
      author.className = 'mt-1 break-words text-xs text-slate-500';
      const label = document.createElement('span');
      label.setAttribute('data-report-author-label', '');
      const name = document.createElement('span');
      name.setAttribute('data-report-author-name', '');
      name.className = 'font-semibold text-slate-700';
      author.append(label, document.createTextNode(' '), name);
      dateLine.after(author);
    });
    refresh();
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    window.addEventListener('beforeprint', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();