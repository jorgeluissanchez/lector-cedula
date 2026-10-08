// Tarea 5.2: lista de recursos que precarga el service worker (CAM-01; design.md, decisión 10).
import { describe, expect, it } from "vitest";
import { listaRecursos, RUTA_PERMITIDA } from "../src/recursos";

describe("CAM-01 recursos del service worker", () => {
  it("CAM-01 incluye la raíz, el HTML, el manifiesto, los iconos y assets/*", () => {
    const emitidos = [
      "assets/index-AB12.js",
      "index.html",
      "assets/calidad.worker-XY.js",
      "assets/index-CD.css",
      "manifest.webmanifest",
      "iconos/icono-192.png",
      "iconos/icono-512.png",
    ];
    expect(listaRecursos(emitidos)).toStrictEqual([
      "/",
      "/assets/calidad.worker-XY.js",
      "/assets/index-AB12.js",
      "/assets/index-CD.css",
      "/iconos/icono-192.png",
      "/iconos/icono-512.png",
      "/index.html",
      "/manifest.webmanifest",
    ]);
  });

  it("CAM-01 Worker de calidad precacheado", () => {
    expect(listaRecursos(["assets/calidad.worker-XY.js", "assets/index-A.js"])).toStrictEqual(["/", "/assets/calidad.worker-XY.js", "/assets/index-A.js", "/index.html", "/manifest.webmanifest"]);
  });

  it("CAM-01 añade siempre /, /index.html y /manifest.webmanifest aunque Rollup no los emita", () => {
    expect(listaRecursos(["assets/a.js"])).toStrictEqual(["/", "/assets/a.js", "/index.html", "/manifest.webmanifest"]);
  });

  it("CAM-01 excluye todo lo demás", () => {
    const otros = ["sw.js", "assets/sub/x.js", "datos.json", "iconos/x.svg", "iconos/a/b.png", "../fuera.js", "foto.png", ".vite/manifest.json", "assets/"];
    expect(listaRecursos(otros)).toStrictEqual(["/", "/index.html", "/manifest.webmanifest"]);
  });

  it("CAM-01 sin duplicados", () => {
    expect(listaRecursos(["index.html", "/index.html", "assets/a.js", "assets/a.js"])).toStrictEqual(["/", "/assets/a.js", "/index.html", "/manifest.webmanifest"]);
  });

  it("CAM-01 cada ruta de la lista cumple la expresión del escenario Caché limitada", () => {
    const re = /^\/(index\.html|manifest\.webmanifest|sw\.js|iconos\/[^/]+\.png|assets\/[^/]+)?$/;
    expect(RUTA_PERMITIDA.source).toBe(re.source);
    for (const r of listaRecursos(["assets/a.js", "iconos/b.png"])) expect(re.test(r)).toBe(true);
    const rechazadas = ["/api/x", "/assets/sub/a.js", "/iconos/a.svg", "/iconos/a/b.png", "/sw.jsx", "/index.htm", "x/index.html", "/manifest.json", "/assets", "//evil/x"];
    expect(rechazadas.filter((r) => RUTA_PERMITIDA.test(r))).toStrictEqual([]);
  });
});
