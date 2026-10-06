// Integración del corredor de evals (EV-01, EV-03, EV-04, EV-05): lanza evals/runners/eval-campo.mjs con
// spawnSync sobre directorios temporales de fixtures y reportes (design.md, decisión 15). Nunca escribe en
// evals/reports/: se comprueba comparando los bytes antes y después. Datos sintéticos (prefijo 9999).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CORREDOR = join("evals", "runners", "eval-campo.mjs");
// Solo se protege el baseline: latest.json es efímero (no versionado) y otras ejecuciones concurrentes lo reescriben.
const REPORTES_REALES = ["baseline.json"].map((n) => join(RAIZ, "evals", "reports", n));
const LIMITE_MS = 120_000;

const ESPERADO_VALIDO = { valido: true, numero: "9999123456", tipoProbable: "nuip", digitos: 10, warnings: [] };

let temporales = [];
let bytesAntes = [];

function directorioTemporal(prefijo) {
  const dir = mkdtempSync(join(tmpdir(), `eval-campo-${prefijo}-`));
  temporales.push(dir);
  return dir;
}

function escribirFixture(dir, nombre, contenido) {
  const carpeta = join(dir, "sinteticos", "nuip-formato");
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, nombre), `${JSON.stringify(contenido, null, 2)}\n`);
}

function fixtureValido(extra = {}) {
  return { sintetico: true, tipo: "nuip-formato", entrada: "9999123456", esperado: ESPERADO_VALIDO, ...extra };
}

function correr(fixtures, reportes, ...extra) {
  return spawnSync(process.execPath, [CORREDOR, "--quick", "--fixtures", fixtures, "--reportes", reportes, ...extra], {
    cwd: RAIZ,
    encoding: "utf8",
    timeout: LIMITE_MS,
  });
}

