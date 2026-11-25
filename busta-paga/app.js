/* Busta Chiara · app (UI, i18n, lectura de PDF/foto). Todo en el dispositivo. */
(function () {
"use strict";
var $ = function (id) { return document.getElementById(id); };

/* ============================ TEXTOS IT / ES ============================ */
var T = {
it: {
  tag: "Capisci la tua busta paga in 1 minuto",
  up_title: "Carica la tua busta paga", up_sub: "Una foto o il PDF: ti spiego ogni voce in parole semplici.",
  bPhoto: "Scatta una foto", bFile: "Scegli foto o PDF", drop: "oppure trascina qui il file",
  bDemo: "Prova con un esempio", priv: "Privato: l'analisi avviene sul tuo telefono. Nessun file viene inviato online.",
  anon: "Copia testo per assistenza (senza dati personali)",
  prog_t: "Lettura in corso", st_lib: "Preparo il lettore (solo la prima volta)…", st_pdf: "Leggo il PDF…", st_ocr: "Riconosco il testo",
  st_ocr2: "Provo una seconda lettura…", st_an: "Analizzo la busta…",
  err_read: "Non sono riuscito a leggere il file. Prova con una foto più nitida o con il PDF originale.",
  err_lib: "Il lettore non è disponibile. Controlla la connessione e riprova.",
  pw_t: "PDF protetto", pw_p: "Inserisci la password (spesso è il tuo codice fiscale).", pw_bad: "Password errata, riprova.", pw_ok: "Apri", pw_no: "Annulla",
  disc: "Lettura automatica: può contenere errori. Confronta sempre con la tua busta e, per dubbi, chiedi al consulente del lavoro, al patronato o al sindacato.",
  again: "Analizza un'altra busta", copy: "Copia riepilogo", share: "Condividi", copied: "Riepilogo copiato",
  brief: "In breve",
  low_t: "Lettura incompleta", low_p: "Ho trovato pochi dati. Per un risultato migliore: foto dritta, ben illuminata e con tutta la pagina visibile; meglio ancora il PDF originale.",
  hero_net: "Netto in busta", hero_gross: "Lordo", hero_ded: "Trattenute",
  sec_where: "Dove va il tuo stipendio", sec_ferie: "Ferie e permessi", sec_days: "Giorni e ore", sec_pay: "Cosa ti pagano", sec_inps: "Contributi e pensione",
  sec_tax: "Tasse", sec_other: "Altro in busta", sec_check: "Controllo dei conti", sec_nf: "Non trovato", sec_txt: "Testo letto",
  nf_p: "Queste voci non sono state trovate (potrebbero non esserci o essere scritte in modo diverso):",
  txt_p: "Puoi correggere il testo e rianalizzare.", reparse: "Analizza di nuovo",
  net: "Netto", inps_s: "INPS", tax_s: "Tasse", oth_s: "Altro",
  where_h: "Su 100 € lordi, ti arrivano:",
  m: ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],
  d: "gg", h: "ore",
  prev: "Residuo anno scorso", mat: "Maturate", god: "Godute", sal: "Saldo", used_of: "usate su",
  ferie_t: "Ferie", ferie_h: "Giorni di riposo pagati.", rol_t: "Permessi ROL", rol_h: "Ore di permesso pagate, da usare quando vuoi.",
  exf_t: "Ex festività", exf_h: "Ore di permesso al posto di vecchie festività.",
  gg_lav: "Giorni lavorati", gg_lav_h: "Giorni di lavoro effettivo.", gg_retr: "Giorni pagati", gg_retr_h: "Include ferie, festivi e malattia pagata.",
  gg_inps: "Giorni per la pensione", gg_inps_h: "Contano per i tuoi anni di contributi.", ore_ord: "Ore ordinarie", ore_ord_h: "Ore normali di lavoro pagate.",
  ferie_mese: "Ferie godute nel mese", ferie_mese_h: "Giorni di ferie usati e pagati questo mese.",
  straord: "Straordinari", straord_h: "Ore extra, pagate con maggiorazione.",
  assenze: "Assenze e ore tolte", assenze_h: "Se non sono retribuite, vengono tolte dallo stipendio.",
  paga_base: "Paga base", paga_base_h: "Stipendio previsto dal contratto.", scatti: "Scatti di anzianità", scatti_h: "Aumenti per gli anni di servizio.",
  superminimo: "Superminimo", superminimo_h: "Extra concordato oltre il contratto.", contingenza: "Contingenza", contingenza_h: "Parte fissa dello stipendio, già consolidata.",
  inps: "Contributi INPS (tuoi)", inps_h: "Li versi per pensione, malattia e disoccupazione.", inps_rate: "Percentuale INPS", inps_rate_h: "Quota del tuo lordo imponibile.",
  inps_imp: "Base per i contributi", inps_imp_h: "Importo su cui si calcolano i contributi.", inps_az: "Contributi dell'azienda", inps_az_h: "Li paga l'azienda per te, in più.",
  fondo: "Fondo pensione", fondo_h: "Versamento extra per la pensione complementare.",
  tfr_mese: "TFR del mese", tfr_mese_h: "Liquidazione accantonata: la ricevi a fine rapporto.", tfr_fondo: "TFR accumulato", tfr_fondo_h: "Totale messo da parte finora.",
  pension_note: "Per la pensione si versa in totale circa il 33% del lordo: circa il 9% lo paghi tu, il resto l'azienda.",
  imp_fisc: "Base per le tasse", imp_fisc_h: "Importo su cui si calcola l'IRPEF.", irpef_lorda: "IRPEF lorda", irpef_lorda_h: "Imposta calcolata prima degli sconti.",
  detr: "Detrazioni", detr_h: "Sconti fiscali per lavoro e famiglia.", irpef_netta: "IRPEF trattenuta", irpef_netta_h: "Imposta sul reddito davvero trattenuta.",
  add_reg: "Addizionale regionale", add_reg_h: "Tassa della tua Regione.", add_com: "Addizionale comunale", add_com_h: "Tassa del tuo Comune.",
  r13: "Rateo tredicesima", r14: "Rateo quattordicesima", r_h: "Parte mensile della mensilità aggiuntiva.",
  anf: "Assegno nucleo familiare", anf_h: "Aiuto per la famiglia, pagato per conto INPS.",
  bonus: "Bonus, premi e indennità", bonus_h: "Importi extra oltre allo stipendio.", tratt: "Altre trattenute", tratt_h: "Sindacato, prestiti, anticipi…",
  chk_ok: "I conti tornano: competenze − trattenute = netto.", chk_bad: "Differenza di {x} € tra i totali e il netto: può essere conguaglio, rimborsi o arrotondamenti.",
  b_net: "Dai {l} € lordi ricevi {n} € ({p}%).", b_ferie: "Hai ancora {n} {u} di ferie da usare.", b_rol: "Permessi ROL ancora disponibili: {n} {u}.",
  b_pens: "Questo mese per la tua pensione: circa {t} € (tu {a} € + azienda {b} €).", b_pens_est: "(stima)",
  nf_netto: "netto", nf_lordo: "lordo", nf_tratt: "totale trattenute", nf_inps: "contributi INPS", nf_irpef: "IRPEF", nf_ferie: "ferie e permessi",
  sum_title: "Riepilogo busta paga"
},
es: {
  tag: "Entiende tu busta paga en 1 minuto",
  up_title: "Sube tu busta paga", up_sub: "Una foto o el PDF: te explico cada concepto con palabras sencillas.",
  bPhoto: "Hacer una foto", bFile: "Elegir foto o PDF", drop: "o arrastra aquí el archivo",
  bDemo: "Prueba con un ejemplo", priv: "Privado: el análisis se hace en tu móvil. Ningún archivo se envía a internet.",
  anon: "Copiar texto para soporte (sin datos personales)",
  prog_t: "Leyendo", st_lib: "Preparo el lector (solo la primera vez)…", st_pdf: "Leyendo el PDF…", st_ocr: "Reconociendo el texto",
  st_ocr2: "Pruebo una segunda lectura…", st_an: "Analizando la busta…",
  err_read: "No he podido leer el archivo. Prueba con una foto más nítida o con el PDF original.",
  err_lib: "El lector no está disponible. Revisa la conexión e inténtalo de nuevo.",
  pw_t: "PDF protegido", pw_p: "Escribe la contraseña (a menudo es tu codice fiscale).", pw_bad: "Contraseña incorrecta, inténtalo de nuevo.", pw_ok: "Abrir", pw_no: "Cancelar",
  disc: "Lectura automática: puede tener errores. Compárala siempre con tu busta y, si tienes dudas, consulta al asesor laboral, al patronato o al sindicato.",
  again: "Analizar otra busta", copy: "Copiar resumen", share: "Compartir", copied: "Resumen copiado",
  brief: "En breve",
  low_t: "Lectura incompleta", low_p: "He encontrado pocos datos. Para un mejor resultado: foto recta, bien iluminada y con toda la página visible; mejor aún, el PDF original.",
  hero_net: "Neto en tu cuenta (netto)", hero_gross: "Bruto (lordo)", hero_ded: "Descuentos",
  sec_where: "Adónde va tu sueldo", sec_ferie: "Vacaciones y permisos", sec_days: "Días y horas", sec_pay: "Qué te pagan", sec_inps: "Cotizaciones y pensión",
  sec_tax: "Impuestos", sec_other: "Otros conceptos", sec_check: "Comprobación de cuentas", sec_nf: "No encontrado", sec_txt: "Texto leído",
  nf_p: "No he encontrado estos datos (puede que no existan o estén escritos de otra forma):",
  txt_p: "Puedes corregir el texto y volver a analizar.", reparse: "Analizar de nuevo",
  net: "Neto", inps_s: "INPS", tax_s: "Impuestos", oth_s: "Otros",
  where_h: "De cada 100 € brutos, te llegan:",
  m: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
  d: "días", h: "horas",
  prev: "Sobrante año pasado", mat: "Acumuladas", god: "Disfrutadas", sal: "Saldo", used_of: "usadas de",
  ferie_t: "Vacaciones (ferie)", ferie_h: "Días de descanso pagados.", rol_t: "Permisos ROL", rol_h: "Horas de permiso pagadas, para usar cuando quieras.",
  exf_t: "Ex festividades", exf_h: "Horas de permiso que sustituyen antiguos festivos.",
  gg_lav: "Días trabajados", gg_lav_h: "Días de trabajo efectivo.", gg_retr: "Días pagados", gg_retr_h: "Incluye vacaciones, festivos y baja pagada.",
  gg_inps: "Días para la pensión", gg_inps_h: "Cuentan para tus años cotizados.", ore_ord: "Horas ordinarias", ore_ord_h: "Horas normales de trabajo pagadas.",
  ferie_mese: "Vacaciones disfrutadas este mes", ferie_mese_h: "Días de vacaciones usados y pagados este mes.",
  straord: "Horas extra (straordinari)", straord_h: "Horas extra, pagadas con recargo.",
  assenze: "Ausencias y horas descontadas", assenze_h: "Si no son pagadas, se descuentan del sueldo.",
  paga_base: "Sueldo base", paga_base_h: "Sueldo fijado por el convenio.", scatti: "Antigüedad (scatti)", scatti_h: "Aumentos por años en la empresa.",
  superminimo: "Superminimo", superminimo_h: "Extra pactado por encima del convenio.", contingenza: "Contingenza", contingenza_h: "Parte fija del sueldo, ya consolidada.",
  inps: "Cotización INPS (tuya)", inps_h: "La pagas para pensión, baja y paro.", inps_rate: "Porcentaje INPS", inps_rate_h: "Parte de tu bruto sujeto a cotización.",
  inps_imp: "Base de cotización", inps_imp_h: "Importe sobre el que se calcula la cotización.", inps_az: "Cotización de la empresa", inps_az_h: "La paga la empresa por ti, aparte.",
  fondo: "Fondo de pensiones", fondo_h: "Aportación extra para la pensión complementaria.",
  tfr_mese: "TFR del mes (finiquito)", tfr_mese_h: "Indemnización que se acumula: la cobras al terminar el contrato.", tfr_fondo: "TFR acumulado", tfr_fondo_h: "Total guardado hasta ahora.",
  pension_note: "Para la pensión se cotiza en total cerca del 33 % del bruto: tú pagas cerca del 9 %, el resto la empresa.",
  imp_fisc: "Base para impuestos", imp_fisc_h: "Importe sobre el que se calcula el IRPEF.", irpef_lorda: "IRPEF bruta", irpef_lorda_h: "Impuesto calculado antes de deducciones.",
  detr: "Deducciones", detr_h: "Descuentos fiscales por trabajo y familia.", irpef_netta: "IRPEF retenido", irpef_netta_h: "Impuesto sobre la renta realmente retenido.",
  add_reg: "Adicional regional", add_reg_h: "Impuesto de tu región.", add_com: "Adicional municipal", add_com_h: "Impuesto de tu municipio.",
  r13: "Prorrata paga extra 13ª", r14: "Prorrata paga extra 14ª", r_h: "Parte mensual de la paga extra.",
  anf: "Subsidio familiar (ANF)", anf_h: "Ayuda familiar, pagada por cuenta del INPS.",
  bonus: "Bonus, premios y pluses", bonus_h: "Importes extra además del sueldo.", tratt: "Otros descuentos", tratt_h: "Sindicato, préstamos, anticipos…",
  chk_ok: "Las cuentas cuadran: ingresos − descuentos = neto.", chk_bad: "Diferencia de {x} € entre los totales y el neto: puede ser regularización, reembolsos o redondeos.",
  b_net: "De {l} € brutos recibes {n} € ({p} %).", b_ferie: "Aún tienes {n} {u} de vacaciones por usar.", b_rol: "Permisos ROL aún disponibles: {n} {u}.",
  b_pens: "Este mes para tu pensión: unos {t} € (tú {a} € + empresa {b} €).", b_pens_est: "(estimación)",
  nf_netto: "neto", nf_lordo: "bruto", nf_tratt: "total descuentos", nf_inps: "cotización INPS", nf_irpef: "IRPEF", nf_ferie: "vacaciones y permisos",
  sum_title: "Resumen de la busta paga"
}};

var LANG = "it";
try { LANG = localStorage.getItem("bc.lang") || ((navigator.language || "it").slice(0, 2) === "es" ? "es" : "it"); } catch (e) {}
function t(k) { var x = T[LANG][k]; return x !== undefined ? x : (T.it[k] !== undefined ? T.it[k] : k); }
function fill(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); }
function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

