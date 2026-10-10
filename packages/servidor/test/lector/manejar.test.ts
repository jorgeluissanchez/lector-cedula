// motor-backend-embebido, fase A (tarea A.1): crearLectorServidor().manejar(Request) con motor falso inyectable.
// Cubre MOT-19 (manejar, binario, 405, sin lectura local), MOT-20, MOT-21, MOT-22 y MOT-25.
import { describe, expect, it, vi } from "vitest";
import { crearLectorServidor, ErrorMotor, type OpcionesLectorServidor } from "../../src/index.js";
import {
  AMARILLA,
  AMARILLA_RIESGO_ALTO,
  base64url,
  CLIENTE,
  etapas,
  eventos,
  imagenSintetica,
  lineas,
  motorFalso,
  multipart,
  NUIP,
  PASAPORTE,
  peticion,
  SIN_DOCUMENTO,
  TI_MENOR,
  ultimo,
  type ConfigMotorFalso,
} from "./ayudas-lector.js";

function lectorDe(r: Response): ReadableStreamDefaultReader<Uint8Array> {
  if (r.body === null) throw new Error("respuesta sin cuerpo");
  return r.body.getReader();
}

function montar(config: ConfigMotorFalso = {}, opciones: Partial<OpcionesLectorServidor> = {}) {
  const motor = motorFalso(config);
  const alConfirmar = vi.fn();
  const lector = crearLectorServidor({ alConfirmar, motor, ...opciones });
  return { motor, alConfirmar, lector };
}

describe("MOT-19 crearLectorServidor", { timeout: 60_000 }, () => {
  it("MOT-19 Manejador estándar", async () => {
    const { lector } = montar();
    const r = await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE)));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const evs = await eventos(r);
    expect(ultimo(evs)).toMatchObject({ etapa: "resultado", ok: true, documento: { campos: { nuip: NUIP } } });
  });

  it("MOT-19 Cuerpo binario", async () => {
    const a = montar();
    const multi = await eventos(await a.lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE))));
    const b = montar();
    const bin = await eventos(
      await b.lector.manejar(
        peticion(imagenSintetica(), { headers: { "content-type": "image/png", "x-lector-cliente": base64url(JSON.stringify(CLIENTE)) } }),
      ),
    );
    expect(bin).toStrictEqual(multi);
    expect(etapas(bin)).toContain("comparando");
    expect(b.motor.llamadas[0]?.imagen.length).toBe(64);
  });

  it("MOT-19 Cuerpo binario con X-Lector-Cliente que no es base64url de JSON: cliente-invalido", async () => {
    const { lector, alConfirmar } = montar();
    const r = await lector.manejar(peticion(imagenSintetica(), { headers: { "content-type": "image/png", "x-lector-cliente": "%%%" } }));
    expect(ultimo(await eventos(r))).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "no-coincide", diferencias: ["cliente-invalido"] } });
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT", "DELETE", "PATCH"])("MOT-19 Método no permitido (%s)", async (metodo) => {
    const { lector, motor } = montar();
    const r = await lector.manejar(new Request("http://localhost/api/cedula", { method: metodo }));
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("POST");
    expect(motor.llamadas).toHaveLength(0);
  });

  it("MOT-19 Sin lectura local del cliente (front-back con dispositivo débil): valida igual y no compara", async () => {
    const { lector, alConfirmar } = montar();
    const r = await lector.manejar(peticion(multipart(imagenSintetica())));
    const evs = await eventos(r);
    expect(etapas(evs)).toStrictEqual(["recibido", "leyendo", "fraude", "resultado"]);
    expect(ultimo(evs)).toMatchObject({ ok: true, documento: { campos: { nuip: NUIP } } });
    expect(alConfirmar).toHaveBeenCalledTimes(1);
    expect(alConfirmar.mock.calls[0]?.[1]).toMatchObject({ comparacion: null });
  });

  it("MOT-19 comparar: false ignora el cliente aunque llegue", async () => {
    const { lector, alConfirmar } = montar({}, { comparar: false });
    const evs = await eventos(await lector.manejar(peticion(multipart(imagenSintetica(), { ...CLIENTE, campos: { ...CLIENTE.campos, nuip: "9999123457" } }))));
    expect(etapas(evs)).toStrictEqual(["recibido", "leyendo", "fraude", "resultado"]);
    expect(ultimo(evs)).toMatchObject({ ok: true });
    expect(alConfirmar).toHaveBeenCalledTimes(1);
  });

  it("MOT-19 Content-Type no admitido: 415 con un único evento final", async () => {
    const { lector, motor } = montar();
    const r = await lector.manejar(peticion("hola", { headers: { "content-type": "text/plain" } }));
    expect(r.status).toBe(415);
    expect(await r.json()).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "ilegible" } });
    expect(motor.llamadas).toHaveLength(0);
  });

  it.each([
    ["multipart sin imagen", () => peticion(multipart(null, CLIENTE))],
    ["imagen vacía", () => peticion(new Uint8Array(0), { headers: { "content-type": "image/png" } })],
    ["multipart malformado", () => peticion("--x\r\nbasura", { headers: { "content-type": "multipart/form-data; boundary=x" } })],
    ["sin cuerpo", () => new Request("http://localhost/api/cedula", { method: "POST", headers: { "content-type": "image/png" } })],
  ])("MOT-19 %s: 400 con evento final ilegible sin invocar el motor", async (_n, crear) => {
    const { lector, motor } = montar();
    const r = await lector.manejar(crear());
    expect(r.status).toBe(400);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "ilegible" } });
    expect(motor.llamadas).toHaveLength(0);
  });

  it("MOT-19 pasa al motor admitirTarjetaIdentidad, fraude y borrarEntrada", async () => {
    const { lector, motor } = montar({}, { limites: { admitirMenores: true } });
    await (await lector.manejar(peticion(multipart(imagenSintetica())))).text();
    expect(motor.llamadas[0]?.opciones).toMatchObject({ admitirTarjetaIdentidad: true, fraude: true, borrarEntrada: true });
    const otro = montar({}, { fraude: false });
    await (await otro.lector.manejar(peticion(multipart(imagenSintetica())))).text();
    expect(otro.motor.llamadas[0]?.opciones).toMatchObject({ admitirTarjetaIdentidad: false, fraude: false });
  });

  it("MOT-19 cerrar() cierra el motor", async () => {
    const { lector, motor } = montar();
    await lector.cerrar();
    expect(motor.cerrado).toBe(true);
  });
});

