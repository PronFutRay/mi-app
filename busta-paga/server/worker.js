/* Busta Chiara · servidor (Cloudflare Worker) · v2: cuentas de clientes + panel /admin
   Guarda tu clave de Claude y hace de puente entre la app y la API de Anthropic.
   La clave NUNCA va en la app: se guarda aquí como secreto (ANTHROPIC_API_KEY).

   Variables (Settings → Variables and Secrets):
     ANTHROPIC_API_KEY   (secreto, obligatorio)  tu clave de platform.claude.com
     MODEL               opcional. Lectura de bustas. Por defecto: claude-sonnet-5-5
     UI_MODEL            opcional. Traducción de la interfaz. Por defecto: claude-haiku-5-5
     ANTHROPIC_VERSION   opcional. Por defecto: 2026-10-21
     ALLOWED_ORIGINS     opcional. Webs que pueden usar este servidor, separadas por comas
     PER_IP_DAILY        opcional. Lecturas por persona y día. Por defecto: 8
     GLOBAL_DAILY        opcional. Lecturas totales por día. Por defecto: 40
     PAYPAL_CLIENT_ID / PAYPAL_SECRET  (secretos) cobro automático de paquetes con PayPal
     PAYPAL_MODE         opcional. "sandbox" para pruebas. Por defecto: live
     ADMIN_PASSWORD      (secreto) contraseña de tu panel: https://TU-WORKER.workers.dev/admin
     FREE_DAILY / FREE_IP_DAILY  opcional. Lecturas básicas gratis por móvil (1) y por familia/IP (3).
                         También se cambian desde el panel (Ajustes).
   Enlace KV (Settings → Bindings → KV namespace), nombre de variable:  LIMITS
     Sin KV no hay límites, ni cuentas, ni panel: ¡ponlo!

   Páginas que sirve este Worker:
     /cuenta  → cuenta del cliente: registro, acceso, su código, sus lecturas y recargas con PayPal
     /admin   → tu panel: avisos, cuentas, lecturas, ventas y ajustes
*/

const DEFAULT_ORIGINS = [
  "https://pronfutray.github.io", // la web
  "https://localhost",            // app Android (APK)
  "http://localhost",
  "capacitor://localhost",
];

/* Acceso privado: solo quien tenga el código puede usar la IA (gasta tu saldo).
   Aquí solo está la huella del código, no el código. Para cambiarlo: secreto ACCESS_CODE.
   Para abrirlo a todo el mundo (cuando cobres): variable OPEN = 1 */
const ACCESS_HASH = "458fd20bd1d76047fffc6ec648022c5f92cefbf37f0d19699fa824e9cc655593";

const MAX_BODY_BYTES = 9 * 1024 * 1024;   // petición completa
const MAX_FILES = 4;
const MAX_B64_TOTAL = 8 * 1024 * 1024;    // todas las imágenes juntas
const MAX_TEXT = 14000;
const MAX_UI_STRINGS = 400;
const MEDIA_OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const AMOUNT_KEYS = [
  "lordo", "netto", "tratt", "inps", "inps_rate", "inps_imp", "inps_az", "imp_fisc", "irpef_lorda", "detr",
  "irpef_netta", "add_reg", "add_com", "paga_base", "scatti", "superminimo", "contingenza",
  "gg_lav", "gg_retr", "gg_inps", "ore_ord",
];
const LINE_GROUPS = [
  "overtime", "absence", "bonus", "deduction", "tfr_month", "tfr_total", "pension_fund",
  "thirteenth", "fourteenth", "family_allowance", "other",
];

/* Esquema de salida. Todos los campos son obligatorios (más fiable); -1 = «no aparece». */
const READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["period_month", "period_year", "currency", "ccnl", "level", "role", "amounts", "leave", "lines", "decoded", "summary", "warnings", "is_payslip"],
  properties: {
    is_payslip: { type: "boolean" },
    period_month: { type: "integer", description: "1-12, or 0 if unknown" },
    period_year: { type: "integer", description: "e.g. 2026, or 0 if unknown" },
    currency: { type: "string", description: "ISO code printed on the document, default EUR" },
    ccnl: { type: "string", description: "collective agreement, empty if not printed" },
    level: { type: "string", description: "job level, empty if not printed" },
    role: { type: "string", description: "job title/qualification, empty if not printed" },
    amounts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["key", "value"],
        properties: { key: { type: "string", enum: AMOUNT_KEYS }, value: { type: "number" } },
      },
    },
    leave: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["type", "label", "unit", "prev", "accrued", "taken", "balance"],
        properties: {
          type: { type: "string", enum: ["ferie", "rol", "exf", "other"] },
          label: { type: "string", description: "name in the target language" },
          unit: { type: "string", enum: ["d", "h"] },
          prev: { type: "number", description: "balance from previous year, -1 if not shown" },
          accrued: { type: "number", description: "accrued this year/period, -1 if not shown" },
          taken: { type: "number", description: "taken/used, -1 if not shown" },
          balance: { type: "number", description: "current balance, -1 if not shown" },
        },
      },
    },
    lines: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["group", "label", "original", "quantity", "unit", "amount", "explanation"],
        properties: {
          group: { type: "string", enum: LINE_GROUPS },
          label: { type: "string", description: "short name in the target language" },
          original: { type: "string", description: "text exactly as printed" },
          quantity: { type: "number", description: "days/hours/units, -1 if none" },
          unit: { type: "string", enum: ["d", "h", "none"] },
          amount: { type: "number", description: "euro amount, positive number; -1 if none" },
          explanation: { type: "string", description: "one short sentence in the target language" },
        },
      },
    },
    decoded: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["original", "meaning", "confidence"],
        properties: {
          original: { type: "string", description: "code or abbreviation as printed, with its line text" },
          meaning: { type: "string", description: "plain explanation in the target language; say clearly if unknown" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    summary: { type: "array", items: { type: "string" }, description: "3-6 short bullet points in the target language" },
    warnings: { type: "array", items: { type: "string" }, description: "things to double-check, target language" },
  },
};

const UI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["strings"],
  properties: {
    strings: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["key", "text"],
        properties: { key: { type: "string" }, text: { type: "string" } },
      },
    },
  },
};

function langName(code) {
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code; } catch (e) { return code; }
}

function readSystemPrompt(lang) {
  const L = langName(lang);
  return `You read payslips ("busta paga" / "cedolino", mostly Italian, but any country) from photos, scans or PDFs. They may be blurry, crooked, badly laid out, handwritten-looking, or full of internal codes and abbreviations that only payroll staff understand. The reader is an ordinary worker without payroll knowledge. Return ONLY the JSON required by the schema.

Rules
- Write as the app "Busta Chiara". Never mention artificial intelligence, AI, Claude, Anthropic, language models, assistants or automatic generation in any text you return.
1. Privacy: never output the employee's name, tax code (codice fiscale), address, IBAN, bank details or ID/payroll numbers. Do not copy them into any field, not even in "original".
2. Numbers: use a decimal point and no thousands separators (1.234,56 -> 1234.56). Currency defaults to EUR. NEVER invent, estimate or compute numbers that are not printed. If a value is not printed use -1 (leave) / skip the amount entry. Percentages as plain numbers (9.19).
3. Units: "d" = days (gg, giorni), "h" = hours (ore). Check the column header; leave balances can be in days or hours depending on the company.
4. Leave (ferie, ROL, ex festività, banca ore, permessi): prev = residuo anno precedente / residuo AP / saldo iniziale; accrued = maturato / spettante; taken = goduto / fruito / utilizzato; balance = saldo / residuo finale. Use type "other" for other leave banks and give a label.
5. Amounts keys: lordo = total gross pay (totale competenze); netto = net pay actually paid (netto in busta); tratt = total deductions; inps = employee social-security contribution; inps_rate = its percentage; inps_imp = social-security taxable base; inps_az = employer contribution if printed; imp_fisc = taxable income for IRPEF; irpef_lorda; detr = tax credits (detrazioni); irpef_netta = IRPEF withheld; add_reg / add_com = regional / municipal surtax; paga_base, scatti (seniority), superminimo, contingenza = components of base pay; gg_lav, gg_retr, gg_inps = days worked / paid / for pension; ore_ord = ordinary hours.
6. Italian payroll knowledge you may use: INPS employee share is usually about 9-10% of the taxable base and employer about 30%; IRPEF gross minus detrazioni = IRPEF netta; TFR (severance accrual, about 6.9% of gross per year); 13a/14a mensilità; ANF; malattia, infortunio, maternità, congedo, CIGO/CIGS/FIS, permessi L.104; straordinari and maggiorazioni; trasferte; buoni pasto; welfare; conguaglio; trattamento integrativo / cuneo fiscale; fondo pensione; quota sindacale; cessione del quinto, pignoramento, anticipi.
7. Coded or abbreviated lines (numeric codes, cryptic abbreviations, software-specific labels): put each in "decoded" with your best reading using context (position in the table, units, amounts, neighbouring lines). Set confidence honestly: low / medium / high. If you cannot tell what it is, say so plainly in the target language and suggest asking the employer's payroll office. Never present a guess as a certainty.
8. "lines": the notable pay and deduction lines (not the totals already in "amounts"). group: overtime, absence (anything not worked or unpaid, sick leave, strikes, short-time), bonus (bonuses, premiums, allowances, benefits, reimbursements), deduction (union fee, loans, advances, garnishments, other withholdings), tfr_month (TFR accrued this month), tfr_total (TFR accumulated so far), pension_fund (supplementary pension fund), thirteenth, fourteenth, family_allowance (ANF), other. amount is a positive number; the group tells whether it is paid or withheld.
9. "explanation": one short sentence, very simple words, as if explaining to a friend.
10. "summary": 3-6 short bullets: net vs gross, leave left, pension contributions, and anything unusual (conguaglio, liquidation, negative balances, large deductions).
11. If the document is clearly not a payslip, set is_payslip=false, put one bullet in summary saying so, and leave arrays empty.
12. Write EVERY human-readable field (label, explanation, meaning, summary, warnings) in ${L}. Keep "original" exactly as printed.
13. Be complete but compact: no repeated items, no filler.`;
}

function uiSystemPrompt(lang) {
  const L = langName(lang);
  return `You translate the interface strings of a mobile app that explains payslips (busta paga) to workers. Translate from Italian into ${L}. Rules: keep the keys exactly; keep placeholders such as {x} {n} {l} {p} {u} {t} {a} {b} {c} unchanged; keep it short and natural, in simple everyday words; keep currency symbols and units; keep capitalisation style (labels in capitals stay short); keep proper names (Busta Chiara, INPS, IRPEF, TFR, ROL, CCNL, ANF, PDF, OCR) as they are, adding a very short explanation only if the original string has one. Month names must be real month names in ${L}. Return ONLY the JSON required by the schema, with every key present.`;
}

/* ---------- utilidades ---------- */

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/* Devuelve null (sin acceso), {master:true} (ilimitado) o {code, left} (paquete comprado). */
async function access(body, env) {
  if (env.OPEN === "1") return { master: true };
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || code.length > 64) return null;
  if (env.ACCESS_CODE ? code === String(env.ACCESS_CODE).trim().toUpperCase() : (await sha256hex(code)) === ACCESS_HASH) return { master: true };
  if (env.LIMITS && /^BC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    const v = await env.LIMITS.get("cred:" + code);
    if (v !== null) {
      if (await env.LIMITS.get("off:" + code)) return null;   // cuenta desactivada desde el panel
      return { code, left: parseInt(v, 10) || 0 };
    }
  }
  return null;
}

function allowedOrigins(env) {
  const extra = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.length ? extra : DEFAULT_ORIGINS;
}

function corsHeaders(origin, env) {
  const ok = origin && allowedOrigins(env).includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors },
  });
}

async function bump(env, key, limit) {
  /* Devuelve true si todavía hay cupo. Sin KV no se limita (se avisa en el README). */
  if (!env.LIMITS) return true;
  const cur = parseInt((await env.LIMITS.get(key)) || "0", 10);
  if (cur >= limit) return false;
  await env.LIMITS.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 36 });
  return true;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function cleanLang(l) {
  return typeof l === "string" && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(l) ? l : null;
}

async function callClaude(env, body) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": env.ANTHROPIC_VERSION || "2026-10-21",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => null);
  return { status: resp.status, data };
}

function textOf(data) {
  const block = data && Array.isArray(data.content) ? data.content.find((b) => b.type === "text") : null;
  return block ? block.text : "";
}

/* ---------- validación y limpieza de la respuesta ---------- */

const num = (x) => (typeof x === "number" && isFinite(x) ? x : -1);
const str = (x, n) => (typeof x === "string" ? x.slice(0, n || 400) : "");

