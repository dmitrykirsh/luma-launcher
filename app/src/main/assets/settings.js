'use strict';
/* Настройки лаунчера: слева разделы со сводкой, справа параметры раздела.
   Курсор на разделе сразу показывает его содержимое; вправо или OK: перейти к параметрам, влево или «Назад»: к разделам.
   Тумблеры меняются по OK, сегменты и ползунки стрелками влево и вправо. Движок фокуса (rows, focus, move) общий с главным экраном, см. app.js. */
const SVG = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
const IC = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  film: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 9.5h18M8 4.5v5M16 4.5v5"/>',
  img: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4 4 3 3-2 4 3"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2.5"/><path d="M8 20.5h8M12 17v3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  data: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  fire: '<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2.5-5 .3 1.5 1.2 2 2 2.2C11.300 8 11.200 5.200 12 3z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5 3.75 3.75 0 0 1 17.5 18z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  speaker: '<path d="M4 10v4h3.5L12 18V6L7.5 10z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 7a7.5 7.5 0 0 1 0 10"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 3.5h5"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  reset: '<path d="M4 12a8 8 0 1 1 2.3 5.7M4 18v-6h6"/>',
  up: '<path d="M6 14l6-6 6 6"/>', down: '<path d="M6 10l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', film2: '<rect x="3" y="4.5" width="18" height="15" rx="3"/>'
};
IC.apps = IC.grid;
const ic = (k) => (!k ? '' : k.startsWith('app:') ? `<img src="icon/${esc(k.slice(4))}.png" alt="" onerror="this.style.visibility='hidden'">` : SVG(IC[k] || ''));
const GICON = { 'Лаунчер': 'apps', Luma: 'film', 'Google TV': 'tv' };

let setPage = 'home', zone = 'side', sideRows = [], bodyRows = [], models = [], expand = {}, bodyT = 0;
const SECTIONS = [['home', 'grid', 'Главный экран'], ['banner', 'img', 'Верхний баннер'], ['apps', 'apps', 'Приложения'], ['net', 'cloud', 'Погода и сеть'], ['data', 'data', 'Данные и обновления'], ['about', 'info', 'О лаунчере']];
const cntOf = (b) => (b.apps ? '' : ` · ${b.items.length}`);

/* краткая сводка под названием раздела */
function sideSub(id) {
  if (id === 'home') return `${blockList().filter((s) => s.on).length} рядов`;
  if (id === 'banner') return cfg.hero ? `${heroItems().length} слайдов` : 'Выключен';
  if (id === 'apps') return `${pinned().length} в ряду из ${apps.length}`;
  if (id === 'net') return (cfg.weather && wx.city ? wx.city : 'Погода') + (netOn ? '' : ' · нет сети');
  if (id === 'data') return updAny() ? 'Есть обновление' : (lumaFeed() ? 'Luma подключена' : 'Luma не найдена');
  return `Версия ${curVer('launcher')}`;
}

