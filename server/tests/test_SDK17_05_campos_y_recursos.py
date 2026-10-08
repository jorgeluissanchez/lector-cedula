"""SDK-17: la subida rechaza campos del documento enviados por el cliente (tarea 2.3). SDK-05: recursos
del motor en `/sdk/v1/{archivo}` con cabeceras inmutables y CORS por clave (tarea 2.4)."""

from pathlib import Path
from typing import Any

import pytest

from tests.imagenes_sinteticas import IMG_JPEG
from tests.utilidades import (
    AUTH_KT,
    BASE_PROBLEMAS,
    ORIGEN_A,
    ORIGEN_B,
    crear,
    crear_cliente_multi,
    ruta_de_subida,
)

INMUTABLE = "public, max-age=31536000, immutable"
WASM = b"\x00asm\x01\x00\x00\x00"


def _sigue_pendiente(cliente: Any, validacion: dict[str, Any]) -> None:
    consulta = cliente.get(f"/v1/validations/{validacion['id']}", headers=AUTH_KT)
    assert consulta.json()["status"] == "pending"


# --- SDK-17 -------------------------------------------------------------------------------------------


def test_SDK17_campo_de_resultado_inyectado() -> None:
    """Escenario "Campo de resultado inyectado": `front` = IMG_JPEG y un campo `document` con un NUIP
    sintético dan 422 `[{"pointer": "/document", "code": "unexpected_field"}]` y sigue `pending`."""
    cliente = crear_cliente_multi()
    validacion = crear(cliente).json()
    respuesta = cliente.post(
        ruta_de_subida(validacion),
        files={"front": ("front.jpg", IMG_JPEG, "image/jpeg")},
        data={"document": '{"nuip":"9999000001"}'},
    )
    assert respuesta.status_code == 422, respuesta.text[:300]
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE_PROBLEMAS + "invalid-request"
    assert cuerpo["errors"] == [{"pointer": "/document", "code": "unexpected_field"}]
    assert "9999000001" not in respuesta.text
    _sigue_pendiente(cliente, validacion)


@pytest.mark.parametrize("nombre", ["nuip", "resultado", "document"])
def test_SDK17_cualquier_campo_de_texto_se_rechaza_antes_que_las_imagenes(nombre: str) -> None:
    cliente = crear_cliente_multi()
    validacion = crear(cliente).json()
    respuesta = cliente.post(
        ruta_de_subida(validacion),
        data={nombre: "9999000001"},
        files={"front": ("front.jpg", IMG_JPEG, "image/jpeg")},
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["errors"] == [{"pointer": f"/{nombre}", "code": "unexpected_field"}]
    _sigue_pendiente(cliente, validacion)


def test_SDK17_campo_de_texto_con_nombre_de_imagen_tambien_se_rechaza() -> None:
    """`front` como campo de texto (sin archivo) no es una imagen: 422 `unexpected_field`."""
    cliente = crear_cliente_multi()
    validacion = crear(cliente).json()
    # Parte multipart sin `filename` (httpx la envía así con `(None, valor)`).
    respuesta = cliente.post(ruta_de_subida(validacion), files={"front": (None, "9999000001")})
    assert respuesta.status_code == 422
    assert respuesta.json()["errors"] == [{"pointer": "/front", "code": "unexpected_field"}]


# --- SDK-05 -------------------------------------------------------------------------------------------


@pytest.fixture
def recursos(tmp_path: Path) -> Path:
    (tmp_path / "motor-3f9a1c.wasm").write_bytes(WASM)
    (tmp_path / "cargador-77aa01.js").write_bytes(b"export {};\n")
    return tmp_path


def test_SDK05_origen_permitido(recursos: Path) -> None:
    """Escenario "Origen permitido"."""
    cliente = crear_cliente_multi(directorio_sdk=recursos)
    respuesta = cliente.get("/sdk/v1/motor-3f9a1c.wasm", headers={"Origin": ORIGEN_A})
    assert respuesta.status_code == 200
    assert respuesta.content == WASM
    assert respuesta.headers["access-control-allow-origin"] == ORIGEN_A
    assert respuesta.headers["content-type"] == "application/wasm"
    assert respuesta.headers["cache-control"] == INMUTABLE
    assert respuesta.headers["cross-origin-resource-policy"] == "cross-origin"
    assert "origin" in respuesta.headers["vary"].lower()


def test_SDK05_origen_de_cualquier_clave_y_js(recursos: Path) -> None:
    cliente = crear_cliente_multi(directorio_sdk=recursos)
    respuesta = cliente.get("/sdk/v1/cargador-77aa01.js", headers={"Origin": ORIGEN_B})
    assert respuesta.status_code == 200
    assert respuesta.headers["access-control-allow-origin"] == ORIGEN_B
    assert respuesta.headers["content-type"].startswith("text/javascript")


def test_SDK05_origen_no_configurado(recursos: Path) -> None:
    """Escenario "Origen no configurado"."""
    cliente = crear_cliente_multi(directorio_sdk=recursos)
    respuesta = cliente.get("/sdk/v1/motor-3f9a1c.wasm", headers={"Origin": "https://intruso.example"})
    assert respuesta.status_code == 200
    assert "access-control-allow-origin" not in respuesta.headers


@pytest.mark.parametrize(
    "archivo",
    ["no-existe.wasm", "..%2Fsecreto", "%2E%2E", ".oculto", "sub%2Fmotor.wasm", "motor-3f9a1c.wasm%00"],
)
def test_SDK05_archivo_inexistente_o_ruta_fuera_es_404(recursos: Path, archivo: str) -> None:
    (recursos.parent / "secreto").write_text("no servir")
    cliente = crear_cliente_multi(directorio_sdk=recursos)
    respuesta = cliente.get(f"/sdk/v1/{archivo}")
    assert respuesta.status_code == 404
    assert respuesta.headers["content-type"] == "application/problem+json"
    assert respuesta.json()["type"] == BASE_PROBLEMAS + "not-found"
    assert respuesta.headers["cache-control"] == "no-store"


def test_SDK05_sin_recursos_hasta_la_fase_3_todo_es_404(tmp_path: Path) -> None:
    """Directorio vacío (placeholder hasta que la fase 3 copie el motor en la imagen)."""
    cliente = crear_cliente_multi(directorio_sdk=tmp_path / "no-existe")
    assert cliente.get("/sdk/v1/motor.wasm").status_code == 404


def test_SDK05_directorio_por_defecto_existe_en_el_repositorio() -> None:
    from app.config import Config

    assert Config().directorio_sdk.name == "v1"
    assert Config().directorio_sdk.parent.name == "sdk"
