// @vitest-environment jsdom
// SDK-33 Adaptador Vue: ref reactiva, desmontaje y acciones, con Vue Test Utils y DEPS falsas.
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it } from "vitest";
import { crearLector, type ControladorLector, type DependenciasLector, type OpcionesLector } from "@lector-cedula/web";
import { useLectorCedula, type AvanzadoLector } from "../src/index.js";
import { crearFalsos, esperar } from "../../web/test/falsos.js";

export function componente(opciones: OpcionesLector, avanzado: AvanzadoLector) {
  return defineComponent({
    setup() {
      const l = useLectorCedula(opciones, avanzado);
      return () =>
        h("div", { "data-fase": l.estado.value.fase }, [
          h("video", { ref: l.videoRef }),
          h("span", { "data-prueba": "fase" }, l.estado.value.fase),
          h("span", { "data-prueba": "nuip" }, l.estado.value.resultado?.campos.nuip ?? ""),
          h("span", { "data-prueba": "error" }, l.estado.value.error?.codigo ?? ""),
          h("button", { "data-prueba": "iniciar", onClick: () => void l.iniciar() }, "Iniciar"),
          h("button", { "data-prueba": "cancelar", onClick: () => l.cancelar() }, "Cancelar"),
          h("button", { "data-prueba": "reintentar", onClick: () => l.reintentar() }, "Reintentar"),
        ]);
    },
  });
}

function espia(): { crear: NonNullable<AvanzadoLector["crear"]>; destruidos: number; ultimo: () => ControladorLector } {
  let ultimo: ControladorLector | null = null;
  const r = {
    destruidos: 0,
    ultimo: () => ultimo as ControladorLector,
    crear(o: OpcionesLector, d?: DependenciasLector): ControladorLector {
      const c = crearLector(o, d);
      ultimo = {
        ...c,
        destruir() {
          r.destruidos++;
          c.destruir();
        },
      };
      return ultimo;
    },
  };
  return r;
}

const texto = (w: ReturnType<typeof mount>, p: string): string => w.get(`[data-prueba="${p}"]`).text();

describe("SDK-33 Adaptador Vue", () => {
  it("SDK-33 Ref reactiva: tras iniciar y flushPromises la fase es resultado y se muestra el NUIP", async () => {
    const f = crearFalsos();
    const s = espia();
    const w = mount(componente({}, { deps: f.deps, crear: s.crear }));
    const fases: string[] = [];
    s.ultimo().suscribir((e) => {
      if (fases.at(-1) !== e.fase) fases.push(e.fase);
    });
    await w.get('[data-prueba="iniciar"]').trigger("click");
    await esperar(s.ultimo().obtenerEstado, (e) => e.fase === "resultado");
    await flushPromises();
    expect(texto(w, "fase")).toBe("resultado");
    expect(texto(w, "nuip")).toBe("9999123456");
    expect(fases).toStrictEqual(["permiso", "activo", "listo", "leyendo", "resultado"]);
    w.unmount();
  });

  it("SDK-33 Desmontaje en activo: el controlador recibió destruir y las pistas están en ended", async () => {
    const f = crearFalsos({ manual: true });
    const s = espia();
    const w = mount(componente({}, { deps: f.deps, crear: s.crear }));
    await w.get('[data-prueba="iniciar"]').trigger("click");
    await esperar(s.ultimo().obtenerEstado, (e) => e.fase === "activo");
    await flushPromises();
    expect(texto(w, "fase")).toBe("activo");
    w.unmount();
    expect(s.destruidos).toBe(1);
    expect(f.pistas.every((p) => p.readyState === "ended")).toBe(true);
  });

  it("SDK-33 cancelar, reintentar y opciones inválidas llegan a la vista", async () => {
    const f = crearFalsos({ manual: true });
    const s = espia();
    const w = mount(componente({}, { deps: f.deps, crear: s.crear }));
    await w.get('[data-prueba="iniciar"]').trigger("click");
    await esperar(s.ultimo().obtenerEstado, (e) => e.fase === "activo");
    await w.get('[data-prueba="cancelar"]').trigger("click");
    expect(texto(w, "fase")).toBe("inicio");
    w.unmount();
    const g = crearFalsos({ camara: { name: "NotAllowedError" } });
    const s2 = espia();
    const w2 = mount(componente({}, { deps: g.deps, crear: s2.crear }));
    await w2.get('[data-prueba="iniciar"]').trigger("click");
    await esperar(s2.ultimo().obtenerEstado, (e) => e.fase === "error");
    await flushPromises();
    expect(texto(w2, "error")).toBe("camara-denegada");
    await w2.get('[data-prueba="reintentar"]').trigger("click");
    expect(s2.ultimo().obtenerEstado().intento).toBe(2);
    w2.unmount();
    const w3 = mount(componente({ servidor: "ftp://x" }, { deps: crearFalsos().deps }));
    await flushPromises();
    expect(texto(w3, "error")).toBe("opcion-invalida");
    w3.unmount();
  });

  it("SDK-33 montado sin <video>: iniciar no abre la cámara", async () => {
    const f = crearFalsos();
    let a: ReturnType<typeof useLectorCedula> | null = null;
    const w = mount(
      defineComponent({
        setup() {
          a = useLectorCedula({}, { deps: f.deps });
          return () => h("span", a?.estado.value.fase);
        },
      }),
    );
    await (a as unknown as ReturnType<typeof useLectorCedula>).iniciar();
    await flushPromises();
    expect(f.camarasAbiertas).toBe(0);
    expect(w.text()).toBe("inicio");
    w.unmount();
  });

  it("SDK-33 tras desmontar no hay más actualizaciones y las acciones no lanzan", async () => {
    const f = crearFalsos({ manual: true });
    let acciones: ReturnType<typeof useLectorCedula> | null = null;
    const w = mount(
      defineComponent({
        setup() {
          acciones = useLectorCedula({}, { deps: f.deps });
          return () => h("video", { ref: acciones?.videoRef });
        },
      }),
    );
    w.unmount();
    const a = acciones as unknown as ReturnType<typeof useLectorCedula>;
    await expect(a.iniciar()).resolves.toBeUndefined();
    expect(() => a.cancelar()).not.toThrow();
    expect(() => a.reintentar()).not.toThrow();
    expect(f.camarasAbiertas).toBe(0);
    expect(a.estado.value.fase).toBe("inicio");
  });
});
