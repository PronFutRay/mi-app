/* Dragon Shot — artillería por turnos con dragones (estilo GunBound)
 * HTML5 canvas, sin dependencias. Controles táctiles y de teclado.
 */
(() => {
'use strict';

/* ================= Configuración ================= */
const W = 1200, H = 600;            // mundo lógico
const G = 0.22;                     // gravedad de proyectiles (px/frame²)
const VMAX = 16;                    // velocidad con fuerza 100 (px/frame)
const WIND_K = 0.0045;              // aceleración por punto de viento
const MOVE_SPEED = 1.3;             // px/frame
const FUEL_MAX = 140;               // px de movimiento por turno

const SHOTS = {
  normal: { name: 'Normal', r: 32, dmg: 30, ammo: Infinity, color: '#ffb454', n: 1 },
  big:    { name: 'Grande', r: 58, dmg: 48, ammo: 2,        color: '#ff5a5a', n: 1 },
  triple: { name: 'Triple', r: 24, dmg: 20, ammo: 3,        color: '#7ad7ff', n: 3 },
};
const ORDER = ['normal', 'big', 'triple'];

const PALETTES = [
  { body: '#3fbf5f', belly: '#d4f5a8', wing: '#27843f', spike: '#ffd24a', name: '#7dffa0' },
  { body: '#d9534f', belly: '#ffe0a8', wing: '#8f2c52', spike: '#ffd24a', name: '#ff9a96' },
];

/* ================= Utilidades ================= */
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);

/* ================= Canvas ================= */
const canvas = $('c');
const ctx = canvas.getContext('2d');
let scale = 1, offX = 0, offY = 0;

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  scale = Math.min(canvas.width / W, canvas.height / H);
  offX = (canvas.width - W * scale) / 2;
  offY = (canvas.height - H * scale) / 2;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement || canvas);
resize();

/* ================= Sonido ================= */
let audioCtx = null, muted = false;
function initAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* sin audio */ }
}
function tone(f, dur, type = 'square', vol = 0.06, slideTo = 0) {
  if (!audioCtx || muted) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + dur);
}
function boom(size = 1) {
  if (!audioCtx || muted) return;
  const t0 = audioCtx.currentTime, dur = 0.35 + size * 0.25;
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1400, t0); lp.frequency.exponentialRampToValueAtTime(120, t0 + dur);
  const g = audioCtx.createGain(); g.gain.value = 0.35 + size * 0.15;
  src.connect(lp); lp.connect(g); g.connect(audioCtx.destination);
  src.start(t0);
}

/* ================= Terreno destruible ================= */
const terrainCanvas = document.createElement('canvas');
terrainCanvas.width = W; terrainCanvas.height = H;
const tctx = terrainCanvas.getContext('2d');
const mask = new Uint8Array(W * H);

const bgCanvas = document.createElement('canvas');
bgCanvas.width = W; bgCanvas.height = H;

function drawBackground() {
  const b = bgCanvas.getContext('2d');
  const g = b.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120a3a');
  g.addColorStop(0.45, '#5b2a7a');
  g.addColorStop(0.8, '#e8607a');
  g.addColorStop(1, '#ffb070');
  b.fillStyle = g; b.fillRect(0, 0, W, H);
  // estrellas
  for (let i = 0; i < 90; i++) {
    b.fillStyle = `rgba(255,255,255,${rand(0.2, 0.8)})`;
    b.fillRect(rand(0, W), rand(0, H * 0.45), rand(1, 2.2), rand(1, 2.2));
  }
  // sol / luna
  const sx = rand(420, 780), sy = H * 0.52;
  const rg = b.createRadialGradient(sx, sy, 10, sx, sy, 140);
  rg.addColorStop(0, 'rgba(255,230,170,.95)'); rg.addColorStop(0.35, 'rgba(255,170,110,.55)'); rg.addColorStop(1, 'rgba(255,140,100,0)');
  b.fillStyle = rg; b.beginPath(); b.arc(sx, sy, 140, 0, 7); b.fill();
  b.fillStyle = '#ffe9b8'; b.beginPath(); b.arc(sx, sy, 44, 0, 7); b.fill();
  // montañas lejanas
  const layers = [['#3a1d5c', 0.58, 70], ['#2a1448', 0.68, 55]];
  for (const [col, base, amp] of layers) {
    b.fillStyle = col; b.beginPath(); b.moveTo(0, H);
    const p = rand(0, 6), q = rand(0, 6);
    for (let x = 0; x <= W; x += 10) b.lineTo(x, H * base + Math.sin(x * 0.006 + p) * amp * 0.6 + Math.sin(x * 0.019 + q) * amp * 0.3);
    b.lineTo(W, H); b.closePath(); b.fill();
  }
}

