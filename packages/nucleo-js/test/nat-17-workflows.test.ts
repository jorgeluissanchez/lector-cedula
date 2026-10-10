// NAT-17 (infraestructura, sdk-nativo tarea 0.4): análisis estático de los workflows nativos. Actions fijadas por SHA
// de 40 caracteres, permisos de solo lectura, sin secretos, sin publicar nada, emulador con KVM en Linux y macOS 15.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (nombre: string): string => readFileSync(new URL(`../../../.github/workflows/${nombre}`, import.meta.url), "utf8");
const WORKFLOWS = ["nativo-android.yml", "nativo-ios.yml"] as const;

/** Hallazgos estáticos de un workflow (función pura para poder probarla con fixtures que fallan). */
export function revisarWorkflow(texto: string): string[] {
  const h: string[] = [];
  for (const m of texto.matchAll(/^\s*-?\s*uses:\s*(\S+)/gmu)) {
    const ref = m[1] ?? "";
    if (ref.startsWith("./")) continue;
    if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/u.test(ref)) h.push(`Action sin fijar por SHA: ${ref}`);
  }
  if (/\$\{\{\s*secrets\./u.test(texto)) h.push("usa secretos");
  if (/^\s*secrets:\s*inherit/mu.test(texto)) h.push("hereda secretos");
  if (/\b(npm|pnpm|yarn)\s+publish\b|\bgradlew?\b[^\n]*\bpublish|\bpod\s+trunk\s+push|\bdocker\s+push\b|\bgh\s+release\b|softprops\/action-gh-release/u.test(texto)) h.push("publica artefactos");
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/mu.test(texto)) h.push("permisos distintos de contents: read");
  if (/^\s+\w[\w-]*:\s*write\b/mu.test(texto)) h.push("permiso de escritura");
  if (/pull_request_target/u.test(texto)) h.push("pull_request_target");
  return h;
}

describe("NAT-17 Workflows nativos", () => {
  it("NAT-17 el detector rechaza tags, secretos, publicación y permisos de escritura", () => {
    const malo = [
      "permissions:",
      "  contents: write",
      "jobs:",
      "  x:",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - run: npm publish",
      "        env:",
      "          T: ${{ secrets.NPM_TOKEN }}",
    ].join("\n");
    const h = revisarWorkflow(malo);
    expect(h).toContain("Action sin fijar por SHA: actions/checkout@v4");
    expect(h).toContain("usa secretos");
    expect(h).toContain("publica artefactos");
    expect(h).toContain("permisos distintos de contents: read");
    expect(h).toContain("permiso de escritura");
    expect(revisarWorkflow("permissions:\n  contents: read\nsteps:\n  - run: ./gradlew publishToMavenCentral\n")).toContain("publica artefactos");
  });

  it.each(WORKFLOWS)("NAT-17 %s: actions por SHA, sin secretos, sin publicar, solo lectura", (nombre) => {
    expect(revisarWorkflow(leer(nombre))).toStrictEqual([]);
  });

  it("NAT-17 Android: Linux 24.04, KVM, emulador API 34 x86_64 por SHA y la imagen Docker del SDK", () => {
    const t = leer("nativo-android.yml");
    expect(t).toMatch(/runs-on:\s*ubuntu-24\.04/u);
    expect(t).toContain("/etc/udev/rules.d/99-kvm4all.rules");
    expect(t).toMatch(/reactivecircus\/android-emulator-runner@[0-9a-f]{40}/u);
    expect(t).toMatch(/api-level:\s*34/u);
    expect(t).toMatch(/arch:\s*x86_64/u);
    expect(t).toContain("docker build --build-arg ACEPTO_LICENCIA_ANDROID_SDK=si -t lector-android-sdk docker/android-sdk");
    expect(t).toContain("./gradlew --no-daemon testDebugUnitTest");
  });

  it("NAT-17 iOS: macos-15 y el bundle en JavaScriptCore", () => {
    const t = leer("nativo-ios.yml");
    expect(t).toMatch(/runs-on:\s*macos-15/u);
    expect(t).toContain("JavaScriptCore.framework");
    expect(t).toContain("undefined,undefined,0.1.0,inicio");
  });
});
