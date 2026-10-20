// LabDrop — Service Worker (sw.js v8.1)
const CACHE_NAME = 'labdrop-v8.1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Web Share Target POST request (from mobile WhatsApp, Gallery, file managers, or share sheet)
  if (event.request.method === 'POST' && (url.pathname === '/share-target' || url.pathname.endsWith('/share-target'))) {
    event.respondWith((async () => {
      try {
        // Read formData directly. NOTE: DO NOT call event.request.clone() here,
        // because cloning non-seekable Android IPC streams consumes the native body pipe.
        const formData = await event.request.formData();
        const files = [];

        // 1. Iterate all formData entries to extract all files regardless of key name
        for (const [key, value] of formData.entries()) {
          if (value && typeof value === 'object' && typeof value.size === 'number' && value.size > 0) {
            files.push(value);
          }
        }

        // 2. Also check specifically for manifest declared name 'shared_files' and common fallbacks
        const candidateKeys = ['shared_files', 'files', 'file', 'media', 'photos', 'attachment'];
        for (const fieldName of candidateKeys) {
          try {
            const namedFiles = formData.getAll(fieldName);
            if (namedFiles && namedFiles.length > 0) {
              for (const f of namedFiles) {
                if (f && typeof f === 'object' && typeof f.size === 'number' && f.size > 0 && !files.includes(f)) {
                  files.push(f);
                }
              }
            }
          } catch (_) {}
        }

        // Check for shared text, url, or title (e.g. text/links shared from WhatsApp)
        const text = formData.get('text');
        const shareUrl = formData.get('url');
        const title = formData.get('title');

        if (files.length > 0) {
          await saveSharedDataToIndexedDB(files, { title, text });
        } else if (text || shareUrl) {
          const linkToShare = shareUrl || (text && /^https?:\/\//i.test(text.trim()) ? text.trim() : null);
          if (linkToShare) {
            await saveSharedDataToIndexedDB([], { url: linkToShare, title });
          } else if (text && text.trim()) {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const filename = (title ? title.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'shared-note') + '.txt';
            await saveSharedDataToIndexedDB([{
              name: filename,
              type: 'text/plain;charset=utf-8',
              size: blob.size,
              lastModified: Date.now(),
              blob: blob
            }]);
          }
        }

        // Notify any active clients so if LabDrop is already open, it immediately renders the files
        try {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const client of clients) {
            client.postMessage({ type: 'LABDROP_SHARED_FILES_READY' });
          }
        } catch (_) {}

        // Standard W3C Web Share Target HTTP 303 redirect to root with share marker
        return Response.redirect('/?shared=1', 303);
      } catch (error) {
        console.warn('[ServiceWorker] Share target parsing error:', error);
        // CRITICAL: NEVER call fetch(reqClone) or rethrow! Always redirect safely to root so the browser never closes the connection.
        return Response.redirect('/?shared=1&share_error=1', 303);
      }
    })());
    return;
  }
});

async function saveSharedDataToIndexedDB(files = [], extra = {}) {
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip'
  };

  const processedFiles = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    try {
      const rawBlob = file.blob || file;
      let fileName = file.name || rawBlob.name || (extra.title ? extra.title.trim() : null) || `shared_file_${Date.now()}_${i}`;
      const fileType = file.type || rawBlob.type || 'application/octet-stream';
      const lastMod = file.lastModified || rawBlob.lastModified || Date.now();

      if (!fileName.includes('.')) {
        if (mimeMap[fileType]) {
          fileName += mimeMap[fileType];
        }
      }

      // Try arrayBuffer first for cross-context persistence; fallback to direct blob
      let buffer = null;
      try {
        if (typeof rawBlob.arrayBuffer === 'function') {
          buffer = await rawBlob.arrayBuffer();
        } else if (typeof rawBlob.slice === 'function') {
          buffer = await rawBlob.slice(0, rawBlob.size).arrayBuffer();
        }
      } catch (bufErr) {
        console.warn('[ServiceWorker] arrayBuffer conversion failed, using direct blob:', bufErr);
      }

      if (buffer && buffer.byteLength > 0) {
        processedFiles.push({
          name: fileName,
          type: fileType,
          size: buffer.byteLength,
          lastModified: lastMod,
          buffer: buffer
        });
      } else {
        processedFiles.push({
          name: fileName,
          type: fileType,
          size: rawBlob.size || file.size || 0,
          lastModified: lastMod,
          blob: rawBlob
        });
      }
    } catch (readErr) {
      console.warn('[ServiceWorker] Failed to process shared file:', readErr);
    }
  }

  // Open IndexedDB and store processed files
  return new Promise((resolve) => {
    try {
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
        try {
          const storeNames = Array.from(db.objectStoreNames);
          const transaction = db.transaction(storeNames, 'readwrite');
          const store = transaction.objectStore('files');
          
          // Clear previous files to ensure a fresh share drop
          store.clear();

          processedFiles.forEach((item) => {
            store.add(item);
          });

          if (storeNames.includes('meta')) {
            const metaStore = transaction.objectStore('meta');
            metaStore.clear();
            if (extra && (extra.url || extra.title || extra.text)) {
              metaStore.put({ id: 'share_meta', ...extra, timestamp: Date.now() });
            }
          }

          transaction.oncomplete = () => {
            try { db.close(); } catch (_) {}
            resolve(processedFiles.length);
          };
          transaction.onerror = () => {
            try { db.close(); } catch (_) {}
            resolve(processedFiles.length);
          };
          transaction.onabort = () => {
            try { db.close(); } catch (_) {}
            resolve(processedFiles.length);
          };
        } catch (err) {
          try { db.close(); } catch (_) {}
          resolve(processedFiles.length);
        }
      };

      request.onerror = () => {
        resolve(processedFiles.length);
      };
    } catch (e) {
      resolve(0);
    }
  });
}
