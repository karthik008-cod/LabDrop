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

    if (mHeaderTitle) {
      mHeaderTitle.textContent = data.transferName || 'LabDrop';
    }
    if (mHeaderSubtitle) {
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
    const zipUrl = `/download/${data.id}/zip${qs}`;
    downloadAllBtn.href = zipUrl;
    downloadAllBtn.setAttribute('href', zipUrl);
    let defaultZipFilename = customZipName || data.transferName || (data.shortCode ? `LabDrop_${data.shortCode}` : 'LabDrop_Files');
    if (!defaultZipFilename.toLowerCase().endsWith('.zip')) {
      defaultZipFilename += '.zip';
    }
    downloadAllBtn.setAttribute('download', defaultZipFilename);

    if (!data.files || data.files.length === 0) {
      downloadAllBtn.style.display = 'none';
      if (renameZipBtn) renameZipBtn.style.display = 'none';
    } else {
      downloadAllBtn.style.display = 'inline-flex';
      if (renameZipBtn) renameZipBtn.style.display = 'inline-flex';
    }
    
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
          <button class="btn btn--outline btn--icon ai-file-btn" data-file-id="${file.id}" title="AI Viva & Exam Prep for ${escapeHtml(customName)}" style="font-size: 0.85rem; padding: 6px 10px; color: #7c3aed; border-color: rgba(124, 58, 237, 0.3);">
            ✨
          </button>
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
  renameZipBtn.addEventListener('click', async () => {
    if (!activeTransferData) return;
    const defaultName = customZipName || activeTransferData.transferName || activeTransferData.shortCode;
    const newName = await window.LabDialog.prompt('Enter a name for the ZIP file:', defaultName);
    if (newName !== null && newName.trim() !== '') {
      customZipName = newName.trim();
      renderTransfer();
    }
  });

  // ---- Save As (Browse) vs Direct for ZIP ----
  downloadAllBtn.addEventListener('click', (e) => {
    const downloadUrl = downloadAllBtn.getAttribute('href') || downloadAllBtn.href;
    if (!downloadUrl || downloadUrl === '#' || downloadUrl.endsWith('#')) {
      e.preventDefault();
      return;
    }

    let filename = customZipName || activeTransferData?.transferName || (activeTransferData?.shortCode ? `LabDrop_${activeTransferData.shortCode}` : 'LabDrop_Transfer');
    if (!filename.toLowerCase().endsWith('.zip')) {
      filename += '.zip';
    }

    if (window.showSaveFilePicker) {
      e.preventDefault();
      openDownloadModal(downloadUrl, filename, downloadAllBtn);
    } else {
      e.preventDefault();
      window.location.href = downloadUrl;
    }
  });

  // ---- Individual File Rename & Save As ----
  mFileList.addEventListener('click', async (e) => {
    // AI Assistant for Individual File
    const aiBtn = e.target.closest('.ai-file-btn');
    if (aiBtn) {
      const fileId = aiBtn.getAttribute('data-file-id');
      if (typeof openAiModal === 'function') {
        openAiModal('viva', fileId);
      }
      return;
    }

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

        const newBase = await window.LabDialog.prompt(`Enter a new name for this file (without ${ext}):`, baseName);
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
      let filename = customZipName || activeTransferData?.transferName || 'LabDrop_Selected';
      if (!filename.toLowerCase().endsWith('.zip')) {
        filename += '.zip';
      }
      openDownloadModal(url, filename, downloadSelectedBtn);
    });
  }

  if (shareSelectedBtn) {
    shareSelectedBtn.addEventListener('click', () => {
      if (selectedFileIds.size === 0) return;
      const selectedFiles = (activeTransferData.files || []).filter(f => selectedFileIds.has(f.id));
      shareMultipleFiles(selectedFiles);
    });
  }

  function getZipDownloadUrl(fileIds = []) {
    const params = new URLSearchParams();
    if (currentPin) params.append('pin', currentPin);
    if (customZipName) params.append('name', customZipName);
    if (fileIds.length > 0) params.append('files', fileIds.join(','));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return `/download/${activeTransferData.id}/zip${qs}`;
  }

  // ---- Share Logic ----
  if (shareAllBtn) {
    shareAllBtn.addEventListener('click', () => {
      shareMultipleFiles(activeTransferData.files || []);
    });
  }

  if (shareNameModalClose) shareNameModalClose.addEventListener('click', () => shareNameModal.classList.remove('active'));

  if (confirmShareZipBtn) {
    confirmShareZipBtn.addEventListener('click', async () => {
      // confirmShareZipBtn is now only used if needed, or we can just hide it
      shareNameModal.classList.remove('active');
    });
  }

  async function shareMultipleFiles(filesArray) {
    if (!navigator.share) {
      await window.LabDialog.alert("Your browser does not support native sharing.");
      return;
    }
    
    if (filesArray.length === 0) return;

    // Perform a pre-flight check using empty files to see if the OS accepts these file types natively
    const testFiles = filesArray.map(f => {
        const originalName = f.customName || f.originalName || f.name;
        let type = 'application/octet-stream';
        const ext = originalName.split('.').pop().toLowerCase();
        if (ext === 'pdf') type = 'application/pdf';
        else if (['jpg','jpeg','png','gif','webp'].includes(ext)) type = 'image/' + ext.replace('jpg','jpeg');
        else if (ext === 'zip') type = 'application/zip';
        return new File([''], originalName, { type });
    });

    if (!navigator.canShare || !navigator.canShare({ files: testFiles })) {
        // OS rejects sharing this combination of native files natively (common for PDFs on mobile).
        // Instantly fallback to sharing the link, which preserves the user gesture and works 100% of the time!
        const zipUrl = getZipDownloadUrl(filesArray.map(f => f.id));
        const absoluteUrl = new URL(zipUrl, window.location.origin).href;
        try {
            await navigator.share({
                title: 'LabDrop Shared Files',
                text: 'Download LabDrop Shared Files',
                url: absoluteUrl
            });
        } catch(err) {
            if (err.name !== 'AbortError') window.location.href = zipUrl;
        }
        return;
    }

    // OS accepted the pre-flight check! We can safely fetch and share natively.
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;backdrop-filter:blur(2px);';
    
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--color-bg);padding:24px;border-radius:12px;text-align:center;max-width:300px;width:90%;box-shadow:var(--shadow-md);border:1px solid var(--color-border);';
    
    const text = document.createElement('p');
    text.innerHTML = '<span class="spinner"></span> Fetching files... (0/' + filesArray.length + ')';
    text.style.marginBottom = '16px';
    text.style.color = 'var(--color-text)';
    text.style.fontWeight = '500';
    
    let isCancelled = false;
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn--outline btn--sm';
    cancelBtn.style.width = '100%';
    cancelBtn.innerText = 'Cancel';
    cancelBtn.onclick = () => {
        isCancelled = true;
        document.body.removeChild(overlay);
    };
    
    card.appendChild(text);
    card.appendChild(cancelBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const shareFiles = [];
    let completed = 0;
    
    try {
        for (const fileObj of filesArray) {
            if (isCancelled) return;
            const originalName = fileObj.customName || fileObj.originalName || fileObj.name;
            const url = `/download/${activeTransferData.id}/${fileObj.id}${currentPin ? '?pin=' + encodeURIComponent(currentPin) : ''}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch");
            const blob = await res.blob();
            
            let type = blob.type || 'application/octet-stream';
            const ext = originalName.split('.').pop().toLowerCase();
            if (ext === 'pdf') type = 'application/pdf';
            else if (['jpg','jpeg','png','gif','webp'].includes(ext)) type = 'image/' + ext.replace('jpg','jpeg');
            else if (ext === 'zip') type = 'application/zip';
            
            shareFiles.push(new File([blob], originalName, { type }));
            completed++;
            text.innerHTML = '<span class="spinner"></span> Fetching files... (' + completed + '/' + filesArray.length + ')';
        }
    } catch(e) {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
        await window.LabDialog.alert("Failed to fetch files for sharing. They might be too large.");
        return;
    }

    if (isCancelled) return;

    if (navigator.canShare && navigator.canShare({ files: shareFiles })) {
        text.innerHTML = '✅ Ready to share!';
        const shareBtn = document.createElement('button');
        shareBtn.className = 'btn btn--primary btn--lg';
        shareBtn.style.width = '100%';
        shareBtn.style.marginBottom = '8px';
        shareBtn.innerText = '📤 Share Now';
        
        shareBtn.onclick = async () => {
            document.body.removeChild(overlay);
            try {
                // Construct a fallback URL just in case the target app (like WhatsApp on iOS) 
                // silently drops the files due to strict MIME type policies (like mixing PDFs and JPGs).
                // This ensures the app still receives text so it doesn't fail with "Empty message".
                const zipUrl = getZipDownloadUrl(filesArray.map(f => f.id));
                const absoluteUrl = new URL(zipUrl, window.location.origin).href;
                
                await navigator.share({
                    title: 'LabDrop Files',
                    text: `LabDrop Files:\n${absoluteUrl}`,
                    files: shareFiles
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Share error:", err);
                    const zipUrl = getZipDownloadUrl(filesArray.map(f => f.id));
                    window.location.href = zipUrl;
                }
            }
        };
        card.insertBefore(shareBtn, cancelBtn);
    } else {
        // Fallback if final check fails despite pre-flight
        document.body.removeChild(overlay);
        const zipUrl = getZipDownloadUrl(filesArray.map(f => f.id));
        const absoluteUrl = new URL(zipUrl, window.location.origin).href;
        try {
            await navigator.share({
                title: 'LabDrop Shared Files',
                text: 'Download LabDrop Shared Files',
                url: absoluteUrl
            });
        } catch(err) {
            if (err.name !== 'AbortError') window.location.href = zipUrl;
        }
    }
  }

  async function shareItem(url, filename) {
      const fileIdMatch = url.match(/\/download\/[^\/]+\/([^\/?]+)/);
      if (fileIdMatch && fileIdMatch[1] !== 'zip') {
          const fileObj = (activeTransferData.files || []).find(f => f.id === fileIdMatch[1]);
          if (fileObj) {
              await shareMultipleFiles([fileObj]);
              return;
          }
      }
      
      const absoluteUrl = new URL(url, window.location.origin).href;
      try {
          await navigator.share({
              title: filename,
              text: `Download ${filename}`,
              url: absoluteUrl
          });
      } catch (err) {
          if (err?.name !== 'AbortError') window.location.href = url;
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
    if (!url) return;
    if (!window.showSaveFilePicker) {
      window.location.href = url;
      return;
    }
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
      if (pendingDownload && pendingDownload.url) {
        window.location.href = pendingDownload.url;
      }
      closeDownloadModal();
    });
  }

  if (btnDownloadBrowse) {
    btnDownloadBrowse.addEventListener('click', async () => {
      if (!pendingDownload || !pendingDownload.url) return;
      const { url, filename, btnEl } = pendingDownload;
      closeDownloadModal();
      
      try {
        const ext = filename.split('.').pop().toLowerCase();
        const types = [];
        if (ext === 'zip') {
          types.push({ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } });
        }
        
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: types.length > 0 ? types : undefined
        });
        
        if (btnEl) {
          btnEl.style.opacity = '0.5';
          btnEl.style.pointerEvents = 'none';
        }

        const res = await fetch(url);
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
          await window.LabDialog.alert('Save failed: ' + err.message);
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

  // ---- LabDrop AI Assistant Logic ----
  const aiModal = document.getElementById('aiModal');
  const aiModalClose = document.getElementById('aiModalClose');

  const aiFileSelect = document.getElementById('aiFileSelect');
  const aiDirectFileInput = document.getElementById('aiDirectFileInput');

  const aiExamType = document.getElementById('aiExamType');
  const aiSecondaryOption = document.getElementById('aiSecondaryOption');
  const aiSecondaryLabel = document.getElementById('aiSecondaryLabel');
  const aiCustomLines = document.getElementById('aiCustomLines');
  const aiDifficulty = aiSecondaryOption;
  const aiSummaryLength = aiSecondaryOption;

  const aiMediaWarningBanner = document.getElementById('aiMediaWarningBanner');
  const aiMediaWarningText = document.getElementById('aiMediaWarningText');
  const btnForceViva = document.getElementById('btnForceViva');

  const btnRunViva = document.getElementById('btnRunViva');
  const btnRegenViva = document.getElementById('btnRegenViva');
  const vivaResult = document.getElementById('vivaResult');
  const vivaOutput = document.getElementById('vivaOutput');
  const vivaBadge = document.getElementById('vivaBadge');
  const btnCopyViva = document.getElementById('btnCopyViva');

  const vivaChatMessages = document.getElementById('vivaChatMessages');
  const vivaChatForm = document.getElementById('vivaChatForm');
  const vivaChatInput = document.getElementById('vivaChatInput');
  const vivaChatSubmitBtn = document.getElementById('vivaChatSubmitBtn');

  const aiLoadingSpinner = document.getElementById('aiLoadingSpinner');
  const aiLoadingText = document.getElementById('aiLoadingText');

  let directUploadedFiles = []; // array of { name, content, size, isMedia }
  let lastGeneratedExamOutput = '';
  let vivaConversationHistory = [];

  // Dynamic Exam Mode vs Summary Length Switcher
  window.updateAiSecondaryDropdown = function(actionType) {
    const secSelect = document.getElementById('aiSecondaryOption');
    const secLabel = document.getElementById('aiSecondaryLabel');
    const customInput = document.getElementById('aiCustomLines');
    const runBtn = document.getElementById('btnRunViva');

    if (!secSelect) return;
    const isSummarize = actionType === 'summarize';

    if (secLabel) {
      secLabel.textContent = isSummarize ? 'Summary Length:' : 'Difficulty Level:';
    }

    if (isSummarize) {
      secSelect.innerHTML = `
        <option value="short">⚡ Short (5 lines)</option>
        <option value="medium" selected>📄 Medium (20 lines)</option>
        <option value="large">📚 Large (50 lines)</option>
        <option value="custom">✏️ Custom (Let user fill this number)</option>
      `;
      if (runBtn) runBtn.textContent = '📄 Generate Summary';
      if (customInput) customInput.style.display = 'none';
    } else {
      secSelect.innerHTML = `
        <option value="easy">🟢 Easy (Fundamentals)</option>
        <option value="medium" selected>🟡 Medium (Lab Standard)</option>
        <option value="hard">🔴 Hard (Advanced Traps)</option>
        <option value="extreme">🔥 Extreme (Compiler & Internals)</option>
      `;
      if (runBtn) runBtn.textContent = '🎓 Generate Exam & Viva Prep';
      if (customInput) customInput.style.display = 'none';
    }
  };

  window.handleAiSecondaryChange = function(val) {
    const customInput = document.getElementById('aiCustomLines');
    const examSelect = document.getElementById('aiExamType');
    const isSummarize = examSelect && examSelect.value === 'summarize';
    if (customInput) {
      const isCustom = isSummarize && val === 'custom';
      customInput.style.display = isCustom ? 'block' : 'none';
      if (isCustom) {
        customInput.focus();
      }
    }
  };

  if (aiExamType) {
    aiExamType.addEventListener('change', () => window.updateAiSecondaryDropdown(aiExamType.value));
  }

  if (aiSecondaryOption) {
    aiSecondaryOption.addEventListener('change', () => window.handleAiSecondaryChange(aiSecondaryOption.value));
  }

  function isMediaFilename(name = '') {
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico|mp4|mov|avi|mkv|webm|mp3|wav|ogg|m4a|zip|tar|gz|rar|7z)$/i.test(name);
  }

  function populateAiFiles(preselectedFileId = null) {
    if (!activeTransferData) return;
    const allFiles = activeTransferData.files || [];

    if (aiFileSelect) {
      aiFileSelect.innerHTML = '';

      if (allFiles.length === 0 && directUploadedFiles.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No files uploaded in this transfer yet.';
        aiFileSelect.appendChild(opt);
        checkSelectedMediaWarning();
        return;
      }

      // If multiple files, provide "All Files in Transfer" option
      if (allFiles.length > 1) {
        const opt = document.createElement('option');
        opt.value = 'ALL';
        opt.textContent = `📁 All Files in Transfer (${allFiles.length} files)`;
        aiFileSelect.appendChild(opt);
      }

      // Transfer files
      allFiles.forEach((f, idx) => {
        const displayName = f.customName || f.originalName || f.name || `File ${idx + 1}`;
        const isMedia = isMediaFilename(displayName);
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `${isMedia ? '🖼️' : '📄'} ${displayName} (${formatBytes(f.size)})`;
        aiFileSelect.appendChild(opt);
      });

      // Direct local files
      directUploadedFiles.forEach((df, idx) => {
        const isMedia = isMediaFilename(df.name);
        const opt = document.createElement('option');
        opt.value = `direct_${idx}`;
        opt.textContent = `💻 [Local] ${isMedia ? '🖼️' : '📄'} ${df.name} (${formatBytes(df.size)})`;
        aiFileSelect.appendChild(opt);
      });

      if (preselectedFileId && Array.from(aiFileSelect.options).some(o => o.value === preselectedFileId)) {
        aiFileSelect.value = preselectedFileId;
      } else if (allFiles.length === 1) {
        aiFileSelect.value = allFiles[0].id;
      }
    }

    checkSelectedMediaWarning();
  }

  function getSelectedFiles() {
    if (!aiFileSelect) {
      return { transferFileIds: [], localFiles: [], allSelectedNames: [], count: 0, isMediaOnly: false };
    }

    const val = aiFileSelect.value;
    const allFiles = (activeTransferData && activeTransferData.files) || [];
    const transferFileIds = [];
    const localFiles = [];
    const allSelectedNames = [];
    let allSelectedAreMedia = true;

    if (val === 'ALL') {
      allFiles.forEach(f => {
        transferFileIds.push(f.id);
        const name = f.customName || f.originalName || f.name;
        allSelectedNames.push(name);
        if (!isMediaFilename(name) && f.category !== 'image' && f.category !== 'video' && f.category !== 'audio') {
          allSelectedAreMedia = false;
        }
      });
      directUploadedFiles.forEach(df => {
        localFiles.push(df);
        allSelectedNames.push(df.name);
        if (!isMediaFilename(df.name)) {
          allSelectedAreMedia = false;
        }
      });
    } else if (val && val.startsWith('direct_')) {
      const idx = parseInt(val.replace('direct_', ''), 10);
      const df = directUploadedFiles[idx];
      if (df) {
        localFiles.push(df);
        allSelectedNames.push(df.name);
        if (!isMediaFilename(df.name)) {
          allSelectedAreMedia = false;
        }
      }
    } else if (val) {
      const f = allFiles.find(x => x.id === val);
      if (f) {
        transferFileIds.push(f.id);
        const name = f.customName || f.originalName || f.name;
        allSelectedNames.push(name);
        if (!isMediaFilename(name) && f.category !== 'image' && f.category !== 'video' && f.category !== 'audio') {
          allSelectedAreMedia = false;
        }
      }
    }

    const totalCount = transferFileIds.length + localFiles.length;
    if (totalCount === 0) {
      allSelectedAreMedia = false;
    }

    return {
      transferFileIds,
      localFiles,
      allSelectedNames,
      count: totalCount,
      isMediaOnly: totalCount > 0 && allSelectedAreMedia
    };
  }

  function checkSelectedMediaWarning() {
    if (!aiMediaWarningBanner) return;
    const selection = getSelectedFiles();
    if (selection.isMediaOnly) {
      aiMediaWarningText.textContent = `Selected file(s) [${selection.allSelectedNames.join(', ')}] appear to be images, logos, or media assets that don't typically require viva questions.`;
      aiMediaWarningBanner.style.display = 'flex';
    } else {
      aiMediaWarningBanner.style.display = 'none';
    }
  }

  if (aiFileSelect) {
    aiFileSelect.addEventListener('change', checkSelectedMediaWarning);
  }

  // Local file upload directly into AI modal
  if (aiDirectFileInput) {
    aiDirectFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      for (const file of files) {
        const isMedia = isMediaFilename(file.name);
        if (isMedia) {
          directUploadedFiles.push({
            name: file.name,
            content: '',
            size: file.size,
            isMedia: true
          });
        } else {
          try {
            const text = await readFileAsText(file);
            directUploadedFiles.push({
              name: file.name,
              content: text,
              size: file.size,
              isMedia: false
            });
          } catch (err) {
            console.error('Failed to read local file:', err);
          }
        }
      }

      aiDirectFileInput.value = '';
      populateAiFiles();
      if (directUploadedFiles.length > 0 && aiFileSelect) {
        aiFileSelect.value = `direct_${directUploadedFiles.length - 1}`;
        checkSelectedMediaWarning();
      }
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = () => resolve('');
      reader.readAsText(file.slice(0, 50 * 1024));
    });
  }

  function openAiModal(tabOrFileId = null, maybeFileId = null) {
    if (!activeTransferData) return;
    const preselectedFileId = maybeFileId || (tabOrFileId !== 'viva' && tabOrFileId !== 'flowchart' ? tabOrFileId : null);
    populateAiFiles(preselectedFileId);
    if (aiExamType && typeof window.updateAiSecondaryDropdown === 'function') {
      window.updateAiSecondaryDropdown(aiExamType.value);
    }
    if (typeof renderVivaChips === 'function') {
      renderVivaChips(lastGeneratedExamOutput ? (aiExamType && aiExamType.value === 'summarize' ? 'summarize' : 'viva') : 'initial');
    }
    aiModal.classList.add('active');
  }

  function closeAiModal() {
    aiModal.classList.remove('active');
  }

  // Open modal from all trigger buttons (Action bar circular button & Floating bot button)
  const openModalBtns = document.querySelectorAll('.open-ai-modal-btn');
  openModalBtns.forEach(btn => {
    btn.addEventListener('click', () => openAiModal());
  });

  if (aiModalClose) {
    aiModalClose.addEventListener('click', closeAiModal);
  }

  // Helper to call backend AI endpoint with robust non-JSON response handling
  async function callAiAnalyze(payload) {
    const body = {
      transferId: activeTransferData.id,
      ...payload
    };
    const headers = { 'Content-Type': 'application/json' };
    if (currentPin) {
      headers['x-transfer-pin'] = currentPin;
    }

    const res = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      let errorMsg = `Server error (${res.status})`;
      if (res.status === 413) {
        errorMsg = 'Uploaded files are too large to process. Please select smaller or fewer files.';
      } else if (text) {
        const cleanText = text.replace(/<[^>]*>/g, '').trim();
        if (cleanText) errorMsg += `: ${cleanText.slice(0, 160)}`;
      }
      throw new Error(errorMsg);
    }

    if (!res.ok || data.error) {
      throw new Error(data.error || 'AI processing request failed.');
    }
    return data;
  }

  // ---- Viva & Exam Prep & Summary Handler ----
  async function runViva(isForceful = false) {
    const selection = getSelectedFiles();
    if (selection.count === 0) {
      await window.LabDialog.alert('Please select at least one file from the checklist.');
      return;
    }

    // Media guardrail check
    if (selection.isMediaOnly && !isForceful) {
      checkSelectedMediaWarning();
      return;
    }

    if (vivaResult) vivaResult.style.display = 'none';
    const isSummarize = aiExamType && aiExamType.value === 'summarize';

    aiLoadingText.textContent = isForceful 
      ? '⚡ Forcefully analyzing file & formulating technical questions...' 
      : (isSummarize ? 'Generating structured summary with Gemini AI...' : 'Consulting Gemini AI to prepare high-scoring Exam & Viva questions...');
    aiLoadingSpinner.style.display = 'block';
    aiLoadingSpinner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const examType = aiExamType ? aiExamType.value : 'viva';
    const secondaryVal = aiSecondaryOption ? aiSecondaryOption.value : 'medium';
    const difficulty = !isSummarize ? secondaryVal : 'medium';
    const lengthType = isSummarize ? secondaryVal : 'medium';
    const customLines = aiCustomLines ? (parseInt(aiCustomLines.value, 10) || 15) : 15;

    try {
      const data = await callAiAnalyze({
        action: 'exam_prep',
        fileIds: selection.transferFileIds,
        directFiles: selection.localFiles,
        examType,
        difficulty,
        lengthType,
        customLines,
        force: !!isForceful
      });

      aiLoadingSpinner.style.display = 'none';

      if (data.needsForce) {
        aiMediaWarningText.textContent = data.warning || 'This file appears to be a non-study document or media asset that does not typically require viva questions.';
        if (btnForceViva) {
          btnForceViva.textContent = data.isNonStudyOnly ? '⚡ Formulate Viva Questions Anyway' : '⚡ Create Viva Questions Forcefully';
        }
        aiMediaWarningBanner.style.display = 'flex';
        return;
      }

      aiMediaWarningBanner.style.display = 'none';
      lastGeneratedExamOutput = data.result;
      vivaConversationHistory = [];

      // Update badge
      if (vivaBadge) {
        if (examType === 'summarize') {
          const lenLabels = {
            short: '⚡ Short (5 lines)',
            medium: '📄 Medium (20 lines)',
            large: '📚 Large (50 lines)',
            custom: `✏️ Custom (${customLines} lines)`
          };
          vivaBadge.textContent = `Technical Summary · ${lenLabels[lengthType] || lengthType} · ${selection.count} file(s)`;
        } else {
          const typeLabels = {
            viva: 'Oral Lab Viva',
            internal_20: '20 Marks Internal',
            semester_100: '100 Marks Semester Paper',
            rapid_fire: 'Rapid-Fire Flashcards'
          };
          const diffLabels = {
            easy: '🟢 Easy',
            medium: '🟡 Medium',
            hard: '🔴 Hard',
            extreme: '🔥 Extreme'
          };
          vivaBadge.textContent = `${typeLabels[examType] || 'Exam Prep'} · ${diffLabels[difficulty] || difficulty} · ${selection.count} file(s)`;
        }
      }

      vivaResult.style.display = 'block';

      if (window.marked) {
        vivaOutput.innerHTML = window.marked.parse(data.result);
      } else {
        vivaOutput.textContent = data.result;
      }

      // Inform chat feed of the generated content without wiping user history
      if (vivaChatMessages) {
        const initialPlaceholder = vivaChatMessages.querySelector('.ai-chat-placeholder');
        if (initialPlaceholder) initialPlaceholder.remove();

        const genNotice = document.createElement('div');
        genNotice.style.cssText = 'color: var(--color-primary); font-size: 0.82rem; text-align: center; padding: 8px 12px; background: rgba(79, 70, 229, 0.08); border-radius: var(--radius-sm); font-weight: 600; border: 1px dashed rgba(79, 70, 229, 0.25);';
        genNotice.innerHTML = `✨ ${isSummarize ? 'Summary generated above!' : 'Exam & Viva questions generated above!'} You can ask follow-up questions below.`;
        vivaChatMessages.appendChild(genNotice);
        vivaChatMessages.scrollTop = vivaChatMessages.scrollHeight;
      }

      if (typeof renderVivaChips === 'function') {
        renderVivaChips(isSummarize ? 'summarize' : 'viva');
      }

      // Scroll to result
      vivaResult.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      aiLoadingSpinner.style.display = 'none';
      await window.LabDialog.alert((isSummarize ? 'Summary generation failed: ' : 'Exam Prep generation failed: ') + err.message);
    }
  }

  if (btnRunViva) btnRunViva.addEventListener('click', () => runViva(false));
  if (btnRegenViva) btnRegenViva.addEventListener('click', () => runViva(false));
  if (btnForceViva) btnForceViva.addEventListener('click', () => runViva(true));

  if (btnCopyViva) {
    btnCopyViva.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(vivaOutput.innerText);
        const originalText = btnCopyViva.textContent;
        btnCopyViva.textContent = '✅ Copied!';
        setTimeout(() => btnCopyViva.textContent = originalText, 2000);
      } catch (err) {
        window.LabDialog.alert('Failed to copy to clipboard.');
      }
    });
  }

  // ---- Slidable & Resizable Modal Window Implementation ----
  function initDraggableResizableModal() {
    const modalWindow = document.getElementById('aiModalWindow');
    const modalHeader = document.getElementById('aiModalHeader');
    const resetBtn = document.getElementById('aiModalResetPos');

    if (!modalWindow || !modalHeader) return;

    let isDragging = false;
    let dragStartX, dragStartY, initialLeft, initialTop;

    function resetModalPosition() {
      modalWindow.style.position = 'relative';
      modalWindow.style.left = '0px';
      modalWindow.style.top = '0px';
      modalWindow.style.width = '720px';
      modalWindow.style.height = '640px';
      modalWindow.style.maxWidth = '95vw';
      modalWindow.style.maxHeight = '92vh';
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetModalPosition();
      });
    }

    // Mouse Dragging
    modalHeader.addEventListener('mousedown', (e) => {
      if (e.target.closest('.modal__close') || e.target.tagName === 'BUTTON') return;
      isDragging = true;
      modalHeader.style.cursor = 'grabbing';

      const rect = modalWindow.getBoundingClientRect();
      modalWindow.style.position = 'fixed';
      modalWindow.style.left = `${rect.left}px`;
      modalWindow.style.top = `${rect.top}px`;
      modalWindow.style.margin = '0';

      dragStartX = e.clientX;
      dragStartY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      function onMouseMove(moveEvent) {
        if (!isDragging) return;
        const dx = moveEvent.clientX - dragStartX;
        const dy = moveEvent.clientY - dragStartY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const maxLeft = window.innerWidth - modalWindow.offsetWidth;
        const maxTop = window.innerHeight - modalWindow.offsetHeight;
        newLeft = Math.max(5, Math.min(maxLeft - 5, newLeft));
        newTop = Math.max(5, Math.min(maxTop - 5, newTop));

        modalWindow.style.left = `${newLeft}px`;
        modalWindow.style.top = `${newTop}px`;
      }

      function onMouseUp() {
        isDragging = false;
        modalHeader.style.cursor = 'move';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Touch Dragging
    modalHeader.addEventListener('touchstart', (e) => {
      if (e.target.closest('.modal__close') || e.target.tagName === 'BUTTON') return;
      const touch = e.touches[0];
      isDragging = true;

      const rect = modalWindow.getBoundingClientRect();
      modalWindow.style.position = 'fixed';
      modalWindow.style.left = `${rect.left}px`;
      modalWindow.style.top = `${rect.top}px`;
      modalWindow.style.margin = '0';

      dragStartX = touch.clientX;
      dragStartY = touch.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      function onTouchMove(moveEvent) {
        if (!isDragging) return;
        const t = moveEvent.touches[0];
        const dx = t.clientX - dragStartX;
        const dy = t.clientY - dragStartY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const maxLeft = window.innerWidth - modalWindow.offsetWidth;
        const maxTop = window.innerHeight - modalWindow.offsetHeight;
        newLeft = Math.max(0, Math.min(maxLeft, newLeft));
        newTop = Math.max(0, Math.min(maxTop, newTop));

        modalWindow.style.left = `${newLeft}px`;
        modalWindow.style.top = `${newTop}px`;
      }

      function onTouchEnd() {
        isDragging = false;
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      }

      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
    }, { passive: true });

    // Multi-directional Resizing
    const resizers = modalWindow.querySelectorAll('.ai-resizer');
    resizers.forEach(resizer => {
      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const dir = resizer.getAttribute('data-dir');
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = modalWindow.getBoundingClientRect();

        modalWindow.style.position = 'fixed';
        modalWindow.style.left = `${rect.left}px`;
        modalWindow.style.top = `${rect.top}px`;
        modalWindow.style.margin = '0';

        const startWidth = rect.width;
        const startHeight = rect.height;
        const startLeft = rect.left;
        const startTop = rect.top;

        function onResize(moveEvent) {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;

          let newWidth = startWidth;
          let newHeight = startHeight;
          let newLeft = startLeft;
          let newTop = startTop;

          const minW = 320;
          const minH = 340;

          if (dir.includes('e')) {
            newWidth = Math.max(minW, startWidth + dx);
          }
          if (dir.includes('s')) {
            newHeight = Math.max(minH, startHeight + dy);
          }
          if (dir.includes('w')) {
            const possibleW = startWidth - dx;
            if (possibleW >= minW) {
              newWidth = possibleW;
              newLeft = startLeft + dx;
            }
          }
          if (dir.includes('n')) {
            const possibleH = startHeight - dy;
            if (possibleH >= minH) {
              newHeight = possibleH;
              newTop = startTop + dy;
            }
          }

          modalWindow.style.width = `${newWidth}px`;
          modalWindow.style.height = `${newHeight}px`;
          modalWindow.style.left = `${newLeft}px`;
          modalWindow.style.top = `${newTop}px`;
        }

        function stopResize() {
          window.removeEventListener('mousemove', onResize);
          window.removeEventListener('mouseup', stopResize);
        }

        window.addEventListener('mousemove', onResize);
        window.addEventListener('mouseup', stopResize);
      });
    });
  }

  initDraggableResizableModal();

  if (btnCopyViva) {
    btnCopyViva.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(vivaOutput.innerText);
        const originalText = btnCopyViva.textContent;
        btnCopyViva.textContent = '✅ Copied!';
        setTimeout(() => btnCopyViva.textContent = originalText, 2000);
      } catch (err) {
        window.LabDialog.alert('Failed to copy to clipboard.');
      }
    });
  }

  // ---- Follow-Up & Direct Chat in Viva Tab ----
  function renderVivaChips(type = 'initial') {
    const container = document.getElementById('vivaChipsContainer');
    if (!container) return;

    let chips = [];
    if (type === 'summarize') {
      chips = [
        { label: '⚡ Make it even shorter (3 lines)', prompt: 'Make the summary even shorter in exactly 3 bullet points.' },
        { label: '🔍 Explain key concept in depth', prompt: 'Explain the most important concept from this summary in detail.' },
        { label: '❓ Potential exam questions', prompt: 'What are 3 important questions a professor could ask on this topic?' },
        { label: '📋 Key takeaways list', prompt: 'Give me a 3-bullet cheat sheet of key formulas or takeaways.' }
      ];
    } else if (type === 'viva') {
      chips = [
        { label: '💡 Explain Q1 Simply', prompt: 'Can you explain Question 1 in simpler terms with an everyday analogy?' },
        { label: '🗣️ How to speak Answer 2', prompt: 'How should I speak Answer 2 out loud to sound confident and impress the professor?' },
        { label: '⚠️ Mock Follow-up Question', prompt: 'Give me a mock follow-up trick question the examiner could ask on this.' },
        { label: '📋 3-Bullet Cheat Sheet', prompt: 'Give me a 3-bullet quick cheat sheet of key formulas and definitions.' }
      ];
    } else {
      chips = [
        { label: '⚡ Summarize in 5 lines', prompt: 'Summarize this document in exactly 5 concise lines.' },
        { label: '❓ What is this document about?', prompt: 'What is this document and what is its main purpose?' },
        { label: '📋 3-Bullet Overview', prompt: 'Give me a 3-bullet quick overview of key points.' },
        { label: '💡 Explain Simply', prompt: 'Explain what this file does in simple, non-technical words.' }
      ];
    }

    container.innerHTML = '';
    chips.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn viva-chip';
      btn.setAttribute('data-prompt', c.prompt);
      btn.textContent = c.label;
      btn.addEventListener('click', () => {
        if (vivaChatInput) {
          vivaChatInput.value = c.prompt;
          sendVivaChatMessage(c.prompt);
        }
      });
      container.appendChild(btn);
    });
  }

  // Initial binding for any static chips
  const vivaChips = document.querySelectorAll('.viva-chip');
  vivaChips.forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      if (prompt && vivaChatInput) {
        vivaChatInput.value = prompt;
        sendVivaChatMessage(prompt);
      }
    });
  });

  async function sendVivaChatMessage(customPrompt = null) {
    const text = (customPrompt || (vivaChatInput ? vivaChatInput.value : '')).trim();
    if (!text) return;
    if (vivaChatInput) vivaChatInput.value = '';

    // Make messages container visible
    if (vivaChatMessages) {
      vivaChatMessages.style.display = 'flex';
      const initialPlaceholder = vivaChatMessages.querySelector('.ai-chat-placeholder');
      if (initialPlaceholder) {
        initialPlaceholder.remove();
      }
    }

    // Append user bubble
    const userMsg = document.createElement('div');
    userMsg.style.cssText = 'align-self: flex-end; background: var(--color-primary); color: white; padding: 8px 12px; border-radius: 12px 12px 2px 12px; font-size: 0.86rem; max-width: 85%; word-break: break-word;';
    userMsg.textContent = text;
    if (vivaChatMessages) vivaChatMessages.appendChild(userMsg);

    // Append loading bot bubble
    const botMsg = document.createElement('div');
    botMsg.style.cssText = 'align-self: flex-start; background: var(--color-bg-secondary); border: 1px solid var(--color-border); padding: 10px 14px; border-radius: 12px 12px 12px 2px; font-size: 0.86rem; max-width: 90%; word-break: break-word; line-height: 1.5; text-align: left;';
    botMsg.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Thinking...';
    if (vivaChatMessages) {
      vivaChatMessages.appendChild(botMsg);
      vivaChatMessages.scrollTop = vivaChatMessages.scrollHeight;
    }

    if (vivaChatSubmitBtn) vivaChatSubmitBtn.disabled = true;

    const selection = getSelectedFiles();

    try {
      const data = await callAiAnalyze({
        action: 'chat',
        prompt: text,
        fileIds: selection.transferFileIds,
        directFiles: selection.localFiles,
        conversationHistory: vivaConversationHistory,
        previousOutput: lastGeneratedExamOutput
      });

      vivaConversationHistory.push({ role: 'user', content: text });
      vivaConversationHistory.push({ role: 'model', content: data.result });

      if (window.marked) {
        botMsg.innerHTML = window.marked.parse(data.result);
      } else {
        botMsg.textContent = data.result;
      }
    } catch (err) {
      botMsg.innerHTML = `<span style="color: var(--color-danger);">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
      if (vivaChatSubmitBtn) vivaChatSubmitBtn.disabled = false;
      if (vivaChatMessages) vivaChatMessages.scrollTop = vivaChatMessages.scrollHeight;
      const scrollArea = document.getElementById('tabContentVivaScroll');
      if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }

  if (vivaChatForm) {
    vivaChatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendVivaChatMessage();
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
