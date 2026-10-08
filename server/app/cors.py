"""CORS por clave (AV-07, sdk-integracion SDK-05 y SDK-16).

Solo dos rutas anuncian CORS:
- La subida (`upload.url`): el navegador del titular sube las imágenes directamente. El origen se
  admite solo si está en los `origenes` de la clave dueña de la validación (por el token firmado de la
  query) o de la clave de `Authorization`. Un token inválido no anuncia CORS.
- Los recursos del motor (`/sdk/v1/`): el origen se admite si está en los `origenes` de alguna clave.
Las demás rutas usan la clave secreta del cliente y nunca anuncian CORS. El preflight responde 204 sin
cuerpo; un origen no permitido no recibe `Access-Control-Allow-Origin`. El rechazo con 403
`origin-not-allowed` de las peticiones reales lo hacen las rutas (`app.auth.exigir_origen`).

Es un middleware ASGI (no una ruta `OPTIONS`) para no alterar la paridad de rutas con el contrato. La
configuración se lee de `scope["app"].state`, que Starlette fija antes de la pila de middlewares.
"""

import re
from collections.abc import Collection
from urllib.parse import parse_qs

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.auth import autenticar
from app.token_subida import verificar_token

RUTA_SUBIDA = re.compile(r"^/v1/validations/([^/]+)/images$")
PREFIJO_SDK = "/sdk/v1/"
METODOS = "POST"
CABECERAS = "Authorization, Content-Type"
VIGENCIA_PREFLIGHT_S = "600"


def _origenes_de_la_subida(scope: Scope, cabeceras: Headers, id_validacion: str) -> Collection[str]:
    estado = scope["app"].state
    config = estado.config
    autorizacion = cabeceras.get("authorization")
    if autorizacion is not None:
        cliente = autenticar(autorizacion, config.claves, config)
        return cliente.origenes if cliente is not None else ()
    tokens = parse_qs(scope.get("query_string", b"").decode("latin-1")).get("token", [])
    if len(tokens) != 1:
        return ()
    ahora = estado.puertos.reloj.ahora()
    if verificar_token(config.secreto_subida, id_validacion, tokens[0], ahora) == "invalido":
        return ()
    validacion = estado.almacen.obtener_sin_propietario(id_validacion)
    creadora = config.claves.get(validacion.propietario) if validacion is not None else None
    return config.origenes_de(creadora) if creadora is not None else ()


class MiddlewareCors:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        ruta = scope.get("path", "")
        subida = RUTA_SUBIDA.fullmatch(ruta)
        if subida is None and not ruta.startswith(PREFIJO_SDK):
            await self.app(scope, receive, send)
            return
        cabeceras = Headers(scope=scope)
        origen = cabeceras.get("origin")
        permitido = False
        if origen is not None:
            if subida is not None:
                permitido = origen in _origenes_de_la_subida(scope, cabeceras, subida.group(1))
            else:
                permitido = origen in scope["app"].state.config.origenes_de_alguna_clave()

        if (
            subida is not None
            and scope["method"] == "OPTIONS"
            and "access-control-request-method" in cabeceras
        ):
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
