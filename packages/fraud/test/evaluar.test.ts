// FRA-01, FRA-03, FRA-04, FRA-05, FRA-07 a FRA-10 (cambio deteccion-fraude) sobre escenas sintéticas.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CONFIG_FRAUDE_POR_DEFECTO, type SenalRiesgo, evaluarFraude, evaluarYLiberar } from "../src/index.js";
import type { MedidasImagen } from "../src/detectores/imagen.js";
import { puntajeRecorte } from "../src/detectores/puntajes.js";
import { ladosCuadrilatero } from "../src/imagen/primitivas.js";
import { escenaPorNombre, generarEscena } from "../src/sintetico/index.js";

const MEDIDAS_NEUTRAS: MedidasImagen = {
  subpixeles: 0, frecuenciaSubpixeles: 0, reflejo: 0, luzExterior: 100, banding: null, saturacion: 0.4, texturaPlana: 1,
  holograma: null, aspecto: 85.6 / 53.98, esquinasRectas: 0, esquinasDecidibles: 4, dobleCompresion: 0, superposicion: 0,
};

const motivo = (s: SenalRiesgo, codigo: string) => s.motivos.find((m) => m.codigo === codigo);
const CLAVES = ["accion", "fase", "motivos", "nivel", "puntaje", "senalesOmitidas", "version", "warnings"];

function validarForma(s: SenalRiesgo): void {
  expect(Object.keys(s).sort()).toStrictEqual(CLAVES);
  expect(s.version).toBe(1);
  expect(Number.isInteger(s.puntaje) && s.puntaje >= 0 && s.puntaje <= 100).toBe(true);
  const codigos = s.motivos.map((m) => m.codigo);
  expect(new Set(codigos).size).toBe(codigos.length);
  for (let i = 1; i < s.motivos.length; i++) expect((s.motivos[i - 1] as { puntaje: number }).puntaje).toBeGreaterThanOrEqual((s.motivos[i] as { puntaje: number }).puntaje);
  for (const m of s.motivos) expect(m.detalle).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
}

