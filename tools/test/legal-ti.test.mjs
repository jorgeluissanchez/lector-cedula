// Cambio otros-documentos, OD-35 "Archivos y enlaces" (tarea 7.1): presencia de los textos legales de la tarjeta de
// identidad en docs/legal/. Solo lee archivos; no comprueba la validez jurídica (eso es del abogado, B3b).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LEGAL = resolve(fileURLToPath(new URL("../..", import.meta.url)), "docs", "legal");
const leer = (archivo) => readFileSync(join(LEGAL, archivo), "utf8");

describe("OD-35 Textos legales de la TI", () => {
  it("OD-35 autorizacion-representante-ti.md existe con Ley 1581 de 2012, artículo 7 y Decreto 1377 de 2013", () => {
    expect(existsSync(join(LEGAL, "autorizacion-representante-ti.md"))).toBe(true);
    const md = leer("autorizacion-representante-ti.md");
    for (const cadena of ["Ley 1581 de 2012", "artículo 7", "Decreto 1377 de 2013"]) expect(md, cadena).toContain(cadena);
    // Plantilla (no es asesoría legal) con la casilla del representante, sin pedir sus datos (OD-34b).
    expect(md).toContain("no es asesoría legal");
    expect(md).toContain("representante legal");
  });

  it("OD-35 CHECKLIST-CUMPLIMIENTO.md exige revisión del abogado al activar LECTOR_ADMITIR_TI o VITE_ADMITIR_TI", () => {
    const md = leer("CHECKLIST-CUMPLIMIENTO.md");
    const fila = md.split("\n").find((l) => l.includes("LECTOR_ADMITIR_TI"));
    expect(fila).toBeDefined();
    expect(fila).toContain("VITE_ADMITIR_TI");
    expect(fila).toContain("abogado");
    expect(fila).toContain("autorizacion-representante-ti.md");
  });

  it("OD-35 la política y el aviso de la app tienen la sección de la tarjeta de identidad con el enlace a la autorización", () => {
    for (const archivo of ["politica-tratamiento-datos.md", "aviso-privacidad-app.md"]) {
      const md = leer(archivo);
      expect(md, archivo).toMatch(/^#{2,3} Tarjeta de identidad \(opcional, desactivada por defecto\)$/mu);
      expect(md, archivo).toContain("Ley 1581 de 2012, artículo 7");
      expect(md, archivo).toContain("](URL-AUTORIZACION-TI)");
    }
    expect(leer("politica-tratamiento-datos.md")).toContain("**Menores de edad.**");
  });

  // demo-opciones, DOP-08: la casilla del panel de la demo activa la TI como VITE_ADMITIR_TI (misma revisión jurídica).
  it("DOP-08 Checklist y política", () => {
    const fila = leer("CHECKLIST-CUMPLIMIENTO.md").split("\n").find((l) => l.includes("LECTOR_ADMITIR_TI"));
    expect(fila).toBeDefined();
    expect(fila).toContain("VITE_DEMO");
    expect(fila).toContain("abogado");
    const politica = leer("politica-tratamiento-datos.md");
    const inicio = politica.indexOf("### Tarjeta de identidad (opcional, desactivada por defecto)");
    expect(inicio).toBeGreaterThan(-1);
    const fin = politica.indexOf("\n## ", inicio);
    expect(politica.slice(inicio, fin === -1 ? undefined : fin)).toContain("VITE_DEMO");
  });

  it("OD-35 PARA-EL-ABOGADO.md pregunta por la autorización sin identificar al representante", () => {
    const md = leer("PARA-EL-ABOGADO.md");
    const pregunta = md.split("\n").find((l) => /^\d+\. Tarjeta de identidad/u.test(l));
    expect(pregunta).toBeDefined();
    expect(pregunta).toContain("VITE_ADMITIR_TI");
    expect(pregunta).toContain("representante");
  });
});
