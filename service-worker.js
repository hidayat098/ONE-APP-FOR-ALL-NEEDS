// Sistem Operasional Kendari — Service Worker
// Naikkan CACHE_VERSION setiap kali menaruh update besar, supaya perangkat lama
// membuang cache sebelumnya dan mengambil versi terbaru.
const CACHE_VERSION = 'ops-kendari-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Jangan pernah ikut campur dengan panggilan ke Supabase (data harus selalu
// yang terbaru dari server) -- biarkan browser menanganinya langsung.
function isBypassed(url) {
  return url.includes('supabase.co');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (isBypassed(url)) return; // network-only, tidak lewat SW sama sekali

  // Navigasi (buka/refresh halaman): coba jaringan dulu supaya update terbaru
  // langsung terlihat kalau online; kalau offline/gagal, pakai salinan cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Aset statis & pustaka CDN (font, xlsx, jspdf, qrcode, html2canvas, dst):
  // cache-first, sambil diam-diam diperbarui di latar belakang (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
