// MOT-04 y MOT-05 (tiempo con terminate): pool de worker_threads con un worker falso (mismo protocolo que el real).
// Los escenarios con la cédula real están en motor.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { crearPool, type Pool } from "../src/pool.js";

const FALSO = new URL("./ayudas/trabajador-falso.mjs", import.meta.url);
const abiertos: Pool[] = [];
afterEach(async () => {
  while (abiertos.length) await abiertos.pop()?.cerrar();
});

function pool(hilos: number, colaMaxima = 64): Pool {
  const p = crearPool({ archivo: FALSO, hilos, colaMaxima });
  abiertos.push(p);
  return p;
}

async function codigo(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resuelve";
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? "sin-codigo";
  }
}

describe("MOT-04 pool de worker_threads", { timeout: 60_000 }, () => {
  it("MOT-04 Concurrencia acotada: 8 tareas con 2 hilos, máximo 2 en curso", async () => {
    const p = pool(2);
    const r = await Promise.all(Array.from({ length: 8 }, () => p.ejecutar({ accion: "dormir", ms: 40 })));
    expect(r).toHaveLength(8);
    expect(p.estadisticas().maximoEnCurso).toBe(2);
    expect(p.estadisticas().workers).toBe(2);
  });

  it("MOT-04 Cola llena: hilos 1, colaMaxima 2, la cuarta rechaza con motor-ocupado", async () => {
    const p = pool(1, 2);
    const codigos = await Promise.all(Array.from({ length: 4 }, () => codigo(p.ejecutar({ accion: "dormir", ms: 60 }))));
    expect(codigos).toStrictEqual(["resuelve", "resuelve", "resuelve", "motor-ocupado"]);
  });

  it("MOT-04 Cierre: las pendientes rechazan con motor-cerrado, los workers salen y no se aceptan más", async () => {
    const p = crearPool({ archivo: FALSO, hilos: 2, colaMaxima: 8 });
    const pendientes = Array.from({ length: 3 }, () => codigo(p.ejecutar({ accion: "dormir", ms: 5_000 })));
    await expect.poll(() => p.estadisticas().enCurso).toBe(2);
    const salidas: number[] = [];
    for (const w of p.trabajadores()) {
      const id = w.threadId;
      w.once("exit", () => salidas.push(id));
    }
    const ids = p.trabajadores().map((w) => w.threadId);
    await p.cerrar();
    expect(await Promise.all(pendientes)).toStrictEqual(["motor-cerrado", "motor-cerrado", "motor-cerrado"]);
    await expect.poll(() => salidas.length).toBe(2);
    expect(salidas.sort()).toStrictEqual(ids.sort());
    expect(await codigo(p.ejecutar({ accion: "eco" }))).toBe("motor-cerrado");
    await p.cerrar();
  });

  it("MOT-04 Worker caído: motor-error-interno, se reemplaza y la siguiente resuelve", async () => {
    const p = pool(1);
    const antes = p.trabajadores()[0]?.threadId;
    expect(await codigo(p.ejecutar({ accion: "salir" }))).toBe("motor-error-interno");
    expect(await p.ejecutar({ accion: "eco" })).toStrictEqual({ accion: "eco", suma: 0 });
    expect(p.trabajadores()[0]?.threadId).not.toBe(antes);
  });

  it("MOT-05 Tiempo agotado: terminate, reemplazo y la siguiente resuelve", async () => {
    const p = pool(1);
    const antes = p.trabajadores()[0]?.threadId;
    expect(await codigo(p.ejecutar({ accion: "dormir", ms: 5_000 }, { tiempoMs: 30 }))).toBe("tiempo-agotado");
    expect(await p.ejecutar({ accion: "eco" })).toStrictEqual({ accion: "eco", suma: 0 });
    expect(p.trabajadores()[0]?.threadId).not.toBe(antes);
  });

  it("MOT-21 cancelación con AbortSignal: en curso (terminate) y en cola (sin ejecutar)", async () => {
    const p = pool(1, 4);
    const c1 = new AbortController();
    const c2 = new AbortController();
    const enCurso = codigo(p.ejecutar({ accion: "dormir", ms: 5_000 }, { senal: c1.signal }));
    const enCola = codigo(p.ejecutar({ accion: "eco" }, { senal: c2.signal }));
    await expect.poll(() => p.estadisticas().enCurso).toBe(1);
    c2.abort();
    expect(await enCola).toBe("cancelado");
    c1.abort();
    expect(await enCurso).toBe("cancelado");
    expect(await codigo(p.ejecutar({ accion: "eco" }, { senal: AbortSignal.abort() }))).toBe("cancelado");
    expect(await p.ejecutar({ accion: "eco" })).toStrictEqual({ accion: "eco", suma: 0 });
    // La de la cola cancelada y la ya abortada nunca llegaron a un worker.
    expect(p.estadisticas().tareas).toBe(2);
  });

  it("MOT-07 el ArrayBuffer se transfiere (no se copia) y el worker lo pone a cero", async () => {
    const p = pool(1);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const r = await p.ejecutar({ accion: "eco", bytes: bytes.buffer }, { transferir: [bytes.buffer] });
    expect(r).toStrictEqual({ accion: "eco", suma: 10 });
    expect(bytes.byteLength).toBe(0);
  });

  it("errores del worker con código conservan el código; progreso llega al llamador", async () => {
    const p = pool(1);
    expect(await codigo(p.ejecutar({ accion: "error" }))).toBe("formato-no-soportado");
    const progresos: number[] = [];
    await p.ejecutar({ accion: "progreso" }, { alProgreso: (x) => progresos.push(x) });
    expect(progresos).toStrictEqual([0.5]);
  });
});
