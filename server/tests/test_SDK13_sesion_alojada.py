"""SDK-13: `return_url` validado contra la lista exacta de la clave y `hosted_url` con un token de
propósito distinto al de subida (sdk-integracion, tarea 2.2). Datos sintéticos únicamente."""

import re
import string
from typing import Any
from urllib.parse import parse_qs, urlsplit

from hypothesis import given, settings
from hypothesis import strategies as st

from app.token_alojado import emitir_token_alojado, verificar_token_alojado
from app.token_subida import emitir_token, verificar_token
from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AHORA,
    AUTH_KT,
    AUTH_KT2,
    BASE_PROBLEMAS,
    DEEPLINK_A,
    RETORNO_A,
    RETORNO_B,
    crear,
    crear_cliente_multi,
    ruta_de_subida,
    subir,
)

PATRON_ALOJADA = r"^https://api\.lector-cedula\.example/v/[A-Za-z0-9_-]{43,}$"
SECRETO = b"secreto_subida_sintetico_solo_pruebas_0000000000"
ID = "val_0123456789abcdef0123456789abcdef"
PARTES = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}
ALFABETO = string.ascii_letters + string.digits + "-_"


def _token_alojado(validacion: dict[str, Any]) -> str:
    return urlsplit(validacion["hosted_url"]).path.removeprefix("/v/")


def _token_subida(validacion: dict[str, Any]) -> str:
    return parse_qs(urlsplit(validacion["upload"]["url"]).query)["token"][0]


def test_SDK13_creacion_con_retorno_permitido() -> None:
    """Escenario "Creación con retorno permitido"."""
    cliente = crear_cliente_multi()
    respuesta = crear(cliente, return_url=RETORNO_A)
    assert respuesta.status_code == 201, respuesta.text[:300]
    cuerpo = respuesta.json()
    assert re.fullmatch(PATRON_ALOJADA, cuerpo["hosted_url"])
    assert cuerpo["return_url"] == RETORNO_A
    assert _token_alojado(cuerpo) != _token_subida(cuerpo)


def test_SDK13_retorno_de_otra_clave() -> None:
    """Escenario "Retorno de otra clave": 422 con `return_url_not_allowed`."""
    cliente = crear_cliente_multi()
    respuesta = crear(cliente, return_url=RETORNO_B)
    assert respuesta.status_code == 422
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE_PROBLEMAS + "invalid-request"
    assert cuerpo["errors"] == [{"pointer": "/return_url", "code": "return_url_not_allowed"}]
    assert RETORNO_B not in respuesta.text
    # La misma URL sí pertenece a KT2.
    assert crear(cliente, cabeceras=AUTH_KT2, return_url=RETORNO_B).status_code == 201


def test_SDK13_deeplink_nativo() -> None:
    """Escenario "Deeplink nativo"."""
    cliente = crear_cliente_multi()
    respuesta = crear(cliente, return_url=DEEPLINK_A)
    assert respuesta.status_code == 201
    assert respuesta.json()["return_url"] == DEEPLINK_A


def test_SDK13_sin_retorno() -> None:
    """Escenario "Sin retorno": `return_url` `null` y `hosted_url` presente."""
    cliente = crear_cliente_multi()
    cuerpo = crear(cliente).json()
    assert cuerpo["return_url"] is None
    assert re.fullmatch(PATRON_ALOJADA, cuerpo["hosted_url"])


def test_SDK13_retorno_con_prefijo_o_variante_no_coincide() -> None:
    """La lista es exacta: ni prefijos, ni sufijos, ni mayúsculas distintas."""
    cliente = crear_cliente_multi()
    for variante in (
        RETORNO_A + "/otra",
        RETORNO_A + "?x=1",
        RETORNO_A.upper(),
        "https://app-a.example",
        "https://app-a.example/volver/",
    ):
        respuesta = crear(cliente, return_url=variante)
        assert respuesta.status_code == 422, variante
        assert respuesta.json()["errors"] == [{"pointer": "/return_url", "code": "return_url_not_allowed"}]


