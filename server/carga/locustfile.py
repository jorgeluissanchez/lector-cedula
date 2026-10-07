"""AV-35: carga en sandbox (creación, subida y consulta) con imágenes sintéticas en memoria.

Comando `K` de design.md. Solo claves y datos sintéticos (skill fixture-sintetico); las imágenes son
PNG grises uniformes generados aquí y nunca se escriben a disco. El proceso termina con código 1 si
algún endpoint tiene p95 >= UMBRAL_P95_MS o hay fallos.
"""

import struct
import zlib
from datetime import UTC, datetime
from urllib.parse import urlsplit

from locust import HttpUser, between, events, task

UMBRAL_P95_MS = 3000
KT = "sk_test_00000000000000000000000000000000"
CABECERAS = {"Authorization": f"Bearer {KT}"}


def _trozo(tipo: bytes, datos: bytes) -> bytes:
    return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos))


def _png(ancho: int = 1280, alto: int = 800) -> bytes:
    fila = b"\x00" + b"\xc8" * (ancho * 3)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
        + _trozo(b"IDAT", zlib.compress(fila * alto, 9))
        + _trozo(b"IEND", b"")
    )


IMG_PNG = _png()


class Integrador(HttpUser):
    wait_time = between(0.1, 0.5)

    @task
    def flujo(self) -> None:
        ahora = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        cuerpo = {
            "document_type": "co_national-id-2000",
            "autorizacion": {
                "datos": True,
                "sensibles": False,
                "version_texto": "2026-10-01",
                "otorgada_en": ahora,
            },
            "sandbox_scenario": "success",
        }
        with self.client.post(
            "/v1/validations",
            json=cuerpo,
            headers=CABECERAS,
            name="POST /v1/validations",
            catch_response=True,
        ) as r:
            if r.status_code != 201:
                r.failure(f"creación {r.status_code}")
                return
            validacion = r.json()
        url = urlsplit(validacion["upload"]["url"])
        archivos = {"front": ("front.png", IMG_PNG, "image/png"), "back": ("back.png", IMG_PNG, "image/png")}
        with self.client.post(
            f"{url.path}?{url.query}",
            files=archivos,
            name="POST /v1/validations/{id}/images",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"subida {r.status_code}")
                return
        with self.client.get(
            f"/v1/validations/{validacion['id']}",
            headers=CABECERAS,
            name="GET /v1/validations/{id}",
            catch_response=True,
        ) as r:
            if r.status_code != 200 or r.json()["status"] == "pending":
                r.failure(f"consulta {r.status_code}")


@events.quitting.add_listener
def _umbral(environment, **_kwargs) -> None:  # noqa: ANN001
    stats = environment.stats
    fallos = stats.total.num_failures
    lentos = [
        (e.name, e.get_response_time_percentile(0.95))
        for e in stats.entries.values()
        if e.get_response_time_percentile(0.95) >= UMBRAL_P95_MS
    ]
    if fallos or lentos or not stats.entries:
        print(f"AV-35 FALLA: fallos={fallos} p95>=umbral={lentos}")  # noqa: T201
        environment.process_exit_code = 1
    else:
        print("AV-35 OK")  # noqa: T201