function leerJson(ruta) {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

function leerBytes(ruta) {
  return existsSync(ruta) ? readFileSync(ruta) : null;
}

beforeEach(() => {
  bytesAntes = REPORTES_REALES.map(leerBytes);
});

afterEach(() => {
  for (const dir of temporales) rmSync(dir, { recursive: true, force: true });
  temporales = [];
  // EV-04: ninguna ejecución con --reportes toca evals/reports/.
  expect(REPORTES_REALES.map(leerBytes)).toStrictEqual(bytesAntes);
});

describe("eval-campo.mjs (integración con directorios temporales)", () => {
  it(
    "EV-01 El corredor propaga la marca del fixture (atrapa: eval-campo no copia clavesExactas o acepta el texto \"true\")",
    () => {
      const fixtures = directorioTemporal("fix");
      const reportes = directorioTemporal("rep");
      escribirFixture(fixtures, "marca-1.json", fixtureValido({ clavesExactas: true }));
      escribirFixture(fixtures, "marca-2.json", fixtureValido({ clavesExactas: true }));
      escribirFixture(fixtures, "marca-texto.json", fixtureValido({ clavesExactas: "true" }));

      const r = correr(fixtures, reportes);

      expect(r.status, r.stderr).toBe(0);
      const latest = leerJson(join(reportes, "latest.json"));
      expect(latest.metricas["nuip-formato"].__claves).toStrictEqual({ n: 2, exact_match: 1, cer: 0 });
      expect(latest.metricas["nuip-formato"].valido.n).toBe(3);
    },
    LIMITE_MS,
  );

  it(
    "EV-03 El corredor falla si se pierden fixtures (atrapa: borrar fixtures sin que la eval avise)",
    () => {
      const fixtures = directorioTemporal("fix");
      const reportes = directorioTemporal("rep");
      writeFileSync(
        join(reportes, "baseline.json"),
        JSON.stringify({ metricas: { "nuip-formato": { valido: { n: 3, exact_match: 1, cer: 0 } } } }),
      );
      escribirFixture(fixtures, "uno.json", fixtureValido({ esperado: { valido: true } }));
      escribirFixture(fixtures, "dos.json", fixtureValido({ esperado: { valido: true } }));

      const r = correr(fixtures, reportes);

      expect(r.status).toBe(1);
      expect(r.stderr).toContain("nuip-formato.valido");
      // Los dos valores de n en la misma línea de la regresión (las rutas temporales también tienen dígitos).
      const linea = r.stderr.split("\n").find((l) => l.includes("nuip-formato.valido"));
      expect(linea).toContain("3");
      expect(linea).toContain("2");
    },
    LIMITE_MS,
  );

  it(
    "EV-03 Un baseline de otro modo no compara n (atrapa: comparar quick con completo; decisión del orquestador)",
    () => {
      const fixtures = directorioTemporal("fix");
      const reportes = directorioTemporal("rep");
      writeFileSync(
        join(reportes, "baseline.json"),
        JSON.stringify({ modo: "completo", metricas: { "nuip-formato": { valido: { n: 3, exact_match: 1, cer: 0 } } } }),
      );
      escribirFixture(fixtures, "uno.json", fixtureValido({ esperado: { valido: true } }));
      escribirFixture(fixtures, "dos.json", fixtureValido({ esperado: { valido: true } }));

      const r = correr(fixtures, reportes);

      expect(r.status, r.stderr).toBe(0);
      expect(r.stderr).not.toContain("n bajó");
    },
    LIMITE_MS,
  );

  it(
    "EV-04 Ejecución aislada en directorios temporales (atrapa: rutas fijas a evals/fixtures o evals/reports)",
    () => {
      const fixtures = directorioTemporal("fix");
      const reportes = directorioTemporal("rep");
      escribirFixture(fixtures, "valido.json", fixtureValido());

      const r = correr(fixtures, reportes);

      expect(r.status, r.stderr).toBe(0);
      const latest = leerJson(join(reportes, "latest.json"));
      expect(latest.casos).toBe(1);
      expect(latest.modo).toBe("quick");
    },
    LIMITE_MS,
  );

  it(
    "EV-04 --guardar-baseline escribe solo en el directorio de reportes y registra el modo (atrapa: baseline real sobrescrito)",
    () => {
      const fixtures = directorioTemporal("fix");
      const reportes = directorioTemporal("rep");
      escribirFixture(fixtures, "valido.json", fixtureValido());

      const r = correr(fixtures, reportes, "--guardar-baseline");

      expect(r.status, r.stderr).toBe(0);
      const baseline = leerJson(join(reportes, "baseline.json"));
      expect(baseline.modo).toBe("quick");
      expect(baseline.metricas["nuip-formato"].valido).toStrictEqual({ n: 1, exact_match: 1, cer: 0 });
    },
    LIMITE_MS,
  );

  it(
    "EV-04 Directorio de fixtures inexistente (atrapa: tratarlo como cero fixtures y salir con 0)",
    () => {
      const base = directorioTemporal("fix");
      const inexistente = join(base, "no-existe");
      const reportes = directorioTemporal("rep");

      const r = correr(inexistente, reportes);

      expect(r.status).toBe(1);
      expect(r.stderr).toContain(inexistente);
      expect(existsSync(join(reportes, "latest.json"))).toBe(false);
    },
    LIMITE_MS,
  );

  it(
    "EV-05 Fixture sin esperado (atrapa: TypeError sin ruta o reporte escrito con datos parciales)",
    () => {
      const fixtures = directorioTemporal("fix");
      const reportes = directorioTemporal("rep");
      escribirFixture(fixtures, "valido.json", fixtureValido());
      escribirFixture(fixtures, "sin-esperado.json", { sintetico: true, tipo: "nuip-formato", entrada: "9999123456" });

      const r = correr(fixtures, reportes);

      expect(r.status).toBe(1);
      expect(r.stderr).toContain("sin-esperado.json");
      expect(r.stderr).toContain("nuip-formato");
      expect(r.stderr).toContain("esperado");
      expect(existsSync(join(reportes, "latest.json"))).toBe(false);
    },
    LIMITE_MS,
  );
});
