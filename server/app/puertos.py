"""Puertos inyectables (decisión 6): reloj, generador de ids, planificador y motores.

En producción: reloj del sistema, `secrets.token_hex`, tareas de asyncio y `MotorSandbox`; en modo
live no hay motor todavía (AV-22). En pruebas, dobles que controla el test; nunca esperas por tiempo.
"""

import asyncio
import inspect
import secrets
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.motor import Motor
from app.sandbox.motor import MotorSandbox


class Reloj(Protocol):
    def ahora(self) -> float:
        """Instante actual en segundos unix (UTC)."""
        ...


class RelojSistema:
    def ahora(self) -> float:
        return time.time()


class GeneradorIds(Protocol):
    def id_validacion(self) -> str: ...

    def id_evento(self) -> str: ...


class GeneradorSeguro:
    """Identificadores con un generador criptográficamente seguro (AV-03)."""

    def id_validacion(self) -> str:
        return f"val_{secrets.token_hex(16)}"

    def id_evento(self) -> str:
        return f"evt_{secrets.token_hex(16)}"


class Cancelable(Protocol):
    def cancel(self) -> Any: ...


class Planificador(Protocol):
    def programar(self, instante: float, funcion: Callable[[], Any]) -> Cancelable:
        """Ejecuta `funcion` en `instante` (segundos unix según el reloj de la aplicación)."""
        ...


class PlanificadorAsyncio:
    """Planificador de producción sobre el bucle de asyncio en curso."""

    def __init__(self, reloj: Reloj) -> None:
        self._reloj = reloj

    def programar(self, instante: float, funcion: Callable[[], Any]) -> Cancelable:
        def _ejecutar() -> None:
            resultado = funcion()
            if inspect.isawaitable(resultado):
                asyncio.ensure_future(resultado)

        retraso = max(0.0, instante - self._reloj.ahora())
        return asyncio.get_running_loop().call_later(retraso, _ejecutar)


@dataclass
class Puertos:
    reloj: Reloj = field(default_factory=RelojSistema)
    generador_ids: GeneradorIds = field(default_factory=GeneradorSeguro)
    # `None`: planificador de asyncio sobre `reloj`.
    planificador: Planificador | None = None
    motor_sandbox: Motor = field(default_factory=MotorSandbox)
    # Modo live: sin motor real todavía; la subida responde 503 (AV-22).
    motor_live: Motor | None = None
    # Recibe cada validación que llega a un estado terminal (los webhooks se enchufan aquí).
    notificador: Callable[[Any], None] | None = None
    # Punto de espera tras reservar una `Idempotency-Key` y antes de crear. Solo lo usan las pruebas de
    # concurrencia (AV-12) con un `asyncio.Event`; en producción es `None`.
    retener_creacion: Callable[[], Awaitable[None]] | None = None

    def __post_init__(self) -> None:
        if self.planificador is None:
            self.planificador = PlanificadorAsyncio(self.reloj)