function sanitizeRead(o) {
  if (!o || typeof o !== "object") return null;
  const out = {
    is_payslip: o.is_payslip !== false,
    period_month: Number.isInteger(o.period_month) && o.period_month >= 1 && o.period_month <= 12 ? o.period_month : 0,
    period_year: Number.isInteger(o.period_year) && o.period_year >= 1990 && o.period_year <= 2100 ? o.period_year : 0,
    currency: str(o.currency, 6) || "EUR",
    ccnl: str(o.ccnl, 120), level: str(o.level, 20), role: str(o.role, 80),
    amounts: [], leave: [], lines: [], decoded: [],
    summary: Array.isArray(o.summary) ? o.summary.slice(0, 8).map((s) => str(s, 300)).filter(Boolean) : [],
    warnings: Array.isArray(o.warnings) ? o.warnings.slice(0, 8).map((s) => str(s, 300)).filter(Boolean) : [],
  };
  (Array.isArray(o.amounts) ? o.amounts : []).slice(0, 60).forEach((a) => {
    if (a && AMOUNT_KEYS.includes(a.key) && typeof a.value === "number" && isFinite(a.value) && a.value >= 0) out.amounts.push({ key: a.key, value: a.value });
  });
  (Array.isArray(o.leave) ? o.leave : []).slice(0, 8).forEach((l) => {
    if (!l) return;
    out.leave.push({
      type: ["ferie", "rol", "exf", "other"].includes(l.type) ? l.type : "other",
      label: str(l.label, 60), unit: l.unit === "h" ? "h" : "d",
      prev: num(l.prev), accrued: num(l.accrued), taken: num(l.taken), balance: num(l.balance),
    });
  });
  (Array.isArray(o.lines) ? o.lines : []).slice(0, 40).forEach((l) => {
    if (!l) return;
    out.lines.push({
      group: LINE_GROUPS.includes(l.group) ? l.group : "other",
      label: str(l.label, 80), original: str(l.original, 120),
      quantity: num(l.quantity), unit: ["d", "h", "none"].includes(l.unit) ? l.unit : "none",
      amount: num(l.amount), explanation: str(l.explanation, 240),
    });
  });
  (Array.isArray(o.decoded) ? o.decoded : []).slice(0, 25).forEach((d) => {
    if (!d) return;
    out.decoded.push({
      original: str(d.original, 140), meaning: str(d.meaning, 320),
      confidence: ["low", "medium", "high"].includes(d.confidence) ? d.confidence : "low",
    });
  });
  return out;
}

/* ---------- acciones ---------- */

async function actionRead(body, env, ip, cors, acc) {
  if (!acc) return json({ ok: false, error: "locked" }, 401, cors);
  if (!acc.master && acc.left <= 0) return json({ ok: false, error: "no_credits", left: 0 }, 402, cors);
  const lang = cleanLang(body.lang);
  if (!lang) return json({ ok: false, error: "bad", message: "lang" }, 400, cors);
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length || files.length > MAX_FILES) return json({ ok: false, error: "bad", message: "files" }, 400, cors);
  let total = 0;
  const blocks = [];
  for (const f of files) {
    if (!f || !MEDIA_OK.includes(f.type) || typeof f.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(f.data)) {
      return json({ ok: false, error: "bad", message: "file" }, 400, cors);
    }
    total += f.data.length;
    blocks.push(
      f.type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: f.type, data: f.data } }
        : { type: "image", source: { type: "base64", media_type: f.type, data: f.data } }
    );
  }
  if (total > MAX_B64_TOTAL) return json({ ok: false, error: "too_big" }, 413, cors);

  const day = today();
  if (acc.master) {   /* las lecturas pagadas no tienen límite diario; el código maestro sí */
    if (!(await bump(env, "all:" + day, parseInt(env.GLOBAL_DAILY || "40", 10)))) return json({ ok: false, error: "limit_global" }, 429, cors);
    if (!(await bump(env, "ip:" + ip + ":" + day, parseInt(env.PER_IP_DAILY || "8", 10)))) return json({ ok: false, error: "limit" }, 429, cors);
  }

  const hint = typeof body.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
  blocks.push({
    type: "text",
    text:
      "Read this payslip and fill the schema. Write all explanations in the language with code \"" + lang + "\"." +
      (hint ? "\n\nText extracted automatically from the document (anonymised, may contain errors; the images are the reference):\n" + hint : ""),
  });

  const { status, data } = await callClaude(env, {
    model: env.MODEL || "claude-sonnet-5-5",
    max_tokens: 6000,
    system: readSystemPrompt(lang),
    messages: [{ role: "user", content: blocks }],
    output_config: { format: { type: "json_schema", schema: READ_SCHEMA } },
  });
  if (status !== 200 || !data) {
    return json({ ok: false, error: "upstream", status, message: data && data.error ? str(data.error.message, 200) : "" }, 502, cors);
  }
  if (data.stop_reason === "refusal" || data.stop_reason === "max_tokens") return json({ ok: false, error: "incomplete", reason: data.stop_reason }, 502, cors);
  let parsed = null;
  try { parsed = JSON.parse(textOf(data)); } catch (e) { /* se informa abajo */ }
  const result = sanitizeRead(parsed);
  if (!result) return json({ ok: false, error: "parse" }, 502, cors);
  let left = -1;
  if (!acc.master) {
    const cur = parseInt((await env.LIMITS.get("cred:" + acc.code)) || "0", 10);
    left = Math.max(0, cur - 1);
    await env.LIMITS.put("cred:" + acc.code, String(left));
  }
  return json({ ok: true, result, left }, 200, cors);
}

async function actionUi(body, env, ip, cors, acc) {
  const lang = cleanLang(body.lang);
  const strings = body.strings && typeof body.strings === "object" ? body.strings : null;
  if (!lang || !strings) return json({ ok: false, error: "bad" }, 400, cors);
  const keys = Object.keys(strings);
  if (!keys.length || keys.length > MAX_UI_STRINGS) return json({ ok: false, error: "bad" }, 400, cors);
  let size = 0;
  for (const k of keys) {
    if (typeof strings[k] !== "string") return json({ ok: false, error: "bad" }, 400, cors);
    size += strings[k].length + k.length;
  }
  if (size > 40000) return json({ ok: false, error: "too_big" }, 413, cors);

  /* Traducciones guardadas: una vez traducido un idioma, sirve gratis para todos */
  const ckey = "ui:" + lang + ":" + (await sha256hex(JSON.stringify(keys.map((k) => [k, strings[k]]))));
  if (env.LIMITS) {
    const cached = await env.LIMITS.get(ckey);
    if (cached) return json({ ok: true, strings: JSON.parse(cached), cached: true }, 200, cors);
  }
  if (!acc) return json({ ok: false, error: "locked" }, 401, cors);
  const day = today();
  if (!(await bump(env, "ui:" + ip + ":" + day, 20))) return json({ ok: false, error: "limit" }, 429, cors);

  const list = keys.map((k) => ({ key: k, text: strings[k] }));
  const { status, data } = await callClaude(env, {
    model: env.UI_MODEL || "claude-haiku-5-5",
    max_tokens: 16000,
    system: uiSystemPrompt(lang),
    messages: [{ role: "user", content: JSON.stringify({ strings: list }) }],
    output_config: { format: { type: "json_schema", schema: UI_SCHEMA } },
  });
  if (status !== 200 || !data) return json({ ok: false, error: "upstream", status }, 502, cors);
  if (data.stop_reason === "max_tokens" || data.stop_reason === "refusal") return json({ ok: false, error: "incomplete" }, 502, cors);
  let parsed = null;
  try { parsed = JSON.parse(textOf(data)); } catch (e) { /* ... */ }
  if (!parsed || !Array.isArray(parsed.strings)) return json({ ok: false, error: "parse" }, 502, cors);
  const out = {};
  parsed.strings.forEach((s) => {
    if (s && typeof s.key === "string" && keys.includes(s.key) && typeof s.text === "string" && s.text.trim()) out[s.key] = s.text.slice(0, 600);
  });
  const missing = keys.filter((k) => !(k in out));
  if (missing.length > keys.length * 0.15) return json({ ok: false, error: "incomplete" }, 502, cors);
  if (env.LIMITS) await env.LIMITS.put(ckey, JSON.stringify(out));
  return json({ ok: true, strings: out }, 200, cors);
}

/* ---------- lectura básica gratis: 1 al día por móvil, 3 al día por familia ----------
   Se cuenta en el servidor por móvil (ID del teléfono) y por conexión (IP = la wifi de casa),
   así borrar los datos de la app no da lecturas nuevas. Se cambia desde el panel (Ajustes)
   o con las variables FREE_DAILY / FREE_IP_DAILY. */
async function freeCfg(env) {
  let c = null;
  if (env.LIMITS) { try { c = JSON.parse((await env.LIMITS.get("cfg:free")) || "null"); } catch (e) { c = null; } }
  const pick = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
  return {
    per: pick(c && c.per, pick(env.FREE_DAILY, 1)),
    perIp: pick(c && c.perIp, pick(env.FREE_IP_DAILY, 3)),
  };
}
async function actionFree(body, env, ip, cors, acc) {
  const { per, perIp } = await freeCfg(env);
  if (acc && (acc.master || acc.left > 0)) return json({ ok: true, left: -1 }, 200, cors);   // maestro o con lecturas pagadas: sin límite
  if (!env.LIMITS) return json({ ok: true, left: per }, 200, cors);
  const dev = typeof body.device === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(body.device) ? body.device : null;
  if (!dev) return json({ ok: false, error: "bad" }, 400, cors);
  const day = today(), kd = "free:d:" + dev + ":" + day, ki = "free:ip:" + ip + ":" + day;
  const nd = parseInt((await env.LIMITS.get(kd)) || "0", 10), ni = parseInt((await env.LIMITS.get(ki)) || "0", 10);
  if (body.peek) return json({ ok: true, left: Math.max(0, Math.min(per - nd, perIp - ni)) }, 200, cors);
  if (nd >= per || ni >= perIp) return json({ ok: false, error: "free_limit", left: 0 }, 429, cors);
  await env.LIMITS.put(kd, String(nd + 1), { expirationTtl: 60 * 60 * 48 });
  await env.LIMITS.put(ki, String(ni + 1), { expirationTtl: 60 * 60 * 48 });
  return json({ ok: true, left: Math.max(0, Math.min(per - nd - 1, perIp - ni - 1)) }, 200, cors);
}

/* ---------- cobro con PayPal (paquetes de lecturas) ---------- */

const PACK_SIZE = 5;
const PACK_PRICE = "2.99";
const PACK_CURRENCY = "EUR";
const APP_RETURN = "https://pronfutray.github.io/mi-app/busta-paga/";

function ppBase(env) { return env.PAYPAL_MODE === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"; }
let ppToken = null;
async function ppAuth(env) {
  if (ppToken && ppToken.exp > Date.now()) return ppToken.v;
  const r = await fetch(ppBase(env) + "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(env.PAYPAL_CLIENT_ID + ":" + env.PAYPAL_SECRET), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.access_token) throw new Error("paypal_auth");
  ppToken = { v: d.access_token, exp: Date.now() + Math.max(60, (d.expires_in || 3000) - 120) * 1000 };
  return ppToken.v;
}
async function pp(env, method, path, body, reqId) {
  const h = { Authorization: "Bearer " + (await ppAuth(env)), "Content-Type": "application/json" };
  if (reqId) h["PayPal-Request-Id"] = reqId;
  const r = await fetch(ppBase(env) + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => null);
  return { status: r.status, data: d };
}
function newCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = new Uint8Array(12);
  crypto.getRandomValues(b);
  let s = ""; for (let i = 0; i < 12; i++) { s += A[b[i] % A.length]; if (i === 3 || i === 7) s += "-"; }
  return "BC-" + s;
}
function cleanClaim(c) { return typeof c === "string" && /^[A-Za-z0-9]{20,40}$/.test(c) ? c : null; }

async function actionBuy(body, env, ip, cors, self) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET || !env.LIMITS) return json({ ok: false, error: "no_pay" }, 503, cors);
  const claim = cleanClaim(body.claim);
  if (!claim) return json({ ok: false, error: "bad" }, 400, cors);
  const acct = body.token ? await acctFromToken(env, body.token) : null;
  if (body.token && !acct) return json({ ok: false, error: "login" }, 401, cors);
  if (!(await bump(env, "buy:" + ip + ":" + today(), 30))) return json({ ok: false, error: "limit" }, 429, cors);
  const ref = typeof body.ref === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(body.ref) ? body.ref : "direct";
  const accountPage = self + "/cuenta";
  const ret = acct ? accountPage : APP_RETURN;
  const back = (st) => ret + "?paypal=" + st + "&claim=" + claim;
  const lc = typeof body.locale === "string" && /^[a-z]{2}-[A-Z]{2}$/.test(body.locale) ? body.locale : undefined;
  const { status, data } = await pp(env, "POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: "busta-chiara",
      description: "Busta Chiara - " + PACK_SIZE + " letture intelligenti",
      custom_id: ref,
      amount: { currency_code: PACK_CURRENCY, value: PACK_PRICE },
    }],
    payment_source: { paypal: { experience_context: {
      brand_name: "Busta Chiara", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING",
      return_url: back("ok"), cancel_url: back("cancel"), locale: lc,
    } } },
  }, "order-" + claim);
  const link = data && Array.isArray(data.links) ? data.links.find((l) => l.rel === "payer-action" || l.rel === "approve") : null;
  if (status >= 300 || !data || !data.id || !link) return json({ ok: false, error: "pay_upstream", status, message: data && (data.message || data.name) ? str(data.message || data.name, 200) : "" }, 502, cors);
  await env.LIMITS.put("claim:" + claim, JSON.stringify({ order: data.id, ref, t: Date.now(), email: acct ? acct.email : "" }), { expirationTtl: 60 * 60 * 24 * 7 });
  return json({ ok: true, url: link.href }, 200, cors);
}