var LOC = function () { return LANG === "es" ? "es-ES" : "it-IT"; };
function num(n, d) { return Number(n).toLocaleString(LOC(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" }); }
function eur(n) { return num(n, 2) + " €"; }
function qty(n, u) { var d = Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2; return num(n, d) + (u ? " " + t(u) : ""); }

var last = null, lastText = "";

/* ============================ IDIOMA ============================ */
function applyLang() {
  document.documentElement.lang = LANG;
  ["tag", "up_title", "up_sub", "bPhoto", "bFile", "drop", "bDemo", "priv", "prog_t", "disc", "pw_t", "pw_p"].forEach(function (k) { var e = $(k); if (e) e.textContent = t(k); });
  $("bCancel").textContent = t("pw_no");
  $("pwOk").textContent = t("pw_ok"); $("pwNo").textContent = t("pw_no");
  $("l-it").classList.toggle("on", LANG === "it"); $("l-es").classList.toggle("on", LANG === "es");
  document.title = "Busta Chiara · " + t("tag");
  if (last) render(last);
}
function setLang(l) { LANG = l; try { localStorage.setItem("bc.lang", l); } catch (e) {} applyLang(); }
$("l-it").onclick = function () { setLang("it"); };
$("l-es").onclick = function () { setLang("es"); };

function toast(m) { var e = $("toast"); e.textContent = m; e.classList.add("show"); setTimeout(function () { e.classList.remove("show"); }, 2200); }

/* ============================ MOTORES (PDF + OCR) ============================ */
var LIBS = {
  pdf: ["vendor/pdf.min.js", "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"],
  tess: ["vendor/tesseract.min.js", "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"]
};
var loaded = {};
function withTimeout(p, ms) {
  return new Promise(function (res, rej) {
    var tm = setTimeout(function () { rej(new Error("timeout")); }, ms);
    p.then(function (v) { clearTimeout(tm); res(v); }, function (e) { clearTimeout(tm); rej(e); });
  });
}
function loadScript(list, globalName) {
  return new Promise(function (resolve, reject) {
    var i = 0;
    (function next() {
      if (i >= list.length) return reject(new Error("lib"));
      var src = list[i++], s = document.createElement("script"), done = false;
      var fail = function () { if (done) return; done = true; s.remove(); next(); };
      var tm = setTimeout(fail, 20000);
      s.src = src;
      s.onload = function () { if (done) return; clearTimeout(tm); if (globalName && !window[globalName]) { fail(); return; } done = true; resolve(src); };
      s.onerror = function () { clearTimeout(tm); fail(); };
      document.head.appendChild(s);
    })();
  });
}
function abs(p) { return new URL(p, location.href).href; }

function loadPdf() {
  if (loaded.pdf) return loaded.pdf;
  loaded.pdf = loadScript(LIBS.pdf, "pdfjsLib").then(function (src) {
    var local = src.indexOf("vendor/") === 0;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = local ? abs("vendor/pdf.worker.min.js") : "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    return window.pdfjsLib;
  }).catch(function (e) { loaded.pdf = null; throw e; });
  return loaded.pdf;
}

var progressCb = function () {};
var libCb = function () {};
var workerP = null;
function tessLogger(m) { if (m.status === "recognizing text") progressCb(m.progress); else libCb(m); }
function createGuarded(opts, ms) {
  return new Promise(function (resolve, reject) {
    var timer, done = false, lg = opts.logger;
    function arm() { clearTimeout(timer); timer = setTimeout(function () { if (!done) { done = true; reject(new Error("timeout")); } }, ms); }
    opts.logger = function (m) { arm(); lg(m); };
    arm();
    window.Tesseract.createWorker("ita", 1, opts).then(function (w) {
      if (done) { try { w.terminate(); } catch (e) {} return; }
      done = true; clearTimeout(timer); resolve(w);
    }, function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } });
  });
}
function getWorker() {
  if (workerP) return workerP;
  workerP = loadScript(LIBS.tess, "Tesseract").then(async function (src) {
    var attempts = [];
    /* 1) todo local (APK) */
    if (src.indexOf("vendor/") === 0) attempts.push({ workerPath: abs("vendor/worker.min.js"), corePath: abs("vendor/core/"), langPath: abs("vendor/lang/") });
    /* 2) motor online + idioma italiano incluido en la app (ligero) */
    attempts.push({ langPath: abs("vendor/lang/") });
    /* 3) todo online */
    attempts.push({});
    var lastErr;
    for (var i = 0; i < attempts.length; i++) {
      try {
        var o = Object.assign({ logger: tessLogger }, attempts[i]);
        return await createGuarded(o, 45000);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("lib");
  }).catch(function (e) { workerP = null; throw e; });
  return workerP;
}
async function ocrCanvas(cv, psm) {
  var w = await getWorker();
  await w.setParameters({ tessedit_pageseg_mode: String(psm || 6), preserve_interword_spaces: "1", user_defined_dpi: "300" });
  var r = await w.recognize(cv);
  return r.data.text || "";
}

function loadImage(file) {
  return new Promise(function (res, rej) {
    var u = URL.createObjectURL(file), im = new Image();
    im.onload = function () { res(im); }; im.onerror = rej; im.src = u;
  });
}
async function fileToCanvas(file) {
  var src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { src = await loadImage(file); }
  var w = src.width, h = src.height, mx = Math.max(w, h), sc = 1;
  if (mx > 2600) sc = 2600 / mx; else if (mx < 1600) sc = 1600 / mx;
  var cv = document.createElement("canvas"); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
  var ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, cv.width, cv.height);
  enhance(ctx, cv.width, cv.height);
  return cv;
}
function enhance(ctx, w, h) {
  var im = ctx.getImageData(0, 0, w, h), d = im.data, hist = new Uint32Array(256), i, g;
  for (i = 0; i < d.length; i += 4) { g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; hist[g]++; }
  var total = w * h, acc = 0, lo = 0, hi = 255;
  for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
  acc = 0; for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.2) { hi = i; break; } }
  if (hi - lo < 40) { lo = 0; hi = 255; }
  var k = 255 / (hi - lo);
  for (i = 0; i < d.length; i += 4) { g = (d[i] - lo) * k; g = g < 0 ? 0 : g > 255 ? 255 : g; d[i] = d[i + 1] = d[i + 2] = g; }
  ctx.putImageData(im, 0, 0);
}

