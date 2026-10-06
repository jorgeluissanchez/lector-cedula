"""Token de subida firmado (decisión 4, AV-08).

`token = base64url(exp_be64 || HMAC-SHA256(SECRETO_SUBIDA, id + "." + exp))` sin relleno: 40 bytes,
54 caracteres. Se verifica en tiempo constante. La decodificación es canónica: un token cuyo
reencodado no coincide carácter a carácter (por ejemplo, con otros bits de relleno en el último
carácter) se rechaza, de modo que cualquier alteración de un carácter da `invalido`.
"""

import base64
import binascii
import hashlib
import hmac
import struct
from typing import Literal

_LONGITUD = 54
_ALFABETO = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")

Verificacion = Literal["valido", "invalido", "vencido"]


def _firma(secreto: bytes, id_validacion: str, vence_en: int) -> bytes:
    return hmac.new(secreto, f"{id_validacion}.{vence_en}".encode(), hashlib.sha256).digest()


def emitir_token(secreto: bytes, id_validacion: str, vence_en: int) -> str:
    crudo = struct.pack(">Q", vence_en) + _firma(secreto, id_validacion, vence_en)
    return base64.urlsafe_b64encode(crudo).rstrip(b"=").decode("ascii")


def verificar_token(secreto: bytes, id_validacion: str, token: str, ahora: float) -> Verificacion:
    """`valido`, `invalido` (forma, firma o `id` distintos) o `vencido` (firma válida, `ahora` posterior
    al vencimiento). La firma se comprueba antes que el vencimiento."""
    if len(token) != _LONGITUD or not set(token) <= _ALFABETO:
        return "invalido"
    try:
        crudo = base64.urlsafe_b64decode(token + "==")
    except (binascii.Error, ValueError):
        return "invalido"
    if len(crudo) != 40 or base64.urlsafe_b64encode(crudo).rstrip(b"=").decode("ascii") != token:
        return "invalido"
    (vence_en,) = struct.unpack(">Q", crudo[:8])
    if not hmac.compare_digest(crudo[8:], _firma(secreto, id_validacion, vence_en)):
        return "invalido"
    if ahora > vence_en:
        return "vencido"
    return "valido"
