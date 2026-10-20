// LabDrop — Service Worker (sw.js v8.0)
const CACHE_NAME = 'labdrop-v8.0';

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
      let reqClone = null;
      try {
        reqClone = event.request.clone();
      } catch (_) {}

      try {
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

        let savedCount = 0;
        if (files.length > 0) {
          savedCount = await saveSharedDataToIndexedDB(files, { title, text });
        } else if (text || shareUrl) {
          const linkToShare = shareUrl || (text && /^https?:\/\//i.test(text.trim()) ? text.trim() : null);
          if (linkToShare) {
            await saveSharedDataToIndexedDB([], { url: linkToShare, title });
            savedCount = 1;
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
            savedCount = 1;
          }
        }

        // If SW extracted 0 files and no text/url, forward request clone to server multer
        if (savedCount === 0 && reqClone) {
          try {
            console.log('[ServiceWorker] No files in SW formData, forwarding to server fallback...');
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

  // Step 1: Read all files into memory ArrayBuffers BEFORE starting the transaction!
  // Storing pure ArrayBuffers avoids DataCloneError on Android ContentProvider File objects
  // and ensures data survives request termination.
  const processedFiles = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    try {
      const rawBlob = file.blob || file;
      let buffer = null;

      if (typeof rawBlob.arrayBuffer === 'function') {
        buffer = await rawBlob.arrayBuffer();
      } else if (typeof rawBlob.slice === 'function') {
        const sliced = rawBlob.slice(0, rawBlob.size);
        buffer = await sliced.arrayBuffer();
      }

      if (buffer && buffer.byteLength > 0) {
        let fileName = file.name || rawBlob.name || (extra.title ? extra.title.trim() : null) || `shared_file_${Date.now()}_${i}`;
        const fileType = file.type || rawBlob.type || 'application/octet-stream';
        const lastMod = file.lastModified || rawBlob.lastModified || Date.now();

        if (!fileName.includes('.')) {
          if (mimeMap[fileType]) {
            fileName += mimeMap[fileType];
          }
        }

        processedFiles.push({
          name: fileName,
          type: fileType,
          size: buffer.byteLength,
          lastModified: lastMod,
          buffer: buffer
        });
      }
    } catch (readErr) {
      console.warn('[ServiceWorker] Failed to read file arrayBuffer:', readErr);
    }
  }

  // Step 2: Open IndexedDB and store processed files synchronously
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
