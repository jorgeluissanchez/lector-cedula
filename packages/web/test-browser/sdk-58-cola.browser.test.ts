// SDK-58 (privacidad, `B`): la cola sin red vive solo en memoria. En Chromium real, tras dejar una imagen en la cola
// (front-back sin red), vencerla o destruir el lector, ni IndexedDB, ni localStorage, ni sessionStorage, ni Cache
// Storage (fuera de `lector-cedula-sdk-*`) contienen datos, y al volver la red no hay petición. Datos de PERSONA_BASE.
import { describe, expect, it } from "vitest";
import { crearLector, type DependenciasLector } from "../src/index.js";
import { crearFalsos, esperar } from "../test/falsos.js";
import { crearBack } from "../test/backend/back-falso.js";

async function sinPersistencia(): Promise<void> {
  const bases = (await indexedDB.databases?.()) ?? [];
  expect(bases).toStrictEqual([]);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  const cachés = (await caches.keys()).filter((n) => !n.startsWith("lector-cedula-sdk-"));
  expect(cachés).toStrictEqual([]);
}

function montar(o: { tiempoColaMs?: number } = {}) {
  const back = crearBack("ok");
  const f = crearFalsos({ fetch: back.fetch });
  let conectar: (() => void) | null = null;
  const deps: DependenciasLector = {
    ...f.deps,
    senales: () => ({ memoriaGb: 8, nucleos: 8, simd: true }),
    enLinea: () => false,
    alConectar(fn) {
      conectar = fn;
      return () => {
        conectar = null;
      };
    },
  };
  const c = crearLector({ backend: "/api/cedula", ...o }, deps);
  return { c, back, volver: () => (conectar as (() => void) | null)?.() };
}

describe("SDK-58 cola sin red en el navegador", () => {
  it("SDK-58 Destruir con cola pendiente: sin persistencia y sin petición", async () => {
    const m = montar();
    await m.c.iniciar(document.createElement("video"));
    await esperar(m.c.obtenerEstado, (e) => e.verificacion?.etapa === "en-espera");
    await new Promise((r) => setTimeout(r, 0));
    await sinPersistencia();
    m.c.destruir();
    m.volver();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.back.peticiones).toHaveLength(0);
    await sinPersistencia();
  });

  it("SDK-58 Cola vencida con el temporizador real", async () => {
    const m = montar({ tiempoColaMs: 50 });
    await m.c.iniciar(document.createElement("video"));
    const e = await esperar(m.c.obtenerEstado, (x) => x.fase === "error", 5000);
    expect(e.error?.codigo).toBe("cola-vencida");
    expect(e.resultado?.confiable).toBe(false);
    m.volver();
    expect(m.back.peticiones).toHaveLength(0);
    await sinPersistencia();
  });
});
