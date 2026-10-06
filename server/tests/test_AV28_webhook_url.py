"""AV-28 (creación): destino del webhook seguro (tarea 4.2, decisión 10).

La resolución DNS al entregar ("Resolución a red interna") es de la tarea 7.2.
"""

import pytest

from tests.utilidades import BASE_PROBLEMAS, crear, crear_cliente_con

URLS_RECHAZADAS_SPEC = [
    "http://hooks.example.com/x",
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "https://usuario:clave@hooks.example.com/x",
    "ftp://hooks.example.com/x",
]

# Variantes de las mismas reglas que la spec no enumera: IP en otras notaciones, host sin dominio,
# credenciales sin clave, longitud por encima de 2048 y espacios.
URLS_RECHAZADAS_ADICIONALES = [
    "https://2130706433/x",
    "https://0x7f.0.0.1/x",
    "https://localhost/x",
    "https://usuario@hooks.example.com/x",
    "https://hooks.example.com/" + "a" * (2049 - len("https://hooks.example.com/")),
    "https://hooks.example.com/x y",
    "https:///x",
    "https://hooks.example.com:0/x",
    "HTTPS://hooks.example.com/x",
]


@pytest.mark.parametrize("url", URLS_RECHAZADAS_SPEC)
def test_AV28_urls_rechazadas_al_crear(url: str) -> None:
    """URLs rechazadas al crear: cada una de las 5 URLs de la spec responde 422 con
    `[{"pointer": "/webhook_url", "code": "invalid_webhook_url"}]` y no crea la validación."""
    cliente = crear_cliente_con()
    respuesta = crear(cliente, webhook_url=url)
    assert respuesta.status_code == 422
    assert respuesta.headers["content-type"] == "application/problem+json"
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE_PROBLEMAS + "invalid-request"
    assert cuerpo["errors"] == [{"pointer": "/webhook_url", "code": "invalid_webhook_url"}]
    assert len(cliente.app.state.almacen) == 0  # type: ignore[attr-defined]
    for fragmento in ("usuario", "clave", "127.0.0.1", "hooks.example.com"):
        assert fragmento not in respuesta.text


@pytest.mark.parametrize("url", URLS_RECHAZADAS_ADICIONALES)
def test_AV28_variantes_rechazadas(url: str) -> None:
    """Las mismas reglas en otras notaciones también se rechazan con `invalid_webhook_url`."""
    respuesta = crear(crear_cliente_con(), webhook_url=url)
    assert respuesta.status_code == 422
    assert respuesta.json()["errors"] == [{"pointer": "/webhook_url", "code": "invalid_webhook_url"}]


@pytest.mark.parametrize(
    "url",
    [
        "https://hooks.example.com/lector",
        "https://hooks.example.com:8443/lector?origen=sandbox",
        "https://hooks.example.com/" + "a" * (2048 - len("https://hooks.example.com/")),
    ],
)
def test_AV28_urls_aceptadas_y_devueltas(url: str) -> None:
    """Una URL `https` con host DNS, sin credenciales y de hasta 2048 caracteres se acepta y se
    devuelve tal cual en `webhook_url`."""
    respuesta = crear(crear_cliente_con(), webhook_url=url)
    assert respuesta.status_code == 201
    assert respuesta.json()["webhook_url"] == url
