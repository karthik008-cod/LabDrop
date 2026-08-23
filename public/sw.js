const CACHE_NAME = 'labdrop-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'POST' && event.request.url.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('shared_files');

    if (files && files.length > 0) {
      await saveSharedFilesToIndexedDB(files);
    }
    
    // Redirect to the main page using an HTML redirect instead of 303 to prevent Android Chrome Share Target hangs
    return new Response(
      '<html><head><meta http-equiv="refresh" content="0; url=/?shared=1"></head><body>Loading...</body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Error handling share target:', error);
    return new Response(
      '<html><head><meta http-equiv="refresh" content="0; url=/?share_error=1"></head><body>Error loading.</body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

function saveSharedFilesToIndexedDB(files) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('LabDropSharedFiles', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction('files', 'readwrite');
      const store = transaction.objectStore('files');
      
      // Clear old files to ensure we only have the newest share
      store.clear();

      files.forEach(file => {
        // Only store actual files, skip empty ones
        if (file instanceof File && file.size > 0) {
          store.add(file);
        }
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
