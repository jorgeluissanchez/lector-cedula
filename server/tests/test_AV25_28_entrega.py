"""Entrega del webhook `validation.completed` (tarea 7.2): AV-25 y AV-28 "Resolución a red interna".

`Transporte`, `Resolvedor`, `Planificador` y `Reloj` son dobles controlados por el test: ninguna
prueba abre conexiones ni espera por tiempo.
"""

import ipaddress
import json
from typing import Any

import pytest
from hypothesis import event, given, settings
from hypothesis import strategies as st

from app.webhooks import ip_bloqueada, verificar_firma
from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AHORA,
    AUT,
    SECRETO_WEBHOOK_KT,
    GeneradorFijo,
    ResolvedorFalso,
    crear,
    crear_cliente_con,
    puertos_de_prueba,
    ruta_de_subida,
    subir,
)

ID_VAL = "val_0123456789abcdef0123456789abcdef"
ID_EVT = "evt_00000000000000000000000000000001"
URL = "https://hooks.example.com/lector"
CUERPO_ESPERADO = (
    b'{"id":"evt_00000000000000000000000000000001","type":"validation.completed",'
    b'"created_at":"2026-10-06T15:20:00Z","sandbox":true,"data":{"validation_id":'
    b'"val_0123456789abcdef0123456789abcdef","status":"success","declined_reason":null}}'
)
FRONT_BACK = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}
MARCADORES = ("9999123456", "9999654321", "PEÑA", "NUÑEZ", "FICTICIA", "1990-02-28")


def _cliente(**puertos: Any) -> Any:
    return crear_cliente_con(puertos_de_prueba(**puertos))


def _terminar(cliente: Any, **campos: Any) -> dict[str, Any]:
    creada = crear(cliente, **campos)
    assert creada.status_code == 201, creada.text
    partes = dict(FRONT_BACK)
    if campos.get("face_match"):
        partes["selfie"] = (IMG_JPEG, "image/jpeg")
    respuesta = subir(cliente, ruta_de_subida(creada.json()), partes)
    assert respuesta.status_code == 200
    return respuesta.json()


def _puertos(cliente: Any) -> Any:
    return cliente.app.state.puertos


def test_AV25_cuerpo_exacto_del_evento() -> None:
    """Cuerpo exacto del evento: con los ids fijados, una validación sandbox con `webhook_url` que
    termina en `success` a 1791300000 produce un `POST` a esa URL con el cuerpo de 232 bytes de la
    spec, `X-Lector-Event-Id`, `X-Lector-Attempt: 1` y una firma válida."""
    cliente = _cliente(generador_ids=GeneradorFijo([ID_VAL], [ID_EVT]))
    _terminar(cliente, webhook_url=URL)
    _puertos(cliente).planificador.ejecutar_hasta(AHORA)
    (peticion,) = _puertos(cliente).transporte.peticiones
    assert peticion["url"] == URL
    assert peticion["ip"] == "93.184.215.14"
    assert peticion["cuerpo"] == CUERPO_ESPERADO
    assert len(peticion["cuerpo"]) == 232
    cabeceras = peticion["cabeceras"]
    assert cabeceras["Content-Type"] == "application/json"
    assert cabeceras["X-Lector-Event-Id"] == ID_EVT
    assert cabeceras["X-Lector-Attempt"] == "1"
    assert cabeceras["X-Lector-Signature"].startswith(f"t={AHORA},v1=")
    assert verificar_firma(SECRETO_WEBHOOK_KT, cabeceras["X-Lector-Signature"], peticion["cuerpo"])
    assert peticion["timeout_s"] == 10
    assert _puertos(cliente).resolvedor.consultas == ["hooks.example.com"]


