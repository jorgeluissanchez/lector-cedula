"""MS-02, MS-06 y MS-09 a MS-14: resultado del motor real (cambio motor-real-servidor).

El motor usa el intérprete Node real salvo donde el escenario pide un intérprete falso. `HOY` = 2026-10-06.
"""

import asyncio
import copy
from typing import Any

import yaml
from hypothesis import given, settings
from hypothesis import strategies as st
from jsonschema import Draft202012Validator, FormatChecker

from app.motor import Imagenes, Resultado
from app.motor_real import InterpreteNode, Lectura, MotorReal
from tests.fixtures_motor import (
    CAMPOS_PDF417_APELLIDO_COMPUESTO,
    DOCUMENTO_AMARILLA,
    DOCUMENTO_AMARILLA_CON_NOMBRES,
    DOCUMENTO_DIGITAL,
    VALIDACIONES_OK,
    InterpreteFalso,
    LectorFalso,
    checks,
    lectura_de,
    np,
)
from tests.utilidades import RUTA_CONTRATO, RelojFalso

IMAGENES = Imagenes(front=b"\x89PNG-front", back=b"\x89PNG-back")
AMARILLA = "co_national-id-2000"
DIGITAL = "co_national-id-2020"
ILEGIBLE = {"status": "failed", "reasons": ["barcode_unreadable"]}


def _procesar(tipo: str, lectura: Lectura, interprete: Any = None, face_match: bool = False) -> Resultado:
    motor = MotorReal(LectorFalso(lectura), interprete or InterpreteNode(), RelojFalso())
    return asyncio.run(motor.procesar(tipo, face_match, IMAGENES, None))


def _como_dict(r: Resultado) -> dict[str, Any]:
    return {
        "status": r.status,
        "declined_reason": r.declined_reason,
        "checks": r.checks,
        "document": r.document,
    }


def test_MS02_cedula_amarilla_legible() -> None:
    r = _procesar(AMARILLA, lectura_de("pdf417-amarilla/apellido-compuesto"))
    assert _como_dict(r) == {
        "status": "success",
        "declined_reason": None,
        "checks": checks({"status": "passed", "reasons": []}),
        "document": DOCUMENTO_AMARILLA_CON_NOMBRES,
    }


def test_MS06_cedula_digital_legible() -> None:
    r = _procesar(DIGITAL, lectura_de("mrz-cedula-digital/apellido-compuesto"))
    assert _como_dict(r) == {
        "status": "success",
        "declined_reason": None,
        "checks": checks({"status": "passed", "reasons": []}),
        "document": DOCUMENTO_DIGITAL,
    }


def test_MS09_nada_legible() -> None:
    """`LECTOR(nada)` en cada tipo, bloque no encontrado y MRZ que no es de cédula."""
    casos = [
        (AMARILLA, Lectura()),
        (DIGITAL, Lectura()),
        (AMARILLA, lectura_de("pdf417-amarilla/error-bloque-no-encontrado")),
        (DIGITAL, lectura_de("mrz-cedula-digital/no-es-cedula")),
        (DIGITAL, lectura_de("mrz-cedula-digital/nacionalidad-ven")),
    ]
    for tipo, lectura in casos:
        assert _como_dict(_procesar(tipo, lectura)) == {
            "status": "failure",
            "declined_reason": "document_unreadable",
            "checks": checks(ILEGIBLE),
            "document": None,
        }


def test_MS09_lectura_del_otro_tipo_es_ilegible() -> None:
    """Una amarilla sin PDF417 pero con MRZ (o al revés) no se interpreta."""
    espia = InterpreteFalso({"ok": True})
    r1 = _procesar(AMARILLA, lectura_de("mrz-cedula-digital/apellido-compuesto"), espia)
    r2 = _procesar(DIGITAL, lectura_de("pdf417-amarilla/apellido-compuesto"), espia)
    assert r1.declined_reason == r2.declined_reason == "document_unreadable"
    assert espia.peticiones == []