function genTerrain(spawns) {
  const hgt = new Float32Array(W);
  const p1 = rand(0, 6.28), p2 = rand(0, 6.28), p3 = rand(0, 6.28);
  const base = H * 0.64, a1 = rand(45, 85);
  for (let x = 0; x < W; x++) {
    hgt[x] = base + Math.sin(x * 0.0055 + p1) * a1 + Math.sin(x * 0.014 + p2) * 32 + Math.sin(x * 0.038 + p3) * 9;
  }
  // aplanar zonas de aparición
  for (const sx of spawns) {
    const c = Math.round(sx), h0 = hgt[c];
    for (let i = -50; i <= 50; i++) {
      const x = c + i; if (x < 0 || x >= W) continue;
      const w = Math.min(1, (1 - Math.abs(i) / 50) * 2.2);
      hgt[x] += (h0 - hgt[x]) * w;
    }
  }
  for (let x = 0; x < W; x++) hgt[x] = clamp(hgt[x], 220, H - 90);

  tctx.globalCompositeOperation = 'source-over';
  tctx.clearRect(0, 0, W, H);
  const g = tctx.createLinearGradient(0, 220, 0, H);
  g.addColorStop(0, '#9a6a35'); g.addColorStop(0.5, '#5e3a1c'); g.addColorStop(1, '#2b1809');
  tctx.fillStyle = g;
  tctx.beginPath(); tctx.moveTo(0, H);
  for (let x = 0; x < W; x++) tctx.lineTo(x, hgt[x]);
  tctx.lineTo(W - 1, H); tctx.closePath(); tctx.fill();

  tctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 700; i++) {
    tctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.10)' : 'rgba(255,220,160,.06)';
    tctx.beginPath(); tctx.ellipse(rand(0, W), rand(200, H), rand(3, 14), rand(2, 8), rand(0, 3), 0, 7); tctx.fill();
  }
  tctx.globalCompositeOperation = 'source-over';
  tctx.lineJoin = 'round'; tctx.lineCap = 'round';
  const topPath = dy => { tctx.beginPath(); for (let x = 0; x < W; x++) { const y = hgt[x] + dy; if (x === 0) tctx.moveTo(x, y); else tctx.lineTo(x, y); } };
  topPath(3); tctx.strokeStyle = '#2f9e4f'; tctx.lineWidth = 9; tctx.stroke();
  topPath(0); tctx.strokeStyle = '#6fe08a'; tctx.lineWidth = 3; tctx.stroke();

  mask.fill(0);
  for (let x = 0; x < W; x++) {
    for (let y = Math.ceil(hgt[x]); y < H; y++) mask[y * W + x] = 1;
  }
}

function isSolid(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return false;
  return mask[yi * W + xi] === 1;
}

function groundYFrom(x, y0) {
  const xi = clamp(Math.round(x), 0, W - 1);
  for (let y = Math.max(0, Math.floor(y0)); y < H; y++) if (mask[y * W + xi]) return y;
  return H + 200;
}

function carve(cx, cy, r) {
  tctx.save();
  tctx.globalCompositeOperation = 'destination-out';
  tctx.beginPath(); tctx.arc(cx, cy, r, 0, 7); tctx.fill();
  tctx.globalCompositeOperation = 'source-atop';
  tctx.strokeStyle = 'rgba(20,10,0,.55)'; tctx.lineWidth = 5;
  tctx.beginPath(); tctx.arc(cx, cy, r + 2, 0, 7); tctx.stroke();
  tctx.restore();
  const r2 = r * r;
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) mask[y * W + x] = 0;
    }
  }
}

/* ================= Estado del juego ================= */
let state = 'menu';          // menu | aim | flying | settle | over
let mode = 'cpu';            // cpu | 2p
let dragons = [];
let shells = [];
let particles = [];
let texts = [];
let clouds = [];
let cur = 0;
let wind = 0;
let power = 0, charging = false;
let shake = 0;
let time = 0;
let settleT = 0;
let ai = null;
let turnNo = 0;

const held = { left: false, right: false, angUp: false, angDown: false };
const holdFrames = { left: 0, right: 0, angUp: 0, angDown: 0 };

function makeDragon(id, x, facing, cpu, name) {
  return {
    id, name, cpu, x, y: groundYFrom(x, 0), vy: 0, hp: 100, facing, angle: 45,
    fuel: FUEL_MAX, shot: 'normal', ammo: { normal: Infinity, big: 2, triple: 3 },
    colors: PALETTES[id], grounded: true, lastPower: 0, hurt: 0, hidden: false, shots: 0,
  };
}

