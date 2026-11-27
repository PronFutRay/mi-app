var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// dist/worker.js
import HTML from "./05f79df73c5b641f1500ddb2cc1a108f2232fa6a-index.html";
var GalaxiaEngine = (function() {
  "use strict";
  var CFG = {
    W: 4e3,
    H: 4e3,
    FOOD_TARGET: 850,
    MIN_PLAYERS: 14,
    // los bots rellenan hasta este número
    MIN_BOTS: 4,
    MAX_HUMANS: 40,
    START_MASS: 20,
    EAT_RATIO: 1.25,
    COLORS: 12,
    STYLES: 4
  };
  var BOT_NAMES = [
    "Nova",
    "Cometa",
    "Pulsar",
    "Quasar",
    "Orion",
    "Vega",
    "Lyra",
    "Sirio",
    "Andr\xF3meda",
    "Eclipse",
    "Nebula",
    "Astro",
    "Luna",
    "Marte",
    "Tit\xE1n",
    "Fobos",
    "Ceres",
    "Plut\xF3n",
    "Halley",
    "Rigel",
    "Altair",
    "Kepler",
    "Zenit",
    "Aurora",
    "Polaris",
    "Atlas",
    "Draco",
    "Electra",
    "\xCDo",
    "Europa"
  ];
  function radius(m) {
    return Math.sqrt(m) * 4.2;
  }
  __name(radius, "radius");
  function speed(m) {
    return 330 * Math.pow(m, -0.2);
  }
  __name(speed, "speed");
  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  __name(rnd, "rnd");
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  __name(clamp, "clamp");
  function r1(v) {
    return Math.round(v * 10) / 10;
  }
  __name(r1, "r1");
  function cleanName(n) {
    n = String(n == null ? "" : n).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16);
    return n || "Planeta";
  }
  __name(cleanName, "cleanName");
  function World() {
    this.players = /* @__PURE__ */ new Map();
    this.food = /* @__PURE__ */ new Map();
    this.nextId = 1;
    this.nextFood = 1;
    this.fa = [];
    this.fd = [];
    this.deaths = [];
    this.time = 0;
    for (var i = 0; i < CFG.FOOD_TARGET; i++) this.spawnFood();
  }
  __name(World, "World");
  World.prototype.spawnFood = function(x, y, v, c) {
    var f = {
      id: this.nextFood++,
      x: x == null ? rnd(20, CFG.W - 20) : clamp(x, 5, CFG.W - 5),
      y: y == null ? rnd(20, CFG.H - 20) : clamp(y, 5, CFG.H - 5),
      v: v || (Math.random() < 0.08 ? 3 : 1),
      c: c == null ? Math.random() * CFG.COLORS | 0 : c
    };
    this.food.set(f.id, f);
    this.fa.push([f.id, r1(f.x), r1(f.y), f.c, f.v]);
    return f;
  };
  World.prototype.removeFood = function(f) {
    this.food.delete(f.id);
    this.fd.push(f.id);
  };
  World.prototype.safeSpot = function() {
    var best = null, bestD = -1;
    for (var k = 0; k < 12; k++) {
      var x = rnd(150, CFG.W - 150), y = rnd(150, CFG.H - 150), dmin = 1e9;
      this.players.forEach(function(p) {
        var d = Math.hypot(p.x - x, p.y - y) - p.r;
        if (d < dmin) dmin = d;
      });
      if (dmin > bestD) {
        bestD = dmin;
        best = [x, y];
      }
      if (dmin > 600) break;
    }
    return best;
  };
  World.prototype.addPlayer = function(name, bot, look) {
    look = look || {};
    var s = this.safeSpot();
    var p = {
      id: this.nextId++,
      name: cleanName(name),
      bot: !!bot,
      x: s[0],
      y: s[1],
      m: bot ? rnd(15, 120) : CFG.START_MASS,
      r: 0,
      a: rnd(0, Math.PI * 2),
      th: 0,
      boost: false,
      c: look.c >= 0 && look.c < CFG.COLORS ? look.c | 0 : Math.random() * CFG.COLORS | 0,
      s: look.s >= 0 && look.s < CFG.STYLES ? look.s | 0 : Math.random() * CFG.STYLES | 0,
      kills: 0,
      best: 0,
      born: this.time,
      shield: bot ? 0 : 3,
      ejectT: 0,
      ai: { t: 0, a: rnd(0, 6.28), th: 0.7, boost: false }
    };
    p.r = radius(p.m);
    p.best = p.m;
    this.players.set(p.id, p);
    return p;
  };
  World.prototype.removePlayer = function(id) {
    this.players.delete(id);
  };
  World.prototype.setInput = function(id, a, th, b) {
    var p = this.players.get(id);
    if (!p || p.bot) return;
    a = +a;
    th = +th;
    if (isFinite(a)) p.a = a;
    if (isFinite(th)) p.th = clamp(th, 0, 1);
    p.boost = !!b;
  };
  World.prototype.botThink = function(p, dt) {
    var ai = p.ai;
    ai.t -= dt;
    if (ai.t > 0) {
      p.a = ai.a;
      p.th = ai.th;
      p.boost = ai.boost;
      return;
    }
    ai.t = rnd(0.25, 0.45);
    var threat = null, threatD = 1e9, prey = null, preyD = 1e9;
    var self = this;
    this.players.forEach(function(o) {
      if (o === p) return;
      var d = Math.hypot(o.x - p.x, o.y - p.y) - o.r - p.r;
      if (o.m > p.m * CFG.EAT_RATIO && d < 320 && d < threatD) {
        threat = o;
        threatD = d;
      }
      if (p.m > o.m * CFG.EAT_RATIO && o.shield <= 0 && d < 380 && d < preyD) {
        prey = o;
        preyD = d;
      }
    });
    ai.boost = false;
    if (threat) {
      ai.a = Math.atan2(p.y - threat.y, p.x - threat.x) + rnd(-0.4, 0.4);
      ai.th = 1;
      ai.boost = threatD < 120 && p.m > 40 && Math.random() < 0.5;
    } else if (prey && Math.random() < 0.85) {
      ai.a = Math.atan2(prey.y - p.y, prey.x - p.x);
      ai.th = 1;
      ai.boost = preyD < 160 && p.m > 60 && Math.random() < 0.3;
    } else {
      var bf = null, bd = 1e9;
      self.food.forEach(function(f) {
        var dx = f.x - p.x, dy = f.y - p.y;
        if (Math.abs(dx) > 500 || Math.abs(dy) > 500) return;
        var d = dx * dx + dy * dy - f.v * 4e3;
        if (d < bd) {
          bd = d;
          bf = f;
        }
      });
      ai.a = bf ? Math.atan2(bf.y - p.y, bf.x - p.x) : ai.a + rnd(-0.6, 0.6);
      ai.th = rnd(0.7, 1);
    }
    var m = 120;
    if (p.x < m) ai.a = rnd(-0.8, 0.8);
    else if (p.x > CFG.W - m) ai.a = Math.PI + rnd(-0.8, 0.8);
    if (p.y < m) ai.a = Math.PI / 2 + rnd(-0.8, 0.8);
    else if (p.y > CFG.H - m) ai.a = -Math.PI / 2 + rnd(-0.8, 0.8);
    p.a = ai.a;
    p.th = ai.th;
    p.boost = ai.boost;
  };
  World.prototype.step = function(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    var self = this, list = [];
    this.players.forEach(function(p2) {
      list.push(p2);
    });
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.bot) this.botThink(p, dt);
      if (p.shield > 0) p.shield -= dt;
      var sp = speed(p.m) * p.th;
      var boosting = p.boost && p.m > 25 && p.th > 0.1;
      if (boosting) {
        sp *= 1.85;
        var lose = p.m * 0.05 * dt + 2 * dt;
        p.m -= lose;
        p.ejectT += lose;
        if (p.ejectT >= 2) {
          p.ejectT -= 2;
          var bx = p.x - Math.cos(p.a) * (p.r + 8), by = p.y - Math.sin(p.a) * (p.r + 8);
          this.spawnFood(bx + rnd(-6, 6), by + rnd(-6, 6), 2, p.c);
        }
      }
      if (p.m > 150) p.m -= p.m * 18e-4 * dt;
      p.x = clamp(p.x + Math.cos(p.a) * sp * dt, 0, CFG.W);
      p.y = clamp(p.y + Math.sin(p.a) * sp * dt, 0, CFG.H);
      p.r = radius(p.m);
    }
    for (i = 0; i < list.length; i++) {
      p = list[i];
      var r2 = p.r * p.r;
      this.food.forEach(function(f) {
        var dx = f.x - p.x, dy = f.y - p.y;
        if (dx * dx + dy * dy < r2) {
          p.m += f.v;
          self.removeFood(f);
        }
      });
      p.r = radius(p.m);
    }
    list.sort(function(a, b) {
      return b.m - a.m;
    });
    for (i = 0; i < list.length; i++) {
      var A = list[i];
      if (!this.players.has(A.id)) continue;
      for (var j = i + 1; j < list.length; j++) {
        var B = list[j];
        if (!this.players.has(B.id) || B.shield > 0) continue;
        if (A.m < B.m * CFG.EAT_RATIO) continue;
        var d = Math.hypot(A.x - B.x, A.y - B.y);
        if (d < A.r - B.r * 0.35) {
          A.m += B.m * 0.8;
          A.r = radius(A.m);
          A.kills++;
          this.players.delete(B.id);
          this.deaths.push({ id: B.id, by: A.name, byId: A.id, p: B });
        }
      }
    }
    this.players.forEach(function(p2) {
      if (p2.m > p2.best) p2.best = p2.m;
    });
    while (this.food.size < CFG.FOOD_TARGET) this.spawnFood();
  };
  World.prototype.snapshot = function() {
    var out = [];
    this.players.forEach(function(p) {
      out.push([p.id, r1(p.x), r1(p.y), r1(p.m), p.c, p.name, p.shield > 0 ? 1 : 0, p.boost ? 1 : 0, p.s]);
    });
    return out;
  };
  World.prototype.foodList = function() {
    var out = [];
    this.food.forEach(function(f) {
      out.push([f.id, r1(f.x), r1(f.y), f.c, f.v]);
    });
    return out;
  };
  World.prototype.leaderboard = function() {
    var arr = [];
    this.players.forEach(function(p) {
      arr.push(p);
    });
    arr.sort(function(a, b) {
      return b.m - a.m;
    });
    return arr.slice(0, 10).map(function(p) {
      return [p.id, p.name, Math.round(p.m)];
    });
  };
  function Room() {
    this.world = new World();
    this.clients = /* @__PURE__ */ new Set();
    this.lbT = 0;
    this.fillBots();
  }
  __name(Room, "Room");
  Room.prototype.humans = function() {
    var n = 0;
    this.world.players.forEach(function(p) {
      if (!p.bot) n++;
    });
    return n;
  };
  Room.prototype.fillBots = function() {
    var w = this.world, bots = 0;
    w.players.forEach(function(p) {
      if (p.bot) bots++;
    });
    var want = Math.max(CFG.MIN_BOTS, CFG.MIN_PLAYERS - this.humans());
    var used = {};
    w.players.forEach(function(p) {
      used[p.name] = 1;
    });
    while (bots < want) {
      var name, tries = 0;
      do {
        name = BOT_NAMES[Math.random() * BOT_NAMES.length | 0];
      } while (used[name] && ++tries < 20);
      used[name] = 1;
      w.addPlayer(name, true);
      bots++;
    }
    if (bots > want) {
      var extra = bots - want;
      w.players.forEach(function(p) {
        if (extra > 0 && p.bot && p.m < 60) {
          w.removePlayer(p.id);
          extra--;
        }
      });
    }
  };
  Room.prototype.connect = function(send) {
    var c = { send, pid: null, joins: 0, lastIn: 0 };
    this.clients.add(c);
    send(JSON.stringify({ t: "welcome", w: CFG.W, h: CFG.H, food: this.world.foodList() }));
    return c;
  };
  Room.prototype.disconnect = function(c) {
    if (c.pid) this.world.removePlayer(c.pid);
    this.clients.delete(c);
  };
  Room.prototype.message = function(c, raw) {
    var msg;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "join") {
      if (c.pid && this.world.players.has(c.pid)) {
        c.send(JSON.stringify({ t: "spawn", id: c.pid }));
        return;
      }
      if (this.humans() >= CFG.MAX_HUMANS) {
        c.send(JSON.stringify({ t: "full" }));
        return;
      }
      var p = this.world.addPlayer(msg.name, false, { c: +msg.c, s: +msg.s });
      c.pid = p.id;
      c.joins++;
      c.send(JSON.stringify({ t: "spawn", id: p.id }));
      this.fillBots();
    } else if (msg.t === "in" && c.pid) {
      this.world.setInput(c.pid, msg.a, msg.th, msg.b);
    } else if (msg.t === "ping") {
      c.send(JSON.stringify({ t: "pong", c: msg.c }));
    }
  };
  Room.prototype.tick = function(dt) {
    var w = this.world;
    w.step(dt);
    var self = this;
    for (var i = 0; i < w.deaths.length; i++) {
      var d = w.deaths[i];
      this.clients.forEach(function(c) {
        if (c.pid === d.id) {
          c.pid = null;
          c.send(JSON.stringify({
            t: "dead",
            by: d.by,
            score: Math.round(d.p.best),
            kills: d.p.kills,
            time: Math.round(w.time - d.p.born)
          }));
        }
      });
    }
    var hadDeaths = w.deaths.length > 0;
    w.deaths = [];
    if (hadDeaths) this.fillBots();
    var state = JSON.stringify({ t: "s", p: w.snapshot(), fa: w.fa, fd: w.fd });
    w.fa = [];
    w.fd = [];
    this.clients.forEach(function(c) {
      c.send(state);
    });
    this.lbT -= dt;
    if (this.lbT <= 0) {
      this.lbT = 1;
      var lb = JSON.stringify({ t: "lb", l: w.leaderboard(), n: this.humans() });
      this.clients.forEach(function(c) {
        c.send(lb);
      });
    }
  };
  return { CFG, World, Room, radius, cleanName };
})();
var GameRoom = class {
  static {
    __name(this, "GameRoom");
  }
  constructor(state, env) {
    this.state = state;
    this.room = new GalaxiaEngine.Room();
    this.timer = null;
    this.sockets = 0;
  }
  startLoop() {
    if (this.timer) return;
    let last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      this.room.tick((now - last) / 1e3);
      last = now;
      if (this.sockets <= 0) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 50);
  }
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("Se esperaba WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets++;
    const c = this.room.connect((msg) => {
      try {
        server.send(msg);
      } catch (e) {
      }
    });
    let closed = false;
    const bye = /* @__PURE__ */ __name(() => {
      if (closed) return;
      closed = true;
      this.sockets--;
      this.room.disconnect(c);
    }, "bye");
    let count = 0, windowStart = Date.now();
    server.addEventListener("message", (ev) => {
      const now = Date.now();
      if (now - windowStart > 1e3) {
        windowStart = now;
        count = 0;
      }
      if (++count > 60) return;
      if (typeof ev.data !== "string" || ev.data.length > 300) return;
      this.room.message(c, ev.data);
    });
    server.addEventListener("close", bye);
    server.addEventListener("error", bye);
    this.startLoop();
    return new Response(null, { status: 101, webSocket: client });
  }
};
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const id = env.ROOM.idFromName("sala-1");
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/" || url.pathname === "/index.html")
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    if (url.pathname === "/privacidad")
      return new Response(PRIVACY, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("No encontrado", { status: 404 });
  }
};
var PRIVACY = `<!DOCTYPE html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pol\xEDtica de privacidad \xB7 Galaxia.io</title><body style="font-family:system-ui;max-width:680px;margin:30px auto;padding:0 18px;line-height:1.6">
<h1>Pol\xEDtica de privacidad de Galaxia.io</h1>
<p>Galaxia.io no pide registro ni recoge datos personales. El nombre que escribes para jugar solo se muestra a los dem\xE1s jugadores durante la partida y no se guarda en ning\xFAn servidor. Tu nombre y tu r\xE9cord se guardan \xFAnicamente en tu propio dispositivo.</p>
<p>Para que el juego online funcione, el servidor recibe temporalmente la direcci\xF3n IP de tu conexi\xF3n, que no se almacena ni se comparte.</p>
<p>Si en el futuro el juego muestra anuncios, el proveedor de anuncios podr\xE1 tratar datos seg\xFAn su propia pol\xEDtica, y esta p\xE1gina se actualizar\xE1.</p>
<p>Contacto: escribe al correo indicado en la ficha de Google Play.</p></body></html>`;

// ../../galaxia/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../galaxia/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-vF9Pqq/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../galaxia/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-vF9Pqq/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  GameRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
