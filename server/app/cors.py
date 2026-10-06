"""CORS solo para la ruta de subida (AV-07): el navegador del titular sube las imágenes directamente
a `upload.url`. Las demás rutas usan la clave secreta del cliente y nunca se llaman desde un navegador,
así que no anuncian CORS. El preflight responde 204 sin cuerpo; un origen no permitido no recibe
`Access-Control-Allow-Origin`.

Es un middleware ASGI (no una ruta `OPTIONS`) para no alterar la paridad de rutas con el contrato.
"""

import re

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

RUTA_SUBIDA = re.compile(r"^/v1/validations/[^/]+/images$")
METODOS = "POST"
CABECERAS = "Authorization, Content-Type"
VIGENCIA_PREFLIGHT_S = "600"


class MiddlewareCorsSubida:
    def __init__(self, app: ASGIApp, origenes: tuple[str, ...]) -> None:
        self.app = app
        self.origenes = frozenset(origenes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not RUTA_SUBIDA.fullmatch(scope.get("path", "")):
            await self.app(scope, receive, send)
            return
        cabeceras = Headers(scope=scope)
        origen = cabeceras.get("origin")
        permitido = origen is not None and origen in self.origenes

        if scope["method"] == "OPTIONS" and "access-control-request-method" in cabeceras:
            respuesta = [(b"vary", b"Origin")]
            if permitido and origen is not None:
                respuesta += [
                    (b"access-control-allow-origin", origen.encode("latin-1")),
                    (b"access-control-allow-methods", METODOS.encode()),
                    (b"access-control-allow-headers", CABECERAS.encode()),
                    (b"access-control-max-age", VIGENCIA_PREFLIGHT_S.encode()),
                ]
            await send({"type": "http.response.start", "status": 204, "headers": respuesta})
            await send({"type": "http.response.body", "body": b""})
            return

        async def enviar(mensaje: Message) -> None:
            if mensaje["type"] == "http.response.start":
                salida = MutableHeaders(scope=mensaje)
                salida.append("Vary", "Origin")
                if permitido and origen is not None:
                    salida["Access-Control-Allow-Origin"] = origen
            await send(mensaje)

        await self.app(scope, receive, enviar)
