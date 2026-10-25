'use strict';
/* Luma Launcher. Главный экран собирается из блоков, баннер сверху из любых блоков (кроме приложений и каналов).
   Источники: приложения, Luma (лента, которую публикует Luma TV), каналы других приложений Google TV (YouTube, Зона, Lampa…). */
const N = typeof Native !== 'undefined' ? Native : null;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jget = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const setText = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };

/* ---------- настройки ---------- */
/* Настройки по умолчанию: ряды и их порядок, источники баннера, приложения в ряду. Новые, ещё не известные блоки добавляются в конец выключенными. */
const DEFAULTS = {"sections": ["apps", "cont", "favs", "l:tm0", "wn", "c:com.google.android.youtube.tv|Рекомендовано вам", "c:com.google.android.youtube.tv|В тренде", "c:free.zona|Популярные фильмы", "c:free.zona|Популярные сериалы", "c:ru.yourok.torrserve|Торренты", "c:ru.yourok.num|История", "c:top.rootu.lamps|Рекомендации", "c:top.rootu.lamps|История", "c:tv.twitch.android.app|Рекомендованные трансляции", "c:tv.twitch.android.app|Рекомендуемые игры", "c:ru.yourok.num|Новые фильмы", "c:ru.yourok.num|Новые сериалы", "c:ru.yourok.num|Мультфильмы", "c:ru.yourok.num|Мультсериалы", "c:ru.yourok.num|Лучшие фильмы", "c:ru.yourok.num|Фильмы в 4К", "c:ru.yourok.num|Аниме", "c:com.google.android.youtube.tv|YouTube Music", "l:rNew", "l:tm2", "l:tm3", "l:tm4", "l:tm1", "l:rSer", "l:rTop", "l:rCar", "l:rAni", "l:rShow", "tv"], "on": ["apps", "cont", "l:rNew", "l:tm1"], "banner": ["cont", "l:tm0", "favs", "wn", "c:com.google.android.youtube.tv|Рекомендовано вам", "c:com.google.android.youtube.tv|В тренде", "c:free.zona|Популярные фильмы", "c:free.zona|Популярные сериалы", "c:ru.yourok.torrserve|Торренты", "c:ru.yourok.num|История", "c:top.rootu.lamps|Рекомендации", "c:top.rootu.lamps|История", "c:tv.twitch.android.app|Рекомендованные трансляции", "c:tv.twitch.android.app|Рекомендуемые игры", "c:ru.yourok.num|Новые фильмы", "c:ru.yourok.num|Новые сериалы", "c:ru.yourok.num|Мультфильмы", "c:ru.yourok.num|Мультсериалы", "c:ru.yourok.num|Лучшие фильмы", "c:ru.yourok.num|Фильмы в 4К", "c:ru.yourok.num|Аниме", "c:com.google.android.youtube.tv|YouTube Music", "l:tm1", "l:tm2", "l:tm3", "l:tm4", "l:rNew", "l:rSer", "l:rTop", "l:rCar", "l:rAni", "l:rShow"], "bannerOn": ["l:tm0"], "appsOrder": ["ws.luma.tv", "top.rootu.lamps", "com.google.android.youtube.tv", "tv.twitch.android.app", "io.lift.app", "com.instagram.airwave", "io.github.romanvht.byedpi", "free.zona", "com.mitv.gallery", "com.xiaomi.mitv.mediaexplorer", "com.android.tv.settings", "com.android.vending", "com.falcofemoralis.hdrezkaapp", "to.pda.falcofemoralis.hdrezkaapp", "com.cxinventor.file.explorer", "com.xiaomi.mitv.smartshare", "com.limelight", "ru.yourok.num", "com.google.android.play.games", "ru.rutube.app", "com.yablio.sendfilestotv", "com.ottplay.ottplay", "ru.yourok.torrserve", "org.videolan.vlc"], "pin": ["ws.luma.tv", "top.rootu.lamps", "com.google.android.youtube.tv", "com.falcofemoralis.hdrezkaapp", "io.lift.app", "com.instagram.airwave", "tv.twitch.android.app", "io.github.romanvht.byedpi"]};
const DEF_SECTIONS = DEFAULTS.on, DEF_BANNER = DEFAULTS.bannerOn;
const PIN_DEFAULT = DEFAULTS.pin;
function freshCfg(dismiss) {
  return { hero: true, luma: true, channels: true, weather: true,
    sections: DEFAULTS.sections.map((id) => ({ id, on: DEFAULTS.on.includes(id) })),
    banner: { order: DEFAULTS.banner.map((id) => ({ id, on: DEFAULTS.bannerOn.includes(id) })) },
    apps: { order: [...DEFAULTS.appsOrder], pin: Object.fromEntries(DEFAULTS.pin.map((p) => [p, 1])) }, dismiss: dismiss || {} };
}
const cfg = jget('lc.cfg', null) || freshCfg();
for (const k of ['hero', 'luma', 'channels', 'weather']) cfg[k] = cfg[k] !== false;
cfg.sections = (cfg.sections || []).map((s) => (s.id === 'trend' ? { id: 'l:tm0', on: s.on } : s));
cfg.banner = cfg.banner || { order: [] };
cfg.apps = cfg.apps || { order: [], pin: null };
cfg.dismiss = cfg.dismiss || {};
const saveCfg = () => jset('lc.cfg', cfg);

