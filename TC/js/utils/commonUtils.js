// @ts-check
/// <reference path="./translation.js" />

/**
 * @param {HTMLSelectElement} select
 * @param {{ searchable?: boolean }} [options]
 */
const initSearchableSelect = (select, { searchable = true } = {}) => {
  if (!select || select.dataset.comboReady) return null;
  select.dataset.comboReady = 'true';

  // Combobox strings live in translation.js (COMBO_STRINGS).
  const s = () => COMBO_STRINGS[/** @type {keyof typeof COMBO_STRINGS} */ (document.documentElement.lang)] || COMBO_STRINGS.en;

  const ACTIVE_CLASSES = ['bg-[#042F8D]/[0.06]', 'text-[#042F8D]'];
  const SELECTED_CLASSES = ['bg-[#042F8D]/[0.08]', 'font-semibold', 'text-[#042F8D]'];

  const wrapper = document.createElement('div');
  wrapper.className = 'relative w-full';
  select.parentNode?.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('sr-only');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flex w-full items-center justify-between gap-2 rounded-xl border-[1.5px] border-[#dbe2f0] bg-white px-3 py-2.5 text-left text-sm text-slate-800 transition hover:border-[#042F8D] focus:border-[#042F8D] focus:bg-[#fbfcff] focus:outline-none focus:ring-4 focus:ring-[#042F8D]/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  label.className = 'truncate';
  button.appendChild(label);
  button.insertAdjacentHTML('beforeend',
    '<svg class="h-4 w-4 flex-none text-slate-500 transition-transform duration-200" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 8 10 12 14 8"/></svg>');
  const chevron = button.querySelector('svg');
  wrapper.appendChild(button);

  const panel = document.createElement('div');
  panel.className = 'absolute inset-x-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(4,47,141,0.16)]';
  panel.hidden = true;
  let search = null;
  let empty = null;
  if (searchable) {
    const searchWrap = document.createElement('div');
    searchWrap.className = 'border-b border-slate-100 p-2';
    search = document.createElement('input');
    search.type = 'text';
    search.className = 'w-full rounded-lg border-[1.5px] border-[#dbe2f0] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#042F8D] focus:outline-none focus:ring-4 focus:ring-[#042F8D]/10';
    search.setAttribute('autocomplete', 'off');
    searchWrap.appendChild(search);
    panel.appendChild(searchWrap);
  }
  const list = document.createElement('ul');
  list.className = 'm-0 max-h-60 list-none overflow-y-auto py-1';
  list.setAttribute('role', 'listbox');
  panel.appendChild(list);
  if (searchable) {
    empty = document.createElement('div');
    empty.className = 'px-3 py-3 text-sm text-slate-400';
    empty.hidden = true;
    panel.appendChild(empty);
  }
  wrapper.appendChild(panel);

  let activeIndex = -1;
  const visibleOptions = () => /** @type {HTMLElement[]} */ (Array.from(list.querySelectorAll('li:not([hidden])')));

  const updateLabel = () => {
    const selected = select.options[select.selectedIndex];
    const hasValue = selected && selected.value;
    const placeholder = select.querySelector('option[value=""]');
    label.textContent = hasValue ? selected.textContent : (placeholder ? placeholder.textContent : '');
    label.classList.toggle('text-slate-400', !hasValue);
  };

  const buildList = () => {
    list.innerHTML = '';
    Array.from(select.options).forEach((opt) => {
      if (!opt.value) return;
      const li = document.createElement('li');
      li.className = 'cursor-pointer px-3 py-2 text-sm text-slate-700 hover:bg-[#042F8D]/[0.06] hover:text-[#042F8D]';
      li.setAttribute('role', 'option');
      li.dataset.value = opt.value;
      li.textContent = opt.textContent;
      if (opt.value === select.value) {
        li.classList.add(...SELECTED_CLASSES);
        li.setAttribute('aria-selected', 'true');
      }
      li.addEventListener('click', () => choose(opt.value));
      list.appendChild(li);
    });
  };

  const setActive = (/** @type {number} */ idx) => {
    const items = visibleOptions();
    items.forEach((li) => li.classList.remove(...ACTIVE_CLASSES));
    if (!items.length) { activeIndex = -1; return; }
    activeIndex = Math.max(0, Math.min(idx, items.length - 1));
    const el = items[activeIndex];
    el.classList.add(...ACTIVE_CLASSES);
    el.scrollIntoView({ block: 'nearest' });
  };

  const filter = (/** @type {string} */ query) => {
    const q = query.trim().toLowerCase();
    let visible = 0;
    list.querySelectorAll('li').forEach((li) => {
      const match = li.textContent.toLowerCase().includes(q);
      li.hidden = !match;
      if (match) visible++;
    });
    if (empty) {
      empty.textContent = s().empty;
      empty.hidden = visible > 0;
    }
    setActive(0);
  };

  const isOpen = () => !panel.hidden;

  const open = () => {
    if (select.disabled) return;
    panel.hidden = false;
    chevron?.classList.add('rotate-180');
    button.setAttribute('aria-expanded', 'true');
    if (search) search.value = '';
    filter('');
    const items = visibleOptions();
    const selIdx = items.findIndex((li) => li.dataset.value === select.value);
    setActive(selIdx >= 0 ? selIdx : 0);
    if (search) setTimeout(() => search.focus(), 0);
  };

  const close = () => {
    panel.hidden = true;
    chevron?.classList.remove('rotate-180');
    button.setAttribute('aria-expanded', 'false');
  };

  const choose = (/** @type {string} */ value) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    updateLabel();
    buildList();
    close();
    button.focus();
  };

  const onKeydown = (/** @type {KeyboardEvent} */ e) => {
    if (!isOpen()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const items = visibleOptions();
      const active = items[activeIndex];
      if (active && active.dataset.value) choose(active.dataset.value);
    } else if (e.key === 'Escape') { e.preventDefault(); close(); button.focus(); }
  };

  button.addEventListener('click', () => { isOpen() ? close() : open(); });
  button.addEventListener('keydown', onKeydown);
  if (search) {
    search.addEventListener('input', () => filter(search.value));
    search.addEventListener('keydown', onKeydown);
  }
  document.addEventListener('click', (e) => { if (e.target instanceof Node && !wrapper.contains(e.target)) close(); });

  const refresh = () => {
    buildList();
    updateLabel();
    button.disabled = select.disabled;
    if (search) search.placeholder = s().search;
  };

  refresh();
  return { refresh };
};