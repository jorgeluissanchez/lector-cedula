import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  evaluarArtefactoCcBySa,
  evaluarConsumidorCcBySa,
  evaluarDockerfileAvisos,
  evaluarLicencia,
  evaluarManifiestoModelos,
  evaluarNombre,
  revisarAvisosCcBySa,
} from "../licencia-check.mjs";

const RAIZ_REPO = fileURLToPath(new URL("../..", import.meta.url));

describe("evaluarLicencia", () => {
  it.each(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "MPL-2.0", "CC-BY-4.0", "0BSD"])(
    "permite %s",
    (lic) => expect(evaluarLicencia(lic).ok).toBe(true),
  );

  it.each(["AGPL-3.0", "AGPL-3.0-only", "GPL-3.0", "CC-BY-NC-SA-4.0", "PolyForm-Noncommercial-1.0.0", "SSPL-1.0"])(
    "prohíbe %s",
    (lic) => expect(evaluarLicencia(lic).ok).toBe(false),
  );

  it("acepta una expresión OR si alguna alternativa es permitida", () => {
    expect(evaluarLicencia("(MIT OR GPL-3.0)").ok).toBe(true);
  });

  it("rechaza una expresión AND si alguna parte es prohibida", () => {
    expect(evaluarLicencia("(MIT AND AGPL-3.0)").ok).toBe(false);
  });

  it("marca como desconocida una licencia ausente", () => {
    const r = evaluarLicencia(undefined);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/sin licencia/i);
  });
});

describe("evaluarNombre (lista negra explícita)", () => {
  it.each(["ultralytics", "fastmrz", "surya-ocr", "pyiqa", "insightface"])("bloquea %s", (n) => {
    expect(evaluarNombre(n).ok).toBe(false);
  });

  it("permite paquetes no listados", () => {
    expect(evaluarNombre("zxing-wasm").ok).toBe(true);
  });
});

describe("evaluarManifiestoModelos", () => {
  it("rechaza modelos con licencia prohibida o pendiente", () => {
    const errores = evaluarManifiestoModelos([
      { nombre: "minifasnet", licencia: "Apache-2.0" },
      { nombre: "buffalo_l", licencia: "insightface-noncommercial" },
      { nombre: "docaligner-lc050", licencia: "PENDIENTE" },
    ]);
    expect(errores.map((e) => e.nombre)).toEqual(["buffalo_l", "docaligner-lc050"]);
  });
});

describe("DC-12, DC-15 y DC-16 puerta de avisos CC BY-SA", () => {
  const LEGAL = "https://creativecommons.org/licenses/by-sa/4.0/legalcode.es";
  const ARTEFACTO = "src/divipol-2018/consulados.generated.ts";
  const PAQUETE = { name: "@x/p", license: "MIT AND CC-BY-SA-4.0", files: ["dist", "THIRD_PARTY_NOTICES.md"] };
  const AVISOS = `Datos en ${ARTEFACTO}, CC BY-SA 4.0, ${LEGAL}`;

  it("DC-12 artefacto con aviso completo: sin infracciones", () => {
    expect(evaluarArtefactoCcBySa({ artefacto: ARTEFACTO, paquete: PAQUETE, avisos: AVISOS })).toStrictEqual([]);
  });

  it.each([
    ["aviso que no nombra el artefacto", { avisos: `CC BY-SA 4.0 ${LEGAL}` }],
    ["files sin THIRD_PARTY_NOTICES.md", { paquete: { ...PAQUETE, files: ["dist"] } }],
    ["license sin CC-BY-SA-4.0", { paquete: { ...PAQUETE, license: "MIT" } }],
    ["aviso sin el código legal", { avisos: `Datos en ${ARTEFACTO}, https://creativecommons.org/licenses/by-sa/4.0/` }],
    ["aviso ausente", { avisos: null }],
  ])("DC-12 Aviso sin el artefacto: %s", (_n, cambio) => {
    const r = evaluarArtefactoCcBySa({ artefacto: ARTEFACTO, paquete: PAQUETE, avisos: AVISOS, ...cambio });
    expect(r).toHaveLength(1);
    expect(r[0]).toContain(ARTEFACTO);
  });

  it("DC-15 Consumidor sin aviso", () => {
    const sin = 'import { conLugarNacimiento } from "../packages/capture/dist/index.js";';
    expect(evaluarConsumidorCcBySa("tools/x.mjs", sin)).toContain("tools/x.mjs");
    expect(evaluarConsumidorCcBySa("tools/x.mjs", `${sin}\n// CC BY-SA 4.0`)).toBeNull();
    expect(evaluarConsumidorCcBySa("tools/y.mjs", 'import "@lector-cedula/parsers/divipol-2018";')).toContain("tools/y.mjs");
    expect(evaluarConsumidorCcBySa("server/z.mjs", 'await import("/srv/capture/dist/lectura/lugar.js");')).toContain("server/z.mjs");
    expect(evaluarConsumidorCcBySa("tools/w.mjs", 'import { buscarDivipol } from "../packages/parsers/dist/index.js";')).toBeNull();
  });

  it("DC-16 Imagen sin aviso", () => {
    const compila = "COPY --from=fuente /fuente/packages/parsers/src ./src\n";
    expect(evaluarDockerfileAvisos(compila)).toMatch(/licencias/u);
    expect(evaluarDockerfileAvisos(`${compila}COPY --from=fuente /fuente/packages/parsers/THIRD_PARTY_NOTICES.md /srv/licencias/parsers-THIRD_PARTY_NOTICES.md\n`)).toBeNull();
    expect(evaluarDockerfileAvisos("FROM node\n")).toBeNull();
  });

  it("DC-12 Repositorio actual", () => {
    expect(revisarAvisosCcBySa(RAIZ_REPO)).toStrictEqual([]);
  });
});
