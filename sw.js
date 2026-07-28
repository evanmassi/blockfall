const CACHE = 'blockfall-v1';

const ASSETS = [
  './', './index.html', './style.css', './manifest.json',
  './src/config.js', './src/pieces.js', './src/themes.js', './src/dom.js',
  './src/state.js', './src/board.js', './src/sprites.js', './src/render.js',
  './src/ui.js', './src/game.js', './src/input.js', './src/audio.js', './src/main.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-512.png', './icons/apple-touch-180.png',
  './fonts/press-start-2p.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: launches instantly from cache, and picks up a new
// deploy on the following launch without needing the cache name bumped.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(hit => {
        const net = fetch(req)
          .then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
        return hit || net;
      })
    )
  );
});
