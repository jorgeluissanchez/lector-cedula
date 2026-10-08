"""Autenticación por clave de API (AV-02, decisión 7).

Solo se guardan hashes SHA-256 de las claves (`CLAVES_API_JSON`); la clave en claro nunca se guarda
ni se registra. El modo sale del prefijo: `sk_test_` es sandbox y `sk_live_` es live.
"""

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass, field

from fastapi import Request

from app.config import ClaveConfigurada, Config
from app.errores import ErrorApi

PREFIJOS_MODO = {"sk_test_": True, "sk_live_": False}


@dataclass(frozen=True)
class Cliente:
    """Cliente autenticado. `hash_clave` lo identifica como propietario de sus validaciones."""

    hash_clave: str
    sandbox: bool
    secreto_webhook: str = field(repr=False)
    # SDK-16: orígenes de navegador admitidos (ya resueltos con `ORIGENES_CORS` en la forma anterior)
    # y retornos exactos de la sesión alojada.
    origenes: tuple[str, ...] = ()
    retornos: tuple[str, ...] = ()


def autenticar(
    cabecera: str | None, claves: Mapping[str, ClaveConfigurada], config: Config | None = None
) -> Cliente | None:
    """Devuelve el cliente de `Authorization: Bearer <clave>` o `None` si no es una clave configurada."""
    if not cabecera:
        return None
    partes = cabecera.split(" ")
    if len(partes) != 2 or partes[0].lower() != "bearer" or not partes[1]:
        return None
    clave = partes[1]
    sandbox = next((modo for prefijo, modo in PREFIJOS_MODO.items() if clave.startswith(prefijo)), None)
    if sandbox is None:
        return None
    configurada = claves.get(hashlib.sha256(clave.encode()).hexdigest())
    if configurada is None:
        return None
    return Cliente(
        hash_clave=configurada.sha256,
        sandbox=sandbox,
        secreto_webhook=configurada.secreto_webhook,
        origenes=config.origenes_de(configurada) if config is not None else (),
        retornos=configurada.retornos,
    )


def exigir_origen(request: Request, origenes: tuple[str, ...]) -> None:
    """SDK-16: una petición de navegador (con `Origin`) desde un origen no configurado para la clave
    recibe 403 `origin-not-allowed`. Las peticiones de servidor no envían `Origin` y no se ven afectadas."""
    origen = request.headers.get("origin")
    if origen is not None and origen not in origenes:
        raise ErrorApi(403, "origin-not-allowed")


async def cliente_requerido(request: Request) -> Cliente:
    """Dependencia de FastAPI para las rutas `/v1`: 401 `unauthorized` sin una clave configurada."""
    config = request.app.state.config
    cliente = autenticar(request.headers.get("authorization"), config.claves, config)
    if cliente is None:
        raise ErrorApi(401, "unauthorized", cabeceras={"WWW-Authenticate": "Bearer"})
    exigir_origen(request, cliente.origenes)
    request.state.cliente = cliente
    return cliente


def aplicar_limite(request: Request, propietario: str) -> None:
    """AV-11: 429 `rate-limited` si la clave `propietario` agotó su ventana. Se llama antes de leer el
    cuerpo; las subidas con token cuentan para la clave creadora."""
    espera = request.app.state.limitador.registrar(propietario, request.app.state.puertos.reloj.ahora())
    if espera is not None:
        raise ErrorApi(429, "rate-limited", cabeceras={"Retry-After": str(espera)})


async def cliente_limitado(request: Request) -> Cliente:
    """Dependencia de las rutas `/v1` con clave: autentica (401) y aplica el límite (429)."""
    cliente = await cliente_requerido(request)
    aplicar_limite(request, cliente.hash_clave)
    return cliente
