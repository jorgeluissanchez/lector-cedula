"""Reintentos del webhook (tarea 7.3): AV-27 y "Reintentos cancelados" de AV-23.

El `Planificador` falso lleva el `Reloj` falso al instante de cada tarea: los instantes `t` de los
intentos son los del calendario, sin esperas reales.
"""

from typing import Any

from app.webhooks import verificar_firma
from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AHORA,
    AUTH_KT,
    SECRETO_WEBHOOK_KT,
    TransporteFalso,
    crear,
    crear_cliente_con,
    puertos_de_prueba,
    ruta_de_subida,
    subir,
)

URL = "https://hooks.example.com/lector"
FRONT_BACK = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}
CALENDARIO = [AHORA, AHORA + 60, AHORA + 300, AHORA + 1800, AHORA + 7200, AHORA + 21_600]


def _escenario(respuestas: list[Any]) -> tuple[Any, Any, dict[str, Any]]:
    puertos = puertos_de_prueba(transporte=TransporteFalso(respuestas))
    cliente = crear_cliente_con(puertos)
    creada = crear(cliente, webhook_url=URL).json()
    assert subir(cliente, ruta_de_subida(creada), FRONT_BACK).status_code == 200
    return cliente, puertos, creada


def _t(peticion: dict[str, Any]) -> int:
    return int(peticion["cabeceras"]["X-Lector-Signature"].split(",")[0].removeprefix("t="))


def test_AV27_entrega_al_tercer_intento() -> None:
    """Entrega al tercer intento: 500, luego 10 s sin respuesta y luego 204 dan exactamente 3 intentos
    en `t` = 1791300000, 1791300060 y 1791300300, con `X-Lector-Attempt` 1, 2 y 3, el mismo cuerpo y
    una firma válida para su `t`."""
    _, puertos, _ = _escenario([500, TimeoutError(), 204])
    puertos.planificador.ejecutar_hasta(AHORA + 48 * 3600)
    peticiones = puertos.transporte.peticiones
    assert [_t(p) for p in peticiones] == CALENDARIO[:3]
    assert [p["t"] for p in peticiones] == CALENDARIO[:3]
    assert [p["cabeceras"]["X-Lector-Attempt"] for p in peticiones] == ["1", "2", "3"]
    assert len({p["cuerpo"] for p in peticiones}) == 1
    assert len({p["cabeceras"]["X-Lector-Event-Id"] for p in peticiones}) == 1
    for peticion in peticiones:
        assert verificar_firma(
            SECRETO_WEBHOOK_KT, peticion["cabeceras"]["X-Lector-Signature"], peticion["cuerpo"]
        )
        assert peticion["timeout_s"] == 10


def test_AV27_intentos_agotados() -> None:
    """Intentos agotados: con 503 siempre hay exactamente 6 intentos en los instantes del calendario y
    ninguno después de avanzar el reloj otras 48 h."""
    _, puertos, _ = _escenario([503] * 20)
    puertos.planificador.ejecutar_hasta(AHORA + 21_600)
    assert [_t(p) for p in puertos.transporte.peticiones] == CALENDARIO
    puertos.planificador.ejecutar_hasta(AHORA + 21_600 + 48 * 3600)
    assert len(puertos.transporte.peticiones) == 6
    assert [p["cabeceras"]["X-Lector-Attempt"] for p in puertos.transporte.peticiones] == [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
    ]


def test_AV27_redireccion_no_seguida() -> None:
    """Redirección no seguida: un 302 cuenta como intento fallido y no hay ninguna petición a
    `https://otro.example/` (el siguiente intento vuelve a la URL configurada)."""
    _, puertos, _ = _escenario([302, 204])
    puertos.planificador.ejecutar_hasta(AHORA + 3600)
    peticiones = puertos.transporte.peticiones
    assert [p["url"] for p in peticiones] == [URL, URL]
    assert [_t(p) for p in peticiones] == CALENDARIO[:2]
    assert all("otro.example" not in p["url"] for p in peticiones)


def test_AV27_un_error_de_conexion_tambien_se_reintenta() -> None:
    """Un error de red cuenta como intento fallido."""
    _, puertos, _ = _escenario([OSError(), 200])
    puertos.planificador.ejecutar_hasta(AHORA + 3600)
    assert [_t(p) for p in puertos.transporte.peticiones] == CALENDARIO[:2]


def test_AV23_reintentos_cancelados() -> None:
    """Reintentos cancelados: el receptor respondió 500 al primer intento y se hace `DELETE` antes del
    segundo; al avanzar el reloj 21 600 s no se hace ningún intento adicional."""
    cliente, puertos, creada = _escenario([500, 204, 204])
    puertos.planificador.ejecutar_hasta(AHORA)
    assert len(puertos.transporte.peticiones) == 1
    assert cliente.delete(f"/v1/validations/{creada['id']}", headers=AUTH_KT).status_code == 204
    puertos.planificador.ejecutar_hasta(AHORA + 21_600)
    assert len(puertos.transporte.peticiones) == 1
