(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const alertArea = $('#alertArea');
  const loadingState = $('#loadingState');
  const emptyState = $('#emptyState');
  const transfersContainer = $('#transfersContainer');
  const navUserEmail = $('#navUserEmail');
  const navLogoutBtn = $('#navLogoutBtn');

  const authToken = localStorage.getItem('labdrop_token');

  function showAlert(message, type = 'error') {
    const div = document.createElement('div');
    div.className = `alert alert--${type}`;
    div.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span> ${message}`;
    alertArea.prepend(div);
    setTimeout(() => div.remove(), 6000);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getExpiryText(expiresAt) {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Expired';

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);

    if (days > 1) return `⏳ ${days} days remaining`;
    if (days === 1) return `⚠️ Expires tomorrow`;
    if (hours > 0) return `⚠️ Expires in ${hours} hours`;
    return `⚠️ Expires very soon`;
  }

  async function init() {
    if (!authToken) {
      window.location.href = '/';
      return;
    }

    try {
      const meRes = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!meRes.ok) throw new Error('Not logged in');
      const meData = await meRes.json();
      navUserEmail.textContent = meData.user.email;
    } catch (e) {
      localStorage.removeItem('labdrop_token');
      window.location.href = '/';
      return;
    }

    navLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('labdrop_token');
      window.location.href = '/';
    });

    try {
      const res = await fetch('/api/my-transfers', { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!res.ok) throw new Error('Failed to fetch transfers');
      
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
      card.className = 'card';
      
      const isExpiringSoon = (t.expiresAt - Date.now()) < (24 * 60 * 60 * 1000);
      const expiryStyle = isExpiringSoon ? 'color: var(--color-warning);' : 'color: var(--color-text-secondary);';
      
      const downloadBtn = t.requirePin ?
        `<a href="/t/${t.id}" class="btn btn--secondary btn--block" style="margin-top: var(--space-md);">View Transfer (PIN Required)</a>` :
        `<a href="/download/${t.id}/zip" class="btn btn--primary btn--block" style="margin-top: var(--space-md);">⬇️ Download All</a>`;
      
      const deleteBtn = `<button class="btn btn--danger btn--block" style="margin-top: var(--space-sm);" onclick="deleteTransfer('${t.id}')">✕ Delete</button>`;

      card.innerHTML = `
        <div class="card__title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>${t.transferName || 'Lab Files'}</span>
          <span style="background: var(--color-bg-secondary); padding: 4px 8px; border-radius: 4px; font-size: 0.9rem; font-family: monospace; letter-spacing: 2px; color: var(--color-primary);">${t.shortCode}</span>
        </div>
        <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-sm);">
          ${t.fileCount} files · ${formatBytes(t.totalSize)}
        </div>
        <div style="font-size: var(--font-size-sm); font-weight: 600; ${expiryStyle}">
          ${getExpiryText(t.expiresAt)}
        </div>
        ${downloadBtn}
        ${deleteBtn}
      `;
      transfersContainer.appendChild(card);
    });
  }

  window.deleteTransfer = async (id) => {
    if (!confirm('Are you sure you want to delete this transfer?')) return;
    try {
      const res = await fetch(`/api/transfer/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const d = await res.json();
        showAlert(d.error || 'Failed to delete transfer.');
      }
    } catch(e) {
      showAlert('Network error.');
    }
  };

  init();
})();
