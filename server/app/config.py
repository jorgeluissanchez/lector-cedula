"""Configuración por variables de entorno (decisión 7). Nada se lee de disco salvo el contrato.

`CLAVES_API_JSON` (sdk-integracion, SDK-16) es una lista de entradas por clave:
`{"sha256", "secreto_webhook", "origenes"?, "retornos"?}`. La forma anterior (sin `origenes` ni
`retornos`) sigue siendo válida: sus orígenes son los globales de `ORIGENES_CORS` y no admite
`return_url`. Un comodín o una URL que no sea exacta detienen el arranque; los mensajes nunca
reproducen claves, hashes ni secretos.
"""

import json
import re
import secrets
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

# Recursos del motor del componente web (SDK-05). Vacío hasta que la fase 3 copie el motor en la imagen.
DIRECTORIO_SDK = Path(__file__).resolve().parents[1] / "sdk" / "v1"
# SDK-14: HTML de la página alojada `/v/{token}`, compilado en la imagen (apps/alojada). Sin él,
# `/v/` responde 503.
PAGINA_ALOJADA = Path(__file__).resolve().parents[1] / "alojada" / "index.html"

# Origen exacto: `https://host[:puerto]`, sin ruta, credenciales ni comodines.
_ORIGEN = re.compile(r"^https://[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{1,5})?$")
# Esquema personalizado de deeplink nativo (`com.ejemplo.app://...`).
_ESQUEMA_PERSONALIZADO = re.compile(r"^[a-z][a-z0-9+.-]*://")
# Esquemas que no son deeplinks: navegación insegura o ejecución de código.
_ESQUEMAS_PROHIBIDOS = frozenset({"http", "javascript", "data", "file", "vbscript", "blob", "about"})
LONGITUD_MAXIMA_URL = 2048


@dataclass(frozen=True)
class ClaveConfigurada:
    """Clave de API configurada. Solo se conoce su hash; la clave en claro nunca se guarda.

    `origenes` es `None` en la forma anterior de la configuración (usa `ORIGENES_CORS`)."""

    sha256: str
    secreto_webhook: str = field(repr=False)
    origenes: tuple[str, ...] | None = None
    retornos: tuple[str, ...] = ()


@dataclass(frozen=True)
class Config:
    claves: Mapping[str, ClaveConfigurada] = field(default_factory=dict, repr=False)
    secreto_subida: bytes = field(default_factory=lambda: secrets.token_bytes(32), repr=False)
    url_publica: str = "http://localhost:8000"
    origenes_cors: tuple[str, ...] = ()
    limite_peticiones_por_minuto: int = 60
    retencion_resultados_s: int = 86_400
    base_tipos_problema: str = "https://lector-cedula.example/problemas/"
    # MS-19: `node` activa el lector de packages/capture en modo live; sin valor, live responde 503.
    lector_live: str | None = None
    directorio_sdk: Path = DIRECTORIO_SDK
    pagina_alojada: Path = PAGINA_ALOJADA
    # SDK-40: solo con `entorno == "pruebas"`; nunca en el despliegue.
    entorno: str | None = None
    webhook_destinos_prueba: tuple[str, ...] = ()

    def es_destino_prueba(self, url: str | None) -> bool:
        return self.entorno == "pruebas" and url is not None and url in self.webhook_destinos_prueba

    @classmethod
    def desde_entorno(cls, entorno: Mapping[str, str]) -> "Config":
        valores: dict[str, Any] = {"claves": _leer_claves(entorno.get("CLAVES_API_JSON", "[]"))}
        if "SECRETO_SUBIDA" in entorno:
            valores["secreto_subida"] = entorno["SECRETO_SUBIDA"].encode()
        if "URL_PUBLICA" in entorno:
            valores["url_publica"] = entorno["URL_PUBLICA"].rstrip("/")
        if "ORIGENES_CORS" in entorno:
            origenes = tuple(o.strip() for o in entorno["ORIGENES_CORS"].split(",") if o.strip())
            if not all(origen_valido(o) for o in origenes):
                raise ValueError("ORIGENES_CORS: cada origen debe ser exacto (https://host[:puerto])")
            valores["origenes_cors"] = origenes
        if "LIMITE_PETICIONES_POR_MINUTO" in entorno:
            valores["limite_peticiones_por_minuto"] = int(entorno["LIMITE_PETICIONES_POR_MINUTO"])
        if "RETENCION_RESULTADOS_S" in entorno:
            valores["retencion_resultados_s"] = int(entorno["RETENCION_RESULTADOS_S"])
        if "BASE_TIPOS_PROBLEMA" in entorno:
            valores["base_tipos_problema"] = entorno["BASE_TIPOS_PROBLEMA"]
        if "LECTOR_LIVE" in entorno:
            if entorno["LECTOR_LIVE"] != "node":
                raise ValueError("LECTOR_LIVE solo admite el valor node")
            valores["lector_live"] = "node"
        if "DIRECTORIO_SDK" in entorno:
            directorio = Path(entorno["DIRECTORIO_SDK"])
            if not directorio.is_absolute() or ".." in directorio.parts:
                raise ValueError("DIRECTORIO_SDK debe ser una ruta absoluta sin ..")
            valores["directorio_sdk"] = directorio
        if "ENTORNO" in entorno:
            # Como LECTOR_LIVE: solo ausente o `pruebas`; un valor desconocido detiene el arranque.
            if entorno["ENTORNO"] != "pruebas":
                raise ValueError("ENTORNO solo admite el valor pruebas (o no definirlo)")
            valores["entorno"] = "pruebas"
        if "WEBHOOK_DESTINOS_PRUEBA" in entorno:
            # SDK-40: excepción solo para pruebas. Fuera de ENTORNO=pruebas, su presencia detiene el arranque.
            if valores.get("entorno") != "pruebas":
                raise ValueError("WEBHOOK_DESTINOS_PRUEBA solo se admite con ENTORNO=pruebas")
            destinos = tuple(d.strip() for d in entorno["WEBHOOK_DESTINOS_PRUEBA"].split(",") if d.strip())
            if not destinos or not all(destino_prueba_valido(d) for d in destinos):
                raise ValueError(
                    "WEBHOOK_DESTINOS_PRUEBA: lista de URL http o https exactas, "
                    "sin comodines ni credenciales"
                )
            valores["webhook_destinos_prueba"] = destinos
        return cls(**valores)

    def con_cambios(self, **cambios: Any) -> "Config":
        return replace(self, **cambios)

    def origenes_de(self, clave: ClaveConfigurada) -> tuple[str, ...]:
        """Orígenes de navegador admitidos para la clave (forma anterior: los de `ORIGENES_CORS`)."""
        return clave.origenes if clave.origenes is not None else self.origenes_cors

    def origenes_de_alguna_clave(self) -> frozenset[str]:
        """Unión de los orígenes de todas las claves: los que pueden cargar los recursos del motor."""
        return frozenset(o for clave in self.claves.values() for o in self.origenes_de(clave))


