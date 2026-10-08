// OFF-28 (c) Varios frames de lectura (pwa-lectura-offline): con la pista y sin respaldo por frame, para en el primero
// leído o con un error que no es "no encontrado", presupuesto de 8000 ms, respaldo único al final sobre el primer frame
// y todos los frames a cero.
import type { ResultadoLectura, TipoLectura } from "@lector-cedula/capture";
import { describe, expect, it, vi } from "vitest";
import { leerSecuencia, type FrameLectura } from "../src/secuencia";

const NO: ResultadoLectura = { ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" };
const NO_MRZ: ResultadoLectura = { ok: false, tipo: "mrz", error: "mrz-no-encontrada" };
const OK: ResultadoLectura = { ok: true, tipo: "pdf417", intento: "realce-x2", resultado: {} };

const frames = (n = 5): FrameLectura[] =>
  Array.from({ length: n }, (_, i) => ({ ancho: 2, alto: 1, pixeles: new Uint8ClampedArray(8).fill(i + 1), origen: i === 0 ? "takePhoto" : "video" }));

const aCero = (fs: FrameLectura[]) => fs.every((f) => f.pixeles.every((b) => b === 0));

type Leer = (f: FrameLectura, lector: TipoLectura | null) => Promise<ResultadoLectura>;

describe("OFF-28 Varios frames", () => {
  it("OFF-28 no-encontrado, no-encontrado y correcto: 3 lecturas pdf417", async () => {
    const fs = frames();
    const respuestas = [NO, NO, OK];
    const leer = vi.fn<Leer>(async () => respuestas.shift() as ResultadoLectura);
    const { resultado, pasos } = await leerSecuencia(fs, "pdf417", leer, { ahora: () => 0 });
    expect(resultado).toBe(OK);
    expect(leer.mock.calls.map((c) => c[1])).toStrictEqual(["pdf417", "pdf417", "pdf417"]);
    expect(leer.mock.calls.map((c) => c[0])).toStrictEqual(fs.slice(0, 3));
    expect(pasos.map((p) => [p.origen, p.codigo])).toStrictEqual([
      ["takePhoto", "pdf417-no-encontrado"],
      ["video", "pdf417-no-encontrado"],
      ["video", "ok:pdf417:realce-x2"],
    ]);
    expect(aCero(fs)).toBe(true);
  });

  it("OFF-28 no-valido en el primero: 1 lectura", async () => {
    const fs = frames();
    const leer = vi.fn<Leer>(async () => ({ ok: false, tipo: "pdf417", error: "pdf417-no-valido" }));
    expect((await leerSecuencia(fs, "pdf417", leer, { ahora: () => 0 })).resultado).toMatchObject({ error: "pdf417-no-valido" });
    expect(leer).toHaveBeenCalledTimes(1);
    expect(aCero(fs)).toBe(true);
  });

  it("OFF-28 el reloj supera 8000 ms tras el segundo: 2 lecturas y el respaldo sobre el primero", async () => {
    const fs = frames();
    let t = 0;
    const leer = vi.fn<Leer>(async (_f, lector) => ((t += 4000), lector === "mrz" ? NO_MRZ : NO));
    const r = await leerSecuencia(fs, "pdf417", leer, { ahora: () => t });
    expect(r.resultado).toBe(NO_MRZ);
    expect(leer.mock.calls.map((c) => [fs.indexOf(c[0]), c[1]])).toStrictEqual([
      [0, "pdf417"],
      [1, "pdf417"],
      [0, "mrz"],
    ]);
    expect(aCero(fs)).toBe(true);
  });

  it("OFF-28 todos no-encontrado con pista: 5 pdf417 y 1 mrz sobre el primer frame, resultado de la MRZ", async () => {
    const fs = frames();
    const vistoPrimero: boolean[] = [];
    const MRZ_OK: ResultadoLectura = { ok: true, tipo: "mrz", intento: "proyeccion", resultado: {} };
    const leer = vi.fn<Leer>(async (f, lector) => {
      if (lector === "mrz") vistoPrimero.push(f.pixeles.every((b) => b === 1));
      return lector === "mrz" ? MRZ_OK : NO;
    });
    const { resultado, pasos } = await leerSecuencia(fs, "pdf417", leer, { ahora: () => 0 });
    expect(resultado).toBe(MRZ_OK);
    expect(leer.mock.calls.map((c) => [fs.indexOf(c[0]), c[1]])).toStrictEqual([
      [0, "pdf417"],
      [1, "pdf417"],
      [2, "pdf417"],
      [3, "pdf417"],
      [4, "pdf417"],
      [0, "mrz"],
    ]);
    // El primer frame se conserva intacto hasta el respaldo.
    expect(vistoPrimero).toStrictEqual([true]);
    expect(pasos.at(-1)?.codigo).toBe("ok:mrz:proyeccion");
    expect(aCero(fs)).toBe(true);
  });

  it("OFF-28 pista mrz: el respaldo final es pdf417", async () => {
    const fs = frames(1);
    const leer = vi.fn<Leer>(async (_f, lector) => (lector === "mrz" ? NO_MRZ : NO));
    expect((await leerSecuencia(fs, "mrz", leer, { ahora: () => 0 })).resultado).toBe(NO);
    expect(leer.mock.calls.map((c) => c[1])).toStrictEqual(["mrz", "pdf417"]);
  });

  it("OFF-28 sin pista: 5 lecturas con el orden de OFF-06 y ningún respaldo", async () => {
    const fs = frames();
    const leer = vi.fn<Leer>(async () => NO_MRZ);
    expect((await leerSecuencia(fs, null, leer, { ahora: () => 0 })).resultado).toBe(NO_MRZ);
    expect(leer.mock.calls.map((c) => c[1])).toStrictEqual([null, null, null, null, null]);
    expect(aCero(fs)).toBe(true);
  });

  it("OFF-28 los frames posteriores al primero se ponen a cero al enviarlos; cancelada y error lanzado paran", async () => {
    const fs = frames(3);
    const vistos: [number, boolean, boolean][] = [];
    const leer = vi.fn<Leer>(async (f) => {
      const antes = f.pixeles.every((b) => b !== 0);
      await Promise.resolve();
      vistos.push([fs.indexOf(f), antes, f.pixeles.every((b) => b === 0)]);
      return fs.indexOf(f) === 1 ? { ok: false, error: "cancelada" } : NO;
    });
    expect((await leerSecuencia(fs, "pdf417", leer, { ahora: () => 0 })).resultado).toStrictEqual({ ok: false, error: "cancelada" });
    expect(vistos).toStrictEqual([
      [0, true, false],
      [1, true, true],
    ]);
    expect(aCero(fs)).toBe(true);
    const fs2 = frames(2);
    await expect(leerSecuencia(fs2, "pdf417", () => Promise.reject(new Error("x")), { ahora: () => 0 })).rejects.toThrow("x");
    expect(aCero(fs2)).toBe(true);
  });

  it("OFF-28 sin frames: no-encontrado sin lecturas", async () => {
    const leer = vi.fn<Leer>();
    expect((await leerSecuencia([], "pdf417", leer, { ahora: () => 0 })).resultado).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" });
    expect(leer).not.toHaveBeenCalled();
  });
});

describe("OFF-28 Constantes de la PWA", () => {
  it("OFF-28 realce activado, 6000 ms por frame, 5 frames y 8000 ms", async () => {
    const { PDF417_PWA } = await import("../src/presupuesto");
    const { MAX_FRAMES_LECTURA, PRESUPUESTO_FRAMES_MS } = await import("../src/secuencia");
    expect(PDF417_PWA).toStrictEqual({ realcePdf417: true, limitePdf417Ms: 6000 });
    expect([MAX_FRAMES_LECTURA, PRESUPUESTO_FRAMES_MS]).toStrictEqual([5, 8000]);
  });
});
