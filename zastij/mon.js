/* ---------- Спостереження під час роботи (спільне для тестів і практичних робіт) ----------
   Сторінка перед цим файлом оголошує MONCFG:
     key      — ключ localStorage;
     active() — чи йде зараз робота (є спроба й таймер);
     who()    — {test, attempt, name, cls} для сервера;
     beat()   — додаткові поля пульсу, напр. {cur, answered};
     onBeat(j)— (необов’язково) відповідь сервера на пульс;
     fsSlot   — (необов’язково) id елемента, куди поставити кнопку «На весь екран».
   Що фіксується (подія йде на сервер):
     hide0/hide — сторінку залишено (інший застосунок, згорнутий браузер, заблокований екран) на 3 с і довше;
     blur       — активне інше вікно 5 с і довше (напр., дотик до другої половини розділеного екрана);
     small0/small — зменшене вікно: розділений екран чи спливне вікно (клавіатуру не плутаємо з цим);
     off        — зв’язку з ноутбуком не було;  reload — сторінку перезавантажено.
   Коротші виходи й втрати фокуса подій не дають: їх лише підраховано в підсумку («короткі»).
   Вихід з повноекранного режиму НЕ фіксується (на телефонах він стається сам — від клавіатури, жестів,
   сповіщень): з’являється лише непомітна кнопка «На весь екран». */
(function(){
const C = (typeof MONCFG !== 'undefined') ? MONCFG : window.MONCFG;
const HB = 45000, HIDE_MIN = 3000, BLUR_MIN = 5000;
let M = null, timer = null;
const now = () => Date.now();
function fresh(att){ return {att, q:[], hide:{n:0,ms:0}, blur:{n:0,ms:0}, small:{n:0,ms:0}, off:{n:0,ms:0}, reload:{n:0}, short:{n:0},
  hideAt:null, hideSent:false, blurAt:null, smallAt:null, offAt:null, maxW:{}, maxH:{}, seq:0}; }
function load(){ try{ M = JSON.parse(localStorage.getItem(C.key)); }catch(e){ M = null; } }
function save(){ try{ localStorage.setItem(C.key, JSON.stringify(M)); }catch(e){} }
function ensure(){
  if(!C.active()) return false;
  if(!M) load();
  const att = C.who().attempt;
  if(!M || M.att!==att){ M = fresh(att); save(); }
  if(!M.maxW) M.maxW = {}; if(!M.maxH) M.maxH = {}; if(!M.short) M.short = {n:0};
  return true;
}
function post(path, body){
  return fetch(path, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body), keepalive:true, cache:'no-store'})
    .then(r => r.ok ? r.json() : Promise.reject(r.status));
}
function ev(kind, dur){
  if(!ensure()) return;
  M.seq++; M.q.push(Object.assign(C.who(), {id:M.att+'#'+M.seq, kind, dur:dur||0, at:now()}));
  if(M.q.length > 200) M.q = M.q.slice(-200);
  save(); flush();
}
let flushing = false;
function flush(){
  if(flushing || !M || !M.q.length) return;
  flushing = true;
  const batch = M.q.slice(0, 20);
  post('/event', {events:batch}).then(j => {
    if(j && j.ok){ const ids = new Set(batch.map(e=>e.id)); M.q = M.q.filter(e=>!ids.has(e.id)); save(); }
  }).catch(()=>{}).finally(() => { flushing = false; if(M && M.q.length && !M.offAt) setTimeout(flush, 1500); });
}
function beat(){
  if(!ensure()){ stopTimer(); return; }
  checkSize();
  const ctl = ('AbortController' in window) ? new AbortController() : null;
  const to = ctl ? setTimeout(()=>ctl.abort(), 30000) : null;
  fetch('/hb', {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, cache:'no-store', signal:ctl?ctl.signal:undefined,
    body:JSON.stringify(Object.assign(C.who(), C.beat ? C.beat() : {}, {hidden:document.hidden}))})
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(j => {
      if(M.offAt){ const d = now()-M.offAt; M.offAt=null; M.off.n++; M.off.ms+=d; save(); ev('off', d); }
      flush();
      if(C.onBeat) try{ C.onBeat(j); }catch(e){}
    })
    .catch(() => { if(M && !M.offAt){ M.offAt = now(); save(); } })
    .finally(() => { if(to) clearTimeout(to); });
}
function startTimer(){ if(!timer){ timer = setInterval(beat, HB); beat(); } }
function stopTimer(){ if(timer){ clearInterval(timer); timer = null; } }

/* --- вихід зі сторінки: подія лише якщо не було 3 с і довше --- */
let hideT = null;
document.addEventListener('visibilitychange', () => {
  if(!ensure()) return;
  if(document.hidden){
    if(!M.hideAt){ M.hideAt = now(); M.hideSent = false; M.blurAt = null; save();
      clearTimeout(hideT); hideT = setTimeout(() => { if(M && M.hideAt && !M.hideSent){ M.hideSent = true; save(); ev('hide0'); } }, HIDE_MIN); }
  } else if(M.hideAt){
    clearTimeout(hideT);
    const d = now()-M.hideAt, sent = M.hideSent; M.hideAt = null; M.hideSent = false;
    if(d >= HIDE_MIN){ M.hide.n++; M.hide.ms += d; save(); if(!sent) ev('hide0'); ev('hide', d); }
    else { M.short.n++; save(); }
    beat();
  }
});
/* --- втрата фокуса при видимій сторінці --- */
addEventListener('blur', () => { if(!ensure() || document.hidden) return; if(!M.blurAt){ M.blurAt = now(); save(); } });
addEventListener('focus', () => {
  if(!ensure() || !M.blurAt) return;
  const d = now()-M.blurAt; M.blurAt = null;
  if(M.hideAt){ save(); return; }
  if(d >= BLUR_MIN){ M.blur.n++; M.blur.ms += d; save(); ev('blur', d); }
  else { M.short.n++; save(); }
});
/* --- зменшене вікно ---
   Розділений екран «поруч» зменшує ширину, «одне над одним» — висоту. Висоту не перевіряємо, поки
   учень вводить текст (клавіатура теж зменшує висоту), і ще 2 с після цього. Межі рахуються окремо для
   книжкової й альбомної орієнтації, тож поворот телефона не дає зауважень. */
