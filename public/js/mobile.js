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
  const errorIcon = $('#errorIcon');
  const errorTitle = $('#errorTitle');
  const errorMessage = $('#errorMessage');
  const retryBtn = $('#retryBtn');

  const mStatFiles = $('#mStatFiles');
  const mStatSize = $('#mStatSize');
  const mStatExpiry = $('#mStatExpiry');
  const downloadAllBtn = $('#downloadAllBtn');
  const mFileList = $('#mFileList');

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
  async function loadTransfer() {
    const transferId = getTransferId();

    if (!transferId) {
      showError('🔗', 'Invalid Link', 'This transfer link is malformed or incomplete.');
      return;
    }

    showState('loading');

    try {
      const res = await fetch(`/api/transfer/${transferId}`);

      if (res.status === 404) {
        showError('🔍', 'Transfer Not Found', 'This transfer does not exist or is no longer available.');
        return;
      }

      if (res.status === 410) {
        showError('⏰', 'Transfer Expired', 'This transfer has expired. Ask the sender to create a new one.');
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showError('😕', 'Something Went Wrong', errData.error || 'An unexpected error occurred.');
        return;
      }

      const data = await res.json();
      renderTransfer(data);
    } catch (err) {
      showError('📡', 'Network Error', 'Could not connect to the server. Make sure you are on the same Wi-Fi/LAN network as the lab computer.');
    }
  }

  // ---- Render transfer ----
  function renderTransfer(data) {
    showState('transfer');

    mStatFiles.textContent = data.fileCount;
    mStatSize.textContent = formatBytes(data.totalSize);

    // Download All link
    downloadAllBtn.href = `/download/${data.id}/zip`;
    downloadAllBtn.textContent = `⬇️ Download All (ZIP) · ${formatBytes(data.totalSize)}`;

    // File list
    mFileList.innerHTML = '';
    data.files.forEach((file) => {
      const cat = file.category || 'file';
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
          <a class="btn btn--secondary btn--icon" href="/download/${data.id}/${file.id}" title="Download ${escapeHtml(file.name)}" style="font-size: 0.85rem; padding: 6px 12px;">
            ⬇️
          </a>
        </div>
      `;
      mFileList.appendChild(li);
    });

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

  // ---- Retry button ----
  retryBtn.addEventListener('click', loadTransfer);

  // ---- Initialize ----
  loadTransfer();
})();
