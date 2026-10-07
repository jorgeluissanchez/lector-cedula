#!/usr/bin/env node
// fixture-sintetico: genera evals/fixtures/sinteticos/pdf417-amarilla/*.json (cambio parser-pdf417-amarilla, design.md
// decisión 15). 12 casos de casosPdf417() y 6 de error derivados de completa-base según sus rangos. Determinista
// (el catálogo usa semilla 1). El `esperado` sale de `esperado` del generador y de tablas literales, nunca del parser.
// Uso: node tools/fixtures/pdf417-amarilla.mjs   (escribe los archivos; requiere `npm run typecheck` antes)
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { casosPdf417 } from "../../packages/fixtures/dist/index.js";

export const DIRECTORIO = "evals/fixtures/sinteticos/pdf417-amarilla";

/** Trama y hipótesis no confirmadas que el parser debe informar por variante del generador (PA-19, PA-21). */
const TRAMA = {
  completa: { variante: "completa", modo: "offsets", bloqueDemografico: "sexo-primero", warnings: [] },
  "windows-truncada": { variante: "truncada", modo: "patrones", bloqueDemografico: "sexo-primero", warnings: ["H02"] },
  "sin-pubdsk": { variante: "sin-pubdsk", modo: "patrones", bloqueDemografico: "sexo-primero", warnings: ["H07"] },
  "fecha-primero": { variante: "completa", modo: "patrones", bloqueDemografico: "fecha-primero", warnings: ["H08"] },
};

function esperadoExito(f) {
  const e = f.esperado;
  const t = TRAMA[f.variante];
  const sinDivipol = f.variante === "fecha-primero";
  return {
    ok: true,
    numeroDocumento: e.nuip,
    primerApellido: e.primerApellido,
    segundoApellido: e.segundoApellido === "" ? null : e.segundoApellido,
    primerNombre: e.primerNombre,
    segundoNombre: e.segundoNombre === "" ? null : e.segundoNombre,
    sexo: e.sexo,
    fechaNacimiento: e.fechaNacimiento,
    rh: e.rh,
    codigoDepartamentoNacimiento: sinDivipol ? null : e.departamento,
    codigoMunicipioNacimiento: sinDivipol ? null : e.municipio,
    variante: t.variante,
    modo: t.modo,
    bloqueDemografico: t.bloqueDemografico,
    warnings: t.warnings,
  };
}

/** Casos de error de PA-03 construidos sobre los rangos de completa-base. */
function casosError(base) {
  const r = base.rangos;
  const con = (cambiar) => {
    const b = Uint8Array.from(base.bytes);
    cambiar(b);
    return b;
  };
  const fecha = (b, texto) => [...texto].forEach((c, i) => (b[r.bloqueDemografico[0] + 2 + i] = c.charCodeAt(0)));
  return [
    ["error-nuip-no-encontrado", "Campo NUIP en 0x00: ningún run de 10 dígitos antes de una letra", "nuip-no-encontrado", con((b) => b.fill(0, r.nuip[0], r.nuip[1]))],
    ["error-nuip-invalido", "Campo NUIP 0000000000", "nuip-invalido", con((b) => b.fill(0x30, r.nuip[0], r.nuip[1]))],
    ["error-caracteres-invalidos", "Punto (0x2E) dentro del primer apellido", "caracteres-invalidos-en-nombre", con((b) => (b[r.primerApellido[0] + 2] = 0x2e))],
    ["error-nombres-no-reconocidos", "Segundo apellido y nombres en 0x00", "nombres-no-reconocidos", con((b) => b.fill(0, r.segundoApellido[0], r.segundoNombre[1]))],
    ["error-bloque-no-encontrado", "Sexo X en el bloque demográfico", "bloque-demografico-no-encontrado", con((b) => (b[r.bloqueDemografico[0] + 1] = 0x58))],
    ["error-fecha-invalida", "Fecha de nacimiento 19850230", "fecha-nacimiento-invalida", con((b) => fecha(b, "19850230"))],
  ];
}

const hex = (bytes) => Buffer.from(bytes).toString("hex");

function json(id, descripcion, bytes, esperado) {
  const fixture = { sintetico: true, tipo: "pdf417-amarilla", descripcion, entrada: hex(bytes), clavesExactas: true, esperado };
  return [`${id}.json`, JSON.stringify(fixture, null, 2) + "\n"];
}

/** Nombre de archivo -> contenido de los 18 fixtures. */
export function fixturesPdf417Amarilla() {
  const casos = casosPdf417();
  const base = casos.find((c) => c.id === "completa-base").fixture;
  return Object.fromEntries([
    ...casos.map((c) => json(c.id, c.descripcion, c.fixture.bytes, esperadoExito(c.fixture))),
    ...casosError(base).map(([id, descripcion, error, bytes]) => json(id, descripcion, bytes, { ok: false, error })),
  ]);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const raiz = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const carpeta = join(raiz, DIRECTORIO);
  mkdirSync(carpeta, { recursive: true });
  for (const viejo of readdirSync(carpeta)) rmSync(join(carpeta, viejo));
  const fixtures = fixturesPdf417Amarilla();
  for (const [nombre, texto] of Object.entries(fixtures)) writeFileSync(join(carpeta, nombre), texto);
  console.log(`pdf417-amarilla: ${Object.keys(fixtures).length} fixtures en ${DIRECTORIO}`);
}
