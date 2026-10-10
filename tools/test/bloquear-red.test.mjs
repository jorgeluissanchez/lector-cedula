// MOT-06 y MOT-23: el hook bloquear-red.mjs detecta cada API de red en un proceso hijo con la marca RED-PROHIBIDA.
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const HOOK = join(RAIZ, "tools", "test", "ayudas", "bloquear-red.mjs");
const MARCA = "RED-PROHIBIDA";

function correr(codigo) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(HOOK).href, "--input-type=module", "-e", codigo], { encoding: "utf8", timeout: 30_000 });
  return { estado: r.status, stderr: r.stderr };
}

describe("bloquear-red.mjs", { timeout: 60_000 }, () => {
  it.each([
    ["net.connect", `import net from "node:net"; try { net.connect(80, "127.0.0.1"); } catch {}`],
    ["net.connect (importación con nombre)", `import { connect } from "node:net"; try { connect(80, "127.0.0.1"); } catch {}`],
    ["net.createConnection", `import net from "node:net"; try { net.createConnection(80); } catch {}`],
    ["tls.connect", `import tls from "node:tls"; try { tls.connect(443, "ejemplo.test"); } catch {}`],
    ["http.request", `import http from "node:http"; try { http.request("http://ejemplo.test"); } catch {}`],
    ["http.get", `import http from "node:http"; try { http.get("http://ejemplo.test"); } catch {}`],
    ["https.request", `import https from "node:https"; try { https.request("https://ejemplo.test"); } catch {}`],
    ["https.get", `import { get } from "node:https"; try { get("https://ejemplo.test"); } catch {}`],
    ["fetch", `try { await fetch("https://ejemplo.test"); } catch {}`],
    ["dns.lookup", `import dns from "node:dns"; try { dns.lookup("ejemplo.test", () => {}); } catch {}`],
    ["dns.promises.resolve", `import dns from "node:dns"; try { await dns.promises.resolve("ejemplo.test"); } catch {}`],
  ])("MOT-06 marca %s", (api, codigo) => {
    const { estado, stderr } = correr(codigo);
    expect(estado).toBe(0);
    expect(stderr).toContain(`${MARCA}: ${api.split(" ")[0]}`);
  });

  it("MOT-06 sin red no hay marca", () => {
    const { estado, stderr } = correr(`const x = new Uint8Array(8).fill(1); process.stdout.write(String(x.length));`);
    expect(estado).toBe(0);
    expect(stderr).not.toContain(MARCA);
  });
});
