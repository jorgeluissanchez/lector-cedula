"""Tarea 2.1: pruebas que leen el contrato OpenAPI (fuente de verdad, decisión 1).

Los oráculos son los literales de `specs/api-validaciones/spec.md`, nunca valores leídos del código.
Se carga el YAML con `yaml.safe_load`, independiente del cargador de la aplicación.
"""

import copy
from typing import Any

import pytest
import yaml

from tests.utilidades import RAIZ_SERVIDOR, RUTA_CONTRATO

RUTA_VIOLA_IMAGEN = RAIZ_SERVIDOR / "openapi" / "pruebas" / "viola-imagen.yaml"


@pytest.fixture(scope="module")
def contrato() -> dict[str, Any]:
    with RUTA_CONTRATO.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _esquema(contrato: dict[str, Any], nombre: str) -> dict[str, Any]:
    return contrato["components"]["schemas"][nombre]


def _resolver(contrato: dict[str, Any], esquema: dict[str, Any]) -> dict[str, Any]:
    """Sigue un `$ref` local (`#/components/schemas/X`) hasta el esquema concreto."""
    while "$ref" in esquema:
        partes = esquema["$ref"].removeprefix("#/").split("/")
        destino: Any = contrato
        for parte in partes:
            destino = destino[parte]
        esquema = destino
    return esquema


def _ramas(contrato: dict[str, Any], esquema: dict[str, Any]) -> list[dict[str, Any]]:
    """Ramas de un `anyOf`/`oneOf` resueltas, o el propio esquema si no las tiene."""
    esquema = _resolver(contrato, esquema)
    for clave in ("anyOf", "oneOf"):
        if clave in esquema:
            return [r for rama in esquema[clave] for r in _ramas(contrato, rama)]
    return [esquema]


def _admite_null(contrato: dict[str, Any], esquema: dict[str, Any]) -> bool:
    for rama in _ramas(contrato, esquema):
        tipo = rama.get("type")
        if tipo == "null" or (isinstance(tipo, list) and "null" in tipo):
            if "enum" not in rama or None in rama["enum"]:
                return True
    return False


def _valores_enum(contrato: dict[str, Any], esquema: dict[str, Any]) -> list[Any]:
    """Valores del enumerado de un esquema, uniendo las ramas en el orden en que aparecen."""
    valores: list[Any] = []
    for rama in _ramas(contrato, esquema):
        if "enum" in rama:
            valores.extend(rama["enum"])
        elif "const" in rama:
            valores.append(rama["const"])
        elif rama.get("type") == "null":
            valores.append(None)
    return valores


def test_AV15_enumerado_en_el_contrato(contrato: dict[str, Any]) -> None:
    """Enumerado en el contrato: el `enum` de `DeclinedReason` contiene exactamente los 12 valores
    del requisito, en ese orden, y el esquema admite `null`."""
    esperado = [
        "image_quality_insufficient",
        "document_not_detected",
        "document_unreadable",
        "unsupported_document_type",
        "data_validation_failed",
        "document_expired",
        "data_inconsistent",
        "document_liveness_suspected",
        "face_mismatch",
        "legacy_document",
        "upload_expired",
        "processing_error",
    ]
    ramas = _ramas(contrato, _esquema(contrato, "DeclinedReason"))
    enums = [rama["enum"] for rama in ramas if "enum" in rama]
    assert enums == [esperado]
    assert _admite_null(contrato, _esquema(contrato, "DeclinedReason"))


def test_AV16_codigos_de_razon_por_categoria(contrato: dict[str, Any]) -> None:
    """Códigos de razón por categoría: cada rama de `Check` fija su `category` y admite solo los
    códigos de razón de esa categoría, con los estados `passed`, `failed`, `warning`, `not_performed`."""
    esperado = {
        "image_quality": [
            "blur_detected",
            "glare_detected",
            "document_cropped",
            "low_resolution",
            "overexposed",
            "underexposed",
        ],
        "data_validation": [
            "barcode_unreadable",
            "mrz_check_digit_invalid",
            "document_number_invalid",
            "date_invalid",
            "document_expired",
            "divipol_unknown",
            "legacy_document_type",
        ],
        "data_consistency": [
            "document_number_mismatch",
            "name_mismatch",
            "date_of_birth_mismatch",
            "sex_mismatch",
        ],
        "document_liveness": ["screen_recapture_suspected", "photocopy_suspected", "print_suspected"],
        "face_match": ["face_not_detected", "face_mismatch", "liveness_failed"],
    }
    obtenido: dict[str, list[Any]] = {}
    for rama in _ramas(contrato, _esquema(contrato, "Check")):
        assert rama["required"] == ["category", "status", "reasons"]
        assert rama["additionalProperties"] is False
        propiedades = rama["properties"]
        categoria = _valores_enum(contrato, propiedades["category"])
        assert len(categoria) == 1
        estados = _valores_enum(contrato, propiedades["status"])
        assert estados == ["passed", "failed", "warning", "not_performed"]
        assert propiedades["reasons"]["type"] == "array"
        obtenido[categoria[0]] = _valores_enum(contrato, propiedades["reasons"]["items"])
    assert obtenido == esperado
    assert list(obtenido) == list(esperado)


