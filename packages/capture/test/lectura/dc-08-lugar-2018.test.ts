// DC-08 lugar de nacimiento con el nombre vigente de los consulados 2018 (cambio divipol-consulados-2018).
// Códigos de lugar públicos; ningún dato personal.
import { buscarDivipol } from "@lector-cedula/parsers";
import { describe, expect, it, vi } from "vitest";
import { conLugarNacimiento } from "../../src/lectura/lugar.js";

const con = (d: string, m: string) => ({ campos: { codigoDepartamentoNacimiento: d, codigoMunicipioNacimiento: m } });

describe("DC-08 Lugar de nacimiento con el nombre vigente", () => {
  it("DC-08 Consulado nuevo", () => {
    const r = conLugarNacimiento(con("88", "690"), buscarDivipol);
    expect(r.campos.lugarNacimiento).toStrictEqual({ codigo: "88690", departamento: "CONSULADOS", municipio: "VIETNAM" });
    expect(r.warnings).toBeUndefined();
  });

  it("DC-08 Consulado renombrado", () => {
    for (const [m, municipio] of [["140", "CURAZAO"], ["160", "ARUBA"], ["370", "REPUBLICA DE FILIPINAS"], ["435", "PAISES BAJOS"]] as const) {
      const r = conLugarNacimiento(con("88", m), buscarDivipol);
      expect(r.campos.lugarNacimiento).toStrictEqual({ codigo: `88${m}`, departamento: "CONSULADOS", municipio });
    }
  });

  it("DC-08 Belice e Irlanda con ambos códigos", () => {
    for (const [m, municipio] of [["195", "BELICE"], ["415", "BELICE"], ["480", "IRLANDA"], ["470", "IRLANDA"]] as const) {
      expect(conLugarNacimiento(con("88", m), buscarDivipol).campos.lugarNacimiento).toStrictEqual({ codigo: `88${m}`, departamento: "CONSULADOS", municipio });
    }
  });

  it("DC-08 Código desconocido en ambos", () => {
    const r = conLugarNacimiento({ ...con("99", "999"), warnings: ["previo"] }, buscarDivipol);
    expect(r.campos.lugarNacimiento).toBeNull();
    expect(r.warnings).toStrictEqual(["previo", "lugar-nacimiento-no-resuelto"]);
  });

  it("DC-08 Municipio nacional sin cambios: el resultado es el de la búsqueda principal", () => {
    const buscar = vi.fn(buscarDivipol);
    const r = conLugarNacimiento(con("16", "001"), buscar);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r.campos.lugarNacimiento).toStrictEqual({ codigo: "16001", departamento: "BOGOTA D.C", municipio: "BOGOTA, D.C." });
  });

  it("DC-08 consulado no renombrado resuelto por el principal: usa la búsqueda principal", () => {
    const falso = vi.fn(() => ({
      encontrado: true as const, codigo: "88815", codigoDepartamento: "88", codigoMunicipio: "815", departamento: "CONSULADOS",
      municipio: "MARCA-PRINCIPAL", tipo: "consulado" as const, warnings: ["D03"],
    }));
    expect(conLugarNacimiento(con("88", "815"), falso).campos.lugarNacimiento).toStrictEqual({ codigo: "88815", departamento: "CONSULADOS", municipio: "MARCA-PRINCIPAL" });
  });
});
