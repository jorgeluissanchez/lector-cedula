// MOT-20 (contrato de esquema y propiedad) y MOT-23 (privacidad del manejador): cada línea de 200 respuestas valida
// contra protocolo-ndjson.schema.json con exactamente un `resultado`, siempre el último; entradas multipart arbitrarias
// nunca hacen lanzar; 413 antes de leer todo el cuerpo; búferes a cero; eventos intermedios sin datos.
import { createRequire } from "node:module";
import Ajv from "ajv";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearLectorServidor, ErrorMotor, type OpcionesLectorServidor } from "../../src/index.js";
import {
  AMARILLA,
  AMARILLA_RIESGO_ALTO,
  base64url,
  CLIENTE,
  eventos,
  imagenSintetica,
  motorFalso,
  multipart,
  PASAPORTE,
  peticion,
  SIN_DOCUMENTO,
  TI_MENOR,
  type ConfigMotorFalso,
} from "./ayudas-lector.js";

const esquema = createRequire(import.meta.url)("@lector-cedula/protocolo/protocolo-ndjson.schema.json") as object;
const validar = new Ajv({ allErrors: true }).compile(esquema);

function lineasDe(texto: string): unknown[] {
  return texto === "" ? [] : texto.replace(/\n$/u, "").split("\n").map((l) => JSON.parse(l) as unknown);
}

function comprobarRespuesta(texto: string): void {
  const evs = lineasDe(texto);
  for (const e of evs) expect(validar(e), JSON.stringify(validar.errors)).toBe(true);
  const finales = evs.filter((e) => (e as { etapa: string }).etapa === "resultado");
  expect(finales).toHaveLength(1);
  expect((evs.at(-1) as { etapa: string }).etapa).toBe("resultado");
}

const CASOS: [ConfigMotorFalso, Partial<OpcionesLectorServidor>, unknown][] = [
  [{}, {}, CLIENTE],
  [{}, {}, undefined],
  [{}, { fraude: false }, undefined],
  [{ progresos: [0.1, 0.5, 0.9] }, {}, CLIENTE],
  [{}, {}, { ...CLIENTE, campos: { ...CLIENTE.campos, nuip: "9999123457" } }],
  [{}, {}, "no-es-json{"],
  [{ resultado: SIN_DOCUMENTO }, {}, undefined],
  [{ resultado: TI_MENOR }, {}, undefined],
  [{ resultado: PASAPORTE }, { limites: { documentos: ["cedula"] } }, undefined],
  [{ resultado: AMARILLA_RIESGO_ALTO }, {}, CLIENTE],
  [{ resultado: AMARILLA_RIESGO_ALTO }, { fraude: { bloquearSi: "alto" } }, CLIENTE],
  [{ error: new ErrorMotor("motor-ocupado") }, {}, undefined],
  [{ error: new ErrorMotor("imagen-demasiado-grande") }, {}, undefined],
  [{ error: new Error("x") }, {}, undefined],
  [{ demora: 100 }, { limites: { tiempoMs: 5 } }, undefined],
];

describe("MOT-20 esquema de los eventos", { timeout: 60_000 }, () => {
  it("MOT-20 Esquema de los eventos: 200 respuestas válidas, un único resultado al final", async () => {
    let respuestas = 0;
    for (let i = 0; respuestas < 200; i++) {
      const [config, opciones, cliente] = CASOS[i % CASOS.length] ?? [{}, {}, undefined];
      const lector = crearLectorServidor({ alConfirmar: () => undefined, motor: motorFalso(config), ...opciones });
      const alConfirmarLanza = i % 7 === 3;
      const lector2 = alConfirmarLanza
        ? crearLectorServidor({ alConfirmar: () => { throw new Error("x"); }, motor: motorFalso(config), ...opciones })
        : lector;
      const json = i % 5 === 4;
      const r = await lector2.manejar(peticion(multipart(imagenSintetica(), cliente), json ? { headers: { accept: "application/json" } } : {}));
      comprobarRespuesta(await r.text());
      respuestas++;
    }
    expect(respuestas).toBe(200);
  });

  it("MOT-20 Propiedad: entradas multipart arbitrarias, siempre un único evento final y nunca lanza", async () => {
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor: motorFalso() });
    const parte = fc.record({
      nombre: fc.oneof(fc.constantFrom("imagen", "cliente", "otro"), fc.string()),
      archivo: fc.boolean(),
      contenido: fc.oneof(fc.string(), fc.uint8Array({ maxLength: 256 }).map((b) => Buffer.from(b).toString("latin1"))),
    });
    const tipos = fc.constantFrom("multipart/form-data; boundary=FRONTERA", "multipart/form-data", "image/png", "application/octet-stream", "text/plain", "");
    await fc.assert(
      fc.asyncProperty(fc.array(parte, { maxLength: 4 }), tipos, fc.boolean(), fc.option(fc.string(), { nil: undefined }), async (partes, tipo, roto, cabecera) => {
        let cuerpo = partes
          .map((p) => `--FRONTERA\r\nContent-Disposition: form-data; name="${p.nombre}"${p.archivo ? '; filename="f.png"' : ""}\r\n\r\n${p.contenido}\r\n`)
          .join("");
        cuerpo += roto ? "--FRONT" : "--FRONTERA--\r\n";
        const headers: Record<string, string> = {};
        if (tipo) headers["content-type"] = tipo;
        if (cabecera !== undefined) headers["x-lector-cliente"] = cabecera;
        const r = await lector.manejar(peticion(Buffer.from(cuerpo, "latin1"), { headers }));
        expect([200, 400, 413, 415]).toContain(r.status);
        comprobarRespuesta(await r.text());
      }),
      { numRuns: 1000 },
    );
  });
});

