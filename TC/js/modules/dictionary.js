// @ts-check
/**
 * GSS · Dictionary manager
 * ------------------------------------------------------------------
 * A small standalone modal to manage reference values stored in the
 * generic `dictionary` table (one category at a time). It powers the
 * "Dictionary Management" link next to a dictionary-backed dropdown
 * (currently the Education Level select, category `edu_lvl`).
 *
 *   • List values for a category      (GET    /api/dictionary?category=…)
 *   • Add a value                      (POST   /api/dictionary)
 *   • Edit a value                     (POST   /api/dictionary { dict_id })
 *   • Delete a value                   (DELETE /api/dictionary?id=…)
 *
 * After any change the linked dropdown is refreshed from the DB via the
 * hook the owning module exposes (e.g. window.GSSEducationLevel).
 */
(() => {
  'use strict';

  const overlay = document.getElementById('dictOverlay');
  const closeBtn = document.getElementById('dictClose');
  const titleEl = document.getElementById('dictTitle');
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById('dictForm'));
  const idInput = /** @type {HTMLInputElement | null} */ (document.getElementById('dictId'));
  const categoryInput = /** @type {HTMLInputElement | null} */ (document.getElementById('dictCategory'));
  const frInput = /** @type {HTMLInputElement | null} */ (document.getElementById('dictFrLabel'));
  const enInput = /** @type {HTMLInputElement | null} */ (document.getElementById('dictEnLabel'));
  const saveBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('dictSave'));
  const cancelEditBtn = document.getElementById('dictCancelEdit');
  const status = document.getElementById('dictStatus');
  const list = document.getElementById('dictList');
  const listEmpty = document.getElementById('dictListEmpty');
  const refreshBtn = document.getElementById('dictRefresh');

  if (!overlay || !form || !frInput || !enInput || !categoryInput || !list) return;

  const lang = () => document.documentElement.lang || 'en';

  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };

  // Per-category hook that re-populates the owning dropdown from the DB.
  const CATEGORY_REFRESH = /** @type {Record<string, () => void>} */ ({
    edu_lvl: () => {
      const hook = /** @type {any} */ (window).GSSEducationLevel;
      if (hook && typeof hook.setOptions === 'function') loadCategoryInto(hook);
    },
  });

  /** @type {string} The category currently being managed. */
  let category = 'edu_lvl';

  const setStatus = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!status) return;
    status.textContent = msg;
    status.className = 'mt-2 min-h-5 text-sm font-semibold ' + (ok ? 'text-emerald-600' : 'text-red-600');
  };

  // ── Open / close ───────────────────────────────────────────────
  const isOpen = () => !overlay.classList.contains('hidden');
  const open = (/** @type {string} */ cat, /** @type {string} */ title) => {
    category = cat || 'edu_lvl';
    if (categoryInput) categoryInput.value = category;
    if (titleEl && title) titleEl.textContent = title;
    resetForm();
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    loadValues();
  };
  const close = () => {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  };

  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });

  // Wire every "Dictionary Management" trigger button.
  document.querySelectorAll('[data-dict-category]').forEach((el) => {
    const btn = /** @type {HTMLElement} */ (el);
    btn.addEventListener('click', () => {
      const cat = btn.dataset.dictCategory || 'edu_lvl';
      const titleKey = btn.dataset.dictTitleI18n || 'dictTitle';
      open(cat, t(titleKey, 'Dictionary Management'));
    });
  });

  // ── Form (add / edit) ──────────────────────────────────────────
  const resetForm = () => {
    if (idInput) idInput.value = '';
    frInput.value = '';
    enInput.value = '';
    cancelEditBtn?.classList.add('hidden');
    if (saveBtn) saveBtn.textContent = t('dictSaveBtn', 'Save');
    setStatus('', true);
  };

  cancelEditBtn?.addEventListener('click', resetForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const frTitle = frInput.value.trim();
    const enTitle = enInput.value.trim();
    // Both the French and English values are mandatory.
    if (!frTitle) {
      setStatus(t('dictErrFrValue', 'The French value is required.'), false);
      frInput.focus();
      return;
    }
    if (!enTitle) {
      setStatus(t('dictErrEnValue', 'The English value is required.'), false);
      enInput.focus();
      return;
    }
    const id = idInput && idInput.value ? Number(idInput.value) : null;
    /** @type {Record<string, any>} */
    const payload = { category, fr_title: frTitle, en_title: enTitle };
    if (id != null) payload.dict_id = id;

    if (saveBtn) saveBtn.disabled = true;
    setStatus(t('dictSaving', 'Saving…'), true);
    try {
      const res = await fetch(`${API_BASE}/api/dictionary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      setStatus(t('dictSavedOk', 'Value saved.'), true);
      resetForm();
      loadValues();
      refreshLinkedDropdown();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('dictErrSave', 'Could not save the value.'), false);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  const startEdit = (/** @type {any} */ row) => {
    if (idInput) idInput.value = String(row.dict_id);
    frInput.value = row.fr_title != null ? String(row.fr_title) : '';
    enInput.value = row.en_title != null ? String(row.en_title) : '';
    cancelEditBtn?.classList.remove('hidden');
    if (saveBtn) saveBtn.textContent = t('dictUpdateBtn', 'Update');
    frInput.focus();
  };

  const removeValue = async (/** @type {any} */ id) => {
    if (id == null) return;
    if (!window.confirm(t('dictConfirmDelete', 'Delete this value? This action cannot be undone.'))) return;
    try {
      const res = await fetch(`${API_BASE}/api/dictionary?id=${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
      setStatus(t('dictDeletedOk', 'Value deleted.'), true);
      loadValues();
      refreshLinkedDropdown();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('dictErrDelete', 'Could not delete the value.'), false);
    }
  };

  // ── List values ────────────────────────────────────────────────
  const renderList = (/** @type {any[]} */ rows) => {
    list.innerHTML = '';
    if (!rows.length) {
      listEmpty?.classList.remove('hidden');
      return;
    }
    listEmpty?.classList.add('hidden');
    rows.forEach((row) => {
      const li = document.createElement('li');
      li.className = 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm';

      const meta = document.createElement('div');
      meta.className = 'min-w-0 flex-1';
      const frLine = document.createElement('p');
      frLine.className = 'truncate text-sm font-semibold text-slate-800';
      frLine.textContent = 'FR · ' + (row.fr_title != null ? String(row.fr_title) : '');
      const enLine = document.createElement('p');
      enLine.className = 'truncate text-xs text-slate-500';
      enLine.textContent = 'EN · ' + (row.en_title != null ? String(row.en_title) : '');
      meta.appendChild(frLine);
      meta.appendChild(enLine);
      li.appendChild(meta);

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.title = t('dictEdit', 'Edit');
      edit.setAttribute('aria-label', t('dictEdit', 'Edit'));
      edit.className = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[#042F8D] transition hover:border-[#042F8D] hover:bg-[#042F8D]/10';
      edit.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
      edit.addEventListener('click', () => startEdit(row));
      li.appendChild(edit);

      const del = document.createElement('button');
      del.type = 'button';
      del.title = t('dictDelete', 'Delete');
      del.setAttribute('aria-label', t('dictDelete', 'Delete'));
      del.className = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-500 transition hover:border-red-500 hover:bg-red-50';
      del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      del.addEventListener('click', () => removeValue(row.dict_id));
      li.appendChild(del);

      list.appendChild(li);
    });
  };

  const loadValues = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dictionary?category=${encodeURIComponent(category)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      renderList(Array.isArray(data.items) ? data.items : []);
    } catch (_) {
      renderList([]);
      if (listEmpty) {
        listEmpty.textContent = t('dictLoadErr', 'Could not load values. Is the server running?');
        listEmpty.classList.remove('hidden');
      }
    }
  };

  const refreshLinkedDropdown = () => {
    const fn = CATEGORY_REFRESH[category];
    if (fn) fn();
  };

  refreshBtn?.addEventListener('click', loadValues);

  // ── Populate a linked dropdown from a category's values ─────────
  /** @param {{ setOptions: (items: { code?: string, label: string }[]) => void }} hook */
  const loadCategoryInto = (hook) => {
    const useFr = lang() === 'fr';
    fetch(`${API_BASE}/api/dictionary?category=edu_lvl`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : [];
        // The stored value (code) is the language-independent English title;
        // the visible label follows the active application language.
        hook.setOptions(items.map((/** @type {any} */ it) => ({
          code: it.code || it.en_title || it.label,
          label: (useFr ? it.fr_title : it.en_title) || it.label || it.en_title || it.fr_title || '',
        })));
      })
      .catch(() => { /* keep the static options on failure */ });
  };

  // On load, populate the Education Level dropdown from the dictionary.
  const populateEducationLevel = () => {
    const hook = /** @type {any} */ (window).GSSEducationLevel;
    if (hook && typeof hook.setOptions === 'function') {
      loadCategoryInto(hook);
    } else {
      // The registration module may not have exposed its hook yet.
      window.setTimeout(populateEducationLevel, 150);
    }
  };

  // Re-populate the dropdown labels when the application language changes.
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => { window.setTimeout(populateEducationLevel, 0); })
  );

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateEducationLevel);
  } else {
    populateEducationLevel();
  }
})();