def test_SDK13_return_url_null_o_no_texto_es_invalid_type() -> None:
    cliente = crear_cliente_multi()
    for valor in (None, 5):
        respuesta = crear(cliente, return_url=valor)
        assert respuesta.status_code == 422
        assert respuesta.json()["errors"] == [{"pointer": "/return_url", "code": "invalid_type"}]


def test_SDK13_consulta_y_estado_terminal() -> None:
    """La consulta conserva `return_url` y `hosted_url`; en estado terminal `hosted_url` es `null`,
    como `upload`, y `return_url` se conserva."""
    cliente = crear_cliente_multi()
    creada = crear(cliente, return_url=RETORNO_A, sandbox_scenario="success").json()
    ruta = f"/v1/validations/{creada['id']}"
    consultada = cliente.get(ruta, headers=AUTH_KT).json()
    assert consultada["return_url"] == RETORNO_A
    assert consultada["hosted_url"] == creada["hosted_url"]
    subida = subir(cliente, ruta_de_subida(creada), PARTES)
    assert subida.status_code == 200, subida.text[:300]
    terminada = cliente.get(ruta, headers=AUTH_KT).json()
    assert terminada["status"] != "pending"
    assert terminada["hosted_url"] is None
    assert terminada["return_url"] == RETORNO_A


# --- Token alojado ------------------------------------------------------------------------------------


def test_SDK13_token_alojado_identifica_la_validacion_y_vence_con_la_subida() -> None:
    vence = AHORA + 900
    token = emitir_token_alojado(SECRETO, ID, vence)
    assert re.fullmatch(r"[A-Za-z0-9_-]{43,}", token)
    assert verificar_token_alojado(SECRETO, token, AHORA) == ("valido", ID)
    assert verificar_token_alojado(SECRETO, token, vence) == ("valido", ID)
    assert verificar_token_alojado(SECRETO, token, vence + 1) == ("vencido", ID)
    assert verificar_token_alojado(b"otro", token, AHORA) == ("invalido", None)


def test_SDK13_tokens_de_proposito_distinto_no_se_intercambian() -> None:
    vence = AHORA + 900
    alojado = emitir_token_alojado(SECRETO, ID, vence)
    subida = emitir_token(SECRETO, ID, vence)
    assert alojado != subida
    assert verificar_token(SECRETO, ID, alojado, AHORA) == "invalido"
    assert verificar_token_alojado(SECRETO, subida, AHORA) == ("invalido", None)


@settings(max_examples=1000)
@given(
    id_hex=st.text(alphabet="0123456789abcdef", min_size=32, max_size=32),
    vence=st.integers(min_value=0, max_value=2**40),
    posicion=st.integers(min_value=0, max_value=10_000),
    caracter=st.sampled_from(ALFABETO),
)
def test_SDK13_propiedad_firma_y_alteracion(id_hex: str, vence: int, posicion: int, caracter: str) -> None:
    """Propiedad: todo token emitido verifica con su `id`; cambiar un carácter lo invalida; nunca es
    igual al token de subida."""
    id_validacion = f"val_{id_hex}"
    token = emitir_token_alojado(SECRETO, id_validacion, vence)
    assert verificar_token_alojado(SECRETO, token, vence) == ("valido", id_validacion)
    assert token != emitir_token(SECRETO, id_validacion, vence)
    i = posicion % len(token)
    if token[i] != caracter:
        alterado = token[:i] + caracter + token[i + 1 :]
        assert verificar_token_alojado(SECRETO, alterado, vence)[0] == "invalido"


@settings(max_examples=1000)
@given(texto=st.text(max_size=120))
def test_SDK13_propiedad_entrada_arbitraria_nunca_lanza(texto: str) -> None:
    resultado = verificar_token_alojado(SECRETO, texto, AHORA)
    assert resultado[0] in ("valido", "invalido", "vencido")
