// Detalle del controlador, reintentos, envío y cargador (SDK-27, SDK-28, SDK-30, SDK-38, SDK-39): casos que fija la
// prueba de mutación (cada uno, una regla observable del contrato).
import { describe, expect, it } from "vitest";
import { baseRecursos, cargarMotor, ErrorMotor, type AlmacenMinimo } from "../src/cargador.js";
import { codigoErrorInicio, codigoErrorLectura } from "../src/controlador.js";
import { enviarCaptura } from "../src/envio.js";
import { crearLector, type EstadoLector } from "../src/index.js";
import { opcionInvalida } from "../src/opciones.js";
import { crearReintentos, MAX_LECTURAS, TIEMPO_MAX_REINTENTOS_MS } from "../src/reintentos.js";
import { AMARILLA, crearFalsos, DIGITAL, esperar, NO_ENCONTRADO, VIDEO, type Lectura } from "./falsos.js";

const vueltas = async (n = 20): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("SDK-27 códigos de error", () => {
  it.each([
    [{ codigo: "motor-no-disponible" }, "motor-no-disponible"],
    [{ codigo: "entorno-no-soportado" }, "entorno-no-soportado"],
    [{ codigo: "otro" }, "camara-error"],
    [{ name: "NotAllowedError" }, "camara-denegada"],
    [{ name: "SecurityError" }, "camara-denegada"],
    [{ name: "OverconstrainedError" }, "camara-no-disponible"],
    [{ name: "AbortError" }, "camara-ocupada"],
    [null, "camara-error"],
    ["motor-no-disponible", "camara-error"],
    [undefined, "camara-error"],
  ])("SDK-27 codigoErrorInicio(%j) = %s", (e, c) => {
    expect(codigoErrorInicio(e)).toBe(c);
  });

  it.each([
    ["motor", "motor-no-disponible"],
    ["modelo-no-disponible", "motor-no-disponible"],
    ["lector-terminado", "motor-no-disponible"],
    ["menor-de-edad", "menor-de-edad"],
    ["ti-mayor-de-edad", "menor-de-edad"],
    ["documento-no-admitido", "documento-no-admitido"],
    ["pdf417-no-encontrado", "lectura-fallida"],
    ["mrz-no-valida", "lectura-fallida"],
    ["tiempo-agotado", "lectura-fallida"],
  ] as const)("SDK-27 codigoErrorLectura(%s) = %s", (error, c) => {
    expect(codigoErrorLectura({ ok: false, error })).toBe(c);
  });

  it("SDK-27 con opciones inválidas el mensaje es en español aunque idioma sea en", () => {
    const c = crearLector({ idioma: "en", servidor: "ftp://x" }, crearFalsos().deps);
    expect(c.obtenerEstado().error?.mensaje).toBe("La configuración del lector no es válida.");
  });

  it("SDK-27 entorno-no-soportado y motor-no-disponible al abrir", async () => {
    const f = crearFalsos();
    f.deps.abrirCamara = async () => Promise.reject(Object.assign(new Error("x"), { codigo: "motor-no-disponible" }));
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    expect(c.obtenerEstado().error?.codigo).toBe("motor-no-disponible");
  });

  it("SDK-27 opciones: servidor no textual y URL http no local", () => {
    expect(opcionInvalida({ servidor: ["https://a.example"] })).toBe("servidor");
    expect(opcionInvalida({ servidor: "http://intruso.example" })).toBe("servidor");
  });
});