/* ---------- данные ---------- */
const LUMA_SECTIONS = [['tm0', 'В тренде на этой неделе'], ['tm1', 'Сериалы в тренде'], ['tm2', 'Сейчас в кино'], ['tm3', 'Лучшие фильмы всех времён'], ['tm4', 'Скоро выйдут'],
  ['rNew', 'Новинки кино'], ['rSer', 'Новые сериалы'], ['rTop', 'Лучшее по Кинопоиску'], ['rCar', 'Мультфильмы'], ['rAni', 'Аниме'], ['rShow', 'ТВ-шоу']];
let apps = [], feed = jget('lc.feed', {}), lumaOn = false, tv = { channels: [], next: [] }, snap = '', REG = {};
function readData() {
  if (!N) return;
  try { apps = JSON.parse(N.apps()); } catch { apps = []; }
  try { lumaOn = N.lumaInstalled(); } catch { lumaOn = false; }
  try { const f = JSON.parse(N.feed()); if (f && f.v) { feed = f; jset('lc.feed', f); } } catch {}
  if (cfg.channels) { try { tv = JSON.parse(N.channels()); } catch { tv = { error: 'ERR' }; } } else tv = { channels: [], next: [] };
  if (!cfg.apps.pin && apps.length) {   // первый запуск: в ряд попадают привычные приложения, остальные в «Все приложения»
    cfg.apps.pin = {}; for (const p of PIN_DEFAULT) if (apps.some((a) => a.p === p)) cfg.apps.pin[p] = 1;
    if (Object.keys(cfg.apps.pin).length < 3) for (const a of apps) if (a.tv) cfg.apps.pin[a.p] = 1;
    saveCfg();
  }
  buildReg();
}
const lumaFeed = () => cfg.luma && lumaOn;
const sub = (h) => (h.season ? `Сезон ${h.season} · серия ${h.episode}` : '');
const imgUrl = (u) => (!u ? '' : /^https?:/.test(u) ? u : 'tvimg?u=' + encodeURIComponent(u));
const feedSections = () => feed.sections || (feed.hero ? { tm0: { items: feed.hero } } : {});

