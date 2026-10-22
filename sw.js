// Service worker: приложение открывается без сети.
// Свои файлы берём из сети (чтобы обновления были видны сразу), без сети — из кэша.
// Запросы к Supabase не трогаем.

const CACHE = 'ucheba-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/app.css',
  'vendor/preact.module.js', 'vendor/hooks.module.js', 'vendor/htm.module.js', 'vendor/supabase.js',
  'js/main.js', 'js/html.js', 'js/config.js', 'js/store.js', 'js/model.js', 'js/date.js', 'js/seed.js', 'js/ui.js', 'js/notify.js',
  'js/views/today.js', 'js/views/schedule.js', 'js/views/tasks.js', 'js/views/calendar.js', 'js/views/subjects.js',
  'js/views/session.js', 'js/views/extras.js', 'js/views/settings.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    try {
      const r = await fetch(e.request, { cache: 'no-cache' });
      if (r.ok) cache.put(e.request, r.clone());
      return r;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true }))
        || (e.request.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list[0] ? list[0].focus() : self.clients.openWindow('./')));
});
