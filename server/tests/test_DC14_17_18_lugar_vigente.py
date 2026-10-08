"""DC-14, DC-17 y DC-18 (divipol-consulados-2018): nombre vigente del lugar en el servidor.

El intérprete real resuelve el lugar con `conLugarNacimiento` de packages/capture (misma resolución que
la CLI y la PWA, con los consulados de 2018, CC BY-SA 4.0); el motor lo añade a `place_of_birth`.
"""

import asyncio
import base64
from pathlib import Path
from typing import Any

from app.motor_real import AMARILLA, InterpreteNode, Lectura
from tests.fixtures_motor import (
    CAMPOS_PDF417_APELLIDO_COMPUESTO,
    DOCUMENTO_AMARILLA,
    VALIDACIONES_OK,
    InterpreteFalso,
    fixture,
)
from tests.test_MS02_14_motor_real import _procesar

LUGAR_BOGOTA = {"codigo": "16001", "departamento": "BOGOTA D.C", "municipio": "BOGOTA, D.C."}


def _payload(lugar: bytes = b"16001") -> bytes:
    payload = bytes.fromhex(fixture("pdf417-amarilla/apellido-compuesto")["entrada"])
    # Lugar de nacimiento en el desplazamiento 160 del payload sintético (5 dígitos DDMMM).
    assert payload[160:165] == b"16001"
    return payload[:160] + lugar + payload[165:]


def _interpretar(payload: bytes) -> Any:
    peticion = {"fuente": "pdf417", "datos_b64": base64.b64encode(payload).decode()}
    return asyncio.run(InterpreteNode().interpretar(peticion))


def test_DC14_municipio_nacional() -> None:
    respuesta = _interpretar(_payload())
    assert respuesta["ok"] is True
    assert respuesta["lugar_nacimiento"] == LUGAR_BOGOTA
    assert respuesta["campos"] == CAMPOS_PDF417_APELLIDO_COMPUESTO


def test_DC14_consulado_de_2018_en_el_servidor() -> None:
    respuesta = _interpretar(_payload(b"88690"))
    assert respuesta["ok"] is True
    assert respuesta["lugar_nacimiento"] == {
        "codigo": "88690",
        "departamento": "CONSULADOS",
        "municipio": "VIETNAM",
    }


def test_DC14_consulado_renombrado_y_codigo_desconocido() -> None:
    assert _interpretar(_payload(b"88140"))["lugar_nacimiento"]["municipio"] == "CURAZAO"
    assert _interpretar(_payload(b"99999"))["lugar_nacimiento"] is None


def _documento(lugar: Any) -> Any:
    respuesta: dict[str, Any] = {
        "ok": True,
        "campos": CAMPOS_PDF417_APELLIDO_COMPUESTO,
        "validaciones": VALIDACIONES_OK,
        "warnings": [],
        "lugar_nacimiento": lugar,
    }
    return _procesar(AMARILLA, Lectura(pdf417=b"x"), InterpreteFalso(respuesta)).document


def test_DC17_documento_con_nombres() -> None:
    assert _documento(LUGAR_BOGOTA)["place_of_birth"] == {
        "divipol_department": "16",
        "divipol_municipality": "001",
        "department_name": "BOGOTA D.C",
        "municipality_name": "BOGOTA, D.C.",
    }


def test_DC17_sin_nombres_si_el_codigo_no_coincide_o_no_hay_lugar() -> None:
    for lugar in (None, {**LUGAR_BOGOTA, "codigo": "05001"}, {**LUGAR_BOGOTA, "municipio": ""}, "x"):
        assert _documento(lugar) == DOCUMENTO_AMARILLA


def test_DC18_aviso_en_la_imagen() -> None:
    aviso = Path("/srv/licencias/parsers-THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
    assert "CC BY-SA 4.0" in aviso
    assert "Registraduría Nacional del Estado Civil" in aviso
