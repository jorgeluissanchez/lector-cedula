"""Lectores e intérpretes falsos y acceso a los fixtures sintéticos del cambio motor-real-servidor.

Los fixtures viven en `evals/fixtures/sinteticos/` (montados en solo lectura por `server/compose.yaml`);
todas las personas son ficticias y los números `9999...` (skill fixture-sintetico).
"""

import json
import os
from pathlib import Path
from typing import Any

from app.motor import Imagenes
from app.motor_real import Lectura

RUTA_SINTETICOS = Path(os.environ.get("RUTA_FIXTURES_SINTETICOS", "/srv/fixtures_sinteticos"))


def fixture(ruta: str) -> dict[str, Any]:
    datos = json.loads((RUTA_SINTETICOS / f"{ruta}.json").read_text(encoding="utf-8"))
    assert datos["sintetico"] is True
    return datos


def lectura_de(ruta: str) -> Lectura:
    """`LECTOR(FX/<ruta>)`: payload PDF417 (hexadecimal) o 3 líneas MRZ del fixture."""
    entrada = fixture(ruta)["entrada"]
    if isinstance(entrada, str):
        return Lectura(pdf417=bytes.fromhex(entrada))
    return Lectura(mrz=(entrada[0], entrada[1], entrada[2]))


class LectorFalso:
    """Devuelve siempre la misma lectura sin mirar las imágenes; registra cuántas veces leyó."""

    def __init__(self, lectura: Lectura | None = None) -> None:
        self.lectura = lectura or Lectura()
        self.llamadas = 0

    async def leer(self, tipo: str, imagenes: Imagenes) -> Lectura:
        self.llamadas += 1
        return self.lectura


class InterpreteFalso:
    """Devuelve la respuesta dada y registra cada petición (espía)."""

    def __init__(self, respuesta: dict[str, Any] | None = None) -> None:
        self.respuesta = respuesta
        self.peticiones: list[dict[str, Any]] = []

    async def interpretar(self, peticion: dict[str, Any]) -> dict[str, Any]:
        self.peticiones.append(peticion)
        assert self.respuesta is not None
        return self.respuesta


# Resultado del intérprete para FX/pdf417-amarilla/apellido-compuesto (escenario MS-01).
CAMPOS_PDF417_APELLIDO_COMPUESTO: dict[str, Any] = {
    "numeroDocumento": "9999123456",
    "primerApellido": "DE LA OSSA",
    "segundoApellido": "EJEMPLO",
    "primerNombre": "FICTICIA",
    "segundoNombre": "LUZ",
    "sexo": "F",
    "fechaNacimiento": "1985-03-14",
    "rh": "O+",
    "codigoDepartamentoNacimiento": "16",
    "codigoMunicipioNacimiento": "001",
}
VALIDACIONES_OK = [
    {"id": "formato-nuip", "estado": "ok"},
    {"id": "consistencia-modos", "estado": "ok"},
    {"id": "divipol-codigos", "estado": "ok"},
    {"id": "divipol-existe", "estado": "ok"},
]

DOCUMENTO_AMARILLA: dict[str, Any] = {
    "type": "co_national-id-2000",
    "document_number": "9999123456",
    "first_surname": "DE LA OSSA",
    "second_surname": "EJEMPLO",
    "first_name": "FICTICIA",
    "second_name": "LUZ",
    "sex": "F",
    "date_of_birth": "1985-03-14",
    "place_of_birth": {"divipol_department": "16", "divipol_municipality": "001"},
    "blood_type": "O+",
    "date_of_issue": None,
    "place_of_issue": None,
    "date_of_expiry": None,
    "sources": ["pdf417"],
    "warnings": [],
}

DOCUMENTO_DIGITAL: dict[str, Any] = {
    "type": "co_national-id-2020",
    "document_number": "9999123456",
    "first_surname": "DE LA OSSA FICTICIO",
    "second_surname": None,
    "first_name": "ANA",
    "second_name": None,
    "sex": "F",
    "date_of_birth": "1990-07-15",
    "place_of_birth": None,
    "blood_type": None,
    "date_of_issue": None,
    "place_of_issue": None,
    "date_of_expiry": "2034-07-15",
    "sources": ["mrz"],
    "warnings": ["M03"],
}


def np(categoria: str) -> dict[str, Any]:
    return {"category": categoria, "status": "not_performed", "reasons": []}


def checks(data_validation: dict[str, Any], face_match: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    resultado = [
        np("image_quality"),
        {"category": "data_validation", **data_validation},
        np("data_consistency"),
        np("document_liveness"),
    ]
    if face_match is not None:
        resultado.append(face_match)
    return resultado
