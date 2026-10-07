// CAL-09 (Worker: transferencia, diferencial y mensajes mal formados) y CAL-14 (detectores sustitutos) en Chromium
// real. Frames sintéticos generados en memoria (principio III).
import { afterEach, describe, expect, it } from "vitest";
import { analizarFrame } from "../src/calidad/score.js";
import type { Cuadrilatero, DeteccionDocumento, ResultadoCalidad } from "../src/calidad/tipos.js";
import { UMBRALES_POR_DEFECTO } from "../src/calidad/umbrales.js";
import { crearDetectorGuia } from "../src/flujo/guia.js";
import { crearClienteCalidad, type ClienteCalidad } from "../src/navegador/cliente-calidad.js";
import type { MensajeDelWorker } from "../src/navegador/protocolo.js";
import { iniciarWorkerCalidad, type AlcanceWorker } from "../src/navegador/worker-calidad.js";
import { bloque, completo, desenfocar, disco, gris, rayas, rect, ruido, tablero, brillo, type Escena } from "../test/escenas.js";

const modelo = (cuadrilatero: Cuadrilatero | null, confianza: number | null = 0.9): DeteccionDocumento => ({ cuadrilatero, confianza, fuente: "modelo" });
const guia = (cuadrilatero: Cuadrilatero): DeteccionDocumento => ({ cuadrilatero, confianza: null, fuente: "guia" });

const workers: Worker[] = [];
function nuevoWorker(nombre: "guia" | "sustituto"): Worker {
  const w =
    nombre === "guia"
      ? new Worker(new URL("./workers/guia.worker.ts", import.meta.url), { type: "module" })
      : new Worker(new URL("./workers/sustituto.worker.ts", import.meta.url), { type: "module" });
  workers.push(w);
  return w;
}
afterEach(() => {
  for (const w of workers.splice(0)) w.terminate();
});

function siguiente(w: Worker): Promise<MensajeDelWorker> {
  return new Promise((resolve) => w.addEventListener("message", (e: MessageEvent<MensajeDelWorker>) => resolve(e.data), { once: true }));
}

async function fijar(w: Worker, ...detecciones: DeteccionDocumento[]): Promise<void> {
  const r = siguiente(w);
  w.postMessage({ tipo: "fijar-deteccion", detecciones });
  await r;
}

/** Copia de los píxeles para enviarla (la escena original se conserva para el cálculo directo). */
const copia = (e: Escena) => new Uint8ClampedArray(e.pixeles);

function directo(e: Escena, d: DeteccionDocumento, anchoOriginal = e.ancho, altoOriginal = e.alto): ResultadoCalidad {
  const r = analizarFrame({ ...e, anchoOriginal, altoOriginal }, d, UMBRALES_POR_DEFECTO);
  if (!r.ok) throw new Error(r.codigo);
  return r.resultado;
}

async function enWorker(cliente: ClienteCalidad, e: Escena, anchoOriginal = e.ancho, altoOriginal = e.alto): Promise<ResultadoCalidad> {
  const r = await cliente.analizar({ ancho: e.ancho, alto: e.alto, anchoOriginal, altoOriginal, pixeles: copia(e) });
  if (!r.ok) throw new Error(r.codigo);
  return r.resultado;
}

