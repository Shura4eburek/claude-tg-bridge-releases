// Служебный работник приложения (016, FR-002): офлайн-оболочка, чтобы иконка на главном
// экране открывалась и без сети, — и ничего больше. Ответы моста (/api/) и точки встречи
// (ntfy.sh) только из сети: из кэша приложение показало бы прошлое состояние сессий или
// старый адрес компьютера. Оболочка — «сначала сеть»: правка мини-аппы доезжает сразу,
// кэш нужен только когда сети нет. Регистрируется лишь вне Telegram (index.html).

const CACHE = 'ctb-shell';
const SHELL = ['./', 'index.html', 'manifest.webmanifest'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Чужие адреса (машины, ntfy, скрипт Telegram) — мимо: браузер сходит сам.
  if (url.origin !== self.location.origin) return;
  // Страницу отдаёт сам мост (Tailscale, ZeroTier) — его API на том же origin.
  if (url.pathname.includes('/api/') || url.pathname.includes('/legacy/')) return;
  ev.respondWith(fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit ?? caches.match('index.html'))));
});