describe("MOT-20 protocolo NDJSON en vivo", { timeout: 60_000 }, () => {
  it("MOT-20 Orden de eventos", async () => {
    const { lector } = montar({ progresos: [0.2, 0.1, 0.7, 2, -1, Number.NaN, 0.9] });
    const evs = await eventos(await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE))));
    expect(etapas(evs).filter((e, i, a) => a.indexOf(e) === i)).toStrictEqual(["recibido", "leyendo", "fraude", "comparando", "resultado"]);
    const progresos = evs.flatMap((e) => ("progreso" in e && e.progreso !== undefined ? [e.progreso] : []));
    expect(progresos).toStrictEqual([0, 0.2, 0.7, 0.9]);
    for (const p of progresos) expect(p >= 0 && p <= 1).toBe(true);
  });

  it("MOT-20 Eventos en vivo", async () => {
    const { lector } = montar({ demora: 500 });
    const inicio = performance.now();
    const r = await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE)));
    const lector2 = lectorDe(r);
    const { value } = await lector2.read();
    const transcurrido = performance.now() - inicio;
    expect(new TextDecoder().decode(value)).toBe('{"etapa":"recibido"}\n');
    expect(transcurrido).toBeLessThan(100);
    while (!(await lector2.read()).done);
  });

  it("MOT-20 Sin fraude ni cliente", async () => {
    const { lector } = montar({}, { fraude: false });
    const evs = await eventos(await lector.manejar(peticion(multipart(imagenSintetica()))));
    expect(etapas(evs)).toStrictEqual(["recibido", "leyendo", "resultado"]);
    expect(ultimo(evs)).toMatchObject({ ok: true, riesgo: null });
  });

  it("MOT-20 los eventos intermedios no llevan datos y el final ok lleva documento confiable y riesgo", async () => {
    const { lector } = montar();
    const evs = await eventos(await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE))));
    for (const e of evs.slice(0, -1)) expect(Object.keys(e).every((k) => k === "etapa" || k === "progreso")).toBe(true);
    const final = ultimo(evs);
    expect(final.riesgo).toStrictEqual(AMARILLA.riesgo);
    const esperado: Record<string, unknown> = { ...AMARILLA, confiable: true };
    delete esperado.ok;
    delete esperado.riesgo;
    expect(final.documento).toStrictEqual(esperado);
  });
});

