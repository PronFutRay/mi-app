#!/usr/bin/env python3
"""Genera gpl-calc-it/index.html (italiano) y gpl-calc/index.html (español) desde template.html.
Uso:  python3 gpl-src/build.py   (editar siempre template.html y los textos de aquí)"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

IT = {
  "lang": "it", "locale": "it-IT", "site": "gpl-it",
  "title": "GPL Calc · Consegne GPL", "subtitle": "Calcolo consegne GPL con DAS",
  "sec_delivery": "Consegna", "das": "N° DAS", "das_ph": "Es. 26IT0000000000", "client": "Cliente", "address": "Indirizzo di consegna",
  "plate": "Targa autobotte", "driver": "Autista",
  "sec_measure": "Misure", "meter_start": "Contatore iniziale (L)", "meter_end": "Contatore finale (L)",
  "liters_label": "Litri erogati", "meter_hint": "Inserisci le letture del contatore oppure i litri direttamente.",
  "meter_auto": "Litri calcolati dal contatore (finale − iniziale).", "meter_bad": "La lettura finale deve essere maggiore di quella iniziale.",
  "rho15": "Densità a 15 °C (kg/L) · dal DAS",
  "sec_temp": "Temperatura del prodotto", "use_pos": "Usa la mia posizione", "city_ph": "Oppure cerca la città (es. Roma)", "search": "Cerca",
  "temp_hint": "Se il contatore indica la temperatura del prodotto, inseriscila a mano: è più precisa di quella ambiente.",
  "sec_tank": "Serbatoio del cliente", "tank_cap": "Capacità serbatoio (L)", "tank_cap_ph": "Es. 1000, 1750, 3000",
  "tank_before": "Livello prima (%)", "tank_limit": "Limite di riempimento (%)",
  "sec_excise": "Accisa", "use": "Uso del GPL", "use_heat": "Combustione / riscaldamento", "use_fuel": "Autotrazione (carburante)", "use_custom": "Altra aliquota",
  "rate": "Aliquota (€ per 1000 kg)",
  "excise_hint": "Aliquote nazionali ADM: riscaldamento 189,94458 €, autotrazione 267,77 € per 1000 kg. Verifica eventuali riduzioni (zone montane, usi agevolati) e aggiornamenti.",
  "hero_t": "Massa di GPL consegnata", "start_hint": "Inserisci i litri o le letture del contatore",
  "save": "Salva consegna", "pdf_one": "PDF consegna", "copy": "Copia riepilogo",
  "history": "Storico consegne", "csv": "Esporta CSV", "pdf_hist": "PDF storico", "clear": "Cancella",
  "foot": "Calcolo dalla densità a 15 °C del DAS corretta per la temperatura. A scopo informativo; fanno fede il contatore e il DAS.",
  "tx": {
    "start_hint": "Inserisci i litri o le letture del contatore", "results_here": "I risultati appariranno qui.",
    "l15": "Litri a 15 °C", "vs_real": "rispetto al volume misurato", "dens_at": "Densità a {t} °C", "ref15": "A 15 °C",
    "tank_after": "Livello dopo la consegna", "over_limit": "⚠ Supera il limite del {l} %", "within_limit": "Entro il limite del {l} %",
    "room": "Spazio fino al limite", "room_h": "Dal {p} % al {l} %",
    "excise": "Accisa", "pressure": "Pressione indicativa", "pressure_h": "Manometrica a questa temperatura",
    "meter_hint": "Inserisci le letture del contatore oppure i litri direttamente.", "meter_auto": "Litri calcolati dal contatore (finale − iniziale).",
    "meter_bad": "La lettura finale deve essere maggiore di quella iniziale.",
    "t_auto": "Ambiente", "t_pos": "la tua posizione", "t_cache": "Ultimo valore salvato", "t_default": "Riferimento 15 °C · offline",
    "t_manual": "Manuale", "t_reading": "Rilevo la temperatura…", "t_locating": "Rilevo la posizione…",
    "t_nopos": "Impossibile usare la posizione. Cerca la città o inserisci la temperatura.", "city_nf": "Città non trovata", "city_net": "Nessuna connessione per cercare la città",
    "h_date": "Data", "h_client": "Cliente", "h_liters": "Litri", "h_l15": "L 15 °C", "h_excise": "Accisa €", "h_count": "Consegne",
    "no_hist": "Nessuna consegna salvata.", "export_err": "Impossibile esportare il file", "need_liters": "Inserisci prima i litri", "no_data": "Nessun dato",
    "generated": "Generato il {d} alle {h}", "doc_title": "Documento di consegna GPL",
    "sec_delivery": "Consegna", "client": "Cliente", "address": "Indirizzo", "plate": "Targa autobotte", "driver": "Autista",
    "sec_measure": "Misure", "meter_start": "Contatore iniziale", "meter_end": "Contatore finale", "liters_label": "Litri erogati",
    "sec_temp": "Temperatura", "rho15": "Densità a 15 °C (DAS)", "hero_t": "Massa di GPL",
    "sec_tank": "Serbatoio del cliente", "tank_cap": "Capacità", "tank_before": "Livello prima", "tank_limit": "Limite di riempimento",
    "sec_excise": "Accisa", "use": "Uso", "rate": "Aliquota",
    "sign_drv": "Firma autista", "sign_cli": "Firma cliente",
    "doc_note": "Calcolo dalla densità a 15 °C del DAS corretta per la temperatura. Fanno fede il contatore e il DAS.",
    "file_one": "consegna-gpl", "hist_title": "GPL Calc · Storico consegne", "totals": "Totali", "file_hist": "storico-consegne-gpl",
    "saved": "Consegna salvata · pronta la prossima", "copied": "Riepilogo copiato",
    "csv_head": "Data;DAS;Cliente;Indirizzo;Targa;Autista;Contatore_iniziale;Contatore_finale;Litri;Temp_C;Densita_15C;Litri_15C;Kg;Accisa_EUR;Livello_prima_%;Livello_dopo_%",
    "file_csv": "storico-consegne-gpl", "confirm_clear": "Cancellare tutto lo storico?"
  }
}

ES = {
  "lang": "es", "locale": "es-ES", "site": "gpl",
  "title": "GPL Calc · Entregas de GPL", "subtitle": "Cálculo de entregas de GPL con DAS",
  "sec_delivery": "Entrega", "das": "N° DAS", "das_ph": "Ej. 26IT0000000000", "client": "Cliente", "address": "Dirección de entrega",
  "plate": "Matrícula cisterna", "driver": "Conductor",
  "sec_measure": "Medidas", "meter_start": "Contador inicial (L)", "meter_end": "Contador final (L)",
  "liters_label": "Litros descargados", "meter_hint": "Introduce las lecturas del contador o los litros directamente.",
  "meter_auto": "Litros calculados con el contador (final − inicial).", "meter_bad": "La lectura final debe ser mayor que la inicial.",
  "rho15": "Densidad a 15 °C (kg/L) · del DAS",
  "sec_temp": "Temperatura del producto", "use_pos": "Usar mi ubicación", "city_ph": "O busca la ciudad (ej. Roma)", "search": "Buscar",
  "temp_hint": "Si el contador indica la temperatura del producto, introdúcela a mano: es más precisa que la ambiente.",
  "sec_tank": "Depósito del cliente", "tank_cap": "Capacidad del depósito (L)", "tank_cap_ph": "Ej. 1000, 1750, 3000",
  "tank_before": "Nivel antes (%)", "tank_limit": "Límite de llenado (%)",
  "sec_excise": "Accisa (impuesto especial)", "use": "Uso del GPL", "use_heat": "Combustión / calefacción", "use_fuel": "Automoción (carburante)", "use_custom": "Otro tipo",
  "rate": "Tipo (€ por 1000 kg)",
  "excise_hint": "Tipos nacionales ADM (Italia): calefacción 189,94458 €, automoción 267,77 € por 1000 kg. Comprueba posibles reducciones (zonas de montaña, usos bonificados) y actualizaciones.",
  "hero_t": "Masa de GPL entregada", "start_hint": "Introduce los litros o las lecturas del contador",
  "save": "Guardar entrega", "pdf_one": "PDF entrega", "copy": "Copiar resumen",
  "history": "Historial de entregas", "csv": "Exportar CSV", "pdf_hist": "PDF historial", "clear": "Borrar",
  "foot": "Cálculo con la densidad a 15 °C del DAS corregida por temperatura. Informativo; valen el contador y el DAS.",
  "tx": {
    "start_hint": "Introduce los litros o las lecturas del contador", "results_here": "Los resultados aparecerán aquí.",
    "l15": "Litros a 15 °C", "vs_real": "respecto al volumen medido", "dens_at": "Densidad a {t} °C", "ref15": "A 15 °C",
    "tank_after": "Nivel tras la entrega", "over_limit": "⚠ Supera el límite del {l} %", "within_limit": "Dentro del límite del {l} %",
    "room": "Espacio hasta el límite", "room_h": "Del {p} % al {l} %",
    "excise": "Accisa", "pressure": "Presión orientativa", "pressure_h": "Manométrica a esta temperatura",
    "meter_hint": "Introduce las lecturas del contador o los litros directamente.", "meter_auto": "Litros calculados con el contador (final − inicial).",
    "meter_bad": "La lectura final debe ser mayor que la inicial.",
    "t_auto": "Ambiente", "t_pos": "tu ubicación", "t_cache": "Último valor guardado", "t_default": "Referencia 15 °C · sin conexión",
    "t_manual": "Manual", "t_reading": "Obteniendo temperatura…", "t_locating": "Obteniendo ubicación…",
    "t_nopos": "No se pudo usar la ubicación. Busca la ciudad o escribe la temperatura.", "city_nf": "Ciudad no encontrada", "city_net": "Sin conexión para buscar la ciudad",
    "h_date": "Fecha", "h_client": "Cliente", "h_liters": "Litros", "h_l15": "L 15 °C", "h_excise": "Accisa €", "h_count": "Entregas",
    "no_hist": "No hay entregas guardadas.", "export_err": "No se pudo exportar el archivo", "need_liters": "Introduce primero los litros", "no_data": "Sin datos",
    "generated": "Generado el {d} a las {h}", "doc_title": "Documento de entrega de GPL",
    "sec_delivery": "Entrega", "client": "Cliente", "address": "Dirección", "plate": "Matrícula cisterna", "driver": "Conductor",
    "sec_measure": "Medidas", "meter_start": "Contador inicial", "meter_end": "Contador final", "liters_label": "Litros descargados",
    "sec_temp": "Temperatura", "rho15": "Densidad a 15 °C (DAS)", "hero_t": "Masa de GPL",
    "sec_tank": "Depósito del cliente", "tank_cap": "Capacidad", "tank_before": "Nivel antes", "tank_limit": "Límite de llenado",
    "sec_excise": "Accisa", "use": "Uso", "rate": "Tipo",
    "sign_drv": "Firma conductor", "sign_cli": "Firma cliente",
    "doc_note": "Cálculo con la densidad a 15 °C del DAS corregida por temperatura. Valen el contador y el DAS.",
    "file_one": "entrega-gpl", "hist_title": "GPL Calc · Historial de entregas", "totals": "Totales", "file_hist": "historial-entregas-gpl",
    "saved": "Entrega guardada · lista la siguiente", "copied": "Resumen copiado",
    "csv_head": "Fecha;DAS;Cliente;Direccion;Matricula;Conductor;Contador_inicial;Contador_final;Litros;Temp_C;Densidad_15C;Litros_15C;Kg;Accisa_EUR;Nivel_antes_%;Nivel_despues_%",
    "file_csv": "historial-entregas-gpl", "confirm_clear": "¿Borrar todo el historial?"
  }
}

tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
for d, out in ((IT, "gpl-calc-it"), (ES, "gpl-calc")):
    s = tpl.replace("{{TXJSON}}", json.dumps(d["tx"], ensure_ascii=False))
    def sub(m):
        k = m.group(1)
        if k not in d: raise KeyError(k)
        return str(d[k]).replace("&", "&amp;").replace("<", "&lt;")
    s = re.sub(r"\{\{(\w+)\}\}", sub, s)
    open(os.path.join(ROOT, out, "index.html"), "w", encoding="utf-8").write(s)
    print("ok", out)
