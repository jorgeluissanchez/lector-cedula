"""AV-12 (idempotencia de la creación) y AV-04 "La clave de idempotencia no se consume" (tarea 4.3).

La concurrencia se prueba con un `asyncio.Event` inyectado que retiene la primera creación; nunca con
esperas por tiempo.
"""

import asyncio
import itertools
from typing import Any

import httpx
from hypothesis import event, given, settings
from hypothesis import strategies as st

from app.main import crear_app
from tests.utilidades import (
    AUT,
    AUTH_KT,
    AUTH_KT2,
    BASE_PROBLEMAS,
    CREAR_CUERPO,
    config_de_prueba,
    crear,
    crear_cliente_con,
    puertos_de_prueba,
    reloj_de,
)


def _con_clave(clave: str, base: dict[str, str] | None = None) -> dict[str, str]:
    return {**(base or AUTH_KT), "Idempotency-Key": clave}


def _problema(respuesta: Any, estado: int, slug: str) -> None:
    assert respuesta.status_code == estado, respuesta.text
    assert respuesta.headers["content-type"] == "application/problem+json"
    assert respuesta.json()["type"] == BASE_PROBLEMAS + slug


def test_AV12_repeticion_exacta() -> None:
    """Repetición exacta: `CREAR` dos veces con `Idempotency-Key: k-1` da 201 y cuerpo idéntico byte
    a byte, la segunda con `Idempotent-Replayed: true`, y una sola validación nueva."""
    cliente = crear_cliente_con()
    primera = crear(cliente, _con_clave("k-1"))
    reloj_de(cliente).avanzar(5)
    segunda = crear(cliente, _con_clave("k-1"))
    assert (primera.status_code, segunda.status_code) == (201, 201)
    assert segunda.content == primera.content
    assert "idempotent-replayed" not in primera.headers
    assert segunda.headers["idempotent-replayed"] == "true"
    assert segunda.headers["location"] == primera.headers["location"]
    assert segunda.headers["content-type"] == "application/json"
    assert segunda.headers["x-request-id"] != primera.headers["x-request-id"]
    assert len(cliente.app.state.almacen) == 1  # type: ignore[attr-defined]


def test_AV12_misma_clave_otro_cuerpo() -> None:
    """Misma clave, otro cuerpo: la segunda creación con `k-2` y `co_national-id-2020` da 422
    `idempotency-key-reused`."""
    cliente = crear_cliente_con()
    assert crear(cliente, _con_clave("k-2")).status_code == 201
    _problema(
        crear(cliente, _con_clave("k-2"), document_type="co_national-id-2020"),
        422,
        "idempotency-key-reused",
    )
    assert len(cliente.app.state.almacen) == 1  # type: ignore[attr-defined]


def test_AV12_cuerpo_canonico() -> None:
    """El mismo JSON con otro orden de claves o espacios es el mismo cuerpo (cuerpo canónico)."""
    cliente = crear_cliente_con()
    primera = cliente.post(
        "/v1/validations",
        headers={**_con_clave("k-canon"), "Content-Type": "application/json"},
        content=b'{"document_type":"co_national-id-2000","autorizacion":{"datos":true,"sensibles":false,'
        b'"version_texto":"2026-10-01","otorgada_en":"2026-10-06T15:19:00Z"}}',
    )
    segunda = cliente.post(
        "/v1/validations",
        headers={**_con_clave("k-canon"), "Content-Type": "application/json"},
        content=b'{ "autorizacion": {"otorgada_en": "2026-10-06T15:19:00Z", "version_texto": "2026-10-01",'
        b' "sensibles": false, "datos": true}, "document_type": "co_national-id-2000" }',
    )
    assert primera.status_code == 201
    assert segunda.content == primera.content
    assert segunda.headers["idempotent-replayed"] == "true"


def test_AV12_peticion_concurrente_con_la_misma_clave() -> None:
    """Petición concurrente con la misma clave: mientras la creación con `k-3` está retenida, otra
    con la misma clave da 409 `idempotency-key-in-progress`; al liberarla, la primera da 201."""

    async def escenario() -> tuple[httpx.Response, httpx.Response, httpx.Response]:
        dentro = asyncio.Event()
        liberar = asyncio.Event()
        llamadas = itertools.count()

        async def retener() -> None:
            if next(llamadas) == 0:
                dentro.set()
                await liberar.wait()

        aplicacion = crear_app(config_de_prueba(), puertos_de_prueba(retener_creacion=retener))
        transporte = httpx.ASGITransport(app=aplicacion)
        async with httpx.AsyncClient(transport=transporte, base_url="http://testserver") as cliente:
            primera = asyncio.create_task(
                cliente.post("/v1/validations", headers=_con_clave("k-3"), json=CREAR_CUERPO)
            )
            # Tope de seguridad: si la creación nunca llega al punto de retención, la prueba falla en
            # lugar de colgarse. No sincroniza nada: la sincronización es el propio evento.
            await asyncio.wait_for(dentro.wait(), timeout=30)
            segunda = await cliente.post("/v1/validations", headers=_con_clave("k-3"), json=CREAR_CUERPO)
            liberar.set()
            respuesta_primera = await primera
            tercera = await cliente.post("/v1/validations", headers=_con_clave("k-3"), json=CREAR_CUERPO)
        return respuesta_primera, segunda, tercera

    primera, segunda, tercera = asyncio.run(escenario())
    _problema(segunda, 409, "idempotency-key-in-progress")
    assert primera.status_code == 201
    assert tercera.status_code == 201
    assert tercera.headers["idempotent-replayed"] == "true"
    assert tercera.content == primera.content


