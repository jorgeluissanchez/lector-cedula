// FRA-01, FRA-03, FRA-05, FRA-16 (cambio deteccion-fraude, tarea 4.4): validación de la entrada de evaluarFraude,
// orden y filtro de motivos, warnings y manejador del Worker. Frames pequeños y uniformes (rápidos).
import { describe, expect, it } from "vitest";
import { evaluarFraude, evaluarYLiberar } from "../src/index.js";

const RELOJ = () => new Date("2026-10-08T12:00:00Z");
const CUAD = [
  { x: 2, y: 2 },
  { x: 61, y: 2 },
  { x: 61, y: 39 },
  { x: 2, y: 39 },
];

/** Frame uniforme; por defecto con el color azulado de la digital sintética (sin señales de imagen). */
function frame(w = 64, h = 48, gris?: number): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(gris === undefined ? [200, 220, 246, 255] : [gris, gris, gris, 255], i);
  return { data, width: w, height: h };
}

const base = (extra: Record<string, unknown> = {}) => ({ frames: [frame()], cuadrilatero: CUAD, tipo: "digital", datos: {}, reloj: RELOJ, ...extra });
const omitidas = (x: unknown) => evaluarFraude(x).senalesOmitidas;

describe("FRA-01 validación de la entrada", () => {
  it("una entrada válida mide la imagen (no omite imagen) y reporta H-FRA-3 en la digital", () => {
    const s = evaluarFraude(base());
    expect(s.senalesOmitidas).toStrictEqual(["banding", "texto-visible"]);
    expect(s.warnings).toStrictEqual(["H-FRA-3"]);
  });

  it("frames inválidos: tamaño, tipo de buffer, longitud, cantidad y tamaños distintos", () => {
    const casos = [
      [frame(31, 48)],
      [frame(64, 31)],
      [{ ...frame(), width: 64.5 }],
      [{ ...frame(), height: "48" }],
      [{ data: new Uint8Array(64 * 48 * 4), width: 64, height: 48 }],
      [{ data: new Uint8ClampedArray(10), width: 64, height: 48 }],
      [{ data: new Uint8ClampedArray(8193 * 32 * 4), width: 8193, height: 32 }],
      [null],
      [],
      [frame(), frame(), frame(), frame(), frame(), frame()],
      [frame(), frame(64, 50)],
    ];
    for (const fs of casos) expect(omitidas(base({ frames: fs })), JSON.stringify(fs.map((f) => (f === null ? null : [f.width, f.height])))).toContain("imagen");
    expect(omitidas(base({ frames: "x" }))).toContain("imagen");
    expect(omitidas(base({ frames: [frame(32, 8192)], cuadrilatero: [{ x: 0, y: 0 }, { x: 31, y: 0 }, { x: 31, y: 50 }, { x: 0, y: 50 }] }))).not.toContain("imagen");
    expect(omitidas(base({ frames: [frame(), frame(), frame(), frame(), frame()] }))).not.toContain("imagen");
  });

  it("cuadriláteros inválidos: forma, valores no finitos, fuera de rango y área mínima", () => {
    const p = (x: number, y: number) => ({ x, y });
    const casos: unknown[] = [
      CUAD.slice(0, 3),
      [...CUAD, p(0, 0)],
      [null, ...CUAD.slice(1)],
      [p(Number.NaN, 2), ...CUAD.slice(1)],
      [p(Number.POSITIVE_INFINITY, 2), ...CUAD.slice(1)],
      [{ x: "2", y: 2 }, ...CUAD.slice(1)],
      [{ x: 2 }, ...CUAD.slice(1)],
      [p(-65, 2), ...CUAD.slice(1)],
      [p(2, -49), ...CUAD.slice(1)],
      [p(129, 2), ...CUAD.slice(1)],
      [p(2, 97), ...CUAD.slice(1)],
      [p(0, 0), p(31, 0), p(31, 31), p(0, 31)],
      "x",
    ];
    for (const q of casos) expect(omitidas(base({ cuadrilatero: q })), JSON.stringify(q)).toContain("imagen");
    // Bordes admitidos: exactamente -ancho/2·ancho y área 32x32.
    expect(omitidas(base({ cuadrilatero: [p(-64, -48), p(128, -48), p(128, 96), p(-64, 96)] }))).not.toContain("imagen");
    expect(omitidas(base({ cuadrilatero: [p(0, 0), p(32, 0), p(32, 32), p(0, 32)] }))).not.toContain("imagen");
  });

  it("sin tipo: se omiten tipo, imagen y datos", () => {
    expect(omitidas(base({ tipo: undefined }))).toStrictEqual(["datos", "imagen", "tipo"]);
    expect(omitidas(null)).toStrictEqual(["datos", "imagen", "tipo"]);
    expect(omitidas(base({ tipo: "amarilla" }))).toStrictEqual(["banding", "holograma", "texto-visible"]);
  });

  it("reloj que no es función o no devuelve una fecha: no hay vencimiento", () => {
    const datos = { visible: { nuip: "9999123456", fechaVencimiento: "2001-01-01" } };
    expect(evaluarFraude(base({ datos })).motivos.map((m) => m.detalle)).toStrictEqual(["vencido"]);
    for (const reloj of [undefined, () => "2026-10-08", () => 0]) expect(evaluarFraude(base({ datos, reloj })).motivos).toStrictEqual([]);
  });
});