function itemsToLines(items) {
  var rows = [];
  items.forEach(function (it) {
    if (!it.str || !it.str.trim()) return;
    var y = it.transform[5], x = it.transform[4], row = null;
    for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) <= 3) { row = rows[i]; break; }
    if (!row) { row = { y: y, it: [] }; rows.push(row); }
    row.it.push({ x: x, w: it.width || 0, s: it.str });
  });
  rows.sort(function (a, b) { return b.y - a.y; });
  return rows.map(function (r) {
    r.it.sort(function (a, b) { return a.x - b.x; });
    var s = "", end = null;
    r.it.forEach(function (p) { if (end !== null) { var gap = p.x - end; s += gap > 12 ? "   " : gap > 1 ? " " : ""; } s += p.s; end = p.x + p.w; });
    return s;
  }).join("\n");
}

var pwResolve = null;
function askPassword(wrong) {
  return new Promise(function (res) {
    pwResolve = res; $("pw_p").textContent = wrong ? t("pw_bad") : t("pw_p");
    $("pwIn").value = ""; $("pwModal").classList.add("show"); setTimeout(function () { $("pwIn").focus(); }, 50);
  });
}
$("pwOk").onclick = function () { $("pwModal").classList.remove("show"); if (pwResolve) pwResolve($("pwIn").value); pwResolve = null; };
$("pwNo").onclick = function () { $("pwModal").classList.remove("show"); if (pwResolve) pwResolve(null); pwResolve = null; };
$("pwIn").addEventListener("keydown", function (e) { if (e.key === "Enter") $("pwOk").click(); });

