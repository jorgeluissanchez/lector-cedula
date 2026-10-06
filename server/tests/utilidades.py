"""Constantes y utilidades compartidas por las pruebas del servidor.

Datos sintéticos únicamente (skill fixture-sintetico): claves, secretos y personas de la spec.
"""

import hashlib
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

    def __init__(self) -> None:
        self.tareas: list[list[Any]] = []

    def programar(self, instante: float, funcion: Any) -> Any:
        entrada = [instante, funcion, False]
        self.tareas.append(entrada)

        class _Cancelable:
            def cancel(self) -> None:
                entrada[2] = True

        return _Cancelable()

    def ejecutar_hasta(self, instante: float) -> int:
        """Ejecuta, en orden de instante, las tareas no canceladas con instante <= `instante`."""
        ejecutadas = 0
        for entrada in sorted(self.tareas, key=lambda e: e[0]):
            if entrada[0] <= instante and not entrada[2]:
                entrada[2] = True
                entrada[1]()
                ejecutadas += 1
        return ejecutadas


class NotificadorEspia:
    """Registra las validaciones que llegan a un estado terminal (puerto de los webhooks)."""

    def __init__(self) -> None:
        self.notificadas: list[str] = []

    def __call__(self, validacion: Any) -> None:
        self.notificadas.append(validacion.id)


def puertos_de_prueba(**cambios: Any) -> Any:
    from app.puertos import Puertos

    valores: dict[str, Any] = {"reloj": RelojFalso(), "planificador": PlanificadorFalso()}
    valores.update(cambios)
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
