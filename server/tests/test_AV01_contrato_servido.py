"""AV-01: el contrato OpenAPI 3.1 publicado es el que sirve la aplicación (tarea 2.2)."""

from typing import Any

import yaml
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.routing import Route

from app.main import crear_app
from tests.utilidades import RUTA_CONTRATO, config_de_prueba

METODOS_HTTP = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}

RUTAS_ESPERADAS = {
    ("GET", "/salud"),
    ("GET", "/openapi.json"),
    ("POST", "/v1/validations"),
    ("GET", "/v1/validations/{id}"),
    ("DELETE", "/v1/validations/{id}"),
    ("POST", "/v1/validations/{id}/images"),
}


def _contrato() -> dict[str, Any]:
    with RUTA_CONTRATO.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_AV01_el_documento_servido_es_el_contrato() -> None:
    """El documento servido es el contrato: `GET /openapi.json` sin autenticación responde 200 con
    `Content-Type: application/json`, `openapi` vale "3.1.1" y el JSON es igual al YAML."""
    cliente = TestClient(crear_app(config_de_prueba()))
    respuesta = cliente.get("/openapi.json")
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "application/json"
    cuerpo = respuesta.json()
    assert cuerpo["openapi"] == "3.1.1"
    assert cuerpo == _contrato()


def test_AV01_paridad_de_rutas() -> None:
    """Paridad de rutas: las rutas registradas y `paths` del contrato son exactamente el conjunto
    de la spec, y el contrato declara el webhook `validation.completed`."""
    aplicacion = crear_app(config_de_prueba())
    registradas: set[tuple[str, str]] = set()
    for ruta in aplicacion.routes:
        assert isinstance(ruta, Route | APIRoute), f"ruta de tipo inesperado: {ruta!r}"
        # Starlette añade HEAD implícito a cada GET; no es una operación del contrato.
        registradas |= {(metodo, ruta.path) for metodo in (ruta.methods or set()) - {"HEAD"}}

    contrato = _contrato()
    declaradas = {
        (metodo.upper(), ruta)
        for ruta, operaciones in contrato["paths"].items()
        for metodo in operaciones
        if metodo in METODOS_HTTP
    }
    assert registradas == RUTAS_ESPERADAS
    assert declaradas == RUTAS_ESPERADAS
    assert list(contrato["webhooks"]) == ["validation.completed"]
    assert "post" in contrato["webhooks"]["validation.completed"]
