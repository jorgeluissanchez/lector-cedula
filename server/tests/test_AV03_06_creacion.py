"""AV-03 a AV-06: creación de validaciones con autorización expresa (tarea 4.1).

Literales de `specs/api-validaciones/spec.md`. Reloj inyectado en `2026-10-06T15:20:00Z`.
Datos sintéticos únicamente (skill fixture-sintetico).
"""

import json
import re
from typing import Any

from hypothesis import event, given, settings
from hypothesis import strategies as st

from tests.utilidades import (
    AUT,
    AUTH_KT,
    BASE_PROBLEMAS,
    CREAR_CUERPO,
    crear,
    crear_cliente_con,
)

CLAVES_VALIDACION = {
    "id",
    "object",
    "sandbox",
    "document_type",
    "face_match",
    "status",
    "declined_reason",
    "checks",
    "document",
    "autorizacion",
    "upload",
    "webhook_url",
    "created_at",
    "updated_at",
    "completed_at",
    "expires_at",
}


def _problema(respuesta: Any, estado: int, slug: str) -> dict[str, Any]:
    assert respuesta.status_code == estado, respuesta.text
    assert respuesta.headers["content-type"] == "application/problem+json"
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE_PROBLEMAS + slug
    return cuerpo


def _almacen(cliente: Any) -> Any:
    return cliente.app.state.almacen


# --- AV-03 ------------------------------------------------------------------------------------------


def test_AV03_creacion_minima_en_sandbox() -> None:
    """Creación mínima en sandbox: `CREAR` responde 201 con `Location` y exactamente las claves del
    objeto validación, con los valores literales de la spec."""
    cliente = crear_cliente_con()
    respuesta = crear(cliente)
    assert respuesta.status_code == 201
    assert respuesta.headers["content-type"] == "application/json"
    cuerpo = respuesta.json()
    assert set(cuerpo) == CLAVES_VALIDACION
    assert re.fullmatch(r"^val_[0-9a-f]{32}$", cuerpo["id"])
    assert respuesta.headers["location"] == f"/v1/validations/{cuerpo['id']}"
    assert cuerpo["object"] == "validation"
    assert cuerpo["sandbox"] is True
    assert cuerpo["document_type"] == "co_national-id-2000"
    assert cuerpo["face_match"] is False
    assert cuerpo["status"] == "pending"
    assert cuerpo["declined_reason"] is None
    assert cuerpo["checks"] == []
    assert cuerpo["document"] is None
    assert cuerpo["webhook_url"] is None
    assert cuerpo["completed_at"] is None
    assert cuerpo["created_at"] == "2026-10-06T15:20:00Z"
    assert len(_almacen(cliente)) == 1


def test_AV03_ids_distintos_y_generador_seguro() -> None:
    """El `id` sale de un generador criptográficamente seguro: dos creaciones dan ids distintos."""
    cliente = crear_cliente_con()
    ids = {crear(cliente).json()["id"] for _ in range(5)}
    assert len(ids) == 5


def test_AV03_tipo_de_documento_fuera_del_enumerado() -> None:
    """Tipo de documento fuera del enumerado: `co_passport` responde 422 con
    `[{"pointer": "/document_type", "code": "invalid_value"}]`."""
    cliente = crear_cliente_con()
    cuerpo = _problema(crear(cliente, document_type="co_passport"), 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "/document_type", "code": "invalid_value"}]
    assert len(_almacen(cliente)) == 0


def test_AV03_campo_no_declarado() -> None:
    """Campo no declarado: `"nombre_cliente": "PRUEBA"` responde 422 con
    `[{"pointer": "/nombre_cliente", "code": "unexpected_field"}]`."""
    cliente = crear_cliente_con()
    cuerpo = _problema(crear(cliente, nombre_cliente="PRUEBA"), 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "/nombre_cliente", "code": "unexpected_field"}]


def test_AV03_cuerpo_json_demasiado_grande() -> None:
    """Cuerpo JSON demasiado grande: un cuerpo de 16385 bytes responde 413 `request-too-large`; uno
    de 16384 bytes no."""
    cliente = crear_cliente_con()
    base = json.dumps({**CREAR_CUERPO, "relleno": ""}).encode()

    def _enviar(tamano: int) -> Any:
        datos = base.replace(b'"relleno": ""', b'"relleno": "' + b"x" * (tamano - len(base)) + b'"')
        assert len(datos) == tamano
        cabeceras = {**AUTH_KT, "Content-Type": "application/json"}
        return cliente.post("/v1/validations", headers=cabeceras, content=datos)

    _problema(_enviar(16385), 413, "request-too-large")
    # 16384 bytes se leen: el rechazo es por el campo no declarado, no por el tamaño.
    _problema(_enviar(16384), 422, "invalid-request")
    assert len(_almacen(cliente)) == 0