async function actionClaim(body, env, ip, cors) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET || !env.LIMITS) return json({ ok: false, error: "no_pay" }, 503, cors);
  const claim = cleanClaim(body.claim);
  if (!claim) return json({ ok: false, error: "bad" }, 400, cors);
  const raw = await env.LIMITS.get("claim:" + claim);
  if (!raw) return json({ ok: false, error: "unknown" }, 404, cors);
  const c = JSON.parse(raw);
  if (c.code) {
    const left = parseInt((await env.LIMITS.get("cred:" + c.code)) || "0", 10);
    return json({ ok: true, code: c.code, left }, 200, cors);
  }
  let { data } = await pp(env, "GET", "/v2/checkout/orders/" + encodeURIComponent(c.order));
  if (data && data.status === "APPROVED") {
    const cap = await pp(env, "POST", "/v2/checkout/orders/" + encodeURIComponent(c.order) + "/capture", {}, "capture-" + claim);
    if (cap.data && cap.data.status) data = cap.data;
    else ({ data } = await pp(env, "GET", "/v2/checkout/orders/" + encodeURIComponent(c.order)));
  }
  if (!data || !data.status) return json({ ok: false, error: "pay_upstream" }, 502, cors);
  if (data.status !== "COMPLETED") {
    const st = ["CREATED", "SAVED", "PAYER_ACTION_REQUIRED", "APPROVED"].includes(data.status) ? "pending" : "failed";
    return json({ ok: false, error: st, status: data.status }, 409, cors);
  }
  const pu = (data.purchase_units || [])[0] || {};
  const capt = ((pu.payments || {}).captures || [])[0] || {};
  const amt = capt.amount || pu.amount || {};
  if (capt.status !== "COMPLETED" || amt.value !== PACK_PRICE || amt.currency_code !== PACK_CURRENCY) {
    return json({ ok: false, error: capt.status === "PENDING" ? "pending" : "failed", status: capt.status || "" }, 409, cors);
  }
  /* Pago confirmado: sumar las lecturas (una sola vez por pedido).
     Con cuenta: se suman al código personal de la cuenta. Sin cuenta: código nuevo. */
  const prev = await env.LIMITS.get("order:" + c.order);
  const acct = c.email ? await getAcct(env, c.email) : null;
  const code = prev || (acct ? acct.code : newCode());
  if (!prev) {
    await env.LIMITS.put("order:" + c.order, code);
    const cur = parseInt((await env.LIMITS.get("cred:" + code)) || "0", 10);
    await env.LIMITS.put("cred:" + code, String(cur + PACK_SIZE));
    const payer = (data.payer && data.payer.email_address) || "";
    const iso = new Date().toISOString();
    await env.LIMITS.put("sale:" + iso + ":" + c.order, JSON.stringify({ ref: c.ref, amount: amt.value, currency: amt.currency_code, code, capture: capt.id || "", email: acct ? acct.email : "", payer }));
    if (acct) {
      await env.LIMITS.put("hist:" + acct.email + ":" + iso + "|" + capt.id, JSON.stringify({ n: PACK_SIZE, amount: amt.value, currency: amt.currency_code, order: c.order }));
      await addEvent(env, "recarga", `Recarga: ${acct.name} | email ${acct.email}${acct.phone ? " | tel. " + acct.phone : ""} | +${PACK_SIZE} lecturas (ahora ${cur + PACK_SIZE}) | ${amt.value} ${amt.currency_code} | PayPal: ${payer || "-"} | código ${code}`, acct.email);
    } else {
      await addEvent(env, "venta", `Venta sin cuenta: +${PACK_SIZE} lecturas | ${amt.value} ${amt.currency_code} | PayPal: ${payer || "-"} | código ${code}${c.ref && c.ref !== "direct" ? " | embajadora " + c.ref : ""}`, "");
    }
  }
  c.code = code;
  await env.LIMITS.put("claim:" + claim, JSON.stringify(c), { expirationTtl: 60 * 60 * 24 * 30 });
  const left = parseInt((await env.LIMITS.get("cred:" + code)) || "0", 10);
  return json({ ok: true, code, left, isNew: !prev }, 200, cors);
}

async function actionSales(env, cors) {
  /* Solo con el código maestro: lista de ventas con el código de la embajadora (ref) */
  const out = [];
  let cursor;
  do {
    const r = await env.LIMITS.list({ prefix: "sale:", cursor });
    for (const k of r.keys) { const v = await env.LIMITS.get(k.name); if (v) out.push({ date: k.name.slice(5, 29), ...JSON.parse(v) }); }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < 1000);
  return json({ ok: true, sales: out }, 200, cors);
}

/* ---------- cuentas de clientes ----------
   Cada cuenta tiene su propio código personal (BC-XXXX-XXXX-XXXX). Las lecturas de la cuenta
   son las de ese código: el cliente lo pone una vez en la app y la lectura avanzada funciona
   igual que antes. Las lecturas no caducan.
   KV:  acct:<email> (datos)  ·  tok:<token> (sesión)  ·  codeacct:<código>  ·  cred:<código> (lecturas)
        evt:<fecha> (avisos del panel)  ·  hist:<email>:<fecha> (recargas)  ·  log:<código>:<fecha> */

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PBKDF2_ITER = 100000;

function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function rndHex(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return hex(b); }
function cleanEmail(e) { const s = typeof e === "string" ? e.trim().toLowerCase() : ""; return EMAIL_RE.test(s) ? s : null; }
function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hashPw(pw, salt) {
  salt = salt || rndHex(16);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return "p2$" + salt + "$" + hex(bits);
}
async function checkPw(pw, stored) {
  if (typeof stored !== "string" || !stored.startsWith("p2$")) return false;
  const salt = stored.split("$")[1];
  return safeEq(await hashPw(pw, salt), stored);
}

async function getAcct(env, email) {
  const e = cleanEmail(email); if (!e) return null;
  try { return JSON.parse((await env.LIMITS.get("acct:" + e)) || "null"); } catch (x) { return null; }
}
async function putAcct(env, a) {
  // los metadatos permiten listar cuentas en el panel sin leer cada una
  await env.LIMITS.put("acct:" + a.email, JSON.stringify(a), {
    metadata: { n: a.name.slice(0, 60), p: (a.phone || "").slice(0, 30), c: a.code, on: a.active ? 1 : 0, t: a.created },
  });
}
async function credits(env, code) { return parseInt((await env.LIMITS.get("cred:" + code)) || "0", 10) || 0; }
async function acctFromToken(env, token) {
  if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token)) return null;
  const email = await env.LIMITS.get("tok:" + token);
  if (!email) return null;
  const a = await getAcct(env, email);
  return a && a.active ? a : null;
}
async function newSession(env, email) {
  const t = rndHex(24);
  await env.LIMITS.put("tok:" + t, email, { expirationTtl: 60 * 60 * 24 * 60 });
  return t;
}
async function addEvent(env, type, msg, email) {
  const iso = new Date().toISOString();
  await env.LIMITS.put("evt:" + iso + ":" + rndHex(3), JSON.stringify({ type, msg, email: email || "", t: iso }), { expirationTtl: 60 * 60 * 24 * 365 });
}
async function setCredits(env, code, value, reason) {
  const v = Math.max(0, Math.floor(value));
  const before = await credits(env, code);
  await env.LIMITS.put("cred:" + code, String(v));
  await env.LIMITS.put("log:" + code + ":" + new Date().toISOString() + "|" + rndHex(3), JSON.stringify({ d: v - before, v, r: String(reason || "").slice(0, 120) }), { expirationTtl: 60 * 60 * 24 * 730 });
  return v;
}
async function listAll(env, prefix, max) {
  const out = []; let cursor;
  do {
    const r = await env.LIMITS.list({ prefix, cursor });
    out.push(...r.keys);
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < (max || 1000));
  return out;
}
async function freshCode(env) {
  for (let i = 0; i < 5; i++) { const c = newCode(); if ((await env.LIMITS.get("cred:" + c)) === null) return c; }
  throw new Error("code");
}
function publicAcct(a, left) { return { name: a.name, email: a.email, phone: a.phone || "", code: a.code, left, created: a.created }; }

async function createAccount(env, { name, email, phone, password, notes }, byAdmin) {
  name = typeof name === "string" ? name.trim().slice(0, 80) : "";
  email = cleanEmail(email);
  phone = typeof phone === "string" ? phone.trim().slice(0, 30) : "";
  if (name.length < 2) return { error: "bad_name" };
  if (!email) return { error: "bad_email" };
  if (typeof password !== "string" || password.length < 6 || password.length > 200) return { error: "bad_password" };
  if (await env.LIMITS.get("acct:" + email)) return { error: "email_taken" };
  const code = await freshCode(env);
  const a = { name, email, phone, code, pw: await hashPw(password), active: true, notes: typeof notes === "string" ? notes.slice(0, 500) : "", created: new Date().toISOString(), last: "" };
  await env.LIMITS.put("cred:" + code, "0");
  await env.LIMITS.put("codeacct:" + code, email);
  await putAcct(env, a);
  await addEvent(env, "registro", `${byAdmin ? "Cuenta creada por ti" : "Nuevo registro"}: ${name} | email ${email}${phone ? " | tel. " + phone : ""} | código ${code}`, email);
  return { acct: a };
}

async function history(env, email) {
  const keys = (await listAll(env, "hist:" + email + ":", 200)).slice(-50).reverse();
  const out = [];
  for (const k of keys) { const v = await env.LIMITS.get(k.name); if (v) out.push({ t: k.name.slice(("hist:" + email + ":").length).split("|")[0], ...JSON.parse(v) }); }
  return out;
}

const ACCOUNT_ACTIONS = {
  async register(body, env, ip, cors) {
    if (!(await bump(env, "reg:" + ip + ":" + today(), 10))) return json({ ok: false, error: "limit" }, 429, cors);
    const r = await createAccount(env, body, false);
    if (r.error) return json({ ok: false, error: r.error }, r.error === "email_taken" ? 409 : 400, cors);
    const token = await newSession(env, r.acct.email);
    return json({ ok: true, token, account: publicAcct(r.acct, 0) }, 200, cors);
  },
  async login(body, env, ip, cors) {
    if (!(await bump(env, "login:" + ip + ":" + today(), 30))) return json({ ok: false, error: "limit" }, 429, cors);
    const a = await getAcct(env, body.email);
    if (!a || typeof body.password !== "string" || !(await checkPw(body.password, a.pw))) return json({ ok: false, error: "bad_login" }, 401, cors);
    if (!a.active) return json({ ok: false, error: "disabled" }, 403, cors);
    a.last = new Date().toISOString(); await putAcct(env, a);
    const token = await newSession(env, a.email);
    return json({ ok: true, token, account: publicAcct(a, await credits(env, a.code)) }, 200, cors);
  },
  async me(body, env, ip, cors) {
    const a = await acctFromToken(env, body.token);
    if (!a) return json({ ok: false, error: "login" }, 401, cors);
    return json({ ok: true, account: publicAcct(a, await credits(env, a.code)), history: await history(env, a.email) }, 200, cors);
  },
  async logout(body, env, ip, cors) {
    if (typeof body.token === "string" && /^[a-f0-9]{48}$/.test(body.token)) await env.LIMITS.delete("tok:" + body.token);
    return json({ ok: true }, 200, cors);
  },
  async passwd(body, env, ip, cors) {
    const a = await acctFromToken(env, body.token);
    if (!a) return json({ ok: false, error: "login" }, 401, cors);
    if (!(await checkPw(String(body.current || ""), a.pw))) return json({ ok: false, error: "bad_login" }, 401, cors);
    if (typeof body.next !== "string" || body.next.length < 6) return json({ ok: false, error: "bad_password" }, 400, cors);
    a.pw = await hashPw(body.next); await putAcct(env, a);
    return json({ ok: true }, 200, cors);
  },
};

/* ---------- panel de administración ---------- */