describe("SDK-28 y SDK-30 detalle del controlador", () => {
  it("SDK-28 score igual al umbral (70) ya es listo", async () => {
    const c = crearLector({}, crearFalsos({ scores: [70], manual: true }).deps);
    await c.iniciar(VIDEO);
    expect(c.obtenerEstado().fase).toBe("activo");
    c.destruir();
    const f = crearFalsos({ scores: [70, 0] });
    const c2 = crearLector({}, f.deps);
    await c2.iniciar(VIDEO);
    const e = await esperar(c2.obtenerEstado, (x) => x.calidad !== null);
    expect(e).toMatchObject({ fase: "listo", calidad: { score: 70 } });
    c2.destruir();
  });

  it("SDK-27 captura guiada: un frame guiado basta para leer (activo -> leyendo)", async () => {
    const f = crearFalsos({ scores: [10], guiada: true });
    const c = crearLector({}, f.deps);
    const vistos: string[] = [];
    c.suscribir((e) => vistos.push(e.fase));
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    expect(vistos.filter((x, i, a) => a[i - 1] !== x)).toStrictEqual(["permiso", "activo", "leyendo", "resultado"]);
  });

  it("SDK-28 captura rechazada en la revalidación: se sigue analizando y no se lee", async () => {
    const f = crearFalsos({ scores: [90], capturasRechazadas: 1 });
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    expect(f.capturas).toBe(2);
    expect(f.lecturasHechas).toBe(1);
  });

  it("SDK-41 Fallo del análisis de calidad: activo→error con calidad-error y libera cámara y Worker", async () => {
    const f = crearFalsos({ calidadFalla: true });
    const c = crearLector({}, f.deps);
    const vistas: string[] = [];
    c.suscribir((x) => vistas.push(x.fase));
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.fase === "error");
    expect(vistas).toStrictEqual(["permiso", "activo", "error"]);
    expect(e.error?.codigo).toBe("calidad-error");
    expect(f.pistas.every((p) => p.readyState === "ended")).toBe(true);
    expect(f.terminados.calidad).toBe(1);
  });

  it("SDK-28 progreso del lector y captura liberada (píxeles a cero)", async () => {
    const f = crearFalsos();
    const c = crearLector({}, f.deps);
    const progresos: (number | null)[] = [];
    c.suscribir((e) => progresos.push(e.progreso));
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    expect(progresos).toContain(0.5);
    expect(c.obtenerEstado().progreso).toBe(1);
    expect(f.pixeles.every((p) => p.every((b) => b === 0))).toBe(true);
    expect(f.pistas[0]?.readyState).toBe("ended");
  });

  it("SDK-28 el contenido final es la fuente del resultado (mrz-td3)", async () => {
    const td3: Lectura = { ...(DIGITAL as Extract<Lectura, { ok: true }>), fuente: "mrz-td3", tipoDocumento: "pasaporte" };
    const c = crearLector({}, crearFalsos({ contenido: "mrz", lecturas: [td3] }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    expect(e.contenido).toBe("mrz-td3");
    expect(e.resultado?.tipo).toBe("pasaporte");
  });

  it("SDK-28 una fuente desconocida conserva el contenido de la pista", async () => {
    const raro = { ...(AMARILLA as Extract<Lectura, { ok: true }>), fuente: "otra" } as unknown as Lectura;
    const c = crearLector({}, crearFalsos({ contenido: "mrz", lecturas: [raro] }).deps);
    await c.iniciar(VIDEO);
    expect((await esperar(c.obtenerEstado, (x) => x.fase === "resultado")).contenido).toBe("mrz-td1");
  });

  it("SDK-30 cancelar pone srcObject del vídeo a null", async () => {
    const video = { srcObject: "flujo" } as unknown as HTMLVideoElement;
    const c = crearLector({}, crearFalsos({ scores: [10] }).deps);
    await c.iniciar(video);
    c.cancelar();
    expect(video.srcObject).toBeNull();
  });

  it("SDK-30 iniciar dos veces abre una sola cámara", async () => {
    const f = crearFalsos({ scores: [10] });
    const c = crearLector({}, f.deps);
    await Promise.all([c.iniciar(VIDEO), c.iniciar(VIDEO)]);
    expect(f.camarasAbiertas).toBe(1);
    c.destruir();
  });

  it("SDK-30 reintentar desde resultado conserva el Worker lector y vuelve a leer", async () => {
    const f = crearFalsos();
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    c.reintentar();
    expect(c.obtenerEstado()).toMatchObject({ fase: "permiso", intento: 2, resultado: null });
    await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    expect(f.terminados.lector).toBe(0);
    expect(f.lecturasHechas).toBe(2);
    expect(c.obtenerEstado().intento).toBe(2);
  });

  it("SDK-30 reintentar fuera de resultado/error, o antes de iniciar, no hace nada", async () => {
    const f = crearFalsos({ camara: { name: "NotAllowedError" } });
    const c = crearLector({}, f.deps);
    c.reintentar();
    expect(c.obtenerEstado().fase).toBe("inicio");
    const g = crearFalsos({ scores: [10] });
    const c2 = crearLector({}, g.deps);
    await c2.iniciar(VIDEO);
    c2.reintentar();
    expect(c2.obtenerEstado().fase).toBe("activo");
    expect(g.camarasAbiertas).toBe(1);
    c2.destruir();
  });

  it("SDK-30 tras destruir el estado no cambia y suscribir no notifica", async () => {
    const f = crearFalsos({ lecturas: ["pendiente"] });
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "leyendo");
    c.destruir();
    const tarde: EstadoLector[] = [];
    c.suscribir((e) => tarde.push(e));
    f.resolverPendiente(AMARILLA);
    await vueltas();
    expect(c.obtenerEstado().fase).toBe("leyendo");
    expect(tarde).toStrictEqual([]);
    expect(f.terminados).toStrictEqual({ calidad: 1, lector: 1 });
  });

  it("SDK-30 cancelar durante la lectura: no hay reintento ni resultado posterior", async () => {
    const f = crearFalsos({ lecturas: ["pendiente"] });
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "leyendo");
    c.cancelar();
    await vueltas();
    expect(c.obtenerEstado().fase).toBe("inicio");
    expect(f.camarasAbiertas).toBe(1);
  });

  it("SDK-28 los reintentos se reinician con cancelar e iniciar (3 lecturas por captura guiada)", async () => {
    const f = crearFalsos({ lecturas: [NO_ENCONTRADO] });
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "error");
    expect(f.lecturasHechas).toBe(MAX_LECTURAS);
    c.reintentar();
    await esperar(c.obtenerEstado, (x) => x.fase === "error" && f.lecturasHechas > MAX_LECTURAS);
    expect(f.lecturasHechas).toBe(2 * MAX_LECTURAS);
  });

  it("SDK-30 cancelar en permiso aunque la cámara luego falle termina en inicio", async () => {
    const f = crearFalsos({ camara: { name: "NotAllowedError" } });
    const c = crearLector({}, f.deps);
    const p = c.iniciar(VIDEO);
    c.cancelar();
    await p;
    expect(c.obtenerEstado()).toMatchObject({ fase: "inicio", error: null });
  });

  it("SDK-30 destruir en permiso: no hay transiciones posteriores", async () => {
    const f = crearFalsos();
    const c = crearLector({}, f.deps);
    const p = c.iniciar(VIDEO);
    c.destruir();
    await p;
    expect(c.obtenerEstado().fase).toBe("permiso");
    expect(f.pistas.every((x) => x.readyState === "ended")).toBe(true);
  });
});

