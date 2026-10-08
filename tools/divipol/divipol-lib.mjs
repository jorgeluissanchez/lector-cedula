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

// ---------------------------------------------------------------------------------------------------------------
// Equivalencia DIVIPOL -> DIVIPOLA (DV-16; design.md decisiones 5 y 6).

const MARCAS_COMBINANTES = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");
const CODIGO_5 = /^[0-9]{5}$/;

/**
 * Normalización N de DV-16: NFD, sin marcas combinantes U+0300 a U+036F, mayúsculas, todo carácter fuera de
 * `A`-`Z` y `0`-`9` a espacio, espacios colapsados y recortados.
 * @param {string} nombre
 * @returns {string}
 */
export function normalizar(nombre) {
  return nombre.normalize("NFD").replace(MARCAS_COMBINANTES, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/**
 * Normalización N2 de DV-16: `N` del texto anterior al primer `(`, sin espacios.
 * @param {string} nombre
 * @returns {string}
 */
export function normalizarSinParentesis(nombre) {
  return normalizar(nombre.split("(", 1)[0]).replaceAll(" ", "");
}

const CABECERA_DIVIPOLA =
  "Código Departamento,Nombre Departamento,Código Municipio,Nombre Municipio,Tipo: Municipio / Isla / Área no municipalizada,longitud,Latitud";
const CAMPOS_DIVIPOLA = 7;
const FILAS_DIVIPOLA = 1122;
const DEPARTAMENTOS_DIVIPOLA = 33;
/** Un campo CSV (entre comillas con `""` como escape, o sin comillas ni comas) seguido de coma o fin de línea. */
const CAMPO_CSV = /("(?:[^"]|"")*"|[^",]*)(,|$)/y;

function camposCsv(linea, numero) {
  const campo = new RegExp(CAMPO_CSV.source, "y");
  const campos = [];
  for (;;) {
    const m = campo.exec(linea);
    if (m === null) throw new ErrorDivipol(`DIVIPOLA, línea ${numero}: CSV malformado: ${linea}`);
    const [, bruto, separador] = m;
    campos.push(bruto.startsWith('"') ? bruto.slice(1, -1).replaceAll('""', '"') : bruto);
    if (separador === "") return campos;
  }
}

/**
 * Lee el CSV de DIVIPOLA del DANE (DV-16, "Integridad de la fuente DANE"): cabecera exacta, 7 campos por fila,
 * códigos de departamento de 2 dígitos y de municipio de 5 con ese prefijo, sin repetidos, nombres y tipo no
 * vacíos, y en total 1122 filas de datos en 33 departamentos. Lanza `ErrorDivipol` con la línea o los conteos.
 * @param {string} texto
 * @returns {{codigoDepartamento: string, departamento: string, codigo: string, municipio: string, tipo: string}[]}
 */
export function parsearDivipola(texto) {
  const lineas = texto.split(/\r?\n/);
  if (lineas.at(-1) === "") lineas.pop();
  if (lineas[0] !== CABECERA_DIVIPOLA) throw new ErrorDivipol(`DIVIPOLA: cabecera inesperada: ${lineas[0] ?? "(vacía)"}`);
  const filas = [];
  const lineaPorCodigo = new Map();
  for (let i = 1; i < lineas.length; i++) {
    const numero = i + 1;
    const campos = camposCsv(lineas[i], numero);
    if (campos.length !== CAMPOS_DIVIPOLA) {
      throw new ErrorDivipol(`DIVIPOLA, línea ${numero}: se esperaban ${CAMPOS_DIVIPOLA} campos y hay ${campos.length}`);
    }
    const [codigoDepartamento, departamento, codigo, municipio, tipo] = campos;
    if (!/^[0-9]{2}$/.test(codigoDepartamento) || !CODIGO_5.test(codigo) || !codigo.startsWith(codigoDepartamento)) {
      throw new ErrorDivipol(`DIVIPOLA, línea ${numero}: códigos inválidos (${codigoDepartamento}, ${codigo})`);
    }
    if (departamento === "" || municipio === "" || tipo === "") {
      throw new ErrorDivipol(`DIVIPOLA, línea ${numero}: campo vacío en el código ${codigo}`);
    }
    if (lineaPorCodigo.has(codigo)) {
      throw new ErrorDivipol(`DIVIPOLA, línea ${numero}: código ${codigo} repetido (ya en la línea ${lineaPorCodigo.get(codigo)})`);
    }
    lineaPorCodigo.set(codigo, numero);
    filas.push({ codigoDepartamento, departamento, codigo, municipio, tipo });
  }
  const departamentos = new Set(filas.map((f) => f.codigoDepartamento)).size;
  if (filas.length !== FILAS_DIVIPOLA || departamentos !== DEPARTAMENTOS_DIVIPOLA) {
    throw new ErrorDivipol(
      `DIVIPOLA: ${filas.length} filas de datos en ${departamentos} departamentos; se esperaban ${FILAS_DIVIPOLA} en ${DEPARTAMENTOS_DIVIPOLA}`,
    );
  }
  return filas;
}

