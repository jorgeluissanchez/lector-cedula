// @vitest-environment jsdom
// SDK-62: el adaptador Vue expone estado.guiaEnPantalla y lo actualiza al redimensionar el recuadro.
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { guiaEnElemento, guiaEnVideo, type DependenciasLector, type MedidasVideo, type Rectangulo } from "@lector-cedula/web";
import { useLectorCedula } from "../src/index.js";
import { crearFalsos } from "../../web/test/falsos.js";

const V: MedidasVideo = { anchoVideo: 1920, altoVideo: 1080, anchoElemento: 260, altoElemento: 400, ajuste: "cover" };
const H: MedidasVideo = { ...V, anchoElemento: 320, altoElemento: 200 };

describe("SDK-62 guiaEnPantalla en Vue", () => {
  it("SDK-62 Expuesta y actualizada al redimensionar", async () => {
    const f = crearFalsos({ manual: true, guia: { x: 654, y: 54, ancho: 613, alto: 972 } });
    let m = V;
    let aviso = (): void => undefined;
    const deps: DependenciasLector = { ...f.deps, medirVideo: () => m, observarVideo: (_v, fn) => ((aviso = fn), () => undefined) };
    const w = mount(
      defineComponent({
        setup() {
          const l = useLectorCedula({ autoIniciar: true, guia: { orientacion: "vertical" } }, { deps });
          return () => h("div", [h("video", { ref: l.videoRef }), h("span", { "data-prueba": "g" }, JSON.stringify(l.estado.value.guiaEnPantalla))]);
        },
      }),
    );
    await expect.poll(() => f.camarasAbiertas).toBe(1);
    f.tick();
    const q = (): string => w.get('[data-prueba="g"]').text();
    await expect.poll(q).toBe(JSON.stringify(guiaEnElemento({ x: 654, y: 54, ancho: 613, alto: 972 }, V)));
    m = H;
    aviso();
    await nextTick();
    expect(q()).toBe(JSON.stringify(guiaEnElemento(guiaEnVideo(H, { orientacion: "vertical" }) as Rectangulo, H)));
    w.unmount();
  });
});
