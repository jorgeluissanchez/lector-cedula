/**
 * divipol-lib: funciones puras del generador DIVIPOL (cambio divipol-registraduria, design.md decisión 8).
 *
 * Sin E/S: reciben bytes o texto y devuelven datos o lanzan `ErrorDivipol`. La E/S vive en
 * `generar-divipol.mjs`.
 */
import { createHash } from "node:crypto";

/** Error del generador: el mensaje nombra la fuente, la línea o el código DIVIPOL implicado. */
export class ErrorDivipol extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorDivipol";
  }
}

/**
 * SHA-256 en hexadecimal (minúsculas) de unos bytes.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Comprueba que unos bytes tengan el SHA-256 declarado en el manifiesto (DV-12).
 * @param {Uint8Array} bytes
 * @param {string} sha256Esperado
 * @param {string} id identificador de la fuente en el manifiesto
 */
export function verificarFuente(bytes, sha256Esperado, id) {
  const obtenido = sha256(bytes);
  const esperado = String(sha256Esperado).toLowerCase();
  if (obtenido !== esperado) {
    throw new ErrorDivipol(`fuente ${id}: SHA-256 esperado ${esperado}, obtenido ${obtenido}`);
  }
}

const GUION_TIPOGRAFICO = String.fromCharCode(0x2010);
const ENE_MAYUSCULA = String.fromCharCode(0x00d1);

/**
 * Únicas transformaciones de nombres de `localities.py` (DV-14, design.md decisión 2): `/` -> `Ñ` (corrupción de
 * la fuente), U+2010 -> `-` y recorte de espacios en los extremos. Todo lo demás se copia literal.
 * @param {string} nombre
 * @returns {string}
 */
export function transformarNombre(nombre) {
  return nombre.replaceAll("/", ENE_MAYUSCULA).replaceAll(GUION_TIPOGRAFICO, "-").trim();
}

const FILA_LOCALITIES = /^\s*\['([0-9]{2})', '([0-9]{3})', '([^']*)', '([^']*)'\],?\s*$/;
const LINEA_IGNORADA = /^\s*(#.*|LOCALITIES = \[|\])?\s*$/;

/**
 * Lee el texto de `localities.py` (lista de filas `['dd', 'mmm', 'DEPARTAMENTO', 'MUNICIPIO']`).
 * Lanza `ErrorDivipol` con el número de línea ante una línea que no sea fila, comentario, apertura o cierre,
 * ante un nombre vacío, un código repetido o un departamento con dos nombres.
 * @param {string} texto
 * @returns {{codigo: string, departamento: string, municipio: string}[]}
 */
export function parsearLocalities(texto) {
  const filas = [];
  const lineaPorCodigo = new Map();
  const departamentos = new Map();
  texto.split(/\r?\n/).forEach((linea, i) => {
    const numero = i + 1;
    if (LINEA_IGNORADA.test(linea)) return;
    const m = FILA_LOCALITIES.exec(linea);
    if (!m) throw new ErrorDivipol(`localities.py, línea ${numero}: fila malformada (se esperan cuatro cadenas): ${linea.trim()}`);
    const [, dep, mun, nombreDep, nombreMun] = m;
    const codigo = dep + mun;
    const departamento = transformarNombre(nombreDep);
    const municipio = transformarNombre(nombreMun);
    if (departamento === "" || municipio === "") {
      throw new ErrorDivipol(`localities.py, línea ${numero}: nombre vacío en el código ${codigo}`);
    }
    if (lineaPorCodigo.has(codigo)) {
      throw new ErrorDivipol(`localities.py, línea ${numero}: código ${codigo} repetido (ya en la línea ${lineaPorCodigo.get(codigo)})`);
    }
    const previo = departamentos.get(dep);
    if (previo !== undefined && previo !== departamento) {
      throw new ErrorDivipol(`localities.py, línea ${numero}: departamento ${dep} con dos nombres (${previo} y ${departamento})`);
    }
    lineaPorCodigo.set(codigo, numero);
    departamentos.set(dep, departamento);
    filas.push({ codigo, departamento, municipio });
  });
  if (filas.length === 0) throw new ErrorDivipol("localities.py: la fuente no tiene filas");
  return filas;
}

const porCodigo = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Serializa la tabla DIVIPOL como módulo TypeScript (DV-11, DV-13; design.md decisión 8): cabecera con fuente,
 * commit, ruta, licencia y SHA-256; departamentos `codigo -> nombre` y filas `[codigo5, municipio]` en orden de
 * código, una por línea con `JSON.stringify`; LF y `\n` final.
 * @param {{codigo: string, departamento: string, municipio: string}[]} filas
 * @param {{repositorio: string, commit: string, ruta: string, licencia: string, sha256: string}} fuente
 * @returns {string}
 */
export function serializarTabla(filas, fuente) {
  const ordenadas = [...filas].sort((a, b) => porCodigo(a.codigo, b.codigo));
  const departamentos = new Map();
  for (const fila of ordenadas) departamentos.set(fila.codigo.slice(0, 2), fila.departamento);
  const texto = JSON.stringify;
  return [
    "// Generado por tools/divipol/generar-divipol.mjs; no editar.",
    `// Fuente: ${fuente.repositorio}`,
    `// Commit: ${fuente.commit}`,
    `// Ruta: ${fuente.ruta}`,
    `// Licencia: ${fuente.licencia}. Aviso completo en packages/parsers/THIRD_PARTY_NOTICES.md y tools/divipol/fuentes/LICENSES.md.`,
    `// SHA-256: ${fuente.sha256}`,
    "// Transformaciones (DV-14): / por U+00D1, U+2010 por -, recorte de espacios en los extremos.",
    "",
    "export const FUENTE_TABLA_DIVIPOL = {",
    `  fuente: ${texto(fuente.repositorio)},`,
    `  commit: ${texto(fuente.commit)},`,
    `  ruta: ${texto(fuente.ruta)},`,
    `  licencia: ${texto(fuente.licencia)},`,
    `  sha256: ${texto(fuente.sha256)},`,
    "} as const;",
    "",
    "/** Código de departamento (2 dígitos) -> nombre. */",
    "export const DEPARTAMENTOS_DIVIPOL: Readonly<Record<string, string>> = {",
    ...[...departamentos].map(([codigo, nombre]) => `  ${texto(codigo)}: ${texto(nombre)},`),
    "};",
    "",
    "/** Filas [código de 5 dígitos, municipio] en orden de código. */",
    "export const FILAS_DIVIPOL: readonly (readonly [string, string])[] = [",
    ...ordenadas.map((fila) => `  ${texto([fila.codigo, fila.municipio])},`),
    "];",
    "",
  ].join("\n");
}
