/* NavPro — motor de navegación y avisos (sin DOM, probado en Node).
 * Geometría, seguimiento de ruta, instrucciones en italiano, límites de velocidad
 * y motor de avisos (autovelox, curvas, pasos a nivel, escuelas, giros).
 */
(function (root) {
'use strict';

const R = 6371000;
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const norm360 = a => ((a % 360) + 360) % 360;
const angDiff = (a, b) => { const d = norm360(b - a); return d > 180 ? d - 360 : d; };

/* ---------------- Geometría ---------------- */
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return norm360(deg(Math.atan2(y, x)));
}
function destination(a, brg, dist) {
  const d = dist / R, b = rad(brg), la = rad(a.lat), lo = rad(a.lon);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: deg(la2), lon: ((deg(lo2) + 540) % 360) - 180 };
}

/* Mejor segmento de una polilínea respecto a p, entre los índices i0..i1 */
function searchSegs(pts, cum, p, i0, i1) {
  const ky = R * Math.PI / 180, kx = ky * Math.cos(rad(p.lat));
  let best = null;
  for (let i = i0; i <= i1; i++) {
    const ax = (pts[i].lon - p.lon) * kx, ay = (pts[i].lat - p.lat) * ky;
    const bx = (pts[i + 1].lon - p.lon) * kx, by = (pts[i + 1].lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? -(ax * dx + ay * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (!best || off < best.off) {
      best = { seg: i, t, off, along: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
  }
  return best;
}

function snap(route, p, hintSeg) {
  const n = route.pts.length;
  if (n < 2) return null;
  const h = hintSeg || 0;
  let best = searchSegs(route.pts, route.cum, p, Math.max(0, h - 5), Math.min(n - 2, h + 120));
  if (!best || best.off > 100) {
    const g = searchSegs(route.pts, route.cum, p, 0, n - 2);
    if (g && (!best || g.off < best.off)) best = g;
  }
  return best;
}

function pointAt(route, dist) {
  const { cum, pts } = route;
  const d = Math.max(0, Math.min(route.total, dist));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (d - cum[lo]) / seg : 0;
  return { lat: pts[lo].lat + (pts[hi].lat - pts[lo].lat) * t, lon: pts[lo].lon + (pts[hi].lon - pts[lo].lon) * t };
}

/* ---------------- Formato ---------------- */
function fmtDist(m) {
  if (m < 1000) return (m < 100 ? Math.max(0, Math.round(m / 10) * 10) : Math.round(m / 50) * 50) + ' m';
  const k = m / 1000;
  return (k >= 10 ? Math.round(k) : (Math.round(k * 10) / 10).toString().replace('.', ',')) + ' km';
}
function fmtDistSpeech(m) {
  if (m < 1000) {
    const r = m < 150 ? Math.max(50, Math.round(m / 50) * 50) : Math.round(m / 50) * 50;
    return r + ' metri';
  }
  const k = Math.round(m / 100) / 10;
  if (k === 1) return 'un chilometro';
  return (k % 1 === 0 ? String(k) : String(k).replace('.', ',')) + ' chilometri';
}
function fmtDuration(sec) {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
}
const lowerFirst = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;

/* ---------------- Instrucciones en italiano ---------------- */
const DIR = {
  left: 'a sinistra', right: 'a destra', 'slight left': 'leggermente a sinistra', 'slight right': 'leggermente a destra',
  'sharp left': 'decisamente a sinistra', 'sharp right': 'decisamente a destra', straight: 'dritto',
};
const ICON = {
  left: '↰', right: '↱', 'slight left': '↖', 'slight right': '↗', 'sharp left': '↙', 'sharp right': '↘', straight: '↑', uturn: '↶',
};

function instruction(step) {
  const m = step.maneuver || {}, t = m.type, mod = m.modifier;
  const name = (step.name || '').trim();
  const on = name ? ' in ' + name : '';
  const icon = ICON[mod] || '↑';
  switch (t) {
    case 'depart': return { text: 'Parti' + (name ? ' su ' + name : ''), icon: '➤' };
    case 'arrive': {
      const side = mod === 'left' ? ', sulla sinistra' : mod === 'right' ? ', sulla destra' : '';
      return { text: 'Sei arrivato a destinazione' + side, icon: '⚑' };
    }
    case 'roundabout': case 'rotary': case 'roundabout turn': {
      const ex = m.exit;
      return { text: ex ? `Alla rotatoria prendi la ${ex}ª uscita${name ? ' verso ' + name : ''}` : 'Entra nella rotatoria', icon: '⟳' };
    }
    case 'exit roundabout': case 'exit rotary': return { text: 'Esci dalla rotatoria' + on, icon };
    case 'merge': return { text: 'Immettiti' + (name ? ' su ' + name : ''), icon };
    case 'on ramp': return { text: 'Prendi la rampa' + (DIR[mod] && mod !== 'straight' ? ' ' + DIR[mod] : ''), icon };
    case 'off ramp': return { text: "Prendi l'uscita" + (DIR[mod] && mod !== 'straight' ? ' ' + DIR[mod] : '') + (name ? ' verso ' + name : ''), icon };
    case 'fork': return { text: 'Alla biforcazione tieni la ' + (/left/.test(mod || '') ? 'sinistra' : 'destra'), icon };
    case 'end of road': return { text: 'Alla fine della strada svolta ' + (DIR[mod] || 'a destra') + on, icon };
    case 'continue': case 'new name':
      if (!mod || mod === 'straight') return { text: 'Prosegui dritto' + (name ? ' su ' + name : ''), icon: '↑' };
      return { text: 'Prosegui ' + (DIR[mod] || 'dritto') + on, icon };
    case 'turn':
    default:
      if (mod === 'uturn') return { text: 'Fai inversione a U', icon: '↶' };
      if (!mod || mod === 'straight') return { text: 'Prosegui dritto' + (name ? ' su ' + name : ''), icon: '↑' };
      return { text: 'Svolta ' + (DIR[mod] || '') + on, icon };
  }
}

/* ---------------- Ruta ---------------- */
function buildRoute(r, id) {
  const pts = r.geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  const route = { id: id || ('r' + Math.random().toString(36).slice(2)), pts, cum, total, duration: r.duration, steps: [], curves: [] };

  const raw = [];
  for (const leg of (r.legs || [])) for (const s of leg.steps) raw.push(s);
  const rawTotal = raw.reduce((s, x) => s + x.distance, 0) || 1;
  const f = total / rawTotal;
  let acc = 0;
  raw.forEach((s, i) => {
    const ins = instruction(s);
    route.steps.push({
      idx: i, startDist: i === 0 ? 0 : Math.min(total, acc * f), length: s.distance * f, name: s.name || '',
      type: (s.maneuver || {}).type, modifier: (s.maneuver || {}).modifier, text: ins.text, icon: ins.icon,
      location: s.maneuver && s.maneuver.location ? { lat: s.maneuver.location[1], lon: s.maneuver.location[0] } : null,
    });
    acc += s.distance;
  });
  route.curves = detectCurves(route);
  return route;
}

function nextStep(route, along) {
  for (const s of route.steps) if (s.idx > 0 && s.startDist > along + 1) return s;
  return null;
}

function detectCurves(route) {
  const step = 15, n = Math.floor(route.total / step);
  if (n < 12) return [];
  const sp = [];
  for (let k = 0; k <= n; k++) sp.push(pointAt(route, k * step));
  const brg = [];
  for (let k = 0; k < n; k++) brg.push(bearing(sp[k], sp[k + 1]));
  const raw = [];
  for (let k = 3; k < n - 3; k++) {
    const ang = Math.abs(angDiff(brg[k - 3], brg[k + 3]));
    if (ang >= 60) raw.push({ dist: k * step, angle: ang });
  }
  const merged = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last && c.dist - last.endDist <= 120) {
      last.endDist = c.dist;
      if (c.angle > last.angle) last.angle = c.angle;
    } else merged.push({ startDist: c.dist, endDist: c.dist, angle: c.angle });
  }
  // las curvas que son maniobras (cruces, rotondas) no cuentan como "curva peligrosa"
  return merged.filter(c => !route.steps.some(s => {
    if (s.idx === 0) return false;
    const radius = (s.type === 'roundabout' || s.type === 'rotary') ? 200 : 90;
    return s.startDist >= c.startDist - radius && s.startDist <= c.endDist + radius;
  }));
}

/* ---------------- Límites de velocidad ---------------- */
function parseMaxspeed(v) {
  if (v == null) return null;
  const s = String(v).split(';')[0].trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let m = s.match(/^(\d+)\s*mph$/);
  if (m) return Math.round(parseInt(m[1], 10) * 1.609);
  if (s === 'it:urban') return 50;
  if (s === 'it:rural') return 90;
  if (s === 'it:motorway') return 130;
  if (s === 'it:trunk') return 110;
  if (s === 'walk') return 7;
  return null;
}
const DEFAULT_LIMIT = { motorway: 130, trunk: 110, primary: 90, secondary: 90, tertiary: 70, unclassified: 50, residential: 50, living_street: 20, service: 30, motorway_link: 80, trunk_link: 70, primary_link: 60, secondary_link: 60, tertiary_link: 50 };
const DRIVABLE = new Set(Object.keys(DEFAULT_LIMIT));

function limitFromTags(tags) {
  if (!tags) return null;
  const explicit = parseMaxspeed(tags.maxspeed);
  if (explicit) return { value: explicit, estimated: false };
  const d = DEFAULT_LIMIT[tags.highway];
  return d ? { value: d, estimated: true } : null;
}

/* Elige la vía más cercana (y alineada con el rumbo) entre los elementos de Overpass con geometría */
function nearestWay(elements, pos, heading) {
  let best = null;
  const ky = R * Math.PI / 180, kx = ky * Math.cos(rad(pos.lat));
  for (const el of elements || []) {
    if (!el.tags || !DRIVABLE.has(el.tags.highway) || !el.geometry || el.geometry.length < 2) continue;
    const g = el.geometry;
    let md = Infinity, mb = 0;
    for (let i = 0; i < g.length - 1; i++) {
      const ax = (g[i].lon - pos.lon) * kx, ay = (g[i].lat - pos.lat) * ky;
      const bx = (g[i + 1].lon - pos.lon) * kx, by = (g[i + 1].lat - pos.lat) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? -(ax * dx + ay * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < md) { md = d; mb = bearing(g[i], g[i + 1]); }
    }
    let score = md;
    if (heading != null) {
      const diff = Math.abs(angDiff(heading, mb)), al = Math.min(diff, 180 - diff);
      if (al > 35) score += 30;
    }
    if (!best || score < best.score) best = { score, dist: md, tags: el.tags };
  }
  return best;
}

/* ---------------- Puntos de interés ---------------- */
function classifyPoi(tags, id, lat, lon) {
  tags = tags || {};
  const enf = (tags.enforcement || '').split(';')[0].trim();
  let type = null, label = '';
  if (enf === 'no') return null;
  if (tags.highway === 'speed_camera' || enf === 'maxspeed') { type = 'camera'; label = 'Autovelox'; }
  else if (enf === 'average_speed') { type = 'camera'; label = 'Tutor, controllo velocità media'; }
  else if (enf === 'traffic_signals') { type = 'redlight'; label = 'Telecamera al semaforo'; }
  else if (enf) { type = 'zone'; label = enf === 'bus_lane' ? 'Corsia preferenziale con telecamera' : 'Varco con telecamera, possibile ZTL'; }
  else if (tags.railway === 'level_crossing') { type = 'crossing'; label = 'Passaggio a livello'; }
  else if (tags.amenity === 'school') { type = 'school'; label = 'Scuola'; }
  else return null;
  return { id, type, label, lat, lon, maxspeed: parseMaxspeed(tags.maxspeed) };
}

function parseOverpass(json) {
  const out = [];
  for (const el of (json && json.elements) || []) {
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null || lon == null) continue;
    const p = classifyPoi(el.tags, el.type + '/' + el.id, lat, lon);
    if (p) out.push(p);
  }
  return out;
}

/* ---------------- Motor de avisos ---------------- */
const STAGES = {
  camera: [1000, 500, 250, 100],
  redlight: [600, 250],
  zone: [500, 200],
  crossing: [500, 200],
  school: [300],
};

class AlertEngine {
  constructor(opts) {
    this.opts = Object.assign({
      tol: 5,
      enabled: { camera: true, redlight: true, zone: true, crossing: true, school: true, curve: true, turn: true },
    }, opts || {});
    this.pois = new Map();
    this.done = new Set();
    this.passed = new Set();
    this.last = new Map();
    this.routeCache = new Map();
    this.turnDone = new Set();
    this.curveDone = new Set();
    this.lastSpeedAlert = 0;
    this.lastLimit = null;
    this.limitSeen = 0;
  }
  setPois(list) { for (const p of list) if (!this.pois.has(p.id)) this.pois.set(p.id, p); }
  resetRoute() { this.routeCache.clear(); this.turnDone.clear(); this.curveDone.clear(); }

  update(c) {
    const events = [], upcoming = [];
    const { pos, heading, speedKmh, route, prog, now } = c;
    const onRoute = !!(route && prog && prog.off < 80);
    const moving = speedKmh > 5 && heading != null;
    const limit = c.limit || null;

    /* --- POIs --- */
    for (const p of this.pois.values()) {
      if (this.passed.has(p.id) || !this.opts.enabled[p.type]) continue;
      const st = STAGES[p.type];
      if (!st) continue;
      const straight = haversine(pos, p);
      if (straight > st[0] + 300) continue;
      let dist;
      if (onRoute) {
        let rc = this.routeCache.get(p.id);
        if (!rc) {
          const sn = searchSegs(route.pts, route.cum, p, 0, route.pts.length - 2);
          rc = { off: sn.off, along: sn.along };
          this.routeCache.set(p.id, rc);
        }
        if (rc.off > (p.type === 'school' ? 70 : 40)) continue;
        dist = rc.along - prog.along;
        if (dist < -25) { this.passed.add(p.id); continue; }
        dist = Math.max(0, dist);
      } else {
        if (!moving) continue;
        const diff = Math.abs(angDiff(heading, bearing(pos, p)));
        if (straight > 80 && diff > 35) { if (diff > 100 && straight < 200) this.passed.add(p.id); continue; }
        const prev = this.last.get(p.id);
        if (prev != null && straight > prev + 25 && prev < 150) { this.passed.add(p.id); continue; }
        this.last.set(p.id, straight);
        dist = straight;
      }
      if (dist > st[0]) continue;
      upcoming.push({ poi: p, dist });

      const sat = st.filter(th => dist <= th);
      if (!sat.length) continue;
      const th = Math.min(...sat);
      const key = p.id + ':' + th;
      if (this.done.has(key)) continue;
      for (const t of st) if (t >= th) this.done.add(p.id + ':' + t);
      events.push(this._poiEvent(p, dist, th, st, speedKmh, limit));
    }
    upcoming.sort((a, b) => a.dist - b.dist);

    /* --- Curvas peligrosas --- */
    if (this.opts.enabled.curve && onRoute && speedKmh > 50) {
      route.curves.forEach((cv, i) => {
        if (this.curveDone.has(i)) return;
        const d = cv.startDist - prog.along;
        if (d > 0 && d <= 250 && cv.angle >= 60 && speedKmh > 55) {
          this.curveDone.add(i);
          events.push({ key: 'curve:' + i, type: 'curve', level: 'warn', speak: true, beep: true, dist: d,
            text: `Curva pericolosa tra ${fmtDistSpeech(d)}, rallenta`, icon: '⤴' });
        } else if (d < -50) this.curveDone.add(i);
      });
    }

    /* --- Giros --- */
    if (this.opts.enabled.turn && onRoute) {
      const t = this.turnEvent(route, prog.along, speedKmh);
      if (t) events.push(t);
    }

    /* --- Velocidad --- */
    if (limit) {
      const explicit = !limit.estimated || limit.value >= 110;
      if (this.lastLimit !== limit.value) {
        this.limitSeen++;
        if (this.limitSeen >= 2) {
          const first = this.lastLimit == null;
          this.lastLimit = limit.value; this.limitSeen = 0;
          if (!first && !limit.estimated) events.push({ key: 'limit:' + limit.value + ':' + now, type: 'limit', level: 'info', speak: true, text: `Nuovo limite, ${limit.value}`, icon: '🚸' });
        }
      } else this.limitSeen = 0;
      if (explicit && speedKmh > limit.value + this.opts.tol && now - this.lastSpeedAlert > 15000) {
        this.lastSpeedAlert = now;
        events.push({ key: 'speed:' + now, type: 'speed', level: 'danger', speak: true, beep: true, text: `Limite ${limit.value}, riduci la velocità`, icon: '⚠️' });
      }
    }
    return { events, upcoming };
  }

  _poiEvent(p, dist, th, st, speedKmh, limit) {
    const cap = p.maxspeed || (limit && limit.value) || null;
    const over = cap && speedKmh > cap + this.opts.tol;
    const isLast = th === st[st.length - 1] && p.type === 'camera' && st.length > 1;
    let text, speak = true;
    if (p.type === 'school') text = `Attenzione, scuola vicina, tra ${fmtDistSpeech(dist)}`;
    else if (isLast) { text = p.label; speak = !!over; }
    else {
      text = `${p.label} tra ${fmtDistSpeech(dist)}`;
      if (p.type === 'camera' && p.maxspeed) text += `, limite ${p.maxspeed}`;
      if (over && (p.type === 'camera' || p.type === 'redlight')) text += '. Riduci la velocità';
    }
    const level = (p.type === 'camera' || p.type === 'redlight' || p.type === 'zone') ? 'danger' : 'warn';
    const icon = { camera: '📷', redlight: '🚦', zone: '🚫', crossing: '🚧', school: '🏫' }[p.type] || '⚠️';
    return { key: p.id + ':' + th, type: p.type, level, speak, beep: true, dist, text, icon, poi: p };
  }

  turnEvent(route, along, speedKmh) {
    const next = nextStep(route, along);
    if (!next) return null;
    const dist = next.startDist - along;
    const v = Math.max(speedKmh, 20) / 3.6;
    const stages = [
      { k: 'far', th: Math.max(600, v * 40) },
      { k: 'mid', th: Math.max(250, v * 18) },
      { k: 'near', th: Math.max(70, v * 5) },
    ];
    const sat = stages.filter(s => dist <= s.th);
    if (!sat.length) return null;
    const pick = sat.reduce((a, b) => (a.th < b.th ? a : b));
    const key = next.idx + ':' + pick.k;
    if (this.turnDone.has(key)) return null;
    for (const s of stages) if (s.th >= pick.th) this.turnDone.add(next.idx + ':' + s.k);
    let text;
    if (pick.k === 'near') {
      text = next.text;
      const after = route.steps[next.idx + 1];
      if (after && after.type !== 'arrive' && after.startDist - next.startDist < 150) text += ', poi ' + lowerFirst(after.text);
    } else if (next.type === 'arrive') text = `Tra ${fmtDistSpeech(dist)} arriverai a destinazione`;
    else text = `Tra ${fmtDistSpeech(dist)}, ${lowerFirst(next.text)}`;
    return { key: 'turn:' + key, type: 'turn', level: 'info', speak: true, beep: false, dist, text, icon: next.icon };
  }
}

const api = {
  haversine, bearing, destination, angDiff, norm360, snap, pointAt, searchSegs,
  fmtDist, fmtDistSpeech, fmtDuration, instruction, buildRoute, nextStep,
  parseMaxspeed, limitFromTags, nearestWay, classifyPoi, parseOverpass, AlertEngine, STAGES,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Nav = api;
})(typeof window !== 'undefined' ? window : globalThis);
