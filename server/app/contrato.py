"""Carga del contrato OpenAPI, fuente de verdad de la API (decisión 1)."""

from functools import cache
from pathlib import Path
from typing import Any

import yaml

RUTA_CONTRATO = Path(__file__).resolve().parents[1] / "openapi" / "api-validaciones.yaml"


class _CargadorSinFechas(yaml.SafeLoader):
    """SafeLoader que deja las fechas como texto: el contrato se sirve como JSON tal cual."""


_CargadorSinFechas.yaml_implicit_resolvers = {
    inicial: [
        (etiqueta, regex) for etiqueta, regex in resolutores if etiqueta != "tag:yaml.org,2002:timestamp"
    ]
    for inicial, resolutores in yaml.SafeLoader.yaml_implicit_resolvers.items()
}


@cache
def cargar_contrato(ruta: Path = RUTA_CONTRATO) -> dict[str, Any]:
    with ruta.open(encoding="utf-8") as f:
        contrato = yaml.load(f, Loader=_CargadorSinFechas)  # noqa: S506 - SafeLoader sin fechas
    if not isinstance(contrato, dict) or contrato.get("openapi") != "3.1.1":
        raise ValueError("el contrato no es un documento OpenAPI 3.1.1")
    return contrato
