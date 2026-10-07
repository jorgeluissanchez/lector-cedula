"""Consulta, supresión y retención (tarea 6.1): AV-13, AV-23 "Supresión de una validación terminada" y
"Registro mínimo de prueba de la autorización", AV-24 y AV-33 para creación y subida."""

import uuid
from typing import Any

from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AUTH_KT,
    AUTH_KT2,
    BASE_PROBLEMAS,
    crear,
    crear_cliente_con,
    reloj_de,
    ruta_de_subida,
    subir,
)

FRONT_BACK = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}


def _no_encontrado(respuesta: Any) -> dict[str, Any]:
    assert respuesta.status_code == 404, respuesta.text
    assert respuesta.headers["content-type"] == "application/problem+json"
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE_PROBLEMAS + "not-found"
    return {k: v for k, v in cuerpo.items() if k != "request_id"}


def _terminada(cliente: Any) -> tuple[dict[str, Any], Any]:
    creada = crear(cliente).json()
    subida = subir(cliente, ruta_de_subida(creada), FRONT_BACK)
    assert subida.status_code == 200
    return creada, subida


def test_AV13_consulta_de_una_validacion_terminada() -> None:
    """Consulta de una validación terminada: tras la subida completa, `GET` con `KT` da 200 y el
    cuerpo es igual al de la respuesta de la subida."""
    cliente = crear_cliente_con()
    creada, subida = _terminada(cliente)
    consulta = cliente.get(f"/v1/validations/{creada['id']}", headers=AUTH_KT)
    assert consulta.status_code == 200
    assert consulta.headers["content-type"] == "application/json"
    assert consulta.content == subida.content


def test_AV13_identificador_mal_formado() -> None:
    """Identificador mal formado: `GET /v1/validations/abc` y `/val_XYZ` dan 404 `not-found`, con el
    mismo cuerpo que un `id` inexistente, suprimido o vencido salvo `request_id`."""
    cliente = crear_cliente_con()
    cuerpos = [
        _no_encontrado(cliente.get(f"/v1/validations/{i}", headers=AUTH_KT)) for i in ("abc", "val_XYZ")
    ]
    cuerpos.append(
        _no_encontrado(cliente.get("/v1/validations/val_0123456789abcdef0123456789abcdef", headers=AUTH_KT))
    )
    suprimida = crear(cliente).json()["id"]
    assert cliente.delete(f"/v1/validations/{suprimida}", headers=AUTH_KT).status_code == 204
    cuerpos.append(_no_encontrado(cliente.get(f"/v1/validations/{suprimida}", headers=AUTH_KT)))
    assert all(c == cuerpos[0] for c in cuerpos)


def test_AV23_supresion_de_una_validacion_terminada() -> None:
    """Supresión de una validación terminada: `DELETE` con `KT` da 204 sin cuerpo; después `GET`, una
    nueva subida y un segundo `DELETE` dan 404 `not-found`."""
    cliente = crear_cliente_con()
    creada, _ = _terminada(cliente)
    ruta = f"/v1/validations/{creada['id']}"
    supresion = cliente.delete(ruta, headers=AUTH_KT)
    assert supresion.status_code == 204
    assert supresion.content == b""
    assert supresion.headers["cache-control"] == "no-store"
    _no_encontrado(cliente.get(ruta, headers=AUTH_KT))
    _no_encontrado(subir(cliente, f"{ruta}/images", FRONT_BACK, AUTH_KT))
    _no_encontrado(subir(cliente, ruta_de_subida(creada), FRONT_BACK))
    _no_encontrado(cliente.delete(ruta, headers=AUTH_KT))
    assert cliente.app.state.almacen.obtener_sin_propietario(creada["id"]) is None  # type: ignore[attr-defined]


def test_AV23_supresion_de_otro_cliente() -> None:
    """`DELETE` con `KT2` sobre una validación de `KT` da 404 y no la suprime."""
    cliente = crear_cliente_con()
    creada = crear(cliente).json()
    _no_encontrado(cliente.delete(f"/v1/validations/{creada['id']}", headers=AUTH_KT2))
    assert cliente.get(f"/v1/validations/{creada['id']}", headers=AUTH_KT).status_code == 200


