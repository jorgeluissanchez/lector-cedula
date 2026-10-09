"""Interfaz del motor de procesamiento (decisión 6).

El motor recibe las imágenes en memoria y devuelve el resultado; nunca las guarda. El modo sandbox
usa `MotorSandbox`; el motor real (re-decodificación, OCR, liveness, comparación facial) llega en
cambios posteriores y se enchufa aquí.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class Imagenes:
    """Bytes de la subida. Viven solo durante la petición: nadie guarda una referencia a este objeto."""

    front: bytes = field(repr=False)
    # Tarea 4.3: `None` cuando la sesión del SDK sube solo el anverso.
    back: bytes | None = field(default=None, repr=False)
    selfie: bytes | None = field(default=None, repr=False)


@dataclass(frozen=True)
class Resultado:
    status: str
    declined_reason: str | None
    checks: list[dict[str, Any]]
    document: dict[str, Any] | None


class Motor(Protocol):
    async def procesar(
        self, tipo: str, face_match: bool, imagenes: Imagenes, escenario: str | None
    ) -> Resultado: ...
