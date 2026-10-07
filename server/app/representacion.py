"""Representación JSON de una validación (esquema `Validation` del contrato) e instantes RFC 3339."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from app.almacen import Validacion
from app.config import Config
from app.token_subida import emitir_token

_EPOCA = datetime(1970, 1, 1, tzinfo=UTC)


def instante(segundos: float) -> str:
    """Instante unix en RFC 3339 UTC con `Z`; milisegundos solo si el instante no es entero."""
    milisegundos = round(segundos * 1000)
    momento = _EPOCA + timedelta(milliseconds=milisegundos)
    if milisegundos % 1000 == 0:
        return momento.strftime("%Y-%m-%dT%H:%M:%SZ")
    return momento.strftime("%Y-%m-%dT%H:%M:%S.") + f"{milisegundos % 1000:03d}Z"


def fecha_hora_utc(momento: datetime) -> str:
    """`datetime` con zona en RFC 3339 UTC con `Z`, conservando los microsegundos si los hay."""
    utc = momento.astimezone(UTC)
    # strftime("%Y") no rellena con ceros los años < 1000 en Linux: el año se escribe a mano.
    texto = f"{utc.year:04d}-{utc:%m-%dT%H:%M:%S}"
    if utc.microsecond:
        texto += f".{utc.microsecond:06d}".rstrip("0")
    return texto + "Z"


def url_de_subida(config: Config, validacion: Validacion) -> str:
    token = emitir_token(config.secreto_subida, validacion.id, validacion.subida_vence_en)
    return f"{config.url_publica}/v1/validations/{validacion.id}/images?token={token}"


def representar(validacion: Validacion, config: Config) -> dict[str, Any]:
    pendiente = validacion.status == "pending"
    completada = validacion.completada_en
    return {
        "id": validacion.id,
        "object": "validation",
        "sandbox": validacion.sandbox,
        "document_type": validacion.document_type,
        "face_match": validacion.face_match,
        "status": validacion.status,
        "declined_reason": validacion.declined_reason,
        "checks": [dict(check, reasons=list(check["reasons"])) for check in validacion.checks],
        "document": json.loads(json.dumps(validacion.document)) if validacion.document else None,
        "autorizacion": dict(validacion.autorizacion),
        "upload": (
            {
                "url": url_de_subida(config, validacion),
                "expires_at": instante(validacion.subida_vence_en),
            }
            if pendiente
            else None
        ),
        "webhook_url": validacion.webhook_url,
        "created_at": instante(validacion.creada_en),
        "updated_at": instante(validacion.actualizada_en),
        "completed_at": instante(completada) if completada is not None else None,
        "expires_at": (
            instante(completada + config.retencion_resultados_s) if completada is not None else None
        ),
    }


def serializar(objeto: Any) -> bytes:
    """JSON compacto en UTF-8 (la Ñ viaja sin escapar). Mismos bytes para la misma entrada."""
    return json.dumps(objeto, ensure_ascii=False, separators=(",", ":")).encode()
