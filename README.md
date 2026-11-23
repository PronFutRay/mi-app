# 🐉 Dragon Shot

Juego de artillería por turnos con dragones, inspirado en GunBound. HTML5 canvas, sin dependencias.

## Cómo se juega
- **◀ ▶** mover el dragón (gasta energía de movimiento cada turno)
- **− / +** ángulo de disparo (toca para 1°, mantén para ajustar rápido)
- **Normal / Grande / Triple** cambia de proyectil (Grande ×2 y Triple ×3 por partida)
- **🔥 FUEGO** mantén pulsado para cargar la fuerza y suelta para disparar (la marca blanca indica tu última fuerza)
- El **viento** (arriba, en el centro) desvía los proyectiles; el terreno se destruye
- Gana quien deje al rival sin vida o lo tire al vacío

Modos: contra la CPU o 2 jugadores en el mismo móvil.
Teclado: flechas, `Espacio` (mantener y soltar), `S` cambia proyectil.

## Instalar en Android
**Opción A: APK**
1. En GitHub ve a **Actions → Build Android APK → Run workflow** (también se ejecuta solo al hacer push).
2. Cuando termine, descarga `DragonShot.apk` desde **Releases** (o desde los artefactos de la ejecución).
3. Ábrelo en el móvil e instálalo (acepta "instalar apps desconocidas" si lo pide).

**Opción B: web instalable (PWA)**
1. En **Settings → Pages**, elige **Source: GitHub Actions**, y ejecuta el workflow *Deploy web*.
2. Abre la URL de Pages en Chrome para Android → menú ⋮ → **Instalar app / Añadir a pantalla de inicio**. Funciona sin conexión.

## Desarrollo local
Abre `index.html` en el navegador (o `python3 -m http.server`).

---

# 🧭 NavPro GPS (carpeta `gps/`)

GPS en tiempo real con mapa, rutas alternativas, guía por voz en italiano y avisos de:
📷 autovelox y tutor (1000/500/250/100 m) · 🚦 cámaras de semáforo · 🚫 varcos ZTL/carril bus · 🚧 pasos a nivel · 🏫 escuelas · ⤴ curvas peligrosas · ↱ giros · ⚠️ exceso de velocidad sobre el límite de la vía.

- **Web:** `https://<usuario>.github.io/mi-app/gps/` (instalable desde Chrome → ⋮ → Instalar app)
- **APK:** workflow *Build NavPro GPS APK* → Releases → `NavProGPS.apk`
- **Probar sin conducir:** busca un destino y pulsa **🧪 Simular** (toca la etiqueta naranja para cambiar la velocidad).
- Mantén pulsado el mapa para fijar un destino. Ajustes (⚙️) para activar/desactivar cada tipo de aviso.

Datos: OpenStreetMap (mapas, autovelox, límites), OSRM (rutas), Nominatim (búsqueda). Pueden estar incompletos y no incluyen controles móviles ni tráfico en vivo.
