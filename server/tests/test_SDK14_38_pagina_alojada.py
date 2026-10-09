"""SDK-14 (página alojada `/v/{token}` e intercambio `POST /v/{token}/inicio`), SDK-38 / tarea 4.3 (una sola
cara en la subida de una sesión del SDK) y SDK-05 (assets del paquete con manifiesto en `/sdk/v1/`).
sdk-integracion, fase 4. Datos sintéticos únicamente (claves KT/KT2 de la spec, imágenes sintéticas)."""

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AUTH_KT,
    BASE_PROBLEMAS,
    ORIGEN_A,
    ORIGEN_B,
    RETORNO_A,
    URL_PUBLICA_SDK,
    crear,
    crear_cliente_multi,
    reloj_de,
    ruta_de_subida,
    subir,
)

PLANTILLA = (
    '<!doctype html><html><head><style nonce="__NONCE__">p{}</style>'
    '<script type="application/json" id="config-sesion">__CONFIG__</script>'
    '<script type="module" nonce="__NONCE__">/* pagina */</script></head><body></body></html>'
)
SOLO_FRENTE = {"front": (IMG_JPEG, "image/jpeg")}
AMBAS = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}


@pytest.fixture
def cliente(tmp_path: Path) -> TestClient:
    plantilla = tmp_path / "index.html"
    plantilla.write_text(PLANTILLA, encoding="utf-8")
    return crear_cliente_multi(pagina_alojada=plantilla)


def _token(validacion: dict[str, Any]) -> str:
    return urlsplit(validacion["hosted_url"]).path.removeprefix("/v/")


def _config(html: str) -> dict[str, Any]:
    m = re.search(r'<script type="application/json" id="config-sesion">(.*?)</script>', html, re.S)
    assert m is not None
    return json.loads(m.group(1))


def _cabeceras_pagina(respuesta: Any) -> None:
    assert respuesta.headers["cache-control"] == "no-store"
    assert respuesta.headers["referrer-policy"] == "no-referrer"
    assert respuesta.headers["content-type"].startswith("text/html")
    csp = respuesta.headers["content-security-policy"]
    assert "'unsafe-eval'" not in csp.replace("'wasm-unsafe-eval'", "")
    assert "'unsafe-inline'" not in csp
    assert "frame-ancestors 'none'" in csp
    assert "__NONCE__" not in respuesta.text


def test_SDK14_cabeceras_de_la_pagina_alojada_valida_e_invalida(cliente: TestClient) -> None:
    """Escenario "Cabeceras de la página alojada" (token válido y token inválido)."""
    validacion = crear(cliente, return_url=RETORNO_A).json()
    valida = cliente.get(f"/v/{_token(validacion)}")
    assert valida.status_code == 200
    _cabeceras_pagina(valida)
    invalida = cliente.get("/v/" + "A" * 75)
    assert invalida.status_code == 404
    _cabeceras_pagina(invalida)


def test_SDK14_nonce_distinto_por_peticion_y_en_la_csp(cliente: TestClient) -> None:
    token = _token(crear(cliente).json())
    nonces = []
    for _ in range(2):
        r = cliente.get(f"/v/{token}")
        nonce = re.search(r"'nonce-([A-Za-z0-9_-]{22,})'", r.headers["content-security-policy"])
        assert nonce is not None
        assert r.text.count(f'nonce="{nonce.group(1)}"') == 2
        nonces.append(nonce.group(1))
    assert nonces[0] != nonces[1]


def test_SDK14_configuracion_de_la_sesion_valida(cliente: TestClient) -> None:
    """La página recibe solo lo necesario: id, retorno y versión del texto de autorización; nunca el token de
    subida ni la clave."""
    validacion = crear(cliente, return_url=RETORNO_A).json()
    r = cliente.get(f"/v/{_token(validacion)}")
    assert _config(r.text) == {
        "estado": "valida",
        "validation_id": validacion["id"],
        "return_url": RETORNO_A,
        "version_texto": "2026-10-01",
        "documento": "cedula",
    }
    assert "token=" not in r.text


