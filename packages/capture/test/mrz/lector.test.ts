// LMI-02, LMI-04 y LMI-05 (spec lectura-mrz-imagen) con el worker de OCR INYECTADO. R se renderiza en el Chromium de
// Playwright con datos sintéticos de @lector-cedula/fixtures; nada se escribe a disco.
import { PERSONA_BASE, generarMrzTd1 } from "@lector-cedula/fixtures";
import { parsearMrzCedulaDigital } from "@lector-cedula/parsers";
import fc from "fast-check";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { crearLectorMrz, fechaReferenciaValida, planIntentosMrz, recortarYAmpliar, type WorkerOcr } from "../../src/mrz/lector.js";

const REF = { fechaReferencia: "2026-10-06" };
const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
let R: Uint8Array;
/** Intentos de R (LMI-12b): pasada 1 de la imagen derecha y plan completo de las cuatro vistas. */
let intentosR: { derecha: number; total: number; primero90: number; primero270: number };
/** Presupuesto por defecto de llamadas al OCR (LMI-13). */
const MAX_LLAMADAS = 40;

beforeAll(async () => {
  const render = await crearRenderizador();
  R = (await render.render(P.lineas)).bytes;
  const png = PNG.sync.read(Buffer.from(R));
  const p = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
  const plan = planIntentosMrz(p);
  // Pasada 1 de la vista derecha: los intentos de giro 0 antes del primero de otra vista.
  const derecha = plan.findIndex((i) => i.giro !== 0);
  intentosR = { derecha, total: plan.length, primero90: plan.findIndex((i) => i.giro === 90), primero270: plan.findIndex((i) => i.giro === 270) };
  await render.cerrar();
}, 60_000);

interface Registro {
  creaciones: unknown[][];
  parametros: unknown[];
  imagenes: Uint8Array[];
  terminate: number;
}

/** `crearWorker` inyectado: devuelve los textos de `textos` en orden (el último se repite) y registra todo. */
function falso(textos: readonly string[] | ((i: number) => string)) {
  const reg: Registro = { creaciones: [], parametros: [], imagenes: [], terminate: 0 };
  const crearWorker = async (...args: unknown[]): Promise<WorkerOcr> => {
    reg.creaciones.push(args);
    return {
      setParameters: async (p) => reg.parametros.push(p),
      recognize: async (imagen) => {
        reg.imagenes.push(imagen);
        const i = reg.imagenes.length - 1;
        const text = typeof textos === "function" ? textos(i) : (textos[Math.min(i, textos.length - 1)] ?? "");
        return { data: { text } };
      },
      terminate: async () => {
        reg.terminate++;
      },
    };
  };
  return { reg, crearWorker };
}

