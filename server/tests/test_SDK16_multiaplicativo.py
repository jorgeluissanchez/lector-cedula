"""SDK-16: configuración multi-aplicativo por clave en `CLAVES_API_JSON` (orígenes, retornos y secreto
de webhook) y CORS por clave (sdk-integracion, tarea 2.1). Datos sintéticos únicamente."""

import json
import os
import subprocess
import sys
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.config import Config
from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AUTH_KL,
    AUTH_KT,
    AUTH_KT2,
    BASE_PROBLEMAS,
    KL,
    KT,
    ORIGEN_A,
    ORIGEN_B,
    RAIZ_SERVIDOR,
    SECRETO_WEBHOOK_KT,
    claves_multi,
    crear,
    crear_cliente_multi,
    hash_clave,
    ruta_de_subida,
    subir,
)

PARTES = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}


def _entorno(claves: list[dict[str, Any]]) -> dict[str, str]:
    return {"CLAVES_API_JSON": json.dumps(claves)}


def _problema(respuesta: Any, estado: int, slug: str) -> dict[str, Any]:
    assert respuesta.status_code == estado, respuesta.text[:300]
    assert respuesta.headers["content-type"] == "application/problem+json"
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE_PROBLEMAS + slug
    return cuerpo


# --- Configuración -------------------------------------------------------------------------------------


def test_SDK16_forma_nueva_con_origenes_retornos_y_secreto() -> None:
    config = Config.desde_entorno(_entorno(claves_multi()))
    clave_a = config.claves[hash_clave(KT)]
    assert clave_a.origenes == (ORIGEN_A,)
    assert clave_a.retornos == ("https://app-a.example/volver", "com.ejemplo.appa://lector/retorno")
    assert clave_a.secreto_webhook == SECRETO_WEBHOOK_KT


def test_SDK16_forma_anterior_sigue_valida_y_usa_ORIGENES_CORS() -> None:
    """Migración compatible: una entrada sin `origenes` ni `retornos` es válida; sus orígenes son los
    globales de `ORIGENES_CORS` y no admite ningún `return_url`."""
    entorno = {
        "CLAVES_API_JSON": json.dumps([{"sha256": hash_clave(KL), "secreto_webhook": "whsec_x"}]),
        "ORIGENES_CORS": "https://app.lector-cedula.example",
    }
    config = Config.desde_entorno(entorno)
    clave = config.claves[hash_clave(KL)]
    assert clave.origenes is None
    assert clave.retornos == ()
    assert config.origenes_de(clave) == ("https://app.lector-cedula.example",)


@pytest.mark.parametrize(
    "origenes",
    [
        ["*"],
        ["https://*.example"],
        ["http://app-a.example"],
        ["https://app-a.example/"],
        ["https://app-a.example/ruta"],
        ["https://usuario@app-a.example"],
        ["https://app-a.example:99999"],
        [""],
        "https://app-a.example",
        [1],
    ],
)
def test_SDK16_origenes_no_validos_se_rechazan(origenes: Any) -> None:
    claves = claves_multi()
    claves[0]["origenes"] = origenes
    with pytest.raises(ValueError, match="origenes") as error:
        Config.desde_entorno(_entorno(claves))
    assert hash_clave(KT) not in str(error.value)
    assert SECRETO_WEBHOOK_KT not in str(error.value)


@pytest.mark.parametrize(
    "retorno",
    [
        "*",
        "https://app-a.example/*",
        "http://app-a.example/volver",
        "javascript://alert(1)",
        "data://texto",
        "file:///etc/passwd",
        "https://usuario:clave@app-a.example/volver",
        "com.ejemplo.appa:/sin-barras",
        "",
        "https://app-a.example/volver#frag",
    ],
)
def test_SDK16_retornos_no_validos_se_rechazan(retorno: str) -> None:
    claves = claves_multi()
    claves[0]["retornos"] = [retorno]
    with pytest.raises(ValueError, match="retornos") as error:
        Config.desde_entorno(_entorno(claves))
    assert SECRETO_WEBHOOK_KT not in str(error.value)


def test_SDK16_comodin_en_ORIGENES_CORS_se_rechaza() -> None:
    with pytest.raises(ValueError, match="ORIGENES_CORS"):
        Config.desde_entorno({"CLAVES_API_JSON": "[]", "ORIGENES_CORS": "*"})


