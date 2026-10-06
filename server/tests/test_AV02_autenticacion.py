"""AV-02: autenticación por clave de API y aislamiento por cliente (tarea 3.2)."""

from typing import Any

import pytest

from app.auth import autenticar
from tests.utilidades import (
    CREAR_CUERPO,
    KL,
    KT,
    KT2,
    SECRETO_WEBHOOK_KL,
    SECRETO_WEBHOOK_KT,
    config_de_prueba,
    crear_cliente,
    hash_clave,
)

BASE = "https://lector-cedula.example/problemas/"
ID_A = "val_0123456789abcdef0123456789abcdef"
ID_INEXISTENTE = "val_fedcba9876543210fedcba9876543210"


def _sin_request_id(cuerpo: dict[str, Any]) -> dict[str, Any]:
    return {clave: valor for clave, valor in cuerpo.items() if clave != "request_id"}


def test_AV02_sin_cabecera_de_autorizacion() -> None:
    """Sin cabecera de autorización: `GET /v1/validations/val_0123...` sin `Authorization` responde
    401 `PROBLEM(unauthorized)` con `WWW-Authenticate: Bearer`."""
    respuesta = crear_cliente().get(f"/v1/validations/{ID_A}")
    assert respuesta.status_code == 401
    assert respuesta.headers["content-type"] == "application/problem+json"
    assert respuesta.headers["www-authenticate"] == "Bearer"
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE + "unauthorized"
    assert cuerpo["code"] == "unauthorized"


def test_AV02_clave_desconocida() -> None:
    """Clave desconocida: `CREAR` con `sk_test_9999...`, no configurada, responde 401
    `PROBLEM(unauthorized)` y no se crea ninguna validación."""
    cliente = crear_cliente()
    almacen = cliente.app.state.almacen  # type: ignore[attr-defined]
    antes = len(almacen)
    respuesta = cliente.post(
        "/v1/validations",
        headers={"Authorization": "Bearer sk_test_99999999999999999999999999999999"},
        json=CREAR_CUERPO,
    )
    assert respuesta.status_code == 401
    assert respuesta.headers["content-type"] == "application/problem+json"
    assert respuesta.headers["www-authenticate"] == "Bearer"
    assert respuesta.json()["type"] == BASE + "unauthorized"
    assert len(almacen) == antes


def test_AV02_validacion_de_otro_cliente() -> None:
    """Validación de otro cliente: una validación de `KT` consultada con `KT2` responde 404
    `PROBLEM(not-found)`, idéntica a la de un `id` inexistente salvo `request_id`.

    La validación se crea con `CREAR` (tarea 4.1). La prueba exige además que `KT` sí la encuentre,
    para que el 404 de `KT2` sea por aislamiento y no por inexistencia."""
    cliente = crear_cliente()
    creada = cliente.post("/v1/validations", headers={"Authorization": f"Bearer {KT}"}, json=CREAR_CUERPO)
    assert creada.status_code == 201
    id_a = creada.json()["id"]
    ajena = cliente.get(f"/v1/validations/{id_a}", headers={"Authorization": f"Bearer {KT2}"})
    inexistente = cliente.get(f"/v1/validations/{ID_INEXISTENTE}", headers={"Authorization": f"Bearer {KT2}"})
    propia = cliente.get(f"/v1/validations/{id_a}", headers={"Authorization": f"Bearer {KT}"})

    assert ajena.status_code == 404
    assert ajena.headers["content-type"] == "application/problem+json"
    assert ajena.json()["type"] == BASE + "not-found"
    assert inexistente.status_code == 404
    assert _sin_request_id(ajena.json()) == _sin_request_id(inexistente.json())
    assert ajena.json()["request_id"] != inexistente.json()["request_id"]
    assert propia.status_code == 200
    assert propia.json()["id"] == id_a

    for metodo in ("DELETE",):
        ajena = cliente.request(metodo, f"/v1/validations/{id_a}", headers={"Authorization": f"Bearer {KT2}"})
        assert ajena.status_code == 404
        assert _sin_request_id(ajena.json()) == _sin_request_id(inexistente.json())


@pytest.mark.parametrize(
    "cabecera",
    [
        None,
        "",
        "Bearer",
        "Bearer ",
        f"Basic {KT}",
        f"bearer{KT}",
        "Bearer sk_prod_00000000000000000000000000000000",
        f"Bearer {KT} extra",
    ],
)
def test_AV02_cabeceras_invalidas_no_autentican(cabecera: str | None) -> None:
    """Toda cabecera que no sea `Bearer <clave configurada>` deja la petición sin cliente."""
    assert autenticar(cabecera, config_de_prueba().claves) is None


def test_AV02_modo_por_prefijo() -> None:
    """El prefijo `sk_test_` selecciona sandbox y `sk_live_` live; el cliente se identifica por el
    hash de la clave y conserva su secreto de webhooks."""
    claves = config_de_prueba().claves
    prueba = autenticar(f"Bearer {KT}", claves)
    real = autenticar(f"Bearer {KL}", claves)
    assert prueba is not None and real is not None
    assert (prueba.sandbox, prueba.hash_clave, prueba.secreto_webhook) == (
        True,
        hash_clave(KT),
        SECRETO_WEBHOOK_KT,
    )
    assert (real.sandbox, real.hash_clave, real.secreto_webhook) == (
        False,
        hash_clave(KL),
        SECRETO_WEBHOOK_KL,
    )
    assert KT not in repr(prueba)
    assert SECRETO_WEBHOOK_KT not in repr(prueba)


def test_AV02_clave_configurada_sin_prefijo_valido() -> None:
    """Una clave configurada cuyo prefijo no es `sk_test_` ni `sk_live_` no autentica: el modo no se
    puede deducir."""
    clave = "pk_test_00000000000000000000000000000000"
    claves = config_de_prueba().claves
    claves = {**claves, hash_clave(clave): next(iter(claves.values()))}
    assert autenticar(f"Bearer {clave}", claves) is None
