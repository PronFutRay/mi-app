/* NavPro GPS — interfaz: mapa, búsqueda, rutas, voz y avisos en tiempo real */
(() => {
'use strict';
const N = window.Nav;
const $ = id => document.getElementById(id);
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/* ---------- Ajustes ---------- */
const DEFAULTS = { camera: true, redlight: true, zone: true, crossing: true, school: true, curve: true, turn: true, voice: true, beep: true, dark: true, tol: 5 };
let settings = Object.assign({}, DEFAULTS);
try { Object.assign(settings, JSON.parse(localStorage.getItem('navpro.settings') || '{}')); } catch (e) { /* sin storage */ }
const saveSettings = () => { try { localStorage.setItem('navpro.settings', JSON.stringify(settings)); } catch (e) { /* ok */ } };

/* ---------- Estado ---------- */
const S = {
  pos: null, heading: null, speed: 0, lastFix: null, follow: true,
  route: null, routes: [], sel: 0, dest: null, navigating: false, hint: 0, prog: null,
  offCount: 0, lastReroute: 0, sim: null, watchId: null,
  limit: null, road: '', limitBusy: false, limitAt: 0, limitPos: null,
  chunks: new Set(), freeQ: null, wake: null, startedAt: 0,
};
const engine = new N.AlertEngine({ tol: settings.tol, enabled: settings });

/* ---------- Mapa ---------- */
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([41.9, 12.5], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
const meIcon = L.divIcon({ className: 'me', iconSize: [34, 34], iconAnchor: [17, 17],
  html: '<div id="meArrow"><svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#0ea5e9" fill-opacity=".25"/><path d="M17 4 L26 27 L17 22 L8 27 Z" fill="#38bdf8" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>' });
let meMarker = null, routeLines = [], destMarker = null;
const poiMarkers = new Map();
const POI_ICON = { camera: '📷', redlight: '🚦', zone: '🚫', crossing: '🚧', school: '🏫' };

function applyDark() { document.body.classList.toggle('dark', !!settings.dark); }
applyDark();
map.on('dragstart', () => { S.follow = false; });
$('btnFollow').onclick = () => { S.follow = true; if (S.pos) centerOn(S.pos); };
$('btnZoomIn').onclick = () => map.zoomIn();
$('btnZoomOut').onclick = () => map.zoomOut();
map.on('contextmenu', e => setDestination({ lat: e.latlng.lat, lon: e.latlng.lng, name: 'Punto del mapa' }));

function centerOn(p) { map.setView([p.lat, p.lon], Math.max(map.getZoom(), S.navigating ? 16 : 15), { animate: false }); }

function drawMe(p, heading) {
  if (!meMarker) meMarker = L.marker([p.lat, p.lon], { icon: meIcon, zIndexOffset: 1000 }).addTo(map);
  else meMarker.setLatLng([p.lat, p.lon]);
  const el = document.getElementById('meArrow');
  if (el && heading != null) el.style.transform = 'rotate(' + Math.round(heading) + 'deg)';
}

/* ---------- Voz, pitido y avisos ---------- */
let itVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  itVoice = vs.find(v => /^it/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

function speak(text, urgent) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  try {
    if (urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT'; if (itVoice) u.voice = itVoice; u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (e) { /* sin voz */ }
}

let actx = null;
function beep(level) {
  if (!settings.beep) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
    const n = level === 'danger' ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const t0 = actx.currentTime + i * 0.17, o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = level === 'danger' ? 1000 : 760;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
      o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + 0.14);
    }
  } catch (e) { /* sin audio */ }
}

let toastTimer = 0;
function showToast(ev) {
  const t = $('toast');
  t.className = 'card ' + ev.level; $('tIcon').textContent = ev.icon || '⚠️'; $('tText').textContent = ev.text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ev.level === 'danger' ? 9000 : 6000);
  if (navigator.vibrate && ev.level !== 'info') { try { navigator.vibrate(ev.level === 'danger' ? [200, 100, 200] : 150); } catch (e) { /* ok */ } }
}
function handleEvent(ev) {
  if (ev.type !== 'turn') showToast(ev);
  if (ev.beep) beep(ev.level);
  if (ev.speak) speak(ev.text, ev.level === 'danger');
}

/* ---------- Red ---------- */
async function fetchJson(url, opts, ms) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms || 20000);
  try { const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {})); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(to); }
}
async function overpass(q) {
  for (const u of OVERPASS) {
    try { return await fetchJson(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 25000); } catch (e) { /* siguiente servidor */ }
  }
  return null;
}
const POI_FILTER = bbox => `node["highway"="speed_camera"]${bbox};node["enforcement"]["enforcement"!="no"]${bbox};node["railway"="level_crossing"]${bbox};nwr["amenity"="school"]${bbox};`;