describe("MOT-21 confirmación solo si ok", { timeout: 60_000 }, () => {
  it("MOT-21 Confirmación", async () => {
    const { lector, alConfirmar } = montar();
    const req = peticion(multipart(imagenSintetica(), CLIENTE));
    await (await lector.manejar(req)).text();
    expect(alConfirmar).toHaveBeenCalledTimes(1);
    const [documento, contexto] = alConfirmar.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(documento).toMatchObject({ campos: { nuip: NUIP }, confiable: true });
    expect(contexto.riesgo).toStrictEqual(AMARILLA.riesgo);
    expect(contexto.comparacion).toStrictEqual({ coincide: true, diferencias: [] });
    expect(contexto.peticion).toBe(req);
  });

  it("MOT-21 alConfirmar se llama antes del evento final", async () => {
    const orden: string[] = [];
    const lector = crearLectorServidor({
      motor: motorFalso(),
      alConfirmar: async () => {
        await new Promise((r) => setTimeout(r, 30));
        orden.push("confirmado");
      },
    });
    const r = await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE)));
    const texto = await r.text();
    orden.push("final");
    expect(orden).toStrictEqual(["confirmado", "final"]);
    expect(texto).toContain('"etapa":"resultado"');
  });

  it("MOT-21 Rechazo sin confirmación", async () => {
    const { lector, alConfirmar } = montar();
    const cliente = { ...CLIENTE, campos: { ...CLIENTE.campos, nuip: "9999123457" } };
    const evs = await eventos(await lector.manejar(peticion(multipart(imagenSintetica(), cliente))));
    expect(ultimo(evs)).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "no-coincide", diferencias: ["campos.nuip"] } });
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it("MOT-21 alConfirmar lanza", async () => {
    const lector = crearLectorServidor({
      motor: motorFalso(),
      alConfirmar: () => {
        throw new Error("detalle-interno-sintetico");
      },
    });
    const texto = await (await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE)))).text();
    expect(lineas(texto).at(-1)).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "error-interno" } });
    expect(texto).not.toContain("detalle-interno-sintetico");
  });

  it("MOT-21 Cliente cancela durante leyendo", async () => {
    const { lector, alConfirmar, motor } = montar({ demora: 2_000 });
    const control = new AbortController();
    const r = await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE), { signal: control.signal }));
    const lectorCuerpo = lectorDe(r);
    const vistos: string[] = [];
    const decodificador = new TextDecoder();
    while (!vistos.join("").includes('"leyendo"')) vistos.push(decodificador.decode((await lectorCuerpo.read()).value));
    control.abort();
    await expect.poll(() => motor.senales[0]?.aborted).toBe(true);
    await lectorCuerpo.cancel().catch(() => undefined);
    await new Promise((r2) => setTimeout(r2, 20));
    expect(alConfirmar).not.toHaveBeenCalled();
    expect([...(motor.llamadas[0]?.imagen ?? [1])].every((b) => b === 0)).toBe(true);
  });

  it("MOT-21 el consumidor cancela el cuerpo de la respuesta: se cancela el motor", async () => {
    const { lector, alConfirmar, motor } = montar({ demora: 2_000 });
    const r = await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE)));
    const lectorCuerpo = lectorDe(r);
    await lectorCuerpo.read();
    await lectorCuerpo.cancel();
    await expect.poll(() => motor.senales[0]?.aborted).toBe(true);
    expect(alConfirmar).not.toHaveBeenCalled();
  });
});

