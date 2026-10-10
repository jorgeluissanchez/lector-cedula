import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { revisarArchivo } from "../privacidad-check.mjs";

describe("revisarArchivo", () => {
  it("bloquea cualquier archivo dentro de evals/real", () => {
    expect(revisarArchivo("evals/real/lote1.json", "{}")).not.toHaveLength(0);
  });

  it("bloquea imágenes fuera de carpetas de sintéticos o especímenes", () => {
    expect(revisarArchivo("evals/fixtures/cedula.jpg", null)).not.toHaveLength(0);
    expect(revisarArchivo("evals/fixtures/sinteticos/cedula.png", null)).toHaveLength(0);
    expect(revisarArchivo("docs/especimenes/back-ccd.png", null)).toHaveLength(0);
  });

  it("exige marca de sintético en fixtures JSON", () => {
    expect(revisarArchivo("evals/fixtures/pdf417/caso.json", '{"entrada":"x"}')).not.toHaveLength(0);
    expect(revisarArchivo("evals/fixtures/pdf417/caso.json", '{"sintetico": true}')).toHaveLength(0);
  });

  it("detecta persistencia de imágenes en el servidor", () => {
    const codigo = "import cv2\ncv2.imwrite('/tmp/x.jpg', img)\n";
    const hallazgos = revisarArchivo("server/app/ocr.py", codigo);
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0].linea).toBe(2);
  });

  it("detecta almacenamiento en el navegador en código de producto", () => {
    const codigo = "localStorage.setItem('frame', dataUrl);\n";
    expect(revisarArchivo("packages/capture/src/camara.ts", codigo)).toHaveLength(1);
  });

  it("respeta la excepción explícita con justificación", () => {
    const codigo = "localStorage.setItem('tema', t); // privacidad-ok: preferencia de UI sin PII\n";
    expect(revisarArchivo("apps/otra/src/tema.ts", codigo)).toHaveLength(0);
  });

  it("detecta logs del servidor con campos personales", () => {
    const codigo = "logger.info(f'procesado {nuip}')\n";
    expect(revisarArchivo("server/app/api.py", codigo)).toHaveLength(1);
  });

  it("detecta payloads PDF417 con marcador fuera de tests o fixtures sintéticos", () => {
    const codigo = 'const p = "0123 PubDSK_1 123 9999123456EJEMPLO";\n';
    expect(revisarArchivo("packages/parsers/src/x.ts", codigo)).toHaveLength(1);
    expect(revisarArchivo("packages/parsers/test/x.test.ts", "// fixture-sintetico\n" + codigo)).toHaveLength(0);
  });

  it("ignora archivos de documentación de investigación", () => {
    expect(revisarArchivo("docs/investigacion/01.md", "PubDSK_1 cv2.imwrite")).toHaveLength(0);
  });
});

describe("OFF-11: nada persiste en la PWA ni en captura", () => {
  const ACCESOS = [
    "localStorage.setItem('k', v);",
    "const n = sessionStorage.length;",
    "const db = indexedDB.open('lecturas');",
    "document.cookie = 'nuip=1';",
    "const c = document.cookie;",
  ];
  const RUTAS = ["apps/pwa/src/resultado.ts", "packages/capture/src/lectura/worker-lector.ts", "packages/capture/src/camara.ts"];

  it.each(RUTAS)("detecta cada acceso al almacenamiento en %s", (ruta) => {
    for (const linea of ACCESOS) {
      const h = revisarArchivo(ruta, `${linea}\n`);
      expect(h, linea).toHaveLength(1);
      expect(h[0].mensaje).toMatch(/OFF-11/);
    }
  });

  it("no admite la excepción privacidad-ok en esas rutas", () => {
    const codigo = "document.cookie = 'x'; // privacidad-ok: intento\n";
    expect(revisarArchivo("apps/pwa/src/x.ts", codigo)).toHaveLength(1);
  });

  it("no marca código sin almacenamiento ni identificadores parecidos", () => {
    const codigo = "const cookieless = true;\nconst miLocalStorageFake = 1;\ndocument.title = 'x';\n";
    expect(revisarArchivo("apps/pwa/src/x.ts", codigo)).toHaveLength(0);
    expect(revisarArchivo("packages/parsers/src/x.ts", "document.cookie;\n")).toHaveLength(0);
  });

  // demo-opciones, DOP-06: única excepción, `localStorage` en apps/pwa/src/preferencias.ts (preferencias de la demo).
  it("DOP-06 Excepción solo en preferencias.ts", () => {
    expect(revisarArchivo("apps/pwa/src/preferencias.ts", "localStorage.getItem(k);\n")).toStrictEqual([]);
    const sesion = revisarArchivo("apps/pwa/src/preferencias.ts", "sessionStorage.getItem(k);\n");
    expect(sesion).toHaveLength(1);
    expect(sesion[0].mensaje).toMatch(/OFF-11/);
    const app = revisarArchivo("apps/pwa/src/App.tsx", "localStorage.getItem(k);\n");
    expect(app).toHaveLength(1);
    expect(app[0].mensaje).toMatch(/OFF-11/);
  });

  it("DOP-06 la excepción no cubre otros almacenamientos en la misma línea ni otras rutas parecidas", () => {
    for (const linea of ["localStorage.x; indexedDB.open('a');", "localStorage.x; document.cookie = 'a';"]) {
      const h = revisarArchivo("apps/pwa/src/preferencias.ts", `${linea}\n`);
      expect(h, linea).toHaveLength(1);
      expect(h[0].mensaje).toMatch(/OFF-11/);
    }
    for (const ruta of ["apps/pwa/src/sub/preferencias.ts", "apps/pwa/src/preferencias.tsx", "packages/capture/src/preferencias.ts", "apps/pwa/src/preferencias.ts.bak"]) {
      expect(revisarArchivo(ruta, "localStorage.getItem(k);\n").length, ruta).toBeGreaterThan(0);
    }
  });

  it("el repositorio real cumple OFF-11", () => {
    const archivos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "apps/pwa/src", "packages/capture/src"], { encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean);
    expect(archivos.length).toBeGreaterThan(0);
    const hallazgos = archivos.flatMap((r) => revisarArchivo(r, readFileSync(r, "utf8"))).filter((h) => /OFF-11/.test(h.mensaje));
    expect(hallazgos).toEqual([]);
  });
});
