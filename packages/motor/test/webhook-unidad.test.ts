// MOT-16 piezas puras del webhook (rápidas, también para la mutación): validación de la URL, cuerpo sin datos y firma.
import fc from "fast-check";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import type { ResultadoMotor } from "@lector-cedula/protocolo";
import { cuerpoWebhook, enviarWebhook, firmar, TIEMPO_WEBHOOK_MS, TOLERANCIA_WEBHOOK_S, validarWebhook, verificarFirmaWebhook } from "../src/webhook.js";
import { verificarFirmaWebhook as verificarExportada } from "../src/index.js";

const OK = { ok: true, tipoDocumento: "cedula-ciudadania", campos: { nuip: "9999123456", nombres: "PRUEBA" }, confiable: false, riesgo: { nivel: "alto" } } as unknown as ResultadoMotor;
const OK_SIN_RIESGO = { ...OK, riesgo: null } as unknown as ResultadoMotor;
const FALLIDA = { ok: false, error: { codigo: "mrz-no-valida", tipo: "mrz", digitosValidos: 3 }, confiable: false, riesgo: null } as unknown as ResultadoMotor;

// Vectores literales de AV-26 (api-validaciones), calculados con dos implementaciones independientes.
const CUERPO_AV25 =
  '{"id":"evt_00000000000000000000000000000001","type":"validation.completed","created_at":"2026-10-06T15:20:00Z","sandbox":true,"data":{"validation_id":"val_0123456789abcdef0123456789abcdef","status":"success","declined_reason":null}}';
const SECRETO_AV = "whsec_sintetico_0123456789abcdef";
const T = 1791300000;
const FIRMA_AV = "t=1791300000,v1=1b3358c314ebcad6047166133405e2be0692e92e52d17606840183a58d5711df";

const codigoDe =(f: () => unknown): string => {
  try {
    f();
    return "no-lanza";
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? "sin-codigo";
  }
};

