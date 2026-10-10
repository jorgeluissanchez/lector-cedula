// NAT-16 "Control de licencias nativo" (sdk-nativo, tarea 0.3): check:licencias revisa también las dependencias de
// Gradle (`native/android/**/build.gradle.kts` y el informe resuelto) y de SwiftPM (`native/ios/Package.resolved`)
// contra el registro `native/licencias-nativas.json`. Una dependencia GPL-3.0 de producción o sin licencia registrada
// hace fallar el comando y lo nombra.
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  coordenadasDeInformeGradle,
  dependenciasDeGradle,
  dependenciasDeSwiftPm,
  evaluarDependenciasNativas,
  revisarLicenciasNativas,
} from "../licencia-check.mjs";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ejecutar = promisify(execFile);

const REGISTRO = {
  gradle: {
    "org.jetbrains.kotlin:kotlin-stdlib": { licencia: "Apache-2.0", ambito: "produccion" },
    "io.kotest:kotest-runner-junit5": { licencia: "Apache-2.0", ambito: "prueba" },
    "org.junit.platform:junit-platform-engine": { licencia: "EPL-2.0", ambito: "prueba", justificacion: "motor de pruebas de Kotest, no se distribuye" },
    "com.ejemplo:gpl-lib": { licencia: "GPL-3.0", ambito: "produccion" },
  },
  swiftpm: { "zxing-cpp": { licencia: "Apache-2.0", ambito: "produccion" } },
};

describe("NAT-16 Lectura de dependencias nativas", () => {
  it("NAT-16 extrae configuración y coordenada de build.gradle.kts", () => {
    const kts = [
      "dependencies {",
      '    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.2.0")',
      '    testImplementation("io.kotest:kotest-runner-junit5:6.2.5")',
      "    api(\"com.ejemplo:gpl-lib:1.0\") // comentario",
      '    androidTestImplementation(platform("io.kotest:kotest-bom:6.2.5"))',
      '    // implementation("com.comentada:no:1.0")',
      '    pitest("io.kotest:kotest-extensions-pitest:6.2.5")',
      "}",
    ].join("\n");
    expect(dependenciasDeGradle(kts)).toStrictEqual([
      { configuracion: "implementation", coordenada: "org.jetbrains.kotlin:kotlin-stdlib" },
      { configuracion: "testImplementation", coordenada: "io.kotest:kotest-runner-junit5" },
      { configuracion: "api", coordenada: "com.ejemplo:gpl-lib" },
      { configuracion: "androidTestImplementation", coordenada: "io.kotest:kotest-bom" },
      { configuracion: "pitest", coordenada: "io.kotest:kotest-extensions-pitest" },
    ]);
  });

  it("NAT-16 extrae coordenadas del informe `gradle dependencies`", () => {
    const informe = [
      "releaseRuntimeClasspath - Resolved configuration for runtime for variant: release",
      "+--- org.jetbrains.kotlin:kotlin-stdlib:2.2.0 -> 2.2.10",
      "|    \\--- org.jetbrains:annotations:13.0",
      "\\--- project :nucleo",
      "     \\--- org.jetbrains.kotlin:kotlin-stdlib:2.2.10 (*)",
    ].join("\n");
    expect(coordenadasDeInformeGradle(informe)).toStrictEqual(["org.jetbrains.kotlin:kotlin-stdlib", "org.jetbrains:annotations"]);
  });

  it("NAT-16 extrae los pins de Package.resolved", () => {
    const resuelto = JSON.stringify({ pins: [{ identity: "zxing-cpp", location: "https://github.com/zxing-cpp/zxing-cpp", state: { version: "2.3.0" } }], version: 2 });
    expect(dependenciasDeSwiftPm(resuelto)).toStrictEqual(["zxing-cpp"]);
    expect(dependenciasDeSwiftPm("no es json")).toStrictEqual(null);
  });
});

