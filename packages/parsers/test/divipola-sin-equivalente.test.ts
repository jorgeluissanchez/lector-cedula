// Motivo "sin-equivalente" de divipolADivipola (DV-15, DV-16). Desde la corrección de 50050 -> 94343 ninguna fila
// de la tabla generada real tiene divipola null, pero el contrato y el generador admiten entradas manuales sin
// equivalente y filas municipales ausentes. Se sustituye la tabla generada por una sintética de códigos de lugar.
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/divipola/equivalencias.generated.js", async (original) => {
  const real = await original<typeof import("../src/divipola/equivalencias.generated.js")>();
  return {
    ...real,
    EQUIVALENCIAS_DIVIPOLA: [
      ["01001", "05001", "nombre-exacto"],
      ["50050", null, "manual"],
    ],
  };
});

const { divipolADivipola } = await import("../src/divipola/index.js");

describe("DV-15 sin-equivalente con una tabla de equivalencias sintética", () => {
  it("DV-15 entrada manual sin equivalente: motivo sin-equivalente con las advertencias de buscarDivipol", () => {
    expect(divipolADivipola("50050")).toStrictEqual({ equivalente: false, divipol: "50050", motivo: "sin-equivalente", warnings: [] });
  });

  it("DV-15 fila municipal ausente de la tabla: motivo sin-equivalente", () => {
    expect(divipolADivipola("11058")).toStrictEqual({ equivalente: false, divipol: "11058", motivo: "sin-equivalente", warnings: [] });
    expect(divipolADivipola("15001")).toStrictEqual({ equivalente: false, divipol: "15001", motivo: "sin-equivalente", warnings: ["D02"] });
  });

  it("DV-15 la tabla sintética se usa: 01001 sigue resolviendo", () => {
    expect(divipolADivipola("01001")).toStrictEqual({ equivalente: true, divipol: "01001", divipola: "05001", metodo: "nombre-exacto", warnings: [] });
  });
});
