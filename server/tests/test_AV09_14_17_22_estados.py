"""Estados y transiciones (tarea 5.4): AV-09, AV-14, AV-17, AV-22 y "Error interno sin traza" de
AV-29. El tiempo lo controla el test con el reloj y el planificador falsos; nunca hay esperas."""

from typing import Any

import pytest
from hypothesis import settings
from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, initialize, invariant, rule, run_state_machine_as_test

from app.motor import Imagenes, Resultado
from tests.imagenes_sinteticas import IMG_JPEG, IMG_PNG
from tests.utilidades import (
    AUT,
    AUTH_KL,
    AUTH_KT,
    BASE_PROBLEMAS,
    NotificadorEspia,
    crear,
    crear_cliente_con,
    puertos_de_prueba,
    reloj_de,
    ruta_de_subida,
    subir,
)

FRONT_BACK = {"front": (IMG_JPEG, "image/jpeg"), "back": (IMG_PNG, "image/png")}
VENCE = 1_791_300_900  # 2026-10-06T15:35:00Z


def _problema(respuesta: Any, estado: int, slug: str) -> dict[str, Any]:
    assert respuesta.status_code == estado, respuesta.text
    assert respuesta.headers["content-type"] == "application/problem+json"
    cuerpo = respuesta.json()
    assert cuerpo["type"] == BASE_PROBLEMAS + slug
    return cuerpo


def _consultar(cliente: Any, id_validacion: str, cabeceras: dict[str, str] | None = None) -> Any:
    return cliente.get(f"/v1/validations/{id_validacion}", headers=cabeceras or AUTH_KT)


def test_AV09_segunda_subida() -> None:
    """Segunda subida: con la validación en `success`, otra subida con `KT` da 409
    `validation-not-pending` y `GET` devuelve el mismo cuerpo, byte a byte, que antes."""
    cliente = crear_cliente_con()
    creada = crear(cliente).json()
    assert subir(cliente, ruta_de_subida(creada), FRONT_BACK).json()["status"] == "success"
    antes = _consultar(cliente, creada["id"]).content
    ruta = f"/v1/validations/{creada['id']}/images"
    _problema(subir(cliente, ruta, FRONT_BACK, AUTH_KT), 409, "validation-not-pending")
    assert _consultar(cliente, creada["id"]).content == antes


def test_AV14_vencimiento_sin_subida() -> None:
    """Vencimiento sin subida (lectura perezosa): a las 15:35:01Z, `GET` da `failure`,
    `upload_expired`, `document` nulo, `completed_at` 15:35:00Z y los cuatro checks `not_performed`."""
    notificador = NotificadorEspia()
    cliente = crear_cliente_con(puertos_de_prueba(notificador=notificador))
    creada = crear(cliente).json()
    reloj_de(cliente).fijar(VENCE + 1)
    cuerpo = _consultar(cliente, creada["id"]).json()
    assert cuerpo["status"] == "failure"
    assert cuerpo["declined_reason"] == "upload_expired"
    assert cuerpo["document"] is None
    assert cuerpo["completed_at"] == "2026-10-06T15:35:00Z"
    assert cuerpo["updated_at"] == "2026-10-06T15:35:00Z"
    assert cuerpo["upload"] is None
    assert cuerpo["checks"] == [
        {"category": c, "status": "not_performed", "reasons": []}
        for c in ("image_quality", "data_validation", "data_consistency", "document_liveness")
    ]
    assert notificador.notificadas == [creada["id"]]


def test_AV14_vencimiento_por_el_planificador() -> None:
    """El planificador vence el token sin que nadie consulte: tras ejecutar las tareas hasta las
    15:35:01Z, la validación almacenada ya está en `failure` con `upload_expired`; antes, no."""
    notificador = NotificadorEspia()
    puertos = puertos_de_prueba(notificador=notificador)
    cliente = crear_cliente_con(puertos)
    creada = crear(cliente, face_match=True, autorizacion={**AUT, "sensibles": True}).json()
    almacenada = cliente.app.state.almacen.obtener_sin_propietario(creada["id"])  # type: ignore[attr-defined]
    reloj_de(cliente).fijar(VENCE)
    assert puertos.planificador.ejecutar_hasta(VENCE) == 0
    assert almacenada.status == "pending"
    reloj_de(cliente).fijar(VENCE + 1)
    assert puertos.planificador.ejecutar_hasta(VENCE + 1) == 1
    assert (almacenada.status, almacenada.declined_reason, almacenada.completada_en) == (
        "failure",
        "upload_expired",
        VENCE,
    )
    assert [c["category"] for c in almacenada.checks][-1] == "face_match"
    assert notificador.notificadas == [creada["id"]]