def origen_valido(origen: object) -> bool:
    if not isinstance(origen, str) or not _ORIGEN.fullmatch(origen):
        return False
    try:
        puerto = urlsplit(origen).port
    except ValueError:
        return False
    return puerto is None or 0 < puerto <= 65535


def retorno_valido(retorno: object) -> bool:
    """URL `https` exacta (sin credenciales ni fragmento) o deeplink con esquema personalizado."""
    if not isinstance(retorno, str) or not retorno or len(retorno) > LONGITUD_MAXIMA_URL:
        return False
    if "*" in retorno or "#" in retorno or any(c <= " " or c == "\x7f" for c in retorno):
        return False
    if not _ESQUEMA_PERSONALIZADO.match(retorno):
        return False
    try:
        partes = urlsplit(retorno)
        partes.port  # noqa: B018 - valida el puerto
    except ValueError:
        return False
    if "@" in partes.netloc:
        return False
    if partes.scheme == "https":
        return origen_valido(f"https://{partes.netloc}")
    return partes.scheme not in _ESQUEMAS_PROHIBIDOS


def destino_prueba_valido(url: str) -> bool:
    if "*" in url or "#" in url or len(url) > LONGITUD_MAXIMA_URL or any(c <= " " for c in url):
        return False
    try:
        partes = urlsplit(url)
        partes.port  # noqa: B018 - valida el puerto
    except ValueError:
        return False
    return partes.scheme in ("http", "https") and bool(partes.hostname) and "@" not in partes.netloc


def _lista_de_textos(valor: object, valido: Any) -> tuple[str, ...] | None:
    if not isinstance(valor, list) or not all(valido(v) for v in valor):
        return None
    return tuple(valor)


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
        assert isinstance(entrada, dict)  # noqa: S101 - comprobado arriba
        origenes: tuple[str, ...] | None = None
        if "origenes" in entrada:
            origenes = _lista_de_textos(entrada["origenes"], origen_valido)
            if origenes is None:
                raise ValueError(
                    f"CLAVES_API_JSON: la entrada {posicion} tiene origenes no válidos "
                    "(lista de orígenes exactos https://host[:puerto], sin comodines)"
                )
        retornos: tuple[str, ...] = ()
        if "retornos" in entrada:
            leidos = _lista_de_textos(entrada["retornos"], retorno_valido)
            if leidos is None:
                raise ValueError(
                    f"CLAVES_API_JSON: la entrada {posicion} tiene retornos no válidos "
                    "(URL https exactas o deeplinks esquema://, sin comodines)"
                )
            retornos = leidos
        claves[hash_clave.lower()] = ClaveConfigurada(
            sha256=hash_clave.lower(), secreto_webhook=secreto, origenes=origenes, retornos=retornos
        )
    return claves
