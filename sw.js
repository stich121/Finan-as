const CACHE_VERSION = 'financas-v9';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Só pré-cacheamos assets estáticos (CSS/JS/ícones). As páginas .php são renderizadas
// no servidor por sessão (nav ativo, dados do usuário) e não devem ficar presas em cache;
// elas são buscadas com network-first e, offline, mostramos uma mensagem simples.
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/assets/css/styles.css',
  '/assets/js/api.js',
  '/assets/js/state.js',
  '/assets/js/utils.js',
  '/assets/js/charts.js',
  '/assets/js/icons.js',
  '/assets/js/components/modal.js',
  '/assets/js/components/confirm-dialog.js',
  '/assets/js/components/toast.js',
  '/assets/js/pages/login.js',
  '/assets/js/pages/register.js',
  '/assets/js/pages/dashboard.js',
  '/assets/js/pages/accounts.js',
  '/assets/js/pages/cards.js',
  '/assets/js/pages/categories.js',
  '/assets/js/pages/tags.js',
  '/assets/js/pages/goals.js',
  '/assets/js/pages/transactions.js',
  '/assets/js/pages/transaction-form.js',
  '/assets/js/pages/ofx-import.js',
  '/assets/js/pages/rules.js',
  '/assets/js/pages/budgets.js',
  '/assets/js/pages/recurring.js',
  '/assets/js/pages/settings.js',
  '/assets/js/pages/reports.js',
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

  if (request.destination === 'style' || request.destination === 'script') {
    event.respondWith(staticStaleWhileRevalidate(request));
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

async function staticStaleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
  const network = fetch(request, { cache: 'no-cache' })
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    void network;
    return cached;
  }

  return (await network) || new Response('Offline', { status: 503 });
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