def test_AV14_el_estado_terminal_no_cambia() -> None:
    """El estado terminal no cambia: en `failure`, una nueva subida da 409 y, tras avanzar 3600 s,
    `GET` devuelve el mismo `status`, `declined_reason` y `updated_at`."""
    cliente = crear_cliente_con()
    vencida = crear(cliente).json()
    rechazada = crear(cliente, sandbox_scenario="failure_image_quality").json()
    subir(cliente, ruta_de_subida(rechazada), FRONT_BACK)
    reloj_de(cliente).fijar(VENCE + 1)
    for validacion in (vencida, rechazada):
        antes = _consultar(cliente, validacion["id"]).json()
        assert antes["status"] == "failure"
        ruta = f"/v1/validations/{validacion['id']}/images"
        _problema(subir(cliente, ruta, FRONT_BACK, AUTH_KT), 409, "validation-not-pending")
        reloj_de(cliente).avanzar(3600)
        despues = _consultar(cliente, validacion["id"]).json()
        claves = ("status", "declined_reason", "updated_at")
        assert {k: despues[k] for k in claves} == {k: antes[k] for k in claves}


def test_AV22_subida_live_sin_motor() -> None:
    """Subida live sin motor: con `KL`, `front` y `back` válidos dan 503 `engine-unavailable`, `GET`
    devuelve `pending` y no se encola ningún webhook."""
    notificador = NotificadorEspia()
    cliente = crear_cliente_con(puertos_de_prueba(notificador=notificador))
    creada = crear(cliente, AUTH_KL)
    assert creada.status_code == 201
    assert creada.json()["sandbox"] is False
    _problema(subir(cliente, ruta_de_subida(creada.json()), FRONT_BACK), 503, "engine-unavailable")
    assert _consultar(cliente, creada.json()["id"], AUTH_KL).json()["status"] == "pending"
    assert notificador.notificadas == []


class _MotorQueFalla:
    async def procesar(
        self, tipo: str, face_match: bool, imagenes: Imagenes, escenario: str | None
    ) -> Resultado:
        raise RuntimeError("9999123456 traza interna")


def test_AV29_error_interno_sin_traza(capsys: pytest.CaptureFixture[str]) -> None:
    """Error interno sin traza: si el motor de sandbox lanza una excepción con `"9999123456 traza
    interna"`, la respuesta es 500 `internal-error` sin `9999123456` ni `traza`, y la validación pasa a
    `failure` con `processing_error`. Ninguna línea de log contiene `9999123456` (AV-32)."""
    notificador = NotificadorEspia()
    cliente = crear_cliente_con(puertos_de_prueba(motor_sandbox=_MotorQueFalla(), notificador=notificador))
    creada = crear(cliente).json()
    capsys.readouterr()
    respuesta = subir(cliente, ruta_de_subida(creada), FRONT_BACK)
    salida = capsys.readouterr()
    cuerpo = _problema(respuesta, 500, "internal-error")
    assert "errors" not in cuerpo
    assert b"9999123456" not in respuesta.content
    assert b"traza" not in respuesta.content
    assert "9999123456" not in salida.out + salida.err
    consulta = _consultar(cliente, creada["id"]).json()
    assert (consulta["status"], consulta["declined_reason"]) == ("failure", "processing_error")
    assert all(c["status"] == "not_performed" for c in consulta["checks"])
    assert notificador.notificadas == [creada["id"]]


# --- AV-17: máquina de estados ----------------------------------------------------------------------

ESCENARIOS = [
    "success",
    "failure_image_quality",
    "failure_document_unreadable",
    "review_data_consistency",
    "review_document_liveness",
    "failure_document_expired",
    "review_face_mismatch",
]
ALCANZADOS: set[str] = set()


def comprobar_reglas(cuerpo: dict[str, Any]) -> None:
    """Reglas de AV-17, AV-15 y AV-16 sobre una respuesta 200 o 201."""
    estado, checks, motivo = cuerpo["status"], cuerpo["checks"], cuerpo["declined_reason"]
    estados_checks = [c["status"] for c in checks]
    if estado == "pending":
        assert checks == [] and cuerpo["document"] is None and cuerpo["expires_at"] is None
    elif estado == "success":
        assert not {"failed", "warning"} & set(estados_checks)
    elif estado == "failure":
        if motivo in ("upload_expired", "processing_error"):
            assert set(estados_checks) == {"not_performed"}
        else:
            assert "failed" in estados_checks
    else:
        assert estado == "review"
        assert {"failed", "warning"} & set(estados_checks)
    assert (motivo is None) == (estado in ("pending", "success"))
    if estado != "pending":
        categorias = [c["category"] for c in checks]
        esperadas = ["image_quality", "data_validation", "data_consistency", "document_liveness"]
        assert categorias == esperadas + (["face_match"] if cuerpo["face_match"] else [])
        assert cuerpo["upload"] is None and cuerpo["completed_at"] is not None
    for check in checks:
        assert (check["reasons"] == []) == (check["status"] in ("passed", "not_performed"))


