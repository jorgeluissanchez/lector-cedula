// otros-documentos, OD-40 (tareas 7.2 y 7.3): privacidad-check falla ante una dependencia de QR, códigos de barras de
// terceros o NFC en un paquete de producto o en el núcleo nativo (Gradle y AndroidManifest), y ante un fixture MRZ cuyo
// número de documento, opcional TD1 o número personal TD3 no figura en la lista de sintéticos declarada
// (tools/privacidad/numeros-mrz-sinteticos.json). Escenarios "Dependencia prohibida", "Fixture no declarado",
// "Alcance de la revisión" y "NUIP no declarado en el opcional".
// fixture-sintetico: todas las líneas MRZ de este archivo son sintéticas (UTO de ICAO y números ^9999); 5000000001 es
// un valor inventado que la regla debe rechazar.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { NUMEROS_MRZ_SINTETICOS, revisarArchivo } from "../privacidad-check.mjs";

const CLI = resolve(fileURLToPath(new URL("../privacidad-check.mjs", import.meta.url)));

const paquete = (deps) => `${JSON.stringify({ name: "@lector-cedula/x", version: "0.0.0", ...deps }, null, 2)}\n`;

/** TD3 sintético con el número de documento `numero` (los dígitos de control no importan a la regla). */
const fixtureTd3 = (numero) =>
  `${JSON.stringify(
    {
      sintetico: true,
      tipo: "mrz-td3",
      entrada: ["P<UTOERIKSSON<<ANNA<MARIA".padEnd(44, "<"), `${numero.padEnd(9, "<")}0UTO7408122F1204159${"<".repeat(14)}00`],
    },
    null,
    2,
  )}\n`;

/** TD1 sintético (CE) con el número de documento `numero`. */
const fixtureTd1 = (numero) =>
  `${JSON.stringify(
    {
      sintetico: true,
      tipo: "clasificar-documento",
      entrada: [`I<COL${numero.padEnd(9, "<")}0`.padEnd(30, "<"), "9205174M3301018ECU<<<<<<<<<<<4", "TORIBA<<PEDRO".padEnd(30, "<")],
    },
    null,
    2,
  )}\n`;