def test_AV18_dominios_de_los_campos_en_el_contrato(contrato: dict[str, Any]) -> None:
    """Dominios de los campos en el contrato: `sex`, `blood_type`, `document_number`, DIVIPOL,
    `sources` y `additionalProperties` del esquema `Document`."""
    documento = _esquema(contrato, "Document")
    propiedades = documento["properties"]
    assert documento["additionalProperties"] is False
    assert set(documento["required"]) == {
        "type",
        "document_number",
        "first_surname",
        "second_surname",
        "first_name",
        "second_name",
        "sex",
        "date_of_birth",
        "place_of_birth",
        "blood_type",
        "date_of_issue",
        "place_of_issue",
        "date_of_expiry",
        "sources",
        "warnings",
    }
    assert set(propiedades) == set(documento["required"])
    assert _valores_enum(contrato, propiedades["sex"]) == ["M", "F"]
    assert not _admite_null(contrato, propiedades["sex"])
    assert set(_valores_enum(contrato, propiedades["blood_type"])) == {
        "O+",
        "O-",
        "A+",
        "A-",
        "B+",
        "B-",
        "AB+",
        "AB-",
        None,
    }
    assert _admite_null(contrato, propiedades["blood_type"])
    assert _resolver(contrato, propiedades["document_number"])["pattern"] == "^[0-9]{6,11}$"

    lugares = [r for r in _ramas(contrato, propiedades["place_of_birth"]) if r.get("type") == "object"]
    assert len(lugares) == 1
    lugar = lugares[0]
    assert lugar["additionalProperties"] is False
    assert lugar["properties"]["divipol_department"]["pattern"] == "^[0-9]{2}$"
    assert lugar["properties"]["divipol_municipality"]["pattern"] == "^[0-9]{3}$"
    assert _admite_null(contrato, propiedades["place_of_birth"])

    assert propiedades["sources"]["type"] == "array"
    assert _valores_enum(contrato, propiedades["sources"]["items"]) == ["pdf417", "mrz", "ocr"]


def test_AV19_patron_en_el_contrato(contrato: dict[str, Any]) -> None:
    """Patrón en el contrato: los elementos de `Document.warnings` cumplen `^[HMN][0-9]{2}$` y la
    descripción enlaza `docs/decisiones/hipotesis-formato.md`."""
    warnings = _esquema(contrato, "Document")["properties"]["warnings"]
    assert warnings["type"] == "array"
    assert warnings["items"]["pattern"] == "^[HMN][0-9]{2}$"
    assert "docs/decisiones/hipotesis-formato.md" in warnings["description"]


def test_AV31_el_fixture_que_viola_es_copia_del_contrato(contrato: dict[str, Any]) -> None:
    """La regla detecta una violación (preparación): `pruebas/viola-imagen.yaml` es una copia del
    contrato cuyo esquema `Validation` añade `front_image` y cuyo webhook añade `pdf417_raw`; nada más.
    Así el fixture no se desincroniza del contrato cuando este cambie."""
    with RUTA_VIOLA_IMAGEN.open(encoding="utf-8") as f:
        viola = yaml.safe_load(f)
    restaurado = copy.deepcopy(viola)
    propiedades_validacion = restaurado["components"]["schemas"]["Validation"]["properties"]
    assert "front_image" in propiedades_validacion
    del propiedades_validacion["front_image"]
    propiedades_evento = restaurado["components"]["schemas"]["ValidationCompletedEvent"]["properties"]
    assert "pdf417_raw" in propiedades_evento
    del propiedades_evento["pdf417_raw"]
    assert restaurado == contrato
    evento = contrato["webhooks"]["validation.completed"]["post"]["requestBody"]["content"]
    assert evento["application/json"]["schema"] == {"$ref": "#/components/schemas/ValidationCompletedEvent"}
