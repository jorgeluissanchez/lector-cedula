"""Errores RFC 9457 centralizados (AV-29, decisión 13).

Reglas: `title` y `detail` son textos fijos por tipo de problema; nunca se usa el mensaje de una
excepción ni el valor enviado por el cliente. Los errores de Pydantic se traducen a `{pointer, code}`
sin `input` ni `ctx`.
"""

import json
import re
import uuid
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

TIPO_PROBLEMA = "application/problem+json"

# slug -> (title, detail). Textos fijos: no reproducen nada del cliente.
PROBLEMAS: dict[str, tuple[str, str]] = {
    "invalid-request": ("Solicitud inválida", "El cuerpo no cumple el contrato. Revise `errors`."),
    "unauthorized": ("No autorizado", "Falta la clave de API o no es válida."),
    "not-found": (
        "Recurso no encontrado",
        "El recurso solicitado no existe o no está disponible para esta clave.",
    ),
    "method-not-allowed": ("Método no permitido", "El recurso no admite este método. Revise `Allow`."),
    "request-too-large": ("Solicitud demasiado grande", "El cuerpo supera el tamaño máximo admitido."),
    "unsupported-media-type": ("Tipo de contenido no admitido", "El tipo de contenido no es el esperado."),
    "rate-limited": ("Demasiadas peticiones", "Se superó el límite de peticiones. Revise `Retry-After`."),
    "not-implemented": ("No implementado", "La operación aún no está disponible."),
    "internal-error": ("Error interno", "Ocurrió un error interno. Use `request_id` para reportarlo."),
    "service-unavailable": ("Servicio no disponible", "El servicio no está disponible en este momento."),
    "http-error": ("Error de la petición", "La petición no se pudo atender."),
    "invalid-idempotency-key": (
        "Clave de idempotencia inválida",
        "`Idempotency-Key` debe tener de 1 a 255 caracteres ASCII imprimibles.",
    ),
    "idempotency-key-reused": (
        "Clave de idempotencia reutilizada",
        "La clave de idempotencia ya se usó con otro cuerpo.",
    ),
    "idempotency-key-in-progress": (
        "Creación en curso",
        "Hay una creación en curso con la misma clave de idempotencia. Reintente más tarde.",
    ),
    "upload-token-invalid": (
        "Token de subida inválido",
        "El token de subida no es válido para este recurso.",
    ),
    "upload-token-expired": ("Token de subida vencido", "El token de subida venció."),
    "validation-not-pending": (
        "La validación no admite subidas",
        "La validación ya no está en `pending`; cada validación admite una sola subida.",
    ),
    "image-too-large": ("Imagen demasiado grande", "Una imagen supera el tamaño máximo. Revise `errors`."),
    "unsupported-image-type": (
        "Tipo de imagen no admitido",
        "Cada imagen debe ser JPEG o PNG y coincidir con el tipo declarado. Revise `errors`.",
    ),
    "engine-unavailable": (
        "Motor no disponible",
        "El modo live no tiene motor de procesamiento configurado.",
    ),
}

# Estados HTTP que levanta Starlette o FastAPI por su cuenta -> slug.
SLUG_POR_ESTADO = {
    400: "invalid-request",
    401: "unauthorized",
    404: "not-found",
    405: "method-not-allowed",
    413: "request-too-large",
    415: "unsupported-media-type",
    422: "invalid-request",
    429: "rate-limited",
    501: "not-implemented",
    503: "service-unavailable",
}

# Tipos de error de Pydantic -> `code` del contrato.
CODIGO_POR_TIPO = {
    "missing": "required",
    "extra_forbidden": "unexpected_field",
    "literal_error": "invalid_value",
    "enum": "invalid_value",
    "json_invalid": "invalid_json",
    "string_pattern_mismatch": "invalid_format",
    "string_too_short": "invalid_format",
    "string_too_long": "invalid_format",
    "datetime_parsing": "invalid_format",
    "datetime_from_date_parsing": "invalid_format",
    "timezone_aware": "invalid_format",
}
# Códigos que las validaciones propias emiten tal cual (PydanticCustomError).
CODIGOS_PROPIOS = frozenset(
    {
        "invalid_type",
        "invalid_value",
        "invalid_format",
        "must_be_true",
        "required_for_face_match",
        "in_future",
        "incompatible_scenario",
        "sandbox_only",
        "invalid_webhook_url",
    }
)

# Solo se reproducen en `pointer` los nombres de campo con forma de identificador del contrato
# (minúsculas y guion bajo). Un nombre con dígitos, mayúsculas u otros caracteres puede llevar datos
# del cliente (AV-29: "campo_9999123456"); el puntero se corta en su padre.
_SEGMENTO_SEGURO = re.compile(r"^[a-z_]{1,64}$")


