/**
 * Profile Vault Popup — vault_popup.js
 * Handles: open/close, load keys from API, add key, activate key, delete key, theme switch
 */
(function () {
  'use strict';

  const overlay    = document.getElementById('vaultOverlay');
  const triggerBtn = document.getElementById('vaultTriggerBtn');
  const closeBtn   = document.getElementById('vaultCloseBtn');
  const keysList   = document.getElementById('vaultKeysList');
  const keyNameIn  = document.getElementById('vaultKeyName');
  const keyValueIn = document.getElementById('vaultKeyValue');
  const addKeyBtn  = document.getElementById('vaultAddKeyBtn');
  const vaultMsg   = document.getElementById('vaultMsg');

  // If not logged in, vault elements won't exist — bail early.
  if (!overlay || !triggerBtn) return;

  // ── Helpers ─────────────────────────────────────────────────────────────
  function getCsrf() {
    const m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : '';
  }

  function showMsg(text, isError) {
    vaultMsg.textContent = text;
    vaultMsg.className   = 'vault-msg ' + (isError ? 'vault-msg-error' : 'vault-msg-ok');
    vaultMsg.hidden = false;
    setTimeout(() => { vaultMsg.hidden = true; }, 4000);
  }

  async function apiFetch(url, options) {
    const resp = await fetch(url, {
      headers: { 'X-CSRFToken': getCsrf(), 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    return resp.json();
  }

  // ── Render Keys ──────────────────────────────────────────────────────────
  function renderKeys(keys) {
    if (!keys || keys.length === 0) {
      keysList.innerHTML = '<div class="vault-empty">No API keys stored yet.</div>';
      return;
    }
    keysList.innerHTML = keys.map(k => `
      <div class="vault-key-row ${k.is_active ? 'vault-key-active' : ''}" data-key-id="${k.id}">
        <div class="vault-key-info">
          <span class="vault-key-name">${escHtml(k.key_name)}</span>
          <code class="vault-key-preview">${escHtml(k.key_preview)}</code>
          <span class="vault-key-date">${escHtml(k.created_at)}</span>
        </div>
        <div class="vault-key-actions">
          ${k.is_active
            ? '<span class="vault-active-badge">✓ Active</span>'
            : `<button type="button" class="mh-btn mh-btn-sm mh-btn-ghost vault-activate-btn" data-id="${k.id}">Activate</button>`
          }
          <button type="button" class="mh-btn mh-btn-sm vault-delete-btn" data-id="${k.id}" title="Delete key">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Bind activate buttons
    keysList.querySelectorAll('.vault-activate-btn').forEach(btn => {
      btn.addEventListener('click', () => activateKey(btn.dataset.id));
    });
    // Bind delete buttons
    keysList.querySelectorAll('.vault-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteKey(btn.dataset.id));
    });
  }

  function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // ── Load Vault Data ──────────────────────────────────────────────────────
  async function loadVault() {
    if (!keysList) return;
    keysList.innerHTML = '<div class="vault-loading">Loading…</div>';
    try {
      const data = await apiFetch('/api/vault/', { method: 'GET' });
      if (data.ok) {
        renderKeys(data.keys);
        syncThemePicker(data.theme);
      } else {
        keysList.innerHTML = '<div class="vault-empty">Could not load keys.</div>';
      }
    } catch (e) {
      keysList.innerHTML = '<div class="vault-empty">Network error.</div>';
    }
  }

  // ── Add Key ──────────────────────────────────────────────────────────────
  async function addKey() {
    const raw  = (keyValueIn.value || '').trim();
    const name = (keyNameIn.value || '').trim() || 'Personal Gemini Key';
    if (!raw) { showMsg('API key value cannot be empty.', true); return; }

    addKeyBtn.disabled = true;
    addKeyBtn.textContent = 'Saving…';
    try {
      const data = await apiFetch('/api/vault/add-key/', {
        method: 'POST',
        body: JSON.stringify({ gemini_api_key: raw, key_name: name }),
      });
      if (data.ok) {
        keyValueIn.value = '';
        keyNameIn.value  = '';
        renderKeys(data.keys);
        showMsg('Key encrypted and saved.', false);
      } else {
        showMsg(data.error || 'Failed to save key.', true);
      }
    } catch (e) {
      showMsg('Network error.', true);
    } finally {
      addKeyBtn.disabled = false;
      addKeyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> Encrypt &amp; Save';
    }
  }

  // ── Activate Key ─────────────────────────────────────────────────────────
  async function activateKey(keyId) {
    try {
      const data = await apiFetch(`/api/vault/activate/${keyId}/`, { method: 'POST', body: '{}' });
      if (data.ok) { renderKeys(data.keys); showMsg('Active key updated.', false); }
      else { showMsg(data.error || 'Failed to activate.', true); }
    } catch { showMsg('Network error.', true); }
  }

  // ── Delete Key ───────────────────────────────────────────────────────────
  async function deleteKey(keyId) {
    if (!confirm('Remove this API key from your vault?')) return;
    try {
      const data = await apiFetch(`/api/vault/delete/${keyId}/`, { method: 'POST', body: '{}' });
      if (data.ok) { renderKeys(data.keys); showMsg('Key removed.', false); }
      else { showMsg(data.error || 'Failed to delete.', true); }
    } catch { showMsg('Network error.', true); }
  }

  // ── Theme Picker ─────────────────────────────────────────────────────────
  function syncThemePicker(theme) {
    document.querySelectorAll('.vault-theme-btn').forEach(btn => {
      btn.classList.toggle('vault-theme-btn-active', btn.dataset.themePick === theme);
    });
  }

  document.querySelectorAll('.vault-theme-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const picked = btn.dataset.themePick;
      // Apply immediately
      document.documentElement.setAttribute('data-theme', picked);
      syncThemePicker(picked);
      // Persist via profile POST
      try {
        await apiFetch('/profile/', {
          method: 'POST',
          body: JSON.stringify({ preferred_theme: picked }),
          headers: { 'Content-Type': 'application/json' },
        });
      } catch { /* ignore */ }
    });
  });

  // ── Open / Close Vault ───────────────────────────────────────────────────
  function openVault() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    triggerBtn.setAttribute('aria-expanded', 'true');
    loadVault();
    overlay.focus();
  }

  function closeVault() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    triggerBtn.setAttribute('aria-expanded', 'false');
  }

  triggerBtn.addEventListener('click', openVault);
  closeBtn.addEventListener('click', closeVault);

  // Click outside card to close
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeVault();
  });

  // Escape key to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) closeVault();
  });

  // Add key button
  addKeyBtn.addEventListener('click', addKey);

  // Enter in key value input
  keyValueIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addKey(); }
  });

  // Theme toggle button in header (already in tree_explorer.js, but make sure vault stays in sync)
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      syncThemePicker(current === 'dark' ? 'light' : 'dark');
    });
  });
})();
