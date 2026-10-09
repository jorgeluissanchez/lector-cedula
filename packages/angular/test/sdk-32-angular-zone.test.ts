// @vitest-environment jsdom
// SDK-32 (design.md, segunda ronda, decisión 5): el adaptador también funciona con zone.js y detección por zonas.
import "zone.js";
import { NgZone, provideZoneChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { crearFalsos, esperar } from "../../web/test/falsos.js";
import { config, espia, Prueba } from "./componente.js";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe("SDK-32 Adaptador Angular con zone.js", () => {
  it("SDK-32 con zone.js: tras whenStable la fase es resultado y se muestra el NUIP; destruir al cerrar", async () => {
    expect((globalThis as { Zone?: unknown }).Zone).toBeDefined();
    const f = crearFalsos();
    const s = espia();
    config.opciones = {};
    config.avanzado = { deps: f.deps, crear: s.crear };
    TestBed.configureTestingModule({ imports: [Prueba], providers: [provideZoneChangeDetection()] });
    const fixture = TestBed.createComponent(Prueba);
    expect(TestBed.inject(NgZone).constructor.name).not.toBe("NoopNgZone");
    fixture.autoDetectChanges();
    const raiz = fixture.nativeElement as HTMLElement;
    raiz.querySelector<HTMLButtonElement>('[data-prueba="iniciar"]')?.click();
    await esperar(s.ultimo().obtenerEstado, (e) => e.fase === "resultado");
    await fixture.whenStable();
    expect(raiz.querySelector('[data-prueba="fase"]')?.textContent?.trim()).toBe("resultado");
    expect(raiz.querySelector('[data-prueba="nuip"]')?.textContent?.trim()).toBe("9999123456");
    fixture.destroy();
    expect(s.destruidos).toBe(1);
  });
});
