// fixture-sintetico: este archivo busca el marcador PubDSK_1 en la fuente del generador sintético.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { revisarArchivo } from "../../../tools/privacidad-check.mjs";
import * as modulo from "@lector-cedula/fixtures";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const PAQUETE = join(RAIZ, "packages", "fixtures");

/** Archivos (rutas relativas a la raíz con `/`) de una carpeta del paquete, recursivamente. */
function archivosDe(carpeta: string): string[] {
  const base = join(PAQUETE, carpeta);
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(RAIZ.length).replace(/\\/g, "/"));
}

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), "utf8");
}

describe("FX-01 Paquete de pruebas privado", () => {
  it("FX-01 Paquete privado", () => {
    const pkg = JSON.parse(leer("packages/fixtures/package.json")) as Record<string, unknown>;
    expect(pkg.name).toBe("@lector-cedula/fixtures");
    expect(pkg.private).toBe(true);
  });

  it("FX-01 Ningún paquete de producción depende del generador", () => {
    const manifiestos: string[] = [];
    for (const grupo of ["packages", "apps"]) {
      const dir = join(RAIZ, grupo);
      if (!existsSync(dir)) continue;
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre, "package.json");
        if (existsSync(ruta)) manifiestos.push(ruta);
      }
    }
    expect(manifiestos.length).toBeGreaterThanOrEqual(2);
    for (const ruta of manifiestos) {
      const pkg = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, Record<string, string> | undefined>;
      for (const seccion of ["dependencies", "peerDependencies", "optionalDependencies"]) {
        expect(Object.keys(pkg[seccion] ?? {}), `${ruta} ${seccion}`).not.toContain("@lector-cedula/fixtures");
      }
    }
  });

  it("FX-01 Privacidad del paquete", () => {
    const archivos = [...archivosDe("src"), ...archivosDe("test")];
    expect(archivos.length).toBeGreaterThan(1);
    for (const ruta of archivos) {
      expect(revisarArchivo(ruta, leer(ruta)), ruta).toStrictEqual([]);
    }
    const lineasConMarcador = archivosDe("src").flatMap((ruta) => leer(ruta).split("\n").filter((l) => l.includes("PubDSK_1")));
    expect(lineasConMarcador).toHaveLength(1);
    expect(lineasConMarcador[0]).toContain("privacidad-ok:");
  });

  it("FX-01 Sin E/S ni aleatoriedad externa en la fuente", () => {
    const prohibidas = ["node:", "fetch(", "writeFile", "readFile", "console.", "Math.random", "Date.now", "new Date("];
    const archivos = archivosDe("src");
    expect(archivos.length).toBeGreaterThan(0);
    for (const ruta of archivos) {
      const texto = leer(ruta);
      for (const cadena of prohibidas) expect(texto.includes(cadena), `${ruta}: ${cadena}`).toBe(false);
    }
  });
});

describe("FX-02 Interfaz pública estable", () => {
  it("FX-02 Versión del contrato", () => {
    expect(modulo.VERSION_CONTRATO).toBe("1.0.0");
  });
});
