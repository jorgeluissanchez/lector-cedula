// SDK-31 Render en servidor: renderToString en Node sin DOM no lanza, da fase `inicio` y no crea el controlador.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useLectorCedula } from "../src/index.js";

describe("SDK-31 Render en servidor", () => {
  it("SDK-31 Render en servidor: sin DOM, no lanza y contiene data-fase=\"inicio\"", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    let creados = 0;
    function Prueba() {
      const l = useLectorCedula({}, {
        crear: () => {
          creados++;
          throw new Error("no debe crearse en el servidor");
        },
      });
      return createElement("div", { "data-fase": l.estado.fase }, createElement("video", { ref: l.videoRef }));
    }
    const html = renderToString(createElement(Prueba));
    expect(html).toContain('data-fase="inicio"');
    expect(creados).toBe(0);
  });
});