# --- AV-04 ------------------------------------------------------------------------------------------


def test_AV04_autorizacion_ausente() -> None:
    """Autorización ausente: 422 con `[{"pointer": "/autorizacion", "code": "required"}]` y el
    almacén con el mismo número de elementos."""
    cliente = crear_cliente_con()
    antes = len(_almacen(cliente))
    respuesta = cliente.post(
        "/v1/validations", headers=AUTH_KT, json={"document_type": "co_national-id-2000"}
    )
    cuerpo = _problema(respuesta, 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "/autorizacion", "code": "required"}]
    assert len(_almacen(cliente)) == antes


def test_AV04_autorizacion_en_falso_o_como_texto() -> None:
    """Autorización en falso o como texto: `false` da `must_be_true`; `"true"` y `1` dan
    `invalid_type`, siempre con `pointer` `/autorizacion/datos`."""
    cliente = crear_cliente_con()
    for valor, codigo in ((False, "must_be_true"), ("true", "invalid_type"), (1, "invalid_type")):
        cuerpo = _problema(crear(cliente, autorizacion={**AUT, "datos": valor}), 422, "invalid-request")
        assert cuerpo["errors"] == [{"pointer": "/autorizacion/datos", "code": codigo}]
    assert len(_almacen(cliente)) == 0


_json = st.recursive(
    st.none()
    | st.booleans()
    | st.integers()
    | st.floats(allow_nan=False, allow_infinity=False)
    | st.text(max_size=10),
    lambda hijos: st.lists(hijos, max_size=3) | st.dictionaries(st.text(max_size=5), hijos, max_size=3),
    max_leaves=6,
)
# Todo valor JSON distinto del booleano `true`: `False`, cadenas, números (incluido 1), `None`,
# listas y objetos. Válido por construcción salvo el propio `True`, que se filtra (`is`, no `==`).
_datos_no_true = (st.just(False) | st.sampled_from(["true", "True", 1, 1.0, 0, "", None]) | _json).filter(
    lambda valor: valor is not True
)

_cliente_av04 = crear_cliente_con(limite_peticiones_por_minuto=10**9)


@settings(max_examples=1000)
@given(datos=_datos_no_true)
def test_AV04_propiedad_datos_distinto_de_true(datos: Any) -> None:
    """Propiedad: todo valor de `autorizacion.datos` distinto de `true` da 422 con un error de
    `pointer` `/autorizacion/datos` y no crea la validación."""
    event(f"tipo: {type(datos).__name__}")
    antes = len(_almacen(_cliente_av04))
    respuesta = crear(_cliente_av04, autorizacion={**AUT, "datos": datos})
    assert respuesta.status_code == 422
    punteros = [e["pointer"] for e in respuesta.json()["errors"]]
    assert punteros == ["/autorizacion/datos"]
    assert len(_almacen(_cliente_av04)) == antes


# --- AV-05 ------------------------------------------------------------------------------------------


def test_AV05_comparacion_facial_sin_autorizacion_de_sensibles() -> None:
    """Comparación facial sin autorización de sensibles: 422 con
    `[{"pointer": "/autorizacion/sensibles", "code": "required_for_face_match"}]`."""
    cliente = crear_cliente_con()
    cuerpo = _problema(crear(cliente, face_match=True), 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "/autorizacion/sensibles", "code": "required_for_face_match"}]


def test_AV05_comparacion_facial_con_sensibles_ausente() -> None:
    """Comparación facial con sensibles ausente: el mismo error."""
    cliente = crear_cliente_con()
    sin_sensibles = {clave: valor for clave, valor in AUT.items() if clave != "sensibles"}
    respuesta = crear(cliente, face_match=True, autorizacion=sin_sensibles)
    cuerpo = _problema(respuesta, 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "/autorizacion/sensibles", "code": "required_for_face_match"}]


def test_AV05_comparacion_facial_autorizada() -> None:
    """Comparación facial autorizada: 201 con `face_match` y `autorizacion.sensibles` en `true`; con
    `face_match` omitido, `sensibles` se acepta en `true`."""
    cliente = crear_cliente_con()
    respuesta = crear(cliente, face_match=True, autorizacion={**AUT, "sensibles": True})
    assert respuesta.status_code == 201
    assert respuesta.json()["face_match"] is True
    assert respuesta.json()["autorizacion"]["sensibles"] is True
    assert crear(cliente, autorizacion={**AUT, "sensibles": True}).status_code == 201


