// SDK-26 y SDK-24 (sdk-integracion): licencias y avisos de terceros dentro del tarball de @lector-cedula/web.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { textoAvisosTercerosPwa, textoAvisosTercerosWeb } from "../avisos-terceros.mjs";

const ejecutar = promisify(execFile);
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const WEB = join(RAIZ, "packages", "web");
const leer = (...r) => readFileSync(join(...r), "utf8");

describe("SDK-26 Avisos de terceros completos del SDK", () => {
  const t = textoAvisosTercerosWeb();

  it("SDK-26 contiene los textos completos de cada componente redistribuido", () => {
    for (const s of [
      "@lector-cedula/web",
      "MIT",
      "zxing-wasm 3.1.5 (MIT)",
      "Copyright 2016 Nu-book Inc.",
      "tesseract.js 7.0.0 (Apache-2.0)",
      "tesseract.js-core (Apache-2.0)",
      "Apache License",
      "Version 2.0, January 2004",
      "Tesseract OCR (Apache-2.0)",
      "Copyright (C) 2001-2020 Leptonica",
      "zlib",
      "Jean-loup Gailly",
      "Copyright (c) 2019, DoubangoTelecom",
      "DoubangoTelecom/tesseractMRZ",
      "Redistribution and use in source and binary forms",
      "Eitol/colombian-cedula-reader",
      "Copyright (c) Hector Oliveros",
      "jpeg-js 0.4.4 (BSD-3-Clause)",
      "pngjs 7.0.0 (MIT)",
    ]) {
      expect(t, s).toContain(s);
    }
    expect(t).toContain(leer(RAIZ, "node_modules", "jpeg-js", "LICENSE").trim());
    expect(t).toContain(leer(RAIZ, "node_modules", "pngjs", "LICENSE").trim());
    expect(t).not.toMatch(/PENDIENTE/i);
  });

  it("SDK-26 atribución CC BY-SA 4.0 completa de Divipole Exterior 2018", () => {
    for (const s of [
      "Registraduría Nacional del Estado Civil",
      "Divipole Exterior Presidente 2018",
      "vh8b-jfhg",
      "CC BY-SA 4.0",
      "https://creativecommons.org/licenses/by-sa/4.0/legalcode.es",
      "Cambios:",
      "AZERBAIYAN",
      "tal cual",
      "sin aval",
    ]) {
      expect(t, s).toContain(s);
    }
  });

  it("SDK-26 no nombra componentes que no van en el paquete", () => {
    expect(t).not.toContain("Preact");
    expect(t).not.toContain("gdxc-w37w");
  });

  it("SDK-26 la PWA conserva sus avisos (Preact y mrz) desde el mismo módulo", () => {
    const p = textoAvisosTercerosPwa();
    for (const s of ["Avisos de terceros de Lector de cédula (PWA)", "Preact (MIT)", "mrz 5.0.2 (MIT)", "Copyright (c) 2019, DoubangoTelecom"]) expect(p, s).toContain(s);
  });
});

describe("SDK-26 y SDK-24 licencias dentro del tarball", { timeout: 60_000 }, () => {
  it("SDK-26 LICENSE del paquete es idéntico al MIT de la raíz", () => {
    expect(leer(WEB, "LICENSE")).toBe(leer(RAIZ, "LICENSE"));
  });

  it("SDK-26 THIRD_PARTY_LICENSES.txt del paquete y de dist/assets coinciden con el generador y están en el manifiesto", () => {
    const esperado = textoAvisosTercerosWeb();
    expect(leer(WEB, "THIRD_PARTY_LICENSES.txt")).toBe(esperado);
    const enAssets = readFileSync(join(WEB, "dist", "assets", "THIRD_PARTY_LICENSES.txt"));
    expect(enAssets.toString("utf8")).toBe(esperado);
    const m = JSON.parse(leer(WEB, "dist", "assets", "manifest.json"));
    const e = m.recursos.find((r) => r.archivo === "THIRD_PARTY_LICENSES.txt");
    expect(e).toBeDefined();
    expect(e.sha256).toBe(createHash("sha256").update(enAssets).digest("hex"));
    expect(e.tipo).toBe("text/plain");
  });

  it("SDK-26 package.json con los avisos en files y licencia MIT", () => {
    const p = JSON.parse(leer(WEB, "package.json"));
    expect(p.files).toEqual(expect.arrayContaining(["LICENSE", "THIRD_PARTY_LICENSES.txt"]));
    expect(p.license).toBe("MIT");
  });

  it("SDK-26 Licencias dentro del tarball y SDK-24 sin dist/.tsbuildinfo (npm pack --dry-run)", async () => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const r = await ejecutar(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: WEB, shell: process.platform === "win32" });
    const lista = JSON.parse(r.stdout)[0].files.map((f) => f.path);
    expect(lista).toContain("LICENSE");
    expect(lista).toContain("THIRD_PARTY_LICENSES.txt");
    expect(lista).toContain("dist/assets/THIRD_PARTY_LICENSES.txt");
    expect(lista.some((f) => f.endsWith(".tsbuildinfo"))).toBe(false);
  });
});
