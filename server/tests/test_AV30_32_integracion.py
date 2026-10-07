"""Integración y cierre (tarea 9.1): AV-32 "Flujo completo sin datos personales en logs" y "Errores
sin datos personales en logs", y AV-30 "Contenedor de solo lectura" (parte de configuración; la parte
en ejecución es `docker compose -f server/compose.yaml exec api-pruebas find /tmp -type f`).

Dobles controlados por el test; datos sintéticos únicamente.
"""

import json
import re
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.logs import CLAVES_PERMITIDAS
from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.test_AV09_14_17_22_estados import _MotorQueFalla
from tests.utilidades import (
    AUTH_KT,
    KT,
    RAIZ_SERVIDOR,
    SECRETO_WEBHOOK_KT,
    crear,
    crear_cliente_con,
    puertos_de_prueba,
    reloj_de,
    ruta_de_subida,
    subir,
)

URL_WEBHOOK = "https://hooks.example.com/lector"
PROHIBIDOS = ("9999123456", "PEÑA", "DE LA OSSA", "FICTICIA", "1990-02-28", "AB-", "token=", "sk_test_",
              "whsec_", "Authorization", KT, SECRETO_WEBHOOK_KT)  # fmt: skip
FRONT_BACK = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}


def _registros(texto: str) -> list[dict[str, Any]]:
    registros = [json.loads(linea) for linea in texto.splitlines() if linea.strip()]
    for registro in registros:
        assert set(registro) <= set(CLAVES_PERMITIDAS), registro
    return registros


def test_AV32_flujo_completo_sin_datos_personales_en_logs(capsys: pytest.CaptureFixture[str]) -> None:
    """Creación, subida con token, consulta, webhook y supresión en sandbox: cada línea es JSON con
    claves permitidas, `route` es la plantilla y ninguna línea contiene datos del documento, el token,
    la clave, el secreto ni `Authorization`."""
    puertos = puertos_de_prueba()
    cliente = crear_cliente_con(puertos)
    capsys.readouterr()

    creada = crear(cliente, webhook_url=URL_WEBHOOK, sandbox_scenario="review_data_consistency")
    assert creada.status_code == 201, creada.text
    validacion = creada.json()
    token = validacion["upload"]["url"].split("token=")[1]
    assert subir(cliente, ruta_de_subida(validacion), FRONT_BACK).status_code == 200
    consulta = cliente.get(f"/v1/validations/{validacion['id']}", headers=AUTH_KT)
    # El oráculo tiene sentido: la respuesta sí lleva los datos que el log no debe llevar.
    assert "9999123456" in consulta.text and "DE LA OSSA" in consulta.text
    puertos.planificador.ejecutar_hasta(reloj_de(cliente).ahora())
    assert len(puertos.transporte.peticiones) == 1
    assert cliente.delete(f"/v1/validations/{validacion['id']}", headers=AUTH_KT).status_code == 204

    salida = capsys.readouterr()
    texto = salida.out + salida.err
    for prohibido in (*PROHIBIDOS, token):
        assert prohibido not in texto, prohibido
    assert salida.err == ""
    registros = _registros(salida.out)
    eventos = [r["event"] for r in registros]
    assert "validacion_suprimida" in eventos
    assert any("attempt" in r and "outcome" in r and "event_id" in r for r in registros)
    rutas = {r.get("route") for r in registros if r["event"] == "peticion"}
    assert rutas == {"/v1/validations", "/v1/validations/{id}/images", "/v1/validations/{id}"}
    assert not re.search(r"/v1/validations/val_", texto)


def test_AV32_errores_sin_datos_personales_en_logs(capsys: pytest.CaptureFixture[str]) -> None:
    """Escenario "Error interno sin traza" de AV-29: ninguna línea de log contiene `9999123456`."""
    cliente = crear_cliente_con(puertos_de_prueba(motor_sandbox=_MotorQueFalla()))
    creada = crear(cliente).json()
    capsys.readouterr()
    assert subir(cliente, ruta_de_subida(creada), FRONT_BACK).status_code == 500
    salida = capsys.readouterr()
    assert "9999123456" not in salida.out + salida.err
    assert "Traceback" not in salida.out + salida.err
    eventos = [r["event"] for r in _registros(salida.out)]
    assert "error_motor" in eventos


def test_AV30_contenedor_de_solo_lectura_en_la_configuracion() -> None:
    """`api` y `api-pruebas` corren con `read_only: true` y `/tmp` en tmpfs (la parte de ejecución,
    `find /tmp -type f` vacío, se comprueba contra el contenedor)."""
    ruta = Path(RAIZ_SERVIDOR / "compose.yaml")
    servicios = yaml.safe_load(ruta.read_text(encoding="utf-8"))["services"]
    for nombre in ("api", "api-pruebas"):
        assert servicios[nombre]["read_only"] is True, nombre
        assert servicios[nombre]["tmpfs"] == ["/tmp"], nombre  # noqa: S108
        assert servicios[nombre]["build"]["target"] == "produccion", nombre