def test_MS10_datos_invalidos() -> None:
    casos = [
        (AMARILLA, "pdf417-amarilla/error-nuip-invalido", ["document_number_invalid"]),
        (AMARILLA, "pdf417-amarilla/error-fecha-invalida", ["date_invalid"]),
        (DIGITAL, "mrz-cedula-digital/cd-nacimiento-alterado", ["mrz_check_digit_invalid"]),
        (DIGITAL, "mrz-cedula-digital/nuip-vacio", ["document_number_invalid"]),
    ]
    resultados = [_procesar(tipo, lectura_de(ruta)) for tipo, ruta, _ in casos]
    for r, (_, _, razones) in zip(resultados, casos, strict=True):
        assert r.status == "failure"
        assert r.declined_reason == "data_validation_failed"
        assert r.checks == checks({"status": "failed", "reasons": razones})
    assert [r.document is None for r in resultados] == [True, True, False, True]
    assert resultados[2].document is not None
    assert resultados[2].document["document_number"] == "9999123456"


def test_MS10_orden_y_sin_repetidos_de_las_razones() -> None:
    """MRZ con nuip, fecha y dígito de control inválidos: razones en el orden de la spec."""
    respuesta = {
        "ok": True,
        "valido": False,
        "campos": {
            "nuip": None,
            "apellidos": "FICTICIO",
            "nombres": "ANA",
            "sexo": "F",
            "fechaNacimiento": None,
            "fechaVencimiento": None,
            "codigoLugarMrz": None,
        },
        "digitos_control": {
            "serial": "invalido",
            "nacimiento": "invalido",
            "vencimiento": "valido",
            "compuesto": "valido",
        },
        "errores": ["fecha-vencimiento-invalida", "nuip-invalido", "fecha-nacimiento-invalida"],
        "warnings": [],
    }
    r = _procesar(DIGITAL, Lectura(mrz=("a", "b", "c")), InterpreteFalso(respuesta))
    assert r.declined_reason == "data_validation_failed"
    assert r.checks[1] == {
        "category": "data_validation",
        "status": "failed",
        "reasons": ["document_number_invalid", "date_invalid", "mrz_check_digit_invalid"],
    }
    assert r.document is None


def test_MS10_formato_nuip_fallido_en_pdf417_legible() -> None:
    validaciones = copy.deepcopy(VALIDACIONES_OK)
    validaciones[0]["estado"] = "fallida"
    respuesta = {
        "ok": True,
        "campos": CAMPOS_PDF417_APELLIDO_COMPUESTO,
        "validaciones": validaciones,
        "warnings": [],
    }
    r = _procesar(AMARILLA, Lectura(pdf417=b"x"), InterpreteFalso(respuesta))
    assert (r.status, r.declined_reason) == ("failure", "data_validation_failed")
    assert r.checks[1]["reasons"] == ["document_number_invalid"]
    assert r.document == DOCUMENTO_AMARILLA


def test_MS09_mrz_valida_sin_documento_posible_es_ilegible() -> None:
    """Sexo `X` (fuera del contrato) sin causa de MS-10: `document_unreadable`."""
    lectura = lectura_de("mrz-cedula-digital/apellido-compuesto")
    interprete = InterpreteNode()

    class _ConSexoX:
        async def interpretar(self, peticion: dict[str, Any]) -> dict[str, Any]:
            respuesta = await interprete.interpretar(peticion)
            respuesta["campos"]["sexo"] = "X"
            return respuesta

    assert _como_dict(_procesar(DIGITAL, lectura, _ConSexoX())) == {
        "status": "failure",
        "declined_reason": "document_unreadable",
        "checks": checks(ILEGIBLE),
        "document": None,
    }


def test_MS11_cedula_digital_vencida() -> None:
    r = _procesar(DIGITAL, lectura_de("mrz-cedula-digital/vencimiento-2020"))
    assert (r.status, r.declined_reason) == ("failure", "document_expired")
    assert r.checks == checks({"status": "failed", "reasons": ["document_expired"]})
    assert r.document is not None
    assert r.document["date_of_expiry"] == "2020-01-01"


def test_MS11_vence_hoy_no_esta_vencida() -> None:
    """El borde: vencimiento igual a `HOY` sigue vigente; el día anterior ya venció."""
    base = {
        "ok": True,
        "valido": True,
        "campos": {
            "nuip": "9999123456",
            "apellidos": "FICTICIO",
            "nombres": "ANA",
            "sexo": "F",
            "fechaNacimiento": "1990-07-15",
            "codigoLugarMrz": None,
        },
        "digitos_control": dict.fromkeys(("serial", "nacimiento", "vencimiento", "compuesto"), "valido"),
        "errores": [],
        "warnings": [],
    }
    hoy = copy.deepcopy(base)
    hoy["campos"]["fechaVencimiento"] = "2026-10-06"
    ayer = copy.deepcopy(base)
    ayer["campos"]["fechaVencimiento"] = "2026-10-05"
    assert _procesar(DIGITAL, Lectura(mrz=("a", "b", "c")), InterpreteFalso(hoy)).status == "success"
    assert _procesar(DIGITAL, Lectura(mrz=("a", "b", "c")), InterpreteFalso(ayer)).declined_reason == (
        "document_expired"
    )