def test_SDK14_token_alterado_muestra_sesion_invalida(cliente: TestClient) -> None:
    """Escenario "Token alterado": último carácter cambiado."""
    token = _token(crear(cliente, return_url=RETORNO_A).json())
    alterado = token[:-1] + ("A" if token[-1] != "A" else "B")
    r = cliente.get(f"/v/{alterado}")
    assert r.status_code == 404
    assert _config(r.text) == {"estado": "invalida"}
    assert RETORNO_A not in r.text


def test_SDK14_token_vencido_muestra_sesion_invalida(cliente: TestClient) -> None:
    """Escenario "Token vencido": el reloj pasa `upload.expires_at`."""
    validacion = crear(cliente).json()
    reloj_de(cliente).avanzar(16 * 60 + 1)
    r = cliente.get(f"/v/{_token(validacion)}")
    assert _config(r.text) == {"estado": "invalida"}


def test_SDK14_validacion_terminal_o_borrada_es_invalida(cliente: TestClient) -> None:
    validacion = crear(cliente).json()
    token = _token(validacion)
    assert subir(cliente, ruta_de_subida(validacion), AMBAS).status_code == 200
    assert _config(cliente.get(f"/v/{token}").text) == {"estado": "invalida"}
    otra = crear(cliente).json()
    assert cliente.delete(f"/v1/validations/{otra['id']}", headers=AUTH_KT).status_code == 204
    assert _config(cliente.get(f"/v/{_token(otra)}").text) == {"estado": "invalida"}


def test_SDK14_sin_plantilla_responde_503_sin_rastro(tmp_path: Path) -> None:
    cliente = crear_cliente_multi(pagina_alojada=tmp_path / "no-existe.html")
    token = _token(crear(cliente).json())
    r = cliente.get(f"/v/{token}")
    assert r.status_code == 503
    assert r.headers["cache-control"] == "no-store"
    assert token not in r.text


def test_SDK14_inicio_entrega_upload_url_e_id(cliente: TestClient) -> None:
    """Decisión 8: el token alojado se intercambia por `upload.url` (no va en la URL de la página)."""
    validacion = crear(cliente).json()
    r = cliente.post(f"/v/{_token(validacion)}/inicio")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo == {"validation_id": validacion["id"], "upload": validacion["upload"]}
    assert cuerpo["upload"]["url"].startswith(URL_PUBLICA_SDK + "/v1/validations/")
    assert r.headers["cache-control"] == "no-store"


def test_SDK14_inicio_token_invalido_y_vencido(cliente: TestClient) -> None:
    validacion = crear(cliente).json()
    r = cliente.post("/v/" + "A" * 75 + "/inicio")
    assert r.status_code == 403
    assert r.json()["type"] == BASE_PROBLEMAS + "upload-token-invalid"
    reloj_de(cliente).avanzar(16 * 60 + 1)
    r = cliente.post(f"/v/{_token(validacion)}/inicio")
    assert r.status_code == 403
    assert r.json()["type"] == BASE_PROBLEMAS + "upload-token-expired"


def test_SDK14_inicio_validacion_terminal_409(cliente: TestClient) -> None:
    validacion = crear(cliente).json()
    assert subir(cliente, ruta_de_subida(validacion), AMBAS).status_code == 200
    r = cliente.post(f"/v/{_token(validacion)}/inicio")
    assert r.status_code == 409
    assert r.json()["type"] == BASE_PROBLEMAS + "validation-not-pending"


def test_SDK14_inicio_desde_otro_origen_403(cliente: TestClient) -> None:
    """Solo la página alojada (mismo origen que `URL_PUBLICA`) o un origen de la clave creadora."""
    token = _token(crear(cliente).json())
    assert cliente.post(f"/v/{token}/inicio", headers={"Origin": ORIGEN_B}).status_code == 403
    assert cliente.post(f"/v/{token}/inicio", headers={"Origin": ORIGEN_A}).status_code == 200
    assert cliente.post(f"/v/{token}/inicio", headers={"Origin": URL_PUBLICA_SDK}).status_code == 200


