// LMI-09 (spec lectura-mrz-imagen): versión exacta de tesseract.js, fuente OCR-B de prueba íntegra y aislada, y carga
// diferida de Tesseract.js al importar @lector-cedula/capture.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const cargas = vi.hoisted(() => ({ n: 0 }));

vi.mock("tesseract.js", () => {
  cargas.n++;
  return { default: { createWorker: () => Promise.reject(new Error("no debe llamarse")) } };
});

function archivos(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name));
  } catch {
    return [];
  }
}

describe("LMI-09 Licencias, fuente de prueba y carga diferida", () => {
  it("LMI-09 Licencia y versión", () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, "packages", "capture", "package.json"), "utf8"));
    expect(pkg.dependencies["tesseract.js"]).toBe("7.0.0");
    const instalado = JSON.parse(readFileSync(join(RAIZ, "node_modules", "tesseract.js", "package.json"), "utf8"));
    expect([instalado.version, instalado.license]).toStrictEqual(["7.0.0", "Apache-2.0"]);
  });

  it("LMI-09 Fuente íntegra y aislada", () => {
    const fuente = readFileSync(join(RAIZ, "evals", "sinteticos", "fuentes", "OCRB.otf"));
    expect(createHash("sha256").update(fuente).digest("hex")).toBe("87c8d5bfd541d28023d2ba3383169c49f565e10d487ebb027ea0d735ef558707");
    expect(readFileSync(join(RAIZ, "evals", "sinteticos", "fuentes", "LICENCIA-OCRB.md"), "utf8")).toContain("ocr-0.3.1/OCRB.otf");
    const fuentes = [
      ...readdirSync(join(RAIZ, "packages")).flatMap((p) => archivos(join(RAIZ, "packages", p, "src"))),
      ...archivos(join(RAIZ, "apps")).filter((f) => /[\\/]src[\\/]/u.test(f) && !/node_modules/u.test(f)),
    ];
    expect(fuentes.length).toBeGreaterThan(10);
    expect(fuentes.filter((f) => readFileSync(f, "utf8").includes("OCRB.otf"))).toStrictEqual([]);
  });

  it("LMI-09 Import sin Tesseract", async () => {
    const indice = await import("../../src/index.js");
    expect(typeof indice.crearLectorMrz).toBe("function");
    indice.crearLectorMrz({ rutaModelo: "/m" });
    expect(cargas.n).toBe(0);
  });

  it("LMI-09 La primera lectura sí carga tesseract.js", async () => {
    const { crearLectorMrz } = await import("../../src/index.js");
    const PNG_1x1 = Uint8Array.from(
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
    );
    // Con el modelo real presente, la carga llega a createWorker (simulado, rechaza): modelo-no-disponible.
    const r = await crearLectorMrz({ rutaModelo: join(RAIZ, "models", "tesseract") }).leer(PNG_1x1, { fechaReferencia: "2026-10-06" });
    expect(r).toStrictEqual({ ok: false, error: "modelo-no-disponible" });
    expect(cargas.n).toBe(1);
  });
});
