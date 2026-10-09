// @vitest-environment jsdom
// SDK-31 Adaptador React y Next: estado reactivo, desmontaje y opciones, con React Testing Library y DEPS falsas.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { crearLector, type ControladorLector, type DependenciasLector, type OpcionesLector } from "@lector-cedula/web";
import { useLectorCedula, type AvanzadoLector } from "../src/index.js";
import { crearFalsos } from "../../web/test/falsos.js";

afterEach(cleanup);

/** Fábrica espía: registra cada controlador y sus llamadas a `destruir`. */
function espia(): { crear: NonNullable<AvanzadoLector["crear"]>; creados: ControladorLector[]; destruidos: number } {
  const r = {
    creados: [] as ControladorLector[],
    destruidos: 0,
    crear(o: OpcionesLector, d?: DependenciasLector): ControladorLector {
      const c = crearLector(o, d);
      const envuelto: ControladorLector = {
        ...c,
        destruir() {
          r.destruidos++;
          c.destruir();
        },
      };
      r.creados.push(envuelto);
      return envuelto;
    },
  };
  return r;
}

function Prueba(props: { opciones?: OpcionesLector; avanzado: AvanzadoLector }) {
  const l = useLectorCedula(props.opciones ?? {}, props.avanzado);
  return createElement(
    "div",
    { "data-fase": l.estado.fase },
    createElement("video", { ref: l.videoRef }),
    createElement("span", { "data-prueba": "fase" }, l.estado.fase),
    createElement("span", { "data-prueba": "nuip" }, l.estado.resultado?.campos.nuip ?? ""),
    createElement("span", { "data-prueba": "error" }, l.estado.error?.codigo ?? ""),
    createElement("button", { "data-prueba": "iniciar", onClick: () => void l.iniciar() }, "Iniciar"),
    createElement("button", { "data-prueba": "cancelar", onClick: () => l.cancelar() }, "Cancelar"),
    createElement("button", { "data-prueba": "reintentar", onClick: () => l.reintentar() }, "Reintentar"),
  );
}

const q = (p: string): HTMLElement => document.querySelector(`[data-prueba="${p}"]`) as HTMLElement;

/** Registra cada texto distinto que el DOM muestra en `[data-prueba="fase"]`. */
function observarFase(): string[] {
  const vistos = [q("fase").textContent ?? ""];
  new MutationObserver(() => {
    const t = q("fase").textContent ?? "";
    if (vistos.at(-1) !== t) vistos.push(t);
  }).observe(q("fase"), { childList: true, characterData: true, subtree: true });
  return vistos;
}

