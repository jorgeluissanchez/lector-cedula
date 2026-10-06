"""AV-07 (rechazos y CORS), AV-10 (límites de tamaño y tipo) y AV-30 (sin archivos temporales):
subida multipart en streaming y sin disco (tarea 5.2, decisión 3)."""

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any

import pytest
from hypothesis import event, given, settings
from hypothesis import strategies as st

from app.main import crear_app
from tests.imagenes_sinteticas import FIRMA_JPEG, FIRMA_PNG, IMG_JPEG, IMG_PNG, jpeg_de_tamano
from tests.utilidades import (
    AUT,
    AUTH_KT,
    BASE_PROBLEMAS,
    KT,
    config_de_prueba,
    crear,
    crear_cliente_con,
    puertos_de_prueba,
    ruta_de_subida,
    subir,
)

OCHO_MIB = 8_388_608
FRONT_JPEG = (IMG_JPEG, "image/jpeg")
BACK_PNG = (IMG_PNG, "image/png")


def _problema(respuesta: Any, estado: int, slug: str) -> dict[str, Any]:
    assert respuesta.status_code == estado, respuesta.text[:300]
    assert respuesta.headers["content-type"] == "application/problem+json"
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE_PROBLEMAS + slug
    return cuerpo


def _sigue_pendiente(cliente: Any, validacion: dict[str, Any]) -> None:
    consulta = cliente.get(f"/v1/validations/{validacion['id']}", headers=AUTH_KT)
    assert consulta.json()["status"] == "pending"


# --- AV-07 ------------------------------------------------------------------------------------------


def test_AV07_falta_una_parte_obligatoria() -> None:
    """Falta una parte obligatoria: solo `front` da 422 `[{"pointer": "/back", "code": "required"}]`
    y la validación sigue en `pending`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    cuerpo = _problema(
        subir(cliente, ruta_de_subida(validacion), {"front": FRONT_JPEG}), 422, "invalid-request"
    )
    assert cuerpo["errors"] == [{"pointer": "/back", "code": "required"}]
    _sigue_pendiente(cliente, validacion)


def test_AV07_selfie_sin_comparacion_facial() -> None:
    """Selfie sin comparación facial: con `face_match` `false`, `front`, `back` y `selfie` dan 422
    `[{"pointer": "/selfie", "code": "unexpected_part"}]` y la validación sigue en `pending`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    partes = {"front": FRONT_JPEG, "back": BACK_PNG, "selfie": FRONT_JPEG}
    cuerpo = _problema(subir(cliente, ruta_de_subida(validacion), partes), 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "/selfie", "code": "unexpected_part"}]
    _sigue_pendiente(cliente, validacion)


