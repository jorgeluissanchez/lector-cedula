// Fachada de `vitest` SOLO para la ejecución de Stryker (vitest.stryker.config.ts la pone como alias exacto de "vitest").
// `npm test` no la usa. docs/decisiones/2026-10-10-mutacion-ci.md:
// - Las pruebas de rendimiento (aserciones de reloj, nombre con "Rendimiento:" o "Rápido:") se registran como omitidas:
//   con el código instrumentado medirían a Stryker, no al producto. Siguen en `npm test`.
// - Los timeouts explícitos de `describe`/`it` se multiplican por FACTOR_TIMEOUT. Vitest fija el timeout de cada prueba al
//   recogerla (el del `describe` se hereda), así que `testTimeout` del config no alcanza a los explícitos.
import * as real from "vitest/dist/index.js";

export * from "vitest/dist/index.js";

export const FACTOR_TIMEOUT = 10;
export const PATRON_RENDIMIENTO = /(?:^|\s)(?:Rendimiento|Rápido):/u;

const escalar = (t) => (typeof t === "number" && Number.isFinite(t) && t > 0 ? t * FACTOR_TIMEOUT : t);

/** Ajusta los argumentos de una llamada de registro (`it(nombre, fn, t)`, `it(nombre, opciones, fn)`, `it(nombre, fn, opciones)`). */
export function ajustarRegistro(args, esPrueba) {
  const [nombre, b, c, ...resto] = args;
  const omitir = esPrueba && typeof nombre === "string" && PATRON_RENDIMIENTO.test(nombre);
  if (typeof b === "function") {
    if (typeof c === "number") return omitir ? [nombre, { timeout: escalar(c), skip: true }, b, ...resto] : [nombre, b, escalar(c), ...resto];
    if (c !== null && typeof c === "object") return omitir ? [nombre, { ...c, timeout: escalar(c.timeout), skip: true }, b, ...resto] : [nombre, b, { ...c, timeout: escalar(c.timeout) }, ...resto];
    return omitir ? [nombre, { skip: true }, b, ...resto] : args;
  }
  if (b !== null && typeof b === "object" && typeof c === "function") {
    const opciones = { ...b, ...("timeout" in b ? { timeout: escalar(b.timeout) } : {}), ...(omitir ? { skip: true } : {}) };
    return [nombre, opciones, c, ...resto];
  }
  return args;
}

const esRegistro = (args) => args.length >= 2 && (typeof args[1] === "function" || typeof args[2] === "function");

/** Envuelve una API encadenable de Vitest (`it`, `it.skip`, `it.each(t)`, `describe.concurrent`...). */
function envolver(api, esPrueba) {
  return new Proxy(api, {
    apply(destino, este, args) {
      const r = Reflect.apply(destino, este, esRegistro(args) ? ajustarRegistro(args, esPrueba) : args);
      // `each(tabla)`, `for(tabla)`, `skipIf(c)`, `runIf(c)` y `extend(f)` devuelven otra API de registro.
      return typeof r === "function" ? envolver(r, esPrueba) : r;
    },
    get(destino, propiedad, receptor) {
      const v = Reflect.get(destino, propiedad, receptor);
      return typeof v === "function" ? envolver(v, esPrueba) : v;
    },
  });
}

export const it = envolver(real.it, true);
export const test = envolver(real.test, true);
export const describe = envolver(real.describe, false);
export const suite = envolver(real.suite, false);