/* Реестр блоков: id → {title, src, items:[карточка]}. Карточка: {key,name,sub,img,cls,pct,bd,poster,overview,genres,tag,act,more,rm}. */
function buildReg() {
  const R = {}, put = (b) => { if (b.apps || (b.items && b.items.length)) R[b.id] = b; };
  put({ id: 'apps', title: 'Приложения', src: 'Лаунчер', apps: true, nobanner: true });
  if (lumaFeed()) {
    const bd = new Map();
    for (const s of Object.values(feedSections())) for (const h of s.items || []) if (h.backdrop && !bd.has(h.id)) bd.set(h.id, h);
    const card = (h, o = {}) => {
      const b = h.backdrop ? h : bd.get(h.id) || {};
      return { key: 'luma:' + h.id, ts: h.ts || 0, name: h.name, sub: sub(h) || h.year || '', cls: o.cls || 'poster', img: o.land && b.backdrop ? b.backdrop : h.poster || '', bd: b.backdrop || '', poster: h.poster || '',
        pct: h.pct || 0, season: h.season, episode: h.episode, year: h.year, rating: h.rating, overview: b.overview || h.overview || '', genres: b.genres || h.genres || [], tag: o.tag,
        act: () => N && N.openLuma(+h.id, !!o.play), more: () => N && N.openLuma(+h.id, false), rm: o.rm };
    };
    put({ id: 'cont', title: 'Продолжить просмотр', src: 'Luma', items: (feed.cont || []).filter((h) => !((cfg.dismiss['luma:' + h.id] || 0) >= (h.ts || 0) && cfg.dismiss['luma:' + h.id])).map((h) => card(h, { play: true, rm: true })) });
    const chan = (c) => ({ key: 'tv:' + c.id, name: c.name, sub: c.group || '', cls: 'chan', img: c.logo || '', act: () => N && N.openLumaTv(c.id), more: null });
    put({ id: 'tv', title: 'Недавние каналы', src: 'Luma', nobanner: true, items: (feed.tv || []).map(chan) });
    put({ id: 'tvfav', title: 'Избранные каналы', src: 'Luma', nobanner: true, items: (feed.tvfav || []).map(chan) });
    put({ id: 'favs', title: 'Избранное из Luma', src: 'Luma', items: (feed.favs || []).map((h) => card(h, {})) });
    const secs = feedSections();
    for (const [id, title] of LUMA_SECTIONS) {
      const items = (secs[id] && secs[id].items) || [];
      const land = items.filter((h) => h.backdrop).length * 2 >= items.length;
      put({ id: 'l:' + id, title, src: 'Luma', items: items.map((h) => card(h, { cls: land ? 'land' : 'poster', land, tag: title })) });
    }
  }
  if (cfg.channels && tv.next) {
    const nx = tv.next.map((it) => chCard(it, it.app, 'Продолжить', 'wn:' + it.app + it.t)).filter((c) => !cfg.dismiss[c.key]);
    put({ id: 'wn', title: 'Продолжить в приложениях', name: 'Продолжить просмотр', src: 'Google TV', items: nx });
  }
  if (cfg.channels) for (const ch of tv.channels || []) put({ id: 'c:' + ch.p + '|' + ch.name, title: ch.app === ch.name ? ch.name : `${ch.app} · ${ch.name}`, name: ch.name, src: ch.app, items: ch.items.map((it) => chCard(it, ch.app, ch.name, 'c:' + ch.p + it.t)) });
  REG = R;
  // порядок и видимость: новые блоки добавляются в конец, включены только привычные
  for (const [list, defs, banner] of [[cfg.sections, DEF_SECTIONS, false], [cfg.banner.order, DEF_BANNER, true]]) {
    for (const id of Object.keys(R)) if (!list.some((s) => s.id === id) && !(banner && R[id].nobanner)) list.push({ id, on: defs.includes(id) });
  }
}
function chCard(it, app, chName, key) {
  const ar = it.ar, cls = ar <= 2 ? 'land' : ar === 3 ? 'sq' : 'poster', u = imgUrl(it.img);
  return { key, name: it.t, sub: '', cls, img: u, bd: ar <= 2 ? u : '', poster: ar > 2 ? u : '', pct: it.pct || 0, overview: it.d || '', genres: [], tag: app + ' · ' + chName,
    act: () => N && N.openUri(it.uri), more: null, rm: key.startsWith('wn:'), resume: key.startsWith('wn:') };
}
const shown = (list) => list.filter((s) => REG[s.id]);
const blockList = () => shown(cfg.sections);
const bannerList = () => shown(cfg.banner.order).filter((s) => !REG[s.id].nobanner);

