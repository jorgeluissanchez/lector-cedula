"""Imágenes sintéticas generadas en memoria para las pruebas de subida (nunca se escriben a disco).

`IMG_JPEG` y `IMG_PNG` de la spec: 1280x800 px, menos de 200 KiB, de un gris uniforme (ninguna
persona ni documento). Solo biblioteca estándar: JPEG baseline en escala de grises con tablas de
Huffman mínimas (cada bloque 8x8 es DC 0 + EOB) y PNG RGB comprimido con zlib.
"""

import struct
import zlib

FIRMA_JPEG = b"\xff\xd8\xff"
FIRMA_PNG = b"\x89PNG\r\n\x1a\n"


def _segmento(marcador: int, carga: bytes) -> bytes:
    return struct.pack(">BBH", 0xFF, marcador, len(carga) + 2) + carga


def jpeg(ancho: int = 1280, alto: int = 800) -> bytes:
    """JPEG baseline válido, gris medio uniforme."""
    jfif = b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    cuantizacion = b"\x00" + b"\x01" * 64
    trama = struct.pack(">BHHB", 8, alto, ancho, 1) + b"\x01\x11\x00"
    # Una sola palabra de código de longitud 1 ("0"): categoría DC 0 y símbolo AC EOB.
    huffman_dc = b"\x00" + bytes([1] + [0] * 15) + b"\x00"
    huffman_ac = b"\x10" + bytes([1] + [0] * 15) + b"\x00"
    barrido = b"\x01\x01\x00\x00\x3f\x00"
    bloques = -(-ancho // 8) * -(-alto // 8)
    bits = 2 * bloques  # "0" (DC 0) + "0" (EOB) por bloque
    datos = bytearray(bits // 8)
    if bits % 8:
        datos.append((1 << (8 - bits % 8)) - 1)  # relleno con unos
    return (
        b"\xff\xd8"
        + _segmento(0xE0, jfif)
        + _segmento(0xDB, cuantizacion)
        + _segmento(0xC0, trama)
        + _segmento(0xC4, huffman_dc)
        + _segmento(0xC4, huffman_ac)
        + _segmento(0xDA, barrido)
        + bytes(datos)
        + b"\xff\xd9"
    )


def jpeg_de_tamano(tamano: int) -> bytes:
    """JPEG válido de exactamente `tamano` bytes: el de 1280x800 con segmentos de comentario (COM)
    de relleno tras SOI."""
    base = jpeg()
    relleno = tamano - len(base)
    if relleno < 0 or 0 < relleno < 4:
        raise ValueError("tamaño no alcanzable con segmentos COM")
    segmentos = bytearray()
    while relleno:
        total = min(relleno, 65_537)
        if 0 < relleno - total < 4:
            total -= 4
        segmentos += _segmento(0xFE, b"\x00" * (total - 4))
        relleno -= total
    resultado = base[:2] + bytes(segmentos) + base[2:]
    assert len(resultado) == tamano
    return resultado


def _trozo_png(tipo: bytes, datos: bytes) -> bytes:
    return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos))


def png(ancho: int = 1280, alto: int = 800) -> bytes:
    """PNG RGB de 8 bits válido, gris claro uniforme."""
    fila = b"\x00" + b"\xc8" * (ancho * 3)
    return (
        FIRMA_PNG
        + _trozo_png(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
        + _trozo_png(b"IDAT", zlib.compress(fila * alto, 9))
        + _trozo_png(b"IEND", b"")
    )


IMG_JPEG = jpeg()
IMG_PNG = png()
assert len(IMG_JPEG) < 200 * 1024 and len(IMG_PNG) < 200 * 1024