function addPois(list) {
  const fresh = list.filter(p => !engine.pois.has(p.id));
  engine.setPois(fresh);
  for (const p of fresh) {
    if (poiMarkers.has(p.id)) continue;
    const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: `<div class="poi-ico">${POI_ICON[p.type] || '⚠️'}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false });
    m.addTo(map); poiMarkers.set(p.id, m);
  }
}

const CHUNK = 12000, AHEAD = 40000;
async function ensureChunks(along) {
  const r = S.route; if (!r) return;
  const last = Math.floor(r.total / CHUNK), from = Math.floor(along / CHUNK), to = Math.min(last, Math.floor((along + AHEAD) / CHUNK));
  for (let i = from; i <= to; i++) {
    const key = r.id + ':' + i;
    if (S.chunks.has(key)) continue;
    S.chunks.add(key);
    let s = 1e9, w = 1e9, n = -1e9, e = -1e9;
    for (let d = i * CHUNK; d <= Math.min(r.total, (i + 1) * CHUNK); d += 400) {
      const p = N.pointAt(r, d); s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon);
    }
    const pad = 0.004, bb = `(${(s - pad).toFixed(5)},${(w - pad).toFixed(5)},${(n + pad).toFixed(5)},${(e + pad).toFixed(5)})`;
    overpass(`[out:json][timeout:25];(${POI_FILTER(bb)});out center tags;`).then(j => {
      if (!j) { S.chunks.delete(key); return; }
      if (S.route && S.route.id === r.id) addPois(N.parseOverpass(j));
    });
  }
}
function ensureFreePois(pos) {
  if (S.freeQ && N.haversine(S.freeQ, pos) < 1500) return;
  S.freeQ = { lat: pos.lat, lon: pos.lon };
  overpass(`[out:json][timeout:25];(${POI_FILTER(`(around:4000,${pos.lat.toFixed(5)},${pos.lon.toFixed(5)})`)});out center tags;`).then(j => {
    if (j) addPois(N.parseOverpass(j)); else S.freeQ = null;
  });
}
function refreshLimit(pos, heading) {
  const now = Date.now();
  if (S.limitBusy || now - S.limitAt < 6000) return;
  if (S.limitPos && N.haversine(S.limitPos, pos) < 30 && now - S.limitAt < 25000) return;
  S.limitBusy = true; S.limitAt = now; S.limitPos = { lat: pos.lat, lon: pos.lon };
  overpass(`[out:json][timeout:10];way(around:30,${pos.lat.toFixed(5)},${pos.lon.toFixed(5)})["highway"];out tags geom;`).then(j => {
    const best = j && N.nearestWay(j.elements, pos, heading);
    if (best && best.dist < 35) { S.limit = N.limitFromTags(best.tags); S.road = best.tags.name || best.tags.ref || ''; }
  }).finally(() => { S.limitBusy = false; });
}

/* ---------- Búsqueda y rutas ---------- */
async function search() {
  const q = $('q').value.trim(); if (!q) return;
  const box = $('results'); box.classList.remove('hidden'); box.innerHTML = '<div class="res">Buscando…</div>';
  try {
    const c = map.getCenter();
    const j = await fetchJson(`${NOMINATIM}?format=jsonv2&limit=6&accept-language=it&q=${encodeURIComponent(q)}&viewbox=${c.lng - 2},${c.lat + 2},${c.lng + 2},${c.lat - 2}`);
    if (!j.length) { box.innerHTML = '<div class="res">Sin resultados</div>'; return; }
    box.innerHTML = '';
    j.forEach(r => {
      const d = document.createElement('div'); d.className = 'res';
      const parts = r.display_name.split(', ');
      d.innerHTML = `<b></b><small></small>`; d.firstChild.textContent = parts[0]; d.lastChild.textContent = parts.slice(1, 4).join(', ');
      d.onclick = () => { box.classList.add('hidden'); $('q').blur(); setDestination({ lat: +r.lat, lon: +r.lon, name: parts[0] }); };
      box.appendChild(d);
    });
  } catch (e) { box.innerHTML = '<div class="res">No se pudo buscar (¿hay conexión?)</div>'; }
}
$('btnSearch').onclick = search;
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });

function getOrigin() {
  if (S.pos) return Promise.resolve({ p: { lat: S.pos.lat, lon: S.pos.lon }, real: true });
  return new Promise(res => {
    const fallback = () => { const c = map.getCenter(); res({ p: { lat: c.lat, lon: c.lng }, real: false }); };
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(g => res({ p: { lat: g.coords.latitude, lon: g.coords.longitude }, real: true }), fallback, { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 });
  });
}

async function setDestination(dest) {
  S.dest = dest; stopNavigation(true);
  if (destMarker) destMarker.remove();
  destMarker = L.marker([dest.lat, dest.lon]).addTo(map);
  const panel = $('routes'); panel.classList.remove('hidden'); panel.innerHTML = 'Calculando rutas…';
  const o = await getOrigin();
  S.origin = o;
  try {
    const url = `${OSRM}${o.p.lon},${o.p.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson&steps=true&alternatives=3`;
    const j = await fetchJson(url);
    if (j.code !== 'Ok' || !j.routes.length) throw new Error('sin ruta');
    S.routes = j.routes.map((r, i) => N.buildRoute(r, 'r' + Date.now() + i));
    selectRoute(0, true);
  } catch (e) { panel.innerHTML = 'No se pudo calcular la ruta. Revisa la conexión e inténtalo de nuevo.'; }
}

function drawRoutes() {
  routeLines.forEach(l => l.remove()); routeLines = [];
  S.routes.forEach((r, i) => {
    if (i === S.sel) return;
    routeLines.push(L.polyline(r.pts.map(p => [p.lat, p.lon]), { color: '#64748b', weight: 6, opacity: .8 }).addTo(map));
  });
  const r = S.routes[S.sel];
  routeLines.push(L.polyline(r.pts.map(p => [p.lat, p.lon]), { color: '#38bdf8', weight: 8, opacity: .95 }).addTo(map));
}
function selectRoute(i, fit) {
  S.sel = i; const r = S.routes[i];
  drawRoutes();
  if (fit) map.fitBounds(L.latLngBounds(r.pts.map(p => [p.lat, p.lon])), { padding: [40, 120] });
  const panel = $('routes');
  panel.innerHTML = '';
  S.routes.forEach((x, k) => {
    const c = document.createElement('div'); c.className = 'rcard' + (k === i ? ' sel' : '');
    c.innerHTML = `<div><b>${N.fmtDuration(x.duration)}</b><br><span>${N.fmtDist(x.total)}${k === 0 ? ' · más rápida' : ''}</span></div><span>${x.curves.length} curvas</span>`;
    c.onclick = () => selectRoute(k, false); panel.appendChild(c);
  });
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = '<button class="btn ok" id="goBtn">▶ Iniciar</button><button class="btn" id="simBtn">🧪 Simular</button><button class="btn" id="cancelBtn">✕</button>';
  panel.appendChild(row);
  $('goBtn').onclick = () => startNavigation(false);
  $('simBtn').onclick = () => startNavigation(true);
  $('cancelBtn').onclick = cancelRoute;
}
function cancelRoute() {
  stopNavigation(true); S.dest = null; S.routes = [];
  routeLines.forEach(l => l.remove()); routeLines = [];
  if (destMarker) { destMarker.remove(); destMarker = null; }
  $('routes').classList.add('hidden');
}

/* ---------- Navegación ---------- */
function resetEngine() { engine.done.clear(); engine.passed.clear(); engine.last.clear(); engine.resetRoute(); }

async function startNavigation(simulate) {
  const r = S.routes[S.sel]; if (!r) return;
  if (!simulate && !(S.origin && S.origin.real)) { showToast({ level: 'warn', icon: '📍', text: 'Activa la ubicación para navegar. Puedes probar con Simular.' }); return; }
  S.route = r; S.hint = 0; S.prog = null; S.navigating = true; S.offCount = 0; S.follow = true; S.startedAt = Date.now();
  routeLines.forEach(l => l.remove()); routeLines = [L.polyline(r.pts.map(p => [p.lat, p.lon]), { color: '#38bdf8', weight: 8, opacity: .95 }).addTo(map)];
  resetEngine(); S.chunks.clear();
  $('routes').classList.add('hidden'); $('hud').classList.remove('hidden'); $('banner').classList.remove('hidden');
  speak('Navigazione avviata', true);
  keepAwake();
  if (simulate) startSim(); else { S.sim = null; $('simtag').classList.add('hidden'); startWatch(); }
  const o = S.pos || S.origin.p;
  ensureChunks(0);
  centerOn(o);
}

function stopNavigation(silent) {
  S.navigating = false; S.route = null; S.prog = null;
  if (S.sim) { clearInterval(S.sim.timer); S.sim = null; }
  $('simtag').classList.add('hidden');
  $('hud').classList.add('hidden'); $('banner').classList.add('hidden'); $('poi').classList.add('hidden'); $('toast').classList.add('hidden');
  if (!silent) { speak('Navigazione terminata', true); $('routes').classList.add('hidden'); }
  if (!S.dest) return;
  if (!silent) { cancelRoute(); }
}
$('btnStop').onclick = () => { stopNavigation(false); };

async function keepAwake() { try { if ('wakeLock' in navigator) S.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* ok */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.navigating) keepAwake(); });

/* ---------- GPS real ---------- */
function startWatch() {
  if (S.watchId != null || !navigator.geolocation) return;
  S.watchId = navigator.geolocation.watchPosition(g => {
    onFix({ lat: g.coords.latitude, lon: g.coords.longitude, speed: g.coords.speed, heading: g.coords.heading, acc: g.coords.accuracy, ts: g.timestamp || Date.now() });
  }, err => showToast({ level: 'warn', icon: '📍', text: 'Sin señal GPS: ' + (err.code === 1 ? 'permiso denegado' : 'buscando…') }),
  { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}
if (navigator.geolocation) startWatch();

/* ---------- Simulación ---------- */
function startSim() {
  const r = S.route, speeds = [50, 90, 130]; let si = 1;
  S.sim = { dist: 0, kmh: speeds[si], timer: 0 };
  $('simtag').classList.remove('hidden'); $('simtag').textContent = 'SIMULACIÓN ' + S.sim.kmh + ' km/h (toca para cambiar)';
  $('simtag').onclick = () => { si = (si + 1) % speeds.length; S.sim.kmh = speeds[si]; $('simtag').textContent = 'SIMULACIÓN ' + S.sim.kmh + ' km/h (toca para cambiar)'; };
  S.sim.timer = setInterval(() => {
    if (!S.sim) return;
    S.sim.dist += S.sim.kmh / 3.6;
    if (S.sim.dist >= r.total) S.sim.dist = r.total;
    const p = N.pointAt(r, S.sim.dist), q = N.pointAt(r, Math.min(r.total, S.sim.dist + 15));
    onFix({ lat: p.lat, lon: p.lon, speed: S.sim.kmh / 3.6, heading: N.bearing(p, q), acc: 5, ts: Date.now(), sim: true });
  }, 1000);
}

/* ---------- Procesado de cada posición ---------- */
function onFix(f) {
  if (S.sim && !f.sim) return;         // en simulación se ignora el GPS real
  if (f.acc != null && f.acc > 120 && !f.sim) return;
  const prev = S.pos, p = { lat: f.lat, lon: f.lon };
  let speed = f.speed != null && !isNaN(f.speed) ? f.speed : null;
  if (speed == null && prev && S.lastFix) { const dt = (f.ts - S.lastFix) / 1000; if (dt > 0.3) speed = N.haversine(prev, p) / dt; }
  speed = speed || 0;
  let heading = f.heading != null && !isNaN(f.heading) && speed > 1.5 ? f.heading : null;
  if (heading == null && prev && N.haversine(prev, p) > 8) heading = N.bearing(prev, p);
  if (heading == null) heading = S.heading;
  S.pos = p; S.heading = heading; S.speed = speed; S.lastFix = f.ts;
  const kmh = speed * 3.6;

  drawMe(p, heading);
  if (S.follow) centerOn(p);

  if (!S.navigating) { if (!S.route) { ensureFreePois(p); refreshLimit(p, heading); runAlerts(p, heading, kmh, null, null); updateHud(kmh, null); } return; }

  const r = S.route;
  const prog = N.snap(r, p, S.hint); S.hint = prog.seg; S.prog = prog;
  if (!f.sim) {
    if (prog.off > 60) { S.offCount++; if (S.offCount >= 3 && Date.now() - S.lastReroute > 10000) reroute(p); } else S.offCount = 0;
  }
  ensureChunks(prog.along);
  refreshLimit(p, heading);
  runAlerts(p, heading, kmh, r, prog);
  updateHud(kmh, prog);
  if (r.total - prog.along < 25) arrived();
}

function runAlerts(p, heading, kmh, route, prog) {
  const res = engine.update({ pos: p, heading, speedKmh: kmh, route, prog, now: Date.now(), limit: S.limit });
  res.events.forEach(handleEvent);
  const pill = $('poi'), n = res.upcoming[0];
  if (n && n.dist < 1500) { pill.classList.remove('hidden'); pill.textContent = `${POI_ICON[n.poi.type] || '⚠️'} ${n.poi.label} · ${N.fmtDist(n.dist)}`; }
  else pill.classList.add('hidden');
}

function updateHud(kmh, prog) {
  $('hud').classList.remove('hidden');
  const k = Math.round(kmh); $('spdV').textContent = k;
  const lim = $('lim');
  if (S.limit) {
    lim.classList.remove('hidden'); lim.textContent = S.limit.value; lim.classList.toggle('est', !!S.limit.estimated);
    $('spd').classList.toggle('over', k > S.limit.value + settings.tol);
  } else { lim.classList.add('hidden'); $('spd').classList.remove('over'); }
  $('road').textContent = S.road || '';
  if (prog && S.route) {
    const r = S.route, rem = Math.max(0, r.total - prog.along), secs = r.duration * (rem / r.total);
    const eta = new Date(Date.now() + secs * 1000);
    $('eta').textContent = eta.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) + ' · ' + N.fmtDuration(secs);
    $('rem').textContent = N.fmtDist(rem) + ' restantes';
    const nx = N.nextStep(r, prog.along);
    if (nx) { $('bIcon').textContent = nx.icon; $('bDist').textContent = N.fmtDist(Math.max(0, nx.startDist - prog.along)); $('bText').textContent = nx.text; }
  } else { $('eta').textContent = 'Guía libre'; $('rem').textContent = ''; $('banner').classList.add('hidden'); }
}

function arrived() {
  if (!S.navigating) return;
  showToast({ level: 'info', icon: '⚑', text: 'Has llegado a tu destino' });
  stopNavigation(true);
  cancelRoute();
}

async function reroute(p) {
  S.lastReroute = Date.now(); S.offCount = 0;
  if (!S.dest) return;
  speak('Ricalcolo del percorso', true); showToast({ level: 'info', icon: '🔄', text: 'Recalculando ruta…' });
  try {
    const j = await fetchJson(`${OSRM}${p.lon},${p.lat};${S.dest.lon},${S.dest.lat}?overview=full&geometries=geojson&steps=true`);
    if (j.code !== 'Ok' || !j.routes.length) return;
    const r = N.buildRoute(j.routes[0], 'r' + Date.now());
    S.route = r; S.routes = [r]; S.sel = 0; S.hint = 0; S.chunks.clear(); engine.resetRoute();
    routeLines.forEach(l => l.remove()); routeLines = [L.polyline(r.pts.map(q => [q.lat, q.lon]), { color: '#38bdf8', weight: 8, opacity: .95 }).addTo(map)];
    ensureChunks(0);
  } catch (e) { /* se reintenta */ }
}

/* ---------- Ajustes (UI) ---------- */
function syncSettingsUi() {
  document.querySelectorAll('[data-k]').forEach(i => { i.checked = !!settings[i.dataset.k]; });
  $('sVoice').checked = settings.voice; $('sBeep').checked = settings.beep; $('sDark').checked = settings.dark; $('sTol').value = String(settings.tol);
}
function readSettingsUi() {
  document.querySelectorAll('[data-k]').forEach(i => { settings[i.dataset.k] = i.checked; });
  settings.voice = $('sVoice').checked; settings.beep = $('sBeep').checked; settings.dark = $('sDark').checked; settings.tol = +$('sTol').value;
  engine.opts.tol = settings.tol; engine.opts.enabled = settings;
  applyDark(); saveSettings();
}
$('btnSettings').onclick = () => { syncSettingsUi(); $('modal').classList.remove('hidden'); };
$('btnCloseSet').onclick = () => $('modal').classList.add('hidden');
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
$('sheet').addEventListener('change', readSettingsUi);

// ganchos para pruebas automáticas
window.__navpro = { S, engine, onFix, setDestination, startNavigation, selectRoute, settings };
})();
