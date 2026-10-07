"""Modelo de la petición de creación, estricto y con los mismos dominios que el contrato.

Dos etapas: Pydantic comprueba forma y tipos (campos no declarados, enumerados, formatos) y
`reglas_de_creacion` comprueba las reglas que dependen del valor, del cliente o del reloj
(AV-04, AV-05, AV-06, AV-20, AV-28). Ninguna etapa reproduce valores del cliente en los errores.
"""

import ipaddress
import re
from datetime import UTC, datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr

TipoDocumento = Literal["co_national-id-2000", "co_national-id-2020"]
EscenarioSandbox = Literal[
    "success",
    "failure_image_quality",
    "failure_document_unreadable",
    "review_data_consistency",
    "review_document_liveness",
    "failure_document_expired",
    "review_face_mismatch",
]

# RFC 3339 `date-time` (con `T` y zona obligatoria). Los valores imposibles (mes 13) se rechazan al
# convertir, en `reglas_de_creacion`.
_RFC3339 = r"^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$"
MARGEN_RELOJ_S = 300
LONGITUD_MAXIMA_URL = 2048
# Nombre DNS con al menos un punto y TLD que empieza por letra: descarta IPs en cualquier notación
# (`127.0.0.1`, `2130706433`, `0x7f.1`) y nombres sin dominio como `localhost`.
_HOST_DNS = re.compile(
    r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$"
)


class Autorizacion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    datos: StrictBool
    sensibles: StrictBool = False
    version_texto: StrictStr = Field(pattern=r"^[A-Za-z0-9._-]{1,64}$")
    otorgada_en: StrictStr = Field(pattern=_RFC3339)


class CrearValidacion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    document_type: TipoDocumento
    autorizacion: Autorizacion
    face_match: StrictBool = False
    # Ambos son cadenas en el contrato: un `null` explícito se rechaza en `reglas_de_creacion`.
    webhook_url: StrictStr | None = None
    sandbox_scenario: EscenarioSandbox | None = None


def convertir_rfc3339(texto: str) -> datetime | None:
    """`datetime` con zona de un texto RFC 3339, o `None` si la fecha u hora no existen."""
    coincidencia = re.fullmatch(_RFC3339, texto)
    if coincidencia is None:
        return None
    anio, mes, dia, hora, minuto, segundo, fraccion, zona = coincidencia.groups()
    if zona in ("Z", "z"):
        tz = UTC
    else:
        signo = 1 if zona[0] == "+" else -1
        horas, minutos = int(zona[1:3]), int(zona[4:6])
        if horas > 23 or minutos > 59:
            return None
        tz = timezone(signo * timedelta(hours=horas, minutes=minutos))
    microsegundos = int((fraccion or ".0")[1:7].ljust(6, "0"))
    try:
        momento = datetime(
            int(anio), int(mes), int(dia), int(hora), int(minuto), int(segundo), microsegundos, tzinfo=tz
        )
        momento.astimezone(UTC)  # fuera de rango en UTC (antes del año 1 o después del 9999)
    except (ValueError, OverflowError):
        return None
    return momento


def url_de_webhook_valida(url: str) -> bool:
    """AV-28 al crear: `https`, sin credenciales, host DNS (nunca una IP literal), como máximo 2048."""
    if len(url) > LONGITUD_MAXIMA_URL or any(c <= " " or c == "\x7f" for c in url):
        return False
    try:
        partes = urlsplit(url)
        puerto = partes.port
    except ValueError:
        return False
    host = partes.hostname
    # El contrato fija el patrón `^https://` (sensible a mayúsculas).
    if not url.startswith("https://") or host is None or "@" in partes.netloc:
        return False
    if puerto == 0 or partes.netloc.startswith("["):
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return _HOST_DNS.fullmatch(host) is not None


def reglas_de_creacion(
    cuerpo: CrearValidacion, sandbox: bool, ahora: float
) -> tuple[list[dict[str, str]], datetime | None]:
    """Errores `{pointer, code}` de las reglas de valor y la `otorgada_en` ya convertida."""
    errores: list[dict[str, str]] = []
    autorizacion = cuerpo.autorizacion
    if autorizacion.datos is not True:
        errores.append({"pointer": "/autorizacion/datos", "code": "must_be_true"})
    if cuerpo.face_match and autorizacion.sensibles is not True:
        errores.append({"pointer": "/autorizacion/sensibles", "code": "required_for_face_match"})
    otorgada = convertir_rfc3339(autorizacion.otorgada_en)
    if otorgada is None:
        errores.append({"pointer": "/autorizacion/otorgada_en", "code": "invalid_format"})
    elif otorgada.timestamp() > ahora + MARGEN_RELOJ_S:
        errores.append({"pointer": "/autorizacion/otorgada_en", "code": "in_future"})

    presentes = cuerpo.model_fields_set
    if "webhook_url" in presentes:
        if cuerpo.webhook_url is None:
            errores.append({"pointer": "/webhook_url", "code": "invalid_type"})
        elif not url_de_webhook_valida(cuerpo.webhook_url):
            errores.append({"pointer": "/webhook_url", "code": "invalid_webhook_url"})
    if "sandbox_scenario" in presentes:
        escenario = cuerpo.sandbox_scenario
        if escenario is None:
            errores.append({"pointer": "/sandbox_scenario", "code": "invalid_type"})
        elif not sandbox:
            errores.append({"pointer": "/sandbox_scenario", "code": "sandbox_only"})
        elif (escenario == "failure_document_expired" and cuerpo.document_type != "co_national-id-2020") or (
            escenario == "review_face_mismatch" and not cuerpo.face_match
        ):
            errores.append({"pointer": "/sandbox_scenario", "code": "incompatible_scenario"})
    return errores, otorgada