describe("OD-40 Dependencia prohibida", () => {
  it.each([
    ["apps/pwa/package.json", { dependencies: { jsqr: "1.4.0" } }, "jsqr"],
    ["apps/pwa/package.json", { devDependencies: { "@capacitor-community/nfc": "6.0.0" } }, "@capacitor-community/nfc"],
    ["packages/capture/package.json", { dependencies: { "qr-scanner": "1.4.2" } }, "qr-scanner"],
    ["packages/web/package.json", { optionalDependencies: { "html5-qrcode": "2.3.8" } }, "html5-qrcode"],
    ["apps/alojada/package.json", { peerDependencies: { "nfc-pcsc": "0.8.1" } }, "nfc-pcsc"],
    ["packages/motor/package.json", { dependencies: { "react-native-nfc-manager": "3.0.0" } }, "react-native-nfc-manager"],
  ])("%s con %j falla y nombra la dependencia", (ruta, deps, nombre) => {
    const h = revisarArchivo(ruta, paquete(deps));
    expect(h).toHaveLength(1);
    expect(h[0].mensaje).toMatch(/OD-40/u);
    expect(h[0].mensaje).toContain(nombre);
    expect(h[0].linea).toBeGreaterThan(0);
  });

  it("no marca las dependencias permitidas (zxing-wasm lee el PDF417) ni paquetes fuera de producto", () => {
    expect(revisarArchivo("packages/capture/package.json", paquete({ dependencies: { "zxing-wasm": "3.1.5", "onnxruntime-web": "1.0.0" } }))).toEqual([]);
    // La regla aplica a apps/* y packages/*; la raíz y los ejemplos los cubren otras revisiones.
    expect(revisarArchivo("package.json", paquete({ devDependencies: { jsqr: "1.4.0" } }))).toEqual([]);
    expect(revisarArchivo("packages/capture/test/package.json", paquete({ dependencies: { jsqr: "1.4.0" } }))).toEqual([]);
  });

  it.each([
    "@zxing/library",
    "@zxing/browser",
    "@zxing/ngx-scanner",
    "zxing-js",
    "@undecaf/zbar-wasm",
    "zbar.wasm",
    "barcode-detector",
    "@capacitor-mlkit/barcode-scanning",
    "@react-native-ml-kit/barcode-scanning",
    "@ericblade/quagga2",
    "html5-qrcode",
  ])("la librería de códigos de terceros %s falla", (nombre) => {
    const h = revisarArchivo("apps/pwa/package.json", paquete({ dependencies: { [nombre]: "1.0.0" } }));
    expect(h).toHaveLength(1);
    expect(h[0].mensaje).toMatch(/OD-40/u);
    expect(h[0].mensaje).toContain(nombre);
  });

  it("zxing-wasm solo se admite por su nombre exacto", () => {
    expect(revisarArchivo("apps/pwa/package.json", paquete({ dependencies: { "zxing-wasm": "3.1.5" } }))).toEqual([]);
    expect(revisarArchivo("apps/pwa/package.json", paquete({ dependencies: { "zxing-wasm-qr": "1.0.0" } }))[0].mensaje).toContain("zxing-wasm-qr");
  });

  it.each([
    ['implementation("com.google.mlkit:barcode-scanning:17.3.0")', "com.google.mlkit:barcode-scanning"],
    ['implementation("com.google.zxing:core:3.5.3")', "com.google.zxing"],
    ["    api 'com.journeyapps:zxing-android-embedded:4.3.0'", "zxing"],
  ])("un build.gradle.kts nativo con %s falla y nombra el artefacto", (linea, nombre) => {
    const ruta = "native/android/nucleo/build.gradle.kts";
    const h = revisarArchivo(ruta, `plugins {}\ndependencies {\n${linea}\n}\n`);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ ruta, linea: 3 });
    expect(h[0].mensaje).toMatch(/OD-40/u);
    expect(h[0].mensaje).toContain(nombre);
  });

  it("NAT-05: el wrapper oficial de zxing-cpp solo se admite por su coordenada exacta io.github.zxing-cpp:android", () => {
    const ruta = "native/android/lector-cedula/build.gradle.kts";
    expect(revisarArchivo(ruta, 'dependencies {\n    implementation("io.github.zxing-cpp:android:3.1.1")\n}\n')).toEqual([]);
    for (const [linea, nombre] of [
      ['    implementation("io.github.zxing-cpp:android-qr:1.0.0")', "io.github.zxing-cpp:android-qr"],
      ['    implementation("io.github.zxing-cpp:android:3.1.1"); implementation("com.google.zxing:core:3.5.3")', "zxing"],
      ['    implementation("com.example:zxing-cpp:android:1.0")', "zxing"],
    ]) {
      const h = revisarArchivo(ruta, `dependencies {\n${linea}\n}\n`);
      expect(h, linea).toHaveLength(1);
      expect(h[0].mensaje).toContain(nombre);
    }
  });

  it("un AndroidManifest de native/ con android.permission.NFC falla", () => {
    const xml = '<manifest>\n  <uses-permission android:name="android.permission.NFC" />\n</manifest>\n';
    for (const ruta of ["native/android/lector-cedula/src/main/AndroidManifest.xml", "native/android/demo/src/debug/AndroidManifest.xml"]) {
      const h = revisarArchivo(ruta, xml);
      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ ruta, linea: 2 });
      expect(h[0].mensaje).toMatch(/OD-40.*NFC/u);
    }
    expect(revisarArchivo("native/android/lector-cedula/src/main/AndroidManifest.xml", '<manifest>\n  <uses-permission android:name="android.permission.CAMERA" />\n</manifest>\n')).toEqual([]);
  });

  it("el código nativo del repositorio no depende de QR, códigos de terceros ni NFC", () => {
    const archivos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "native"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter((r) => /(build\.gradle\.kts|AndroidManifest\.xml)$/u.test(r));
    expect(archivos.length).toBeGreaterThan(2);
    const h = archivos.flatMap((r) => revisarArchivo(r, readFileSync(r, "utf8"))).filter((x) => /OD-40/u.test(x.mensaje));
    expect(h).toEqual([]);
  });

  it("un package.json ilegible no rompe la revisión", () => {
    expect(revisarArchivo("apps/pwa/package.json", "{ no es json")).toEqual([]);
  });

  it("el repositorio real no tiene dependencias de QR ni NFC en sus paquetes de producto", () => {
    const archivos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter((r) => /^(apps|packages)\/[^/]+\/package\.json$/u.test(r));
    expect(archivos.length).toBeGreaterThan(5);
    const h = archivos.flatMap((r) => revisarArchivo(r, readFileSync(r, "utf8"))).filter((x) => /OD-40/u.test(x.mensaje));
    expect(h).toEqual([]);
  });
});

