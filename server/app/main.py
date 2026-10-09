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
from app.cors import MiddlewareCors
from app.errores import registrar_manejadores
from app.idempotencia import RegistroIdempotencia
from app.limite import VentanaDeslizante
from app.logs import configurar_logs
from app.puertos import Puertos
from app.rutas import alojada, sdk, validaciones
from app.seguridad import MiddlewareSeguridad
from app.servicio import ServicioValidaciones
from app.webhooks import ServicioWebhooks


def _puertos_por_defecto(config: Config) -> Puertos:
    """Con `LECTOR_LIVE=node`, el modo live usa el lector Node de packages/capture (MS-19)."""
    if config.lector_live != "node":
        return Puertos()
    from app.motor_real import LectorNode
    from app.puertos import RelojSistema

    reloj = RelojSistema()
    return Puertos(reloj=reloj, lector=LectorNode(reloj))


def crear_app(config: Config | None = None, puertos: Puertos | None = None) -> FastAPI:
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
    aplicacion.state.puertos = puertos or _puertos_por_defecto(config)
    aplicacion.state.idempotencia = RegistroIdempotencia()
    aplicacion.state.limitador = VentanaDeslizante(config.limite_peticiones_por_minuto)
    aplicacion.state.servicio = ServicioValidaciones(
        aplicacion.state.almacen, aplicacion.state.puertos, config
    )
    aplicacion.state.servicio.webhooks = ServicioWebhooks(
        aplicacion.state.almacen, aplicacion.state.puertos, config
    )
    registrar_manejadores(aplicacion)
    # Orden: el último añadido es el más externo. Seguridad envuelve a CORS para que el preflight también
    # lleve las cabeceras de AV-33 y su línea de log.
    aplicacion.add_middleware(MiddlewareCors)
    aplicacion.add_middleware(MiddlewareSeguridad, base_tipos_problema=config.base_tipos_problema)

    def servir_contrato() -> dict[str, Any]:
        return contrato

    aplicacion.openapi = servir_contrato  # type: ignore[method-assign]

    @aplicacion.get("/salud")
    def salud() -> dict[str, str]:
        """Comprobación de vida para el orquestador de contenedores."""
        return {"estado": "ok"}

    validaciones.registrar(aplicacion)
    sdk.registrar(aplicacion)
    alojada.registrar(aplicacion)
    return aplicacion


app = crear_app()
