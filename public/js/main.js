// ============================================================
// LabDrop — Desktop UI Logic (main.js)
// ============================================================

(function () {
  'use strict';

  // ---- DOM elements ----
  const $ = (sel) => document.querySelector(sel);
  const alertArea = $('#alertArea');
  const selectSection = $('#selectSection');
  const uploadSection = $('#uploadSection');
  const qrSection = $('#qrSection');

  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  const fileList = $('#fileList');
  const linkList = $('#linkList');
  const fileListWrapper = $('#fileListWrapper');
  const fileSummary = $('#fileSummary');
  const clearFilesBtn = $('#clearFilesBtn');
  const linkInput = $('#linkInput');
  const addLinkBtn = $('#addLinkBtn');
  const createTransferBtn = $('#createTransferBtn');
  const transferOptions = $('#transferOptions');
  const transferNameInput = $('#transferName');
  const requirePinCheck = $('#requirePin');

  const progressBarFill = $('#progressBarFill');
  const progressText = $('#progressText');

  const qrImage = $('#qrImage');
  const transferCode = $('#transferCode');
  const transferUrl = $('#transferUrl');
  const copyUrlBtn = $('#copyUrlBtn');
  const pinDisplayContainer = $('#pinDisplayContainer');
  const pinDisplayCode = $('#pinDisplayCode');
  const timerEl = $('#timer');
  const timerText = $('#timerText');
  const extendTimerBtn = $('#extendTimerBtn');
  const statFiles = $('#statFiles');
  const statSize = $('#statSize');
  const qrFileList = $('#qrFileList');
  const qrLinkList = $('#qrLinkList');

  const receiveForm = $('#receiveForm');
  const receiveCodeInput = $('#receiveCodeInput');
  const receiveError = $('#receiveError');

  const shareWhatsAppBtn = $('#shareWhatsAppBtn');
  const shareNativeBtn = $('#shareNativeBtn');

  const cancelTransferBtn = $('#cancelTransferBtn');
  const newTransferBtn = $('#newTransferBtn');

  // ---- Auth & Mode DOM ----
  const authLoggedOut = $('#authLoggedOut');
  const authLoggedIn = $('#authLoggedIn');
  const navLoginBtn = $('#navLoginBtn');
  const navSignupBtn = $('#navSignupBtn');
  const navLogoutBtn = $('#navLogoutBtn');
  const navUserEmail = $('#navUserEmail');

  const authModal = $('#authModal');
  const authModalClose = $('#authModalClose');
  const authModalTitle = $('#authModalTitle');
  const authForm = $('#authForm');
  const authEmail = $('#authEmail');
  const authPassword = $('#authPassword');
  const authError = $('#authError');
  const authSubmitBtn = $('#authSubmitBtn');
  const authToggleText = $('#authToggleText');
  const authToggleLink = $('#authToggleLink');

  const modeQuick = $('#modeQuick');
  const modeSave = $('#modeSave');

  // ---- State ----
  let selectedFiles = []; // Array of File objects
  let selectedLinks = []; // Array of string URLs
  let currentTransfer = null; // Active transfer data from server
  let timerInterval = null;
  let authToken = localStorage.getItem('labdrop_token');
  let authUser = null;
  let authMode = 'login'; // 'login' or 'register'
  let transferMode = 'quick'; // 'quick' or 'save'

  // ---- File icons by category ----
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

  // ---- Utility: get file category (mirrors server logic) ----
  function getFileCategory(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'],
      code: ['c', 'cpp', 'h', 'hpp', 'java', 'py', 'js', 'ts', 'rb', 'go', 'rs', 'cs', 'php', 'html', 'css', 'sql', 'sh', 'bash', 'r', 'm', 'swift', 'kt'],
      document: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods', 'txt', 'rtf', 'md'],
      data: ['csv', 'json', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'log'],
      archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
    };
    for (const [cat, exts] of Object.entries(map)) {
      if (exts.includes(ext)) return cat;
    }
    return 'file';
  }

  // ---- Utility: show alert ----
  function showAlert(message, type = 'error') {
    const div = document.createElement('div');
    div.className = `alert alert--${type}`;
    div.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span> ${escapeHtml(message)}`;
    alertArea.prepend(div);
    setTimeout(() => div.remove(), 6000);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Section visibility ----
  function showSection(section) {
    [selectSection, uploadSection, qrSection].forEach((s) => {
      s.classList.toggle('section--hidden', s !== section);
    });
  }

  // ---- Auth Logic ----
  async function checkAuth() {
    if (!authToken) {
      updateAuthUI();
      return;
    }
    try {
      const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${authToken}` }});
      if (res.ok) {
        const data = await res.json();
        authUser = data.user;
      } else {
        authToken = null;
        authUser = null;
        localStorage.removeItem('labdrop_token');
      }
    } catch (e) {
      // network error, ignore for now
    }
    updateAuthUI();
  }

  function updateAuthUI() {
    if (authUser) {
      authLoggedOut.style.display = 'none';
      authLoggedIn.style.display = 'flex';
      navUserEmail.textContent = authUser.email;
    } else {
      authLoggedOut.style.display = 'inline';
      authLoggedIn.style.display = 'none';
      // If they were on "Save for Later" but logged out, switch to Quick
      if (transferMode === 'save') {
        setTransferMode('quick');
      }
    }
  }

  function openAuthModal(mode) {
    authMode = mode;
    authError.style.display = 'none';
    authForm.reset();
    
    if (mode === 'login') {
      authModalTitle.textContent = 'Login';
      authSubmitBtn.textContent = 'Login';
      authToggleText.textContent = "Don't have an account?";
      authToggleLink.textContent = 'Sign Up';
    } else {
      authModalTitle.textContent = 'Sign Up';
      authSubmitBtn.textContent = 'Sign Up';
      authToggleText.textContent = "Already have an account?";
      authToggleLink.textContent = 'Login';
    }
    
    authModal.classList.add('active');
  }

  function closeAuthModal() {
    authModal.classList.remove('active');
  }

  authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthModal(authMode === 'login' ? 'register' : 'login');
  });

  authModalClose.addEventListener('click', closeAuthModal);
  navLoginBtn.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });
  navSignupBtn.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('register'); });
  
  navLogoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    authToken = null;
    authUser = null;
    localStorage.removeItem('labdrop_token');
    updateAuthUI();
    showAlert('Logged out successfully.', 'info');
  });

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
        authUser = data.user;
        localStorage.setItem('labdrop_token', authToken);
        updateAuthUI();
        closeAuthModal();
        showAlert(authMode === 'login' ? 'Logged in successfully.' : 'Registered successfully.', 'success');
        
        // If they clicked "Save for Later" before, activate it now
        if (transferMode === 'save') {
           setTransferMode('save');
        }
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

  // ---- Mode Selector ----
  function setTransferMode(mode) {
    if (mode === 'save' && !authUser) {
      transferMode = 'save'; // remember intent
      openAuthModal('login');
      return;
    }
    transferMode = mode;
    modeQuick.classList.toggle('active', mode === 'quick');
    modeSave.classList.toggle('active', mode === 'save');
  }

  modeQuick.addEventListener('click', () => setTransferMode('quick'));
  modeSave.addEventListener('click', () => setTransferMode('save'));

  // ---- Render selected file list ----
  function renderFileList() {
    fileList.innerHTML = '';
    let totalSize = 0;

    selectedFiles.forEach((file, index) => {
      totalSize += file.size;
      const cat = getFileCategory(file.name);
      const icon = FILE_ICONS[cat] || '📎';

      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <div class="file-item__icon file-item__icon--${cat}">${icon}</div>
        <div class="file-item__details">
          <div class="file-item__name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
          <div class="file-item__size">${formatBytes(file.size)}</div>
        </div>
        <div class="file-item__actions">
          <button class="file-item__remove" data-index="${index}" title="Remove file">✕</button>
        </div>
      `;
      fileList.appendChild(li);
    });

    fileSummary.textContent = `${selectedFiles.length} file(s), ${formatBytes(totalSize)}`;

    // Render links
    linkList.innerHTML = '';
    selectedLinks.forEach((link, idx) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <div class="file-item__icon file-item__icon--data">🔗</div>
        <div class="file-item__details">
          <div class="file-item__name">${escapeHtml(link)}</div>
          <div class="file-item__size">Link</div>
        </div>
        <div class="file-item__actions">
          <button type="button" class="file-item__remove" data-index="${idx}" title="Remove">✕</button>
        </div>
      `;
      linkList.appendChild(li);
    });

    linkList.querySelectorAll('.file-item__remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        selectedLinks.splice(idx, 1);
        renderFileList();
      });
    });

    if (selectedFiles.length > 0 || selectedLinks.length > 0) {
      fileListWrapper.classList.remove('section--hidden');
      transferOptions.classList.remove('section--hidden');
      createTransferBtn.disabled = false;
    } else {
      fileListWrapper.classList.add('section--hidden');
      transferOptions.classList.add('section--hidden');
      createTransferBtn.disabled = true;
    }

    // Bind remove buttons
    fileList.querySelectorAll('.file-item__remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        selectedFiles.splice(idx, 1);
        renderFileList();
      });
    });
  }

  // ---- Add files (deduplication) ----
  function addFiles(newFiles) {
    if (selectedFiles.length + newFiles.length > 20) {
      showAlert('Maximum 20 files allowed per transfer.');
      return;
    }
    const existingNames = new Set(selectedFiles.map((f) => f.name + '_' + f.size));
    for (const file of newFiles) {
      const key = file.name + '_' + file.size;
      if (!existingNames.has(key)) {
        selectedFiles.push(file);
        existingNames.add(key);
      }
    }
    renderFileList();
  }

  // ---- Drag & Drop ----
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dropzone--active');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dropzone--active');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dropzone--active');
    if (e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  });

  // ---- File input change ----
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      addFiles(Array.from(fileInput.files));
      fileInput.value = ''; // Reset so the same files can be re-selected
    }
  });

  // ---- Clear files and links ----
  clearFilesBtn.addEventListener('click', () => {
    selectedFiles = [];
    selectedLinks = [];
    renderFileList();
  });

  // ---- Add link ----
  addLinkBtn.addEventListener('click', () => {
    let url = linkInput.value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    if (selectedLinks.length >= 20) {
      showAlert('Maximum 20 links allowed per transfer.');
      return;
    }
    selectedLinks.push(url);
    linkInput.value = '';
    renderFileList();
  });
  linkInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLinkBtn.click();
    }
  });

  // ---- Create Transfer ----
  createTransferBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0 && selectedLinks.length === 0) {
      showAlert('Please select at least one file or link.');
      return;
    }

    showSection(uploadSection);

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('files', file));
    if (selectedLinks.length > 0) {
      formData.append('links', JSON.stringify(selectedLinks));
    }
    if (transferNameInput.value.trim()) {
      formData.append('transferName', transferNameInput.value.trim());
    }
    formData.append('requirePin', requirePinCheck.checked ? 'true' : 'false');
    
    if (transferMode === 'save') {
      formData.append('saveForLater', 'true');
    }

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressBarFill.style.width = pct + '%';
          progressText.textContent = `Uploading… ${pct}%`;
        }
      });

      const response = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error('Invalid server response.'));
            }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || 'Upload failed.'));
            } catch {
              reject(new Error('Upload failed (HTTP ' + xhr.status + ').'));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error. Make sure the server is running.'));
        xhr.open('POST', '/api/upload');
        if (authToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        }
        xhr.send(formData);
      });

      currentTransfer = response;
      showTransferView(response);
    } catch (err) {
      showSection(selectSection);
      showAlert(err.message);
    }
  });

  // ---- Show QR / Transfer View ----
  function showTransferView(data) {
    showSection(qrSection);

    qrImage.src = data.qrCode;
    transferCode.textContent = data.shortCode;
    transferUrl.textContent = data.url;
    statFiles.textContent = data.fileCount + (data.linkCount > 0 ? ` (+${data.linkCount} links)` : '');
    statSize.textContent = formatBytes(data.totalSize);

    if (data.pin) {
      pinDisplayCode.textContent = data.pin;
      pinDisplayContainer.classList.remove('section--hidden');
    } else {
      pinDisplayContainer.classList.add('section--hidden');
    }

    // Render file list in QR view
    qrFileList.innerHTML = '';
    data.files.forEach((f) => {
      const cat = f.category || 'file';
      const icon = FILE_ICONS[cat] || '📎';
      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <div class="file-item__icon file-item__icon--${cat}">${icon}</div>
        <div class="file-item__details">
          <div class="file-item__name">${escapeHtml(f.name)}</div>
          <div class="file-item__size">${formatBytes(f.size)}</div>
        </div>
      `;
      qrFileList.appendChild(li);
    });

    // Render links in QR view
    qrLinkList.innerHTML = '';
    if (data.links && data.links.length > 0) {
      qrLinkList.style.display = 'block';
      data.links.forEach((link) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.innerHTML = `
          <div class="file-item__icon file-item__icon--data">🔗</div>
          <div class="file-item__details">
            <div class="file-item__name">${escapeHtml(link)}</div>
            <div class="file-item__size">Link</div>
          </div>
          <div class="file-item__actions">
            <a href="${escapeHtml(link)}" target="_blank" class="btn btn--outline btn--sm">Open</a>
          </div>
        `;
        qrLinkList.appendChild(li);
      });
    } else {
      qrLinkList.style.display = 'none';
    }

    // Start countdown timer
    startTimer(data.expiresAt);
  }

  // ---- Timer ----
  function startTimer(expiresAt) {
    if (timerInterval) clearInterval(timerInterval);

    function tick() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        clearInterval(timerInterval);
        timerText.textContent = 'Expired';
        timerEl.className = 'timer timer--danger';
        showAlert('This transfer has expired. Create a new one.', 'info');
        return;
      }

      const totalSeconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      timerText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Color warnings
      if (totalSeconds <= 60) {
        timerEl.className = 'timer timer--danger';
      } else if (totalSeconds <= 300) {
        timerEl.className = 'timer timer--warning';
      } else {
        timerEl.className = 'timer';
      }
    }

    tick();
    timerInterval = setInterval(tick, 1000);
  }

  // ---- Extend Timer ----
  extendTimerBtn.addEventListener('click', async () => {
    if (!currentTransfer) return;
    extendTimerBtn.disabled = true;
    try {
      const res = await fetch(`/api/transfer/${currentTransfer.transferId}/extend`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        startTimer(data.expiresAt);
        showAlert('Added 15 minutes to transfer.', 'success');
      } else {
        showAlert(data.error || 'Failed to extend.');
      }
    } catch (err) {
      showAlert('Network error extending transfer.');
    } finally {
      extendTimerBtn.disabled = false;
    }
  });

  // ---- Cancel Transfer ----
  cancelTransferBtn.addEventListener('click', async () => {
    if (!currentTransfer) return;

    try {
      await fetch(`/api/transfer/${currentTransfer.transferId}`, { method: 'DELETE' });
    } catch {
      // Ignore errors on cancel
    }

    resetToStart();
    showAlert('Transfer cancelled.', 'info');
  });

  // ---- New Transfer ----
  newTransferBtn.addEventListener('click', () => {
    resetToStart();
  });

  // ---- Copy URL ----
  copyUrlBtn.addEventListener('click', () => {
    if (!currentTransfer) return;
    navigator.clipboard.writeText(currentTransfer.url).then(() => {
      copyUrlBtn.textContent = '✅ Copied!';
      setTimeout(() => (copyUrlBtn.textContent = '📋 Copy'), 2000);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = currentTransfer.url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copyUrlBtn.textContent = '✅ Copied!';
      setTimeout(() => (copyUrlBtn.textContent = '📋 Copy'), 2000);
    });
  });

  // ---- Share via WhatsApp ----
  shareWhatsAppBtn.addEventListener('click', () => {
    if (!currentTransfer) return;
    const name = currentTransfer.transferName || 'Lab Files';
    const msg = `📁 *${name}* — Download from LabDrop:\n${currentTransfer.url}\n\nCode: *${currentTransfer.shortCode}*`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  });

  // ---- Native Share API ----
  if (navigator.share) {
    shareNativeBtn.style.display = 'inline-flex';
    shareNativeBtn.addEventListener('click', () => {
      if (!currentTransfer) return;
      const name = currentTransfer.transferName || 'Lab Files';
      navigator.share({
        title: `LabDrop: ${name}`,
        text: `Download "${name}" from LabDrop. Code: ${currentTransfer.shortCode}`,
        url: currentTransfer.url
      }).catch(() => {});
    });
  }

  // ---- Reset to start state ----
  function resetToStart() {
    if (timerInterval) clearInterval(timerInterval);
    currentTransfer = null;
    selectedFiles = [];
    selectedLinks = [];
    transferNameInput.value = '';
    requirePinCheck.checked = false;
    renderFileList();
    progressBarFill.style.width = '0%';
    progressText.textContent = 'Preparing upload…';
    showSection(selectSection);
  }

  // ---- Receive Form Logic ----
  receiveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = receiveCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) return;
    
    receiveError.style.display = 'none';
    const submitBtn = receiveForm.querySelector('button');
    submitBtn.disabled = true;
    
    try {
      const res = await fetch(`/api/transfer/code/${code}`);
      const data = await res.json();
      if (res.ok && data.id) {
        window.location.href = `/t/${data.id}`;
      } else {
        receiveError.textContent = data.error || 'Transfer not found.';
        receiveError.style.display = 'block';
      }
    } catch(err) {
      receiveError.textContent = 'Network error.';
      receiveError.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---- Initialize ----
  showSection(selectSection);

  // ---- PWA & Web Share Target Logic ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.error('ServiceWorker registration failed: ', err);
      });
    });
  }

  // Check if we arrived via Web Share Target (or check IndexedDB regardless)
  function checkSharedFiles() {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('shared')) return;
    
    // Clean up the URL so refreshing doesn't trigger it again
    window.history.replaceState({}, document.title, '/');

    const request = indexedDB.open('LabDropSharedFiles', 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) return;

      const transaction = db.transaction('files', 'readwrite');
      const store = transaction.objectStore('files');
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const files = getAllRequest.result;
        if (files && files.length > 0) {
          // Add files to our UI state (they are standard File objects)
          files.forEach(file => {
            // Provide a fallback type/name if it's garbled, though Web Share usually passes valid files
            selectedFiles.push(file);
          });
          
          renderFileList();
          showAlert(`Received ${files.length} file(s) from share! Please review and click Create Transfer.`, 'success');
          
          // Clear IndexedDB after loading to avoid zombie files on next visit
          store.clear();
        }
      };
    };

    request.onerror = (err) => {
      console.error('Failed to open IndexedDB for shared files', err);
    };
  }

  // Run on load
  checkAuth();
  checkSharedFiles();

})();
