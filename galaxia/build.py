"""Genera dist/index.html (juego completo en un archivo) y dist/worker.js (servidor)."""
import os, sys
root = os.path.dirname(os.path.abspath(__file__))
server_url = sys.argv[1] if len(sys.argv) > 1 else ""
eng = open(os.path.join(root, "src/engine.js"), encoding="utf-8").read()
html = open(os.path.join(root, "client/index.html"), encoding="utf-8").read()
assert html.count("/*ENGINE*/") == 1 and html.count('"/*SERVER*/"') == 1
html = html.replace("/*ENGINE*/", eng)
if server_url:
    html = html.replace('"/*SERVER*/"', '"%s"' % server_url)
os.makedirs(os.path.join(root, "dist"), exist_ok=True)
open(os.path.join(root, "dist/index.html"), "w", encoding="utf-8").write(html)
srv = open(os.path.join(root, "src/server.js"), encoding="utf-8").read()
open(os.path.join(root, "dist/worker.js"), "w", encoding="utf-8").write(eng + "\n" + srv)
print("ok", len(html), "bytes html")
