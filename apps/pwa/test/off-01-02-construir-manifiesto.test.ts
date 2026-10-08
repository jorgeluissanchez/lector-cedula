// OFF-01 y OFF-02 (pwa-lectura-offline, tarea 4.2): construcción pura del manifiesto de precaché.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { construirManifiesto } from "../src/precache/manifiesto";

const sha = (d: Uint8Array) => createHash("sha256").update(d).digest("hex");
const b = (s: string) => new TextEncoder().encode(s);

describe("OFF-01/OFF-02 construirManifiesto", () => {
  it("incluye / con los bytes de index.html, solo rutas precargables, ordenadas, con bytes y sha256", () => {
    const m = construirManifiesto(
      [
        { nombre: "index.html", datos: b("<html>") },
        { nombre: "assets/a-1.js", datos: b("a") },
        { nombre: "sw.js", datos: b("sw") },
        { nombre: "assets/a-1.js.map", datos: b("map") },
        { nombre: "manifest.webmanifest", datos: b("{}") },
        { nombre: "iconos/icono-192.png", datos: b("png") },
        { nombre: "otro/x.js", datos: b("x") },
      ],
      sha,
    );
    expect(m.entradas).toStrictEqual([
      { ruta: "/", bytes: 6, sha256: sha(b("<html>")) },
      { ruta: "/assets/a-1.js", bytes: 1, sha256: sha(b("a")) },
      { ruta: "/iconos/icono-192.png", bytes: 3, sha256: sha(b("png")) },
      { ruta: "/index.html", bytes: 6, sha256: sha(b("<html>")) },
      { ruta: "/manifest.webmanifest", bytes: 2, sha256: sha(b("{}")) },
    ]);
    expect(m.version).toMatch(/^[0-9a-f]{12}$/u);
  });

  it("la versión cambia si cambia cualquier byte y es estable si no", () => {
    const base = [{ nombre: "index.html", datos: b("1") }, { nombre: "manifest.webmanifest", datos: b("m") }];
    const v = construirManifiesto(base, sha).version;
    expect(construirManifiesto(base, sha).version).toBe(v);
    expect(construirManifiesto([{ nombre: "index.html", datos: b("2") }, base[1] ?? base[0]], sha).version).not.toBe(v);
  });

  it("falla si falta index.html o manifest.webmanifest", () => {
    expect(() => construirManifiesto([{ nombre: "index.html", datos: b("1") }], sha)).toThrow("manifest.webmanifest");
    expect(() => construirManifiesto([{ nombre: "manifest.webmanifest", datos: b("1") }], sha)).toThrow("index.html");
  });
});
