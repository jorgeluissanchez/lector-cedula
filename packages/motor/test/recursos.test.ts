// MOT-06 (SHA-256 del modelo) y MOT-07 (modo de prueba __registroBuferes), sin OCR: rápidas para la mutación.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registrarBufer, rutaModeloPorDefecto, SHA256_MRZ, verificarModelo } from "../src/recursos.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function directorio(contenido?: Uint8Array): string {
  const d = mkdtempSync(join(tmpdir(), "motor-recursos-"));
  dirs.push(d);
  if (contenido) writeFileSync(join(d, "mrz.traineddata"), contenido);
  return d;
}

async function codigo(f: () => void): Promise<string> {
  try {
    f();
    return "ok";
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? "sin-codigo";
  }
}

describe("recursos del motor", { timeout: 60_000 }, () => {
  it("MOT-06 el modelo del repositorio pasa la verificación", async () => {
    expect(await codigo(() => verificarModelo(rutaModeloPorDefecto()))).toBe("ok");
  });

  it("MOT-06 un byte alterado, un modelo ausente o un hash distinto dan recurso-corrupto", async () => {
    const modelo = readFileSync(join(rutaModeloPorDefecto(), "mrz.traineddata"));
    const alterado = new Uint8Array(modelo);
    alterado[0] = (alterado[0] ?? 0) ^ 1;
    expect(await codigo(() => verificarModelo(directorio(alterado)))).toBe("recurso-corrupto");
    expect(await codigo(() => verificarModelo(directorio()))).toBe("recurso-corrupto");
    expect(await codigo(() => verificarModelo(directorio(new Uint8Array(modelo)), "0".repeat(64)))).toBe("recurso-corrupto");
    expect(await codigo(() => verificarModelo(directorio(new Uint8Array(modelo)), SHA256_MRZ))).toBe("ok");
  });

  it("MOT-06 LECTOR_CEDULA_RUTA_MODELO_MRZ cambia la ruta por omisión", () => {
    const antes = process.env.LECTOR_CEDULA_RUTA_MODELO_MRZ;
    try {
      process.env.LECTOR_CEDULA_RUTA_MODELO_MRZ = "/ruta/sintetica";
      expect(rutaModeloPorDefecto()).toBe("/ruta/sintetica");
      process.env.LECTOR_CEDULA_RUTA_MODELO_MRZ = "";
      expect(rutaModeloPorDefecto().replaceAll("\\", "/")).toMatch(/models\/tesseract$/u);
    } finally {
      if (antes === undefined) delete process.env.LECTOR_CEDULA_RUTA_MODELO_MRZ;
      else process.env.LECTOR_CEDULA_RUTA_MODELO_MRZ = antes;
    }
  });

  it("MOT-07 registrarBufer solo registra con NODE_ENV=test y el arreglo instalado", () => {
    const clave = Symbol.for("@lector-cedula/motor.registroBuferes");
    const b = new Uint8Array(2);
    expect(registrarBufer(b)).toBe(b);
    const registro: unknown[] = [];
    (globalThis as Record<symbol, unknown>)[clave] = registro;
    const entorno = process.env.NODE_ENV;
    try {
      registrarBufer(b);
      expect(registro).toStrictEqual([b]);
      process.env.NODE_ENV = "production";
      registrarBufer(b);
      expect(registro).toHaveLength(1);
    } finally {
      process.env.NODE_ENV = entorno;
      Reflect.deleteProperty(globalThis, clave);
    }
  });
});
