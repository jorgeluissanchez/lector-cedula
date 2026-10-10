// sdk-nativo, NAT-16, tarea 1.5: el control `tools/nativo/sin-jpeg-png.mjs` falla si libjpeg o libpng entran en el AAR,
// en un .so o en el informe de dependencias, y no confunde los stubs de Leptonica con las bibliotecas.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { entradasZip, hallazgosEnBinario, hallazgosEnInforme, MARCAS, revisar } from "../nativo/sin-jpeg-png.mjs";

const SCRIPT = fileURLToPath(new URL("../nativo/sin-jpeg-png.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "sin-jpeg-png-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Zip mínimo (stored o deflate) con las entradas dadas. */
function zip(entradas, deflate = false) {
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of entradas) {
    const datos = Buffer.from(contenido);
    const guardado = deflate ? deflateRawSync(datos) : datos;
    const n = Buffer.from(nombre);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(guardado.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(guardado.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(local, n, guardado);
    centrales.push(central, n);
    desplazamiento += 30 + n.length + guardado.length;
  }
  const dirCentral = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(dirCentral.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, dirCentral, fin]);
}

const limpio = "\x7fELF...TessBaseAPI...pixReadStreamPng...no libpng: can't read data...no libjpeg; using flate encoding";

function cli(...rutas) {
  try {
    return { codigo: 0, salida: execFileSync(process.execPath, [SCRIPT, ...rutas], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { codigo: e.status, salida: `${e.stdout}${e.stderr}` };
  }
}

describe("NAT-16 Sin libjpeg ni libpng en el binario nativo", { timeout: 60_000 }, () => {
  it("NAT-16 Los stubs y mensajes de Leptonica no cuentan; los símbolos y mensajes de libjpeg y libpng sí", () => {
    expect(hallazgosEnBinario("lib/arm64-v8a/liblectorcedula_ocr.so", Buffer.from(limpio))).toStrictEqual([]);
    for (const m of MARCAS) expect(hallazgosEnBinario("x.so", Buffer.from(`${limpio}${m}`))).toStrictEqual([`x.so: contiene "${m}"`]);
  });

  it("NAT-16 Una biblioteca libjpeg, libpng o libpngx empaquetada se rechaza por su nombre", () => {
    for (const n of ["lib/x86_64/libjpeg.so", "lib/arm64-v8a/libpngx.so", "jni/arm64-v8a/libpng16.so", "lib/x86_64/libturbojpeg.so"]) {
      expect(hallazgosEnBinario(n, Buffer.from("vacía"))).toStrictEqual([`${n}: biblioteca prohibida`]);
    }
    expect(hallazgosEnBinario("lib/x86_64/libjpegish-no.txt", Buffer.from("x"))).toStrictEqual([]);
  });

  it("NAT-16 Informe de dependencias: una coordenada con jpeg o png falla", () => {
    const informe = "releaseRuntimeClasspath\n+--- org.jetbrains.kotlin:kotlin-stdlib:2.4.10\n+--- io.example:libpng-android:1.6.48\n\\--- org.x:turbojpeg:3.0\n";
    expect(hallazgosEnInforme("dep.txt", informe)).toStrictEqual(["dep.txt: dependencia prohibida io.example:libpng-android:1.6.48", "dep.txt: dependencia prohibida org.x:turbojpeg:3.0"]);
    expect(hallazgosEnInforme("dep.txt", "releaseRuntimeClasspath\n+--- org.jetbrains.kotlin:kotlin-stdlib:2.4.10\n")).toStrictEqual([]);
  });

  it("NAT-16 Lee AAR (zip stored y deflate) y AAR anidados", () => {
    const so = Buffer.from(`${limpio}png_create_read_struct`);
    for (const deflate of [false, true]) {
      const e = entradasZip(zip([["classes.jar", "x"], ["jni/x86_64/liblectorcedula_ocr.so", so]], deflate));
      expect(e.map((x) => x.nombre)).toStrictEqual(["classes.jar", "jni/x86_64/liblectorcedula_ocr.so"]);
      expect(Buffer.compare(e[1].datos, so)).toBe(0);
    }
    expect(() => entradasZip(Buffer.from("no soy un zip"))).toThrow("no es un zip");
    const ruta = join(dir, "anidado.aar");
    writeFileSync(ruta, zip([["libs/interno.aar", zip([["jni/x86_64/libpngx.so", "x"]])]], true));
    expect(revisar(ruta)).toStrictEqual([`${ruta}!libs/interno.aar!jni/x86_64/libpngx.so: biblioteca prohibida`]);
  });

  it("NAT-16 La CLI falla con libjpeg o libpng, pasa con el AAR limpio y no acepta un control vacío", () => {
    const sucio = join(dir, "sucio.aar");
    writeFileSync(sucio, zip([["jni/arm64-v8a/liblectorcedula_ocr.so", `${limpio}jpeg_std_error`]], true));
    const bueno = join(dir, "bueno.aar");
    writeFileSync(bueno, zip([["jni/arm64-v8a/liblectorcedula_ocr.so", limpio], ["jni/x86_64/liblectorcedula_ocr.so", limpio]], true));
    const vacio = join(dir, "vacio.aar");
    writeFileSync(vacio, zip([["classes.jar", "x"]]));
    const informe = join(dir, "dependencias-resueltas.txt");
    writeFileSync(informe, "releaseRuntimeClasspath\n+--- org.jetbrains.kotlin:kotlin-stdlib:2.4.10\n");
    const r1 = cli(sucio);
    expect(r1.codigo).toBe(1);
    expect(r1.salida).toContain('contiene "jpeg_std_error"');
    const r2 = cli(bueno, informe);
    expect(r2.codigo).toBe(0);
    expect(r2.salida).toContain("2 biblioteca(s) .so");
    expect(cli(vacio).codigo).toBe(1);
    expect(cli(join(dir, "no-existe.aar")).codigo).toBe(1);
    expect(cli().codigo).toBe(2);
  });
});