describe("NAT-16 Reglas del registro", () => {
  it("NAT-16 una dependencia GPL-3.0 de producción falla y se nombra", () => {
    const e = evaluarDependenciasNativas([{ origen: "build.gradle.kts", tipo: "gradle", configuracion: "api", coordenada: "com.ejemplo:gpl-lib" }], REGISTRO);
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("com.ejemplo:gpl-lib");
    expect(e[0]).toContain("GPL-3.0");
  });

  it("NAT-16 una dependencia sin registrar falla y se nombra", () => {
    const e = evaluarDependenciasNativas([{ origen: "x", tipo: "gradle", configuracion: "testImplementation", coordenada: "com.nueva:lib" }], REGISTRO);
    expect(e).toStrictEqual(["x: com.nueva:lib (testImplementation) sin licencia registrada en native/licencias-nativas.json"]);
  });

  it("NAT-16 una licencia fuera de la lista solo se admite en pruebas con justificación", () => {
    const prueba = { origen: "x", tipo: "gradle", configuracion: "testRuntimeOnly", coordenada: "org.junit.platform:junit-platform-engine" };
    expect(evaluarDependenciasNativas([prueba], REGISTRO)).toStrictEqual([]);
    expect(evaluarDependenciasNativas([{ ...prueba, configuracion: "implementation" }], REGISTRO)).toHaveLength(1);
    const sinJustificacion = { gradle: { "org.junit.platform:junit-platform-engine": { licencia: "EPL-2.0", ambito: "prueba" } } };
    expect(evaluarDependenciasNativas([prueba], sinJustificacion)[0]).toContain("justificación");
  });

  it("NAT-16 la lista negra se aplica por nombre", () => {
    const e = evaluarDependenciasNativas([{ origen: "x", tipo: "swiftpm", configuracion: "produccion", coordenada: "fastmrz" }], { swiftpm: { fastmrz: { licencia: "MIT", ambito: "produccion" } } });
    expect(e[0]).toContain("prohibido");
  });

  it("NAT-16 las dependencias de producción permitidas pasan", () => {
    expect(
      evaluarDependenciasNativas(
        [
          { origen: "x", tipo: "gradle", configuracion: "implementation", coordenada: "org.jetbrains.kotlin:kotlin-stdlib" },
          { origen: "Package.resolved", tipo: "swiftpm", configuracion: "produccion", coordenada: "zxing-cpp" },
        ],
        REGISTRO,
      ),
    ).toStrictEqual([]);
  });
});

describe("NAT-16 Control de licencias nativo sobre el repositorio", { timeout: 60_000 }, () => {
  let copia = "";
  afterEach(() => {
    if (copia !== "") rmSync(copia, { recursive: true, force: true });
    copia = "";
  });

  /** Copia native/ a un directorio temporal para añadir fixtures sin tocar el repositorio. */
  function copiaDeNative() {
    copia = mkdtempSync(join(tmpdir(), "licencias-nativas-"));
    cpSync(join(RAIZ, "native"), join(copia, "native"), { recursive: true, filter: (o) => !/[\\/](build|\.gradle)([\\/]|$)/u.test(o) });
    return copia;
  }

  it("NAT-16 sin fixture el repositorio pasa", () => {
    expect(revisarLicenciasNativas(RAIZ)).toStrictEqual([]);
  });

  it("NAT-16 Control de licencias nativo: un build.gradle.kts con una dependencia GPL-3.0 falla y la nombra", () => {
    const raiz = copiaDeNative();
    const registro = join(raiz, "native", "licencias-nativas.json");
    const r = JSON.parse(readFileSync(registro, "utf8"));
    r.gradle["org.ejemplo.gpl:lector-gpl"] = { licencia: "GPL-3.0", ambito: "produccion", fuente: "fixture" };
    writeFileSync(registro, JSON.stringify(r));
    mkdirSync(join(raiz, "native", "android", "fixture-gpl"), { recursive: true });
    writeFileSync(join(raiz, "native", "android", "fixture-gpl", "build.gradle.kts"), 'dependencies {\n    implementation("org.ejemplo.gpl:lector-gpl:1.0.0")\n}\n');
    const e = revisarLicenciasNativas(raiz);
    expect(e.some((x) => x.includes("org.ejemplo.gpl:lector-gpl") && x.includes("GPL-3.0"))).toBe(true);
  });

  it("NAT-16 check:licencias termina con código distinto de 0 con el fixture y 0 sin él", async () => {
    const correr = (raiz) =>
      ejecutar(process.execPath, [join(RAIZ, "tools", "licencia-check.mjs"), "--solo-nativo", "--raiz", raiz]).then(
        (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
        (e) => e,
      );
    const raiz = copiaDeNative();
    mkdirSync(join(raiz, "native", "android", "fixture-gpl"), { recursive: true });
    writeFileSync(join(raiz, "native", "android", "fixture-gpl", "build.gradle.kts"), 'dependencies {\n    implementation("org.ejemplo.gpl:lector-gpl:1.0.0")\n}\n');
    const fallo = await correr(raiz);
    expect(fallo.code).not.toBe(0);
    expect(fallo.stderr).toContain("org.ejemplo.gpl:lector-gpl");
    const bien = await correr(RAIZ);
    expect(bien.code).toBe(0);
    expect(bien.stdout).toContain("licencia-check: OK");
  });
});

