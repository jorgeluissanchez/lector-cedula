// OFF-09 Resultado enmascarado (pwa-lectura-offline, tarea 2.1): máscara única de la PWA y de tools/leer-foto.mjs.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  enmascararCamposMrz,
  enmascararCamposPdf417,
  enmascararNombre,
  enmascararResultadoMrz,
  enmascararUltimos2,
} from "../../src/lectura/mascara.js";

describe("OFF-09 Resultado enmascarado", () => {
  it("OFF-09 Máscara MRZ", () => {
    const campos = { nuip: "9999123456", serial: "999912345", apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ" };
    expect(enmascararCamposMrz(campos)).toStrictEqual({ nuip: "********56", serial: "*******45", apellidos: "P***** E******", nombres: "F******* L**" });
  });

  it("OFF-09 Máscara PDF417 de 8 dígitos y con Ñ", () => {
    const campos = { numeroDocumento: "99991234", primerApellido: "MUÑOZ", segundoApellido: null, primerNombre: "ÑANDÚ", segundoNombre: "" };
    expect(enmascararCamposPdf417(campos)).toStrictEqual({
      numeroDocumento: "******34",
      primerApellido: "M****",
      segundoApellido: null,
      primerNombre: "Ñ****",
      segundoNombre: "",
    });
  });

  it("OFF-09 conserva los demás campos sin máscara y no muta la entrada", () => {
    const campos = { numeroDocumento: "9999123456", primerApellido: "PRUEBA", segundoApellido: "EJEMPLO", primerNombre: "FICTICIA", segundoNombre: "LUZ", sexo: "F", lugarNacimiento: { codigo: "16001" } };
    const copia = structuredClone(campos);
    expect(enmascararCamposPdf417(campos)).toStrictEqual({ numeroDocumento: "********56", primerApellido: "P*****", segundoApellido: "E******", primerNombre: "F*******", segundoNombre: "L**", sexo: "F", lugarNacimiento: { codigo: "16001" } });
    expect(campos).toStrictEqual(copia);
  });

  it("OFF-09 resultado MRZ: lineasCorregidas y correcciones son null", () => {
    const r = { valido: true, campos: { nuip: "9999123456", serial: "999912345", apellidos: "PRUEBA", nombres: "LUZ", sexo: "F" }, lineasCorregidas: ["X"], correcciones: [1] };
    expect(enmascararResultadoMrz(r)).toStrictEqual({
      valido: true,
      campos: { nuip: "********56", serial: "*******45", apellidos: "P*****", nombres: "L**", sexo: "F" },
      lineasCorregidas: null,
      correcciones: null,
    });
  });

  it("OFF-09 valores que no son cadena pasan sin cambio", () => {
    expect(enmascararUltimos2(null)).toBeNull();
    expect(enmascararUltimos2(undefined)).toBeUndefined();
    expect(enmascararNombre(null)).toBeNull();
    expect(enmascararUltimos2("5")).toBe("5");
    expect(enmascararUltimos2("")).toBe("");
    expect(enmascararNombre("  A  BC ")).toBe("  A  B* ");
  });

  it("OFF-09 propiedad: longitud conservada y solo los 2 últimos visibles", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        const m = enmascararUltimos2(s);
        const cps = [...s];
        expect(m.length).toBe(s.length);
        const visibles = cps.length <= 2 ? s : cps.slice(-2).join("");
        expect(m.endsWith(visibles)).toBe(true);
        expect(m.slice(0, m.length - visibles.length)).toMatch(/^\**$/u);
      }),
      { numRuns: 1000 },
    );
  });

  it("OFF-09 propiedad: cada palabra conserva solo su primera letra y su longitud", () => {
    const palabra = fc.string({ unit: fc.constantFrom(..."ABCÑÁÜZ"), minLength: 1, maxLength: 12 });
    fc.assert(
      fc.property(fc.array(palabra, { minLength: 1, maxLength: 4 }), (palabras) => {
        const m = enmascararNombre(palabras.join(" "));
        const partes = m.split(" ");
        expect(partes).toHaveLength(palabras.length);
        partes.forEach((p, i) => {
          expect([...p]).toHaveLength([...palabras[i]].length);
          expect([...p][0]).toBe([...palabras[i]][0]);
          expect([...p].slice(1).every((c) => c === "*")).toBe(true);
        });
      }),
      { numRuns: 1000 },
    );
  });
});
