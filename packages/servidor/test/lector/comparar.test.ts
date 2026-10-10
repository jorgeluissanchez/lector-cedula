// MOT-10: compararConCliente, pura, solo rutas (sin valores). Campos con los nombres de CamposDocumento (OD-22a).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CAMPOS_COMPARADOS, compararConCliente } from "../../src/index.js";
import { AMARILLA, CLIENTE } from "./ayudas-lector.js";

const RUTAS = new Set<string>([...CAMPOS_COMPARADOS, "cliente-invalido"]);

describe("MOT-10 compararConCliente", { timeout: 60_000 }, () => {
  it("MOT-10 lista cerrada de campos comparados", () => {
    expect(CAMPOS_COMPARADOS).toStrictEqual([
      "tipo",
      "campos.nuip",
      "campos.apellidos",
      "campos.nombres",
      "campos.fechaNacimiento",
      "campos.sexo",
      "campos.rh",
    ]);
  });

  it("MOT-10 Coinciden", () => {
    expect(compararConCliente(AMARILLA, CLIENTE)).toStrictEqual({ coincide: true, diferencias: [] });
  });

  it("MOT-10 Coinciden con tipoDocumento en vez de tipo (resultado de leerDocumento del cliente)", () => {
    const sinTipo: Record<string, unknown> = { ...CLIENTE, tipoDocumento: "cedula-ciudadania" };
    delete sinTipo.tipo;
    expect(compararConCliente(AMARILLA, sinTipo)).toStrictEqual({ coincide: true, diferencias: [] });
  });

  it("MOT-10 NUIP manipulado en el cliente", () => {
    const cliente = { ...CLIENTE, campos: { ...CLIENTE.campos, nuip: "9999123457", rh: "B+" } };
    expect(compararConCliente(AMARILLA, cliente)).toStrictEqual({ coincide: false, diferencias: ["campos.nuip", "campos.rh"] });
  });

  it.each(CAMPOS_COMPARADOS.filter((r) => r !== "tipo"))("MOT-10 cada campo comparado se detecta: %s", (ruta) => {
    const clave = ruta.slice("campos.".length);
    const cliente = { ...CLIENTE, campos: { ...CLIENTE.campos, [clave]: "OTRO-VALOR-SINTETICO" } };
    expect(compararConCliente(AMARILLA, cliente)).toStrictEqual({ coincide: false, diferencias: [ruta] });
  });

  it("MOT-10 tipo distinto y campo ausente en el cliente", () => {
    const campos: Record<string, unknown> = { ...CLIENTE.campos };
    delete campos.rh;
    expect(compararConCliente(AMARILLA, { ...CLIENTE, tipo: "pasaporte", campos })).toStrictEqual({
      coincide: false,
      diferencias: ["tipo", "campos.rh"],
    });
  });

  it("MOT-10 Campos fuera de la lista no se comparan; null equivale a ausente", () => {
    const servidorCampos: Record<string, unknown> = AMARILLA.ok ? { ...AMARILLA.campos } : {};
    expect(servidorCampos).not.toHaveProperty("fechaExpedicion");
    const cliente = { ...CLIENTE, campos: { ...CLIENTE.campos, fechaExpedicion: "2020-01-01", lugarNacimiento: { x: 1 }, paisEmisor: "XXX" } };
    expect(compararConCliente(AMARILLA, cliente)).toStrictEqual({ coincide: true, diferencias: [] });
    const servidor = { ...AMARILLA, campos: { ...CLIENTE.campos, rh: undefined } } as typeof AMARILLA;
    expect(compararConCliente(servidor, { ...CLIENTE, campos: { ...CLIENTE.campos, rh: null } })).toStrictEqual({ coincide: true, diferencias: [] });
  });

  it("MOT-10 un valor no primitivo en el cliente es diferencia", () => {
    expect(compararConCliente(AMARILLA, { ...CLIENTE, campos: { ...CLIENTE.campos, nuip: ["9999123456"] } })).toStrictEqual({
      coincide: false,
      diferencias: ["campos.nuip"],
    });
  });

  it.each([[null], [undefined], ["texto"], [42], [[]], [{}], [{ tipo: "cedula-ciudadania" }], [{ campos: {} }], [{ tipo: 1, campos: {} }], [{ tipo: "x", campos: [] }], [{ tipo: "x", campos: null }]])(
    "MOT-10 cliente inválido %j",
    (cliente) => {
      expect(compararConCliente(AMARILLA, cliente)).toStrictEqual({ coincide: false, diferencias: ["cliente-invalido"] });
    },
  );

  it("MOT-10 Cliente basura", () => {
    fc.assert(
      fc.property(fc.anything(), (cliente) => {
        const r = compararConCliente(AMARILLA, cliente);
        expect(r.coincide).toBe(false);
        for (const d of r.diferencias) expect(RUTAS.has(d)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("MOT-10 clientes con forma válida y valores arbitrarios: solo rutas de la lista, nunca valores", () => {
    const valor = fc.oneof(fc.string(), fc.constant(null), fc.integer(), fc.constant("9999123456"));
    let utiles = 0;
    fc.assert(
      fc.property(fc.record({ tipo: fc.string(), campos: fc.dictionary(fc.constantFrom("nuip", "apellidos", "nombres", "fechaNacimiento", "sexo", "rh", "otro"), valor) }), (cliente) => {
        utiles++;
        const r = compararConCliente(AMARILLA, cliente);
        expect(r.coincide).toBe(r.diferencias.length === 0);
        for (const d of r.diferencias) expect(CAMPOS_COMPARADOS).toContain(d);
      }),
      { numRuns: 1000 },
    );
    expect(utiles).toBe(1000);
  });
});