describe("FRA-01 contrato de la señal", { timeout: 60_000 }, () => {
  it("FRA-01 documento auténtico sintético", () => {
    const s = evaluarFraude(escenaPorNombre("amarilla-autentica-semilla-1").entrada);
    validarForma(s);
    expect(s).toMatchObject({ version: 1, nivel: "bajo", motivos: [], accion: "continuar", fase: "heuristica" });
    expect(s.warnings).toContain("H-FRA-1");
  });

  it("FRA-01 auténticas de ambos tipos en varias semillas dan nivel bajo", () => {
    for (const tipo of ["amarilla", "digital"] as const)
      for (const semilla of [2, 3]) {
        const s = evaluarFraude(generarEscena({ tipo, clase: "autentica", semilla }).entrada);
        expect(s.nivel, `${tipo} ${semilla}`).toBe("bajo");
      }
  });

  it("FRA-01 entrada arbitraria no lanza", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const s = evaluarFraude(x);
        validarForma(s);
        expect(s.senalesOmitidas.length > 0 || s.puntaje === 0).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("FRA-01 frames corruptos se omiten", () => {
    const e = escenaPorNombre("amarilla-autentica-semilla-1").entrada;
    const base = { ...e, frames: [{ data: new Uint8ClampedArray(10), width: 800, height: 520 }] };
    expect(evaluarFraude(base).senalesOmitidas).toContain("imagen");
    expect(evaluarFraude({ ...e, cuadrilatero: [{ x: 0, y: 0 }] }).senalesOmitidas).toContain("imagen");
    expect(evaluarFraude({ ...e, tipo: "pasaporte" }).senalesOmitidas).toStrictEqual(["datos", "imagen", "tipo"]);
    expect(evaluarFraude({ ...e, reloj: () => { throw new Error("x"); } }).fase).toBe("heuristica");
  });
});

describe("FRA-03 sin persistencia ni datos personales", { timeout: 60_000 }, () => {
  it("FRA-03 buffers liberados (frame de 1920x1080)", () => {
    const e = escenaPorNombre("amarilla-autentica-semilla-1", { frames: 1 }).entrada;
    const data = new Uint8ClampedArray(1920 * 1080 * 4).fill(77);
    const s = evaluarYLiberar({ ...e, frames: [{ data, width: 1920, height: 1080 }] });
    validarForma(s);
    expect(data.every((b) => b === 0)).toBe(true);
  });

  it("FRA-03 señal sin datos personales", () => {
    const s = evaluarFraude(escenaPorNombre("amarilla-recortada-semilla-1").entrada);
    const json = JSON.stringify(s);
    expect(json).not.toContain("9999123456");
    expect(json).not.toContain("PRUEBA");
    expect(json).not.toMatch(/[0-9]{4}-[0-9]{2}-[0-9]{2}/);
  });
});

describe("FRA-04 y FRA-05 política sobre escenas", { timeout: 60_000 }, () => {
  const pantalla = escenaPorNombre("amarilla-pantalla-semilla-1").entrada;

  it("FRA-04 pantalla con configuración por defecto", () => {
    const s = evaluarFraude(pantalla);
    expect(s.nivel).toBe("alto");
    expect(s.motivos[0]?.codigo).toBe("pantalla");
    expect(s.accion).toBe("revisar");
  });

  it("FRA-04 instancia que bloquea por puntaje", () => {
    expect(evaluarFraude(pantalla, { bloquearSi: { puntajeMinimo: 70, motivosMinimos: 1, motivoUnico: true } }).accion).toBe("bloquear");
  });

  it("FRA-05 configuración inválida: se usa la de por defecto", () => {
    const s = evaluarFraude(pantalla, { umbralMedio: 80, umbralAlto: 50 });
    expect(s.nivel).toBe("alto");
    expect(s.warnings).toContain("config-fraude-invalida");
    expect(s.accion).toBe(evaluarFraude(pantalla, CONFIG_FRAUDE_POR_DEFECTO).accion);
  });

  it("FRA-06 determinismo byte a byte", () => {
    expect(JSON.stringify(evaluarFraude(pantalla))).toBe(JSON.stringify(evaluarFraude(pantalla)));
  });
});

describe("FRA-07 recaptura de pantalla", { timeout: 60_000 }, () => {
  it("FRA-07 moiré sintético", () => {
    const p = motivo(evaluarFraude(escenaPorNombre("amarilla-pantalla-semilla-1").entrada), "pantalla");
    expect(p?.puntaje).toBeGreaterThanOrEqual(0.7);
    expect(p?.detalle).toBe("moire");
  });

  it("FRA-07 banding entre frames", () => {
    const e = escenaPorNombre("digital-pantalla-banding-semilla-2").entrada;
    expect(e.frames).toHaveLength(5);
    const s = evaluarFraude(e);
    expect(motivo(s, "pantalla")?.detalle).toBe("banding");
    const un = evaluarFraude({ ...e, frames: [e.frames[0]] });
    expect(un.senalesOmitidas).toContain("banding");
  });

  it("FRA-07 metamórfica sobre auténtico: pantalla < 0,4", () => {
    const variantes = [{ rotacion: 3 }, { rotacion: -3 }, { blur: 1 }, { brillo: 0.2 }, { brillo: -0.2 }, { jpeg: 70 }];
    for (const distorsion of variantes) {
      const s = evaluarFraude(generarEscena({ tipo: "amarilla", clase: "autentica", semilla: 1, distorsion }).entrada);
      expect(motivo(s, "pantalla")?.puntaje ?? 0, JSON.stringify(distorsion)).toBeLessThan(0.4);
    }
  });
});

describe("FRA-08 fotocopia o impresión", { timeout: 60_000 }, () => {
  it("FRA-08 fotocopia en grises", () => {
    const f = motivo(evaluarFraude(escenaPorNombre("amarilla-fotocopia-gris-semilla-1").entrada), "fotocopia");
    expect(f?.puntaje).toBeGreaterThanOrEqual(0.7);
    expect(f?.detalle).toBe("gris");
  });

  it("FRA-08 impresión en color con tramado", () => {
    expect(motivo(evaluarFraude(escenaPorNombre("digital-impresion-color-semilla-3").entrada), "fotocopia")?.detalle).toBe("tramado");
  });

  it("FRA-08 holograma estático con un solo frame", () => {
    const s = evaluarFraude(escenaPorNombre("amarilla-fotocopia-color-semilla-1", { frames: 1 }).entrada);
    expect(motivo(s, "fotocopia")?.detalle).not.toBe("sin-holograma");
    expect(s.senalesOmitidas).toContain("holograma");
    expect(s.warnings).toContain("H-FRA-1");
  });

  it("FRA-08 holograma estático con 3 frames en la amarilla recortada", () => {
    const s = evaluarFraude(escenaPorNombre("amarilla-recortada-semilla-1").entrada);
    expect(s.senalesOmitidas).not.toContain("holograma");
    expect(motivo(s, "fotocopia")).toBeDefined();
  });
});

describe("FRA-09 geometría ID-1", { timeout: 60_000 }, () => {
  it("FRA-09 esquinas rectas", () => {
    const s = evaluarFraude(escenaPorNombre("amarilla-recortada-semilla-1").entrada);
    expect(motivo(s, "recorte")?.detalle).toBe("esquinas-rectas");
    expect(evaluarFraude(escenaPorNombre("digital-recortada-semilla-1").entrada).warnings).toContain("H-FRA-3");
  });

  it("FRA-09 relación de aspecto 1000 x 700", () => {
    const e = escenaPorNombre("digital-autentica-semilla-1", { frames: 1 }).entrada;
    const q: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 700 },
      { x: 0, y: 700 },
    ];
    const data = new Uint8ClampedArray(1100 * 800 * 4).fill(200);
    const s = evaluarFraude({ ...e, frames: [{ data, width: 1100, height: 800 }], cuadrilatero: q });
    expect(motivo(s, "recorte")?.detalle).toBe("aspecto");
  });

  it("FRA-09 propiedad: invariancia a la rotación del cuadrilátero en el frame", () => {
    fc.assert(
      fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), fc.double({ min: 0.6, max: 2.4, noNaN: true }), (ang, k) => {
        const rot = (x: number, y: number) => ({ x: 500 + x * Math.cos(ang) - y * Math.sin(ang), y: 500 + x * Math.sin(ang) + y * Math.cos(ang) });
        const w = 200 * k;
        const h = w / 1.5858;
        const q = [rot(-w / 2, -h / 2), rot(w / 2, -h / 2), rot(w / 2, h / 2), rot(-w / 2, h / 2)];
        const { ancho, alto } = ladosCuadrilatero(q);
        const m = puntajeRecorte({ ...MEDIDAS_NEUTRAS, aspecto: ancho / alto });
        expect(m).toBeNull();
        expect(puntajeRecorte({ ...MEDIDAS_NEUTRAS, aspecto: (ancho / alto) * 0.9 })?.detalle).toBe("aspecto");
      }),
      { numRuns: 1000 },
    );
  });
});

