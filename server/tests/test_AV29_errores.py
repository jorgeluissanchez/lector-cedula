"""AV-29 (errores RFC 9457) y AV-33 en su versión para 404 (tarea 3.1).

Datos sintéticos únicamente (skill fixture-sintetico).
"""

import json
import uuid
from typing import Any

import yaml
from hypothesis import event, given, settings
from hypothesis import strategies as st
from jsonschema import Draft202012Validator, FormatChecker

from tests.utilidades import CREAR_CUERPO, KT, RUTA_CONTRATO, crear_cliente

BASE = "https://lector-cedula.example/problemas/"
MARCADOR = "ZZMARCAZZ"
AUTH_KT = {"Authorization": f"Bearer {KT}"}
ID_INEXISTENTE = "val_0123456789abcdef0123456789abcdef"


def _validador_de(nombre: str) -> Draft202012Validator:
    with RUTA_CONTRATO.open(encoding="utf-8") as f:
        contrato = yaml.safe_load(f)
    esquema = {"$ref": f"#/components/schemas/{nombre}", "components": contrato["components"]}
    return Draft202012Validator(esquema, format_checker=FormatChecker())


VALIDADOR_PROBLEM = _validador_de("Problem")


def _es_uuid4(texto: str) -> bool:
    try:
        return uuid.UUID(texto).version == 4 and str(uuid.UUID(texto)) == texto
    except ValueError:
        return False


def _comprobar_problem(respuesta: Any, estado: int, slug: str) -> dict[str, Any]:
    assert respuesta.status_code == estado
    assert respuesta.headers["content-type"] == "application/problem+json"
    cuerpo = respuesta.json()
    assert list(VALIDADOR_PROBLEM.iter_errors(cuerpo)) == []
    assert cuerpo["type"] == BASE + slug
    assert cuerpo["code"] == slug
    assert cuerpo["status"] == estado
    assert cuerpo["request_id"] == respuesta.headers["x-request-id"]
    return cuerpo


def test_AV29_estructura_de_un_error_de_validacion() -> None:
    """Estructura de un error de validación: `POST /v1/validations` con `KT` y cuerpo `{}` responde
    422 con `type`, `status`, `code`, `request_id` igual a `X-Request-Id` y los dos `errors`."""
    cliente = crear_cliente()
    respuesta = cliente.post("/v1/validations", headers=AUTH_KT, json={})
    cuerpo = _comprobar_problem(respuesta, 422, "invalid-request")
    assert cuerpo["type"] == "https://lector-cedula.example/problemas/invalid-request"
    assert cuerpo["status"] == 422
    assert cuerpo["code"] == "invalid-request"
    assert {"pointer": "/document_type", "code": "required"} in cuerpo["errors"]
    assert {"pointer": "/autorizacion", "code": "required"} in cuerpo["errors"]
    assert _es_uuid4(cuerpo["request_id"])


def test_AV29_ruta_y_metodo_desconocidos() -> None:
    """Ruta y método desconocidos: `GET /v1/no-existe` es 404 `not-found` y `PATCH` sobre una
    validación es 405 `method-not-allowed` con `Allow: GET, DELETE`."""
    cliente = crear_cliente()
    _comprobar_problem(cliente.get("/v1/no-existe", headers=AUTH_KT), 404, "not-found")
    respuesta = cliente.patch(f"/v1/validations/{ID_INEXISTENTE}", headers=AUTH_KT)
    _comprobar_problem(respuesta, 405, "method-not-allowed")
    assert respuesta.headers["allow"] == "GET, DELETE"


def test_AV33_cabeceras_en_error_404() -> None:
    """Cabeceras en éxito y en error (versión 404): un `GET` con un `id` inexistente trae
    `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y un
    `X-Request-Id` UUID versión 4."""
    cliente = crear_cliente()
    respuesta = cliente.get(f"/v1/validations/{ID_INEXISTENTE}", headers=AUTH_KT)
    _comprobar_problem(respuesta, 404, "not-found")
    assert respuesta.headers["cache-control"] == "no-store"
    assert respuesta.headers["x-content-type-options"] == "nosniff"
    assert respuesta.headers["referrer-policy"] == "no-referrer"
    assert _es_uuid4(respuesta.headers["x-request-id"])


def test_AV29_identificadores_de_peticion_distintos() -> None:
    """Cada petición recibe su propio `X-Request-Id` (no es una constante)."""
    cliente = crear_cliente()
    ids = {cliente.get("/v1/no-existe", headers=AUTH_KT).headers["x-request-id"] for _ in range(5)}
    assert len(ids) == 5


# --- Propiedad sobre cuerpos arbitrarios -----------------------------------------------------------

