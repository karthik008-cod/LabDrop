// LabDrop — Service Worker (sw.js v8.2)
const CACHE_NAME = 'labdrop-v8.2';

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
          if (value && typeof value === 'object' && ('size' in value || value instanceof Blob || value instanceof File)) {
            if (value instanceof Blob || value instanceof File || (typeof value.size === 'number' && (value.name || value.type))) {
              files.push(value);
            }
          }
        }

        // 2. Also check specifically for manifest declared name 'shared_files' and common fallbacks
        const candidateKeys = ['shared_files', 'files', 'file', 'media', 'photos', 'attachment', 'document', 'documents'];
        for (const fieldName of candidateKeys) {
          try {
            const namedFiles = formData.getAll(fieldName);
            if (namedFiles && namedFiles.length > 0) {
              for (const f of namedFiles) {
                if (f && typeof f === 'object' && ('size' in f || f instanceof Blob) && !files.includes(f)) {
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

        const isDroppedMedia = title && /^(document|photo|video|audio|file)\s+from\s+/i.test(title.trim());
        const looksLikeFilename = text && text.trim().length > 0 && text.trim().length < 260 && !text.includes('\n') && /\.(pdf|docx?|pptx?|xlsx?|zip|rar|7z|tar|png|jpe?g|webp|mp4|mp3|txt|csv)$/i.test(text.trim());

        if (files.length > 0) {
          // If files arrived with generic names, see if text/title has the real filename
          if (text && text.trim() && !text.includes('\n') && text.trim().length < 260) {
            for (const f of files) {
              if (f.name === 'blob' || f.name === 'file' || f.name === 'shared_file' || !f.name.includes('.')) {
                if (/\.[a-zA-Z0-9]{1,6}$/.test(text.trim())) {
                  try { Object.defineProperty(f, 'name', { value: text.trim(), configurable: true }); } catch (_) { f.name = text.trim(); }
                }
              }
            }
          }
          await saveSharedDataToIndexedDB(files, { title, text });
        } else if (isDroppedMedia || looksLikeFilename) {
          // WhatsApp or another app tried to share a document, but Android/Chrome didn't pass the binary stream!
          // NEVER create a fake 46-byte .txt file! Notify the UI cleanly.
          const missingName = text ? text.trim() : (title ? title.trim() : 'Shared Document');
          await saveSharedDataToIndexedDB([], {
            shareError: 'file_stream_missing',
            missingFileName: missingName,
            title: title || ''
          });
        } else if (shareUrl || (text && /^https?:\/\//i.test(text.trim()))) {
          const link = shareUrl || text.trim();
          await saveSharedDataToIndexedDB([], { url: link, title });
        } else if (text && text.trim()) {
          // Genuine text note / code snippet shared by the user
          await saveSharedDataToIndexedDB([], { text: text.trim(), title: title || '' });
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
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/x-7z-compressed': '.7z',
    'application/x-rar-compressed': '.rar',
    'application/vnd.rar': '.rar',
    'application/x-tar': '.tar',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'text/html': '.html',
    'text/css': '.css',
    'text/javascript': '.js',
    'application/json': '.json',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a'
  };

  const processedFiles = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    try {
      const rawBlob = file.blob || file;
      let fileName = file.name || rawBlob.name || (extra.title && !/^(document|photo|video|audio|file)\s+from\s+/i.test(extra.title.trim()) ? extra.title.trim() : null) || `shared_file_${Date.now()}_${i}`;
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
        size: rawBlob.size !== undefined ? rawBlob.size : (file.size || 0),
        lastModified: lastMod,
        blob: rawBlob
      });
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
            if (extra && (extra.url || extra.title || extra.text || extra.shareError)) {
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