/* ---------- баннер ---------- */
const HERO = { items: [], i: 0, timer: 0, cur: null };
function heroItems() {
  if (!cfg.hero) return [];
  const out = [], seen = new Set();
  for (const s of bannerList()) {
    if (!s.on) continue;
    const b = REG[s.id]; let n = 0;
    for (const it of b.items) {
      if (n >= (s.id === 'cont' ? 3 : cfg.bannerPer || 5)) break;
      if (s.id === 'cont' && !(it.pct > 0 || it.season)) continue;
      if (seen.has(it.key)) continue;
      seen.add(it.key); n++;
      out.push({ ...it, tag: s.id === 'cont' ? 'Продолжить просмотр' : it.tag || b.title, resume: s.id === 'cont' || it.resume, star: s.id !== 'cont' });
    }
  }
  return out.slice(0, 12);
}
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>';
function paintHero() {
  const box = $('#hero'), h = HERO.items[HERO.i]; if (!box || !h) return;
  // новый слой появляется поверх старого только когда картинка уже декодирована: без морганий при смене
  const layer = document.createElement('div');
  layer.className = 'hb' + (h.bd ? '' : ' hbp');
  const src = h.bd || h.poster;
  const im = new Image(); im.alt = ''; im.decoding = 'async'; im.className = h.bd ? 'hbi' : 'hbq';
  if (src) layer.appendChild(im);
  HERO.cur = layer; $('.hbgs', box).appendChild(layer);
  const show = () => {
    if (HERO.cur !== layer) { layer.remove(); return; }
    requestAnimationFrame(() => { layer.classList.add('on'); setTimeout(() => $$('.hb', box).forEach((x) => { if (x !== HERO.cur) x.remove(); }), 1000); });
  };
  if (src) { im.src = src; (im.decode ? im.decode() : Promise.reject()).then(show, show); } else show();
  $('.htag', box).innerHTML = (h.star ? STAR : '') + `<span>${esc(h.tag)}</span>`;
  setText($('.htitle', box), h.name);
  $('.hmeta', box).innerHTML = [h.year && `<span>${esc(h.year)}</span>`, h.rating > 0 && `<span class="g">★ ${h.rating.toFixed(1)}</span>`, sub(h) && `<span>${esc(sub(h))}</span>`,
    ...(h.genres || []).slice(0, 3).map((g) => `<span class="c">${esc(g)}</span>`)].filter(Boolean).join('');
  setText($('.hdesc', box), h.overview || '');
  const pr = $('.hprog', box), has = h.pct > 0; pr.style.display = has ? '' : 'none'; $('i', pr).style.width = Math.max(2, h.pct) + '%';
  setText($('[data-a="hero:play"] span', box), has || (h.resume && h.season) ? 'Продолжить' : 'Смотреть');
  $('[data-a="hero:more"]', box).style.display = h.more ? '' : 'none';
  $('.hdots', box).innerHTML = HERO.items.length > 1 ? HERO.items.map((_, k) => `<i class="${k === HERO.i ? 'on' : ''}"></i>`).join('') : '';
  const hin = $('.hin', box); hin.classList.remove('sw'); void hin.offsetWidth; hin.classList.add('sw');
}
function slideHero(d) { HERO.i = (HERO.i + d + HERO.items.length) % HERO.items.length; paintHero(); kickHero(); }
function kickHero() {
  clearInterval(HERO.timer);
  if (HERO.items.length > 1) HERO.timer = setInterval(() => { if (mode === 'home' && pageY === 0 && !document.hidden) slideHero(1); }, 10000);
}

