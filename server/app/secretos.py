"""Subclaves por propósito derivadas de `SECRETO_SUBIDA` con HKDF-SHA256 (RFC 5869).

El token de subida y el de la sesión alojada usan subclaves distintas (separación de dominios): un
fallo en uno de los formatos no permite falsificar el otro. Solo biblioteca estándar.
"""

import hashlib
import hmac
from functools import lru_cache

_LONGITUD_HASH = 32
_SAL = b"lector-cedula/tokens/v1"


def hkdf_sha256(ikm: bytes, sal: bytes, info: bytes, longitud: int) -> bytes:
    if not 0 < longitud <= 255 * _LONGITUD_HASH:
        raise ValueError("longitud de HKDF fuera de rango")
    prk = hmac.new(sal or bytes(_LONGITUD_HASH), ikm, hashlib.sha256).digest()
    salida, bloque, contador = b"", b"", 1
    while len(salida) < longitud:
        bloque = hmac.new(prk, bloque + info + bytes([contador]), hashlib.sha256).digest()
        salida += bloque
        contador += 1
    return salida[:longitud]


@lru_cache(maxsize=16)
def subclave(secreto: bytes, proposito: str) -> bytes:
    """Subclave de 32 bytes para `proposito` (`subida` o `alojada`)."""
    return hkdf_sha256(secreto, _SAL, f"lector-cedula/{proposito}".encode(), _LONGITUD_HASH)