class ErrorApi(Exception):
    """Error de la API con su tipo de problema. No lleva mensajes libres."""

    def __init__(
        self,
        estado: int,
        slug: str,
        errores: Sequence[Mapping[str, str]] | None = None,
        cabeceras: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(slug)
        self.estado = estado
        self.slug = slug
        self.errores = list(errores) if errores is not None else None
        self.cabeceras = dict(cabeceras or {})


def cuerpo_problema(
    base_tipos: str,
    estado: int,
    slug: str,
    request_id: str,
    errores: Sequence[Mapping[str, str]] | None = None,
) -> bytes:
    titulo, detalle = PROBLEMAS.get(slug, PROBLEMAS["http-error"])
    problema: dict[str, Any] = {
        "type": f"{base_tipos}{slug}",
        "title": titulo,
        "status": estado,
        "detail": detalle,
        "code": slug,
        "request_id": request_id,
    }
    if errores is not None:
        problema["errors"] = [{"pointer": e["pointer"], "code": e["code"]} for e in errores]
    return json.dumps(problema, ensure_ascii=False, separators=(",", ":")).encode()


def respuesta_problema(
    request: Request,
    estado: int,
    slug: str,
    errores: Sequence[Mapping[str, str]] | None = None,
    cabeceras: Mapping[str, str] | None = None,
) -> Response:
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    base = request.app.state.config.base_tipos_problema
    return Response(
        content=cuerpo_problema(base, estado, slug, request_id, errores),
        status_code=estado,
        headers=dict(cabeceras or {}),
        media_type=TIPO_PROBLEMA,
    )


def puntero(ubicacion: Sequence[int | str]) -> str:
    """JSON Pointer (RFC 6901) sobre el cuerpo a partir de `loc` de Pydantic, sin el prefijo `body`.
    Se corta en el primer segmento que no es seguro reproducir."""
    segmentos: list[str] = []
    for segmento in ubicacion:
        if isinstance(segmento, int) and not isinstance(segmento, bool):
            segmentos.append(str(segmento))
        elif isinstance(segmento, str) and _SEGMENTO_SEGURO.fullmatch(segmento):
            segmentos.append(segmento)
        else:
            break
    return "".join(f"/{s}" for s in segmentos)


def _codigo(tipo: str) -> str:
    if tipo in CODIGO_POR_TIPO:
        return CODIGO_POR_TIPO[tipo]
    if tipo in CODIGOS_PROPIOS:
        return tipo
    if tipo.endswith("_type") or tipo.endswith("_parsing"):
        return "invalid_type"
    return "invalid_value"


def traducir_errores(errores: Iterable[Mapping[str, Any]]) -> list[dict[str, str]]:
    """Traduce errores de Pydantic a `{pointer, code}` sin duplicados y en orden."""
    traducidos: list[dict[str, str]] = []
    for error in errores:
        tipo = str(error.get("type", ""))
        ubicacion = list(error.get("loc", ()))
        if ubicacion and ubicacion[0] in ("body", "query", "header", "path"):
            ubicacion = ubicacion[1:]
        if tipo == "json_invalid":
            ubicacion = []
        entrada = {"pointer": puntero(ubicacion), "code": _codigo(tipo)}
        if entrada not in traducidos:
            traducidos.append(entrada)
    return traducidos


def _metodos_permitidos(request: Request) -> str:
    """Métodos de todas las rutas cuya plantilla casa con la ruta pedida, en orden de registro, sin
    HEAD (Starlette solo informa los de la primera ruta que casa)."""
    metodos: list[str] = []
    for ruta in request.app.router.routes:
        regex = getattr(ruta, "path_regex", None)
        if regex is None or not regex.match(request.url.path):
            continue
        for metodo in getattr(ruta, "methods", None) or ():
            if metodo != "HEAD" and metodo not in metodos:
                metodos.append(metodo)
    return ", ".join(metodos)


async def _manejar_error_api(request: Request, exc: ErrorApi) -> Response:
    return respuesta_problema(request, exc.estado, exc.slug, exc.errores, exc.cabeceras)


async def _manejar_validacion(request: Request, exc: RequestValidationError) -> Response:
    return respuesta_problema(request, 422, "invalid-request", traducir_errores(exc.errors()))


async def _manejar_http(request: Request, exc: StarletteHTTPException) -> Response:
    estado = exc.status_code
    slug = SLUG_POR_ESTADO.get(estado, "http-error")
    cabeceras: dict[str, str] = {}
    if estado == 405:
        cabeceras["Allow"] = _metodos_permitidos(request)
    if estado == 401:
        cabeceras["WWW-Authenticate"] = "Bearer"
    errores = [] if slug == "invalid-request" else None
    return respuesta_problema(request, estado, slug, errores, cabeceras)


def registrar_manejadores(aplicacion: FastAPI) -> None:
    aplicacion.add_exception_handler(ErrorApi, _manejar_error_api)  # type: ignore[arg-type]
    aplicacion.add_exception_handler(RequestValidationError, _manejar_validacion)  # type: ignore[arg-type]
    aplicacion.add_exception_handler(StarletteHTTPException, _manejar_http)  # type: ignore[arg-type]
