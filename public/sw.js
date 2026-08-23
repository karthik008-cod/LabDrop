const CACHE_NAME = 'labdrop-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'POST' && event.request.url.endsWith('/share-target')) {
    
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        // Send initial HTML to hide splash screen and show a loading message
        controller.enqueue(encoder.encode(
          '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
          '<body style="background:#121212;color:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">' +
          '<h2>Processing shared files... Please wait.</h2>\n'
        ));

        // Process files asynchronously
        event.waitUntil(
          (async () => {
            try {
              const formData = await event.request.formData();
              const files = formData.getAll('shared_files');

              if (files && files.length > 0) {
                await saveSharedFilesToIndexedDB(files);
              }
              
              // Finish the HTML and redirect
              controller.enqueue(encoder.encode('<script>window.location.href = "/?shared=1";</script></body></html>'));
            } catch (error) {
              console.error('Error handling share target:', error);
              controller.enqueue(encoder.encode('<script>window.location.href = "/?share_error=1";</script></body></html>'));
            } finally {
              controller.close();
            }
          })()
        );
      }
    });

    event.respondWith(
      new Response(stream, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    );
  }
});

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
