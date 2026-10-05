// ============================================================
// LabDrop — Desktop UI Logic (main.js)
// ============================================================

(function () {
  'use strict';
  
  // Prevent browser from restoring scroll position on refresh
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);

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
  const customPinContainer = $('#customPinContainer');
  const customPinInput = $('#customPin');

  requirePinCheck.addEventListener('change', () => {
    if (requirePinCheck.checked) {
      customPinContainer.style.maxHeight = '60px';
      customPinContainer.style.opacity = '1';
    } else {
      customPinContainer.style.maxHeight = '0';
      customPinContainer.style.opacity = '0';
      customPinInput.value = '';
    }
  });

  const progressBarFill = $('#progressBarFill');
  const progressText = $('#progressText');
  const paperJetGlider = $('#paperJetGlider');

  const qrImage = $('#qrImage');
  const transferCode = $('#transferCode');
  const transferUrl = $('#transferUrl');
  const copyUrlBtn = $('#copyUrlBtn');
  const pinDisplayContainer = $('#pinDisplayContainer');
  const pinDisplayCode = $('#pinDisplayCode');
  const togglePinVisBtn = $('#togglePinVisBtn');
  const eyeIcon = $('#eyeIcon');
  const eyeOffIcon = $('#eyeOffIcon');
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
      togglePasswordBtn.innerHTML = isPassword ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
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

  // ---- Mobile Menu & Drawer DOM ----
  const mobileMenuBtn = $('#mobileMenuBtn');
  const mobileDrawerCloseBtn = $('#mobileDrawerCloseBtn');
  const sidebarOverlay = $('#sidebarOverlay');
  const sidebar = $('.sidebar');

  function openMobileSidebar() {
    if (sidebar) sidebar.classList.add('sidebar--open');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
    document.body.classList.add('drawer-open');
  }

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('sidebar--open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    document.body.classList.remove('drawer-open');
  }

  if (mobileMenuBtn && sidebarOverlay && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.contains('sidebar--open');
      if (isOpen) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });

    sidebarOverlay.addEventListener('click', closeMobileSidebar);
    if (mobileDrawerCloseBtn) {
      mobileDrawerCloseBtn.addEventListener('click', closeMobileSidebar);
    }
  }

  // Drawer Auth elements
  const drawerNavLoginBtn = $('#drawerNavLoginBtn');
  const drawerNavSignupBtn = $('#drawerNavSignupBtn');
  const drawerNavLogoutBtn = $('#drawerNavLogoutBtn');
  const drawerAuthLoggedOut = $('#drawerAuthLoggedOut');
  const drawerAuthLoggedIn = $('#drawerAuthLoggedIn');
  const drawerUserEmail = $('#drawerUserEmail');

  if (drawerNavLoginBtn) {
    drawerNavLoginBtn.addEventListener('click', () => {
      closeMobileSidebar();
      openAuthModal('login');
    });
  }
  if (drawerNavSignupBtn) {
    drawerNavSignupBtn.addEventListener('click', () => {
      closeMobileSidebar();
      openAuthModal('signup');
    });
  }
  if (drawerNavLogoutBtn) {
    drawerNavLogoutBtn.addEventListener('click', () => {
      closeMobileSidebar();
      if (navLogoutBtn) navLogoutBtn.click();
    });
  }

  // ---- State ----
  let selectedFiles = []; // Root / Unorganized files (Array of File objects)
  let selectedLinks = []; // Root / Unorganized links (Array of string URLs)
  let folders = [];       // Array of { id, name, files: [], links: [] }
  let activeFolderId = null; // null = root/unorganized
  let currentTransfer = null;
  let currentTransferPin = null;
  let isPinVisible = false;
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
      if (drawerAuthLoggedOut) drawerAuthLoggedOut.style.display = 'none';
      if (drawerAuthLoggedIn) {
        drawerAuthLoggedIn.style.display = 'flex';
        if (drawerUserEmail) drawerUserEmail.textContent = authUser.email;
      }
    } else {
      authLoggedOut.style.display = 'flex';
      authLoggedIn.style.display = 'none';
      if (drawerAuthLoggedOut) drawerAuthLoggedOut.style.display = 'flex';
      if (drawerAuthLoggedIn) drawerAuthLoggedIn.style.display = 'none';
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
      const isEligibleRecord = cat === 'code' || cat === 'pdf' || cat === 'document' || cat === 'image';
      const recordBtnHtml = isEligibleRecord ? `<button type="button" class="file-item__record" data-index="${index}" title="Generate Lab Record with AI" style="font-size: 0.8rem; padding: 0.2rem 0.5rem; margin-right: 0.2rem; background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: var(--radius-sm); color: #7c3aed; font-weight: 700; cursor: pointer;">📄 AI Record</button>` : '';

      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <div class="file-item__icon file-item__icon--${cat}">${icon}</div>
        <div class="file-item__details">
          <div class="file-item__name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
          <div class="file-item__size">${formatBytes(file.size)}</div>
        </div>
        <div class="file-item__actions">
          ${recordBtnHtml}
          <button type="button" class="file-item__move" data-index="${index}" data-type="file" title="Move to folder" style="font-size: 0.8rem; padding: 0.2rem 0.5rem; margin-right: 0.2rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); cursor: pointer;">Move</button>
          <button class="file-item__remove" data-index="${index}" title="Remove file">✕</button>
        </div>
      `;
      fileList.appendChild(li);
    });

    // Bind file record buttons
    fileList.querySelectorAll('.file-item__record').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        openLabRecordModal(currentFiles[idx]);
      });
    });

    // Bind file remove buttons
    fileList.querySelectorAll('.file-item__remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        currentFiles.splice(idx, 1);
        renderFileList();
      });
    });

    // --- Render links & code snippets ---
    linkList.innerHTML = '';
    currentLinks.forEach((link, idx) => {
      const li = document.createElement('li');
      const isMultiLine = link.includes('\n');
      const isUrl = /^https?:\/\/[^\s]+$/.test(link.trim());
      const lineCount = link.split('\n').length;
      const typeLabel = isUrl ? 'Link' : isMultiLine ? `Code (${lineCount} lines)` : 'Text';
      
      if (!isUrl) {
        li.className = 'file-item file-item--code';
        li.innerHTML = `
          <div class="file-item__icon file-item__icon--code">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
          </div>
          <div class="file-item__details">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
              <span class="file-item__size" style="font-weight: 600; font-size: 0.82rem; color: var(--color-primary-dark);">${typeLabel}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-secondary);">${link.length.toLocaleString()} chars</span>
            </div>
            <div class="file-item__name">${linkify(link)}</div>
          </div>
          <div class="file-item__actions">
            <button type="button" class="file-item__move" data-index="${idx}" data-type="link" title="Move to folder" style="font-size: 0.8rem; padding: 0.2rem 0.5rem; margin-right: 0.2rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); cursor: pointer;">Move</button>
            <button type="button" class="file-item__remove" data-index="${idx}" title="Remove">✕</button>
          </div>
        `;
      } else {
        li.className = 'file-item';
        li.innerHTML = `
          <div class="file-item__icon file-item__icon--data">🔗</div>
          <div class="file-item__details">
            <div class="file-item__name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${linkify(link)}</div>
            <div class="file-item__size">Link</div>
          </div>
          <div class="file-item__actions">
            <button type="button" class="file-item__move" data-index="${idx}" data-type="link" title="Move to folder" style="font-size: 0.8rem; padding: 0.2rem 0.5rem; margin-right: 0.2rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-secondary); cursor: pointer;">Move</button>
            <button type="button" class="file-item__remove" data-index="${idx}" title="Remove">✕</button>
          </div>
        `;
      }
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

    // --- Update code detection banner & AI modal dropdowns ---
    updateCodeDetectionBanner();
    if (typeof populateHomeAiFileSelect === 'function') {
      populateHomeAiFileSelect();
    }
    if (typeof populateRecordSourceSelect === 'function') {
      populateRecordSourceSelect();
    }
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
      item.querySelector('[data-action="rename"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        const newName = await window.LabDialog.prompt('Rename folder:', folder.name);
        if (newName && newName.trim()) {
          folder.name = newName.trim().substring(0, 40);
          renderFileList();
        }
      });

      // Delete
      item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        const totalItems = folder.files.length + folder.links.length;
        const msg = totalItems > 0
          ? `Delete "${folder.name}" and its ${totalItems} item(s)?`
          : `Delete empty folder "${folder.name}"?`;
        if (await window.LabDialog.confirm(msg)) {
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

    let availableSlots = 30 - targetFiles.length;
    if (availableSlots <= 0) {
      showAlert('Maximum 30 files allowed per folder.');
      return;
    }

    if (newFiles.length > availableSlots) {
      showAlert(`Can only add ${availableSlots} more file(s). Ignored the rest.`, 'error');
      newFiles = newFiles.slice(0, availableSlots);
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

  // ---- Add link / code snippet (folder-aware) ----
  addLinkBtn.addEventListener('click', () => {
    let text = linkInput.value;
    if (!text.trim()) return;
    const activeFolder = getActiveFolder();
    const targetLinks = activeFolder ? activeFolder.links : selectedLinks;
    if (targetLinks.length >= 50) {
      showAlert('Maximum 50 items allowed per folder.');
      return;
    }
    // Push the raw content directly, preserving all leading indentation, tabs, and newlines
    targetLinks.push(text);
    linkInput.value = '';

    const isCode = text.includes('\n');
    const label = isCode ? 'Code snippet' : 'Text';
    if (folders.length > 0) {
      const dest = activeFolder ? activeFolder.name : 'Unorganized';
      showToast(`✓ ${label} added to <strong>${escapeHtml(dest)}</strong>`);
    } else {
      showToast(`✓ ${label} added`);
    }

    renderFileList();
  });

  // Support Tab key indentation (4 spaces) and Ctrl+Enter to submit
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = linkInput.selectionStart;
      const end = linkInput.selectionEnd;
      const val = linkInput.value;
      // Insert 4 spaces at cursor position
      linkInput.value = val.substring(0, start) + '    ' + val.substring(end);
      linkInput.selectionStart = linkInput.selectionEnd = start + 4;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
    if (e.target !== fileInput && e.target.tagName !== 'BUTTON') {
      fileInput.click();
    }
  });

  // ---- Create Transfer ----
  createTransferBtn.addEventListener('click', async () => {
    if (!hasAnyContent()) {
      showAlert('Please select at least one file or link.');
      return;
    }

    // Gather ALL files from root + all folders
    const allFiles = getAllFiles();
    
    const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250 MB
    const MAX_TOTAL_SIZE = 1024 * 1024 * 1024; // 1 GB (1,024 MB)
    const MAX_FILES = 30;

    if (allFiles.length > MAX_FILES) {
      showAlert(`Maximum ${MAX_FILES} files allowed per transfer.`);
      return;
    }

    const oversizedFile = allFiles.find(f => f.size > MAX_FILE_SIZE);
    if (oversizedFile) {
      showAlert(`File too large: "${oversizedFile.name}" exceeds the 250MB limit.`);
      return;
    }

    const totalSize = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      showAlert('Total transfer size exceeds the 1GB (1,024MB) limit.');
      return;
    }

    if (requirePinCheck.checked) {
      const customPinValue = customPinInput.value.trim();
      if (customPinValue.length > 0) {
        if (customPinValue.length !== 6 || !/^\d+$/.test(customPinValue)) {
          customPinInput.classList.add('shake');
          setTimeout(() => customPinInput.classList.remove('shake'), 300);
          showAlert('Custom PIN must be exactly 6 digits.');
          return;
        }
      }
    }

    if (paperJetGlider) paperJetGlider.style.left = '0%';
    if (progressBarFill) progressBarFill.style.width = '0%';
    showSection(uploadSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });

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

    function updateUploadProgress(loaded, total) {
      const pct = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
      if (progressBarFill) progressBarFill.style.width = pct + '%';
      if (paperJetGlider) paperJetGlider.style.left = pct + '%';
      if (progressText) progressText.textContent = `Uploading… ${pct}%`;
    }

    try {
      let response = null;

      // ---- Method 1: High-Capacity Direct-to-S3 Presigned Upload ----
      try {
        const filesMeta = allFiles.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type || 'application/octet-stream'
        }));

        const initPayload = {
          files: filesMeta,
          links: allLinks,
          folderStructure,
          transferName: transferNameInput.value.trim() || undefined,
          requirePin: requirePinCheck.checked,
          saveForLater: transferMode === 'save'
        };

        if (requirePinCheck.checked) {
          const customPinValue = customPinInput.value.trim();
          if (customPinValue.length === 6 && /^\d+$/.test(customPinValue)) {
            initPayload.customPin = customPinValue;
          }
        }

        const initRes = await fetch('/api/upload/initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
          },
          body: JSON.stringify(initPayload)
        });

        if (!initRes.ok) {
          const errData = await initRes.json().catch(() => ({}));
          throw new Error(errData.error || `Upload initiate failed (${initRes.status}).`);
        }

        const initData = await initRes.json();

        if (initData.isComplete) {
          // Links only, no files to upload
          if (progressBarFill) progressBarFill.style.width = '100%';
          if (paperJetGlider) paperJetGlider.style.left = '100%';
          response = initData;
        } else {
          // Upload each file directly to S3 with aggregate progress tracking
          const loadedPerFile = new Array(allFiles.length).fill(0);
          const totalBytes = allFiles.reduce((sum, f) => sum + (f.size || 0), 0) || 1;

          const uploadPromises = allFiles.map((file, idx) => {
            const presigned = initData.files[idx];
            if (!presigned || !presigned.uploadUrl) {
              return Promise.reject(new Error(`Missing upload URL for "${file.name}".`));
            }

            return new Promise((resolve, reject) => {
              const putXhr = new XMLHttpRequest();
              putXhr.open('PUT', presigned.uploadUrl);
              putXhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

              putXhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                  loadedPerFile[idx] = e.loaded;
                  const totalLoaded = loadedPerFile.reduce((sum, v) => sum + v, 0);
                  updateUploadProgress(totalLoaded, totalBytes);
                }
              });

              putXhr.onload = () => {
                if (putXhr.status >= 200 && putXhr.status < 300) {
                  loadedPerFile[idx] = file.size;
                  resolve();
                } else {
                  reject(new Error(`Direct S3 upload failed for "${file.name}" (HTTP ${putXhr.status}).`));
                }
              };

              putXhr.onerror = () => reject(new Error(`Direct S3 network error for "${file.name}".`));
              putXhr.send(file);
            });
          });

          await Promise.all(uploadPromises);

          if (progressBarFill) progressBarFill.style.width = '100%';
          if (paperJetGlider) paperJetGlider.style.left = '100%';
          if (progressText) progressText.textContent = 'Finalizing transfer…';

          // Complete the transfer
          const compRes = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
            },
            body: JSON.stringify({
              transferId: initData.transferId,
              pin: initData.pin
            })
          });

          if (!compRes.ok) {
            const errData = await compRes.json().catch(() => ({}));
            throw new Error(errData.error || `Finalizing transfer failed (${compRes.status}).`);
          }

          response = await compRes.json();
        }
      } catch (directErr) {
        console.warn('[Direct S3 Upload] Falling back to server-relayed upload:', directErr.message);

        // ---- Method 2: Fallback to Server-Relayed Upload ----
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
        if (requirePinCheck.checked) {
          const customPinValue = customPinInput.value.trim();
          if (customPinValue.length === 6 && /^\d+$/.test(customPinValue)) {
            formData.append('customPin', customPinValue);
          }
        }
        if (transferMode === 'save') {
          formData.append('saveForLater', 'true');
        }

        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            if (progressBarFill) progressBarFill.style.width = pct + '%';
            if (paperJetGlider) paperJetGlider.style.left = pct + '%';
            if (progressText) progressText.textContent = `Uploading… ${pct}%`;
          }
        });

        response = await new Promise((resolve, reject) => {
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
      }

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
      currentTransferPin = data.pin;
      isPinVisible = false;
      pinDisplayCode.textContent = '******';
      if (eyeIcon && eyeOffIcon) {
        eyeIcon.style.display = 'none';
        eyeOffIcon.style.display = 'block';
      }
      pinDisplayContainer.classList.remove('section--hidden');
    } else {
      currentTransferPin = null;
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
      const isUrl = /^https?:\/\/[^\s]+$/.test(link.trim());
      const isMultiLine = link.includes('\n');
      const lineCount = link.split('\n').length;
      
      if (!isUrl) {
        li.className = 'file-item file-item--code';
        li.innerHTML = `
          <div class="file-item__icon file-item__icon--code">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
          </div>
          <div class="file-item__details">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
              <span class="file-item__size" style="font-weight: 600; font-size: 0.82rem; color: var(--color-primary-dark);">${isMultiLine ? `Code (${lineCount} lines)` : 'Text'}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-secondary);">${link.length.toLocaleString()} chars</span>
            </div>
            <div class="file-item__name">${linkify(link)}</div>
          </div>
          <div class="file-item__actions">
            <button type="button" class="btn btn--outline btn--sm copy-code-btn" style="white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-weight: 600;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
              <span>Copy</span>
            </button>
          </div>
        `;
        const copyBtn = li.querySelector('.copy-code-btn');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            const doCopy = () => {
              const label = copyBtn.querySelector('span');
              if (label) label.textContent = 'Copied!';
              setTimeout(() => { if (label) label.textContent = 'Copy'; }, 2000);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(link).then(doCopy).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = link;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                doCopy();
              });
            } else {
              const ta = document.createElement('textarea');
              ta.value = link;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              ta.remove();
              doCopy();
            }
          });
        }
      } else {
        li.className = 'file-item';
        li.innerHTML = `
          <div class="file-item__icon file-item__icon--data">🔗</div>
          <div class="file-item__details">
            <div class="file-item__name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${linkify(link)}</div>
            <div class="file-item__size">Link</div>
          </div>
          <div class="file-item__actions">
            <a href="${escapeHtml(link.trim())}" target="_blank" class="btn btn--outline btn--sm">Open</a>
          </div>
        `;
      }
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

  // ---- Toggle PIN Visibility ----
  if (togglePinVisBtn) {
    togglePinVisBtn.addEventListener('click', () => {
      if (!currentTransferPin) return;
      isPinVisible = !isPinVisible;
      if (isPinVisible) {
        pinDisplayCode.textContent = currentTransferPin;
        eyeIcon.style.display = 'block';
        eyeOffIcon.style.display = 'none';
      } else {
        pinDisplayCode.textContent = '******';
        eyeIcon.style.display = 'none';
        eyeOffIcon.style.display = 'block';
      }
    });
  }

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
    if (paperJetGlider) paperJetGlider.style.left = '0%';
    progressText.textContent = 'Preparing upload…';
    showSection(selectSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- Receive Form Logic ----
  const homeScanQrBtn = document.getElementById('homeScanQrBtn');
  if (homeScanQrBtn) {
    homeScanQrBtn.addEventListener('click', () => {
      const mobileScanBtn = document.getElementById('mobileScanBtn');
      if (mobileScanBtn) mobileScanBtn.click();
    });
  }

  receiveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let raw = receiveCodeInput.value.trim();
    if (!raw) return;

    // Handle full URL pasted (e.g. https://labdrop.online/t/uuid)
    if (raw.includes('/t/')) {
      const match = raw.match(/\/t\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        window.location.href = `/t/${match[1]}`;
        return;
      }
    }

    // Handle UUID directly
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
      window.location.href = `/t/${raw}`;
      return;
    }

    const code = raw.toUpperCase();
    if (code.length < 3) {
      receiveError.textContent = 'Please enter a valid transfer code.';
      receiveError.style.display = 'block';
      return;
    }
    
    receiveError.style.display = 'none';
    const submitBtn = receiveForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    
    try {
      const res = await fetch(`/api/transfer/code/${code}`);
      const data = await res.json();
      if (res.ok && data.id) {
        window.location.href = `/t/${data.id}`;
      } else {
        receiveError.textContent = data.error || 'Transfer not found or has expired.';
        receiveError.style.display = 'block';
      }
    } catch(err) {
      receiveError.textContent = 'Network error. Please try again.';
      receiveError.style.display = 'block';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // ---- Initialize ----
  showSection(selectSection);

  // ---- PWA, Desktop File Handling & Web Share Target Logic ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        if (reg && reg.update) {
          reg.update();
        }
      }).catch(err => {
        console.error('ServiceWorker registration failed: ', err);
      });
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'LABDROP_SHARED_FILES_READY') {
        checkSharedFiles();
      }
    });
  }

  // Desktop PWA File Handling API (Windows File Explorer "Open with" -> LabDrop / launchQueue)
  if ('launchQueue' in window && 'files' in LaunchParams.prototype) {
    window.launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files || !launchParams.files.length) return;
      try {
        const filePromises = launchParams.files.map(handle => handle.getFile());
        const files = await Promise.all(filePromises);
        if (files && files.length > 0) {
          addFiles(files);
          showAlert(`📥 Added ${files.length} file(s) opened with LabDrop!`, 'success');
        }
      } catch (err) {
        console.error('Error handling files from launchQueue:', err);
      }
    });
  }

  function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
  }

  let isCheckingSharedFiles = false;

  // Check if we arrived via Web Share Target (Server fallback session or IndexedDB PWA)
  async function checkSharedFiles(retries = 0) {
    if (isCheckingSharedFiles) return;
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('share_error')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      showAlert('Failed to process shared files. They might be unsupported or restricted by the OS.', 'error');
      return;
    }

    const sharedSessionId = urlParams.get('shared_session');

    // Dual-Path 1: Server-side fallback session (used when ServiceWorker is inactive or bypassed by OS share)
    if (sharedSessionId) {
      isCheckingSharedFiles = true;
      try {
        const res = await fetch(`/api/share-session/${encodeURIComponent(sharedSessionId)}`);
        if (res.ok) {
          const data = await res.json();
          const incomingFiles = [];
          if (data.files && Array.isArray(data.files)) {
            data.files.forEach(f => {
              if (f.base64) {
                const blob = b64toBlob(f.base64, f.mimetype || 'application/octet-stream');
                const fileObj = new File([blob], f.name || 'shared_file', {
                  type: f.mimetype || 'application/octet-stream',
                  lastModified: Date.now()
                });
                incomingFiles.push(fileObj);
              }
            });
          }

          let hasAddedAnything = false;
          if (incomingFiles.length > 0) {
            addFiles(incomingFiles);
            showAlert(`📥 Received ${incomingFiles.length} file(s) from WhatsApp / Share! Ready to transfer.`, 'success');
            hasAddedAnything = true;
          }

          const shareUrl = data.url || (data.text && /^https?:\/\//i.test(data.text.trim()) ? data.text.trim() : null);
          if (shareUrl) {
            const activeFolder = getActiveFolder();
            const targetLinks = activeFolder ? activeFolder.links : selectedLinks;
            if (targetLinks.length < 20) {
              targetLinks.push(shareUrl);
              renderFileList();
              showAlert(`🔗 Received shared link from WhatsApp / Share!`, 'success');
              hasAddedAnything = true;
            }
          } else if (data.text && data.text.trim()) {
            const blob = new Blob([data.text], { type: 'text/plain;charset=utf-8' });
            const textFile = new File([blob], 'shared-note.txt', { type: 'text/plain;charset=utf-8' });
            addFiles([textFile]);
            showAlert(`📥 Received shared text from WhatsApp! Ready to transfer.`, 'success');
            hasAddedAnything = true;
          }

          window.history.replaceState({}, document.title, window.location.pathname);
          isCheckingSharedFiles = false;
          return;
        }
      } catch (err) {
        console.warn('[ShareTarget] Error retrieving server share session:', err);
      }
      isCheckingSharedFiles = false;
    }

    const hasSharedParam = urlParams.has('shared');

    if (!window.indexedDB) return;

    isCheckingSharedFiles = true;
    const request = indexedDB.open('LabDropSharedFiles', 2);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.close();
        isCheckingSharedFiles = false;
        return;
      }

      const storeNames = Array.from(db.objectStoreNames);
      const transaction = db.transaction(storeNames, 'readwrite');
      const store = transaction.objectStore('files');
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const rawItems = getAllRequest.result || [];
        const normalizedFiles = [];

        rawItems.forEach(item => {
          if (!item) return;
          if (item instanceof File) {
            normalizedFiles.push(item);
          } else if (item.blob instanceof Blob) {
            normalizedFiles.push(new File([item.blob], item.name || 'shared_file', {
              type: item.type || item.blob.type || 'application/octet-stream',
              lastModified: item.lastModified || Date.now()
            }));
          } else if (item.file instanceof File) {
            normalizedFiles.push(item.file);
          } else if (item.file instanceof Blob) {
            normalizedFiles.push(new File([item.file], item.name || 'shared_file', {
              type: item.type || item.file.type || 'application/octet-stream',
              lastModified: item.lastModified || Date.now()
            }));
          } else if (item instanceof Blob) {
            normalizedFiles.push(new File([item], item.name || 'shared_file', {
              type: item.type || 'application/octet-stream',
              lastModified: Date.now()
            }));
          }
        });

        // Check meta store for any shared link
        let sharedLink = null;
        if (storeNames.includes('meta')) {
          const metaStore = transaction.objectStore('meta');
          const getMetaReq = metaStore.get('share_meta');
          getMetaReq.onsuccess = () => {
            if (getMetaReq.result && getMetaReq.result.url) {
              sharedLink = getMetaReq.result.url;
            }
          };
        }

        // Only clear stores if files or links were actually present!
        if (normalizedFiles.length > 0 || rawItems.length > 0) {
          store.clear();
          if (storeNames.includes('meta')) {
            const metaStore = transaction.objectStore('meta');
            metaStore.clear();
          }
        }

        transaction.oncomplete = () => {
          db.close();
          isCheckingSharedFiles = false;

          let hasAddedAnything = false;
          if (normalizedFiles.length > 0) {
            addFiles(normalizedFiles);
            showAlert(`📥 Received ${normalizedFiles.length} file(s) from WhatsApp / Share! Ready to transfer.`, 'success');
            hasAddedAnything = true;
          }

          if (sharedLink) {
            const activeFolder = getActiveFolder();
            const targetLinks = activeFolder ? activeFolder.links : selectedLinks;
            if (targetLinks.length < 20) {
              targetLinks.push(sharedLink);
              renderFileList();
              showAlert(`🔗 Received shared link from WhatsApp / Share!`, 'success');
              hasAddedAnything = true;
            }
          }

          if (hasSharedParam) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          // Safe retry if URL had ?shared=1 and files haven't arrived yet
          if (!hasAddedAnything && hasSharedParam && retries < 10) {
            setTimeout(() => checkSharedFiles(retries + 1), 400);
          }
        };
      };

      getAllRequest.onerror = () => {
        db.close();
        isCheckingSharedFiles = false;
      };
    };

    request.onerror = (err) => {
      console.error('Failed to open IndexedDB for shared files', err);
      isCheckingSharedFiles = false;
      if (hasSharedParam && retries < 10) {
        setTimeout(() => checkSharedFiles(retries + 1), 400);
      }
    };
  }

  // Re-check when user switches back to LabDrop app window
  window.addEventListener('focus', () => checkSharedFiles());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkSharedFiles();
  });

  // Listen for ServiceWorker background postMessage signal
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'LABDROP_SHARED_FILES_READY') {
        checkSharedFiles();
      }
    });
  }

  // Run on load
  checkAuth();
  checkSharedFiles();
  
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  if (action === 'login') {
    openAuthModal('login');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (action === 'signup') {
    openAuthModal('signup');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // ============================================================
  // LabDrop — Instant AI Lab Record & Observation Generator
  // ============================================================
  const navLabRecordBtn = $('#navLabRecordBtn');
  const navLabRecordBtnLoggedIn = $('#navLabRecordBtnLoggedIn');
  const mobileRecordBtn = $('#mobileRecordBtn');
  const codeDetectionBanner = $('#codeDetectionBanner');
  const detectedCodeFilename = $('#detectedCodeFilename');
  const btnTriggerLabRecord = $('#btnTriggerLabRecord');

  const labRecordModal = $('#labRecordModal');
  const labRecordModalClose = $('#labRecordModalClose');
  const recordConfigView = $('#recordConfigView');
  const recordResultView = $('#recordResultView');
  const recordLoadingState = $('#recordLoadingState');
  const recordLoadingSub = $('#recordLoadingSub');

  const recordSourceSelect = $('#recordSourceSelect');
  const recordUploadBtn = $('#recordUploadBtn');
  const recordFileInput = $('#recordFileInput');
  const selectedSectionsCount = $('#selectedSectionsCount');

  const recExpNo = $('#recExpNo');
  const recSubject = $('#recSubject');
  const recStudentName = $('#recStudentName');
  const recRollNo = $('#recRollNo');

  const btnRunLabRecord = $('#btnRunLabRecord');
  const btnPrintRecord = $('#btnPrintRecord');
  const btnCopyRecordMd = $('#btnCopyRecordMd');
  const btnCopyRecordRich = $('#btnCopyRecordRich');
  const btnDownloadRecordMd = $('#btnDownloadRecordMd');
  const btnReconfigureRecord = $('#btnReconfigureRecord');

  const labRecordSheet = $('#labRecordSheet');
  const labRecordHeaderInfo = $('#labRecordHeaderInfo');
  const labRecordContent = $('#labRecordContent');
  const labRecordMermaidArea = $('#labRecordMermaidArea');
  const labRecordMermaidSvg = $('#labRecordMermaidSvg');

  // External files uploaded directly via the Lab Record modal
  let externalRecordFiles = [];
  let currentGeneratedRecord = null;

  // Unified AI Session File Cache (Persists across tab switching & follow-on chat questions)
  let aiSessionFiles = [];

  function getAiFileIcon(fileName) {
    if (!fileName) return '📄';
    const cat = typeof getFileCategory === 'function' ? getFileCategory(fileName) : 'other';
    if (cat === 'code') return '💻';
    if (cat === 'pdf') return '📑';
    if (cat === 'image') return '🖼️';
    if (cat === 'document') return '📖';
    return '📄';
  }

  // Pre-reads and caches complete file payload so it is immediately available throughout the session
  // Pre-reads and caches complete file payload so it is immediately available throughout the session
  async function cacheAiFilePayload(file) {
    if (!file) return null;
    if (file.docxBase64 || file.pdfBase64 || file.imageBase64 || (file.content !== undefined && typeof file.slice !== 'function')) {
      file.codeContent = file.codeContent || file.content || '';
      file.content = file.content || file.codeContent || '';
      file.filename = file.filename || file.name || 'file';
      file.name = file.name || file.filename || 'file';
      return file;
    }

    const fileName = file.name || '';
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    const isImg = /\.(png|jpe?g|webp|gif|svg)$/i.test(fileName);
    const isDocx = /\.(docx|doc)$/i.test(fileName);

    if (isPdf || isImg || isDocx) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = (typeof dataUrl === 'string' && dataUrl.includes(',')) ? dataUrl.split(',')[1] : dataUrl;
      const mimeType = isPdf ? 'application/pdf' : (isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : (file.type || 'image/png'));
      const placeholder = isDocx ? `[Attached Word Document: ${fileName}]` : (isPdf ? `[Attached Document/Diagram File: ${fileName}]` : `[Attached Diagram Image: ${fileName}]`);

      return {
        fileRef: file,
        name: fileName,
        filename: fileName,
        size: file.size,
        type: file.type,
        isPdf,
        isImage: isImg,
        isDocx,
        pdfBase64: isPdf ? base64 : undefined,
        imageBase64: isImg ? base64 : undefined,
        docxBase64: isDocx ? base64 : undefined,
        mimeType,
        content: placeholder,
        codeContent: placeholder
      };
    } else {
      const textContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = reject;
        reader.readAsText(file.slice(0, 100 * 1024));
      });
      return {
        fileRef: file,
        name: fileName,
        filename: fileName,
        size: file.size,
        type: file.type,
        isPdf: false,
        isImage: false,
        isDocx: false,
        content: textContent,
        codeContent: textContent
      };
    }
  }

  function addUnifiedAiSessionFile(cachedFile) {
    if (!cachedFile || !cachedFile.name) return;
    const existingIdx = aiSessionFiles.findIndex(f => f.name === cachedFile.name);
    if (existingIdx >= 0) {
      aiSessionFiles[existingIdx] = cachedFile;
    } else {
      aiSessionFiles.push(cachedFile);
    }
    const originalFile = cachedFile.fileRef || cachedFile;
    if (!externalRecordFiles.some(f => f.name === cachedFile.name)) {
      externalRecordFiles.push(originalFile);
    }
    if (typeof homeDirectVivaFiles !== 'undefined' && !homeDirectVivaFiles.some(f => f.name === cachedFile.name)) {
      homeDirectVivaFiles.push(originalFile);
    }
  }

  function getUnifiedAiFiles() {
    const list = [];
    const seen = new Set();

    // 1. Session uploaded files first (highest priority)
    aiSessionFiles.forEach(f => {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        list.push(f);
      }
    });

    // 2. Direct viva files
    if (typeof homeDirectVivaFiles !== 'undefined' && Array.isArray(homeDirectVivaFiles)) {
      homeDirectVivaFiles.forEach(f => {
        if (!seen.has(f.name)) {
          seen.add(f.name);
          list.push(f);
        }
      });
    }

    // 3. External record files
    externalRecordFiles.forEach(f => {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        list.push(f);
      }
    });

    // 4. All workspace / dropped files
    const all = typeof getAllFiles === 'function' ? getAllFiles() : [];
    all.forEach(f => {
      if (f && f.name && !seen.has(f.name)) {
        seen.add(f.name);
        list.push(f);
      }
    });

    return list;
  }

  // Find all eligible files (code, pdfs, documents, diagrams) from workspace or upload
  function findCodeFiles() {
    return getUnifiedAiFiles();
  }

  function updateCodeDetectionBanner() {
    if (!codeDetectionBanner) return;
    const files = findCodeFiles();
    if (files.length > 0) {
      const f = files[0];
      const cat = getFileCategory(f.name);
      const typeLabel = cat === 'code' ? 'Code File' : (cat === 'pdf' ? 'PDF / Diagram File' : 'Document File');
      const titleEl = codeDetectionBanner.querySelector('.code-detected-banner__title');
      if (titleEl) {
        titleEl.innerHTML = `${typeLabel} Detected: <strong id="detectedCodeFilename">${escapeHtml(f.name + (files.length > 1 ? ` (+${files.length - 1} more)` : ''))}</strong>`;
      }
      codeDetectionBanner.style.display = 'flex';
    } else {
      codeDetectionBanner.style.display = 'none';
    }
  }

  // Populate source code dropdown
  function populateRecordSourceSelect(preferredName) {
    if (!recordSourceSelect) return;
    recordSourceSelect.innerHTML = '';
    const allFiles = getUnifiedAiFiles();

    allFiles.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = `${getAiFileIcon(f.name)} ${f.name} (${formatBytes(f.size || 0)})`;
      if (preferredName && f.name === preferredName) opt.selected = true;
      recordSourceSelect.appendChild(opt);
    });

    // Also offer link text if user entered snippet
    const links = typeof getAllLinks === 'function' ? getAllLinks() : [];
    links.forEach((link, idx) => {
      const opt = document.createElement('option');
      opt.value = `__link_${idx}`;
      opt.textContent = `🔗 Snippet / Text #${idx + 1} (${link.slice(0, 30)}...)`;
      recordSourceSelect.appendChild(opt);
    });

    if (recordSourceSelect.options.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- No file selected. Click "Browse Other" to upload code --';
      recordSourceSelect.appendChild(opt);
    }
  }

  const recordModalAlert = $('#recordModalAlert');
  const recordModalAlertText = $('#recordModalAlertText');
  const recordModalAlertClose = $('#recordModalAlertClose');

  function showRecordModalError(message) {
    if (recordModalAlert && recordModalAlertText) {
      recordModalAlertText.textContent = message;
      recordModalAlert.style.display = 'flex';
      recordModalAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function clearRecordModalError() {
    if (recordModalAlert) {
      recordModalAlert.style.display = 'none';
      if (recordModalAlertText) recordModalAlertText.textContent = '';
    }
  }

  if (recordModalAlertClose) {
    recordModalAlertClose.addEventListener('click', clearRecordModalError);
  }

  // Open modal / side panel
  function openLabRecordModal(preferredFile, targetTab = 'labrecord') {
    clearRecordModalError();
    const prefName = typeof preferredFile === 'string' ? preferredFile : (preferredFile ? preferredFile.name : null);
    populateRecordSourceSelect(prefName);
    if (typeof populateHomeAiFileSelect === 'function') {
      populateHomeAiFileSelect(prefName);
    }
    if (typeof switchHomeAiTab === 'function') {
      switchHomeAiTab(targetTab);
    }
    
    labRecordModal.classList.add('active');
    document.body.classList.add('ai-sidepanel-open');
  }

  function closeLabRecordModal() {
    clearRecordModalError();
    labRecordModal.classList.remove('active');
    document.body.classList.remove('ai-sidepanel-open');
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

  // Section Checkbox Presets
  const SECTION_PRESETS = {
    full: ['aim', 'requirements', 'apparatus', 'description', 'algorithm', 'flowchart', 'procedure', 'program', 'table', 'precautions', 'output', 'result'],
    observation: ['aim', 'algorithm', 'flowchart', 'program', 'output', 'result'],
    theory_code: ['aim', 'description', 'program', 'output'],
    flowchart_table: ['aim', 'algorithm', 'flowchart', 'table', 'output'],
    custom: []
  };

  function updateSelectedCount() {
    const checked = document.querySelectorAll('input[name="labSection"]:checked');
    if (selectedSectionsCount) {
      selectedSectionsCount.textContent = `${checked.length} / 12 selected`;
    }
  }

  let selectedEngine = 'auto';
  let activeSectionSizes = {};
  let lastCodePayload = null;

  function applySectionPreset(presetKey) {
    const checkboxes = document.querySelectorAll('input[name="labSection"]');
    const targetSections = SECTION_PRESETS[presetKey] || [];
    
    if (presetKey !== 'custom') {
      checkboxes.forEach(cb => {
        cb.checked = targetSections.includes(cb.value);
      });
    }

    document.querySelectorAll('#presetContainer .preset-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.preset === presetKey);
    });

    updateSelectedCount();
  }

  // Bind preset chips
  document.querySelectorAll('#presetContainer .preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      applySectionPreset(chip.dataset.preset);
    });
  });

  // Checkbox change listener
  document.querySelectorAll('input[name="labSection"]').forEach(cb => {
    cb.addEventListener('change', () => {
      document.querySelectorAll('#presetContainer .preset-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.preset === 'custom');
      });
      updateSelectedCount();
    });
  });

  // Select All and Clear buttons
  const btnSelectAllSections = document.getElementById('btnSelectAllSections');
  const btnClearSections = document.getElementById('btnClearSections');
  if (btnSelectAllSections) {
    btnSelectAllSections.addEventListener('click', () => {
      applySectionPreset('full');
    });
  }
  if (btnClearSections) {
    btnClearSections.addEventListener('click', () => {
      document.querySelectorAll('input[name="labSection"]').forEach(cb => { cb.checked = false; });
      document.querySelectorAll('#presetContainer .preset-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.preset === 'custom');
      });
      updateSelectedCount();
    });
  }

  // Browse Other Code File button
  if (recordUploadBtn && recordFileInput) {
    recordUploadBtn.addEventListener('click', () => {
      recordFileInput.value = '';
      recordFileInput.click();
    });
    recordFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        let lastCached = null;
        for (const file of files) {
          lastCached = await cacheAiFilePayload(file);
          addUnifiedAiSessionFile(lastCached);
        }
        const file = files[files.length - 1];
        lastCodePayload = lastCached;
        lastHomeVivaDirectFilePayload = lastCached;
        populateRecordSourceSelect(file.name);
        populateHomeAiFileSelect(file.name);
        showToast(`Loaded "${escapeHtml(file.name)}" into AI Assistant.`);
      }
    });
  }

  // Collapsible Lab Record Setup Panel Logic
  const btnToggleRecordConfig = document.getElementById('btnToggleRecordConfig');
  const recordConfigToggleHeader = document.getElementById('recordConfigToggleHeader');
  const recordConfigToggleText = document.getElementById('recordConfigToggleText');
  const btnRunLabRecordCompact = document.getElementById('btnRunLabRecordCompact');
  const recordConfigStatusBadge = document.getElementById('recordConfigStatusBadge');

  function setRecordConfigCollapsed(shouldCollapse) {
    if (!recordConfigView) return;
    if (shouldCollapse) {
      recordConfigView.classList.add('collapsed');
      if (recordConfigToggleText) recordConfigToggleText.textContent = '▼ Expand Setup';
      if (btnRunLabRecordCompact) btnRunLabRecordCompact.style.display = 'inline-flex';
      const checked = document.querySelectorAll('input[name="labSection"]:checked');
      if (recordConfigStatusBadge) recordConfigStatusBadge.textContent = `${checked.length} / 12 Sections`;
    } else {
      recordConfigView.classList.remove('collapsed');
      if (recordConfigToggleText) recordConfigToggleText.textContent = '▲ Collapse Setup';
      if (btnRunLabRecordCompact) btnRunLabRecordCompact.style.display = 'none';
    }
  }

  function toggleRecordConfig() {
    if (!recordConfigView) return;
    const isCurrentlyCollapsed = recordConfigView.classList.contains('collapsed');
    setRecordConfigCollapsed(!isCurrentlyCollapsed);
  }

  if (btnToggleRecordConfig) {
    btnToggleRecordConfig.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRecordConfig();
    });
  }
  if (recordConfigToggleHeader) {
    recordConfigToggleHeader.addEventListener('click', () => {
      toggleRecordConfig();
    });
  }
  if (btnRunLabRecordCompact) {
    btnRunLabRecordCompact.addEventListener('click', (e) => {
      e.stopPropagation();
      runLabRecord();
    });
  }

  // Read code content from File object, cache, or link
  async function getSelectedCodePayload() {
    const selectedVal = recordSourceSelect.value;
    if (!selectedVal) {
      throw new Error('Please select or upload a code file.');
    }

    if (selectedVal.startsWith('__link_')) {
      const idx = parseInt(selectedVal.replace('__link_', ''), 10);
      const links = getAllLinks();
      return {
        codeContent: links[idx] || '',
        content: links[idx] || '',
        filename: 'snippet.txt',
        name: 'snippet.txt'
      };
    }

    const all = [...getUnifiedAiFiles(), ...getAllFiles(), ...externalRecordFiles];
    const fileObj = all.find(f => f && (f.name === selectedVal || f.filename === selectedVal));
    if (!fileObj) {
      throw new Error(`Could not locate file "${selectedVal}".`);
    }

    // If it's already an active cached payload with base64 / content
    if (fileObj.docxBase64 || fileObj.pdfBase64 || fileObj.imageBase64 || (fileObj.content && typeof fileObj.slice !== 'function')) {
      return {
        codeContent: fileObj.codeContent || fileObj.content || '',
        content: fileObj.content || fileObj.codeContent || '',
        filename: fileObj.filename || fileObj.name || selectedVal,
        name: fileObj.name || fileObj.filename || selectedVal,
        pdfBase64: fileObj.pdfBase64 || null,
        imageBase64: fileObj.imageBase64 || null,
        docxBase64: fileObj.docxBase64 || null,
        isDocx: !!fileObj.isDocx,
        mimeType: fileObj.mimeType || null
      };
    }

    const rawFile = fileObj.fileRef || fileObj;
    const fileName = rawFile.name || selectedVal;
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    const isImg = /\.(png|jpe?g|webp)$/i.test(fileName);
    const isDocx = /\.(docx|doc)$/i.test(fileName);

    return new Promise((resolve, reject) => {
      if (isPdf || isImg || isDocx) {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result || '';
          const base64 = (typeof res === 'string' && res.includes(',')) ? res.split(',')[1] : res;
          const mimeType = isPdf ? 'application/pdf' : (isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : (rawFile.type || 'image/png'));
          const placeholder = isDocx ? `[Attached Word Document: ${fileName}]` : (isPdf ? `[Attached Document/Diagram File: ${fileName}]` : `[Attached Diagram Image: ${fileName}]`);
          resolve({
            codeContent: placeholder,
            content: placeholder,
            filename: fileName,
            name: fileName,
            pdfBase64: isPdf ? base64 : null,
            imageBase64: isImg ? base64 : null,
            docxBase64: isDocx ? base64 : null,
            isDocx,
            mimeType
          });
        };
        reader.onerror = () => reject(new Error(`Failed to read file "${fileName}".`));
        reader.readAsDataURL(rawFile);
      } else {
        const reader = new FileReader();
        reader.onload = () => resolve({
          codeContent: reader.result || '',
          content: reader.result || '',
          filename: fileName,
          name: fileName
        });
        reader.onerror = () => reject(new Error(`Failed to read file "${fileName}".`));
        reader.readAsText(rawFile);
      }
    });
  }

  function renderLabRecordReport() {
    if (!labRecordContent || !currentGeneratedRecord) return;
    const data = currentGeneratedRecord;
    const variants = data.sectionVariants || {};
    const titles = data.sectionTitles || {
      aim: '🎯 Aim / Objective',
      requirements: '💻 HW & SW Requirements',
      apparatus: '🔬 Apparatus & Libraries',
      description: '📖 Theory & Description',
      theory: '📖 Theory & Description',
      algorithm: '🔢 Step-by-Step Algorithm',
      flowchart: '📊 Visual Flowchart',
      procedure: '⚙️ Procedure & Commands',
      program: '💻 Source Code (Program)',
      table: '📋 Observation Table',
      precautions: '⚠️ Precautions & Boundary',
      output: '🖥️ Sample Console Output',
      result: '🏁 Result Statement'
    };

    // If variants not present, parse sections from raw markdown so dropdowns are always present
    if (Object.keys(variants).length === 0) {
      const rawMd = data.markdown || '';
      const sectionRegex = /^##\s+([^\n\r]+)/gm;
      let match;
      const matches = [];
      while ((match = sectionRegex.exec(rawMd)) !== null) {
        matches.push({
          title: match[1].trim(),
          startIndex: match.index,
          headerLength: match[0].length
        });
      }

      if (matches.length > 0) {
        let parsedHtml = '';
        for (let i = 0; i < matches.length; i++) {
          const m = matches[i];
          const nextStart = (i + 1 < matches.length) ? matches[i + 1].startIndex : rawMd.length;
          const bodyMd = rawMd.slice(m.startIndex + m.headerLength, nextStart).trim();
          const secKey = `sec_${i}`;
          const currentSize = activeSectionSizes[secKey] || 'standard';

          parsedHtml += `
            <div class="record-section-block" data-section="${secKey}">
              <div class="record-section-header">
                <h2 class="record-section-title">${escapeHtml(m.title)}</h2>
                <div class="section-size-dropdown-wrap no-print">
                  <label class="section-size-label" for="sec_size_${secKey}">Size:</label>
                  <select class="section-size-select" id="sec_size_${secKey}" data-section="${secKey}" aria-label="${escapeHtml(m.title)} size">
                    <option value="brief" ${currentSize === 'brief' ? 'selected' : ''}>Brief</option>
                    <option value="standard" ${currentSize === 'standard' ? 'selected' : ''}>Standard</option>
                    <option value="detailed" ${currentSize === 'detailed' ? 'selected' : ''}>Detailed</option>
                  </select>
                </div>
              </div>
              <div class="record-section-body" id="sec_body_${secKey}">
                ${window.marked ? window.marked.parse(bodyMd) : escapeHtml(bodyMd)}
              </div>
            </div>
          `;
        }
        labRecordContent.innerHTML = parsedHtml;
        return;
      }

      if (window.marked) {
        labRecordContent.innerHTML = window.marked.parse(data.markdown);
      } else {
        labRecordContent.textContent = data.markdown;
      }
      return;
    }

    const sections = (data.selectedSections && data.selectedSections.length > 0)
      ? data.selectedSections
      : Object.keys(variants);

    let html = '';
    sections.forEach(secKey => {
      if (secKey === 'flowchart') return; // Handled in dedicated SVG flowchart box
      const title = titles[secKey] || secKey.toUpperCase();
      const currentSize = activeSectionSizes[secKey] || 'standard';
      activeSectionSizes[secKey] = currentSize;

      const secMd = (variants[secKey] && variants[secKey][currentSize])
        ? variants[secKey][currentSize]
        : (variants[secKey]?.standard || '');
      const parsed = window.marked ? window.marked.parse(secMd) : escapeHtml(secMd);

      html += `
        <div class="record-section-block" data-section="${escapeHtml(secKey)}">
          <div class="record-section-header">
            <h2 class="record-section-title">${title}</h2>
            <div class="section-size-dropdown-wrap no-print">
              <label class="section-size-label" for="sec_size_${escapeHtml(secKey)}">Size:</label>
              <select class="section-size-select" id="sec_size_${escapeHtml(secKey)}" data-section="${escapeHtml(secKey)}" aria-label="${escapeHtml(title)} size">
                <option value="brief" ${currentSize === 'brief' ? 'selected' : ''}>Brief</option>
                <option value="standard" ${currentSize === 'standard' ? 'selected' : ''}>Standard</option>
                <option value="detailed" ${currentSize === 'detailed' ? 'selected' : ''}>Detailed</option>
              </select>
            </div>
          </div>
          <div class="record-section-body" id="sec_body_${escapeHtml(secKey)}">
            ${parsed}
          </div>
        </div>
      `;
    });

    labRecordContent.innerHTML = html;

    // Attach change listener for each section size dropdown
    labRecordContent.querySelectorAll('.section-size-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const sec = e.target.dataset.section;
        const newSize = e.target.value;
        activeSectionSizes[sec] = newSize;

        const newMd = variants[sec]?.[newSize] || variants[sec]?.standard || '';
        const bodyEl = document.getElementById(`sec_body_${sec}`);
        if (bodyEl) {
          bodyEl.innerHTML = window.marked ? window.marked.parse(newMd) : escapeHtml(newMd);
        }
      });
    });
  }

  function getCurrentRecordMarkdown() {
    if (!currentGeneratedRecord) return '';
    const data = currentGeneratedRecord;
    const variants = data.sectionVariants;
    if (!variants || Object.keys(variants).length === 0) {
      let md = data.markdown || '';
      if (data.mermaidCode && !md.includes(data.mermaidCode)) {
        md += `\n\n## 📊 Visual Flowchart / Diagram\n\`\`\`mermaid\n${data.mermaidCode}\n\`\`\`\n`;
      }
      return md;
    }

    const titles = data.sectionTitles || {};
    const sections = (data.selectedSections && data.selectedSections.length > 0)
      ? data.selectedSections
      : Object.keys(variants);

    const parts = [];
    parts.push(`# 📄 LABORATORY OBSERVATION & RECORD`);
    if (data.filename) parts.push(`**Source Code File:** ${data.filename}\n`);

    sections.forEach(secKey => {
      const title = titles[secKey] || secKey.toUpperCase();
      const sz = activeSectionSizes[secKey] || 'standard';
      const secMd = variants[secKey]?.[sz] || variants[secKey]?.standard || '';
      parts.push(`## ${title}\n${secMd}\n`);
    });

    // Ensure Mermaid diagram / flowchart code is explicitly included for AI chat analysis
    if (data.mermaidCode && !parts.some(p => p.includes(data.mermaidCode))) {
      parts.push(`## 📊 Visual Flowchart / Architecture Diagram\n\`\`\`mermaid\n${data.mermaidCode}\n\`\`\`\n`);
    }

    return parts.join('\n');
  }

  async function runLabRecord(isReRun = false) {
    const isRealReRun = typeof isReRun === 'boolean' && isReRun;
    clearRecordModalError();
    const checkedBoxes = Array.from(document.querySelectorAll('input[name="labSection"]:checked')).map(cb => cb.value);
    if (checkedBoxes.length === 0) {
      showRecordModalError('Please select at least one section to include in your Lab Record.');
      return;
    }

    let payloadData;
    if (isRealReRun && lastCodePayload) {
      payloadData = lastCodePayload;
    } else {
      try {
        payloadData = await getSelectedCodePayload();
        lastCodePayload = payloadData;
      } catch (err) {
        showRecordModalError(err.message || 'Please select or upload a code file.');
        if (recordSourceSelect) {
          recordSourceSelect.focus();
          recordSourceSelect.style.borderColor = '#ef4444';
          setTimeout(() => { if (recordSourceSelect) recordSourceSelect.style.borderColor = ''; }, 2000);
        }
        return;
      }
    }

    const studentDetails = {
      expNo: (recExpNo ? recExpNo.value.trim() : '') || '1',
      subject: (recSubject ? recSubject.value.trim() : '') || 'Practical Lab',
      studentName: (recStudentName ? recStudentName.value.trim() : '') || '',
      rollNo: (recRollNo ? recRollNo.value.trim() : '') || '',
      date: new Date().toLocaleDateString('en-GB')
    };

    let recordLoadingTimer = null;
    const loadingStatusMessages = [
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

    function startRecordLoadingMessages() {
      stopRecordLoadingMessages();
      const dynamicMsgEl = document.getElementById('loadingDynamicMsg');
      if (!dynamicMsgEl) return;
      let idx = 0;
      dynamicMsgEl.innerHTML = loadingStatusMessages[0];
      recordLoadingTimer = setInterval(() => {
        idx = (idx + 1) % loadingStatusMessages.length;
        if (dynamicMsgEl) {
          dynamicMsgEl.style.opacity = '0.3';
          setTimeout(() => {
            dynamicMsgEl.innerHTML = loadingStatusMessages[idx];
            dynamicMsgEl.style.opacity = '1';
          }, 200);
        }
      }, 2600);
    }

    function stopRecordLoadingMessages() {
      if (recordLoadingTimer) {
        clearInterval(recordLoadingTimer);
        recordLoadingTimer = null;
      }
    }

    if (isRealReRun) {
      if (labRecordContent) labRecordContent.style.opacity = '0.5';
    } else {
      recordConfigView.style.display = 'none';
      recordResultView.style.display = 'none';
      recordLoadingState.style.display = 'block';
      startRecordLoadingMessages();
    }

    try {
      const res = await fetch('/api/ai/lab-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codeContent: payloadData.codeContent || payloadData.content || '',
          filename: payloadData.filename || payloadData.name || 'program',
          selectedSections: checkedBoxes,
          studentDetails,
          engine: selectedEngine,
          pdfBase64: payloadData.pdfBase64 || null,
          imageBase64: payloadData.imageBase64 || null,
          docxBase64: payloadData.docxBase64 || null,
          mimeType: payloadData.mimeType || null
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate Lab Record.');
      }

      currentGeneratedRecord = data;

      // Populate student header on the print sheet
      if (labRecordHeaderInfo) {
        let metaHtml = `
          <div class="lab-sheet-header__grid">
            <div class="lab-sheet-header__item"><strong>EXPERIMENT NO:</strong> ${escapeHtml(studentDetails.expNo)}</div>
            <div class="lab-sheet-header__item"><strong>SUBJECT / LAB:</strong> ${escapeHtml(studentDetails.subject)}</div>
            <div class="lab-sheet-header__item"><strong>DATE:</strong> ${escapeHtml(studentDetails.date)}</div>
            <div class="lab-sheet-header__item"><strong>SOURCE FILE:</strong> ${escapeHtml(payloadData.filename)}</div>
        `;
        if (studentDetails.studentName || studentDetails.rollNo) {
          metaHtml += `
            <div class="lab-sheet-header__item"><strong>STUDENT NAME:</strong> ${escapeHtml(studentDetails.studentName || '—')}</div>
            <div class="lab-sheet-header__item"><strong>ROLL / REG NO:</strong> ${escapeHtml(studentDetails.rollNo || '—')}</div>
          `;
        }
        metaHtml += `</div>`;
        labRecordHeaderInfo.innerHTML = metaHtml;
      }

      // Render Markdown sections with per-section size dropdowns
      renderLabRecordReport();
      if (labRecordContent) labRecordContent.style.opacity = '1';

      // Render Flowchart SVG if available (Lazy-load Mermaid on demand to keep initial load lightweight)
      if (data.mermaidCode && labRecordMermaidSvg) {
        try {
          if (!window.mermaid) {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
              script.onload = () => resolve();
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
          window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
          const graphId = 'recordMermaid_' + Date.now();
          const renderResult = await window.mermaid.render(graphId, data.mermaidCode);
          labRecordMermaidSvg.innerHTML = renderResult.svg;
          labRecordMermaidArea.style.display = 'block';
        } catch (mermaidErr) {
          console.warn('[LabDrop] Mermaid render error:', mermaidErr);
          labRecordMermaidArea.style.display = 'none';
        }
      } else {
        labRecordMermaidArea.style.display = 'none';
      }

      stopRecordLoadingMessages();
      recordLoadingState.style.display = 'none';
      recordResultView.style.display = 'block';
      if (!isReRun) {
        recordResultView.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // Initialize chatbot with context from generated record
      const chatMsgContainer = document.getElementById('labRecordChatMessages');
      if (chatMsgContainer) {
        chatMsgContainer.style.display = 'flex';
        // Clear previous messages
        chatMsgContainer.innerHTML = '';
        const notice = document.createElement('div');
        notice.className = 'ai-chat-bot-bubble';
        notice.innerHTML = '<strong>✅ Lab Record generated!</strong> Ask me anything — expand theory, simplify algorithm, add test cases, or explain any section.';
        chatMsgContainer.appendChild(notice);
      }
      labRecordConversationHistory = [
        { role: 'model', content: getCurrentRecordMarkdown() }
      ];

    } catch (err) {
      stopRecordLoadingMessages();
      if (labRecordContent) labRecordContent.style.opacity = '1';
      recordLoadingState.style.display = 'none';
      if (!isReRun) {
        recordConfigView.style.display = 'block';
      }
      showRecordModalError(err.message || 'Lab Record generation failed.');
    }
  }

  if (btnRunLabRecord) btnRunLabRecord.addEventListener('click', () => runLabRecord(false));

  // Trigger buttons
  if (btnTriggerLabRecord) btnTriggerLabRecord.addEventListener('click', () => openLabRecordModal());
  if (navLabRecordBtn) navLabRecordBtn.addEventListener('click', () => openLabRecordModal());
  if (navLabRecordBtnLoggedIn) navLabRecordBtnLoggedIn.addEventListener('click', () => openLabRecordModal());
  if (mobileRecordBtn) mobileRecordBtn.addEventListener('click', () => openLabRecordModal());
  const aiFloatingBtn = document.getElementById('aiFloatingBtn');
  if (aiFloatingBtn) {
    aiFloatingBtn.addEventListener('click', () => {
      if (labRecordModal.classList.contains('active')) {
        closeLabRecordModal();
      } else {
        openLabRecordModal();
      }
    });
  }
  if (labRecordModalClose) labRecordModalClose.addEventListener('click', closeLabRecordModal);

  // Close sidepanel on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && labRecordModal.classList.contains('active')) {
      closeLabRecordModal();
    }
  });

  // Desktop Side Panel Left-Edge Resize Handler
  (function initDesktopSidepanelResize() {
    const dialog = document.getElementById('labRecordModalDialog');
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

  // Print / Save as PDF
  if (btnPrintRecord) {
    btnPrintRecord.addEventListener('click', () => {
      window.print();
    });
  }

  // Copy Markdown
  if (btnCopyRecordMd) {
    btnCopyRecordMd.addEventListener('click', async () => {
      if (!currentGeneratedRecord) return;
      try {
        const md = getCurrentRecordMarkdown();
        await navigator.clipboard.writeText(md);
        const originalText = btnCopyRecordMd.textContent;
        btnCopyRecordMd.textContent = '✅ Copied!';
        setTimeout(() => btnCopyRecordMd.textContent = originalText, 2000);
      } catch (e) {
        showRecordModalError('Could not copy to clipboard.');
      }
    });
  }

  // Copy Rich Text (for Microsoft Word & Google Docs)
  if (btnCopyRecordRich) {
    btnCopyRecordRich.addEventListener('click', async () => {
      if (!labRecordSheet) return;
      try {
        const html = labRecordSheet.innerHTML;
        const text = labRecordSheet.innerText;
        if (navigator.clipboard && window.ClipboardItem) {
          const blobHtml = new Blob([html], { type: 'text/html' });
          const blobText = new Blob([text], { type: 'text/plain' });
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': blobHtml,
              'text/plain': blobText
            })
          ]);
          const originalText = btnCopyRecordRich.textContent;
          btnCopyRecordRich.textContent = '✅ Copied for Word!';
          setTimeout(() => btnCopyRecordRich.textContent = originalText, 2000);
        } else {
          await navigator.clipboard.writeText(text);
          showToast('Copied as plain text.');
        }
      } catch (e) {
        showRecordModalError('Could not copy rich text.');
      }
    });
  }

  // Download Markdown file
  if (btnDownloadRecordMd) {
    btnDownloadRecordMd.addEventListener('click', () => {
      if (!currentGeneratedRecord) return;
      const baseName = (currentGeneratedRecord.filename || 'program').replace(/\.[^/.]+$/, '');
      const md = getCurrentRecordMarkdown();
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_Lab_Record.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Re-adjust sections
  if (btnReconfigureRecord) {
    btnReconfigureRecord.addEventListener('click', () => {
      recordResultView.style.display = 'none';
      recordConfigView.style.display = 'block';
      setRecordConfigCollapsed(false);
    });
  }

  // Report Sizing & Customization Controls
  let currentReportScale = 1.0;
  let currentChartScale = '80%';
  let currentTableDensity = 'normal';
  let isEditingReport = false;

  const btnScaleDown = $('#btnScaleDown');
  const btnScaleUp = $('#btnScaleUp');
  const scaleValueDisplay = $('#scaleValueDisplay');
  const btnToggleEditSheet = $('#btnToggleEditSheet');

  function applyReportScale(scale) {
    currentReportScale = Math.min(1.35, Math.max(0.70, Math.round(scale * 100) / 100));
    if (labRecordSheet) {
      labRecordSheet.style.setProperty('--sheet-scale', currentReportScale);
    }
    if (scaleValueDisplay) {
      scaleValueDisplay.textContent = `${Math.round(currentReportScale * 100)}%`;
    }
    document.querySelectorAll('.size-preset-btn').forEach(btn => {
      const btnScale = parseFloat(btn.dataset.scale);
      btn.classList.toggle('active', Math.abs(btnScale - currentReportScale) < 0.03);
    });
  }

  function applyChartScale(widthStr) {
    currentChartScale = widthStr;
    if (labRecordSheet) {
      labRecordSheet.style.setProperty('--flowchart-width', widthStr);
    }
    document.querySelectorAll('.chart-size-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.chartSize === widthStr);
    });
  }

  function applyTableDensity(density) {
    currentTableDensity = density;
    if (labRecordSheet) {
      if (density === 'compact') {
        labRecordSheet.style.setProperty('--table-padding', '4px 8px');
        labRecordSheet.style.setProperty('--table-font-size', '0.82rem');
      } else {
        labRecordSheet.style.setProperty('--table-padding', '8px 12px');
        labRecordSheet.style.setProperty('--table-font-size', '0.88rem');
      }
    }
    document.querySelectorAll('.table-density-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.density === density);
    });
  }

  function toggleEditSheet() {
    isEditingReport = !isEditingReport;
    if (labRecordContent) {
      labRecordContent.contentEditable = isEditingReport ? 'true' : 'false';
    }
    if (labRecordHeaderInfo) {
      labRecordHeaderInfo.contentEditable = isEditingReport ? 'true' : 'false';
    }
    if (labRecordSheet) {
      labRecordSheet.classList.toggle('is-editing', isEditingReport);
    }
    if (btnToggleEditSheet) {
      btnToggleEditSheet.textContent = isEditingReport ? '💾 Finish Editing' : '✏️ Edit Content';
      btnToggleEditSheet.classList.toggle('active', isEditingReport);
    }
    if (isEditingReport) {
      showToast('Click anywhere on the report to type, edit, or adjust text.');
    }
  }

  if (btnScaleDown) {
    btnScaleDown.addEventListener('click', () => applyReportScale(currentReportScale - 0.05));
  }
  if (btnScaleUp) {
    btnScaleUp.addEventListener('click', () => applyReportScale(currentReportScale + 0.05));
  }

  document.querySelectorAll('.size-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyReportScale(parseFloat(btn.dataset.scale)));
  });

  document.querySelectorAll('.chart-size-btn').forEach(btn => {
    btn.addEventListener('click', () => applyChartScale(btn.dataset.chartSize));
  });

  document.querySelectorAll('.table-density-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTableDensity(btn.dataset.density));
  });

  if (btnToggleEditSheet) {
    btnToggleEditSheet.addEventListener('click', toggleEditSheet);
  }

  // Pre-configuration scale group
  document.querySelectorAll('#configScaleGroup button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#configScaleGroup button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyReportScale(parseFloat(btn.dataset.configScale));
    });
  });


  // ============================================================
  // Lab Record Chatbot (Homepage Modal)
  // ============================================================
  const labRecordChatMessages = document.getElementById('labRecordChatMessages');
  const labRecordChatForm = document.getElementById('labRecordChatForm');
  const labRecordChatInput = document.getElementById('labRecordChatInput');
  if (labRecordChatInput) {
    labRecordChatInput.setAttribute('autocomplete', 'off');
    labRecordChatInput.setAttribute('autocorrect', 'off');
    labRecordChatInput.setAttribute('autocapitalize', 'off');
    labRecordChatInput.setAttribute('spellcheck', 'false');
    labRecordChatInput.setAttribute('data-lpignore', 'true');
  }
  const labRecordChatSubmitBtn = document.getElementById('labRecordChatSubmitBtn');
  let labRecordConversationHistory = [];

  async function sendLabRecordChatMessage(customPrompt = null) {
    const text = (customPrompt || (labRecordChatInput ? labRecordChatInput.value : '')).trim();
    if (!text) return;
    if (labRecordChatInput) labRecordChatInput.value = '';

    // Auto-collapse setup panel to provide maximum chat room
    setRecordConfigCollapsed(true);

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
      if (!lastCodePayload && recordSourceSelect && recordSourceSelect.value) {
        try {
          lastCodePayload = await getSelectedCodePayload();
        } catch (_) {}
      }

      const currentMarkdown = currentGeneratedRecord ? getCurrentRecordMarkdown() : '';

      const directFilesPayload = lastCodePayload ? [{
        name: lastCodePayload.filename || lastCodePayload.name || 'file',
        content: lastCodePayload.codeContent || lastCodePayload.content || '',
        pdfBase64: lastCodePayload.pdfBase64 || null,
        imageBase64: lastCodePayload.imageBase64 || null,
        docxBase64: lastCodePayload.docxBase64 || null,
        isDocx: !!lastCodePayload.isDocx,
        mimeType: lastCodePayload.mimeType || null
      }] : [];

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          prompt: text,
          conversationHistory: labRecordConversationHistory,
          previousOutput: currentMarkdown,
          directFiles: directFilesPayload
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Chat failed.');

      const cleanedResult = stripAiAdsClient(data.result);
      labRecordConversationHistory.push({ role: 'user', content: text });
      labRecordConversationHistory.push({ role: 'model', content: cleanedResult });

      if (window.marked) {
        botMsg.innerHTML = window.marked.parse(cleanedResult);
      } else {
        botMsg.textContent = cleanedResult;
      }
    } catch (err) {
      botMsg.innerHTML = `<span style="color: #ef4444;">Error: ${escapeHtml(err.message)}</span>`;
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
  document.querySelectorAll('.lab-record-chip-home').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      if (prompt) {
        if (labRecordChatInput) labRecordChatInput.value = prompt;
        sendLabRecordChatMessage(prompt);
      }
    });
  });

  // ============================================================
  // Tab Switching Logic (Homepage AI Modal)
  // ============================================================
  const homeTabBtnLabRecord = document.getElementById('homeTabBtnLabRecord');
  const homeTabBtnViva = document.getElementById('homeTabBtnViva');
  const homeTabContentLabRecord = document.getElementById('homeTabContentLabRecord');
  const homeTabContentViva = document.getElementById('homeTabContentViva');

  function switchHomeAiTab(tabName) {
    if (tabName === 'labrecord') {
      if (homeTabBtnLabRecord) homeTabBtnLabRecord.classList.add('active');
      if (homeTabBtnViva) homeTabBtnViva.classList.remove('active');
      if (homeTabContentLabRecord) homeTabContentLabRecord.classList.add('active');
      if (homeTabContentViva) homeTabContentViva.classList.remove('active');
      const activeName = lastHomeVivaDirectFilePayload ? lastHomeVivaDirectFilePayload.name : null;
      populateRecordSourceSelect(activeName);
    } else {
      if (homeTabBtnViva) homeTabBtnViva.classList.add('active');
      if (homeTabBtnLabRecord) homeTabBtnLabRecord.classList.remove('active');
      if (homeTabContentViva) homeTabContentViva.classList.add('active');
      if (homeTabContentLabRecord) homeTabContentLabRecord.classList.remove('active');
      const activeName = (recordSourceSelect && recordSourceSelect.value && !recordSourceSelect.value.startsWith('__link_'))
        ? recordSourceSelect.value
        : (lastCodePayload ? (lastCodePayload.name || lastCodePayload.filename) : null);
      populateHomeAiFileSelect(activeName);
    }
  }

  if (homeTabBtnLabRecord) homeTabBtnLabRecord.addEventListener('click', () => switchHomeAiTab('labrecord'));
  if (homeTabBtnViva) homeTabBtnViva.addEventListener('click', () => switchHomeAiTab('viva'));

  // ============================================================
  // Homepage AI Modal: Viva & Exam Prep Tab
  // ============================================================
  const homeAiFileSelect = document.getElementById('homeAiFileSelect');
  const homeAiDirectFileInput = document.getElementById('homeAiDirectFileInput');
  const homeAiExamType = document.getElementById('homeAiExamType');
  const homeAiSecondaryLabel = document.getElementById('homeAiSecondaryLabel');
  const homeAiSecondaryOption = document.getElementById('homeAiSecondaryOption');
  const homeAiCustomLines = document.getElementById('homeAiCustomLines');
  const homeBtnRunViva = document.getElementById('homeBtnRunViva');
  const homeAiLoadingSpinner = document.getElementById('homeAiLoadingSpinner');
  const homeAiLoadingTitle = document.getElementById('homeAiLoadingTitle');
  const homeAiLoadingDynamicMsg = document.getElementById('homeAiLoadingDynamicMsg');
  const homeVivaResult = document.getElementById('homeVivaResult');
  const homeVivaBadge = document.getElementById('homeVivaBadge');
  const homeBtnRegenViva = document.getElementById('homeBtnRegenViva');
  const homeBtnCopyViva = document.getElementById('homeBtnCopyViva');
  const homeVivaOutput = document.getElementById('homeVivaOutput');
  const homeVivaChatMessages = document.getElementById('homeVivaChatMessages');
  const homeVivaChatForm = document.getElementById('homeVivaChatForm');
  const homeVivaChatInput = document.getElementById('homeVivaChatInput');
  if (homeVivaChatInput) {
    homeVivaChatInput.setAttribute('autocomplete', 'off');
    homeVivaChatInput.setAttribute('autocorrect', 'off');
    homeVivaChatInput.setAttribute('autocapitalize', 'off');
    homeVivaChatInput.setAttribute('spellcheck', 'false');
    homeVivaChatInput.setAttribute('data-lpignore', 'true');
  }
  const homeVivaChatSubmitBtn = document.getElementById('homeVivaChatSubmitBtn');
  let lastHomeVivaDirectFilePayload = null;

  // Collapsible Viva Config Panel Logic
  const homeVivaConfigPanel = document.getElementById('homeVivaConfigPanel');
  const homeVivaConfigHeader = document.getElementById('homeVivaConfigHeader');
  const homeVivaConfigToggleText = document.getElementById('homeVivaConfigToggleText');
  const btnToggleVivaConfig = document.getElementById('btnToggleVivaConfig');
  const btnRunVivaCompact = document.getElementById('btnRunVivaCompact');
  const homeVivaConfigBadge = document.getElementById('homeVivaConfigBadge');

  function setHomeVivaConfigCollapsed(shouldCollapse) {
    if (!homeVivaConfigPanel) return;
    if (shouldCollapse) {
      homeVivaConfigPanel.classList.add('collapsed');
      if (homeVivaConfigToggleText) homeVivaConfigToggleText.textContent = '▼ Expand Setup';
      if (btnRunVivaCompact) btnRunVivaCompact.style.display = 'inline-flex';
      const examVal = homeAiExamType ? homeAiExamType.value : 'viva';
      const secVal = homeAiSecondaryOption ? homeAiSecondaryOption.value : 'medium';
      if (homeVivaConfigBadge) homeVivaConfigBadge.textContent = `${examVal.toUpperCase()} · ${secVal.toUpperCase()}`;
    } else {
      homeVivaConfigPanel.classList.remove('collapsed');
      if (homeVivaConfigToggleText) homeVivaConfigToggleText.textContent = '▲ Collapse Setup';
      if (btnRunVivaCompact) btnRunVivaCompact.style.display = 'none';
    }
  }

  function toggleHomeVivaConfig() {
    if (!homeVivaConfigPanel) return;
    const isCurrentlyCollapsed = homeVivaConfigPanel.classList.contains('collapsed');
    setHomeVivaConfigCollapsed(!isCurrentlyCollapsed);
  }

  if (btnToggleVivaConfig) {
    btnToggleVivaConfig.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHomeVivaConfig();
    });
  }
  if (homeVivaConfigHeader) {
    homeVivaConfigHeader.addEventListener('click', () => {
      toggleHomeVivaConfig();
    });
  }
  if (btnRunVivaCompact) {
    btnRunVivaCompact.addEventListener('click', (e) => {
      e.stopPropagation();
      runHomeViva();
    });
  }

  let homeDirectVivaFiles = [];
  let lastGeneratedHomeVivaOutput = null;
  let homeVivaConversationHistory = [];
  let homeAiLoadingTimer = null;

  const homeAiLoadingQuotes = [
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

  function startHomeAiLoadingMessages(isSummarize = false) {
    stopHomeAiLoadingMessages();
    if (homeAiLoadingTitle) {
      homeAiLoadingTitle.textContent = isSummarize ? 'Summarizing Document & Diagrams...' : 'Synthesizing Exam & Viva Prep...';
    }
    if (!homeAiLoadingDynamicMsg) return;
    let idx = 0;
    homeAiLoadingDynamicMsg.innerHTML = homeAiLoadingQuotes[0];
    homeAiLoadingTimer = setInterval(() => {
      idx = (idx + 1) % homeAiLoadingQuotes.length;
      if (homeAiLoadingDynamicMsg) {
        homeAiLoadingDynamicMsg.style.opacity = '0.3';
        setTimeout(() => {
          homeAiLoadingDynamicMsg.innerHTML = homeAiLoadingQuotes[idx];
          homeAiLoadingDynamicMsg.style.opacity = '1';
        }, 200);
      }
    }, 2600);
  }

  function stopHomeAiLoadingMessages() {
    if (homeAiLoadingTimer) {
      clearInterval(homeAiLoadingTimer);
      homeAiLoadingTimer = null;
    }
  }

  const btnHomeAiUpload = document.getElementById('btnHomeAiUpload');
  if (btnHomeAiUpload && homeAiDirectFileInput) {
    btnHomeAiUpload.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      homeAiDirectFileInput.value = '';
      homeAiDirectFileInput.click();
    });
  }

  function populateHomeAiFileSelect(preferredName = null) {
    if (!homeAiFileSelect) return;
    const previousVal = homeAiFileSelect.value;
    homeAiFileSelect.innerHTML = '';

    const allFiles = getUnifiedAiFiles();
    if (allFiles.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '📂 No files queued yet — Click ➕ Upload';
      homeAiFileSelect.appendChild(opt);
      return;
    }

    let selectedIndex = -1;
    allFiles.forEach((file, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      opt.textContent = `${getAiFileIcon(file.name)} ${file.name} (${formatBytes(file.size || 0)})`;
      if (preferredName && file.name === preferredName) {
        opt.selected = true;
        selectedIndex = index;
      }
      homeAiFileSelect.appendChild(opt);
    });

    if (selectedIndex === -1) {
      const prevIdx = parseInt(previousVal, 10);
      if (!isNaN(prevIdx) && prevIdx >= 0 && prevIdx < allFiles.length) {
        homeAiFileSelect.selectedIndex = prevIdx;
        selectedIndex = prevIdx;
      } else {
        homeAiFileSelect.selectedIndex = 0;
        selectedIndex = 0;
      }
    }

    const currentTarget = allFiles[selectedIndex];
    if (currentTarget) {
      cacheAiFilePayload(currentTarget.fileRef || currentTarget).then(p => {
        lastHomeVivaDirectFilePayload = p;
        lastCodePayload = p;
      }).catch(() => {});
    }
  }

  if (homeAiFileSelect) {
    homeAiFileSelect.addEventListener('change', async () => {
      const allFiles = getUnifiedAiFiles();
      const selectedIdx = parseInt(homeAiFileSelect.value, 10);
      const target = allFiles[selectedIdx];
      if (target) {
        const payload = await cacheAiFilePayload(target.fileRef || target);
        lastHomeVivaDirectFilePayload = payload;
        lastCodePayload = payload;
      }
    });
  }

  if (homeAiDirectFileInput) {
    homeAiDirectFileInput.addEventListener('click', () => {
      homeAiDirectFileInput.value = '';
    });

    homeAiDirectFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        let lastCached = null;
        for (const file of files) {
          lastCached = await cacheAiFilePayload(file);
          addUnifiedAiSessionFile(lastCached);
        }
        const file = files[files.length - 1];
        lastHomeVivaDirectFilePayload = lastCached;
        lastCodePayload = lastCached;
        populateHomeAiFileSelect(file.name);
        populateRecordSourceSelect(file.name);
        showToast(`Loaded "${escapeHtml(file.name)}" into AI Assistant.`);
      }
    });
  }

  function updateHomeAiSecondaryDropdown(action) {
    if (!homeAiSecondaryOption || !homeAiSecondaryLabel) return;
    if (action === 'summarize') {
      homeAiSecondaryLabel.textContent = 'Summary Length:';
      homeAiSecondaryOption.innerHTML = `
        <option value="brief">⚡ Brief (8 Lines - Fast Review)</option>
        <option value="standard" selected>📄 Standard (25 Lines - Balanced)</option>
        <option value="detailed">📚 Detailed (60 Lines - In-Depth)</option>
        <option value="custom">✏️ Custom Exact Lines</option>
      `;
      if (homeAiCustomLines) homeAiCustomLines.style.display = 'none';
    } else {
      homeAiSecondaryLabel.textContent = 'Difficulty Level:';
      homeAiSecondaryOption.innerHTML = `
        <option value="easy">🟢 Easy (Fundamentals)</option>
        <option value="medium" selected>🟡 Medium (Lab Standard)</option>
        <option value="hard">🔴 Hard (Advanced Traps)</option>
        <option value="extreme">🔥 Extreme (Compiler & Internals)</option>
      `;
      if (homeAiCustomLines) homeAiCustomLines.style.display = 'none';
    }
  }

  if (homeAiExamType) {
    homeAiExamType.addEventListener('change', () => {
      updateHomeAiSecondaryDropdown(homeAiExamType.value);
    });
  }

  if (homeAiSecondaryOption) {
    homeAiSecondaryOption.addEventListener('change', () => {
      if (homeAiExamType && homeAiExamType.value === 'summarize' && homeAiSecondaryOption.value === 'custom') {
        if (homeAiCustomLines) homeAiCustomLines.style.display = 'inline-block';
      } else {
        if (homeAiCustomLines) homeAiCustomLines.style.display = 'none';
      }
    });
  }

  async function runHomeViva() {
    const allFiles = getUnifiedAiFiles();
    const selectedIdx = homeAiFileSelect ? parseInt(homeAiFileSelect.value, 10) : 0;
    const targetFile = allFiles[selectedIdx] || allFiles[0];

    if (!targetFile) {
      alert('Please upload or select a file to prepare for viva or exam questions.');
      return;
    }

    const examType = homeAiExamType ? homeAiExamType.value : 'viva';
    const isSummarize = examType === 'summarize';
    const secondaryVal = homeAiSecondaryOption ? homeAiSecondaryOption.value : 'medium';
    const customLinesVal = homeAiCustomLines ? parseInt(homeAiCustomLines.value, 10) : 15;

    // Use or build cached payload
    let directFilePayload = lastHomeVivaDirectFilePayload;
    if (!directFilePayload || directFilePayload.name !== targetFile.name) {
      try {
        directFilePayload = await cacheAiFilePayload(targetFile.fileRef || targetFile);
      } catch (err) {
        alert('Could not read the selected file: ' + err.message);
        return;
      }
    }

    lastHomeVivaDirectFilePayload = directFilePayload;
    lastCodePayload = directFilePayload;

    // Show loading
    if (homeAiLoadingSpinner) homeAiLoadingSpinner.style.display = 'block';
    if (homeVivaResult) homeVivaResult.style.display = 'none';
    if (homeBtnRunViva) homeBtnRunViva.disabled = true;
    startHomeAiLoadingMessages(isSummarize);

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'viva',
          examType: examType,
          difficulty: !isSummarize ? secondaryVal : 'medium',
          lengthType: isSummarize ? secondaryVal : 'medium',
          customLines: customLinesVal,
          directFiles: [directFilePayload]
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to generate prep.');

      const cleanedViva = stripAiAdsClient(data.result);
      lastGeneratedHomeVivaOutput = cleanedViva;

      if (homeVivaOutput) {
        if (window.marked) {
          homeVivaOutput.innerHTML = window.marked.parse(cleanedViva);
        } else {
          homeVivaOutput.textContent = cleanedViva;
        }
      }

      if (homeVivaBadge) {
        const modeLabels = {
          viva: 'Oral Lab Viva',
          internal_20: '20 Marks Internal',
          semester_100: '100 Marks Semester',
          rapid_fire: 'Rapid-Fire Flashcards',
          summarize: 'Summary'
        };
        homeVivaBadge.textContent = `${modeLabels[examType] || 'Exam Prep'} · ${secondaryVal.toUpperCase()}`;
      }

      if (homeVivaResult) {
        homeVivaResult.style.display = 'block';
        homeVivaResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // Initialize chat context
      homeVivaConversationHistory = [
        { role: 'user', content: `Please analyze ${targetFile.name} and provide ${examType} preparation.` },
        { role: 'model', content: data.result }
      ];

      if (homeVivaChatMessages) {
        homeVivaChatMessages.style.display = 'flex';
        homeVivaChatMessages.innerHTML = '';
        const botNotice = document.createElement('div');
        botNotice.className = 'ai-chat-bot-bubble';
        botNotice.style.background = 'rgba(79, 70, 229, 0.06)';
        botNotice.style.borderColor = 'rgba(79, 70, 229, 0.2)';
        botNotice.innerHTML = `<strong>🎓 Exam & Viva Prep Generated!</strong><br/>You can now chat with LabDrop AI to ask follow-up questions, request deeper explanations, or prepare customized answers.`;
        homeVivaChatMessages.appendChild(botNotice);
      }

    } catch (err) {
      if (homeVivaResult && homeVivaOutput) {
        homeVivaOutput.innerHTML = `<span style="color: #ef4444; font-weight: 600;">Error: ${escapeHtml(err.message)}</span>`;
        homeVivaResult.style.display = 'block';
      } else {
        alert(err.message || 'Generation failed.');
      }
    } finally {
      stopHomeAiLoadingMessages();
      if (homeAiLoadingSpinner) homeAiLoadingSpinner.style.display = 'none';
      if (homeBtnRunViva) homeBtnRunViva.disabled = false;
    }
  }

  if (homeBtnRunViva) homeBtnRunViva.addEventListener('click', runHomeViva);
  if (homeBtnRegenViva) homeBtnRegenViva.addEventListener('click', runHomeViva);

  if (homeBtnCopyViva) {
    homeBtnCopyViva.addEventListener('click', async () => {
      if (!lastGeneratedHomeVivaOutput) return;
      try {
        await navigator.clipboard.writeText(lastGeneratedHomeVivaOutput);
        const originalText = homeBtnCopyViva.textContent;
        homeBtnCopyViva.textContent = '✅ Copied!';
        setTimeout(() => homeBtnCopyViva.textContent = originalText, 2000);
      } catch (e) {
        alert('Could not copy to clipboard.');
      }
    });
  }

  // Viva Chatbot
  async function sendHomeVivaChatMessage(customPrompt = null) {
    const text = (customPrompt || (homeVivaChatInput ? homeVivaChatInput.value : '')).trim();
    if (!text) return;
    if (homeVivaChatInput) homeVivaChatInput.value = '';

    // Auto-collapse setup panel to provide maximum chat room
    setHomeVivaConfigCollapsed(true);

    if (homeVivaChatMessages) {
      homeVivaChatMessages.style.display = 'flex';
    }

    // User bubble
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-chat-user-bubble';
    userMsg.textContent = text;
    if (homeVivaChatMessages) homeVivaChatMessages.appendChild(userMsg);

    // Bot thinking bubble
    const botMsg = document.createElement('div');
    botMsg.className = 'ai-chat-bot-bubble';
    botMsg.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Thinking...';
    if (homeVivaChatMessages) {
      homeVivaChatMessages.appendChild(botMsg);
      homeVivaChatMessages.scrollTop = homeVivaChatMessages.scrollHeight;
    }

    if (homeVivaChatSubmitBtn) homeVivaChatSubmitBtn.disabled = true;

    try {
      let vivaDirectFilePayload = lastHomeVivaDirectFilePayload;
      if (!vivaDirectFilePayload) {
        const allFiles = getUnifiedAiFiles();
        const selectedIdx = homeAiFileSelect ? parseInt(homeAiFileSelect.value, 10) : 0;
        const targetFile = allFiles[selectedIdx] || allFiles[0];
        if (targetFile) {
          try {
            vivaDirectFilePayload = await cacheAiFilePayload(targetFile.fileRef || targetFile);
            lastHomeVivaDirectFilePayload = vivaDirectFilePayload;
            lastCodePayload = vivaDirectFilePayload;
          } catch (_) {}
        }
      }

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          prompt: text,
          conversationHistory: homeVivaConversationHistory,
          previousOutput: lastGeneratedHomeVivaOutput || '',
          directFiles: vivaDirectFilePayload ? [vivaDirectFilePayload] : []
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Chat failed.');

      const cleanedVivaChat = stripAiAdsClient(data.result);
      homeVivaConversationHistory.push({ role: 'user', content: text });
      homeVivaConversationHistory.push({ role: 'model', content: cleanedVivaChat });

      if (window.marked) {
        botMsg.innerHTML = window.marked.parse(cleanedVivaChat);
      } else {
        botMsg.textContent = cleanedVivaChat;
      }
    } catch (err) {
      botMsg.innerHTML = `<span style="color: #ef4444;">Error: ${escapeHtml(err.message)}</span>`;
    } finally {
      if (homeVivaChatSubmitBtn) homeVivaChatSubmitBtn.disabled = false;
      if (homeVivaChatMessages) homeVivaChatMessages.scrollTop = homeVivaChatMessages.scrollHeight;
    }
  }

  if (homeVivaChatForm) {
    homeVivaChatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendHomeVivaChatMessage();
    });
  }

  // Viva Prompt Chips
  document.querySelectorAll('.viva-chip-home').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      if (prompt) {
        if (homeVivaChatInput) homeVivaChatInput.value = prompt;
        sendHomeVivaChatMessage(prompt);
      }
    });
  });

  checkSharedFiles();

})();

