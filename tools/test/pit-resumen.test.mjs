// sdk-nativo tarea 1.3 (`KM` repartido en CI): resumen de los mutations.xml de PIT.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { leerMutantes, resumir } from "../pit-resumen.mjs";

const mutante = (estado, clase = "a.B", linea = 3) =>
  `<mutation detected='${estado === "SURVIVED" || estado === "NO_COVERAGE" ? "false" : "true"}' status='${estado}' numberOfTestsRun='1'>` +
  `<sourceFile>B.kt</sourceFile><mutatedClass>${clase}</mutatedClass><mutatedMethod>f</mutatedMethod><methodDescription>()V</methodDescription>` +
  `<lineNumber>${linea}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator></mutation>`;
const xml = (...ms) => `<?xml version="1.0" encoding="UTF-8"?>\n<mutations partial="true">\n${ms.join("\n")}\n</mutations>`;

describe("pit-resumen", { timeout: 60_000 }, () => {
  it("lee estado, clase, método, línea y mutador sin paquete", () => {
    expect(leerMutantes(xml(mutante("KILLED", "x.Y", 7)))).toStrictEqual([{ estado: "KILLED", clase: "x.Y", metodo: "f", linea: 7, mutador: "MathMutator" }]);
    expect(() => leerMutantes("<mutation detected='true'><x/></mutation>")).toThrow(/status/);
  });

  it("detectados = KILLED, TIMED_OUT, MEMORY_ERROR y RUN_ERROR; SURVIVED y NO_COVERAGE no", () => {
    const r = resumir(leerMutantes(xml(...["KILLED", "TIMED_OUT", "MEMORY_ERROR", "RUN_ERROR", "SURVIVED", "NO_COVERAGE"].map((e) => mutante(e)))));
    expect(r.total).toBe(6);
    expect(r.detectados).toBe(4);
    expect(r.puntuacion).toBe(66.7);
    expect(r.porClase).toStrictEqual({ "a.B": { total: 6, detectados: 4 } });
    expect(resumir([]).puntuacion).toBe(0);
  });

  it("CLI: suma fragmentos en subdirectorios y sale con 1 bajo el umbral, 0 en el umbral", () => {
    const dir = mkdtempSync(join(tmpdir(), "pit-resumen-"));
    try {
      mkdirSync(join(dir, "a", "pit"), { recursive: true });
      mkdirSync(join(dir, "b"), { recursive: true });
      writeFileSync(join(dir, "a", "pit", "mutations.xml"), xml(mutante("KILLED", "p.A"), mutante("KILLED", "p.A"), mutante("SURVIVED", "p.A")));
      writeFileSync(join(dir, "b", "mutations.xml"), xml(mutante("KILLED", "p.C")));
      const salida = execFileSync(process.execPath, ["tools/pit-resumen.mjs", dir, "--umbral", "75"], { encoding: "utf8" });
      expect(salida).toContain("PIT: 3/4 = 75 % (umbral 75 %)");
      expect(salida).toContain("SURVIVED p.A.f:3 MathMutator");
      expect(() => execFileSync(process.execPath, ["tools/pit-resumen.mjs", dir, "--umbral", "76"], { stdio: "pipe" })).toThrow();
      expect(() => execFileSync(process.execPath, ["tools/pit-resumen.mjs", join(dir, "b", "..", "nada")], { stdio: "pipe" })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
