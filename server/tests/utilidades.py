"""Constantes y utilidades compartidas por las pruebas del servidor.

Datos sintéticos únicamente (skill fixture-sintetico): claves, secretos y personas de la spec.
"""

import asyncio
import hashlib
import inspect
import json
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from app.config import Config

RAIZ_SERVIDOR = Path(__file__).resolve().parents[1]
RUTA_CONTRATO = RAIZ_SERVIDOR / "openapi" / "api-validaciones.yaml"
# Montado en solo lectura por server/compose.yaml (servicio `pruebas`).
RUTA_HIPOTESIS = Path(
    os.environ.get("RUTA_HIPOTESIS_FORMATO", str(RAIZ_SERVIDOR / "docs/decisiones/hipotesis-formato.md"))
)

# Claves sintéticas de la spec (convenciones de specs/api-validaciones/spec.md).
KT = "sk_test_00000000000000000000000000000000"
KT2 = "sk_test_11111111111111111111111111111111"
KL = "sk_live_22222222222222222222222222222222"
SECRETO_WEBHOOK_KT = "whsec_sintetico_0123456789abcdef"
SECRETO_WEBHOOK_KT2 = "whsec_sintetico_fedcba9876543210"
SECRETO_WEBHOOK_KL = "whsec_sintetico_live_0000000000"

AUT: dict[str, Any] = {
    "datos": True,
    "sensibles": False,
    "version_texto": "2026-10-01",
    "otorgada_en": "2026-10-06T15:19:00Z",
}
CREAR_CUERPO: dict[str, Any] = {"document_type": "co_national-id-2000", "autorizacion": AUT}


def hash_clave(clave: str) -> str:
    return hashlib.sha256(clave.encode()).hexdigest()


def config_de_prueba(**cambios: Any) -> "Config":
    """Configuración con las claves KT, KT2 y KL de la spec; acepta cambios por campo."""
    from app.config import Config

    claves = [
        {"sha256": hash_clave(clave), "secreto_webhook": secreto}
        for clave, secreto in ((KT, SECRETO_WEBHOOK_KT), (KT2, SECRETO_WEBHOOK_KT2), (KL, SECRETO_WEBHOOK_KL))
    ]
    config = Config.desde_entorno({"CLAVES_API_JSON": json.dumps(claves)})
    return config.con_cambios(**cambios) if cambios else config


def crear_cliente(**cambios: Any) -> TestClient:
    """Cliente sobre una aplicación nueva. No relanza excepciones del servidor: las pruebas observan
    la respuesta 500 que recibe el cliente, como en producción."""
    from app.main import crear_app

    return TestClient(crear_app(config_de_prueba(**cambios)), raise_server_exceptions=False)


# --- Puertos falsos (decisión 6): el test controla el tiempo, los ids y la planificación ------------

# "ahora" de la spec: 2026-10-06T15:20:00Z.
AHORA = 1_791_300_000
AUTH_KT = {"Authorization": f"Bearer {KT}"}
AUTH_KT2 = {"Authorization": f"Bearer {KT2}"}
AUTH_KL = {"Authorization": f"Bearer {KL}"}
BASE_PROBLEMAS = "https://lector-cedula.example/problemas/"


class RelojFalso:
    """Reloj que solo avanza cuando el test lo pide."""

    def __init__(self, instante: float = AHORA) -> None:
        self.instante = instante

    def ahora(self) -> float:
        return self.instante

    def avanzar(self, segundos: float) -> None:
        self.instante += segundos

    def fijar(self, instante: float) -> None:
        self.instante = instante


class PlanificadorFalso:
    """Guarda las tareas programadas; el test las ejecuta con `ejecutar_hasta`, nunca con esperas."""

    def __init__(self, reloj: "RelojFalso | None" = None) -> None:
        self.tareas: list[list[Any]] = []
        self.reloj = reloj

    def programar(self, instante: float, funcion: Any) -> Any:
        entrada = [instante, funcion, False]
        self.tareas.append(entrada)

        class _Cancelable:
            def cancel(self) -> None:
                entrada[2] = True

        return _Cancelable()

    def pendientes(self) -> list[float]:
        return sorted(e[0] for e in self.tareas if not e[2])

    def ejecutar_hasta(self, instante: float) -> int:
        """Ejecuta, en orden de instante, las tareas no canceladas con instante <= `instante`, incluidas
        las que programen las propias tareas. Con reloj, lo lleva al instante de cada tarea antes de
        ejecutarla y al final a `instante`. Las corrutinas se ejecutan hasta terminar."""
        ejecutadas = 0
        while True:
            listas = sorted((e for e in self.tareas if e[0] <= instante and not e[2]), key=lambda e: e[0])
            if not listas:
                break
            entrada = listas[0]
            entrada[2] = True
            if self.reloj is not None and entrada[0] > self.reloj.ahora():
                self.reloj.fijar(entrada[0])
            resultado = entrada[1]()
            if inspect.isawaitable(resultado):
                asyncio.run(_esperar(resultado))
            ejecutadas += 1
        if self.reloj is not None and instante > self.reloj.ahora():
            self.reloj.fijar(instante)
        return ejecutadas


async def _esperar(resultado: Any) -> Any:
    return await resultado


class GeneradorFijo:
    """Devuelve los ids dados en orden (AV-25: `val_0123...` y `evt_...0001`)."""

    def __init__(self, validaciones: list[str], eventos: list[str] | None = None) -> None:
        self._validaciones = list(validaciones)
        self._eventos = list(eventos or [])

    def id_validacion(self) -> str:
        return self._validaciones.pop(0)

    def id_evento(self) -> str:
        return self._eventos.pop(0)