def test_MS12_divipol_desconocido() -> None:
    for id_fallida in ("divipol-codigos", "divipol-existe"):
        validaciones = [
            {**v, "estado": "fallida" if v["id"] == id_fallida else v["estado"]} for v in VALIDACIONES_OK
        ]
        respuesta = {
            "ok": True,
            "campos": CAMPOS_PDF417_APELLIDO_COMPUESTO,
            "validaciones": validaciones,
            "warnings": [],
        }
        r = _procesar(AMARILLA, Lectura(pdf417=b"x"), InterpreteFalso(respuesta))
        assert _como_dict(r) == {
            "status": "success",
            "declined_reason": None,
            "checks": checks({"status": "warning", "reasons": ["divipol_unknown"]}),
            "document": DOCUMENTO_AMARILLA,
        }


def test_MS13_comparacion_facial_pedida() -> None:
    espia = InterpreteFalso({"ok": True})
    r = _procesar(AMARILLA, lectura_de("pdf417-amarilla/apellido-compuesto"), espia, face_match=True)
    categorias = ["image_quality", "data_validation", "data_consistency", "document_liveness", "face_match"]
    assert _como_dict(r) == {
        "status": "failure",
        "declined_reason": "processing_error",
        "checks": [np(c) for c in categorias],
        "document": None,
    }
    assert espia.peticiones == []


def test_MS14_warnings_fuera_del_registro() -> None:
    respuesta = {
        "ok": True,
        "campos": CAMPOS_PDF417_APELLIDO_COMPUESTO,
        "validaciones": VALIDACIONES_OK,
        "warnings": ["M03", "D04", "M03", "x"],
    }
    r = _procesar(AMARILLA, Lectura(pdf417=b"x"), InterpreteFalso(respuesta))
    assert r.document is not None
    assert r.document["warnings"] == ["M03"]


def test_MS15_lugar_y_fecha_fuera_de_forma() -> None:
    def con(**cambios: Any) -> Resultado:
        campos = {**CAMPOS_PDF417_APELLIDO_COMPUESTO, **cambios}
        respuesta = {"ok": True, "campos": campos, "validaciones": VALIDACIONES_OK, "warnings": []}
        return _procesar(AMARILLA, Lectura(pdf417=b"x"), InterpreteFalso(respuesta))

    r1 = con(codigoDepartamentoNacimiento=None, codigoMunicipioNacimiento=None)
    r2 = con(fechaNacimiento="1990-13-40", segundoNombre="")
    assert r1.status == r2.status == "success"
    assert r1.document == {**DOCUMENTO_AMARILLA, "place_of_birth": None}
    assert r2.document == {**DOCUMENTO_AMARILLA, "date_of_birth": None, "second_name": None}
    # Un solo código DIVIPOL tampoco da lugar.
    r3 = con(codigoMunicipioNacimiento=None)
    assert r3.document is not None
    assert r3.document["place_of_birth"] is None


# --- Propiedad MS-02: todo resultado cabe en el esquema `Validation` del contrato ----------------------


def _validador() -> Draft202012Validator:
    with RUTA_CONTRATO.open(encoding="utf-8") as f:
        contrato = yaml.safe_load(f)
    esquema = {"$ref": "#/components/schemas/Validation", "components": contrato["components"]}
    return Draft202012Validator(esquema, format_checker=FormatChecker())


VALIDADOR = _validador()
_TEXTO = st.one_of(st.none(), st.text(max_size=70), st.sampled_from(["", "FICTICIA", "PEÑA", "DE LA OSSA"]))
_FECHA = st.one_of(st.none(), st.sampled_from(["1990-02-28", "2020-01-01", "2034-07-15", "1990-13-40", "x"]))
_NUMERO = st.one_of(
    st.none(), st.sampled_from(["9999123456", "99991234567", "12", "abc"]), st.text(max_size=12)
)
_ESTADO_CD = st.sampled_from(["valido", "invalido", "ausente", "ilegible"])
_WARNINGS = st.lists(st.sampled_from(["H03", "M03", "N01", "D04", "x", "H99"]), max_size=5)

