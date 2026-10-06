"""Logs JSON sin datos personales (AV-32, decisión 14). Sin dependencias nuevas.

- Una línea JSON por registro, en la salida estándar, solo con las claves de `CLAVES_PERMITIDAS`.
- El filtro descarta toda clave fuera de la lista, todo valor con forma inesperada, los argumentos
  del mensaje, la excepción y la pila. El mensaje solo se usa como `event` si es un nombre de evento
  de la aplicación; los loggers ajenos (uvicorn, asyncio) salen como `servidor`.
- El access log de uvicorn queda desactivado: registra la query, donde viaja el token de subida.
"""

import json
import logging
import re
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

CLAVES_PERMITIDAS = (
    "ts",
    "level",
    "event",
    "request_id",
    "method",
    "route",
    "status",
    "duration_ms",
    "sandbox",
    "validation_id",
    "event_id",
    "attempt",
    "outcome",
)
METODOS_HTTP = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"})

_EVENTO = re.compile(r"^[a-z][a-z_.]{0,63}$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_PLANTILLA_RUTA = re.compile(r"^(/[a-z0-9_.{}-]*)+$")


def _entero(valor: Any) -> bool:
    return isinstance(valor, int) and not isinstance(valor, bool)


def _patron(regex: str) -> Callable[[Any], bool]:
    compilado = re.compile(regex)
    return lambda valor: isinstance(valor, str) and compilado.fullmatch(valor) is not None


# Clave -> validador del valor. Un valor que no cumple se descarta.
_VALIDADORES: dict[str, Callable[[Any], bool]] = {
    "request_id": lambda v: isinstance(v, str) and _UUID.fullmatch(v) is not None,
    "method": lambda v: v in METODOS_HTTP,
    "route": lambda v: v is None or (isinstance(v, str) and _PLANTILLA_RUTA.fullmatch(v) is not None),
    "status": _entero,
    "duration_ms": lambda v: isinstance(v, float | int) and not isinstance(v, bool),
    "sandbox": lambda v: v is None or isinstance(v, bool),
    "validation_id": _patron(r"^val_[0-9a-f]{32}$"),
    "event_id": _patron(r"^evt_[0-9a-f]{32}$"),
    "attempt": _entero,
    "outcome": _patron(r"^[a-z_]{1,32}$"),
}

_LOGGER_APLICACION = "lector"
_MARCA_MANEJADOR = "_lector_json"


def _es_de_la_aplicacion(nombre: str) -> bool:
    return nombre == _LOGGER_APLICACION or nombre.startswith(_LOGGER_APLICACION + ".")


class FiltroClavesPermitidas(logging.Filter):
    """Deja en el registro solo `evento` y `campos` saneados; borra mensaje, argumentos y trazas."""

    def filter(self, record: logging.LogRecord) -> bool:
        propio = _es_de_la_aplicacion(record.name)
        if propio and isinstance(record.msg, str) and _EVENTO.fullmatch(record.msg):
            evento = record.msg
        else:
            evento = "evento" if propio else "servidor"
        campos = getattr(record, "campos", None) if propio else None
        saneados: dict[str, Any] = {}
        if isinstance(campos, dict):
            for clave, validar in _VALIDADORES.items():
                if clave in campos and validar(campos[clave]):
                    saneados[clave] = campos[clave]
        record.evento = evento
        record.campos = saneados
        record.msg = evento
        record.args = None
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        return True


class FormateadorJson(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        momento = datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds")
        linea: dict[str, Any] = {
            "ts": momento.replace("+00:00", "Z"),
            "level": record.levelname.lower(),
            "event": getattr(record, "evento", "servidor"),
        }
        linea.update(getattr(record, "campos", {}))
        return json.dumps(linea, ensure_ascii=False, separators=(",", ":"))


class ManejadorSalidaEstandar(logging.StreamHandler):  # type: ignore[type-arg]
    """Escribe en el `sys.stdout` vigente en cada registro (no en el del momento de crearse)."""

    @property
    def stream(self) -> Any:  # type: ignore[override]
        return sys.stdout

    @stream.setter
    def stream(self, _valor: Any) -> None:
        pass


def _manejador() -> logging.Handler:
    manejador = ManejadorSalidaEstandar()
    manejador.addFilter(FiltroClavesPermitidas())
    manejador.setFormatter(FormateadorJson())
    setattr(manejador, _MARCA_MANEJADOR, True)
    return manejador


def _poner_manejador(logger: logging.Logger) -> None:
    """Sustituye los manejadores propios previos (idempotente) y conserva los ajenos, como los de
    captura de pytest."""
    logger.handlers = [h for h in logger.handlers if not getattr(h, _MARCA_MANEJADOR, False)]
    logger.addHandler(_manejador())


def configurar_logs() -> None:
    """Configura los loggers del proceso. Idempotente: cada `crear_app` la llama."""
    raiz = logging.getLogger()
    _poner_manejador(raiz)
    raiz.setLevel(logging.INFO)

    aplicacion = logging.getLogger(_LOGGER_APLICACION)
    aplicacion.setLevel(logging.INFO)
    aplicacion.propagate = True

    # uvicorn configura sus loggers antes de importar la aplicación; aquí se reemplazan.
    uvicorn = logging.getLogger("uvicorn")
    uvicorn.handlers = []
    _poner_manejador(uvicorn)
    uvicorn.propagate = False
    errores_uvicorn = logging.getLogger("uvicorn.error")
    errores_uvicorn.handlers = []
    errores_uvicorn.propagate = True
    acceso = logging.getLogger("uvicorn.access")
    acceso.handlers = []
    acceso.propagate = False
    acceso.disabled = True

    for ruidoso in ("httpx", "httpcore", "multipart", "python_multipart"):
        logging.getLogger(ruidoso).setLevel(logging.WARNING)
