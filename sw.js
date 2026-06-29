// ================================================
// EDTECH Studio — Service Worker v4.0
// Estrategia: Network-first para JS/CSS, Cache-first para imágenes
// ================================================

const CACHE_NAME = 'edtech-studio-v4';
const STATIC_CACHE = 'edtech-static-v4';

// Rutas de API — nunca se cachean
const API_ROUTES = ['/api/'];

// ── Instalación ──
self.addEventListener('install', event => {
    console.log('[SW] Instalando v4...');
    self.skipWaiting();
});

// ── Activación: limpiar cachés viejos ──
self.addEventListener('activate', event => {
    console.log('[SW] Activando v4...');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME && k !== STATIC_CACHE)
                    .map(k => {
                        console.log('[SW] Eliminando caché viejo:', k);
                        return caches.delete(k);
                    })
            )
        )
    );
    self.clients.claim();
});

// ── Fetch: estrategia por tipo de recurso ──
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Peticiones a la API → siempre red (nunca caché)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(
                    JSON.stringify({ error: 'Sin conexión. Verifica tu red.' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // 2. JS y CSS → Network-first (siempre busca versión nueva del servidor)
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // 3. Navegación (HTML) → Network-first, fallback a / en caché
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match('/'))
        );
        return;
    }

    // 4. Imágenes y otros assets estáticos → Cache-first
    if (
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.ico') ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com'
    ) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // 5. Todo lo demás → Network-first
    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});

// ── Notification Click: enfoca la app o abre una pestaña ──
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Si ya hay una pestaña abierta, enfocarla
            for (const client of clientList) {
                if ('focus' in client) {
                    return client.focus();
                }
            }
            // Si no hay pestaña, abrir una nueva
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