_PDF417 = st.one_of(
    st.fixed_dictionaries({"ok": st.just(False), "motivo": st.text(max_size=30)}),
    st.fixed_dictionaries(
        {
            "ok": st.just(True),
            "campos": st.fixed_dictionaries(
                {
                    "numeroDocumento": _NUMERO,
                    "primerApellido": _TEXTO,
                    "segundoApellido": _TEXTO,
                    "primerNombre": _TEXTO,
                    "segundoNombre": _TEXTO,
                    "sexo": st.sampled_from(["M", "F", "X", None]),
                    "fechaNacimiento": _FECHA,
                    "rh": st.sampled_from(["A+", "AB-", "O+", "Z", None]),
                    "codigoDepartamentoNacimiento": st.sampled_from(["16", "1", None]),
                    "codigoMunicipioNacimiento": st.sampled_from(["001", "01", None]),
                }
            ),
            "validaciones": st.lists(
                st.fixed_dictionaries(
                    {
                        "id": st.sampled_from(
                            ["formato-nuip", "consistencia-modos", "divipol-codigos", "divipol-existe"]
                        ),
                        "estado": st.sampled_from(["ok", "fallida", "no-aplica"]),
                    }
                ),
                max_size=4,
            ),
            "warnings": _WARNINGS,
        }
    ),
)
_MRZ = st.one_of(
    st.fixed_dictionaries({"ok": st.just(False), "motivo": st.text(max_size=30)}),
    st.fixed_dictionaries(
        {
            "ok": st.just(True),
            "valido": st.booleans(),
            "campos": st.fixed_dictionaries(
                {
                    "nuip": _NUMERO,
                    "apellidos": _TEXTO,
                    "nombres": _TEXTO,
                    "sexo": st.sampled_from(["M", "F", "X", None]),
                    "fechaNacimiento": _FECHA,
                    "fechaVencimiento": _FECHA,
                    "codigoLugarMrz": st.sampled_from(["16001", None]),
                }
            ),
            "digitos_control": st.fixed_dictionaries(
                {k: _ESTADO_CD for k in ("serial", "nacimiento", "vencimiento", "compuesto")}
            ),
            "errores": st.lists(
                st.sampled_from(
                    [
                        "nuip-invalido",
                        "fecha-nacimiento-invalida",
                        "fecha-vencimiento-invalida",
                        "sexo-invalido",
                    ]
                ),
                max_size=3,
            ),
            "warnings": _WARNINGS,
        }
    ),
)


def _validacion_terminal(tipo: str, r: Resultado, face_match: bool) -> dict[str, Any]:
    return {
        "id": "val_0123456789abcdef0123456789abcdef",
        "object": "validation",
        "sandbox": False,
        "document_type": tipo,
        "face_match": face_match,
        "status": r.status,
        "declined_reason": r.declined_reason,
        "checks": r.checks,
        "document": r.document,
        "autorizacion": {
            "datos": True,
            "sensibles": face_match,
            "version_texto": "2026-10-01",
            "otorgada_en": "2026-10-06T15:19:00Z",
            "registrada_en": "2026-10-06T15:20:00Z",
        },
        "upload": None,
        "webhook_url": None,
        "return_url": None,
        "hosted_url": None,
        "created_at": "2026-10-06T15:20:00Z",
        "updated_at": "2026-10-06T15:20:00Z",
        "completed_at": "2026-10-06T15:20:00Z",
        "expires_at": "2026-10-07T15:20:00Z",
    }


@settings(max_examples=500)
@given(
    st.one_of(
        st.tuples(st.just(AMARILLA), _PDF417),
        st.tuples(st.just(DIGITAL), _MRZ),
    ),
    st.booleans(),
)
def test_MS02_propiedad_resultado_valido_contra_el_contrato(caso: tuple[str, Any], face_match: bool) -> None:
    tipo, respuesta = caso
    lectura = Lectura(pdf417=b"x") if tipo == AMARILLA else Lectura(mrz=("a", "b", "c"))
    r = _procesar(tipo, lectura, InterpreteFalso(respuesta), face_match=face_match)
    errores = [e.message for e in VALIDADOR.iter_errors(_validacion_terminal(tipo, r, face_match))]
    assert errores == []
    assert r.status in {"success", "failure"}
    assert (r.status == "success") == (r.declined_reason is None)