describe("MOT-22 motivos de rechazo", { timeout: 60_000 }, () => {
  async function motivo(config: ConfigMotorFalso, opciones: Partial<OpcionesLectorServidor> = {}, cliente?: unknown) {
    const { lector, alConfirmar } = montar(config, opciones);
    const evs = await eventos(await lector.manejar(peticion(multipart(imagenSintetica(), cliente))));
    expect(alConfirmar).not.toHaveBeenCalled();
    const final = ultimo(evs) as { ok: boolean; rechazo?: { motivo: string } };
    expect(final.ok).toBe(false);
    return final.rechazo?.motivo;
  }

  it("MOT-22 Tabla de motivos", async () => {
    const documentos = { limites: { documentos: ["cedula"] } };
    const motivos = [
      await motivo({ resultado: SIN_DOCUMENTO }, documentos),
      await motivo({ resultado: TI_MENOR }, documentos),
      await motivo({ resultado: PASAPORTE }, documentos),
      await motivo({ resultado: AMARILLA_RIESGO_ALTO }, documentos),
      await motivo({ error: new ErrorMotor("motor-ocupado") }, documentos),
    ];
    expect(motivos).toStrictEqual(["ilegible", "menor-de-edad", "documento-no-admitido", "fraude", "ocupado"]);
  });

  it("MOT-22 Tiempo agotado", async () => {
    expect(await motivo({ demora: 200 }, { limites: { tiempoMs: 50 } })).toBe("tiempo-agotado");
  });

  it("MOT-22 Tiempo agotado aunque el motor ignore la señal", async () => {
    const inicio = performance.now();
    expect(await motivo({ demora: 400, ignorarSenal: true }, { limites: { tiempoMs: 50 } })).toBe("tiempo-agotado");
    expect(performance.now() - inicio).toBeLessThan(350);
  });

  it.each([
    ["imagen-demasiado-grande", "demasiado-grande"],
    ["tiempo-agotado", "tiempo-agotado"],
    ["motor-ocupado", "ocupado"],
    ["formato-no-soportado", "ilegible"],
    ["motor-cerrado", "error-interno"],
    ["motor-error-interno", "error-interno"],
    ["recurso-corrupto", "error-interno"],
    ["opciones-invalidas", "error-interno"],
  ] as const)("MOT-22 ErrorMotor %s -> %s", async (codigo, esperado) => {
    expect(await motivo({ error: new ErrorMotor(codigo) })).toBe(esperado);
  });

  it("MOT-22 un error sin código del motor es error-interno y no viaja el mensaje", async () => {
    const { lector } = montar({ error: new Error("pila-sintetica") });
    const texto = await (await lector.manejar(peticion(multipart(imagenSintetica())))).text();
    expect(lineas(texto).at(-1)).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "error-interno" } });
    expect(texto).not.toContain("pila-sintetica");
  });

  it.each([
    ["menor-de-edad", "menor-de-edad"],
    ["documento-no-admitido", "documento-no-admitido"],
    ["ti-mayor-de-edad", "documento-no-admitido"],
    ["sin-lectura", "ilegible"],
    ["mrz-no-valida", "ilegible"],
    ["pdf417-no-valido", "ilegible"],
  ])("MOT-22 lectura fallida %s -> %s", async (codigo, esperado) => {
    expect(await motivo({ resultado: { ok: false, error: { codigo }, confiable: false, riesgo: null } })).toBe(esperado);
  });

  it("MOT-22 menor admitido por el motor (CE de un menor) se rechaza salvo admitirMenores", async () => {
    const menor = { ...PASAPORTE, menorDeEdad: true as const };
    expect(await motivo({ resultado: menor })).toBe("menor-de-edad");
    expect(await motivo({ resultado: { ...AMARILLA, tipoDocumento: "tarjeta-identidad" } })).toBe("menor-de-edad");
    const { lector, alConfirmar } = montar({ resultado: menor }, { limites: { admitirMenores: true } });
    expect(ultimo(await eventos(await lector.manejar(peticion(multipart(imagenSintetica())))))).toMatchObject({ ok: true });
    expect(alConfirmar).toHaveBeenCalledTimes(1);
  });

  it("MOT-22 documentos: alias cedula admite la cédula de ciudadanía y los tipos exactos se respetan", async () => {
    for (const [documentos, resultado, ok] of [
      [["cedula"], AMARILLA, true],
      [["pasaporte"], PASAPORTE, true],
      [["pasaporte"], AMARILLA, false],
      [["cedula-ciudadania"], AMARILLA, true],
    ] as const) {
      const { lector } = montar({ resultado }, { limites: { documentos } });
      expect(ultimo(await eventos(await lector.manejar(peticion(multipart(imagenSintetica())))))).toMatchObject({ ok });
    }
  });

  it("MOT-22 fraude.rechazarDesde medio rechaza riesgo medio; por omisión solo alto", async () => {
    const medio = { ...AMARILLA, riesgo: { ...AMARILLA.riesgo, nivel: "medio" } } as typeof AMARILLA;
    expect(await motivo({ resultado: medio }, { fraude: { rechazarDesde: "medio" } })).toBe("fraude");
    const { lector } = montar({ resultado: medio });
    expect(ultimo(await eventos(await lector.manejar(peticion(multipart(imagenSintetica())))))).toMatchObject({ ok: true });
    const bajo = montar({}, { fraude: { rechazarDesde: "medio" } });
    expect(ultimo(await eventos(await bajo.lector.manejar(peticion(multipart(imagenSintetica())))))).toMatchObject({ ok: true });
  });

  it("MOT-22 con fraude: false no se rechaza por riesgo y el final lleva riesgo null", async () => {
    const { lector } = montar({ resultado: AMARILLA_RIESGO_ALTO }, { fraude: false });
    expect(ultimo(await eventos(await lector.manejar(peticion(multipart(imagenSintetica())))))).toMatchObject({ ok: true, riesgo: null });
  });
});

