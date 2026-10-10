// MOT-23 "Sin disco ni red": el manejador (dist compilado, `tsc -b` en npm run check) procesa éxito, rechazo, 413 y
// cancelación en un proceso hijo con bloquear-escrituras.mjs y bloquear-red.mjs; 0 marcas.
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const hook = (n: string) => pathToFileURL(join(RAIZ, "tools", "test", "ayudas", n)).href;
const DIST = pathToFileURL(join(RAIZ, "packages", "servidor", "dist", "index.js")).href;

const GUION = `
import { crearLectorServidor, ErrorMotor } from ${JSON.stringify(DIST)};
const campos = { nuip: "9999123456", apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ", rh: "AB+" };
const ok = { ok: true, tipoDocumento: "cedula-ciudadania", fuente: "pdf417", campos, warnings: [], confiable: false, riesgo: { nivel: "bajo" } };
const motor = (r, demora = 0) => ({
  async leerDocumento(_i, o) {
    await new Promise((res, rej) => { const t = setTimeout(res, demora); o?.senal?.addEventListener("abort", () => { clearTimeout(t); rej(new ErrorMotor("cancelado")); }); });
    if (r instanceof Error) throw r;
    return r;
  },
  async cerrar() {},
});
const img = new Uint8Array(64).fill(7);
const fd = (c) => { const f = new FormData(); f.set("imagen", new Blob([img]), "f.png"); if (c) f.set("cliente", JSON.stringify(c)); return f; };
const req = (body, init = {}) => new Request("http://localhost/api/cedula", { method: "POST", body, ...init });
let salida = [];
const a = crearLectorServidor({ alConfirmar: () => {}, motor: motor(ok) });
salida.push(await (await a.manejar(req(fd({ tipo: "cedula-ciudadania", campos })))).text());
const b = crearLectorServidor({ alConfirmar: () => {}, motor: motor(new ErrorMotor("motor-ocupado")) });
salida.push(await (await b.manejar(req(fd()))).text());
salida.push((await a.manejar(req(new Uint8Array(10_485_761), { headers: { "content-type": "image/png" } }))).status);
const c = crearLectorServidor({ alConfirmar: () => {}, motor: motor(ok, 2000) });
const ctl = new AbortController();
const r = await c.manejar(req(fd(), { signal: ctl.signal }));
const lec = r.body.getReader(); await lec.read(); ctl.abort(); await lec.cancel().catch(() => {});
process.stdout.write(JSON.stringify(salida));
`;

describe("MOT-23 sin disco ni red", { timeout: 60_000 }, () => {
  it("MOT-23 Sin disco ni red", () => {
    const r = spawnSync(process.execPath, ["--import", hook("bloquear-escrituras.mjs"), "--import", hook("bloquear-red.mjs"), "--input-type=module", "-e", GUION], {
      encoding: "utf8",
      timeout: 50_000,
    });
    expect(r.stderr).not.toContain("ESCRITURA-PROHIBIDA");
    expect(r.stderr).not.toContain("RED-PROHIBIDA");
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout) as [string, string, number];
    expect(salida[0]).toContain('"ok":true');
    expect(salida[1]).toContain('"motivo":"ocupado"');
    expect(salida[2]).toBe(413);
  });
});
