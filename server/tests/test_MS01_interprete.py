"""MS-01, MS-07 y MS-08: intérprete Node con los parsers TypeScript (cambio motor-real-servidor).

Las pruebas de MS-01 lanzan el intérprete real (`/usr/local/bin/node /srv/interprete/interpretar.mjs`)
dentro del contenedor `pruebas`, con los parsers compilados en la imagen.
"""

import asyncio
import base64
import json
import subprocess
from typing import Any

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.motor_real import NODE, SCRIPT_INTERPRETE, ErrorInterprete, InterpreteNode
from tests.fixtures_motor import CAMPOS_PDF417_APELLIDO_COMPUESTO, VALIDACIONES_OK, fixture


def _ejecutar(entrada: bytes) -> tuple[int, Any]:
    proceso = subprocess.run(  # noqa: S603 - argumentos fijos, sin shell
        [NODE, SCRIPT_INTERPRETE], input=entrada, capture_output=True, timeout=30, check=False
    )
    return proceso.returncode, json.loads(proceso.stdout)


def _interpretar(peticion: dict[str, Any]) -> Any:
    return asyncio.run(InterpreteNode().interpretar(peticion))


def test_MS01_pdf417_sintetico_con_apellido_compuesto() -> None:
    """El intérprete recibe el PDF417 de FX/pdf417-amarilla/apellido-compuesto y devuelve sus campos, las 4
    validaciones en `ok` y `warnings` vacío."""
    payload = bytes.fromhex(fixture("pdf417-amarilla/apellido-compuesto")["entrada"])
    respuesta = _interpretar({"fuente": "pdf417", "datos_b64": base64.b64encode(payload).decode()})
    assert respuesta == {
        "ok": True,
        "campos": CAMPOS_PDF417_APELLIDO_COMPUESTO,
        "validaciones": VALIDACIONES_OK,
        "warnings": [],
    }


def test_MS01_mrz_sintetica_con_apellido_compuesto() -> None:
    """MRZ de FX/mrz-cedula-digital/apellido-compuesto con fecha de referencia 2026-10-06."""
    lineas = fixture("mrz-cedula-digital/apellido-compuesto")["entrada"]
    respuesta = _interpretar({"fuente": "mrz", "lineas": lineas, "fecha_referencia": "2026-10-06"})
    assert respuesta["ok"] is True
    assert respuesta["valido"] is True
    assert respuesta["campos"]["nuip"] == "9999123456"
    assert respuesta["campos"]["apellidos"] == "DE LA OSSA FICTICIO"
    assert respuesta["campos"]["nombres"] == "ANA"
    assert respuesta["digitos_control"] == {
        "serial": "valido",
        "nacimiento": "valido",
        "vencimiento": "valido",
        "compuesto": "valido",
    }
    assert respuesta["errores"] == []
    assert respuesta["warnings"] == ["M03"]
    # Sin datos crudos: ni líneas corregidas ni correcciones.
    assert set(respuesta) == {"ok", "valido", "campos", "digitos_control", "errores", "warnings"}


def test_MS01_solo_los_campos_que_usa_el_documento() -> None:
    """Minimización: el intérprete no devuelve serial, lugar, nacionalidad ni otros campos sin uso."""
    payload = bytes.fromhex(fixture("pdf417-amarilla/apellido-compuesto")["entrada"])
    pdf417 = _interpretar({"fuente": "pdf417", "datos_b64": base64.b64encode(payload).decode()})
    lineas = fixture("mrz-cedula-digital/apellido-compuesto")["entrada"]
    mrz = _interpretar({"fuente": "mrz", "lineas": lineas, "fecha_referencia": "2026-10-06"})
    assert set(pdf417["campos"]) == {
        "numeroDocumento",
        "primerApellido",
        "segundoApellido",
        "primerNombre",
        "segundoNombre",
        "sexo",
        "fechaNacimiento",
        "rh",
        "codigoDepartamentoNacimiento",
        "codigoMunicipioNacimiento",
    }
    assert set(mrz["campos"]) == {
        "nuip",
        "apellidos",
        "nombres",
        "sexo",
        "fechaNacimiento",
        "fechaVencimiento",
    }


def test_MS01_error_interno_del_interprete() -> None:
    """Sin parsers cargables: `error-interno`, código distinto de 0 y salida de errores vacía."""
    import os

    entorno = {**os.environ, "RUTA_PARSERS": "/srv/no-existe/index.js"}
    proceso = subprocess.run(  # noqa: S603 - argumentos fijos, sin shell
        [NODE, SCRIPT_INTERPRETE],
        input=b'{"fuente": "mrz"}',
        capture_output=True,
        timeout=30,
        check=False,
        env=entorno,
    )
    assert proceso.returncode != 0
    assert json.loads(proceso.stdout) == {"ok": False, "motivo": "error-interno"}
    assert proceso.stderr == b""


