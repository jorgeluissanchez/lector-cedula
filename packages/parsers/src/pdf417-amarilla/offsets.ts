/**
 * Modo offsets en la trama completa (PA-07; design.md, decisión 5). Posiciones de H04 (confirmada con
 * corrección: cuatro campos de 23 bytes), H03 (NUIP en [48,58)) y H05 (bloque sexo primero desde 150).
 * Cualquier fallo devuelve `null` y el ensamblador usa el modo patrones.
 */
import { decodificarLatin1, esDigito, esLetra } from "./bytes.js";
import { interpretarBloque, reconocerSexoPrimero } from "./bloque-demografico.js";
import type { LecturaPdf417 } from "./lectura.js";
import { validarFormatoNuip } from "../nuip-formato.js";

const INICIO_NUIP = 48;
const FIN_NUIP = 58;
/** Campos de nombre de 23 bytes: [58,81), [81,104), [104,127) y [127,150). */
const INICIO_APELLIDO_1 = 58;
const INICIO_APELLIDO_2 = 81;
const INICIO_NOMBRE_1 = 104;
const INICIO_NOMBRE_2 = 127;
const LONGITUD_NOMBRE = 23;
const INICIO_BLOQUE = 150;
/** Departamento (2), municipio (3) y un dígito desconocido (H05, H06). */
const DIGITOS_DIVIPOL = 6;
const ESPACIO = 0x20;

/**
 * Texto del campo de nombre `[inicio, inicio + 23)`: lo anterior al primer 0x00, con solo 0x00 después.
 * Debe cumplir `L+( L+)*`; `""` si el campo está vacío y `null` si no es válido.
 */
function leerCampoNombre(bytes: Uint8Array, inicio: number): string | null {
  const limite = inicio + LONGITUD_NOMBRE;
  let fin = inicio;
  while (fin < limite && bytes[fin] !== 0) fin++;
  for (let i = fin; i < limite; i++) if (bytes[i] !== 0) return null;
  // L+( L+)*: un 0x20 solo tras una letra, y el campo no puede terminar en 0x20.
  let previoEspacio = true;
  for (let i = inicio; i < fin; i++) {
    if (esLetra(bytes[i])) {
      previoEspacio = false;
      continue;
    }
    if (bytes[i] !== ESPACIO || previoEspacio) return null;
    previoEspacio = true;
  }
  if (previoEspacio && fin > inicio) return null;
  return decodificarLatin1(bytes, inicio, fin);
}

/** Lectura por posiciones fijas de la trama completa, o `null` si algo no cuadra. */
export function leerOffsets(bytes: Uint8Array): LecturaPdf417 | null {
  for (let i = INICIO_NUIP; i < FIN_NUIP; i++) if (!esDigito(bytes[i])) return null;
  const formato = validarFormatoNuip(decodificarLatin1(bytes, INICIO_NUIP, FIN_NUIP));
  if (!formato.valido) return null;

  const primerApellido = leerCampoNombre(bytes, INICIO_APELLIDO_1);
  const segundoApellido = leerCampoNombre(bytes, INICIO_APELLIDO_2);
  const primerNombre = leerCampoNombre(bytes, INICIO_NOMBRE_1);
  const segundoNombre = leerCampoNombre(bytes, INICIO_NOMBRE_2);
  if (!primerApellido || !primerNombre || segundoApellido === null || segundoNombre === null) return null;

  const bloque = reconocerSexoPrimero(bytes, INICIO_BLOQUE);
  if (bloque === null || bloque.digitos.length !== DIGITOS_DIVIPOL) return null;
  const datos = interpretarBloque(bloque);
  if (datos === null) return null;
  const { divipol, ...campoBloque } = datos;

  return {
    campos: {
      numeroDocumento: formato.numero,
      primerApellido,
      segundoApellido: segundoApellido === "" ? null : segundoApellido,
      primerNombre,
      segundoNombre: segundoNombre === "" ? null : segundoNombre,
      ...campoBloque,
    },
    bloque: "sexo-primero",
    tipoNuip: formato.tipoProbable,
    nombresPorH15: false,
    divipol,
  };
}
