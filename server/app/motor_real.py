"""Motor real del servidor de respaldo (cambio motor-real-servidor).

Un `Lector` convierte las imágenes en el payload PDF417 o las 3 líneas MRZ (los lectores concretos con
zxing-cpp y RapidOCR esperan la aprobación del revisor de licencias, MS-05). El `Interprete` ejecuta los
parsers TypeScript del repositorio con Node (decisión 1) y `resultado_desde_interpretacion` traduce su
salida a estados, checks y documento del contrato (MS-02, MS-06, MS-09 a MS-15).

Las imágenes solo pasan al lector; el intérprete recibe solo el payload o las líneas, por tubería (MS-04,
MS-07). Ningún mensaje de error lleva datos del documento.
"""

import asyncio
import base64
import datetime
import json
import re
import subprocess
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.motor import Imagenes, Resultado
from app.puertos import Reloj

NODE = "/usr/local/bin/node"
SCRIPT_INTERPRETE = "/srv/interprete/interpretar.mjs"
LIMITE_INTERPRETE_S = 5.0
MAX_SALIDA_INTERPRETE = 65_536
SCRIPT_LECTOR = "/srv/lector/leer.mjs"
# MS-18: el lector MRZ tiene 20 s de presupuesto; el proceso se mata a los 25 s.
LIMITE_LECTOR_S = 25.0

AMARILLA = "co_national-id-2000"
DIGITAL = "co_national-id-2020"
CATEGORIAS = ("image_quality", "data_validation", "data_consistency", "document_liveness")
WARNING_REGISTRADO = re.compile(r"^[HMN][0-9]{2}$")
NUMERO = re.compile(r"^[0-9]{6,11}$")
FECHA = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
DEPARTAMENTO = re.compile(r"^[0-9]{2}$")
MUNICIPIO = re.compile(r"^[0-9]{3}$")
RH = frozenset({"O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"})


@dataclass(frozen=True)
class Lectura:
    """Lo que un lector sacó de las imágenes: el payload PDF417 o las 3 líneas MRZ (o nada)."""

    pdf417: bytes | None = field(default=None, repr=False)
    mrz: tuple[str, str, str] | None = field(default=None, repr=False)


class Lector(Protocol):
    async def leer(self, tipo: str, imagenes: Imagenes) -> Lectura: ...


class Interprete(Protocol):
    async def interpretar(self, peticion: dict[str, Any]) -> dict[str, Any]: ...


class ErrorLector(Exception):
    """El lector de imagen falló. El mensaje es fijo: nunca lleva datos (MS-17)."""

    def __init__(self) -> None:
        super().__init__("el lector de imagen falló")


class ErrorInterprete(Exception):
    """El intérprete falló. El mensaje es fijo: nunca lleva datos del documento (MS-08)."""

    def __init__(self) -> None:
        super().__init__("el intérprete de los parsers falló")


Lanzador = Callable[..., Awaitable[Any]]


