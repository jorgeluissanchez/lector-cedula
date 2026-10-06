"""Motor de sandbox determinista y fixtures sintéticos (tarea 5.3, decisión 15).

Cubre AV-07 "Subida completa en sandbox", AV-15 "Nulidad según estado", AV-16 (estructura y razones),
AV-18 (documentos exactos), AV-19 (IDs en el registro de hipótesis), AV-20, AV-21, AV-30 "El almacén
no guarda bytes" y AV-31 en tiempo de ejecución. Oráculos: literales de la spec.
"""

import base64
import dataclasses
import json
import re
from pathlib import Path
from typing import Any

import pytest
import yaml
from jsonschema import Draft202012Validator, FormatChecker

from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AUT,
    AUTH_KL,
    AUTH_KT,
    RAIZ_SERVIDOR,
    RUTA_CONTRATO,
    RUTA_HIPOTESIS,
    crear,
    crear_cliente_con,
    reloj_de,
    ruta_de_subida,
    subir,
)

RUTA_FIXTURES = RAIZ_SERVIDOR / "app" / "sandbox" / "fixtures"
FRONT_BACK = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}
CON_SELFIE = {**FRONT_BACK, "selfie": (IMG_JPEG, "image/jpeg")}
CATEGORIAS = ["image_quality", "data_validation", "data_consistency", "document_liveness"]

# Tabla de AV-20: escenario -> (status, declined_reason, [(status, reasons)] de los 4 checks, document nulo)
NP = ("not_performed", [])
OK = ("passed", [])
TABLA_AV20: dict[str, tuple[str, str | None, list[tuple[str, list[str]]], bool]] = {
    "success": ("success", None, [OK, OK, OK, OK], False),
    "failure_image_quality": (
        "failure",
        "image_quality_insufficient",
        [("failed", ["glare_detected"]), NP, NP, NP],
        True,
    ),
    "failure_document_unreadable": (
        "failure",
        "document_unreadable",
        [OK, ("failed", ["barcode_unreadable"]), NP, NP],
        True,
    ),
    "review_data_consistency": (
        "review",
        "data_inconsistent",
        [OK, OK, ("warning", ["name_mismatch"]), OK],
        False,
    ),
    "review_document_liveness": (
        "review",
        "document_liveness_suspected",
        [OK, OK, OK, ("warning", ["screen_recapture_suspected"])],
        False,
    ),
    "failure_document_expired": (
        "failure",
        "document_expired",
        [OK, ("failed", ["document_expired"]), OK, OK],
        False,
    ),
    "review_face_mismatch": ("review", "face_mismatch", [OK, OK, OK, OK], False),
}

DOC_AMARILLA = {
    "type": "co_national-id-2000",
    "document_number": "9999123456",
    "first_surname": "PEÑA",
    "second_surname": "DE LA OSSA",
    "first_name": "FICTICIA",
    "second_name": None,
    "sex": "F",
    "date_of_birth": "1990-02-28",
    "place_of_birth": {"divipol_department": "01", "divipol_municipality": "001"},
    "blood_type": "AB-",
    "date_of_issue": None,
    "place_of_issue": None,
    "date_of_expiry": None,
    "sources": ["pdf417"],
    "warnings": ["H03", "H05", "H06"],
}
DOC_DIGITAL = {
    "type": "co_national-id-2020",
    "document_number": "9999654321",
    "first_surname": "NUÑEZ",
    "second_surname": "MARTINEZ",
    "first_name": "PRUEBA",
    "second_name": "SINTETICA",
    "sex": "M",
    "date_of_birth": "1985-12-01",
    "place_of_birth": None,
    "blood_type": None,
    "date_of_issue": None,
    "place_of_issue": None,
    "date_of_expiry": "2035-12-01",
    "sources": ["mrz"],
    "warnings": ["M02"],
}

CLAVE_PROHIBIDA = re.compile(
    r"imag|img|foto|photo|selfie|retrato|portrait|rostro|face_(image|template|embedding)|biometr|afis"
    r"|dactilar|huella|fingerprint|raw|payload|base64",
    re.IGNORECASE,
)