async function adminAction(body, env, ip, cors) {
  if (body.action === "admin_login") {
    if (!env.ADMIN_PASSWORD) return json({ ok: false, error: "no_admin" }, 503, cors);
    if (!(await bump(env, "alogin:" + ip + ":" + today(), 15))) return json({ ok: false, error: "limit" }, 429, cors);
    if (!safeEq(String(body.password || ""), String(env.ADMIN_PASSWORD))) return json({ ok: false, error: "bad_login" }, 401, cors);
    const t = rndHex(24);
    await env.LIMITS.put("atok:" + t, "1", { expirationTtl: 60 * 60 * 24 * 7 });
    return json({ ok: true, token: t }, 200, cors);
  }
  if (typeof body.admin !== "string" || !/^[a-f0-9]{48}$/.test(body.admin) || !(await env.LIMITS.get("atok:" + body.admin))) {
    return json({ ok: false, error: "admin_login" }, 401, cors);
  }
  const ok = (o) => json({ ok: true, ...o }, 200, cors);
  const bad = (e, s) => json({ ok: false, error: e }, s || 400, cors);

  switch (body.action) {
    case "a_stats": {
      const accts = await listAll(env, "acct:", 5000);
      const sales = await listAll(env, "sale:", 5000);
      const fc = await freeCfg(env);
      return ok({ accounts: accts.length, sales: sales.length, free: fc, pay: !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET), mode: env.PAYPAL_MODE === "sandbox" ? "sandbox" : "live", ai: !!env.ANTHROPIC_API_KEY, pack: PACK_SIZE, price: PACK_PRICE });
    }
    case "a_events": {
      const keys = (await listAll(env, "evt:", 3000)).slice(-150).reverse();
      const seen = (await env.LIMITS.get("cfg:seen")) || "";
      const out = [];
      for (const k of keys) { const v = await env.LIMITS.get(k.name); if (v) out.push({ ...JSON.parse(v), k: k.name, new: k.name > seen }); }
      return ok({ events: out });
    }
    case "a_seen": {
      await env.LIMITS.put("cfg:seen", "evt:" + new Date().toISOString() + ":zzz");
      return ok({});
    }
    case "a_accounts": {
      const keys = await listAll(env, "acct:", 2000);
      const q = typeof body.q === "string" ? body.q.trim().toLowerCase() : "";
      const out = [];
      for (const k of keys) {
        const m = k.metadata || {};
        const email = k.name.slice(5);
        if (q && !(email.includes(q) || String(m.n || "").toLowerCase().includes(q) || String(m.p || "").includes(q) || String(m.c || "").toLowerCase().includes(q))) continue;
        out.push({ email, name: m.n || "", phone: m.p || "", code: m.c || "", active: m.on !== 0, created: m.t || "", left: 0 });
      }
      out.sort((a, b) => (a.created < b.created ? 1 : -1));
      const page = out.slice(0, 300);
      for (const a of page) a.left = a.code ? await credits(env, a.code) : 0;
      return ok({ accounts: page, total: out.length });
    }
    case "a_get": {
      const a = await getAcct(env, body.email);
      if (!a) return bad("not_found", 404);
      const logs = (await listAll(env, "log:" + a.code + ":", 300)).slice(-40).reverse();
      const log = [];
      for (const k of logs) { const v = await env.LIMITS.get(k.name); if (v) log.push({ t: k.name.slice(("log:" + a.code + ":").length).split("|")[0], ...JSON.parse(v) }); }
      return ok({ account: { ...publicAcct(a, await credits(env, a.code)), active: a.active, notes: a.notes || "", last: a.last || "" }, history: await history(env, a.email), log });
    }
    case "a_create": {
      const r = await createAccount(env, body, true);
      if (r.error) return bad(r.error, r.error === "email_taken" ? 409 : 400);
      const n = parseInt(body.credits, 10);
      if (n > 0) await setCredits(env, r.acct.code, n, "Asignadas al crear la cuenta");
      return ok({ email: r.acct.email });
    }
    case "a_update": {
      const a = await getAcct(env, body.email);
      if (!a) return bad("not_found", 404);
      if (body.name !== undefined) { const n = String(body.name).trim().slice(0, 80); if (n.length < 2) return bad("bad_name"); a.name = n; }
      if (body.phone !== undefined) a.phone = String(body.phone).trim().slice(0, 30);
      if (body.notes !== undefined) a.notes = String(body.notes).slice(0, 500);
      if (body.password) { if (String(body.password).length < 6) return bad("bad_password"); a.pw = await hashPw(String(body.password)); }
      if (body.active !== undefined) {
        a.active = !!body.active;
        if (a.active) await env.LIMITS.delete("off:" + a.code); else await env.LIMITS.put("off:" + a.code, "1");
      }
      let newEmail = null;
      if (body.newEmail !== undefined && String(body.newEmail).trim().toLowerCase() !== a.email) {
        newEmail = cleanEmail(body.newEmail);
        if (!newEmail) return bad("bad_email");
        if (await env.LIMITS.get("acct:" + newEmail)) return bad("email_taken", 409);
      }
      if (newEmail) {
        const old = a.email;
        for (const k of await listAll(env, "hist:" + old + ":", 500)) { const v = await env.LIMITS.get(k.name); if (v) await env.LIMITS.put("hist:" + newEmail + k.name.slice(("hist:" + old).length), v); await env.LIMITS.delete(k.name); }
        a.email = newEmail;
        await putAcct(env, a);
        await env.LIMITS.put("codeacct:" + a.code, newEmail);
        await env.LIMITS.delete("acct:" + old);
      } else {
        await putAcct(env, a);
      }
      return ok({ email: a.email });
    }
    case "a_credits": {
      let code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!code && body.email) { const a = await getAcct(env, body.email); if (!a) return bad("not_found", 404); code = a.code; }
      if (!/^BC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return bad("bad_code");
      const cur = await env.LIMITS.get("cred:" + code);
      if (cur === null && !body.create) return bad("not_found", 404);
      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Ajuste desde el panel";
      let v;
      if (body.set !== undefined && body.set !== "") v = await setCredits(env, code, parseInt(body.set, 10) || 0, reason);
      else { const add = parseInt(body.add, 10); if (!add) return bad("bad_amount"); v = await setCredits(env, code, (parseInt(cur || "0", 10) || 0) + add, reason); }
      return ok({ code, left: v });
    }
    case "a_code": {
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      const v = await env.LIMITS.get("cred:" + code);
      if (v === null) return bad("not_found", 404);
      return ok({ code, left: parseInt(v, 10) || 0, email: (await env.LIMITS.get("codeacct:" + code)) || "", off: !!(await env.LIMITS.get("off:" + code)) });
    }
    case "a_newcode": {
      const code = await freshCode(env);
      const n = Math.max(0, parseInt(body.credits, 10) || 0);
      await env.LIMITS.put("cred:" + code, "0");
      if (n) await setCredits(env, code, n, typeof body.reason === "string" && body.reason ? body.reason : "Código creado desde el panel");
      return ok({ code, left: n });
    }
    case "a_delete": {
      const a = await getAcct(env, body.email);
      if (!a) return bad("not_found", 404);
      await env.LIMITS.delete("acct:" + a.email);
      await env.LIMITS.delete("codeacct:" + a.code);
      await env.LIMITS.put("off:" + a.code, "1");   // su código deja de funcionar en la app
      await env.LIMITS.put("cred:" + a.code, "0");
      return ok({});
    }
    case "a_sales": {
      const keys = (await listAll(env, "sale:", 3000)).slice(-300).reverse();
      const out = [];
      for (const k of keys) { const v = await env.LIMITS.get(k.name); if (v) out.push({ date: k.name.slice(5, 29), ...JSON.parse(v) }); }
      return ok({ sales: out });
    }
    case "a_traffic": {
      return ok({ sites: await adminTraffic(env) });
    }
    case "a_settings": {
      const cur = await freeCfg(env);
      const pick = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : d; };
      const next = { per: pick(body.per, cur.per), perIp: pick(body.perIp, cur.perIp) };
      await env.LIMITS.put("cfg:free", JSON.stringify(next));
      return ok({ free: next });
    }
  }
  return bad("bad");
}

function page(html) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/* ---------- estadísticas de uso de las webs (GPL Calc) ----------
   Sin cookies ni datos personales: el visitante se identifica con una huella diaria
   (IP + navegador + día, cifrada y recortada) que cambia cada día y no se puede revertir.
   KV:  st:pv:<web>:<día> (visitas) · st:uc:<web>:<día> (personas) · st:u:<web>:<día>:<id>
        st:on:<web>:<id> (conectado ahora; caduca a los 5 min sin señal) */
const TRACK_SITES = { gpl: "GPL Calc (ES)", "gpl-it": "GPL Calc (IT)" };
async function incr(env, key, ttl) {
  const n = (parseInt((await env.LIMITS.get(key)) || "0", 10) || 0) + 1;
  await env.LIMITS.put(key, String(n), ttl ? { expirationTtl: ttl } : undefined);
  return n;
}
async function actionTrack(body, env, request, cors) {
  const site = typeof body.site === "string" && TRACK_SITES[body.site] ? body.site : null;
  if (!site || !env.LIMITS) return json({ ok: false }, 400, cors);
  const ev = body.ev === "ping" ? "ping" : "view";
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 200);
  const vid = (await sha256hex(day + "|" + ip + "|" + ua + "|" + (env.ADMIN_PASSWORD || "bc"))).slice(0, 16);
  const country = (request.cf && request.cf.country) || "";
  const mobile = /Mobi|Android|iPhone|iPad/i.test(ua) ? 1 : 0;
  const keep = 60 * 60 * 24 * 120;
  if (ev === "view") {
    await incr(env, "st:pv:" + site + ":" + day, keep);
    const uk = "st:u:" + site + ":" + day + ":" + vid;
    if ((await env.LIMITS.get(uk)) === null) {
      await env.LIMITS.put(uk, "1", { expirationTtl: 60 * 60 * 24 * 3, metadata: { c: country, m: mobile } });
      await incr(env, "st:uc:" + site + ":" + day, keep);
    }
  }
  await env.LIMITS.put("st:on:" + site + ":" + vid, "1", { expirationTtl: 300, metadata: { c: country, m: mobile, t: Date.now() } });
  return json({ ok: true }, 200, cors);
}
async function adminTraffic(env) {
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const today = days[days.length - 1];
  const out = {};
  for (const site of Object.keys(TRACK_SITES)) {
    const online = await listAll(env, "st:on:" + site + ":", 1000);
    const cut = Date.now() - 300000;
    const on = online.filter((k) => !k.metadata || !k.metadata.t || k.metadata.t > cut);
    const hist = [];
    for (const d of days) {
      hist.push({ d, pv: parseInt((await env.LIMITS.get("st:pv:" + site + ":" + d)) || "0", 10) || 0, u: parseInt((await env.LIMITS.get("st:uc:" + site + ":" + d)) || "0", 10) || 0 });
    }
    const todayUsers = await listAll(env, "st:u:" + site + ":" + today + ":", 2000);
    const countries = {}; let mob = 0;
    for (const k of todayUsers) { const m = k.metadata || {}; countries[m.c || "?"] = (countries[m.c || "?"] || 0) + 1; if (m.m) mob++; }
    out[site] = {
      name: TRACK_SITES[site], online: on.length, hist,
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 8),
      mobile: mob, desktop: todayUsers.length - mob,
    };
  }
  return out;
}

