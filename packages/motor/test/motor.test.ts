// MOT-01, MOT-04 a MOT-09 con el motor real (pool de worker_threads, zxing-wasm, tesseract.js, fraude). Requiere
// `tsc -b` (el worker es dist/trabajador.js), como npm run check.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODIGOS_ERROR_MOTOR, crearMotor, SHA256_MRZ, type Motor } from "../src/index.js";
import { rutaModeloPorDefecto } from "../src/recursos.js";
import { amarilla, digital, digitalAlterada, NUIP, sinDocumento } from "./ayudas/imagenes.js";

let A: Uint8Array;
let D: Uint8Array;
const abiertos: Motor[] = [];
async function motor(...args: Parameters<typeof crearMotor>): Promise<Motor> {
  const m = await crearMotor(...args);
  abiertos.push(m);
  return m;
}

beforeAll(async () => {
  A = await amarilla();
  D = await digital();
}, 120_000);
afterAll(async () => {
  await Promise.all(abiertos.map((m) => m.cerrar()));
});

async function codigo(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resuelve";
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? "sin-codigo";
  }
}

const FECHA = { fechaReferencia: "2026-10-09" };

type Bufer = Uint8Array | Uint8ClampedArray;
const CLAVE_REGISTRO = Symbol.for("@lector-cedula/motor.registroBuferes");

/**
 * Registro de `__registroBuferes` con dos avisos (sin esperas por tiempo): `pixelesRegistrados` cuando la lectura
 * registra su búfer de píxeles (la imagen ya se decodificó) y `pixelesACero` cuando ese búfer recibe `fill(0)` (la
 * lectura terminó su limpieza).
 */
function instalarRegistro(): { registro: Bufer[]; pixelesRegistrados: Promise<void>; pixelesACero: Promise<void>; quitar: () => void } {
  const registro: Bufer[] = [];
  let alRegistrar = (): void => {};
  let alPonerACero = (): void => {};
  const pixelesRegistrados = new Promise<void>((r) => (alRegistrar = r));
  const pixelesACero = new Promise<void>((r) => (alPonerACero = r));
  const push = registro.push.bind(registro);
  registro.push = (...bs: Bufer[]): number => {
    for (const b of bs) {
      if (!(b instanceof Uint8ClampedArray)) continue;
      const fill = b.fill.bind(b);
      Object.defineProperty(b, "fill", {
        value: (...a: Parameters<Uint8ClampedArray["fill"]>) => {
          const r = fill(...a);
          if (a[0] === 0) alPonerACero();
          return r;
        },
      });
      alRegistrar();
    }
    return push(...bs);
  };
  (globalThis as Record<symbol, unknown>)[CLAVE_REGISTRO] = registro;
  return { registro, pixelesRegistrados, pixelesACero, quitar: () => Reflect.deleteProperty(globalThis, CLAVE_REGISTRO) };
}

/**
 * Reloj inyectado para el tiempo máximo del hilo principal: `llamar` corre con `setTimeout` interceptado (el motor arma
 * su temporizador de forma síncrona dentro de `leerDocumento`) y `agotar()` dispara ese temporizador cuando la prueba
 * decide. Así el orden entre "la lectura decodificó" y "se agotó el tiempo" no depende de la carga de la máquina.
 */
function conRelojInyectado<T>(llamar: () => T): { valor: T; demoras: number[]; agotar: () => void } {
  const original = globalThis.setTimeout;
  const capturados: (() => void)[] = [];
  const demoras: number[] = [];
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    capturados.push(fn);
    demoras.push(ms ?? 0);
    // Un temporizador real que nunca dispara, para que el clearTimeout del motor reciba un identificador válido.
    return original(() => {}, 2_147_483_647).unref();
  }) as unknown as typeof setTimeout;
  let valor: T;
  try {
    valor = llamar();
  } finally {
    globalThis.setTimeout = original;
  }
  return { valor, demoras, agotar: () => capturados.forEach((fn) => fn()) };
}

