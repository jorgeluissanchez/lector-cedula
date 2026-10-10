// @vitest-environment jsdom
// SDK-62: el adaptador Angular expone estado().guiaEnPantalla y lo actualiza al redimensionar el recuadro.
import { PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { guiaEnElemento, guiaEnVideo, type DependenciasLector, type MedidasVideo, type Rectangulo } from "@lector-cedula/web";
import { injectLectorCedula } from "../src/index.js";
import { crearFalsos } from "../../web/test/falsos.js";

const V: MedidasVideo = { anchoVideo: 1920, altoVideo: 1080, anchoElemento: 260, altoElemento: 400, ajuste: "cover" };
const H: MedidasVideo = { ...V, anchoElemento: 320, altoElemento: 200 };

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
});

describe("SDK-62 guiaEnPantalla en Angular", () => {
  it("SDK-62 Expuesta y actualizada al redimensionar", async () => {
    const f = crearFalsos({ manual: true, guia: { x: 654, y: 54, ancho: 613, alto: 972 } });
    let m = V;
    let aviso = (): void => undefined;
    const deps: DependenciasLector = { ...f.deps, medirVideo: () => m, observarVideo: (_v, fn) => ((aviso = fn), () => undefined) };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: "browser" }] });
    const l = TestBed.runInInjectionContext(() => injectLectorCedula({ autoIniciar: true, guia: { orientacion: "vertical" } }, { deps }));
    l.video(document.createElement("video"));
    await expect.poll(() => f.camarasAbiertas).toBe(1);
    f.tick();
    await expect.poll(() => l.estado().guiaEnPantalla).toStrictEqual(guiaEnElemento({ x: 654, y: 54, ancho: 613, alto: 972 }, V));
    m = H;
    aviso();
    expect(l.estado().guiaEnPantalla).toStrictEqual(guiaEnElemento(guiaEnVideo(H, { orientacion: "vertical" }) as Rectangulo, H));
  });
});
