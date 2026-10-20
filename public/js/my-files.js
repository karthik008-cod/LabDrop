(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const alertArea = $('#alertArea');
  const loadingState = $('#loadingState');
  const emptyState = $('#emptyState');
  const unauthPrompt = $('#unauthPrompt');
  const transfersContainer = $('#transfersContainer');
  const navUserEmail = $('#navUserEmail');
  const navLogoutBtn = $('#navLogoutBtn');

  const authToken = sessionStorage.getItem('labdrop_token');

  const ICONS = {
    code: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    pdf: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>`,
    image: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
    document: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    data: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
    archive: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`,
    file: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`,
    link: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
    clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    lock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    external: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
    copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    alert: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
    check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
  };

  function showAlert(message, type = 'error') {
    const div = document.createElement('div');
    div.className = `alert alert--${type}`;
    const iconSvg = type === 'error' ? ICONS.alert : type === 'success' ? ICONS.check : ICONS.alert;
    div.innerHTML = `<span class="icon-svg" style="margin-right: 6px;">${iconSvg}</span> <span>${escapeHtml(message)}</span>`;
    alertArea.prepend(div);
    setTimeout(() => div.remove(), 6000);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function getExpiryInfo(expiresAt) {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      return { text: 'Expired', badgeClass: 'badge-expiry--urgent' };
    }

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);

    if (days > 1) {
      return { text: `${days} days ${hours}h left`, badgeClass: '' };
    }
    if (days === 1) {
      return { text: `1 day ${hours}h left`, badgeClass: 'badge-expiry--warning' };
    }
    if (hours > 0) {
      return { text: `Expires in ${hours} hours`, badgeClass: 'badge-expiry--urgent' };
    }
    const mins = Math.max(1, Math.floor(remaining / (1000 * 60)));
    return { text: `Expires in ${mins} minutes`, badgeClass: 'badge-expiry--urgent' };
  }

  async function init() {
    if (!authToken) {
      loadingState.style.display = 'none';
      if (unauthPrompt) unauthPrompt.classList.remove('section--hidden');
      return;
    }

    try {
      const meRes = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!meRes.ok) throw new Error('Not logged in');
      const meData = await meRes.json();
      if (navUserEmail) navUserEmail.textContent = meData.user.email;
      const dropdownUserEmail = $('#dropdownUserEmail');
      if (dropdownUserEmail) dropdownUserEmail.textContent = meData.user.email;
    } catch (e) {
      sessionStorage.removeItem('labdrop_token');
      loadingState.style.display = 'none';
      if (unauthPrompt) unauthPrompt.classList.remove('section--hidden');
      return;
    }

    if (navLogoutBtn) {
      navLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('labdrop_token');
        window.location.href = '/';
      });
    }

    try {
      const res = await fetch('/api/my-transfers', { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!res.ok) throw new Error('Failed to fetch saved transfers');
      
      const data = await res.json();
      loadingState.style.display = 'none';

      if (!data.transfers || data.transfers.length === 0) {
        emptyState.classList.remove('section--hidden');
      } else {
        transfersContainer.classList.remove('section--hidden');
        renderTransfers(data.transfers);
      }
    } catch (err) {
      loadingState.style.display = 'none';
      showAlert(err.message);
    }
  }

  function renderTransfers(transfers) {
    transfersContainer.innerHTML = '';
    
    transfers.forEach(t => {
      const card = document.createElement('div');
      card.className = 'saved-transfer-card';
      
      const expiry = getExpiryInfo(t.expiresAt);
      const pinBadge = t.requirePin ?
        `<span class="badge-pin">${ICONS.lock} PIN Protected</span>` : '';

      // Build file rows
      const files = t.files || [];
      let filesListHtml = '';
      if (files.length > 0) {
        filesListHtml = `
          <div class="saved-transfer-files-box">
            <div style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">
              Files (${files.length})
            </div>
            ${files.map(f => {
              const catIcon = ICONS[f.category] || ICONS.file;
              const downloadUrl = `/download/${t.id}/${f.id}?name=${encodeURIComponent(f.name)}`;
              return `
                <div class="saved-transfer-file-row">
                  <div class="saved-transfer-file-info" title="${escapeHtml(f.name)}">
                    <span class="classic-icon" style="color: var(--color-primary-dark);">${catIcon}</span>
                    <span class="saved-transfer-file-name">${escapeHtml(f.name)}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                    <span class="saved-transfer-file-size">${formatBytes(f.size)}</span>
                    <a href="${downloadUrl}" class="btn btn--secondary btn--sm" download="${escapeHtml(f.name)}" style="padding: 3px 8px; font-size: 0.75rem;">Download</a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      // Build links rows if present
      const links = t.links || [];
      let linksListHtml = '';
      if (links.length > 0) {
        linksListHtml = `
          <div class="saved-transfer-files-box" style="margin-top: var(--space-xs);">
            <div style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">
              Links & Notes (${links.length})
            </div>
            ${links.map(link => `
              <div class="saved-transfer-file-row">
                <div class="saved-transfer-file-info">
                  <span class="classic-icon" style="color: var(--color-primary-dark);">${ICONS.link}</span>
                  <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="saved-transfer-file-name" style="color: var(--color-primary-dark); text-decoration: underline;">${escapeHtml(link)}</a>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

      const zipFilename = `${(t.transferName || 'LabFiles').replace(/[^a-zA-Z0-9_\-]/g, '_')}.zip`;

      card.innerHTML = `
        <div class="saved-transfer-top">
          <div>
            <div class="saved-transfer-title">${escapeHtml(t.transferName || 'Lab Files')}</div>
            <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">
              Created ${new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="code-pill" title="6-Digit Transfer Code">
              <span>${t.shortCode}</span>
            </div>
            <button type="button" class="btn btn--secondary btn--sm copy-code-btn" data-code="${escapeHtml(t.shortCode)}" title="Copy 6-Digit Transfer Code" style="padding: 5px 8px;">
              ${ICONS.copy} Copy
            </button>
          </div>
        </div>

        <div class="saved-transfer-badges">
          <span class="badge-expiry ${expiry.badgeClass}">
            ${ICONS.clock} ${expiry.text}
          </span>
          <span style="font-size: var(--font-size-xs); color: var(--color-text-secondary); font-weight: 500;">
            ${t.fileCount} file(s) · ${formatBytes(t.totalSize)}
          </span>
          ${pinBadge}
        </div>

        ${filesListHtml}
        ${linksListHtml}

        <div class="saved-transfer-actions-bar">
          <a href="/download/${t.id}/zip" class="btn btn--primary btn--sm download-zip-btn" data-filename="${escapeHtml(zipFilename)}">
            ${ICONS.download} Download All (ZIP)
          </a>
          <a href="/t/${t.id}" class="btn btn--secondary btn--sm">
            ${ICONS.external} Open Transfer Page
          </a>
          <button type="button" class="btn btn--danger btn--sm delete-transfer-btn" data-id="${t.id}" style="margin-left: auto;">
            ${ICONS.trash} Delete
          </button>
        </div>
      `;

      transfersContainer.appendChild(card);
    });
  }

  // Delegate clicks on transfers container (Save As browse, copy code, delete)
  transfersContainer.addEventListener('click', async (e) => {
    // Copy Code button
    const copyBtn = e.target.closest('.copy-code-btn');
    if (copyBtn) {
      e.preventDefault();
      const code = copyBtn.getAttribute('data-code');
      if (code) {
        try {
          await navigator.clipboard.writeText(code);
          const origHtml = copyBtn.innerHTML;
          copyBtn.innerHTML = `${ICONS.check} Copied!`;
          setTimeout(() => (copyBtn.innerHTML = origHtml), 2000);
        } catch (_) {
          showAlert('Failed to copy code to clipboard.');
        }
      }
      return;
    }

    // Delete Transfer button
    const deleteBtn = e.target.closest('.delete-transfer-btn');
    if (deleteBtn) {
      e.preventDefault();
      const id = deleteBtn.getAttribute('data-id');
      if (id) {
        const confirmed = window.LabDialog && typeof window.LabDialog.confirm === 'function' ?
          await window.LabDialog.confirm('Are you sure you want to delete this saved transfer? All associated files will be removed.') :
          confirm('Are you sure you want to delete this saved transfer?');
        if (!confirmed) return;

        try {
          const res = await fetch(`/api/transfer/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          if (res.ok) {
            showAlert('Transfer deleted successfully.', 'success');
            setTimeout(() => window.location.reload(), 800);
          } else {
            const d = await res.json().catch(() => ({}));
            showAlert(d.error || 'Failed to delete transfer.');
          }
        } catch (_) {
          showAlert('Network error while deleting transfer.');
        }
      }
      return;
    }

    // Save As ZIP picker
    const downloadBtn = e.target.closest('.download-zip-btn');
    if (downloadBtn && window.showSaveFilePicker) {
      e.preventDefault();
      const downloadUrl = downloadBtn.getAttribute('href');
      const filename = downloadBtn.getAttribute('data-filename') || 'LabFiles.zip';
      
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'ZIP Archive',
            accept: { 'application/zip': ['.zip'] }
          }]
        });
        
        downloadBtn.style.opacity = '0.5';
        downloadBtn.style.pointerEvents = 'none';

        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error('Download failed');
        
        const writable = await handle.createWritable();
        if (res.body && typeof res.body.pipeTo === 'function') {
          await res.body.pipeTo(writable);
        } else {
          const blob = await res.blob();
          await writable.write(blob);
          await writable.close();
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          if (window.LabDialog && typeof window.LabDialog.alert === 'function') {
            await window.LabDialog.alert('Save failed: ' + err.message);
          }
          window.location.href = downloadUrl;
        }
      } finally {
        downloadBtn.style.opacity = '1';
        downloadBtn.style.pointerEvents = 'auto';
      }
    }
  });

  init();
})();