def test_AV07_selfie_requerida() -> None:
    """Selfie requerida: con `face_match` `true`, solo `front` y `back` dan 422
    `[{"pointer": "/selfie", "code": "required"}]`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente, face_match=True, autorizacion={**AUT, "sensibles": True}).json()
    partes = {"front": FRONT_JPEG, "back": BACK_PNG}
    cuerpo = _problema(subir(cliente, ruta_de_subida(validacion), partes), 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "/selfie", "code": "required"}]
    _sigue_pendiente(cliente, validacion)


def test_AV07_preflight_cors_desde_un_origen_permitido() -> None:
    """Preflight CORS desde un origen permitido: 204 con `Access-Control-Allow-Origin` igual al
    origen; con `Origin: https://otro.example` la respuesta no trae `Access-Control-Allow-Origin`."""
    cliente = crear_cliente_con(origenes_cors=("https://app.lector-cedula.example",))
    ruta = ruta_de_subida(crear(cliente).json())
    permitido = cliente.options(
        ruta,
        headers={"Origin": "https://app.lector-cedula.example", "Access-Control-Request-Method": "POST"},
    )
    assert permitido.status_code == 204
    assert permitido.headers["access-control-allow-origin"] == "https://app.lector-cedula.example"
    assert "POST" in permitido.headers["access-control-allow-methods"]
    assert permitido.content == b""
    assert permitido.headers["cache-control"] == "no-store"
    otro = cliente.options(
        ruta, headers={"Origin": "https://otro.example", "Access-Control-Request-Method": "POST"}
    )
    assert "access-control-allow-origin" not in otro.headers


def test_AV07_cors_en_la_subida_y_no_en_otras_rutas() -> None:
    """La subida desde un origen permitido lleva `Access-Control-Allow-Origin`; la creación no (solo
    la ruta de subida admite CORS)."""
    cliente = crear_cliente_con(origenes_cors=("https://app.lector-cedula.example",))
    origen = {"Origin": "https://app.lector-cedula.example"}
    creada = crear(cliente, {**AUTH_KT, **origen})
    assert "access-control-allow-origin" not in creada.headers
    respuesta = subir(cliente, ruta_de_subida(creada.json()), {"front": FRONT_JPEG, "back": BACK_PNG}, origen)
    assert respuesta.status_code == 200
    assert respuesta.headers["access-control-allow-origin"] == "https://app.lector-cedula.example"
    preflight_creacion = cliente.options(
        "/v1/validations", headers={**origen, "Access-Control-Request-Method": "POST"}
    )
    assert "access-control-allow-origin" not in preflight_creacion.headers


# --- AV-10 ------------------------------------------------------------------------------------------


def test_AV10_parte_de_exactamente_8_mib() -> None:
    """Parte de exactamente 8 MiB: `front` JPEG sintético de 8 388 608 bytes y `back` `IMG_PNG` dan
    200."""
    cliente = crear_cliente_con()
    front = jpeg_de_tamano(OCHO_MIB)
    assert len(front) == OCHO_MIB
    respuesta = subir(
        cliente, ruta_de_subida(crear(cliente).json()), {"front": (front, "image/jpeg"), "back": BACK_PNG}
    )
    assert respuesta.status_code == 200


def test_AV10_parte_de_8_mib_mas_un_byte() -> None:
    """Parte de 8 MiB más un byte: 413 `image-too-large` con `[{"pointer": "/front", "code":
    "too_large"}]` y la validación sigue en `pending`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    partes = {"front": (jpeg_de_tamano(OCHO_MIB + 1), "image/jpeg"), "back": BACK_PNG}
    cuerpo = _problema(subir(cliente, ruta_de_subida(validacion), partes), 413, "image-too-large")
    assert cuerpo["errors"] == [{"pointer": "/front", "code": "too_large"}]
    _sigue_pendiente(cliente, validacion)


def test_AV10_content_length_excesivo() -> None:
    """Content-Length excesivo: `Content-Length: 20971521` da 413 `request-too-large` antes de leer
    el cuerpo (el `receive` de ASGI nunca se llama)."""
    aplicacion = crear_app(config_de_prueba(), puertos_de_prueba())

    async def escenario() -> tuple[list[dict[str, Any]], int]:
        import httpx

        transporte = httpx.ASGITransport(app=aplicacion)
        async with httpx.AsyncClient(transport=transporte, base_url="http://testserver") as cliente:
            creada = (
                await cliente.post(
                    "/v1/validations",
                    headers=AUTH_KT,
                    json={"document_type": "co_national-id-2000", "autorizacion": AUT},
                )
            ).json()
        lecturas = 0

        async def receive() -> dict[str, Any]:
            nonlocal lecturas
            lecturas += 1
            return {"type": "http.request", "body": b"x" * 1024, "more_body": True}

        enviados: list[dict[str, Any]] = []

        async def send(mensaje: dict[str, Any]) -> None:
            enviados.append(mensaje)

        ruta = f"/v1/validations/{creada['id']}/images"
        alcance = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": ruta,
            "raw_path": ruta.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": [
                (b"host", b"testserver"),
                (b"authorization", f"Bearer {KT}".encode()),
                (b"content-type", b"multipart/form-data; boundary=limite"),
                (b"content-length", b"20971521"),
            ],
            "client": ("127.0.0.1", 1),
            "server": ("testserver", 80),
        }
        await aplicacion(alcance, receive, send)
        return enviados, lecturas

    enviados, lecturas = asyncio.run(escenario())
    assert lecturas == 0
    assert enviados[0]["status"] == 413
    cuerpo = b"".join(m.get("body", b"") for m in enviados if m["type"] == "http.response.body")
    assert b"/request-too-large" in cuerpo