async function extractPdf(file, status, psm) {
  var lib = await loadPdf();
  var buf = await file.arrayBuffer();
  var task = lib.getDocument({ data: buf });
  var tries = 0;
  task.onPassword = function (cb, reason) {
    askPassword(reason === 2 || tries++ > 0).then(function (pw) { if (pw === null) { task.destroy(); } else cb(pw); });
  };
  var pdf = await task.promise;
  var out = [], n = Math.min(pdf.numPages, 4);
  for (var p = 1; p <= n; p++) {
    var page = await pdf.getPage(p);
    var tc = await page.getTextContent();
    var txt = itemsToLines(tc.items);
    if (txt.replace(/\s/g, "").length < 40) {
      status(t("st_ocr"), 0);
      var vp = page.getViewport({ scale: 2.4 }), cv = document.createElement("canvas");
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      txt = await ocrCanvas(cv, psm);
    }
    out.push(txt);
  }
  return out.join("\n");
}

/* ============================ FLUJO ============================ */
function showProg(on) { $("prog").style.display = on ? "block" : "none"; }
function setStatus(msg, frac) { $("pst").textContent = msg + (frac != null && frac > 0 ? " " + Math.round(frac * 100) + "%" : ""); if (frac != null) $("pbar").style.width = Math.max(4, Math.round(frac * 100)) + "%"; }