/* ---------- главный экран ---------- */
let pageY = 0, ACTS = [];
const ph = (t) => `<div class="ph">${esc(t)}</div>`;
function card(cls, item, inner, lab) { const i = ACTS.push(item) - 1; return `<div class="c f ${cls}" data-i="${i}"><div class="cw">${inner}</div>${lab ? `<div class="lab">${lab}</div>` : ''}</div>`; }
const cimg = (src, alt) => ph(alt) + (src ? `<img src="${esc(src)}" alt="" decoding="async" onload="this.previousElementSibling.style.display='none'" onerror="this.remove()">` : '');
const ALL_ICON = '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>';
const appCard = (a) => card('app', { go: () => N && N.launch(a.p), menu: () => appMenu(a) }, `<img src="icon/${esc(a.p)}.png" alt="" decoding="async">`, esc(a.l));
const pinned = () => appList().filter((a) => cfg.apps.pin && cfg.apps.pin[a.p]);
function appList() {
  const idx = new Map(cfg.apps.order.map((p, i) => [p, i]));
  const key = (a) => (idx.has(a.p) ? idx.get(a.p) : 1e5 + (a.p === 'ws.luma.tv' ? 0 : 1e4) + (a.tv ? 0 : 1e3));
  return [...apps].sort((a, b) => key(a) - key(b) || a.l.localeCompare(b.l, 'ru'));
}
function sectionHtml(s) {
  const b = REG[s.id]; let items = '';
  if (b.apps) items = pinned().map((a) => appCard(a)).join('') + card('app allc', { go: () => openAll() }, `<div class="allbox">${ALL_ICON}</div>`, 'Все приложения');
  else items = b.items.slice(0, 30).map((it) => {
    const item = { go: it.act, menu: it.rm ? () => itemMenu(it) : null };
    const lt = it.cls === 'land' ? `<div class="lt">${esc(it.name)}</div>` : '';
    const bar = it.pct > 0 ? `<div class="pb"><i style="width:${Math.max(3, it.pct)}%"></i></div>` : '';
    return card(it.cls, item, cimg(it.img, it.name) + lt + bar, it.cls === 'land' ? esc(it.sub) : `${esc(it.name)}<small>${esc(it.sub)}</small>`);
  }).join('');
  return `<section class="sec" data-id="${esc(s.id)}"><h2 class="rl">${esc(b.title)}</h2><div class="track">${items}</div></section>`;
}
const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
function buildHome() {
  ACTS = [];
  HERO.items = heroItems(); if (HERO.i >= HERO.items.length) HERO.i = 0;
  const has = HERO.items.length > 0;
  let h = `<section id="hero" class="${has ? '' : 'off'}"><div class="hbgs"></div><div class="hshade"></div><div class="hin">
    <div class="htag"></div><h1 class="htitle"></h1><div class="hmeta"></div><p class="hdesc"></p><div class="hprog"><i></i></div>
    <div class="hbtns"><button class="btn primary f" data-a="hero:play">${PLAY}<span>Смотреть</span></button><button class="btn f" data-a="hero:more"><span>Подробнее</span></button></div></div><div class="hdots"></div></section>`;
  for (const s of blockList()) if (s.on) h += sectionHtml(s);
  $('#page').innerHTML = h;
  rows = [{ id: 'top', items: $$('#top .f') }];
  if (has) rows.push({ id: 'hero', items: $$('#hero .f') });
  for (const sec of $$('#page .sec')) rows.push({ id: sec.dataset.id, el: sec, items: $$('.f', sec), sx: 0, c: 0 });
  if (has) { paintHero(); kickHero(); } else clearInterval(HERO.timer);
  for (const h of HERO.items) if (h.bd) new Image().src = h.bd;   // заранее: на диск, чтобы смена баннера и следующий запуск были мгновенными
}
/** Поверх главной открываются настройки и «Все приложения»: сама главная на это время не рисуется (экономит память плиток WebView). */
function overlay(on) { $('#page').style.visibility = on ? 'hidden' : ''; $('#top').style.visibility = on ? 'hidden' : ''; }

/* ---------- фокус и навигация пультом ---------- */
let mode = 'home', rows = [], R = 0, C = 0;
function focus(r, c) {
  $('.f.on')?.classList.remove('on');
  R = clamp(r, 0, rows.length - 1); C = clamp(c, 0, Math.max(0, rows[R].items.length - 1));
  const el = rows[R].items[C]; if (!el) return;
  el.classList.add('on'); rows[R].c = C;
  if (mode === 'home') { scrollPage(); scrollRow(rows[R]); } else if (mode === 'set') setFocused(rows[R].items[C]); else if (mode === 'all') scrollList('#all .ag', 232, 2);
}
function scrollPage() {
  const row = rows[R], page = $('#page'), first = $('#page .sec');
  let y = 0;
  if (row.el && row.el !== first) y = clamp(row.el.offsetTop - 130, 0, Math.max(0, page.offsetHeight - 1080));
  pageY = y; page.style.transform = `translate3d(0,${-y}px,0)`;
  $('#top').style.opacity = y > 0 ? 0 : 1;
}
function scrollRow(row) {
  const tr = row.el && $('.track', row.el); if (!tr) return;
  const el = row.items[C], l = el.offsetLeft, w = el.offsetWidth;
  if (l - row.sx < 96) row.sx = Math.max(0, l - 96); else if (l + w - row.sx > 1824) row.sx = l + w - 1824;
  tr.style.transform = `translate3d(${-row.sx}px,0,0)`;
}
function scrollList(sel, step, keep) { const el = $(sel); if (el) el.style.transform = `translate3d(0,${-Math.max(0, R - keep) * step}px,0)`; }
function move(dr, dc) {
  if (mode === 'set') return setMove(dr, dc);   // настройки: см. settings.js
  if (dc) {
    const c = C + dc;
    if (c < 0 || c >= rows[R].items.length) { if (mode === 'home' && rows[R].id === 'hero' && HERO.items.length > 1) slideHero(dc); return; }
    focus(R, c);
  } else {
    let r = R + dr; while (r >= 0 && r < rows.length && !rows[r].items.length) r += dr;
    if (r < 0 || r >= rows.length) return;
    focus(r, mode === 'home' ? rows[r].c || 0 : C);
  }
}
function currentItem() { const el = rows[R] && rows[R].items[C]; return el && el.dataset.i !== undefined ? ACTS[+el.dataset.i] : null; }
function activate() {
  const el = rows[R].items[C]; if (!el) return;
  if (el._f) { el._f(); return; }
  const it = currentItem();
  if (it) { it.go(); return; }
  const a = el.dataset.a || '';
  if (a === 'settings') openSet('main');
  else if (a.startsWith('hero:')) { const h = HERO.items[HERO.i]; if (h) (a === 'hero:play' ? h.act : h.more)?.(); }
}
let pressT = 0, longFired = false, swallowUp = false;
document.addEventListener('keydown', (e) => {
  const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
  if (d) move(d[0], d[1]);
  else if (e.key === 'Enter' || e.key === ' ') {   // OK срабатывает при отпускании, долгое нажатие открывает меню
    if (!e.repeat && !pressT) { longFired = false; pressT = setTimeout(() => { longFired = true; const it = currentItem(); if (it && it.menu) it.menu(); }, 600); }
  } else if (e.key === 'Escape' || e.key === 'Backspace') window.lumaBack();
  else return;
  e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (!pressT) { e.preventDefault(); return; }   // отпускание OK без нажатия здесь: кнопку нажали в другом приложении (например «Да, выйти» в Luma), иначе лаунчер сам откроет выбранное
  clearTimeout(pressT); pressT = 0;
  if (swallowUp) { swallowUp = false; e.preventDefault(); return; }
  if (!longFired) activate();
  longFired = false; e.preventDefault();
});