/** Frames y detecciones de los escenarios de CAL-03, CAL-04, CAL-05 y CAL-07. */
function framesDeEscenarios(): [string, Escena, DeteccionDocumento][] {
  const c = (e: Escena) => modelo(completo(e.ancho, e.alto));
  const lista: [string, Escena, DeteccionDocumento][] = [];
  const agregar = (n: string, e: Escena, d: DeteccionDocumento = c(e)) => lista.push([n, e, d]);
  // CAL-03
  agregar("gris 128", gris(64, 64, 128));
  agregar("tablero 0/255", tablero(64, 64, 0, 255));
  agregar("rayas 0/255", rayas(64, 64, 0, 255));
  agregar("tablero 60/190", tablero(64, 64, 60, 190));
  for (const s of [1, 2, 3]) for (const v of [1, 2, 3]) agregar(`ruido ${s} desenfoque ${v}`, desenfocar(ruido(128, 128, s), v));
  // CAL-04
  const g100 = gris(100, 100, 128);
  agregar("reflejo nulo", g100);
  agregar("reflejo 10", bloque(g100, 255, 40, 49, 40, 49));
  agregar("reflejo 20", bloque(g100, 255, 40, 59, 40, 59));
  agregar("esquinas", bloque(bloque(g100, 255, 20, 29, 20, 29), 255, 30, 39, 30, 39));
  agregar("249", bloque(g100, 249, 40, 59, 40, 59));
  agregar("250", bloque(g100, 250, 40, 59, 40, 59));
  agregar("fuera", bloque(g100, 255, 70, 89, 40, 59), modelo(rect(0, 0, 50, 100)));
  for (const r of [2, 4, 8, 16]) agregar(`disco ${r}`, disco(gris(128, 128, 128), 255, r));
  // CAL-05
  for (const v of [128, 10, 40, 220, 245]) agregar(`gris ${v}`, gris(64, 64, v));
  for (const s of [1, 2]) agregar(`brillo ${s}`, brillo(ruido(64, 64, s), 1.2));
  // CAL-07
  agregar("completo guia", gris(64, 64, 128), guia(completo(64, 64)));
  agregar("lejano", tablero(64, 64, 60, 190), modelo(rect(0, 0, 16, 16)));
  agregar("suficiente", tablero(64, 64, 60, 190), modelo(rect(0, 0, 32, 32)));
  for (const v of [2, 3]) agregar(`desenfoque fuerte ${v}`, desenfocar(tablero(128, 128, 60, 190), v));
  return lista;
}

describe("CAL-09 Procesamiento en Worker", { timeout: 60_000 }, () => {
  it("CAL-09 Transferencia sin copia", async () => {
    const cliente = crearClienteCalidad(nuevoWorker("guia"));
    const e = ruido(640, 360, 7);
    const pixeles = copia(e);
    const promesa = cliente.analizar({ ancho: 640, alto: 360, anchoOriginal: 1920, altoOriginal: 1080, pixeles });
    expect(pixeles.buffer.byteLength).toBe(0);
    const r = await promesa;
    if (!r.ok) throw new Error(r.codigo);
    expect(r.pixeles.buffer.byteLength).toBe(921600);
    expect(r.pixeles).toStrictEqual(e.pixeles);
  });

  it("CAL-09 Resultado idéntico al cálculo directo", async () => {
    const w = nuevoWorker("sustituto");
    const cliente = crearClienteCalidad(w);
    for (const [nombre, e, d] of framesDeEscenarios()) {
      await fijar(w, d);
      expect({ nombre, r: await enWorker(cliente, e) }).toStrictEqual({ nombre, r: directo(e, d) });
    }
    const conGuia = crearClienteCalidad(nuevoWorker("guia"));
    for (let s = 1; s <= 10; s++) {
      const e = ruido(640, 360, s);
      const d = await crearDetectorGuia().detectar({ ...e, anchoOriginal: 1920, altoOriginal: 1080 });
      expect(await enWorker(conGuia, e, 1920, 1080)).toStrictEqual(directo(e, d, 1920, 1080));
    }
  });

  it("CAL-09 Mensajes mal formados", async () => {
    const w = nuevoWorker("sustituto");
    await fijar(w, modelo([[0, 0], [64, 64], [64, 0], [0, 64]]), modelo(completo(64, 64)));
    const respuestas: MensajeDelWorker[] = [];
    const tres = new Promise<void>((resolve) =>
      w.addEventListener("message", (e: MessageEvent<MensajeDelWorker>) => {
        respuestas.push(e.data);
        if (respuestas.length === 3) resolve();
      }),
    );
    const b7 = new ArrayBuffer(100);
    w.postMessage({ tipo: "analizar", id: 7, ancho: 640, alto: 360 , pixeles: b7 }, [b7]);
    const b8 = copia(gris(64, 64, 128)).buffer;
    w.postMessage({ tipo: "analizar", id: 8, ancho: 64, alto: 64, anchoOriginal: 64, altoOriginal: 64, pixeles: b8 }, [b8]);
    const b9 = copia(tablero(64, 64, 60, 190)).buffer;
    w.postMessage({ tipo: "analizar", id: 9, ancho: 64, alto: 64, anchoOriginal: 64, altoOriginal: 64, pixeles: b9 }, [b9]);
    await tres;
    const [r7, r8, r9] = respuestas;
    expect(r7).toStrictEqual({ tipo: "error", id: 7, codigo: "frame-invalido" });
    expect(r8).toStrictEqual({ tipo: "error", id: 8, codigo: "cuadrilatero-invalido" });
    expect(r9?.tipo).toBe("resultado");
    expect(r9?.id).toBe(9);
  });

  it("CAL-09 Configuración de umbrales en el Worker", async () => {
    const w = nuevoWorker("sustituto");
    const cliente = crearClienteCalidad(w);
    await fijar(w, modelo(rect(0, 0, 32, 32)));
    expect(await cliente.configurar({ umbralListo: 101, framesConsecutivos: 0, laplacianoNitido: 30, extra: 1 })).toStrictEqual({
      ok: false,
      codigo: "umbrales-invalidos",
      campos: ["extra", "framesConsecutivos", "laplacianoNitido", "umbralListo"],
    });
    expect((await enWorker(cliente, tablero(64, 64, 60, 190))).motivo).toBeNull();
    expect(await cliente.configurar({ umbralListo: 80 })).toStrictEqual({ ok: true });
    const r = await enWorker(cliente, tablero(64, 64, 60, 190));
    expect([r.score, r.motivo]).toStrictEqual([75, "acerca"]);
  });
});

