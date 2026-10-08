"""MS-05 y MS-16 a MS-19: lector Node de packages/capture en el contenedor (cambio motor-real-servidor).

Las pruebas de integración lanzan el lector real (`/usr/local/bin/node /srv/lector/leer.mjs`) con las imágenes
sintéticas generadas en memoria; ninguna imagen se escribe a disco.
"""

import asyncio
import base64
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from app.motor import Imagenes
from app.motor_real import (
    LIMITE_LECTOR_S,
    ErrorLector,
    LectorNode,
    Lectura,
    MotorReal,
)
from tests.fixtures_motor import fixture
from tests.imagenes_sinteticas import IMG_PNG
from tests.utilidades import RelojFalso

NODE = "/usr/local/bin/node"
SHA_MRZ = "e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd"
GENERADOR = str(Path(__file__).with_name("png_pdf417_sintetico.mjs"))


def _png_pdf417(ruta_fixture: str) -> bytes:
    proceso = subprocess.run(  # noqa: S603 - argumentos fijos, sin shell
        [NODE, GENERADOR],
        input=fixture(ruta_fixture)["entrada"].encode(),
        capture_output=True,
        timeout=60,
        check=True,
    )
    return proceso.stdout


def _leer(tipo: str, imagenes: Imagenes, lector: LectorNode | None = None) -> Lectura:
    return asyncio.run((lector or LectorNode(RelojFalso())).leer(tipo, imagenes))


# --- MS-05 ------------------------------------------------------------------------------------------


def test_MS05_modelo_empaquetado_y_verificado() -> None:
    datos = Path("/srv/modelos/tesseract/mrz.traineddata").read_bytes()
    assert hashlib.sha256(datos).hexdigest() == SHA_MRZ


# --- MS-16 ------------------------------------------------------------------------------------------


def test_MS16_pdf417_sintetico_leido_en_el_contenedor() -> None:
    back = _png_pdf417("pdf417-amarilla/apellido-compuesto")
    lectura = _leer("co_national-id-2000", Imagenes(front=IMG_PNG, back=back))
    assert lectura.pdf417 == bytes.fromhex(fixture("pdf417-amarilla/apellido-compuesto")["entrada"])
    assert lectura.mrz is None


def test_MS16_pdf417_en_el_anverso_tambien_se_lee() -> None:
    front = _png_pdf417("pdf417-amarilla/apellido-compuesto")
    lectura = _leer("co_national-id-2000", Imagenes(front=front, back=IMG_PNG))
    assert lectura.pdf417 == bytes.fromhex(fixture("pdf417-amarilla/apellido-compuesto")["entrada"])


@pytest.mark.parametrize("tipo", ["co_national-id-2000", "co_national-id-2020"])
def test_MS16_imagen_sin_documento(tipo: str) -> None:
    lectura = _leer(tipo, Imagenes(front=IMG_PNG, back=IMG_PNG))
    assert lectura == Lectura()
    motor = MotorReal(LectorNode(RelojFalso()), _InterpreteNoUsado(), RelojFalso())
    resultado = asyncio.run(motor.procesar(tipo, False, Imagenes(front=IMG_PNG, back=IMG_PNG), None))
    assert resultado.declined_reason == "document_unreadable"


class _InterpreteNoUsado:
    async def interpretar(self, peticion: dict[str, Any]) -> dict[str, Any]:
        raise AssertionError("el intérprete no debe llamarse sin lectura")


# --- MS-17 ------------------------------------------------------------------------------------------


class _Proceso:
    def __init__(
        self,
        salida: bytes = b'{"ok": false, "motivo": "no-encontrado"}',
        codigo: int = 0,
        espera_s: float = 0.0,
    ):
        self.salida, self._codigo, self._espera_s = salida, codigo, espera_s
        self.returncode: int | None = None
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


class _Lanzador:
    def __init__(self, proceso: _Proceso) -> None:
        self.proceso = proceso
        self.llamadas: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    async def __call__(self, *args: Any, **kwargs: Any) -> _Proceso:
        self.llamadas.append((args, kwargs))
        return self.proceso


