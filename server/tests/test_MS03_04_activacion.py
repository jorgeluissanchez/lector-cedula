"""MS-03 y MS-04: activación del motor real en modo live y privacidad (cambio motor-real-servidor)."""

import base64
import json
from typing import Any

import pytest

from app.motor_real import InterpreteNode, MotorReal
from tests.fixtures_motor import DOCUMENTO_AMARILLA, LectorFalso, lectura_de
from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import AUTH_KL, crear, crear_cliente_con, puertos_de_prueba, ruta_de_subida, subir

PDF417 = "pdf417-amarilla/apellido-compuesto"


def _flujo_live(puertos: Any) -> tuple[Any, Any, Any]:
    cliente = crear_cliente_con(puertos)
    creada = crear(cliente, AUTH_KL)
    assert creada.status_code == 201
    validacion = creada.json()
    subida = subir(
        cliente,
        ruta_de_subida(validacion),
        {"front": (IMG_PNG, "image/png"), "back": (IMG_JPEG, "image/jpeg")},
    )
    consulta = cliente.get(f"/v1/validations/{validacion['id']}", headers=AUTH_KL)
    return cliente, subida, consulta


def test_MS03_flujo_live_completo_con_lector() -> None:
    _, subida, consulta = _flujo_live(puertos_de_prueba(lector=LectorFalso(lectura_de(PDF417))))
    assert subida.status_code == 200
    cuerpo = consulta.json()
    assert cuerpo["status"] == "success"
    assert cuerpo["sandbox"] is False
    assert cuerpo["document"] == DOCUMENTO_AMARILLA


def test_MS03_sin_lector() -> None:
    _, subida, _ = _flujo_live(puertos_de_prueba())
    assert subida.status_code == 503
    assert subida.json()["code"] == "engine-unavailable"


def test_MS03_el_sandbox_no_cambia() -> None:
    lector = LectorFalso()
    cliente = crear_cliente_con(puertos_de_prueba(lector=lector))
    validacion = crear(cliente).json()
    subida = subir(
        cliente, ruta_de_subida(validacion), {"front": (IMG_PNG, "image/png"), "back": (IMG_PNG, "image/png")}
    )
    assert subida.status_code == 200
    assert subida.json()["status"] == "success"
    assert subida.json()["document"]["document_number"] == "9999123456"
    assert subida.json()["document"]["first_surname"] == "PEÑA"
    assert lector.llamadas == 0


def test_MS03_motor_live_es_motor_real_con_el_lector() -> None:
    lector = LectorFalso()
    puertos = puertos_de_prueba(lector=lector)
    assert isinstance(puertos.motor_live, MotorReal)
    assert puertos.motor_live.lector is lector
    assert isinstance(puertos.motor_live.interprete, InterpreteNode)


# --- MS-04: privacidad ------------------------------------------------------------------------------


class _InterpreteEspiaReal:
    """Delega en el intérprete real y guarda cada petición."""

    def __init__(self) -> None:
        self.peticiones: list[dict[str, Any]] = []
        self._real = InterpreteNode()

    async def interpretar(self, peticion: dict[str, Any]) -> dict[str, Any]:
        self.peticiones.append(peticion)
        return await self._real.interpretar(peticion)


def test_MS04_solo_el_payload_llega_al_interprete() -> None:
    espia = _InterpreteEspiaReal()
    puertos = puertos_de_prueba(lector=LectorFalso(lectura_de(PDF417)))
    puertos.motor_live.interprete = espia
    _, subida, _ = _flujo_live(puertos)
    assert subida.status_code == 200
    assert len(espia.peticiones) == 1
    peticion = espia.peticiones[0]
    assert set(peticion) == {"fuente", "datos_b64"}
    texto = json.dumps(peticion)
    for imagen in (IMG_PNG, IMG_JPEG):
        assert base64.b64encode(imagen[:48]).decode() not in texto


def test_MS04_logs_del_flujo_live_sin_datos_personales(capsys: pytest.CaptureFixture[str]) -> None:
    capsys.readouterr()
    _flujo_live(puertos_de_prueba(lector=LectorFalso(lectura_de(PDF417))))
    salida = capsys.readouterr()
    texto = salida.out + salida.err
    assert texto.strip() != ""
    for prohibido in ("9999123456", "DE LA OSSA", "FICTICIA", "1985-03-14", "O+"):
        assert prohibido not in texto


def _recorrer(valor: Any, visitados: set[int] | None = None) -> list[Any]:
    visitados = visitados if visitados is not None else set()
    if id(valor) in visitados:
        return []
    visitados.add(id(valor))
    encontrados: list[Any] = [valor]
    if isinstance(valor, dict):
        for clave, hijo in valor.items():
            encontrados += _recorrer(clave, visitados) + _recorrer(hijo, visitados)
    elif isinstance(valor, (list, tuple, set, frozenset)):
        for hijo in valor:
            encontrados += _recorrer(hijo, visitados)
    elif hasattr(valor, "__dict__") and not isinstance(valor, type):
        encontrados += _recorrer(vars(valor), visitados)
    elif hasattr(valor, "__slots__"):
        for nombre in valor.__slots__:
            if hasattr(valor, nombre):
                encontrados += _recorrer(getattr(valor, nombre), visitados)
    return encontrados


def test_MS04_almacen_sin_bytes_ni_crudos() -> None:
    cliente, _, consulta = _flujo_live(puertos_de_prueba(lector=LectorFalso(lectura_de(PDF417))))
    servicio = cliente.app.state.servicio  # type: ignore[attr-defined]
    almacenada = servicio.obtener(consulta.json()["id"], propietario=None)
    valores = _recorrer(almacenada)
    assert not [v for v in valores if isinstance(v, (bytes, bytearray, memoryview))]
    assert not {"campos", "validaciones", "datos_b64"} & {v for v in valores if isinstance(v, str)}


# --- MS-08 por HTTP y MS-05 ---------------------------------------------------------------------------


class _InterpreteQueFalla:
    async def interpretar(self, peticion: dict[str, Any]) -> dict[str, Any]:
        from app.motor_real import ErrorInterprete

        raise ErrorInterprete


def test_MS08_fallo_del_interprete_por_http(capsys: pytest.CaptureFixture[str]) -> None:
    """La subida responde 500 `internal-error`, el `GET` muestra `failure` `processing_error` y ningún
    log contiene el número."""
    puertos = puertos_de_prueba(lector=LectorFalso(lectura_de(PDF417)))
    puertos.motor_live.interprete = _InterpreteQueFalla()
    capsys.readouterr()
    _, subida, consulta = _flujo_live(puertos)
    assert subida.status_code == 500
    assert subida.json()["code"] == "internal-error"
    assert (consulta.json()["status"], consulta.json()["declined_reason"]) == ("failure", "processing_error")
    salida = capsys.readouterr()
    assert "9999123456" not in salida.out + salida.err


def test_MS05_sin_dependencias_no_aprobadas() -> None:
    from tests.utilidades import RAIZ_SERVIDOR

    for nombre in ("pyproject.toml", "uv.lock"):
        texto = (RAIZ_SERVIDOR / nombre).read_text(encoding="utf-8").lower()
        assert "zxing" not in texto
        assert "rapidocr" not in texto
