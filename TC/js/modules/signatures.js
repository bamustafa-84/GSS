// @ts-check
/**
 * GSS · Signature manager
 * ------------------------------------------------------------------
 * A small standalone modal to create and browse signatures stored in
 * the `signature` table:
 *   • Draw a signature on the pad (wired by initSignaturePads) OR
 *     upload an image file.
 *   • Give it a name and save it (POST /api/signatures).
 *   • Browse previously saved signatures with a live thumbnail
 *     (GET /api/signatures, GET /api/signatures/image?id=N).
 */
(() => {
  'use strict';

  const btn = document.getElementById('sigBtn');
  const overlay = document.getElementById('sigOverlay');
  const closeBtn = document.getElementById('sigClose');
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById('sigForm'));
  const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('sigName'));
  const dataInput = /** @type {HTMLInputElement | null} */ (document.getElementById('sigData'));
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('sigCanvas'));
  const upload = /** @type {HTMLInputElement | null} */ (document.getElementById('sigUpload'));
  const saveBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sigSave'));
  const status = document.getElementById('sigStatus');
  const list = document.getElementById('sigList');
  const listEmpty = document.getElementById('sigListEmpty');
  const listMore = document.getElementById('sigListMore');
  const refreshBtn = document.getElementById('sigRefresh');
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('sigSearch'));
  const officerCheck = /** @type {HTMLInputElement | null} */ (document.getElementById('sigIsTrainingOfficer'));
  const officerLocked = document.getElementById('sigOfficerLocked');

  if (!btn || !overlay || !form || !nameInput || !dataInput || !list) return;

  // Signature list is lazy: first PAGE_SIZE rows, then searched server-side.
  const PAGE_SIZE = 10;

  // API base: relative when served by the Node server, otherwise the local
  // test server (covers Live Server on :5500 and file:// previews).
  const API_BASE =
    (location.protocol.startsWith('http') && location.port !== '5500') ? '' : 'http://localhost:3000';

  const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
    try {
      const lang = document.documentElement.lang || 'en';
      const dict = /** @type {any} */ (typeof translations !== 'undefined' ? translations : null);
      if (dict && dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (_) { /* noop */ }
    return fallback;
  };

  const setStatus = (/** @type {string} */ msg, /** @type {boolean} */ ok) => {
    if (!status) return;
    status.textContent = msg;
    status.className = 'min-h-5 text-sm font-semibold ' + (ok ? 'text-emerald-600' : 'text-red-600');
  };

  // ── Open / close ───────────────────────────────────────────────
  const isOpen = () => !overlay.classList.contains('hidden');
  const open = () => {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    // Nudge the signature pad to (re)size now that it is visible.
    window.dispatchEvent(new Event('resize'));
    loadSignatures();
  };
  const close = () => {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  };

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  // ── Upload an image → data URL (fills the hidden pad input) ─────
  upload?.addEventListener('change', () => {
    const file = upload.files && upload.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setStatus(t('sigErrImage', 'Please choose an image file.'), false);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      dataInput.value = url;
      // Draw a preview onto the pad canvas and hide the placeholder hint.
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
          const rect = canvas.getBoundingClientRect();
          const w = rect.width || canvas.width;
          const h = rect.height || canvas.height;
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const scale = Math.min(w / img.width, h / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
          }
          const hint = canvas.parentElement?.querySelector('.gss-sign-hint');
          hint?.classList.add('hidden');
        };
        img.src = url;
      }
      setStatus(t('sigImgReady', 'Image ready — add a name and save.'), true);
    };
    reader.readAsDataURL(file);
  });

  // ── Save ───────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const image = dataInput.value.trim();
    if (!name) {
      setStatus(t('sigErrName', 'A signature name is required.'), false);
      nameInput.focus();
      return;
    }
    if (!image) {
      setStatus(t('sigErrDraw', 'Draw or upload a signature first.'), false);
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setStatus(t('sigSaving', 'Saving…'), true);
    try {
      const res = await fetch(`${API_BASE}/api/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image, is_training_officer: !!(officerCheck && officerCheck.checked) })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || 'Save failed');
      }
      setStatus(t('sigSavedOk', 'Signature saved.'), true);
      form.reset();
      dataInput.value = '';
      // Clear the pad + restore its hint.
      const hint = canvas?.parentElement?.querySelector('.gss-sign-hint');
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hint?.classList.remove('hidden');
      loadSignatures();
    } catch (err) {
      setStatus((err instanceof Error ? err.message : t('sigErrSave', 'Could not save the signature.')), false);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // ── List saved signatures ──────────────────────────────────────
  const idOf = (/** @type {any} */ row) =>
    row && (row.signature_id ?? row.id ?? row.signatureId);

  const nameOf = (/** @type {any} */ row) =>
    (row && (row.contact_name || row.created_by || row.file_name)) || t('sigUnnamed', 'Signature');

  // ── Delete a saved signature (with confirmation) ───────────────
  const deleteSignature = async (/** @type {any} */ id) => {
    if (id == null) return;
    if (!window.confirm(t('confirmDeleteSignature', 'Delete this signature? This action cannot be undone.'))) return;
    try {
      const res = await fetch(`${API_BASE}/api/signatures?id=${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Delete failed');
      setStatus(t('sigDeletedOk', 'Signature deleted.'), true);
      loadSignatures();
    } catch (err) {
      setStatus((err instanceof Error ? err.message : t('sigErrDelete', 'Could not delete the signature.')), false);
    }
  };

  const loadSignatures = async () => {
    const q = (searchInput && searchInput.value.trim()) || '';
    try {
      const res = await fetch(
        `${API_BASE}/api/signatures?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}`,
        { headers: { Accept: 'application/json' } }
      );
      const data = await res.json();
      // Ignore stale responses if the query changed while fetching.
      if (searchInput && searchInput.value.trim() !== q) return;
      // A Training Officer can only be designated once — lock the checkbox.
      const locked = data.hasTrainingOfficer === true;
      if (officerCheck) {
        officerCheck.disabled = locked;
        if (locked) officerCheck.checked = false;
      }
      officerLocked?.classList.toggle('hidden', !locked);
      const rows = Array.isArray(data.signatures) ? data.signatures : [];
      renderList(rows);
      // Keep the read-only Training Officer signature on the Commitment panel
      // in sync (a newly designated / deleted officer must show immediately).
      try {
        const linker = /** @type {any} */ (window).GSSApplicant;
        if (linker && typeof linker.loadOfficerSignature === 'function') linker.loadOfficerSignature();
      } catch (_) { /* noop */ }
    } catch (_) {
      renderList([]);
      if (listEmpty) {
        listEmpty.textContent = t('sigLoadErr', 'Could not load signatures. Is the server running?');
        listEmpty.classList.remove('hidden');
      }
    }
  };

  const renderList = (/** @type {any[]} */ rows) => {
    list.innerHTML = '';
    if (listMore) listMore.classList.add('hidden');
    if (!rows.length) {
      if (listEmpty) {
        const q = (searchInput && searchInput.value.trim()) || '';
        listEmpty.textContent = q ? t('sigNoMatch', 'No signatures match your search.') : t('sigNone', 'No signatures saved yet.');
        listEmpty.classList.remove('hidden');
      }
      return;
    }
    listEmpty?.classList.add('hidden');
    rows.forEach((row) => {
      const id = idOf(row);
      const li = document.createElement('li');
      li.className = 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm';

      const thumb = document.createElement('div');
      thumb.className = 'group relative flex h-12 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50';
      if (id != null) {
        const img = document.createElement('img');
        img.className = 'max-h-full max-w-full object-contain';
        img.alt = nameOf(row);
        img.loading = 'lazy';
        img.src = `${API_BASE}/api/signatures/image?id=${encodeURIComponent(String(id))}`;
        thumb.appendChild(img);

        // Enlarged preview shown on hover (zoom-in), floating to the right.
        const zoom = document.createElement('div');
        zoom.className = 'pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden h-44 w-72 max-w-[60vw] -translate-y-1/2 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_rgba(4,47,141,0.28)] group-hover:flex';
        const zoomImg = document.createElement('img');
        zoomImg.className = 'max-h-full max-w-full object-contain';
        zoomImg.alt = nameOf(row);
        zoomImg.loading = 'lazy';
        zoomImg.src = `${API_BASE}/api/signatures/image?id=${encodeURIComponent(String(id))}`;
        zoom.appendChild(zoomImg);
        thumb.appendChild(zoom);
      }

      const meta = document.createElement('div');
      meta.className = 'min-w-0 flex-1';
      const nm = document.createElement('p');
      nm.className = 'truncate text-sm font-semibold text-slate-800';
      nm.textContent = nameOf(row);
      meta.appendChild(nm);
      if (row && (row.is_training_officer === true || row.is_training_officer === 't')) {
        const badge = document.createElement('span');
        badge.className = 'mt-0.5 inline-block rounded-full bg-[#042F8D]/10 px-2 py-0.5 text-[11px] font-semibold text-[#042F8D]';
        badge.textContent = t('sigOfficer', 'Training Officer');
        meta.appendChild(badge);
      }
      if (id != null) {
        const sub = document.createElement('p');
        sub.className = 'truncate text-xs text-slate-400';
        sub.textContent = '#' + id;
        meta.appendChild(sub);
      }

      li.appendChild(thumb);
      li.appendChild(meta);

      if (id != null) {
        const del = document.createElement('button');
        del.type = 'button';
        del.title = t('sigDelete', 'Delete');
        del.setAttribute('aria-label', t('sigDelete', 'Delete'));
        del.className = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-500 transition hover:border-red-500 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300';
        del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        del.addEventListener('click', () => deleteSignature(id));
        li.appendChild(del);
      }

      list.appendChild(li);
    });

    if (listMore && rows.length >= PAGE_SIZE) {
      listMore.textContent = t('sigMore', 'Showing the first 10 — type to search all signatures.');
      listMore.classList.remove('hidden');
    }
  };

  // Debounced incremental search across the whole signature table.
  let searchTimer = 0;
  searchInput?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadSignatures, 200);
  });

  refreshBtn?.addEventListener('click', loadSignatures);

  // Re-render list labels when the language changes.
  document.querySelectorAll('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      if (isOpen()) window.setTimeout(loadSignatures, 0);
    })
  );
})();
