// despliegue-produccion, DP-08 a DP-10: servicio de Dokploy, variables sin secretos y guía de despliegue.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..");
const leer = (...p) => readFileSync(join(RAIZ, ...p), "utf8");
const compose = () => yaml.load(leer("server", "compose.dokploy.yaml"));
const SECRETAS = ["CLAVES_API_JSON", "SECRETO_SUBIDA", "URL_PUBLICA", "ORIGENES_CORS"];

describe("DP-08 Servicio en Dokploy", () => {
  it("DP-08 Servicio endurecido", () => {
    const c = compose();
    expect(Object.keys(c.services)).toStrictEqual(["api"]);
    const api = c.services.api;
    expect(api.build).toMatchObject({ context: ".", target: "produccion", additional_contexts: { repo_git: "../.git" } });
    expect(api.build.cache_to).toBeUndefined();
    expect(api.read_only).toBe(true);
    expect(api.tmpfs).toHaveLength(1);
    expect(api.tmpfs[0]).toMatch(/^\/tmp:.*size=\d+[mk]/u);
    expect(api.mem_limit).toMatch(/^\d+[mg]$/u);
    expect(api.pids_limit).toBeGreaterThan(0);
    expect(api.cap_drop).toStrictEqual(["ALL"]);
    expect(api.security_opt).toStrictEqual(["no-new-privileges:true"]);
    expect(api.restart).toBe("unless-stopped");
    expect(api.healthcheck.test.join(" ")).toContain("/salud");
    expect(api.expose).toStrictEqual(["8000"]);
    expect(api.ports).toBeUndefined();
    expect(api.volumes).toBeUndefined();
    expect(c.volumes).toBeUndefined();
  });
  it("no sobrescribe el CMD de la imagen (que lleva --no-access-log)", () => {
    expect(compose().services.api.command).toBeUndefined();
    expect(leer("server", "Dockerfile")).toContain("--no-access-log");
  });
});

describe("DP-09 Variables de entorno sin secretos en el repositorio", () => {
  it("DP-09 Variables obligatorias", () => {
    const env = compose().services.api.environment;
    expect(env.LECTOR_LIVE).toBe("node");
    for (const v of SECRETAS) {
      expect(env[v], v).toMatch(/^\$\{/u);
      expect(env[v], v).toContain(":?");
    }
  });
  it("DP-09 Ejemplo sin secretos", () => {
    const texto = leer("server", "dokploy.env.example");
    const valores = Object.fromEntries(
      texto.split(/\r?\n/u).filter((l) => /^[A-Z_]+=/u.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    for (const v of SECRETAS) expect(Object.keys(valores)).toContain(v);
    for (const [k, v] of Object.entries(valores)) {
      expect(v, k).not.toMatch(/sk_|whsec_|[0-9a-f]{64}/iu);
      expect(v === "" || /^<[^>]+>$/u.test(v) || k === "LECTOR_LIVE", k).toBe(true);
    }
  });
});

describe("DP-10 Guía de despliegue", () => {
  it("DP-10 Checklist completo", () => {
    const g = leer("docs", "despliegue", "README.md");
    for (const s of ["docs/legal/", "ORIGENES_CORS", "modo avión", "mode=max", "Analytics", "Speed Insights"]) expect(g, s).toContain(s);
  });
});

describe("SDK-40 Destinos de webhook solo para pruebas", () => {
  it("SDK-40 Nunca en el despliegue", () => {
    for (const archivo of [["server", "compose.dokploy.yaml"], ["server", "dokploy.env.example"]]) {
      const texto = leer(...archivo);
      expect(texto, archivo.join("/")).not.toContain("WEBHOOK_DESTINOS_PRUEBA");
      expect(texto, archivo.join("/")).not.toMatch(/ENTORNO\s*[:=]\s*["']?pruebas/u);
    }
  });

  it("SDK-40 El servicio de Dokploy no define extra_hosts", () => {
    const c = compose();
    for (const [nombre, servicio] of Object.entries(c.services)) expect(servicio.extra_hosts, nombre).toBeUndefined();
    expect(leer("server", "compose.dokploy.yaml")).not.toContain("extra_hosts");
  });

  it("SDK-40 Solo api-pruebas la define, junto a ENTORNO=pruebas", () => {
    const c = yaml.load(leer("server", "compose.yaml"));
    for (const [nombre, servicio] of Object.entries(c.services)) {
      const env = servicio.environment ?? {};
      if (nombre === "api-pruebas") {
        expect(env.ENTORNO).toBe("pruebas");
        expect(env.WEBHOOK_DESTINOS_PRUEBA).toMatch(/^http:\/\/host\.docker\.internal:\d+\//u);
      } else {
        expect(env.WEBHOOK_DESTINOS_PRUEBA, nombre).toBeUndefined();
      }
    }
  });
});
