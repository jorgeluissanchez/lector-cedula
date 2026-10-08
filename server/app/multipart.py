"""Lectura de la subida multipart en streaming y solo en memoria (decisión 3, AV-07, AV-10, AV-30).

No usa `request.form()` de Starlette, que vuelca a `SpooledTemporaryFile` (disco en `/tmp`) toda parte
de más de 1 MiB. Usa el parser en streaming de `python-multipart` con callbacks que acumulan cada parte
en un `bytearray` y abortan en cuanto una parte supera 8 MiB o el cuerpo 20 MiB. `Content-Length` se
comprueba antes de leer. Las partes sin `filename` (campos de texto) se rechazan con `unexpected_field`
(SDK-17). Ningún error reproduce nombres, tipos ni contenido enviados por el cliente.
"""

import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from python_multipart.exceptions import MultipartParseError
from python_multipart.multipart import MultipartParser, parse_options_header

from app.errores import ErrorApi
from app.motor import Imagenes

LIMITE_PARTE = 8_388_608
LIMITE_CUERPO = 20_971_520
FIRMAS = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n"}
NOMBRES = ("front", "back", "selfie")
_NOMBRE_SEGURO = re.compile(r"^[a-z_]{1,64}$")


def _error(estado: int, slug: str, puntero: str, codigo: str) -> ErrorApi:
    return ErrorApi(estado, slug, [{"pointer": puntero, "code": codigo}])


@dataclass
class _Parte:
    nombre: str
    tipo: str
    datos: bytearray = field(default_factory=bytearray, repr=False)


class _Lector:
    """Estado del parser: cabeceras de la parte en curso y partes completas."""

    def __init__(self, face_match: bool) -> None:
        self.face_match = face_match
        self.partes: dict[str, _Parte] = {}
        self.actual: _Parte | None = None
        self.cabeceras: dict[bytes, bytes] = {}
        self._campo = bytearray()
        self._valor = bytearray()
        self.terminado = False

    # --- callbacks de python-multipart ---

    def on_part_begin(self) -> None:
        self.cabeceras = {}
        self.actual = None

    def on_header_field(self, datos: bytes, inicio: int, fin: int) -> None:
        self._campo += datos[inicio:fin]

    def on_header_value(self, datos: bytes, inicio: int, fin: int) -> None:
        self._valor += datos[inicio:fin]

    def on_header_end(self) -> None:
        self.cabeceras[bytes(self._campo).lower()] = bytes(self._valor)
        self._campo.clear()
        self._valor.clear()

    def on_headers_finished(self) -> None:
        _, opciones = parse_options_header(self.cabeceras.get(b"content-disposition", b""))
        nombre = opciones.get(b"name", b"").decode("latin-1")
        if b"filename" not in opciones:
            # SDK-17: un campo de texto (sin archivo) nunca es una imagen. El cliente no aporta datos del
            # documento (`document`, `nuip`, `resultado`...): el resultado lo calcula solo el servidor.
            puntero = f"/{nombre}" if _NOMBRE_SEGURO.fullmatch(nombre) else ""
            raise _error(422, "invalid-request", puntero, "unexpected_field")
        if nombre not in NOMBRES:
            puntero = f"/{nombre}" if _NOMBRE_SEGURO.fullmatch(nombre) else ""
            raise _error(422, "invalid-request", puntero, "unexpected_part")
        if nombre == "selfie" and not self.face_match:
            raise _error(422, "invalid-request", "/selfie", "unexpected_part")
        if nombre in self.partes:
            raise _error(422, "invalid-request", f"/{nombre}", "duplicate_part")
        tipo, _ = parse_options_header(self.cabeceras.get(b"content-type", b""))
        tipo_texto = tipo.decode("latin-1").lower()
        if tipo_texto not in FIRMAS:
            raise _error(415, "unsupported-image-type", f"/{nombre}", "unsupported_type")
        self.actual = _Parte(nombre=nombre, tipo=tipo_texto)
        self.partes[nombre] = self.actual

    def on_part_data(self, datos: bytes, inicio: int, fin: int) -> None:
        if self.actual is None:
            return
        self.actual.datos += datos[inicio:fin]
        if len(self.actual.datos) > LIMITE_PARTE:
            raise _error(413, "image-too-large", f"/{self.actual.nombre}", "too_large")

    def on_part_end(self) -> None:
        parte = self.actual
        if parte is None:
            return
        if not parte.datos:
            raise _error(422, "invalid-request", f"/{parte.nombre}", "empty_part")
        if not parte.datos.startswith(FIRMAS[parte.tipo]):
            raise _error(415, "unsupported-image-type", f"/{parte.nombre}", "signature_mismatch")
        self.actual = None

    def on_end(self) -> None:
        self.terminado = True

    def callbacks(self) -> dict[str, object]:
        return {
            "on_part_begin": self.on_part_begin,
            "on_header_field": self.on_header_field,
            "on_header_value": self.on_header_value,
            "on_header_end": self.on_header_end,
            "on_headers_finished": self.on_headers_finished,
            "on_part_data": self.on_part_data,
            "on_part_end": self.on_part_end,
            "on_end": self.on_end,
        }


def comprobar_antes_de_leer(content_type: str | None, content_length: str | None) -> bytes:
    """413 si `Content-Length` supera el límite y 415 si no es `multipart/form-data` con `boundary`;
    devuelve el `boundary`. No lee el cuerpo."""
    if content_length is not None and content_length.isdigit() and int(content_length) > LIMITE_CUERPO:
        raise ErrorApi(413, "request-too-large")
    tipo, opciones = parse_options_header(content_type or "")
    limite = opciones.get(b"boundary", b"")
    if tipo != b"multipart/form-data" or not limite or len(limite) > 70:
        raise ErrorApi(415, "unsupported-media-type")
    return limite


async def leer_imagenes(flujo: AsyncIterator[bytes], limite: bytes, face_match: bool) -> Imagenes:
    """Lee la subida del flujo y devuelve las imágenes validadas, o lanza `ErrorApi`."""
    lector = _Lector(face_match)
    parser = MultipartParser(limite, lector.callbacks())  # type: ignore[arg-type]
    leidos = 0
    try:
        async for trozo in flujo:
            leidos += len(trozo)
            if leidos > LIMITE_CUERPO:
                raise ErrorApi(413, "request-too-large")
            parser.write(trozo)
        parser.finalize()
    except MultipartParseError:
        raise _error(422, "invalid-request", "", "invalid_multipart") from None
    if not lector.terminado or lector.actual is not None:
        raise _error(422, "invalid-request", "", "invalid_multipart")

    requeridas = ("front", "back", "selfie") if face_match else ("front", "back")
    for nombre in requeridas:
        if nombre not in lector.partes:
            raise _error(422, "invalid-request", f"/{nombre}", "required")
    partes = lector.partes
    imagenes = Imagenes(
        front=bytes(partes["front"].datos),
        back=bytes(partes["back"].datos),
        selfie=bytes(partes["selfie"].datos) if "selfie" in partes else None,
    )
    partes.clear()
    return imagenes
