"""`GET /sdk/v1/{archivo}`: recursos del motor del componente web (sdk-integracion, SDK-05).

Los archivos llevan hash en el nombre, así que se sirven inmutables un año. El CORS por clave lo
añade `app.cors.MiddlewareCors`. Hasta la fase 3 el directorio está vacío (`server/sdk/v1/`) y toda
petición responde 404. Solo se sirven archivos regulares del directorio, con nombres simples: ni
subdirectorios, ni archivos ocultos, ni `..`. Ningún recurso es una imagen ni un resultado.
"""

import json
import re
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import Response

from app.errores import ErrorApi

INMUTABLE = "public, max-age=31536000, immutable"
_NOMBRE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$")
TIPOS = {
    ".wasm": "application/wasm",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
}
MANIFIESTO = "manifest.json"
# Solo con manifiesto válido; `manifest.json` cambia entre versiones y no se sirve inmutable.
TIPOS_LISTADOS = {
    ".json": "application/json",
    ".traineddata": "application/octet-stream",
    ".txt": "text/plain; charset=utf-8",
}


def _listados(directorio: Path) -> frozenset[str]:
    """Nombres que lista el `manifest.json` del directorio (assets de @lector-cedula/web, SDK-39)."""
    try:
        datos = json.loads((directorio / MANIFIESTO).read_text(encoding="utf-8"))
        return frozenset(str(r["archivo"]) for r in datos["recursos"])
    except (OSError, ValueError, KeyError, TypeError):
        return frozenset()


def _archivo(directorio: Path, nombre: str) -> Path | None:
    # Extensiones del motor siempre; manifiesto, modelo y avisos solo si el manifiesto los lista
    # (sdk-integracion, fase 4): nada de imágenes, HTML ni otros archivos del directorio.
    if len(nombre) > 128 or not _NOMBRE.fullmatch(nombre):
        return None
    sufijo = Path(nombre).suffix
    if sufijo not in TIPOS:
        listados = _listados(directorio)
        if sufijo not in TIPOS_LISTADOS or not listados or (nombre != MANIFIESTO and nombre not in listados):
            return None
    ruta = directorio / nombre
    try:
        if not ruta.is_file() or ruta.resolve().parent != directorio.resolve():
            return None
    except OSError:
        return None
    return ruta


def registrar(aplicacion: FastAPI) -> None:
    @aplicacion.get("/sdk/v1/{archivo}")
    async def recurso_sdk(archivo: str, request: Request) -> Response:
        ruta = _archivo(request.app.state.config.directorio_sdk, archivo)
        if ruta is None:
            raise ErrorApi(404, "not-found")
        return Response(
            content=ruta.read_bytes(),
            media_type={**TIPOS, **TIPOS_LISTADOS}[ruta.suffix],
            headers={
                "Cache-Control": "no-cache" if archivo == MANIFIESTO else INMUTABLE,
                "Cross-Origin-Resource-Policy": "cross-origin",
            },
        )
