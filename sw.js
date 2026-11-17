const CACHE = 'wasteland-trial-v40';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/core.js',
  './js/world.js',
  './js/player.js',
  './js/weapons.js',
  './js/enemies.js',
  './js/fx.js',
  './js/audio.js',
  './js/smoke.js',
  './js/adventure.js',
  './js/daynight.js',
  './js/map.js',
  './js/vault.js',
  './js/hero.js',
  './js/melee.js',
  './js/soldiers.js',
  './js/soldier_ai.js',
  './js/horse.js',
  './js/sorcery.js',
  './js/ranged.js',
  './js/cloth.js',
  './js/envassets.js',
  './js/trees.js',
  './js/grass.js',
  './js/textures.js',
  './assets/tex/rock_c.jpg', './assets/tex/rock_n.jpg', './assets/tex/slate_c.jpg', './assets/tex/slate_n.jpg', './assets/tex/ground_c.jpg', './assets/tex/ground_n.jpg',
  './assets/tex/bark_c.jpg', './assets/tex/bark_n.jpg', './assets/tex/birch_c.jpg', './assets/tex/birch_n.jpg',
  './assets/hero.glb', './assets/ual2.bin', './assets/horse.glb',
  './vendor/addons/loaders/GLTFLoader.js',
  './vendor/addons/utils/BufferGeometryUtils.js',
  './vendor/addons/utils/SkeletonUtils.js',
  './js/wildlife.js',
  './vendor/three.module.js',
  './vendor/archivo.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => { })));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Network first. Cache-first meant every launch after a fix still ran the
  // previous build, so fixes looked like they had not landed at all.
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