describe("MOT-25 respuesta sin streaming", { timeout: 60_000 }, () => {
  it("MOT-25 Accept JSON", async () => {
    const { lector, alConfirmar } = montar();
    const r = await lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE), { headers: { accept: "application/json" } }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const cuerpo = (await r.json()) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({ etapa: "resultado", ok: true, documento: { campos: { nuip: NUIP } } });
    expect(alConfirmar).toHaveBeenCalledTimes(1);
  });

  it("MOT-25 Parámetro de consulta", async () => {
    const a = montar();
    const json = await (await a.lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE), { url: "http://localhost/api/cedula?streaming=0", headers: { accept: "*/*" } }))).text();
    const b = montar();
    const r = await b.lector.manejar(peticion(multipart(imagenSintetica(), CLIENTE), { headers: { accept: "application/json" } }));
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(json).toBe(await r.text());
  });

  it.each([
    ["application/json, application/x-ndjson", "application/x-ndjson; charset=utf-8"],
    ["*/*", "application/x-ndjson; charset=utf-8"],
    ["", "application/x-ndjson; charset=utf-8"],
    ["text/html, application/json;q=0.9", "application/json; charset=utf-8"],
  ])("MOT-25 Accept %j -> %s", async (accept, tipo) => {
    const { lector } = montar();
    const r = await lector.manejar(peticion(multipart(imagenSintetica()), { headers: accept ? { accept } : {} }));
    expect(r.headers.get("content-type")).toBe(tipo);
    await r.text();
  });

  it("MOT-25 ?streaming=1 sigue en NDJSON", async () => {
    const { lector } = montar();
    const r = await lector.manejar(peticion(multipart(imagenSintetica()), { url: "http://localhost/api/cedula?streaming=1" }));
    expect(r.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    await r.text();
  });

  it("MOT-25 Igualdad entre protocolos", async () => {
    const casos: [ConfigMotorFalso, Partial<OpcionesLectorServidor>, unknown][] = [
      [{}, {}, CLIENTE],
      [{}, {}, undefined],
      [{}, { fraude: false }, CLIENTE],
      [{}, {}, { ...CLIENTE, campos: { ...CLIENTE.campos, nuip: "9999123457", rh: "B+" } }],
      [{ resultado: SIN_DOCUMENTO }, {}, undefined],
      [{ resultado: TI_MENOR }, {}, undefined],
      [{ resultado: PASAPORTE }, { limites: { documentos: ["cedula"] } }, undefined],
      [{ resultado: AMARILLA_RIESGO_ALTO }, {}, undefined],
      [{ error: new ErrorMotor("motor-ocupado") }, {}, undefined],
      [{ demora: 200 }, { limites: { tiempoMs: 20 } }, undefined],
    ];
    for (const [config, opciones, cliente] of casos) {
      const nd = montar(config, opciones);
      const js = montar(config, opciones);
      const final = ultimo(await eventos(await nd.lector.manejar(peticion(multipart(imagenSintetica(), cliente)))));
      const unico = await (await js.lector.manejar(peticion(multipart(imagenSintetica(), cliente), { headers: { accept: "application/json" } }))).json();
      expect(unico).toStrictEqual(final);
      expect(js.alConfirmar.mock.calls.length).toBe(nd.alConfirmar.mock.calls.length);
    }
  });
});