const ADMIN_HTML = [
  "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"robots\" content=\"noindex\">\n<meta name=\"theme-color\" content=\"#0f3d3e\">\n<title>Panel · Busta Chiara</title>\n<style>\n:root{--ink:#14211f;--muted:#5c6b68;--paper:#f7f4ee;--line:#e4ded3;--brand:#0f3d3e;--brand2:#17595a;--accent:#e9a23b;--ok:#1f7a4d;--bad:#b3261e}\n*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;color:var(--ink);background:var(--paper)}\nheader{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:.75rem 1rem;background:var(--brand);color:#fff;z-index:5}\nheader b{font-size:1.05rem}\nmain{max-width:1000px;margin:0 auto;padding:1rem 1rem 3rem}\nh2{font-size:1.2rem;margin:0 0 .6rem}h3{font-size:1.02rem;margin:0 0 .5rem}\n.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:1rem;margin-bottom:.9rem}\nlabel{display:block;font-weight:600;font-size:.9rem;margin:.6rem 0 .25rem}\ninput,textarea{width:100%;font:inherit;padding:.65rem .75rem;border:1.5px solid var(--line);border-radius:11px;background:#fff}\ntextarea{min-height:70px;resize:vertical}\ninput:focus,textarea:focus{outline:none;border-color:var(--brand2)}\n.btn{display:inline-flex;justify-content:center;align-items:center;border:0;border-radius:11px;padding:.6rem 1rem;font:650 .95rem system-ui;cursor:pointer;background:var(--brand);color:#fff;min-height:42px}\n.btn.ghost{background:none;color:var(--brand);border:1.5px solid var(--line)}.btn.white{background:none;color:#fff;border:1.5px solid rgba(255,255,255,.35)}\n.btn.red{background:var(--bad)}.btn.block{width:100%}.btn.sm{padding:.35rem .75rem;min-height:34px;font-size:.88rem}\n.row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}\n.grid2{display:grid;gap:.6rem}@media(min-width:560px){.grid2{grid-template-columns:1fr 1fr}}\n.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem;margin-bottom:.9rem}@media(min-width:720px){.stats{grid-template-columns:repeat(4,1fr)}}\n.stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:.7rem .8rem}.stat .k{color:var(--muted);font-size:.78rem}.stat .v{font-size:1.4rem;font-weight:800;color:var(--brand)}\n.tabs{display:flex;gap:.35rem;overflow-x:auto;margin-bottom:.9rem;padding-bottom:2px}\n.tabs button{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:.45rem .9rem;font:600 .9rem system-ui;white-space:nowrap;cursor:pointer;color:var(--ink)}\n.tabs button.on{background:var(--brand);color:#fff;border-color:var(--brand)}\n.dot{background:var(--bad);color:#fff;border-radius:999px;font-size:.72rem;padding:0 .4rem;margin-left:.3rem}\n.urow{display:flex;justify-content:space-between;align-items:center;gap:.6rem;background:#fff;border:1px solid var(--line);border-radius:14px;padding:.7rem .85rem;margin-bottom:.5rem;cursor:pointer}\n.urow:hover{border-color:var(--brand2)}.urow.",
  "off{opacity:.55}\n.who{min-width:0;flex:1}.who b,.who span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.who span{color:var(--muted);font-size:.82rem}\n.cr{text-align:right;flex-shrink:0}.cr b{font-size:1.4rem;color:var(--brand)}\n.pill{display:inline-block;font-size:.72rem;font-weight:700;border-radius:999px;padding:.05rem .5rem;background:#eef2f1;color:var(--muted)}\n.pill.g{background:#e5f3eb;color:var(--ok)}.pill.a{background:#fbefd9;color:#7a4e0a}.pill.r{background:#fbe9e7;color:var(--bad)}\n.ev{background:#fff;border:1px solid var(--line);border-radius:12px;padding:.65rem .85rem;margin-bottom:.5rem;word-break:break-word}.ev.new{border-left:4px solid var(--accent)}\n.meta,.hint{color:var(--muted);font-size:.8rem}\n.msg{padding:.6rem .8rem;border-radius:11px;font-size:.92rem;margin:.5rem 0}.msg.bad{background:#fbe9e7;color:var(--bad)}.msg.info{background:#e6f0ef;color:var(--brand)}.msg.ok{background:#e5f3eb;color:var(--ok)}\n.sheetbg{position:fixed;inset:0;background:rgba(10,20,20,.45);z-index:20;display:flex;justify-content:flex-end}\n.sheet{background:var(--paper);width:min(560px,100%);height:100%;overflow-y:auto;padding:1rem 1rem 3rem}\n.bignum{font-size:2.6rem;font-weight:800;color:var(--brand);line-height:1}\n.code{font:700 1.05rem ui-monospace,Menlo,monospace;user-select:all}\nul{list-style:none;padding:0;margin:0}li{padding:.5rem 0;border-bottom:1px solid var(--line)}li:last-child{border:0}\n.switch{display:flex;gap:.5rem;align-items:center;font-weight:600;margin:.7rem 0}.switch input{width:auto}\ntable{width:100%;border-collapse:collapse;font-size:.86rem;background:#fff}th,td{text-align:left;padding:.5rem;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-size:.75rem;text-transform:uppercase}\n.tw{overflow-x:auto;border:1px solid var(--line);border-radius:12px}\n.toast{position:fixed;left:50%;bottom:1.2rem;transform:translate(-50%,150%);opacity:0;background:var(--ink);color:#fff;padding:.7rem 1rem;border-radius:12px;transition:.25s;max-width:90vw;pointer-events:none;z-index:40}\n.toast.show{transform:translate(-50%,0);opacity:1}\n</style>\n</head>\n<body>\n<header><b>Panel Busta Chiara</b><button class=\"btn white sm\" id=\"out\" style=\"display:none\">Salir</button></header>\n<main id=\"root\"></main>\n<div class=\"toast\" id=\"toast\"></div>\n<script>\n(function () {\n  var root = document.getElementById(\"root\");\n  var ERR = { bad_login: \"Contraseña incorrecta.\", no_admin: \"Falta el secreto ADMIN_PASSWORD en Cloudflare.\", limit: \"Demasiados intentos hoy.\",\n    bad_name: \"Nombre no válido.\", bad_email: \"Email no válido.\", bad_password: \"La contraseña debe tener al menos 6 caracteres.\", email_taken: \"Ese email ya tiene cuenta.\",\n    not_found: \"No encontrado.\", bad_code: \"Código no válido (formato BC-XXXX-XXXX-XXXX).\", bad_amount: \"Cantidad no válida.\", net: \"Sin conexión.\", no_kv: \"Falta el KV «LIMITS» en el Worker.\", server: \"Error del servidor.\" };\n  var em = function (e) { return ERR[e] || e || \"Error\"; };\n  fu",
  "nction esc(s) { return String(s == null ? \"\" : s).replace(/[&<>\"']/g, function (c) { return { \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", '\"': \"&quot;\", \"'\": \"&#39;\" }[c]; }); }\n  function fdate(s) { if (!s) return \"—\"; try { return new Date(s).toLocaleString(\"es-ES\", { dateStyle: \"short\", timeStyle: \"short\" }); } catch (e) { return s; } }\n  function toast(m) { var el = document.getElementById(\"toast\"); el.textContent = m; el.classList.add(\"show\"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove(\"show\"); }, 3000); }\n  function tok() { try { return localStorage.getItem(\"bc.admin\") || \"\"; } catch (e) { return \"\"; } }\n  function setTok(v) { try { if (v) localStorage.setItem(\"bc.admin\", v); else localStorage.removeItem(\"bc.admin\"); } catch (e) {} }\n  async function api(action, body) {\n    body = body || {}; body.action = action; body.admin = tok();\n    var d;\n    try { d = await (await fetch(location.origin + \"/\", { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify(body) })).json(); }\n    catch (e) { d = { ok: false, error: \"net\" }; }\n    if (d.error === \"admin_login\") { setTok(\"\"); login(); }\n    return d;\n  }\n\n  function login() {\n    document.getElementById(\"out\").style.display = \"none\";\n    root.innerHTML = '<form class=\"card\" id=\"lf\" style=\"max-width:420px;margin:2rem auto\"><h2>Entrar al panel</h2><label for=\"lp\">Contraseña del panel</label><input id=\"lp\" type=\"password\" autocomplete=\"current-password\"><div id=\"lm\"></div><br><button class=\"btn block\" type=\"submit\">Entrar</button></form>';\n    document.getElementById(\"lf\").onsubmit = async function (e) {\n      e.preventDefault();\n      var d = await api(\"admin_login\", { password: document.getElementById(\"lp\").value });\n      if (!d.ok) { document.getElementById(\"lm\").innerHTML = '<div class=\"msg bad\">' + esc(em(d.error)) + \"</div>\"; return; }\n      setTok(d.token); start();\n    };\n  }\n  document.getElementById(\"out\").onclick = function () { setTok(\"\"); login(); };\n\n  var tab = \"events\", stats = {}, unseen = 0;\n  var TABS = [[\"events\", \"Avisos\"], [\"accounts\", \"Cuentas\"], [\"codes\", \"Códigos\"], [\"sales\", \"Ventas\"], [\"traffic\", \"Uso GPL\"], [\"settings\", \"Ajustes\"]];\n  function tabsHtml() { return TABS.map(function (x) { return '<button data-t=\"' + x[0] + '\" class=\"' + (tab === x[0] ? \"on\" : \"\") + '\">' + x[1] + (x[0] === \"events\" && unseen ? '<span class=\"dot\">' + unseen + \"</span>\" : \"\") + \"</button>\"; }).join(\"\"); }\n  function bindTabs() { root.querySelectorAll(\"[data-t]\").forEach(function (b) { b.onclick = function () { tab = b.dataset.t; document.getElementById(\"tabs\").innerHTML = tabsHtml(); bindTabs(); draw(); }; }); }\n\n  async function start() {\n    document.getElementById(\"out\").style.display = \"\";\n    root.innerHTML = '<div id=\"warn\"></div><div class=\"stats\" id=\"stats\"></div><div class=\"tabs\" id=\"tabs\"></div><div id=\"tab\"></div>';\n    var s = await api(\"a_stats\"); if (!s.ok) return;\n    stats = s;\n    var w = [];\n    if (!s.pay) w.p",
  "ush(\"PayPal no está configurado (faltan PAYPAL_CLIENT_ID / PAYPAL_SECRET).\");\n    if (s.mode === \"sandbox\") w.push(\"PayPal está en modo <b>sandbox</b> (pagos de prueba).\");\n    if (!s.ai) w.push(\"Falta ANTHROPIC_API_KEY: la lectura avanzada no funcionará.\");\n    document.getElementById(\"warn\").innerHTML = w.map(function (x) { return '<div class=\"msg info\">' + x + \"</div>\"; }).join(\"\");\n    document.getElementById(\"stats\").innerHTML =\n      '<div class=\"stat\"><div class=\"k\">Cuentas</div><div class=\"v\">' + s.accounts + \"</div></div>\" +\n      '<div class=\"stat\"><div class=\"k\">Ventas PayPal</div><div class=\"v\">' + s.sales + \"</div></div>\" +\n      '<div class=\"stat\"><div class=\"k\">Paquete</div><div class=\"v\">' + s.pack + \" · \" + esc(String(s.price).replace(\".\", \",\")) + \" €</div></div>\" +\n      '<div class=\"stat\"><div class=\"k\">Gratis/día (móvil · familia)</div><div class=\"v\">' + s.free.per + \" · \" + s.free.perIp + \"</div></div>\";\n    document.getElementById(\"tabs\").innerHTML = tabsHtml(); bindTabs();\n    draw();\n  }\n  var trafficTimer = null;\n  function draw() { clearInterval(trafficTimer); var b = document.getElementById(\"tab\"); ({ events: tEvents, accounts: tAccounts, codes: tCodes, sales: tSales, traffic: tTraffic, settings: tSettings })[tab](b); }\n\n  /* Avisos */\n  async function tEvents(box) {\n    box.innerHTML = '<p class=\"hint\">Cargando…</p>';\n    var d = await api(\"a_events\"); if (!d.ok) return;\n    unseen = d.events.filter(function (e) { return e.new; }).length;\n    document.getElementById(\"tabs\").innerHTML = tabsHtml(); bindTabs();\n    var lab = { registro: '<span class=\"pill g\">Registro</span>', recarga: '<span class=\"pill a\">Recarga</span>', venta: '<span class=\"pill a\">Venta sin cuenta</span>' };\n    box.innerHTML = '<div class=\"row\" style=\"justify-content:space-between;margin-bottom:.5rem\"><h2 style=\"margin:0\">Avisos</h2>' + (unseen ? '<button class=\"btn ghost sm\" id=\"seen\">Marcar como leídos</button>' : \"\") + \"</div>\" +\n      (d.events.length ? d.events.map(function (e) { return '<div class=\"ev ' + (e.new ? \"new\" : \"\") + '\">' + (lab[e.type] || \"\") + ' <span class=\"meta\">' + esc(fdate(e.t)) + \"</span><div>\" + esc(e.msg) + \"</div>\" + (e.email ? '<button class=\"btn ghost sm\" style=\"margin-top:.4rem\" data-open=\"' + esc(e.email) + '\">Abrir cuenta</button>' : \"\") + \"</div>\"; }).join(\"\") : '<p class=\"hint\">Aún no hay avisos. Aquí verás cada registro y cada recarga con los datos del cliente.</p>');\n    var s = document.getElementById(\"seen\"); if (s) s.onclick = async function () { await api(\"a_seen\"); tEvents(box); };\n    box.querySelectorAll(\"[data-open]\").forEach(function (b) { b.onclick = function () { openAcct(b.dataset.open); }; });\n  }\n\n  /* Cuentas */\n  async function tAccounts(box) {\n    box.innerHTML = '<div class=\"row\" style=\"margin-bottom:.7rem\"><input id=\"q\" placeholder=\"Buscar nombre, email, teléfono o código\" style=\"flex:1;min-width:200px\"><button class=\"btn\" id=\"nu\">+ Nueva cuenta</button></div><div id=\"ul\"><p class=\"hint\">Cargan",
  "do…</p></div>';\n    async function list() {\n      var d = await api(\"a_accounts\", { q: document.getElementById(\"q\").value }); if (!d.ok) return;\n      var ul = document.getElementById(\"ul\");\n      ul.innerHTML = d.accounts.length ? d.accounts.map(function (a) {\n        return '<div class=\"urow ' + (a.active ? \"\" : \"off\") + '\" data-e=\"' + esc(a.email) + '\"><div class=\"who\"><b>' + esc(a.name) + (a.active ? \"\" : ' <span class=\"pill r\">Desactivada</span>') + \"</b><span>\" + esc(a.email) + (a.phone ? \" · \" + esc(a.phone) : \"\") + '</span><span class=\"code\" style=\"font-size:.8rem\">' + esc(a.code) + '</span></div><div class=\"cr\"><b>' + a.left + '</b><div class=\"hint\">lecturas</div></div></div>';\n      }).join(\"\") + (d.total > d.accounts.length ? '<p class=\"hint\">Mostrando ' + d.accounts.length + \" de \" + d.total + \". Usa el buscador.</p>\" : \"\") : '<p class=\"hint\">No hay cuentas.</p>';\n      ul.querySelectorAll(\"[data-e]\").forEach(function (el) { el.onclick = function () { openAcct(el.dataset.e); }; });\n    }\n    var deb; document.getElementById(\"q\").oninput = function () { clearTimeout(deb); deb = setTimeout(list, 300); };\n    document.getElementById(\"nu\").onclick = newAcct;\n    list();\n  }\n\n  function sheet(html) {\n    var bg = document.createElement(\"div\"); bg.className = \"sheetbg\"; bg.innerHTML = '<div class=\"sheet\">' + html + \"</div>\";\n    bg.onclick = function (e) { if (e.target === bg) bg.remove(); };\n    document.body.appendChild(bg);\n    bg.querySelectorAll(\"[data-x]\").forEach(function (b) { b.onclick = function () { bg.remove(); }; });\n    return bg;\n  }\n  function v(s, id) { return s.querySelector(\"#\" + id).value; }\n\n  function newAcct() {\n    var s = sheet('<div class=\"row\" style=\"justify-content:space-between\"><h2 style=\"margin:0\">Nueva cuenta</h2><button class=\"btn ghost sm\" data-x>Cerrar</button></div>' +\n      '<label>Nombre</label><input id=\"n\"><label>Email</label><input id=\"e\" type=\"email\"><label>Teléfono</label><input id=\"p\"><label>Contraseña (se la das al cliente)</label><input id=\"w\">' +\n      '<label>Lecturas iniciales</label><input id=\"c\" type=\"number\" min=\"0\" value=\"0\"><label>Notas internas</label><textarea id=\"o\"></textarea><div id=\"m\"></div><br><button class=\"btn block\" id=\"ok\">Crear cuenta</button>');\n    s.querySelector(\"#ok\").onclick = async function () {\n      var d = await api(\"a_create\", { name: v(s, \"n\"), email: v(s, \"e\"), phone: v(s, \"p\"), password: v(s, \"w\"), credits: v(s, \"c\"), notes: v(s, \"o\") });\n      if (!d.ok) { s.querySelector(\"#m\").innerHTML = '<div class=\"msg bad\">' + esc(em(d.error)) + \"</div>\"; return; }\n      s.remove(); toast(\"Cuenta creada\"); if (tab === \"accounts\") draw(); openAcct(d.email);\n    };\n  }\n\n  async function openAcct(email) {\n    var d = await api(\"a_get\", { email: email }); if (!d.ok) return toast(em(d.error));\n    var a = d.account;\n    var s = sheet('<div class=\"row\" style=\"justify-content:space-between\"><h2 style=\"margin:0\">' + esc(a.name) + '</h2><button class=\"btn ghost sm\" data-x>Cerrar</",
  "button></div>' +\n      '<p class=\"hint\">Cliente desde ' + esc(fdate(a.created)) + \" · Último acceso \" + esc(fdate(a.last)) + \"</p>\" +\n      '<div class=\"card\"><div class=\"hint\">Lecturas disponibles (no caducan)</div><div class=\"row\" style=\"justify-content:space-between\"><div class=\"bignum\" id=\"L\">' + a.left + '</div><div class=\"row\"><button class=\"btn ghost sm\" data-add=\"-1\">−1</button><button class=\"btn sm\" data-add=\"1\">+1</button><button class=\"btn sm\" data-add=\"5\">+5</button><button class=\"btn sm\" data-add=\"10\">+10</button></div></div>' +\n      '<div class=\"grid2\"><div><label>Fijar total exacto</label><input id=\"set\" type=\"number\" min=\"0\" placeholder=\"Ej.: 12\"></div><div><label>Motivo (opcional)</label><input id=\"why\" placeholder=\"Ej.: pago en efectivo\"></div></div><br><button class=\"btn sm\" id=\"setb\">Guardar total</button>' +\n      '<p class=\"hint\" style=\"margin-top:.7rem\">Código personal: <span class=\"code\">' + esc(a.code) + \"</span></p></div>\" +\n      '<div class=\"card\"><h3>Datos de la cuenta</h3><label>Nombre</label><input id=\"n\" value=\"' + esc(a.name) + '\"><label>Email (usuario de acceso)</label><input id=\"e\" type=\"email\" value=\"' + esc(a.email) + '\"><label>Teléfono</label><input id=\"p\" value=\"' + esc(a.phone) + '\">' +\n      '<label>Notas internas</label><textarea id=\"o\">' + esc(a.notes) + '</textarea><label>Nueva contraseña (vacío = no cambiar)</label><input id=\"w\" placeholder=\"Mínimo 6 caracteres\"><label class=\"switch\"><input type=\"checkbox\" id=\"on\" ' + (a.active ? \"checked\" : \"\") + \"> Cuenta activa (si la desactivas, su código deja de funcionar)</label>\" +\n      '<div id=\"m\"></div><button class=\"btn block\" id=\"sv\">Guardar cambios</button></div>' +\n      '<div class=\"card\"><h3>Recargas</h3>' + (d.history.length ? \"<ul>\" + d.history.map(function (h) { return \"<li><b>+\" + h.n + \"</b> · \" + esc(h.amount) + \" \" + esc(h.currency) + '<div class=\"meta\">' + esc(fdate(h.t)) + \" · pedido \" + esc(h.order) + \"</div></li>\"; }).join(\"\") + \"</ul>\" : '<p class=\"hint\">Sin recargas.</p>') + \"</div>\" +\n      '<div class=\"card\"><h3>Movimientos de lecturas</h3>' + (d.log.length ? \"<ul>\" + d.log.map(function (l) { return '<li><b style=\"color:' + (l.d >= 0 ? \"var(--ok)\" : \"var(--bad)\") + '\">' + (l.d >= 0 ? \"+\" : \"\") + l.d + \"</b> → \" + l.v + \" · \" + esc(l.r) + '<div class=\"meta\">' + esc(fdate(l.t)) + \"</div></li>\"; }).join(\"\") + \"</ul>\" : '<p class=\"hint\">Sin ajustes manuales.</p>') + \"</div>\" +\n      '<button class=\"btn red block\" id=\"del\">Eliminar cuenta</button>');\n    function after(n) { s.querySelector(\"#L\").textContent = n; toast(\"Ahora tiene \" + n + \" lecturas\"); if (tab === \"accounts\") draw(); }\n    s.querySelectorAll(\"[data-add]\").forEach(function (b) { b.onclick = async function () { var r = await api(\"a_credits\", { email: a.email, add: Number(b.dataset.add), reason: v(s, \"why\") }); if (!r.ok) return toast(em(r.error)); after(r.left); }; });\n    s.querySelector(\"#setb\").onclick = async function () { if (v(s, \"set\") === \"\") return toast(\"Escribe el t",
  "otal\"); var r = await api(\"a_credits\", { email: a.email, set: v(s, \"set\"), reason: v(s, \"why\") }); if (!r.ok) return toast(em(r.error)); after(r.left); };\n    s.querySelector(\"#sv\").onclick = async function () {\n      var body = { email: a.email, name: v(s, \"n\"), newEmail: v(s, \"e\"), phone: v(s, \"p\"), notes: v(s, \"o\"), active: s.querySelector(\"#on\").checked };\n      if (v(s, \"w\")) body.password = v(s, \"w\");\n      var r = await api(\"a_update\", body);\n      if (!r.ok) { s.querySelector(\"#m\").innerHTML = '<div class=\"msg bad\">' + esc(em(r.error)) + \"</div>\"; return; }\n      toast(\"Cambios guardados\"); s.remove(); if (tab === \"accounts\") draw();\n    };\n    s.querySelector(\"#del\").onclick = async function () {\n      if (!confirm(\"¿Eliminar la cuenta de \" + a.name + \"? Perderá sus \" + a.left + \" lecturas y su código dejará de funcionar. No se puede deshacer.\")) return;\n      var r = await api(\"a_delete\", { email: a.email }); if (!r.ok) return toast(em(r.error));\n      s.remove(); toast(\"Cuenta eliminada\"); if (tab === \"accounts\") draw();\n    };\n  }\n\n  /* Códigos sueltos (comprados sin cuenta o creados por ti) */\n  function tCodes(box) {\n    box.innerHTML = '<div class=\"card\"><h3>Buscar un código</h3><p class=\"hint\">Para códigos comprados sin cuenta (o cualquier código BC-…). Puedes ver y cambiar sus lecturas.</p><div class=\"row\"><input id=\"c\" placeholder=\"BC-XXXX-XXXX-XXXX\" style=\"flex:1;min-width:200px;text-transform:uppercase\"><button class=\"btn\" id=\"go\">Buscar</button></div><div id=\"r\"></div></div>' +\n      '<div class=\"card\"><h3>Crear un código nuevo</h3><p class=\"hint\">Útil si alguien te paga por otra vía (efectivo, Bizum…). Le das el código y lo pone en la app.</p><div class=\"grid2\"><div><label>Lecturas</label><input id=\"nc\" type=\"number\" min=\"0\" value=\"5\"></div><div><label>Motivo</label><input id=\"nr\" placeholder=\"Ej.: pago en efectivo\"></div></div><br><button class=\"btn\" id=\"mk\">Crear código</button><div id=\"nm\"></div></div>';\n    box.querySelector(\"#go\").onclick = async function () {\n      var code = box.querySelector(\"#c\").value.trim().toUpperCase();\n      var d = await api(\"a_code\", { code: code }), r = box.querySelector(\"#r\");\n      if (!d.ok) { r.innerHTML = '<div class=\"msg bad\">' + esc(em(d.error)) + \"</div>\"; return; }\n      r.innerHTML = '<div class=\"msg info\">Código <span class=\"code\">' + esc(d.code) + \"</span> · <b id=\\\"cl\\\">\" + d.left + \"</b> lecturas\" + (d.email ? \" · cuenta \" + esc(d.email) : \" · sin cuenta\") + (d.off ? ' · <span class=\"pill r\">Desactivado</span>' : \"\") + '</div><div class=\"row\"><button class=\"btn ghost sm\" data-a=\"-1\">−1</button><button class=\"btn sm\" data-a=\"1\">+1</button><button class=\"btn sm\" data-a=\"5\">+5</button><input id=\"cs\" type=\"number\" min=\"0\" placeholder=\"Total\" style=\"width:110px\"><button class=\"btn sm\" id=\"csb\">Fijar</button></div>';\n      r.querySelectorAll(\"[data-a]\").forEach(function (b) { b.onclick = async function () { var x = await api(\"a_credits\", { code: d.code, add: Number(b.dataset.a) }); i",
  "f (x.ok) { r.querySelector(\"#cl\").textContent = x.left; toast(\"Ahora: \" + x.left); } else toast(em(x.error)); }; });\n      r.querySelector(\"#csb\").onclick = async function () { var x = await api(\"a_credits\", { code: d.code, set: r.querySelector(\"#cs\").value }); if (x.ok) { r.querySelector(\"#cl\").textContent = x.left; toast(\"Ahora: \" + x.left); } else toast(em(x.error)); };\n    };\n    box.querySelector(\"#mk\").onclick = async function () {\n      var d = await api(\"a_newcode\", { credits: box.querySelector(\"#nc\").value, reason: box.querySelector(\"#nr\").value });\n      box.querySelector(\"#nm\").innerHTML = d.ok ? '<div class=\"msg ok\">Código creado: <span class=\"code\">' + esc(d.code) + \"</span> con \" + d.left + \" lecturas</div>\" : '<div class=\"msg bad\">' + esc(em(d.error)) + \"</div>\";\n    };\n  }\n\n  /* Ventas */\n  async function tSales(box) {\n    box.innerHTML = '<p class=\"hint\">Cargando…</p>';\n    var d = await api(\"a_sales\"); if (!d.ok) return;\n    box.innerHTML = d.sales.length ? '<div class=\"tw\"><table><thead><tr><th>Fecha</th><th>Importe</th><th>Cliente</th><th>Código</th><th>Embajadora</th></tr></thead><tbody>' +\n      d.sales.map(function (x) { return \"<tr><td>\" + esc(fdate(x.date)) + \"</td><td>\" + esc(x.amount) + \" \" + esc(x.currency) + \"</td><td>\" + (x.email ? esc(x.email) : '<span class=\"hint\">sin cuenta</span>') + (x.payer ? '<div class=\"hint\">PayPal: ' + esc(x.payer) + \"</div>\" : \"\") + '</td><td class=\"code\" style=\"font-size:.8rem\">' + esc(x.code) + \"</td><td>\" + esc(x.ref && x.ref !== \"direct\" ? x.ref : \"—\") + \"</td></tr>\"; }).join(\"\") + \"</tbody></table></div>\" : '<p class=\"hint\">Todavía no hay ventas.</p>';\n  }\n\n  /* Uso de las webs GPL */\n  var FLAG = function (c) { return c && c.length === 2 ? String.fromCodePoint.apply(null, c.toUpperCase().split(\"\").map(function (x) { return 127397 + x.charCodeAt(0); })) : \"🌐\"; };\n  async function tTraffic(box) {\n    if (!box.innerHTML || box.dataset.t !== \"1\") box.innerHTML = '<p class=\"hint\">Cargando…</p>';\n    box.dataset.t = \"1\";\n    var d = await api(\"a_traffic\"); if (!d.ok || tab !== \"traffic\") return;\n    var html = '<p class=\"hint\">Se actualiza solo cada minuto. «Conectados» = con la web abierta en los últimos 5 minutos. Sin cookies ni datos personales.</p>';\n    Object.keys(d.sites).forEach(function (k) {\n      var s = d.sites[k], h = s.hist, t = h[h.length - 1], max = Math.max(1, Math.max.apply(null, h.map(function (x) { return x.pv; })));\n      var week = h.slice(-7).reduce(function (a, x) { return a + x.u; }, 0);\n      html += '<div class=\"card\"><h2>' + esc(s.name) + '</h2>' +\n        '<div class=\"stats\" style=\"margin-bottom:.6rem\"><div class=\"stat\"><div class=\"k\">🟢 Conectados ahora</div><div class=\"v\">' + s.online + '</div></div>' +\n        '<div class=\"stat\"><div class=\"k\">Personas hoy</div><div class=\"v\">' + t.u + '</div></div>' +\n        '<div class=\"stat\"><div class=\"k\">Visitas hoy</div><div class=\"v\">' + t.pv + '</div></div>' +\n        '<div class=\"stat\"><div class=\"k\">Personas (7 día",
  "s)</div><div class=\"v\">' + week + '</div></div></div>' +\n        '<h3>Últimos 14 días</h3><div style=\"display:flex;align-items:flex-end;gap:3px;height:120px;border-bottom:1px solid var(--line);padding-top:16px\">' +\n        h.map(function (x) { var p = Math.round(x.pv / max * 100); return '<div title=\"' + esc(x.d) + \": \" + x.pv + \" visitas, \" + x.u + ' personas\" style=\"flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%\"><span style=\"font-size:.65rem;color:var(--muted)\">' + (x.pv || \"\") + '</span><div style=\"width:100%;height:' + p + '%;min-height:' + (x.pv ? 2 : 0) + 'px;background:var(--brand);border-radius:4px 4px 0 0\"></div></div>'; }).join(\"\") +\n        '</div><div class=\"row\" style=\"justify-content:space-between;font-size:.72rem;color:var(--muted)\"><span>' + esc(h[0].d.slice(5)) + '</span><span>hoy</span></div>' +\n        '<div class=\"grid2\" style=\"margin-top:.8rem\"><div><h3>Países hoy</h3>' + (s.countries.length ? \"<ul>\" + s.countries.map(function (c) { return \"<li>\" + FLAG(c[0]) + \" \" + esc(c[0]) + \" · <b>\" + c[1] + \"</b></li>\"; }).join(\"\") + \"</ul>\" : '<p class=\"hint\">Sin visitas hoy.</p>') + '</div>' +\n        '<div><h3>Dispositivos hoy</h3><ul><li>📱 Móvil · <b>' + s.mobile + '</b></li><li>💻 Ordenador · <b>' + s.desktop + '</b></li></ul></div></div></div>';\n    });\n    box.innerHTML = html;\n    clearInterval(trafficTimer);\n    trafficTimer = setInterval(function () { if (tab === \"traffic\" && document.visibilityState === \"visible\") tTraffic(box); }, 60000);\n  }\n\n  /* Ajustes */\n  function tSettings(box) {\n    box.innerHTML = '<div class=\"card\"><h3>Lecturas básicas gratis</h3><div class=\"grid2\"><div><label>Al día por persona / móvil</label><input id=\"a\" type=\"number\" min=\"0\" value=\"' + stats.free.per + '\"></div><div><label>Máximo al día por familia (misma wifi / IP)</label><input id=\"b\" type=\"number\" min=\"0\" value=\"' + stats.free.perIp + '\"></div></div><br><button class=\"btn\" id=\"sv\">Guardar</button></div>' +\n      '<div class=\"card\"><h3>Contraseña del panel</h3><p class=\"hint\">Se cambia en Cloudflare: tu Worker → Settings → Variables and Secrets → ADMIN_PASSWORD.</p></div>';\n    box.querySelector(\"#sv\").onclick = async function () {\n      var d = await api(\"a_settings\", { per: box.querySelector(\"#a\").value, perIp: box.querySelector(\"#b\").value });\n      if (d.ok) { stats.free = d.free; toast(\"Guardado\"); start(); } else toast(em(d.error));\n    };\n  }\n\n  if (tok()) start(); else login();\n})();\n</script>\n</body>\n</html>\n",
].join("");
const ACCOUNT_HTML = [
  "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#0f3d3e\">\n<title>Mi cuenta · Busta Chiara</title>\n<style>\n:root{--ink:#14211f;--muted:#5c6b68;--paper:#f7f4ee;--line:#e4ded3;--brand:#0f3d3e;--brand2:#17595a;--accent:#e9a23b;--ok:#1f7a4d;--bad:#b3261e}\n*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;color:var(--ink);background:var(--paper)}\nheader{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.75rem 1rem;background:var(--brand);color:#fff;z-index:5}\nheader b{font-size:1.08rem;white-space:nowrap}\n.lang{display:flex;background:rgba(255,255,255,.14);border-radius:999px;padding:2px}\n.lang button{border:0;background:none;color:#cfe3e1;font:600 .8rem system-ui;padding:.3rem .6rem;border-radius:999px;cursor:pointer}\n.lang button.on{background:#fff;color:var(--brand)}\nmain{max-width:560px;margin:0 auto;padding:1.1rem 1rem 3rem}\nh1{font-size:1.5rem;margin:.2rem 0 .4rem}h2{font-size:1.15rem;margin:0 0 .5rem}\n.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:1.1rem;margin-bottom:1rem;box-shadow:0 4px 16px rgba(20,33,31,.05)}\nlabel{display:block;font-weight:600;font-size:.92rem;margin:.7rem 0 .3rem}\ninput{width:100%;font:inherit;padding:.75rem .8rem;border:1.5px solid var(--line);border-radius:12px;background:#fff}\ninput:focus{outline:none;border-color:var(--brand2);box-shadow:0 0 0 3px rgba(23,89,90,.15)}\n.btn{display:inline-flex;justify-content:center;align-items:center;gap:.4rem;width:100%;border:0;border-radius:12px;padding:.85rem 1rem;font:650 1rem system-ui;cursor:pointer;background:var(--brand);color:#fff;text-decoration:none;min-height:48px;margin-top:.9rem}\n.btn.accent{background:var(--accent);color:#3b2a06}.btn.ghost{background:none;color:var(--brand);border:1.5px solid var(--line)}\n.btn:disabled{opacity:.55}\n.tabs{display:flex;background:#ebe6dc;border-radius:12px;padding:4px;margin-bottom:1rem}\n.tabs button{flex:1;border:0;background:none;font:600 .95rem system-ui;padding:.6rem;border-radius:9px;color:var(--muted);cursor:pointer}\n.tabs button.on{background:#fff;color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.08)}\n.msg{padding:.65rem .8rem;border-radius:12px;font-size:.93rem;margin-top:.8rem}\n.msg.bad{background:#fbe9e7;color:var(--bad)}.msg.ok{background:#e5f3eb;color:var(--ok)}.msg.info{background:#e6f0ef;color:var(--brand)}\n.big{font-size:3rem;font-weight:800;color:var(--brand);line-height:1}\n.code{font:700 1.3rem ui-monospace,Menlo,monospace;letter-spacing:.04em;background:#f2efe8;border:1.5px dashed var(--line);border-radius:12px;padding:.7rem;text-align:center;margin:.4rem 0;user-select:all}\n.hint{color:var(--muted);font-size:.88rem}\nul{list-style:none;padding:0;margin:0}li{padding:.6rem 0;border-bottom:1px solid var(--line)}li:last-child{border:0}\ndetails summa",
  "ry{cursor:pointer;font-weight:600}\n.toast{position:fixed;left:50%;bottom:1.2rem;transform:translate(-50%,150%);opacity:0;background:var(--ink);color:#fff;padding:.7rem 1rem;border-radius:12px;transition:.25s;max-width:90vw;pointer-events:none}\n.toast.show{transform:translate(-50%,0);opacity:1}\n</style>\n</head>\n<body>\n<header><b>Busta Chiara</b><div class=\"lang\"><button data-l=\"es\">ES</button><button data-l=\"it\">IT</button></div></header>\n<main id=\"app\"></main>\n<div class=\"toast\" id=\"toast\"></div>\n<script>\n(function () {\n  var APP_URL = \"__APP_URL__\", PACK = \"__PACK__\", PRICE = \"__PRICE__\";\n  var T = {\n    es: {\n      title: \"Mi cuenta\", login: \"Entrar\", register: \"Crear cuenta\", name: \"Nombre y apellido\", email: \"Email\", phone: \"Teléfono (opcional)\",\n      password: \"Contraseña\", pwHint: \"Mínimo 6 caracteres.\", intro: \"Con tu cuenta tienes tu código personal y tus lecturas avanzadas, que no caducan.\",\n      hello: \"Hola, {n}\", left: \"Lecturas avanzadas disponibles\", noExpiry: \"No caducan\", yourCode: \"Tu código personal\",\n      codeHint: \"Escríbelo una vez en la app Busta Chiara (Lectura avanzada → «Ya tengo un código») y tus lecturas funcionarán en ese móvil.\",\n      copy: \"Copiar código\", copied: \"Código copiado\", openApp: \"Abrir Busta Chiara con mi código\",\n      buy: \"Recargar {n} lecturas por {p} €\", buyHint: \"Pagas de forma segura con PayPal o tarjeta. Las lecturas se suman a tu cuenta al momento.\",\n      opening: \"Abriendo PayPal…\", paid: \"¡Pago completado! Se han sumado {n} lecturas. Ahora tienes {l}.\", pending: \"PayPal aún no ha confirmado el pago. Vuelve a abrir esta página en un minuto.\",\n      cancel: \"Pago cancelado. No se te ha cobrado nada.\", payErr: \"No se pudo abrir PayPal. Inténtalo de nuevo.\",\n      hist: \"Mis recargas\", noHist: \"Todavía no has recargado.\", changePw: \"Cambiar contraseña\", cur: \"Contraseña actual\", next: \"Nueva contraseña\", save: \"Guardar\", saved: \"Guardado\",\n      logout: \"Cerrar sesión\",\n      bad_name: \"Escribe tu nombre.\", bad_email: \"El email no es válido.\", bad_password: \"La contraseña debe tener al menos 6 caracteres.\",\n      email_taken: \"Ya existe una cuenta con ese email. Entra con tu contraseña.\", bad_login: \"Email o contraseña incorrectos.\",\n      disabled: \"Esta cuenta está desactivada. Contacta con Busta Chiara.\", limit: \"Demasiados intentos por hoy. Inténtalo mañana.\",\n      no_pay: \"Los pagos aún no están activados.\", net: \"Sin conexión. Inténtalo de nuevo.\", err: \"Algo ha fallado. Inténtalo de nuevo.\"\n    },\n    it: {\n      title: \"Il mio account\", login: \"Accedi\", register: \"Crea account\", name: \"Nome e cognome\", email: \"Email\", phone: \"Telefono (facoltativo)\",\n      password: \"Password\", pwHint: \"Almeno 6 caratteri.\", intro: \"Con il tuo account hai il tuo codice personale e le tue letture avanzate, che non scadono.\",\n      hello: \"Ciao, {n}\", left: \"Letture avanzate disponibili\", noExpiry: \"Non scadono\", yourCode: \"Il tuo codice personale\",\n      codeHint: \"Inseriscilo una volta nell'app Busta ",
  "Chiara (Lettura avanzata → «Ho già un codice») e le tue letture funzioneranno su quel telefono.\",\n      copy: \"Copia codice\", copied: \"Codice copiato\", openApp: \"Apri Busta Chiara con il mio codice\",\n      buy: \"Ricarica {n} letture per {p} €\", buyHint: \"Paghi in sicurezza con PayPal o carta. Le letture si aggiungono subito al tuo account.\",\n      opening: \"Apro PayPal…\", paid: \"Pagamento completato! Aggiunte {n} letture. Ora ne hai {l}.\", pending: \"PayPal non ha ancora confermato il pagamento. Riapri questa pagina tra un minuto.\",\n      cancel: \"Pagamento annullato. Non ti è stato addebitato nulla.\", payErr: \"Impossibile aprire PayPal. Riprova.\",\n      hist: \"Le mie ricariche\", noHist: \"Non hai ancora ricaricato.\", changePw: \"Cambia password\", cur: \"Password attuale\", next: \"Nuova password\", save: \"Salva\", saved: \"Salvato\",\n      logout: \"Esci\",\n      bad_name: \"Scrivi il tuo nome.\", bad_email: \"Email non valida.\", bad_password: \"La password deve avere almeno 6 caratteri.\",\n      email_taken: \"Esiste già un account con questa email. Accedi con la tua password.\", bad_login: \"Email o password errati.\",\n      disabled: \"Questo account è disattivato. Contatta Busta Chiara.\", limit: \"Troppi tentativi per oggi. Riprova domani.\",\n      no_pay: \"I pagamenti non sono ancora attivi.\", net: \"Nessuna connessione. Riprova.\", err: \"Qualcosa è andato storto. Riprova.\"\n    }\n  };\n  var qp = new URLSearchParams(location.search);\n  var lang = qp.get(\"lang\") || get(\"bc.lang\") || ((navigator.language || \"\").indexOf(\"it\") === 0 ? \"it\" : \"es\");\n  if (!T[lang]) lang = \"es\";\n  var app = document.getElementById(\"app\");\n  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }\n  function set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }\n  function t(k, o) { var s = T[lang][k] || T.es[k] || k; return o ? s.replace(/\\{(\\w)\\}/g, function (m, x) { return o[x] != null ? o[x] : m; }) : s; }\n  function esc(s) { return String(s == null ? \"\" : s).replace(/[&<>\"']/g, function (c) { return { \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", '\"': \"&quot;\", \"'\": \"&#39;\" }[c]; }); }\n  function toast(m) { var el = document.getElementById(\"toast\"); el.textContent = m; el.classList.add(\"show\"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove(\"show\"); }, 3500); }\n  function fdate(s) { try { return new Date(s).toLocaleString(lang === \"it\" ? \"it-IT\" : \"es-ES\", { dateStyle: \"medium\", timeStyle: \"short\" }); } catch (e) { return s; } }\n  function rnd(n) { var a = \"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789\", b = new Uint8Array(n), s = \"\"; crypto.getRandomValues(b); for (var i = 0; i < n; i++) s += a[b[i] % a.length]; return s; }\n  async function post(body) {\n    try {\n      var r = await fetch(location.origin + \"/\", { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify(body) });\n      return await r.json();\n    } catch (e) { return { o",
  "k: false, error: \"net\" }; }\n  }\n  function msg(id, kind, text) { var el = document.getElementById(id); if (el) el.innerHTML = text ? '<div class=\"msg ' + kind + '\">' + esc(text) + \"</div>\" : \"\"; }\n\n  document.querySelectorAll(\"[data-l]\").forEach(function (b) {\n    b.onclick = function () { lang = b.dataset.l; set(\"bc.lang\", lang); render(); };\n  });\n\n  var mode = qp.get(\"r\") === \"1\" ? \"reg\" : \"login\";\n  function authView() {\n    app.innerHTML =\n      '<h1>' + esc(t(\"title\")) + '</h1><p class=\"hint\">' + esc(t(\"intro\")) + \"</p>\" +\n      '<div class=\"tabs\"><button data-m=\"login\" class=\"' + (mode === \"login\" ? \"on\" : \"\") + '\">' + esc(t(\"login\")) + '</button><button data-m=\"reg\" class=\"' + (mode === \"reg\" ? \"on\" : \"\") + '\">' + esc(t(\"register\")) + \"</button></div>\" +\n      '<form class=\"card\" id=\"f\" novalidate>' +\n      (mode === \"reg\" ? '<label for=\"n\">' + esc(t(\"name\")) + '</label><input id=\"n\" autocomplete=\"name\">' : \"\") +\n      '<label for=\"e\">' + esc(t(\"email\")) + '</label><input id=\"e\" type=\"email\" autocomplete=\"email\">' +\n      (mode === \"reg\" ? '<label for=\"p\">' + esc(t(\"phone\")) + '</label><input id=\"p\" type=\"tel\" autocomplete=\"tel\">' : \"\") +\n      '<label for=\"w\">' + esc(t(\"password\")) + '</label><input id=\"w\" type=\"password\" autocomplete=\"' + (mode === \"reg\" ? \"new-password\" : \"current-password\") + '\">' +\n      (mode === \"reg\" ? '<div class=\"hint\">' + esc(t(\"pwHint\")) + \"</div>\" : \"\") +\n      '<div id=\"fm\"></div><button class=\"btn\" type=\"submit\">' + esc(mode === \"reg\" ? t(\"register\") : t(\"login\")) + \"</button></form>\";\n    app.querySelectorAll(\"[data-m]\").forEach(function (b) { b.onclick = function () { mode = b.dataset.m; authView(); }; });\n    document.getElementById(\"f\").onsubmit = async function (ev) {\n      ev.preventDefault();\n      var btn = ev.target.querySelector(\"button[type=submit]\"); btn.disabled = true;\n      var body = { action: mode === \"reg\" ? \"register\" : \"login\", email: val(\"e\"), password: val(\"w\") };\n      if (mode === \"reg\") { body.name = val(\"n\"); body.phone = val(\"p\"); }\n      var d = await post(body); btn.disabled = false;\n      if (!d.ok) return msg(\"fm\", \"bad\", t(d.error) || t(\"err\"));\n      set(\"bc.acct.tok\", d.token); dash();\n    };\n  }\n  function val(id) { var el = document.getElementById(id); return el ? el.value : \"\"; }\n\n  async function dash(note) {\n    var tok = get(\"bc.acct.tok\");\n    if (!tok) return authView();\n    var d = await post({ action: \"me\", token: tok });\n    if (!d.ok) { if (d.error === \"login\") { set(\"bc.acct.tok\", null); return authView(); } app.innerHTML = '<div class=\"msg bad\">' + esc(t(d.error)) + \"</div>\"; return; }\n    var a = d.account;\n    app.innerHTML =\n      '<h1>' + esc(t(\"hello\", { n: a.name })) + \"</h1>\" +\n      (note ? '<div class=\"msg ' + note[0] + '\">' + esc(note[1]) + \"</div><br>\" : \"\") +\n      '<div class=\"card\"><div class=\"hint\">' + esc(t(\"left\")) + \" · \" + esc(t(\"noExpiry\")) + '</div><div class=\"big\" id=\"left\">' + a.left + \"</div>\" +\n      '<button class=\"btn accent\" id=\"buy",
  "\">' + esc(t(\"buy\", { n: PACK, p: PRICE.replace(\".\", \",\") })) + '</button><div class=\"hint\" style=\"margin-top:.5rem\">' + esc(t(\"buyHint\")) + '</div><div id=\"bm\"></div></div>' +\n      '<div class=\"card\"><h2>' + esc(t(\"yourCode\")) + '</h2><div class=\"code\" id=\"code\">' + esc(a.code) + '</div><div class=\"hint\">' + esc(t(\"codeHint\")) + \"</div>\" +\n      '<button class=\"btn ghost\" id=\"copy\">' + esc(t(\"copy\")) + '</button><a class=\"btn\" href=\"' + esc(APP_URL) + \"?acceso=\" + encodeURIComponent(a.code) + '\">' + esc(t(\"openApp\")) + \"</a></div>\" +\n      '<div class=\"card\"><h2>' + esc(t(\"hist\")) + \"</h2>\" + (d.history.length ? \"<ul>\" + d.history.map(function (h) { return \"<li><b>+\" + h.n + \"</b> · \" + esc(h.amount) + \" \" + esc(h.currency) + '<div class=\"hint\">' + esc(fdate(h.t)) + \"</div></li>\"; }).join(\"\") + \"</ul>\" : '<p class=\"hint\">' + esc(t(\"noHist\")) + \"</p>\") + \"</div>\" +\n      '<div class=\"card\"><details><summary>' + esc(t(\"changePw\")) + '</summary><label>' + esc(t(\"cur\")) + '</label><input id=\"pc\" type=\"password\" autocomplete=\"current-password\"><label>' + esc(t(\"next\")) + '</label><input id=\"pn\" type=\"password\" autocomplete=\"new-password\"><button class=\"btn\" id=\"pws\">' + esc(t(\"save\")) + '</button></details></div>' +\n      '<button class=\"btn ghost\" id=\"out\">' + esc(t(\"logout\")) + \"</button>\";\n    document.getElementById(\"copy\").onclick = function () {\n      (navigator.clipboard ? navigator.clipboard.writeText(a.code) : Promise.reject()).then(function () { toast(t(\"copied\")); }, function () { toast(a.code); });\n    };\n    document.getElementById(\"out\").onclick = async function () { await post({ action: \"logout\", token: tok }); set(\"bc.acct.tok\", null); mode = \"login\"; authView(); };\n    document.getElementById(\"pws\").onclick = async function () {\n      var r = await post({ action: \"passwd\", token: tok, current: val(\"pc\"), next: val(\"pn\") });\n      toast(r.ok ? t(\"saved\") : t(r.error));\n    };\n    document.getElementById(\"buy\").onclick = async function () {\n      var btn = this, claim = rnd(28); btn.disabled = true; toast(t(\"opening\"));\n      set(\"bc.acct.claim\", JSON.stringify({ c: claim, t: Date.now(), left: a.left }));\n      var r = await post({ action: \"buy\", token: tok, claim: claim, ref: get(\"bc.ref\") || qp.get(\"ref\") || \"\", locale: lang === \"it\" ? \"it-IT\" : \"es-ES\" });\n      if (!r.ok || !r.url) { btn.disabled = false; set(\"bc.acct.claim\", null); return msg(\"bm\", \"bad\", t(r.error) !== r.error ? t(r.error) : t(\"payErr\")); }\n      location.href = r.url;\n    };\n  }\n\n  async function afterPaypal() {\n    var st = qp.get(\"paypal\"), claim = qp.get(\"claim\");\n    if (qp.get(\"ref\")) set(\"bc.ref\", qp.get(\"ref\"));\n    if (!st) return dash();\n    history.replaceState(null, \"\", location.pathname);\n    if (st !== \"ok\" || !claim) { set(\"bc.acct.claim\", null); return dash([\"info\", t(\"cancel\")]); }\n    app.innerHTML = '<div class=\"msg info\">' + esc(t(\"opening\").replace(\"PayPal…\", \"PayPal\")) + \"</div>\";\n    var r = await post({ action: \"claim\", claim: claim });\n  ",
  "  set(\"bc.acct.claim\", null);\n    if (r.ok) return dash([\"ok\", t(\"paid\", { n: PACK, l: r.left })]);\n    return dash([\"bad\", r.error === \"pending\" ? t(\"pending\") : t(\"err\")]);\n  }\n\n  function render() {\n    document.documentElement.lang = lang;\n    document.querySelectorAll(\"[data-l]\").forEach(function (b) { b.classList.toggle(\"on\", b.dataset.l === lang); });\n    if (get(\"bc.acct.tok\")) dash(); else authView();\n  }\n  document.querySelectorAll(\"[data-l]\").forEach(function (b) { b.classList.toggle(\"on\", b.dataset.l === lang); });\n  document.documentElement.lang = lang;\n  afterPaypal();\n})();\n</script>\n</body>\n</html>\n",
].join("");