// QR Scanner Logic (Lazy-loaded for maximum performance)
(function() {
  const mobileScanBtn = document.getElementById('mobileScanBtn');
  const qrScannerModalOverlay = document.getElementById('qrScannerModalOverlay');
  const closeQrScannerBtn = document.getElementById('closeQrScannerBtn');
  let html5QrcodeScanner = null;

  function loadQrLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load QR scanner library'));
      document.head.appendChild(script);
    });
  }

  if (mobileScanBtn && qrScannerModalOverlay) {
    // Hide overlay by default
    qrScannerModalOverlay.style.display = 'none';

    mobileScanBtn.addEventListener('click', async () => {
      qrScannerModalOverlay.style.display = 'flex';
      qrScannerModalOverlay.classList.add('active'); 
      
      try {
        await loadQrLibrary();
        html5QrcodeScanner = new Html5Qrcode("qr-reader");
        const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.min(Math.floor(minEdge * 0.72), 260);
          return { width: boxSize, height: boxSize };
        };
        html5QrcodeScanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: qrboxFunction,
            aspectRatio: 1.0
          },
          (decodedText, decodedResult) => {
            // Handle successful scan
            if (decodedText.includes('/t/') || decodedText.includes('/r/')) {
              html5QrcodeScanner.stop().then(() => {
                qrScannerModalOverlay.style.display = 'none';
                qrScannerModalOverlay.classList.remove('active');
                window.location.href = decodedText;
              }).catch(err => {
                console.error("Failed to stop scanner", err);
                window.location.href = decodedText;
              });
            } else {
                window.LabDialog.alert("Invalid QR Code. Please scan a LabDrop transfer QR code.");
            }
          },
          (errorMessage) => {
            // parse errors are ignored (it just keeps scanning)
          }
        ).catch(async err => {
          await window.LabDialog.alert("Camera access denied or unavailable.");
          qrScannerModalOverlay.style.display = 'none';
          qrScannerModalOverlay.classList.remove('active');
        });
      } catch (err) {
        await window.LabDialog.alert("Could not load QR scanner. Please check your internet connection.");
        qrScannerModalOverlay.style.display = 'none';
        qrScannerModalOverlay.classList.remove('active');
      }
    });

    closeQrScannerBtn.addEventListener('click', () => {
      if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
          html5QrcodeScanner.clear();
        }).catch(err => console.error(err));
      }
      qrScannerModalOverlay.style.display = 'none';
      qrScannerModalOverlay.classList.remove('active');
    });
  }

  // ---- Quick Guide Collapsible State Handling ----
  const guideAccordion = document.getElementById('guideAccordion');
  if (guideAccordion) {
    const guideToggleLabel = guideAccordion.querySelector('.guide-toggle-label');
    const updateGuideLabel = () => {
      if (guideToggleLabel) {
        guideToggleLabel.textContent = guideAccordion.open ? 'Hide Steps' : 'Instructions';
      }
    };
    guideAccordion.addEventListener('toggle', () => {
      updateGuideLabel();
      try {
        localStorage.setItem('labdrop_guide_open', guideAccordion.open ? 'true' : 'false');
      } catch (e) {}
    });
    try {
      if (localStorage.getItem('labdrop_guide_open') === 'true') {
        guideAccordion.open = true;
        updateGuideLabel();
      }
    } catch (e) {}
  }

})();


