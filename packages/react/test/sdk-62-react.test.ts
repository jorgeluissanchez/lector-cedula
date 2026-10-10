// @vitest-environment jsdom
// SDK-62: el adaptador React expone estado.guiaEnPantalla y lo actualiza al redimensionar el recuadro.
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { guiaEnElemento, guiaEnVideo, type DependenciasLector, type MedidasVideo, type Rectangulo } from "@lector-cedula/web";
import { useLectorCedula } from "../src/index.js";
import { crearFalsos } from "../../web/test/falsos.js";

afterEach(cleanup);

const V: MedidasVideo = { anchoVideo: 1920, altoVideo: 1080, anchoElemento: 260, altoElemento: 400, ajuste: "cover" };
const H: MedidasVideo = { ...V, anchoElemento: 320, altoElemento: 200 };

function Prueba(props: { deps: DependenciasLector }) {
  const l = useLectorCedula({ autoIniciar: true, guia: { orientacion: "vertical" } }, { deps: props.deps });
  return createElement("div", null, createElement("video", { ref: l.videoRef }), createElement("span", { "data-prueba": "g" }, JSON.stringify(l.estado.guiaEnPantalla)));
}

describe("SDK-62 guiaEnPantalla en React", () => {
  it("SDK-62 Expuesta y actualizada al redimensionar", async () => {
    const f = crearFalsos({ manual: true, guia: { x: 654, y: 54, ancho: 613, alto: 972 } });
    let m = V;
    let aviso = (): void => undefined;
    const deps: DependenciasLector = { ...f.deps, medirVideo: () => m, observarVideo: (_v, fn) => ((aviso = fn), () => undefined) };
    await act(async () => {
      render(createElement(Prueba, { deps }));
    });
    await waitFor(() => expect(f.camarasAbiertas).toBe(1));
    await act(async () => f.tick());
    const q = (): string => document.querySelector('[data-prueba="g"]')?.textContent ?? "";
    await waitFor(() => expect(q()).toBe(JSON.stringify(guiaEnElemento({ x: 654, y: 54, ancho: 613, alto: 972 }, V))));
    m = H;
    await act(async () => aviso());
    expect(q()).toBe(JSON.stringify(guiaEnElemento(guiaEnVideo(H, { orientacion: "vertical" }) as Rectangulo, H)));
  });
});