describe("FRA-01 y FRA-06 motivos, warnings y omisiones", () => {
  it("los motivos se filtran por 0,3, se ordenan por puntaje y la acción sigue la política", () => {
    const s = evaluarFraude(base({ datos: { pdf417: { codigoLugar: "99999" } } }));
    expect(s.motivos).toStrictEqual([{ codigo: "inconsistencia", puntaje: 1, detalle: "municipio-inexistente" }]);
    expect(s).toMatchObject({ puntaje: 100, nivel: "alto", accion: "revisar", fase: "heuristica" });
  });

  it("empate de puntaje: orden del vocabulario", () => {
    // Imagen sin color (gris) y datos imposibles: fotocopia e inconsistencia; inconsistencia vale 1.
    const s = evaluarFraude(base({ frames: [frame(64, 48, 200)], datos: { pdf417: { fechaNacimiento: "2001-02-30" } } }));
    const p = s.motivos.map((m) => m.puntaje);
    expect([...p].sort((a, b) => b - a)).toStrictEqual(p);
    expect(s.motivos.every((m) => m.puntaje >= 0.3)).toBe(true);
  });

  it("configuración inválida: warning y valores por defecto; modelo habilitado sin sesión se omite", () => {
    expect(evaluarFraude(base(), { umbralMedio: 0 }).warnings).toStrictEqual(["H-FRA-3", "config-fraude-invalida"]);
    expect(evaluarFraude(base(), { modelo: { habilitado: true } }).senalesOmitidas).toContain("modelo");
    expect(evaluarFraude(base()).senalesOmitidas).not.toContain("modelo");
  });

  it("una medición que lanza omite la imagen sin romper la señal", () => {
    const f = frame();
    // Un getter que lanza al leer los píxeles durante la medición.
    const trampa = new Proxy(f.data, { get: (t, k) => (k === "length" ? t.length : typeof k === "string" && /^[0-9]+$/.test(k) ? (() => { throw new Error("x"); })() : Reflect.get(t, k)) });
    Object.setPrototypeOf(trampa, Uint8ClampedArray.prototype);
    const s = evaluarFraude(base({ frames: [{ ...f, data: trampa }] }));
    expect(s.version).toBe(1);
  });
});

describe("FRA-03 manejador del Worker", () => {
  it("pone a cero todos los frames, también si la entrada no es válida", () => {
    const a = frame();
    const b = frame(10, 10);
    evaluarYLiberar(base({ frames: [a, b] }));
    expect(a.data.every((x) => x === 0) && b.data.every((x) => x === 0)).toBe(true);
    const c = frame();
    evaluarYLiberar({ frames: [c, null, { data: [1, 2] }] });
    expect(c.data.every((x) => x === 0)).toBe(true);
    expect(() => evaluarYLiberar(null)).not.toThrow();
    expect(() => evaluarYLiberar({ frames: "x" })).not.toThrow();
  });
});

describe("FRA-20 cuadrilátero aproximado (guía de encuadre)", { timeout: 60_000 }, () => {
  it("omite recorte, marco y holograma; conserva color y datos", async () => {
    const { escenaPorNombre } = await import("../src/sintetico/index.js");
    const e = escenaPorNombre("amarilla-recortada-semilla-1").entrada;
    const exacto = evaluarFraude(e);
    expect(exacto.motivos.map((m) => m.codigo)).toContain("recorte");
    const s = evaluarFraude({ ...e, cuadrilateroAproximado: true });
    expect(s.motivos.map((m) => m.codigo)).not.toContain("recorte");
    expect(s.motivos.find((m) => m.codigo === "fotocopia")?.detalle).not.toBe("sin-holograma");
    expect(s.senalesOmitidas).toEqual(expect.arrayContaining(["geometria", "holograma"]));
    const pantalla = evaluarFraude({ ...escenaPorNombre("amarilla-pantalla-semilla-1").entrada, cuadrilateroAproximado: true });
    expect(pantalla.motivos[0]?.codigo).toBe("pantalla");
  });
});
