// Integración de la CLI tools/divipol/generar-divipol.mjs (cambio divipol-registraduria, design.md decisión 8;
// requisitos DV-12, DV-13 y DV-14). Lanza la CLI con spawnSync sobre directorios temporales y URLs file:, sin
// red. Nunca escribe en tools/divipol/fuentes ni en packages/parsers/src. Fuentes sintéticas: solo códigos y
// nombres de lugar.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLI = join(RAIZ, "tools", "divipol", "generar-divipol.mjs");
const LIMITE_MS = 120_000;

const SHA_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const SHA_LOCALITIES = "56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1";

let temporales = [];

function directorioTemporal(prefijo) {
  const dir = mkdtempSync(join(tmpdir(), `divipol-${prefijo}-`));
  temporales.push(dir);
  return dir;
}

function correr(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: RAIZ, encoding: "utf8", timeout: LIMITE_MS });
}

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Fotografía de un árbol: ruta relativa -> bytes en hexadecimal. */
function fotografia(dir) {
  const resultado = {};
  const recorrer = (actual) => {
    for (const nombre of readdirSync(actual).sort()) {
      const ruta = join(actual, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else resultado[relative(dir, ruta).replace(/\\/g, "/")] = readFileSync(ruta).toString("hex");
    }
  };
  recorrer(dir);
  return resultado;
}

function escribirManifiesto(dir, fuentes) {
  const ruta = join(dir, "fuentes.json");
  writeFileSync(ruta, `${JSON.stringify(fuentes, null, 2)}\n`);
  return ruta;
}

afterEach(() => {
  for (const dir of temporales) rmSync(dir, { recursive: true, force: true });
  temporales = [];
});

describe("generar-divipol --descargar (DV-12)", { timeout: 60_000 }, () => {
  it("DV-12 checksum correcto: guarda la instantánea con los bytes exactos y termina con código 0", () => {
    const dir = directorioTemporal("descarga-ok");
    const origen = join(dir, "origen");
    const fuentes = join(dir, "fuentes");
    mkdirSync(origen);
    // Bytes con CRLF, Latin-1 y un byte nulo: la copia debe ser exacta, sin normalizar fines de línea.
    const bytes = Buffer.concat([Buffer.from("['01', '001', 'ANTIOQUIA', 'MEDELLIN'],\r\n"), Buffer.from([0x00, 0xd1, 0x0a])]);
    writeFileSync(join(origen, "localities.py"), bytes);
    const manifiesto = escribirManifiesto(dir, [
      {
        id: "sintetica",
        url: pathToFileURL(join(origen, "localities.py")).href,
        sha256: sha(bytes),
        licencia: "MIT",
        atribucion: "Fuente sintética de prueba",
        archivo: "localities.py",
      },
    ]);

    const r = correr("--descargar", "--manifiesto", manifiesto, "--fuentes", fuentes);

    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(readFileSync(join(fuentes, "localities.py")).equals(bytes)).toBe(true);
    expect(readdirSync(fuentes)).toStrictEqual(["localities.py"]);
  });

  it("DV-12 checksum distinto: código 1, ambos SHA-256 en stderr y directorio de instantáneas sin cambios", () => {
    const dir = directorioTemporal("descarga-mal");
    const origen = join(dir, "origen");
    const fuentes = join(dir, "fuentes");
    mkdirSync(origen);
    mkdirSync(fuentes);
    writeFileSync(join(origen, "localities.py"), "abc");
    const buena = Buffer.from("contenido sintético correcto\n");
    writeFileSync(join(origen, "otra.csv"), buena);
    writeFileSync(join(fuentes, "localities.py"), "instantanea previa\n");
    const manifiesto = escribirManifiesto(dir, [
      // La fuente correcta va primero: no debe escribirse si otra fuente falla.
      {
        id: "otra",
        url: pathToFileURL(join(origen, "otra.csv")).href,
        sha256: sha(buena),
        licencia: "CC-BY-SA-4.0",
        atribucion: "Fuente sintética de prueba",
        archivo: "otra.csv",
      },
      {
        id: "eitol-localities",
        url: pathToFileURL(join(origen, "localities.py")).href,
        sha256: SHA_LOCALITIES,
        licencia: "MIT",
        atribucion: "Fuente sintética de prueba",
        archivo: "localities.py",
      },
    ]);
    const antes = fotografia(dir);

    const r = correr("--descargar", "--manifiesto", manifiesto, "--fuentes", fuentes);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("eitol-localities");
    expect(r.stderr).toContain(SHA_ABC);
    expect(r.stderr).toContain(SHA_LOCALITIES);
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-12 URL con un esquema distinto de https: o file: termina con código 1 sin escribir", () => {
    const dir = directorioTemporal("descarga-esquema");
    const fuentes = join(dir, "fuentes");
    const manifiesto = escribirManifiesto(dir, [
      {
        id: "insegura",
        url: "http://example.invalid/localities.py",
        sha256: SHA_ABC,
        licencia: "MIT",
        atribucion: "Fuente sintética de prueba",
        archivo: "localities.py",
      },
    ]);
    const antes = fotografia(dir);

    const r = correr("--descargar", "--manifiesto", manifiesto, "--fuentes", fuentes);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("insegura");
    expect(r.stderr).toContain("http:");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-12 archivo de destino que sale del directorio de fuentes: código 1 sin escribir", () => {
    const dir = directorioTemporal("descarga-ruta");
    const origen = join(dir, "origen");
    mkdirSync(origen);
    writeFileSync(join(origen, "abc.txt"), "abc");
    const manifiesto = escribirManifiesto(dir, [
      {
        id: "fuera",
        url: pathToFileURL(join(origen, "abc.txt")).href,
        sha256: SHA_ABC,
        licencia: "MIT",
        atribucion: "Fuente sintética de prueba",
        archivo: "../escapado.txt",
      },
    ]);
    const antes = fotografia(dir);

    const r = correr("--descargar", "--manifiesto", manifiesto, "--fuentes", join(dir, "fuentes"));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("fuera");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-12 fuente local inexistente: código 1 con el id de la fuente", () => {
    const dir = directorioTemporal("descarga-ausente");
    const manifiesto = escribirManifiesto(dir, [
      {
        id: "ausente",
        url: pathToFileURL(join(dir, "no-existe.py")).href,
        sha256: SHA_ABC,
        licencia: "MIT",
        atribucion: "Fuente sintética de prueba",
        archivo: "no-existe.py",
      },
    ]);

    const r = correr("--descargar", "--manifiesto", manifiesto, "--fuentes", join(dir, "fuentes"));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("ausente");
  });
});

const MANIFIESTO_REAL = join(RAIZ, "tools", "divipol", "fuentes.json");
const FUENTES_REALES = join(RAIZ, "tools", "divipol", "fuentes");
const TABLA = join("divipol", "tabla.generated.ts");

/**
 * Copia el manifiesto y las instantáneas reales a un directorio temporal y sustituye localities.py por un texto
 * sintético, con su SHA-256 en el manifiesto. Las demás fuentes se copian intactas.
 */
function fuentesSinteticas(dir, textoLocalities, textoDane = null) {
  const fuentes = join(dir, "fuentes");
  mkdirSync(fuentes);
  const sustitutos = { "eitol-localities": textoLocalities, "dane-divipola": textoDane };
  const manifiesto = JSON.parse(readFileSync(MANIFIESTO_REAL, "utf8")).map((f) => {
    const texto = sustitutos[f.id];
    if (texto === null || texto === undefined) {
      writeFileSync(join(fuentes, f.archivo), readFileSync(join(FUENTES_REALES, f.archivo)));
      return f;
    }
    const bytes = Buffer.from(texto, "utf8");
    writeFileSync(join(fuentes, f.archivo), bytes);
    return { ...f, sha256: sha(bytes) };
  });
  return { manifiesto: escribirManifiesto(dir, manifiesto), fuentes };
}

/** Tabla manual sintética en un archivo temporal. */
function escribirManuales(dir, entradas) {
  const ruta = join(dir, "manuales.json");
  writeFileSync(ruta, `${JSON.stringify(entradas, null, 2)}\n`);
  return ruta;
}

const EQUIVALENCIAS = join("divipola", "equivalencias.generated.ts");

function localitiesSintetico(...filas) {
  return ["LOCALITIES = [", "    # mun | dep  |   mun     | dep", ...filas, "]", ""].join("\n");
}

describe("generar-divipol: generación y verificación (DV-13, DV-14)", { timeout: 60_000 }, () => {
  it("DV-13 dos ejecuciones idénticas: mismos bytes, LF y \\n final", () => {
    const a = directorioTemporal("gen-a");
    const b = directorioTemporal("gen-b");

    const ra = correr("--salida", a);
    const rb = correr("--salida", b);

    expect(ra.stderr).toBe("");
    expect(ra.status).toBe(0);
    expect(rb.status).toBe(0);
    for (const archivo of [TABLA, EQUIVALENCIAS]) {
      const bytesA = readFileSync(join(a, archivo));
      const bytesB = readFileSync(join(b, archivo));
      expect(bytesA.equals(bytesB)).toBe(true);
      expect(bytesA.includes(0x0d)).toBe(false);
      expect(bytesA.at(-1)).toBe(0x0a);
      expect(bytesA.at(-2)).not.toBe(0x0a);
    }
    expect(Object.keys(fotografia(a))).toStrictEqual(["divipol/tabla.generated.ts", "divipola/equivalencias.generated.ts"]);
  });

  it("DV-16 deriva de la equivalencia detectada: código alterado en una copia -> código 1 con el nombre del archivo", () => {
    const dir = directorioTemporal("deriva-equivalencia");
    expect(correr("--salida", dir).status).toBe(0);
    const ruta = join(dir, EQUIVALENCIAS);
    const original = readFileSync(ruta, "utf8");
    expect(original).toContain('["01001","05001","nombre-exacto"]');
    writeFileSync(ruta, original.replace('["01001","05001","nombre-exacto"]', '["01001","05002","nombre-exacto"]'));
    const antes = fotografia(dir);

    const r = correr("--verificar", "--salida", dir);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("equivalencias.generated.ts");
    expect(r.stderr).not.toContain("tabla.generated.ts");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-13 archivos versionados al día: --verificar sobre el repositorio termina con código 0", () => {
    const r = correr("--verificar");
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("DV-13 deriva detectada: municipio alterado en una copia -> código 1 con el nombre del archivo", () => {
    const dir = directorioTemporal("deriva");
    expect(correr("--salida", dir).status).toBe(0);
    expect(correr("--verificar", "--salida", dir).status).toBe(0);
    const ruta = join(dir, TABLA);
    const original = readFileSync(ruta, "utf8");
    expect(original).toContain('["01001","MEDELLIN"]');
    writeFileSync(ruta, original.replace('["01001","MEDELLIN"]', '["01001","MEDELLIM"]'));
    const antes = fotografia(dir);

    const r = correr("--verificar", "--salida", dir);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("tabla.generated.ts");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-13 --verificar con el archivo generado ausente: código 1 con el nombre del archivo", () => {
    const dir = directorioTemporal("ausente");
    const r = correr("--verificar", "--salida", dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("tabla.generated.ts");
    expect(readdirSync(dir)).toStrictEqual([]);
  });

  it("DV-14 fila malformada en una fuente sintética: código 1, número de línea y sin archivos escritos", () => {
    const dir = directorioTemporal("malformada");
    const salida = join(dir, "salida");
    mkdirSync(salida);
    const { manifiesto, fuentes } = fuentesSinteticas(
      dir,
      localitiesSintetico("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],", "    ['01', '06', 'ANTIOQUIA', 'X'],"),
    );
    const antes = fotografia(dir);

    const r = correr("--manifiesto", manifiesto, "--fuentes", fuentes, "--salida", salida);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("línea 4");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-14 código repetido en una fuente sintética: código 1 con 01001 y sin archivos escritos", () => {
    const dir = directorioTemporal("repetido");
    const salida = join(dir, "salida");
    mkdirSync(salida);
    const { manifiesto, fuentes } = fuentesSinteticas(
      dir,
      localitiesSintetico("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],", "    ['01', '001', 'ANTIOQUIA', 'OTRO'],"),
    );
    const antes = fotografia(dir);

    const r = correr("--manifiesto", manifiesto, "--fuentes", fuentes, "--salida", salida);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("01001");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-12 instantánea con un SHA-256 distinto del manifiesto: no genera y nombra ambos checksums", () => {
    const dir = directorioTemporal("instantanea-alterada");
    const salida = join(dir, "salida");
    mkdirSync(salida);
    const { manifiesto, fuentes } = fuentesSinteticas(dir, localitiesSintetico("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],"));
    const declarado = JSON.parse(readFileSync(manifiesto, "utf8")).find((f) => f.id === "eitol-localities").sha256;
    writeFileSync(join(fuentes, "localities.py"), "abc");
    const antes = fotografia(dir);

    const r = correr("--manifiesto", manifiesto, "--fuentes", fuentes, "--salida", salida);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(SHA_ABC);
    expect(r.stderr).toContain(declarado);
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-16 equivalencia con fuentes sintéticas y tabla manual vacía: código 0 y filas exactas", () => {
    const dir = directorioTemporal("equivalencia-sintetica");
    const salida = join(dir, "salida");
    const { manifiesto, fuentes } = fuentesSinteticas(
      dir,
      localitiesSintetico("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],", "    ['88', '815', 'CONSULADOS', 'VENEZUELA'],"),
    );
    const manuales = escribirManuales(dir, []);

    const r = correr("--manifiesto", manifiesto, "--fuentes", fuentes, "--salida", salida, "--manuales", manuales);

    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    const generado = readFileSync(join(salida, EQUIVALENCIAS), "utf8");
    expect(generado.split("\n").filter((l) => l.startsWith("  ["))).toStrictEqual(['  ["01001","05001","nombre-exacto"],']);
    expect(generado).toContain('  fuente: "DANE - DIVIPOLA Códigos municipios (datos.gov.co gdxc-w37w)",');
    expect(generado).toContain('  licencia: "CC-BY-SA-4.0",');
  });

  it("DV-16 fila sin resolver: código 1 con su código DIVIPOL y sin archivos escritos", () => {
    const dir = directorioTemporal("sin-resolver");
    const salida = join(dir, "salida");
    mkdirSync(salida);
    const { manifiesto, fuentes } = fuentesSinteticas(
      dir,
      localitiesSintetico("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],", "    ['01', '999', 'ANTIOQUIA', 'INVENTADO'],"),
    );
    const manuales = escribirManuales(dir, []);
    const antes = fotografia(dir);

    const r = correr("--manifiesto", manifiesto, "--fuentes", fuentes, "--salida", salida, "--manuales", manuales);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("01999");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-16 entrada manual redundante: código 1 con el código DIVIPOL y sin archivos escritos", () => {
    const dir = directorioTemporal("manual-redundante");
    const salida = join(dir, "salida");
    mkdirSync(salida);
    const { manifiesto, fuentes } = fuentesSinteticas(dir, localitiesSintetico("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],"));
    const manuales = escribirManuales(dir, [{ divipol: "01001", divipola: "05001", justificacion: "Redundante a propósito" }]);
    const antes = fotografia(dir);

    const r = correr("--manifiesto", manifiesto, "--fuentes", fuentes, "--salida", salida, "--manuales", manuales);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("01001");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-16 código DANE repetido: código 1 con el código DANE y sin archivos escritos", () => {
    const dir = directorioTemporal("dane-repetido");
    const salida = join(dir, "salida");
    mkdirSync(salida);
    const { manifiesto, fuentes } = fuentesSinteticas(
      dir,
      localitiesSintetico("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],", "    ['01', '004', 'ANTIOQUIA', 'OTRO'],"),
    );
    const manuales = escribirManuales(dir, [{ divipol: "01004", divipola: "05001", justificacion: "Choca a propósito" }]);
    const antes = fotografia(dir);

    const r = correr("--manifiesto", manifiesto, "--fuentes", fuentes, "--salida", salida, "--manuales", manuales);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("05001");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-16 integridad de la fuente DANE: 1121 filas -> código 1 sin archivos escritos", () => {
    const dir = directorioTemporal("dane-1121");
    const salida = join(dir, "salida");
    mkdirSync(salida);
    const lineas = readFileSync(join(FUENTES_REALES, "divipola-dane.csv"), "utf8").split("\n");
    lineas.splice(2, 1); // quita una fila de datos
    const { manifiesto, fuentes } = fuentesSinteticas(dir, localitiesSintetico("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],"), lineas.join("\n"));
    const manuales = escribirManuales(dir, []);
    const antes = fotografia(dir);

    const r = correr("--manifiesto", manifiesto, "--fuentes", fuentes, "--salida", salida, "--manuales", manuales);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("1121");
    expect(fotografia(dir)).toStrictEqual(antes);
  });

  it("DV-16 tabla manual ausente o con JSON inválido: código 1 con la ruta y sin archivos escritos", () => {
    const dir = directorioTemporal("manuales-ausentes");
    const salida = join(dir, "salida");
    mkdirSync(salida);
    const ausente = join(dir, "no-existe.json");
    const r1 = correr("--salida", salida, "--manuales", ausente);
    expect(r1.status).toBe(1);
    expect(r1.stderr).toContain("no-existe.json");
    const invalido = join(dir, "invalido.json");
    writeFileSync(invalido, "[{");
    const r2 = correr("--salida", salida, "--manuales", invalido);
    expect(r2.status).toBe(1);
    expect(r2.stderr).toContain("invalido.json");
    expect(readdirSync(salida)).toStrictEqual([]);
  });

  it("argumento desconocido o sin valor: código 1 sin escribir", () => {
    const dir = directorioTemporal("argumentos");
    const r1 = correr("--salida", dir, "--otro");
    expect(r1.status).toBe(1);
    expect(r1.stderr).toContain("--otro");
    const r2 = correr("--salida");
    expect(r2.status).toBe(1);
    expect(r2.stderr).toContain("--salida");
    expect(readdirSync(dir)).toStrictEqual([]);
  });
});
