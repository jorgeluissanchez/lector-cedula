import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { instalaciones, nombreNpm, nombrePip, segmentos } from "../../.claude/hooks/instalaciones.mjs";
import { paquetes, quitarHeredocs } from "../../.claude/hooks/lib.mjs";

const RAIZ = resolve(import.meta.dirname, "..", "..");
// Por debajo del timeout de 60 s de cada describe: si el hook se cuelga, falla la prueba con un motivo claro.
const TIMEOUT_HOOK_MS = 45_000;

function hook(nombre, evento, { raiz = RAIZ } = {}) {
  const r = spawnSync("node", [join(RAIZ, ".claude", "hooks", nombre)], {
    input: JSON.stringify(evento),
    encoding: "utf8",
    cwd: raiz,
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    timeout: TIMEOUT_HOOK_MS,
  });
  return { codigo: r.status, stderr: r.stderr, stdout: r.stdout };
}

const npm = (...nombres) => ({ npm: nombres, pip: [], efimeros: [] });
const pip = (...nombres) => ({ npm: [], pip: nombres, efimeros: [] });
const nada = { npm: [], pip: [], efimeros: [] };

describe("instalaciones (I6: tokenizado en lugar de una sola regex)", () => {
  it.each([
    ["npm --prefix . install ultralytics", npm("ultralytics")],
    ["NPM install ultralytics", npm("ultralytics")],
    ["npm.cmd i ultralytics", npm("ultralytics")],
    ["C:\\nodejs\\npm.cmd install ultralytics", npm("ultralytics")],
    ["npm -g i ultralytics", npm("ultralytics")],
    ["npm i -D ultralytics", npm("ultralytics")],
    ["npm --registry https://r.example i ultralytics", npm("ultralytics")],
    ["npm install -w packages/parsers zod", npm("zod")],
    ["pnpm add ultralytics", npm("ultralytics")],
    ["yarn add ultralytics", npm("ultralytics")],
    ["yarn global add ultralytics", npm("ultralytics")],
    ["bun add ultralytics", npm("ultralytics")],
    ["pip3 install fastmrz", pip("fastmrz")],
    ["pip3.12 install -r req.txt fastmrz", pip("fastmrz")],
    ["python -m pip install fastmrz", pip("fastmrz")],
    ["py -3 -m pip install fastmrz", pip("fastmrz")],
    ["uv pip install fastmrz", pip("fastmrz")],
    ["uv add fastmrz", pip("fastmrz")],
    ["sudo -H pip3 install fastmrz", pip("fastmrz")],
  ])("`%s`", (comando, esperado) => {
    expect(instalaciones(comando)).toStrictEqual(esperado);
  });

  it.each([
    ["npx --yes ultralytics", "ultralytics"],
    ["npx -y ultralytics@8 --help", "ultralytics@8"],
    ["npx -p ultralytics yolo", "ultralytics"],
    ["npm exec --package=ultralytics -- yolo", "ultralytics"],
    ["pnpm dlx ultralytics", "ultralytics"],
    ["bunx ultralytics", "ultralytics"],
  ])("ejecutor efímero `%s`: solo lista negra, sin consultar el registro", (comando, nombre) => {
    expect(instalaciones(comando).efimeros[0]).toStrictEqual({ tipo: "npm", nombre });
    expect(instalaciones(comando).npm).toStrictEqual([]);
  });

  it("uvx es un ejecutor efímero de Python", () => {
    expect(instalaciones("uvx fastmrz")).toStrictEqual({ npm: [], pip: [], efimeros: [{ tipo: "pip", nombre: "fastmrz" }] });
  });

  it.each([
    ["separadores ; && || | y salto de línea", "ls; npm test && npm i a || pnpm add b | cat\nyarn add c"],
    ["& de PowerShell y de segundo plano", "& npm i a & pnpm add b & yarn add c"],
  ])("separa segmentos: %s", (_, comando) => {
    expect(instalaciones(comando).npm).toStrictEqual(["a", "b", "c"]);
  });

  it.each([
    ["npm test"],
    ["npm run check"],
    ["npm ls ultralytics"],
    ["npm run install"],
    ["npm install"],
    ["npx vitest run tools/test"],
    ['git commit -m "echo npm install ultralytics"'],
    ["git commit -m 'feat: npm i ultralytics; pnpm add fastmrz'"],
    ["echo npm install ultralytics"],
    ["# npm install ultralytics"],
    ['grep -r "pip install fastmrz" docs'],
    ["pip download fastmrz"],
  ])("no es instalación: `%s`", (comando) => {
    const r = instalaciones(comando);
    expect([...r.npm, ...r.pip]).toStrictEqual([]);
    expect(r.efimeros.filter((e) => /ultralytics|fastmrz/.test(e.nombre))).toStrictEqual([]);
  });

  it.each([
    ["bash -c", 'bash -c "npm i ultralytics"'],
    ["sh -lc", "sh -lc 'npm i ultralytics'"],
    ["eval", 'eval "npm i ultralytics"'],
    ["cmd /c", "cmd /c npm i ultralytics"],
    ["powershell -Command", 'powershell -Command "npm i ultralytics"'],
    ["powershell -EncodedCommand", `pwsh -enc ${Buffer.from("npm i ultralytics", "utf16le").toString("base64")}`],
    ["$( ) sin comillas", "echo $(npm i ultralytics)"],
    ["$( ) entre comillas dobles", 'echo "$(npm i ultralytics)"'],
    ["comillas invertidas", "echo `npm i ultralytics`"],
    ["comillas partiendo el gestor", '"np"m i ultralytics'],
    ["barra invertida de bash dentro del gestor", "n\\pm i ultralytics"],
    ["ruta de Windows con espacios entre comillas", '"C:\\Program Files\\nodejs\\npm.cmd" i ultralytics'],
    ["$'...'", "$'npm' i ultralytics"],
    ["variable de entorno delante", "CI=1 npm i ultralytics"],
    ["envoltorio env", "env CI=1 npm i ultralytics"],
    ["envoltorio timeout", "timeout 60 npm i ultralytics"],
    ["npx que lanza npm", "npx npm install ultralytics"],
    ["continuación de línea", "npm \\\n  install ultralytics"],
    ["redirección antes del verbo", "npm 2>&1 install ultralytics"],
  ])("no se evade con %s", (_, comando) => {
    expect(instalaciones(comando).npm).toContain("ultralytics");
  });

  it("ignora redirecciones y su destino", () => {
    expect(instalaciones("npm install -D @playwright/test@latest 2>&1 | tail -1").npm).toStrictEqual(["@playwright/test@latest"]);
    expect(instalaciones("npm i mrz >log.txt &> otro.txt").npm).toStrictEqual(["mrz"]);
  });

  it("tras quitarHeredocs, el cuerpo del heredoc no cuenta y la línea que lo abre sí", () => {
    expect(instalaciones(quitarHeredocs("cat > n.md <<'EOF'\nnpm install ultralytics\nEOF\necho ok"))).toStrictEqual(nada);
    expect(instalaciones(quitarHeredocs("cat <<EOF && npm i ultralytics\nhola\nEOF")).npm).toStrictEqual(["ultralytics"]);
  });

  it("segmentos respeta comillas y descarta comentarios", () => {
    expect(segmentos("git commit -m \"a; b\" && npm test # npm i x")).toStrictEqual([
      ["git", "commit", "-m", "a; b"],
      ["npm", "test"],
    ]);
  });

  it("nombrePip normaliza (PEP 503) y quita extras y versión; nombreNpm quita la versión", () => {
    expect(nombrePip("Fast_MRZ[cli]>=2")).toBe("fast-mrz");
    expect(nombrePip("FastMRZ==2.1.2")).toBe("fastmrz");
    expect(nombreNpm("@scope/x@1.2")).toBe("@scope/x");
    expect(nombreNpm("@scope/x")).toBe("@scope/x");
    expect(nombreNpm("ultralytics@latest")).toBe("ultralytics");
  });
});

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

