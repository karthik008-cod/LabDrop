// ============================================================
// LabDrop — Mobile UI Logic (mobile.js)
// ============================================================

(function () {
  'use strict';

  // ---- DOM ----
  const $ = (sel) => document.querySelector(sel);
  const loadingState = $('#loadingState');
  const errorState = $('#errorState');
  const transferView = $('#transferView');
  const pinState = $('#pinState');
  const pinForm = $('#pinForm');
  const pinInput = $('#pinInput');
  const pinError = $('#pinError');

  const errorIcon = $('#errorIcon');
  const errorTitle = $('#errorTitle');
  const errorMessage = $('#errorMessage');
  const retryBtn = $('#retryBtn');

  const mHeaderTitle = $('#mHeaderTitle');
  const mHeaderSubtitle = $('#mHeaderSubtitle');
  const mStatFiles = $('#mStatFiles');
  const mStatSize = $('#mStatSize');
  const mStatExpiry = $('#mStatExpiry');
  const downloadAllBtn = $('#downloadAllBtn');
  const renameZipBtn = $('#renameZipBtn');
  const mFileList = $('#mFileList');
  const mLinkList = $('#mLinkList');

  let currentPin = '';
  let customZipName = '';
  let activeTransferData = null;

  // ---- File icons ----
  const FILE_ICONS = {
    image: '📷',
    code: '💻',
    document: '📄',
    data: '📊',
    archive: '📦',
    file: '📎',
  };

  // ---- Utility: format bytes ----
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ---- Utility: escape HTML ----
  function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    return escapeHtml(text).replace(urlRegex, function(url) {
      let href = url;
      if (url.startsWith('www.')) href = 'http://' + url;
      return `<a href="${href}" target="_blank" style="color: var(--color-primary-dark); text-decoration: underline;" onclick="event.stopPropagation()">${url}</a>`;
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Show state ----
  function showState(state) {
    loadingState.style.display = state === 'loading' ? 'flex' : 'none';
    errorState.classList.toggle('section--hidden', state !== 'error');
    transferView.classList.toggle('section--hidden', state !== 'transfer');
    pinState.classList.toggle('section--hidden', state !== 'pin');
  }

  // ---- Show error ----
  function showError(icon, title, message) {
    errorIcon.textContent = icon;
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    showState('error');
  }

  // ---- Extract transfer ID from URL ----
  function getTransferId() {
    // URL format: /t/:id
    const parts = window.location.pathname.split('/');
    const tIndex = parts.indexOf('t');
    if (tIndex !== -1 && parts[tIndex + 1]) {
      return parts[tIndex + 1];
    }
    return null;
  }

  // ---- Fetch transfer data ----
  async function loadTransfer(retryCount = 0) {
    const transferId = getTransferId();

    if (!transferId) {
      showError('🔗', 'Invalid Link', 'This transfer link is malformed or incomplete.');
      return;
    }

    if (retryCount === 0) showState('loading');

    try {
      const headers = {};
      if (currentPin) headers['x-transfer-pin'] = currentPin;

      const res = await fetch(`/api/transfer/${transferId}`, { headers });

      if (res.status === 404) {
        showError('🔍', 'Transfer Not Found', 'This transfer does not exist or is no longer available.');
        return;
      }

      if (res.status === 410) {
        showError('⏰', 'Transfer Expired', 'This transfer has expired. Ask the sender to create a new one.');
        return;
      }

      if (res.status === 401) {
        pinError.style.display = currentPin ? 'block' : 'none';
        pinError.textContent = 'Incorrect PIN. Please try again.';
        pinInput.value = '';
        showState('pin');
        return;
      }
      
      if (res.status === 429) {
         showError('🔒', 'Locked', 'Too many incorrect PIN attempts. This transfer is locked.');
         return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showError('😕', 'Something Went Wrong', errData.error || 'An unexpected error occurred.');
        return;
      }

      const data = await res.json();
      activeTransferData = data;
      renderTransfer();
    } catch (err) {
      if (retryCount < 2) {
        // Silent retry for spotty mobile networks
        setTimeout(() => loadTransfer(retryCount + 1), 1000);
      } else {
        showError('📡', 'Network Error', 'Could not connect to the server. Make sure you are on the same Wi-Fi/LAN network as the lab computer.');
      }
    }
  }

  // ---- Render transfer ----
  function renderTransfer() {
    const data = activeTransferData;
    if (!data) return;

    showState('transfer');

    if (data.transferName) {
       mHeaderTitle.textContent = data.transferName;
       mHeaderSubtitle.textContent = 'Your lab files are ready';
    } else {
       mHeaderTitle.textContent = '🧪 LabDrop';
       mHeaderSubtitle.textContent = 'Your lab files are ready';
    }

    mStatFiles.textContent = data.fileCount + (data.linkCount > 0 ? ` (+${data.linkCount})` : '');
    mStatSize.textContent = formatBytes(data.totalSize);

    // Build URL query params
    const params = new URLSearchParams();
    if (currentPin) params.append('pin', currentPin);
    if (customZipName) params.append('name', customZipName);
    const qs = params.toString() ? `?${params.toString()}` : '';

    // Download All link
    downloadAllBtn.href = `/download/${data.id}/zip${qs}`;
    
    // Rename button state
    if (customZipName || data.transferName) {
       downloadAllBtn.textContent = `⬇️ ${customZipName || data.transferName}.zip (${formatBytes(data.totalSize)})`;
    } else {
       downloadAllBtn.textContent = `⬇️ Download All (ZIP) · ${formatBytes(data.totalSize)}`;
    }

    // Group files and links by folder
    const fs = data.folderStructure || {};
    const groups = {}; // folderName -> { files: [], links: [] }
    const rootFiles = [];
    const rootLinks = [];

    (data.files || []).forEach((f) => {
      const folder = fs[f.name];
      if (folder) {
        if (!groups[folder]) groups[folder] = { files: [], links: [] };
        groups[folder].files.push(f);
      } else {
        rootFiles.push(f);
      }
    });

    (data.links || []).forEach((link) => {
      const folder = fs['link:' + link];
      if (folder) {
        if (!groups[folder]) groups[folder] = { files: [], links: [] };
        groups[folder].links.push(link);
      } else {
        rootLinks.push(link);
      }
    });

    // File list rendering helper
    mFileList.innerHTML = '';
    
    function renderMobileFileItem(file) {
      const cat = file.category || 'file';
      const icon = FILE_ICONS[cat] || '📎';
      const fileQs = currentPin ? `?pin=${currentPin}` : '';
      
      const customName = file.customName || file.name;
      const downloadQs = fileQs + (file.customName ? (fileQs ? '&' : '?') + 'name=' + encodeURIComponent(file.customName) : '');
      const downloadUrl = `/download/${data.id}/${file.id}${downloadQs}`;

      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <div class="file-item__icon file-item__icon--${cat}">${icon}</div>
        <div class="file-item__details">
          <div class="file-item__name" title="${escapeHtml(customName)}">${escapeHtml(customName)}</div>
          <div class="file-item__size">${formatBytes(file.size)}</div>
        </div>
        <div class="file-item__actions" style="display:flex; gap: 4px;">
          <button class="btn btn--outline btn--icon rename-file-btn" data-file-id="${file.id}" title="Rename ${escapeHtml(customName)}" style="font-size: 0.85rem; padding: 6px 10px;">
            ✏️
          </button>
          <a class="btn btn--secondary btn--icon download-file-btn" href="${downloadUrl}" data-filename="${escapeHtml(customName)}" title="Browse / Download ${escapeHtml(customName)}" style="font-size: 0.85rem; padding: 6px 12px;">
            ⬇️
          </a>
        </div>
      `;
      return li;
    }

    function renderMobileLinkItem(link, listEl = mFileList) {
      const li = document.createElement('li');
      li.className = 'file-item';
      const isUrl = /^https?:\/\/[^\s]+$/.test(link);
      const openBtnHtml = isUrl ? `<a class="btn btn--secondary btn--icon" href="${escapeHtml(link)}" target="_blank" title="Open Link" style="font-size: 0.85rem; padding: 6px 12px;">🔗</a>` : '';
      li.innerHTML = `
        <div class="file-item__icon file-item__icon--data">🔗</div>
        <div class="file-item__details" style="align-items: flex-start; max-width: 100%; overflow: hidden;">
          <div class="file-item__name" style="white-space: pre-wrap; word-break: break-word; overflow: visible; font-family: monospace; font-size: 0.9em;">${linkify(link)}</div>
          ${!isUrl ? '' : '<div class="file-item__size">Link</div>'}
        </div>
        <div class="file-item__actions">
          ${openBtnHtml}
        </div>
      `;
      listEl.appendChild(li);
    }

    // Render root files
    if (rootFiles.length > 0 && Object.keys(groups).length > 0) {
      const header = document.createElement('div');
      header.className = 'folder-group-header';
      header.innerHTML = '📥 Unorganized';
      mFileList.appendChild(header);
    }
    rootFiles.forEach(f => mFileList.appendChild(renderMobileFileItem(f)));

    // Render folder groups (files and links)
    Object.keys(groups).forEach(folderName => {
      const header = document.createElement('div');
      header.className = 'folder-group-header';
      header.innerHTML = `📁 ${escapeHtml(folderName)}`;
      mFileList.appendChild(header);
      groups[folderName].files.forEach(f => mFileList.appendChild(renderMobileFileItem(f)));
      groups[folderName].links.forEach(link => renderMobileLinkItem(link, mFileList));
    });

    // Root links
    mLinkList.innerHTML = '';
    if (rootLinks.length > 0) {
      mLinkList.style.display = 'block';
      rootLinks.forEach(link => renderMobileLinkItem(link, mLinkList));
    } else {
      mLinkList.style.display = 'none';
    }

    // Expiry countdown
    startExpiryCountdown(data.expiresAt);
  }

  // ---- Expiry countdown ----
  function startExpiryCountdown(expiresAt) {
    function tick() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        mStatExpiry.textContent = 'Expired';
        mStatExpiry.style.color = 'var(--color-error)';
        return;
      }

      const totalSeconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      mStatExpiry.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (totalSeconds <= 60) {
        mStatExpiry.style.color = 'var(--color-error)';
      } else if (totalSeconds <= 300) {
        mStatExpiry.style.color = 'var(--color-warning)';
      } else {
        mStatExpiry.style.color = '';
      }

      requestAnimationFrame(() => setTimeout(tick, 1000));
    }
    tick();
  }

  // ---- Rename ZIP ----
  renameZipBtn.addEventListener('click', () => {
    if (!activeTransferData) return;
    const defaultName = customZipName || activeTransferData.transferName || activeTransferData.shortCode;
    const newName = prompt('Enter a name for the ZIP file:', defaultName);
    if (newName !== null && newName.trim() !== '') {
      customZipName = newName.trim();
      renderTransfer();
    }
  });

  // ---- Save As (Browse) for ZIP ----
  downloadAllBtn.addEventListener('click', async (e) => {
    if (window.showSaveFilePicker) {
      e.preventDefault();
      const downloadUrl = downloadAllBtn.getAttribute('href');
      let filename = customZipName || activeTransferData.transferName || 'LabDrop_Transfer';
      if (!filename.toLowerCase().endsWith('.zip')) {
        filename += '.zip';
      }
      
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'ZIP Archive',
            accept: { 'application/zip': ['.zip'] }
          }]
        });
        
        downloadAllBtn.style.opacity = '0.5';
        downloadAllBtn.style.pointerEvents = 'none';

        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error('Download failed');
        
        const blob = await res.blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        if (err.name !== 'AbortError') {
          alert('Save failed: ' + err.message);
          window.location.href = downloadUrl;
        }
      } finally {
        downloadAllBtn.style.opacity = '1';
        downloadAllBtn.style.pointerEvents = 'auto';
      }
    }
  });

  // ---- Individual File Rename & Save As ----
  mFileList.addEventListener('click', async (e) => {
    // Rename File
    const renameBtn = e.target.closest('.rename-file-btn');
    if (renameBtn && activeTransferData) {
      const fileId = renameBtn.getAttribute('data-file-id');
      const file = (activeTransferData.files || []).find(f => f.id === fileId);
      if (file) {
        let ext = '';
        const extMatch = file.name.match(/\.[^.]+$/);
        if (extMatch) ext = extMatch[0];
        
        let baseName = file.customName || file.name;
        if (ext && baseName.endsWith(ext)) {
           baseName = baseName.slice(0, -ext.length);
        }

        const newBase = prompt(`Enter a new name for this file (without ${ext}):`, baseName);
        if (newBase !== null && newBase.trim() !== '') {
          let finalName = newBase.trim();
          if (ext && !finalName.toLowerCase().endsWith(ext.toLowerCase())) {
             finalName += ext;
          }
          file.customName = finalName;
          renderTransfer();
        }
      }
      return;
    }

    // Save As (Browse) for Individual File
    const downloadBtn = e.target.closest('.download-file-btn');
    if (downloadBtn && window.showSaveFilePicker) {
      e.preventDefault();
      const filename = downloadBtn.getAttribute('data-filename');
      const downloadUrl = downloadBtn.getAttribute('href');
      
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename
        });
        
        // Show loading state or toast (simple alert for now)
        downloadBtn.style.opacity = '0.5';
        downloadBtn.style.pointerEvents = 'none';

        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error('Download failed');
        
        const blob = await res.blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        if (err.name !== 'AbortError') {
          alert('Save failed: ' + err.message);
          // Fallback to standard download
          window.location.href = downloadUrl;
        }
      } finally {
        downloadBtn.style.opacity = '1';
        downloadBtn.style.pointerEvents = 'auto';
      }
    }
  });

  // ---- PIN form submit ----
  pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    currentPin = pinInput.value.trim();
    if (currentPin.length > 0) {
      loadTransfer();
    }
  });

  // ---- Retry button ----
  retryBtn.addEventListener('click', () => loadTransfer(0));

  // ---- Initialize ----
  loadTransfer();
})();
