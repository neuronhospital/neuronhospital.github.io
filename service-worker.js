const CACHE_VERSION = 'neuron-site-shell-v81';
const CACHE_NAME = CACHE_VERSION;


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.add('./index81_v81.html');
      })
      .then(() => self.skipWaiting())
  );
});


/* =========================================================
   ACTIVATE
   Remove older NEURON website caches
   ========================================================= */

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key =>
              key.startsWith('neuron-site-shell-') &&
              key !== CACHE_NAME
            )
            .map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener('fetch', event => {

  const request = event.request;

  /*
   * Only handle GET requests.
   *
   * POST requests used for OPD/EEG booking and updates
   * are NOT intercepted by this Service Worker.
   */
  if (request.method !== 'GET') {
    return;
  }


  const url = new URL(request.url);


  /*
   * IMPORTANT:
   *
   * Never intercept cross-origin requests.
   *
   * This means Google Apps Script / API requests continue
   * directly to the server and are NOT cached.
   *
   * Patient data and Google Sheet data therefore do not
   * enter the Service Worker cache.
   */
  if (url.origin !== self.location.origin) {
    return;
  }


  /* =======================================================
     PAGE NAVIGATION
     Network first → cached website if network fails
     ======================================================= */

  if (request.mode === 'navigate') {

    event.respondWith(

      fetch(request)

        .then(response => {

          /*
           * Save the latest successful HTML response.
           */
          if (response && response.ok) {

            const responseCopy = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(request, responseCopy);
              });
          }

          return response;
        })

        .catch(() => {

          /*
           * Network failed.
           *
           * First try the exact requested page.
           */
          return caches.match(request)
            .then(cachedResponse => {

              if (cachedResponse) {
                return cachedResponse;
              }

              /*
               * If the exact page isn't cached,
               * fall back to the known application shell.
               */
              return caches.match('./index81_v81.html');
            });
        })
    );

    return;
  }


  /* =======================================================
     SAME-ORIGIN STATIC RESOURCES
     
     Network first → cache fallback
     ======================================================= */

  event.respondWith(

    fetch(request)

      .then(response => {

        /*
         * Cache successful same-origin static resources.
         */
        if (response && response.ok) {

          const responseCopy = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(request, responseCopy);
            });
        }

        return response;
      })

      .catch(() => {

        /*
         * Network failed.
         *
         * Try the cached resource.
         */
        return caches.match(request);
      })
  );

});