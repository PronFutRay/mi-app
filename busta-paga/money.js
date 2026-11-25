/* Busta Chiara · embajadoras, enlace de referido y cobro del informe PDF */
(function () {
"use strict";
var C = window.BC_CONFIG || {};
function B() { return window.__BC || {}; }
function L() { return (B().lang && B().lang()) || "it"; }
var X = {
it: {
  amb_link: "Diventa ambasciatrice", amb_t: "Programma ambasciatrici",
  amb_p: "Condividi Busta Chiara con amiche e colleghi. Per ogni pagamento fatto con il tuo link guadagni il {c}%.",
  amb_soon: "I pagamenti non sono ancora attivi: condividi già il tuo link, le commissioni partono con la prima vendita.",
  amb_name: "Il tuo nome o codice", amb_gen: "Crea il mio link", amb_wa: "Condividi su WhatsApp", amb_copy: "Copia link", amb_copym: "Copia messaggio", close: "Chiudi",
  amb_msg: "Ciao! Ho trovato Busta Chiara: carichi la tua busta paga e ti spiega in modo semplice ferie, permessi, INPS, tasse e TFR. Si prova gratis ed è privata (resta sul tuo telefono): {u}",
  copied: "Copiato", pdf: "Rapporto PDF",
  pay_t: "Sblocca il rapporto PDF", pay_p: "Rapporto completo da salvare o stampare. Pagamento unico di {p}.", pay_btn: "Paga {p}",
  pay_have: "Ho già un codice", pay_code: "Codice di sblocco", pay_go: "Sblocca", pay_ok: "Sbloccato!", pay_bad: "Codice non valido"
},
es: {
  amb_link: "Hazte embajadora", amb_t: "Programa de embajadoras",
  amb_p: "Comparte Busta Chiara con amigas y compañeros. Por cada pago hecho con tu enlace ganas el {c} %.",
  amb_soon: "Los pagos aún no están activos: comparte ya tu enlace, las comisiones empiezan con la primera venta.",
  amb_name: "Tu nombre o código", amb_gen: "Crear mi enlace", amb_wa: "Compartir por WhatsApp", amb_copy: "Copiar enlace", amb_copym: "Copiar mensaje", close: "Cerrar",
  amb_msg: "¡Hola! Encontré Busta Chiara: subes tu busta paga y te explica fácil las vacaciones, permisos, INPS, impuestos y TFR. Se prueba gratis y es privada (se queda en tu móvil): {u}",
  copied: "Copiado", pdf: "Informe PDF",
  pay_t: "Desbloquea el informe PDF", pay_p: "Informe completo para guardar o imprimir. Pago único de {p}.", pay_btn: "Pagar {p}",
  pay_have: "Ya tengo un código", pay_code: "Código de desbloqueo", pay_go: "Desbloquear", pay_ok: "¡Desbloqueado!", pay_bad: "Código no válido"
}};
function x(k, o) { var s = (X[L()] || X.it)[k]; return o ? s.replace(/\{(\w+)\}/g, function (_, a) { return o[a]; }) : s; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function toast(m) { if (B().toast) B().toast(m); }
function slug(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24); }

/* ---- referido: guarda ?ref=CODIGO ---- */
try { var m = /[?&]ref=([A-Za-z0-9_-]{1,24})/.exec(location.search); if (m) localStorage.setItem("bc.ref", m[1]); } catch (e) {}
function ref() { try { return localStorage.getItem("bc.ref") || ""; } catch (e) { return ""; } }
function unlocked() { if (!C.PAY_LINK) return true; try { return localStorage.getItem("bc.unlocked") === "1"; } catch (e) { return false; } }
function payUrl() { return C.PAY_LINK + (C.PAY_LINK.indexOf("?") < 0 ? "?" : "&") + "client_reference_id=" + encodeURIComponent(ref() || "direct"); }
async function sha(s) {
  var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s).trim().toUpperCase()));
  return Array.from(new Uint8Array(b)).map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
}
function copy(txt) {
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(x("copied")); }, function () {
    var a = document.createElement("textarea"); a.value = txt; document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); toast(x("copied")); } catch (e) {} a.remove();
  });
}
function modal(html) {
  var el = document.createElement("div"); el.className = "modal show";
  el.innerHTML = '<div class="box">' + html + "</div>";
  el.addEventListener("click", function (e) { if (e.target === el) el.remove(); });
  document.body.appendChild(el); return el;
}

