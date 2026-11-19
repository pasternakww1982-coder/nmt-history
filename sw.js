/* Офлайн-режим мобільних курсів (створює mobile-course/tools/make_pwa.py — руками не правити). */
const VER = '2e7b129784';
const DIRS = ["kurs11", "povoienni", "vidlyha", "zastij-kurs", "perebud", "nezal"];          // теки, які обслуговує комірник; решта сайту йде повз нього
const SHELL = 'kurs11';
const CORE = ["", "offline.html", "app.webmanifest", "offline.json", "icons/icon-192.png", "img/nezal.jpg", "img/perebud.jpg", "img/povoienni.jpg", "img/vidlyha.jpg", "img/zastij.jpg"];
const BASE = new URL('./', self.location).pathname;      // /nmt-history/
const cacheOf = d => 'mk-' + d;
const dirOf = url => { const p = url.pathname; if (!p.startsWith(BASE)) return null; const d = p.slice(BASE.length).split('/')[0]; return DIRS.includes(d) ? d : null; };
const keyOf = url => { let p = url.pathname; if (p.endsWith('/index.html')) p = p.slice(0, -10); return url.origin + p; };   // без ?параметрів і #

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(cacheOf(SHELL));
    await Promise.all(CORE.map(async f => { try { const u = BASE + SHELL + '/' + f; const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await c.put(new URL(u, self.location).href, r); } catch (err) {} }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set(DIRS.map(cacheOf));
    for (const k of await caches.keys()) if (k.startsWith('mk-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});
const timeout = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(v => { clearTimeout(t); ok(v); }, err => { clearTimeout(t); no(err); }); });

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;       // сервер результатів (Google) — завжди напряму
  const d = dirOf(url); if (!d) return;
  const key = keyOf(url), page = req.mode === 'navigate' || key.endsWith('/') || key.endsWith('.html') || key.endsWith('.json');
  e.respondWith((async () => {
    const c = await caches.open(cacheOf(d));
    if (page) {                                   // сторінки: спершу мережа (свіжа версія), без мережі — збережена
      try { const r = await timeout(fetch(req, { cache: 'no-cache' }), 5000); if (r.ok) c.put(key, r.clone()); return r; }
      catch (err) { const hit = await c.match(key); if (hit) return hit; throw err; }
    }
    const hit = await c.match(key);               // зображення: спершу збережене
    if (hit) return hit;
    const r = await fetch(req); if (r.ok) c.put(key, r.clone()); return r;
  })());
});
self.addEventListener('message', e => { if (e.data === 'ver') e.source.postMessage({ ver: VER }); });
