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

/** OD-21 (otros-documentos, tarea 3.1): tamaño de los conjuntos TD3 y CE, distorsiones sobre los primeros y umbral por grupo. */
export const N_OTROS = 40;
export const N_OTROS_DISTORSION = 20;
export const UMBRAL_OTROS = 0.9;
export const SEMILLA_TD3 = 20261010;
export const SEMILLA_CE = 20261011;

/**
 * Conjuntos sintéticos de otros documentos: `td3` (pasaportes colombianos y extranjeros, se leen con `formato: "td3"`)
 * y `ce` (cédulas de extranjería TD1). Cada entrada lleva `camposEsperados` de `clasificarDocumento` sobre sus líneas.
 */
export async function conjuntosOtros(n = N_OTROS) {
  const { clasificarDocumento } = await import("../../packages/parsers/dist/index.js");
  const { pasaporteFicticio, ceFicticia } = await import("../sinteticos/generador-icao.mjs");
  const armar = (crear, semilla) => {
    const r = [];
    const vistos = new Set();
    for (let i = 0; r.length < n; i++) {
      const f = crear(semilla + i);
      const clave = f.lineas.join("");
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const c = clasificarDocumento(f.lineas, { fechaReferencia: FECHA_REFERENCIA });
      if (!c.ok) throw new Error("fixture sintético no clasificable");
      r.push({ ...f, camposEsperados: c.campos });
    }
    return r;
  };
  return { td3: armar(pasaporteFicticio, SEMILLA_TD3), ce: armar(ceFicticia, SEMILLA_CE) };
}

const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** "correcta", "falsa" (4 dígitos válidos con otras líneas) o "fallo" para una lectura con verdad `v`. */
export function clasificar(lectura, v) {
  if (lectura?.ok === true && lectura.documento?.ok === true) {
    // OD-21: un documento (pasaporte o CE) solo sale con todos sus dígitos válidos; si sus campos no son los de la verdad, es falso.
    return v.camposEsperados !== undefined && iguales(lectura.documento.campos, v.camposEsperados) ? "correcta" : "falsa";
  }
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
  if (!Object.values(reporte.distorsiones).every((g) => g.correctas >= Math.ceil(UMBRAL_DISTORSION * g.n))) return false;
  // OD-21: pasaporte y CE, 0 falsas y al menos el 90 % por grupo (limpias y cada distorsión).
  return ["td3", "ce"]
    .filter((t) => reporte[t] !== undefined)
    .flatMap((t) => [reporte[t].limpias, ...Object.values(reporte[t].distorsiones)])
    .every((g) => g.falsas === 0 && g.correctas >= Math.ceil(UMBRAL_OTROS * g.n));
}

/**
 * Ejecuta el eval. `lectores` es una lista de lectores (`leer(bytes, opciones)`) que trabajan en paralelo;
 * `renderizar(lineas, opciones)` devuelve `{ bytes }`. Devuelve el reporte (solo contadores).
 */
export async function ejecutarEval({ lectores, renderizar, conjunto, otros, nDistorsion = 50 }) {
  const tareas = [];
  const nuevoGrupo = () => ({ limpias: contadores(), distorsiones: Object.fromEntries(DISTORSIONES.map((d) => [d, contadores()])) });
  const reporte = nuevoGrupo();
  const agregar = (lista, destino, n, lectura) =>
    lista.forEach((v, i) => {
      tareas.push({ destino: destino.limpias, v, opciones: {}, lectura });
      if (i < n) for (const d of DISTORSIONES) tareas.push({ destino: destino.distorsiones[d], v, opciones: { distorsion: d, semillaRuido: i + 1 }, lectura });
    });
  agregar(conjunto, reporte, nDistorsion, {});
  // OD-21: pasaportes con formato td3 y CE con td1 (el lector por defecto), en grupos aparte del reporte.
  if (otros !== undefined) {
    reporte.td3 = nuevoGrupo();
    reporte.ce = nuevoGrupo();
    agregar(otros.td3, reporte.td3, N_OTROS_DISTORSION, { formato: "td3" });
    agregar(otros.ce, reporte.ce, N_OTROS_DISTORSION, {});
  }
  let siguiente = 0;
  await Promise.all(
    lectores.map(async (lector) => {
      while (siguiente < tareas.length) {
        const t = tareas[siguiente++];
        const { bytes } = await renderizar(t.v.lineas, t.opciones);
        const clase = clasificar(await lector.leer(bytes, { fechaReferencia: FECHA_REFERENCIA, ...t.lectura }), t.v);
        const g = t.destino;
        g.n++;
        if (clase === "correcta") g.correctas++;
        if (clase === "falsa") g.falsas++;
      }
    }),
  );
  return { ...reporte, cumple: cumple(reporte) };
}

/** Corre el eval, escribe el reporte en `salida` y devuelve el código de salida (0 cumple, 1 no). */
export async function correr({ lectores, renderizar, conjunto, otros, salida = SALIDA, log = console.log }) {
  const reporte = await ejecutarEval({ lectores, renderizar, conjunto: conjunto ?? (await conjuntoE()), otros });
  await writeFile(salida, `${JSON.stringify(reporte, null, 2)}\n`);
  const fila = (nombre, g) => `${nombre.padEnd(12)} ${g.correctas}/${g.n} correctas, ${g.falsas} falsas`;
  log(fila("limpias", reporte.limpias));
  for (const [d, g] of Object.entries(reporte.distorsiones)) log(fila(d, g));
  for (const t of ["td3", "ce"].filter((x) => reporte[x] !== undefined)) {
    log(fila(`${t} limpias`, reporte[t].limpias));
    for (const [d, g] of Object.entries(reporte[t].distorsiones)) log(fila(`${t} ${d}`, g));
  }
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
    return await correr({ lectores, renderizar: (l, o) => renderizador.render(l, o), otros: await conjuntosOtros() });
  } finally {
    await renderizador.cerrar();
    await Promise.all(lectores.map((l) => l.terminar()));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await principal();
}
