/* Офлайн-режим мобільних курсів (створює mobile-course/tools/make_pwa.py — руками не правити).
   Теми й перелік їхніх файлів комірник і сторінка offline.html беруть із самих сторінок курсу, тож після нової теми
   чи правки уроків нічого перегенеровувати не треба. */
const VER = '3ce08f1589';
const SHELL = 'kurs11';
const CORE = ["", "offline.html", "app.webmanifest", "icons/icon-192.png", "img/nezal.jpg", "img/perebud.jpg", "img/povoienni.jpg", "img/vidlyha.jpg", "img/zastij.jpg"];
const BASE = new URL('./', self.location).pathname;      // /nmt-history/
const ORIGIN = self.location.origin, META = 'mk-meta';
const cacheOf = d => 'mk-' + d;
const keyOf = url => { let p = url.pathname; if (p.endsWith('/index.html')) p = p.slice(0, -10); return url.origin + p; };   // без ?параметрів і #
const stamp = r => r ? (r.headers.get('etag') || r.headers.get('last-modified') || '') : '';
let DIRS = null, STALE = null;

const metaGet = async (k, d) => { try { const r = await (await caches.open(META)).match(ORIGIN + BASE + '__' + k); return r ? await r.json() : d; } catch (e) { return d; } };
const metaSet = async (k, v) => { try { await (await caches.open(META)).put(ORIGIN + BASE + '__' + k, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } })); } catch (e) {} };
function topicsOf(html) {     // теки тем — із рядка SHELL_TOPICS сторінки оболонки
  const m = html.match(/const SHELL_TOPICS = (\[[\s\S]*?\]);\s*\n/); if (!m) return null;
  try { return JSON.parse(m[1]).map(t => String(t.url || '').replace(/^(\.\.\/)+/, '').replace(/\/+$/, '')).filter(Boolean); } catch (e) { return null; }
}
async function dirs() {
  if (DIRS) return DIRS;
  let d = await metaGet('dirs', null);
  if (!d) { try { const r = await (await caches.open(cacheOf(SHELL))).match(ORIGIN + BASE + SHELL + '/'); if (r) d = topicsOf(await r.text()); } catch (e) {} }
  DIRS = [SHELL].concat((d || []).filter(x => x !== SHELL)); return DIRS;
}
async function learn(resp) {   // свіжа сторінка оболонки → оновити список тек
  try { const d = topicsOf(await resp.text()); if (d && d.length) { DIRS = [SHELL].concat(d); await metaSet('dirs', d); } } catch (e) {}
}
async function stale() { if (!STALE) STALE = await metaGet('stale', []); return STALE; }

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(cacheOf(SHELL));
    await Promise.all(CORE.map(async f => { try { const u = ORIGIN + BASE + SHELL + '/' + f; const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) { if (f === '') await learn(r.clone()); await c.put(u, r); } } catch (err) {} }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
const timeout = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(v => { clearTimeout(t); ok(v); }, err => { clearTimeout(t); no(err); }); });

async function handle(req, url) {
  const d = url.pathname.slice(BASE.length).split('/')[0];
  if (!(await dirs()).includes(d)) return fetch(req);            // решта сайту — як без комірника
  const key = keyOf(url), page = req.mode === 'navigate' || key.endsWith('/') || key.endsWith('.html');
  const c = await caches.open(cacheOf(d));
  if (page) {                                   // сторінки: спершу мережа (свіжа версія), без мережі — збережена
    try {
      const r = await timeout(fetch(req, { cache: 'no-cache' }), 5000);
      if (r.ok) {
        const old = await c.match(key);
        if (key.endsWith('/')) {
          if (d === SHELL) await learn(r.clone());
          else if (old && stamp(old) && stamp(old) !== stamp(r)) { const s = await stale(); if (!s.includes(d)) { s.push(d); await metaSet('stale', s); } }   // тему оновлено — зображення перевіряти в мережі
        }
        await c.put(key, r.clone());
      }
      return r;
    } catch (err) { const hit = await c.match(key); if (hit) return hit; throw err; }
  }
  const hit = await c.match(key);
  if (hit && (await stale()).includes(d)) {     // тему змінювали: спершу мережа, збережене — про запас
    try { const r = await timeout(fetch(req, { cache: 'no-cache' }), 4000); if (r.ok) { await c.put(key, r.clone()); return r; } } catch (err) {}
    return hit;
  }
  if (hit) return hit;                          // зображення: спершу збережене
  const r = await fetch(req); if (r.ok) c.put(key, r.clone()); return r;
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== ORIGIN || !url.pathname.startsWith(BASE)) return;       // сервер результатів (Google) — завжди напряму
  e.respondWith(handle(req, url));
});
self.addEventListener('message', e => { if (e.data === 'meta') { DIRS = null; STALE = null; } else if (e.data === 'ver') e.source.postMessage({ ver: VER }); });