def test_SDK38_4_3_una_sola_cara_tras_el_inicio_alojado(cliente: TestClient) -> None:
    """Tarea 4.3: una sesión iniciada por el SDK o la página alojada acepta solo `front`."""
    validacion = crear(cliente).json()
    inicio = cliente.post(f"/v/{_token(validacion)}/inicio").json()
    r = subir(cliente, ruta_de_subida(inicio), SOLO_FRENTE, {"Origin": URL_PUBLICA_SDK})
    assert r.status_code == 200, r.text[:300]
    assert r.json()["status"] == "success"


def test_SDK38_4_3_sin_inicio_se_siguen_exigiendo_las_dos_caras(cliente: TestClient) -> None:
    """AV-07 sigue igual para la integración por API: sin el intercambio alojado, falta `back` es 422."""
    validacion = crear(cliente).json()
    r = subir(cliente, ruta_de_subida(validacion), SOLO_FRENTE)
    assert r.status_code == 422
    assert r.json()["errors"] == [{"pointer": "/back", "code": "required"}]


def test_SDK38_4_3_sesion_del_sdk_admite_aun_las_dos_caras(cliente: TestClient) -> None:
    validacion = crear(cliente).json()
    inicio = cliente.post(f"/v/{_token(validacion)}/inicio").json()
    assert subir(cliente, ruta_de_subida(inicio), AMBAS).status_code == 200


def test_SDK14_subida_desde_la_pagina_alojada_mismo_origen(cliente: TestClient) -> None:
    """La página alojada sube desde el origen de `URL_PUBLICA`; un origen ajeno sigue con 403."""
    validacion = crear(cliente).json()
    inicio = cliente.post(f"/v/{_token(validacion)}/inicio").json()
    assert subir(cliente, ruta_de_subida(inicio), SOLO_FRENTE, {"Origin": ORIGEN_B}).status_code == 403
    assert subir(cliente, ruta_de_subida(inicio), SOLO_FRENTE, {"Origin": URL_PUBLICA_SDK}).status_code == 200


@pytest.fixture
def assets(tmp_path: Path) -> Path:
    d = tmp_path / "v1"
    d.mkdir()
    (d / "lector.js").write_bytes(b"export {};\n")
    (d / "mrz.traineddata").write_bytes(b"\x00modelo")
    (d / "THIRD_PARTY_LICENSES.txt").write_bytes(b"avisos")
    (d / "notas-1a2b.txt").write_bytes(b"no")
    (d / "manifest.json").write_text(
        json.dumps(
            {
                "version": "0.1.0",
                "recursos": [
                    {"archivo": n, "bytes": 1, "sha256": "0" * 64, "tipo": "x"}
                    for n in ("lector.js", "mrz.traineddata", "THIRD_PARTY_LICENSES.txt")
                ],
            }
        ),
        encoding="utf-8",
    )
    return d


def test_SDK05_assets_del_paquete_listados_en_el_manifiesto(assets: Path) -> None:
    """Los assets de @lector-cedula/web (manifiesto, modelo y avisos) se sirven si el manifiesto los lista."""
    cliente = crear_cliente_multi(directorio_sdk=assets)
    m = cliente.get("/sdk/v1/manifest.json", headers={"Origin": ORIGEN_A})
    assert m.status_code == 200
    assert m.headers["content-type"].startswith("application/json")
    assert m.headers["cache-control"] == "no-cache"
    assert m.headers["access-control-allow-origin"] == ORIGEN_A
    modelo = cliente.get("/sdk/v1/mrz.traineddata")
    assert modelo.status_code == 200
    assert modelo.headers["content-type"] == "application/octet-stream"
    assert cliente.get("/sdk/v1/THIRD_PARTY_LICENSES.txt").headers["content-type"].startswith("text/plain")
    nota = cliente.get("/sdk/v1/notas-1a2b.txt", headers={"Origin": ORIGEN_A})
    assert nota.status_code == 404
    assert "access-control-allow-origin" not in nota.headers


def test_SDK05_sin_manifiesto_solo_motor(tmp_path: Path) -> None:
    (tmp_path / "modelo.traineddata").write_bytes(b"x")
    (tmp_path / "manifest.json").write_text("{no es json", encoding="utf-8")
    cliente = crear_cliente_multi(directorio_sdk=tmp_path)
    assert cliente.get("/sdk/v1/modelo.traineddata").status_code == 404
    assert cliente.get("/sdk/v1/manifest.json").status_code == 404
