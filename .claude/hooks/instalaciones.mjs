// Detección de instalaciones de paquetes en un comando de shell (Bash o PowerShell) para el hook pre-bash.
//
// En lugar de una sola regex, el comando se tokeniza respetando comillas y se parte en segmentos por
// `;`, `&&`, `||`, `|`, `&`, `(`, `)` y saltos de línea. En cada segmento se busca un gestor de paquetes
// (insensible a mayúsculas, con o sin ruta y extensión .cmd/.exe) y su verbo de instalación, admitiendo
// banderas antes del verbo (`npm --prefix . install`, `npm -g i`).
//
// Es una barrera contra errores y atajos, no un sandbox: variables (`p=npm; $p i x`), scripts intermedios
// o alias no se resuelven. Sí se analizan el contenido de `$( )`, de las comillas invertidas y de
// `bash -c`, `sh -c`, `eval`, `cmd /c`, `powershell -Command` y `-EncodedCommand`.
//
// Decisión sobre ejecutores efímeros (npx, npm exec, pnpm dlx, yarn dlx, bunx, uvx, pipx run): no añaden
// una dependencia al proyecto (npx guarda el paquete en la caché `_npx`, no en package.json ni en
// node_modules), así que no se consulta la licencia en el registro (eso haría depender `npx tsc` de la red).
// Pero sí ejecutan el código del paquete, así que su nombre se contrasta con la lista negra, sin red.

const PROFUNDIDAD_MAXIMA = 4;

/** Verbos (secuencias de palabras) que instalan y que ejecutan de forma efímera, por gestor. */
const GESTORES = {
  npm: {
    tipo: "npm",
    instalar: [
      "install", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall",
      "add", "install-test", "it", "update", "up", "upgrade", "udpate", "link", "ln",
    ].map((v) => [v]),
    efimero: [["exec"], ["x"]],
  },
  pnpm: {
    tipo: "npm",
    instalar: ["add", "install", "i", "update", "up", "upgrade", "link", "ln"].map((v) => [v]),
    efimero: [["dlx"]],
  },
  yarn: {
    tipo: "npm",
    instalar: [["add"], ["upgrade"], ["up"], ["link"], ["global", "add"], ["global", "upgrade"]],
    efimero: [["dlx"]],
  },
  bun: {
    tipo: "npm",
    instalar: ["add", "a", "install", "i", "update", "link"].map((v) => [v]),
    efimero: [["x"]],
  },
  pip: { tipo: "pip", instalar: [["install"]], efimero: [] },
  uv: { tipo: "pip", instalar: [["add"], ["pip", "install"], ["tool", "install"]], efimero: [["tool", "run"]] },
  pipx: { tipo: "pip", instalar: [["install"], ["inject"]], efimero: [["run"]] },
  poetry: { tipo: "pip", instalar: [["add"]], efimero: [] },
  pdm: { tipo: "pip", instalar: [["add"]], efimero: [] },
};

/** Ejecutables que son directamente un ejecutor efímero. */
const EFIMEROS = { npx: "npm", pnpx: "npm", bunx: "npm", uvx: "pip" };

/** Banderas de instalación cuyo valor no es un paquete (se descarta la palabra siguiente). */
const VALOR_NO_PAQUETE = new Set([
  "-w", "--workspace", "--prefix", "--registry", "--tag", "--omit", "--include", "--cache", "--userconfig",
  "--install-strategy", "-C", "--dir", "--filter", "--cwd",
  "-r", "--requirement", "-c", "--constraint", "-e", "--editable", "-i", "--index-url", "--extra-index-url",
  "-t", "--target", "--root", "-f", "--find-links", "--python-version", "--platform", "--implementation",
  "--abi", "--src", "--python", "--group", "-G", "--optional", "--extra", "--index",
]);

/** Banderas de los ejecutores efímeros cuyo valor es un paquete. */
const VALOR_PAQUETE = new Set(["-p", "--package", "--from", "--with", "--spec"]);

/** Comandos que solo imprimen sus argumentos: lo que sigue no se ejecuta. */
const SOLO_IMPRIMEN = new Set(["echo", "printf", "write-host", "write-output"]);

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);

