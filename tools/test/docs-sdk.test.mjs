// Documentación del SDK (sdk-integracion B.8 y 5.3: SDK-22, SDK-25, SDK-52; motor-backend-embebido: protocolo).
// Análisis estático: guías presentes, bloques marcados idénticos a examples/, nombres importados de @lector-cedula/*
// existentes en los exports reales de los paquetes, orden del README y modelo de amenazas T1 a T7 con IDs.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOCS = join(RAIZ, "docs", "sdk");
const leer = (...p) => readFileSync(join(RAIZ, ...p), "utf8");
const guias = readdirSync(DOCS).filter((f) => f.endsWith(".md"));
const textos = Object.fromEntries(guias.map((f) => [f, readFileSync(join(DOCS, f), "utf8")]));

const REQUERIDAS = [
  // Pedidas por la tarea.
  "README.md", "inicio-rapido.md", "react.md", "next.md", "angular.md", "vue.md", "vanilla.md", "ionic.md", "react-native.md",
  "backend-express.md", "backend-nest.md", "backend-next.md", "backend-fastify.md", "backend-java.md", "backend-go.md",
  "protocolo.md", "modo-microservicio.md", "personalizacion.md",
  // SDK-25 "Guías completas" y SDK-22.
  "html.md", "express.md", "nest.md", "fastify.md", "nativo.md", "modelo-amenazas.md",
];

/** Bloques de código: { lang, cuerpo, marca (ruta de `<!-- ejemplo: ... -->` justo antes) }. */
function bloques(md) {
  const r = [];
  const re = /(?:<!-- ejemplo: (\S+) -->\n)?```(\w*)\n([\s\S]*?)```/g;
  for (let m = re.exec(md); m !== null; m = re.exec(md)) r.push({ marca: m[1] ?? null, lang: m[2], cuerpo: m[3] });
  return r;
}

// ---- Exports reales de los paquetes, leídos del código fuente (sin compilar) ----
const cacheArchivo = new Map();

function nombresDeArchivo(ruta) {
  if (cacheArchivo.has(ruta)) return cacheArchivo.get(ruta);
  const nombres = new Set();
  cacheArchivo.set(ruta, nombres);
  const src = readFileSync(ruta, "utf8");
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g)) nombres.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*["']([^"']+)["'])?/g)) {
    for (const parte of m[1].split(",")) {
      const limpia = parte.replace(/^\s*type\s+/, "").trim();
      if (limpia === "") continue;
      const alias = limpia.split(/\s+as\s+/);
      nombres.add((alias[1] ?? alias[0]).trim());
    }
  }
  for (const m of src.matchAll(/export\s+(?:type\s+)?\*\s+from\s*["']([^"']+)["']/g)) {
    const destino = resolverModulo(ruta, m[1]);
    if (destino !== null) for (const n of nombresDeArchivo(destino)) nombres.add(n);
  }
  return nombres;
}

function resolverModulo(desde, especificador) {
  if (!especificador.startsWith(".")) return null;
  const base = join(dirname(desde), especificador).replace(/\.js$/, "");
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}

/** `@lector-cedula/<pkg>[/sub]` -> archivo fuente según el campo `exports` de su package.json. */
function entradaDe(especificador) {
  const m = /^@lector-cedula\/([^/]+)(?:\/(.+))?$/.exec(especificador);
  if (m === null) return null;
  const dir = join(RAIZ, "packages", m[1]);
  if (!existsSync(join(dir, "package.json"))) return null;
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const clave = m[2] === undefined ? "." : `./${m[2]}`;
  const exp = pkg.exports?.[clave];
  const destino = typeof exp === "string" ? exp : exp?.default;
  if (typeof destino !== "string") return null;
  const src = join(dir, destino.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts"));
  return existsSync(src) ? src : null;
}

/** Imports con nombre de `@lector-cedula/*` en un bloque: [{ especificador, nombres }]. */
function importsDe(codigo) {
  const r = [];
  for (const m of codigo.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'](@lector-cedula\/[^"']+)["']/g)) {
    const nombres = m[1]
      .split(",")
      .map((p) => p.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim())
      .filter((n) => n !== "");
    r.push({ especificador: m[2], nombres });
  }
  return r;
}

const bloquesTs = guias.flatMap((f) => bloques(textos[f]).filter((b) => ["ts", "tsx", "js", "mjs", "vue"].includes(b.lang)).map((b) => ({ ...b, guia: f })));

