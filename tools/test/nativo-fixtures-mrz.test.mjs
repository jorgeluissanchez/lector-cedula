// sdk-nativo, NAT-06, tarea 1.5: el generador de escenas MRZ del diferencial (tools/nativo/fixtures-mrz.mjs) coloca la
// tarjeta sintética en la guía, gira en el sentido declarado y escribe casos.json con las líneas del generador.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ALTO, ANCHO, centrada, escena, escenas, escribir, girar180, girarHorario, GUIA, LINEAS_PASAPORTE } from "../nativo/fixtures-mrz.mjs";

const dir = mkdtempSync(join(tmpdir(), "fixtures-mrz-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Imagen w x h donde el canal R de cada píxel es su índice (mod 256) y G marca la columna 0. */
function marcada(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([i % 256, i % w === 0 ? 255 : 0, 0, 255], i * 4);
  return { data, width: w, height: h };
}

const px = (p, x, y) => [...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)];

describe("NAT-06 Escenas MRZ sintéticas", { timeout: 60_000 }, () => {
  it("NAT-06 Giro horario de 90 (transpose=1 de ffmpeg) y de 180", () => {
    const p = marcada(3, 2);
    const h = girarHorario(p);
    expect([h.width, h.height]).toStrictEqual([2, 3]);
    // La esquina inferior izquierda pasa a la superior izquierda.
    expect(px(h, 0, 0)).toStrictEqual(px(p, 0, 1));
    expect(px(h, 1, 0)).toStrictEqual(px(p, 0, 0));
    expect(px(h, 0, 2)).toStrictEqual(px(p, 2, 1));
    const r = girar180(p);
    expect(px(r, 0, 0)).toStrictEqual(px(p, 2, 1));
    expect(girar180(r).data).toStrictEqual(p.data);
    expect(girarHorario(girarHorario(girarHorario(girarHorario(p)))).data).toStrictEqual(p.data);
  });

  it("NAT-06 La tarjeta ocupa la guía con la luminancia acotada a 40-200 y fondo 0x30", () => {
    const blanca = { data: new Uint8ClampedArray(4 * 4 * 4).fill(255), width: 4, height: 4 };
    const e = escena(blanca, GUIA);
    expect([e.width, e.height]).toStrictEqual([ANCHO, ALTO]);
    expect(px(e, 0, 0)).toStrictEqual([0x30, 0x30, 0x30, 255]);
    expect(px(e, GUIA.x, GUIA.y)).toStrictEqual([200, 200, 200, 255]);
    expect(px(e, GUIA.x + GUIA.ancho - 1, GUIA.y + GUIA.alto - 1)).toStrictEqual([200, 200, 200, 255]);
    expect(px(e, GUIA.x - 1, GUIA.y)).toStrictEqual([0x30, 0x30, 0x30, 255]);
    expect(px(e, GUIA.x + GUIA.ancho, GUIA.y)).toStrictEqual([0x30, 0x30, 0x30, 255]);
    const negra = { data: new Uint8ClampedArray(16).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 0)), width: 2, height: 2 };
    expect(px(escena(negra, GUIA), GUIA.x + 5, GUIA.y + 5)).toStrictEqual([40, 40, 40, 255]);
  });

  it("NAT-06 Pasaporte y tarjeta de pie centrados con el alto de la guía", () => {
    expect(centrada(1250, 880)).toStrictEqual({ x: 270, y: GUIA.y, ancho: 1380, alto: GUIA.alto });
    expect(centrada(638, 1011)).toStrictEqual({ x: 653, y: GUIA.y, ancho: 614, alto: GUIA.alto });
  });

  it("NAT-06 Escenas y casos.json: nombres, formatos, líneas del generador y RGBA crudo", () => {
    const tarjeta = marcada(20, 12);
    const lineas = ["ICCOL999912345516001<<<<<<<<<<", "8503149F3503144COL9999123456<5", "PRUEBA<EJEMPLO<<FICTICIA<LUZ<<"];
    const lista = escenas(tarjeta, marcada(25, 17), lineas);
    expect(lista.map((c) => [c.nombre, c.formato])).toStrictEqual([
      ["digital-1080p", "td1"],
      ["digital-girada-90-1080p", "td1"],
      ["digital-girada-180-1080p", "td1"],
      ["digital-girada-270-1080p", "td1"],
      ["pasaporte-1080p", "td3"],
    ]);
    expect(Buffer.compare(Buffer.from(lista[2].imagen.data), Buffer.from(girar180(lista[0].imagen).data))).toBe(0);
    expect(lista[4].lineas).toStrictEqual([...LINEAS_PASAPORTE]);
    const casos = escribir(dir, lista);
    const json = JSON.parse(readFileSync(join(dir, "casos.json"), "utf8"));
    expect(json.fechaReferencia).toBe("2026-10-09");
    expect(json.casos).toStrictEqual(casos);
    expect(json.casos[0]).toStrictEqual({ nombre: "digital-1080p", archivo: "digital-1080p.rgba", ancho: 1920, alto: 1080, formato: "td1", lineas });
    expect(readFileSync(join(dir, "digital-1080p.rgba")).length).toBe(1920 * 1080 * 4);
    // fixture-sintetico: solo el NUIP sintético 9999… aparece en las líneas.
    expect(lineas.join("")).toMatch(/9999123456/u);
  });
});
