// pwa-lectura-offline, tarea 1.2 (design.md, decisión 13): escenas de cédula sintética de la cámara simulada.
// Comprueba que las imágenes fuente son de PERSONA_BASE (NUIP ^9999) y, si ya se generaron con `npm run e2e:videos`,
// la cabecera y las dimensiones de cada .y4m. Las imágenes se generan en memoria; nada se escribe en el repositorio.
import { existsSync, openSync, readSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { leerCabeceraY4m } from "../../e2e/videos/y4m.mjs";
import { ESCENAS_CEDULA, PERSONA_TI, fuentesCedula } from "../../e2e/videos/cedulas.mjs";
import { parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { ESCENAS } from "../../e2e/videos/generar.mjs";
import { lectorReal } from "../../packages/capture/test/pdf417/sintetica.ts";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function cabecera(ruta) {
  const fd = openSync(ruta, "r");
  const buf = Buffer.alloc(256);
  readSync(fd, buf, 0, 256, 0);
  closeSync(fd);
  return leerCabeceraY4m(buf);
}

describe("Vídeos sintéticos de cédula (tarea 1.2)", { timeout: 60_000 }, () => {
  it("declara las tres escenas de 1920x1080 con su fuente", () => {
    expect(ESCENAS_CEDULA.map((e) => [e.nombre, e.fuente, e.ancho, e.alto])).toStrictEqual([
      ["amarilla-1080p", "amarilla", 1920, 1080],
      ["digital-1080p", "digital", 1920, 1080],
      ["digital-girada-90-1080p", "digital", 1920, 1080],
      // mrz-giro-180 (LMI-12c): la digital al revés.
      ["digital-girada-180-1080p", "digital", 1920, 1080],
      // OFF-22: la escena nítida de captura lleva la amarilla sintética (sin cédula nunca hay listo).
      ["nitida-1080p", "amarilla", 1920, 1080],
      ["nitida-720p", "amarilla", 1280, 720],
      ["sin-documento-1080p", "sin-documento", 1920, 1080],
      ["tarjeta-ilegible-1080p", "ilegible", 1920, 1080],
      // OFF-25: escenas suaves como la cámara de un celular real.
      ["amarilla-suave-1080p", "amarilla", 1920, 1080],
      ["digital-suave-1080p", "digital", 1920, 1080],
      // otros-documentos (OD-21): pasaporte colombiano sintético (TD3).
      ["pasaporte-col-1080p", "pasaporte", 1920, 1080],
      // otros-documentos (OD-34b): TI amarilla sintética de una persona menor.
      ["ti-amarilla-1080p", "ti-amarilla", 1920, 1080],
      // sdk-integracion (SDK-64): cédulas de pie en vídeo vertical (celular de pie).
      ["amarilla-de-pie-vertical", "amarilla", 1080, 1920],
      ["digital-de-pie-vertical", "digital", 1080, 1920],
    ]);
    expect(ESCENAS_CEDULA.find((e) => e.nombre === "amarilla-suave-1080p").filtro).toContain("gblur=sigma=2.5");
    expect(ESCENAS_CEDULA.find((e) => e.nombre === "digital-suave-1080p").filtro).toContain("gblur=sigma=5");
    expect(ESCENAS.map((e) => e.nombre)).not.toContain("nitida-1080p");
    expect(ESCENAS_CEDULA[2].filtro).toContain("transpose=1");
    // SDK-64: la cédula de pie ocupa la guía vertical del recuadro 260x400 con cover (x 69, y 213, 942x1494).
    expect(ESCENAS_CEDULA.find((e) => e.nombre === "amarilla-de-pie-vertical").filtro).toContain("s=1080x1920:r=10[f];[0:v]transpose=1,scale=942:1494");
    expect(ESCENAS_CEDULA.find((e) => e.nombre === "digital-de-pie-vertical").filtro).toContain("overlay=69:213");
    expect(ESCENAS_CEDULA[3].filtro).toContain("[0:v]hflip,vflip,scale=1541:972");
    for (const e of ESCENAS_CEDULA.filter((x) => x.fuente !== "sin-documento")) expect(e.filtro).toContain("lutyuv=y='clip(val,40,200)'");
  });

  it("las fuentes son PNG sintéticos de PERSONA_BASE con NUIP ^9999", async () => {
    const f = await fuentesCedula();
    const decodificar = await lectorReal();
    const amarilla = PNG.sync.read(Buffer.from(f.amarilla));
    const leidos = await decodificar({ data: new Uint8ClampedArray(amarilla.data), width: amarilla.width, height: amarilla.height }, { formats: ["PDF417"], tryHarder: true });
    expect(leidos).toHaveLength(1);
    const texto = Buffer.from(leidos[0].bytes).toString("latin1");
    expect(texto).toMatch(/9999123456/u);
    expect(f.lineasMrz.join("\n")).toMatch(/9999123456/u);
    const digital = PNG.sync.read(Buffer.from(f.digital));
    expect([digital.width, digital.height]).toStrictEqual([1011, 638]);
    expect(f.nuip).toMatch(/^9999/u);
    const sin = PNG.sync.read(Buffer.from(f.sinDocumento));
    expect([sin.width, sin.height]).toStrictEqual([1920, 1080]);
    const ilegible = PNG.sync.read(Buffer.from(f.ilegible));
    expect([ilegible.width, ilegible.height]).toStrictEqual([1011, 638]);
    // La tarjeta ilegible no contiene ningún PDF417 decodificable.
    expect(await decodificar({ data: new Uint8ClampedArray(ilegible.data), width: ilegible.width, height: ilegible.height }, { formats: ["PDF417"], tryHarder: true })).toHaveLength(0);
  });

  it("OD-34b la TI amarilla es un PDF417 sintético de PERSONA_TI (NUIP ^9999, 12 años el 2026-10-06)", async () => {
    const f = await fuentesCedula();
    const ti = PNG.sync.read(Buffer.from(f.tiAmarilla));
    const leidos = await (await lectorReal())({ data: new Uint8ClampedArray(ti.data), width: ti.width, height: ti.height }, { formats: ["PDF417"], tryHarder: true });
    expect(leidos).toHaveLength(1);
    const r = parsearPdf417Amarilla(leidos[0].bytes);
    expect(r.ok).toBe(true);
    expect(r.campos.numeroDocumento).toMatch(/^9999/u);
    expect(r.campos.fechaNacimiento).toBe(PERSONA_TI.fechaNacimiento);
    expect(r.campos.fechaNacimiento > "2008-10-06").toBe(true);
  });

  for (const e of ESCENAS_CEDULA) {
    const ruta = join(RAIZ, "e2e/videos/sinteticos", `${e.nombre}.y4m`);
    it.skipIf(!existsSync(ruta))(`${e.nombre}.y4m tiene cabecera 4:2:0 de ${e.ancho}x${e.alto}`, () => {
      const c = cabecera(ruta);
      expect([c.ancho, c.alto]).toStrictEqual([e.ancho, e.alto]);
      expect(c.croma.startsWith("420")).toBe(true);
    });
  }
});
