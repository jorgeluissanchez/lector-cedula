"""AV-32 (base): logs JSON sin datos personales (tarea 3.3).

El flujo completo (creación, subida, webhook, supresión) se prueba en la tarea 9.1. Aquí se prueba
la base: formato JSON, lista de claves permitidas, `route` como plantilla, access log de uvicorn
desactivado y loggers ajenos sin mensajes ni trazas. Datos sintéticos únicamente.
"""

import json
import logging
import sys
from typing import Any

import pytest

from app.logs import CLAVES_PERMITIDAS, configurar_logs
from tests.utilidades import KT, crear_cliente

MARCADOR = "ZZMARCAZZ"
ID_A = "val_0123456789abcdef0123456789abcdef"


def _lineas(salida: str) -> list[dict[str, Any]]:
    lineas = [linea for linea in salida.splitlines() if linea.strip()]
    registros = [json.loads(linea) for linea in lineas]
    for registro in registros:
        assert set(registro) <= set(CLAVES_PERMITIDAS), registro
    return registros


def test_AV32_peticion_con_token_y_clave_sin_datos_en_logs(capsys: pytest.CaptureFixture[str]) -> None:
    """Una petición `GET` con `?token=ZZMARCAZZ` y `Authorization: Bearer KT` produce una línea JSON
    con claves permitidas, `route` como plantilla y 0 apariciones de `ZZMARCAZZ`, `sk_test_` y
    `Authorization`."""
    cliente = crear_cliente()
    capsys.readouterr()
    respuesta = cliente.get(
        f"/v1/validations/{ID_A}?token={MARCADOR}",
        headers={"Authorization": f"Bearer {KT}", "X-Otra": MARCADOR},
    )
    salida = capsys.readouterr()
    texto = salida.out + salida.err
    assert MARCADOR not in texto
    assert "sk_test_" not in texto
    assert "Authorization" not in texto
    assert "authorization" not in texto

    registros = _lineas(salida.out)
    peticiones = [r for r in registros if r["event"] == "peticion"]
    assert len(peticiones) == 1
    peticion = peticiones[0]
    assert peticion["route"] == "/v1/validations/{id}"
    assert peticion["method"] == "GET"
    assert peticion["status"] == respuesta.status_code == 404
    assert peticion["request_id"] == respuesta.headers["x-request-id"]
    assert peticion["sandbox"] is True
    assert peticion["level"] == "info"
    assert isinstance(peticion["duration_ms"], float)
    assert "validation_id" not in peticion  # no es una validación del cliente


def test_AV32_ruta_desconocida_y_sin_autenticar(capsys: pytest.CaptureFixture[str]) -> None:
    """Una ruta que no existe se registra con `route` nulo (nunca la ruta pedida) y sin `sandbox`."""
    cliente = crear_cliente()
    capsys.readouterr()
    cliente.get(f"/v1/{MARCADOR}/9999123456")
    salida = capsys.readouterr().out
    assert MARCADOR not in salida
    assert "9999123456" not in salida
    (peticion,) = [r for r in _lineas(salida) if r["event"] == "peticion"]
    assert peticion["route"] is None
    assert peticion["status"] == 404
    assert peticion["sandbox"] is None


def test_AV32_metodo_arbitrario_no_se_registra(capsys: pytest.CaptureFixture[str]) -> None:
    """Un método HTTP inventado por el cliente no se reproduce en el log."""
    cliente = crear_cliente()
    capsys.readouterr()
    cliente.request(MARCADOR, "/v1/validations")
    salida = capsys.readouterr().out
    assert MARCADOR not in salida
    (peticion,) = [r for r in _lineas(salida) if r["event"] == "peticion"]
    assert "method" not in peticion


def test_AV32_error_interno_sin_mensaje_ni_traza(capsys: pytest.CaptureFixture[str]) -> None:
    """Base de "Errores sin datos personales en logs": una excepción con datos en su mensaje se
    registra como `error_interno` sin mensaje ni traza."""
    from fastapi.testclient import TestClient

    from app.main import crear_app
    from tests.utilidades import config_de_prueba

    aplicacion = crear_app(config_de_prueba())

    @aplicacion.get("/v1/falla-de-prueba")
    async def falla() -> None:
        raise RuntimeError("9999123456 traza interna")

    cliente = TestClient(aplicacion, raise_server_exceptions=False)
    capsys.readouterr()
    assert cliente.get("/v1/falla-de-prueba").status_code == 500
    salida = capsys.readouterr()
    texto = salida.out + salida.err
    assert "9999123456" not in texto
    assert "Traceback" not in texto
    registros = _lineas(salida.out)
    assert [r["event"] for r in registros] == ["error_interno", "peticion"]
    assert registros[0]["level"] == "error"
    assert registros[1]["status"] == 500


def test_AV32_claves_fuera_de_la_lista_se_descartan(capsys: pytest.CaptureFixture[str]) -> None:
    """El filtro descarta toda clave fuera de la lista y todo valor con forma inesperada; el mensaje
    solo se usa como `event` si es un nombre de evento."""
    configurar_logs()
    log = logging.getLogger("lector.prueba")
    capsys.readouterr()
    log.info(
        "peticion",
        extra={
            "campos": {
                "nombre": "FICTICIA",
                "document_number": "9999123456",
                "route": f"/v1/{MARCADOR} 9999123456",
                "validation_id": "9999123456",
                "status": "9999123456",
                "outcome": "PEÑA",
                "request_id": "no-es-uuid-9999123456",
                "attempt": 2,
            }
        },
    )
    log.info("mensaje con 9999123456 y %s", MARCADOR)
    salida = capsys.readouterr().out
    assert "9999123456" not in salida
    assert MARCADOR not in salida
    assert "FICTICIA" not in salida
    assert "PEÑA" not in salida
    primero, segundo = _lineas(salida)
    assert set(primero) == {"ts", "level", "event", "attempt"}
    assert primero["attempt"] == 2
    assert segundo["event"] == "evento"


def test_AV32_loggers_de_uvicorn_sin_mensajes_ni_access_log(capsys: pytest.CaptureFixture[str]) -> None:
    """El access log de uvicorn está desactivado (registraría la query con el token) y los demás
    loggers ajenos salen como JSON sin su mensaje ni su traza."""
    configurar_logs()
    capsys.readouterr()
    acceso = logging.getLogger("uvicorn.access")
    acceso.info('%s - "%s %s HTTP/%s" %d', "10.0.0.1", "GET", f"/v1/x?token={MARCADOR}", "1.1", 200)
    try:
        raise RuntimeError("9999123456 traza")
    except RuntimeError:
        logging.getLogger("uvicorn.error").exception("Exception in ASGI application %s", MARCADOR)
    logging.getLogger("asyncio").error("Task exception was never retrieved 9999123456")
    salida = capsys.readouterr()
    texto = salida.out + salida.err
    assert MARCADOR not in texto
    assert "9999123456" not in texto
    assert "Traceback" not in texto
    registros = _lineas(salida.out)
    assert [(r["event"], r["level"]) for r in registros] == [("servidor", "error"), ("servidor", "error")]


def test_AV32_salida_estandar_y_un_solo_manejador(capsys: pytest.CaptureFixture[str]) -> None:
    """Configurar varias veces no duplica líneas (cada `crear_app` llama a `configurar_logs`)."""
    for _ in range(3):
        configurar_logs()
    capsys.readouterr()
    logging.getLogger("lector").info("prueba_unica")
    salida = capsys.readouterr()
    assert [r["event"] for r in _lineas(salida.out)] == ["prueba_unica"]
    assert salida.err == ""
    assert sys.stdout is not None