describe("SDK-31 Adaptador React y Next", () => {
  it("SDK-31 Estado reactivo: la fase recorre permiso, activo, listo, leyendo y resultado y se muestra el NUIP", async () => {
    const f = crearFalsos();
    render(createElement(Prueba, { avanzado: { deps: f.deps } }));
    const vistos = observarFase();
    await act(async () => {
      fireEvent.click(screen.getByText("Iniciar"));
    });
    await waitFor(() => expect(q("fase").textContent).toBe("resultado"));
    expect(vistos).toStrictEqual(["inicio", "permiso", "activo", "listo", "leyendo", "resultado"]);
    expect(q("nuip").textContent).toBe("9999123456");
  });

  it("SDK-31 Desmontaje en activo: destruir y pistas de la cámara en ended", async () => {
    const f = crearFalsos({ manual: true });
    const s = espia();
    const r = render(createElement(Prueba, { avanzado: { deps: f.deps, crear: s.crear } }));
    await act(async () => {
      fireEvent.click(screen.getByText("Iniciar"));
    });
    await waitFor(() => expect(q("fase").textContent).toBe("activo"));
    r.unmount();
    expect(s.destruidos).toBe(1);
    expect(f.pistas.length).toBeGreaterThan(0);
    expect(f.pistas.every((p) => p.readyState === "ended")).toBe(true);
  });

  it("SDK-31 cancelar y reintentar llegan al controlador", async () => {
    const f = crearFalsos({ manual: true, camara: { name: "NotAllowedError" } });
    const s = espia();
    render(createElement(Prueba, { avanzado: { deps: f.deps, crear: s.crear } }));
    await act(async () => {
      fireEvent.click(screen.getByText("Iniciar"));
    });
    await waitFor(() => expect(q("fase").textContent).toBe("error"));
    expect(q("error").textContent).toBe("camara-denegada");
    await act(async () => {
      fireEvent.click(screen.getByText("Reintentar"));
    });
    await waitFor(() => expect(q("fase").textContent).toBe("error"));
    expect(s.creados.at(-1)?.obtenerEstado().intento).toBe(2);
    const g = crearFalsos({ manual: true });
    cleanup();
    render(createElement(Prueba, { avanzado: { deps: g.deps } }));
    await act(async () => {
      fireEvent.click(screen.getByText("Iniciar"));
    });
    await waitFor(() => expect(q("fase").textContent).toBe("activo"));
    await act(async () => {
      fireEvent.click(screen.getByText("Cancelar"));
    });
    expect(q("fase").textContent).toBe("inicio");
    expect(g.pistas.every((p) => p.readyState === "ended")).toBe(true);
  });

  it("SDK-31 opciones inválidas: el estado del controlador (error opcion-invalida) llega al render", async () => {
    render(createElement(Prueba, { opciones: { servidor: "ftp://x" }, avanzado: { deps: crearFalsos().deps } }));
    await waitFor(() => expect(q("error").textContent).toBe("opcion-invalida"));
  });

  it("SDK-31 StrictMode y re-render con las mismas opciones: un solo controlador vivo; cambiar opciones lo recrea", async () => {
    const f = crearFalsos({ manual: true });
    const s = espia();
    const avanzado = { deps: f.deps, crear: s.crear };
    const r = render(createElement(StrictMode, null, createElement(Prueba, { opciones: { idioma: "es" }, avanzado })));
    r.rerender(createElement(StrictMode, null, createElement(Prueba, { opciones: { idioma: "es" }, avanzado })));
    expect(s.creados.length - s.destruidos).toBe(1);
    const antes = s.creados.length;
    r.rerender(createElement(StrictMode, null, createElement(Prueba, { opciones: { idioma: "en" }, avanzado })));
    expect(s.creados.length).toBe(antes + 1);
    expect(s.creados.length - s.destruidos).toBe(1);
    r.unmount();
    expect(s.creados.length).toBe(s.destruidos);
  });

  it("SDK-31 acciones antes de crear el controlador (callback ref, antes de useEffect): no-op sin lanzar", async () => {
    const f = crearFalsos();
    const resultados: Promise<void>[] = [];
    let sincronos: unknown = null;
    let hecho = false;
    function Temprano() {
      const l = useLectorCedula({}, { deps: f.deps });
      return createElement("video", {
        ref: (el: HTMLVideoElement | null) => {
          l.videoRef.current = el;
          // Solo en el primer commit (antes de useEffect); los renders siguientes crean otra función ref.
          if (el === null || hecho) return;
          hecho = true;
          resultados.push(l.iniciar());
          try {
            l.cancelar();
            l.reintentar();
          } catch (e) {
            sincronos = e;
          }
        },
      });
    }
    render(createElement(Temprano));
    expect(resultados).toHaveLength(1);
    for (const p of resultados) await expect(p).resolves.toBeUndefined();
    expect(sincronos).toBeNull();
    expect(f.camarasAbiertas).toBe(0);
  });

  it("SDK-31 iniciar sin <video> montado no llama a la cámara", async () => {
    const f = crearFalsos();
    function SinVideo() {
      const l = useLectorCedula({}, { deps: f.deps });
      return createElement("button", { onClick: () => void l.iniciar() }, l.estado.fase);
    }
    render(createElement(SinVideo));
    await act(async () => {
      fireEvent.click(screen.getByText("inicio"));
    });
    expect(f.camarasAbiertas).toBe(0);
    expect(screen.getByRole("button").textContent).toBe("inicio");
  });
});