function newGame(m) {
  mode = m;
  const x0 = rand(100, 220), x1 = W - rand(100, 220);
  drawBackground();
  genTerrain([x0, x1]);
  dragons = [
    makeDragon(0, x0, 1, false, mode === 'cpu' ? 'Tú' : 'Jugador 1'),
    makeDragon(1, x1, -1, mode === 'cpu', mode === 'cpu' ? 'CPU' : 'Jugador 2'),
  ];
  shells = []; particles = []; texts = [];
  cur = Math.random() < 0.5 ? 0 : 1;
  turnNo = 0;
  clouds = [];
  for (let i = 0; i < 6; i++) clouds.push({ x: rand(0, W), y: rand(30, 220), s: rand(0.6, 1.5), v: rand(0.05, 0.2) });
}

function startTurn() {
  const d = dragons[cur];
  turnNo++;
  wind = randInt(-5, 5);
  d.fuel = FUEL_MAX;
  charging = false; power = 0;
  state = 'aim';
  ai = d.cpu ? { stage: 'think', t: 0, moveDir: 0, moveFrames: 0 } : null;
  if (d.ammo[d.shot] <= 0) d.shot = 'normal';
  tone(520, 0.12, 'triangle', 0.06);
}

/* ================= Dragones: física y movimiento ================= */
function physics(d) {
  if (d.hidden) return;
  if (d.hurt > 0) d.hurt--;
  const gy = groundYFrom(d.x, d.y - 14);
  if (d.y < gy - 0.5) {
    d.vy += 0.35; d.y += d.vy; d.grounded = false;
    if (d.y >= gy) { d.y = gy; d.vy = 0; d.grounded = true; }
  } else {
    d.y = gy; d.vy = 0; d.grounded = true;
  }
  if (d.y > H + 40 && d.hp > 0) { d.hp = 0; floatText(d.x, H - 20, 'Al vacío', '#fff'); }
}

function tryMove(d, dir) {
  if (d.fuel <= 0 || !d.grounded) return;
  d.facing = dir;
  const nx = clamp(d.x + dir * MOVE_SPEED, 24, W - 24);
  if (nx === d.x) return;
  const ngy = groundYFrom(nx, d.y - 14);
  if (ngy < d.y - 2.2) return;            // pendiente demasiado empinada
  d.x = nx; d.fuel -= MOVE_SPEED;
}

/* ================= Disparo ================= */
function muzzle(d, ang, f) {
  const a = rad(ang);
  return { x: d.x + f * 22 + Math.cos(a) * f * 18, y: d.y - 40 - Math.sin(a) * 18 };
}

function fire(d, pw) {
  const spec = SHOTS[d.shot], type = d.shot;
  if (spec.ammo !== Infinity) { d.ammo[type]--; if (d.ammo[type] <= 0) d.shot = 'normal'; }
  const angs = spec.n === 3 ? [-6, 0, 6] : [0];
  for (const da of angs) {
    const ang = d.angle + da;
    const m = muzzle(d, d.angle, d.facing);
    const v = pw / 100 * VMAX;
    shells.push({
      x: m.x, y: m.y, vx: Math.cos(rad(ang)) * v * d.facing, vy: -Math.sin(rad(ang)) * v,
      spec, owner: d, age: 0, alive: true, trail: [],
    });
  }
  d.lastPower = pw; d.shots++;
  charging = false; power = 0;
  state = 'flying';
  tone(300, 0.25, 'sawtooth', 0.07, 90);
  for (let i = 0; i < 10; i++) {
    const a = rad(d.angle) + rand(-0.4, 0.4);
    particles.push({ x: m0(d).x, y: m0(d).y, vx: Math.cos(a) * d.facing * rand(1, 4), vy: -Math.sin(a) * rand(1, 4), life: 18, max: 18, size: rand(3, 6), c: '#ffb454', g: 0, kind: 'fire' });
  }
}
function m0(d) { return muzzle(d, d.angle, d.facing); }

function updateShells() {
  for (const s of shells) {
    if (!s.alive) continue;
    s.age++;
    s.vx += wind * WIND_K; s.vy += G;
    const sp = Math.hypot(s.vx, s.vy), n = Math.max(1, Math.ceil(sp / 3));
    for (let k = 0; k < n && s.alive; k++) {
      s.x += s.vx / n; s.y += s.vy / n;
      if (s.x < -60 || s.x > W + 60 || s.y > H + 80) { s.alive = false; break; }
      if (isSolid(s.x, s.y)) { detonate(s); break; }
      for (const d of dragons) {
        if (d.hp <= 0 || d.hidden) continue;
        if (d === s.owner && s.age < 20) continue;
        if (Math.hypot(s.x - d.x, s.y - (d.y - 16)) < 21) { detonate(s); break; }
      }
    }
    if (s.alive) {
      if (s.age % 2 === 0) { s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 14) s.trail.shift(); }
    }
  }
  if (shells.every(s => !s.alive)) {
    shells = []; state = 'settle'; settleT = 0;
  }
}

