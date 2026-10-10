// fixture-sintetico: sin datos personales.
// NAT-12 (tarea 0.1): la regla de menores del envío es una sola, `packages/web/src/menores.ts`; el bundle la importa y
// no la duplica.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { esMenor, retenerMenor } from "../../web/src/menores.js";

const fuente = readFileSync(fileURLToPath(new URL("../src/nucleo.ts", import.meta.url)), "utf8");

describe("NAT-12 Regla de menores única", () => {
  it("NAT-12 nucleo.ts importa la regla de packages/web y no compara enviarMenores ni tarjeta-identidad por su cuenta", () => {
    expect(fuente).toMatch(/from "\.\.\/\.\.\/web\/src\/menores\.js"/u);
    expect(fuente).not.toMatch(/enviarMenores"\]\s*!==/u);
    expect(fuente).not.toMatch(/===\s*"tarjeta-identidad"/u);
  });

  it("NAT-12 esMenor y retenerMenor: TI, menorDeEdad y enviarMenores", () => {
    expect(esMenor({ tipoDocumento: "tarjeta-identidad" })).toBe(true);
    expect(esMenor({ tipoDocumento: "cedula-ciudadania", menorDeEdad: true })).toBe(true);
    expect(esMenor({ tipoDocumento: "cedula-ciudadania", menorDeEdad: "true" })).toBe(false);
    expect(esMenor({ tipoDocumento: "cedula-ciudadania" })).toBe(false);
    expect(retenerMenor({ tipoDocumento: "tarjeta-identidad" }, {})).toBe(true);
    expect(retenerMenor({ tipoDocumento: "tarjeta-identidad" }, { enviarMenores: "true" })).toBe(true);
    expect(retenerMenor({ tipoDocumento: "tarjeta-identidad" }, { enviarMenores: true })).toBe(false);
    expect(retenerMenor({ tipoDocumento: "cedula-ciudadania" }, {})).toBe(false);
  });
});