/* ---------- модели строк разделов ---------- */
const swap = (full, a, b) => { const i = full.findIndex((s) => s.id === a), j = full.findIndex((s) => s.id === b); [full[i], full[j]] = [full[j], full[i]]; saveCfg(); };
/** Два списка: включённые (по порядку, с ▲▼) и «Добавить», сгруппированные по приложениям. scope: home или banner. */
function orderModels(scope) {
  const full = scope === 'home' ? cfg.sections : cfg.banner.order, list = scope === 'home' ? blockList() : bannerList();
  const on = list.filter((s) => s.on), off = list.filter((s) => !s.on), out = [];
  out.push({ t: 'head', text: scope === 'home' ? 'Ряды на главном экране' : 'Источники баннера' });
  out.push({ t: 'note', text: 'OK убирает с экрана, стрелка вправо открывает кнопки ▲ ▼ для переноса.' });
  if (!on.length) out.push({ t: 'note', text: 'Пока ничего не выбрано, добавьте из списка ниже.' });
  on.forEach((s, i) => out.push({ t: 'ord', key: `${scope}:${s.id}`, icon: GICON[REG[s.id].src] || 'list', lab: REG[s.id].title, sub: REG[s.id].src + cntOf(REG[s.id]),
    off: () => { s.on = false; saveCfg(); }, up: i > 0 ? () => swap(full, s.id, on[i - 1].id) : null, down: i < on.length - 1 ? () => swap(full, s.id, on[i + 1].id) : null }));
  if (off.length) {
    out.push({ t: 'head', text: 'Добавить' });
    const groups = new Map();
    for (const s of off) { const k = REG[s.id].src; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    for (const [g, arr] of groups) {
      const open = !!expand[scope + g];
      out.push({ t: 'grp', key: `g:${scope}:${g}`, icon: GICON[g] || 'list', lab: g, sub: `${arr.length} доступно`, open, toggle: () => { expand[scope + g] = !open; } });
      if (open) for (const s of arr) out.push({ t: 'add', key: `${scope}:${s.id}`, icon: 'plus', lab: REG[s.id].name || REG[s.id].title, sub: (REG[s.id].apps ? '' : `Карточек: ${REG[s.id].items.length}`), add: () => { s.on = true; saveCfg(); } });
    }
  }
  return out;
}
function modelsFor(id) {
  if (id === 'home') return [{ t: 'map' }, ...orderModels('home')];
  if (id === 'banner') return [
    { t: 'sw', key: 'hero', icon: 'img', lab: 'Показывать баннер', sub: 'Если выключен, сверху остаются приложения', get: () => cfg.hero, set: (x) => { cfg.hero = x; } },
    { t: 'seg', key: 'per', icon: 'list', lab: 'Слайдов от источника', sub: 'Из «Продолжить просмотр» берутся только начатые фильмы', opts: [{ v: 3, l: '3' }, { v: 5, l: '5' }, { v: 8, l: '8' }], get: () => cfg.bannerPer || 5, set: (x) => { cfg.bannerPer = x; } },
    ...orderModels('banner')];
  if (id === 'apps') {
    const all = appList(), pin = all.filter((a) => cfg.apps.pin && cfg.apps.pin[a.p]), rest = all.filter((a) => !(cfg.apps.pin && cfg.apps.pin[a.p])), out = [];
    out.push({ t: 'head', text: `В ряду на главном экране · ${pin.length}` });
    out.push({ t: 'note', text: 'OK открывает действия: убрать из ряда или сдвинуть влево и вправо.' });
    for (let i = 0; i < pin.length; i += 5) out.push({ t: 'tiles', pinned: true, apps: pin.slice(i, i + 5), key: `p${i}` });
    if (rest.length) { out.push({ t: 'head', text: `Остальные · ${rest.length}` }); out.push({ t: 'note', text: 'OK добавляет в ряд. Все они остаются в «Все приложения».' }); for (let i = 0; i < rest.length; i += 5) out.push({ t: 'tiles', pinned: false, apps: rest.slice(i, i + 5), key: `r${i}` }); }
    return out;
  }
  if (id === 'net') return [
    { t: 'sw', key: 'wx', icon: 'sun', lab: 'Погода рядом с часами', sub: () => (wx.city ? `${wx.city}${wx.t !== undefined ? ', ' + Math.round(wx.t) + '°' : ''} · город определяется по сети` : 'Город определяется по сети'), get: () => cfg.weather, set: (x) => { cfg.weather = x; paintTop(); if (x) loadWeather(true); } },
    { t: 'act', key: 'wxr', icon: 'refresh', lab: 'Обновить погоду', sub: 'Запросить прогноз сейчас', f: () => loadWeather(true) },
    { t: 'info', key: 'net', icon: 'cloud', lab: 'Интернет', sub: 'Значок «нет сети» появляется рядом с часами', val: netOn ? 'Есть' : 'Нет', vc: netOn ? 'ok' : 'bad' }];
  if (id === 'data') {
    const perm = tv.error === 'PERMISSION', out = [
      { t: 'head', text: 'Google-аккаунт · основной способ синхронизации' },
      ...(driveState().connected ? [
        { t: 'who', key: 'drwho', lab: driveState().name || 'Google-аккаунт', sub: driveState().email || '', photo: driveState().photo || '', val: 'Подключено', vc: 'ok' },
        { t: 'act', key: 'drsync', icon: 'refresh', lab: 'Синхронизировать сейчас', sub: () => DR.msg || 'Раскладка и приложения хранятся в вашем Google Диске и синхронизируются сами', f: () => driveSyncNow() },
        { t: 'act', key: 'droff', icon: 'reset', lab: 'Отключить Google-аккаунт', sub: 'Синхронизация раскладки остановится', f: () => openMenu('Отключить Google-аккаунт?', [{ t: 'Отключить', f: () => { try { N.driveDisconnect(); } catch {} DR.msg = ''; structural(); } }, { t: 'Отмена' }]) },
        { t: 'act', key: 'drwipe', icon: 'reset', lab: 'Удалить данные с Диска', sub: 'Файл раскладки будет удалён из вашего Google Диска, вход отключится', f: () => openMenu('Удалить файл с Google Диска и отключить?', [{ t: 'Удалить и отключить', f: () => { DR.msg = 'Удаляем файл с Диска…'; structural(); try { N.driveDeleteRemote(); } catch {} } }, { t: 'Отмена' }]) }
      ] : [
        { t: 'act', key: 'drconn', icon: 'cloud', lab: 'Войти через Google', sub: 'Раскладка и закреплённые приложения будут синхронизироваться через ваш Google Диск — код сканируется с телефона, не из этой сети', f: () => driveConnect() }
      ]),
      { t: 'head', text: 'Источники данных' },
      { t: 'sw', key: 'luma', icon: 'film', lab: 'Luma', sub: () => (lumaOn ? (feed.at ? `Лента обновлена: ${new Date(feed.at).toLocaleString('ru')}` : 'Лента ещё не получена') : 'Luma TV не установлена'), get: () => cfg.luma, set: (x) => { cfg.luma = x; } },
      { t: 'sw', key: 'chan', icon: 'list', lab: 'Каналы приложений Google TV', sub: () => (perm ? 'Нет доступа: нужно разрешение READ_TV_LISTINGS (выдаётся через adb)' : `Каналов: ${(tv.channels || []).length}, «Продолжить» из приложений: ${(tv.next || []).length}`), get: () => cfg.channels, set: (x) => { cfg.channels = x; }, after: () => readData() },
      { t: 'head', text: 'Обновления' }];
    for (const id2 of ['launcher', ...(curVer('luma') ? ['luma'] : [])]) {
      const u = upd[id2], avail = () => u.state === 'available';
      out.push({ t: 'act', key: 'u' + id2, icon: id2 === 'launcher' ? 'grid' : 'film', lab: `${UPD_NAMES[id2]} ${curVer(id2)}`, sub: () => updText(id2), val: () => (avail() ? 'Обновить' : '›'), vc: () => (avail() ? 'ok' : ''), f: () => (u.state === 'available' || u.state === 'needperm' || (u.state === 'error' && u.url) ? updInstall(id2) : updCheck(id2)) });
    }
    out.push({ t: 'act', key: 'uall', icon: 'refresh', lab: 'Проверить обновления', sub: 'Запросить последние релизы на GitHub', f: () => { updCheck('launcher'); if (curVer('luma')) setTimeout(() => updCheck('luma'), 4000); } });
    return out;
  }
  return [
    { t: 'info', key: 'v1', icon: 'grid', lab: 'Luma Launcher', sub: 'github.com/dmitrykirsh/luma-launcher', val: curVer('launcher') },
    { t: 'info', key: 'v2', icon: 'film', lab: 'Luma TV', sub: 'github.com/dmitrykirsh/luma-tv', val: curVer('luma') || 'не установлена' },
    { t: 'seg', key: 'perf', icon: 'timer', lab: 'Лёгкий режим', sub: () => 'Для слабых ТВ: фон не движется, переходы короче' + (cfg.perf === 'on' || cfg.perf === 'off' ? '' : (liteOn() ? ' · сейчас включён' : ' · сейчас выключен')), opts: [{ v: 'auto', l: 'Авто' }, { v: 'on', l: 'Вкл' }, { v: 'off', l: 'Выкл' }], get: () => cfg.perf || 'auto', set: (v) => { setPerf(v); } },
    { t: 'act', key: 'sys', icon: 'gear', lab: 'Системные настройки ТВ', sub: 'Сеть, экран, звук', f: () => N && N.openSystemSettings() },
    { t: 'act', key: 'reset', icon: 'reset', lab: 'Сбросить настройки', sub: 'Вернуть стандартные ряды, баннер и приложения', f: () => openMenu('Сбросить настройки?', [{ t: 'Сбросить', f: resetCfg }, { t: 'Отмена' }]) }];
}

/* ---------- отрисовка ---------- */
const subOf = (m) => (typeof m.sub === 'function' ? m.sub() : m.sub || '');
function inner(m) {
  if (m.t === 'who') {
    const av = `<span class="si2 avt"><i>${esc((m.lab || 'G').trim().charAt(0).toUpperCase())}</i>${m.photo ? `<img src="${esc(m.photo)}" alt="" onerror="this.remove()">` : ''}</span>`;
    return av + `<span class="st2"><b>${esc(m.lab)}</b><small>${esc(subOf(m))}</small></span><span class="val ${m.vc || ''}">${esc(m.val || '')}</span>`;
  }
  const head = `<span class="si2">${ic(m.icon)}</span><span class="st2"><b>${esc(m.lab)}</b><small>${esc(subOf(m))}</small></span>`;
  if (m.t === 'sw') return head + `<span class="swt ${m.get() ? 'on' : ''}"><i></i></span>`;
  if (m.t === 'seg') return head + `<span class="seg">${m.opts.map((o) => `<u class="${o.v === m.get() ? 'sel' : ''}">${esc(o.l)}</u>`).join('')}</span>`;
  if (m.t === 'step') { const v = m.get(); return head + `<span class="stp"><em>‹</em><span class="bar"><i style="width:${((v - m.min) / (m.max - m.min)) * 100}%"></i></span><b>${m.fmt ? m.fmt(v) : v}</b><em>›</em></span>`; }
  if (m.t === 'grp') return head + `<span class="val big">${m.open ? '⌄' : '›'}</span>`;
  if (m.t === 'add') return head + '<span class="val ok">Добавить</span>';
  const vc = typeof m.vc === 'function' ? m.vc() : m.vc || '', val = typeof m.val === 'function' ? m.val() : m.val;
  return head + `<span class="val ${vc}">${esc(val ?? (m.t === 'act' ? '›' : ''))}</span>`;
}
function mapHtml() {
  const rowsOn = blockList().filter((s) => s.on), hero = cfg.hero ? heroItems().length : 0;
  const strip = (s) => { const b = REG[s.id], kind = b.apps ? 'app' : (b.items[0] || {}).cls || 'poster', n = kind === 'land' ? 4 : kind === 'poster' ? 7 : 5; return `<div class="mstrip"><em>${esc(b.title)}</em><div class="mcards k-${kind}">${'<i></i>'.repeat(n)}</div></div>`; };
  return `<div class="mframe"><div class="mhero ${hero ? '' : 'off'}"><b>${hero ? 'Баннер' : 'Баннер выключен'}</b>${hero ? `<span>${hero} слайдов</span>` : ''}</div>${rowsOn.slice(0, 4).map(strip).join('')}${rowsOn.length > 4 ? `<div class="mmore">ещё рядов: ${rowsOn.length - 4}</div>` : ''}</div>`;
}
function rowHtml(m, i) {
  if (m.t === 'head') return `<h3 class="sh">${esc(m.text)}</h3>`;
  if (m.t === 'note') return `<p class="sno">${esc(m.text)}</p>`;
  if (m.t === 'map') return `<div class="smap" id="smap">${mapHtml()}<p>Так выглядит главный экран. Порядок и состав меняются ниже.</p></div>`;
  if (m.t === 'tiles') return `<div class="tiles" data-m="${i}">${m.apps.map((a, k) => `<div class="tile f" data-k="${k}"><img src="icon/${esc(a.p)}.png" alt="" onerror="this.style.visibility='hidden'"><span>${esc(a.l)}</span></div>`).join('')}</div>`;
  if (m.t === 'ord') return `<div class="sr2 ord f" data-m="${i}"><span class="si2">${ic(m.icon)}</span><span class="st2"><b>${esc(m.lab)}</b><small>${esc(m.sub)}</small></span>${m.up ? `<button class="mbt f" data-b="up">${ic('up')}</button>` : ''}${m.down ? `<button class="mbt f" data-b="down">${ic('down')}</button>` : ''}</div>`;
  return `<div class="sr2 f r-${m.t}" data-m="${i}">${inner(m)}</div>`;
}
function renderBody(keep) {
  const was = keep && zone === 'body' && rows[R] ? { key: rows[R].key, c: C, r: R, b: rows[R].items[C] && rows[R].items[C].dataset && rows[R].items[C].dataset.b } : null;
  models = modelsFor(setPage);
  $('#bdin').innerHTML = models.map(rowHtml).join('');
  bodyRows = [];
  $$('#bdin [data-m]').forEach((el) => {
    const m = models[+el.dataset.m]; el._m = m; let items = [el];
    if (m.t === 'ord') {
      el._f = () => { m.off(); structural(); };
      $$('.mbt', el).forEach((b) => { b._f = () => { (b.dataset.b === 'up' ? m.up : m.down)(); structural(); }; items.push(b); });
    } else if (m.t === 'tiles') {
      items = $$('.tile', el);
      items.forEach((t, k) => { const a = m.apps[k]; t._app = a; t._f = () => (m.pinned ? pinMenu(a) : (pinApp(a, true), structural())); });
    } else if (m.t === 'sw') { el._f = () => { m.set(!m.get()); saveCfg(); buildReg(); m.after && m.after(); changed(); }; }
    else if (m.t === 'seg') {
      el._lr = (d) => { const i = m.opts.findIndex((o) => o.v === m.get()), n = clamp(i + d, 0, m.opts.length - 1); if (n === i) return d > 0; m.set(m.opts[n].v); saveCfg(); changed(); return true; };
      el._f = () => { const i = m.opts.findIndex((o) => o.v === m.get()); m.set(m.opts[(i + 1) % m.opts.length].v); saveCfg(); changed(); };
    } else if (m.t === 'step') {
      el._lr = (d) => { const v = m.get(), n = clamp(v + d * m.step, m.min, m.max); if (n === v) return d > 0; m.set(n); changed(); return true; };
    } else if (m.t === 'act') el._f = () => { m.f(); setTimeout(changed, 50); };
    else if (m.t === 'grp') el._f = () => { m.toggle(); structural(); };
    else if (m.t === 'add') el._f = () => { m.add(); structural(); };
    if (m.t === 'info') return;   // только показ
    bodyRows.push({ id: 'b' + bodyRows.length, key: m.key, items });
  });
  markSide();
  if (zone === 'body') {
    rows = bodyRows;
    if (was) { let r = bodyRows.findIndex((x) => x.key === was.key); if (r < 0) r = Math.min(was.r, bodyRows.length - 1); let c = was.b ? bodyRows[r].items.findIndex((x) => x.dataset && x.dataset.b === was.b) : -1; focus(r, c >= 0 ? c : was.c); } else if (bodyRows.length) focus(0, 0);
  }
  if (zone !== 'body') scrollBody(null);   // при смене раздела список в начало; внутри раздела прокрутку держит фокус, иначе список прыгает наверх
}
/** Изменилось значение: перерисовать подписи и сводки без пересборки строк (поэтому ничего не мигает). */
function changed() {
  $$('#bdin [data-m]').forEach((el) => { const m = el._m; if (m && ['sw', 'seg', 'step', 'act', 'info'].includes(m.t)) el.innerHTML = inner(m); });
  const mp = $('#smap'); if (mp) $('.mframe', mp).outerHTML = mapHtml();
  $$('#set .sn').forEach((e) => setText($('small', e), sideSub(e._sec)));
}
function structural() { buildReg(); $$('#set .sn').forEach((e) => setText($('small', e), sideSub(e._sec))); renderBody(true); }

/* ---------- приложения: действия над плиткой ---------- */
function pinApp(a, on) {
  cfg.apps.pin = cfg.apps.pin || {};
  if (cfg.apps.order.length < apps.length) cfg.apps.order = appList().map((x) => x.p);
  if (on) { cfg.apps.pin[a.p] = 1; const o = cfg.apps.order, i = o.indexOf(a.p); o.splice(i, 1); const last = Math.max(-1, ...appList().filter((x) => cfg.apps.pin[x.p] && x.p !== a.p).map((x) => o.indexOf(x.p))); o.splice(last + 1, 0, a.p); }
  else delete cfg.apps.pin[a.p];
  saveCfg();
}
function moveApp(a, d) {
  const p = appList().filter((x) => cfg.apps.pin && cfg.apps.pin[x.p]), i = p.findIndex((x) => x.p === a.p), j = i + d; if (j < 0 || j >= p.length) return;
  cfg.apps.order = appList().map((x) => x.p); const o = cfg.apps.order, x = o.indexOf(p[i].p), y = o.indexOf(p[j].p); [o[x], o[y]] = [o[y], o[x]]; saveCfg();
}
function pinMenu(a) {
  openMenu(a.l, [{ t: 'Сдвинуть влево', f: () => { moveApp(a, -1); structural(); } }, { t: 'Сдвинуть вправо', f: () => { moveApp(a, 1); structural(); } }, { t: 'Убрать из ряда', f: () => { pinApp(a, false); structural(); } }, { t: 'Отмена' }]);
}

/* ---------- каркас и навигация ---------- */
function buildSet() {
  $('#set').innerHTML = `<aside class="sb"><h2>Настройки</h2><nav>${SECTIONS.map(([id, icon, title]) => `<div class="sn f" data-sec="${id}"><span class="si2">${ic(icon)}</span><span class="st2"><b>${esc(title)}</b><small>${esc(sideSub(id))}</small></span></div>`).join('')}</nav></aside>
    <div class="bd"><div class="bdin" id="bdin"></div></div>
    <footer class="hints"><span>▲▼ выбрать</span><span>◀▶ изменить</span><span>OK подтвердить</span><span>Назад вернуться</span></footer>`;
  sideRows = $$('#set .sn').map((el, i) => { el._sec = el.dataset.sec; return { id: 's' + i, items: [el] }; });
}
const markSide = () => $$('#set .sn').forEach((e) => e.classList.toggle('act', e._sec === setPage));
function scrollBody(el) {
  const b = $('#bdin'), vp = $('#set .bd'); if (!b || !vp) return;
  const row = el && el.closest('[data-m]'); let y = 0;
  if (row) y = clamp(row.offsetTop - 260, 0, Math.max(0, b.scrollHeight - vp.clientHeight));
  b.style.transform = `translate3d(0,${-y}px,0)`;
}
/** Вызывается из focus(): курсор на разделе показывает его содержимое, в параметрах прокручивает список. */
function setFocused(el) {
  if (!el) return;
  if (zone === 'side') { if (el._sec && el._sec !== setPage) { setPage = el._sec; clearTimeout(bodyT); bodyT = setTimeout(() => renderBody(false), 80); } markSide(); }
  else { $('.sr2.hl')?.classList.remove('hl'); el.closest('.sr2')?.classList.add('hl'); scrollBody(el); }
}
function toSide() { zone = 'side'; rows = sideRows; focus(Math.max(0, SECTIONS.findIndex((s) => s[0] === setPage)), 0); }
function toBody() { if (!bodyRows.length) return; zone = 'body'; rows = bodyRows; focus(0, 0); }
function setMove(dr, dc) {
  if (zone === 'side') { if (dc > 0) toBody(); else if (dr) { const r = clamp(R + dr, 0, rows.length - 1); focus(r, 0); } return; }
  const el = rows[R] && rows[R].items[C];
  if (dc) {
    if (el && el._lr && el._lr(dc)) return;
    const c = C + dc;
    if (c >= 0 && c < rows[R].items.length) focus(R, c); else if (dc < 0) toSide();
    return;
  }
  const r = R + dr; if (r >= 0 && r < rows.length) focus(r, C);
}
function setBack() { if (zone === 'body') toSide(); else closeSet(); }
function openSet(p) {
  setPage = SECTIONS.some((s) => s[0] === p) ? p : 'home';
  mode = 'set'; zone = 'side'; overlay(true); $('#set').classList.remove('hidden');
  buildSet(); rows = sideRows; renderBody(false); focus(SECTIONS.findIndex((s) => s[0] === setPage), 0);
}
function closeSet() { clearTimeout(bodyT); $('#set').classList.add('hidden'); overlay(false); mode = 'home'; rebuild(false); focus(0, 0); }
function bindSet() { if (mode === 'set') changed(); }   // вызывается из модулей обновлений и погоды при смене состояния
function resetCfg() {
  const keep = cfg.dismiss; for (const k of Object.keys(cfg)) delete cfg[k]; Object.assign(cfg, freshCfg(keep));
  if (!cfg.apps.pin) cfg.apps.pin = {};
  saveCfg(); buildReg(); if (mode === 'set') structural();
}

/* ---------- синхронизация раскладки через Google Drive (только облако, без локальной сети) ----------
   Раскладка — не история, поэтому без слияния по полям: побеждает более новая по времени cfg.savedAt. */
const DR = { connecting: false, busy: false, msg: '' };
function driveState() { try { return JSON.parse(N.driveState()); } catch { return { connected: false, last: 0 }; } }
function driveConnect() {
  DR.connecting = true;
  openCodeBox('Google-аккаунт', '<p>Запрашиваем код…</p>', 'Отменить', () => { try { N.driveConnectCancel(); } catch {} DR.connecting = false; structural(); });
  try { N.driveConnect(); } catch {}
}
function driveQrSvg(code) { try { const u = 'https://www.google.com/device?user_code=' + encodeURIComponent(code || ''); const q = qrcode(0, 'M'); q.addData(u); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch { return ''; } }
window.lumaDriveCode = (json) => {
  let d = {}; try { d = JSON.parse(json); } catch {}
  openCodeBox('Google-аккаунт', `<p>Наведите камеру телефона — откроется страница входа с уже вставленным кодом:</p><div class="dr-qr">${driveQrSvg(d.code)}</div><p class="sub">Или вручную на google.com/device, код: <b>${esc(d.code || '')}</b></p>`, 'Отменить', () => { try { N.driveConnectCancel(); } catch {} DR.connecting = false; structural(); });
};
window.lumaDriveConnected = (json) => {
  DR.connecting = false; let r = {}; try { r = JSON.parse(json); } catch {}
  closeMenu();
  if (r.error) { DR.msg = { NO_CREDS: 'Не настроены ключи Google в этой сборке.', DEVICE: 'Не получилось начать вход, попробуйте ещё раз.', NETWORK: 'Нет связи с Google.' }[r.error] || 'Вход не удался.'; structural(); return; }
  driveSyncNow();
};
function driveSyncNow() {
  if (DR.busy) return; DR.busy = true; DR.msg = 'Синхронизируем…'; structural();
  try { N.driveFetchRemote(); } catch { DR.busy = false; }
}
window.lumaDriveRemote = (json) => {
  let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.error) { driveFinish(r.error); return; }
  if (r.data) {
    try {
      const remote = JSON.parse(r.data);
      if (remote && remote.cfg && (remote.savedAt || 0) > (cfg.savedAt || 0)) {
        for (const k of Object.keys(cfg)) delete cfg[k];
        Object.assign(cfg, remote.cfg); cfg.savedAt = remote.savedAt;
        saveCfg(); buildReg(); if (mode === 'set') structural(); else rebuild(true);
      }
    } catch {}
  }
  try { N.driveUpload(JSON.stringify({ app: 'LumaLauncherConfig', format: 1, savedAt: cfg.savedAt || Date.now(), cfg })); } catch { driveFinish('NETWORK'); }
};
window.lumaDriveUploaded = (json) => { let r = {}; try { r = JSON.parse(json); } catch {} driveFinish(r.error); };
function driveFinish(err) {
  DR.busy = false;
  DR.msg = err ? ({ NO_AUTH: 'Сессия истекла, войдите заново.', NETWORK: 'Нет связи с Google.' }[err] || 'Не получилось синхронизировать.') : 'Готово · ' + new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  structural();
}
let driveLastAuto = 0;
function driveAutoSync() {
  if (DR.connecting || DR.busy) return;
  if (!driveState().connected) return;
  if (Date.now() - driveLastAuto < 25000) return;
  driveLastAuto = Date.now();
  driveSyncNow();
}
setTimeout(() => driveAutoSync(), 7000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') driveAutoSync(); });
setInterval(() => { if (document.visibilityState === 'visible') driveAutoSync(); }, 5 * 60 * 1000);

window.lumaDriveDeleted = (json) => {
  let r = {}; try { r = JSON.parse(json); } catch {}
  DR.msg = r.error ? 'Не получилось удалить файл с Диска. Проверьте сеть.' : '';
  structural();
};
