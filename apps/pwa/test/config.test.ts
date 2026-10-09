// Cambio otros-documentos, OD-30 (tarea 6.1): `VITE_ADMITIR_TI` ("true" o "false"; ausente es "false"; otro valor hace
// fallar la compilación nombrando la variable).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { leerAdmitirTi } from "../config";
import { textosAutorizacionTi } from "../legal-paginas";

const PWA = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("OD-30 Parámetro admitirTarjetaIdentidad en la PWA", { timeout: 60_000 }, () => {
  it("OD-30 Valores por defecto: ausente o vacío es false", () => {
    expect(leerAdmitirTi(undefined)).toBe(false);
    expect(leerAdmitirTi("")).toBe(false);
  });

  it("OD-30 true y false literales", () => {
    expect(leerAdmitirTi("true")).toBe(true);
    expect(leerAdmitirTi("false")).toBe(false);
  });

  it("OD-30 Valores inválidos: lanza nombrando VITE_ADMITIR_TI", () => {
    for (const v of ["si", "1", "TRUE", " true", "yes"]) expect(() => leerAdmitirTi(v), v).toThrow(/VITE_ADMITIR_TI/u);
  });

  it("OD-30 Valores inválidos: la compilación termina con código distinto de 0 y nombra la variable", () => {
    // Salida en un temporal fuera del repositorio: si la validación fallara, la compilación no deja nada en apps/pwa.
    const salida = mkdtempSync(join(tmpdir(), "pwa-od30-"));
    try {
      const r = spawnSync(process.execPath, [join(PWA, "..", "..", "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", salida, "--emptyOutDir"], {
        cwd: PWA,
        env: { ...process.env, VITE_ADMITIR_TI: "si" },
        encoding: "utf8",
      });
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain("VITE_ADMITIR_TI");
    } finally {
      rmSync(salida, { recursive: true, force: true });
    }
  });
});

describe("OD-35 Texto de la autorización del representante según el parámetro", () => {
  const MD = "# Autorización\n\nLey 1581 de 2012, artículo 7.\n";
  it("OD-35 apagado: sin texto (no se lee nada)", () => {
    const leer = (): string => {
      throw new Error("no debe leerse");
    };
    expect(textosAutorizacionTi(false, () => true, leer)).toBeNull();
  });

  it("OD-34b encendido: bloques de la plantilla (publicacion/ si existe)", () => {
    const leidas: string[] = [];
    const bloques = textosAutorizacionTi(true, (r) => r === "docs/legal/autorizacion-representante-ti.md", (r) => (leidas.push(r), MD));
    expect(leidas).toStrictEqual(["docs/legal/autorizacion-representante-ti.md"]);
    expect(bloques).toStrictEqual([
      { tipo: "titulo", texto: "Autorización" },
      { tipo: "parrafo", texto: "Ley 1581 de 2012, artículo 7." },
    ]);
  });

  it("OD-35 encendido sin la plantilla: falla nombrando el archivo", () => {
    expect(() => textosAutorizacionTi(true, () => false, () => "")).toThrow(/autorizacion-representante-ti\.md/u);
  });
});
