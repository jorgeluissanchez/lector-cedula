// MOT-17 Sidecar de respaldo (motor-backend-embebido, tarea 4.1): prueba estática de examples/sidecar/compose.yaml.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

interface Servicio {
  readonly ports?: readonly string[];
  readonly read_only?: boolean;
  readonly tmpfs?: readonly string[];
  readonly networks?: readonly string[];
  readonly cap_drop?: readonly string[];
  readonly security_opt?: readonly string[];
  readonly environment?: Record<string, string>;
}
interface Compose {
  readonly services: Record<string, Servicio>;
  readonly networks: Record<string, { readonly internal?: boolean }>;
}

const ruta = fileURLToPath(new URL("../compose.yaml", import.meta.url));
const compose = (): Compose => yaml.load(readFileSync(ruta, "utf8")) as Compose;

describe("MOT-17 Sidecar de respaldo", () => {
  it("MOT-17 Sin puertos públicos: sin ports o solo 127.0.0.1, solo lectura y red interna", () => {
    const c = compose();
    const lector = c.services.lector;
    expect(lector).toBeDefined();
    for (const p of lector?.ports ?? []) expect(p.startsWith("127.0.0.1:"), p).toBe(true);
    expect(lector?.read_only).toBe(true);
    expect(lector?.networks).toStrictEqual(["interna"]);
    expect(c.networks.interna?.internal).toBe(true);
  });

  it("MOT-17 tmpfs sin ejecución y privilegios mínimos", () => {
    const lector = compose().services.lector;
    expect(lector?.tmpfs?.length).toBeGreaterThan(0);
    for (const t of lector?.tmpfs ?? []) expect(t.split(":")[1]?.split(","), t).toContain("noexec");
    expect(lector?.cap_drop).toStrictEqual(["ALL"]);
    expect(lector?.security_opt).toContain("no-new-privileges:true");
  });

  it("MOT-17 docs/sdk/backend.md cubre Node, Java, Go, protocolo, sidecar y Ley 1581", () => {
    const doc = readFileSync(fileURLToPath(new URL("../../../docs/sdk/backend.md", import.meta.url)), "utf8");
    for (const s of ["## Node", "## Java y Go", "## Protocolo", "## Sidecar de respaldo", "Ley 1581 de 2012", "examples/sidecar/compose.yaml", "protocolo.md", "X-Lector-Signature"]) expect(doc, s).toContain(s);
  });

  it("MOT-17 sin secretos en el archivo: las claves llegan por variables obligatorias", () => {
    const texto = readFileSync(ruta, "utf8");
    expect(texto).not.toMatch(/sk_(test|live)_|whsec_/u);
    expect(compose().services.lector?.environment?.CLAVES_API_JSON).toMatch(/^\$\{CLAVES_API_JSON:\?/u);
  });
});