function detonate(s) {
  s.alive = false;
  explode(s.x, s.y, s.spec.r, s.spec.dmg, s.spec.color);
}

function explode(x, y, r, dmg, color) {
  carve(x, y, r);
  boom(r / 58);
  shake = Math.max(shake, r / 4);
  for (let i = 0; i < r * 0.9; i++) {
    const a = rand(0, 6.28), s = rand(0.5, r * 0.12);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5, life: rand(20, 42), max: 42, size: rand(3, Math.max(4, r * 0.22)), c: ['#fff3b0', '#ffb454', '#ff6a2b', '#c0381a'][randInt(0, 3)], g: 0, kind: 'fire' });
  }
  for (let i = 0; i < 10; i++) {
    const a = rand(0, 6.28), s = rand(0.3, 2);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.8, life: rand(30, 60), max: 60, size: rand(6, 14), c: '#555', g: -0.01, kind: 'smoke' });
  }
  for (let i = 0; i < 14; i++) {
    const a = rand(-3.1, 0), s = rand(2, 6);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(30, 55), max: 55, size: rand(2, 4), c: '#7a4a22', g: 0.16, kind: 'debris' });
  }
  for (const d of dragons) {
    if (d.hp <= 0 || d.hidden) continue;
    const dist = Math.hypot(d.x - x, (d.y - 16) - y), reach = r + 20;
    if (dist < reach) {
      const amt = Math.max(3, Math.round(dmg * (1 - dist / reach)));
      d.hp = Math.max(0, d.hp - amt);
      d.hurt = 24;
      if (d.grounded) { d.y -= 2; d.vy = -2; d.grounded = false; }
      floatText(d.x, d.y - 70, '-' + amt, '#ff6a6a');
      tone(180, 0.18, 'square', 0.07, 60);
    }
  }
}

function floatText(x, y, t, c) { texts.push({ x, y, t, c, life: 60 }); }

function allGrounded() {
  return dragons.every(d => d.hp <= 0 || d.hidden || d.y > H + 20 || d.grounded);
}

function endTurn() {
  const dead = dragons.filter(d => d.hp <= 0);
  if (dead.length) { gameOver(dead); return; }
  cur = 1 - cur;
  startTurn();
}

function gameOver(dead) {
  state = 'over';
  for (const d of dead) {
    d.hidden = true;
    explode(d.x, Math.min(d.y, H - 10) - 16, 50, 0, '#fff');
  }
  let msg;
  if (dead.length === 2) msg = '¡Empate!';
  else {
    const winner = dragons.find(d => d.hp > 0);
    msg = winner.cpu ? 'Gana la CPU 🐲' : (mode === 'cpu' ? '¡Victoria! 🏆' : `¡Gana ${winner.name}! 🏆`);
  }
  $('overTxt').textContent = msg;
  tone(660, 0.3, 'triangle', 0.08); setTimeout(() => tone(880, 0.4, 'triangle', 0.08), 200);
  setTimeout(() => { if (state === 'over') $('over').classList.remove('hidden'); }, 1300);
}

/* ================= IA de la CPU ================= */
function simulate(sx, sy, ang, pw, f, tx, ty) {
  let x = sx, y = sy;
  const v = pw / 100 * VMAX;
  let vx = Math.cos(rad(ang)) * v * f, vy = -Math.sin(rad(ang)) * v;
  for (let i = 0; i < 700; i++) {
    vx += wind * WIND_K; vy += G;
    const n = Math.max(1, Math.ceil(Math.hypot(vx, vy) / 3));
    for (let k = 0; k < n; k++) {
      x += vx / n; y += vy / n;
      if (x < -60 || x > W + 60 || y > H + 80) return { x, y, out: true };
      if (isSolid(x, y)) return { x, y };
      if (i > 12 && Math.hypot(x - tx, y - ty) < 21) return { x, y };
    }
  }
  return { x, y, out: true };
}

