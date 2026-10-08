#!/usr/bin/env node
// Eval de la MRZ desde imagen (cambio leer-mrz-desde-imagen, LMI-06; design.md, decisión 9).
// Uso: npm run eval:mrz-imagen   (requiere npm run modelos:mrz)
// Conjunto E: 200 personas ficticias (fast-check, semilla 20261006) renderizadas como reverso R y 9 distorsiones
// sobre las 50 primeras (más el reverso al revés, rotacion180, de mrz-giro-180). El reporte evals/reports/mrz-imagen.json solo lleva contadores (ni líneas ni NUIP).
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fc from "fast-check";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SALIDA = join(RAIZ, "evals", "reports", "mrz-imagen.json");
export const SEMILLA_E = 20261006;
export const FECHA_REFERENCIA = "2026-10-06";
export const DISTORSIONES = ["rotacion+2", "rotacion-2", "blur1", "brillo+20", "brillo-20", "jpeg70", "escala0.8", "ruido8", "rotacion180"];
/** Umbrales de LMI-06 como fracciones (98 % limpias, 90 % provisional por distorsión). */
export const UMBRAL_LIMPIAS = 0.98;
export const UMBRAL_DISTORSION = 0.9;

/**
 * Conjunto E: las `n` primeras personas de `fc.sample(arbPersonaFicticia(), { seed: 20261006 })` que caben en una MRZ
 * TD1, con `generarMrzTd1(persona, { semilla: i + 1 })` (`i` = posición en el conjunto). DESVIACIÓN pendiente de
 * ratificar: la spec toma las 200 primeras sin filtrar, pero 79 de ellas lanzan `nombre-excede-mrz` o
 * `nuip-no-soportado-en-mrz` (arbPersonaFicticia admite nombres largos y NUIP de 8 dígitos).
 */
export async function conjuntoE(n = 200) {
  const { arbPersonaFicticia, generarMrzTd1, ErrorFixture } = await import("../../packages/fixtures/dist/index.js");
  const r = [];
  for (const p of fc.sample(arbPersonaFicticia(), { seed: SEMILLA_E, numRuns: n * 4 })) {
    if (r.length === n) break;
    try {
      r.push(generarMrzTd1(p, { semilla: r.length + 1 }));
    } catch (e) {
      if (!(e instanceof ErrorFixture)) throw e;
    }
  }
  if (r.length !== n) throw new Error("conjunto E incompleto");
  return r;
}

const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** "correcta", "falsa" (4 dígitos válidos con otras líneas) o "fallo" para una lectura con verdad `v`. */
export function clasificar(lectura, v) {
  const r = lectura?.ok === true ? lectura.resultado : null;
  if (r?.ok !== true) return "fallo";
  const d = r.digitosControl;
  const cuatro = [d.serial, d.nacimiento, d.vencimiento, d.compuesto].every((x) => x.estado === "valido");
  if (!cuatro) return "fallo";
  return iguales(r.lineasCorregidas, v.lineasSinErrores) ? "correcta" : "falsa";
}

const contadores = () => ({ n: 0, correctas: 0, falsas: 0 });

/** `true` si el reporte cumple LMI-06. */
export function cumple(reporte) {
  const grupos = [reporte.limpias, ...Object.values(reporte.distorsiones)];
  if (grupos.some((g) => g.falsas !== 0)) return false;
  if (reporte.limpias.correctas < Math.ceil(UMBRAL_LIMPIAS * reporte.limpias.n)) return false;
  return Object.values(reporte.distorsiones).every((g) => g.correctas >= Math.ceil(UMBRAL_DISTORSION * g.n));
}

/**
 * Ejecuta el eval. `lectores` es una lista de lectores (`leer(bytes, opciones)`) que trabajan en paralelo;
 * `renderizar(lineas, opciones)` devuelve `{ bytes }`. Devuelve el reporte (solo contadores).
 */
export async function ejecutarEval({ lectores, renderizar, conjunto, nDistorsion = 50 }) {
  const tareas = [];
  conjunto.forEach((v, i) => {
    tareas.push({ grupo: null, v, opciones: {} });
    if (i < nDistorsion) for (const d of DISTORSIONES) tareas.push({ grupo: d, v, opciones: { distorsion: d, semillaRuido: i + 1 } });
  });
  const reporte = { limpias: contadores(), distorsiones: Object.fromEntries(DISTORSIONES.map((d) => [d, contadores()])) };
  let siguiente = 0;
  await Promise.all(
    lectores.map(async (lector) => {
      while (siguiente < tareas.length) {
        const t = tareas[siguiente++];
        const { bytes } = await renderizar(t.v.lineas, t.opciones);
        const clase = clasificar(await lector.leer(bytes, { fechaReferencia: FECHA_REFERENCIA }), t.v);
        const g = t.grupo === null ? reporte.limpias : reporte.distorsiones[t.grupo];
        g.n++;
        if (clase === "correcta") g.correctas++;
        if (clase === "falsa") g.falsas++;
      }
    }),
  );
  return { ...reporte, cumple: cumple(reporte) };
}

/** Corre el eval, escribe el reporte en `salida` y devuelve el código de salida (0 cumple, 1 no). */
export async function correr({ lectores, renderizar, conjunto, salida = SALIDA, log = console.log }) {
  const reporte = await ejecutarEval({ lectores, renderizar, conjunto: conjunto ?? (await conjuntoE()) });
  await writeFile(salida, `${JSON.stringify(reporte, null, 2)}\n`);
  const fila = (nombre, g) => `${nombre.padEnd(12)} ${g.correctas}/${g.n} correctas, ${g.falsas} falsas`;
  log(fila("limpias", reporte.limpias));
  for (const [d, g] of Object.entries(reporte.distorsiones)) log(fila(d, g));
  log(reporte.cumple ? "eval:mrz-imagen: OK" : "eval:mrz-imagen: NO CUMPLE LMI-06");
  return reporte.cumple ? 0 : 1;
}

// Punto de entrada con OCR y navegador reales: lo ejerce `npm run eval:mrz-imagen` (verificación del cambio), no las
// pruebas unitarias; se excluye de la mutación.
// Stryker disable all
async function principal() {
  const { crearLectorMrz } = await import("../../packages/capture/dist/index.js");
  const { crearRenderizador } = await import("../sinteticos/render-mrz.mjs");
  const { cpus } = await import("node:os");
  const rutaModelo = join(RAIZ, "models", "tesseract");
  const lectores = Array.from({ length: Math.max(1, Math.min(4, cpus().length - 1)) }, () => crearLectorMrz({ rutaModelo }));
  const renderizador = await crearRenderizador();
  try {
    return await correr({ lectores, renderizar: (l, o) => renderizador.render(l, o) });
  } finally {
    await renderizador.cerrar();
    await Promise.all(lectores.map((l) => l.terminar()));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await principal();
}
