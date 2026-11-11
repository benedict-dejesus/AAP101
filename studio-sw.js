/* AAP101 Instructor Studio · service worker
   Makes the Studio installable as a desktop app. Network first: every launch
   loads the latest published Studio, and the cached copy is used only when
   the computer is offline, so the window still opens and says so.
   It never touches requests to Apps Script (other origin) or anything that is
   not a plain GET, so no student data or session is ever cached. */
'use strict';
const CACHE = 'aap101-studio-v1';
const SHELL = ['admin.html', 'assets/admin.css', 'assets/grades.css', 'assets/config.js', 'assets/content.js',
  'assets/grades.js', 'assets/admin.js', 'assets/icons/studio-192.png', 'studio.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('aap101-studio-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('admin.html') : Response.error()))));
});