def _validador_validation() -> Draft202012Validator:
    with RUTA_CONTRATO.open(encoding="utf-8") as f:
        contrato = yaml.safe_load(f)
    esquema = {"$ref": "#/components/schemas/Validation", "components": contrato["components"]}
    return Draft202012Validator(esquema, format_checker=FormatChecker())


VALIDADOR = _validador_validation()


def _crear_y_subir(cliente: Any, escenario: str | None, tipo: str = "co_national-id-2000") -> Any:
    campos: dict[str, Any] = {"document_type": tipo}
    if escenario is not None:
        campos["sandbox_scenario"] = escenario
    partes = FRONT_BACK
    if escenario == "review_face_mismatch":
        campos.update(face_match=True, autorizacion={**AUT, "sensibles": True})
        partes = CON_SELFIE
    creada = crear(cliente, **campos)
    assert creada.status_code == 201, creada.text
    return subir(cliente, ruta_de_subida(creada.json()), partes)


def _combinaciones() -> list[tuple[str, str]]:
    return [
        (escenario, tipo)
        for escenario in TABLA_AV20
        for tipo in ("co_national-id-2000", "co_national-id-2020")
        if not (escenario == "failure_document_expired" and tipo == "co_national-id-2000")
    ]


@pytest.fixture(scope="module")
def respuestas_sandbox() -> list[tuple[str, str, dict[str, Any], Any]]:
    """Respuesta de la subida de cada combinación de escenario y tipo, y la validación almacenada."""
    cliente = crear_cliente_con()
    resultado = []
    for escenario, tipo in _combinaciones():
        respuesta = _crear_y_subir(cliente, escenario, tipo)
        assert respuesta.status_code == 200, respuesta.text
        cuerpo = respuesta.json()
        almacenada = cliente.app.state.almacen.obtener_sin_propietario(cuerpo["id"])  # type: ignore[attr-defined]
        resultado.append((escenario, tipo, cuerpo, almacenada))
    return resultado


def test_AV07_subida_completa_en_sandbox() -> None:
    """Subida completa en sandbox: `front` `IMG_JPEG` y `back` `IMG_PNG` a `upload.url` dan 200,
    `status` `success`, `upload` `null` y `completed_at` `2026-10-06T15:20:00Z`."""
    respuesta = _crear_y_subir(crear_cliente_con(), None)
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "application/json"
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "success"
    assert cuerpo["upload"] is None
    assert cuerpo["completed_at"] == "2026-10-06T15:20:00Z"
    assert cuerpo["expires_at"] == "2026-10-07T15:20:00Z"
    assert list(VALIDADOR.iter_errors(cuerpo)) == []


@pytest.mark.parametrize("escenario", list(TABLA_AV20))
def test_AV20_tabla_de_escenarios(escenario: str) -> None:
    """Tabla de escenarios: cada `sandbox_scenario` da el `status`, `declined_reason`, checks y
    `document` de la tabla de AV-20 (con selfie y `face_match` solo en `review_face_mismatch`)."""
    tipo = "co_national-id-2020" if escenario == "failure_document_expired" else "co_national-id-2000"
    cliente = crear_cliente_con()
    cuerpo = _crear_y_subir(cliente, escenario, tipo).json()
    status, motivo, checks, sin_documento = TABLA_AV20[escenario]
    assert cuerpo["status"] == status
    assert cuerpo["declined_reason"] == motivo
    esperados = [
        {"category": c, "status": s, "reasons": r} for c, (s, r) in zip(CATEGORIAS, checks, strict=True)
    ]
    if escenario == "review_face_mismatch":
        esperados.append({"category": "face_match", "status": "warning", "reasons": ["face_mismatch"]})
    assert cuerpo["checks"] == esperados
    assert (cuerpo["document"] is None) == sin_documento
    assert list(VALIDADOR.iter_errors(cuerpo)) == []


