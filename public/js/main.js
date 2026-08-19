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
  const fileListWrapper = $('#fileListWrapper');
  const fileSummary = $('#fileSummary');
  const clearFilesBtn = $('#clearFilesBtn');
  const createTransferBtn = $('#createTransferBtn');

  const progressBarFill = $('#progressBarFill');
  const progressText = $('#progressText');

  const qrImage = $('#qrImage');
  const transferCode = $('#transferCode');
  const transferUrl = $('#transferUrl');
  const copyUrlBtn = $('#copyUrlBtn');
  const timerEl = $('#timer');
  const timerText = $('#timerText');
  const statFiles = $('#statFiles');
  const statSize = $('#statSize');
  const qrFileList = $('#qrFileList');
  const cancelTransferBtn = $('#cancelTransferBtn');
  const newTransferBtn = $('#newTransferBtn');

  // ---- State ----
  let selectedFiles = []; // Array of File objects
  let currentTransfer = null; // Active transfer data from server
  let timerInterval = null;

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

  // ---- Render selected file list ----
  function renderFileList() {
    fileList.innerHTML = '';

    if (selectedFiles.length === 0) {
      fileListWrapper.classList.add('section--hidden');
      createTransferBtn.disabled = true;
      return;
    }

    fileListWrapper.classList.remove('section--hidden');
    createTransferBtn.disabled = false;

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

    fileSummary.innerHTML = `<strong>${selectedFiles.length}</strong> file${selectedFiles.length > 1 ? 's' : ''} · ${formatBytes(totalSize)}`;

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

  // ---- Clear files ----
  clearFilesBtn.addEventListener('click', () => {
    selectedFiles = [];
    renderFileList();
  });

  // ---- Create Transfer ----
  createTransferBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
      showAlert('Please select at least one file.');
      return;
    }

    showSection(uploadSection);

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('files', file));

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
    statFiles.textContent = data.fileCount;
    statSize.textContent = formatBytes(data.totalSize);

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
      // Fallback for older browsers
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

  // ---- Reset to start state ----
  function resetToStart() {
    if (timerInterval) clearInterval(timerInterval);
    currentTransfer = null;
    selectedFiles = [];
    renderFileList();
    progressBarFill.style.width = '0%';
    progressText.textContent = 'Preparing upload…';
    showSection(selectSection);
  }

  // ---- Initialize ----
  showSection(selectSection);
})();
