// MOT-18 (motor-backend-embebido, tarea 4.2): THIRD_PARTY_NOTICES dentro de los tarballs npm de @lector-cedula/servidor
// y @lector-cedula/motor con las entradas tesseract, leptonica, zxing y mrz.traineddata. Regenerar con
// `node tools/avisos-motor.mjs`.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { textoAvisosTercerosMotor } from "../avisos-terceros.mjs";

const ejecutar = promisify(execFile);
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const leer = (...r) => readFileSync(join(...r), "utf8");
const PAQUETES = [
  ["@lector-cedula/servidor", join(RAIZ, "packages", "servidor")],
  ["@lector-cedula/motor", join(RAIZ, "packages", "motor")],
];

describe("MOT-18 Avisos del motor en los tarballs npm", { timeout: 60_000 }, () => {
  for (const [nombre, dir] of PAQUETES) {
    it(`MOT-18 ${nombre}: las cuatro entradas de la spec y los textos de licencia`, () => {
      const t = textoAvisosTercerosMotor(nombre);
      expect(t.startsWith(`Avisos de terceros de ${nombre}.`)).toBe(true);
      const minusculas = t.toLowerCase();
      for (const entrada of ["tesseract", "leptonica", "zxing", "mrz.traineddata"]) expect(minusculas, entrada).toContain(entrada);
      for (const s of ["Tesseract OCR (Apache-2.0)", "Copyright (C) 2001-2020 Leptonica", "zxing-cpp (Apache-2.0)", "zxing-wasm 3.1.5 (MIT)", "tesseract-mrz: mrz.traineddata", "jpeg-js 0.4.4 (BSD-3-Clause)", "pngjs 7.0.0 (MIT)", "Eitol/colombian-cedula-reader", "CC BY-SA 4.0"]) {
        expect(t, s).toContain(s);
      }
      expect(t).not.toMatch(/PENDIENTE|Preact|dist\/assets\/lector\.js/u);
    });

    it(`MOT-18 ${nombre}: THIRD_PARTY_NOTICES y LICENSE al día (node tools/avisos-motor.mjs)`, () => {
      expect(leer(dir, "THIRD_PARTY_NOTICES")).toBe(textoAvisosTercerosMotor(nombre));
      expect(leer(dir, "LICENSE")).toBe(leer(RAIZ, "LICENSE"));
      const p = JSON.parse(leer(dir, "package.json"));
      expect(p.files).toEqual(expect.arrayContaining(["LICENSE", "THIRD_PARTY_NOTICES"]));
    });

    it(`MOT-18 Avisos: el tarball de ${nombre} (npm pack --dry-run) contiene THIRD_PARTY_NOTICES y LICENSE`, async () => {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      const r = await ejecutar(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: dir, shell: process.platform === "win32" });
      const lista = JSON.parse(r.stdout)[0].files.map((f) => f.path);
      expect(lista).toContain("THIRD_PARTY_NOTICES");
      expect(lista).toContain("LICENSE");
    });
  }
});