describe("motor real", { timeout: 180_000 }, () => {
  it("MOT-01 Cédula amarilla", async () => {
    const m = await motor({ hilos: 1 });
    const r = await m.leerDocumento(A, FECHA);
    expect(r).toMatchObject({ ok: true, tipoDocumento: "cedula-ciudadania", fuente: "pdf417", campos: { nuip: NUIP }, confiable: false });
    expect(r.riesgo).not.toBeNull();
  });

  it("MOT-01 Cédula digital", async () => {
    const m = await motor({ hilos: 1 });
    const r = await m.leerDocumento(D, FECHA);
    expect(r).toMatchObject({ ok: true, tipoDocumento: "cedula-ciudadania", fuente: "mrz-td1", campos: { nuip: NUIP }, confiable: false });
    expect((r as { resultado: { valido: boolean } }).resultado.valido).toBe(true);
  });

  it("MOT-01 Imagen ilegible (cabecera PNG válida, contenido roto) y sin documento son códigos distintos", async () => {
    const m = await motor({ hilos: 1 });
    const rota = new Uint8Array(A.slice(0, 200));
    expect(await m.leerDocumento(rota, FECHA)).toStrictEqual({ ok: false, error: { codigo: "imagen-ilegible" }, confiable: false, riesgo: null });
    expect(await m.leerDocumento(sinDocumento(), FECHA)).toStrictEqual({ ok: false, error: { codigo: "sin-lectura", tipo: "mrz" }, confiable: false, riesgo: null });
  });

  it("MOT-01 MRZ con dígito de control inválido: mrz-no-valida con digitosValidos", async () => {
    const m = await motor({ hilos: 1 });
    // Agota el presupuesto de OCR (12 llamadas): más tiempo que el valor por omisión.
    expect(await m.leerDocumento(await digitalAlterada(), { ...FECHA, tiempoMaximoMs: 120_000 })).toStrictEqual({
      ok: false,
      error: { codigo: "mrz-no-valida", tipo: "mrz", digitosValidos: 3 },
      confiable: false,
      riesgo: null,
    });
  });

  it("MOT-01 Formato no soportado", async () => {
    const m = await motor({ hilos: 1 });
    expect(await codigo(m.leerDocumento(new Uint8Array([0x25, 0x50, 0x44, 0x46])))).toBe("formato-no-soportado");
  });

  it("MOT-01 Entrada arbitraria: RESULTADO o ErrorMotor de código conocido", async () => {
    const m = await motor({ hilos: 2 });
    const prefijo = fc.constantFrom([], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 9, 0, 0, 0, 9], [0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 9, 0, 9]);
    let utiles = 0;
    await fc.assert(
      fc.asyncProperty(prefijo, fc.uint8Array({ maxLength: 4096 }), async (p, resto) => {
        const b = new Uint8Array([...p, ...resto].slice(0, 4096));
        try {
          const r = await m.leerDocumento(b, FECHA);
          utiles++;
          expect(r.confiable).toBe(false);
        } catch (e) {
          expect(CODIGOS_ERROR_MOTOR).toContain((e as { codigo?: string }).codigo);
        }
      }),
      { numRuns: 1000 },
    );
    expect(utiles).toBeGreaterThan(0);
  });

  it("MOT-04 Concurrencia acotada", async () => {
    const m = await motor({ hilos: 2 });
    const r = await Promise.all(Array.from({ length: 8 }, () => m.leerDocumento(A, { ...FECHA, fraude: false })));
    for (const x of r) expect(x).toMatchObject({ campos: { nuip: NUIP } });
    expect(m.estadisticas().maximoEnCurso).toBe(2);
  });

  it("MOT-04 Cola llena", async () => {
    const m = await motor({ hilos: 1, colaMaxima: 2 });
    const c = await Promise.all(Array.from({ length: 4 }, () => codigo(m.leerDocumento(A, { ...FECHA, fraude: false }))));
    expect(c).toStrictEqual(["resuelve", "resuelve", "resuelve", "motor-ocupado"]);
  });

  it("MOT-04 Cierre", async () => {
    const m = await crearMotor({ hilos: 1, colaMaxima: 4 });
    const p = Array.from({ length: 3 }, () => codigo(m.leerDocumento(D, FECHA)));
    await m.cerrar();
    expect(await Promise.all(p)).toStrictEqual(["motor-cerrado", "motor-cerrado", "motor-cerrado"]);
    expect(await codigo(m.leerDocumento(A))).toBe("motor-cerrado");
  });

  it("MOT-05 Demasiados bytes, sin tareas", async () => {
    const m = await motor({ hilos: 1 });
    expect(await codigo(m.leerDocumento(new Uint8Array(10_485_761)))).toBe("imagen-demasiado-grande");
    expect(m.estadisticas().tareas).toBe(0);
  });

  it("MOT-05 Bomba de descompresión", async () => {
    const m = await motor({ hilos: 1 });
    const bomba = new Uint8Array(40_000);
    bomba.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x4e, 0x20, 0, 0, 0x4e, 0x20, 8, 6]);
    const antes = process.memoryUsage().rss;
    expect(await codigo(m.leerDocumento(bomba))).toBe("imagen-demasiado-grande");
    expect(process.memoryUsage().rss - antes).toBeLessThan(64 * 1024 * 1024);
    expect(m.estadisticas().tareas).toBe(0);
  });

  it("MOT-05 Tiempo agotado, reemplazo y la siguiente resuelve", async () => {
    const m = await motor({ hilos: 1 });
    expect(await codigo(m.leerDocumento(D, { ...FECHA, tiempoMaximoMs: 1 }))).toBe("tiempo-agotado");
    expect(await m.leerDocumento(A, FECHA)).toMatchObject({ campos: { nuip: NUIP } });
  });

  it("MOT-05 Tope de OCR: imagen sin documento da sin-lectura", async () => {
    const m = await motor({ hilos: 1, llamadasOcrMaximas: 2 });
    expect(await m.leerDocumento(sinDocumento(), FECHA)).toMatchObject({ ok: false, error: { codigo: "sin-lectura" }, riesgo: null });
  });

  it("MOT-06 Traineddata alterado: recurso-corrupto antes de cualquier OCR", async () => {
    const dir = mkdtempSync(join(tmpdir(), "motor-modelo-"));
    try {
      const modelo = readFileSync(join(rutaModeloPorDefecto(), "mrz.traineddata"));
      modelo[100] = (modelo[100] ?? 0) ^ 0xff;
      writeFileSync(join(dir, "mrz.traineddata"), modelo);
      expect(await codigo(crearMotor({ hilos: 1, rutaModelo: dir }))).toBe("recurso-corrupto");
      expect(await codigo(crearMotor({ hilos: 1, rutaModelo: join(dir, "no-existe") }))).toBe("recurso-corrupto");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(SHA256_MRZ).toBe((JSON.parse(readFileSync(new URL("../../../models/manifest.json", import.meta.url), "utf8")) as { sha256: string }[])[0]?.sha256);
  });

  it("MOT-07 Entrada del llamador", async () => {
    const m = await motor({ hilos: 1 });
    const b = new Uint8Array(A);
    const copia = new Uint8Array(b);
    await m.leerDocumento(b, { ...FECHA, fraude: false });
    expect(b).toStrictEqual(copia);
    const c = new Uint8Array(A);
    await m.leerDocumento(c, { ...FECHA, fraude: false, borrarEntrada: true });
    expect(c.every((x) => x === 0)).toBe(true);
  });

  it("MOT-07 Copias a cero: tras una lectura y tras una que rechaza con tiempo-agotado (__registroBuferes)", async () => {
    const m = await motor({ hilos: 0 });
    const lectura = instalarRegistro();
    try {
      await m.leerDocumento(A, FECHA);
      expect(lectura.registro.length).toBeGreaterThanOrEqual(2);
      for (const b of lectura.registro) expect(b.every((x) => x === 0)).toBe(true);
    } finally {
      lectura.quitar();
    }
    // Tiempo agotado después de decodificar: el tiempo se agota solo cuando la lectura ya registró sus píxeles. Con un
    // temporizador real de 1 ms ese orden dependía de la carga (antes de leer la copia, decodificarPixeles espera un
    // import dinámico) y, si el tiempo se agotaba antes, nunca aparecían píxeles y la espera de 2 búferes no acababa.
    const agotado = instalarRegistro();
    try {
      const { valor, demoras, agotar } = conRelojInyectado(() => codigo(m.leerDocumento(D, { ...FECHA, tiempoMaximoMs: 1 })));
      expect(demoras).toStrictEqual([1]);
      await agotado.pixelesRegistrados;
      agotar();
      expect(await valor).toBe("tiempo-agotado");
      // La copia interna queda a cero en cuanto se rechaza.
      const copias = agotado.registro.filter((b) => b instanceof Uint8Array);
      expect(copias).toHaveLength(1);
      expect(copias[0]?.every((x) => x === 0)).toBe(true);
      // La lectura abandonada sigue en segundo plano en el hilo principal y pone a cero sus píxeles al acabar.
      await agotado.pixelesACero;
      expect(agotado.registro.length).toBeGreaterThanOrEqual(2);
      for (const b of agotado.registro) expect(b.every((x) => x === 0)).toBe(true);
    } finally {
      agotado.quitar();
    }
  });

  it("MOT-07 Copias a cero: el tiempo se agota antes de decodificar y la copia queda a cero al rechazar", async () => {
    const m = await motor({ hilos: 0 });
    // Primera lectura fuera del registro: crea el lector MRZ del hilo principal antes de interceptar setTimeout.
    await m.leerDocumento(A, { ...FECHA, fraude: false });
    const agotado = instalarRegistro();
    try {
      const { valor, demoras, agotar } = conRelojInyectado(() => codigo(m.leerDocumento(D, { ...FECHA, tiempoMaximoMs: 1 })));
      expect(demoras).toStrictEqual([1]);
      agotar();
      expect(await valor).toBe("tiempo-agotado");
      // Es el orden que dejaba colgada la versión anterior de la prueba: al rechazar aún no hay píxeles (la decodificación
      // espera un import dinámico antes de leer la copia) y la copia ya está a cero.
      expect(agotado.registro).toHaveLength(1);
      expect(agotado.registro[0]?.every((x) => x === 0)).toBe(true);
    } finally {
      agotado.quitar();
    }
  });

  it("MOT-08 el registro solo recibe evento, duración y código", async () => {
    const eventos: unknown[] = [];
    const m = await motor({ hilos: 1, registro: (e) => eventos.push(e) });
    await m.leerDocumento(A, FECHA);
    await codigo(m.leerDocumento(new Uint8Array([1, 2, 3])));
    for (const e of eventos) expect(Object.keys(e as object).every((k) => ["evento", "duracionMs", "codigo"].includes(k))).toBe(true);
    const texto = JSON.stringify(eventos);
    for (const prohibido of ["9999123456", "PRUEBA", "FICTICIA", "<<"]) expect(texto).not.toContain(prohibido);
  });

  it("MOT-09 Con y sin fraude", async () => {
    const m = await motor({ hilos: 1 });
    const con = await m.leerDocumento(A, FECHA);
    const sin = await m.leerDocumento(A, { ...FECHA, fraude: false });
    expect(con.riesgo).toMatchObject({ version: 1 });
    expect(sin.riesgo).toBeNull();
    expect({ ...sin, riesgo: con.riesgo }).toStrictEqual(con);
  });

  it("MOT-01 modo hilo principal (hilos: 0) da el mismo resultado que el pool", async () => {
    const principal = await motor({ hilos: 0 });
    const pool = await motor({ hilos: 1 });
    expect(await principal.leerDocumento(A, { ...FECHA, fraude: false })).toStrictEqual(await pool.leerDocumento(A, { ...FECHA, fraude: false }));
  });

  it("opciones inválidas", async () => {
    expect(await codigo(crearMotor({ hilos: -1 }))).toBe("opciones-invalidas");
    expect(await codigo(crearMotor({ tiempoMaximoMs: 0 }))).toBe("opciones-invalidas");
  });
});
