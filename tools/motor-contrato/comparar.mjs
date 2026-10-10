// MOT-02: comparador del contrato motor contra CLI. Compara el RESULTADO completo (incluido `riesgo`) tras ordenar las
// claves; devuelve solo rutas (nunca valores) para que la salida no lleve datos del documento.

/** Copia con las claves de cada objeto ordenadas (para una comparación estable). */
export function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, ordenar(valor[k])]));
  }
  return valor;
}

/** Rutas (`campos.nuip`, `warnings.0`) donde `a` y `b` difieren. */
export function diferencias(a, b, ruta = "") {
  const esObjeto = (x) => x !== null && typeof x === "object";
  if (!esObjeto(a) || !esObjeto(b) || Array.isArray(a) !== Array.isArray(b)) {
    return Object.is(a, b) ? [] : [ruta || "(raiz)"];
  }
  const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return claves.flatMap((k) => diferencias(a[k], b[k], ruta ? `${ruta}.${k}` : k));
}

/** Compara un fixture; devuelve las líneas a imprimir (vacío si coinciden). */
export function compararFixture(nombre, motor, cli) {
  const rutas = JSON.stringify(ordenar(motor)) === JSON.stringify(ordenar(cli)) ? [] : diferencias(motor, cli);
  return rutas.map((r) => `${nombre}: ${r}`);
}
