// SDK-33 SSR: renderToString de vue/server-renderer en Node sin DOM no lanza, da fase `inicio` y no crea el controlador.
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { useLectorCedula } from "../src/index.js";

describe("SDK-33 SSR", () => {
  it("SDK-33 SSR: sin DOM, no lanza y contiene data-fase=\"inicio\"", async () => {
    expect(typeof window).toBe("undefined");
    let creados = 0;
    const app = createSSRApp(
      defineComponent({
        setup() {
          const l = useLectorCedula({}, {
            crear: () => {
              creados++;
              throw new Error("no debe crearse en el servidor");
            },
          });
          return () => h("div", { "data-fase": l.estado.value.fase }, [h("video", { ref: l.videoRef })]);
        },
      }),
    );
    const html = await renderToString(app);
    expect(html).toContain('data-fase="inicio"');
    expect(creados).toBe(0);
  });

  it("SDK-49 Render en servidor con autoIniciar", async () => {
    const app = createSSRApp(
      defineComponent({
        setup() {
          const l = useLectorCedula({ autoIniciar: true, backend: "/api/cedula" });
          return () => h("div", { "data-fase": l.estado.value.fase }, [h("video", { ref: l.videoRef })]);
        },
      }),
    );
    expect(await renderToString(app)).toContain('data-fase="inicio"');
  });
});
