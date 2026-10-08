// Bordes de SDK-18 a SDK-21 que la mutación (Stryker, comando M) mostró sin cubrir.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ErrorLector, compararTiempoConstante, crearCliente, manejarWebhook, verificarWebhook } from "../src/index.js";
import { leerBytesNode, type PeticionNode } from "../src/nodo.js";
import { AHORA, AUT, CUERPO_AV25, FIRMA_V1, KT, SECRETO, SRV, firmarReferencia } from "./ayudas.js";

const HEX = FIRMA_V1.split("v1=")[1] ?? "";
const base = { cuerpo: CUERPO_AV25, secreto: SECRETO, ahora: AHORA };

describe("SDK-20 bordes de verificarWebhook", () => {
  it("SDK-20 firma null es firma-ausente", async () => {
    expect(await verificarWebhook({ ...base, firma: null })).toEqual({ valido: false, motivo: "firma-ausente" });
  });

  it("SDK-20 cabeceras mal formadas: t con sufijo, t repetido, segmento sin = o con clave vacía", async () => {
    for (const firma of [`t=1791300000x,v1=${HEX}`, `t=1,t=1791300000,v1=${HEX}`, `t=1791300000,v1=${HEX},basura`, `t=1791300000,v1=${HEX},=x`]) {
      expect(await verificarWebhook({ ...base, firma }), firma).toEqual({ valido: false, motivo: "formato-invalido" });
    }
  });

  it("SDK-20 se toleran espacios alrededor de claves y valores", async () => {
    expect((await verificarWebhook({ ...base, firma: ` t = 1791300000 , v1= ${HEX} ` })).valido).toBe(true);
  });

  it("SDK-20 un secreto vacío o no textual nunca valida, aunque la firma se hiciera con él", async () => {
    const vacio = firmarReferencia(CUERPO_AV25, "", AHORA);
    expect(await verificarWebhook({ ...base, secreto: "", firma: vacio })).toEqual({ valido: false, motivo: "firma-incorrecta" });
    const cinco = firmarReferencia(CUERPO_AV25, "5", AHORA);
    expect(await verificarWebhook({ ...base, secreto: 5 as never, firma: cinco })).toEqual({ valido: false, motivo: "firma-incorrecta" });
  });

  it("SDK-20 tolerancia 0 exige el mismo segundo; tolerancia no numérica usa 300", async () => {
    expect((await verificarWebhook({ ...base, firma: FIRMA_V1, tolerancia: 0 })).valido).toBe(true);
    expect(await verificarWebhook({ ...base, firma: FIRMA_V1, ahora: AHORA + 1, tolerancia: 0 })).toEqual({ valido: false, motivo: "fuera-de-tolerancia" });
    expect(await verificarWebhook({ ...base, firma: FIRMA_V1, ahora: AHORA + 500, tolerancia: "1000" as never })).toEqual({ valido: false, motivo: "fuera-de-tolerancia" });
    expect(await verificarWebhook({ ...base, firma: FIRMA_V1, ahora: "1791300000" as never })).toEqual({ valido: false, motivo: "fuera-de-tolerancia" });
  });

  it("SDK-20 UTF-8 inválido o data no objeto dan cuerpo-invalido", async () => {
    const prefijo = Buffer.from('{"data":{"b":"');
    const cuerpo = new Uint8Array(Buffer.concat([prefijo, Buffer.from([0xff]), Buffer.from('"}}')]));
    const firma = firmarReferencia(cuerpo, SECRETO, AHORA);
    expect(await verificarWebhook({ ...base, cuerpo, firma })).toEqual({ valido: false, motivo: "cuerpo-invalido" });
    for (const texto of ['{"data":[]}', '{"data":"x"}']) {
      expect(await verificarWebhook({ ...base, cuerpo: texto, firma: firmarReferencia(texto, SECRETO, AHORA) }), texto).toEqual({ valido: false, motivo: "cuerpo-invalido" });
    }
  });

  it("SDK-20 compararTiempoConstante distingue largos y contenidos", () => {
    expect(compararTiempoConstante(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
    expect(compararTiempoConstante(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(compararTiempoConstante(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(compararTiempoConstante(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });

  it("SDK-20 la referencia node:crypto coincide con firmarReferencia (oráculo)", () => {
    expect(createHmac("sha256", SECRETO).update(`${AHORA}.${CUERPO_AV25}`).digest("hex")).toBe(HEX);
  });
});

describe("SDK-21 bordes de manejarWebhook y lectura cruda", () => {
  it("SDK-21 manejarWebhook respeta la tolerancia configurada", async () => {
    const viejo = Math.floor(Date.now() / 1000) - 1000;
    const peticion = () => new Request("https://a.example/w", { method: "POST", headers: { "x-lector-signature": firmarReferencia(CUERPO_AV25, SECRETO, viejo) }, body: CUERPO_AV25 });
    expect((await manejarWebhook({ secreto: SECRETO, alRecibir: () => undefined, tolerancia: 2000 })(peticion())).status).toBe(204);
    expect((await manejarWebhook({ secreto: SECRETO, alRecibir: () => undefined })(peticion())).status).toBe(400);
  });

  it("SDK-21 leerBytesNode concatena varios trozos en orden", async () => {
    const trozos = [Buffer.from("ab"), Buffer.from("cd"), Buffer.from("e")];
    const peticion = { headers: {}, async *[Symbol.asyncIterator]() { yield* trozos; } } as PeticionNode;
    expect(Buffer.from(await leerBytesNode(peticion)).toString()).toBe("abcde");
  });

  it("SDK-21 leerBytesNode: flujo terminado sin cuerpo da cero bytes; con objeto, JSON compacto", async () => {
    const vacio = { headers: {}, readableEnded: true, async *[Symbol.asyncIterator]() { /* consumido */ } } as PeticionNode;
    expect((await leerBytesNode(vacio)).length).toBe(0);
    const parseado = { ...vacio, body: { a: 1, b: [true] } } as PeticionNode;
    expect(Buffer.from(await leerBytesNode(parseado)).toString()).toBe('{"a":1,"b":[true]}');
  });
});

describe("SDK-18 y SDK-19 bordes del cliente", () => {
  const respuesta = (cuerpo: string | null, estado: number, tipo = "application/json") => (async () => new Response(cuerpo, { status: estado, headers: { "content-type": tipo } })) as unknown as typeof fetch;

  it("SDK-18 mensajes de validación y clave no textual", () => {
    expect(() => crearCliente({ servidor: "no es url", clave: KT })).toThrow(/servidor/);
    expect(() => crearCliente({ servidor: "ftp://x", clave: KT })).toThrow(/http o https/);
    expect(() => crearCliente({ servidor: SRV, clave: "" })).toThrow(/clave/);
    expect(() => crearCliente({ servidor: SRV, clave: 5 as never })).toThrow(/clave/);
  });

  it("SDK-18 toString, toJSON y propiedades enumerables del cliente", () => {
    const cliente = crearCliente({ servidor: SRV, clave: KT });
    expect(String(cliente)).toBe("[ClienteLector]");
    expect(JSON.stringify(cliente)).toBe(`{"servidor":"${SRV}"}`);
    expect(Object.keys(cliente).sort()).toEqual(["crearSesion", "obtenerResultado", "suprimir"]);
  });

  it("SDK-18 ErrorLector sin errores tiene lista vacía", () => {
    expect(new ErrorLector(0, "network-error").errores).toEqual([]);
  });

  it("SDK-19 barras finales repetidas, Accept y GET sin cuerpo", async () => {
    const llamadas: [string, RequestInit][] = [];
    const f = (async (u: string, i: RequestInit) => {
      llamadas.push([u, i]);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await crearCliente({ servidor: `${SRV}//`, clave: KT, fetch: f }).obtenerResultado("val_1");
    const [url, init] = llamadas[0] ?? ["", {}];
    expect(url).toBe(`${SRV}/v1/validations/val_1`);
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
    expect("body" in init).toBe(false);
  });

  it("SDK-19 problem+json nulo, type con barra final o 2xx con null", async () => {
    await expect(crearCliente({ servidor: SRV, clave: KT, fetch: respuesta("null", 500) }).obtenerResultado("v")).rejects.toMatchObject({ estado: 500, tipo: "http-error", errores: [] });
    await expect(crearCliente({ servidor: SRV, clave: KT, fetch: respuesta('{"type":"https://x/problemas/"}', 409) }).obtenerResultado("v")).rejects.toMatchObject({ tipo: "http-error" });
    await expect(crearCliente({ servidor: SRV, clave: KT, fetch: respuesta("null", 200) }).obtenerResultado("v")).rejects.toMatchObject({ estado: 200, tipo: "invalid-response" });
  });

  it("SDK-19 expiraEn es null si upload falta o no trae expires_at", async () => {
    for (const upload of [null, {}, { expires_at: 5 }]) {
      const f = respuesta(JSON.stringify({ id: "val_1", hosted_url: "u", sandbox: false, upload }), 201);
      const s = await crearCliente({ servidor: SRV, clave: KT, fetch: f }).crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000" });
      expect(s.expiraEn, JSON.stringify(upload)).toBeNull();
    }
    const sinUpload = respuesta(JSON.stringify({ id: "val_1", hosted_url: "u", sandbox: false }), 201);
    expect((await crearCliente({ servidor: SRV, clave: KT, fetch: sinUpload }).crearSesion({ autorizacion: AUT, tipoDocumento: "x" })).expiraEn).toBeNull();
  });
});