def test_AV20_escenario_incompatible() -> None:
    """Escenario incompatible: `failure_document_expired` con la amarilla, o `review_face_mismatch`
    sin `face_match`, dan 422 `incompatible_scenario` en `/sandbox_scenario`."""
    cliente = crear_cliente_con()
    for campos in (
        {"sandbox_scenario": "failure_document_expired", "document_type": "co_national-id-2000"},
        {"sandbox_scenario": "review_face_mismatch", "face_match": False},
    ):
        respuesta = crear(cliente, **campos)
        assert respuesta.status_code == 422
        assert {"pointer": "/sandbox_scenario", "code": "incompatible_scenario"} in respuesta.json()["errors"]


def test_AV20_campo_de_sandbox_en_modo_live() -> None:
    """Campo de sandbox en modo live: `CREAR` con `KL` y `"sandbox_scenario": "success"` da 422
    `sandbox_only`."""
    respuesta = crear(crear_cliente_con(), AUTH_KL, sandbox_scenario="success")
    assert respuesta.status_code == 422
    assert {"pointer": "/sandbox_scenario", "code": "sandbox_only"} in respuesta.json()["errors"]


def test_AV20_el_contenido_de_las_imagenes_se_ignora() -> None:
    """El escenario lo fija `sandbox_scenario`: otras imágenes válidas dan el mismo resultado."""
    cliente = crear_cliente_con()
    a = _crear_y_subir(cliente, "review_data_consistency").json()
    creada = crear(cliente, sandbox_scenario="review_data_consistency").json()
    b = subir(
        cliente, ruta_de_subida(creada), {"front": (IMG_PNG, "image/png"), "back": (IMG_JPEG, "image/jpeg")}
    )
    claves = ("status", "declined_reason", "checks", "document")
    assert {k: a[k] for k in claves} == {k: b.json()[k] for k in claves}


def test_AV16_estructura_en_una_validacion_exitosa() -> None:
    """Estructura en una validación exitosa: `checks` es exactamente los cuatro `passed` sin razones."""
    cuerpo = _crear_y_subir(crear_cliente_con(), "success").json()
    assert cuerpo["checks"] == [
        {"category": "image_quality", "status": "passed", "reasons": []},
        {"category": "data_validation", "status": "passed", "reasons": []},
        {"category": "data_consistency", "status": "passed", "reasons": []},
        {"category": "document_liveness", "status": "passed", "reasons": []},
    ]


def test_AV16_razones_vacias_salvo_en_fallo_o_advertencia(respuestas_sandbox: list[Any]) -> None:
    """Razones vacías salvo en fallo o advertencia, en todos los escenarios de sandbox; además el
    orden de categorías es el del requisito y `face_match` solo aparece si se pidió."""
    for _, _, cuerpo, _ in respuestas_sandbox:
        for check in cuerpo["checks"]:
            assert (check["reasons"] == []) == (check["status"] in ("passed", "not_performed"))
        categorias = [c["category"] for c in cuerpo["checks"]]
        assert categorias == CATEGORIAS + (["face_match"] if cuerpo["face_match"] else [])


def test_AV15_nulidad_segun_estado(respuestas_sandbox: list[Any]) -> None:
    """Nulidad según estado: en los escenarios de AV-20 y en el vencimiento de AV-14, `declined_reason`
    es `null` exactamente cuando `status` es `pending` o `success`."""
    cuerpos = [cuerpo for _, _, cuerpo, _ in respuestas_sandbox]
    cliente = crear_cliente_con()
    pendiente = crear(cliente).json()
    cuerpos.append(pendiente)
    reloj_de(cliente).fijar(1_791_300_901)
    cuerpos.append(cliente.get(f"/v1/validations/{pendiente['id']}", headers=AUTH_KT).json())
    assert {c["status"] for c in cuerpos} == {"pending", "success", "failure", "review"}
    for cuerpo in cuerpos:
        assert (cuerpo["declined_reason"] is None) == (cuerpo["status"] in ("pending", "success"))


def test_AV18_cedula_amarilla_en_sandbox() -> None:
    """Cédula amarilla en sandbox: `document` es exactamente el objeto de la spec."""
    cuerpo = _crear_y_subir(crear_cliente_con(), "success", "co_national-id-2000").json()
    assert cuerpo["document"] == DOC_AMARILLA


