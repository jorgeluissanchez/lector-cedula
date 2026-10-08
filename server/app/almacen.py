"""Almacén de validaciones en memoria (decisión 5). Nunca guarda imágenes ni bytes.

Un solo worker: el diccionario vive en el proceso y un reinicio lo vacía (riesgo documentado en el
contrato). La búsqueda exige el propietario: una validación de otro cliente es indistinguible de una
inexistente (AV-02, AV-13). Solo guarda texto, números, booleanos y listas o diccionarios de ellos
(AV-30): ni la clave de API en claro ni el token de subida, que se deriva del `id` al representar.
"""

import re
from dataclasses import dataclass, field
from typing import Any

PATRON_ID = re.compile(r"^val_[0-9a-f]{32}$")


@dataclass
class Validacion:
    id: str
    # sha256 de la clave de API que la creó; nunca la clave en claro.
    propietario: str
    sandbox: bool
    document_type: str
    face_match: bool
    autorizacion: dict[str, Any]
    creada_en: float
    subida_vence_en: int
    escenario: str | None = None
    webhook_url: str | None = None
    # SDK-13: URL exacta de la lista `retornos` de la clave creadora (no es un dato del titular).
    return_url: str | None = None
    status: str = "pending"
    declined_reason: str | None = None
    checks: list[dict[str, Any]] = field(default_factory=list)
    document: dict[str, Any] | None = None
    actualizada_en: float = 0.0
    completada_en: float | None = None
    # Verdadero mientras una subida se procesa: una segunda subida concurrente recibe 409.
    procesando: bool = False

    def __post_init__(self) -> None:
        if not self.actualizada_en:
            self.actualizada_en = self.creada_en


class Almacen:
    def __init__(self) -> None:
        self._validaciones: dict[str, Validacion] = {}

    def __len__(self) -> int:
        return len(self._validaciones)

    def guardar(self, validacion: Validacion) -> None:
        self._validaciones[validacion.id] = validacion

    def obtener(self, id_validacion: str, propietario: str | None) -> Validacion | None:
        """La validación de `propietario`, o `None` si no existe, está mal formada o es ajena."""
        validacion = self.obtener_sin_propietario(id_validacion)
        if validacion is None or propietario is None or validacion.propietario != propietario:
            return None
        return validacion

    def obtener_sin_propietario(self, id_validacion: str) -> Validacion | None:
        """Solo para la subida con token firmado, que ya prueba el derecho sobre ese `id` (AV-08)."""
        if not PATRON_ID.fullmatch(id_validacion):
            return None
        return self._validaciones.get(id_validacion)

    def eliminar(self, id_validacion: str) -> None:
        self._validaciones.pop(id_validacion, None)
