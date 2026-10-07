// Spec lectura-pdf417-imagen: LPI-01, LPI-02, LPI-03 (Node), LPI-05 y LPI-07 (consola del decodificador).
// Solo imágenes sintéticas generadas en memoria (sintetica.ts).
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import fc from "fast-check";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { crearDecodificador, decodificarPdf417Imagen, type DecodificadorPdf417, type Pixeles } from "../../src/index.js";
import { codificarJpeg, imagenSintetica, lectorReal, pixelesSinteticos, pngBlanco } from "./sintetica.js";

// WASM y píxeles de 1920x1080: holgura amplia para la instrumentación de Stryker y agentes en paralelo.
const LIMITE_MS = 300_000;
const F = generarPdf417(PERSONA_BASE, { semilla: 1 });
let S: Uint8Array;
let leer: Awaited<ReturnType<typeof lectorReal>>;

beforeAll(async () => {
  leer = await lectorReal();
  S = await imagenSintetica(F.bytes);
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Imagen sintética S (tarea 1.1)", { timeout: LIMITE_MS }, () => {
  it("el writer acepta bytes binarios y S decodifica con readBarcodes directo", async () => {
    const r = await leer(S, { formats: ["PDF417"] });
    expect(r).toHaveLength(1);
    expect(r[0]?.bytes).toStrictEqual(F.bytes);
  });
});

describe("LPI-01 Bytes crudos, no texto", { timeout: LIMITE_MS }, () => {
  it("LPI-01 Round-trip de la imagen sintética S", async () => {
    expect(await decodificarPdf417Imagen(S)).toStrictEqual({ ok: true, bytes: F.bytes, intento: "original" });
  });

  it("LPI-01 Byte Ñ preservado", async () => {
    const G = generarPdf417({ ...PERSONA_BASE, primerApellido: "MUÑOZ" }, { semilla: 1 });
    const r = await decodificarPdf417Imagen(await imagenSintetica(G.bytes));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bytes).toStrictEqual(G.bytes);
    expect(r.bytes[G.rangos.primerApellido[0] + 2]).toBe(0xd1);
  });

  it("LPI-01 Propiedad: round-trip generador -> imagen -> bytes (semillas y 4 variantes)", async () => {
    const variantes = new Set<string>();
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.constantFrom("completa", "windows-truncada", "sin-pubdsk", "fecha-primero" as const),
        async (semilla, variante) => {
          variantes.add(variante);
          const G = generarPdf417(PERSONA_BASE, { semilla, variante });
          // Píxeles directos (forma de ImageData): el PNG ya se cubre en los escenarios; aquí importa el volumen.
          const r = await decodificarPdf417Imagen(await pixelesSinteticos(G.bytes));
          expect(r).toStrictEqual({ ok: true, bytes: G.bytes, intento: "original" });
        },
      ),
      { numRuns: 50, seed: 20261006 },
    );
    expect(variantes.size).toBe(4);
  }, 300_000);
});