describe("LMI-02 Configuración del OCR sin red ni caché", { timeout: 60_000 }, () => {
  it("LMI-02 Opciones del worker", async () => {
    const { reg, crearWorker } = falso([P.texto]);
    const lector = crearLectorMrz({ rutaModelo: "/modelos", crearWorker });
    await lector.leer(R, REF);
    await lector.leer(R, REF);
    expect(reg.creaciones).toHaveLength(1);
    const [idioma, oem, opciones] = reg.creaciones[0] ?? [];
    expect(idioma).toBe("mrz");
    expect(oem).toBe(1);
    expect(opciones).toMatchObject({ langPath: "/modelos", gzip: false, cacheMethod: "none" });
    expect(opciones).not.toHaveProperty("logger");
    expect(reg.parametros).toStrictEqual([{ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<", tessedit_pageseg_mode: "6" }]);
  });

  it("LMI-02 Terminar", async () => {
    const { reg, crearWorker } = falso([P.texto]);
    const lector = crearLectorMrz({ rutaModelo: "/modelos", crearWorker });
    expect((await lector.leer(R, REF)).ok).toBe(true);
    await lector.terminar();
    await lector.terminar();
    expect(reg.terminate).toBe(1);
    expect(await lector.leer(R, REF)).toStrictEqual({ ok: false, error: "lector-terminado" });
  });

  it("LMI-02 Terminar sin haber leído no crea worker", async () => {
    const { reg, crearWorker } = falso([P.texto]);
    const lector = crearLectorMrz({ rutaModelo: "/modelos", crearWorker });
    await lector.terminar();
    expect(await lector.leer(R, REF)).toStrictEqual({ ok: false, error: "lector-terminado" });
    expect(reg.creaciones).toHaveLength(0);
  });

  it("LMI-02 Terminar mientras se crea el worker: lector-terminado y el worker se cierra", async () => {
    const { reg, crearWorker } = falso([P.texto]);
    let soltar: () => void = () => undefined;
    const puerta = new Promise<void>((r) => {
      soltar = r;
    });
    const lector = crearLectorMrz({
      rutaModelo: "/modelos",
      crearWorker: async (...a) => {
        await puerta;
        return crearWorker(...a);
      },
    });
    const lectura = lector.leer(R, REF);
    await new Promise((r) => setTimeout(r, 50));
    const fin = lector.terminar();
    soltar();
    await fin;
    expect(await lectura).toStrictEqual({ ok: false, error: "lector-terminado" });
    expect(reg.terminate).toBe(1);
    expect(reg.imagenes).toHaveLength(0);
  });

  it("LMI-02 Si crear el worker falla: modelo-no-disponible, y se reintenta en la siguiente lectura", async () => {
    let intentos = 0;
    const { reg, crearWorker } = falso([P.texto]);
    const lector = crearLectorMrz({
      rutaModelo: "/modelos",
      crearWorker: async (...a) => {
        if (intentos++ === 0) throw new Error("sin modelo");
        return crearWorker(...a);
      },
    });
    expect(await lector.leer(R, REF)).toStrictEqual({ ok: false, error: "modelo-no-disponible" });
    expect((await lector.leer(R, REF)).ok).toBe(true);
    expect(reg.creaciones).toHaveLength(1);
  });

  it("LMI-02 Si setParameters falla se termina el worker", async () => {
    let terminados = 0;
    const lector = crearLectorMrz({
      rutaModelo: "/modelos",
      crearWorker: async () => ({
        setParameters: async () => {
          throw new Error("x");
        },
        recognize: async () => ({ data: { text: "" } }),
        terminate: async () => {
          terminados++;
        },
      }),
    });
    expect(await lector.leer(R, REF)).toStrictEqual({ ok: false, error: "modelo-no-disponible" });
    expect(terminados).toBe(1);
  });
});

describe("LMI-04 Lectura encadenada e intentos", { timeout: 60_000 }, () => {
  it("LMI-04 Primer intento correcto", async () => {
    const { reg, crearWorker } = falso([P.texto]);
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(R, REF);
    expect(reg.imagenes).toHaveLength(1);
    expect(r).toStrictEqual({ ok: true, intento: "proyeccion", digitosValidos: 4, resultado: parsearMrzCedulaDigital([...P.lineas], REF) });
  });

  it("LMI-04 Respaldo de recorte inferior", async () => {
    const { reg, crearWorker } = falso(["ILEGIBLE", P.texto]);
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(R, REF);
    expect(reg.imagenes).toHaveLength(2);
    const segunda = PNG.sync.read(Buffer.from(reg.imagenes[1] ?? new Uint8Array()));
    expect(segunda.width).toBeGreaterThanOrEqual(900);
    expect(r).toMatchObject({ ok: true, intento: "recorte-inferior", digitosValidos: 4 });
  });

  it("LMI-04 Mejor intento parcial", async () => {
    const alterado = generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" });
    const { reg, crearWorker } = falso([alterado.texto]);
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(R, REF);
    // Sin 4 dígitos válidos se prueban todos los candidatos, también los de las vistas giradas (LMI-12).
    expect(intentosR.derecha).toBeGreaterThan(3);
    expect(intentosR.total).toBeGreaterThan(intentosR.derecha);
    expect(reg.imagenes).toHaveLength(Math.min(MAX_LLAMADAS, intentosR.total));
    expect(r).toMatchObject({ ok: true, intento: "proyeccion", digitosValidos: 3 });
  });

  it("LMI-04 Gana el segundo si tiene más dígitos válidos", async () => {
    const alterado = generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" });
    const { crearWorker } = falso([alterado.texto, P.texto]);
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(R, REF);
    expect(r).toMatchObject({ ok: true, intento: "recorte-inferior", digitosValidos: 4 });
  });

  it("LMI-04 Nada legible", async () => {
    const { reg, crearWorker } = falso([""]);
    expect(await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(R, REF)).toStrictEqual({ ok: false, error: "mrz-no-encontrada" });
    expect(reg.imagenes).toHaveLength(Math.min(MAX_LLAMADAS, intentosR.total));
  });

  it("LMI-12 Las vistas giradas solo se prueban si la derecha no da 4 dígitos válidos, con sufijo de giro", async () => {
    // El texto correcto llega en el primer intento de otra vista: la opuesta (180°, LMI-14c), que comparte el eje.
    const { reg, crearWorker } = falso((i) => (i === intentosR.derecha ? P.texto : ""));
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(R, REF);
    expect(r).toMatchObject({ ok: true, intento: "recorte-inferior@180", digitosValidos: 4 });
    expect(reg.imagenes).toHaveLength(intentosR.derecha + 1);
    const { crearWorker: c90 } = falso((i) => (i === intentosR.primero90 ? P.texto : ""));
    const q = await crearLectorMrz({ rutaModelo: "/m", crearWorker: c90 }).leer(R, REF);
    expect(q.ok && q.intento.endsWith("@90")).toBe(true);
    const { crearWorker: c270 } = falso((i) => (i === intentosR.primero270 ? P.texto : ""));
    const s = await crearLectorMrz({ rutaModelo: "/m", crearWorker: c270 }).leer(R, REF);
    expect(s).toMatchObject({ ok: true, digitosValidos: 4 });
    expect(s.ok && s.intento.endsWith("@270")).toBe(true);
  });

  it("LMI-04 Un error del OCR cuenta como texto vacío y se sigue con el siguiente candidato", async () => {
    let n = 0;
    const lector = crearLectorMrz({
      rutaModelo: "/m",
      crearWorker: async () => ({
        setParameters: async () => undefined,
        recognize: async () => {
          if (n++ === 0) throw new Error("fallo");
          return { data: { text: P.texto } };
        },
        terminate: async () => undefined,
      }),
    });
    expect(await lector.leer(R, REF)).toMatchObject({ ok: true, intento: "recorte-inferior" });
  });

  it("LMI-04 Líneas que el parser rechaza no cuentan", async () => {
    const { crearWorker } = falso(["A".repeat(30) + "\n" + "B".repeat(30) + "\n" + "C".repeat(30)]);
    expect(await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(R, REF)).toStrictEqual({ ok: false, error: "mrz-no-encontrada" });
  });

  it("LMI-04 Ampliación bilineal: gradientes monótonos y simétricos en ambos ejes", () => {
    // 2x2 con R creciente en x (0 -> 200) y G creciente en y (0 -> 100).
    const p = { width: 2, height: 2, data: new Uint8ClampedArray([0, 0, 0, 255, 200, 0, 0, 255, 0, 100, 0, 255, 200, 100, 0, 255]) };
    const r = recortarYAmpliar(p, { x: 0, y: 0, ancho: 2, alto: 2 });
    const px = (x: number, y: number, k: number) => r.data[(y * r.width + x) * 4 + k] as number;
    const fila = Array.from({ length: r.width }, (_, x) => px(x, 0, 0));
    const columna = Array.from({ length: r.height }, (_, y) => px(0, y, 1));
    expect(fila.every((v, i) => i === 0 || v >= (fila[i - 1] as number))).toBe(true);
    expect(columna.every((v, i) => i === 0 || v >= (columna[i - 1] as number))).toBe(true);
    expect([fila[0], fila.at(-1), columna[0], columna.at(-1)]).toStrictEqual([0, 200, 0, 100]);
    for (let i = 0; i < r.width; i++) expect(Math.abs((fila[i] as number) + (fila[r.width - 1 - i] as number) - 200)).toBeLessThanOrEqual(1);
    for (let i = 0; i < r.height; i++) expect(Math.abs((columna[i] as number) + (columna[r.height - 1 - i] as number) - 100)).toBeLessThanOrEqual(1);
    // En el centro: la media de los 4 vecinos en cada canal; alfa constante.
    expect(Math.abs(px(450, 450, 0) - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(px(450, 450, 1) - 50)).toBeLessThanOrEqual(1);
    expect(px(450, 450, 3)).toBe(255);
    expect(px(899, 899, 2)).toBe(0);
  });

  it("LMI-04 La imagen del OCR es el recorte ampliado a 900 px", () => {
    const p = { width: 4, height: 2, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255]) };
    const r = recortarYAmpliar(p, { x: 1, y: 0, ancho: 2, alto: 2 });
    expect([r.width, r.height]).toStrictEqual([900, 900]);
    expect(Array.from(r.data.slice(0, 4))).toStrictEqual([255, 255, 255, 255]);
    expect(Array.from(r.data.slice(r.data.length - 4))).toStrictEqual([9, 9, 9, 255]);
    const ancho = { width: 1000, height: 1, data: new Uint8ClampedArray(4000).fill(7) };
    const s = recortarYAmpliar(ancho, { x: 0, y: 0, ancho: 1000, alto: 1 });
    expect([s.width, s.height]).toStrictEqual([1000, 1]);
    expect(s.data).toStrictEqual(ancho.data);
  });
});

describe("LMI-05 Entradas aceptadas y errores (OCR inyectado)", { timeout: 120_000 }, () => {
  it("LMI-05 Errores sin OCR: entrada, fecha e imagen", async () => {
    const { reg, crearWorker } = falso([P.texto]);
    const lector = crearLectorMrz({ rutaModelo: "/m", crearWorker });
    expect(await lector.leer(null, REF)).toStrictEqual({ ok: false, error: "entrada-invalida" });
    expect(await lector.leer("R", REF)).toStrictEqual({ ok: false, error: "entrada-invalida" });
    expect(await lector.leer(R, { fechaReferencia: "06/10/2026" })).toStrictEqual({ ok: false, error: "fecha-referencia-invalida" });
    expect(await lector.leer(R)).toStrictEqual({ ok: false, error: "fecha-referencia-invalida" });
    expect(await lector.leer(new Uint8Array([1, 2, 3]), REF)).toStrictEqual({ ok: false, error: "imagen-ilegible" });
    expect(reg.creaciones).toHaveLength(0);
  });

  it("LMI-05 Acepta píxeles RGBA (forma de ImageData)", async () => {
    const png = PNG.sync.read(Buffer.from(R));
    const { crearWorker } = falso([P.texto]);
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }, REF);
    expect(r).toMatchObject({ ok: true, intento: "proyeccion", digitosValidos: 4 });
  });

  it("LMI-05 Decodificador que lanza o devuelve basura: imagen-ilegible", async () => {
    const { crearWorker } = falso([P.texto]);
    const lanza = crearLectorMrz({ rutaModelo: "/m", crearWorker, decodificarPixeles: async () => Promise.reject(new Error("x")) });
    expect(await lanza.leer(R, REF)).toStrictEqual({ ok: false, error: "imagen-ilegible" });
    const basura = crearLectorMrz({ rutaModelo: "/m", crearWorker, decodificarPixeles: async () => ({ width: 2, height: 2, data: new Uint8ClampedArray(3) }) });
    expect(await basura.leer(R, REF)).toStrictEqual({ ok: false, error: "imagen-ilegible" });
  });

  it("LMI-05 Fecha de referencia: formato, existencia y siglo", () => {
    expect(fechaReferenciaValida(REF)).toBe("2026-10-06");
    expect(fechaReferenciaValida({ fechaReferencia: "2024-02-29" })).toBe("2024-02-29");
    expect(fechaReferenciaValida({ fechaReferencia: "2026-02-29" })).toBeNull();
    expect(fechaReferenciaValida({ fechaReferencia: "1999-10-06" })).toBeNull();
    expect(fechaReferenciaValida({ fechaReferencia: "2100-01-01" })).toBeNull();
    expect(fechaReferenciaValida({ fechaReferencia: "2099-12-31" })).toBe("2099-12-31");
    expect(fechaReferenciaValida({ fechaReferencia: "2000-01-01" })).toBe("2000-01-01");
    expect(fechaReferenciaValida({ fechaReferencia: "2026-1-06" })).toBeNull();
    expect(fechaReferenciaValida({ fechaReferencia: "2026-10-06T00:00:00Z" })).toBeNull();
    expect(fechaReferenciaValida({ fechaReferencia: "2026-13-01" })).toBeNull();
    expect(fechaReferenciaValida({ fechaReferencia: " 2026-10-06" })).toBeNull();
    expect(fechaReferenciaValida({ fechaReferencia: "2026-10-06 " })).toBeNull();
    expect(fechaReferenciaValida({ fechaReferencia: 20261006 })).toBeNull();
    expect(fechaReferenciaValida(null)).toBeNull();
    expect(fechaReferenciaValida("2026-10-06")).toBeNull();
  });

  it("LMI-05 Nunca lanza", async () => {
    let i = 0;
    const textos = fc.sample(fc.string(), { seed: 1, numRuns: 600 });
    const { crearWorker } = falso(() => textos[i++ % textos.length] ?? "");
    const lector = crearLectorMrz({ rutaModelo: "/m", crearWorker });
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (x) => {
        const r = await lector.leer(x, REF);
        expect(typeof r.ok).toBe("boolean");
      }),
      { numRuns: 300 },
    );
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 4096 }), fc.anything(), async (x, op) => {
        const r = await lector.leer(x, fc.sample(fc.boolean(), 1)[0] === true ? REF : op);
        expect(typeof r.ok).toBe("boolean");
      }),
      { numRuns: 300 },
    );
  });
});