/* ---------- entrada ---------- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const self = url.origin;
    const cors = origin === self ? {} : corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && origin !== self && !allowedOrigins(env).includes(origin)) return json({ ok: false, error: "origin" }, 403, cors);
    if (request.method === "GET" && /^\/admin\/?$/.test(url.pathname)) return page(ADMIN_HTML);
    if (request.method === "GET" && /^\/cuenta\/?$/.test(url.pathname)) return page(ACCOUNT_HTML.replace("__APP_URL__", APP_RETURN).replace("__PACK__", String(PACK_SIZE)).replace("__PRICE__", PACK_PRICE));
    if (request.method === "GET") return json({ ok: true, ai: !!env.ANTHROPIC_API_KEY, limits: !!env.LIMITS, locked: env.OPEN !== "1", pay: !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET), mode: env.PAYPAL_MODE === "sandbox" ? "sandbox" : "live" }, 200, cors);
    if (request.method !== "POST") return json({ ok: false, error: "method" }, 405, cors);

    const len = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (len > MAX_BODY_BYTES) return json({ ok: false, error: "too_big" }, 413, cors);

    let body = null;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: "bad" }, 400, cors); }
    if (!body || typeof body !== "object") return json({ ok: false, error: "bad" }, 400, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    try {
      if (body.action === "track") return await actionTrack(body, env, request, cors);
      if (body.action === "buy") return await actionBuy(body, env, ip, cors, self);
      if (ACCOUNT_ACTIONS[body.action]) return env.LIMITS ? await ACCOUNT_ACTIONS[body.action](body, env, ip, cors) : json({ ok: false, error: "no_kv" }, 503, cors);
      if (typeof body.action === "string" && (body.action.startsWith("a_") || body.action === "admin_login")) return env.LIMITS ? await adminAction(body, env, ip, cors) : json({ ok: false, error: "no_kv" }, 503, cors);
      if (body.action === "claim") return await actionClaim(body, env, ip, cors);
      const acc = await access(body, env);
      if (body.action === "check") return acc ? json({ ok: true, left: acc.master ? -1 : acc.left }, 200, cors) : json({ ok: false, error: "locked" }, 401, cors);
      if (body.action === "free") return await actionFree(body, env, ip, cors, acc);
      if (body.action === "sales") return acc && acc.master && env.LIMITS ? await actionSales(env, cors) : json({ ok: false, error: "locked" }, 401, cors);
      if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: "disabled" }, 503, cors);
      if (body.action === "read") return await actionRead(body, env, ip, cors, acc);
      if (body.action === "ui") return await actionUi(body, env, ip, cors, acc);
    } catch (e) {
      return json({ ok: false, error: "server", message: str(e && e.message, 200) }, 500, cors);
    }
    return json({ ok: false, error: "bad" }, 400, cors);
  },
};