describe("CAL-09 Worker en el mismo hilo (alcance simulado)", () => {
  function alcanceSimulado() {
    const enviados: MensajeDelWorker[] = [];
    const alcance: AlcanceWorker = { onmessage: null, postMessage: (m) => void enviados.push(m) };
    const enviar = async (datos: unknown) => {
      alcance.onmessage?.(new MessageEvent("message", { data: datos }));
      await new Promise((r) => setTimeout(r, 0));
      return enviados.at(-1);
    };
    return { alcance, enviar };
  }

  it("CAL-09 Transferencia sin copia: el Worker devuelve el mismo buffer en la lista de transferencia", async () => {
    const transferidos: Transferable[][] = [];
    const enviados: MensajeDelWorker[] = [];
    const alcance: AlcanceWorker = { onmessage: null, postMessage: (m, t) => void (enviados.push(m), transferidos.push(t)) };
    iniciarWorkerCalidad(alcance, crearDetectorGuia());
    const buffer = copia(ruido(640, 360, 1)).buffer;
    alcance.onmessage?.(new MessageEvent("message", { data: { tipo: "analizar", id: 1, ancho: 640, alto: 360, anchoOriginal: 1920, altoOriginal: 1080, pixeles: buffer } }));
    await new Promise((r) => setTimeout(r, 0));
    const r = enviados[0];
    expect(r?.tipo === "resultado" && r.pixeles).toBe(buffer);
    expect(transferidos[0]).toStrictEqual([buffer]);
    expect(transferidos[0]?.[0]).toBe(buffer);
  });

  it("CAL-09 Mensajes sin id, de tipo desconocido o que hacen fallar al detector", async () => {
    const { alcance, enviar } = alcanceSimulado();
    let lanzar = false;
    iniciarWorkerCalidad(alcance, {
      id: "prueba",
      detectar: () => {
        if (lanzar) throw new Error("fallo");
        return modelo(completo(2, 2));
      },
    });
    expect(await enviar(null)).toStrictEqual({ tipo: "error", id: -1, codigo: "mensaje-invalido" });
    expect(await enviar({ tipo: "analizar", id: 1.5 })).toStrictEqual({ tipo: "error", id: -1, codigo: "mensaje-invalido" });
    expect(await enviar({ tipo: "otro", id: 3 })).toStrictEqual({ tipo: "error", id: 3, codigo: "mensaje-invalido" });
    const valido = (id: number, extra: Record<string, unknown> = {}) => ({ tipo: "analizar", id, ancho: 2, alto: 2, anchoOriginal: 2, altoOriginal: 2, pixeles: new ArrayBuffer(16), ...extra });
    expect(await enviar(valido(4, { pixeles: new Uint8Array(16) }))).toStrictEqual({ tipo: "error", id: 4, codigo: "frame-invalido" });
    expect(await enviar(valido(5, { ancho: 0 }))).toStrictEqual({ tipo: "error", id: 5, codigo: "frame-invalido" });
    expect(await enviar(valido(6, { alto: 2.5 }))).toStrictEqual({ tipo: "error", id: 6, codigo: "frame-invalido" });
    expect(await enviar(valido(7, { anchoOriginal: -1 }))).toStrictEqual({ tipo: "error", id: 7, codigo: "frame-invalido" });
    expect(await enviar(valido(8, { altoOriginal: "2" }))).toStrictEqual({ tipo: "error", id: 8, codigo: "frame-invalido" });
    expect((await enviar(valido(9)))?.tipo).toBe("resultado");
    lanzar = true;
    expect(await enviar(valido(10))).toStrictEqual({ tipo: "error", id: 10, codigo: "mensaje-invalido" });
    lanzar = false;
    expect((await enviar(valido(11)))?.tipo).toBe("resultado");
    expect(await enviar({ tipo: "configurar", id: 12, umbrales: { umbralListo: 80 } })).toStrictEqual({ tipo: "configurado", id: 12, resultado: { ok: true } });
  });
});

