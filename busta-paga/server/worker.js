/* Busta Chiara · servidor intermedio (Cloudflare Worker)
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
   Enlace KV (Settings → Bindings → KV namespace), nombre de variable:  LIMITS
     Sin KV no hay límites por persona ni por día: ¡ponlo!
*/

const DEFAULT_ORIGINS = [
  "https://pronfutray.github.io", // la web
  "https://localhost",            // app Android (APK)
  "http://localhost",
  "capacitor://localhost",
];

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

async function actionRead(body, env, ip, cors) {
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
  if (!(await bump(env, "all:" + day, parseInt(env.GLOBAL_DAILY || "40", 10)))) return json({ ok: false, error: "limit_global" }, 429, cors);
  if (!(await bump(env, "ip:" + ip + ":" + day, parseInt(env.PER_IP_DAILY || "8", 10)))) return json({ ok: false, error: "limit" }, 429, cors);

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
  return json({ ok: true, result }, 200, cors);
}

async function actionUi(body, env, ip, cors) {
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
  return json({ ok: true, strings: out }, 200, cors);
}

/* ---------- entrada ---------- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && !allowedOrigins(env).includes(origin)) return json({ ok: false, error: "origin" }, 403, cors);
    if (request.method === "GET") return json({ ok: true, ai: !!env.ANTHROPIC_API_KEY, limits: !!env.LIMITS }, 200, cors);
    if (request.method !== "POST") return json({ ok: false, error: "method" }, 405, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: "disabled" }, 503, cors);

    const len = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (len > MAX_BODY_BYTES) return json({ ok: false, error: "too_big" }, 413, cors);

    let body = null;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: "bad" }, 400, cors); }
    if (!body || typeof body !== "object") return json({ ok: false, error: "bad" }, 400, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    try {
      if (body.action === "read") return await actionRead(body, env, ip, cors);
      if (body.action === "ui") return await actionUi(body, env, ip, cors);
    } catch (e) {
      return json({ ok: false, error: "server" }, 500, cors);
    }
    return json({ ok: false, error: "bad" }, 400, cors);
  },
};
