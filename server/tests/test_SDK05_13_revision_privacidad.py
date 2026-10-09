"""Hallazgos menores de revisor-privacidad sobre la fase 2 de sdk-integracion.

M1: `/sdk/v1/` solo sirve las extensiones conocidas y `DIRECTORIO_SDK` se valida al arrancar.
M3: los tokens de subida y alojado usan subclaves HKDF distintas derivadas de `SECRETO_SUBIDA`.
M4: el CORS de `/sdk/v1/` solo se anuncia en respuestas 200.
"""

import hashlib
import hmac
from pathlib import Path

import pytest

from app.config import Config
from app.secretos import hkdf_sha256, subclave
from app.token_alojado import emitir_token_alojado, verificar_token_alojado
from app.token_subida import emitir_token, verificar_token
from tests.utilidades import AHORA, ORIGEN_A, crear_cliente_multi

SECRETO = b"secreto_subida_sintetico_solo_pruebas_0000000000"
ID = "val_0123456789abcdef0123456789abcdef"


# --- M1 ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("archivo", ["notas-1a2b.txt", "modelo-9f.onnx", "pagina-aa.html", "imagen-01.png"])
def test_M1_extension_no_admitida_es_404_aunque_exista(tmp_path: Path, archivo: str) -> None:
    (tmp_path / archivo).write_bytes(b"x")
    cliente = crear_cliente_multi(directorio_sdk=tmp_path)
    assert cliente.get(f"/sdk/v1/{archivo}").status_code == 404


def test_M1_directorio_sdk_relativo_se_rechaza() -> None:
    with pytest.raises(ValueError, match="DIRECTORIO_SDK"):
        Config.desde_entorno({"CLAVES_API_JSON": "[]", "DIRECTORIO_SDK": "sdk/v1"})


def test_M1_directorio_sdk_absoluto_se_acepta(tmp_path: Path) -> None:
    config = Config.desde_entorno({"CLAVES_API_JSON": "[]", "DIRECTORIO_SDK": str(tmp_path)})
    assert config.directorio_sdk == tmp_path


# --- M4 ---------------------------------------------------------------------------------------------


def test_M4_cors_de_sdk_solo_en_200(tmp_path: Path) -> None:
    (tmp_path / "motor-01.wasm").write_bytes(b"\x00asm\x01\x00\x00\x00")
    cliente = crear_cliente_multi(directorio_sdk=tmp_path)
    ausente = cliente.get("/sdk/v1/no-existe.wasm", headers={"Origin": ORIGEN_A})
    assert ausente.status_code == 404
    assert "access-control-allow-origin" not in ausente.headers
    presente = cliente.get("/sdk/v1/motor-01.wasm", headers={"Origin": ORIGEN_A})
    assert presente.headers["access-control-allow-origin"] == ORIGEN_A


# --- M3 ---------------------------------------------------------------------------------------------


def test_M3_hkdf_vector_1_de_RFC_5869() -> None:
    ikm = bytes.fromhex("0b" * 22)
    sal = bytes.fromhex("000102030405060708090a0b0c")
    info = bytes.fromhex("f0f1f2f3f4f5f6f7f8f9")
    esperado = bytes.fromhex(
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
    )
    assert hkdf_sha256(ikm, sal, info, 42) == esperado


def test_M3_subclaves_distintas_por_proposito() -> None:
    subida, alojada = subclave(SECRETO, "subida"), subclave(SECRETO, "alojada")
    assert len(subida) == len(alojada) == 32
    assert subida != alojada
    assert SECRETO not in (subida, alojada)


def test_M3_token_de_subida_firmado_con_la_subclave_y_mismo_formato() -> None:
    """Compatibilidad: el formato del token de subida no cambia (54 caracteres, vencimiento + HMAC) y el
    HMAC se calcula con la subclave de subida, no con el secreto en bruto."""
    vence = AHORA + 900
    token = emitir_token(SECRETO, ID, vence)
    assert len(token) == 54
    assert verificar_token(SECRETO, ID, token, AHORA) == "valido"
    import base64

    crudo = base64.urlsafe_b64decode(token + "==")
    clave = subclave(SECRETO, "subida")
    assert crudo[8:] == hmac.new(clave, f"{ID}.{vence}".encode(), hashlib.sha256).digest()
    assert crudo[8:] != hmac.new(SECRETO, f"{ID}.{vence}".encode(), hashlib.sha256).digest()


def test_M3_token_alojado_firmado_con_su_subclave() -> None:
    vence = AHORA + 900
    token = emitir_token_alojado(SECRETO, ID, vence)
    assert len(token) == 75
    assert verificar_token_alojado(SECRETO, token, AHORA) == ("valido", ID)
    import base64

    crudo = base64.urlsafe_b64decode(token + "=")
    clave = subclave(SECRETO, "alojada")
    assert crudo[24:] == hmac.new(clave, f"alojada.{ID}.{vence}".encode(), hashlib.sha256).digest()
