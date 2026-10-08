"""Middleware ASGI externo: `X-Request-Id`, cabeceras de seguridad, log de la petición y error
interno genérico.

AV-33: toda respuesta lleva `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` (el token de subida viaja en la query) y `X-Request-Id` (UUID v4).
Excepción (SDK-05): un recurso del motor servido con éxito en `/sdk/v1/` conserva su `Cache-Control`
inmutable; sus errores siguen con `no-store`.
AV-29: una excepción no controlada se convierte aquí en 500 `internal-error` sin traza ni mensaje,
antes de llegar al `ServerErrorMiddleware` de Starlette (que la registraría con su traza).
AV-32: una línea de log por petición con `route` como plantilla; nunca la ruta pedida, la query, las
cabeceras ni el cuerpo.
"""

import logging
import time
import uuid
from typing import Any

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errores import TIPO_PROBLEMA, cuerpo_problema

PREFIJO_SDK = "/sdk/v1/"

CABECERAS_SEGURIDAD = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}

log = logging.getLogger("lector.http")


def plantilla_de_ruta(scope: Scope) -> str | None:
    """Plantilla (`/v1/validations/{id}`) de la primera ruta que casa con la ruta pedida, o `None`."""
    aplicacion = scope.get("app")
    rutas = getattr(getattr(aplicacion, "router", None), "routes", ())
    for ruta in rutas:
        regex = getattr(ruta, "path_regex", None)
        if regex is not None and regex.match(scope.get("path", "")):
            return getattr(ruta, "path", None)
    return None


class MiddlewareSeguridad:
    def __init__(self, app: ASGIApp, base_tipos_problema: str) -> None:
        self.app = app
        self.base_tipos_problema = base_tipos_problema

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inicio = time.perf_counter()
        request_id = str(uuid.uuid4())
        estado_peticion: dict[str, Any] = scope.setdefault("state", {})
        estado_peticion["request_id"] = request_id
        respuesta: dict[str, Any] = {"iniciada": False, "status": None}

        async def enviar(mensaje: Message) -> None:
            if mensaje["type"] == "http.response.start":
                respuesta["iniciada"] = True
                respuesta["status"] = mensaje["status"]
                cabeceras = MutableHeaders(scope=mensaje)
                inmutable = (
                    mensaje["status"] == 200
                    and scope.get("path", "").startswith(PREFIJO_SDK)
                    and "cache-control" in cabeceras
                )
                for nombre, valor in CABECERAS_SEGURIDAD.items():
                    if not (inmutable and nombre == "Cache-Control"):
                        cabeceras[nombre] = valor
                cabeceras["X-Request-Id"] = request_id
            await send(mensaje)

        try:
            await self.app(scope, receive, enviar)
        except Exception:  # noqa: BLE001 - frontera: ninguna traza ni mensaje sale del proceso
            log.error("error_interno", extra={"campos": self._campos(scope, request_id)})
            if not respuesta["iniciada"]:
                await self._enviar_error_interno(enviar, request_id)
        finally:
            campos = self._campos(scope, request_id)
            campos["status"] = respuesta["status"]
            campos["duration_ms"] = round((time.perf_counter() - inicio) * 1000, 3)
            log.info("peticion", extra={"campos": campos})

    @staticmethod
    def _campos(scope: Scope, request_id: str) -> dict[str, Any]:
        estado_peticion = scope.get("state", {})
        cliente = estado_peticion.get("cliente")
        campos: dict[str, Any] = {
            "request_id": request_id,
            "method": scope.get("method"),
            "route": plantilla_de_ruta(scope),
            "sandbox": estado_peticion.get("sandbox", getattr(cliente, "sandbox", None)),
        }
        if estado_peticion.get("validation_id"):
            campos["validation_id"] = estado_peticion["validation_id"]
        return campos

    async def _enviar_error_interno(self, enviar: Any, request_id: str) -> None:
        cuerpo = cuerpo_problema(self.base_tipos_problema, 500, "internal-error", request_id)
        await enviar(
            {
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", TIPO_PROBLEMA.encode()),
                    (b"content-length", str(len(cuerpo)).encode()),
                ],
            }
        )
        await enviar({"type": "http.response.body", "body": cuerpo})
