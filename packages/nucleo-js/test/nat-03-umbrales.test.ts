// fixture-sintetico: sin datos personales.
// NAT-03: los umbrales del núcleo nativo se generan desde packages/capture/src/calidad/umbrales.ts; el JSON versionado
// que empaqueta Android no puede desfasarse de la fuente (CAL-08).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LAPLACIANO_MINIMO_GUIADO } from "../../capture/src/calidad/presencia.js";
import { UMBRALES_POR_DEFECTO } from "../../capture/src/calidad/umbrales.js";
// @ts-expect-error módulo .mjs sin tipos
import { RUTA_UMBRALES, textoUmbrales } from "../scripts/generar-umbrales.mjs";

describe("NAT-03 Umbrales generados", { timeout: 60_000 }, () => {
  it("NAT-03 el JSON de Android es idéntico al generado desde umbrales.ts", async () => {
    const versionado = readFileSync(RUTA_UMBRALES as string, "utf8");
    expect(versionado).toBe(await (textoUmbrales as () => Promise<string>)());
    const u = JSON.parse(versionado).umbrales as Record<string, number>;
    expect(u).toStrictEqual({ ...UMBRALES_POR_DEFECTO, laplacianoMinimoGuiado: LAPLACIANO_MINIMO_GUIADO });
  });
});