describe("OD-40 Fixture no declarado", () => {
  it("la lista declarada incluye el espécimen ICAO y no incluye XY9999999", () => {
    expect(NUMEROS_MRZ_SINTETICOS.has("L898902C3")).toBe(true);
    expect(NUMEROS_MRZ_SINTETICOS.has("XY9999999")).toBe(false);
  });

  it("un TD3 con XY9999999 falla y nombra el número con su línea", () => {
    const ruta = "evals/fixtures/sinteticos/mrz-td3/no-declarado.json";
    const h = revisarArchivo(ruta, fixtureTd3("XY9999999"));
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ ruta, linea: 6 });
    expect(h[0].mensaje).toMatch(/OD-40/u);
    expect(h[0].mensaje).toContain("XY9999999");
  });

  it("un TD1 con un número no declarado falla; con uno declarado pasa", () => {
    const ruta = "evals/fixtures/sinteticos/clasificar-documento/x.json";
    expect(revisarArchivo(ruta, fixtureTd1("999988887"))[0].mensaje).toContain("999988887");
    expect(revisarArchivo(ruta, fixtureTd1("999912"))).toEqual([]);
    expect(revisarArchivo(ruta, fixtureTd3("AZ1234567").replace("mrz-td3", "clasificar-documento"))).toEqual([]);
  });

  it("solo revisa fixtures JSON de evals/fixtures; la línea de nombres no cuenta como número", () => {
    expect(revisarArchivo("packages/parsers/test/x.json", fixtureTd3("XY9999999"))).toEqual([]);
    expect(revisarArchivo("evals/fixtures/sinteticos/mrz-td3/x.md", fixtureTd3("XY9999999"))).toEqual([]);
    const soloNombres = JSON.stringify({ sintetico: true, entrada: ["PEREZ<<ANA".padEnd(30, "<"), "P<UTOERIKSSON<<ANNA<MARIA".padEnd(44, "<")] });
    expect(revisarArchivo("evals/fixtures/sinteticos/x/y.json", soloNombres)).toEqual([]);
  });

  it("una cadena con varias líneas separadas por \\n se revisa línea a línea", () => {
    const ruta = "evals/fixtures/sinteticos/lectura/multilinea.json";
    const [l1, l2] = JSON.parse(fixtureTd3("XY9999999")).entrada;
    const h = revisarArchivo(ruta, `${JSON.stringify({ sintetico: true, entrada: `${l1}\n${l2}` }, null, 2)}\n`);
    expect(h).toHaveLength(1);
    expect(h[0].mensaje).toContain("XY9999999");
    const td1 = JSON.parse(fixtureTd1("999988887")).entrada.join("\n");
    expect(revisarArchivo(ruta, JSON.stringify({ sintetico: true, entrada: td1 }))[0].mensaje).toContain("999988887");
  });

  it("admite TD2 (36) y longitudes con ruido OCR entre 28 y 46", () => {
    const ruta = "evals/fixtures/sinteticos/x/y.json";
    const td2 = ["I<UTOERIKSSON<<ANNA<MARIA".padEnd(36, "<"), "XY99999990UTO7408122F1204159<<<<<<<6"];
    expect(td2[1]).toHaveLength(36);
    expect(revisarArchivo(ruta, JSON.stringify({ sintetico: true, entrada: td2 }))[0].mensaje).toContain("XY9999999");
    // TD1 con un carácter de más y TD3 con dos de menos (ruido OCR).
    const td1Ruido = `I<COL999988887<0${"<".repeat(15)}`;
    expect(td1Ruido).toHaveLength(31);
    expect(revisarArchivo(ruta, JSON.stringify({ sintetico: true, entrada: [td1Ruido] }))[0].mensaje).toContain("999988887");
    const td3Ruido = JSON.parse(fixtureTd3("XY9999999")).entrada[1].slice(0, 42);
    expect(revisarArchivo(ruta, JSON.stringify({ sintetico: true, entrada: [td3Ruido] }))[0].mensaje).toContain("XY9999999");
    // Fuera del rango no se considera una línea MRZ.
    expect(revisarArchivo(ruta, JSON.stringify({ sintetico: true, entrada: ["I<COL999988887<0".padEnd(27, "<")] }))).toEqual([]);
  });

  it("la lista declarada exige origen por entrada: ^9999, espécimen o alfanumérico", () => {
    const { numeros } = JSON.parse(readFileSync(new URL("../privacidad/numeros-mrz-sinteticos.json", import.meta.url), "utf8"));
    expect(numeros.length).toBeGreaterThan(5);
    const origenes = new Set(["sintetico-9999", "especimen-icao", "especimen-publico", "sintetico-alfanumerico"]);
    for (const { numero, origen } of numeros) {
      expect(origenes.has(origen), `${numero}: origen ${origen}`).toBe(true);
      if (origen === "sintetico-9999") expect(numero, numero).toMatch(/^9999/u);
      if (origen === "sintetico-alfanumerico") expect(numero, numero).toMatch(/[A-Z]/u);
      if (/^[0-9]+$/u.test(numero) && !numero.startsWith("9999")) expect(origen, numero).toMatch(/^especimen-/u);
    }
    for (const n of ["1234567", "123456789", "654321"]) expect(NUMEROS_MRZ_SINTETICOS.has(n), n).toBe(false);
  });

  it("los fixtures del repositorio solo usan números declarados", () => {
    const archivos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "evals/fixtures"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter((r) => r.endsWith(".json"));
    expect(archivos.length).toBeGreaterThan(50);
    const h = archivos.flatMap((r) => revisarArchivo(r, readFileSync(r, "utf8"))).filter((x) => /OD-40/u.test(x.mensaje));
    expect(h).toEqual([]);
  });
});

