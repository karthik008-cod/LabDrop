// LabDrop — Service Worker (sw.js v3.0)
const CACHE_NAME = 'labdrop-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Web Share Target POST request (from mobile WhatsApp, file managers, or desktop share sheet)
  if (event.request.method === 'POST' && (url.pathname === '/share-target' || url.pathname.endsWith('/share-target'))) {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        
        // Extract all shared files regardless of field key (shared_files, files, media, etc.)
        const files = [];
        for (const [key, value] of formData.entries()) {
          if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && value.size > 0) {
            files.push(value);
          }
        }

        // Also check for shared text, url, or title (e.g. text/links shared from WhatsApp)
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
            const textFile = new File([blob], filename, { type: 'text/plain;charset=utf-8' });
            files.push(textFile);
            await saveSharedDataToIndexedDB(files);
          }
        } else if (files.length > 0) {
          await saveSharedDataToIndexedDB(files);
        }

        // Notify any active clients so if LabDrop is already open, it immediately renders the files
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'LABDROP_SHARED_FILES_READY' });
        }

        // Standard W3C Web Share Target HTTP 303 redirect
        return Response.redirect('/?shared=1', 303);
      } catch (error) {
        console.error('[ServiceWorker] Share target error:', error);
        return Response.redirect('/?share_error=1', 303);
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
        
        // Clear old files to ensure fresh share
        store.clear();

        files.forEach(file => {
          if (file && (file instanceof File || file instanceof Blob) && file.size > 0) {
            store.add({
              name: file.name || 'shared_file',
              type: file.type || 'application/octet-stream',
              size: file.size,
              lastModified: file.lastModified || Date.now(),
              blob: file
            });
          }
        });

        if (storeNames.includes('meta')) {
          const metaStore = transaction.objectStore('meta');
          metaStore.clear();
          if (extra && (extra.url || extra.title)) {
            metaStore.put({ id: 'share_meta', ...extra, timestamp: Date.now() });
          }
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e);
      } catch (err) {
        reject(err);
      }
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