/**
 * Caracteres que una barra invertida escapa fuera de comillas. Ante cualquier otro, la barra se conserva:
 * así una ruta de Windows (`C:\nodejs\npm.cmd`, en PowerShell) no pierde sus separadores.
 */
const ESCAPABLES = new Set([..." \t\n\"'\\$`;&|<>()#*?[]{}~!"]);

/** Posición del paréntesis que cierra el que hay en `inicio` (o el final del texto si no cierra). */
function cierre(texto, inicio) {
  let nivel = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === "(") nivel++;
    else if (texto[i] === ")" && --nivel === 0) return i;
  }
  return texto.length;
}

/**
 * Parte un comando en segmentos (listas de palabras ya sin comillas). Las redirecciones y su destino
 * se descartan; los comentarios `#` se ignoran; `$( )` y las comillas invertidas aportan sus propios segmentos.
 */
export function segmentos(texto, profundidad = 0) {
  const s = String(texto);
  const n = s.length;
  const resultado = [];
  let seg = [];
  let palabra = null;
  let soltarSiguiente = false;

  const cerrarPalabra = () => {
    if (palabra === null) return;
    if (soltarSiguiente) soltarSiguiente = false;
    else seg.push(palabra);
    palabra = null;
  };
  const cerrarSegmento = () => {
    cerrarPalabra();
    soltarSiguiente = false;
    if (seg.length > 0) resultado.push(seg);
    seg = [];
  };
  const anidado = (interno) => {
    if (profundidad < PROFUNDIDAD_MAXIMA) resultado.push(...segmentos(interno, profundidad + 1));
  };
  const redireccion = (desde) => {
    let j = desde;
    while (j < n && (s[j] === "<" || s[j] === ">")) j++;
    if (s[j] === "&") {
      j++;
      if (/[\d-]/.test(s[j] ?? "")) {
        while (/[\d-]/.test(s[j] ?? "")) j++;
        return j; // 2>&1: duplicación de descriptor, sin destino
      }
    }
    if (s[j] === "|") j++;
    soltarSiguiente = true;
    return j;
  };

  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === "'") {
      const fin = s.indexOf("'", i + 1);
      const hasta = fin < 0 ? n : fin;
      palabra = (palabra ?? "") + s.slice(i + 1, hasta);
      i = hasta + 1;
    } else if (c === '"') {
      palabra = palabra ?? "";
      i++;
      while (i < n && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < n && '$`"\\\n'.includes(s[i + 1])) {
          palabra += s[i + 1];
          i += 2;
        } else if (s[i] === "$" && s[i + 1] === "(") {
          const fin = cierre(s, i + 1);
          anidado(s.slice(i + 2, fin));
          i = fin + 1;
        } else if (s[i] === "`") {
          const fin = s.indexOf("`", i + 1);
          const hasta = fin < 0 ? n : fin;
          anidado(s.slice(i + 1, hasta));
          i = hasta + 1;
        } else {
          palabra += s[i];
          i++;
        }
      }
      i++;
    } else if (c === "`") {
      const fin = s.indexOf("`", i + 1);
      const hasta = fin < 0 ? n : fin;
      anidado(s.slice(i + 1, hasta));
      i = hasta + 1;
    } else if (c === "\\" && i + 1 < n && ESCAPABLES.has(s[i + 1])) {
      if (s[i + 1] !== "\n") palabra = (palabra ?? "") + s[i + 1];
      i += 2;
    } else if (c === "$" && s[i + 1] === "'") {
      i++; // $'...' de bash: se trata como comillas simples
    } else if (c === "#" && palabra === null) {
      while (i < n && s[i] !== "\n") i++;
    } else if (c === "\n" || c === ";" || c === "|" || c === "(" || c === ")") {
      cerrarSegmento();
      i++;
    } else if (c === "&") {
      if (s[i + 1] === ">") {
        cerrarPalabra();
        i = redireccion(i + 1);
      } else {
        cerrarSegmento();
        i++;
      }
    } else if (c === "<" || c === ">") {
      if (palabra !== null && /^\d+$/.test(palabra)) palabra = null; // descriptor: 2>
      else cerrarPalabra();
      i = redireccion(i);
    } else if (/\s/.test(c)) {
      cerrarPalabra();
      i++;
    } else {
      palabra = (palabra ?? "") + c;
      i++;
    }
  }
  cerrarSegmento();
  return resultado;
}

