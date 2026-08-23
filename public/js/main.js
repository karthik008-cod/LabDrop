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
  const togglePasswordBtn = $('#togglePasswordBtn');
  const authError = $('#authError');
  const authSubmitBtn = $('#authSubmitBtn');
  const authToggleText = $('#authToggleText');
  const authToggleLink = $('#authToggleLink');

  // ---- Password Toggle ----
  if (togglePasswordBtn && authPassword) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = authPassword.type === 'password';
      authPassword.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
    });
  }

  const modeQuick = $('#modeQuick');
  const modeSave = $('#modeSave');

  // ---- Folder DOM ----
  const folderPanel = $('#folderPanel');
  const folderListEl = $('#folderList');
  const newFolderBtn = $('#newFolderBtn');
  const newFolderRow = $('#newFolderRow');
  const newFolderInput = $('#newFolderInput');
  const confirmNewFolderBtn = $('#confirmNewFolderBtn');
  const cancelNewFolderBtn = $('#cancelNewFolderBtn');
  const toastContainer = $('#toastContainer');

  // ---- State ----
  let selectedFiles = []; // Root / Unorganized files (Array of File objects)
  let selectedLinks = []; // Root / Unorganized links (Array of string URLs)
  let folders = [];       // Array of { id, name, files: [], links: [] }
  let activeFolderId = null; // null = root/unorganized
  let currentTransfer = null;
  let timerInterval = null;
  let authToken = sessionStorage.getItem('labdrop_token');
  let authUser = null;
  let authMode = 'login';
  let transferMode = 'quick';
  let screenshotCounter = 0;

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

  // ---- Toast notifications ----
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast--leaving');
      setTimeout(() => toast.remove(), 260);
    }, 3000);
  }

  // ---- Folder helpers ----
  function getActiveFolder() {
    if (!activeFolderId) return null;
    return folders.find(f => f.id === activeFolderId) || null;
  }

  function getActiveName() {
    const f = getActiveFolder();
    return f ? f.name : 'Unorganized';
  }

  function getAllFiles() {
    let all = [...selectedFiles];
    folders.forEach(f => { all = all.concat(f.files); });
    return all;
  }

  function getAllLinks() {
    let all = [...selectedLinks];
    folders.forEach(f => { all = all.concat(f.links); });
    return all;
  }

  function getTotalFileCount() {
    return selectedFiles.length + folders.reduce((sum, f) => sum + f.files.length, 0);
  }

  function getTotalLinkCount() {
    return selectedLinks.length + folders.reduce((sum, f) => sum + f.links.length, 0);
  }

  function hasAnyContent() {
    return getTotalFileCount() > 0 || getTotalLinkCount() > 0;
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
        sessionStorage.removeItem('labdrop_token');
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
      authLoggedOut.style.display = 'flex';
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
    sessionStorage.removeItem('labdrop_token');
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
        sessionStorage.setItem('labdrop_token', authToken);
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
    // Determine which files/links to show based on active folder
    const activeFolder = getActiveFolder();
    const currentFiles = activeFolder ? activeFolder.files : selectedFiles;
    const currentLinks = activeFolder ? activeFolder.links : selectedLinks;

    // --- Render files ---
    fileList.innerHTML = '';
    let totalSize = 0;

    currentFiles.forEach((file, index) => {
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
          <button type="button" class="file-item__move" data-index="${index}" data-type="file" title="Move to folder" style="font-size: 0.8rem; padding: 0.2rem 0.5rem; margin-right: 0.2rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); cursor: pointer;">Move</button>
          <button class="file-item__remove" data-index="${index}" title="Remove file">✕</button>
        </div>
      `;
      fileList.appendChild(li);
    });

    // Bind file remove buttons
    fileList.querySelectorAll('.file-item__remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        currentFiles.splice(idx, 1);
        renderFileList();
      });
    });

    // --- Render links ---
    linkList.innerHTML = '';
    currentLinks.forEach((link, idx) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <div class="file-item__icon file-item__icon--data">🔗</div>
        <div class="file-item__details">
          <div class="file-item__name" style="white-space: pre-wrap; word-break: break-word; font-family: monospace; font-size: 0.9em;">${linkify(link)}</div>
          <div class="file-item__size">Link</div>
        </div>
        <div class="file-item__actions">
          <button type="button" class="file-item__move" data-index="${idx}" data-type="link" title="Move to folder" style="font-size: 0.8rem; padding: 0.2rem 0.5rem; margin-right: 0.2rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); cursor: pointer;">Move</button>
          <button type="button" class="file-item__remove" data-index="${idx}" title="Remove">✕</button>
        </div>
      `;
      linkList.appendChild(li);
    });

    linkList.querySelectorAll('.file-item__remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        currentLinks.splice(idx, 1);
        renderFileList();
      });
    });

    // Bind move buttons
    document.querySelectorAll('.file-item__move').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.getAttribute('data-type');
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        openMoveModal(false, type, idx);
      });
    });

    // --- Summary ---
    const totalFiles = getTotalFileCount();
    const totalLinks = getTotalLinkCount();
    const allFilesTotalSize = getAllFiles().reduce((s, f) => s + f.size, 0);
    let summaryParts = [];
    if (totalFiles > 0) summaryParts.push(`${totalFiles} file(s)`);
    if (totalLinks > 0) summaryParts.push(`${totalLinks} link(s)`);
    fileSummary.textContent = summaryParts.join(', ') + (totalFiles > 0 ? ` · ${formatBytes(allFilesTotalSize)}` : '');
    if (activeFolder) {
      fileSummary.textContent = `📁 ${activeFolder.name}: ${currentFiles.length} file(s)` +
        (currentLinks.length > 0 ? `, ${currentLinks.length} link(s)` : '') +
        ` · ${formatBytes(totalSize)}`;
    }

    // --- Visibility ---
    if (hasAnyContent()) {
      fileListWrapper.classList.remove('section--hidden');
      transferOptions.classList.remove('section--hidden');
      createTransferBtn.disabled = false;
    } else {
      fileListWrapper.classList.add('section--hidden');
      transferOptions.classList.add('section--hidden');
      createTransferBtn.disabled = true;
    }

    // --- Render folder panel ---
    renderFolderPanel();
  }

  // ---- Render folder panel ----
  function renderFolderPanel() {
    folderPanel.classList.remove('section--hidden');

    folderListEl.innerHTML = '';

    // Unorganized item
    const unorgItem = document.createElement('div');
    unorgItem.className = `folder-item${activeFolderId === null ? ' folder-item--active' : ''}`;
    const unorgFileCount = selectedFiles.length;
    const unorgLinkCount = selectedLinks.length;
    let unorgMeta = '';
    if (unorgFileCount > 0 || unorgLinkCount > 0) {
      const parts = [];
      if (unorgFileCount > 0) parts.push(`${unorgFileCount} file(s)`);
      if (unorgLinkCount > 0) parts.push(`${unorgLinkCount} link(s)`);
      unorgMeta = parts.join(', ');
    }
    unorgItem.innerHTML = `
      <div class="folder-item__icon">📥</div>
      <div class="folder-item__info">
        <div class="folder-item__name">Unorganized</div>
        ${unorgMeta ? `<div class="folder-item__meta">${unorgMeta}</div>` : ''}
      </div>
      <div class="folder-item__active-dot"></div>
    `;
    unorgItem.addEventListener('click', () => {
      activeFolderId = null;
      renderFileList();
    });
    folderListEl.appendChild(unorgItem);

    // Folder items
    folders.forEach(folder => {
      const item = document.createElement('div');
      item.className = `folder-item${folder.id === activeFolderId ? ' folder-item--active' : ''}`;
      const fc = folder.files.length;
      const lc = folder.links.length;
      let meta = '';
      if (fc > 0 || lc > 0) {
        const parts = [];
        if (fc > 0) parts.push(`${fc} file(s)`);
        if (lc > 0) parts.push(`${lc} link(s)`);
        meta = parts.join(', ');
      }
      item.innerHTML = `
        <div class="folder-item__icon">📁</div>
        <div class="folder-item__info">
          <div class="folder-item__name">${escapeHtml(folder.name)}</div>
          ${meta ? `<div class="folder-item__meta">${meta}</div>` : ''}
        </div>
        <div class="folder-item__active-dot"></div>
        <div class="folder-item__actions">
          <button class="folder-item__action-btn" data-action="rename" title="Rename">✏️</button>
          <button class="folder-item__action-btn folder-item__action-btn--danger" data-action="delete" title="Delete">🗑️</button>
        </div>
      `;

      // Click to activate (but not on action buttons)
      item.addEventListener('click', (e) => {
        if (e.target.closest('.folder-item__actions')) return;
        activeFolderId = folder.id;
        renderFileList();
      });

      // Rename
      item.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt('Rename folder:', folder.name);
        if (newName && newName.trim()) {
          folder.name = newName.trim().substring(0, 40);
          renderFileList();
        }
      });

      // Delete
      item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const totalItems = folder.files.length + folder.links.length;
        const msg = totalItems > 0
          ? `Delete "${folder.name}" and its ${totalItems} item(s)?`
          : `Delete empty folder "${folder.name}"?`;
        if (confirm(msg)) {
          folders = folders.filter(f => f.id !== folder.id);
          if (activeFolderId === folder.id) {
            activeFolderId = folders.length > 0 ? folders[0].id : null;
          }
          renderFileList();
        }
      });

      folderListEl.appendChild(item);
    });
  }

  // ---- Add files (folder-aware, with deduplication) ----
  function addFiles(newFiles) {
    const activeFolder = getActiveFolder();
    const targetFiles = activeFolder ? activeFolder.files : selectedFiles;

    if (targetFiles.length + newFiles.length > 20) {
      showAlert('Maximum 20 files allowed per folder.');
      return;
    }
    const existingNames = new Set(targetFiles.map((f) => f.name + '_' + f.size));
    let addedCount = 0;
    for (const file of newFiles) {
      const key = file.name + '_' + file.size;
      if (!existingNames.has(key)) {
        targetFiles.push(file);
        existingNames.add(key);
        addedCount++;
      }
    }

    if (addedCount > 0 && folders.length > 0) {
      const dest = activeFolder ? activeFolder.name : 'Unorganized';
      showToast(`✓ ${addedCount} file(s) added to <strong>${escapeHtml(dest)}</strong>`);
    }

    renderFileList();
  }

  // ---- Clipboard Paste (Ctrl+V) ----
  document.addEventListener('paste', (e) => {
    // Only handle paste when we're on the select section
    if (selectSection.classList.contains('section--hidden')) return;
    // Don't intercept paste inside input/textarea
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          screenshotCounter++;
          const now = new Date();
          const ts = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '-' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
          const ext = blob.type.split('/')[1] || 'png';
          const fileName = `Screenshot-${ts}${screenshotCounter > 1 ? `-${screenshotCounter}` : ''}.${ext}`;
          const file = new File([blob], fileName, { type: blob.type });
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);

      // Visual feedback on dropzone
      dropzone.classList.add('dropzone--pasting');
      setTimeout(() => dropzone.classList.remove('dropzone--pasting'), 600);
    }
  });

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
      fileInput.value = '';
    }
  });

  // ---- Clear files (active folder only or all) ----
  clearFilesBtn.addEventListener('click', () => {
    const activeFolder = getActiveFolder();
    if (activeFolder) {
      activeFolder.files = [];
      activeFolder.links = [];
    } else {
      selectedFiles = [];
      selectedLinks = [];
    }
    renderFileList();
  });

  // ---- Move Files Logic ----
  const moveModal = document.getElementById('moveModal');
  const moveModalClose = document.getElementById('moveModalClose');
  const moveModalCancel = document.getElementById('moveModalCancel');
  const moveFolderList = document.getElementById('moveFolderList');
  const moveAllBtn = document.getElementById('moveAllBtn');
  
  let currentMoveState = {
    isMoveAll: false,
    itemType: null, // 'file' or 'link'
    itemIndex: -1
  };

  moveModalClose.addEventListener('click', () => moveModal.classList.remove('active'));
  moveModalCancel.addEventListener('click', () => moveModal.classList.remove('active'));

  moveAllBtn.addEventListener('click', () => {
    const activeFolder = getActiveFolder();
    const sourceFiles = activeFolder ? activeFolder.files : selectedFiles;
    const sourceLinks = activeFolder ? activeFolder.links : selectedLinks;
    if (sourceFiles.length === 0 && sourceLinks.length === 0) {
      showAlert('No items to move.');
      return;
    }
    openMoveModal(true);
  });

  function openMoveModal(isMoveAll, itemType = null, itemIndex = -1) {
    currentMoveState = { isMoveAll, itemType, itemIndex };
    moveFolderList.innerHTML = '';
    
    // Add "Unorganized" as a destination (if we are currently in a folder)
    if (activeFolderId !== null) {
      const btn = document.createElement('button');
      btn.className = 'btn btn--ghost btn--block';
      btn.style.textAlign = 'left';
      btn.innerHTML = '📥 Unorganized';
      btn.addEventListener('click', () => executeMove(null));
      moveFolderList.appendChild(btn);
    }
    
    // Add folders as destinations (excluding the current one)
    folders.forEach(folder => {
      if (folder.id === activeFolderId) return;
      const btn = document.createElement('button');
      btn.className = 'btn btn--ghost btn--block';
      btn.style.textAlign = 'left';
      btn.innerHTML = `📁 ${escapeHtml(folder.name)}`;
      btn.addEventListener('click', () => executeMove(folder.id));
      moveFolderList.appendChild(btn);
    });

    if (moveFolderList.children.length === 0) {
      showAlert('No other folders available to move to. Create a new folder first.');
      return;
    }

    moveModal.classList.add('active');
  }

  function executeMove(targetFolderId) {
    const sourceFiles = activeFolderId ? getActiveFolder().files : selectedFiles;
    const sourceLinks = activeFolderId ? getActiveFolder().links : selectedLinks;
    const targetFiles = targetFolderId ? folders.find(f => f.id === targetFolderId).files : selectedFiles;
    const targetLinks = targetFolderId ? folders.find(f => f.id === targetFolderId).links : selectedLinks;
    
    const targetName = targetFolderId ? folders.find(f => f.id === targetFolderId).name : 'Unorganized';

    if (currentMoveState.isMoveAll) {
      targetFiles.push(...sourceFiles);
      targetLinks.push(...sourceLinks);
      if (activeFolderId) {
        getActiveFolder().files = [];
        getActiveFolder().links = [];
      } else {
        selectedFiles.length = 0;
        selectedLinks.length = 0;
      }
      showToast(`📦 Moved all items to <strong>${escapeHtml(targetName)}</strong>`);
    } else {
      if (currentMoveState.itemType === 'file') {
        const item = sourceFiles.splice(currentMoveState.itemIndex, 1)[0];
        targetFiles.push(item);
        showToast(`📦 Moved file to <strong>${escapeHtml(targetName)}</strong>`);
      } else if (currentMoveState.itemType === 'link') {
        const item = sourceLinks.splice(currentMoveState.itemIndex, 1)[0];
        targetLinks.push(item);
        showToast(`📦 Moved link to <strong>${escapeHtml(targetName)}</strong>`);
      }
    }
    
    moveModal.classList.remove('active');
    renderFileList();
  }

  // ---- Add link (folder-aware) ----
  addLinkBtn.addEventListener('click', () => {
    let url = linkInput.value;
    if (!url.trim()) return;
    // url validation removed
    const activeFolder = getActiveFolder();
    const targetLinks = activeFolder ? activeFolder.links : selectedLinks;
    if (targetLinks.length >= 20) {
      showAlert('Maximum 20 links allowed per folder.');
      return;
    }
    targetLinks.push(url);
    linkInput.value = '';

    if (folders.length > 0) {
      const dest = activeFolder ? activeFolder.name : 'Unorganized';
      showToast(`✓ Link added to <strong>${escapeHtml(dest)}</strong>`);
    }

    renderFileList();
  });
  linkInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLinkBtn.click();
    }
  });

  // ---- Folder CRUD ----
  newFolderBtn.addEventListener('click', () => {
    newFolderRow.style.display = 'flex';
    newFolderInput.value = '';
    newFolderInput.focus();
  });

  cancelNewFolderBtn.addEventListener('click', () => {
    newFolderRow.style.display = 'none';
  });

  confirmNewFolderBtn.addEventListener('click', () => {
    createFolder();
  });

  newFolderInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createFolder();
    }
  });

  function createFolder() {
    const name = newFolderInput.value.trim();
    if (!name) return;
    const id = 'folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const folder = { id, name: name.substring(0, 40), files: [], links: [] };
    folders.push(folder);
    activeFolderId = id; // Auto-activate newly created folder
    newFolderRow.style.display = 'none';
    newFolderInput.value = '';
    showToast(`📁 Folder <strong>${escapeHtml(name)}</strong> created and activated`);
    renderFileList();
  }

  // ---- Show folder panel button even when no folders exist (inside hero card) ----
  // The "+ New Folder" button is always visible inside the folder panel.
  // But we also need a way to create the FIRST folder. Add it to the dropzone hint.
  dropzone.addEventListener('click', (e) => {
    // Let the file input handle the click
  });

  // ---- Create Transfer ----
  createTransferBtn.addEventListener('click', async () => {
    if (!hasAnyContent()) {
      showAlert('Please select at least one file or link.');
      return;
    }

    showSection(uploadSection);

    // Gather ALL files from root + all folders
    const allFiles = getAllFiles();
    const allLinks = getAllLinks();

    // Build folder structure map: { filename -> folderName }
    const folderStructure = {};
    folders.forEach(folder => {
      folder.files.forEach(file => {
        folderStructure[file.name] = folder.name;
      });
      // Also map links to folders
      folder.links.forEach(link => {
        folderStructure['link:' + link] = folder.name;
      });
    });

    const formData = new FormData();
    allFiles.forEach((file) => formData.append('files', file));
    if (allLinks.length > 0) {
      formData.append('links', JSON.stringify(allLinks));
    }
    if (Object.keys(folderStructure).length > 0) {
      formData.append('folderStructure', JSON.stringify(folderStructure));
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

    // Render file list in QR view
    qrFileList.innerHTML = '';

    function renderFileItem(f) {
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
      return li;
    }

    function renderLinkItem(link) {
      const li = document.createElement('li');
      li.className = 'file-item';
      const isUrl = /^https?:\/\/[^\s]+$/.test(link);
      const openBtnHtml = isUrl ? `<a href="${escapeHtml(link)}" target="_blank" class="btn btn--outline btn--sm">Open</a>` : '';
      li.innerHTML = `
        <div class="file-item__icon file-item__icon--data">🔗</div>
        <div class="file-item__details" style="align-items: flex-start; max-width: 100%; overflow: hidden;">
          <div class="file-item__name" style="white-space: pre-wrap; word-break: break-word; font-family: monospace; font-size: 0.9em;">${linkify(link)}</div>
          ${!isUrl ? '' : '<div class="file-item__size">Link</div>'}
        </div>
        <div class="file-item__actions">
          ${openBtnHtml}
        </div>
      `;
      return li;
    }

    // Render root files first
    if (rootFiles.length > 0 && Object.keys(groups).length > 0) {
      const header = document.createElement('div');
      header.className = 'folder-group-header';
      header.innerHTML = '📥 Unorganized';
      qrFileList.appendChild(header);
    }
    rootFiles.forEach(f => qrFileList.appendChild(renderFileItem(f)));

    // Render folder groups
    Object.keys(groups).forEach(folderName => {
      const header = document.createElement('div');
      header.className = 'folder-group-header';
      header.innerHTML = `📁 ${escapeHtml(folderName)}`;
      qrFileList.appendChild(header);
      groups[folderName].files.forEach(f => qrFileList.appendChild(renderFileItem(f)));
      groups[folderName].links.forEach(link => qrFileList.appendChild(renderLinkItem(link)));
    });

    // Root links
    qrLinkList.innerHTML = '';
    if (rootLinks.length > 0) {
      qrLinkList.style.display = 'block';
      rootLinks.forEach(link => qrLinkList.appendChild(renderLinkItem(link)));
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
    folders = [];
    activeFolderId = null;
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
    if (code.length !== 4) return;
    
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
  function checkSharedFiles(retries = 0) {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('share_error')) {
      window.history.replaceState({}, document.title, '/');
      showAlert('Failed to process shared files. They might be too large or unsupported.', 'error');
      return;
    }
    
    if (!urlParams.has('shared')) return;

    const request = indexedDB.open('LabDropSharedFiles', 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      
      // If the store doesn't exist yet, wait for SW to create it
      if (!db.objectStoreNames.contains('files')) {
        db.close();
        if (retries < 20) {
          setTimeout(() => checkSharedFiles(retries + 1), 500);
        } else {
          window.history.replaceState({}, document.title, '/');
        }
        return;
      }

      const transaction = db.transaction('files', 'readwrite');
      const store = transaction.objectStore('files');
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const files = getAllRequest.result;
        if (files && files.length > 0) {
          addFiles(files);
          showAlert(`Received ${files.length} file(s) from share! Please review and click Create Transfer.`, 'success');
          store.clear();
          window.history.replaceState({}, document.title, '/');
        } else {
          // Store exists but files might not be saved yet, retry
          db.close();
          if (retries < 20) {
            setTimeout(() => checkSharedFiles(retries + 1), 500);
          } else {
            window.history.replaceState({}, document.title, '/');
          }
        }
      };
    };

    request.onerror = (err) => {
      console.error('Failed to open IndexedDB for shared files', err);
      if (retries < 20) {
        setTimeout(() => checkSharedFiles(retries + 1), 500);
      }
    };
  }

  // Run on load
  checkAuth();
  checkSharedFiles();

})();