@pytest.mark.parametrize(
    "campos",
    [
        {"sandbox_scenario": "success"},
        {"sandbox_scenario": "failure_image_quality"},
        {"sandbox_scenario": "failure_document_unreadable"},
        {"sandbox_scenario": "review_data_consistency"},
        {"sandbox_scenario": "review_document_liveness"},
        {"sandbox_scenario": "failure_document_expired", "document_type": "co_national-id-2020"},
        {
            "sandbox_scenario": "review_face_mismatch",
            "face_match": True,
            "autorizacion": {**AUT, "sensibles": True},
        },
        {"document_type": "co_national-id-2020"},
    ],
)
def test_AV25_sin_datos_del_documento_en_el_evento(campos: dict[str, Any]) -> None:
    """Sin datos del documento en el evento: en cualquier escenario el cuerpo no contiene números,
    nombres ni fecha de nacimiento, y solo lleva `id`, `type`, `created_at`, `sandbox` y `data`."""
    cliente = _cliente()
    resultado = _terminar(cliente, webhook_url=URL, **campos)
    _puertos(cliente).planificador.ejecutar_hasta(AHORA)
    (peticion,) = _puertos(cliente).transporte.peticiones
    texto = peticion["cuerpo"].decode()
    assert all(marcador not in texto for marcador in MARCADORES)
    evento = json.loads(texto)
    assert list(evento) == ["id", "type", "created_at", "sandbox", "data"]
    assert evento["data"] == {
        "validation_id": resultado["id"],
        "status": resultado["status"],
        "declined_reason": resultado["declined_reason"],
    }


def test_AV25_sin_webhook_configurado() -> None:
    """Sin webhook configurado: el transporte no recibe ninguna petición."""
    cliente = _cliente()
    _terminar(cliente)
    _puertos(cliente).planificador.ejecutar_hasta(AHORA + 86_399)
    assert _puertos(cliente).transporte.peticiones == []
    assert _puertos(cliente).resolvedor.consultas == []


def test_AV25_vencimiento_de_la_subida_tambien_notifica() -> None:
    """Una validación con `webhook_url` que vence sin subida también emite el evento (`failure`,
    `upload_expired`)."""
    cliente = _cliente()
    crear(cliente, webhook_url=URL)
    _puertos(cliente).planificador.ejecutar_hasta(AHORA + 901)
    (peticion,) = _puertos(cliente).transporte.peticiones
    assert json.loads(peticion["cuerpo"])["data"]["declined_reason"] == "upload_expired"


def test_AV28_resolucion_a_red_interna(capsys: pytest.CaptureFixture[str]) -> None:
    """Resolución a red interna: si el resolvedor devuelve `10.0.0.5` para `hooks.example.com`, el
    transporte no recibe ninguna petición, no se programa ningún reintento y el log registra `outcome`
    `"blocked"`."""
    cliente = _cliente(resolvedor=ResolvedorFalso({"hooks.example.com": ["10.0.0.5"]}))
    resultado = _terminar(cliente, webhook_url=URL)
    capsys.readouterr()
    planificador = _puertos(cliente).planificador
    planificador.ejecutar_hasta(AHORA)
    lineas = [json.loads(linea) for linea in capsys.readouterr().out.splitlines() if linea.strip()]
    assert _puertos(cliente).transporte.peticiones == []
    # Solo queda la eliminación por retención (AV-24); ningún reintento del webhook.
    assert planificador.pendientes() == [AHORA + 86_400]
    planificador.ejecutar_hasta(AHORA + 86_399)
    assert _puertos(cliente).transporte.peticiones == []
    intentos = [linea for linea in lineas if linea["event"] == "webhook_intento"]
    assert intentos == [
        {
            **{k: intentos[0][k] for k in ("ts", "level", "event_id")},
            "event": "webhook_intento",
            "validation_id": resultado["id"],
            "attempt": 1,
            "outcome": "blocked",
            "sandbox": True,
        }
    ]
    assert "10.0.0.5" not in json.dumps(lineas)


def test_AV28_bloqueo_si_alguna_ip_es_interna() -> None:
    """Si el host resuelve a varias IPs y alguna es interna, el envío se bloquea (el atacante no
    puede alternar entre una pública y una interna)."""
    cliente = _cliente(resolvedor=ResolvedorFalso({"hooks.example.com": ["93.184.215.14", "127.0.0.1"]}))
    _terminar(cliente, webhook_url=URL)
    _puertos(cliente).planificador.ejecutar_hasta(AHORA + 30_000)
    assert _puertos(cliente).transporte.peticiones == []