describe("SDK-38 envío: detalle", () => {
  const IMG = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
  it("SDK-38 solo servidor sin sesión: envio null", async () => {
    let llamadas = 0;
    const c = crearLector({ servidor: "https://a.example" }, crearFalsos({ fetch: (async () => (llamadas++, new Response())) as typeof fetch }).deps);
    await c.iniciar(VIDEO);
    expect((await esperar(c.obtenerEstado, (x) => x.fase === "resultado")).envio).toBeNull();
    expect(llamadas).toBe(0);
  });

  it("SDK-38 captura sin imagen: no hay envío; imagen fallida: subida-fallida", async () => {
    const opts = { servidor: "https://a.example", sesion: "t" };
    const f1 = crearFalsos({ sinImagen: true });
    const c1 = crearLector(opts, f1.deps);
    await c1.iniciar(VIDEO);
    await esperar(c1.obtenerEstado, (x) => x.fase === "resultado");
    await vueltas();
    expect(c1.obtenerEstado().envio).toStrictEqual({ estado: "enviando" });
    const c2 = crearLector(opts, crearFalsos({ imagenFalla: true, fetch: (async () => new Response()) as typeof fetch }).deps);
    await c2.iniciar(VIDEO);
    expect((await esperar(c2.obtenerEstado, (x) => x.envio?.estado === "fallido")).envio).toStrictEqual({ estado: "fallido", codigo: "subida-fallida" });
  });

  it("SDK-38 cancelar antes de terminar el envío: no se notifica el envío", async () => {
    let soltar: (r: Response) => void = () => undefined;
    const f = crearFalsos({ fetch: (() => new Promise<Response>((r) => (soltar = r))) as typeof fetch });
    const c = crearLector({ servidor: "https://a.example", sesion: "t" }, f.deps);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    c.reintentar();
    soltar(new Response(null, { status: 401 }));
    await vueltas();
    expect(c.obtenerEstado().envio?.estado).not.toBe("fallido");
  });

  it("SDK-38 método, nombres de archivo y barras finales del servidor", async () => {
    const llamadas: { url: string; init: RequestInit | undefined }[] = [];
    const respuestas = [new Response(JSON.stringify({ id: "v1", upload: { url: "https://a.example/s" } }), { status: 200 }), new Response(null, { status: 200 })];
    const f = (async (u: string, init?: RequestInit) => (llamadas.push({ url: u, init }), respuestas.shift() as Response)) as typeof fetch;
    expect(await enviarCaptura({ servidor: "https://a.example//", sesion: "t", imagen: IMG, fetch: f })).toStrictEqual({ estado: "enviado", validacion_id: "v1" });
    expect(llamadas[0]?.url).toBe("https://a.example/v/t/inicio");
    expect(llamadas[1]?.init?.method).toBe("POST");
    const cuerpo = llamadas[1]?.init?.body as FormData;
    expect((cuerpo.get("front") as File).name).toBe("front.jpg");
    expect((cuerpo.get("back") as File).name).toBe("back.jpg");
  });

  it("SDK-38 identificador no textual: sesion-invalida", async () => {
    const f = (async () => new Response(JSON.stringify({ id: 5, upload: { url: "https://a.example/s" } }))) as typeof fetch;
    expect(await enviarCaptura({ servidor: "https://a.example", sesion: "t", imagen: IMG, fetch: f })).toStrictEqual({ estado: "fallido", codigo: "sesion-invalida" });
  });
});

