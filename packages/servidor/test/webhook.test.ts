import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verificarWebhook } from "../src/index.js";
import { AHORA, CUERPO_AV25, FIRMA_V1, SECRETO, firmarReferencia } from "./ayudas.js";

describe("SDK-20 verificarWebhook", { timeout: 60_000 }, () => {
  it("SDK-20 el cuerpo de AV-25 mide 232 bytes y la referencia reproduce los vectores de AV-26", () => {
    expect(new TextEncoder().encode(CUERPO_AV25).length).toBe(232);
    expect(firmarReferencia(CUERPO_AV25, SECRETO, AHORA)).toBe(FIRMA_V1);
    expect(firmarReferencia(CUERPO_AV25.replace('"success"', '"failure"'), SECRETO, AHORA)).toBe(
      "t=1791300000,v1=ad2d9a1789d2a0aed77ed9cba60fdd44dace698518a137e7c0a3ba07323a494e",
    );
    expect(firmarReferencia(CUERPO_AV25, "whsec_sintetico_fedcba9876543210", AHORA)).toBe(
      "t=1791300000,v1=307be610808415cdcd78c48a54caa014d67c6a674e5906fa0f8a3ebd18d26120",
    );
    expect(firmarReferencia(CUERPO_AV25, SECRETO, AHORA + 1)).toBe(
      "t=1791300001,v1=66fbd0de5b41f685f61b6102a0f9ffebfcd85b8649f2307d72f14d475eb43bdf",
    );
  });

  it("SDK-20 Vector 1 de AV-26 (string y Uint8Array)", async () => {
    const r = await verificarWebhook({ cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: SECRETO, ahora: AHORA });
    expect(r.valido).toBe(true);
    if (r.valido) expect(r.evento.data.status).toBe("success");
    const bytes = new TextEncoder().encode(CUERPO_AV25);
    const r2 = await verificarWebhook({ cuerpo: bytes, firma: FIRMA_V1, secreto: SECRETO, ahora: AHORA });
    expect(r2.valido).toBe(true);
  });

  it("SDK-20 vectores 2 a 5 de AV-26 verifican con su cuerpo", async () => {
    const casos: [string, string, string, number][] = [
      [CUERPO_AV25.replace('"success"', '"failure"'), SECRETO, "ad2d9a1789d2a0aed77ed9cba60fdd44dace698518a137e7c0a3ba07323a494e", AHORA],
      [CUERPO_AV25, "whsec_sintetico_fedcba9876543210", "307be610808415cdcd78c48a54caa014d67c6a674e5906fa0f8a3ebd18d26120", AHORA],
      [CUERPO_AV25, SECRETO, "66fbd0de5b41f685f61b6102a0f9ffebfcd85b8649f2307d72f14d475eb43bdf", AHORA + 1],
      [
        '{"id":"evt_00000000000000000000000000000002","type":"validation.completed","created_at":"2026-10-06T15:20:00Z","sandbox":true,"data":{"validation_id":"val_0123456789abcdef0123456789abcdef","status":"review","declined_reason":"data_inconsistent"}}',
        SECRETO,
        "ddb4aa811a2cf0f80d5a9670ce95f5415ac3939a9e1dafc13b7b378abdc85ad7",
        AHORA,
      ],
    ];
    for (const [cuerpo, secreto, hex, t] of casos) {
      const r = await verificarWebhook({ cuerpo, firma: `t=${t},v1=${hex}`, secreto, ahora: AHORA });
      expect(r.valido).toBe(true);
    }
  });

  it("SDK-20 Cuerpo alterado", async () => {
    const r = await verificarWebhook({ cuerpo: CUERPO_AV25.replace('"success"', '"failure"'), firma: FIRMA_V1, secreto: SECRETO, ahora: AHORA });
    expect(r).toEqual({ valido: false, motivo: "firma-incorrecta" });
  });

  it("SDK-20 otro secreto da firma-incorrecta", async () => {
    const r = await verificarWebhook({ cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: "whsec_sintetico_fedcba9876543210", ahora: AHORA });
    expect(r).toEqual({ valido: false, motivo: "firma-incorrecta" });
  });

  it("SDK-20 Repetición tardía (y límites de la tolerancia)", async () => {
    const base = { cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: SECRETO };
    expect(await verificarWebhook({ ...base, ahora: AHORA + 301 })).toEqual({ valido: false, motivo: "fuera-de-tolerancia" });
    expect(await verificarWebhook({ ...base, ahora: AHORA - 301 })).toEqual({ valido: false, motivo: "fuera-de-tolerancia" });
    expect((await verificarWebhook({ ...base, ahora: AHORA + 300 })).valido).toBe(true);
    expect((await verificarWebhook({ ...base, ahora: AHORA - 300 })).valido).toBe(true);
    expect((await verificarWebhook({ ...base, ahora: AHORA + 10, tolerancia: 10 })).valido).toBe(true);
    expect(await verificarWebhook({ ...base, ahora: AHORA + 11, tolerancia: 10 })).toEqual({ valido: false, motivo: "fuera-de-tolerancia" });
  });

  it("SDK-20 sin ahora usa el reloj del sistema", async () => {
    const t = Math.floor(Date.now() / 1000);
    const r = await verificarWebhook({ cuerpo: CUERPO_AV25, firma: firmarReferencia(CUERPO_AV25, SECRETO, t), secreto: SECRETO });
    expect(r.valido).toBe(true);
    expect(await verificarWebhook({ cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: SECRETO })).toEqual({ valido: false, motivo: "fuera-de-tolerancia" });
  });

  it("SDK-20 Cabecera ausente o rota", async () => {
    const base = { cuerpo: CUERPO_AV25, secreto: SECRETO, ahora: AHORA };
    expect(await verificarWebhook({ ...base, firma: undefined })).toEqual({ valido: false, motivo: "firma-ausente" });
    expect(await verificarWebhook({ ...base, firma: "" })).toEqual({ valido: false, motivo: "firma-ausente" });
    expect(await verificarWebhook({ ...base, firma: "v1=abc" })).toEqual({ valido: false, motivo: "formato-invalido" });
    const hex = FIRMA_V1.split("v1=")[1] ?? "";
    for (const rota of [
      `v1=${hex}`,
      "t=1791300000",
      `t=abc,v1=${hex}`,
      `t=1791300000,v1=${hex.slice(1)}`,
      `t=1791300000,v1=${hex.toUpperCase()}`,
      `t=1791300000,v1=${hex}0`,
      `t=-1,v1=${hex}`,
      `t=1791300000;v1=${hex}`,
      `t=1791300000,v1=${hex.slice(0, 63)}g`,
    ]) {
      expect(await verificarWebhook({ ...base, firma: rota }), rota).toEqual({ valido: false, motivo: "formato-invalido" });
    }
  });

  it("SDK-20 acepta claves extra y varias v1 (rotación), en cualquier orden", async () => {
    const hex = FIRMA_V1.split("v1=")[1] ?? "";
    const otra = "0".repeat(64);
    const base = { cuerpo: CUERPO_AV25, secreto: SECRETO, ahora: AHORA };
    expect((await verificarWebhook({ ...base, firma: `v1=${otra},t=1791300000, v1=${hex},v0=xyz` })).valido).toBe(true);
    expect(await verificarWebhook({ ...base, firma: `t=1791300000,v1=${otra}` })).toEqual({ valido: false, motivo: "firma-incorrecta" });
  });

  it("SDK-20 cuerpo firmado que no es un evento JSON da cuerpo-invalido", async () => {
    for (const cuerpo of ["no es json", "[1,2]", "null", '"texto"', "{}", '{"data":null}']) {
      const r = await verificarWebhook({ cuerpo, firma: firmarReferencia(cuerpo, SECRETO, AHORA), secreto: SECRETO, ahora: AHORA });
      expect(r, cuerpo).toEqual({ valido: false, motivo: "cuerpo-invalido" });
    }
  });

  it("SDK-20 entradas de tipo incorrecto no lanzan", async () => {
    const malas: unknown[] = [undefined, null, 1, "x", {}, [], { cuerpo: 1, firma: FIRMA_V1, secreto: SECRETO }, { cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: 5 }, { cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: "" }, { cuerpo: CUERPO_AV25, firma: 7, secreto: SECRETO }];
    for (const m of malas) {
      const r = await verificarWebhook(m as never);
      expect(r.valido).toBe(false);
    }
    expect(await verificarWebhook({ cuerpo: 1, firma: FIRMA_V1, secreto: SECRETO, ahora: AHORA } as never)).toEqual({ valido: false, motivo: "cuerpo-invalido" });
    expect(await verificarWebhook({ cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: "", ahora: AHORA })).toEqual({ valido: false, motivo: "firma-incorrecta" });
    expect(await verificarWebhook({ cuerpo: CUERPO_AV25, firma: 7, secreto: SECRETO, ahora: AHORA } as never)).toEqual({ valido: false, motivo: "formato-invalido" });
    // ahora o tolerancia no numéricos caen a los valores por defecto (reloj del sistema, 300 s).
    expect(await verificarWebhook({ cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: SECRETO, ahora: Number.NaN, tolerancia: Number.NaN })).toEqual({ valido: false, motivo: "fuera-de-tolerancia" });
    expect((await verificarWebhook({ cuerpo: CUERPO_AV25, firma: FIRMA_V1, secreto: SECRETO, ahora: AHORA + 200, tolerancia: -5 })).valido).toBe(true);
  });

  it("SDK-20 Propiedad: round-trip verdadero y byte alterado falso (1000 casos)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 512 }), fc.string({ minLength: 1, maxLength: 64 }), fc.nat(), fc.integer({ min: 1, max: 255 }), async (bytes, secreto, posicion, delta) => {
        // Cuerpo binario arbitrario envuelto en JSON válido para que el original sea un evento; el byte alterado cae en el binario.
        const prefijo = new TextEncoder().encode('{"data":{"b":"');
        const sufijo = new TextEncoder().encode('"}}');
        const hex = new TextEncoder().encode(Buffer.from(bytes).toString("hex"));
        const cuerpo = new Uint8Array([...prefijo, ...hex, ...sufijo]);
        const firma = firmarReferencia(cuerpo, secreto, AHORA);
        const ok = await verificarWebhook({ cuerpo, firma, secreto, ahora: AHORA });
        expect(ok.valido).toBe(true);
        const alterado = cuerpo.slice();
        const i = posicion % alterado.length;
        alterado[i] = ((alterado[i] ?? 0) + delta) % 256;
        const mal = await verificarWebhook({ cuerpo: alterado, firma, secreto, ahora: AHORA });
        expect(mal).toEqual({ valido: false, motivo: "firma-incorrecta" });
      }),
      { numRuns: 1000 },
    );
  });

  it("SDK-20 Propiedad: bytes binarios arbitrarios firmados nunca dan firma-incorrecta y alterados nunca son válidos", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 256 }), fc.string({ minLength: 1 }), fc.nat(), async (cuerpo, secreto, p) => {
        const firma = firmarReferencia(cuerpo, secreto, AHORA);
        const r = await verificarWebhook({ cuerpo, firma, secreto, ahora: AHORA });
        expect(r.valido || r.motivo === "cuerpo-invalido").toBe(true);
        const alterado = cuerpo.slice();
        const i = p % alterado.length;
        alterado[i] = (alterado[i] ?? 0) ^ 0xff;
        const mal = await verificarWebhook({ cuerpo: alterado, firma, secreto, ahora: AHORA });
        expect(mal).toEqual({ valido: false, motivo: "firma-incorrecta" });
      }),
      { numRuns: 1000 },
    );
  });

  it("SDK-20 Propiedad: con entradas arbitrarias (fc.anything) nunca lanza", async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), fc.anything(), fc.anything(), fc.anything(), fc.anything(), async (cuerpo, firma, secreto, ahora, tolerancia) => {
        const r = await verificarWebhook({ cuerpo, firma, secreto, ahora, tolerancia } as never);
        expect(r.valido).toBe(false);
      }),
      { numRuns: 1000 },
    );
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (x) => {
        expect((await verificarWebhook(x as never)).valido).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it("SDK-20 la comparación no usa === sobre el hex (tiempo constante propio)", () => {
    const fuente = readFileSync(new URL("../src/webhook.ts", import.meta.url), "utf8");
    expect(fuente).toMatch(/compararTiempoConstante/);
  });
});