/** TD1 de la cédula digital con el serial declarado y `opcional` en las posiciones 18 a 28 de la línea 2. */
const fixtureTd1Opcional = (opcional) =>
  `${JSON.stringify(
    {
      sintetico: true,
      tipo: "mrz-cedula-digital",
      entrada: ["ICCOL999900123816001<<<<<<<<<<", `9007150F3407150COL${opcional.padEnd(11, "<")}5`, "FICTICIO<EJEMPLO<<ANA<MARIA<<<"],
    },
    null,
    2,
  )}\n`;

/** TD3 sintético con número declarado y `personal` en las posiciones 28 a 42 de la línea 2. */
const fixtureTd3Personal = (personal) =>
  `${JSON.stringify(
    {
      sintetico: true,
      tipo: "mrz-td3",
      entrada: ["P<UTOERIKSSON<<ANNA<MARIA".padEnd(44, "<"), `AZ12345673COL9002155F3102145${personal.padEnd(14, "<")}78`],
    },
    null,
    2,
  )}\n`;

describe("OD-40 NUIP no declarado en el opcional", () => {
  const ruta = "evals/fixtures/sinteticos/mrz-cedula-digital/x.json";

  it("un TD1 con el opcional 5000000001 falla y nombra el número y su línea", () => {
    const h = revisarArchivo(ruta, fixtureTd1Opcional("5000000001"));
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ ruta, linea: 6 });
    expect(h[0].mensaje).toMatch(/OD-40/u);
    expect(h[0].mensaje).toContain("5000000001");
  });

  it.each(["", "9999123456", "09999123456", "99991234567", "9999"])("un TD1 con el opcional %j pasa", (opcional) => {
    expect(revisarArchivo(ruta, fixtureTd1Opcional(opcional))).toEqual([]);
  });

  it("un TD1 con un opcional no numérico ajeno a la lista falla", () => {
    expect(revisarArchivo(ruta, fixtureTd1Opcional("AB1234567"))[0].mensaje).toContain("AB1234567");
  });

  it("un TD3 con el número personal 5000000001 falla; vacío, ^9999 o declarado pasa", () => {
    const r3 = "evals/fixtures/sinteticos/mrz-td3/x.json";
    const h = revisarArchivo(r3, fixtureTd3Personal("5000000001"));
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ ruta: r3, linea: 6 });
    expect(h[0].mensaje).toContain("5000000001");
    expect(revisarArchivo(r3, fixtureTd3Personal(""))).toEqual([]);
    expect(revisarArchivo(r3, fixtureTd3Personal("9999123456"))).toEqual([]);
    expect(revisarArchivo(r3, fixtureTd3Personal("ZE184226B"))).toEqual([]);
  });

  it("la línea de nombres de un TD1 no se toma por la línea 2", () => {
    const nombres = JSON.stringify({ sintetico: true, entrada: ["GARCIA<<MARIA<JOSE<<<<<<<<<<<<", "DE<LA<OSSA<FICTICIO<<ANA<<<<<<", "FICTICI0<EJEMPLO<<ANA<MARIA<<<"] });
    expect(revisarArchivo(ruta, nombres)).toEqual([]);
  });
});