/* ---- embajadoras ---- */
function ambassador() {
  var el = modal('<h3>' + esc(x("amb_t")) + "</h3><p>" + esc(x("amb_p", { c: C.COMMISSION || 30 })) + "</p>" +
    (C.PAY_LINK ? "" : "<p>" + esc(x("amb_soon")) + "</p>") +
    '<input id="ambName" placeholder="' + esc(x("amb_name")) + '" autocomplete="off">' +
    '<div class="btns"><button class="btn primary small" id="ambGen">' + esc(x("amb_gen")) + '</button><button class="btn small" id="ambX">' + esc(x("close")) + "</button></div>" +
    '<div id="ambOut" style="margin-top:14px"></div>');
  el.querySelector("#ambX").onclick = function () { el.remove(); };
  el.querySelector("#ambGen").onclick = function () {
    var code = slug(el.querySelector("#ambName").value); if (!code) return;
    var link = (C.APP_URL || (location.origin + location.pathname)) + "?ref=" + code, msg = x("amb_msg", { u: link });
    el.querySelector("#ambOut").innerHTML = '<p style="word-break:break-all;font-weight:700;margin-bottom:10px">' + esc(link) + "</p>" +
      '<div class="btns"><a class="btn primary small" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">' + esc(x("amb_wa")) + "</a>" +
      '<button class="btn small" id="ambC1">' + esc(x("amb_copy")) + '</button><button class="btn small" id="ambC2">' + esc(x("amb_copym")) + "</button></div>";
    el.querySelector("#ambC1").onclick = function () { copy(link); };
    el.querySelector("#ambC2").onclick = function () { copy(msg); };
  };
}

/* ---- informe PDF (de pago si hay PAY_LINK) ---- */
function payWall(then) {
  var el = modal('<h3>' + esc(x("pay_t")) + "</h3><p>" + esc(x("pay_p", { p: C.PRICE || "" })) + "</p>" +
    '<div class="btns"><a class="btn primary small" target="_blank" rel="noopener" href="' + esc(payUrl()) + '">' + esc(x("pay_btn", { p: C.PRICE || "" })) + "</a></div>" +
    '<p style="margin-top:16px">' + esc(x("pay_have")) + '</p><input id="payCode" placeholder="' + esc(x("pay_code")) + '" autocomplete="off" autocapitalize="characters">' +
    '<div class="btns"><button class="btn small" id="payX">' + esc(x("close")) + '</button><button class="btn primary small" id="payGo">' + esc(x("pay_go")) + "</button></div>");
  el.querySelector("#payX").onclick = function () { el.remove(); };
  el.querySelector("#payGo").onclick = async function () {
    var h = await sha(el.querySelector("#payCode").value);
    if (C.UNLOCK_HASH && h === C.UNLOCK_HASH) { try { localStorage.setItem("bc.unlocked", "1"); } catch (e) {} el.remove(); toast(x("pay_ok")); if (then) then(); } else toast(x("pay_bad"));
  };
}
function doReport() {
  if (window.Capacitor) { // la app Android no imprime: se comparte el resumen
    if (B().shareSummary) B().shareSummary(); return;
  }
  try { window.print(); } catch (e) { if (B().shareSummary) B().shareSummary(); }
}
function report() { if (unlocked()) doReport(); else payWall(doReport); }

/* ---- enlace al pie ---- */
var foot = document.createElement("button"); foot.className = "link"; foot.id = "bAmb"; foot.style.display = "block"; foot.style.margin = "0 auto 8px";
function label() { foot.textContent = x("amb_link"); }
label(); foot.onclick = ambassador;
var disc = document.getElementById("disc"); if (disc && disc.parentNode) disc.parentNode.insertBefore(foot, disc);
new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

window.BC_MONEY = { report: report, label: function () { return x("pdf") + (C.PAY_LINK && !unlocked() ? " · " + (C.PRICE || "") : ""); }, ambassador: ambassador };
})();