describe("SDK-28 reintentos (OFF-26)", () => {
  const fallo = (error: "mrz-no-valida" | "mrz-no-encontrada" | "menor-de-edad" | "motor" | "tiempo-agotado"): Lectura => ({ ok: false, tipo: "mrz", error });
  it("SDK-28 política: 3 lecturas o 20 000 ms desde la primera", () => {
    expect([MAX_LECTURAS, TIEMPO_MAX_REINTENTOS_MS]).toStrictEqual([3, 20_000]);
    let t = 5000;
    const r = crearReintentos(() => t);
    r.iniciar();
    t = 24_999;
    expect(r.decidir(fallo("mrz-no-valida"))).toBe("reintentar");
    r.iniciar();
    t = 25_000;
    expect(r.decidir(fallo("mrz-no-valida"))).toBe("mostrar");
    r.reiniciar();
    t = 0;
    r.iniciar();
    r.iniciar();
    expect(r.decidir(fallo("tiempo-agotado"))).toBe("reintentar");
    r.iniciar();
    expect(r.decidir(fallo("tiempo-agotado"))).toBe("mostrar");
    r.reiniciar();
    r.iniciar();
    expect(r.decidir(fallo("menor-de-edad"))).toBe("mostrar");
    expect(r.decidir(fallo("motor"))).toBe("mostrar");
    expect(r.decidir(AMARILLA)).toBe("mostrar");
    expect(r.decidir(fallo("mrz-no-encontrada"))).toBe("reintentar");
  });
});

