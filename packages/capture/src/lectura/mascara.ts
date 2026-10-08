// Máscara única del resultado (OFF-09, LPI-06; design.md, decisión 3). La usan la PWA y tools/leer-foto.mjs.
// NUIP y serial: solo los 2 últimos caracteres. Nombres: la primera letra de cada palabra. Otros campos sin cambio.

/** Conserva solo los 2 últimos caracteres; los valores que no son cadena pasan sin cambio. */
export function enmascararUltimos2<T>(valor: T): T {
  if (typeof valor !== "string") return valor;
  return ("*".repeat(Math.max(0, valor.length - 2)) + valor.slice(-2)) as T;
}

/** Cada palabra conserva su primera letra; el resto pasa a `*`. */
export function enmascararNombre<T>(valor: T): T {
  if (typeof valor !== "string") return valor;
  return valor.replace(/\S+/gu, (p) => p[0] + "*".repeat(p.length - 1)) as T;
}

/** Campos del parser MRZ (`nuip`, `serial`, `apellidos`, `nombres`). */
export function enmascararCamposMrz<T extends object>(campos: T): T {
  const c = campos as Record<string, unknown>;
  return { ...campos, nuip: enmascararUltimos2(c.nuip), serial: enmascararUltimos2(c.serial), apellidos: enmascararNombre(c.apellidos), nombres: enmascararNombre(c.nombres) };
}

/** Cada dígito de control conserva solo su `estado`: `leido` y `calculado` revelarían dígitos del NUIP y del serial. */
function soloEstados(digitos: Readonly<Record<string, { readonly estado: unknown }>>): Record<string, { estado: unknown }> {
  return Object.fromEntries(Object.entries(digitos).map(([k, d]) => [k, { estado: d.estado }]));
}

/** Resultado del parser MRZ: campos enmascarados, dígitos de control solo con su estado y sin las líneas ni las correcciones. */
export function enmascararResultadoMrz<T extends { readonly campos: object }>(resultado: T): T {
  const r = { ...resultado, campos: enmascararCamposMrz(resultado.campos), lineasCorregidas: null, correcciones: null };
  return "digitosControl" in resultado ? { ...r, digitosControl: soloEstados(resultado.digitosControl as Record<string, { estado: unknown }>) } : r;
}

/** Campos del parser PDF417 de la amarilla. El lugar de nacimiento no se enmascara (LPI-08). */
export function enmascararCamposPdf417<T extends object>(campos: T): T {
  const c = campos as Record<string, unknown>;
  return {
    ...campos,
    numeroDocumento: enmascararUltimos2(c.numeroDocumento),
    primerApellido: enmascararNombre(c.primerApellido),
    segundoApellido: enmascararNombre(c.segundoApellido),
    primerNombre: enmascararNombre(c.primerNombre),
    segundoNombre: enmascararNombre(c.segundoNombre),
  };
}
