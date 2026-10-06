"""Modelos de petición, estrictos y con los mismos dominios que el contrato.

Tarea 3.1: modelo mínimo de creación (tipos y forma). Las reglas semánticas (autorización en
`true`, sensibles con comparación facial, fecha en el futuro, escenarios) llegan con la tarea 4.1.
"""

from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool

TipoDocumento = Literal["co_national-id-2000", "co_national-id-2020"]
EscenarioSandbox = Literal[
    "success",
    "failure_image_quality",
    "failure_document_unreadable",
    "review_data_consistency",
    "review_document_liveness",
    "failure_document_expired",
    "review_face_mismatch",
]


class Autorizacion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    datos: StrictBool
    sensibles: StrictBool = False
    version_texto: str = Field(pattern=r"^[A-Za-z0-9._-]{1,64}$")
    otorgada_en: AwareDatetime = Field(strict=False)


class CrearValidacion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    document_type: TipoDocumento
    autorizacion: Autorizacion
    face_match: StrictBool = False
    webhook_url: str | None = Field(default=None, max_length=2048)
    sandbox_scenario: EscenarioSandbox | None = None
