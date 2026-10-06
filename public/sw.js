// LabDrop — Service Worker (sw.js v5.1)
const CACHE_NAME = 'labdrop-v5.1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Web Share Target POST request (from mobile WhatsApp, file managers, or share sheet)
  if (event.request.method === 'POST' && (url.pathname === '/share-target' || url.pathname.endsWith('/share-target'))) {
    event.respondWith((async () => {
      // Clone the request upfront so that if SW parsing fails or returns empty, we can fall back to server fetch
      let reqClone = null;
      try {
        reqClone = event.request.clone();
      } catch (_) {}

      try {
        const formData = await event.request.formData();
        
        // Extract all shared files regardless of field key (shared_files, files, media, document, etc.)
        const files = [];
        
        // 1. Iterate all formData entries
        for (const [key, value] of formData.entries()) {
          if (value && typeof value === 'object' && ('size' in value) && value.size > 0) {
            files.push(value);
          }
        }

        // 2. Also check specifically for manifest declared name 'shared_files' and common fallbacks
        ['shared_files', 'files', 'file', 'media'].forEach(fieldName => {
          try {
            const namedFiles = formData.getAll(fieldName);
            if (namedFiles && namedFiles.length > 0) {
              namedFiles.forEach(f => {
                if (f && typeof f === 'object' && ('size' in f) && f.size > 0 && !files.includes(f)) {
                  files.push(f);
                }
              });
            }
          } catch (_) {}
        });

        // Check for shared text, url, or title (e.g. text/links shared from WhatsApp)
        const text = formData.get('text');
        const shareUrl = formData.get('url');
        const title = formData.get('title');

        if (files.length === 0 && (text || shareUrl)) {
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
        } else if (files.length > 0) {
          await saveSharedDataToIndexedDB(files, { title, text });
        } else if (reqClone) {
          // If SW extracted 0 files and no text/url, forward request clone to server multer
          try {
            console.log('[ServiceWorker] No files in SW formData, forwarding to server...');
            return await fetch(reqClone);
          } catch (netErr) {
            console.warn('[ServiceWorker] Server forward failed:', netErr);
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
        console.warn('[ServiceWorker] Share target parsing error, attempting server fallback:', error);
        if (reqClone) {
          try {
            return await fetch(reqClone);
          } catch (netErr) {
            console.error('[ServiceWorker] Server fallback fetch failed:', netErr);
          }
        }
        return Response.redirect('/?shared=1', 303);
      }
    })());
  }
});

function saveSharedDataToIndexedDB(files = [], extra = {}) {
  return new Promise((resolve, reject) => {
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

        files.forEach((file, index) => {
          if (!file) return;

          // Safely check if file is a Blob/File or an object containing a blob
          const rawBlob = file.blob || file;
          const isBlobLike = (typeof Blob !== 'undefined' && rawBlob instanceof Blob) ||
                             (rawBlob && typeof rawBlob === 'object' && typeof rawBlob.slice === 'function');

          if (isBlobLike && rawBlob.size > 0) {
            let fileName = file.name || rawBlob.name || (extra.title ? extra.title.trim() : null) || `shared_file_${Date.now()}_${index}`;
            const fileType = file.type || rawBlob.type || 'application/octet-stream';
            const lastMod = file.lastModified || rawBlob.lastModified || Date.now();

            if (!fileName.includes('.')) {
              const mimeMap = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/webp': '.webp',
                'image/gif': '.gif',
                'application/pdf': '.pdf',
                'text/plain': '.txt',
                'video/mp4': '.mp4',
                'audio/mpeg': '.mp3',
                'audio/ogg': '.ogg',
                'application/zip': '.zip'
              };
              if (mimeMap[fileType]) fileName += mimeMap[fileType];
            }

            store.add({
              name: fileName,
              type: fileType,
              size: rawBlob.size,
              lastModified: lastMod,
              blob: rawBlob
            });
          }
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
          resolve();
        };
        transaction.onerror = (e) => {
          try { db.close(); } catch (_) {}
          reject(e.target ? e.target.error : e);
        };
        transaction.onabort = (e) => {
          try { db.close(); } catch (_) {}
          reject(e.target ? e.target.error : e);
        };
      } catch (err) {
        try { db.close(); } catch (_) {}
        reject(err);
      }
    };

    request.onerror = (event) => {
      reject(event.target ? event.target.error : new Error('IndexedDB open error'));
    };
  });
}
