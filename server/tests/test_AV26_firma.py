"""AV-26: firma HMAC-SHA256 `t=,v1=` del webhook (tarea 7.1, decisión 8).

Los valores esperados son los literales de la spec, calculados con dos implementaciones
independientes (Node `crypto` y `openssl`); nunca se recalculan con la función bajo prueba.
"""

from hypothesis import event, given, settings
from hypothesis import strategies as st

from app.webhooks import cabecera_firma, verificar_firma

CUERPO = (
    b'{"id":"evt_00000000000000000000000000000001","type":"validation.completed",'
    b'"created_at":"2026-10-06T15:20:00Z","sandbox":true,"data":{"validation_id":'
    b'"val_0123456789abcdef0123456789abcdef","status":"success","declined_reason":null}}'
)
SECRETO = "whsec_sintetico_0123456789abcdef"
T = 1_791_300_000


def test_AV26_el_cuerpo_de_los_vectores_mide_232_bytes() -> None:
    assert len(CUERPO) == 232


def test_AV26_vector_1_firma_valida() -> None:
    """Vector 1: la cabecera es exactamente la de la spec."""
    assert (
        cabecera_firma(SECRETO, T, CUERPO)
        == "t=1791300000,v1=1b3358c314ebcad6047166133405e2be0692e92e52d17606840183a58d5711df"
    )


def test_AV26_vector_2_cuerpo_alterado() -> None:
    """Vector 2: con `"status":"failure"`, `v1` cambia al literal de la spec."""
    alterado = CUERPO.replace(b'"status":"success"', b'"status":"failure"')
    assert cabecera_firma(SECRETO, T, alterado).endswith(
        "v1=ad2d9a1789d2a0aed77ed9cba60fdd44dace698518a137e7c0a3ba07323a494e"
    )


def test_AV26_vector_3_otro_secreto() -> None:
    """Vector 3: con el secreto `whsec_sintetico_fedcba9876543210`."""
    assert cabecera_firma("whsec_sintetico_fedcba9876543210", T, CUERPO).endswith(
        "v1=307be610808415cdcd78c48a54caa014d67c6a674e5906fa0f8a3ebd18d26120"
    )


def test_AV26_vector_4_otra_marca_de_tiempo() -> None:
    """Vector 4: con `t` = 1791300001."""
    assert (
        cabecera_firma(SECRETO, T + 1, CUERPO)
        == "t=1791300001,v1=66fbd0de5b41f685f61b6102a0f9ffebfcd85b8649f2307d72f14d475eb43bdf"
    )


def test_AV26_vector_5_evento_de_revision() -> None:
    """Vector 5: evento de revisión con `data_inconsistent`."""
    cuerpo = (
        b'{"id":"evt_00000000000000000000000000000002","type":"validation.completed",'
        b'"created_at":"2026-10-06T15:20:00Z","sandbox":true,"data":{"validation_id":'
        b'"val_0123456789abcdef0123456789abcdef","status":"review","declined_reason":"data_inconsistent"}}'
    )
    assert cabecera_firma(SECRETO, T, cuerpo).endswith(
        "v1=ddb4aa811a2cf0f80d5a9670ce95f5415ac3939a9e1dafc13b7b378abdc85ad7"
    )


def test_AV26_verificacion_de_cabeceras_mal_formadas() -> None:
    """La verificación rechaza cabeceras mal formadas sin lanzar."""
    valida = cabecera_firma(SECRETO, T, CUERPO)
    assert verificar_firma(SECRETO, valida, CUERPO)
    for cabecera in ("", "t=1", "v1=abc", "t=x,v1=" + "0" * 64, valida.upper(), valida + ",x"):
        assert not verificar_firma(SECRETO, cabecera, CUERPO)


@settings(max_examples=1000)
@given(
    cuerpo=st.binary(min_size=1, max_size=512),
    secreto=st.text(min_size=1, max_size=64),
    t=st.integers(min_value=0, max_value=2**40),
    datos=st.data(),
)
def test_AV26_propiedad_de_verificacion(cuerpo: bytes, secreto: str, t: int, datos: st.DataObject) -> None:
    """Propiedad: la verificación de lo firmado es verdadera y, tras alterar un byte del cuerpo, falsa."""
    cabecera = cabecera_firma(secreto, t, cuerpo)
    assert verificar_firma(secreto, cabecera, cuerpo)
    posicion = datos.draw(st.integers(min_value=0, max_value=len(cuerpo) - 1))
    delta = datos.draw(st.integers(min_value=1, max_value=255))
    alterado = bytearray(cuerpo)
    alterado[posicion] = (alterado[posicion] + delta) % 256
    event(f"cuerpo de {min(len(cuerpo) // 128, 3) * 128}+ bytes")
    assert not verificar_firma(secreto, cabecera, bytes(alterado))