describe("OD-40 comando con --raiz", { timeout: 60_000 }, () => {
  let raiz;
  afterEach(() => {
    if (raiz !== undefined) rmSync(raiz, { recursive: true, force: true });
    raiz = undefined;
  });

  const escribir = (rel, texto) => {
    const destino = join(raiz, rel);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, texto);
  };
  const correr = () => spawnSync(process.execPath, [CLI, "--raiz", raiz], { encoding: "utf8" });

  it("Dependencia prohibida: termina con código distinto de 0 y nombra la dependencia", () => {
    raiz = mkdtempSync(join(tmpdir(), "privacidad-od40-"));
    escribir("apps/pwa/package.json", paquete({ dependencies: { jsqr: "1.4.0" }, devDependencies: { "@capacitor-community/nfc": "6.0.0" } }));
    const r = correr();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("jsqr");
    expect(r.stderr).toContain("@capacitor-community/nfc");
    expect(r.stderr).toContain("apps/pwa/package.json");
  });

  it("Fixture no declarado: falla y nombra el archivo", () => {
    raiz = mkdtempSync(join(tmpdir(), "privacidad-od40-"));
    escribir("evals/fixtures/sinteticos/mrz-td3/no-declarado.json", fixtureTd3("XY9999999"));
    const r = correr();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("evals/fixtures/sinteticos/mrz-td3/no-declarado.json");
    expect(r.stderr).toContain("XY9999999");
  });

  it("NUIP no declarado en el opcional: falla y nombra el número", () => {
    raiz = mkdtempSync(join(tmpdir(), "privacidad-od40-"));
    escribir("evals/fixtures/sinteticos/mrz-cedula-digital/opcional.json", fixtureTd1Opcional("5000000001"));
    escribir("evals/fixtures/sinteticos/mrz-td3/personal.json", fixtureTd3Personal("5000000001"));
    const r = correr();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("evals/fixtures/sinteticos/mrz-cedula-digital/opcional.json");
    expect(r.stderr).toContain("evals/fixtures/sinteticos/mrz-td3/personal.json");
    expect(r.stderr).toContain("5000000001");
  });

  it("Dependencia nativa prohibida: falla y nombra el artefacto y el permiso", () => {
    raiz = mkdtempSync(join(tmpdir(), "privacidad-od40-"));
    escribir("native/android/nucleo/build.gradle.kts", 'dependencies {\n  implementation("com.google.mlkit:barcode-scanning:17.3.0")\n}\n');
    escribir("native/android/nucleo/src/main/AndroidManifest.xml", '<manifest>\n  <uses-permission android:name="android.permission.NFC" />\n</manifest>\n');
    const r = correr();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("com.google.mlkit:barcode-scanning");
    expect(r.stderr).toContain("android.permission.NFC");
  });

  it("un directorio limpio pasa con código 0", () => {
    raiz = mkdtempSync(join(tmpdir(), "privacidad-od40-"));
    escribir("apps/pwa/package.json", paquete({ dependencies: { "zxing-wasm": "3.1.5" } }));
    escribir("evals/fixtures/sinteticos/mrz-td3/declarado.json", fixtureTd3("AZ1234567"));
    const r = correr();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("privacidad-check: OK");
  });
});