describe("CAL-09 Cliente del Worker", { timeout: 60_000 }, () => {
  it("CAL-09 Terminar o un error del Worker resuelve las peticiones pendientes sin colgarse", async () => {
    const cliente = crearClienteCalidad(nuevoWorker("guia"));
    const e = ruido(640, 360, 3);
    const pendiente = cliente.analizar({ ancho: 640, alto: 360, anchoOriginal: 1920, altoOriginal: 1080, pixeles: copia(e) });
    const config = cliente.configurar({ umbralListo: 80 });
    cliente.terminar();
    expect(await pendiente).toStrictEqual({ ok: false, codigo: "mensaje-invalido" });
    expect(await config).toStrictEqual({ ok: false, codigo: "umbrales-invalidos", campos: [] });

    const oyentes: Record<string, (e: MessageEvent<MensajeDelWorker>) => void> = {};
    const falso = {
      postMessage: () => undefined,
      addEventListener: (tipo: string, f: (e: MessageEvent<MensajeDelWorker>) => void) => void (oyentes[tipo] = f),
      terminate: () => undefined,
    };
    const otro = crearClienteCalidad(falso);
    const colgada = otro.analizar({ ancho: 1, alto: 1, anchoOriginal: 1, altoOriginal: 1, pixeles: new Uint8ClampedArray(4) });
    oyentes["message"]?.(new MessageEvent("message", { data: { tipo: "configurado", id: 99, resultado: { ok: true } } }));
    oyentes["error"]?.(new MessageEvent("message", { data: null }));
    expect(await colgada).toStrictEqual({ ok: false, codigo: "mensaje-invalido" });
  });
});

describe("CAL-14 Interfaz de detector de documento (Worker)", { timeout: 60_000 }, () => {
  const escena = () => bloque(gris(100, 100, 128), 255, 70, 89, 40, 59);

  it("CAL-14 Detector sustituto delimita las métricas", async () => {
    const w = nuevoWorker("sustituto");
    const cliente = crearClienteCalidad(w);
    await fijar(w, modelo(rect(0, 0, 50, 100)));
    const parcial = await enWorker(cliente, escena());
    expect(parcial.metricas?.reflejo.subscore).toBe(100);
    expect(parcial.metricas?.tamano).toStrictEqual({ ratio: 0.5, subscore: 100 });
    await fijar(w, modelo(completo(100, 100)));
    expect((await enWorker(cliente, escena())).metricas?.reflejo.subscore).toBe(0);
  });

  it("CAL-14 Documento no encontrado", async () => {
    const w = nuevoWorker("sustituto");
    const cliente = crearClienteCalidad(w);
    await fijar(w, modelo(null, 0.1));
    expect(await enWorker(cliente, escena())).toStrictEqual({ score: 0, motivo: "acerca", metricas: null });
  });
});