function solveShot(d, target) {
  const f = target.x >= d.x ? 1 : -1;
  const tx = target.x, ty = target.y - 16;
  let best = { score: Infinity, angle: 45, power: 60 };
  for (let a = 8; a <= 86; a += 2) {
    const m = muzzle(d, a, f);
    for (let p = 22; p <= 100; p += 2.5) {
      const r = simulate(m.x, m.y, a, p, f, tx, ty);
      if (r.out) continue;
      let score = Math.hypot(r.x - tx, r.y - ty);
      const self = Math.hypot(r.x - d.x, r.y - (d.y - 16));
      if (self < 55) score += 200;
      if (score < best.score) best = { score, angle: a, power: p };
    }
  }
  // error humano: disminuye con los turnos de la CPU
  const errA = Math.max(0.6, 3.6 - d.shots * 0.5);
  const errP = Math.max(1.2, 7 - d.shots * 0.9);
  best.angle = clamp(best.angle + rand(-errA, errA), 4, 88);
  best.power = clamp(best.power + rand(-errP, errP), 18, 100);
  return best;
}

function cpuControl(d) {
  const a = ai; if (!a) return;
  a.t++;
  const target = dragons[1 - cur];
  if (a.stage === 'think') {
    if (a.t > 55) {
      const r = Math.random();
      a.moveDir = r < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      a.moveFrames = a.moveDir ? randInt(20, 70) : 0;
      a.stage = 'move';
    }
  } else if (a.stage === 'move') {
    if (a.moveFrames > 0) { tryMove(d, a.moveDir); a.moveFrames--; }
    else a.stage = 'solve';
  } else if (a.stage === 'solve') {
    d.facing = target.x >= d.x ? 1 : -1;
    const roll = Math.random();
    if (d.ammo.big > 0 && roll < 0.3) d.shot = 'big';
    else if (d.ammo.triple > 0 && roll < 0.55) d.shot = 'triple';
    else d.shot = 'normal';
    const sol = solveShot(d, target);
    a.tAngle = sol.angle; a.tPower = sol.power;
    a.stage = 'aim'; a.t = 0;
  } else if (a.stage === 'aim') {
    const diff = a.tAngle - d.angle;
    if (Math.abs(diff) > 0.7) d.angle += Math.sign(diff) * 0.7;
    else { d.angle = a.tAngle; a.stage = 'charge'; charging = true; power = 0; }
  } else if (a.stage === 'charge') {
    power += 1.1;
    if (power >= a.tPower) { power = a.tPower; charging = false; a.stage = 'done'; fire(d, power); }
  }
}

/* ================= Control humano ================= */
function canControl() { return state === 'aim' && dragons[cur] && !dragons[cur].cpu; }

function humanControl(d) {
  for (const k of Object.keys(held)) holdFrames[k] = held[k] ? holdFrames[k] + 1 : 0;
  if (held.left) tryMove(d, -1);
  if (held.right) tryMove(d, 1);
  if (held.angUp && holdFrames.angUp > 12) d.angle = clamp(d.angle + 0.45, 0, 90);
  if (held.angDown && holdFrames.angDown > 12) d.angle = clamp(d.angle - 0.45, 0, 90);
  if (charging) power = Math.min(100, power + 1.1);
}

function stepAngle(delta) {
  if (!canControl()) return;
  const d = dragons[cur];
  d.angle = clamp(Math.round(d.angle) + delta, 0, 90);
}

function cycleShot() {
  if (!canControl()) return;
  const d = dragons[cur];
  let i = ORDER.indexOf(d.shot);
  for (let k = 0; k < ORDER.length; k++) {
    i = (i + 1) % ORDER.length;
    if (d.ammo[ORDER[i]] > 0) { d.shot = ORDER[i]; break; }
  }
  tone(700, 0.06, 'square', 0.05);
}

function startCharge() { if (canControl() && !charging) { charging = true; power = 0; initAudio(); } }
function releaseFire() {
  if (!charging) return;
  if (!canControl()) { charging = false; return; }
  const d = dragons[cur];
  fire(d, Math.max(8, power));
}

/* ================= Actualización ================= */
function update() {
  time++;
  for (const c of clouds) { c.x += c.v; if (c.x > W + 120) c.x = -120; }
  if (shake > 0) shake = Math.max(0, shake - 0.6);

  if (state !== 'menu') for (const d of dragons) physics(d);

  if (state === 'aim') {
    const d = dragons[cur];
    if (d.cpu) cpuControl(d); else humanControl(d);
  } else if (state === 'flying') {
    updateShells();
  } else if (state === 'settle') {
    settleT++;
    if (settleT > 50 && allGrounded()) endTurn();
  }

  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.97; p.life--;
    if (p.kind === 'smoke') p.size += 0.15;
  }
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 0.6; t.life--; }
  texts = texts.filter(t => t.life > 0);
}

