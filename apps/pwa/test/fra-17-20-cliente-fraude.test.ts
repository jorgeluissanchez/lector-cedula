// FRA-03, FRA-17, FRA-20 (cambio deteccion-fraude): cliente del Worker de fraude, datos y textos de la pantalla.
// Puerto falso en memoria; datos sintéticos (NUIP con prefijo 9999).
import { describe, expect, it, vi } from "vitest";
import { crearClienteFraude, datosParaFraude, framesParaFraude, MOTIVOS_RIESGO, TIEMPO_MAXIMO_FRAUDE_MS, type PuertoFraude } from "../src/fraude";

function puerto() {
  const enviados: { mensaje: Record<string, unknown>; transferir: Transferable[] }[] = [];
  const oyentes: Record<string, ((e: unknown) => void)[]> = { message: [], error: [] };
  let terminado = 0;
  const p: PuertoFraude = {
    postMessage: (mensaje: unknown, transferir: Transferable[] = []) => void enviados.push({ mensaje: mensaje as Record<string, unknown>, transferir }),
    addEventListener: (tipo: "message" | "error", f: (e: never) => void) => void oyentes[tipo]?.push(f as (e: unknown) => void),
    terminate: () => void terminado++,
  };
  const emitir = (tipo: "message" | "error", e: unknown) => oyentes[tipo]?.forEach((f) => f(e));
  return { p, enviados, emitir, terminados: () => terminado };
}

const SENAL = { version: 1, puntaje: 90, nivel: "alto", motivos: [{ codigo: "pantalla", puntaje: 0.9, detalle: "moire" }], accion: "revisar", senalesOmitidas: [], fase: "heuristica", warnings: [] };
const CUAD = [[0, 0], [10, 0], [10, 5], [0, 5]] as const;