@pytest.mark.parametrize(
    ("datos", "tipo"),
    [
        (IMG_JPEG, "image/gif"),
        (FIRMA_PNG + IMG_JPEG, "image/jpeg"),
        (IMG_PNG, "image/jpeg"),
        (IMG_JPEG, "image/png"),
    ],
)
def test_AV10_tipo_no_admitido_o_firma_que_no_coincide(datos: bytes, tipo: str) -> None:
    """Tipo no admitido o firma que no coincide: `front` declarado `image/gif`, o `image/jpeg` que
    empieza por `89 50 4E 47`, da 415 `unsupported-image-type` con un error de `pointer` `/front`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    respuesta = subir(cliente, ruta_de_subida(validacion), {"front": (datos, tipo), "back": BACK_PNG})
    cuerpo = _problema(respuesta, 415, "unsupported-image-type")
    assert [e["pointer"] for e in cuerpo["errors"]] == ["/front"]
    _sigue_pendiente(cliente, validacion)


def test_AV10_parte_vacia() -> None:
    """Parte vacía: `back` de 0 bytes da 422 `[{"pointer": "/back", "code": "empty_part"}]`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    respuesta = subir(cliente, ruta_de_subida(validacion), {"front": FRONT_JPEG, "back": (b"", "image/png")})
    cuerpo = _problema(respuesta, 422, "invalid-request")
    assert cuerpo["errors"] == [{"pointer": "/back", "code": "empty_part"}]


def test_AV10_cuerpo_que_no_es_multipart() -> None:
    """Un cuerpo que no es `multipart/form-data` da 415 y la validación sigue en `pending`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    respuesta = cliente.post(
        ruta_de_subida(validacion), content=IMG_JPEG, headers={"Content-Type": "image/jpeg"}
    )
    assert respuesta.status_code == 415
    assert respuesta.headers["content-type"] == "application/problem+json"
    _sigue_pendiente(cliente, validacion)


def test_AV10_partes_desconocidas_duplicadas_o_mal_formadas() -> None:
    """Una parte con otro nombre, una parte repetida o un multipart truncado dan 422 sin reproducir el
    nombre enviado por el cliente."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    ruta = ruta_de_subida(validacion)
    desconocida = subir(cliente, ruta, {"front": FRONT_JPEG, "back": BACK_PNG, "otra_9999123456": FRONT_JPEG})
    assert _problema(desconocida, 422, "invalid-request")["errors"] == [
        {"pointer": "", "code": "unexpected_part"}
    ]
    assert "9999123456" not in desconocida.text
    repetida = cliente.post(
        ruta,
        files=[
            ("front", ("a", IMG_JPEG, "image/jpeg")),
            ("front", ("b", IMG_JPEG, "image/jpeg")),
            ("back", ("c", IMG_PNG, "image/png")),
        ],
    )
    assert _problema(repetida, 422, "invalid-request")["errors"] == [
        {"pointer": "/front", "code": "duplicate_part"}
    ]
    truncado = cliente.post(
        ruta,
        content=b'--limite\r\nContent-Disposition: form-data; name="front"; filename="a"\r\n'
        + b"Content-Type: image/jpeg\r\n\r\n"
        + IMG_JPEG,
        headers={"Content-Type": "multipart/form-data; boundary=limite"},
    )
    assert _problema(truncado, 422, "invalid-request")["errors"] == [
        {"pointer": "", "code": "invalid_multipart"}
    ]
    _sigue_pendiente(cliente, validacion)


# --- AV-30 ------------------------------------------------------------------------------------------