describe("LPI-02 Opciones del lector y reintentos", { timeout: LIMITE_MS }, () => {
  it("LPI-02 Opciones enviadas", async () => {
    const llamadas: unknown[][] = [];
    const registrador: DecodificadorPdf417 = async (img, opciones) => {
      llamadas.push([img, opciones]);
      return leer(img, opciones);
    };
    const r = await crearDecodificador({ readBarcodes: registrador })(S);
    expect(r.ok).toBe(true);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.[1]).toMatchObject({ formats: ["PDF417"], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 1 });
  });

  it("LPI-02 Orden de reintentos", async () => {
    const dims: string[] = [];
    let n = 0;
    const lector: DecodificadorPdf417 = async (img, opciones) => {
      dims.push(`${img.width}x${img.height}`);
      n += 1;
      return n < 3 ? [] : leer(S, opciones);
    };
    const r = await crearDecodificador({ readBarcodes: lector })(S);
    expect(dims).toStrictEqual(["1920x1080", "1440x810", "960x540"]);
    expect(r).toStrictEqual({ ok: true, bytes: F.bytes, intento: "escala-0.5" });
  });

  it("LPI-02 Giros tras las escalas", async () => {
    const recibidas: Pixeles[] = [];
    const lector: DecodificadorPdf417 = async (img, opciones) => {
      recibidas.push(img);
      return recibidas.length < 4 ? [] : leer(S, opciones);
    };
    const original = await pixelesSinteticos(F.bytes);
    const r = await crearDecodificador({ readBarcodes: lector })(original);
    expect(recibidas).toHaveLength(4);
    expect([recibidas[3]?.width, recibidas[3]?.height]).toStrictEqual([1920, 1080]);
    expect(recibidas[3]?.data).not.toStrictEqual(original.data);
    expect(r).toStrictEqual({ ok: true, bytes: F.bytes, intento: "giro+2" });
  });

  it("LPI-02 Sin símbolo en ningún intento (LPI-11 Modo sin localización)", async () => {
    const recibidas: Pixeles[] = [];
    const lector: DecodificadorPdf417 = async (img) => {
      recibidas.push(img);
      return [];
    };
    const r = await crearDecodificador({ readBarcodes: lector, localizar: false })(S);
    expect(recibidas.map((x) => `${x.width}x${x.height}`)).toStrictEqual(["1920x1080", "1440x810", "960x540", "1920x1080", "1920x1080"]);
    expect(recibidas[3]?.data).not.toStrictEqual(recibidas[4]?.data);
    expect(r).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
  });

  it("LPI-02 el giro es horario con ángulo positivo, sobre el centro y con fondo blanco", async () => {
    // 41x41 blanco con un pixel negro en (40,20) (borde derecho, fila central). Girado +2° en sentido horario
    // (eje y hacia abajo) el pixel baja: queda en la fila 21 o más; girado -2° sube a la 19 o menos.
    const n = 41;
    const datos = new Uint8ClampedArray(n * n * 4).fill(255);
    datos.set([0, 0, 0, 255], (20 * n + 40) * 4);
    const recibidas: Pixeles[] = [];
    await crearDecodificador({ readBarcodes: async (img) => (recibidas.push(img), []) })({ data: datos, width: n, height: n });
    const filaMasOscura = (p: Pixeles): number => {
      let mejor = -1;
      let min = 256;
      for (let y = 0; y < p.height; y++) {
        for (let x = 30; x < p.width; x++) {
          const v = p.data[(y * p.width + x) * 4] as number;
          if (v < min) [min, mejor] = [v, y];
        }
      }
      return mejor;
    };
    const [mas, menos] = [recibidas[3] as Pixeles, recibidas[4] as Pixeles];
    expect(filaMasOscura(mas)).toBeGreaterThanOrEqual(21);
    expect(filaMasOscura(menos)).toBeLessThanOrEqual(19);
    for (const p of [mas, menos]) {
      expect(p.data.slice(0, 4)).toStrictEqual(new Uint8ClampedArray([255, 255, 255, 255])); // esquina: fondo blanco
      const centro = (20 * n + 20) * 4;
      expect(p.data[centro]).toBe(255);
    }
  });

  it("LPI-02 se detiene en el primer símbolo válido e ignora los no válidos", async () => {
    const intentos: string[] = [];
    let n = 0;
    const lector: DecodificadorPdf417 = async (img, opciones) => {
      intentos.push(`${img.width}`);
      n += 1;
      const reales = await leer(S, opciones);
      return n === 1 ? reales.map((x) => ({ ...x, isValid: false })) : reales;
    };
    expect(await crearDecodificador({ readBarcodes: lector })(S)).toStrictEqual({ ok: true, bytes: F.bytes, intento: "escala-0.75" });
    expect(intentos).toStrictEqual(["1920", "1440"]);
  });

  it("LPI-02 reescala con redondeo de los lados y conserva el contenido", async () => {
    const recibidas: { width: number; height: number; data: ArrayLike<number> }[] = [];
    const lector: DecodificadorPdf417 = async (img) => {
      recibidas.push(img);
      return [];
    };
    // 5x3 con un pixel negro en (4,2): 0,75 -> 4x2 (Math.round(3,75)=4, Math.round(2,25)=2); 0,5 -> 3x2.
    const datos = new Uint8ClampedArray(5 * 3 * 4).fill(255);
    datos.set([0, 0, 0, 255], (2 * 5 + 4) * 4);
    const r = await crearDecodificador({ readBarcodes: lector })({ data: datos, width: 5, height: 3 });
    expect(r).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
    expect(recibidas.slice(0, 3).map((x) => `${x.width}x${x.height}`)).toStrictEqual(["5x3", "4x2", "3x2"]);
    expect(recibidas[0]?.data).toStrictEqual(datos);
    for (const img of recibidas.slice(1, 3)) {
      expect(img.data.length).toBe(img.width * img.height * 4);
      const ultimo = (img.width * img.height - 1) * 4;
      expect(img.data[ultimo]).toBeLessThan(255); // la esquina inferior derecha conserva el pixel oscuro
      expect(img.data[0]).toBe(255); // la superior izquierda sigue blanca
      expect(img.data[3]).toBe(255);
    }
  });
});