describe("docs/sdk", () => {
  it("SDK-25 guías completas", () => {
    for (const f of REQUERIDAS) expect(guias, f).toContain(f);
  });

  it("SDK-25 bloques marcados idénticos a examples/", () => {
    const marcados = bloquesTs.filter((b) => b.marca !== null);
    expect(marcados.length).toBeGreaterThanOrEqual(8);
    for (const b of marcados) {
      const ruta = join(RAIZ, b.marca);
      expect(existsSync(ruta), `${b.guia}: ${b.marca}`).toBe(true);
      const archivo = readFileSync(ruta, "utf8");
      expect(b.cuerpo, `${b.guia}: ${b.marca}`).toBe(archivo.endsWith("\n") ? archivo : `${archivo}\n`);
    }
  });

  it("los nombres importados de @lector-cedula/* existen en los exports de los paquetes", () => {
    let total = 0;
    for (const b of bloquesTs) {
      for (const { especificador, nombres } of importsDe(b.cuerpo)) {
        const entrada = entradaDe(especificador);
        expect(entrada, `${b.guia}: ${especificador} no es una entrada de paquete`).not.toBeNull();
        const exportados = nombresDeArchivo(entrada);
        for (const n of nombres) {
          total++;
          expect(exportados.has(n), `${b.guia}: ${n} no lo exporta ${especificador}`).toBe(true);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(15);
  });

  it("el extractor de exports detecta un nombre inventado", () => {
    const exportados = nombresDeArchivo(entradaDe("@lector-cedula/web"));
    for (const n of ["crearLector", "precargarMotor", "leerDocumento", "decidirFront", "EstadoLector", "OpcionesLector"]) expect(exportados.has(n), n).toBe(true);
    expect(exportados.has("crearLectorInventado")).toBe(false);
    expect(nombresDeArchivo(entradaDe("@lector-cedula/servidor")).has("MotivoRechazoLector")).toBe(true);
    expect(nombresDeArchivo(entradaDe("@lector-cedula/servidor")).has("MotivoRechazo")).toBe(true);
    expect(entradaDe("@lector-cedula/servidor/express")).not.toBeNull();
    expect(entradaDe("@lector-cedula/web/sw")).not.toBeNull();
    expect(entradaDe("@lector-cedula/no-existe")).toBeNull();
  });

  it("SDK-52 el backend propio va antes que el modo opcional microservicio", () => {
    const r = textos["README.md"];
    const propio = r.indexOf("## Arquitectura: front + backend propio");
    const micro = r.indexOf("## Modo opcional: microservicio");
    expect(propio).toBeGreaterThan(-1);
    expect(micro).toBeGreaterThan(propio);
    for (const t of ['"front"', '"back"', '"front-back"', '"estricta"', '"auto"', "streaming", "## Garantías de privacidad", "## Descargo de responsabilidad", "Ley 1581"]) expect(r, t).toContain(t);
  });

  it("protocolo.md documenta todos los motivos de rechazo y etapas reales", async () => {
    const p = textos["protocolo.md"];
    const fuente = leer("packages", "protocolo", "src", "index.ts");
    const lista = (nombre) => [...new RegExp(`${nombre} = \\[([\\s\\S]*?)\\]`).exec(fuente)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const motivos = lista("MOTIVOS_RECHAZO");
    expect(motivos.length).toBe(9);
    for (const m of motivos) expect(p, m).toContain(`\`${m}\``);
    for (const e of lista("ETAPAS_INTERMEDIAS")) expect(p, e).toContain(`\`${e}\``);
  });

  it("SDK-22 modelo de amenazas con secciones y T1 a T7 con IDs existentes", () => {
    const m = textos["modelo-amenazas.md"];
    for (const s of ["## Activos", "## Fronteras de confianza", "## Amenazas", "## Mitigaciones"]) expect(m, s).toContain(s);
    const ids = new Set([
      ...leer("openspec", "changes", "sdk-integracion", "specs", "sdk-integracion", "spec.md").matchAll(/### Requirement: (SDK-\d{2})/g),
      ...leer("openspec", "specs", "api-validaciones", "spec.md").matchAll(/### Requirement: (AV-\d{2})/g),
    ].map((x) => x[1]));
    const esperadas = { T1: "manipulación en el cliente", T2: "repetición de webhook", T3: "robo del token", T4: "redirect abierto", T5: "clave en el navegador", T6: "suplantación de origen", T7: "cámara inyectada" };
    for (const [t, nombre] of Object.entries(esperadas)) {
      const linea = m.split("\n").find((l) => l.includes(`${t} ${nombre}`));
      expect(linea, t).toBeDefined();
      const citados = [...linea.matchAll(/(?:SDK|AV)-\d{2}/g)].map((x) => x[0]);
      expect(citados.length, t).toBeGreaterThan(0);
      for (const c of citados) expect(ids.has(c), `${t}: ${c}`).toBe(true);
    }
  });

  it("SDK-22 los ejemplos no envían detail.campos desde el cliente", () => {
    const archivos = [];
    const recorrer = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (["node_modules", "dist", ".next", "public"].includes(e.name)) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (/\.(ts|tsx|vue|mjs|js|html)$/.test(e.name)) archivos.push(p);
      }
    };
    for (const d of ["react", "angular", "vue", "next", "vanilla"]) if (existsSync(join(RAIZ, "examples", d))) recorrer(join(RAIZ, "examples", d));
    expect(archivos.length).toBeGreaterThan(0);
    for (const a of archivos) expect(/detail\.campos/.test(readFileSync(a, "utf8")), a).toBe(false);
  });

  it("las funciones aún inexistentes se marcan (planeado) y el README raíz enlaza docs/sdk", () => {
    expect(textos["react-native.md"]).toContain("(planeado)");
    expect(textos["personalizacion.md"]).toContain("estado.guiaEnPantalla");
    expect(textos["personalizacion.md"]).toMatch(/\(planeado\) en `@lector-cedula\/elementos`/);
    expect(textos["backend-java.md"]).toContain("(planeado)");
    expect(textos["backend-go.md"]).toContain("(planeado)");
    expect(leer("README.md")).toContain("docs/sdk/README.md");
    for (const t of Object.values(textos)) expect(t).not.toMatch(/sk_(?:test|live)_[A-Za-z0-9]{8,}/);
  });
});