# --- Propiedad de rangos de IP ----------------------------------------------------------------------

RANGOS_BLOQUEADOS = [
    "0.0.0.0/8",
    "10.0.0.0/8",
    "100.64.0.0/10",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "224.0.0.0/4",
    "240.0.0.0/4",
    "::1/128",
    "::/128",
    "fc00::/7",
    "fe80::/10",
    "ff00::/8",
    "::ffff:10.0.0.0/104",
    "::ffff:127.0.0.0/104",
    "64:ff9b::7f00:0/120",
]


@st.composite
def _ips_bloqueadas(draw: st.DrawFn) -> tuple[str, str]:
    rango = ipaddress.ip_network(draw(st.sampled_from(RANGOS_BLOQUEADOS)))
    desplazamiento = draw(st.integers(min_value=0, max_value=rango.num_addresses - 1))
    return str(rango), str(rango.network_address + desplazamiento)


@settings(max_examples=1000)
@given(muestra=_ips_bloqueadas())
def test_AV28_propiedad_rangos_de_ip(muestra: tuple[str, str]) -> None:
    """Propiedad: toda IP de los rangos de loopback, privados, link-local, multicast y no enrutables
    (IPv4 e IPv6, incluidas las IPv4 mapeadas) se bloquea."""
    rango, ip = muestra
    event(f"rango {rango}")
    assert ip_bloqueada(ip)


@pytest.mark.parametrize("ip", ["93.184.215.14", "8.8.8.8", "2606:4700:4700::1111", "1.1.1.1"])
def test_AV28_ips_publicas_permitidas(ip: str) -> None:
    assert not ip_bloqueada(ip)


@pytest.mark.parametrize("texto", ["", "no-es-ip", "999.1.1.1", "10.0.0.5%eth0"])
def test_AV28_texto_que_no_es_ip_se_bloquea(texto: str) -> None:
    assert ip_bloqueada(texto)


def test_AV28_transporte_de_produccion_conecta_a_la_ip_comprobada(monkeypatch: pytest.MonkeyPatch) -> None:
    """`TransporteHttpx` conecta a la IP ya comprobada (sin resolver otra vez), con `Host` y SNI del
    nombre original, sin seguir redirecciones, sin proxies del entorno y con timeout de 10 s. Se
    intercepta `httpx.AsyncClient.send`: no se abre ninguna conexión."""
    import asyncio

    import httpx

    from app.red import TransporteHttpx

    vistos: list[dict[str, Any]] = []

    async def enviar_falso(self: httpx.AsyncClient, peticion: httpx.Request, **_: Any) -> httpx.Response:
        vistos.append(
            {
                "url": str(peticion.url),
                "host": peticion.headers["host"],
                "sni": peticion.extensions.get("sni_hostname"),
                "redirecciones": self.follow_redirects,
                "entorno": self._trust_env,
                "timeout": self.timeout.connect,
                "cuerpo": peticion.content,
            }
        )
        return httpx.Response(302, headers={"Location": "https://otro.example/"}, request=peticion)

    monkeypatch.setattr(httpx.AsyncClient, "send", enviar_falso)
    transporte = TransporteHttpx()
    estado = asyncio.run(
        transporte.enviar(
            "https://hooks.example.com:8443/lector?x=1", "93.184.215.14", {"X-A": "1"}, b"{}", 10
        )
    )
    estado_v6 = asyncio.run(transporte.enviar(URL, "2606:4700:4700::1111", {}, b"{}", 10))
    assert (estado, estado_v6) == (302, 302)
    assert vistos[0] == {
        "url": "https://93.184.215.14:8443/lector?x=1",
        "host": "hooks.example.com:8443",
        "sni": "hooks.example.com",
        "redirecciones": False,
        "entorno": False,
        "timeout": 10,
        "cuerpo": b"{}",
    }
    assert vistos[1]["url"] == "https://[2606:4700:4700::1111]/lector"  # httpx omite el 443
    assert vistos[1]["host"] == "hooks.example.com"
    assert len(vistos) == 2
