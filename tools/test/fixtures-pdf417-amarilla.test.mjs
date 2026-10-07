// fixture-sintetico: los fixtures de eval pdf417-amarilla se regeneran sin deriva (cambio parser-pdf417-amarilla, tarea 8.2).
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIRECTORIO, fixturesPdf417Amarilla } from "../fixtures/pdf417-amarilla.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CARPETA = join(RAIZ, DIRECTORIO);

describe("Fixtures de eval pdf417-amarilla", () => {
  const generados = fixturesPdf417Amarilla();

  it("son 12 casos del catálogo y 6 de error (atrapa: catálogo incompleto)", () => {
    expect(Object.keys(generados).length).toBe(18);
    const errores = Object.values(generados).map((t) => JSON.parse(t).esperado.error).filter(Boolean).sort();
    expect(errores).toStrictEqual([
      "bloque-demografico-no-encontrado",
      "caracteres-invalidos-en-nombre",
      "fecha-nacimiento-invalida",
      "nombres-no-reconocidos",
      "nuip-invalido",
      "nuip-no-encontrado",
    ]);
  });

  it("regenerarlos en memoria da los mismos archivos (atrapa: deriva entre el script y el repositorio)", () => {
    expect(readdirSync(CARPETA).sort()).toStrictEqual(Object.keys(generados).sort());
    for (const [nombre, texto] of Object.entries(generados)) expect([nombre, readFileSync(join(CARPETA, nombre), "utf8")]).toStrictEqual([nombre, texto]);
  });

  it("cada fixture es sintético, con claves exactas y hex en minúsculas (atrapa: fixtures sin marca o con datos reales)", () => {
    for (const texto of Object.values(generados)) {
      const f = JSON.parse(texto);
      expect([f.sintetico, f.clavesExactas, f.tipo]).toStrictEqual([true, true, "pdf417-amarilla"]);
      expect(f.entrada).toMatch(/^(?:[0-9a-f]{2})+$/);
      if (f.esperado.ok) expect(f.esperado.numeroDocumento).toMatch(/^9999/);
    }
  });

  it("el esperado sale del generador y de tablas literales, no del parser (atrapa: oráculo que copia la salida)", () => {
    const base = JSON.parse(generados["completa-base.json"]);
    expect(base.esperado).toStrictEqual({
      ok: true,
      numeroDocumento: "9999123456",
      primerApellido: "PRUEBA",
      segundoApellido: "EJEMPLO",
      primerNombre: "FICTICIA",
      segundoNombre: "LUZ",
      sexo: "F",
      fechaNacimiento: "1985-03-14",
      rh: "O+",
      codigoDepartamentoNacimiento: "16",
      codigoMunicipioNacimiento: "001",
      variante: "completa",
      modo: "offsets",
      bloqueDemografico: "sexo-primero",
      warnings: [],
    });
    const fp = JSON.parse(generados["fecha-primero-base.json"]).esperado;
    expect([fp.codigoDepartamentoNacimiento, fp.modo, fp.warnings]).toStrictEqual([null, "patrones", ["H08"]]);
  });
});
