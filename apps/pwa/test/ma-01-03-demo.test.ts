// Cambio mitigacion-autor, MA-01 y MA-03 (tarea 1.1): opción VITE_DEMO y meta CSP del build demo.
import { describe, expect, it } from "vitest";
import { CSP_DEMO, inyectarCspDemo, leerDemo } from "../config";

describe("MA-01 Opción de compilación VITE_DEMO", () => {
  it("MA-01 Valores válidos", () => {
    expect(leerDemo(undefined)).toBe(false);
    expect(leerDemo("")).toBe(false);
    expect(leerDemo("false")).toBe(false);
    expect(leerDemo("true")).toBe(true);
  });

  it("MA-01 Valor inválido", () => {
    expect(() => leerDemo("si")).toThrow(/VITE_DEMO/);
  });
});

describe("MA-03 Meta CSP en el build demo", () => {
  const html = '<html><head>\n    <meta charset="UTF-8" />\n  </head><body></body></html>';

  it("MA-03 con la opción demo se inyecta connect-src 'self'", () => {
    const salida = inyectarCspDemo(html, true);
    expect(CSP_DEMO).toBe(`<meta http-equiv="Content-Security-Policy" content="connect-src 'self'">`);
    expect(salida).toContain(CSP_DEMO);
    expect(salida.indexOf(CSP_DEMO)).toBeLessThan(salida.indexOf("</head>"));
  });

  it("MA-03 sin la opción el HTML no cambia", () => {
    expect(inyectarCspDemo(html, false)).toBe(html);
  });
});