describe("MOT-16 webhook (unidad)", { timeout: 60_000 }, () => {
  it("MOT-16 cuerpo de una lectura válida: tipo y nivel, sin campos", () => {
    expect(cuerpoWebhook({ resultado: OK })).toStrictEqual({ evento: "lectura", tipo: "cedula-ciudadania", riesgo_nivel: "alto" });
    expect(cuerpoWebhook({ resultado: OK_SIN_RIESGO })).toStrictEqual({ evento: "lectura", tipo: "cedula-ciudadania", riesgo_nivel: null });
    expect(JSON.stringify(cuerpoWebhook({ resultado: OK }))).not.toMatch(/9999123456|PRUEBA/u);
  });

  it("MOT-16 cuerpo de una lectura fallida y de un error lanzado", () => {
    expect(cuerpoWebhook({ resultado: FALLIDA })).toStrictEqual({ evento: "lectura", tipo: null, riesgo_nivel: null, codigo: "mrz-no-valida" });
    expect(cuerpoWebhook({ codigo: "tiempo-agotado" })).toStrictEqual({ evento: "lectura", tipo: null, riesgo_nivel: null, codigo: "tiempo-agotado" });
  });

  it("MOT-26 Vector de firma: AV-26 con el cuerpo de AV-25", () => {
    expect(new TextEncoder().encode(CUERPO_AV25).length).toBe(232);
    expect(firmar(SECRETO_AV, CUERPO_AV25, T)).toBe(FIRMA_AV);
    // Otros vectores literales de AV-26 (otro t, otro secreto): el t entra en el HMAC.
    expect(firmar(SECRETO_AV, CUERPO_AV25, T + 1)).toBe("t=1791300001,v1=66fbd0de5b41f685f61b6102a0f9ffebfcd85b8649f2307d72f14d475eb43bdf");
    expect(firmar("whsec_sintetico_fedcba9876543210", CUERPO_AV25, T)).toBe("t=1791300000,v1=307be610808415cdcd78c48a54caa014d67c6a674e5906fa0f8a3ebd18d26120");
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, SECRETO_AV, T)).toBe(true);
    expect(verificarFirmaWebhook(new TextEncoder().encode(CUERPO_AV25), FIRMA_AV, SECRETO_AV, T)).toBe(true);
    expect(verificarExportada).toBe(verificarFirmaWebhook);
    expect(TOLERANCIA_WEBHOOK_S).toBe(300);
  });

  it("MOT-26 Cuerpo alterado o secreto distinto: false", () => {
    expect(verificarFirmaWebhook(CUERPO_AV25.replace('"success"', '"failure"'), FIRMA_AV, SECRETO_AV, T)).toBe(false);
    expect(verificarFirmaWebhook(`${CUERPO_AV25} `, FIRMA_AV, SECRETO_AV, T)).toBe(false);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, "whsec_sintetico_fedcba9876543210", T)).toBe(false);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, "", T)).toBe(false);
    // Repetir la firma con otro t no sirve: el t está firmado.
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV.replace("t=1791300000", "t=1791300100"), SECRETO_AV, T + 100)).toBe(false);
  });

  it("MOT-26 Repetición fuera de ventana: ±300 s sí, ±301 s no", () => {
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, SECRETO_AV, T + 300)).toBe(true);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, SECRETO_AV, T - 300)).toBe(true);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, SECRETO_AV, T + 301)).toBe(false);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, SECRETO_AV, T - 301)).toBe(false);
    // Sin `ahora` usa el reloj: una firma de 2026-10 vieja respecto a hoy+1 año queda fuera; una recién hecha, dentro.
    const ahora = Math.floor(Date.now() / 1000);
    expect(verificarFirmaWebhook(CUERPO_AV25, firmar(SECRETO_AV, CUERPO_AV25, ahora), SECRETO_AV)).toBe(true);
    expect(verificarFirmaWebhook(CUERPO_AV25, firmar(SECRETO_AV, CUERPO_AV25, ahora - 3_600), SECRETO_AV)).toBe(false);
  });

  it("MOT-26 Cabecera mal formada: false sin lanzar", () => {
    const hex = FIRMA_AV.split("v1=")[1] ?? "";
    for (const cabecera of [
      undefined,
      null,
      "",
      `v1=${hex}`,
      "t=1791300000",
      `t=abc,v1=${hex}`,
      `t=-1,v1=${hex}`,
      `t=1791300000,v1=${hex.toUpperCase()}`,
      `t=1791300000,v1=${hex.slice(1)}`,
      `t=1791300000,v1=${hex}0`,
      `t=1791300000,v1=${hex.slice(0, 63)}g`,
      `sha256=${hex}`,
      `t=1,t=1791300000,v1=${hex}`,
      `t=1791300000;v1=${hex}`,
      `t=1791300000,v1=${hex},=x`,
      `t=1791300000x,v1=${hex}`,
      42,
      {},
    ]) {
      expect(verificarFirmaWebhook(CUERPO_AV25, cabecera as string, SECRETO_AV, T), String(cabecera)).toBe(false);
    }
    // `t` que Number() aceptaría pero no son segundos en decimal: rechazados aunque el HMAC se calcule con ese número.
    const firmadaCon = (texto: string, n: number | null): string => `t=${texto},v1=${createHmac("sha256", SECRETO_AV).update(`${n}.${CUERPO_AV25}`).digest("hex")}`;
    for (const [texto, n] of [["1e3", 1000], ["1000.0", 1000], ["0x3e8", 1000], ["+1000", 1000], ["-1", -1]] as const) {
      expect(verificarFirmaWebhook(CUERPO_AV25, firmadaCon(texto, n), SECRETO_AV, n), texto).toBe(false);
    }
    expect(verificarFirmaWebhook(CUERPO_AV25, firmadaCon("1000", 1000), SECRETO_AV, 1000)).toBe(true);
    // Sin `t`: no se firma con "null." aunque el reloj esté cerca de 0.
    expect(verificarFirmaWebhook(CUERPO_AV25, firmadaCon("x", null).replace("t=x,", ""), SECRETO_AV, 0)).toBe(false);
    // Un secreto vacío nunca valida, ni siquiera una firma hecha con secreto vacío.
    expect(verificarFirmaWebhook(CUERPO_AV25, firmar("", CUERPO_AV25, T), "", T)).toBe(false);
    // Entradas raras en cuerpo, secreto o ahora tampoco lanzan.
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, SECRETO_AV, "1791300000" as unknown as number)).toBe(false);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, SECRETO_AV, { valueOf: 1 } as unknown as number)).toBe(false);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, 42 as unknown as string, T)).toBe(false);
    expect(verificarFirmaWebhook(null as unknown as string, FIRMA_AV, SECRETO_AV, T)).toBe(false);
    expect(verificarFirmaWebhook(42 as unknown as string, FIRMA_AV, SECRETO_AV, T)).toBe(false);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, undefined as unknown as string, T)).toBe(false);
    expect(verificarFirmaWebhook(CUERPO_AV25, FIRMA_AV, SECRETO_AV, Number.NaN)).toBe(false);
  });

  it("MOT-26 Cabecera tolerante: espacios, claves desconocidas y varios v1", () => {
    const hex = FIRMA_AV.split("v1=")[1] ?? "";
    const otra = "0".repeat(64);
    expect(verificarFirmaWebhook(CUERPO_AV25, ` t = 1791300000 , v1= ${hex} `, SECRETO_AV, T)).toBe(true);
    expect(verificarFirmaWebhook(CUERPO_AV25, `v1=${otra},t=1791300000,v1=${hex},v0=xyz`, SECRETO_AV, T)).toBe(true);
    expect(verificarFirmaWebhook(CUERPO_AV25, `t=1791300000,v1=${otra}`, SECRETO_AV, T)).toBe(false);
  });

  it("MOT-26 propiedad: lo que firma enviarWebhook lo acepta el verificador y nunca lanza", () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 4_000_000_000 }), (cuerpo, secreto, t) => {
        const cabecera = firmar(secreto, cuerpo, t);
        expect(cabecera).toMatch(/^t=[0-9]+,v1=[0-9a-f]{64}$/u);
        const v1 = createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex");
        expect(cabecera).toBe(`t=${t},v1=${v1}`);
        expect(verificarFirmaWebhook(cuerpo, cabecera, secreto, t)).toBe(true);
        expect(verificarFirmaWebhook(`${cuerpo}x`, cabecera, secreto, t)).toBe(false);
      }),
      { numRuns: 1000 },
    );
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), fc.anything(), (a, b, c, d) => {
        expect(verificarFirmaWebhook(a as string, b as string, c as string, d as number)).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it("MOT-16 validación: https y http de localhost; lo demás opciones-invalidas", () => {
    expect(validarWebhook({ url: "https://ejemplo.test/hook", secreto: "s" })).toStrictEqual({ url: "https://ejemplo.test/hook", secreto: "s" });
    for (const url of ["http://localhost:8080/h", "http://127.0.0.1/h", "http://[::1]/h"]) expect(validarWebhook({ url, secreto: "s" }).url).toBe(url);
    for (const w of [
      null,
      "https://ejemplo.test",
      { url: "http://ejemplo.test/hook", secreto: "s" },
      { url: "http://localhost.ejemplo.test/hook", secreto: "s" },
      { url: "ftp://localhost/hook", secreto: "s" },
      { url: "no es url", secreto: "s" },
      { url: 1, secreto: "s" },
      // Un objeto URL no es una cadena aunque `new URL` lo aceptaría.
      { url: new URL("https://ejemplo.test/hook"), secreto: "s" },
      { url: "https://ejemplo.test/hook", secreto: "" },
      { url: "https://ejemplo.test/hook", secreto: 1 },
    ]) {
      expect(codigoDe(() => validarWebhook(w))).toBe("opciones-invalidas");
    }
  });

  it("MOT-16 Decisiones de envío / MOT-26: POST JSON con X-Lector-Signature, sin seguir redirecciones, con tiempo máximo", async () => {
    expect(TIEMPO_WEBHOOK_MS).toBe(5_000);
    const recibidos: { metodo?: string; tipo?: string; firma?: string; firmaVieja?: string; cuerpo: string; ruta?: string }[] = [];
    const servidor = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (p: Buffer) => partes.push(p));
      req.on("end", () => {
        recibidos.push({ metodo: req.method, tipo: req.headers["content-type"], firma: req.headers["x-lector-signature"] as string, firmaVieja: req.headers["x-lector-firma"] as string | undefined, cuerpo: Buffer.concat(partes).toString("utf8"), ruta: req.url });
        if (req.url === "/redirige") {
          res.writeHead(307, { location: "/destino" });
          res.end();
        } else res.end("ok");
      });
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    const { port } = servidor.address() as { port: number };
    try {
      const cuerpo = cuerpoWebhook({ resultado: OK });
      enviarWebhook({ url: `http://127.0.0.1:${port}/redirige`, secreto: "s" }, cuerpo);
      await expect.poll(() => recibidos.length, { timeout: 10_000 }).toBe(1);
      // Una redirección seguida llegaría a /destino antes que el envío siguiente (misma conexión local, mismo orden).
      enviarWebhook({ url: `http://127.0.0.1:${port}/hook`, secreto: "s" }, cuerpo);
      await expect.poll(() => recibidos.some((r) => r.ruta === "/hook"), { timeout: 10_000 }).toBe(true);
      expect(recibidos.map((r) => r.ruta)).toStrictEqual(["/redirige", "/hook"]);
      const texto = JSON.stringify(cuerpo);
      for (const r of recibidos) {
        expect(r).toMatchObject({ metodo: "POST", tipo: "application/json", cuerpo: texto, firmaVieja: undefined });
        const t = Number(/^t=([0-9]+),v1=[0-9a-f]{64}$/u.exec(r.firma ?? "")?.[1]);
        expect(Math.abs(Math.floor(Date.now() / 1000) - t)).toBeLessThanOrEqual(TOLERANCIA_WEBHOOK_S);
        expect(r.firma).toBe(firmar("s", texto, t));
        expect(verificarFirmaWebhook(r.cuerpo, r.firma, "s")).toBe(true);
      }
    } finally {
      await new Promise((r) => servidor.close(r));
    }
  });
});
