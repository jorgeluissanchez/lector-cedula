// @vitest-environment jsdom
// SDK-32 Adaptador Angular sin zone.js (zoneless): signal reactiva, destrucción, plataforma servidor y acciones, con
// TestBed y DEPS falsas.
import { PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearFalsos, esperar } from "../../web/test/falsos.js";
import { config, espia, Prueba } from "./componente.js";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
});

function crear(plataforma = "browser") {
  TestBed.configureTestingModule({ imports: [Prueba], providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: plataforma }] });
  const fixture = TestBed.createComponent(Prueba);
  fixture.autoDetectChanges();
  return fixture;
}

const texto = (raiz: HTMLElement, p: string): string => raiz.querySelector(`[data-prueba="${p}"]`)?.textContent?.trim() ?? "";

beforeEach(() => {
  TestBed.resetTestingModule();
  config.opciones = {};
  config.avanzado = {};
});

describe("SDK-32 Adaptador Angular (sin zone.js)", () => {
  it("SDK-32 Signal reactiva sin zone: tras whenStable la fase es resultado y se muestra el NUIP", async () => {
    expect((globalThis as { Zone?: unknown }).Zone).toBeUndefined();
    const f = crearFalsos();
    const s = espia();
    config.avanzado = { deps: f.deps, crear: s.crear };
    const fixture = crear();
    await fixture.whenStable();
    const raiz = fixture.nativeElement as HTMLElement;
    (raiz.querySelector('[data-prueba="iniciar"]') as HTMLButtonElement).click();
    await esperar(s.ultimo().obtenerEstado, (e) => e.fase === "resultado");
    await fixture.whenStable();
    expect(texto(raiz, "fase")).toBe("resultado");
    expect(texto(raiz, "nuip")).toBe("9999123456");
    expect(raiz.querySelector("[data-fase]")?.getAttribute("data-fase")).toBe("resultado");
  });

  it("SDK-32 Destrucción en activo: el controlador recibió destruir y las pistas están en ended", async () => {
    const f = crearFalsos({ manual: true });
    const s = espia();
    config.avanzado = { deps: f.deps, crear: s.crear };
    const fixture = crear();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-prueba="iniciar"]')?.click();
    await esperar(s.ultimo().obtenerEstado, (e) => e.fase === "activo");
    await fixture.whenStable();
    expect(texto(fixture.nativeElement as HTMLElement, "fase")).toBe("activo");
    fixture.destroy();
    expect(s.destruidos).toBe(1);
    expect(f.pistas.every((p) => p.readyState === "ended")).toBe(true);
  });

  it("SDK-32 Plataforma servidor: estado inicio y la fábrica del controlador no se llamó", async () => {
    const s = espia();
    config.avanzado = { deps: crearFalsos().deps, crear: s.crear };
    const fixture = crear("server");
    await fixture.whenStable();
    expect(fixture.componentInstance.lector.estado().fase).toBe("inicio");
    expect(s.llamadas).toBe(0);
    const raiz = fixture.nativeElement as HTMLElement;
    raiz.querySelector<HTMLButtonElement>('[data-prueba="iniciar"]')?.click();
    raiz.querySelector<HTMLButtonElement>('[data-prueba="cancelar"]')?.click();
    raiz.querySelector<HTMLButtonElement>('[data-prueba="reintentar"]')?.click();
    await fixture.whenStable();
    expect(texto(raiz, "fase")).toBe("inicio");
    fixture.destroy();
  });

  it("SDK-32 cancelar, reintentar y opciones inválidas", async () => {
    const f = crearFalsos({ camara: { name: "NotAllowedError" } });
    const s = espia();
    config.avanzado = { deps: f.deps, crear: s.crear };
    const fixture = crear();
    const raiz = fixture.nativeElement as HTMLElement;
    raiz.querySelector<HTMLButtonElement>('[data-prueba="iniciar"]')?.click();
    await esperar(s.ultimo().obtenerEstado, (e) => e.fase === "error");
    await fixture.whenStable();
    expect(texto(raiz, "error")).toBe("camara-denegada");
    raiz.querySelector<HTMLButtonElement>('[data-prueba="reintentar"]')?.click();
    expect(s.ultimo().obtenerEstado().intento).toBe(2);
    await esperar(s.ultimo().obtenerEstado, (e) => e.fase === "error");
    fixture.destroy();

    TestBed.resetTestingModule();
    const g = crearFalsos({ manual: true });
    const s2 = espia();
    config.avanzado = { deps: g.deps, crear: s2.crear };
    const f2 = crear();
    const r2 = f2.nativeElement as HTMLElement;
    r2.querySelector<HTMLButtonElement>('[data-prueba="iniciar"]')?.click();
    await esperar(s2.ultimo().obtenerEstado, (e) => e.fase === "activo");
    r2.querySelector<HTMLButtonElement>('[data-prueba="cancelar"]')?.click();
    await f2.whenStable();
    expect(texto(r2, "fase")).toBe("inicio");
    f2.destroy();

    TestBed.resetTestingModule();
    config.opciones = { servidor: "ftp://x" };
    config.avanzado = { deps: crearFalsos().deps };
    const f3 = crear();
    await f3.whenStable();
    expect(texto(f3.nativeElement as HTMLElement, "error")).toBe("opcion-invalida");
  });

  it("SDK-32 video acepta ElementRef y sin video iniciar no abre la cámara", async () => {
    const { ElementRef } = await import("@angular/core");
    const f = crearFalsos({ manual: true });
    const s = espia();
    config.avanzado = { deps: f.deps, crear: s.crear };
    const fixture = crear();
    const l = fixture.componentInstance.lector;
    l.video(null);
    await l.iniciar();
    expect(f.camarasAbiertas).toBe(0);
    l.video(new ElementRef(document.createElement("video")));
    await l.iniciar();
    expect(f.camarasAbiertas).toBe(1);
    fixture.destroy();
  });
});
