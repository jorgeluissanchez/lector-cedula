"""Configuración por variables de entorno (decisión 7). Nada se lee de disco salvo el contrato."""

import json
import secrets
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from typing import Any


@dataclass(frozen=True)
class ClaveConfigurada:
    """Clave de API configurada. Solo se conoce su hash; la clave en claro nunca se guarda."""

    sha256: str
    secreto_webhook: str = field(repr=False)


@dataclass(frozen=True)
class Config:
    claves: Mapping[str, ClaveConfigurada] = field(default_factory=dict, repr=False)
    secreto_subida: bytes = field(default_factory=lambda: secrets.token_bytes(32), repr=False)
    url_publica: str = "http://localhost:8000"
    origenes_cors: tuple[str, ...] = ()
    limite_peticiones_por_minuto: int = 60
    retencion_resultados_s: int = 86_400
    base_tipos_problema: str = "https://lector-cedula.example/problemas/"

    @classmethod
    def desde_entorno(cls, entorno: Mapping[str, str]) -> "Config":
        valores: dict[str, Any] = {"claves": _leer_claves(entorno.get("CLAVES_API_JSON", "[]"))}
        if "SECRETO_SUBIDA" in entorno:
            valores["secreto_subida"] = entorno["SECRETO_SUBIDA"].encode()
        if "URL_PUBLICA" in entorno:
            valores["url_publica"] = entorno["URL_PUBLICA"].rstrip("/")
        if "ORIGENES_CORS" in entorno:
            valores["origenes_cors"] = tuple(
                o.strip() for o in entorno["ORIGENES_CORS"].split(",") if o.strip()
            )
        if "LIMITE_PETICIONES_POR_MINUTO" in entorno:
            valores["limite_peticiones_por_minuto"] = int(entorno["LIMITE_PETICIONES_POR_MINUTO"])
        if "RETENCION_RESULTADOS_S" in entorno:
            valores["retencion_resultados_s"] = int(entorno["RETENCION_RESULTADOS_S"])
        if "BASE_TIPOS_PROBLEMA" in entorno:
            valores["base_tipos_problema"] = entorno["BASE_TIPOS_PROBLEMA"]
        return cls(**valores)

    def con_cambios(self, **cambios: Any) -> "Config":
        return replace(self, **cambios)


def _leer_claves(texto: str) -> dict[str, ClaveConfigurada]:
    """Lee `CLAVES_API_JSON`. Los mensajes de error nunca reproducen el contenido (son secretos)."""
    try:
        datos = json.loads(texto)
    except json.JSONDecodeError:
        raise ValueError("CLAVES_API_JSON no es JSON válido") from None
    if not isinstance(datos, list):
        raise ValueError("CLAVES_API_JSON debe ser una lista")
    claves: dict[str, ClaveConfigurada] = {}
    for posicion, entrada in enumerate(datos):
        hash_clave = entrada.get("sha256") if isinstance(entrada, dict) else None
        secreto = entrada.get("secreto_webhook") if isinstance(entrada, dict) else None
        if not (
            isinstance(hash_clave, str) and len(hash_clave) == 64 and isinstance(secreto, str) and secreto
        ):
            raise ValueError(
                f"CLAVES_API_JSON: la entrada {posicion} no tiene sha256 y secreto_webhook válidos"
            )
        claves[hash_clave.lower()] = ClaveConfigurada(sha256=hash_clave.lower(), secreto_webhook=secreto)
    return claves
