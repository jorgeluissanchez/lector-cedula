"""AV-08: URL de subida firmada y de un solo uso (tarea 5.1, decisión 4)."""

import re
import string
from typing import Any
from urllib.parse import parse_qs, urlsplit

from hypothesis import event, given, settings
from hypothesis import strategies as st

from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AUTH_KT,
    AUTH_KT2,
    BASE_PROBLEMAS,
    crear,
    crear_cliente_con,
    reloj_de,
    ruta_de_subida,
    subir,
)

PARTES = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}
ALFABETO_TOKEN = string.ascii_letters + string.digits + "-_"


def _problema(respuesta: Any, estado: int, slug: str) -> None:
    assert respuesta.status_code == estado, respuesta.text
    assert respuesta.headers["content-type"] == "application/problem+json"
    assert respuesta.json()["type"] == BASE_PROBLEMAS + slug


def _estado(cliente: Any, id_validacion: str) -> str:
    return cliente.get(f"/v1/validations/{id_validacion}", headers=AUTH_KT).json()["status"]


def _partes(validacion: dict[str, Any]) -> tuple[str, str]:
    url = urlsplit(validacion["upload"]["url"])
    return url.path, parse_qs(url.query)["token"][0]


def test_AV08_forma_de_la_url_de_subida() -> None:
    """Forma de la URL de subida: con `URL_PUBLICA` `https://api.lector-cedula.example`, `upload.url`
    cumple el patrón de la spec y `upload.expires_at` es `2026-10-06T15:35:00Z`."""
    cliente = crear_cliente_con(url_publica="https://api.lector-cedula.example")
    validacion = crear(cliente).json()
    assert re.fullmatch(
        r"^https://api\.lector-cedula\.example/v1/validations/val_[0-9a-f]{32}/images\?token=[A-Za-z0-9_-]{43,}$",
        validacion["upload"]["url"],
    )
    assert f"/v1/validations/{validacion['id']}/images" in validacion["upload"]["url"]
    assert validacion["upload"]["expires_at"] == "2026-10-06T15:35:00Z"
    # 8 bytes de vencimiento + 32 de HMAC-SHA256 en base64url sin relleno (decisión 4).
    assert len(_partes(validacion)[1]) == 54


def test_AV08_token_alterado() -> None:
    """Token alterado: con el último carácter del token cambiado, 403 `upload-token-invalid` y la
    validación sigue en `pending`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    ruta, token = _partes(validacion)
    ultimo = "A" if token[-1] != "A" else "B"
    _problema(subir(cliente, f"{ruta}?token={token[:-1]}{ultimo}", PARTES), 403, "upload-token-invalid")
    assert _estado(cliente, validacion["id"]) == "pending"


def test_AV08_token_de_otra_validacion() -> None:
    """Token de otra validación: el token de A en la ruta de B da 403 `upload-token-invalid`."""
    cliente = crear_cliente_con()
    a, b = crear(cliente).json(), crear(cliente).json()
    _, token_a = _partes(a)
    ruta_b, _ = _partes(b)
    _problema(subir(cliente, f"{ruta_b}?token={token_a}", PARTES), 403, "upload-token-invalid")
    assert _estado(cliente, a["id"]) == _estado(cliente, b["id"]) == "pending"


def test_AV08_token_vencido() -> None:
    """Token vencido: con el reloj en `2026-10-06T15:35:01Z`, 403 `upload-token-expired`; a las
    15:35:00 aún es válido."""
    cliente = crear_cliente_con()
    vencida, vigente = crear(cliente).json(), crear(cliente).json()
    reloj_de(cliente).fijar(1_791_300_900)
    assert subir(cliente, ruta_de_subida(vigente), PARTES).status_code == 200
    reloj_de(cliente).fijar(1_791_300_901)
    _problema(subir(cliente, ruta_de_subida(vencida), PARTES), 403, "upload-token-expired")


def test_AV08_subida_con_la_clave_del_creador() -> None:
    """Subida con la clave del creador: sin `token` y con `KT`, 200; con `KT2`, 404 `not-found`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    ruta = f"/v1/validations/{validacion['id']}/images"
    _problema(subir(cliente, ruta, PARTES, AUTH_KT2), 404, "not-found")
    assert _estado(cliente, validacion["id"]) == "pending"
    respuesta = subir(cliente, ruta, PARTES, AUTH_KT)
    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "success"


def test_AV08_sin_token_ni_clave() -> None:
    """Sin `token` ni clave, la subida responde 401 `unauthorized`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    _problema(subir(cliente, f"/v1/validations/{validacion['id']}/images", PARTES), 401, "unauthorized")


def test_AV08_token_valido_para_un_id_inexistente() -> None:
    """Un token bien firmado para un `id` que ya no existe en el almacén da 404 `not-found`."""
    cliente = crear_cliente_con()
    validacion = crear(cliente).json()
    cliente.app.state.almacen.eliminar(validacion["id"])  # type: ignore[attr-defined]
    _problema(subir(cliente, ruta_de_subida(validacion), PARTES), 404, "not-found")


# --- Propiedad de alteración ------------------------------------------------------------------------

_cliente_propiedad = crear_cliente_con(limite_peticiones_por_minuto=10**9)
_validacion_propiedad = crear(_cliente_propiedad).json()
_RUTA, _TOKEN = _partes(_validacion_propiedad)
_ID = _validacion_propiedad["id"]


@st.composite
def _alteraciones(draw: st.DrawFn) -> tuple[str, str, str]:
    """Una alteración de un solo carácter del token o del `id` (sin el prefijo `val_`), siempre
    distinta del original y con caracteres que no necesitan codificarse en la URL."""
    objetivo = draw(st.sampled_from(["token", "id"]))
    original = _TOKEN if objetivo == "token" else _ID[4:]
    posicion = draw(st.integers(min_value=0, max_value=len(original) - 1))
    nuevo = draw(st.sampled_from(ALFABETO_TOKEN).filter(lambda c: c != original[posicion]))
    alterado = original[:posicion] + nuevo + original[posicion + 1 :]
    if objetivo == "token":
        return objetivo, _ID, alterado
    return objetivo, "val_" + alterado, _TOKEN


@settings(max_examples=1000)
@given(alteracion=_alteraciones())
def test_AV08_propiedad_alteracion(alteracion: tuple[str, str, str]) -> None:
    """Propiedad: cualquier alteración de un carácter del token o del `id` da 403 y la validación
    sigue en `pending`."""
    objetivo, id_validacion, token = alteracion
    event(f"altera: {objetivo}")
    respuesta = subir(_cliente_propiedad, f"/v1/validations/{id_validacion}/images?token={token}", PARTES)
    assert respuesta.status_code == 403
    assert respuesta.json()["code"] == "upload-token-invalid"


def test_AV08_propiedad_no_consumio_la_validacion() -> None:
    """Tras la propiedad, la validación usada sigue en `pending` (ninguna alteración subió)."""
    assert _estado(_cliente_propiedad, _ID) == "pending"