var runId = 0, my = 0;
async function readFiles(files, psm) {
  var texts = [], k = 0;
  for (var f of files) {
    k++;
    var isPdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);
    if (isPdf) {
      setStatus(t("st_lib"), 0.05); await loadPdf();
      setStatus(t("st_pdf"), 0.15);
      progressCb = function (p) { setStatus(t("st_ocr"), 0.2 + p * 0.75); };
      texts.push(await extractPdf(f, setStatus, psm));
    } else {
      setStatus(t("st_lib"), 0.05);
      libCb = function (m) { if (my === runId) setStatus(t("st_lib"), 0.04 + (m.progress || 0) * 0.12); };
      await getWorker();
      setStatus(t("st_ocr"), 0.15);
      progressCb = function (p) { setStatus(t("st_ocr"), 0.15 + p * 0.8); };
      var cv = await fileToCanvas(f);
      texts.push(await ocrCanvas(cv, psm));
    }
  }
  return texts.join("\n");
}

function score(r) { return r.keyFound * 10 + Object.keys(r.v).length; }
async function handleFiles(fl) {
  var files = Array.prototype.slice.call(fl || []);
  if (!files.length) return;
  var mine = ++runId; my = mine;
  $("out").classList.add("hidden"); $("upload").classList.add("hidden"); showProg(true); setStatus(t("st_lib"), 0.03);
  try {
    var txt = await readFiles(files, 6);
    if (mine !== runId) return;
    var res = BustaParser.parse(txt);
    if (res.keyFound < 5 && files.some(function (f) { return !/pdf/i.test(f.type); })) {
      setStatus(t("st_ocr2"), 0.2);
      var txt2 = await readFiles(files, 3), res2 = BustaParser.parse(txt2);
      if (mine !== runId) return;
      if (score(res2) > score(res)) { res = res2; txt = txt2; }
    }
    setStatus(t("st_an"), 1);
    finish(txt, res);
  } catch (e) {
    if (mine !== runId) return;
    showProg(false); $("upload").classList.remove("hidden");
    var why = e && e.message ? e.message : String(e);
    toast((why === "lib" || why === "timeout" ? t("err_lib") : t("err_read")) + " [" + why.slice(0, 60) + "]");
  }
}
function finish(txt, res) {
  lastText = txt; last = res; showProg(false); $("upload").classList.add("hidden");
  render(res); window.scrollTo(0, 0);
}
$("bCancel").onclick = function () { runId++; showProg(false); $("upload").classList.remove("hidden"); };
$("bPhoto").onclick = function () { $("fPhoto").click(); };
$("bFile").onclick = function () { $("fFile").click(); };
$("fPhoto").onchange = function (e) { handleFiles(e.target.files); e.target.value = ""; };
$("fFile").onchange = function (e) { handleFiles(e.target.files); e.target.value = ""; };
$("bDemo").onclick = function () { $("upload").classList.add("hidden"); finish(window.BP_SAMPLE, BustaParser.parse(window.BP_SAMPLE)); };
var dz = $("drop");
["dragenter", "dragover"].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("over"); }); });
["dragleave", "drop"].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("over"); }); });
document.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

