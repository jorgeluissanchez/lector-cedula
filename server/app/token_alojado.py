"""Token de la sesión alojada `hosted_url` (sdk-integracion, SDK-13, decisión 8).

`token = base64url(vence_be64 || id_16_bytes || HMAC-SHA256(K_alojada, "alojada." + id + "." + vence))`
sin relleno, con `K_alojada` derivada de `SECRETO_SUBIDA` por HKDF (`app.secretos`): 56 bytes,
75 caracteres. A diferencia del token de subida, identifica la validación (la
URL `/v/{token}` no lleva el `id`) y su mensaje firmado lleva el propósito `alojada`, así que un token
no sirve en el lugar del otro. Vence con `upload.expires_at`. La decodificación es canónica y la firma
se compara en tiempo constante; ninguna entrada lanza.
"""

import base64
import binascii
import hashlib
import hmac
import struct
from typing import Literal

from app.secretos import subclave

_LONGITUD = 75
_ALFABETO = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
_PREFIJO_ID = "val_"

Estado = Literal["valido", "invalido", "vencido"]


def _firma(secreto: bytes, id_validacion: str, vence_en: int) -> bytes:
    clave = subclave(secreto, "alojada")
    return hmac.new(clave, f"alojada.{id_validacion}.{vence_en}".encode(), hashlib.sha256).digest()


def emitir_token_alojado(secreto: bytes, id_validacion: str, vence_en: int) -> str:
    crudo = (
        struct.pack(">Q", vence_en)
        + bytes.fromhex(id_validacion.removeprefix(_PREFIJO_ID))
        + _firma(secreto, id_validacion, vence_en)
    )
    return base64.urlsafe_b64encode(crudo).rstrip(b"=").decode("ascii")


def verificar_token_alojado(secreto: bytes, token: str, ahora: float) -> tuple[Estado, str | None]:
    """`("valido", id)`, `("vencido", id)` (firma válida, `ahora` posterior al vencimiento) o
    `("invalido", None)`. La firma se comprueba antes que el vencimiento."""
    if not isinstance(token, str) or len(token) != _LONGITUD or not set(token) <= _ALFABETO:
        return "invalido", None
    try:
        crudo = base64.urlsafe_b64decode(token + "=")
    except (binascii.Error, ValueError):
        return "invalido", None
    if len(crudo) != 56 or base64.urlsafe_b64encode(crudo).rstrip(b"=").decode("ascii") != token:
        return "invalido", None
    (vence_en,) = struct.unpack(">Q", crudo[:8])
    id_validacion = _PREFIJO_ID + crudo[8:24].hex()
    if not hmac.compare_digest(crudo[24:], _firma(secreto, id_validacion, vence_en)):
        return "invalido", None
    if ahora > vence_en:
        return "vencido", id_validacion
    return "valido", id_validacion
