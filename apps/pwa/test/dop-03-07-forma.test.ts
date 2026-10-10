// Cambio demo-opciones, DOP-03a "Guía de los recuadros" y DOP-07 "La forma de cámara consume el núcleo" (tarea 1.3).
// Los literales de la guía vertical (x 69, y 213, 942x1494) son los de SDK-64 (examples/login) y la horizontal coincide
// con la posición de la tarjeta en `amarilla-1080p` (190, 54, 1541x972).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FORMAS, guiaDeForma, guiaEnPantallaDeForma, RECUADROS, TEXTO_DE_PIE } from "../src/forma";

const VERTICAL = { anchoVideo: 1080, altoVideo: 1920, anchoElemento: 260, altoElemento: 400 };
const HORIZONTAL = { anchoVideo: 1920, altoVideo: 1080, anchoElemento: 320, altoElemento: 200 };

describe("DOP-03a Guía de los recuadros", () => {
  it("DOP-03a constantes de las formas", () => {
    expect(FORMAS).toStrictEqual(["pantalla-completa", "recuadro-horizontal", "recuadro-vertical"]);
    expect(RECUADROS).toStrictEqual({
      "recuadro-horizontal": { ancho: 320, alto: 200, orientacion: "horizontal" },
      "recuadro-vertical": { ancho: 260, alto: 400, orientacion: "vertical" },
    });
    expect(TEXTO_DE_PIE).toBe("Sostén la cédula de pie, sin girar el teléfono.");
  });

  it("DOP-03a Guía de cada forma", () => {
    expect(guiaDeForma("recuadro-vertical", VERTICAL)).toStrictEqual({ x: 69, y: 213, ancho: 942, alto: 1494 });
    expect(guiaDeForma("recuadro-horizontal", HORIZONTAL)).toStrictEqual({ x: 190, y: 54, ancho: 1541, alto: 972 });
    expect(guiaDeForma("pantalla-completa", VERTICAL)).toBeUndefined();
    expect(guiaDeForma("pantalla-completa", HORIZONTAL)).toBeUndefined();
  });

  it("DOP-03a sin medidas del vídeo no hay guía", () => {
    expect(guiaDeForma("recuadro-vertical", { ...VERTICAL, anchoVideo: 0 })).toBeUndefined();
    expect(guiaDeForma("recuadro-horizontal", { ...HORIZONTAL, altoVideo: 0 })).toBeUndefined();
  });

  it("DOP-03a la guía de un recuadro tiene la orientación pedida y cabe en el frame (propiedad)", () => {
    let utiles = 0;
    fc.assert(
      fc.property(
        fc.constantFrom("recuadro-horizontal" as const, "recuadro-vertical" as const),
        fc.integer({ min: 240, max: 4096 }),
        fc.integer({ min: 240, max: 4096 }),
        fc.integer({ min: 100, max: 1200 }),
        fc.integer({ min: 100, max: 1200 }),
        (forma, anchoVideo, altoVideo, anchoElemento, altoElemento) => {
          const g = guiaDeForma(forma, { anchoVideo, altoVideo, anchoElemento, altoElemento });
          expect(g).toBeDefined();
          if (g === undefined) return;
          utiles++;
          expect(g.x).toBeGreaterThanOrEqual(0);
          expect(g.y).toBeGreaterThanOrEqual(0);
          expect(g.x + g.ancho).toBeLessThanOrEqual(anchoVideo);
          expect(g.y + g.alto).toBeLessThanOrEqual(altoVideo);
          if (forma === "recuadro-vertical") expect(g.alto).toBeGreaterThanOrEqual(g.ancho);
          else expect(g.ancho).toBeGreaterThanOrEqual(g.alto);
        },
      ),
      { numRuns: 1000 },
    );
    expect(utiles).toBe(1000);
  });

  it("DOP-03a guía en pantalla dentro del elemento con la orientación del recuadro", () => {
    const v = guiaEnPantallaDeForma("recuadro-vertical", VERTICAL);
    expect(v).not.toBeNull();
    if (v === null) return;
    expect(v.alto).toBeGreaterThan(v.ancho);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.x + v.ancho).toBeLessThanOrEqual(260);
    expect(v.y + v.alto).toBeLessThanOrEqual(400);
    const h = guiaEnPantallaDeForma("recuadro-horizontal", HORIZONTAL);
    expect(h).not.toBeNull();
    expect((h?.ancho ?? 0) > (h?.alto ?? 0)).toBe(true);
  });

  it("DOP-03 pantalla completa en pantalla: la guía de CAM-08 con object-fit contain, como antes", () => {
    // Frame 1920x1080 en un contenedor 412x839 (Pixel 7): escala 412/1920, banda vertical centrada.
    const g = guiaEnPantallaDeForma("pantalla-completa", { anchoVideo: 1920, altoVideo: 1080, anchoElemento: 412, altoElemento: 839 });
    const s = 412 / 1920;
    const dy = (839 - 1080 * s) / 2;
    // calcularGuia(1920, 1080) = { x: 190, y: 54, ancho: 1541, alto: 972 } (CAM-08, 90 % del alto).
    const esperado = { x: 190 * s, y: dy + 54 * s, ancho: 1541 * s, alto: 972 * s };
    expect(Object.keys(g ?? {})).toStrictEqual(["x", "y", "ancho", "alto"]);
    for (const k of ["x", "y", "ancho", "alto"] as const) expect(g?.[k], k).toBeCloseTo(esperado[k], 9);
    expect(guiaEnPantallaDeForma("pantalla-completa", { anchoVideo: 0, altoVideo: 1080, anchoElemento: 412, altoElemento: 839 })).toBeNull();
  });
});

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

function fuentes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    return e.isDirectory() ? fuentes(ruta) : /\.(ts|tsx)$/u.test(e.name) ? [ruta] : [];
  });
}

const importsDe = (texto: string): string[] => [...texto.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/gu)].map((m) => m[1] as string);

describe("DOP-07 La forma de cámara consume el núcleo", () => {
  it("DOP-07 Imports del núcleo", () => {
    const forma = readFileSync(join(RAIZ, "apps/pwa/src/forma.ts"), "utf8");
    const linea = /import\s*\{([^}]*)\}\s*from\s*"@lector-cedula\/web";/u.exec(forma);
    expect(linea).not.toBeNull();
    const nombres = (linea?.[1] ?? "").split(",").map((n) => n.trim()).filter(Boolean);
    expect(nombres).toContain("guiaEnVideo");
    expect(nombres).toContain("guiaEnElemento");
    const internos = fuentes(join(RAIZ, "apps/pwa/src")).flatMap((r) =>
      importsDe(readFileSync(r, "utf8")).filter((i) => i.includes("packages/web/src") || i.includes("@lector-cedula/web/src")).map((i) => `${relative(RAIZ, r)}: ${i}`),
    );
    expect(internos).toStrictEqual([]);
    const paquete = JSON.parse(readFileSync(join(RAIZ, "apps/pwa/package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(paquete.dependencies["@lector-cedula/web"]).toBe("0.1.0");
  });

  it("DOP-07 el analizador de imports detecta rutas internas", () => {
    expect(importsDe('import { a } from "@lector-cedula/web/src/pantalla";\nconst m = await import("../../packages/web/src/x");')).toStrictEqual([
      "@lector-cedula/web/src/pantalla",
      "../../packages/web/src/x",
    ]);
  });
});