/* ================= Dibujo ================= */
function drawDragon(d, active) {
  if (d.hidden) return;
  const c = d.colors;
  ctx.save();
  ctx.translate(d.x, d.y);
  if (d.hurt > 0) ctx.translate(rand(-2, 2), 0);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(0, 1, 22, 4, 0, 0, 7); ctx.fill();
  ctx.scale(d.facing, 1);
  const bob = d.grounded ? Math.sin(time * 0.08 + d.id * 2) * 0.8 : 0;
  ctx.translate(0, bob);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // cola
  ctx.strokeStyle = c.body; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(-12, -14); ctx.quadraticCurveTo(-36, -4, -42, -26); ctx.stroke();
  ctx.fillStyle = c.spike;
  ctx.beginPath(); ctx.moveTo(-42, -26); ctx.lineTo(-52, -32); ctx.lineTo(-44, -16); ctx.closePath(); ctx.fill();

  // ala
  ctx.fillStyle = c.wing;
  const flap = Math.sin(time * 0.1 + d.id) * 2;
  ctx.beginPath(); ctx.moveTo(-4, -26); ctx.lineTo(-26, -56 + flap); ctx.lineTo(-15, -40); ctx.lineTo(-10, -62 + flap); ctx.lineTo(0, -40); ctx.lineTo(9, -54 + flap); ctx.lineTo(9, -26); ctx.closePath(); ctx.fill();

  // patas
  ctx.fillStyle = c.body;
  ctx.beginPath(); ctx.ellipse(-8, -4, 7, 8, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10, -4, 7, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c.spike;
  ctx.fillRect(-12, -1, 3, 2); ctx.fillRect(14, -1, 3, 2);

  // cuerpo y vientre
  ctx.fillStyle = c.body;
  ctx.beginPath(); ctx.ellipse(0, -20, 21, 15, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c.belly;
  ctx.beginPath(); ctx.ellipse(3, -17, 15, 9, 0, 0.15, Math.PI - 0.15); ctx.fill();

  // púas del lomo
  ctx.fillStyle = c.spike;
  for (let i = 0; i < 5; i++) {
    const x = -14 + i * 7, y = -20 - 15 * Math.sqrt(Math.max(0, 1 - (x / 21) * (x / 21)));
    ctx.beginPath(); ctx.moveTo(x - 3, y + 1); ctx.lineTo(x, y - 7); ctx.lineTo(x + 3, y + 1); ctx.closePath(); ctx.fill();
  }

  // cuello
  ctx.strokeStyle = c.body; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(12, -26); ctx.lineTo(20, -38); ctx.stroke();

  // cabeza (apunta según el ángulo)
  ctx.save();
  ctx.translate(22, -40); ctx.rotate(-rad(d.angle) * 0.5);
  ctx.fillStyle = c.body;
  ctx.beginPath(); ctx.ellipse(4, 0, 12, 9, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(14, 2, 8, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c.belly;
  ctx.beginPath(); ctx.ellipse(14, 5, 7, 2.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -3, 3.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(6.2, -3, 1.9, 0, 7); ctx.fill();
  ctx.fillStyle = c.spike;
  ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(-11, -17); ctx.lineTo(3, -8); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(3, -8); ctx.lineTo(-3, -18); ctx.lineTo(8, -8); ctx.closePath(); ctx.fill();
  if (active && charging) {
    ctx.fillStyle = `rgba(255,${160 + Math.round(power)},60,${0.4 + power / 200})`;
    ctx.beginPath(); ctx.arc(22, 2, 3 + power / 14, 0, 7); ctx.fill();
  }
  ctx.restore();
  ctx.restore();

  // barra de vida sobre el dragón
  const bx = d.x - 26, by = d.y - 82;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 1, by - 1, 54, 8);
  ctx.fillStyle = d.hp > 50 ? '#4ade80' : d.hp > 25 ? '#facc15' : '#ef4444';
  ctx.fillRect(bx, by, 52 * d.hp / 100, 6);
  if (active && state === 'aim') {
    const yb = Math.sin(time * 0.12) * 3;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(d.x - 6, by - 14 + yb); ctx.lineTo(d.x + 6, by - 14 + yb); ctx.lineTo(d.x, by - 6 + yb); ctx.closePath(); ctx.fill();
  }
}

function drawAim(d) {
  const m = muzzle(d, d.angle, d.facing);
  const a = rad(d.angle);
  const len = 36 + (charging ? power * 0.5 : 14);
  const ex = m.x + Math.cos(a) * d.facing * len, ey = m.y - Math.sin(a) * len;
  ctx.save();
  ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, 7); ctx.fill();
  ctx.restore();
}

function drawShells() {
  for (const s of shells) {
    if (!s.alive) continue;
    for (let i = 0; i < s.trail.length; i++) {
      const t = s.trail[i], k = i / s.trail.length;
      ctx.fillStyle = s.spec.color; ctx.globalAlpha = k * 0.6;
      ctx.beginPath(); ctx.arc(t.x, t.y, 2 + k * 3, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, 12);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, s.spec.color); g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, 7); ctx.fill();
    if (s.y < 0) {   // indicador de proyectil fuera de pantalla
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(s.x, 4); ctx.lineTo(s.x - 6, 16); ctx.lineTo(s.x + 6, 16); ctx.closePath(); ctx.fill();
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const k = p.life / p.max;
    ctx.globalAlpha = p.kind === 'smoke' ? k * 0.45 : Math.min(1, k * 1.4);
    ctx.fillStyle = p.c;
    const sz = p.kind === 'fire' ? p.size * (0.4 + k * 0.6) : p.size;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, sz), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, t.life / 30);
    ctx.fillStyle = '#000'; ctx.fillText(t.t, t.x + 1, t.y + 1);
    ctx.fillStyle = t.c; ctx.fillText(t.t, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawClouds() {
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  for (const c of clouds) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 60 * c.s, 16 * c.s, 0, 0, 7);
    ctx.ellipse(c.x - 30 * c.s, c.y + 6 * c.s, 40 * c.s, 12 * c.s, 0, 0, 7);
    ctx.ellipse(c.x + 34 * c.s, c.y + 5 * c.s, 44 * c.s, 13 * c.s, 0, 0, 7);
    ctx.fill();
  }
}

function drawTopHud() {
  if (!dragons.length) return;
  dragons.forEach((d, i) => {
    const w = 230, x = i === 0 ? 16 : W - 16 - w, y = 14;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 3, y - 3, w + 6, 36);
    ctx.fillStyle = '#2a1c52'; ctx.fillRect(x, y + 14, w, 14);
    ctx.fillStyle = d.hp > 50 ? '#4ade80' : d.hp > 25 ? '#facc15' : '#ef4444';
    const fw = w * d.hp / 100;
    ctx.fillRect(i === 0 ? x : x + w - fw, y + 14, fw, 14);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillStyle = d.colors.name;
    ctx.fillText(d.name + (state !== 'menu' && cur === i && state === 'aim' ? '  ◀' : ''), i === 0 ? x : x + w, y + 10);
    ctx.fillStyle = '#fff'; ctx.textAlign = i === 0 ? 'right' : 'left';
    ctx.fillText(Math.max(0, d.hp) + '', i === 0 ? x + w : x, y + 10);
  });
  // viento
  const cx = W / 2, cy = 58;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(cx - 90, cy - 14, 180, 28);
  ctx.fillStyle = '#cfd8ff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  if (wind === 0) { ctx.fillText('VIENTO: calma', cx, cy + 4); }
  else {
    const dir = Math.sign(wind), len = Math.abs(wind) * 13;
    ctx.strokeStyle = '#9ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - dir * len / 2, cy); ctx.lineTo(cx + dir * len / 2, cy); ctx.stroke();
    ctx.fillStyle = '#9ff';
    const hx = cx + dir * len / 2;
    ctx.beginPath(); ctx.moveTo(hx + dir * 7, cy); ctx.lineTo(hx - dir * 1, cy - 6); ctx.lineTo(hx - dir * 1, cy + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cfd8ff'; ctx.textAlign = dir > 0 ? 'right' : 'left';
    ctx.fillText(Math.abs(wind) + '', dir > 0 ? cx - 70 : cx + 70, cy + 4);
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120a24'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  ctx.drawImage(bgCanvas, 0, 0);
  drawClouds();
  ctx.drawImage(terrainCanvas, 0, 0);
  dragons.forEach((d, i) => drawDragon(d, state === 'aim' && i === cur));
  if (state === 'aim' && dragons[cur] && !dragons[cur].hidden) drawAim(dragons[cur]);
  drawShells();
  drawParticles();
  ctx.restore();
  if (state !== 'menu') drawTopHud();
  ctx.restore();
  updateDom();
}

/* ================= DOM / HUD ================= */
const els = {
  angV: $('angV'), shotBtn: $('shotBtn'), fire: $('fire'), pf: $('powerfill'),
  stats: $('stats'), turn: $('turn'), hud: $('hud'), menu: $('menu'), over: $('over'),
};
const cache = {};
function setText(el, key, v) { if (cache[key] !== v) { cache[key] = v; el.textContent = v; } }

const tick = document.createElement('div');
tick.style.cssText = 'position:absolute;top:-2px;width:3px;height:14px;background:#fff;border-radius:2px;display:none';
$('power').style.position = 'relative';
$('power').appendChild(tick);

function updateDom() {
  const d = dragons[cur];
  if (!d || state === 'menu') return;
  setText(els.angV, 'ang', Math.round(d.angle) + '°');
  const sp = SHOTS[d.shot], am = d.ammo[d.shot];
  setText(els.shotBtn, 'shot', sp.name + (am === Infinity ? '' : ' ×' + am));
  els.pf.style.width = clamp(power, 0, 100) + '%';
  if (d.lastPower > 0 && !d.cpu) { tick.style.display = 'block'; tick.style.left = clamp(d.lastPower, 0, 100) + '%'; }
  else tick.style.display = 'none';
  els.fire.classList.toggle('charging', charging);
  const can = canControl();
  els.hud.style.opacity = can ? '1' : '0.5';
  let t;
  if (state === 'aim') t = d.cpu ? 'Turno de la CPU…' : 'Turno: ' + d.name;
  else if (state === 'flying') t = '¡Fuego!';
  else if (state === 'over') t = 'Fin de la partida';
  else t = '…';
  setText(els.turn, 'turn', t);
  setText(els.stats, 'stats', can ? 'Mover ' + Math.round(100 * d.fuel / FUEL_MAX) + '%' : '');
}

function bindHold(id, key, tapAction) {
  const el = $(id);
  const on = e => { e.preventDefault(); initAudio(); held[key] = true; holdFrames[key] = 0; if (tapAction) tapAction(); };
  const off = e => { e.preventDefault(); held[key] = false; };
  el.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, off));
}
bindHold('left', 'left');
bindHold('right', 'right');
bindHold('angUp', 'angUp', () => stepAngle(1));
bindHold('angDown', 'angDown', () => stepAngle(-1));

$('shotBtn').addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); cycleShot(); });
$('fire').addEventListener('pointerdown', e => { e.preventDefault(); startCharge(); });
window.addEventListener('pointerup', () => { if (charging) releaseFire(); for (const k in held) held[k] = false; });
window.addEventListener('blur', () => { charging = false; power = 0; for (const k in held) held[k] = false; });
document.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (e.repeat && e.code === 'Space') return;
  initAudio();
  switch (e.code) {
    case 'ArrowLeft': held.left = true; break;
    case 'ArrowRight': held.right = true; break;
    case 'ArrowUp': if (!held.angUp) stepAngle(1); held.angUp = true; break;
    case 'ArrowDown': if (!held.angDown) stepAngle(-1); held.angDown = true; break;
    case 'Space': startCharge(); break;
    case 'KeyS': case 'Tab': cycleShot(); break;
    default: return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'ArrowLeft': held.left = false; break;
    case 'ArrowRight': held.right = false; break;
    case 'ArrowUp': held.angUp = false; break;
    case 'ArrowDown': held.angDown = false; break;
    case 'Space': releaseFire(); break;
  }
});