# --- AV-06 ------------------------------------------------------------------------------------------


def test_AV06_eco_del_registro() -> None:
    """Eco del registro: `autorizacion` es exactamente el objeto de la spec con `registrada_en`."""
    respuesta = crear(crear_cliente_con())
    assert respuesta.json()["autorizacion"] == {
        "datos": True,
        "sensibles": False,
        "version_texto": "2026-10-01",
        "otorgada_en": "2026-10-06T15:19:00Z",
        "registrada_en": "2026-10-06T15:20:00Z",
    }


def test_AV06_fecha_de_otorgamiento_en_el_futuro() -> None:
    """Fecha de otorgamiento en el futuro: `15:25:01Z` (301 s) da 422 `in_future`."""
    cliente = crear_cliente_con()
    respuesta = crear(cliente, autorizacion={**AUT, "otorgada_en": "2026-10-06T15:25:01Z"})
    cuerpo = _problema(respuesta, 422, "invalid-request")
    assert {"pointer": "/autorizacion/otorgada_en", "code": "in_future"} in cuerpo["errors"]
    assert len(_almacen(cliente)) == 0


def test_AV06_margen_de_reloj_aceptado() -> None:
    """Margen de reloj aceptado: `15:25:00Z` (300 s) da 201."""
    respuesta = crear(crear_cliente_con(), autorizacion={**AUT, "otorgada_en": "2026-10-06T15:25:00Z"})
    assert respuesta.status_code == 201


def test_AV06_version_del_texto_invalida() -> None:
    """Versión del texto inválida: `""` y `"v 1"` dan 422 `invalid_format` en `version_texto`."""
    cliente = crear_cliente_con()
    for version in ("", "v 1"):
        respuesta = crear(cliente, autorizacion={**AUT, "version_texto": version})
        cuerpo = _problema(respuesta, 422, "invalid-request")
        assert {"pointer": "/autorizacion/version_texto", "code": "invalid_format"} in cuerpo["errors"]


def test_AV06_otorgada_en_con_desfase_se_registra_en_utc() -> None:
    """`otorgada_en` con desfase horario se registra en UTC; una fecha imposible o un número no son
    RFC 3339 y dan `invalid_format` o `invalid_type`."""
    cliente = crear_cliente_con()
    respuesta = crear(cliente, autorizacion={**AUT, "otorgada_en": "2026-10-06T10:19:00-05:00"})
    assert respuesta.status_code == 201
    assert respuesta.json()["autorizacion"]["otorgada_en"] == "2026-10-06T15:19:00Z"
    for valor, codigo in (("2026-13-06T15:19:00Z", "invalid_format"), (1791299940, "invalid_type")):
        cuerpo = _problema(crear(cliente, autorizacion={**AUT, "otorgada_en": valor}), 422, "invalid-request")
        assert cuerpo["errors"] == [{"pointer": "/autorizacion/otorgada_en", "code": codigo}]


def test_AV03_nulos_explicitos_en_campos_opcionales() -> None:
    """`webhook_url` y `sandbox_scenario` son cadenas en el contrato: `null` explícito da
    `invalid_type` (no se acepta en silencio un valor fuera del esquema)."""
    cliente = crear_cliente_con()
    for campo in ("webhook_url", "sandbox_scenario"):
        cuerpo = _problema(crear(cliente, **{campo: None}), 422, "invalid-request")
        assert cuerpo["errors"] == [{"pointer": f"/{campo}", "code": "invalid_type"}]


def test_AV03_campo_no_declarado_con_un_nombre_que_no_se_reproduce() -> None:
    """Campo no declarado con un nombre que no se reproduce: `"campo_9999123456": "FICTICIA"` da 422
    con `[{"pointer": "", "code": "unexpected_field"}]`; el puntero se corta en el padre."""
    cliente = crear_cliente_con()
    respuesta = crear(cliente, campo_9999123456="FICTICIA")
    cuerpo = _problema(respuesta, 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "", "code": "unexpected_field"}]
    assert "9999123456" not in respuesta.text
    anidado = _problema(crear(cliente, autorizacion={**AUT, "Extra": 1}), 422, "invalid-request")
    assert anidado["errors"] == [{"pointer": "/autorizacion", "code": "unexpected_field"}]
