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
