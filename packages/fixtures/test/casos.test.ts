// fixture-sintetico: catálogo de payloads PDF417 (con el marcador estructural PubDSK_1) y MRZ de personas ficticias.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as modulo from "@lector-cedula/fixtures";
import { casosMrz, casosPdf417 } from "../src/casos.js";
import { generarMrzTd1 } from "../src/mrz.js";
import { generarPdf417 } from "../src/pdf417.js";
import { PERSONA_BASE, type PersonaFicticia } from "../src/persona.js";

const con = (cambios: Partial<PersonaFicticia>): PersonaFicticia => ({ ...PERSONA_BASE, ...cambios });

/** Definición literal del catálogo PDF417 de FX-22: id, persona y variante. */
const DEFINICION_PDF417 = [
  ["completa-base", PERSONA_BASE, "completa"],
  ["windows-truncada-base", PERSONA_BASE, "windows-truncada"],
  ["sin-pubdsk-base", PERSONA_BASE, "sin-pubdsk"],
  ["fecha-primero-base", PERSONA_BASE, "fecha-primero"],
  ["sin-segundo-nombre", con({ segundoNombre: "" }), "completa"],
  ["apellido-compuesto", con({ primerApellido: "DE LA OSSA" }), "completa"],
  ["enie", con({ primerApellido: "PEÑA", segundoApellido: "NUÑEZ" }), "completa"],
  ["rh-ab-positivo", con({ rh: "AB+" }), "completa"],
  ["rh-ab-negativo", con({ rh: "AB-" }), "completa"],
  ["rh-o-negativo", con({ rh: "O-" }), "completa"],
  ["sexo-f-apellido-con-m", con({ primerApellido: "MARTINEZ", sexo: "F" }), "completa"],
  ["nuip-corto", con({ nuip: "99991234" }), "completa"],
] as const;

/** Definición literal del catálogo MRZ de FX-22: id, persona y opciones (semilla 1). */
const DEFINICION_MRZ = [
  ["valida-base", PERSONA_BASE, { variante: "valida" }],
  ["cd-documento-alterado", PERSONA_BASE, { variante: "cd-documento-alterado" }],
  ["cd-nacimiento-alterado", PERSONA_BASE, { variante: "cd-nacimiento-alterado" }],
  ["cd-vencimiento-alterado", PERSONA_BASE, { variante: "cd-vencimiento-alterado" }],
  ["cd-compuesto-alterado", PERSONA_BASE, { variante: "cd-compuesto-alterado" }],
  ["cd-documento-relleno", PERSONA_BASE, { variante: "cd-documento-relleno" }],
  ["ocr-b-un-error", PERSONA_BASE, { variante: "ocr-b", erroresOcr: 1 }],
  ["ocr-b-cinco-errores", PERSONA_BASE, { variante: "ocr-b", erroresOcr: 5 }],
  ["enie", con({ primerApellido: "PEÑA", segundoApellido: "NUÑEZ" }), { variante: "valida" }],
  ["apellido-compuesto", con({ primerApellido: "DE LA OSSA", segundoNombre: "" }), { variante: "valida" }],
  ["sin-segundo-nombre", con({ segundoNombre: "" }), { variante: "valida" }],
] as const;