describe("LMI-12b Orden de intentos en dos pasadas", { timeout: 60_000 }, () => {
  const clave = (i: { giro: number; candidato: { caja: { x: number; y: number; ancho: number; alto: number } } }): string =>
    `${i.giro}:${i.candidato.caja.x},${i.candidato.caja.y},${i.candidato.caja.ancho},${i.candidato.caja.alto}`;

  it("LMI-12b Plan de un lienzo blanco", () => {
    const blanco = { width: 1000, height: 1000, data: new Uint8ClampedArray(4_000_000).fill(255) };
    const plan = planIntentosMrz(blanco);
    expect(plan.slice(0, 4).map((i) => [i.giro, i.candidato.metodo])).toStrictEqual([
      [0, "recorte-inferior"],
      [0, "imagen-completa"],
      [90, "recorte-inferior"],
      [90, "imagen-completa"],
    ]);
    expect(plan.slice(4, 8).map((i) => i.giro)).toStrictEqual([270, 270, 180, 180]);
    expect(new Set(plan.map(clave)).size).toBe(plan.length);
    // Pasada 2: las ventanas literales de las cuatro vistas, después de toda la pasada 1.
    expect(plan.slice(8).every((i) => i.candidato.metodo === "franja")).toBe(true);
    expect(plan.slice(8, 10).map((i) => [i.giro, i.candidato.caja])).toStrictEqual([
      [0, { x: 0, y: 850, ancho: 1000, alto: 150 }],
      [0, { x: 0, y: 800, ancho: 1000, alto: 150 }],
    ]);
    // Cada vista aporta sus ventanas una sola vez: 3 alturas (19 + 15 + 12 ventanas) x 4 vistas.
    expect(plan).toHaveLength(8 + 4 * (18 + 15 + 12));
  });

  it("LMI-12b Las franjas ajustadas van en la pasada 1 y sin cajas repetidas", () => {
    const png = PNG.sync.read(Buffer.from(R));
    const plan = planIntentosMrz({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) });
    expect(new Set(plan.map(clave)).size).toBe(plan.length);
    const primeraLiteral = plan.findIndex((i) => i.candidato.metodo === "franja" && i.candidato.caja.x === 0 && i.giro === 0 && i.candidato.caja.ancho === png.width);
    const ajustadas = plan.filter((i) => i.giro === 0 && i.candidato.metodo === "franja" && i.candidato.caja.ancho < png.width);
    expect(ajustadas.length).toBeGreaterThan(0);
    expect(plan.indexOf(ajustadas[ajustadas.length - 1] as (typeof plan)[number])).toBeLessThan(primeraLiteral);
    expect(plan.findIndex((i) => i.giro === 270)).toBeLessThan(primeraLiteral);
  });

  it("LMI-12b Entrada sin forma de píxeles: plan vacío", () => {
    expect(planIntentosMrz(null)).toStrictEqual([]);
  });
});

