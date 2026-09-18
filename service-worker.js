/*
 * Chromebook-Famicompo-NSF-Player
 *
 * service-worker.js v0.3
 *
 * Cache version bumped so browsers discard the old
 * JavaScript files after the audio ABI fix.
 */

const CACHE_NAME = "famicompo-nsf-player-v0.4";

const APP_FILES = [
    "./",
    "./index.html",
    "./manifest.json",
    "./wasm/gme.js",
    "./wasm/gme.wasm",

    "./css/style.css",

    "./js/app.js",
    "./js/library.js",
    "./js/player.js",
    "./js/audio-worker.js",

    "./js/gme-loader.js",
    "./js/gme-core.js",
    "./js/libgme-bridge.js",
    "./js/nsf-parser.js",
    "./js/nsf-engine.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                    return undefined;
                })
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;

                    return fetch(request).then((response) => {
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(request, clone));
                        }
                        return response;
                    });
                })
        );
        return;
    }

    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});
