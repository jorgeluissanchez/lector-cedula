import { describe, expect, it } from "vitest";
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
    expect(revisarArchivo("apps/pwa/src/tema.ts", codigo)).toHaveLength(0);
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