async def _ejecutar_node(
    lanzar: Lanzador, script: str, peticion: dict[str, Any], limite_s: float, error: type[Exception]
) -> dict[str, Any]:
    """Un proceso Node con argumentos fijos; datos solo por la entrada estándar y salida de errores
    descartada (MS-07, MS-17). Cualquier fallo lanza `error`, cuyo mensaje es fijo."""
    entrada = json.dumps(peticion).encode()
    proceso = await lanzar(
        NODE,
        script,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    try:
        salida, _ = await asyncio.wait_for(proceso.communicate(entrada), timeout=limite_s)
    except TimeoutError:
        del entrada
        proceso.kill()
        await proceso.wait()
        raise error from None
    # La petición lleva datos del documento o imágenes: no se retiene más allá de la llamada (privacidad).
    del entrada
    if proceso.returncode != 0 or len(salida) > MAX_SALIDA_INTERPRETE:
        raise error
    try:
        respuesta = json.loads(salida)
    except ValueError:
        raise error from None
    if not isinstance(respuesta, dict) or not isinstance(respuesta.get("ok"), bool):
        raise error
    return respuesta


class InterpreteNode:
    """Intérprete de los parsers TypeScript: un proceso Node por petición (MS-01, MS-07)."""

    def __init__(self, lanzar: Lanzador | None = None, limite_s: float = LIMITE_INTERPRETE_S) -> None:
        self.lanzar: Lanzador = lanzar or asyncio.create_subprocess_exec
        self.limite_s = limite_s

    async def interpretar(self, peticion: dict[str, Any]) -> dict[str, Any]:
        return await _ejecutar_node(self.lanzar, SCRIPT_INTERPRETE, peticion, self.limite_s, ErrorInterprete)


class LectorNode:
    """Lector de packages/capture en Node: un proceso por subida, imágenes por la entrada estándar en el
    orden `back`, `front` (MS-16, MS-17)."""

    def __init__(
        self, reloj: Reloj, lanzar: Lanzador | None = None, limite_s: float = LIMITE_LECTOR_S
    ) -> None:
        self.reloj = reloj
        self.lanzar: Lanzador = lanzar or asyncio.create_subprocess_exec
        self.limite_s = limite_s

    async def leer(self, tipo: str, imagenes: Imagenes) -> Lectura:
        peticion = {
            "tipo": tipo,
            "fecha_referencia": _hoy(self.reloj),
            "imagenes_b64": [
                base64.b64encode(i).decode() for i in (imagenes.back, imagenes.front) if i is not None
            ],
        }
        respuesta = await _ejecutar_node(self.lanzar, SCRIPT_LECTOR, peticion, self.limite_s, ErrorLector)
        del peticion
        if respuesta["ok"] is not True:
            if respuesta.get("motivo") == "no-encontrado":
                return Lectura()
            raise ErrorLector
        pdf417, mrz = respuesta.get("pdf417_b64"), respuesta.get("mrz")
        if isinstance(pdf417, str):
            try:
                return Lectura(pdf417=base64.b64decode(pdf417, validate=True))
            except ValueError:
                raise ErrorLector from None
        if isinstance(mrz, list) and len(mrz) == 3 and all(isinstance(linea, str) for linea in mrz):
            return Lectura(mrz=(mrz[0], mrz[1], mrz[2]))
        raise ErrorLector


class MotorReal:
    def __init__(self, lector: Lector, interprete: Interprete, reloj: Reloj) -> None:
        self.lector = lector
        self.interprete = interprete
        self.reloj = reloj

    async def procesar(
        self, tipo: str, face_match: bool, imagenes: Imagenes, escenario: str | None
    ) -> Resultado:
        if face_match:
            return _sin_comparacion_facial()
        lectura = await self.lector.leer(tipo, imagenes)
        hoy = _hoy(self.reloj)
        peticion = _peticion(tipo, lectura, hoy)
        if peticion is None:
            return _ilegible()
        interpretacion = await self.interprete.interpretar(peticion)
        return resultado_desde_interpretacion(tipo, interpretacion, hoy)


def _hoy(reloj: Reloj) -> str:
    return datetime.datetime.fromtimestamp(reloj.ahora(), tz=datetime.UTC).date().isoformat()


def _peticion(tipo: str, lectura: Lectura, hoy: str) -> dict[str, Any] | None:
    if tipo == AMARILLA and lectura.pdf417:
        return {"fuente": "pdf417", "datos_b64": base64.b64encode(lectura.pdf417).decode()}
    if tipo == DIGITAL and lectura.mrz is not None:
        return {"fuente": "mrz", "lineas": list(lectura.mrz), "fecha_referencia": hoy}
    return None


# --- Traducción al contrato (MS-02, MS-06, MS-09 a MS-15) ---------------------------------------------


def _check(categoria: str, status: str = "not_performed", reasons: list[str] | None = None) -> dict[str, Any]:
    return {"category": categoria, "status": status, "reasons": list(reasons or [])}


def _resultado(
    status: str, declined: str | None, data_validation: dict[str, Any], document: dict[str, Any] | None
) -> Resultado:
    checks = [data_validation if c == "data_validation" else _check(c) for c in CATEGORIAS]
    return Resultado(status=status, declined_reason=declined, checks=checks, document=document)


def _ilegible() -> Resultado:
    return _resultado(
        "failure", "document_unreadable", _check("data_validation", "failed", ["barcode_unreadable"]), None
    )


def _sin_comparacion_facial() -> Resultado:
    checks = [_check(c) for c in (*CATEGORIAS, "face_match")]
    return Resultado(status="failure", declined_reason="processing_error", checks=checks, document=None)


def resultado_desde_interpretacion(tipo: str, interpretacion: dict[str, Any], hoy: str) -> Resultado:
    if interpretacion.get("ok") is not True:
        return _resultado_rechazo(tipo, interpretacion)
    if tipo == AMARILLA:
        documento = _documento_pdf417(interpretacion)
        razones = _razones_pdf417(interpretacion)
        divipol_fallida = any(
            v.get("id") in ("divipol-codigos", "divipol-existe") and v.get("estado") == "fallida"
            for v in _lista_de_dicts(interpretacion.get("validaciones"))
        )
        vencida = False
    else:
        documento = _documento_mrz(interpretacion)
        razones = _razones_mrz(interpretacion)
        divipol_fallida = False
        vencimiento = documento["date_of_expiry"] if documento else None
        vencida = not razones and vencimiento is not None and vencimiento < hoy
        if interpretacion.get("valido") is not True and not razones:
            return _ilegible()

    if razones:
        return _resultado(
            "failure", "data_validation_failed", _check("data_validation", "failed", razones), documento
        )
    if documento is None:
        return _ilegible()
    if vencida:
        return _resultado(
            "failure",
            "document_expired",
            _check("data_validation", "failed", ["document_expired"]),
            documento,
        )
    if divipol_fallida:
        return _resultado(
            "success", None, _check("data_validation", "warning", ["divipol_unknown"]), documento
        )
    return _resultado("success", None, _check("data_validation", "passed"), documento)


def _resultado_rechazo(tipo: str, interpretacion: dict[str, Any]) -> Resultado:
    motivo = interpretacion.get("motivo")
    if tipo == AMARILLA and motivo == "nuip-invalido":
        razon = "document_number_invalid"
    elif tipo == AMARILLA and motivo == "fecha-nacimiento-invalida":
        razon = "date_invalid"
    else:
        return _ilegible()
    return _resultado("failure", "data_validation_failed", _check("data_validation", "failed", [razon]), None)


def _ordenar(presentes: set[str]) -> list[str]:
    return [
        r for r in ("document_number_invalid", "date_invalid", "mrz_check_digit_invalid") if r in presentes
    ]


def _razones_pdf417(interpretacion: dict[str, Any]) -> list[str]:
    presentes = set()
    for v in _lista_de_dicts(interpretacion.get("validaciones")):
        if v.get("id") == "formato-nuip" and v.get("estado") == "fallida":
            presentes.add("document_number_invalid")
    return _ordenar(presentes)


def _razones_mrz(interpretacion: dict[str, Any]) -> list[str]:
    presentes = set()
    errores = interpretacion.get("errores")
    errores = errores if isinstance(errores, list) else []
    if "nuip-invalido" in errores:
        presentes.add("document_number_invalid")
    if "fecha-nacimiento-invalida" in errores or "fecha-vencimiento-invalida" in errores:
        presentes.add("date_invalid")
    digitos = interpretacion.get("digitos_control")
    if isinstance(digitos, dict) and any(estado != "valido" for estado in digitos.values()):
        presentes.add("mrz_check_digit_invalid")
    return _ordenar(presentes)


def _lista_de_dicts(valor: Any) -> list[dict[str, Any]]:
    return [v for v in valor if isinstance(v, dict)] if isinstance(valor, list) else []


def _texto(valor: Any) -> str | None:
    return valor if isinstance(valor, str) and 1 <= len(valor) <= 64 else None


def _fecha(valor: Any) -> str | None:
    if not isinstance(valor, str) or not FECHA.fullmatch(valor):
        return None
    try:
        datetime.date.fromisoformat(valor)
    except ValueError:
        return None
    return valor


def _warnings(valor: Any) -> list[str]:
    vistos: list[str] = []
    for w in valor if isinstance(valor, list) else []:
        if isinstance(w, str) and WARNING_REGISTRADO.fullmatch(w) and w not in vistos:
            vistos.append(w)
    return vistos


def _documento(
    tipo: str, numero: Any, apellido: Any, nombre: Any, sexo: Any, **resto: Any
) -> dict[str, Any] | None:
    """Documento del contrato, o `None` si falta un campo obligatorio con forma válida (MS-02)."""
    primer_apellido, primer_nombre = _texto(apellido), _texto(nombre)
    if not (isinstance(numero, str) and NUMERO.fullmatch(numero)) or primer_apellido is None:
        return None
    if primer_nombre is None or sexo not in ("M", "F"):
        return None
    return {
        "type": tipo,
        "document_number": numero,
        "first_surname": primer_apellido,
        "second_surname": resto["second_surname"],
        "first_name": primer_nombre,
        "second_name": resto["second_name"],
        "sex": sexo,
        "date_of_birth": resto["date_of_birth"],
        "place_of_birth": resto["place_of_birth"],
        "blood_type": resto["blood_type"],
        "date_of_issue": None,
        "place_of_issue": None,
        "date_of_expiry": resto["date_of_expiry"],
        "sources": resto["sources"],
        "warnings": resto["warnings"],
    }


def _nombres_lugar(resuelto: Any, codigo: str) -> dict[str, str]:
    """DC-14 (divipol-consulados-2018): nombres vigentes del intérprete si resolvió el mismo código."""
    if not isinstance(resuelto, dict) or resuelto.get("codigo") != codigo:
        return {}
    departamento, municipio = resuelto.get("departamento"), resuelto.get("municipio")
    if not (isinstance(departamento, str) and isinstance(municipio, str)):
        return {}
    if not (0 < len(departamento) <= 64 and 0 < len(municipio) <= 64):
        return {}
    return {"department_name": departamento, "municipality_name": municipio}


def _documento_pdf417(interpretacion: dict[str, Any]) -> dict[str, Any] | None:
    campos = interpretacion.get("campos")
    if not isinstance(campos, dict):
        return None
    departamento = campos.get("codigoDepartamentoNacimiento")
    municipio = campos.get("codigoMunicipioNacimiento")
    lugar = (
        {"divipol_department": departamento, "divipol_municipality": municipio}
        if isinstance(departamento, str)
        and DEPARTAMENTO.fullmatch(departamento)
        and isinstance(municipio, str)
        and MUNICIPIO.fullmatch(municipio)
        else None
    )
    if lugar is not None:
        lugar.update(_nombres_lugar(interpretacion.get("lugar_nacimiento"), departamento + municipio))
    rh = campos.get("rh")
    return _documento(
        AMARILLA,
        campos.get("numeroDocumento"),
        campos.get("primerApellido"),
        campos.get("primerNombre"),
        campos.get("sexo"),
        second_surname=_texto(campos.get("segundoApellido")),
        second_name=_texto(campos.get("segundoNombre")),
        date_of_birth=_fecha(campos.get("fechaNacimiento")),
        place_of_birth=lugar,
        blood_type=rh if rh in RH else None,
        date_of_expiry=None,
        sources=["pdf417"],
        warnings=_warnings(interpretacion.get("warnings")),
    )


def _documento_mrz(interpretacion: dict[str, Any]) -> dict[str, Any] | None:
    """La MRZ no separa primer y segundo apellido ni nombre: van completos (MS-06)."""
    campos = interpretacion.get("campos")
    if not isinstance(campos, dict):
        return None
    return _documento(
        DIGITAL,
        campos.get("nuip"),
        campos.get("apellidos"),
        campos.get("nombres"),
        campos.get("sexo"),
        second_surname=None,
        second_name=None,
        date_of_birth=_fecha(campos.get("fechaNacimiento")),
        place_of_birth=None,
        blood_type=None,
        date_of_expiry=_fecha(campos.get("fechaVencimiento")),
        sources=["mrz"],
        warnings=_warnings(interpretacion.get("warnings")),
    )
