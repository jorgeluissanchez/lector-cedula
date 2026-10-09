"""SDK-40: destinos de webhook solo para pruebas (`WEBHOOK_DESTINOS_PRUEBA` con `ENTORNO=pruebas`)."""

import json
import os
import subprocess
import sys

import pytest

from app.config import Config
from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    PlanificadorFalso,
    RelojFalso,
    ResolvedorFalso,
    TransporteFalso,
    claves_multi,
    config_multi,
    crear,
    puertos_de_prueba,
    ruta_de_subida,
    subir,
)

DESTINO = "http://host.docker.internal:8091/webhook"
PARTES = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}


def _entorno(**extra: str) -> dict[str, str]:
    return {"CLAVES_API_JSON": json.dumps(claves_multi()), **extra}


def test_SDK40_aceptada_en_pruebas() -> None:
    config = Config.desde_entorno(_entorno(ENTORNO="pruebas", WEBHOOK_DESTINOS_PRUEBA=DESTINO))
    assert config.webhook_destinos_prueba == (DESTINO,)


@pytest.mark.parametrize("entorno", [None, "produccion", "PRUEBAS", ""])
def test_SDK40_rechazada_fuera_de_pruebas(entorno: str | None) -> None:
    extra = {"WEBHOOK_DESTINOS_PRUEBA": DESTINO}
    if entorno is not None:
        extra["ENTORNO"] = entorno
    with pytest.raises(ValueError, match="WEBHOOK_DESTINOS_PRUEBA"):
        Config.desde_entorno(_entorno(**extra))


@pytest.mark.parametrize(
    "lista",
    [
        "*",
        "http://*.example/x",
        "ftp://host.docker.internal/x",
        "http://u:p@h.example/x",
        "http://h.example/x#f",
        "",
    ],
)
def test_SDK40_destinos_no_exactos_se_rechazan(lista: str) -> None:
    with pytest.raises(ValueError, match="WEBHOOK_DESTINOS_PRUEBA"):
        Config.desde_entorno(_entorno(ENTORNO="pruebas", WEBHOOK_DESTINOS_PRUEBA=lista))


def test_SDK40_rechazada_en_produccion_detiene_el_arranque() -> None:
    entorno = {**os.environ, **_entorno(WEBHOOK_DESTINOS_PRUEBA=DESTINO)}
    entorno.pop("ENTORNO", None)
    proceso = subprocess.run(  # noqa: S603 - intérprete y argumentos fijos
        [sys.executable, "-c", "import app.main"],
        env=entorno,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert proceso.returncode != 0
    assert "WEBHOOK_DESTINOS_PRUEBA" in proceso.stdout + proceso.stderr


def _cliente(transporte: TransporteFalso, resolvedor: ResolvedorFalso):  # type: ignore[no-untyped-def]
    from fastapi.testclient import TestClient

    from app.main import crear_app

    reloj = RelojFalso()
    puertos = puertos_de_prueba(
        reloj=reloj, planificador=PlanificadorFalso(reloj), transporte=transporte, resolvedor=resolvedor
    )
    config = config_multi(entorno="pruebas", webhook_destinos_prueba=(DESTINO,))
    return TestClient(crear_app(config, puertos), raise_server_exceptions=False), puertos


def test_SDK40_destino_listado_se_entrega_aunque_sea_interno_y_http() -> None:
    transporte = TransporteFalso()
    resolvedor = ResolvedorFalso({"host.docker.internal": ["192.168.65.254"]})
    cliente, puertos = _cliente(transporte, resolvedor)
    creada = crear(cliente, webhook_url=DESTINO, sandbox_scenario="success")
    assert creada.status_code == 201, creada.text[:300]
    assert subir(cliente, ruta_de_subida(creada.json()), PARTES).status_code == 200
    puertos.planificador.ejecutar_hasta(puertos.reloj.ahora())
    assert len(transporte.peticiones) == 1
    assert transporte.peticiones[0]["url"] == DESTINO
    assert transporte.peticiones[0]["cabeceras"]["X-Lector-Signature"].startswith("t=")


def test_SDK40_destino_no_listado_sigue_rechazado_por_AV28() -> None:
    cliente, _ = _cliente(TransporteFalso(), ResolvedorFalso())
    respuesta = crear(cliente, webhook_url="http://host.docker.internal:8092/otro")
    assert respuesta.status_code == 422
    assert respuesta.json()["errors"] == [{"pointer": "/webhook_url", "code": "invalid_webhook_url"}]


def test_SDK40_https_no_listado_a_ip_interna_sigue_blocked() -> None:
    transporte = TransporteFalso()
    resolvedor = ResolvedorFalso({"receptor.example": ["10.0.0.5"]})
    cliente, puertos = _cliente(transporte, resolvedor)
    creada = crear(cliente, webhook_url="https://receptor.example/w", sandbox_scenario="success")
    assert creada.status_code == 201
    subir(cliente, ruta_de_subida(creada.json()), PARTES)
    puertos.planificador.ejecutar_hasta(puertos.reloj.ahora())
    assert transporte.peticiones == []


def test_SDK40_sin_la_variable_no_hay_excepcion() -> None:
    cliente, _ = _cliente(TransporteFalso(), ResolvedorFalso())
    cliente.app.state.config = config_multi()  # type: ignore[attr-defined]
    respuesta = crear(cliente, webhook_url=DESTINO)
    assert respuesta.status_code == 422
