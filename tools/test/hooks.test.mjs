import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { paquetes, quitarHeredocs } from "../../.claude/hooks/lib.mjs";

const RAIZ = resolve(import.meta.dirname, "..", "..");

function hook(nombre, evento) {
  const r = spawnSync("node", [join(RAIZ, ".claude", "hooks", nombre)], {
    input: JSON.stringify(evento),
    encoding: "utf8",
    cwd: RAIZ,
    env: { ...process.env, CLAUDE_PROJECT_DIR: RAIZ },
    timeout: 120_000,
  });
  return { codigo: r.status, stderr: r.stderr, stdout: r.stdout };
}

describe("paquetes", () => {
  const NPM = /\bnpm\s+(?:i|install|add)\s+([^;&|\n]+)/;
  it("extrae nombres simples y con scope, sin flags", () => {
    expect(paquetes("npm install -D zxing-wasm @capacitor-mlkit/barcode-scanning", NPM)).toEqual([
      "zxing-wasm",
      "@capacitor-mlkit/barcode-scanning",
    ]);
  });
  it("ignora rutas locales y URLs", () => {
    expect(paquetes("npm i ./packages/x file:../y https://x.com/a.tgz", NPM)).toEqual([]);
  });
  it("corta en operadores de la shell", () => {
    expect(paquetes("npm i mrz && npm test", NPM)).toEqual(["mrz"]);
  });
  it("ignora redirecciones de la shell", () => {
    expect(paquetes("npm install -D @playwright/test@latest 2>&1 | tail -1", NPM)).toEqual(["@playwright/test@latest"]);
    expect(paquetes("npm i mrz >log.txt", NPM)).toEqual(["mrz"]);
  });
  it("ignora el texto dentro de un heredoc", () => {
    const cmd = "cat > notas.md <<'EOF'\nUsa npm install ultralytics para nada\nEOF\necho listo";
    expect(paquetes(quitarHeredocs(cmd), NPM)).toEqual([]);
  });
  it("sigue detectando una instalación después de un heredoc", () => {
    const cmd = "cat > a.txt <<EOF\nhola\nEOF\nnpm i mrz";
    expect(paquetes(quitarHeredocs(cmd), NPM)).toEqual(["mrz"]);
  });
  it("detecta npm i en la misma línea que abre el heredoc", () => {
    expect(paquetes(quitarHeredocs("cat <<EOF && npm i ultralytics\nhola\nEOF"), NPM)).toEqual(["ultralytics"]);
  });
  it("un here-string <<< no es heredoc y no oculta las líneas siguientes", () => {
    expect(paquetes(quitarHeredocs('cat <<< "x"\nnpm i ultralytics'), NPM)).toEqual(["ultralytics"]);
  });
  it("un heredoc sin cerrar no oculta instalaciones posteriores", () => {
    expect(paquetes(quitarHeredocs("cat <<EOF\nnunca cierra\nnpm i ultralytics"), NPM)).toEqual(["ultralytics"]);
  });
  it("no detecta npm install sin paquetes", () => {
    expect(paquetes("npm install", NPM)).toEqual([]);
  });
});

describe("pre-bash", () => {
  it("bloquea la instalación de un paquete prohibido", () => {
    const r = hook("pre-bash.mjs", { tool_input: { command: "npm install ultralytics" } });
    expect(r.codigo).toBe(2);
    expect(r.stderr).toMatch(/AGPL/);
  });

  it("bloquea pip install de un paquete prohibido", () => {
    const r = hook("pre-bash.mjs", { tool_input: { command: "pip install fastmrz==2.1.2" } });
    expect(r.codigo).toBe(2);
  });

  it("deja pasar comandos ordinarios", () => {
    expect(hook("pre-bash.mjs", { tool_input: { command: "ls -la" } }).codigo).toBe(0);
  });
});

describe("post-edit", () => {
  it("bloquea un archivo de producto que persiste imágenes en el servidor", () => {
    const dir = join(RAIZ, "server", "app");
    mkdirSync(dir, { recursive: true });
    const archivo = join(dir, "__prueba_hook_tmp.py");
    writeFileSync(archivo, "import cv2\ncv2.imwrite('/tmp/x.jpg', img)\n");
    try {
      const r = hook("post-edit.mjs", { tool_input: { file_path: archivo } });
      expect(r.codigo).toBe(2);
      expect(r.stderr).toMatch(/persistencia de imagen/);
    } finally {
      rmSync(archivo);
    }
  });

  it("ignora archivos fuera del proyecto", () => {
    expect(hook("post-edit.mjs", { tool_input: { file_path: "C:/Windows/win.ini" } }).codigo).toBe(0);
  });
});

describe("stop y subagent-stop", () => {
  it("no insisten si ya bloquearon una vez (evita bucles)", () => {
    expect(hook("stop.mjs", { stop_hook_active: true }).codigo).toBe(0);
    expect(hook("subagent-stop.mjs", { stop_hook_active: true }).codigo).toBe(0);
  });
});