class TransporteFalso:
    """Registra cada `POST` y responde con la secuencia de estados dada (un `TimeoutError` simula los
    10 s sin respuesta). Nunca abre conexiones."""

    def __init__(self, respuestas: list[Any] | None = None, reloj: "RelojFalso | None" = None) -> None:
        self.respuestas = list(respuestas or [])
        self.reloj = reloj
        self.peticiones: list[dict[str, Any]] = []

    async def enviar(
        self, url: str, ip: str, cabeceras: dict[str, str], cuerpo: bytes, timeout_s: float
    ) -> int:
        self.peticiones.append(
            {
                "url": url,
                "ip": ip,
                "cabeceras": dict(cabeceras),
                "cuerpo": cuerpo,
                "timeout_s": timeout_s,
                "t": self.reloj.ahora() if self.reloj else None,
            }
        )
        respuesta = self.respuestas.pop(0) if self.respuestas else 204
        if isinstance(respuesta, BaseException):
            raise respuesta
        return int(respuesta)


class ResolvedorFalso:
    """Resuelve cada host a las IPs dadas (por defecto, una IP pública de ejemplo)."""

    def __init__(self, ips: dict[str, list[str]] | None = None) -> None:
        self.ips = ips or {}
        self.consultas: list[str] = []

    async def resolver(self, host: str) -> list[str]:
        self.consultas.append(host)
        return self.ips.get(host, ["93.184.215.14"])


class NotificadorEspia:
    """Registra las validaciones que llegan a un estado terminal (puerto de los webhooks)."""

    def __init__(self) -> None:
        self.notificadas: list[str] = []

    def __call__(self, validacion: Any) -> None:
        self.notificadas.append(validacion.id)


def puertos_de_prueba(**cambios: Any) -> Any:
    from app.puertos import Puertos

    reloj = cambios.pop("reloj", None) or RelojFalso()
    valores: dict[str, Any] = {
        "reloj": reloj,
        "planificador": PlanificadorFalso(reloj),
        "transporte": TransporteFalso(reloj=reloj),
        "resolvedor": ResolvedorFalso(),
    }
    valores.update(cambios)
    if isinstance(valores["transporte"], TransporteFalso) and valores["transporte"].reloj is None:
        valores["transporte"].reloj = reloj
    return Puertos(**valores)


def crear_cliente_con(puertos: Any = None, **cambios: Any) -> TestClient:
    """Como `crear_cliente`, con puertos inyectados (por defecto, reloj fijo en `AHORA`)."""
    from app.main import crear_app

    aplicacion = crear_app(config_de_prueba(**cambios), puertos or puertos_de_prueba())
    return TestClient(aplicacion, raise_server_exceptions=False)


def reloj_de(cliente: TestClient) -> RelojFalso:
    return cliente.app.state.puertos.reloj  # type: ignore[attr-defined]


def crear(cliente: TestClient, cabeceras: dict[str, str] | None = None, **campos: Any) -> Any:
    """`CREAR` de la spec con campos cambiados (un valor `...` elimina la clave)."""
    cuerpo = {**CREAR_CUERPO, **campos}
    cuerpo = {clave: valor for clave, valor in cuerpo.items() if valor is not ...}
    return cliente.post("/v1/validations", headers=cabeceras or AUTH_KT, json=cuerpo)


def ruta_de_subida(validacion: dict[str, Any]) -> str:
    """Ruta y query de `upload.url` (el cliente de pruebas habla con `http://testserver`)."""
    from urllib.parse import urlsplit

    partes = urlsplit(validacion["upload"]["url"])
    return f"{partes.path}?{partes.query}"


def subir(
    cliente: TestClient,
    ruta: str,
    partes: dict[str, tuple[bytes, str]],
    cabeceras: dict[str, str] | None = None,
) -> Any:
    archivos = {nombre: (f"{nombre}.bin", datos, tipo) for nombre, (datos, tipo) in partes.items()}
    return cliente.post(ruta, files=archivos, headers=cabeceras or {})


# --- Multi-aplicativo (sdk-integracion, SDK-13 y SDK-16): orígenes y retornos por clave -----------------

ORIGEN_A = "https://app-a.example"
ORIGEN_B = "https://app-b.example"
RETORNO_A = "https://app-a.example/volver"
DEEPLINK_A = "com.ejemplo.appa://lector/retorno"
RETORNO_B = "https://app-b.example/fin"
URL_PUBLICA_SDK = "https://api.lector-cedula.example"


def claves_multi() -> list[dict[str, Any]]:
    """KT es el aplicativo A y KT2 el B (forma nueva); KL conserva la forma anterior (sin orígenes)."""
    return [
        {
            "sha256": hash_clave(KT),
            "secreto_webhook": SECRETO_WEBHOOK_KT,
            "origenes": [ORIGEN_A],
            "retornos": [RETORNO_A, DEEPLINK_A],
        },
        {
            "sha256": hash_clave(KT2),
            "secreto_webhook": SECRETO_WEBHOOK_KT2,
            "origenes": [ORIGEN_B],
            "retornos": [RETORNO_B],
        },
        {"sha256": hash_clave(KL), "secreto_webhook": SECRETO_WEBHOOK_KL},
    ]


def config_multi(**cambios: Any) -> "Config":
    from app.config import Config

    config = Config.desde_entorno(
        {"CLAVES_API_JSON": json.dumps(claves_multi()), "URL_PUBLICA": URL_PUBLICA_SDK}
    )
    return config.con_cambios(**cambios) if cambios else config


def crear_cliente_multi(puertos: Any = None, **cambios: Any) -> TestClient:
    from app.main import crear_app

    aplicacion = crear_app(config_multi(**cambios), puertos or puertos_de_prueba())
    return TestClient(aplicacion, raise_server_exceptions=False)
