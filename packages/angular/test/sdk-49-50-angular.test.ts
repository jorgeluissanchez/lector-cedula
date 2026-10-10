// @vitest-environment jsdom
// SDK-49 (autoIniciar) y SDK-50 (verificación) en el adaptador Angular, sin zone.js, con DEPS y backend falsos.
import { PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearLector, type DependenciasLector, type OpcionesLector } from "@lector-cedula/web";
import { injectLectorCedula } from "../src/index.js";
import { crearFalsos, esperar, type OpcionesFalsas } from "../../web/test/falsos.js";
import { crearBack, type Guion } from "../../web/test/backend/back-falso.js";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
});
beforeEach(() => TestBed.resetTestingModule());

function montar(opciones: OpcionesLector, falsos: OpcionesFalsas = {}, guiones: Guion[] = ["ok"], plataforma = "browser") {
  const back = crearBack(...guiones);
  const f = crearFalsos({ ...falsos, fetch: back.fetch });
  const deps: DependenciasLector = { ...f.deps, senales: () => ({ memoriaGb: 8, nucleos: 8, simd: true }), enLinea: () => true };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: plataforma }] });
  const fases: string[] = [];
  const crear = (o: OpcionesLector, d?: DependenciasLector) => {
    const c = crearLector(o, d);
    c.suscribir((e) => {
      if (fases.at(-1) !== e.fase) fases.push(e.fase);
    });
    return c;
  };
  const l = TestBed.runInInjectionContext(() => injectLectorCedula(opciones, { deps, crear }));
  return { l, f, back, fases };
}

describe("SDK-49 Apertura automática de la cámara (Angular)", () => {
  it("SDK-49 Arranque al vincular el vídeo, una sola vez", async () => {
    const m = montar({ autoIniciar: true }, { manual: true });
    expect(m.f.camarasAbiertas).toBe(0);
    const v = document.createElement("video");
    m.l.video(v);
    m.l.video(v);
    await esperar(m.l.estado, (e) => e.fase === "activo");
    expect(m.f.camarasAbiertas).toBe(1);
  });

  it("SDK-49 Navegador que exige gesto", async () => {
    const m = montar({ autoIniciar: true }, { camara: { name: "NotAllowedError" } });
    m.l.video(document.createElement("video"));
    const e = await esperar(m.l.estado, (x) => x.error !== null);
    expect(e).toMatchObject({ fase: "inicio", error: { codigo: "autoinicio-fallido", causa: "camara-denegada" } });
  });

  it("SDK-49 Sin autoIniciar y en plataforma servidor no se abre la cámara", () => {
    const a = montar({});
    a.l.video(document.createElement("video"));
    expect(a.f.camarasAbiertas).toBe(0);
    TestBed.resetTestingModule();
    const b = montar({ autoIniciar: true }, {}, ["ok"], "server");
    b.l.video(document.createElement("video"));
    expect(b.f.camarasAbiertas).toBe(0);
    expect(b.l.estado().fase).toBe("inicio");
  });
});

describe("SDK-50 Adaptadores con verificación (Angular)", () => {
  it("SDK-50 Rechazo visible en Angular", async () => {
    const m = montar({ backend: "/api/cedula", autoIniciar: true }, {}, ["rechazo:ilegible", "colgado"]);
    m.l.video(document.createElement("video"));
    await esperar(m.l.estado, (e) => e.rechazo !== null);
    expect(m.l.estado().rechazo?.motivo).toBe("ilegible");
    expect(m.fases[m.fases.indexOf("verificando") + 1]).toBe("activo");
    expect(m.l.estado().intentosVerificacion).toStrictEqual({ usados: 1, maximo: 3 });
  });

  it("SDK-50 verificación completa y modo expuesto", async () => {
    const m = montar({ backend: "/api/cedula", validacion: "auto", autoIniciar: true });
    m.l.video(document.createElement("video"));
    const e = await esperar(m.l.estado, (x) => x.fase === "resultado");
    expect(e).toMatchObject({ modo: "front-back", validacion: "auto", frontActivo: true, modoMotivo: "potente" });
    expect(e.resultado?.confiable).toBe(true);
  });
});
