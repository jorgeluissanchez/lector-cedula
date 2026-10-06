"""API de respaldo del lector de cédula.

Principio III: ningún endpoint escribe imágenes ni datos personales a disco o a logs.
El contrato `openapi/api-validaciones.yaml` es la fuente de verdad (decisión 1): se sirve tal cual
en `/openapi.json` y las pruebas de paridad y Schemathesis detectan cualquier deriva.
"""

import os
from typing import Any

from fastapi import FastAPI

from app.almacen import Almacen
from app.config import Config
from app.contrato import cargar_contrato
from app.errores import registrar_manejadores
from app.logs import configurar_logs
from app.rutas import validaciones
from app.seguridad import MiddlewareSeguridad


def crear_app(config: Config | None = None) -> FastAPI:
    configurar_logs()
    config = config or Config.desde_entorno(os.environ)
    contrato = cargar_contrato()
    aplicacion = FastAPI(
        title=contrato["info"]["title"],
        version=contrato["info"]["version"],
        openapi_url="/openapi.json",
        docs_url=None,
        redoc_url=None,
    )
    aplicacion.state.config = config
    aplicacion.state.almacen = Almacen()
    registrar_manejadores(aplicacion)
    aplicacion.add_middleware(MiddlewareSeguridad, base_tipos_problema=config.base_tipos_problema)

    def servir_contrato() -> dict[str, Any]:
        return contrato

    aplicacion.openapi = servir_contrato  # type: ignore[method-assign]

    @aplicacion.get("/salud")
    def salud() -> dict[str, str]:
        """Comprobación de vida para el orquestador de contenedores."""
        return {"estado": "ok"}

    validaciones.registrar(aplicacion)
    return aplicacion


app = crear_app()
