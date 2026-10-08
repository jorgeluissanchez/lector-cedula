// DC-13 (divipol-consulados-2018): contenido mínimo de la atribución CC BY-SA 4.0 en los dos archivos de avisos.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ARCHIVOS = ["packages/parsers/THIRD_PARTY_NOTICES.md", "tools/divipol/fuentes/LICENSES.md"];
const LEGAL = "https://creativecommons.org/licenses/by-sa/4.0/legalcode.es";

/** Sección `## ...` cuyo título contiene `clave`. */
function seccion(texto, clave) {
  const partes = texto.split(/^## /mu);
  const s = partes.find((p) => p.split("\n")[0].includes(clave));
  if (s === undefined) throw new Error(`sin sección ${clave}`);
  return s;
}

describe("DC-13 Elementos de atribución", () => {
  for (const archivo of ARCHIVOS) {
    const texto = readFileSync(join(RAIZ, archivo), "utf8");
    const dane = seccion(texto, archivo.endsWith("LICENSES.md") ? "divipola-dane.csv" : "DANE");
    const rnec = seccion(texto, archivo.endsWith("LICENSES.md") ? "consulados-2018.csv" : "Registraduría");

    it(`DC-13 ${archivo}: sección DANE`, () => {
      for (const t of ["descargado el 2026-10-06", LEGAL, "Cambios:", "no implica aval"]) expect(dane).toContain(t);
    });

    it(`DC-13 ${archivo}: sección Registraduría`, () => {
      for (const t of ["descargado el 2026-10-07", LEGAL, "Cambios:", "no implica aval", "modificaciones"]) expect(rnec).toContain(t);
      for (const errata of ["ARZERBAIYAN", "REPUBLICA DE SINGAPUR", "REPUBLICA SOCIALISTA DEVIETNAM"]) expect(rnec).toContain(errata);
    });
  }
});