def test_AV18_cedula_digital_en_sandbox() -> None:
    """Cédula digital en sandbox: `document` es exactamente el objeto de la spec."""
    cuerpo = _crear_y_subir(crear_cliente_con(), "success", "co_national-id-2020").json()
    assert cuerpo["document"] == DOC_DIGITAL


def test_AV18_la_n_viaja_sin_escapar() -> None:
    """Los nombres conservan la Ñ en UTF-8 (sin escapes `\\u00d1`)."""
    respuesta = _crear_y_subir(crear_cliente_con(), "success")
    assert "PEÑA".encode() in respuesta.content


def _fixtures() -> list[tuple[Path, dict[str, Any]]]:
    return [
        (ruta, json.loads(ruta.read_text(encoding="utf-8")))
        for ruta in sorted(RUTA_FIXTURES.glob("*/*.json"))
    ]


def test_AV19_ids_existentes_en_el_registro_de_hipotesis() -> None:
    """IDs existentes en el registro de hipótesis: cada ID de `warnings` de los fixtures aparece en la
    primera columna de una tabla de `docs/decisiones/hipotesis-formato.md`."""
    primera_columna = set(
        re.findall(r"^\|\s*([HMN][0-9]{2})\s*\|", RUTA_HIPOTESIS.read_text(encoding="utf-8"), re.M)
    )
    ids = {w for _, f in _fixtures() if f["document"] for w in f["document"]["warnings"]}
    assert ids == {"H03", "H05", "H06", "M02"}
    assert ids <= primera_columna


def test_AV21_marca_y_prefijo_en_todos_los_fixtures() -> None:
    """Marca y prefijo en todos los fixtures: cada uno tiene `"sintetico": true` y cada
    `document_number` empieza por `9999`. Hay un fixture por combinación válida de tipo y escenario."""
    fixtures = _fixtures()
    nombres = {(ruta.parent.name, ruta.stem) for ruta, _ in fixtures}
    assert nombres == {(tipo, escenario) for escenario, tipo in _combinaciones()}
    for _, fixture in fixtures:
        assert fixture["sintetico"] is True
        if fixture["document"] is not None:
            assert fixture["document"]["document_number"].startswith("9999")


def _recorrer(valor: Any) -> list[Any]:
    """Todos los valores anidados (dataclasses, diccionarios, listas, tuplas) incluido el propio."""
    pila, vistos = [valor], []
    while pila:
        actual = pila.pop()
        vistos.append(actual)
        if dataclasses.is_dataclass(actual) and not isinstance(actual, type):
            pila.extend(getattr(actual, f.name) for f in dataclasses.fields(actual))
        elif isinstance(actual, dict):
            pila.extend(actual.keys())
            pila.extend(actual.values())
        elif isinstance(actual, list | tuple | set | frozenset):
            pila.extend(actual)
    return vistos


def test_AV30_el_almacen_no_guarda_bytes(respuestas_sandbox: list[Any]) -> None:
    """El almacén no guarda bytes: en el objeto almacenado de cada escenario no hay `bytes`,
    `bytearray` ni `memoryview`, ni el base64 de los primeros 48 bytes de las imágenes subidas."""
    huellas = [base64.b64encode(img[:48]).decode() for img in (IMG_JPEG, IMG_PNG)]
    for _, _, _, almacenada in respuestas_sandbox:
        for valor in _recorrer(almacenada):
            assert not isinstance(valor, bytes | bytearray | memoryview)
            if isinstance(valor, str):
                assert all(h not in valor for h in huellas)


def test_AV31_comprobacion_en_tiempo_de_ejecucion(respuestas_sandbox: list[Any]) -> None:
    """Comprobación en tiempo de ejecución: ninguna clave JSON de las respuestas de sandbox coincide
    con el patrón de imagen o biometría y ninguna cadena mide más de 512 caracteres."""
    for _, _, cuerpo, _ in respuestas_sandbox:
        for valor in _recorrer(cuerpo):
            if isinstance(valor, dict):
                assert not any(CLAVE_PROHIBIDA.search(k) for k in valor), valor.keys()
            if isinstance(valor, str):
                assert len(valor) <= 512
        assert list(VALIDADOR.iter_errors(cuerpo)) == []
