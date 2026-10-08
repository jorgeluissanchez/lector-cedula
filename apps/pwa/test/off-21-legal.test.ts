// OFF-21 Aviso de privacidad, autorización y textos legales (pwa-lectura-offline): extracción del aviso corto,
// negritas sin HTML inyectado y conversión Markdown -> HTML de las páginas legales (escapada).
import { describe, expect, it } from "vitest";
import { avisoCorto, fragmentos, TEXTO_ALCANCE, TEXTO_AUTORIZACION, TEXTO_DESCARGO } from "../src/legal";
import { fuenteLegal, mdAHtml } from "../legal-paginas";

const MD = `# Aviso (BORRADOR)

> nota

## Texto (variante PWA sola)

**Tu privacidad**

**[RAZÓN SOCIAL]** usa esta app. Escribe a **[CORREO]**.

[Continuar] [Cancelar]

## Texto (variante con servidor de respaldo)

Otro texto.
`;

describe("OFF-21 textos legales", () => {
  it("OFF-21 aviso corto: solo la variante PWA, sin la línea de botones", () => {
    expect(avisoCorto(MD)).toStrictEqual(["**Tu privacidad**", "**[RAZÓN SOCIAL]** usa esta app. Escribe a **[CORREO]**."]);
    expect(avisoCorto("sin sección")).toStrictEqual([]);
  });

  it("OFF-21 negritas como fragmentos (los marcadores quedan visibles)", () => {
    expect(fragmentos("**[RAZÓN SOCIAL]** usa <b>x</b>")).toStrictEqual([
      { texto: "[RAZÓN SOCIAL]", fuerte: true },
      { texto: " usa <b>x</b>", fuerte: false },
    ]);
    expect(fragmentos("")).toStrictEqual([]);
  });

  it("OFF-21 textos fijos", () => {
    expect(TEXTO_AUTORIZACION).toBe("Autorizo el tratamiento de mis datos para verificar mi identidad");
    expect(TEXTO_DESCARGO).toBe("No es una verificación oficial de la Registraduría.");
    expect(TEXTO_ALCANCE).toBe("Solo para cédulas de ciudadanía de mayores de edad.");
  });

  it("OFF-21 Markdown a HTML: título, encabezados, listas, citas, negritas y HTML escapado", () => {
    const html = mdAHtml("# Título\n\n## Sección\n\nTexto **fuerte** <script>x</script>\n\n- uno\n- dos\n\n1. a\n\n> cita", "Política de tratamiento");
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("<title>Política de tratamiento</title>");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<h2>Sección</h2>");
    expect(html).toContain("<strong>fuerte</strong>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<li>uno</li>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain('href="/"');
  });

  it("OFF-21 fuente: publicacion/ si existe, si no el borrador", () => {
    const existe = (r: string) => r.endsWith("docs/legal/publicacion/terminos-de-uso.md");
    expect(fuenteLegal("terminos-de-uso.md", existe)).toBe("docs/legal/publicacion/terminos-de-uso.md");
    expect(fuenteLegal("terminos-de-uso.md", () => false)).toBe("docs/legal/terminos-de-uso.md");
  });
});

describe("OFF-21 textos de publicación", () => {
  const AVISO = `## Su privacidad

*Versión 1.0, vigente desde [FECHA]. Sujeta a revisión.*

**[RAZÓN SOCIAL]** usa esta aplicación.

- Se lee **solo en este teléfono**.

[Política](URL-POLITICA) · [Términos](URL-TERMINOS)

> Esta lectura **no es una verificación oficial**.
<!-- nota interna -->`;

  it("bloques visibles: título, párrafos, viñetas y citas; sin enlaces sueltos ni comentarios", async () => {
    const { bloquesMd } = await import("../src/legal");
    expect(bloquesMd(AVISO)).toStrictEqual([
      { tipo: "titulo", texto: "Su privacidad" },
      { tipo: "parrafo", texto: "Versión 1.0, vigente desde [FECHA]. Sujeta a revisión." },
      { tipo: "parrafo", texto: "**[RAZÓN SOCIAL]** usa esta aplicación." },
      { tipo: "item", texto: "Se lee **solo en este teléfono**." },
      { tipo: "cita", texto: "Esta lectura **no es una verificación oficial**." },
    ]);
  });

  it("casilla y descargo desde la publicación", async () => {
    const { autorizacionMd, descargoMd } = await import("../src/legal");
    expect(autorizacionMd("x\n- [ ] **Autorizo a [RAZÓN SOCIAL] según la [política](URL-POLITICA).**\n[Continuar]")).toBe("Autorizo a [RAZÓN SOCIAL] según la política.");
    expect(autorizacionMd("sin casilla")).toBeNull();
    expect(descargoMd("## Pie\n\n## Descargo (junto)\n\n> **Esta lectura no es oficial.** Revise.")).toBe("Esta lectura no es oficial. Revise.");
    expect(descargoMd("nada")).toBeNull();
    expect(descargoMd("## Descargo\nsin cita")).toBeNull();
  });
});

describe("OFF-21 Origen de los textos", () => {
  it("usa la publicación si existe y los borradores si no", async () => {
    const { textosLegales } = await import("../legal-paginas");
    const archivos: Record<string, string> = {
      "docs/legal/publicacion/aviso-privacidad.md": "## Su privacidad\n\nTexto.",
      "docs/legal/publicacion/autorizacion.md": "- [ ] **Autorizo X.**",
      "docs/legal/publicacion/descargo-y-enlaces.md": "## Descargo\n\n> **No oficial.**",
      "docs/legal/aviso-privacidad-app.md": "## Texto (variante PWA sola)\n\n**Tu privacidad**\n",
    };
    const leer = (r: string) => archivos[r] ?? "";
    expect(textosLegales((r) => r in archivos, leer)).toStrictEqual({
      aviso: [
        { tipo: "titulo", texto: "Su privacidad" },
        { tipo: "parrafo", texto: "Texto." },
      ],
      autorizacion: "Autorizo X.",
      descargo: "No oficial.",
    });
    expect(textosLegales((r) => r === "docs/legal/aviso-privacidad-app.md", leer)).toStrictEqual({
      aviso: [{ tipo: "parrafo", texto: "**Tu privacidad**" }],
      autorizacion: "Autorizo el tratamiento de mis datos para verificar mi identidad",
      descargo: "No es una verificación oficial de la Registraduría.",
    });
  });
});
