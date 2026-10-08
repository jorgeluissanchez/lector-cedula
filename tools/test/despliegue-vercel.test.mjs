// despliegue-produccion, DP-01 a DP-06: vercel.json contra la spec.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CSP, cabecerasPara, leerVercel, validarVercel } from "../despliegue/vercel.mjs";

const RAIZ = join(import.meta.dirname, "..", "..");
const config = () => leerVercel(join(RAIZ, "vercel.json"));
const conCambio = (f) => {
  const c = structuredClone(config());
  f(c);
  return c;
};
const SEGURIDAD = {
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};
const reglaGlobal = (c) => c.headers.find((h) => h.source === "/(.*)");
const fijarCsp = (c, v) => {
  reglaGlobal(c).headers.find((h) => h.key === "Content-Security-Policy").value = v;
};

describe("DP-01 Compilación en Vercel", () => {
  it("DP-01 Comandos de compilación", () => {
    const c = config();
    expect(validarVercel(c)).toStrictEqual([]);
    expect(c.buildCommand.startsWith("npm run modelos:mrz && ")).toBe(true);
    expect(c).toMatchObject({
      framework: null,
      installCommand: "npm ci",
      buildCommand: "npm run modelos:mrz && npx tsc -b packages/parsers && npm run build -w @lector-cedula/pwa",
      outputDirectory: "apps/pwa/dist",
    });
  });
  it("DP-01 Compilación sin modelo verificado", () => {
    const c = conCambio((x) => { x.buildCommand = "npm run build -w @lector-cedula/pwa"; });
    expect(validarVercel(c).some((e) => e.includes("DP-01"))).toBe(true);
  });
});

describe("DP-02 Content-Security-Policy estricta", () => {
  it("la CSP es el literal de la spec", () => {
    expect(CSP).toBe(
      "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    );
  });
  it("DP-02 CSP en la raíz y en un recurso", () => {
    for (const ruta of ["/", "/assets/index-abc123.js"]) expect(cabecerasPara(config(), ruta)["Content-Security-Policy"]).toBe(CSP);
  });
  it.each(["https://cdn.jsdelivr.net", "'unsafe-inline'", "'unsafe-eval'", "blob:", "data:", "*"])("DP-02 CSP con un tercero: %s", (extra) => {
    const c = conCambio((x) => fijarCsp(x, CSP.replace("script-src 'self'", `script-src 'self' ${extra}`)));
    expect(validarVercel(c).some((e) => e.includes("DP-02"))).toBe(true);
  });
});

describe("DP-03 Cabeceras de seguridad", () => {
  it("DP-03 Cabeceras de seguridad en cualquier ruta", () => {
    const h = cabecerasPara(config(), "/manifest.webmanifest");
    expect(h).toMatchObject(SEGURIDAD);
    expect(Object.keys(h).map((k) => k.toLowerCase())).not.toContain("service-worker-allowed");
  });
  it("una cabecera de seguridad ausente es error", () => {
    const c = conCambio((x) => { reglaGlobal(x).headers = reglaGlobal(x).headers.filter((h) => h.key !== "Referrer-Policy"); });
    expect(validarVercel(c).some((e) => e.includes("DP-03"))).toBe(true);
  });
  it("Service-Worker-Allowed es error", () => {
    const c = conCambio((x) => { reglaGlobal(x).headers.push({ key: "Service-Worker-Allowed", value: "/" }); });
    expect(validarVercel(c).some((e) => e.includes("DP-03"))).toBe(true);
  });
});

describe("DP-04 Caché", () => {
  it.each(["/", "/index.html", "/sw.js", "/manifest.webmanifest"])("DP-04 sin caché: %s", (ruta) => {
    expect(cabecerasPara(config(), ruta)["Cache-Control"]).toBe("no-cache");
  });
  it("DP-04 Recurso con hash inmutable", () => {
    expect(cabecerasPara(config(), "/assets/mrz-abc123.traineddata")["Cache-Control"]).toBe("public, max-age=31536000, immutable");
  });
  it("sw.js cacheable es error", () => {
    const c = conCambio((x) => { x.headers = x.headers.filter((h) => h.source !== "/sw.js"); });
    expect(validarVercel(c).some((e) => e.includes("DP-04"))).toBe(true);
  });
});

describe("DP-05 Tipos MIME", () => {
  it("DP-05 Wasm y modelo", () => {
    expect(cabecerasPara(config(), "/assets/zxing_reader-abc.wasm")["Content-Type"]).toBe("application/wasm");
    expect(cabecerasPara(config(), "/assets/mrz-abc.traineddata")["Content-Type"]).toBe("application/octet-stream");
    expect(cabecerasPara(config(), "/assets/index-abc.js")["Content-Type"]).toBeUndefined();
  });
});

describe("DP-06 Sin analítica ni telemetría", () => {
  it.each(["analytics", "speedInsights"])("DP-06 Clave de analítica: %s", (clave) => {
    const c = conCambio((x) => { x[clave] = { enabled: true }; });
    expect(validarVercel(c).some((e) => e.includes("DP-06"))).toBe(true);
  });
  const dist = join(RAIZ, "apps", "pwa", "dist");
  it.skipIf(!existsSync(dist))("DP-06 Build limpio", () => {
    const hallazgos = [];
    const recorrer = (d) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) recorrer(p);
        else {
          const t = readFileSync(p, "latin1");
          for (const s of ["_vercel/insights", "_vercel/speed-insights", "va.vercel-scripts.com"]) if (t.includes(s)) hallazgos.push(`${n}: ${s}`);
        }
      }
    };
    recorrer(dist);
    expect(hallazgos).toStrictEqual([]);
  });
});

describe("emulador de source", () => {
  it("sintaxis de source fuera del subconjunto es error", () => {
    const c = conCambio((x) => { x.headers.push({ source: "/:ruta*", headers: [] }); });
    expect(validarVercel(c).some((e) => e.includes("source"))).toBe(true);
  });
  it("la última regla gana y la consulta no cuenta", () => {
    const c = { headers: [{ source: "/(.*)", headers: [{ key: "A", value: "1" }] }, { source: "/x.js", headers: [{ key: "A", value: "2" }] }] };
    expect(cabecerasPara(c, "/x.js?/y")).toStrictEqual({ A: "2" });
    expect(cabecerasPara(c, "/y.js")).toStrictEqual({ A: "1" });
  });
});
