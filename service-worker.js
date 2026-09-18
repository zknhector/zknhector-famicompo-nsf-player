const CACHE_NAME = "famicompo-nsf-player-v0.4";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",

  "./css/style.css",

  "./js/app.js",
  "./js/library.js",
  "./js/nsf-parser.js",
  "./js/nsf-engine.js",
  "./js/player.js",
  "./js/audio-worker.js",
  "./js/gme-core.js",
  "./js/gme-loader.js",
  "./js/libgme-bridge.js",

  "./wasm/gme.js",
  "./wasm/gme.wasm"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then(response => {
          if (!response || response.status !== 200) {
            return response;
          }

          const responseClone = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });

          return response;
        });
      })
  );
});
