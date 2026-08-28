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
  const mTransferName = $('#mTransferName');
  const mStatCodeBadge = $('#mStatCodeBadge');
  const downloadAllBtn = $('#downloadAllBtn');
  const shareAllBtn = $('#shareAllBtn');
  const renameZipBtn = $('#renameZipBtn');
  const mFileList = $('#mFileList');
  const mLinkList = $('#mLinkList');
  
  const selectAllCheckbox = $('#selectAllCheckbox');
  const multiSelectActions = $('#multiSelectActions');
  const downloadSelectedBtn = $('#downloadSelectedBtn');
  const shareSelectedBtn = $('#shareSelectedBtn');
  
  const shareNameModal = $('#shareNameModal');
  const shareNameModalClose = $('#shareNameModalClose');
  const shareZipNameInput = $('#shareZipNameInput');
  const confirmShareZipBtn = $('#confirmShareZipBtn');

  let currentPin = '';
  let customZipName = '';
  let activeTransferData = null;
  let selectedFileIds = new Set();
  let pendingShareZipUrl = null;

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
        if (retryCount < 3) {
          setTimeout(() => loadTransfer(retryCount + 1), 1000);
          return;
        }
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
       mHeaderTitle.textContent = 'LabDrop';
       mHeaderSubtitle.textContent = 'Your lab files are ready';
    }

    mStatFiles.textContent = data.fileCount + (data.linkCount > 0 ? ` (+${data.linkCount})` : '');
    mStatSize.textContent = formatBytes(data.totalSize);
    
    if (mTransferName) mTransferName.textContent = data.transferName || 'Lab Files';
    if (mStatCodeBadge) mStatCodeBadge.textContent = data.shortCode || '----';

    // Build URL query params
    const params = new URLSearchParams();
    if (currentPin) params.append('pin', currentPin);
    if (customZipName) params.append('name', customZipName);
    const qs = params.toString() ? `?${params.toString()}` : '';

    // Download All link
    downloadAllBtn.href = `/download/${data.id}/zip${qs}`;
    
    // Rename button state
    if (customZipName || data.transferName) {
       downloadAllBtn.textContent = `⬇️ Download`;
       if(shareAllBtn) shareAllBtn.textContent = `📤 Share`;
    } else {
       downloadAllBtn.textContent = `⬇️ Download All`;
       if(shareAllBtn) shareAllBtn.textContent = `📤 Share All`;
    }

    selectedFileIds.clear();
    if(typeof updateSelectionState === 'function') updateSelectionState();

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
        <div class="file-item__actions" style="display:flex; gap: 4px; align-items: center;">
          <input type="checkbox" class="file-checkbox" data-file-id="${file.id}" style="margin-right: 8px; transform: scale(1.2);" />
          <button class="btn btn--outline btn--icon rename-file-btn" data-file-id="${file.id}" title="Rename ${escapeHtml(customName)}" style="font-size: 0.85rem; padding: 6px 10px;">
            ✏️
          </button>
          <a class="btn btn--secondary btn--icon download-file-btn" href="${downloadUrl}" data-filename="${escapeHtml(customName)}" title="Browse / Download ${escapeHtml(customName)}" style="font-size: 0.85rem; padding: 6px 12px;">
            ⬇️
          </a>
          <button class="btn btn--secondary btn--icon share-file-btn" data-filename="${escapeHtml(customName)}" data-href="${downloadUrl}" title="Share ${escapeHtml(customName)}" style="font-size: 0.85rem; padding: 6px 12px;">
            📤
          </button>
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

  // ---- Save As (Browse) vs Direct for ZIP ----
  downloadAllBtn.addEventListener('click', (e) => {
    if (window.showSaveFilePicker) {
      e.preventDefault();
      const downloadUrl = downloadAllBtn.getAttribute('href');
      let filename = customZipName || activeTransferData.transferName || 'LabDrop_Transfer';
      if (!filename.toLowerCase().endsWith('.zip')) {
        filename += '.zip';
      }
      openDownloadModal(downloadUrl, filename, downloadAllBtn);
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

    // Save As (Browse) vs Direct for Individual File
    const downloadBtn = e.target.closest('.download-file-btn');
    if (downloadBtn) {
      e.preventDefault();
      const filename = downloadBtn.getAttribute('data-filename');
      const downloadUrl = downloadBtn.getAttribute('href');
      if (typeof openDownloadModal === 'function') {
        openDownloadModal(downloadUrl, filename, downloadBtn);
      } else {
        window.location.href = downloadUrl;
      }
      return;
    }
    
    // Direct Share Individual File
    const shareBtn = e.target.closest('.share-file-btn');
    if (shareBtn) {
      const filename = shareBtn.getAttribute('data-filename');
      const downloadUrl = shareBtn.getAttribute('data-href');
      
      const prevHtml = shareBtn.innerHTML;
      shareBtn.innerHTML = '<span class="spinner"></span>';
      shareBtn.disabled = true;
      
      await shareItem(downloadUrl, filename);
      
      shareBtn.innerHTML = prevHtml;
      shareBtn.disabled = false;
      return;
    }
    
    // Checkbox Toggle
    if (e.target.classList.contains('file-checkbox')) {
      const fileId = e.target.getAttribute('data-file-id');
      if (e.target.checked) {
        selectedFileIds.add(fileId);
      } else {
        selectedFileIds.delete(fileId);
      }
      updateSelectionState();
    }
  });

  // ---- Multi-select logic ----
  function updateSelectionState() {
    if (!activeTransferData) return;
    const allFiles = activeTransferData.files || [];
    const allCheckboxes = document.querySelectorAll('.file-checkbox');
    
    if (selectedFileIds.size > 0) {
      multiSelectActions.style.display = 'flex';
      selectAllCheckbox.checked = selectedFileIds.size === allFiles.length;
    } else {
      multiSelectActions.style.display = 'none';
      selectAllCheckbox.checked = false;
    }
    
    allCheckboxes.forEach(cb => {
      cb.checked = selectedFileIds.has(cb.getAttribute('data-file-id'));
    });
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const allFiles = activeTransferData.files || [];
      if (e.target.checked) {
        allFiles.forEach(f => selectedFileIds.add(f.id));
      } else {
        selectedFileIds.clear();
      }
      updateSelectionState();
    });
  }

  if (downloadSelectedBtn) {
    downloadSelectedBtn.addEventListener('click', () => {
      if (selectedFileIds.size === 0) return;
      const url = getZipDownloadUrl(Array.from(selectedFileIds));
      const filename = customZipName || activeTransferData.transferName || 'LabDrop_Selected';
      openDownloadModal(url, filename + '.zip', downloadSelectedBtn);
    });
  }

  if (shareSelectedBtn) {
    shareSelectedBtn.addEventListener('click', () => {
      if (selectedFileIds.size === 0) return;
      pendingShareZipUrl = getZipDownloadUrl(Array.from(selectedFileIds));
      shareZipNameInput.value = customZipName || activeTransferData.transferName || 'LabDrop_Selected';
      shareNameModal.classList.add('active');
    });
  }

  function getZipDownloadUrl(fileIds = []) {
    const params = new URLSearchParams();
    if (currentPin) params.append('pin', currentPin);
    if (customZipName) params.append('name', customZipName);
    if (fileIds.length > 0) params.append('files', fileIds.join(','));
    return `/download/${activeTransferData.id}/zip?${params.toString()}`;
  }

  // ---- Share ZIP Logic ----
  if (shareAllBtn) {
    shareAllBtn.addEventListener('click', () => {
      pendingShareZipUrl = getZipDownloadUrl();
      shareZipNameInput.value = customZipName || activeTransferData.transferName || 'LabDrop_Transfer';
      shareNameModal.classList.add('active');
    });
  }

  if (shareNameModalClose) shareNameModalClose.addEventListener('click', () => shareNameModal.classList.remove('active'));

  if (confirmShareZipBtn) {
    confirmShareZipBtn.addEventListener('click', async () => {
      if (!pendingShareZipUrl) return;
      const baseName = shareZipNameInput.value.trim() || 'Shared_Files';
      const filename = baseName.endsWith('.zip') ? baseName : baseName + '.zip';
      shareNameModal.classList.remove('active');
      
      const prevHtml = shareAllBtn.innerHTML;
      shareAllBtn.innerHTML = '<span class="spinner"></span> Working...';
      if (shareSelectedBtn) shareSelectedBtn.innerHTML = '<span class="spinner"></span>';
      
      await shareItem(pendingShareZipUrl + (pendingShareZipUrl.includes('?') ? '&' : '?') + 'name=' + encodeURIComponent(baseName), filename);
      
      shareAllBtn.innerHTML = prevHtml;
      if (shareSelectedBtn) shareSelectedBtn.innerHTML = '📤 Share';
    });
  }

  async function shareItem(url, filename) {
    if (!navigator.share) {
      alert("Your browser does not support native sharing.");
      return;
    }
    
    // Test if we can share this file type before downloading
    let type = 'application/octet-stream';
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'zip') type = 'application/zip';
    else if (ext === 'pdf') type = 'application/pdf';
    else if (['jpg','jpeg','png','gif','webp'].includes(ext)) type = 'image/' + ext.replace('jpg','jpeg');
    
    const testFile = new File([''], filename, { type });
    const absoluteUrl = new URL(url, window.location.origin).href;
    
    try {
      if (navigator.canShare && navigator.canShare({ files: [testFile] })) {
        // Browser supports sharing this file type.
        // Fetching might take too long and cause the user gesture to expire (especially on iOS).
        // To prevent this, we fetch first, then ask the user to click a "Share Now" button.
        
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;backdrop-filter:blur(4px);';
        
        const card = document.createElement('div');
        card.style.cssText = 'background:var(--color-surface);padding:24px;border-radius:12px;text-align:center;max-width:300px;width:90%;box-shadow:0 10px 25px rgba(0,0,0,0.2);border:1px solid var(--color-border);';
        
        const text = document.createElement('p');
        text.innerHTML = '<span class="spinner"></span> Preparing file...';
        text.style.marginBottom = '16px';
        text.style.color = 'var(--color-text)';
        text.style.fontWeight = '500';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn--outline btn--sm';
        cancelBtn.style.width = '100%';
        cancelBtn.innerText = 'Cancel';
        cancelBtn.onclick = () => document.body.removeChild(overlay);
        
        card.appendChild(text);
        card.appendChild(cancelBtn);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        let res;
        try {
            res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch");
        } catch(e) {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            throw e;
        }

        const blob = await res.blob();
        const file = new File([blob], filename, { type: blob.type || type });
        
        // Ready to share!
        text.innerHTML = '✅ Ready to share!';
        
        const shareBtn = document.createElement('button');
        shareBtn.className = 'btn btn--primary btn--lg';
        shareBtn.style.width = '100%';
        shareBtn.style.marginBottom = '8px';
        shareBtn.innerText = '📤 Share Now';
        
        shareBtn.onclick = async () => {
            document.body.removeChild(overlay);
            try {
                await navigator.share({
                    title: filename,
                    files: [file]
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Share error:", err);
                    window.location.href = url; // Fallback to download
                }
            }
        };
        
        card.insertBefore(shareBtn, cancelBtn);

      } else {
        // Browser does not support sharing this file type as a file natively.
        // Share the direct download link instantly.
        await navigator.share({
          title: filename,
          text: `Download ${filename}`,
          url: absoluteUrl
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Share error:", err);
        window.location.href = url; // Fallback to download
      }
    }
  }

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

  // ---- Download Options Modal Logic ----
  const downloadModal = document.getElementById('downloadModal');
  const downloadModalClose = document.getElementById('downloadModalClose');
  const btnDownloadDefault = document.getElementById('btnDownloadDefault');
  const btnDownloadBrowse = document.getElementById('btnDownloadBrowse');
  
  let pendingDownload = null;

  function openDownloadModal(url, filename, btnEl) {
    pendingDownload = { url, filename, btnEl };
    downloadModal.classList.add('active');
  }

  function closeDownloadModal() {
    downloadModal.classList.remove('active');
    pendingDownload = null;
  }

  if (downloadModalClose) downloadModalClose.addEventListener('click', closeDownloadModal);

  if (btnDownloadDefault) {
    btnDownloadDefault.addEventListener('click', () => {
      if (pendingDownload) {
        window.location.href = pendingDownload.url;
      }
      closeDownloadModal();
    });
  }

  if (btnDownloadBrowse) {
    btnDownloadBrowse.addEventListener('click', async () => {
      if (!pendingDownload) return;
      const { url, filename, btnEl } = pendingDownload;
      closeDownloadModal();
      
      try {
        const ext = filename.split('.').pop();
        const types = [];
        if (ext === 'zip') {
          types.push({ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } });
        }
        
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: types.length > 0 ? types : undefined
        });
        
        btnEl.style.opacity = '0.5';
        btnEl.style.pointerEvents = 'none';

        const res = await fetch(url);
        if (!res.ok) throw new Error('Download failed');
        
        const blob = await res.blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        if (err.name !== 'AbortError') {
          alert('Save failed: ' + err.message);
          window.location.href = url; // Fallback to direct download
        }
      } finally {
        if (btnEl) {
          btnEl.style.opacity = '1';
          btnEl.style.pointerEvents = 'auto';
        }
      }
    });
  }

  // ---- Initialize ----
  loadTransfer();
})();

  // ---- Auth Logic for Receiver Screen ----
  const authModal = document.getElementById('authModal');
  if (authModal) {
    const authModalClose = document.getElementById('authModalClose');
    const authForm = document.getElementById('authForm');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authError = document.getElementById('authError');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const authModalTitle = document.getElementById('authModalTitle');
    const authToggleText = document.getElementById('authToggleText');
    const authToggleLink = document.getElementById('authToggleLink');
    
    const authLoggedOut = document.getElementById('authLoggedOut');
    const authLoggedIn = document.getElementById('authLoggedIn');
    const navLoginBtn = document.getElementById('navLoginBtn');
    const navSignupBtn = document.getElementById('navSignupBtn');
    const navLogoutBtn = document.getElementById('navLogoutBtn');
    const navUserEmail = document.getElementById('navUserEmail');

    let authToken = sessionStorage.getItem('labdrop_token');
    let authMode = 'login'; 

    function updateAuthUI() {
      if (authToken) {
        if (authLoggedOut) authLoggedOut.style.display = 'none';
        if (authLoggedIn) authLoggedIn.style.display = 'flex';
        fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + authToken } })
          .then(res => res.ok ? res.json() : Promise.reject())
          .then(data => {
            if (navUserEmail) navUserEmail.textContent = data.user.email;
          })
          .catch(() => {
            authToken = null;
            sessionStorage.removeItem('labdrop_token');
            updateAuthUI();
          });
      } else {
        if (authLoggedOut) authLoggedOut.style.display = 'flex';
        if (authLoggedIn) authLoggedIn.style.display = 'none';
      }
    }

    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener('click', () => {
        const type = authPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        authPassword.setAttribute('type', type);
        togglePasswordBtn.textContent = type === 'password' ? '???' : '??';
      });
    }

    function openAuthModal(mode) {
      authMode = mode;
      authError.style.display = 'none';
      authForm.reset();
      if (mode === 'login') {
        authModalTitle.textContent = 'Login';
        authSubmitBtn.textContent = 'Login';
        authToggleText.textContent = 'Don\'t have an account?';
        authToggleLink.textContent = 'Sign Up';
      } else {
        authModalTitle.textContent = 'Create Account';
        authSubmitBtn.textContent = 'Sign Up';
        authToggleText.textContent = 'Already have an account?';
        authToggleLink.textContent = 'Login';
      }
      authModal.classList.add('active');
    }

    function closeAuthModal() {
      authModal.classList.remove('active');
    }

    if (authToggleLink) {
      authToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal(authMode === 'login' ? 'register' : 'login');
      });
    }

    if (authModalClose) authModalClose.addEventListener('click', closeAuthModal);
    if (navLoginBtn) navLoginBtn.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });
    if (navSignupBtn) navSignupBtn.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('register'); });
    
    if (navLogoutBtn) {
      navLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        authToken = null;
        sessionStorage.removeItem('labdrop_token');
        updateAuthUI();
      });
    }

    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
        authSubmitBtn.disabled = true;
        authError.style.display = 'none';

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: authEmail.value, password: authPassword.value })
          });
          const data = await res.json();
          
          if (res.ok) {
            authToken = data.token;
            sessionStorage.setItem('labdrop_token', authToken);
            updateAuthUI();
            closeAuthModal();
          } else {
            authError.textContent = data.error || 'Authentication failed.';
            authError.style.display = 'block';
          }
        } catch (err) {
          authError.textContent = 'Network error.';
          authError.style.display = 'block';
        } finally {
          authSubmitBtn.disabled = false;
        }
      });
    }

    updateAuthUI();
  }

  // Analytics Tracking
  setTimeout(() => {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('deviceId', deviceId);
      fetch('/api/analytics/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId })
      }).catch(() => {});
    }
  }, 1000);