describe("MOT-23 privacidad del manejador", { timeout: 60_000 }, () => {
  const CLAVE = Symbol.for("@lector-cedula/servidor.registroBuferes");
  let registro: Uint8Array[];
  beforeEach(() => {
    registro = [];
    (globalThis as Record<symbol, unknown>)[CLAVE] = registro;
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, CLAVE);
  });

  function todosACero(): void {
    expect(registro.length).toBeGreaterThan(0);
    for (const b of registro) expect(b.every((x) => x === 0)).toBe(true);
  }

  it("MOT-23 Bytes a cero: éxito, rechazo y cancelación (multipart y binario)", async () => {
    const exito = crearLectorServidor({ alConfirmar: () => undefined, motor: motorFalso() });
    await (await exito.manejar(peticion(multipart(imagenSintetica(), CLIENTE)))).text();
    todosACero();

    registro.length = 0;
    const rechazo = crearLectorServidor({ alConfirmar: () => undefined, motor: motorFalso({ resultado: AMARILLA_RIESGO_ALTO }), fraude: { bloquearSi: "alto" } });
    await (await rechazo.manejar(peticion(imagenSintetica(), { headers: { "content-type": "image/png", "x-lector-cliente": base64url("{}") } }))).text();
    todosACero();

    registro.length = 0;
    const motor = motorFalso({ demora: 5_000 });
    const cancelado = crearLectorServidor({ alConfirmar: () => undefined, motor });
    const control = new AbortController();
    const r = await cancelado.manejar(peticion(multipart(imagenSintetica(), CLIENTE), { signal: control.signal }));
    const lector = r.body?.getReader();
    await lector?.read();
    control.abort();
    await expect.poll(() => motor.senales[0]?.aborted).toBe(true);
    await expect.poll(() => registro.every((b) => b.every((x) => x === 0))).toBe(true);
    todosACero();
  });

  it("MOT-23 Bytes a cero también con 413 por conteo y con multipart malformado", async () => {
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor: motorFalso(), limites: { bytes: 100 } });
    const r = await lector.manejar(peticion(imagenSintetica(5_000), { headers: { "content-type": "image/png" } }));
    expect(r.status).toBe(413);
    todosACero();
    registro.length = 0;
    await lector.manejar(peticion(multipart(null, CLIENTE)));
    for (const b of registro) expect(b.every((x) => x === 0)).toBe(true);
  });

  it("MOT-23 413 antes de terminar de leer un cuerpo mayor que el límite", async () => {
    const motor = motorFalso();
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor });
    const MiB = 1024 * 1024;
    let entregados = 0;
    let cancelado = false;
    const flujo = new ReadableStream<Uint8Array>({
      pull(c) {
        entregados++;
        if (entregados > 40) c.close();
        else c.enqueue(new Uint8Array(MiB));
      },
      cancel() {
        cancelado = true;
      },
    });
    const r = await lector.manejar(new Request("http://localhost/api/cedula", { method: "POST", body: flujo, headers: { "content-type": "image/png" }, duplex: "half" } as RequestInit));
    expect(r.status).toBe(413);
    expect(await r.json()).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "demasiado-grande" } });
    expect(cancelado).toBe(true);
    expect(entregados).toBeLessThanOrEqual(13);
    expect(motor.llamadas).toHaveLength(0);
  });

  it("MOT-23 413 por Content-Length sin leer el cuerpo", async () => {
    const motor = motorFalso();
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor });
    let leidos = 0;
    const flujo = new ReadableStream<Uint8Array>({
      pull(c) {
        leidos++;
        c.close();
      },
    });
    const r = await lector.manejar(
      new Request("http://localhost/api/cedula", { method: "POST", body: flujo, headers: { "content-type": "image/png", "content-length": "10485761" }, duplex: "half" } as RequestInit),
    );
    expect(r.status).toBe(413);
    expect(leidos).toBeLessThanOrEqual(1);
    expect(motor.llamadas).toHaveLength(0);
  });

  it("MOT-23 Demasiado grande: 10 485 761 bytes dan 413 y el motor no se invoca; 10 485 760 sí se lee", async () => {
    const motor = motorFalso();
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor });
    const grande = await lector.manejar(peticion(multipart(imagenSintetica(10_485_761))));
    expect(grande.status).toBe(413);
    expect(motor.llamadas).toHaveLength(0);
    const justo = await lector.manejar(peticion(imagenSintetica(10_485_760), { headers: { "content-type": "image/png" } }));
    expect(justo.status).toBe(200);
    await justo.text();
    expect(motor.llamadas).toHaveLength(1);
  });

  it("MOT-23 Eventos intermedios sin datos", async () => {
    for (const config of [{}, { progresos: [0.3, 0.6] }, { resultado: SIN_DOCUMENTO }]) {
      const lector = crearLectorServidor({ alConfirmar: () => undefined, motor: motorFalso(config) });
      const evs = await eventos(await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE))));
      for (const e of evs.slice(0, -1)) {
        const texto = JSON.stringify(e);
        expect(texto).not.toContain("9999123456");
        expect(texto).not.toContain("PRUEBA");
      }
    }
  });

  it("MOT-23 el manejador no escribe en consola", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    try {
      for (const config of [{}, { error: new Error("9999123456") }, { resultado: AMARILLA }]) {
        const lector = crearLectorServidor({ alConfirmar: () => { throw new Error("PRUEBA"); }, motor: motorFalso(config) });
        await (await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE)))).text();
      }
      for (const e of espias) expect(e).not.toHaveBeenCalled();
    } finally {
      for (const e of espias) e.mockRestore();
    }
  });
});
