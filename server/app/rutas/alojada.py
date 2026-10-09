"""Página alojada `GET /v/{token}` e intercambio `POST /v/{token}/inicio` (sdk-integracion, SDK-14,
decisiones 7 y 8).  La página es la compilación de `apps/alojada` (núcleo `@lector-cedula/web`,
motor desde `/sdk/v1/`). El servidor valida el token antes de entregar el HTML e inserta solo la
configuración mínima de la sesión: estado, `id`, `return_url`, versión del texto de autorización y
tipo de documento. Nunca el token de subida, la clave ni datos del documento. Un token inválido,
vencido o de una validación no pendiente recibe el mismo HTML con `estado: invalida` (pantalla
`sesion-invalida`, sin cámara). Toda respuesta lleva `no-store` y `no-referrer` (`app.seguridad`) y
una CSP con nonce por petición, sin `unsafe-eval` (solo `wasm-unsafe-eval`) ni `unsafe-inline`.
`POST /v/{token}/inicio` entrega `{validation_id, upload}` y marca la validación como sesión del SDK
(tarea 4.3: la subida admite una sola cara). Solo desde el origen de `URL_PUBLICA` (la página
alojada) o los de la clave creadora.
"""

import json
import secrets
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import Response

from app.almacen import Validacion
from app.auth import exigir_origen
from app.config import Config
from app.errores import ErrorApi
from app.representacion import instante, url_de_subida
from app.token_alojado import verificar_token_alojado

# Documentos del contrato que son tarjeta de identidad (menor de edad): aviso reforzado. Hoy el contrato solo
# admite cédulas; el aviso reforzado queda listo para cuando se añada el tipo.
DOCUMENTOS_MENORES: frozenset[str] = frozenset()


def origen_publico(config: Config) -> str:
    partes = urlsplit(config.url_publica)
    return f"{partes.scheme}://{partes.netloc}"


def origenes_de_la_sesion(config: Config, validacion: Validacion) -> tuple[str, ...]:
    """Origen de la página alojada más los de la clave creadora."""
    creadora = config.claves.get(validacion.propietario)
    propios = config.origenes_de(creadora) if creadora is not None else ()
    return (origen_publico(config), *propios)


def csp(nonce: str) -> str:
    return "; ".join(
        (
            "default-src 'none'",
            f"script-src 'nonce-{nonce}' 'wasm-unsafe-eval' blob:",
            f"style-src 'nonce-{nonce}'",
            "worker-src blob:",
            "connect-src 'self' blob: data:",
            "img-src 'self' blob: data:",
            "media-src 'self' blob: mediastream:",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
        )
    )


def _validacion_de(request: Request, token: str) -> tuple[str, Validacion | None]:
    estado = request.app.state
    resultado, id_validacion = verificar_token_alojado(
        estado.config.secreto_subida, token, estado.puertos.reloj.ahora()
    )
    if resultado != "valido" or id_validacion is None:
        return resultado, None
    return resultado, estado.servicio.obtener(id_validacion, propietario=None)


def _configuracion(validacion: Validacion | None) -> dict[str, object]:
    if validacion is None or validacion.status != "pending":
        return {"estado": "invalida"}
    menor = validacion.document_type in DOCUMENTOS_MENORES
    return {
        "estado": "valida",
        "validation_id": validacion.id,
        "return_url": validacion.return_url,
        "version_texto": validacion.autorizacion.get("version_texto"),
        "documento": "tarjeta-identidad" if menor else "cedula",
    }


def _json_en_html(datos: dict[str, object]) -> str:
    # Dentro de <script type="application/json">: ningún `<`, `>` ni `&` literal.
    texto = json.dumps(datos, ensure_ascii=True, separators=(",", ":"))
    return texto.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def registrar(aplicacion: FastAPI) -> None:
    @aplicacion.get("/v/{token}")
    async def pagina_alojada(token: str, request: Request) -> Response:
        try:
            plantilla = request.app.state.config.pagina_alojada.read_text(encoding="utf-8")
        except OSError:
            raise ErrorApi(503, "service-unavailable") from None
        _, validacion = _validacion_de(request, token)
        configuracion = _configuracion(validacion)
        nonce = secrets.token_urlsafe(18)
        html = plantilla.replace("__CONFIG__", _json_en_html(configuracion)).replace("__NONCE__", nonce)
        return Response(
            content=html,
            status_code=200 if configuracion["estado"] == "valida" else 404,
            media_type="text/html; charset=utf-8",
            headers={"Content-Security-Policy": csp(nonce), "Cross-Origin-Opener-Policy": "same-origin"},
        )

    @aplicacion.post("/v/{token}/inicio")
    async def inicio_alojado(token: str, request: Request) -> Response:
        config: Config = request.app.state.config
        resultado, validacion = _validacion_de(request, token)
        if resultado == "vencido":
            raise ErrorApi(403, "upload-token-expired")
        if validacion is None:
            raise ErrorApi(403, "upload-token-invalid")
        request.state.sandbox = validacion.sandbox
        request.state.validation_id = validacion.id
        exigir_origen(request, origenes_de_la_sesion(config, validacion))
        if validacion.status != "pending" or validacion.procesando:
            raise ErrorApi(409, "validation-not-pending")
        validacion.sesion_alojada = True
        cuerpo = {
            "validation_id": validacion.id,
            "upload": {
                "url": url_de_subida(config, validacion),
                "expires_at": instante(validacion.subida_vence_en),
            },
        }
        return Response(content=json.dumps(cuerpo), media_type="application/json")
