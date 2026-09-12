/*
 * Chromebook-Famicompo-NSF-Player
 *
 * service-worker.js v0.2
 *
 * PWA cache manager
 *
 * - Application shell caching
 * - WASM asset caching
 * - Cache version management
 * - Offline fallback
 */

const CACHE_NAME = "famicompo-nsf-player-v0.2";

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


/*
 * Install
 */

self.addEventListener("install", (event) => {

    event.waitUntil(

        caches.open(CACHE_NAME)

            .then((cache) => {

                return cache.addAll(APP_FILES);

            })

            .then(() => {

                return self.skipWaiting();

            })

    );

});



/*
 * Activate
 */

self.addEventListener("activate", (event) => {

    event.waitUntil(

        caches.keys()

            .then((cacheNames) => {

                return Promise.all(

                    cacheNames.map((cacheName) => {

                        if (
                            cacheName !== CACHE_NAME
                        ) {

                            return caches.delete(
                                cacheName
                            );

                        }

                        return undefined;

                    })

                );

            })

            .then(() => {

                return self.clients.claim();

            })

    );

});



/*
 * Fetch
 *
 * Application files:
 * cache first
 *
 * Other resources:
 * network first
 */

self.addEventListener("fetch", (event) => {

    const request = event.request;

    if (request.method !== "GET") {

        return;

    }


    const url = new URL(request.url);


    /*
     * Same-origin resources
     */

    if (url.origin === self.location.origin) {

        event.respondWith(

            caches.match(request)

                .then((cachedResponse) => {

                    if (cachedResponse) {

                        return cachedResponse;

                    }


                    return fetch(request)

                        .then((response) => {

                            if (
                                response &&
                                response.status === 200
                            ) {

                                const responseClone =
                                    response.clone();

                                caches.open(CACHE_NAME)
                                    .then((cache) => {

                                        cache.put(
                                            request,
                                            responseClone
                                        );

                                    });

                            }

                            return response;

                        });

                })

        );

        return;

    }


    /*
     * External resources
     */

    event.respondWith(

        fetch(request)

            .catch(() => {

                return caches.match(request);

            })

    );

});