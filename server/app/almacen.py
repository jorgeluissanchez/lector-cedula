"""Almacén de validaciones en memoria (decisión 5). Nunca guarda imágenes ni bytes.

Un solo worker: el diccionario vive en el proceso y un reinicio lo vacía (riesgo documentado en el
contrato). La búsqueda exige el propietario: una validación de otro cliente es indistinguible de una
inexistente (AV-02, AV-13).
"""

import asyncio
import re
from dataclasses import dataclass

PATRON_ID = re.compile(r"^val_[0-9a-f]{32}$")


@dataclass
class Validacion:
    id: str
    # sha256 de la clave de API que la creó; nunca la clave en claro.
    propietario: str
    sandbox: bool


class Almacen:
    def __init__(self) -> None:
        self._validaciones: dict[str, Validacion] = {}
        self.cerrojo = asyncio.Lock()

    def __len__(self) -> int:
        return len(self._validaciones)

    def guardar(self, validacion: Validacion) -> None:
        self._validaciones[validacion.id] = validacion

    def obtener(self, id_validacion: str, propietario: str | None) -> Validacion | None:
        if not PATRON_ID.fullmatch(id_validacion):
            return None
        validacion = self._validaciones.get(id_validacion)
        if validacion is None or propietario is None or validacion.propietario != propietario:
            return None
        return validacion