function focusStart() { const hero = rows.findIndex((r) => r.id === 'hero'); focus(hero >= 0 ? hero : Math.min(1, rows.length - 1), 0); }
function rebuild(keep) {
  const was = keep && rows[R] ? { id: rows[R].id, c: C } : null;
  buildHome();
  const r = was ? rows.findIndex((x) => x.id === was.id) : -1;
  if (r >= 0) focus(r, was.c); else focusStart();
}

/* ---------- меню по долгому OK ---------- */
let saved = null;
function openMenu(title, opts) {
  saved = { mode, rows, R, C };
  const box = $('#menu'); box.classList.remove('hidden');
  box.innerHTML = `<div class="mb"><h3>${esc(title)}</h3>${opts.map((o, i) => `<button class="btn f${i ? '' : ' primary'}">${esc(o.t)}</button>`).join('')}</div>`;
  const items = $$('.f', box); items.forEach((b, i) => { b._f = () => { closeMenu(); try { opts[i].f && opts[i].f(); } catch {} }; });
  rows = items.map((b, i) => ({ id: 'm' + i, items: [b] })); mode = 'menu'; focus(0, 0);
}
function closeMenu() {
  $('#menu').classList.add('hidden');
  if (!saved) return;
  mode = saved.mode; rows = saved.rows; focus(saved.R, saved.C); saved = null;
}
function itemMenu(it) {
  openMenu(it.name, [{ t: 'Убрать из списка', f: () => { cfg.dismiss[it.key] = Date.now(); saveCfg(); buildReg(); if (mode === 'home') rebuild(true); } }, { t: 'Отмена' }]);
}
function appMenu(a) {
  const on = cfg.apps.pin && cfg.apps.pin[a.p];
  openMenu(a.l, [{ t: on ? 'Убрать из избранных' : 'Добавить в избранные', f: () => { cfg.apps.pin = cfg.apps.pin || {}; if (on) delete cfg.apps.pin[a.p]; else cfg.apps.pin[a.p] = 1; saveCfg(); if (mode === 'all') renderAll(R, C); else rebuild(true); } }, { t: 'Отмена' }]);
}

/* ---------- все приложения ---------- */
function openAll() { mode = 'all'; overlay(true); $('#all').classList.remove('hidden'); renderAll(0, 0); }
function closeAll() {
  $('#all').classList.add('hidden'); overlay(false); mode = 'home'; buildHome();
  const r = rows.findIndex((x) => x.id === 'apps');
  if (r >= 0) focus(r, rows[r].items.length - 1); else focusStart();
}
function renderAll(r, c) {
  ACTS = [];
  const list = appList(), box = $('#all');
  let h = '<h2>Все приложения</h2><div class="hint">Долгое нажатие OK: добавить в избранные или убрать</div><div class="abox"><div class="ag">';
  for (let i = 0; i < list.length; i += 6) h += `<div class="agrow">${list.slice(i, i + 6).map((a) => appCard(a)).join('')}</div>`;
  box.innerHTML = h + '</div></div>';
  rows = $$('.agrow', box).map((el, i) => ({ id: 'a' + i, items: $$('.f', el) }));
  focus(r, c);
}