_texto_con_marcador = st.builds(lambda a, b: f"{a}{MARCADOR}{b}", st.text(max_size=8), st.text(max_size=8))
_escalares = st.none() | st.booleans() | st.integers() | st.floats(allow_nan=False, allow_infinity=False)
_json_con_marcador = st.recursive(
    _escalares | _texto_con_marcador,
    lambda hijos: st.lists(hijos, max_size=4) | st.dictionaries(_texto_con_marcador, hijos, max_size=4),
    max_leaves=12,
)
_autorizacion_con_marcador = st.fixed_dictionaries(
    {
        "datos": st.just(True) | _json_con_marcador,
        "version_texto": st.just("2026-10-01") | _texto_con_marcador,
        "otorgada_en": st.just("2026-10-06T15:19:00Z") | _texto_con_marcador,
    },
    optional={MARCADOR: _json_con_marcador},
)
# Cuerpos con el marcador en al menos una clave y en valores: a veces solo claves extrañas y a veces
# campos declarados con valores (o subclaves) marcados, que ejercitan los errores por campo.
_cuerpos = st.fixed_dictionaries(
    {MARCADOR: _json_con_marcador},
    optional={
        "document_type": st.just("co_national-id-2000") | _texto_con_marcador,
        "autorizacion": _autorizacion_con_marcador | _json_con_marcador,
        "face_match": st.booleans() | _texto_con_marcador,
        "webhook_url": _texto_con_marcador,
        "sandbox_scenario": _texto_con_marcador,
    },
).flatmap(
    lambda base: st.dictionaries(_texto_con_marcador, _json_con_marcador, max_size=3).map(
        lambda extra: {**extra, **base}
    )
)

_cliente_propiedad = crear_cliente(limite_peticiones_por_minuto=10**9)


@settings(max_examples=1000)
@given(cuerpo=_cuerpos)
def test_AV29_propiedad_sobre_cuerpos_arbitrarios(cuerpo: dict[str, Any]) -> None:
    """Propiedad sobre cuerpos arbitrarios: con `KT`, ningún cuerpo JSON con `ZZMARCAZZ` en claves y
    valores produce 5xx; toda respuesta 4xx es `problem+json` válida contra `Problem` y ninguna
    contiene el marcador."""
    datos = json.dumps(cuerpo, ensure_ascii=False).encode()
    assert MARCADOR.encode() in datos
    campos_declarados = set(cuerpo) & {"document_type", "autorizacion", "face_match", "webhook_url"}
    event(f"campos declarados presentes: {bool(campos_declarados)}")

    respuesta = _cliente_propiedad.post(
        "/v1/validations",
        headers={**AUTH_KT, "Content-Type": "application/json"},
        content=datos,
    )
    assert respuesta.status_code < 500
    assert MARCADOR.encode() not in respuesta.content
    assert all(MARCADOR not in valor for valor in respuesta.headers.values())
    if respuesta.status_code >= 400:
        assert respuesta.headers["content-type"] == "application/problem+json"
        assert list(VALIDADOR_PROBLEM.iter_errors(respuesta.json())) == []


def test_AV29_sin_eco_de_valores_del_cliente() -> None:
    """Sin eco de valores del cliente: `CREAR` con `document_type` "PEÑA 9999123456" y, en otra
    petición, con "campo_9999123456": "FICTICIA"; ningún cuerpo de error contiene `9999123456`,
    `PEÑA` ni `FICTICIA` (tampoco escapado en JSON como PE\\u00d1A)."""
    cliente = crear_cliente()
    prohibidos = ("9999123456", "PEÑA", "PE\\u00d1A", "FICTICIA")

    respuesta = cliente.post(
        "/v1/validations", headers=AUTH_KT, json={**CREAR_CUERPO, "document_type": "PEÑA 9999123456"}
    )
    cuerpo = _comprobar_problem(respuesta, 422, "invalid-request")
    assert all(p not in respuesta.text for p in prohibidos)
    assert cuerpo["errors"] == [{"pointer": "/document_type", "code": "invalid_value"}]

    respuesta = cliente.post(
        "/v1/validations", headers=AUTH_KT, json={**CREAR_CUERPO, "campo_9999123456": "FICTICIA"}
    )
    cuerpo = _comprobar_problem(respuesta, 422, "invalid-request")
    assert all(p not in respuesta.text for p in prohibidos)
    # La clave no es segura de reproducir (lleva dígitos): el error apunta a la raíz del cuerpo.
    assert cuerpo["errors"] == [{"pointer": "", "code": "unexpected_field"}]


def test_AV29_error_interno_generico() -> None:
    """500 genérico (base de "Error interno sin traza", que la tarea 5.4 prueba con el motor): una
    excepción no controlada responde 500 `internal-error` sin su mensaje y con las cabeceras de AV-33."""
    from fastapi.testclient import TestClient

    from app.main import crear_app
    from tests.utilidades import config_de_prueba

    aplicacion = crear_app(config_de_prueba())

    @aplicacion.get("/v1/falla-de-prueba")
    async def falla() -> None:
        raise RuntimeError("9999123456 traza interna")

    respuesta = TestClient(aplicacion, raise_server_exceptions=False).get("/v1/falla-de-prueba")
    cuerpo = _comprobar_problem(respuesta, 500, "internal-error")
    assert "errors" not in cuerpo
    assert b"9999123456" not in respuesta.content
    assert b"traza" not in respuesta.content
    assert respuesta.headers["cache-control"] == "no-store"
    assert respuesta.headers["referrer-policy"] == "no-referrer"