describe("pre-bash", { timeout: 60_000 }, () => {
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

describe("pre-bash: variantes de instalación (I6, atrapa: evadir licencia-check cambiando la forma del comando)", { timeout: 60_000 }, () => {
  it.each([
    "npm --prefix . install ultralytics",
    "NPM install ultralytics",
    "npm.cmd i ultralytics",
    "npm -g i ultralytics",
    "npm i -D ultralytics",
    "pnpm add ultralytics",
    "yarn add ultralytics",
    "bun add ultralytics",
    "npx --yes ultralytics",
    "pip3 install fastmrz",
    "python -m pip install fastmrz",
    "uv pip install fastmrz",
  ])("bloquea `%s`", (command) => {
    const r = hook("pre-bash.mjs", { tool_input: { command } });
    expect(r.codigo).toBe(2);
    expect(r.stderr).toMatch(/AGPL/);
  });

  it.each(["npm test", "npm run check", "npm ls ultralytics", "npx vitest --version", "echo npm install ultralytics"])(
    "deja pasar `%s`",
    (command) => {
      const r = hook("pre-bash.mjs", { tool_input: { command } });
      expect(r.stderr).toBe("");
      expect(r.codigo).toBe(0);
    },
  );
});

describe("post-edit", { timeout: 60_000 }, () => {
  it("bloquea un archivo de producto que persiste imágenes en el servidor (I7: en un proyecto temporal, no en el repo)", () => {
    const proyecto = mkdtempSync(join(tmpdir(), "hook-post-edit-"));
    try {
      const dir = join(proyecto, "server", "app");
      mkdirSync(dir, { recursive: true });
      const archivo = join(dir, `prueba_${process.pid}_${Date.now()}.py`);
      writeFileSync(archivo, "import cv2\ncv2.imwrite('/tmp/x.jpg', img)\n");
      const r = hook("post-edit.mjs", { tool_input: { file_path: archivo } }, { raiz: proyecto });
      expect(r.codigo).toBe(2);
      expect(r.stderr).toMatch(/persistencia de imagen/);
    } finally {
      rmSync(proyecto, { recursive: true, force: true });
    }
  });

  it("ignora archivos fuera del proyecto", () => {
    expect(hook("post-edit.mjs", { tool_input: { file_path: "C:/Windows/win.ini" } }).codigo).toBe(0);
  });
});

describe("stop y subagent-stop", { timeout: 60_000 }, () => {
  it("no insisten si ya bloquearon una vez (evita bucles)", () => {
    expect(hook("stop.mjs", { stop_hook_active: true }).codigo).toBe(0);
    expect(hook("subagent-stop.mjs", { stop_hook_active: true }).codigo).toBe(0);
  });
});
