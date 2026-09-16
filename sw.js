const CACHE = 'blockfall-v2';

const ASSETS = [
  './', './index.html', './style.css', './manifest.json',
  './src/config.js', './src/pieces.js', './src/themes.js', './src/dom.js',
  './src/state.js', './src/board.js', './src/sprites.js', './src/render.js',
  './src/ui.js', './src/game.js', './src/input.js', './src/audio.js',
  './src/haptics.js', './src/main.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-512.png', './icons/apple-touch-180.png',
  './fonts/press-start-2p.woff2',
];

// PITFALL: not addAll; it is atomic and one unreachable path silently aborts the whole install, so the app never works offline.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(ASSETS.map(url => cache.add(url))))
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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const cached = caches.open(CACHE).then(cache => cache.match(req).then(hit => ({ cache, hit })));

  // PITFALL: cache:'no-cache' forces revalidation; otherwise the browser's HTTP cache answers with the same stale bytes and they get written back.
  const fresh = cached.then(({ cache, hit }) =>
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined)));

  // PITFALL: waitUntil must be called synchronously alongside respondWith; the worker may be killed once respondWith settles, and installed iOS then never picks up a new build.
  e.waitUntil(fresh);
  e.respondWith(cached.then(({ hit }) => hit || fresh));
});
