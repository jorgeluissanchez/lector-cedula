// SDK-07 "Precarga sin red": precargarMotor también carga los módulos diferidos del núcleo (dependencias por omisión),
// para que con la red cortada la lectura no pida ningún chunk del integrador.
import { describe, expect, it, vi } from "vitest";

const marcas = vi.hoisted(() => ({ dependencias: 0, motor: [] as string[] }));
vi.mock("../src/dependencias.js", () => {
  marcas.dependencias++;
  return { crearDependencias: () => ({}) };
});
vi.mock("../src/cargador.js", async (original) => ({
  ...(await original<typeof import("../src/cargador.js")>()),
  precargarMotor: async (o: { recursos?: string } = {}) => {
    marcas.motor.push(o.recursos ?? "");
  },
}));

describe("SDK-07 Precarga opcional del motor", () => {
  it("SDK-07 Precarga sin red: carga el motor y el módulo de dependencias por omisión", async () => {
    const { precargarMotor } = await import("../src/index.js");
    expect(marcas.dependencias).toBe(0);
    await precargarMotor({ recursos: "https://app-a.example/lector-cedula/" });
    expect(marcas.motor).toStrictEqual(["https://app-a.example/lector-cedula/"]);
    expect(marcas.dependencias).toBe(1);
  });
});
