# Activar la «Lectura inteligente» de Busta Chiara (unos 10 minutos)

La app usa a Claude para leer bustas difíciles (mal escritas, borrosas o llenas de códigos)
y para traducir la app a más de 60 idiomas. Tu clave de Claude **nunca** va dentro de la app:
se guarda en un pequeño servidor gratuito de Cloudflare (este archivo `worker.js`).

Los nombres de los menús pueden cambiar un poco; busca el más parecido.

## 1. Crea tu clave de Claude
1. Entra en **platform.claude.com** (donde pusiste los 5 €).
2. Menú **API Keys** → **Create Key** → nombre `busta-chiara` → copia la clave (empieza por `sk-ant-`).
   Guárdala en un sitio seguro: solo se ve una vez. No la mandes por chat a nadie.
3. Recomendado: en **Limits / Spend limits** pon un límite mensual (ej. 5 €) para que nunca gaste más.

## 2. Crea el servidor en Cloudflare (gratis)
1. Crea una cuenta en **dash.cloudflare.com**.
2. Menú **Workers & Pages** (o **Compute → Workers**) → **Create** → **Create Worker** (plantilla «Hello World»).
3. Nombre: `busta-chiara` → **Deploy**.
4. Pulsa **Edit code**, borra todo lo que hay y pega el contenido completo de `worker.js`.
   Pulsa **Deploy**.

## 3. Guarda la clave como secreto
1. En tu Worker → **Settings** → **Variables and Secrets** → **Add**.
2. Tipo **Secret**, nombre exacto `ANTHROPIC_API_KEY`, valor: tu clave `sk-ant-...` → **Deploy/Save**.

## 4. Pon los límites diarios (muy importante para no gastar de más)
1. Menú **Storage & Databases → KV** (o **Workers KV**) → **Create namespace** → nombre `busta-limits`.
2. Vuelve a tu Worker → **Settings** → **Bindings** → **Add** → **KV namespace**.
   Nombre de variable exacto: `LIMITS`, namespace: `busta-limits` → **Save/Deploy**.

Por defecto: 8 lecturas por persona al día y 40 en total al día.
Puedes cambiarlo en **Variables and Secrets** (tipo Text): `PER_IP_DAILY`, `GLOBAL_DAILY`.

## 5. Comprueba que funciona
Abre en el navegador la dirección de tu Worker, algo como
`https://busta-chiara.TU-NOMBRE.workers.dev`
Debe salir: `{"ok":true,"ai":true,"limits":true}`
- `ai:false` → falta el secreto del paso 3.
- `limits:false` → falta el KV del paso 4.

## 6. Mándame la dirección
Pásame la dirección `https://....workers.dev` (esa sí se puede compartir, no es secreta)
y yo la pongo en la app (`config.js` → `AI_URL`). Desde ese momento aparecen:
- el selector con todos los idiomas,
- la casilla «Lectura inteligente» y el botón ✨ en los resultados.

## Cuánto cuesta
Cada lectura inteligente cuesta aproximadamente 2–4 céntimos (depende del tamaño de la busta).
Traducir la app a un idioma nuevo cuesta menos de 1 céntimo y se hace una sola vez por móvil.
Con 5 € salen más de 100 lecturas (estimación). Puedes ver el gasto real en platform.claude.com → Usage.
