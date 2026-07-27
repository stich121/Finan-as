const CACHE_VERSION = 'financas-v13';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Só pré-cacheamos assets estáticos (CSS/JS/ícones). As páginas .php são renderizadas
// no servidor por sessão (nav ativo, dados do usuário) e não devem ficar presas em cache;
// elas são buscadas com network-first e, offline, mostramos uma mensagem simples.
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/assets/css/styles.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('financas-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiNetworkOnly(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  // Módulos ES precisam ser entregues pela mesma versão. Não os armazenamos no
  // service worker para evitar que um entrypoint novo importe dependências antigas.
  if (request.destination === 'script') {
    event.respondWith(apiNetworkOnly(request));
    return;
  }

  if (request.destination === 'style') {
    event.respondWith(staticNetworkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function apiNetworkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: 'Sem conexão com o servidor.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staticNetworkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
    return cached || new Response('Offline', { status: 503 });
  }
}

async function navigationNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      '<!doctype html><meta charset="utf-8"><body style="background:#0f172a;color:#e6ebf5;font-family:sans-serif;padding:32px;text-align:center;">Sem conexão. Tente novamente quando estiver online.</body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}
