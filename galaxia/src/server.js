/* Servidor online de Galaxia.io — Cloudflare Worker + Durable Object.
   Una sala compartida ("sala-1") con WebSockets y 20 ticks por segundo. */
import HTML from "./index.html";

export class GameRoom {
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
      this.room.tick((now - last) / 1000);
      last = now;
      if (this.sockets <= 0) { clearInterval(this.timer); this.timer = null; }
    }, 50);
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("Se esperaba WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets++;
    const c = this.room.connect((msg) => { try { server.send(msg); } catch (e) {} });
    let closed = false;
    const bye = () => { if (closed) return; closed = true; this.sockets--; this.room.disconnect(c); };
    let count = 0, windowStart = Date.now();
    server.addEventListener("message", (ev) => {
      const now = Date.now();
      if (now - windowStart > 1000) { windowStart = now; count = 0; }
      if (++count > 60) return;                 // anti-spam: máx. 60 mensajes/s
      if (typeof ev.data !== "string" || ev.data.length > 300) return;
      this.room.message(c, ev.data);
    });
    server.addEventListener("close", bye);
    server.addEventListener("error", bye);
    this.startLoop();
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
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

const PRIVACY = `<!DOCTYPE html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Política de privacidad · Galaxia.io</title><body style="font-family:system-ui;max-width:680px;margin:30px auto;padding:0 18px;line-height:1.6">
<h1>Política de privacidad de Galaxia.io</h1>
<p>Galaxia.io no pide registro ni recoge datos personales. El nombre que escribes para jugar solo se muestra a los demás jugadores durante la partida y no se guarda en ningún servidor. Tu nombre y tu récord se guardan únicamente en tu propio dispositivo.</p>
<p>Para que el juego online funcione, el servidor recibe temporalmente la dirección IP de tu conexión, que no se almacena ni se comparte.</p>
<p>Si en el futuro el juego muestra anuncios, el proveedor de anuncios podrá tratar datos según su propia política, y esta página se actualizará.</p>
<p>Contacto: escribe al correo indicado en la ficha de Google Play.</p></body></html>`;