def test_AV12_clave_invalida() -> None:
    """Clave inválida: `Idempotency-Key` vacía o de 256 caracteres da 400 `invalid-idempotency-key`;
    de 255 caracteres imprimibles se acepta."""
    cliente = crear_cliente_con()
    _problema(crear(cliente, _con_clave("")), 400, "invalid-idempotency-key")
    _problema(crear(cliente, _con_clave("k" * 256)), 400, "invalid-idempotency-key")
    assert len(cliente.app.state.almacen) == 0  # type: ignore[attr-defined]
    assert crear(cliente, _con_clave("~" + "k" * 253 + " ")).status_code == 201


def test_AV12_alcance_por_cliente_y_vencimiento() -> None:
    """Alcance por cliente y vencimiento: `k-4` con `KT`, con `KT2` y con `KT` tras 86 401 s dan tres
    201 con tres `id` distintos y ninguno trae `Idempotent-Replayed`."""
    cliente = crear_cliente_con()
    respuestas = [crear(cliente, _con_clave("k-4")), crear(cliente, _con_clave("k-4", AUTH_KT2))]
    reloj_de(cliente).avanzar(86_401)
    respuestas.append(
        crear(cliente, _con_clave("k-4"), autorizacion={**AUT, "otorgada_en": "2026-10-07T15:20:00Z"})
    )
    assert [r.status_code for r in respuestas] == [201, 201, 201]
    assert len({r.json()["id"] for r in respuestas}) == 3
    assert all("idempotent-replayed" not in r.headers for r in respuestas)


def test_AV12_vigente_hasta_86400_s() -> None:
    """A los 86 400 s exactos la clave sigue vigente y la repetición se devuelve."""
    cliente = crear_cliente_con()
    primera = crear(cliente, _con_clave("k-5"))
    reloj_de(cliente).avanzar(86_400)
    segunda = crear(cliente, _con_clave("k-5"))
    assert segunda.headers.get("idempotent-replayed") == "true"
    assert segunda.content == primera.content


def test_AV04_la_clave_de_idempotencia_no_se_consume() -> None:
    """La clave de idempotencia no se consume: `CREAR` con `k-aut-1` y `datos` `false` da 422, y con
    la misma clave y `datos` `true` da 201 sin `Idempotent-Replayed`."""
    cliente = crear_cliente_con()
    primera = crear(cliente, _con_clave("k-aut-1"), autorizacion={**AUT, "datos": False})
    segunda = crear(cliente, _con_clave("k-aut-1"))
    assert primera.status_code == 422
    assert segunda.status_code == 201
    assert "idempotent-replayed" not in segunda.headers


# --- Propiedad de repetición -----------------------------------------------------------------------

_hosts = st.sampled_from(["hooks.example.com", "receptor.example.org", "a-b.example.net"])
_cuerpos_validos = st.builds(
    lambda tipo, face_match, sensibles, version, segundos, webhook, escenario: {
        k: v
        for k, v in {
            "document_type": tipo,
            "face_match": face_match,
            "autorizacion": {
                "datos": True,
                "sensibles": sensibles or face_match,
                "version_texto": version,
                "otorgada_en": f"2026-10-06T15:{14 + segundos // 60:02d}:{segundos % 60:02d}Z",
            },
            "webhook_url": webhook,
            "sandbox_scenario": escenario,
        }.items()
        if v is not None
    },
    tipo=st.sampled_from(["co_national-id-2000", "co_national-id-2020"]),
    face_match=st.booleans(),
    sensibles=st.booleans(),
    version=st.from_regex(r"[A-Za-z0-9._-]{1,64}", fullmatch=True),
    # 15:14:00 a 15:25:00: nunca más de 300 s en el futuro respecto a las 15:20:00.
    segundos=st.integers(min_value=0, max_value=660),
    webhook=st.none() | _hosts.map(lambda h: f"https://{h}/lector"),
    escenario=st.none() | st.sampled_from(["success", "failure_image_quality", "review_document_liveness"]),
)
_claves = st.from_regex(r"[\x20-\x7E]{1,255}", fullmatch=True)
_cliente_propiedad = crear_cliente_con(limite_peticiones_por_minuto=10**9)
_secuencia = itertools.count()


@settings(max_examples=500)
@given(cuerpo=_cuerpos_validos, clave=_claves)
def test_AV12_propiedad_repeticion_identica(cuerpo: dict[str, Any], clave: str) -> None:
    """Propiedad: cuerpos válidos arbitrarios repetidos con la misma clave devuelven bytes idénticos y
    crean una sola validación."""
    # Prefijo único por ejemplo: cada ejemplo estrena clave aunque Hypothesis repita la generada.
    clave = f"{next(_secuencia)}-{clave}"[:255]
    event(f"face_match: {cuerpo.get('face_match')}")
    almacen = _cliente_propiedad.app.state.almacen  # type: ignore[attr-defined]
    antes = len(almacen)
    primera = _cliente_propiedad.post("/v1/validations", headers=_con_clave(clave), json=cuerpo)
    segunda = _cliente_propiedad.post("/v1/validations", headers=_con_clave(clave), json=cuerpo)
    assert primera.status_code == 201, primera.text
    assert segunda.status_code == 201
    assert segunda.content == primera.content
    assert segunda.headers["idempotent-replayed"] == "true"
    assert len(almacen) == antes + 1
