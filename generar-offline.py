#!/usr/bin/env python3
"""Genera data/datos-offline.js a partir de los JSON.

Sirve para que el juego también funcione abriendo index.html con doble clic
(sin servidor), donde el navegador bloquea la lectura de archivos JSON.
Ejecutar después de editar preguntas.json o config.json:

    python3 generar-offline.py
"""
import json
import pathlib

base = pathlib.Path(__file__).parent / "data"
config = json.loads((base / "config.json").read_text(encoding="utf-8"))
preguntas = json.loads((base / "preguntas.json").read_text(encoding="utf-8"))

contenido = (
    "/* Generado automaticamente por generar-offline.py. No editar a mano. */\n"
    "window.DATOS_OFFLINE = "
    + json.dumps({"config": config, "preguntas": preguntas}, ensure_ascii=False, indent=2)
    + ";\n"
)
(base / "datos-offline.js").write_text(contenido, encoding="utf-8")
print("data/datos-offline.js actualizado")