/** Nombre del ejecutable sin ruta ni extensión, en minúsculas: `C:\x\NPM.cmd` -> `npm`. */
export function ejecutable(palabra) {
  const base = String(palabra).split(/[\\/]/).pop().toLowerCase();
  return base.replace(/\.(cmd|exe|bat|ps1)$/, "");
}

function gestorDe(exe) {
  if (/^pip\d*(\.\d+)?$/.test(exe)) return "pip";
  return Object.hasOwn(GESTORES, exe) ? exe : null;
}

function empiezaPor(palabras, desde, verbo) {
  return verbo.every((v, k) => (palabras[desde + k] ?? "").toLowerCase() === v);
}

/** Descarta banderas, sus valores conocidos, rutas locales, URLs y operadores: deja nombres del registro. */
function filtrarNombres(palabras) {
  const nombres = [];
  for (let k = 0; k < palabras.length; k++) {
    const p = palabras[k];
    if (p.startsWith("-")) {
      if (VALOR_NO_PAQUETE.has(p)) k++;
      continue;
    }
    if (p.length === 0 || /[<>&|;$`()]/.test(p)) continue;
    if (/^(\.|\/|~|[a-z]:|file:|git\+|https?:)/i.test(p)) continue;
    if (p.includes("/") && !/^@[\w.-]+\/[\w.-]+/.test(p)) continue;
    nombres.push(p);
  }
  return nombres;
}

/** Paquetes de un ejecutor efímero: valores de -p/--package/--from y el primer argumento posicional. */
function efimeros(args) {
  const nombres = [];
  for (let k = 0; k < args.length; k++) {
    const p = args[k];
    const igual = p.indexOf("=");
    const bandera = igual > 0 ? p.slice(0, igual) : p;
    if (VALOR_PAQUETE.has(bandera)) {
      if (igual > 0) nombres.push(p.slice(igual + 1));
      else if (k + 1 < args.length) nombres.push(args[++k]);
    } else if (p === "--") {
      continue;
    } else if (p.startsWith("-")) {
      if (VALOR_NO_PAQUETE.has(p)) k++;
    } else {
      nombres.push(p);
      break;
    }
  }
  return filtrarNombres(nombres);
}

/**
 * Analiza los argumentos de un gestor: salta banderas globales (y, si una bandera desconocida va seguida de
 * una palabra que no es verbo, esa palabra como su valor) hasta encontrar el verbo.
 */
function analizarGestor(gestor, args, r) {
  const { tipo, instalar, efimero } = GESTORES[gestor];
  let previaEsBandera = false;
  for (let j = 0; j < args.length; j++) {
    const p = args[j];
    if (p.startsWith("-")) {
      previaEsBandera = !p.includes("=");
      continue;
    }
    const verbo = instalar.find((v) => empiezaPor(args, j, v));
    if (verbo) {
      r[tipo].push(...filtrarNombres(args.slice(j + verbo.length)));
      return;
    }
    const efim = efimero.find((v) => empiezaPor(args, j, v));
    if (efim) {
      r.efimeros.push(...efimeros(args.slice(j + efim.length)).map((nombre) => ({ tipo, nombre })));
      return;
    }
    if (!previaEsBandera) return; // otro subcomando (test, run, ls...): no instala
    previaEsBandera = false;
  }
}

/** `python -m pip ...`: busca `-m pip` entre las banderas del intérprete. */
function analizarPython(args, r) {
  for (let j = 0; j < args.length; j++) {
    const p = args[j];
    let modulo = null;
    if (p === "-m") modulo = args[j + 1];
    else if (/^-m./.test(p)) modulo = p.slice(2);
    if (modulo !== null) {
      if (/^pip\d*(\.\d+)?$/i.test(modulo ?? "")) analizarGestor("pip", args.slice(j + (p === "-m" ? 2 : 1)), r);
      return;
    }
    if (!p.startsWith("-")) return; // un script: lo que sigue son sus argumentos
  }
}

/** Texto que una shell anidada ejecutará: `bash -c "..."`, `eval ...`, `cmd /c ...`, `powershell -Command ...`. */
function comandoAnidado(exe, args) {
  if (SHELLS.has(exe)) {
    const k = args.findIndex((a) => /^-[a-z]+$/i.test(a) && a.toLowerCase().includes("c"));
    return k >= 0 ? (args[k + 1] ?? null) : null;
  }
  if (exe === "eval") return args.join(" ");
  if (exe === "cmd") {
    const k = args.findIndex((a) => /^\/\/?[ck]$/i.test(a));
    return k >= 0 ? args.slice(k + 1).join(" ") : null;
  }
  if (exe === "powershell" || exe === "pwsh") {
    const k = args.findIndex((a) => /^-(c|co|com|comm|comma|comman|command)$/i.test(a));
    if (k >= 0) return args.slice(k + 1).join(" ");
    const e = args.findIndex((a) => /^-(e|ec|en|enc|encodedcommand)$/i.test(a));
    if (e >= 0 && args[e + 1]) return Buffer.from(args[e + 1], "base64").toString("utf16le");
  }
  if ((exe === "npx" || exe === "npm") && args.some((a) => a === "-c" || a === "--call")) {
    const k = args.findIndex((a) => a === "-c" || a === "--call");
    return args[k + 1] ?? null;
  }
  return null;
}

function analizarSegmento(palabras, r, profundidad) {
  let inicio = 0;
  while (inicio < palabras.length && /^[A-Za-z_]\w*=/.test(palabras[inicio])) inicio++; // FOO=1 npm i x
  if (inicio < palabras.length && SOLO_IMPRIMEN.has(ejecutable(palabras[inicio]))) return;
  // Se mira cada palabra, no solo la primera: cubre envoltorios (sudo, env, timeout 60, xargs, npx npm i).
  for (let k = inicio; k < palabras.length; k++) {
    // En bash `n\pm` es `npm`; en PowerShell `C:\x\npm` es una ruta: se prueban ambas lecturas.
    const lecturas = new Set([ejecutable(palabras[k]), ejecutable(palabras[k].replaceAll("\\", ""))]);
    for (const exe of lecturas) analizarEjecutable(exe, palabras.slice(k + 1), r, profundidad);
  }
}

function analizarEjecutable(exe, args, r, profundidad) {
  const gestor = gestorDe(exe);
  if (gestor) analizarGestor(gestor, args, r);
  else if (Object.hasOwn(EFIMEROS, exe)) {
    r.efimeros.push(...efimeros(args).map((nombre) => ({ tipo: EFIMEROS[exe], nombre })));
  } else if (/^(python\d*(\.\d+)?|py)$/.test(exe)) analizarPython(args, r);
  const anidado = comandoAnidado(exe, args);
  if (anidado !== null && profundidad < PROFUNDIDAD_MAXIMA) analizarTexto(anidado, r, profundidad + 1);
}

function analizarTexto(texto, r, profundidad) {
  for (const palabras of segmentos(texto)) analizarSegmento(palabras, r, profundidad);
}

/** Nombre normalizado de un paquete Python (PEP 503), sin extras ni versión: `Fast_MRZ[cli]>=2` -> `fast-mrz`. */
export function nombrePip(spec) {
  return String(spec)
    .split(/[=<>~!;@\s[]/)[0]
    .toLowerCase()
    .replace(/[-_.]+/g, "-");
}

/** Nombre npm sin versión: `@scope/x@1.2` -> `@scope/x`. */
export function nombreNpm(spec) {
  return String(spec).replace(/(?<=.)@[^/]*$/, "");
}

const unicos = (lista) => [...new Set(lista)];

/**
 * Instalaciones que hace un comando (ya sin cuerpos de heredoc).
 * @returns {{ npm: string[], pip: string[], efimeros: {tipo: "npm" | "pip", nombre: string}[] }}
 */
export function instalaciones(comando) {
  const r = { npm: [], pip: [], efimeros: [] };
  analizarTexto(comando, r, 0);
  const vistos = new Set();
  return {
    npm: unicos(r.npm),
    pip: unicos(r.pip),
    efimeros: r.efimeros.filter((e) => {
      const clave = `${e.tipo}:${e.nombre}`;
      return vistos.has(clave) ? false : vistos.add(clave);
    }),
  };
}
