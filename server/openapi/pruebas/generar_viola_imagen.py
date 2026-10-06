"""Genera `viola-imagen.yaml`: copia del contrato con dos violaciones de AV-31.

Añade `front_image` al esquema `Validation` y `pdf417_raw` al evento del webhook. La prueba
`test_AV31_el_fixture_que_viola_es_copia_del_contrato` comprueba que no hay más diferencias.

Uso (desde la raíz del repositorio; escribe en la salida estándar):
    docker compose -f server/compose.yaml run --rm -T pruebas \
        uv run --frozen python openapi/pruebas/generar_viola_imagen.py \
        > server/openapi/pruebas/viola-imagen.yaml
"""

import sys
from pathlib import Path

import yaml

CONTRATO = Path(__file__).resolve().parents[1] / "api-validaciones.yaml"
CABECERA = (
    "# Fixture de AV-31: copia del contrato con `front_image` en Validation y `pdf417_raw` en el\n"
    "# webhook. Spectral DEBE fallar con 2 resultados de sin-imagen-ni-biometria-en-respuestas.\n"
    "# Generado por generar_viola_imagen.py; no editar a mano.\n"
)


def generar() -> str:
    contrato = yaml.safe_load(CONTRATO.read_text(encoding="utf-8"))
    esquemas = contrato["components"]["schemas"]
    esquemas["Validation"]["properties"]["front_image"] = {"type": "string"}
    esquemas["ValidationCompletedEvent"]["properties"]["pdf417_raw"] = {"type": "string"}
    return CABECERA + yaml.safe_dump(contrato, sort_keys=False, allow_unicode=True, width=100)


if __name__ == "__main__":
    sys.stdout.write(generar())
