// @vitest-environment jsdom
// SDK-49 (autoIniciar) y SDK-50 (verificación) en el adaptador React, con DEPS y backend falsos.
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { DependenciasLector, OpcionesLector } from "@lector-cedula/web";
import { useLectorCedula } from "../src/index.js";
import { crearFalsos, type OpcionesFalsas } from "../../web/test/falsos.js";
import { crearBack, type Guion } from "../../web/test/backend/back-falso.js";

afterEach(cleanup);

function Prueba(props: { opciones: OpcionesLector; deps: DependenciasLector }) {
  const l = useLectorCedula(props.opciones, { deps: props.deps });
  return createElement(
    "div",
    { "data-fase": l.estado.fase },
    createElement("video", { ref: l.videoRef }),
    createElement("span", { "data-prueba": "fase" }, l.estado.fase),
    createElement("span", { "data-prueba": "etapa" }, l.estado.verificacion?.etapa ?? ""),
    createElement("span", { "data-prueba": "confiable" }, String(l.estado.resultado?.confiable ?? "")),
    createElement("span", { "data-prueba": "rechazo" }, l.estado.rechazo?.motivo ?? ""),
    createElement("span", { "data-prueba": "modo" }, `${l.estado.modo}/${l.estado.validacion}/${String(l.estado.frontActivo)}`),
    createElement("span", { "data-prueba": "error" }, `${l.estado.error?.codigo ?? ""}/${l.estado.error?.causa ?? ""}`),
  );
}

const q = (p: string): string => document.querySelector(`[data-prueba="${p}"]`)?.textContent ?? "";

function observar(p: string): string[] {
  const vistos = [q(p)];
  const el = document.querySelector(`[data-prueba="${p}"]`) as HTMLElement;
  new MutationObserver(() => {
    const t = q(p);
    if (vistos.at(-1) !== t) vistos.push(t);
  }).observe(el, { childList: true, characterData: true, subtree: true });
  return vistos;
}

function montar(opciones: OpcionesLector, falsos: OpcionesFalsas = {}, guiones: Guion[] = ["ok"]) {
  const back = crearBack(...guiones);
  const f = crearFalsos({ ...falsos, fetch: back.fetch });
  const deps: DependenciasLector = { ...f.deps, senales: () => ({ memoriaGb: 8, nucleos: 8, simd: true }), enLinea: () => true };
  return { f, back, deps };
}

describe("SDK-49 Apertura automática de la cámara (React)", () => {
  it("SDK-49 Arranque al montar", async () => {
    const m = montar({ autoIniciar: true }, { manual: true });
    await act(async () => {
      render(createElement(Prueba, { opciones: { autoIniciar: true }, deps: m.deps }));
    });
    await waitFor(() => expect(q("fase")).toBe("activo"));
    expect(m.f.camarasAbiertas).toBe(1);
  });

  it("SDK-49 Arranque al montar en StrictMode: una sola cámara viva", async () => {
    const m = montar({ autoIniciar: true }, { manual: true });
    await act(async () => {
      render(createElement(StrictMode, null, createElement(Prueba, { opciones: { autoIniciar: true }, deps: m.deps })));
    });
    await waitFor(() => expect(q("fase")).toBe("activo"));
    expect(m.f.pistas.filter((p) => p.readyState === "live")).toHaveLength(1);
  });

  it("SDK-49 Navegador que exige gesto", async () => {
    const m = montar({ autoIniciar: true }, { camara: { name: "NotAllowedError" } });
    await act(async () => {
      render(createElement(Prueba, { opciones: { autoIniciar: true }, deps: m.deps }));
    });
    await waitFor(() => expect(q("error")).toBe("autoinicio-fallido/camara-denegada"));
    expect(q("fase")).toBe("inicio");
  });

  it("SDK-49 Sin autoIniciar", async () => {
    const m = montar({});
    await act(async () => {
      render(createElement(Prueba, { opciones: {}, deps: m.deps }));
    });
    expect(q("fase")).toBe("inicio");
    expect(m.f.camarasAbiertas).toBe(0);
  });
});

describe("SDK-50 Adaptadores con verificación (React)", () => {
  it("SDK-50 Estado de verificación en React", async () => {
    const o: OpcionesLector = { backend: "/api/cedula", autoIniciar: true };
    const m = montar(o);
    render(createElement(Prueba, { opciones: o, deps: m.deps }));
    const etapas = observar("etapa");
    await act(async () => undefined);
    await waitFor(() => expect(q("confiable")).toBe("true"));
    expect(etapas.filter((e) => e !== "")).toStrictEqual(["recibido", "leyendo", "fraude", "comparando"]);
    expect(q("modo")).toBe("front-back/estricta/true");
  });

  it("SDK-50 Rechazo visible y vuelta a activo", async () => {
    const o: OpcionesLector = { backend: "/api/cedula", autoIniciar: true };
    const m = montar(o, {}, ["rechazo:ilegible", "colgado"]);
    render(createElement(Prueba, { opciones: o, deps: m.deps }));
    const fases = observar("fase");
    await act(async () => undefined);
    await waitFor(() => expect(q("rechazo")).toBe("ilegible"));
    expect(fases[fases.indexOf("verificando") + 1]).toBe("activo");
  });

  it("SDK-55 modo y validación llegan sin transformar", async () => {
    const o: OpcionesLector = { modo: "back", backend: "/api/cedula" };
    const m = montar(o);
    await act(async () => {
      render(createElement(Prueba, { opciones: o, deps: m.deps }));
    });
    expect(q("modo")).toBe("back/null/false");
  });
});