def test_MS01_entrada_no_valida() -> None:
    """`no es json` y `{"fuente": "otra"}` dan su motivo con código 0."""
    assert _ejecutar(b"no es json") == (0, {"ok": False, "motivo": "entrada-no-valida"})
    assert _ejecutar(b'{"fuente": "otra"}') == (0, {"ok": False, "motivo": "fuente-desconocida"})


_JSON = st.recursive(
    st.none() | st.booleans() | st.integers() | st.text(max_size=40),
    lambda hijos: st.lists(hijos, max_size=4) | st.dictionaries(st.text(max_size=10), hijos, max_size=4),
    max_leaves=12,
)
_PETICIONES = st.one_of(
    _JSON,
    st.fixed_dictionaries({"fuente": st.just("pdf417"), "datos_b64": _JSON}),
    st.fixed_dictionaries({"fuente": st.just("mrz"), "lineas": _JSON, "fecha_referencia": _JSON}),
    st.fixed_dictionaries(
        {
            "fuente": st.just("pdf417"),
            "datos_b64": st.binary(max_size=600).map(lambda b: base64.b64encode(b).decode()),
        }
    ),
)


@settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
@given(_PETICIONES)
def test_MS01_propiedad_entradas_arbitrarias_no_rompen_el_interprete(peticion: Any) -> None:
    """Toda entrada JSON termina con código 0 y un objeto con la clave `ok`."""
    codigo, salida = _ejecutar(json.dumps(peticion).encode())
    assert codigo == 0
    assert isinstance(salida, dict)
    assert isinstance(salida["ok"], bool)


# --- MS-07: aislamiento del proceso -------------------------------------------------------------------


class _ProcesoFalso:
    def __init__(self, salida: bytes = b"{}", codigo: int = 0, espera_s: float = 0.0) -> None:
        self.salida = salida
        self.returncode: int | None = None
        self._codigo = codigo
        self._espera_s = espera_s
        self.entrada: bytes | None = None
        self.matado = False

    async def communicate(self, entrada: bytes) -> tuple[bytes, None]:
        self.entrada = entrada
        await asyncio.sleep(self._espera_s)
        self.returncode = self._codigo
        return self.salida, None

    def kill(self) -> None:
        self.matado = True

    async def wait(self) -> int:
        return -9


class _LanzadorEspia:
    def __init__(self, proceso: _ProcesoFalso) -> None:
        self.proceso = proceso
        self.llamadas: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    async def __call__(self, *args: Any, **kwargs: Any) -> _ProcesoFalso:
        self.llamadas.append((args, kwargs))
        return self.proceso


def test_MS07_datos_solo_por_la_entrada_estandar() -> None:
    """Argumentos fijos `[node, script]`, entrada por tubería, salida de errores descartada y ningún
    argumento con el número del documento."""
    payload = bytes.fromhex(fixture("pdf417-amarilla/apellido-compuesto")["entrada"])
    lanzador = _LanzadorEspia(_ProcesoFalso(b'{"ok": false, "motivo": "x"}'))
    peticion = {"fuente": "pdf417", "datos_b64": base64.b64encode(payload).decode()}
    asyncio.run(InterpreteNode(lanzar=lanzador).interpretar(peticion))

    assert len(lanzador.llamadas) == 1
    args, kwargs = lanzador.llamadas[0]
    assert args == ("/usr/local/bin/node", "/srv/interprete/interpretar.mjs")
    assert kwargs["stdin"] == subprocess.PIPE
    assert kwargs["stdout"] == subprocess.PIPE
    assert kwargs["stderr"] == subprocess.DEVNULL
    assert all("9999123456" not in str(a) for a in args)
    assert json.loads(lanzador.proceso.entrada or b"") == peticion


# --- MS-08: fallo del intérprete ----------------------------------------------------------------------


@pytest.mark.parametrize(
    "proceso",
    [
        _ProcesoFalso(b'{"ok": true}', codigo=1),
        _ProcesoFalso(b"[]"),
        _ProcesoFalso(b"no es json"),
        _ProcesoFalso(b"{}", espera_s=1.0),
    ],
    ids=["codigo-1", "no-objeto", "no-json", "tiempo-limite"],
)
def test_MS08_fallo_del_interprete_lanza_sin_datos(proceso: _ProcesoFalso) -> None:
    interprete = InterpreteNode(lanzar=_LanzadorEspia(proceso), limite_s=0.05)
    with pytest.raises(ErrorInterprete) as error:
        asyncio.run(interprete.interpretar({"fuente": "mrz", "lineas": ["9999123456"]}))
    assert "9999123456" not in str(error.value)
    assert error.value.__cause__ is None or "9999123456" not in str(error.value.__cause__)
    if proceso._espera_s:
        assert proceso.matado