describe("LPI-03 Entradas aceptadas y errores", { timeout: LIMITE_MS }, () => {
  it("LPI-03 Errores literales", async () => {
    const r = [];
    for (const x of [null, "hola", new Uint8Array([1, 2, 3]), pngBlanco(800, 600)]) r.push(await decodificarPdf417Imagen(x));
    expect(r).toStrictEqual([
      { ok: false, error: "entrada-invalida" },
      { ok: false, error: "entrada-invalida" },
      { ok: false, error: "imagen-ilegible" },
      { ok: false, error: "pdf417-no-encontrado" },
    ]);
  });

  it("LPI-03 acepta JPEG y objetos con forma de ImageData", async () => {
    const p = await pixelesSinteticos(F.bytes);
    expect(await decodificarPdf417Imagen(codificarJpeg(p, 90))).toStrictEqual({ ok: true, bytes: F.bytes, intento: "original" });
    expect(await decodificarPdf417Imagen(p)).toStrictEqual({ ok: true, bytes: F.bytes, intento: "original" });
  });

  it("LPI-03 cabeceras PNG o JPEG corruptas dan imagen-ilegible y formas de ImageData incoherentes entrada-invalida", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
    expect(await decodificarPdf417Imagen(png)).toStrictEqual({ ok: false, error: "imagen-ilegible" });
    expect(await decodificarPdf417Imagen(jpg)).toStrictEqual({ ok: false, error: "imagen-ilegible" });
    expect(await decodificarPdf417Imagen(new Uint8Array(0))).toStrictEqual({ ok: false, error: "imagen-ilegible" });
    for (const x of [
      { data: new Uint8ClampedArray(16), width: 2, height: 3 },
      { data: new Uint8ClampedArray(0), width: 0, height: 0 },
      { data: [0, 0, 0, 0], width: 1, height: 1 },
      { data: new Uint8ClampedArray(4), width: 1.5, height: 1 },
      { data: new Uint8ClampedArray(4), width: "1", height: 1 },
      [1, 2, 3],
      42,
      undefined,
    ]) {
      expect(await decodificarPdf417Imagen(x)).toStrictEqual({ ok: false, error: "entrada-invalida" });
    }
  });

  it("LPI-03 un lector que lanza o devuelve basura no hace lanzar al decodificador", async () => {
    const lanza: DecodificadorPdf417 = () => Promise.reject(new Error("x"));
    expect(await crearDecodificador({ readBarcodes: lanza })(S)).toStrictEqual({ ok: false, error: "imagen-ilegible" });
    const basura = (async () => [{ isValid: true, bytes: "no" }]) as unknown as DecodificadorPdf417;
    expect(await crearDecodificador({ readBarcodes: basura })({ data: new Uint8ClampedArray(64).fill(255), width: 4, height: 4 })).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
  });

  it("LPI-03 Nunca lanza", async () => {
    let utiles = 0;
    for (const arb of [fc.anything(), fc.uint8Array({ maxLength: 4096 })] as fc.Arbitrary<unknown>[]) {
      await fc.assert(
        fc.asyncProperty(arb, async (x) => {
          const r = await decodificarPdf417Imagen(x);
          expect(typeof r.ok).toBe("boolean");
          utiles += 1;
        }),
        { numRuns: 200 },
      );
    }
    expect(utiles).toBe(400);
  });
});

describe("LPI-05 Encadenado con el parser", { timeout: LIMITE_MS }, () => {
  it("LPI-05 Campos esperados desde imagen", async () => {
    const r = await decodificarPdf417Imagen(S);
    if (!r.ok) throw new Error(r.error);
    const p = parsearPdf417Amarilla(r.bytes, { divipol: buscarDivipol });
    if (!p.ok) throw new Error(p.error);
    const e = F.esperado;
    expect(p.campos).toMatchObject({
      numeroDocumento: e.nuip,
      primerApellido: e.primerApellido,
      segundoApellido: e.segundoApellido,
      primerNombre: e.primerNombre,
      segundoNombre: e.segundoNombre,
      sexo: e.sexo,
      fechaNacimiento: e.fechaNacimiento,
      rh: e.rh,
    });
  });
});

describe("LPI-07 Privacidad del decodificador", { timeout: LIMITE_MS }, () => {
  it("LPI-07 Sin consola en el decodificador", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    await decodificarPdf417Imagen(S);
    await decodificarPdf417Imagen(pngBlanco(800, 600));
    await decodificarPdf417Imagen(new Uint8Array([1, 2, 3]));
    for (const e of espias) expect(e).not.toHaveBeenCalled();
  });
});
