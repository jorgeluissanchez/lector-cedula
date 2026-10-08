// OFF-26 Reintento silencioso de la lectura (pwa-lectura-offline, tarea 5.6): política pura y reductor.
import { describe, expect, it } from "vitest";
import { reducir, type Estado } from "../src/estado";
import { crearReintentos, MAX_LECTURAS, TIEMPO_MAX_REINTENTOS_MS } from "../src/reintentos";

const fallo = (error: "mrz-no-valida" | "mrz-no-encontrada" | "menor-de-edad" | "motor" | "tiempo-agotado") =>
  ({ ok: false, tipo: "mrz", error }) as const;
const OK = { ok: true, tipo: "pdf417", intento: "original", resultado: {} } as const;

describe("OFF-26 Reintento silencioso de la lectura", () => {
  it("OFF-26 Política de reintentos", () => {
    expect([MAX_LECTURAS, TIEMPO_MAX_REINTENTOS_MS]).toStrictEqual([3, 20_000]);
    let t = 0;
    const r = crearReintentos(() => t);
    r.iniciar();
    expect(r.decidir(fallo("mrz-no-valida"))).toBe("reintentar");
    t = 1000;
    r.iniciar();
    expect(r.decidir(fallo("mrz-no-valida"))).toBe("reintentar");
    t = 2000;
    r.iniciar();
    expect(r.decidir(fallo("mrz-no-valida"))).toBe("mostrar");

    t = 0;
    r.reiniciar();
    r.iniciar();
    expect(r.decidir(fallo("mrz-no-encontrada"))).toBe("reintentar");
    t = 20_000;
    r.iniciar();
    expect(r.decidir(fallo("mrz-no-encontrada"))).toBe("mostrar");

    t = 0;
    r.reiniciar();
    r.iniciar();
    expect(r.decidir(fallo("menor-de-edad"))).toBe("mostrar");
    r.reiniciar();
    r.iniciar();
    expect(r.decidir(fallo("motor"))).toBe("mostrar");
    r.reiniciar();
    r.iniciar();
    expect(r.decidir(fallo("tiempo-agotado"))).toBe("reintentar");
    r.iniciar();
    expect(r.decidir(OK)).toBe("mostrar");
    r.reiniciar();
    r.iniciar();
    expect(r.decidir(fallo("mrz-no-valida"))).toBe("reintentar");
  });

  it("OFF-26 el tiempo cuenta desde la primera lectura, no desde cada una", () => {
    let t = 5000;
    const r = crearReintentos(() => t);
    r.iniciar();
    t = 24_999;
    expect(r.decidir(fallo("mrz-no-valida"))).toBe("reintentar");
    r.iniciar();
    t = 25_000;
    expect(r.decidir(fallo("mrz-no-valida"))).toBe("mostrar");
  });

  it("OFF-26 Reductor", () => {
    const leyendo: Estado = { pantalla: "leyendo", aviso: null };
    expect(reducir(leyendo, { tipo: "reintento" })).toStrictEqual({ pantalla: "activo", aviso: null });
    const resultado: Estado = { pantalla: "resultado", aviso: null, lectura: OK };
    expect(reducir(resultado, { tipo: "reintento" })).toBe(resultado);
  });
});
