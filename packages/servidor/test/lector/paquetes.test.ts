// MOT-19 (motor como peerDependency opcional) y MOT-20 (protocolo compartido sin dependencias): pruebas estáticas
// sobre los package.json y las importaciones de las fuentes de packages/web y packages/servidor.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PAQUETES = fileURLToPath(new URL("../../../", import.meta.url));

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

function paquete(nombre: string): PackageJson {
  return JSON.parse(readFileSync(join(PAQUETES, nombre, "package.json"), "utf8")) as PackageJson;
}

/** Archivos `.ts` de `packages/<nombre>/src`, recursivo. */
function fuentes(nombre: string): string[] {
  const raiz = join(PAQUETES, nombre, "src");
  return readdirSync(raiz, { recursive: true, encoding: "utf8" })
    .filter((r) => r.endsWith(".ts"))
    .map((r) => join(raiz, r));
}

const IMPORTA_PROTOCOLO = /\b(?:from|import)\s*\(?\s*["']@lector-cedula\/protocolo["']/;

function archivosQueImportanProtocolo(nombre: string): string[] {
  return fuentes(nombre).filter((f) => IMPORTA_PROTOCOLO.test(readFileSync(f, "utf8")));
}

describe("MOT-19 y MOT-20 paquetes", () => {
  it("MOT-19 Motor como peerDependency opcional", () => {
    const servidor = paquete("servidor");
    expect(servidor.peerDependencies?.["@lector-cedula/motor"]).toEqual(expect.any(String));
    expect(servidor.peerDependenciesMeta?.["@lector-cedula/motor"]?.optional).toBe(true);
    // El motor no se instala con el servidor: no es dependencia directa.
    expect(Object.keys(servidor.dependencies ?? {})).not.toContain("@lector-cedula/motor");
  });

  it("MOT-20 Protocolo compartido sin dependencias", () => {
    expect(paquete("protocolo")).not.toHaveProperty("dependencies");
    for (const nombre of ["web", "servidor"]) {
      expect(paquete(nombre).dependencies?.["@lector-cedula/protocolo"], nombre).toEqual(expect.any(String));
      expect(archivosQueImportanProtocolo(nombre).length, nombre).toBeGreaterThan(0);
    }
  });

  it("MOT-20 el detector de importaciones reconoce las formas usadas y rechaza otros paquetes", () => {
    expect(IMPORTA_PROTOCOLO.test('import type { Rechazo } from "@lector-cedula/protocolo";')).toBe(true);
    expect(IMPORTA_PROTOCOLO.test("export { ErrorMotor } from '@lector-cedula/protocolo';")).toBe(true);
    expect(IMPORTA_PROTOCOLO.test('const p = await import("@lector-cedula/protocolo");')).toBe(true);
    expect(IMPORTA_PROTOCOLO.test('import { x } from "@lector-cedula/protocolo-otro";')).toBe(false);
    expect(IMPORTA_PROTOCOLO.test('import { x } from "@lector-cedula/motor";')).toBe(false);
  });
});
