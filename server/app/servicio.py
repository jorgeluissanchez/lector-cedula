"""Ciclo de vida de las validaciones (AV-03, AV-14, AV-17).

Única transición válida: de `pending` a un estado terminal (`success`, `failure`, `review`), que no
vuelve a cambiar. El vencimiento del token de subida se aplica con el `Planificador` y, de forma
perezosa, en cada lectura, para que el resultado no dependa de si la tarea programada ya corrió.
"""

import logging
from datetime import datetime
from typing import Any

from app.almacen import Almacen, Validacion
from app.config import Config
from app.modelos import CrearValidacion
from app.motor import Resultado
from app.puertos import Puertos
from app.representacion import fecha_hora_utc, instante

VIGENCIA_SUBIDA_S = 900
CATEGORIAS = ("image_quality", "data_validation", "data_consistency", "document_liveness")
ESTADOS_TERMINALES = frozenset({"success", "failure", "review"})

log = logging.getLogger("lector.validaciones")


def checks_no_realizados(face_match: bool) -> list[dict[str, Any]]:
    categorias = CATEGORIAS + (("face_match",) if face_match else ())
    return [{"category": c, "status": "not_performed", "reasons": []} for c in categorias]


class ServicioValidaciones:
    def __init__(self, almacen: Almacen, puertos: Puertos, config: Config) -> None:
        self.almacen = almacen
        self.puertos = puertos
        self.config = config

    def crear(
        self, cuerpo: CrearValidacion, propietario: str, sandbox: bool, otorgada_en: datetime
    ) -> Validacion:
        ahora = self.puertos.reloj.ahora()
        validacion = Validacion(
            id=self.puertos.generador_ids.id_validacion(),
            propietario=propietario,
            sandbox=sandbox,
            document_type=cuerpo.document_type,
            face_match=cuerpo.face_match,
            autorizacion={
                "datos": cuerpo.autorizacion.datos,
                "sensibles": cuerpo.autorizacion.sensibles,
                "version_texto": cuerpo.autorizacion.version_texto,
                "otorgada_en": fecha_hora_utc(otorgada_en),
                "registrada_en": instante(ahora),
            },
            creada_en=ahora,
            subida_vence_en=int(ahora) + VIGENCIA_SUBIDA_S,
            escenario=cuerpo.sandbox_scenario if sandbox else None,
            webhook_url=cuerpo.webhook_url,
        )
        self.almacen.guardar(validacion)
        planificador = self.puertos.planificador
        assert planificador is not None  # noqa: S101 - Puertos.__post_init__ lo garantiza
        planificador.programar(validacion.subida_vence_en + 1, lambda: self._vencer_subida(validacion.id))
        return validacion

    def obtener(self, id_validacion: str, propietario: str | None) -> Validacion | None:
        """La validación del propietario (`None`: sin comprobar propietario, solo para el token
        firmado), con el vencimiento del token ya aplicado."""
        if propietario is None:
            validacion = self.almacen.obtener_sin_propietario(id_validacion)
        else:
            validacion = self.almacen.obtener(id_validacion, propietario)
        if validacion is not None:
            self._aplicar_vencimiento(validacion)
        return validacion

    def _vencer_subida(self, id_validacion: str) -> None:
        validacion = self.almacen.obtener_sin_propietario(id_validacion)
        if validacion is not None:
            self._aplicar_vencimiento(validacion)

    def _aplicar_vencimiento(self, validacion: Validacion) -> None:
        """Una validación `pending` cuyo token venció pasa a `failure` con `upload_expired`, con el
        instante del vencimiento (no el de la lectura) como `completed_at`."""
        if (
            validacion.status == "pending"
            and not validacion.procesando
            and self.puertos.reloj.ahora() > validacion.subida_vence_en
        ):
            self._terminar(
                validacion,
                Resultado(
                    status="failure",
                    declined_reason="upload_expired",
                    checks=checks_no_realizados(validacion.face_match),
                    document=None,
                ),
                validacion.subida_vence_en,
            )

    def completar(self, validacion: Validacion, resultado: Resultado) -> None:
        self._terminar(validacion, resultado, self.puertos.reloj.ahora())

    def fallar_procesamiento(self, validacion: Validacion) -> None:
        """Error interno del motor: `failure` con `processing_error` y todos los checks sin hacer."""
        resultado = Resultado(
            status="failure",
            declined_reason="processing_error",
            checks=checks_no_realizados(validacion.face_match),
            document=None,
        )
        self._terminar(validacion, resultado, self.puertos.reloj.ahora())

    def _terminar(self, validacion: Validacion, resultado: Resultado, momento: float) -> None:
        if validacion.status in ESTADOS_TERMINALES:
            return
        if resultado.status not in ESTADOS_TERMINALES:
            raise ValueError("el motor devolvió un estado no terminal")
        validacion.status = resultado.status
        validacion.declined_reason = resultado.declined_reason
        validacion.checks = [
            {"category": c["category"], "status": c["status"], "reasons": list(c["reasons"])}
            for c in resultado.checks
        ]
        validacion.document = resultado.document
        validacion.completada_en = momento
        validacion.actualizada_en = momento
        log.info(
            "validacion_terminada",
            extra={"campos": {"validation_id": validacion.id, "sandbox": validacion.sandbox}},
        )
        if self.puertos.notificador is not None:
            self.puertos.notificador(validacion)