/* ---------- погода: город по IP, прогноз met.no (Open-Meteo в этой сети заблокирован) ---------- */
let wx = jget('lc.wx', {});
const WX = (c) => (/thunder/.test(c) ? '⛈️' : /snow|sleet/.test(c) ? '❄️' : /rain|drizzle|shower/.test(c) ? '🌧️' : /fog/.test(c) ? '🌫️' : /clearsky/.test(c) ? (/night/.test(c) ? '🌙' : '☀️') : /fair|partly/.test(c) ? '⛅' : '☁️');
function paintTop() {
  const e = $('#wx'); if (!e) return;
  e.textContent = cfg.weather && wx.t !== undefined ? `${WX(wx.sym || '')} ${wx.t > 0 ? '+' : ''}${Math.round(wx.t)}°` : '';
  e.style.display = e.textContent ? '' : 'none';
}
function loadWeather(force) {
  if (!N || !cfg.weather) return;
  if (!force && wx.at && Date.now() - wx.at < 30 * 60000) return;
  const ask = () => N.fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${(+wx.lat).toFixed(3)}&lon=${(+wx.lon).toFixed(3)}`, 'wxData');
  if (wx.lat !== undefined && Date.now() - (wx.geoAt || 0) < 86400000) ask(); else N.fetch('https://ipwho.is/?fields=success,latitude,longitude,city', 'wxGeo');
  window.wxGeo = (t) => { try { const j = JSON.parse(t); if (j.success !== false && j.latitude !== undefined) { wx.lat = j.latitude; wx.lon = j.longitude; wx.city = j.city; wx.geoAt = Date.now(); jset('lc.wx', wx); ask(); } } catch {} };
  window.wxData = (t) => { try { const d = JSON.parse(t).properties.timeseries[0].data; wx.t = d.instant.details.air_temperature; wx.sym = ((d.next_1_hours || d.next_6_hours || {}).summary || {}).symbol_code || ''; wx.at = Date.now(); jset('lc.wx', wx); paintTop(); } catch {} };
}

/* ---------- значок «нет интернета» рядом со временем ---------- */
let netOn = true;
function paintNet() {
  let on = true; try { on = N ? N.online() : navigator.onLine; } catch {}
  $('#net').classList.toggle('hidden', on);
  if (on && !netOn) { loadWeather(true); if (mode === 'home') { readData(); rebuild(true); } }
  netOn = on;
}

/* ---------- обновления: релизы на GitHub (лаунчер и Luma TV), установка APK через установщик Android ---------- */
const UPD_REPOS = { launcher: 'dmitrykirsh/luma-launcher', luma: 'dmitrykirsh/luma-tv' };
const UPD_NAMES = { launcher: 'Luma Launcher', luma: 'Luma TV' };
const upd = { launcher: { state: 'idle' }, luma: { state: 'idle' } };
const semParts = (v) => String(v || '').replace(/^v/i, '').split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
const semNewer = (a, b) => { const x = semParts(a), y = semParts(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const curVer = (id) => { try { return N ? (id === 'launcher' ? N.version() : N.pkgVersion('ws.luma.tv')) : ''; } catch { return ''; } };
let gi = 0;
const getText = (url) => new Promise((res) => { const cb = 'gt' + ++gi; const t = setTimeout(() => { delete window[cb]; res(''); }, 25000); window[cb] = (x) => { clearTimeout(t); delete window[cb]; res(x); }; N.fetch(url, cb); });
const updBusy = (u) => ['checking', 'downloading', 'installing'].includes(u.state);
const updRefresh = () => { if (mode === 'set') bindSet(); };
async function updCheck(id) {
  const u = upd[id]; if (!N || updBusy(u) || !curVer(id)) return;
  u.state = 'checking'; updRefresh();
  const t = await getText(`https://api.github.com/repos/${UPD_REPOS[id]}/releases/latest`);
  try {
    const j = JSON.parse(t), apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name)); u.at = Date.now();
    if (apk && semNewer(j.tag_name, curVer(id))) { u.state = 'available'; u.version = String(j.tag_name).replace(/^v/i, ''); u.url = apk.browser_download_url; }
    else u.state = 'none';
  } catch { u.state = 'error'; u.err = t ? '' : 'нет связи с GitHub'; u.url = ''; }
  updRefresh();
}
function updInstall(id) {
  const u = upd[id]; if (!u.url || !['available', 'needperm', 'error'].includes(u.state)) return;
  u.state = 'downloading'; u.pct = 0; updRefresh(); N.installUpdate(u.url, id);
}
window.updState = (t) => { try { const s = JSON.parse(t), u = upd[s.id]; if (!u) return; u.state = s.state; if (s.pct != null) u.pct = s.pct; if (s.msg) u.err = s.msg; updRefresh(); } catch {} };
function updText(id) {
  const u = upd[id], cur = curVer(id);
  if (u.state === 'checking') return 'Проверяем обновления…';
  if (u.state === 'available') return `Доступна версия ${u.version}. OK: скачать и установить`;
  if (u.state === 'downloading') return `Скачиваем версию ${u.version}… ${u.pct || 0}%`;
  if (u.state === 'installing') return 'Открываем установщик, подтвердите установку на экране';
  if (u.state === 'needperm') return 'Нужно разрешение: включите установку из этого источника и нажмите OK ещё раз';
  if (u.state === 'error') return 'Не получилось' + (u.err ? ': ' + u.err : '') + '. OK: повторить';
  if (u.state === 'none') return `Последняя версия · проверено в ${new Date(u.at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
  return cur ? 'OK: проверить обновления' : '';
}
const updAny = () => Object.values(upd).some((u) => u.state === 'available');
const updSummary = () => `Launcher ${curVer('launcher')}` + (curVer('luma') ? ` · Luma TV ${curVer('luma')}` : '') + (updAny() ? ' · есть обновление' : '');
setTimeout(() => { if (!N) return; const run = () => { updCheck('launcher'); updCheck('luma'); }; run(); setInterval(run, 6 * 3600e3); }, 20000);

/* ---------- заставка ТВ: камин со звуком из потока Rutube (длинные ролики без повторов) ---------- */
const DREAM_SRC = [
  { id: 'rutube:965c1c098297287b54c4fba406bd8288', name: 'Вечерний камин 4К', short: 'Вечерний · 10,7 ч', sub: '10,7 ч, «Уютный уголок»' },
  { id: 'rutube:ea7a22d1d9914fd2800ff17a7238b4dc', name: 'Fireplace 4K, звуки камина', short: 'Fireplace · 2 ч', sub: '2 ч, «зверье»' }
];
const DREAM_SLEEP = [0, 30, 60, 120, 240, 480], DREAM_VOL = [30, 50, 70, 90];
const sleepLabel = (m) => (m === 0 ? 'Выкл' : m < 60 ? `${m} мин` : `${m / 60} ч`);
const nextOf = (arr, cur) => arr[(arr.indexOf(cur) + 1) % arr.length];
let dreamMsg = '';
const dcGet = () => { try { return JSON.parse(N.dreamGet()); } catch { return { source: DREAM_SRC[0].id, volume: 70, sleepMin: 0 }; } };
const dcSet = (patch) => { try { N.dreamSet(JSON.stringify({ ...dcGet(), ...patch })); } catch {} };
const dreamOn = () => { try { return !!N && N.dreamIsOn(); } catch { return false; } };

/* ---------- вызовы из оболочки ---------- */
window.lumaBack = () => {
  if (mode === 'menu') closeMenu();
  else if (mode === 'set') setBack();
  else if (mode === 'all') closeAll();
  else if (R > 1 || pageY > 0) focusStart();
  return true;
};
window.lumaHome = () => { if (mode === 'menu') closeMenu(); if (mode === 'set') closeSet(); if (mode === 'all') closeAll(); readData(); snap = JSON.stringify([feed, apps, tv]); rebuild(false); loadWeather(); paintNet(); };
window.lumaResume = () => {
  paintNet();
  if (mode !== 'home') return;
  readData(); const s = JSON.stringify([feed, apps, tv]);
  if (s !== snap) { snap = s; rebuild(true); }
  loadWeather();
};

/* ---------- старт ---------- */
function tick() { const d = new Date(); $('#clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
tick(); setInterval(tick, 20000);
setInterval(paintNet, 8000); addEventListener('online', paintNet); addEventListener('offline', paintNet);
readData(); snap = JSON.stringify([feed, apps, tv]);
paintTop(); paintNet(); loadWeather();
buildHome(); focusStart();
requestAnimationFrame(() => requestAnimationFrame(() => { try { N && N.ready(); } catch {} }));
