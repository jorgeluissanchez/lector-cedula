// fixture-sintetico: catálogo del generador (NUIP 9999123456), nunca datos reales.
// NAT-07 (tarea 1.1): los casos de igualdad entre motores que leen las pruebas Kotlin (QuickJS) y Swift (JSC) son las
// salidas actuales del bundle en Node; si el bundle o los fixtures cambian, este archivo exige regenerarlos.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sin tipos
import { RUTA_CASOS, textoCasos } from "../scripts/generar-casos-nativos.mjs";

describe("NAT-07 Casos de igualdad entre motores al día", { timeout: 60_000 }, () => {
  it("NAT-07 casos-motor.json coincide con el bundle actual en Node (node packages/nucleo-js/scripts/generar-casos-nativos.mjs)", async () => {
    const versionado = readFileSync(RUTA_CASOS as string, "utf8");
    expect(versionado).toBe(await (textoCasos as () => Promise<string>)());
    const { casos } = JSON.parse(versionado) as { casos: { fn: string }[] };
    expect(new Set(casos.map((c) => c.fn))).toStrictEqual(new Set(["procesarPdf417", "procesarMrz", "validarOpciones", "crearEstado", "transicion", "validarUrlSubida"]));
  });
});