def test_SDK16_comodin_en_la_configuracion_detiene_el_arranque() -> None:
    """Escenario "Comodín en la configuración": el proceso termina con código distinto de 0 y el
    mensaje contiene `origenes` sin incluir ninguna clave ni secreto."""
    claves = claves_multi()
    claves[0]["origenes"] = ["*"]
    entorno = {**os.environ, "CLAVES_API_JSON": json.dumps(claves)}
    proceso = subprocess.run(  # noqa: S603 - intérprete y argumentos fijos
        [sys.executable, "-c", "import app.main"],
        cwd=RAIZ_SERVIDOR,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    salida = proceso.stdout + proceso.stderr
    assert proceso.returncode != 0
    assert "origenes" in salida
    for entrada in claves:
        assert entrada["sha256"] not in salida
        assert entrada["secreto_webhook"] not in salida
    assert KT not in salida


# --- CORS por clave ------------------------------------------------------------------------------------


def test_SDK16_preflight_por_origen() -> None:
    """Escenario "Preflight por origen": `OPTIONS` a `upload.url` de una validación de KT con
    `Origin: https://app-b.example` no lleva `Access-Control-Allow-Origin`; con el origen de KT sí."""
    cliente = crear_cliente_multi()
    ruta = ruta_de_subida(crear(cliente).json())
    otro = cliente.options(ruta, headers={"Origin": ORIGEN_B, "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in otro.headers
    propio = cliente.options(ruta, headers={"Origin": ORIGEN_A, "Access-Control-Request-Method": "POST"})
    assert propio.status_code == 204
    assert propio.headers["access-control-allow-origin"] == ORIGEN_A


def test_SDK16_preflight_con_token_alterado_no_anuncia_cors() -> None:
    cliente = crear_cliente_multi()
    ruta = ruta_de_subida(crear(cliente).json())
    alterada = ruta[:-1] + ("A" if ruta[-1] != "A" else "B")
    respuesta = cliente.options(
        alterada, headers={"Origin": ORIGEN_A, "Access-Control-Request-Method": "POST"}
    )
    assert "access-control-allow-origin" not in respuesta.headers


def test_SDK16_peticion_de_servidor_sin_origin() -> None:
    """Escenario "Petición de servidor sin Origin": `CREAR` con KT sin `Origin` es 201."""
    cliente = crear_cliente_multi()
    assert crear(cliente).status_code == 201


def test_SDK16_creacion_con_origin_de_otra_clave_es_403() -> None:
    cliente = crear_cliente_multi()
    respuesta = crear(cliente, cabeceras={**AUTH_KT, "Origin": ORIGEN_B})
    cuerpo = _problema(respuesta, 403, "origin-not-allowed")
    assert cuerpo["code"] == "origin-not-allowed"
    assert crear(cliente, cabeceras={**AUTH_KT2, "Origin": ORIGEN_B}).status_code == 201


def test_SDK16_consulta_con_origin_no_permitido_es_403() -> None:
    cliente = crear_cliente_multi()
    validacion = crear(cliente).json()
    respuesta = cliente.get(f"/v1/validations/{validacion['id']}", headers={**AUTH_KT, "Origin": ORIGEN_B})
    _problema(respuesta, 403, "origin-not-allowed")


def test_SDK16_subida_con_token_desde_otro_origen_es_403_y_sigue_pending() -> None:
    cliente = crear_cliente_multi()
    validacion = crear(cliente).json()
    respuesta = subir(cliente, ruta_de_subida(validacion), PARTES, {"Origin": ORIGEN_B})
    _problema(respuesta, 403, "origin-not-allowed")
    assert "access-control-allow-origin" not in respuesta.headers
    consulta = cliente.get(f"/v1/validations/{validacion['id']}", headers=AUTH_KT)
    assert consulta.json()["status"] == "pending"


def test_SDK16_subida_con_token_desde_el_origen_de_la_clave() -> None:
    cliente = crear_cliente_multi()
    validacion = crear(cliente, sandbox_scenario="success").json()
    respuesta = subir(cliente, ruta_de_subida(validacion), PARTES, {"Origin": ORIGEN_A})
    assert respuesta.status_code == 200, respuesta.text[:300]
    assert respuesta.headers["access-control-allow-origin"] == ORIGEN_A


def test_SDK16_clave_de_forma_anterior_sin_ORIGENES_CORS_rechaza_todo_origen() -> None:
    cliente = crear_cliente_multi()
    respuesta = cliente.post(
        "/v1/validations",
        headers={**AUTH_KL, "Origin": ORIGEN_A},
        json={
            "document_type": "co_national-id-2000",
            "autorizacion": {
                "datos": True,
                "sensibles": False,
                "version_texto": "2026-10-01",
                "otorgada_en": "2026-10-06T15:19:00Z",
            },
        },
    )
    _problema(respuesta, 403, "origin-not-allowed")
    assert KL not in respuesta.text


_ORIGENES_ARBITRARIOS = st.one_of(
    st.text(min_size=1, max_size=60).filter(lambda o: o.isprintable() and o.isascii() and o.strip() == o),
    st.builds(
        lambda host, puerto: f"https://{host}.example" + (f":{puerto}" if puerto else ""),
        st.from_regex(r"[a-z][a-z0-9-]{0,20}", fullmatch=True),
        st.one_of(st.none(), st.integers(min_value=1, max_value=65535)),
    ),
).filter(lambda o: o not in (ORIGEN_A, ORIGEN_B))


@settings(max_examples=1000)
@given(origen=_ORIGENES_ARBITRARIOS)
def test_SDK16_propiedad_origen_no_listado_nunca_recibe_acao(origen: str) -> None:
    """Propiedad: un origen arbitrario no listado en ninguna clave nunca recibe
    `Access-Control-Allow-Origin`, ni en el preflight de la subida ni en los recursos del motor."""
    cliente = _CLIENTE_PROPIEDAD
    preflight = cliente.options(
        _RUTA_PROPIEDAD, headers={"Origin": origen, "Access-Control-Request-Method": "POST"}
    )
    assert "access-control-allow-origin" not in preflight.headers
    recurso = cliente.get("/sdk/v1/no-existe.js", headers={"Origin": origen})
    assert "access-control-allow-origin" not in recurso.headers


_CLIENTE_PROPIEDAD = crear_cliente_multi()
_RUTA_PROPIEDAD = ruta_de_subida(crear(_CLIENTE_PROPIEDAD).json())