/**
 * Tabla literal de DV-16: departamento DIVIPOL -> departamento DANE (88, consulados, sin equivalente). Escrita a
 * mano y revisada; no se deduce por nombre (design.md, decisión 5).
 */
export const DEPARTAMENTOS_DANE = Object.freeze({
  "01": "05", "03": "08", "05": "13", "07": "15", "09": "17", "11": "19", "12": "20", "13": "23", "15": "25",
  "16": "11", "17": "27", "19": "41", "21": "47", "23": "52", "24": "66", "25": "54", "26": "63", "27": "68",
  "28": "70", "29": "73", "31": "76", "40": "81", "44": "18", "46": "85", "48": "44", "50": "94", "52": "50",
  "54": "95", "56": "88", "60": "91", "64": "86", "68": "97", "72": "99", "88": null,
});

/**
 * Único duplicado documentado (DV-04, DV-15, DV-16): `15001` (código histórico de Bogotá en CUNDINAMARCA) y
 * `16001` designan ambos `11001`. Es también la única entrada manual que sale del prefijo DANE de su departamento.
 */
const BOGOTA = Object.freeze({ historico: "15001", vigente: "16001", divipola: "11001" });

/**
 * Códigos DANE que admiten exactamente dos códigos DIVIPOL (DV-16): Bogotá y Barrancominas (94343), creado por la
 * Ordenanza 248 de 2019 de Guainía al unir las áreas no municipalizadas de Barranco Minas (50070) y Mapiripana
 * (50050). Corrección indicada por el coordinador el 2026-10-07; la aprobación humana queda pendiente de registrar.
 */
const DUPLICADOS_DANE = Object.freeze({
  [BOGOTA.divipola]: `${BOGOTA.historico},${BOGOTA.vigente}`,
  "94343": "50050,50070",
});

function leerManuales(manuales, filaPorCodigo, codigosDane) {
  if (!Array.isArray(manuales)) throw new ErrorDivipol("tabla manual: debe ser un arreglo de entradas");
  const entradas = new Map();
  for (const entrada of manuales) {
    const { divipol, divipola, justificacion } = entrada ?? {};
    if (typeof divipol !== "string" || !CODIGO_5.test(divipol)) {
      throw new ErrorDivipol(`tabla manual: entrada ${String(divipol)}: divipol debe ser un código de 5 dígitos`);
    }
    if (divipola !== null && (typeof divipola !== "string" || !CODIGO_5.test(divipola))) {
      throw new ErrorDivipol(`tabla manual: entrada ${divipol}: divipola debe ser un código de 5 dígitos o null`);
    }
    if (typeof justificacion !== "string" || justificacion.trim() === "") {
      throw new ErrorDivipol(`tabla manual: entrada ${divipol}: falta la justificación`);
    }
    if (entradas.has(divipol)) throw new ErrorDivipol(`tabla manual: entrada ${divipol} repetida`);
    if (!filaPorCodigo.has(divipol)) throw new ErrorDivipol(`tabla manual: entrada ${divipol}: el código no está en la tabla DIVIPOL`);
    const departamentoDane = DEPARTAMENTOS_DANE[divipol.slice(0, 2)];
    if (typeof departamentoDane !== "string") {
      throw new ErrorDivipol(`tabla manual: entrada ${divipol}: su departamento no tiene equivalente DANE`);
    }
    if (divipola !== null) {
      if (!codigosDane.has(divipola)) {
        throw new ErrorDivipol(`tabla manual: entrada ${divipol}: el código DANE ${divipola} no está en DIVIPOLA`);
      }
      const permitido = divipol === BOGOTA.historico ? divipola === BOGOTA.divipola : divipola.startsWith(departamentoDane);
      if (!permitido) {
        throw new ErrorDivipol(`tabla manual: entrada ${divipol}: el código DANE ${divipola} no es del departamento DANE ${departamentoDane}`);
      }
    }
    entradas.set(divipol, divipola);
  }
  return entradas;
}

