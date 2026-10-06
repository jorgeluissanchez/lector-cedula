"""Idempotencia de la creación (decisión 12, AV-12).

Entrada `(hash de clave de API, Idempotency-Key) -> (huella del cuerpo canónico, respuesta, vence)`,
con un marcador "en curso" que hace responder 409 a una petición concurrente con la misma clave. Solo
se guardan respuestas 201: un 4xx libera la clave (AV-04). La respuesta de creación no lleva datos del
documento, así que el registro no guarda datos personales.
"""

import hashlib
import json
import re
from dataclasses import dataclass, field

VIGENCIA_S = 86_400
PATRON_CLAVE = re.compile(r"^[\x20-\x7E]{1,255}$")


def huella_cuerpo(cuerpo: bytes) -> str:
    """sha256 del cuerpo canónico: JSON reserializado con claves ordenadas o, si no es JSON, los bytes."""
    try:
        canonico = json.dumps(
            json.loads(cuerpo), sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    except (ValueError, RecursionError):
        canonico = cuerpo
    return hashlib.sha256(canonico).hexdigest()


@dataclass(frozen=True)
class RespuestaGuardada:
    estado: int
    contenido: bytes = field(repr=False)
    cabeceras: tuple[tuple[str, str], ...]


@dataclass
class _Entrada:
    huella: str
    vence_en: float
    respuesta: RespuestaGuardada | None = None  # None: en curso


class Repetir:
    def __init__(self, respuesta: RespuestaGuardada) -> None:
        self.respuesta = respuesta


class EnCurso:
    pass


class Reutilizada:
    pass


class RegistroIdempotencia:
    def __init__(self) -> None:
        self._entradas: dict[tuple[str, str], _Entrada] = {}

    def __len__(self) -> int:
        return len(self._entradas)

    def reservar(
        self, propietario: str, clave: str, huella: str, ahora: float
    ) -> Repetir | EnCurso | Reutilizada | None:
        """Devuelve qué hacer con una clave ya vista, o `None` tras reservarla como "en curso"."""
        self._purgar(ahora)
        entrada = self._entradas.get((propietario, clave))
        if entrada is not None:
            if entrada.respuesta is None:
                return EnCurso()
            if entrada.huella != huella:
                return Reutilizada()
            return Repetir(entrada.respuesta)
        self._entradas[(propietario, clave)] = _Entrada(huella=huella, vence_en=ahora + VIGENCIA_S)
        return None

    def guardar(self, propietario: str, clave: str, respuesta: RespuestaGuardada, ahora: float) -> None:
        entrada = self._entradas.get((propietario, clave))
        if entrada is not None and entrada.respuesta is None:
            entrada.respuesta = respuesta
            entrada.vence_en = ahora + VIGENCIA_S

    def liberar_si_en_curso(self, propietario: str, clave: str) -> None:
        entrada = self._entradas.get((propietario, clave))
        if entrada is not None and entrada.respuesta is None:
            del self._entradas[(propietario, clave)]

    def _purgar(self, ahora: float) -> None:
        vencidas = [k for k, e in self._entradas.items() if e.respuesta is not None and ahora > e.vence_en]
        for clave in vencidas:
            del self._entradas[clave]
