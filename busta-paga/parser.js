/* Busta Chiara · lector de cedolino (busta paga italiana)
   Recibe el texto del PDF/foto y devuelve los datos encontrados.
   Todo se calcula en el dispositivo. Nada sale del móvil. */
(function (root) {
"use strict";

var MONTHS = {GENNAIO:1,FEBBRAIO:2,MARZO:3,APRILE:4,MAGGIO:5,GIUGNO:6,LUGLIO:7,AGOSTO:8,SETTEMBRE:9,OTTOBRE:10,NOVEMBRE:11,DICEMBRE:12};
var NUMRE = /-?\d+(?:\.\d{3})+(?:,\d+)?-?|-?\d+(?:,\d+)?-?/g;

function norm(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`´]/g, "'").toUpperCase();
}
function toNum(t) {
  var neg = /^-|-$/.test(t);
  var v = parseFloat(t.replace(/-/g, "").replace(/\./g, "").replace(",", "."));
  return neg ? -v : v;
}
function clean(u) {
  return u
    .replace(/\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, " ")
    .replace(/\b13\s*(?:A|MA|ESIMA|°)(?![A-Z0-9])/g, "TREDICESIMA ")
    .replace(/\b14\s*(?:A|MA|ESIMA|°)(?![A-Z0-9])/g, "QUATTORDICESIMA ")
    .replace(/\d+(?:,\d+)?\s*%/g, " ")
    .replace(/(?<![\d,.])(?:19|20)\d{2}(?![\d]|[,.]\d)/g, " ")
    .replace(/(\d)\.(\d{1,2})(?![\d.])/g, "$1,$2");
}

var KWRE = /(RES(?:IDUO|\.)?\s*(?:A\.?\s?P\.?|ANNO\s+PREC\w*|PREGR\w*|INIZ\w*)|RIPORTO|PREGRESS\w*|RESIDUO\s+PRECEDENTE|SALDO\s+INIZ\w*|\bA\.?P\.?\b)|(MATUR\w*|ACCANTON\w*|SPETTANT\w*)|(GODUT\w*|FRUIT\w*|USUFRUIT\w*|UTILIZZAT\w*)|(SALDO|RESIDUO(?!\s+(?:FERIE|PERMESS\w*))|DISPONIBIL\w*|\bRES\.?(?=\s|$))/g;

function parse(text) {
  var R = String(text || "").replace(/\r/g, "").split("\n")
    .map(function (l) { return l.replace(/\s+/g, " ").trim(); })
    .filter(function (l) { return l.length > 0; });
  var U = R.map(function (l) { return norm(l).replace(/^\d{3,6}\s+(?=[A-Z])/, ""); });
  var C = U.map(clean);
  var used = {};

  function nums(i) { var m = C[i].match(NUMRE) || []; return m.map(toNum); }

  /* número tras una etiqueta (por defecto el primero; opt.last = el último) */
  function after(re, opt) {
    opt = opt || {};
    for (var i = 0; i < C.length; i++) {
      var m = re.exec(C[i]);
      if (!m) continue;
      if (opt.not && opt.not.test(C[i])) continue;
      var rest = C[i].slice(m.index + m[0].length);
      var t = rest.match(NUMRE);
      if (t && t.length) {
        var all = t.map(toNum).map(Math.abs);
        return { i: i, v: all[opt.last ? all.length - 1 : 0], all: all };
      }
    }
    return null;
  }

  /* cabecera de columnas + fila de números en la(s) línea(s) siguiente(s) */
  function headerTable(specs, min) {
    for (var i = 0; i < C.length; i++) {
      var found = [];
      specs.forEach(function (s) { var m = s.re.exec(C[i]); if (m) found.push({ k: s.k, pos: m.index }); });
      if (found.length < (min || 2)) continue;
      found.sort(function (a, b) { return a.pos - b.pos; });
      for (var j = i + 1; j <= i + 2 && j < C.length; j++) {
        var n = nums(j).map(Math.abs);
        var isHeader = specs.some(function (s) { return s.re.test(C[j]); });
        if (n.length === found.length && !isHeader) {
          var o = {};
          found.forEach(function (f, idx) { o[f.k] = n[idx]; });
          return o;
        }
      }
    }
    return null;
  }

  function labelOf(i) {
    var s = R[i].replace(/^\d{3,6}\s+(?=[A-Za-z])/, "").replace(/[\d.,]+\s*%?/g, " ").replace(/[€|:;()\/]/g, " ").replace(/\s+/g, " ").trim();
    if (s.length > 40) s = s.slice(0, 40).trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
  }
  function listLines(re, opt) {
    opt = opt || {};
    var out = [];
    for (var i = 0; i < C.length && out.length < (opt.max || 6); i++) {
      if (used[i] || !re.test(C[i])) continue;
      if (opt.not && opt.not.test(C[i])) continue;
      var n = nums(i).map(Math.abs);
      if (!n.length) continue;
      used[i] = 1;
      out.push({ i: i, label: labelOf(i), nums: n, line: C[i] });
    }
    return out;
  }

  var v = {}, info = {}, lists = {};

  /* ---------- Periodo e info ---------- */
  var period = null;
  var mre = /(GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE)\s*[\/-]?\s*(20\d\d)/;
  for (var p = 0; p < Math.min(U.length, 60) && !period; p++) {
    var pm = mre.exec(U[p]);
    if (pm && /PERIODO|MESE|COMPETENZA|CEDOLINO|BUSTA|PAGA|RETRIBUZ|LIBRO/.test(U[p])) period = { m: MONTHS[pm[1]], y: +pm[2] };
  }
  for (p = 0; p < Math.min(U.length, 60) && !period; p++) {
    var pm2 = mre.exec(U[p]);
    if (pm2) period = { m: MONTHS[pm2[1]], y: +pm2[2] };
  }
  for (p = 0; p < Math.min(U.length, 40) && !period; p++) {
    var pn = /(?:PERIODO|MESE|COMPETENZA)\D{0,25}?(0?[1-9]|1[0-2])\s*[\/-]\s*(20\d\d)/.exec(U[p]);
    if (pn) period = { m: +pn[1], y: +pn[2] };
  }
  U.some(function (u) {
    var m = /C\.?C\.?N\.?L\.?\s*[:\-]?\s*(.{3,70})/.exec(u);
    if (m) { info.ccnl = m[1].replace(/\s*(LIVELLO|QUALIFICA|MATRICOLA|CODICE)\b.*$/, "").replace(/\s+\d.*$/, "").trim(); return !!info.ccnl; }
    return false;
  });
  U.some(function (u) { var m = /LIVELLO\s*[:.\-]?\s*([A-Z0-9°]{1,4})\b/.exec(u); if (m) { info.livello = m[1]; return true; } return false; });
  U.some(function (u) { var m = /QUALIFICA\s*[:.\-]?\s*([A-Z' ]{3,28})/.exec(u); if (m) { info.qualifica = m[1].replace(/\s*(LIVELLO|CCNL|CCNL).*$/, "").trim(); return !!info.qualifica; } return false; });
  U.some(function (u) { var m = /ASSUNZ\w*\D{0,14}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/.exec(u); if (m) { info.assunzione = m[1]; return true; } return false; });

  /* ---------- Totales ---------- */
  var r;
  r = after(/TOTALE\s+COMPETENZE|TOTALE\s+LORDO|TOTALE\s+RETRIBUZIONE|LORDO\s+TOTALE|COMPETENZE\s+LORDE/); if (r) { v.lordo = r.v; used[r.i] = 1; }
  r = after(/TOTALE\s+TRATTENUTE|TOTALE\s+RITENUTE|TRATTENUTE\s+TOTALI/); if (r) { v.tratt = r.v; used[r.i] = 1; }
  r = after(/NETTO\s+(?:IN\s+BUSTA|DEL\s+MESE|A\s+PAGARE|PAGATO|IN\s+PAGAMENTO|BUSTA)|TOTALE\s+NETTO|NETTO\s+MENSILE|^NETTO\b/); if (r) { v.netto = r.v; used[r.i] = 1; }
  var tot = headerTable([
    { k: "lordo", re: /TOTALE\s+COMPETENZE|TOTALE\s+LORDO|TOTALE\s+RETRIBUZIONE/ },
    { k: "tratt", re: /TOTALE\s+TRATTENUTE|TOTALE\s+RITENUTE/ },
    { k: "arr",   re: /ARROTONDAMENT\w*/ },
    { k: "netto", re: /NETTO\s+(?:IN\s+BUSTA|DEL\s+MESE|A\s+PAGARE|PAGATO|IN\s+PAGAMENTO)|\bNETTO\b/ }
  ], 2);
  if (tot) ["lordo", "tratt", "netto"].forEach(function (k) { if (v[k] == null && tot[k] != null) v[k] = tot[k]; });

  /* ---------- INPS / pensión ---------- */
  var inpsNot = /AZIENDA|DITTA|DATORE|IMPONIBILE|INAIL|TFR|FONDO|PROGRESS|IMP\./;
  r = after(/(?:CONTRIBUTI?|TRATTENUTE?|RITENUTE?)\s+(?:PREVIDENZ\w*|INPS)|INPS\s+(?:DIP\w*|LAV\w*|C\/\s*DIP\w*|A\s+CARICO\s+(?:DEL\s+)?(?:DIPENDENTE|LAVORATORE))|CONTRIBUTI?\s+(?:DIPENDENTE|LAVORATORE)|\bC\.?\s*INPS\b/, { last: true, not: inpsNot });
  if (r) {
    var val = r.v;
    if (v.lordo) {
      var ok = r.all.filter(function (x) { return x / v.lordo > 0.05 && x / v.lordo < 0.13; });
      if (ok.length) val = ok[ok.length - 1];
    }
    v.inps = val; used[r.i] = 1;
    var rm = /(\d{1,2},\d{1,2})\s*%/.exec(U[r.i]);
    if (rm) { var rt = toNum(rm[1]); if (rt >= 5 && rt <= 13) v.inps_rate = rt; }
  }
  r = after(/IMPONIBILE\s+(?:INPS|PREVIDENZ\w*|CONTRIBUT\w*)|IMP\.?\s*(?:INPS|PREV\w*|CONTR\w*)/, { not: /PROGRESS|TFR/ }); if (r) { v.inps_imp = r.v; used[r.i] = 1; }
  r = after(/CONTRIB\w*\s+(?:A\s+CARICO\s+)?(?:AZIENDA|DITTA|DATORE)|INPS\s+(?:AZIENDA|DITTA|DATORE)|QUOTA\s+AZIENDA|CONTRIB\w*\s+(?:DELLA\s+)?DITTA/, { last: true }); if (r) { v.inps_az = r.v; used[r.i] = 1; }

  /* ---------- Impuestos ---------- */
  r = after(/IMPONIBILE\s+(?:FISCALE|IRPEF)|IMP\.?\s*(?:FISC\w*|IRPEF)/, { not: /PROGRESS|TFR/ }); if (r) { v.imp_fisc = r.v; used[r.i] = 1; }
  r = after(/IRPEF\s+LORDA|IMPOSTA\s+LORDA|IMP\.?\s+LORDA/, { last: true }); if (r) { v.irpef_lorda = r.v; used[r.i] = 1; }
  r = after(/DETRAZ\w*/, { last: true, not: /FAMIL|CARICO|CONIUG|FIGLI/ }); if (r) { v.detr = r.v; used[r.i] = 1; }
  r = after(/IRPEF\s+NETTA|IMPOSTA\s+NETTA|RITENUTE?\s+IRPEF|IRPEF\s+(?:DEL\s+MESE|TRATTENUTA|DOVUTA|MESE|RITENUTA)|TRATTENUTE\s+FISCALI|RITENUTE\s+FISCALI/, { last: true }); if (r) { v.irpef_netta = r.v; used[r.i] = 1; }
  if (v.irpef_netta == null) { r = after(/^IRPEF\b(?!\s+(?:LORDA|NETTA))/, { last: true }); if (r) { v.irpef_netta = r.v; used[r.i] = 1; } }
  r = after(/ADD\w*\.?\s*REG\w*/, { last: true }); if (r) { v.add_reg = r.v; used[r.i] = 1; }
  r = after(/ADD\w*\.?\s*COM\w*/, { last: true }); if (r) { v.add_com = r.v; used[r.i] = 1; }
  var fis = headerTable([
    { k: "inps_imp",   re: /IMP\.?\s*(?:PREV\w*|INPS)|IMPONIBILE\s+(?:PREV\w*|INPS)/ },
    { k: "imp_fisc",   re: /IMP\.?\s*(?:FISC\w*|IRPEF)|IMPONIBILE\s+(?:FISC\w*|IRPEF)/ },
    { k: "irpef_lorda",re: /IRPEF\s+LORDA|IMPOSTA\s+LORDA/ },
    { k: "detr",       re: /DETRAZ\w*/ },
    { k: "irpef_netta",re: /IRPEF\s+NETTA|IMPOSTA\s+NETTA/ },
    { k: "add_reg",    re: /ADD\w*\.?\s*REG\w*/ },
    { k: "add_com",    re: /ADD\w*\.?\s*COM\w*/ }
  ], 3);
  if (fis) Object.keys(fis).forEach(function (k) { if (v[k] == null) v[k] = fis[k]; });

  if (v.inps && !v.inps_rate && (v.inps_imp || v.lordo)) { var rr = v.inps / (v.inps_imp || v.lordo) * 100; if (rr > 5 && rr < 13) v.inps_rate = Math.round(rr * 100) / 100; }

  /* ---------- Sueldo base ---------- */
  r = after(/PAGA\s+BASE|RETRIBUZIONE\s+(?:BASE|ORDINARIA|MENSILE)|MINIMO\s+(?:TABELLARE|CONTRATTUALE)|STIPENDIO\b|SALARIO\b/, { last: true, not: /NETTO|LORDO|TOTALE|TFR/ }); if (r) { v.paga_base = r.v; used[r.i] = 1; }
  r = after(/\bSCATTI?\b|ANZIANIT\w*/, { last: true, not: /ASSUNZ|TFR/ }); if (r) { v.scatti = r.v; used[r.i] = 1; }
  r = after(/SUPER\s*MINIMO|SUPERMIN\w*|AD\s+PERSONAM/, { last: true }); if (r) { v.superminimo = r.v; used[r.i] = 1; }
  r = after(/CONTINGENZA|\bE\.?D\.?R\.?\b|ELEMENTO\s+DISTINTO/, { last: true }); if (r) { v.contingenza = r.v; used[r.i] = 1; }

  /* ---------- Días y horas ---------- */
  r = after(/G(?:G|IORN\w*)\.?\s*(?:LAVORAT\w*|LAV\b)|GIORNATE\s+LAVORAT\w*/); if (r) v.gg_lav = r.v;
  r = after(/G(?:G|IORN\w*)\.?\s*(?:RETRIB\w*|PAGAT\w*|PAG\b|DI\s+PAGA)/); if (r) v.gg_retr = r.v;
  r = after(/G(?:G|IORN\w*)\.?\s*(?:INPS|CONTRIB\w*)|SETTIMANE\s+(?:UTILI|CONTRIB\w*)|SETT\.?\s*CONTRIB\w*/); if (r) v.gg_inps = r.v;
  r = after(/ORE\s+(?:ORDINARIE|LAVORATE|LAV\b|NORMALI|RETRIBUITE)/); if (r) v.ore_ord = r.v;

  /* ---------- Vacaciones / permisos (ferie, ROL, ex festività) ---------- */
  var fer = { ferie: {}, rol: {}, exf: {} };
  var SEC = [["exf", /EX\s*-?\s*FEST\w*|\bEXF\b|FESTIVIT\w*\s+SOPPRESS\w*/], ["rol", /\bROL\b|\bPERMESS\w*/], ["ferie", /\bFERIE\b/]];
  function secOf(i) { for (var s = 0; s < SEC.length; s++) if (SEC[s][1].test(C[i])) return SEC[s][0]; return null; }
  function scanKw(c) {
    var ms = [], m; KWRE.lastIndex = 0;
    while ((m = KWRE.exec(c))) {
      ms.push({ t: m[1] ? "prev" : m[2] ? "mat" : m[3] ? "god" : "sal", s: m.index, e: m.index + m[0].length });
      if (m[0].length === 0) KWRE.lastIndex++;
    }
    if (!ms.length) return { type: null };
    var pairs = [], withNum = 0;
    ms.forEach(function (x, k) {
      var seg = c.slice(x.e, k + 1 < ms.length ? ms[k + 1].s : c.length);
      var t = seg.match(NUMRE);
      if (t) { withNum++; pairs.push({ t: x.t, v: Math.abs(toNum(t[0])) }); }
    });
    if (withNum === ms.length) return { type: "inline", pairs: pairs };
    if (withNum === 0 && ms.length >= 2) {
      var cols = ms.map(function (x) { return x.t; });
      if (cols[0] === "sal" && cols.indexOf("mat") > 0 && cols.filter(function (x) { return x === "sal"; }).length === 1) cols[0] = "prev";
      return { type: "header", cols: cols };
    }
    return { type: null };
  }
  function unitOf(txt, sec) {
    if (/\bORE\b|\(H\)|\bH\b/.test(txt)) return "h";
    if (/\bGG\b|GIORN/.test(txt)) return "d";
    return sec === "ferie" ? "d" : "h";
  }
  var cur = null, left = 0;
  for (var i = 0; i < C.length; i++) {
    var sc = scanKw(C[i]), s = secOf(i);
    if (sc.type === "header") {
      var k = sc.cols.length;
      for (var j = i + 1; j <= Math.min(i + 8, C.length - 1); j++) {
        var sj = secOf(j);
        if (!sj || fer[sj].done) continue;
        var n = nums(j).map(Math.abs), idx = j;
        if (n.length === 0 && j + 1 < C.length) { n = nums(j + 1).map(Math.abs); idx = j + 1; }
        if (n.length === k) {
          sc.cols.forEach(function (c, q) { fer[sj][c] = n[q]; });
          fer[sj].u = unitOf(U[i] + " " + U[j], sj);
          fer[sj].done = true; used[j] = used[idx] = 1;
        }
      }
    } else if (sc.type === "inline") {
      var sec = s || (left > 0 ? cur : null);
      var allowed = sc.pairs.length >= 2 || (left > 0 && !s);
      if (sec && allowed && !fer[sec].done) {
        sc.pairs.forEach(function (pp) { if (fer[sec][pp.t] === undefined) fer[sec][pp.t] = pp.v; });
        if (!fer[sec].u) fer[sec].u = unitOf(U[i], sec);
        used[i] = 1;
      }
    }
    if (s) { cur = s; left = 8; } else if (left > 0) left--;
  }
  ["ferie", "rol", "exf"].forEach(function (key) {
    var o = fer[key]; delete o.done;
    var any = ["prev", "mat", "god", "sal"].some(function (q) { return o[q] != null; });
    if (!any) { delete fer[key]; return; }
    if (key === "ferie" && o.u === "d" && ["prev", "mat", "god", "sal"].some(function (q) { return o[q] > 60; })) o.u = "h";
  });

  /* ferie / permessos disfrutados en el mes (líneas de voces) */
  var monthLines = listLines(/^FERIE\b/, { max: 2, not: /RESID|MATUR|SALDO|\bAP\b|PREGR|ACCANT|RATEO/ });
  var rolMonth = listLines(/^(?:PERMESS\w*\s+)?(?:ROL|RETRIB\w*|GODUT\w*)\b/, { max: 2, not: /NON\s+RETRIB|RESID|MATUR|SALDO|\bAP\b/ });

  /* ---------- Listas ---------- */
  var asNot = /CONTRIB|INAIL|ACCANTON|RATEO|TFR|IMPONIBILE|TOTALE|NETTO/;
  lists.assenze = listLines(/MALATTIA|INFORTUN\w*|MATERNIT\w*|CONGEDO|ASSENZ\w*|ASPETTATIVA|SCIOPERO|CASSA\s+INTEGR\w*|\bCIG[OSD]?\b|SOSPENSION\w*|NON\s+RETRIBUIT\w*|NON\s+LAVORAT\w*|RIDUZION\w*\s+ORARI\w*|L\.?\s*104|DONAZ\w*\s+SANGUE|LUTTO|MATRIMONIO|PERMESS\w*\s+(?:STUDIO|SINDAC\w*)/, { max: 6, not: asNot });
  lists.straord = listLines(/STRAORD\w*|LAVORO\s+SUPPLEMENT\w*|MAGGIORAZ\w*|NOTTURN\w*|DOMENICA|FESTIV\w*\s+LAVORAT\w*|ORE\s+FESTIV\w*/, { max: 5, not: /FERIE|ROL|RESID|TOTALE|IMPONIBILE|CONTRIB|TFR|NETTO/ });
  lists.tfr = listLines(/\bT\.?F\.?R\.?\b|TRATTAMENTO\s+DI\s+FINE\s+RAPPORTO|LIQUIDAZIONE/, { max: 4, not: /IMPONIBILE|NETTO|TOTALE\s+TRATT/ });
  lists.r13 = listLines(/RATEO\s+(?:13|14|TREDICES\w*|QUATTORDICES\w*)|TREDICESIMA|QUATTORDICESIMA|\b1[34]\s*(?:A|MA|ESIMA)\b\s*(?:MENSILIT\w*)?|MENSILITA\s+AGGIUNTIV\w*/, { max: 2, not: /TFR|IMPONIBILE|CONTRIB|INPS/ });
  lists.fondo = listLines(/FONDO\s+PENSIONE|PREVIDENZA\s+(?:COMPLEMENTARE|INTEGRATIVA)|PREVIDENZIALE\s+INTEGRATIV\w*|\b(?:COMETA|FONCHIM|PEGASO|ESPERO|PRIAMO|ALIFOND|FONDOPOSTE|BYBLOS|LABORFONDS|FONTE|FON\.?TE|COOPERLAVORO|PREVIAMBIENTE|ARCO|PREVEDI|PREVIMODA|SOLIDARIETA\s+VENETO)\b|FONDO\s+(?:PREV\w*|NEGOZIO)/, { max: 3, not: /TFR/ });
  lists.anf = listLines(/\bANF\b|ASSEGN\w*\s+(?:AL\s+)?(?:NUCLEO|FAMILIAR\w*)/, { max: 2 });
  lists.bonus = listLines(/TRATTAMENTO\s+INTEGRATIVO|BONUS|CUNEO|ESONERO|RIDUZIONE\s+(?:CONTRIBUT\w*|CUNEO)|\bL\.?\s*207|ART\.?\s*1\s+C\.?\s*121|INDENNITA\w*|PREMIO|PREMI\b|WELFARE|BUON[IO]\s+PASTO|TICKET|MENSA|RIMBORS\w*|TRASFERT\w*|FRINGE/, { max: 6, not: /TFR|IMPONIBILE|CONTRIB|INPS|NETTO|TOTALE|ASSENZ|MALATT|INFORTUN|SOSTITUTIVA\s+FERIE/ });
  lists.tratt = listLines(/^TRATT\w*|^RITENUTA|QUOTA\s+SINDAC\w*|CONTRIBUTO\s+SINDAC\w*|TESSERA\s+SINDAC\w*|\bANTICIPO\b|^ACCONTO\b|CESSIONE|PIGNORAMENTO|PRESTITO|^RATA\b|FINANZIAMENTO/, { max: 5, not: /INPS|IRPEF|ADD\w*|TFR|FISCAL|PREVIDENZ|ASSENZ|MALATT|TOTALE|NETTO|ARROTOND/ });

  /* ---------- Controles ---------- */
  var check = null;
  if (v.lordo != null && v.tratt != null && v.netto != null) {
    var d = v.lordo - v.tratt - v.netto;
    check = { diff: Math.round(d * 100) / 100, ok: Math.abs(d) <= 1.5 };
  }

  var keyFound = ["netto", "lordo", "tratt", "inps", "irpef_netta"].filter(function (k) { return v[k] != null; }).length +
    (fer.ferie || fer.rol || fer.exf ? 1 : 0);

  return { period: period, info: info, v: v, ferie: fer, ferieMese: monthLines, rolMese: rolMonth,
           lists: lists, check: check, keyFound: keyFound, lines: R.length };
}

var api = { parse: parse, toNum: toNum };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.BustaParser = api;
})(typeof window !== "undefined" ? window : this);