/** Emparejamiento automático de una etapa: devuelve el código DANE si hay exactamente un candidato. */
function candidatoUnico(candidatos, normalizacion, nombre) {
  const clave = normalizacion(nombre);
  const iguales = candidatos.filter((c) => normalizacion(c.municipio) === clave);
  return iguales.length === 1 ? iguales[0].codigo : undefined;
}

/**
 * Empareja cada fila municipal DIVIPOL con DIVIPOLA en tres etapas excluyentes (DV-16): nombre exacto
 * normalizado, nombre sin paréntesis y tabla manual. Solo admite candidatos del departamento DANE de la tabla
 * literal y con un único candidato. Lanza `ErrorDivipol` ante una fila sin resolver, una entrada manual
 * redundante o inválida, o un código DANE repetido (salvo `15001` y `16001` en `11001`, y `50050` y `50070`
 * en `94343`).
 * @param {{codigo: string, departamento: string, municipio: string}[]} filasDivipol
 * @param {{codigo: string, municipio: string}[]} filasDivipola
 * @param {{divipol: string, divipola: string | null, justificacion: string}[]} manuales
 * @returns {{divipol: string, divipola: string | null, metodo: "nombre-exacto" | "nombre-sin-parentesis" | "manual"}[]}
 */
export function emparejar(filasDivipol, filasDivipola, manuales) {
  const filaPorCodigo = new Map(filasDivipol.map((f) => [f.codigo, f]));
  const manualPorCodigo = leerManuales(manuales, filaPorCodigo, new Set(filasDivipola.map((f) => f.codigo)));
  const resultado = [];
  for (const fila of [...filasDivipol].sort((a, b) => porCodigo(a.codigo, b.codigo))) {
    const departamento = fila.codigo.slice(0, 2);
    if (!Object.hasOwn(DEPARTAMENTOS_DANE, departamento)) {
      throw new ErrorDivipol(`código ${fila.codigo}: el departamento DIVIPOL ${departamento} no está en la tabla de departamentos DANE`);
    }
    const departamentoDane = DEPARTAMENTOS_DANE[departamento];
    if (departamentoDane === null) continue;
    const candidatos = filasDivipola.filter((f) => f.codigo.startsWith(departamentoDane));
    const exacto = candidatoUnico(candidatos, normalizar, fila.municipio);
    const sinParentesis = exacto === undefined ? candidatoUnico(candidatos, normalizarSinParentesis, fila.municipio) : undefined;
    const automatico = exacto ?? sinParentesis;
    if (manualPorCodigo.has(fila.codigo)) {
      if (automatico !== undefined) {
        throw new ErrorDivipol(`código ${fila.codigo}: la tabla manual lo incluye pero ya empareja automáticamente con ${automatico}`);
      }
      resultado.push({ divipol: fila.codigo, divipola: manualPorCodigo.get(fila.codigo), metodo: "manual" });
    } else if (exacto !== undefined) {
      resultado.push({ divipol: fila.codigo, divipola: exacto, metodo: "nombre-exacto" });
    } else if (sinParentesis !== undefined) {
      resultado.push({ divipol: fila.codigo, divipola: sinParentesis, metodo: "nombre-sin-parentesis" });
    } else {
      throw new ErrorDivipol(`código ${fila.codigo} (${fila.municipio}): sin equivalente DIVIPOLA y sin entrada en la tabla manual`);
    }
  }
  const porDane = new Map();
  for (const { divipol, divipola } of resultado) {
    if (divipola !== null) porDane.set(divipola, [...(porDane.get(divipola) ?? []), divipol]);
  }
  for (const [codigoDane, codigos] of porDane) {
    if (codigos.length > 1 && DUPLICADOS_DANE[codigoDane] !== codigos.join()) {
      throw new ErrorDivipol(`código DANE ${codigoDane} repetido para los códigos DIVIPOL ${codigos.join(", ")}`);
    }
  }
  return resultado;
}

/** Cambios respecto de DIVIPOLA declarados en la atribución (CC BY-SA 4.0, sección 3(a); DV-17). */
export const CAMBIOS_EQUIVALENCIAS =
  "Solo se conservan los códigos emparejados (pares DIVIPOL-DIVIPOLA) y el método de emparejamiento; no se copian nombres, coordenadas ni tipos del DANE.";

