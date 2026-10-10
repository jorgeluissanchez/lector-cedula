// NAT-07 "Sin reglas en nativo" (sdk-nativo): las fuentes Kotlin y Swift de `native/` no contienen reglas de campos;
// esas reglas solo viven en el bundle. Las pruebas nativas (src/test, src/androidTest, Tests/) quedan fuera.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = fileURLToPath(new URL("../../..", import.meta.url));
const PROHIBIDAS = ['"AB+"', '"O-"', "calcularDigitoVerificador", "checksum", "divipol", "mayorDeEdad"] as const;
const ES_PRUEBA = /(^|\/)(test|androidTest|testFixtures|Tests|[A-Za-z]+Tests)\//u;

/** Hallazgos `ruta: cadena` en una fuente nativa que no es de prueba. */
export function reglasEnFuente(ruta: string, contenido: string): string[] {
  const r = ruta.split(sep).join("/");
  if (!/\.(kt|kts|swift)$/u.test(r) || ES_PRUEBA.test(r)) return [];
  const minusculas = contenido.toLowerCase();
  return PROHIBIDAS.filter((p) => minusculas.includes(p.toLowerCase())).map((p) => `${r}: ${p}`);
}

function fuentes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "build" || e.name === ".gradle" || e.name === ".build" || e.name.startsWith(".")) return [];
    const ruta = join(dir, e.name);
    return e.isDirectory() ? fuentes(ruta) : [ruta];
  });
}

describe("NAT-07 Sin reglas en nativo", () => {
  it("NAT-07 Sin reglas en nativo: el detector encuentra cada cadena prohibida", () => {
    const kt = 'val rh = if (x == "AB+") 1 else 0\nfun checksum() {}\nval divipol = 1\nfun calcularDigitoVerificador() {}\nval mayorDeEdad = true\nval o = "O-"';
    expect(reglasEnFuente("native/android/lector-cedula/src/main/kotlin/Reglas.kt", kt)).toHaveLength(PROHIBIDAS.length);
    expect(reglasEnFuente("native/ios/Sources/LectorCedula/Reglas.swift", 'let rh = "AB+"')).toStrictEqual(['native/ios/Sources/LectorCedula/Reglas.swift: "AB+"']);
    expect(reglasEnFuente("native/android/lector-cedula/src/test/kotlin/ReglasTest.kt", kt)).toStrictEqual([]);
    expect(reglasEnFuente("native/ios/Tests/LectorCedulaTests/ReglasTests.swift", kt)).toStrictEqual([]);
    expect(reglasEnFuente("native/android/README.md", kt)).toStrictEqual([]);
  });

  it("NAT-07 Sin reglas en nativo: 0 apariciones en native/**/*.kt y native/**/*.swift", () => {
    const archivos = fuentes(join(RAIZ, "native"));
    const hallazgos = archivos.flatMap((a) => reglasEnFuente(relative(RAIZ, a), readFileSync(a, "utf8")));
    expect(hallazgos).toStrictEqual([]);
    // El proyecto Gradle de la fase 0 existe: el análisis no es vacío.
    expect(archivos.some((a) => /\.(kt|kts)$/u.test(a))).toBe(true);
  });
});