describe("SDK-39 cargador: detalle", () => {
  const REC = "https://app-a.example/rec/";
  it("SDK-39 ErrorMotor lleva el mensaje del código", () => {
    const e = new ErrorMotor("x");
    expect([e.message, e.codigo, e.motivo]).toStrictEqual(["motor-no-disponible", "motor-no-disponible", "x"]);
  });

  it("SDK-06 base relativa se resuelve contra el documento o localhost", () => {
    expect(baseRecursos("/a")).toBe("http://localhost/a/");
  });

  it("SDK-06 peticiones sin caché HTTP y solo del mismo origen; blobs con el tipo y los bytes", async () => {
    const datos = new Uint8Array([9, 8, 7]);
    const { createHash } = await import("node:crypto");
    const m = JSON.stringify({ version: "0.1.0", recursos: [{ archivo: "a.wasm", bytes: 3, sha256: createHash("sha256").update(datos).digest("hex"), tipo: "application/wasm" }] });
    const inits: (RequestInit | undefined)[] = [];
    const blobs: Blob[] = [];
    const puestos: [string, Response][] = [];
    const almacen: AlmacenMinimo = {
      open: async () => ({ match: async () => undefined, put: async (u, r) => void puestos.push([u, r]) }),
      keys: async () => [],
      delete: async () => true,
    };
    const fetch = async (u: string, i?: RequestInit): Promise<Response> => (inits.push(i), new Response(u.endsWith("manifest.json") ? m : datos.slice()));
    const r = await cargarMotor(REC, { fetch, caches: almacen, crearUrl: (b) => (blobs.push(b), "blob:x") });
    expect(r.urls).toStrictEqual({ "a.wasm": "blob:x" });
    for (const i of inits) expect(i).toStrictEqual({ credentials: "same-origin", cache: "no-store" });
    expect(blobs[0]?.type).toBe("application/wasm");
    expect([...new Uint8Array(await (blobs[0] as Blob).arrayBuffer())]).toStrictEqual([9, 8, 7]);
    expect(puestos.map(([u, x]) => [u, x.headers.get("content-type")])).toStrictEqual([
      [`${REC}a.wasm`, "application/wasm"],
      [`${REC}manifest.json`, "application/json"],
    ]);
  });

  it("SDK-06 recurso ya en caché y válido: no se vuelve a guardar; sin Cache Storage funciona igual", async () => {
    const datos = new Uint8Array([1, 2]);
    const { createHash } = await import("node:crypto");
    const m = JSON.stringify({ version: "0.1.0", recursos: [{ archivo: "b.js", bytes: 2, sha256: createHash("sha256").update(datos).digest("hex"), tipo: "text/javascript" }] });
    const puestos: string[] = [];
    const almacen: AlmacenMinimo = {
      open: async () => ({ match: async (u) => (u.endsWith("b.js") ? new Response(datos.slice()) : undefined), put: async (u) => void puestos.push(u) }),
      keys: async () => [],
      delete: async () => true,
    };
    const pedidas: string[] = [];
    const fetch = async (u: string): Promise<Response> => (pedidas.push(u), new Response(m));
    await cargarMotor(REC, { fetch, caches: almacen, crearUrl: () => "blob:y" });
    expect(puestos).toStrictEqual([`${REC}manifest.json`]);
    expect(pedidas).toStrictEqual([`${REC}manifest.json`]);
    const sinCache = await cargarMotor(REC, { fetch: async (u) => new Response(u.endsWith("b.js") ? datos.slice() : m), crearUrl: () => "blob:z" });
    expect(sinCache.urls).toStrictEqual({ "b.js": "blob:z" });
  });

  it("SDK-39 una red que rechaza el recurso da descarga-fallida", async () => {
    const m = JSON.stringify({ version: "0.1.0", recursos: [{ archivo: "c.js", bytes: 1, sha256: "a".repeat(64), tipo: "text/javascript" }] });
    const fetch = async (u: string): Promise<Response> => {
      if (u.endsWith("manifest.json")) return new Response(m);
      throw new TypeError("red");
    };
    await expect(cargarMotor(REC, { fetch, crearUrl: () => "" })).rejects.toMatchObject({ motivo: "descarga-fallida" });
  });
});