/**
 * Serializa la equivalencia como módulo TypeScript (DV-16, DV-17; design.md decisión 8): cabecera de atribución,
 * `FUENTE_EQUIVALENCIAS` y filas `[divipol, divipola | null, metodo]` en orden de código DIVIPOL; LF y `\n` final.
 * @param {{divipol: string, divipola: string | null, metodo: string}[]} equivalencias
 * @param {{fuente: string, url: string, licencia: string, sha256: string}} fuente
 * @returns {string}
 */
export function serializarEquivalencias(equivalencias, fuente) {
  const ordenadas = [...equivalencias].sort((a, b) => porCodigo(a.divipol, b.divipol));
  const texto = JSON.stringify;
  return [
    "// Generado por tools/divipol/generar-divipol.mjs; no editar.",
    "// Equivalencia DIVIPOL (Registraduría) -> DIVIPOLA (DANE): material adaptado de DIVIPOLA, CC BY-SA 4.0.",
    `// Fuente: ${fuente.fuente}`,
    `// URL: ${fuente.url}`,
    `// Licencia: ${fuente.licencia} (https://creativecommons.org/licenses/by-sa/4.0/). Avisos en packages/parsers/THIRD_PARTY_NOTICES.md.`,
    `// SHA-256: ${fuente.sha256}`,
    `// Cambios: ${CAMBIOS_EQUIVALENCIAS}`,
    "",
    "export const FUENTE_EQUIVALENCIAS = {",
    `  fuente: ${texto(fuente.fuente)},`,
    `  url: ${texto(fuente.url)},`,
    `  licencia: ${texto(fuente.licencia)},`,
    `  sha256: ${texto(fuente.sha256)},`,
    `  cambios: ${texto(CAMBIOS_EQUIVALENCIAS)},`,
    "} as const;",
    "",
    'export type MetodoEquivalenciaGenerado = "nombre-exacto" | "nombre-sin-parentesis" | "manual";',
    "",
    "/** Filas [código DIVIPOL, código DIVIPOLA o null, método] en orden de código DIVIPOL. */",
    "export const EQUIVALENCIAS_DIVIPOLA: readonly (readonly [string, string | null, MetodoEquivalenciaGenerado])[] = [",
    ...ordenadas.map((e) => `  ${texto([e.divipol, e.divipola, e.metodo])},`),
    "];",
    "",
  ].join("\n");
}

const LINEA_DIVIPOL_TXT = /^[0-9]{5}/;
const ANCHO_MINIMO_TXT = 51;

/**
 * Contraste con un `DIVIPOL.TXT` local de ancho fijo (DV-18): Latin-1; departamento 0-1, municipio 2-4, nombre de
 * departamento 9-20 y nombre de municipio 21-50. Varias líneas por municipio (una por puesto). Compara solo los
 * nombres de municipio, tras `transformarNombre` en ambos lados. Puro: no lee ni escribe archivos.
 * @param {Uint8Array} bytes
 * @param {{codigo: string, municipio: string}[]} filas
 * @returns {{soloEnTabla: string[], soloEnContraste: string[], nombresDistintos: {codigo: string, tabla: string, contraste: string}[]}}
 */
export function contrastar(bytes, filas) {
  const contraste = new Map();
  Buffer.from(bytes).toString("latin1").split(/\r?\n/).forEach((linea, i) => {
    if (linea.trim() === "") return;
    if (linea.length < ANCHO_MINIMO_TXT || !LINEA_DIVIPOL_TXT.test(linea)) {
      throw new ErrorDivipol(`DIVIPOL.TXT, línea ${i + 1}: línea malformada (se esperan 5 dígitos y al menos ${ANCHO_MINIMO_TXT} caracteres)`);
    }
    const codigo = linea.slice(0, 5);
    if (!contraste.has(codigo)) contraste.set(codigo, transformarNombre(linea.slice(21, 51)));
  });
  if (contraste.size === 0) throw new ErrorDivipol("DIVIPOL.TXT: el archivo está sin líneas");
  const tabla = new Map(filas.map((f) => [f.codigo, transformarNombre(f.municipio)]));
  const soloEnTabla = [...tabla.keys()].filter((c) => !contraste.has(c)).sort(porCodigo);
  const soloEnContraste = [...contraste.keys()].filter((c) => !tabla.has(c)).sort(porCodigo);
  const nombresDistintos = [...tabla.keys()]
    .filter((c) => contraste.has(c) && contraste.get(c) !== tabla.get(c))
    .sort(porCodigo)
    .map((codigo) => ({ codigo, tabla: tabla.get(codigo), contraste: contraste.get(codigo) }));
  return { soloEnTabla, soloEnContraste, nombresDistintos };
}
