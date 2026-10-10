// Cambio mitigacion-autor (MA-04 a MA-07, tarea 2.1): descargo, responsabilidad, seguridad, README por paquete
// publicable, plantillas de issues e imagen Docker de la demo.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p) => readFileSync(join(RAIZ, ...p), "utf8");

const publicables = readdirSync(join(RAIZ, "packages"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(RAIZ, "packages", d.name, "package.json")))
  .map((d) => d.name)
  .filter((n) => JSON.parse(leer("packages", n, "package.json")).private !== true);

describe("mitigacion-autor", () => {
  it("MA-04 Dockerfile y guía", () => {
    const d = leer("apps", "pwa", "Dockerfile");
    expect(d).toContain("ARG VITE_DEMO=true");
    expect(d).toContain("ENV VITE_DEMO=${VITE_DEMO}");
    expect(d.indexOf("ENV VITE_DEMO")).toBeLessThan(d.indexOf("npm run build -w @lector-cedula/pwa"));
    expect(leer("docs", "despliegue", "README.md")).toContain("VITE_DEMO=false");
  });

  it("MA-05 Secciones presentes en el README raíz", () => {
    const r = leer("README.md");
    for (const t of ["## Descargo de responsabilidad", "## Responsabilidad de quien despliega", "## Uso aceptable", "art. 3", "docs/legal/README.md", "Registraduría", "vigilancia masiva", "sslip.io"]) {
      expect(r, t).toContain(t);
    }
  });

  it("MA-06 Paquetes publicables", () => {
    expect(publicables.length).toBeGreaterThan(0);
    for (const n of publicables) {
      const ruta = join(RAIZ, "packages", n, "README.md");
      expect(existsSync(ruta), `packages/${n}/README.md`).toBe(true);
      const r = readFileSync(ruta, "utf8");
      expect(r, n).toContain("npm install");
      expect(r, n).toContain("https://github.com/jorgeluissanchez/lector-cedula/blob/main/DISCLAIMER.md");
      expect(r, n).toContain("https://github.com/jorgeluissanchez/lector-cedula/blob/main/README.md");
    }
    expect(existsSync(join(RAIZ, "DISCLAIMER.md"))).toBe(true);
  });

  it("MA-06 Política de seguridad", () => {
    const s = leer("SECURITY.md");
    expect(s).toContain("Security Advisories");
    expect(s).toMatch(/no adjuntes? .*datos personales/i);
  });

  it("MA-07 Advertencia en plantillas", () => {
    const dir = join(RAIZ, ".github", "ISSUE_TEMPLATE");
    expect(leer(".github", "ISSUE_TEMPLATE", "config.yml")).toContain("blank_issues_enabled: false");
    const plantillas = readdirSync(dir).filter((f) => f !== "config.yml");
    expect(plantillas.length).toBeGreaterThan(0);
    for (const f of plantillas) expect(readFileSync(join(dir, f), "utf8"), f).toContain("No adjuntes fotos ni datos de documentos reales");
  });
});