/* ============================ RESULTADOS ============================ */
function stat(k, value, hintKey) {
  return '<div class="st"><div class="k">' + esc(k) + '</div><div class="n">' + value + '</div>' + (hintKey ? '<div class="h">' + esc(t(hintKey)) + '</div>' : "") + "</div>";
}
function moneyStat(key, val) { return stat(t(key), esc(eur(val)), key + "_h"); }
function section(title, inner) { return '<section class="card"><h2>' + esc(title) + "</h2>" + inner + "</section>"; }

function unitFromLine(line) { return /\bORE\b|\bH\b/.test(line) ? "h" : /\bGG\b|GIORN/.test(line) ? "d" : ""; }
function itemRow(it) {
  var n = it.nums, right;
  var u = unitFromLine(it.line);
  if (n.length >= 2) right = qty(n[0], u) + " · " + eur(n[n.length - 1]);
  else right = u ? qty(n[0], u) : eur(n[0]);
  return '<div class="it"><span>' + esc(it.label) + "</span><b>" + esc(right) + "</b></div>";
}

function render(r) {
  var v = r.v, h = "", i, k;
  var per = r.period ? t("m")[r.period.m - 1] + " " + r.period.y : "";

  /* hero */
  if (v.netto != null || v.lordo != null) {
    h += '<div class="hero"><div class="per">' + esc(per) + '</div><div class="row"><div><div class="l">' + esc(t("hero_net")) + '</div><div class="v">' +
      (v.netto != null ? esc(num(v.netto, 2)) + "<small>€</small>" : "—") + "</div></div><div class=\"s\">" +
      (v.lordo != null ? '<div class="l">' + esc(t("hero_gross")) + '</div><div class="v">' + esc(eur(v.lordo)) + "</div>" : "") + "</div></div>";
    var ch = [];
    if (r.info.livello) ch.push("Livello " + r.info.livello);
    if (r.info.qualifica) ch.push(cap(r.info.qualifica));
    if (r.info.ccnl) ch.push("CCNL " + cap(r.info.ccnl));
    if (ch.length) h += '<div class="chips">' + ch.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") + "</div>";
    h += "</div>";
  } else if (per) h += '<div class="hero"><div class="per">' + esc(per) + "</div></div>";

  if (r.keyFound < 4) h += '<div class="card"><div class="note warn"><b>' + esc(t("low_t")) + "</b><br>" + esc(t("low_p")) + "</div></div>";

  /* acciones */
  h += '<div class="acts"><button class="btn small primary" id="bAgain">' + esc(t("again")) + '</button><button class="btn small" id="bCopy">' + esc(t("copy")) + "</button>" +
       (navigator.share ? '<button class="btn small" id="bShare">' + esc(t("share")) + "</button>" : "") +
       (window.BC_MONEY ? '<button class="btn small" id="bPdf">' + esc(window.BC_MONEY.label()) + "</button>" : "") + "</div>";

  /* en breve */
  var brief = buildBrief(r);
  if (brief.length) h += section(t("brief"), '<ul class="brief">' + brief.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>");

  /* adónde va */
  if (v.lordo && v.netto != null) {
    var tax = (v.irpef_netta || 0) + (v.add_reg || 0) + (v.add_com || 0), inps = v.inps || 0;
    var oth = Math.max(0, v.lordo - v.netto - inps - tax);
    var segs = [["net", v.netto, "var(--c1)"], ["inps_s", inps, "var(--c2)"], ["tax_s", tax, "var(--c3)"], ["oth_s", oth, "var(--c4)"]].filter(function (s) { return s[1] > 0.005; });
    var bar = '<div class="split">' + segs.map(function (s) { return '<i style="width:' + (s[1] / v.lordo * 100).toFixed(2) + "%;background:" + s[2] + '"></i>'; }).join("") + "</div>";
    var leg = '<div class="leg">' + segs.map(function (s) {
      return '<div><span class="d" style="background:' + s[2] + '"></span>' + esc(t(s[0])) + '<em>' + esc(num(s[1] / v.lordo * 100, 1)) + " %</em><b>" + esc(eur(s[1])) + "</b></div>";
    }).join("") + "</div>";
    h += section(t("sec_where"), bar + leg);
  }

  /* ferie y permisos */
  var fer = r.ferie, fh = "";
  ["ferie", "rol", "exf"].forEach(function (key) {
    var o = fer[key]; if (!o) return;
    var u = o.u || (key === "ferie" ? "d" : "h"), cells = "";
    ["prev", "mat", "god", "sal"].forEach(function (q) {
      if (o[q] == null) return;
      cells += '<div class="' + (q === "sal" ? "sal" : "") + '"><b>' + esc(qty(o[q])) + "</b><span>" + esc(t(q)) + "</span></div>";
    });
    var avail = (o.prev || 0) + (o.mat || 0), pb = "";
    if (o.god != null && avail > 0) pb = '<div class="pb"><i style="width:' + Math.min(100, o.god / avail * 100).toFixed(0) + '%"></i></div><div class="pl">' + esc(qty(o.god, u) + " " + t("used_of") + " " + qty(avail, u)) + "</div>";
    fh += '<div class="fc"><div class="t">' + esc(t(key + "_t")) + " <span class=\"muted\">(" + esc(t(u)) + ")</span></div><div class=\"hd\">" + esc(t(key + "_h")) + '</div><div class="g">' + cells + "</div>" + pb + "</div>";
  });
  if (fh) h += section(t("sec_ferie"), fh);

  /* días y horas */
  var dh = "";
  [["gg_lav", "d"], ["gg_retr", "d"], ["gg_inps", "d"], ["ore_ord", "h"]].forEach(function (p) { if (v[p[0]] != null) dh += stat(t(p[0]), esc(qty(v[p[0]], p[1])), p[0] + "_h"); });
  r.ferieMese.forEach(function (it) { dh += stat(t("ferie_mese"), esc(qty(it.nums[0], "d")) + (it.nums.length > 1 ? " · " + esc(eur(it.nums[it.nums.length - 1])) : ""), "ferie_mese_h"); });
  var dl = "";
  if (r.lists.straord.length) dl += '<div class="lh">' + esc(t("straord")) + " — " + esc(t("straord_h")) + '</div><div class="list">' + r.lists.straord.map(itemRow).join("") + "</div>";
  if (r.lists.assenze.length) dl += '<div class="lh">' + esc(t("assenze")) + " — " + esc(t("assenze_h")) + '</div><div class="list">' + r.lists.assenze.map(itemRow).join("") + "</div>";
  if (dh || dl) h += section(t("sec_days"), (dh ? '<div class="grid">' + dh + "</div>" : "") + dl);

  /* qué te pagan */
  var ph = ""; ["paga_base", "scatti", "superminimo", "contingenza"].forEach(function (key) { if (v[key] != null) ph += moneyStat(key, v[key]); });
  if (ph) h += section(t("sec_pay"), '<div class="grid">' + ph + "</div>");

  /* contribuciones y pensión */
  var ih = "";
  if (v.inps != null) ih += moneyStat("inps", v.inps);
  if (v.inps_rate != null) ih += stat(t("inps_rate"), esc(num(v.inps_rate, 2) + " %"), "inps_rate_h");
  if (v.inps_imp != null) ih += moneyStat("inps_imp", v.inps_imp);
  if (v.inps_az != null) ih += moneyStat("inps_az", v.inps_az);
  r.lists.fondo.slice(0, 2).forEach(function (it) { ih += stat(t("fondo"), esc(eur(it.nums[it.nums.length - 1])), "fondo_h"); });
  var tq = null, tf = null;
  r.lists.tfr.forEach(function (it) { var a = it.nums[it.nums.length - 1]; if (/FONDO|PREGRESS|ACCANT|TOTALE|PRECEDENT/.test(it.line)) { if (tf == null) tf = a; } else if (tq == null) tq = a; });
  if (tq != null) ih += stat(t("tfr_mese"), esc(eur(tq)), "tfr_mese_h");
  if (tf != null) ih += stat(t("tfr_fondo"), esc(eur(tf)), "tfr_fondo_h");
  if (ih) h += section(t("sec_inps"), '<div class="grid">' + ih + '</div><div class="note info">' + esc(t("pension_note")) + "</div>");

  /* impuestos */
  var th = ""; ["imp_fisc", "irpef_lorda", "detr", "irpef_netta", "add_reg", "add_com"].forEach(function (key) { if (v[key] != null) th += moneyStat(key, v[key]); });
  if (th) h += section(t("sec_tax"), '<div class="grid">' + th + "</div>");

  /* otros */
  var oh = "";
  r.lists.r13.forEach(function (it) { oh += stat(t(/QUATTORD/.test(it.line) ? "r14" : "r13"), esc(eur(it.nums[it.nums.length - 1])), "r_h"); });
  r.lists.anf.slice(0, 1).forEach(function (it) { oh += stat(t("anf"), esc(eur(it.nums[it.nums.length - 1])), "anf_h"); });
  var ol = "";
  if (r.lists.bonus.length) ol += '<div class="lh">' + esc(t("bonus")) + " — " + esc(t("bonus_h")) + '</div><div class="list">' + r.lists.bonus.map(itemRow).join("") + "</div>";
  if (r.lists.tratt.length) ol += '<div class="lh">' + esc(t("tratt")) + " — " + esc(t("tratt_h")) + '</div><div class="list">' + r.lists.tratt.map(itemRow).join("") + "</div>";
  if (oh || ol) h += section(t("sec_other"), (oh ? '<div class="grid">' + oh + "</div>" : "") + ol);

  /* control */
  if (r.check) h += section(t("sec_check"), '<div class="note ' + (r.check.ok ? "ok" : "warn") + '">' + esc(r.check.ok ? t("chk_ok") : fill(t("chk_bad"), { x: num(Math.abs(r.check.diff), 2) })) + "</div>");

  /* no encontrado */
  var nf = [];
  if (v.netto == null) nf.push(t("nf_netto")); if (v.lordo == null) nf.push(t("nf_lordo")); if (v.tratt == null) nf.push(t("nf_tratt"));
  if (v.inps == null) nf.push(t("nf_inps")); if (v.irpef_netta == null) nf.push(t("nf_irpef")); if (!fer.ferie && !fer.rol && !fer.exf) nf.push(t("nf_ferie"));
  if (nf.length) h += section(t("sec_nf"), '<p class="muted">' + esc(t("nf_p")) + "</p><p style=\"margin-top:6px;font-weight:600\">" + esc(nf.join(" · ")) + "</p>");

  /* texto leído */
  h += '<section class="card"><details><summary>' + esc(t("sec_txt")) + '</summary><p class="muted" style="margin-top:8px">' + esc(t("txt_p")) + '</p><textarea id="rawtxt" spellcheck="false"></textarea><div class="acts" style="margin:8px 0 0"><button class="btn small" id="bReparse">' + esc(t("reparse")) + '</button><button class="btn small" id="bAnon">' + esc(t("anon")) + "</button></div></details></section>";

  var out = $("out"); out.innerHTML = h; out.classList.remove("hidden");
  $("rawtxt").value = lastText;
  $("bAgain").onclick = reset;
  $("bCopy").onclick = copySummary;
  if ($("bPdf")) $("bPdf").onclick = function () { window.BC_MONEY.report(); };
  if ($("bShare")) $("bShare").onclick = function () { navigator.share({ title: t("sum_title"), text: summaryText(r) }).catch(function () {}); };
  $("bAnon").onclick = function () { copyText(anonymize($("rawtxt").value)); };
  $("bReparse").onclick = function () { lastText = $("rawtxt").value; last = BustaParser.parse(lastText); render(last); window.scrollTo(0, 0); };
}
function cap(s) { s = String(s).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
function reset() { last = null; lastText = ""; $("out").classList.add("hidden"); $("out").innerHTML = ""; $("upload").classList.remove("hidden"); window.scrollTo(0, 0); }

function buildBrief(r) {
  var v = r.v, b = [];
  if (v.lordo && v.netto != null) b.push(fill(t("b_net"), { l: num(v.lordo, 2), n: num(v.netto, 2), p: num(v.netto / v.lordo * 100, 0) }));
  if (r.ferie.ferie && r.ferie.ferie.sal != null) b.push(fill(t("b_ferie"), { n: qty(r.ferie.ferie.sal), u: t(r.ferie.ferie.u || "d") }));
  if (r.ferie.rol && r.ferie.rol.sal != null) b.push(fill(t("b_rol"), { n: qty(r.ferie.rol.sal), u: t(r.ferie.rol.u || "h") }));
  if (v.inps != null) {
    var az = v.inps_az != null ? v.inps_az : (v.inps_imp ? v.inps_imp * 0.2381 : null);
    if (az != null) b.push(fill(t("b_pens"), { t: num(v.inps + az, 2), a: num(v.inps, 2), b: num(az, 2) }) + (v.inps_az == null ? " " + t("b_pens_est") : ""));
  }
  return b;
}
function summaryText(r) {
  var v = r.v, L = [t("sum_title") + (r.period ? " · " + t("m")[r.period.m - 1] + " " + r.period.y : "")];
  if (v.lordo != null) L.push(t("hero_gross") + ": " + eur(v.lordo));
  if (v.netto != null) L.push(t("hero_net") + ": " + eur(v.netto));
  if (v.inps != null) L.push(t("inps") + ": " + eur(v.inps));
  if (v.irpef_netta != null) L.push(t("irpef_netta") + ": " + eur(v.irpef_netta));
  ["ferie", "rol"].forEach(function (key) { var o = r.ferie[key]; if (o && o.sal != null) L.push(t(key + "_t") + " – " + t("sal") + ": " + qty(o.sal, o.u)); });
  return L.join("\n");
}
function anonymize(txt) {
  return String(txt).split("\n").map(function (l) {
    if (/COGNOME|\bNOME\b|DIPENDENTE\s*:|MATRICOLA|\bMATR\b|COD\.?\s*FISC|CODICE\s+FISCALE|C\.F\.|INDIRIZZO|RESIDENZ|NATO\s+A|IBAN|CONTO\s+CORRENTE|\bVIA\b|\bCAP\b|P\.?\s*IVA|PARTITA\s+IVA/i.test(l)) return "[riga omessa]";
    return l.replace(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi, "[CF]").replace(/\bIT\d{2}[A-Z]\d{10}[0-9A-Z]{12}\b/gi, "[IBAN]").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/\b\d{9,}\b/g, "[num]");
  }).join("\n");
}
function copyText(txt) {
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(t("copied")); }, function () {
    var a = document.createElement("textarea"); a.value = txt; document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); toast(t("copied")); } catch (e) {} a.remove();
  });
}
function copySummary() {
  var txt = summaryText(last);
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(t("copied")); }, function () {
    var a = document.createElement("textarea"); a.value = txt; document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); toast(t("copied")); } catch (e) {} a.remove();
  });
}

applyLang();
window.__bcReady = true;
window.__BC = { handleFiles: handleFiles, finish: finish, lang: function () { return LANG; }, toast: toast, shareSummary: function () {
  if (!last) return;
  if (navigator.share) navigator.share({ title: t("sum_title"), text: summaryText(last) }).catch(function () {}); else copySummary();
} };
})();