describe("FRA-10 edición digital", { timeout: 60_000 }, () => {
  it("FRA-10 parche pegado", () => {
    const e = motivo(evaluarFraude(escenaPorNombre("digital-editada-semilla-4").entrada), "edicion");
    expect(["doble-compresion", "superposicion"]).toContain(e?.detalle);
  });

  it("FRA-10 superposición: parche pegado sin el ruido del sensor", () => {
    const e = generarEscena({ tipo: "digital", clase: "editada", semilla: 5, superposicion: true });
    expect(e.id).toBe("digital-editada-superposicion-semilla-5");
    expect(motivo(evaluarFraude(e.entrada), "edicion")?.detalle).toBe("superposicion");
  });

  it("FRA-10 metamórfica: auténticos con distorsión no producen edicion", () => {
    for (const distorsion of [{ blur: 1 }, { jpeg: 70 }, { brillo: -0.2 }]) {
      for (const tipo of ["amarilla", "digital"] as const) {
        const s = evaluarFraude(generarEscena({ tipo, clase: "autentica", semilla: 2, distorsion }).entrada);
        expect(motivo(s, "edicion"), JSON.stringify({ tipo, distorsion })).toBeUndefined();
      }
    }
  });

  it("FRA-10 peso por defecto 0,5", () => {
    expect(CONFIG_FRAUDE_POR_DEFECTO.pesos.edicion).toBe(0.5);
  });
});
