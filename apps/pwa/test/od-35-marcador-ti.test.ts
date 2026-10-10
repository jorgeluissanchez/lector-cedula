// Cambio otros-documentos, OD-35 (tarea 6.3): el marcador `URL-AUTORIZACION-TI` de los textos legales se sustituye
// en la compilación por la ruta de la autorización del representante (solo con VITE_ADMITIR_TI=true); apagado, el
// enlace desaparece y queda su texto. Nunca queda el marcador en lo emitido.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUTA_AUTORIZACION_TI } from "../src/legal";
import { MARCADOR_AUTORIZACION_TI, mdAHtml, sustituirMarcadorTi } from "../legal-paginas";

const MD = "Menores. Ver la [autorización del representante legal](URL-AUTORIZACION-TI). Y la [política](URL-POLITICA).";

describe("OD-35 marcador URL-AUTORIZACION-TI", () => {
  it("OD-35 encendido: el marcador pasa a la ruta de la página de la autorización", () => {
    expect(MARCADOR_AUTORIZACION_TI).toBe("URL-AUTORIZACION-TI");
    expect(sustituirMarcadorTi(MD, true)).toBe(`Menores. Ver la [autorización del representante legal](${RUTA_AUTORIZACION_TI}). Y la [política](URL-POLITICA).`);
  });

  it("OD-35 apagado: el enlace desaparece y su texto queda", () => {
    expect(sustituirMarcadorTi(MD, false)).toBe("Menores. Ver la autorización del representante legal. Y la [política](URL-POLITICA).");
  });

  it("OD-35 varias apariciones y texto sin marcador", () => {
    const doble = "[a](URL-AUTORIZACION-TI) y [b](URL-AUTORIZACION-TI)";
    expect(sustituirMarcadorTi(doble, true)).toBe(`[a](${RUTA_AUTORIZACION_TI}) y [b](${RUTA_AUTORIZACION_TI})`);
    expect(sustituirMarcadorTi(doble, false)).toBe("a y b");
    expect(sustituirMarcadorTi("sin marcador", true)).toBe("sin marcador");
  });

  it("OD-35 mdAHtml enlaza solo las rutas propias /assets/ y escapa el texto", () => {
    const html = mdAHtml(sustituirMarcadorTi(MD, true), "Política");
    expect(html).toContain(`<a href="${RUTA_AUTORIZACION_TI}">autorización del representante legal</a>`);
    // Los demás marcadores no se convierten en enlaces.
    expect(html).toContain("[política](URL-POLITICA)");
    expect(html).not.toContain("URL-AUTORIZACION-TI");
    expect(mdAHtml("[<b>x</b>](/assets/a.html)", "t")).toContain('<a href="/assets/a.html">&lt;b&gt;x&lt;/b&gt;</a>');
    expect(mdAHtml('[x](/assets/a.html" onclick="y)', "t")).not.toMatch(/<a href="(?!\/")/u);
    expect(mdAHtml("[x](https://ejemplo.invalid/assets/a.html)", "t")).not.toMatch(/<a href="(?!\/")/u);
  });

  it("OD-35 la política del repositorio contiene el marcador que se sustituye", () => {
    expect(readFileSync(new URL("../../../docs/legal/politica-tratamiento-datos.md", import.meta.url), "utf8")).toContain("](URL-AUTORIZACION-TI)");
  });
});
