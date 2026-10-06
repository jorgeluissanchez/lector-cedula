"""AV-11: rate limiting por clave con ventana deslizante de 60 s (tarea 4.4, decisión 11)."""

from hypothesis import event, given, settings
from hypothesis import strategies as st

from app.limite import VentanaDeslizante
from tests.utilidades import AUTH_KT, AUTH_KT2, BASE_PROBLEMAS, crear, crear_cliente_con, reloj_de

ID = "val_0123456789abcdef0123456789abcdef"


def _agotar(cliente: object, limite: int = 60) -> list[int]:
    return [cliente.get(f"/v1/validations/{ID}", headers=AUTH_KT).status_code for _ in range(limite)]  # type: ignore[attr-defined]


def test_AV11_peticion_61_en_el_mismo_minuto() -> None:
    """Petición 61 en el mismo minuto: con límite 60 y reloj fijo, las 60 primeras no son 429 y la 61
    es 429 `rate-limited` con `Retry-After: 60`."""
    cliente = crear_cliente_con(limite_peticiones_por_minuto=60)
    estados = _agotar(cliente)
    assert 429 not in estados
    respuesta = cliente.get(f"/v1/validations/{ID}", headers=AUTH_KT)
    assert respuesta.status_code == 429
    assert respuesta.headers["content-type"] == "application/problem+json"
    assert respuesta.json()["type"] == BASE_PROBLEMAS + "rate-limited"
    assert respuesta.headers["retry-after"] == "60"
    assert respuesta.headers["cache-control"] == "no-store"


def test_AV11_otra_clave_no_se_ve_afectada() -> None:
    """Otra clave no se ve afectada: tras agotar `KT`, un `GET` con `KT2` no es 429."""
    cliente = crear_cliente_con(limite_peticiones_por_minuto=60)
    _agotar(cliente)
    assert cliente.get(f"/v1/validations/{ID}", headers=AUTH_KT).status_code == 429
    assert cliente.get(f"/v1/validations/{ID}", headers=AUTH_KT2).status_code != 429


def test_AV11_la_ventana_se_libera() -> None:
    """La ventana se libera: agotado el límite a las 15:20:00Z, a las 15:21:00.001Z la siguiente
    petición con `KT` no es 429."""
    cliente = crear_cliente_con(limite_peticiones_por_minuto=60)
    _agotar(cliente)
    reloj_de(cliente).avanzar(59.999)
    respuesta = cliente.get(f"/v1/validations/{ID}", headers=AUTH_KT)
    assert respuesta.status_code == 429
    assert respuesta.headers["retry-after"] == "1"
    reloj_de(cliente).fijar(1_791_300_060.001)
    assert cliente.get(f"/v1/validations/{ID}", headers=AUTH_KT).status_code != 429


def test_AV11_se_aplica_antes_de_leer_el_cuerpo_y_en_la_creacion() -> None:
    """La creación también cuenta y el 429 llega antes de leer el cuerpo (un cuerpo enorme da 429,
    no 413)."""
    cliente = crear_cliente_con(limite_peticiones_por_minuto=2)
    assert crear(cliente).status_code == 201
    assert crear(cliente).status_code == 201
    respuesta = cliente.post("/v1/validations", headers=AUTH_KT, content=b"x" * 20_000)
    assert respuesta.status_code == 429
    assert len(cliente.app.state.almacen) == 2  # type: ignore[attr-defined]


def test_AV11_sin_clave_no_cuenta() -> None:
    """Una petición sin clave válida responde 401 y no consume el cupo de nadie."""
    cliente = crear_cliente_con(limite_peticiones_por_minuto=1)
    for _ in range(3):
        assert cliente.get(f"/v1/validations/{ID}").status_code == 401
    assert cliente.get(f"/v1/validations/{ID}", headers=AUTH_KT).status_code == 404


# --- Propiedad sobre líneas de tiempo arbitrarias ---------------------------------------------------

VENTANA_MS = 60_000
BASE_MS = 1_791_300_000_000
# Huecos entre peticiones: muchos 0 (ráfagas), bordes de la ventana ±1 ms y huecos arbitrarios.
_huecos = st.one_of(
    st.just(0),
    st.just(0),
    st.integers(min_value=0, max_value=5),
    st.sampled_from([VENTANA_MS - 1, VENTANA_MS, VENTANA_MS + 1]),
    st.integers(min_value=0, max_value=2 * VENTANA_MS),
)


@settings(max_examples=1000)
@given(limite=st.integers(min_value=1, max_value=4), huecos=st.lists(_huecos, min_size=1, max_size=40))
def test_AV11_propiedad_lineas_de_tiempo(limite: int, huecos: list[int]) -> None:
    """Propiedad: en cualquier línea de tiempo, en toda ventana de 60 s hay como máximo N aceptadas, y
    ninguna petición se rechaza si la ventana que termina en ella tiene hueco. El oráculo trabaja en
    milisegundos enteros, independiente de la aritmética en coma flotante del limitador."""
    limitador = VentanaDeslizante(limite)
    instantes: list[int] = []
    momento = BASE_MS
    for hueco in huecos:
        momento += hueco
        instantes.append(momento)

    aceptadas: list[int] = []
    rechazos = 0
    for instante_ms in instantes:
        espera = limitador.registrar("clave", instante_ms / 1000)
        # Aceptadas en la ventana (instante - 60 s, instante] antes de esta petición.
        en_ventana = sum(1 for t in aceptadas if instante_ms - t < VENTANA_MS)
        if espera is None:
            assert en_ventana < limite
            aceptadas.append(instante_ms)
        else:
            rechazos += 1
            assert en_ventana == limite
            mas_antigua = min(t for t in aceptadas if instante_ms - t < VENTANA_MS)
            assert espera == max(1, -(-(mas_antigua + VENTANA_MS - instante_ms) // 1000))
    for fin in aceptadas:
        assert sum(1 for t in aceptadas if fin - VENTANA_MS < t <= fin) <= limite
    event(f"con rechazos: {rechazos > 0}")