def test_MS17_imagenes_solo_por_la_entrada_estandar() -> None:
    lanzador = _Lanzador(_Proceso())
    imagenes = Imagenes(front=b"\x89PNG-anverso", back=b"\x89PNG-reverso")
    _leer("co_national-id-2020", imagenes, LectorNode(RelojFalso(), lanzar=lanzador))
    args, kwargs = lanzador.llamadas[0]
    assert args == ("/usr/local/bin/node", "/srv/lector/leer.mjs")
    assert (kwargs["stdin"], kwargs["stdout"], kwargs["stderr"]) == (
        subprocess.PIPE,
        subprocess.PIPE,
        subprocess.DEVNULL,
    )
    entrada = json.loads(lanzador.proceso.entrada or b"")
    assert set(entrada) == {"tipo", "fecha_referencia", "imagenes_b64"}
    assert entrada["tipo"] == "co_national-id-2020"
    assert entrada["fecha_referencia"] == "2026-10-06"
    assert entrada["imagenes_b64"] == [
        base64.b64encode(b"\x89PNG-reverso").decode(),
        base64.b64encode(b"\x89PNG-anverso").decode(),
    ]


def test_MS17_respuestas_validas() -> None:
    lineas = [
        "ICCOL999900123816001<<<<<<<<<<",
        "9007150F3407150COL9999123456<5",
        "DE<LA<OSSA<FICTICIO<<ANA<<<<<<",
    ]
    casos = [
        (b'{"ok": true, "pdf417_b64": "AQID"}', Lectura(pdf417=b"\x01\x02\x03")),
        (json.dumps({"ok": True, "mrz": lineas}).encode(), Lectura(mrz=(lineas[0], lineas[1], lineas[2]))),
        (b'{"ok": false, "motivo": "no-encontrado"}', Lectura()),
    ]
    for salida, esperada in casos:
        lector = LectorNode(RelojFalso(), lanzar=_Lanzador(_Proceso(salida)))
        assert _leer("co_national-id-2020", Imagenes(front=b"a", back=b"b"), lector) == esperada


@pytest.mark.parametrize(
    "proceso",
    [
        _Proceso(b'{"ok": true}', codigo=1),
        _Proceso(b"[]"),
        _Proceso(b'{"ok": false, "motivo": "modelo-no-disponible"}'),
        _Proceso(b'{"ok": false, "motivo": "error-interno"}'),
        _Proceso(b'{"ok": true, "mrz": ["a", "b"]}'),
        _Proceso(b'{"ok": true, "pdf417_b64": 3}'),
        _Proceso(b"{}", espera_s=1.0),
    ],
    ids=["codigo-1", "no-objeto", "sin-modelo", "error-interno", "mrz-2-lineas", "pdf417-no-texto", "tiempo"],
)
def test_MS17_fallo_del_lector(proceso: _Proceso) -> None:
    lector = LectorNode(RelojFalso(), lanzar=_Lanzador(proceso), limite_s=0.05)
    with pytest.raises(ErrorLector) as error:
        _leer("co_national-id-2000", Imagenes(front=b"9999123456", back=b"b"), lector)
    assert "9999123456" not in str(error.value)
    if proceso._espera_s:
        assert proceso.matado


def test_MS17_entrada_no_valida_del_lector() -> None:
    proceso = subprocess.run(  # noqa: S603 - argumentos fijos, sin shell
        [NODE, "/srv/lector/leer.mjs"], input=b"no es json", capture_output=True, timeout=60, check=False
    )
    assert proceso.returncode == 0
    assert json.loads(proceso.stdout) == {"ok": False, "motivo": "entrada-no-valida"}
    assert proceso.stderr == b""


# --- MS-18 y MS-19 ----------------------------------------------------------------------------------


def test_MS18_presupuesto_configurado() -> None:
    assert Path("/srv/lector/leer.mjs").read_text(encoding="utf-8").count("20_000") == 1
    assert LIMITE_LECTOR_S == 25


def test_MS19_lector_activado_por_entorno() -> None:
    from app.main import crear_app
    from tests.utilidades import config_de_prueba

    con = crear_app(config_de_prueba(lector_live="node"))
    sin = crear_app(config_de_prueba())
    assert isinstance(con.state.puertos.motor_live, MotorReal)
    assert isinstance(con.state.puertos.motor_live.lector, LectorNode)
    assert sin.state.puertos.motor_live is None


def test_MS19_config_lee_la_variable() -> None:
    from app.config import Config

    assert Config.desde_entorno({"LECTOR_LIVE": "node"}).lector_live == "node"
    assert Config.desde_entorno({}).lector_live is None
    with pytest.raises(ValueError, match="LECTOR_LIVE"):
        Config.desde_entorno({"LECTOR_LIVE": "otro"})


def test_MS19_compose_activa_el_lector() -> None:
    import yaml

    from tests.utilidades import RAIZ_SERVIDOR

    servicios = yaml.safe_load((RAIZ_SERVIDOR / "compose.yaml").read_text(encoding="utf-8"))["services"]
    assert servicios["api"]["environment"]["LECTOR_LIVE"] == "node"
    assert servicios["api-pruebas"]["environment"]["LECTOR_LIVE"] == "node"
