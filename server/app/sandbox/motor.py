"""Motor del sandbox (decisión 15, AV-20): resultado determinista leído de fixtures sintéticos.

`fixtures/<tipo>/<escenario>.json` lleva `"sintetico": true`, personas ficticias y números `9999...`
(AV-21). El contenido de las imágenes válidas se ignora: el escenario lo fija `sandbox_scenario`
(por defecto `success`). Las imágenes no se leen, no se copian y no se guardan.
"""

import copy
import json
from functools import cache
from pathlib import Path
from typing import Any

from app.motor import Imagenes, Resultado

RUTA_FIXTURES = Path(__file__).resolve().parent / "fixtures"
ESCENARIO_POR_DEFECTO = "success"


@cache
def cargar_fixture(tipo: str, escenario: str) -> dict[str, Any]:
    """Fixture de un tipo y escenario. Solo nombres del enumerado del contrato llegan aquí (los valida
    el modelo de creación), así que la ruta no depende de texto libre del cliente."""
    ruta = RUTA_FIXTURES / tipo / f"{escenario}.json"
    if ruta.parent.parent != RUTA_FIXTURES:
        raise ValueError("ruta de fixture fuera del directorio del sandbox")
    fixture = json.loads(ruta.read_text(encoding="utf-8"))
    if fixture.get("sintetico") is not True:
        raise ValueError("fixture de sandbox sin la marca sintetico")
    return fixture


class MotorSandbox:
    async def procesar(
        self, tipo: str, face_match: bool, imagenes: Imagenes, escenario: str | None
    ) -> Resultado:
        fixture = cargar_fixture(tipo, escenario or ESCENARIO_POR_DEFECTO)
        checks = [
            copy.deepcopy(check)
            for check in fixture["checks"]
            if face_match or check["category"] != "face_match"
        ]
        return Resultado(
            status=fixture["status"],
            declined_reason=fixture["declined_reason"],
            checks=checks,
            document=copy.deepcopy(fixture["document"]),
        )
