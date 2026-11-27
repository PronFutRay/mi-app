# Galaxia.io — juego multijugador online

Juego estilo .io: cada jugador es un planeta que absorbe polvo estelar y planetas más pequeños.
Servidor autoritativo en Cloudflare (Worker + Durable Object, WebSockets, 20 ticks/s), con bots
que rellenan la partida cuando hay pocos jugadores. Si no hay conexión, el juego funciona sin
conexión contra bots.

## Archivos
- `src/engine.js` — motor del juego (mundo, bots, colisiones, ranking, sala de red). Lo usan el servidor y el modo sin conexión.
- `client/index.html` — cliente (canvas, controles táctiles y ratón).
- `src/server.js` — servidor Cloudflare (sirve el juego en `/`, el WebSocket en `/ws` y la política de privacidad en `/privacidad`).
- `build.py` — genera `dist/index.html` y `dist/worker.js`.
- `wrangler.toml` — configuración de Cloudflare.

## Publicar el servidor (necesita un ordenador con Node.js)
```
npm install
python3 build.py
npx wrangler login
npx wrangler deploy
```
El juego queda en `https://galaxia-io.<tu-subdominio>.workers.dev`.

## Probar en local
```
python3 build.py && npx wrangler dev
```
y abre http://localhost:8787 en dos pestañas.

## App para Play Store
Versión para empaquetar dentro de la app (apuntando a tu servidor):
```
python3 build.py wss://galaxia-io.<tu-subdominio>.workers.dev/ws
```
Luego se empaqueta `dist/index.html` con Capacitor (o se crea una TWA que abra la URL del Worker).