describe("LMI-13 Presupuesto de intentos y de tiempo", { timeout: 60_000 }, () => {
  it("LMI-13 Corte por número de llamadas", async () => {
    const { reg, crearWorker } = falso([""]);
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker, maxLlamadasOcr: 5 }).leer(R, REF);
    expect(r).toStrictEqual({ ok: false, error: "mrz-no-encontrada" });
    expect(reg.imagenes).toHaveLength(5);
  });

  it("LMI-13 Corte por tiempo con mejor intento parcial", async () => {
    const alterado = generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" });
    let reloj = 1_000;
    let llamadas = 0;
    const lector = crearLectorMrz({
      rutaModelo: "/m",
      tiempoLimiteMs: 60_000,
      ahora: () => reloj,
      crearWorker: async () => ({
        setParameters: async () => undefined,
        recognize: async () => {
          reloj += 30_000;
          return { data: { text: llamadas++ === 0 ? alterado.texto : "" } };
        },
        terminate: async () => undefined,
      }),
    });
    const r = await lector.leer(R, REF);
    expect(llamadas).toBe(2);
    expect(r).toMatchObject({ ok: true, intento: "proyeccion", digitosValidos: 3 });
  });

  it("LMI-13 Presupuesto por defecto", async () => {
    const { reg, crearWorker } = falso([""]);
    await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(R, REF);
    expect(intentosR.total).toBeGreaterThan(MAX_LLAMADAS);
    expect(reg.imagenes).toHaveLength(MAX_LLAMADAS);
  });

  // Lienzo blanco pequeño: plan de más de 40 intentos con recortes baratos (con R, 4 x 40 recortes tardaban 18 s).
  const pequeno = { width: 200, height: 200, data: new Uint8ClampedArray(200 * 200 * 4).fill(255) };
  it.each([0, -3, 2.5, Number.NaN])("LMI-13 Opciones no enteras positivas toman el valor por defecto (%s)", async (malo) => {
    expect(planIntentosMrz(pequeno).length).toBeGreaterThan(MAX_LLAMADAS);
    const { reg, crearWorker } = falso([""]);
    await crearLectorMrz({ rutaModelo: "/m", crearWorker, maxLlamadasOcr: malo, tiempoLimiteMs: malo }).leer(pequeno, REF);
    expect(reg.imagenes).toHaveLength(MAX_LLAMADAS);
  });

  it("LMI-13 El tiempo se mide desde el inicio de cada lectura", async () => {
    let reloj = 0;
    const { reg, crearWorker } = falso([""]);
    const lector = crearLectorMrz({ rutaModelo: "/m", crearWorker, maxLlamadasOcr: 3, ahora: () => (reloj += 1_000) });
    await lector.leer(R, REF);
    await lector.leer(R, REF);
    expect(reg.imagenes).toHaveLength(6);
  });
});