describe("FRA-17 cliente del Worker de fraude", () => {
  it("FRA-03 envía copias transferidas de los frames y resuelve con la señal de su id", async () => {
    const { p, enviados, emitir } = puerto();
    const c = crearClienteFraude(() => p);
    const frame = { ancho: 2, alto: 1, pixeles: new Uint8ClampedArray(8).fill(5) };
    const promesa = c.evaluar({ frames: [frame], cuadrilatero: CUAD, tipo: "amarilla", datos: {}, ahora: "2026-10-08T12:00:00.000Z" });
    const m = enviados[0]?.mensaje ?? {};
    expect(m).toMatchObject({ tipo: "evaluar", id: 1, tipoDocumento: "amarilla", ahora: "2026-10-08T12:00:00.000Z" });
    const fs = m.frames as { pixeles: ArrayBuffer }[];
    expect(enviados[0]?.transferir).toStrictEqual([fs[0]?.pixeles]);
    expect([...new Uint8Array(fs[0]?.pixeles as ArrayBuffer)]).toStrictEqual(Array(8).fill(5));
    expect(m.cuadrilatero).toStrictEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }]);
    emitir("message", { data: { tipo: "senal", id: 1, senal: SENAL } });
    expect(await promesa).toStrictEqual(SENAL);
  });

  it("FRA-20 Worker que no responde: null tras el tiempo máximo y termina el Worker", async () => {
    vi.useFakeTimers();
    try {
      const { p, terminados } = puerto();
      const c = crearClienteFraude(() => p);
      const promesa = c.evaluar({ frames: [], cuadrilatero: CUAD, tipo: "digital", datos: {}, ahora: "2026-10-08T12:00:00.000Z" });
      vi.advanceTimersByTime(TIEMPO_MAXIMO_FRAUDE_MS - 1);
      let hecho = false;
      void promesa.then(() => (hecho = true));
      await Promise.resolve();
      expect(hecho).toBe(false);
      vi.advanceTimersByTime(1);
      expect(await promesa).toBeNull();
      expect(TIEMPO_MAXIMO_FRAUDE_MS).toBe(3000);
      expect(terminados()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("FRA-20 error del Worker o respuesta mal formada: null; el Worker se recrea en la siguiente", async () => {
    const { p, emitir } = puerto();
    const fabrica = vi.fn(() => p);
    const c = crearClienteFraude(fabrica);
    const e = { frames: [], cuadrilatero: CUAD, tipo: "digital" as const, datos: {}, ahora: "x" };
    const a = c.evaluar(e);
    emitir("error", {});
    expect(await a).toBeNull();
    const b = c.evaluar(e);
    emitir("message", { data: { tipo: "senal", id: 2, senal: { nivel: "alto" } } });
    expect(await b).toBeNull();
    expect(fabrica).toHaveBeenCalledTimes(2);
  });
});

describe("FRA-17 datos y frames para la señal", () => {
  it("amarilla: NUIP y nacimiento del PDF417; digital: líneas MRZ; otros documentos: null", () => {
    expect(datosParaFraude({ tipo: "pdf417", resultado: { campos: { numeroDocumento: "9999123456", fechaNacimiento: "1985-03-14" } } })).toStrictEqual({
      tipo: "amarilla",
      datos: { pdf417: { nuip: "9999123456", fechaNacimiento: "1985-03-14" } },
    });
    const lineas = ["I<COL", "8503", "PRUEBA"];
    expect(datosParaFraude({ tipo: "mrz", resultado: { lineasCorregidas: lineas } })).toStrictEqual({ tipo: "digital", datos: { mrz: { lineas } } });
    expect(datosParaFraude({ tipo: "mrz", tipoDocumento: "pasaporte", resultado: {} })).toBeNull();
    expect(datosParaFraude({ tipo: "pdf417", resultado: null })).toStrictEqual({ tipo: "amarilla", datos: {} });
  });

  it("solo frames de vídeo del tamaño de la captura, hasta 5", () => {
    const f = (ancho: number, origen: "video" | "foto") => ({ ancho, alto: 1, pixeles: new Uint8ClampedArray(ancho * 4), origen });
    const r = framesParaFraude([f(3, "foto"), f(2, "video"), f(2, "video"), f(4, "video"), f(2, "video"), f(2, "video"), f(2, "video"), f(2, "video")], 2, 1);
    expect(r).toHaveLength(5);
    expect(r.every((x) => x.ancho === 2)).toBe(true);
  });

  it("FRA-17 motivos en español", () => {
    expect(MOTIVOS_RIESGO.pantalla).toBe("Parece una foto de una pantalla");
    expect(MOTIVOS_RIESGO.fotocopia).toBe("Parece una fotocopia o una impresión");
    expect(Object.keys(MOTIVOS_RIESGO).sort()).toStrictEqual(["edicion", "fotocopia", "inconsistencia", "pantalla", "recorte"]);
  });
});

describe("FRA-17 estado de la pantalla resultado", () => {
  it("la señal (o null) viaja con el evento leida", async () => {
    const { reducir } = await import("../src/estado");
    const ok = { ok: true, tipo: "pdf417", intento: "original", resultado: { campos: {} } } as never;
    const leyendo = { pantalla: "leyendo", aviso: null } as const;
    expect(reducir(leyendo, { tipo: "leida", resultado: ok, riesgo: SENAL as never })).toStrictEqual({ pantalla: "resultado", aviso: null, lectura: ok, riesgo: SENAL });
    expect(reducir(leyendo, { tipo: "leida", resultado: ok, riesgo: null })).toMatchObject({ riesgo: null });
  });
});

describe("FRA-21 señal apagada por defecto", () => {
  it("solo con VITE_FRAUDE=true o ?debug=1", async () => {
    const { fraudeActivo } = await import("../src/fraude");
    expect(fraudeActivo(undefined, "")).toBe(false);
    expect(fraudeActivo("false", "?x=1")).toBe(false);
    expect(fraudeActivo("1", "")).toBe(false);
    expect(fraudeActivo("true", "")).toBe(true);
    expect(fraudeActivo(undefined, "?debug=1")).toBe(true);
    expect(fraudeActivo(undefined, "?debug=0")).toBe(false);
  });
});
