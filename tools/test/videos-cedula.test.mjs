// pwa-lectura-offline, tarea 1.2 (design.md, decisión 13): escenas de cédula sintética de la cámara simulada.
// Comprueba que las imágenes fuente son de PERSONA_BASE (NUIP ^9999) y, si ya se generaron con `npm run e2e:videos`,
// la cabecera y las dimensiones de cada .y4m. Las imágenes se generan en memoria; nada se escribe en el repositorio.
import { existsSync, openSync, readSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { leerCabeceraY4m } from "../../e2e/videos/y4m.mjs";
import { ESCENAS_CEDULA, fuentesCedula } from "../../e2e/videos/cedulas.mjs";
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
    ]);
    expect(ESCENAS_CEDULA.at(-2).filtro).toContain("gblur=sigma=2.5");
    expect(ESCENAS_CEDULA.at(-1).filtro).toContain("gblur=sigma=5");
    expect(ESCENAS.map((e) => e.nombre)).not.toContain("nitida-1080p");
    expect(ESCENAS_CEDULA[2].filtro).toContain("transpose=1");
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

  for (const e of ESCENAS_CEDULA) {
    const ruta = join(RAIZ, "e2e/videos/sinteticos", `${e.nombre}.y4m`);
    it.skipIf(!existsSync(ruta))(`${e.nombre}.y4m tiene cabecera 4:2:0 de ${e.ancho}x${e.alto}`, () => {
      const c = cabecera(ruta);
      expect([c.ancho, c.alto]).toStrictEqual([e.ancho, e.alto]);
      expect(c.croma.startsWith("420")).toBe(true);
    });
  }
});