def test_AV23_registro_minimo_de_prueba_de_la_autorizacion() -> None:
    """Registro mínimo de prueba de la autorización: `DELETE` a las 15:21:00Z guarda exactamente el
    registro de la spec, sin `9999123456`, `PEÑA` ni `FICTICIA`; al vencer la retención se guarda el
    mismo registro con `motivo` `retencion`."""
    cliente = crear_cliente_con()
    creada, _ = _terminada(cliente)
    reloj_de(cliente).fijar(1_791_300_060)
    assert cliente.delete(f"/v1/validations/{creada['id']}", headers=AUTH_KT).status_code == 204
    registro = cliente.app.state.servicio.pruebas_autorizacion  # type: ignore[attr-defined]
    assert registro == [
        {
            "validation_id": creada["id"],
            "datos": True,
            "sensibles": False,
            "version_texto": "2026-10-01",
            "otorgada_en": "2026-10-06T15:19:00Z",
            "registrada_en": "2026-10-06T15:20:00Z",
            "suprimida_en": "2026-10-06T15:21:00Z",
            "motivo": "revocacion",
        }
    ]
    texto = repr(registro)
    assert all(dato not in texto for dato in ("9999123456", "PEÑA", "FICTICIA"))

    otra = crear_cliente_con()
    retenida, _ = _terminada(otra)
    reloj_de(otra).fijar(1_791_386_401)
    _no_encontrado(otra.get(f"/v1/validations/{retenida['id']}", headers=AUTH_KT))
    (prueba,) = otra.app.state.servicio.pruebas_autorizacion  # type: ignore[attr-defined]
    assert prueba["motivo"] == "retencion"
    assert prueba["suprimida_en"] == "2026-10-07T15:20:00Z"
    assert set(prueba) == set(registro[0])


def test_AV24_vencimiento_de_la_retencion() -> None:
    """Vencimiento de la retención: una validación que termina a las 15:20:00Z tiene `expires_at`
    `2026-10-07T15:20:00Z`; con el reloj en `2026-10-07T15:20:01Z`, `GET` da 404."""
    cliente = crear_cliente_con()
    creada, subida = _terminada(cliente)
    assert subida.json()["expires_at"] == "2026-10-07T15:20:00Z"
    reloj_de(cliente).fijar(1_791_386_399)
    assert cliente.get(f"/v1/validations/{creada['id']}", headers=AUTH_KT).status_code == 200
    reloj_de(cliente).fijar(1_791_386_401)
    _no_encontrado(cliente.get(f"/v1/validations/{creada['id']}", headers=AUTH_KT))


def test_AV24_la_retencion_la_aplica_el_planificador() -> None:
    """Sin ninguna consulta, el planificador elimina la validación al vencer la retención."""
    cliente = crear_cliente_con()
    creada, _ = _terminada(cliente)
    planificador = cliente.app.state.puertos.planificador  # type: ignore[attr-defined]
    planificador.ejecutar_hasta(1_791_386_399)
    assert cliente.app.state.almacen.obtener_sin_propietario(creada["id"]) is not None  # type: ignore[attr-defined]
    planificador.ejecutar_hasta(1_791_386_400)
    assert cliente.app.state.almacen.obtener_sin_propietario(creada["id"]) is None  # type: ignore[attr-defined]


def _cabeceras_de_seguridad(respuesta: Any) -> None:
    assert respuesta.headers["cache-control"] == "no-store"
    assert respuesta.headers["x-content-type-options"] == "nosniff"
    assert respuesta.headers["referrer-policy"] == "no-referrer"
    identificador = respuesta.headers["x-request-id"]
    assert uuid.UUID(identificador).version == 4 and str(uuid.UUID(identificador)) == identificador


def test_AV33_cabeceras_en_exito_y_en_error() -> None:
    """Cabeceras en éxito y en error: `CREAR`, una subida completa y un `GET` con un `id` inexistente
    traen `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
    y un `X-Request-Id` UUID versión 4."""
    cliente = crear_cliente_con()
    creada = crear(cliente)
    subida = subir(cliente, ruta_de_subida(creada.json()), FRONT_BACK)
    inexistente = cliente.get("/v1/validations/val_0123456789abcdef0123456789abcdef", headers=AUTH_KT)
    assert (creada.status_code, subida.status_code, inexistente.status_code) == (201, 200, 404)
    for respuesta in (creada, subida, inexistente):
        _cabeceras_de_seguridad(respuesta)
