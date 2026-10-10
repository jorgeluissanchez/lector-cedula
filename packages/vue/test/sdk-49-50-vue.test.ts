// @vitest-environment jsdom
// SDK-49 (autoIniciar) y SDK-50 (verificación) en el adaptador Vue, con DEPS y backend falsos.
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it } from "vitest";
import { crearLector, type ControladorLector, type DependenciasLector, type OpcionesLector } from "@lector-cedula/web";
import { useLectorCedula } from "../src/index.js";
import { crearFalsos, esperar, type OpcionesFalsas } from "../../web/test/falsos.js";
import { crearBack, type Guion } from "../../web/test/backend/back-falso.js";

function montar(opciones: OpcionesLector, falsos: OpcionesFalsas = {}, guiones: Guion[] = ["ok"]) {
  const back = crearBack(...guiones);
  const f = crearFalsos({ ...falsos, fetch: back.fetch });
  const deps: DependenciasLector = { ...f.deps, senales: () => ({ memoriaGb: 2, nucleos: 8, simd: true }), enLinea: () => true };
  const fases: string[] = [];
  let ctl: ControladorLector | null = null;
  const crear = (o: OpcionesLector, d?: DependenciasLector): ControladorLector => {
    const c = crearLector(o, d);
    ctl = c;
    c.suscribir((e) => {
      if (fases.at(-1) !== e.fase) fases.push(e.fase);
    });
    return c;
  };
  const w = mount(
    defineComponent({
      setup() {
        const l = useLectorCedula(opciones, { deps, crear });
        return () =>
          h("div", [
            h("video", { ref: l.videoRef }),
            h("span", { "data-prueba": "rechazo" }, l.estado.value.rechazo?.motivo ?? ""),
            h("span", { "data-prueba": "modo" }, `${l.estado.value.modo}/${String(l.estado.value.frontActivo)}/${l.estado.value.modoMotivo}`),
          ]);
      },
    }),
  );
  const estado = () => (ctl as unknown as ControladorLector).obtenerEstado();
  return { w, f, back, fases, estado };
}

describe("SDK-49 Apertura automática de la cámara (Vue)", () => {
  it("SDK-49 Arranque al montar", async () => {
    const m = montar({ autoIniciar: true }, { manual: true });
    await esperar(m.estado, (e) => e.fase === "activo");
    expect(m.fases).toStrictEqual(["permiso", "activo"]);
    expect(m.f.camarasAbiertas).toBe(1);
    m.w.unmount();
  });

  it("SDK-49 Navegador que exige gesto", async () => {
    const m = montar({ autoIniciar: true }, { camara: { name: "NotAllowedError" } });
    const e = await esperar(m.estado, (x) => x.error !== null);
    expect(e).toMatchObject({ fase: "inicio", error: { codigo: "autoinicio-fallido", causa: "camara-denegada" } });
    m.w.unmount();
  });

  it("SDK-49 Sin autoIniciar", () => {
    const m = montar({});
    expect(m.estado().fase).toBe("inicio");
    expect(m.f.camarasAbiertas).toBe(0);
    m.w.unmount();
  });
});

describe("SDK-50 Adaptadores con verificación (Vue)", () => {
  it("SDK-50 Rechazo visible en Vue", async () => {
    const m = montar({ backend: "/api/cedula", autoIniciar: true }, {}, ["rechazo:ilegible", "colgado"]);
    await esperar(m.estado, (e) => e.rechazo !== null);
    await m.w.vm.$nextTick();
    expect(m.w.get('[data-prueba="rechazo"]').text()).toBe("ilegible");
    expect(m.fases[m.fases.indexOf("verificando") + 1]).toBe("activo");
    m.w.unmount();
  });

  it("SDK-57 front-back auto con dispositivo débil: front ligero visible", async () => {
    const m = montar({ backend: "/api/cedula", validacion: "auto", autoIniciar: true });
    await esperar(m.estado, (e) => e.fase === "resultado");
    await m.w.vm.$nextTick();
    expect(m.w.get('[data-prueba="modo"]').text()).toBe("front-back/false/memoria-baja");
    expect(m.fases).toStrictEqual(["permiso", "activo", "listo", "verificando", "resultado"]);
    m.w.unmount();
  });
});
