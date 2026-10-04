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
  if (vivaChatInput) {
    vivaChatInput.setAttribute('autocomplete', 'off');
    vivaChatInput.setAttribute('autocorrect', 'off');
    vivaChatInput.setAttribute('autocapitalize', 'off');
    vivaChatInput.setAttribute('spellcheck', 'false');
    vivaChatInput.setAttribute('data-lpignore', 'true');
  }
  const vivaChatSubmitBtn = document.getElementById('vivaChatSubmitBtn');

  const aiLoadingSpinner = document.getElementById('aiLoadingSpinner');
  const aiLoadingText = document.getElementById('aiLoadingText');

  // Collapsible Viva Setup Panel (Transfer Page)
  const vivaConfigPanelTransfer = document.getElementById('vivaConfigPanelTransfer');
  const vivaConfigHeaderTransfer = document.getElementById('vivaConfigHeaderTransfer');
  const vivaConfigToggleTextTransfer = document.getElementById('vivaConfigToggleTextTransfer');
  const btnToggleVivaConfigTransfer = document.getElementById('btnToggleVivaConfigTransfer');
  const btnRunVivaCompactTransfer = document.getElementById('btnRunVivaCompactTransfer');
  const vivaConfigBadgeTransfer = document.getElementById('vivaConfigBadgeTransfer');

  function setVivaConfigCollapsedTransfer(shouldCollapse) {
    if (!vivaConfigPanelTransfer) return;
    if (shouldCollapse) {
      vivaConfigPanelTransfer.classList.add('collapsed');
      if (vivaConfigToggleTextTransfer) vivaConfigToggleTextTransfer.textContent = '▼ Expand Setup';
      if (btnRunVivaCompactTransfer) btnRunVivaCompactTransfer.style.display = 'inline-flex';
      const examVal = aiExamType ? aiExamType.value : 'viva';
      const secVal = aiSecondaryOption ? aiSecondaryOption.value : 'medium';
      if (vivaConfigBadgeTransfer) vivaConfigBadgeTransfer.textContent = `${examVal.toUpperCase()} · ${secVal.toUpperCase()}`;
    } else {
      vivaConfigPanelTransfer.classList.remove('collapsed');
      if (vivaConfigToggleTextTransfer) vivaConfigToggleTextTransfer.textContent = '▲ Collapse Setup';
      if (btnRunVivaCompactTransfer) btnRunVivaCompactTransfer.style.display = 'none';
    }
  }

  function toggleVivaConfigTransfer() {
    if (!vivaConfigPanelTransfer) return;
    const isCurrentlyCollapsed = vivaConfigPanelTransfer.classList.contains('collapsed');
    setVivaConfigCollapsedTransfer(!isCurrentlyCollapsed);
  }

  if (btnToggleVivaConfigTransfer) {
    btnToggleVivaConfigTransfer.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleVivaConfigTransfer();
    });
  }
  if (vivaConfigHeaderTransfer) {
    vivaConfigHeaderTransfer.addEventListener('click', () => {
      toggleVivaConfigTransfer();
    });
  }
  if (btnRunVivaCompactTransfer) {
    btnRunVivaCompactTransfer.addEventListener('click', (e) => {
      e.stopPropagation();
      runViva(false);
    });
  }

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

  // Local file upload directly into AI modal (supports text, PDF, and diagram images)
  if (aiDirectFileInput) {
    aiDirectFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      for (const file of files) {
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const isImg = /\.(png|jpe?g|webp)$/i.test(file.name);
        const isMedia = isMediaFilename(file.name) && !isImg;

        if (isPdf || isImg) {
          try {
            const dataUrl = await readFileAsDataURL(file);
            const base64 = dataUrl.split(',')[1] || '';
            directUploadedFiles.push({
              name: file.name,
              content: '',
              size: file.size,
              isPdf,
              pdfBase64: isPdf ? base64 : null,
              isImage: isImg,
              imageBase64: isImg ? base64 : null,
              mimeType: isPdf ? 'application/pdf' : file.type || 'image/png',
              isMedia: false
            });
          } catch (err) {
            console.error('Failed to read visual file:', err);
          }
        } else if (isMedia) {
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

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = () => reject(new Error('Failed to read file as DataURL'));
      reader.readAsDataURL(file);
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

  /**
   * Convert LaTeX math markup and raw ASCII symbol tokens into clean, authentic Unicode characters
   * (e.g. $\rightarrow$, \rightarrow, -> become →, \Rightarrow becomes ⇒, \leq becomes ≤, \mathcal{O}(N) becomes O(N))
   * Preserves code inside ```...``` code blocks and inline code `...`.
   */
  function convertLatexAndTextSymbolsToUnicode(text) {
    if (!text || typeof text !== 'string') return text || '';

    const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);

    return parts.map((part, idx) => {
      if (idx % 2 === 1) return part;

      let s = part;

      // 1. Arrows (LaTeX and text)
      s = s.replace(/\$?\s*\\(?:rightarrow|to|longrightarrow)\s*\$?/g, '→');
      s = s.replace(/\$?\s*\\(?:leftarrow|gets|longleftarrow)\s*\$?/g, '←');
      s = s.replace(/\$?\s*\\(?:leftrightarrow|longleftrightarrow)\s*\$?/g, '↔');
      s = s.replace(/\$?\s*\\(?:Rightarrow|implies|Longrightarrow)\s*\$?/g, '⇒');
      s = s.replace(/\$?\s*\\(?:Leftarrow|Longleftarrow)\s*\$?/g, '⇐');
      s = s.replace(/\$?\s*\\(?:Leftrightarrow|iff|Longleftrightarrow)\s*\$?/g, '⇔');
      s = s.replace(/\$?\s*\\(?:uparrow)\s*\$?/g, '↑');
      s = s.replace(/\$?\s*\\(?:downarrow)\s*\$?/g, '↓');
      s = s.replace(/\$?\s*\\(?:updownarrow)\s*\$?/g, '↕');
      s = s.replace(/\$?\s*\\(?:mapsto)\s*\$?/g, '↦');
      s = s.replace(/\$?\s*\\(?:hookrightarrow)\s*\$?/g, '↪');
      s = s.replace(/\$?\s*\\(?:hookleftarrow)\s*\$?/g, '↩');
      s = s.replace(/\$?\s*\\(?:nearrow)\s*\$?/g, '↗');
      s = s.replace(/\$?\s*\\(?:searrow)\s*\$?/g, '↘');
      s = s.replace(/\$?\s*\\(?:swarrow)\s*\$?/g, '↙');
      s = s.replace(/\$?\s*\\(?:nwarrow)\s*\$?/g, '↖');

      // Text arrows with spacing (outside code blocks)
      s = s.replace(/(\s+)-->(\s+)/g, '$1→$2');
      s = s.replace(/(\s+)->(\s+)/g, '$1→$2');
      s = s.replace(/(\s+)<--(\s+)/g, '$1←$2');
      s = s.replace(/(\s+)<-(\s+)/g, '$1←$2');
      s = s.replace(/(\s+)<->(\s+)/g, '$1↔$2');
      s = s.replace(/(\s+)==>(\s+)/g, '$1⇒$2');
      s = s.replace(/(\s+)=>(\s+)/g, '$1⇒$2');
      s = s.replace(/(\s+)<=(\s+)/g, '$1⇐$2');
      s = s.replace(/(\s+)<=>(\s+)/g, '$1⇔$2');

      // 2. Comparisons & Relations
      s = s.replace(/\$?\s*\\(?:leq?|le)\s*\$?/g, '≤');
      s = s.replace(/\$?\s*\\(?:geq?|ge)\s*\$?/g, '≥');
      s = s.replace(/\$?\s*\\(?:neq?|ne)\s*\$?/g, '≠');
      s = s.replace(/\$?\s*\\(?:approx)\s*\$?/g, '≈');
      s = s.replace(/\$?\s*\\(?:equiv)\s*\$?/g, '≡');
      s = s.replace(/\$?\s*\\(?:sim)\s*\$?/g, '∼');
      s = s.replace(/\$?\s*\\(?:propto)\s*\$?/g, '∝');
      s = s.replace(/\$?\s*\\(?:ll)\s*\$?/g, '≪');
      s = s.replace(/\$?\s*\\(?:gg)\s*\$?/g, '≫');

      // 3. Arithmetic & Operations
      s = s.replace(/\$?\s*\\(?:times)\s*\$?/g, '×');
      s = s.replace(/\$?\s*\\(?:div)\s*\$?/g, '÷');
      s = s.replace(/\$?\s*\\(?:pm)\s*\$?/g, '±');
      s = s.replace(/\$?\s*\\(?:mp)\s*\$?/g, '∓');
      s = s.replace(/\$?\s*\\(?:cdot|bullet)\s*\$?/g, '•');
      s = s.replace(/\$?\s*\\(?:dots|cdots|ldots)\s*\$?/g, '…');
      s = s.replace(/\$?\s*\\(?:circ|degree)\s*\$?/g, '°');
      s = s.replace(/\$?\s*\\sqrt\{([^}]+)\}\s*\$?|\$?\s*\\sqrt\(([^)]+)\)\s*\$?/g, '√($1$2)');
      s = s.replace(/\$?\s*\\(?:sqrt)\s*\$?/g, '√');
      s = s.replace(/\$?\s*\\frac\{([^}]+)\}\{([^}]+)\}\s*\$?/g, '($1 / $2)');

      // 4. Sets & Logic
      s = s.replace(/\$?\s*\\(?:in)\s*\$?/g, '∈');
      s = s.replace(/\$?\s*\\(?:notin)\s*\$?/g, '∉');
      s = s.replace(/\$?\s*\\(?:subset)\s*\$?/g, '⊂');
      s = s.replace(/\$?\s*\\(?:subseteq)\s*\$?/g, '⊆');
      s = s.replace(/\$?\s*\\(?:supset)\s*\$?/g, '⊃');
      s = s.replace(/\$?\s*\\(?:supseteq)\s*\$?/g, '⊇');
      s = s.replace(/\$?\s*\\(?:cap)\s*\$?/g, '∩');
      s = s.replace(/\$?\s*\\(?:cup)\s*\$?/g, '∪');
      s = s.replace(/\$?\s*\\(?:forall)\s*\$?/g, '∀');
      s = s.replace(/\$?\s*\\(?:exists)\s*\$?/g, '∃');
      s = s.replace(/\$?\s*\\(?:nexists)\s*\$?/g, '∄');
      s = s.replace(/\$?\s*\\(?:emptyset|varnothing)\s*\$?/g, '∅');
      s = s.replace(/\$?\s*\\(?:infty)\s*\$?/g, '∞');
      s = s.replace(/\$?\s*\\(?:neg|lnot)\s*\$?/g, '¬');
      s = s.replace(/\$?\s*\\(?:land|wedge)\s*\$?/g, '∧');
      s = s.replace(/\$?\s*\\(?:lor|vee)\s*\$?/g, '∨');

      // 5. Complexity & Notation
      s = s.replace(/\$?\s*\\mathcal\{O\}\((.*?)\)\s*\$?|\$?\s*\\mathcal\{O\}\s*\$?|\$?\s*\\mathcal\s*O\s*\$?/g, (m, p1) => p1 ? `O(${p1})` : 'O');
      s = s.replace(/\$?\s*\\Omega\((.*?)\)\s*\$?|\$?\s*\\Omega\s*\$?/g, (m, p1) => p1 ? `Ω(${p1})` : 'Ω');
      s = s.replace(/\$?\s*\\Theta\((.*?)\)\s*\$?|\$?\s*\\Theta\s*\$?/g, (m, p1) => p1 ? `Θ(${p1})` : 'Θ');

      // 6. Greek Letters
      s = s.replace(/\$?\s*\\(?:alpha)\s*\$?/g, 'α');
      s = s.replace(/\$?\s*\\(?:beta)\s*\$?/g, 'β');
      s = s.replace(/\$?\s*\\(?:gamma)\s*\$?/g, 'γ');
      s = s.replace(/\$?\s*\\(?:Gamma)\s*\$?/g, 'Γ');
      s = s.replace(/\$?\s*\\(?:delta)\s*\$?/g, 'δ');
      s = s.replace(/\$?\s*\\(?:Delta)\s*\$?/g, 'Δ');
      s = s.replace(/\$?\s*\\(?:epsilon|varepsilon)\s*\$?/g, 'ε');
      s = s.replace(/\$?\s*\\(?:theta)\s*\$?/g, 'θ');
      s = s.replace(/\$?\s*\\(?:Theta)\s*\$?/g, 'Θ');
      s = s.replace(/\$?\s*\\(?:lambda)\s*\$?/g, 'λ');
      s = s.replace(/\$?\s*\\(?:Lambda)\s*\$?/g, 'Λ');
      s = s.replace(/\$?\s*\\(?:mu)\s*\$?/g, 'µ');
      s = s.replace(/\$?\s*\\(?:pi)\s*\$?/g, 'π');
      s = s.replace(/\$?\s*\\(?:Pi)\s*\$?/g, 'Π');
      s = s.replace(/\$?\s*\\(?:sigma)\s*\$?/g, 'σ');
      s = s.replace(/\$?\s*\\(?:Sigma|sum)\s*\$?/g, 'Σ');
      s = s.replace(/\$?\s*\\(?:prod)\s*\$?/g, '∏');
      s = s.replace(/\$?\s*\\(?:tau)\s*\$?/g, 'τ');
      s = s.replace(/\$?\s*\\(?:phi)\s*\$?/g, 'φ');
      s = s.replace(/\$?\s*\\(?:Phi)\s*\$?/g, 'Φ');
      s = s.replace(/\$?\s*\\(?:omega)\s*\$?/g, 'ω');
      s = s.replace(/\$?\s*\\(?:Omega)\s*\$?/g, 'Ω');

      // 7. Unwrap simple residual inline math: e.g. `$N$` -> `N`, `$E$` -> `E`, `$k = 1$` -> `k = 1`
      s = s.replace(/\$([^$\n]+)\$/g, '$1');

      return s;
    }).join('');
  }

  // Client-side ad & promotional text stripping safeguard with Unicode symbol translation
  function stripAiAdsClient(text) {
    if (!text || typeof text !== 'string') return text || '';
    const cleaned = text
      .replace(/(?:---\s*)?(?:Support\s+Pollinations(?:\.AI)?|🌸\s*Ad\s*🌸|Powered by Pollinations(?:\.AI)?|Support our mission to keep AI accessible)[\s\S]*$/gi, '')
      .replace(/\n\s*(?:🌸\s*)?(?:Ad|Sponsored|Advertisement)[:\s][^\n]*/gi, '')
      .replace(/\n\s*Powered by [^\n]*/gi, '')
      .replace(/\n\s*Support [A-Za-z0-9_.-]+ AI[^\n]*/gi, '')
      .trim();

    return convertLatexAndTextSymbolsToUnicode(cleaned);
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
    // Also populate lab record file select
    if (typeof populateLabRecordSourceSelect === 'function') {
      populateLabRecordSourceSelect();
    }
    aiModal.classList.add('active');
    document.body.classList.add('ai-sidepanel-open');
  }

  function closeAiModal() {
    aiModal.classList.remove('active');
    document.body.classList.remove('ai-sidepanel-open');
  }

  // Open / toggle modal from trigger buttons (Action bar circular button & Floating bot button)
  const openModalBtns = document.querySelectorAll('.open-ai-modal-btn');
  openModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (aiModal && aiModal.classList.contains('active')) {
        closeAiModal();
      } else {
        openAiModal();
      }
    });
  });

  if (aiModalClose) {
    aiModalClose.addEventListener('click', closeAiModal);
  }

  // Close sidepanel on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aiModal && aiModal.classList.contains('active')) {
      closeAiModal();
    }
  });

  // Desktop Side Panel Left-Edge Resize Handler
  (function initDesktopTransferSidepanelResize() {
    const dialog = document.getElementById('aiModalWindow');
    if (!dialog) return;
    const resizer = dialog.querySelector('.ai-sidepanel-resize-edge');
    if (!resizer) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
      if (window.innerWidth < 1024) return;
      isResizing = true;
      resizer.classList.add('resizing');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      function onMouseMove(ev) {
        if (!isResizing) return;
        const newWidth = Math.max(380, Math.min(window.innerWidth * 0.65, window.innerWidth - ev.clientX));
        document.documentElement.style.setProperty('--ai-sidepanel-width', `${newWidth}px`);
      }

      function onMouseUp() {
        if (isResizing) {
          isResizing = false;
          resizer.classList.remove('resizing');
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  })();

  // ============================================================
  // Tab Switching Logic (Lab Record vs Viva & Exam Prep)
  // ============================================================
  const tabBtnLabRecord = document.getElementById('tabBtnLabRecord');
  const tabBtnViva = document.getElementById('tabBtnViva');
  const tabContentLabRecord = document.getElementById('tabContentLabRecord');
  const tabContentViva = document.getElementById('tabContentViva');

  function switchAiTab(tabName) {
    // Update buttons
    document.querySelectorAll('.ai-tab-bar .ai-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // Update content
    document.querySelectorAll('#aiModalBody > .ai-tab-content').forEach(panel => {
      panel.classList.remove('active');
    });
    if (tabName === 'labrecord' && tabContentLabRecord) {
      tabContentLabRecord.classList.add('active');
    } else if (tabContentViva) {
      tabContentViva.classList.add('active');
    }
  }

  if (tabBtnLabRecord) tabBtnLabRecord.addEventListener('click', () => switchAiTab('labrecord'));
  if (tabBtnViva) tabBtnViva.addEventListener('click', () => switchAiTab('viva'));

  // ============================================================
  // Lab Record Tab — Full Functionality (Transfer Page)
  // ============================================================
  const labRecordConfigView = document.getElementById('labRecordConfigViewTransfer');
  const labRecordLoadingState = document.getElementById('labRecordLoadingStateTransfer');
  const labRecordResultView = document.getElementById('labRecordResultViewTransfer');
  const labRecordOutput = document.getElementById('labRecordOutputTransfer');
  const labRecordAlert = document.getElementById('labRecordAlertTransfer');
  const labRecordAlertText = document.getElementById('labRecordAlertTextTransfer');
  const labRecordAlertClose = document.getElementById('labRecordAlertCloseTransfer');
  const labRecordSourceSelect = document.getElementById('labRecordSourceSelectTransfer');
  const labRecordUploadBtn = document.getElementById('labRecordUploadBtnTransfer');
  const labRecordFileInput = document.getElementById('labRecordFileInputTransfer');
  const btnRunLabRecordT = document.getElementById('btnRunLabRecordTransfer');
  const btnCopyLabRecordMdT = document.getElementById('btnCopyLabRecordMdTransfer');
  const btnCopyLabRecordRichT = document.getElementById('btnCopyLabRecordRichTransfer');
  const btnReconfigureLabRecordT = document.getElementById('btnReconfigureLabRecordTransfer');
  const labRecordChatMessages = document.getElementById('labRecordChatMessagesTransfer');
  const labRecordChatForm = document.getElementById('labRecordChatFormTransfer');
  const labRecordChatInput = document.getElementById('labRecordChatInputTransfer');
  if (labRecordChatInput) {
    labRecordChatInput.setAttribute('autocomplete', 'off');
    labRecordChatInput.setAttribute('autocorrect', 'off');
    labRecordChatInput.setAttribute('autocapitalize', 'off');
    labRecordChatInput.setAttribute('spellcheck', 'false');
    labRecordChatInput.setAttribute('data-lpignore', 'true');
  }
  const labRecordChatSubmitBtn = document.getElementById('labRecordChatSubmitBtnTransfer');
  const selectedSectionsCountT = document.getElementById('selectedSectionsCountTransfer');

  // Collapsible Lab Record Setup Panel (Transfer Page)
  const labRecordConfigHeaderTransfer = document.getElementById('labRecordConfigHeaderTransfer');
  const labRecordConfigToggleTextTransfer = document.getElementById('labRecordConfigToggleTextTransfer');
  const btnToggleLabRecordConfigTransfer = document.getElementById('btnToggleLabRecordConfigTransfer');
  const btnRunLabRecordCompactTransfer = document.getElementById('btnRunLabRecordCompactTransfer');
  const labRecordConfigBadgeTransfer = document.getElementById('labRecordConfigBadgeTransfer');

  function setLabRecordConfigCollapsedTransfer(shouldCollapse) {
    if (!labRecordConfigView) return;
    if (shouldCollapse) {
      labRecordConfigView.classList.add('collapsed');
      if (labRecordConfigToggleTextTransfer) labRecordConfigToggleTextTransfer.textContent = '▼ Expand Setup';
      if (btnRunLabRecordCompactTransfer) btnRunLabRecordCompactTransfer.style.display = 'inline-flex';
      const checked = document.querySelectorAll('input[name="labSectionTransfer"]:checked');
      if (labRecordConfigBadgeTransfer) labRecordConfigBadgeTransfer.textContent = `${checked.length} / 12 Sections`;
    } else {
      labRecordConfigView.classList.remove('collapsed');
      if (labRecordConfigToggleTextTransfer) labRecordConfigToggleTextTransfer.textContent = '▲ Collapse Setup';
      if (btnRunLabRecordCompactTransfer) btnRunLabRecordCompactTransfer.style.display = 'none';
    }
  }

  function toggleLabRecordConfigTransfer() {
    if (!labRecordConfigView) return;
    const isCurrentlyCollapsed = labRecordConfigView.classList.contains('collapsed');
    setLabRecordConfigCollapsedTransfer(!isCurrentlyCollapsed);
  }

  if (btnToggleLabRecordConfigTransfer) {
    btnToggleLabRecordConfigTransfer.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLabRecordConfigTransfer();
    });
  }
  if (labRecordConfigHeaderTransfer) {
    labRecordConfigHeaderTransfer.addEventListener('click', () => {
      toggleLabRecordConfigTransfer();
    });
  }
  if (btnRunLabRecordCompactTransfer) {
    btnRunLabRecordCompactTransfer.addEventListener('click', (e) => {
      e.stopPropagation();
      runLabRecordTransfer();
    });
  }

  let labRecordExternalFiles = [];
  let currentLabRecord = null;
  let currentLabRecordMarkdown = '';
  let labRecordConversationHistory = [];
  let labRecordLoadingTimer = null;

  const LAB_SECTION_PRESETS = {
    full: ['aim', 'requirements', 'apparatus', 'description', 'algorithm', 'flowchart', 'procedure', 'program', 'table', 'precautions', 'output', 'result'],
    observation: ['aim', 'algorithm', 'flowchart', 'program', 'output', 'result'],
    theory_code: ['aim', 'description', 'program', 'output'],
    flowchart_table: ['aim', 'algorithm', 'flowchart', 'table', 'output'],
    custom: []
  };

  function updateLabRecordSectionCount() {
    const checked = document.querySelectorAll('input[name="labSectionTransfer"]:checked');
    if (selectedSectionsCountT) selectedSectionsCountT.textContent = `${checked.length} / 12 selected`;
  }

  function applyLabRecordPreset(presetKey) {
    const checkboxes = document.querySelectorAll('input[name="labSectionTransfer"]');
    const targets = LAB_SECTION_PRESETS[presetKey] || [];
    if (presetKey !== 'custom') {
      checkboxes.forEach(cb => { cb.checked = targets.includes(cb.value); });
    }
    document.querySelectorAll('#presetContainerTransfer .preset-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.preset === presetKey);
    });
    updateLabRecordSectionCount();
  }

  // Preset chips
  document.querySelectorAll('#presetContainerTransfer .preset-chip').forEach(chip => {
    chip.addEventListener('click', () => applyLabRecordPreset(chip.dataset.preset));
  });

  // Checkbox change
  document.querySelectorAll('input[name="labSectionTransfer"]').forEach(cb => {
    cb.addEventListener('change', () => {
      document.querySelectorAll('#presetContainerTransfer .preset-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.preset === 'custom');
      });
      updateLabRecordSectionCount();
    });
  });

  // Populate source select from transfer files
  function populateLabRecordSourceSelect(preferredName) {
    if (!labRecordSourceSelect) return;
    labRecordSourceSelect.innerHTML = '';
    const allFiles = (activeTransferData.files || []).concat(labRecordExternalFiles.map(f => ({ originalName: f.name, id: '__local__' + f.name })));
    allFiles.forEach((f, i) => {
      const opt = document.createElement('option');
      opt.value = f.id || i;
      opt.textContent = f.originalName || f.name;
      opt.dataset.isLocal = f.id && f.id.startsWith('__local__') ? 'true' : 'false';
      if (preferredName && (f.originalName || f.name) === preferredName) opt.selected = true;
      labRecordSourceSelect.appendChild(opt);
    });
  }

  // Upload button
  if (labRecordUploadBtn && labRecordFileInput) {
    labRecordUploadBtn.addEventListener('click', () => labRecordFileInput.click());
    labRecordFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        labRecordExternalFiles.push(files[0]);
        populateLabRecordSourceSelect(files[0].name);
      }
    });
  }

  // Show/hide alerts
  function showLabRecordAlert(msg) {
    if (labRecordAlert && labRecordAlertText) {
      labRecordAlertText.textContent = msg;
      labRecordAlert.style.display = 'flex';
    }
  }
  function clearLabRecordAlert() {
    if (labRecordAlert) labRecordAlert.style.display = 'none';
  }
  if (labRecordAlertClose) labRecordAlertClose.addEventListener('click', clearLabRecordAlert);

  // Read file content
  async function getLabRecordFilePayload() {
    if (!labRecordSourceSelect || labRecordSourceSelect.options.length === 0) {
      throw new Error('No source code file available. Please upload a code file.');
    }
    const selectedOpt = labRecordSourceSelect.options[labRecordSourceSelect.selectedIndex];
    const isLocal = selectedOpt.dataset.isLocal === 'true';
    const filename = selectedOpt.textContent;

    if (isLocal) {
      const localFile = labRecordExternalFiles.find(f => f.name === filename);
      if (!localFile) throw new Error('Uploaded file not found.');
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const isPdf = localFile.name.toLowerCase().endsWith('.pdf');
          const isImg = /\.(png|jpe?g|webp)$/i.test(localFile.name);
          const isDocx = /\.(docx|doc)$/i.test(localFile.name);
          if (isPdf || isImg || isDocx) {
            const base64 = btoa(new Uint8Array(reader.result).reduce((d, b) => d + String.fromCharCode(b), ''));
            if (isDocx) {
              resolve({ codeContent: `[Attached Word Document: ${localFile.name}]`, filename: localFile.name, docxBase64: base64, isDocx: true });
            } else if (isPdf) {
              resolve({ codeContent: '', filename: localFile.name, pdfBase64: base64 });
            } else {
              resolve({ codeContent: '', filename: localFile.name, imageBase64: base64, mimeType: localFile.type });
            }
          } else {
            resolve({ codeContent: reader.result, filename: localFile.name });
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        const isPdf = localFile.name.toLowerCase().endsWith('.pdf');
        const isImg = /\.(png|jpe?g|webp)$/i.test(localFile.name);
        const isDocx = /\.(docx|doc)$/i.test(localFile.name);
        if (isPdf || isImg || isDocx) reader.readAsArrayBuffer(localFile);
        else reader.readAsText(localFile);
      });
    } else {
      // Transfer file — fetch from server
      const fileId = selectedOpt.value;
      const tf = (activeTransferData.files || []).find(f => f.id === fileId);
      if (!tf) throw new Error('Transfer file not found.');

      const headers = { 'Content-Type': 'application/json' };
      if (currentPin) headers['x-transfer-pin'] = currentPin;
      
      const res = await fetch(`/api/download/${activeTransferData.id}/${tf.storageName}`, { headers });
      if (!res.ok) throw new Error('Failed to download file from transfer.');
      
      const blob = await res.blob();
      const isPdf = tf.originalName.toLowerCase().endsWith('.pdf');
      const isImg = /\.(png|jpe?g|webp)$/i.test(tf.originalName);
      const isDocx = /\.(docx|doc)$/i.test(tf.originalName);
      
      if (isPdf || isImg || isDocx) {
        const arrayBuf = await blob.arrayBuffer();
        const base64 = btoa(new Uint8Array(arrayBuf).reduce((d, b) => d + String.fromCharCode(b), ''));
        if (isDocx) return { codeContent: `[Attached Word Document: ${tf.originalName}]`, filename: tf.originalName, docxBase64: base64, isDocx: true };
        if (isPdf) return { codeContent: '', filename: tf.originalName, pdfBase64: base64 };
        return { codeContent: '', filename: tf.originalName, imageBase64: base64, mimeType: tf.mimeType || blob.type };
      } else {
        const text = await blob.text();
        return { codeContent: text, filename: tf.originalName };
      }
    }
  }

  // Loading messages
  const labRecordLoadingQuotes = [
    '💡 You can share files <strong>without logging in</strong> or signing up',
    '⚡ <strong>Instant Transfer:</strong> Send files to your lab PC using a <strong>6-digit PIN</strong> or <strong>QR code</strong>',
    '🔒 <strong>Zero-Trace Privacy:</strong> Uploaded files are <strong>automatically deleted after 30 minutes</strong>',
    '📄 <strong>1-Click Lab Records:</strong> Turn code or diagrams into full <strong>academic lab observation sheets</strong>',
    '🎓 <strong>Oral Viva Voce Prep:</strong> Get <strong>60-second elevator pitches</strong>, viva traps & model answers',
    '📊 <strong>Auto Mermaid Flowcharts:</strong> Automatically draw <strong>interactive visual SVG diagrams</strong>',
    '🧠 <strong>Multi-Diagram Vision:</strong> PDF scanner detects & breaks down <strong>every diagram separately</strong>',
    '🎯 <strong>Custom Sizing:</strong> Generate <strong>Brief (1-page)</strong>, Standard, or Detailed academic reports',
    '📱 <strong>Cross-Device Sync:</strong> Seamless transfer across your <strong>phone, tablet, and lab PC</strong>',
    '📑 <strong>Word & Docs Ready:</strong> Copy formatted academic tables and code with <strong>1 single click</strong>',
    '💻 <strong>Zero Setup:</strong> Native support for <strong>C, C++, Java, Python, SQL</strong> & multi-page PDFs',
    '🖨️ <strong>University A4 Print:</strong> Pre-formatted with <strong>Aim, Algorithm, Tables & Precautions</strong>'
  ];

  function startLabRecordLoadingCycle() {
    stopLabRecordLoadingCycle();
    const msgEl = document.getElementById('labRecordLoadingMsgTransfer');
    if (!msgEl) return;
    let idx = 0;
    msgEl.innerHTML = labRecordLoadingQuotes[0];
    labRecordLoadingTimer = setInterval(() => {
      idx = (idx + 1) % labRecordLoadingQuotes.length;
      msgEl.style.opacity = '0.3';
      setTimeout(() => {
        msgEl.innerHTML = labRecordLoadingQuotes[idx];
        msgEl.style.opacity = '1';
      }, 200);
    }, 2600);
  }

  function stopLabRecordLoadingCycle() {
    if (labRecordLoadingTimer) { clearInterval(labRecordLoadingTimer); labRecordLoadingTimer = null; }
  }

  // Generate Lab Record
  async function runLabRecordTransfer() {
    clearLabRecordAlert();
    const checkedBoxes = Array.from(document.querySelectorAll('input[name="labSectionTransfer"]:checked')).map(cb => cb.value);
    if (checkedBoxes.length === 0) {
      showLabRecordAlert('Please select at least one section.');
      return;
    }

    let payloadData;
    try {
      payloadData = await getLabRecordFilePayload();
    } catch (err) {
      showLabRecordAlert(err.message);
      return;
    }

    // Show loading & auto-collapse setup panel
    setLabRecordConfigCollapsedTransfer(true);
    if (labRecordResultView) labRecordResultView.style.display = 'none';
    if (labRecordLoadingState) labRecordLoadingState.style.display = 'block';
    startLabRecordLoadingCycle();

    try {
      const res = await fetch('/api/ai/lab-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codeContent: payloadData.codeContent || '',
          filename: payloadData.filename || 'program',
          selectedSections: checkedBoxes,
          studentDetails: { expNo: '1', subject: 'Practical Lab', studentName: '', rollNo: '', date: new Date().toLocaleDateString('en-GB') },
          engine: 'auto',
          pdfBase64: payloadData.pdfBase64 || null,
          imageBase64: payloadData.imageBase64 || null,
          docxBase64: payloadData.docxBase64 || null,
          mimeType: payloadData.mimeType || null
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to generate Lab Record.');

      currentLabRecord = data;
      let rawMd = data.markdown || '';
      if (data.mermaidCode && !rawMd.includes(data.mermaidCode)) {
        rawMd += `\n\n## 📊 Visual Flowchart / Diagram\n\`\`\`mermaid\n${data.mermaidCode}\n\`\`\`\n`;
      }
      currentLabRecordMarkdown = stripAiAdsClient(rawMd);

      // Render result
      stopLabRecordLoadingCycle();
      if (labRecordLoadingState) labRecordLoadingState.style.display = 'none';
      if (labRecordResultView) labRecordResultView.style.display = 'block';
      if (labRecordOutput) {
        labRecordOutput.innerHTML = window.marked ? window.marked.parse(currentLabRecordMarkdown) : currentLabRecordMarkdown;
      }

      // Add generation notice to chat
      if (labRecordChatMessages) {
        labRecordChatMessages.style.display = 'flex';
        const notice = document.createElement('div');
        notice.className = 'ai-chat-bot-bubble';
        notice.innerHTML = '<strong>✅ Lab Record generated!</strong> Ask me anything about this record — expand theory, simplify algorithm, add test cases, etc.';
        labRecordChatMessages.appendChild(notice);
        labRecordChatMessages.scrollTop = labRecordChatMessages.scrollHeight;
      }

      labRecordConversationHistory = [
        { role: 'model', content: currentLabRecordMarkdown }
      ];

    } catch (err) {
      stopLabRecordLoadingCycle();
      if (labRecordLoadingState) labRecordLoadingState.style.display = 'none';
      if (labRecordConfigView) labRecordConfigView.style.display = 'block';
      showLabRecordAlert(err.message);
    }
  }

  if (btnRunLabRecordT) btnRunLabRecordT.addEventListener('click', runLabRecordTransfer);

  // Reconfigure
  if (btnReconfigureLabRecordT) {
    btnReconfigureLabRecordT.addEventListener('click', () => {
      if (labRecordResultView) labRecordResultView.style.display = 'none';
      if (labRecordConfigView) labRecordConfigView.style.display = 'block';
      setLabRecordConfigCollapsedTransfer(false);
    });
  }

  // Copy Markdown
  if (btnCopyLabRecordMdT) {
    btnCopyLabRecordMdT.addEventListener('click', async () => {
      if (!currentLabRecordMarkdown) return;
      try {
        await navigator.clipboard.writeText(currentLabRecordMarkdown);
        const orig = btnCopyLabRecordMdT.textContent;
        btnCopyLabRecordMdT.textContent = '✅ Copied!';
        setTimeout(() => btnCopyLabRecordMdT.textContent = orig, 2000);
      } catch (e) {}
    });
  }

  // Copy for Word
  if (btnCopyLabRecordRichT) {
    btnCopyLabRecordRichT.addEventListener('click', async () => {
      if (!labRecordOutput) return;
      try {
        const html = labRecordOutput.innerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([labRecordOutput.innerText], { type: 'text/plain' }) })]);
        const orig = btnCopyLabRecordRichT.textContent;
        btnCopyLabRecordRichT.textContent = '✅ Copied!';
        setTimeout(() => btnCopyLabRecordRichT.textContent = orig, 2000);
      } catch (e) {}
    });
  }

  // Lab Record Chat
  async function sendLabRecordChatMessage(customPrompt = null) {
    const text = (customPrompt || (labRecordChatInput ? labRecordChatInput.value : '')).trim();
    if (!text) return;
    if (labRecordChatInput) labRecordChatInput.value = '';

    // Auto-collapse setup panel to provide maximum chat room
    setLabRecordConfigCollapsedTransfer(true);

    if (labRecordChatMessages) {
      labRecordChatMessages.style.display = 'flex';
    }

    // User bubble
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-chat-user-bubble';
    userMsg.textContent = text;
    if (labRecordChatMessages) labRecordChatMessages.appendChild(userMsg);

    // Bot thinking bubble
    const botMsg = document.createElement('div');
    botMsg.className = 'ai-chat-bot-bubble';
    botMsg.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Thinking...';
    if (labRecordChatMessages) {
      labRecordChatMessages.appendChild(botMsg);
      labRecordChatMessages.scrollTop = labRecordChatMessages.scrollHeight;
    }

    if (labRecordChatSubmitBtn) labRecordChatSubmitBtn.disabled = true;

    try {
      const selection = getSelectedFiles();
      let chatDirectFiles = selection.localFiles || [];
      let chatFileIds = selection.transferFileIds || [];

      if (chatFileIds.length === 0 && chatDirectFiles.length === 0) {
        try {
          const payload = await getLabRecordFilePayload();
          if (payload) {
            chatDirectFiles = [{
              name: payload.filename,
              content: payload.codeContent || '',
              pdfBase64: payload.pdfBase64 || null,
              imageBase64: payload.imageBase64 || null,
              mimeType: payload.mimeType || null
            }];
          }
        } catch (_) {}
      }

      const data = await callAiAnalyze({
        action: 'chat',
        prompt: text,
        fileIds: chatFileIds,
        directFiles: chatDirectFiles,
        conversationHistory: labRecordConversationHistory,
        previousOutput: currentLabRecordMarkdown
      });

      const cleanedChat = stripAiAdsClient(data.result);
      labRecordConversationHistory.push({ role: 'user', content: text });
      labRecordConversationHistory.push({ role: 'model', content: cleanedChat });

      botMsg.innerHTML = window.marked ? window.marked.parse(cleanedChat) : cleanedChat;
    } catch (err) {
      botMsg.innerHTML = `<span style="color: var(--color-danger);">Error: ${err.message}</span>`;
    } finally {
      if (labRecordChatSubmitBtn) labRecordChatSubmitBtn.disabled = false;
      if (labRecordChatMessages) labRecordChatMessages.scrollTop = labRecordChatMessages.scrollHeight;
    }
  }

  if (labRecordChatForm) {
    labRecordChatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendLabRecordChatMessage();
    });
  }

  // Lab Record chat chips
  document.querySelectorAll('.lab-record-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      if (prompt && labRecordChatInput) {
        labRecordChatInput.value = prompt;
        sendLabRecordChatMessage(prompt);
      }
    });
  });

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

    // Auto-collapse setup panel to provide maximum chat/result room
    setVivaConfigCollapsedTransfer(true);

    let aiLoadingTimer = null;
    const aiLoadingQuotes = [
      '💡 You can share files <strong>without logging in</strong> or signing up',
      '⚡ <strong>Instant Transfer:</strong> Send files to your lab PC using a <strong>6-digit PIN</strong> or <strong>QR code</strong>',
      '🔒 <strong>Zero-Trace Privacy:</strong> Uploaded files are <strong>automatically deleted after 30 minutes</strong>',
      '📄 <strong>1-Click Lab Records:</strong> Turn code or diagrams into full <strong>academic lab observation sheets</strong>',
      '🎓 <strong>Oral Viva Voce Prep:</strong> Get <strong>60-second elevator pitches</strong>, viva traps & model answers',
      '📊 <strong>Auto Mermaid Flowcharts:</strong> Automatically draw <strong>interactive visual SVG diagrams</strong>',
      '🧠 <strong>Multi-Diagram Vision:</strong> PDF scanner detects & breaks down <strong>every diagram separately</strong>',
      '🎯 <strong>Custom Sizing:</strong> Generate <strong>Brief (1-page)</strong>, Standard, or Detailed academic reports',
      '📱 <strong>Cross-Device Sync:</strong> Seamless transfer across your <strong>phone, tablet, and lab PC</strong>',
      '📑 <strong>Word & Docs Ready:</strong> Copy formatted academic tables and code with <strong>1 single click</strong>',
      '💻 <strong>Zero Setup:</strong> Native support for <strong>C, C++, Java, Python, SQL</strong> & multi-page PDFs',
      '🖨️ <strong>University A4 Print:</strong> Pre-formatted with <strong>Aim, Algorithm, Tables & Precautions</strong>'
    ];

    function startAiLoadingCycle() {
      if (aiLoadingTimer) clearInterval(aiLoadingTimer);
      const dynamicEl = document.getElementById('aiLoadingDynamicMsg');
      const titleEl = document.getElementById('aiLoadingTitle');
      if (titleEl) {
        titleEl.textContent = isSummarize ? 'Summarizing Document & Diagrams...' : 'Synthesizing Exam & Viva Prep...';
      }
      if (!dynamicEl) return;
      let qIdx = 0;
      dynamicEl.innerHTML = aiLoadingQuotes[0];
      aiLoadingTimer = setInterval(() => {
        qIdx = (qIdx + 1) % aiLoadingQuotes.length;
        if (dynamicEl) {
          dynamicEl.style.opacity = '0.3';
          setTimeout(() => {
            dynamicEl.innerHTML = aiLoadingQuotes[qIdx];
            dynamicEl.style.opacity = '1';
          }, 200);
        }
      }, 2600);
    }

    function stopAiLoadingCycle() {
      if (aiLoadingTimer) {
        clearInterval(aiLoadingTimer);
        aiLoadingTimer = null;
      }
    }

    if (aiLoadingText) {
      aiLoadingText.textContent = isForceful 
        ? '⚡ Forcefully analyzing file & formulating technical questions...' 
        : (isSummarize ? 'Generating structured summary with Gemini AI...' : 'Consulting Gemini AI to prepare high-scoring Exam & Viva questions...');
    }
    aiLoadingSpinner.style.display = 'block';
    startAiLoadingCycle();
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

      stopAiLoadingCycle();
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
      const cleanedExam = stripAiAdsClient(data.result);
      lastGeneratedExamOutput = cleanedExam;
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
        vivaOutput.innerHTML = window.marked.parse(cleanedExam);
      } else {
        vivaOutput.textContent = cleanedExam;
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
      stopAiLoadingCycle();
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
      modalWindow.style.left = '';
      modalWindow.style.top = '';
      modalWindow.style.width = '';
      modalWindow.style.height = '';
      modalWindow.style.position = '';
      modalWindow.style.maxWidth = '';
      modalWindow.style.maxHeight = '';
      document.documentElement.style.setProperty('--ai-sidepanel-width', '480px');
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetModalPosition();
      });
    }

    // Mouse Dragging
    modalHeader.addEventListener('mousedown', (e) => {
      if (window.innerWidth >= 1024) return;
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
      if (window.innerWidth >= 1024) return;
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
        if (window.innerWidth >= 1024) return;
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

    // Auto-collapse setup panel to provide maximum chat room
    setVivaConfigCollapsedTransfer(true);

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

      const cleanedVivaChat = stripAiAdsClient(data.result);
      vivaConversationHistory.push({ role: 'user', content: text });
      vivaConversationHistory.push({ role: 'model', content: cleanedVivaChat });

      if (window.marked) {
        botMsg.innerHTML = window.marked.parse(cleanedVivaChat);
      } else {
        botMsg.textContent = cleanedVivaChat;
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