def test_AV30_imagen_grande_sin_archivos_temporales(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Imagen grande sin archivos temporales: con `TMPDIR` en un directorio vacío y
    `SpooledTemporaryFile.rollover` y `os.open` en modo escritura instrumentados para fallar, `front`
    de 8 388 608 bytes y `back` `IMG_PNG` dan 200, el directorio sigue vacío y la instrumentación no
    registró ninguna llamada."""
    cliente = crear_cliente_con()
    ruta = ruta_de_subida(crear(cliente).json())
    front = jpeg_de_tamano(OCHO_MIB)

    vacio = tmp_path / "tmpdir"
    vacio.mkdir()
    monkeypatch.setenv("TMPDIR", str(vacio))
    monkeypatch.setattr(tempfile, "tempdir", str(vacio))
    llamadas: list[str] = []
    os_open_original = os.open
    escritura = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC

    def rollover_instrumentado(self: Any) -> None:
        llamadas.append("SpooledTemporaryFile.rollover")
        raise AssertionError("rollover a disco durante la subida")

    def open_instrumentado(ruta_archivo: Any, banderas: int, *args: Any, **kwargs: Any) -> int:
        if banderas & escritura:
            llamadas.append("os.open")
            raise AssertionError("apertura en modo escritura durante la subida")
        return os_open_original(ruta_archivo, banderas, *args, **kwargs)

    monkeypatch.setattr(tempfile.SpooledTemporaryFile, "rollover", rollover_instrumentado)
    monkeypatch.setattr(os, "open", open_instrumentado)
    try:
        respuesta = subir(cliente, ruta, {"front": (front, "image/jpeg"), "back": BACK_PNG})
    finally:
        monkeypatch.undo()
    assert llamadas == []
    assert list(vacio.iterdir()) == []
    assert respuesta.status_code == 200


# --- Propiedad de tamaños ---------------------------------------------------------------------------

_BORDES = [0, 1, 2, 3, 7, 8, 9, OCHO_MIB - 1, OCHO_MIB, OCHO_MIB + 1]
_cliente_propiedad = crear_cliente_con(limite_peticiones_por_minuto=10**9)


@st.composite
def _partes_front(draw: st.DrawFn) -> tuple[bytes, str, int, bool]:
    # Dos ramas de bordes ±1 de 8 MiB y de 0/1 (al menos un 20 % de los casos, según design.md).
    bordes_1 = st.sampled_from([0, 1, 2, OCHO_MIB - 1, OCHO_MIB, OCHO_MIB + 1])
    tamano = draw(
        st.one_of(
            bordes_1,
            bordes_1,
            st.sampled_from(_BORDES),
            st.sampled_from(_BORDES).flatmap(lambda b: st.integers(max(0, b - 64), b + 64)),
            st.integers(min_value=0, max_value=OCHO_MIB + 64),
        )
    )
    tipo = draw(st.sampled_from(["image/jpeg", "image/png"]))
    firma_correcta = draw(st.booleans())
    if firma_correcta:
        cabecera = FIRMA_JPEG if tipo == "image/jpeg" else FIRMA_PNG
    else:
        cabecera = draw(st.binary(min_size=8, max_size=8))
    datos = (cabecera + bytes(max(0, tamano - len(cabecera))))[:tamano]
    return datos, tipo, tamano, firma_correcta


@settings(max_examples=300)
@given(parte=_partes_front())
def test_AV10_propiedad_tamanos_y_firmas(parte: tuple[bytes, str, int, bool]) -> None:
    """Propiedad: la subida es 200 si y solo si `front` mide entre 1 y 8 388 608 bytes y empieza por
    la firma del tipo declarado. El oráculo calcula la firma con las constantes de la decisión 3."""
    datos, tipo, tamano, _ = parte
    firma = FIRMA_JPEG if tipo == "image/jpeg" else FIRMA_PNG
    esperado_200 = 1 <= tamano <= OCHO_MIB and datos.startswith(firma)
    event(f"borde ±1: {any(abs(tamano - b) <= 1 for b in (0, 1, OCHO_MIB))}")
    event(f"esperado 200: {esperado_200}")
    validacion = crear(_cliente_propiedad).json()
    respuesta = subir(
        _cliente_propiedad, ruta_de_subida(validacion), {"front": (datos, tipo), "back": BACK_PNG}
    )
    assert (respuesta.status_code == 200) == esperado_200, (respuesta.status_code, tamano)
    if not esperado_200:
        assert respuesta.status_code in (413, 415, 422)