describe("FX-22 Catálogo de casos con nombre", () => {
  it("FX-22 Definición del catálogo PDF417", () => {
    const casos = casosPdf417();
    expect(casos.map((c) => c.id)).toStrictEqual(DEFINICION_PDF417.map(([id]) => id));
    DEFINICION_PDF417.forEach(([id, persona, variante], i) => {
      expect(casos[i]?.fixture, id).toStrictEqual(generarPdf417(persona, { variante, semilla: 1 }));
    });
  });

  it("FX-22 Definición del catálogo MRZ", () => {
    const casos = casosMrz();
    expect(casos.map((c) => c.id)).toStrictEqual(DEFINICION_MRZ.map(([id]) => id));
    DEFINICION_MRZ.forEach(([id, persona, opciones], i) => {
      expect(casos[i]?.fixture, id).toStrictEqual(generarMrzTd1(persona, { ...opciones, semilla: 1 }));
    });
  });

  it("FX-22 El catálogo equivale a llamar al generador", () => {
    const caso = casosPdf417().find((c) => c.id === "rh-ab-negativo");
    expect(caso?.fixture).toStrictEqual(generarPdf417(con({ rh: "AB-" }), { variante: "completa", semilla: 1 }));
  });

  it("FX-22 IDs únicos, descripciones y semilla 1", () => {
    for (const casos of [casosPdf417(), casosMrz()]) {
      expect(new Set(casos.map((c) => c.id)).size).toBe(casos.length);
      for (const c of casos) {
        expect(Object.keys(c).sort()).toStrictEqual(["descripcion", "fixture", "id"]);
        expect(c.descripcion.length).toBeGreaterThan(10);
        expect(c.fixture.semilla).toBe(1);
        expect(c.fixture.sintetico).toBe(true);
      }
      expect(Object.isFrozen(casos)).toBe(true);
      expect(new Set(casos.map((c) => c.descripcion)).size).toBe(casos.length);
    }
  });

  it("FX-22 Cada llamada devuelve bytes nuevos", () => {
    const a = casosPdf417();
    (a[0]?.fixture.bytes ?? new Uint8Array(1))[48] = 0xff;
    expect(casosPdf417()[0]?.fixture.bytes[48]).toBe(0x39);
  });

  it("FX-22 Errores de repos antiguos cubiertos", () => {
    const casos = casosPdf417();
    const e = casos.map((c) => c.fixture.esperado);
    expect(e.some((x) => x.rh === "AB+")).toBe(true);
    expect(e.some((x) => x.rh === "AB-")).toBe(true);
    expect(e.some((x) => x.rh === "O-")).toBe(true);
    expect(e.some((x) => x.primerApellido.includes("Ñ") || x.segundoApellido.includes("Ñ"))).toBe(true);
    expect(e.some((x) => x.segundoNombre === "")).toBe(true);
    expect(e.some((x) => x.primerApellido.includes(" "))).toBe(true);
    expect(e.some((x) => x.sexo === "F" && x.primerApellido.includes("M"))).toBe(true);
    expect(e.some((x) => x.primerApellido !== x.segundoApellido)).toBe(true);
    const completa = casos.find((c) => c.fixture.variante === "completa");
    const truncada = casos.find((c) => c.fixture.variante === "windows-truncada");
    expect(truncada?.fixture.persona).toStrictEqual(completa?.fixture.persona);
  });
});

describe("FX-14 Hipótesis declaradas (registro)", () => {
  it("FX-14 Todo ID existe en el registro de hipótesis", () => {
    const registro = readFileSync(new URL("../../../docs/decisiones/hipotesis-formato.md", import.meta.url), "utf8");
    const ids = new Set([...casosPdf417(), ...casosMrz()].flatMap((c) => c.fixture.hipotesis));
    expect(ids.size).toBeGreaterThanOrEqual(18);
    for (const id of ids) expect(registro, id).toContain(`| ${id} |`);
  });
});

describe("FX-02 Interfaz pública estable", () => {
  it("FX-02 Lista exacta de exportaciones", () => {
    expect(Object.keys(modulo).sort()).toStrictEqual([
      "ErrorFixture",
      "PERSONA_BASE",
      "VERSION_CONTRATO",
      "arbFixtureMrz",
      "arbFixturePdf417",
      "arbPersonaFicticia",
      "casosMrz",
      "casosPdf417",
      "generarMrzTd1",
      "generarPdf417",
    ]);
  });

  it("FX-02 Las exportaciones son las de los módulos internos", () => {
    expect(modulo.generarPdf417).toBe(generarPdf417);
    expect(modulo.generarMrzTd1).toBe(generarMrzTd1);
    expect(modulo.casosPdf417).toBe(casosPdf417);
    expect(modulo.PERSONA_BASE).toBe(PERSONA_BASE);
  });
});