let typingUntil = 0;
const isField = el => !!el && (el.tagName==='INPUT' || el.tagName==='TEXTAREA' || el.isContentEditable);
document.addEventListener('focusin', e => { if(isField(e.target)) typingUntil = Infinity; });
document.addEventListener('focusout', e => { if(isField(e.target)) typingUntil = now() + 2500; });
function orient(){
  try{ if(screen.orientation && screen.orientation.type) return screen.orientation.type.indexOf('landscape')===0 ? 'L' : 'P'; }catch(e){}
  if(typeof window.orientation === 'number') return Math.abs(window.orientation)===90 ? 'L' : 'P';
  return (screen.width||0) > (screen.height||0) ? 'L' : 'P';
}
function smallNow(){
  const o = orient(), w = innerWidth, h = innerHeight;
  const typing = typingUntil > now() || isField(document.activeElement);
  if(w > (M.maxW[o]||0)) M.maxW[o] = w;
  if(!typing && h > (M.maxH[o]||0)) M.maxH[o] = h;
  const coarse = matchMedia('(pointer:coarse)').matches;
  if(w < 0.75*M.maxW[o]) return true;
  if(coarse && !typing && M.maxH[o] && h < 0.6*M.maxH[o]) return true;
  return false;
}
let pend = null;
function checkSize(){
  if(!ensure()) return;
  const small = smallNow(); save();
  if(small && !M.smallAt){
    if(pend===null){ pend = setTimeout(() => { pend = null; if(ensure() && smallNow() && !M.smallAt){ M.smallAt = now(); save(); ev('small0'); } }, 2500); }
  } else if(!small){
    if(pend!==null){ clearTimeout(pend); pend = null; }
    if(M.smallAt){ const d = now()-M.smallAt; M.smallAt = null; M.small.n++; M.small.ms += d; save(); ev('small', d); }
  }
}
let rz = null;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(checkSize, 800); });

/* --- повний екран: лише пропозиція, без зауважень --- */
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const canFs = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function fsReq(){
  const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
  if(!f) return;
  try{ const p = f.call(el, {navigationUI:'hide'}); if(p && p.catch) p.catch(()=>{}); }catch(e){}
}
function fsBtn(){
  const show = canFs() && C.active() && !fsEl();
  let b = document.getElementById('fsbtn');
  if(!show){ if(b) b.remove(); return; }
  const slot = C.fsSlot ? document.getElementById(C.fsSlot) : null;
  if(b && slot && b.parentNode!==slot){ b.remove(); b = null; }
  if(b) return;
  b = document.createElement('button'); b.id = 'fsbtn'; b.type = 'button'; b.title = 'На весь екран'; b.setAttribute('aria-label','На весь екран');
  b.textContent = '⛶';
  b.onclick = e => { e.preventDefault(); fsReq(); };
  if(slot){ b.className = 'fsbtn-in'; slot.appendChild(b); }
  else { b.style.cssText = 'position:fixed;right:10px;bottom:84px;z-index:30;width:40px;height:40px;border-radius:50%;border:1px solid rgba(127,127,127,.4);background:rgba(127,127,127,.18);color:inherit;font:18px/1 system-ui,sans-serif;cursor:pointer;opacity:.75'; document.body.appendChild(b); }
}
document.addEventListener('fullscreenchange', fsBtn);
document.addEventListener('webkitfullscreenchange', fsBtn);

/* --- виклики зі сторінки --- */
window.monCanFs = canFs;
window.monFsReq = fsReq;
window.monFsBtn = fsBtn;   // сторінка викликає після перемальовування
window.monGo = function(){ if(canFs()) fsReq(); setTimeout(() => { if(ensure()){ checkSize(); startTimer(); } fsBtn(); }, 300); };
window.monStop = function(){
  stopTimer(); const b = document.getElementById('fsbtn'); if(b) b.remove();
  if(fsEl()){ const x = document.exitFullscreen || document.webkitExitFullscreen; try{ const p = x && x.call(document); if(p && p.catch) p.catch(()=>{}); }catch(e){} }
};
window.monBeat = beat;
window.monSummary = function(){
  if(!M) load();
  if(!M || M.att!==C.who().attempt) return null;
  const t = now();
  const open = (o, at) => at ? {n:o.n+1, ms:o.ms+(t-at)} : {n:o.n, ms:o.ms};
  const hideOpen = M.hideAt && t-M.hideAt >= HIDE_MIN;
  return {hide: hideOpen ? open(M.hide, M.hideAt) : {n:M.hide.n, ms:M.hide.ms}, blur:{n:M.blur.n, ms:M.blur.ms}, small:open(M.small, M.smallAt),
          off:open(M.off, M.offAt), reload:{n:M.reload.n}, short:{n:(M.short||{n:0}).n}};
};
addEventListener('load', () => {
  if(!ensure()) return;              // сторінку відкрито посеред роботи — перезавантаження
  M.reload.n++; M.blurAt = null; save(); ev('reload');
  if(M.hideAt){ const d = now()-M.hideAt; M.hideAt = null; if(d >= HIDE_MIN){ M.hide.n++; M.hide.ms += d; save(); ev('hide', d); } else { M.short.n++; save(); } }
  startTimer(); checkSize(); fsBtn();
});
})();