// botones superpuestos: sonido y menú
function overlayBtn(txt, right, onClick) {
  const b = document.createElement('button');
  b.textContent = txt;
  b.style.cssText = `position:absolute;top:70px;right:${right}px;min-width:40px;min-height:40px;padding:4px 10px;font-size:16px;z-index:4;opacity:.8`;
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); initAudio(); onClick(b); });
  $('stage').appendChild(b);
  return b;
}
overlayBtn('🔊', 8, b => { muted = !muted; b.textContent = muted ? '🔇' : '🔊'; });
overlayBtn('☰', 56, () => showMenu());

function showMenu() {
  state = 'menu'; charging = false; power = 0;
  els.over.classList.add('hidden');
  els.menu.classList.remove('hidden');
  newGame(mode);
}
function begin(m) {
  initAudio();
  els.menu.classList.add('hidden');
  els.over.classList.add('hidden');
  newGame(m);
  startTurn();
}
$('vsCpu').addEventListener('click', () => begin('cpu'));
$('vs2').addEventListener('click', () => begin('2p'));
$('again').addEventListener('click', () => begin(mode));
$('toMenu').addEventListener('click', showMenu);

/* ================= Bucle principal ================= */
newGame('cpu');
let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function frame(t) {
  acc += Math.min(100, t - last); last = t;
  while (acc >= STEP) { update(); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ganchos para pruebas automáticas
window.__dragonshot = {
  get state() { return state; }, get dragons() { return dragons; }, get wind() { return wind; },
  get shells() { return shells; }, get cur() { return cur; },
  begin, update, fire, solveShot, simulate, muzzle, isSolid, carve, startTurn, groundYFrom,
  setWind(v) { wind = v; },
};
})();