class MaquinaValidaciones(RuleBasedStateMachine):
    """Creación, subida, avance de reloj y consulta sobre todos los escenarios de sandbox."""

    @initialize()
    def preparar(self) -> None:
        self.cliente = crear_cliente_con(limite_peticiones_por_minuto=10**9)
        self.reloj = reloj_de(self.cliente)
        # id -> (escenario, último status visto)
        self.validaciones: dict[str, tuple[str, str]] = {}
        self.cuerpos_terminales: dict[str, dict[str, Any]] = {}

    def _observar(self, cuerpo: dict[str, Any]) -> None:
        comprobar_reglas(cuerpo)
        escenario, anterior = self.validaciones[cuerpo["id"]]
        if anterior != "pending":
            # Un estado terminal no cambia (AV-14).
            previo = self.cuerpos_terminales[cuerpo["id"]]
            for clave in ("status", "declined_reason", "checks", "document", "updated_at", "completed_at"):
                assert cuerpo[clave] == previo[clave]
        elif cuerpo["status"] != "pending":
            self.cuerpos_terminales[cuerpo["id"]] = cuerpo
            if cuerpo["declined_reason"] != "upload_expired":
                ALCANZADOS.add(escenario)
        self.validaciones[cuerpo["id"]] = (escenario, cuerpo["status"])

    @rule(escenario=st.sampled_from(ESCENARIOS), digital=st.booleans())
    def crear_validacion(self, escenario: str, digital: bool) -> None:
        campos: dict[str, Any] = {
            "sandbox_scenario": escenario,
            "document_type": "co_national-id-2020"
            if digital or escenario == "failure_document_expired"
            else "co_national-id-2000",
            "autorizacion": {**AUT, "otorgada_en": "2026-10-06T15:19:00Z"},
        }
        if escenario == "review_face_mismatch":
            campos.update(face_match=True, autorizacion={**campos["autorizacion"], "sensibles": True})
        respuesta = crear(self.cliente, **campos)
        assert respuesta.status_code == 201
        self.validaciones[respuesta.json()["id"]] = (escenario, "pending")
        self._observar(respuesta.json())

    @rule(datos=st.data())
    def subir_imagenes(self, datos: st.DataObject) -> None:
        if not self.validaciones:
            return
        id_validacion = datos.draw(st.sampled_from(sorted(self.validaciones)))
        escenario, _ = self.validaciones[id_validacion]
        partes = dict(FRONT_BACK)
        if escenario == "review_face_mismatch":
            partes["selfie"] = (IMG_JPEG, "image/jpeg")
        respuesta = subir(self.cliente, f"/v1/validations/{id_validacion}/images", partes, AUTH_KT)
        estado_actual = self._consultar_estado(id_validacion)
        if respuesta.status_code == 200:
            self._observar(respuesta.json())
        else:
            assert respuesta.status_code == 409
            assert estado_actual != "pending"

    def _consultar_estado(self, id_validacion: str) -> str:
        respuesta = _consultar(self.cliente, id_validacion)
        assert respuesta.status_code == 200
        return respuesta.json()["status"]

    @rule(segundos=st.sampled_from([1, 60, 899, 900, 901, 3600]))
    def avanzar_reloj(self, segundos: int) -> None:
        self.reloj.avanzar(segundos)

    @rule(datos=st.data())
    def consultar(self, datos: st.DataObject) -> None:
        if not self.validaciones:
            return
        id_validacion = datos.draw(st.sampled_from(sorted(self.validaciones)))
        respuesta = _consultar(self.cliente, id_validacion)
        assert respuesta.status_code == 200
        self._observar(respuesta.json())

    @invariant()
    def estados_validos(self) -> None:
        for _, estado in getattr(self, "validaciones", {}).values():
            assert estado in ("pending", "success", "failure", "review")


def test_AV17_propiedad_sobre_secuencias_de_operaciones() -> None:
    """Propiedad sobre secuencias de operaciones: 500 secuencias de creación, subida, avance de reloj
    y consulta; cada respuesta 200 o 201 cumple las reglas de AV-17, AV-15 y AV-16, y se alcanzan los
    7 escenarios de sandbox."""
    ALCANZADOS.clear()
    run_state_machine_as_test(
        MaquinaValidaciones, settings=settings(max_examples=500, stateful_step_count=20)
    )
    assert ALCANZADOS == set(ESCENARIOS)
