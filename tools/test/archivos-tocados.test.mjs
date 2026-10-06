import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { archivosTocados } from "../../.claude/hooks/lib.mjs";

const RAIZ = "C:\\repo";
let dir;

function transcripcion(lineas) {
  dir = mkdtempSync(join(tmpdir(), "transcripcion-"));
  const ruta = join(dir, "t.jsonl");
  writeFileSync(ruta, lineas.map((l) => JSON.stringify(l)).join("\n"));
  return ruta;
}

function uso(name, input) {
  return { message: { content: [{ type: "tool_use", name, input }] } };
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("archivosTocados (hooks de Stop con agentes en paralelo)", () => {
  it("recoge las rutas de Edit, Write y MultiEdit relativas a la raíz, sin duplicados (atrapa: correr toda la suite y bloquear por el trabajo de otro agente)", () => {
    const ruta = transcripcion([
      uso("Edit", { file_path: "C:\\repo\\packages\\parsers\\src\\a.ts" }),
      uso("Write", { file_path: "C:\\repo\\tools\\test\\b.test.mjs" }),
      uso("MultiEdit", { file_path: "C:\\repo\\packages\\parsers\\src\\a.ts" }),
      uso("Read", { file_path: "C:\\repo\\packages\\otro.ts" }),
    ]);
    expect(archivosTocados(ruta, RAIZ)).toStrictEqual(["packages/parsers/src/a.ts", "tools/test/b.test.mjs"]);
  });

  it("recoge rutas de código citadas en comandos de shell (atrapa: ediciones hechas con scripts que no pasan por Edit)", () => {
    const ruta = transcripcion([
      uso("Bash", { command: "node script.mjs && sed -i 's/a/b/' packages/parsers/test/x.test.ts evals/runners/m.mjs" }),
    ]);
    expect(archivosTocados(ruta, RAIZ)).toStrictEqual(["packages/parsers/test/x.test.ts", "evals/runners/m.mjs"]);
  });

  it("ignora rutas fuera del repositorio y líneas que no son JSON (atrapa: transcripción parcial que rompe el hook)", () => {
    dir = mkdtempSync(join(tmpdir(), "transcripcion-"));
    const ruta = join(dir, "t.jsonl");
    writeFileSync(ruta, `no es json\n${JSON.stringify(uso("Write", { file_path: "C:\\otra\\x.ts" }))}\n`);
    expect(archivosTocados(ruta, RAIZ)).toStrictEqual([]);
  });

  it("devuelve lista vacía si la transcripción no existe", () => {
    expect(archivosTocados("C:\\no\\existe.jsonl", RAIZ)).toStrictEqual([]);
  });
});
