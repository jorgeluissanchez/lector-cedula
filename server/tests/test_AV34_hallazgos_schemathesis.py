"""AV-34: regresiones de los hallazgos de Schemathesis (tarea 8.1).

Cada prueba reproduce un caso que Schemathesis 4.29.4 encontró contra `api-pruebas` antes de la
corrección. Datos sintéticos únicamente.
"""

from datetime import UTC, datetime

import pytest

from app.modelos import convertir_rfc3339
from app.representacion import fecha_hora_utc
from tests.utilidades import AUT, AUTH_KT, CREAR_CUERPO, crear_cliente


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        (datetime(49, 9, 10, 9, 49, 8, tzinfo=UTC), "0049-09-10T09:49:08Z"),
        (datetime(222, 1, 27, 9, 14, 47, tzinfo=UTC), "0222-01-27T09:14:47Z"),
        (datetime(1, 1, 1, tzinfo=UTC), "0001-01-01T00:00:00Z"),
    ],
)
def test_AV34_anio_menor_que_1000_con_cuatro_digitos(entrada: datetime, esperado: str) -> None:
    """Schemathesis wSUZ9r: `otorgada_en` del año 49 se devolvía como `49-09-10T...`, que no es
    `date-time`."""
    assert fecha_hora_utc(entrada) == esperado


def test_AV34_otorgada_en_antes_del_anio_1_en_utc_es_formato_invalido() -> None:
    """Un instante que en UTC cae antes del año 1 no es representable: `invalid_format`, nunca 500."""
    assert convertir_rfc3339("0001-01-01T00:00:00+01:00") is None
    cliente = crear_cliente()
    cuerpo = {**CREAR_CUERPO, "autorizacion": {**AUT, "otorgada_en": "0001-01-01T00:00:00+01:00"}}
    respuesta = cliente.post("/v1/validations", json=cuerpo, headers=AUTH_KT)
    assert respuesta.status_code == 422, respuesta.text
    assert respuesta.json()["errors"] == [{"pointer": "/autorizacion/otorgada_en", "code": "invalid_format"}]


def test_AV34_eco_de_anio_49_en_creacion() -> None:
    """La creación con `0049-09-11T06:35:08.0+20:46` responde 201 con `otorgada_en` de 4 dígitos."""
    cliente = crear_cliente()
    cuerpo = {**CREAR_CUERPO, "autorizacion": {**AUT, "otorgada_en": "0049-09-11T06:35:08.0+20:46"}}
    respuesta = cliente.post("/v1/validations", json=cuerpo, headers=AUTH_KT)
    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["autorizacion"]["otorgada_en"] == "0049-09-10T09:49:08Z"


def test_AV34_repeticion_idempotente_tras_supresion_no_devuelve_un_id_suprimido() -> None:
    """Schemathesis bivIXw: tras `DELETE`, repetir la creación con la misma `Idempotency-Key` devolvía
    el 201 guardado con un `id` que ya responde 404 (AV-23: todo sobre ese `id` es 404). Ahora la
    clave se libera y la creación produce una validación nueva y consultable."""
    cliente = crear_cliente()
    cabeceras = {**AUTH_KT, "Idempotency-Key": "clave-sintetica-1"}
    primera = cliente.post("/v1/validations", json=CREAR_CUERPO, headers=cabeceras)
    assert primera.status_code == 201
    id_a = primera.json()["id"]
    assert cliente.delete(f"/v1/validations/{id_a}", headers=AUTH_KT).status_code == 204
    segunda = cliente.post("/v1/validations", json=CREAR_CUERPO, headers=cabeceras)
    assert segunda.status_code == 201
    assert "idempotent-replayed" not in segunda.headers
    id_b = segunda.json()["id"]
    assert id_b != id_a
    assert cliente.get(f"/v1/validations/{id_b}", headers=AUTH_KT).status_code == 200
    tercera = cliente.post("/v1/validations", json=CREAR_CUERPO, headers=cabeceras)
    assert tercera.headers["idempotent-replayed"] == "true"
    assert tercera.content == segunda.content
