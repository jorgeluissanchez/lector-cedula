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

describe("pool: casos borde (mutación)", { timeout: 60_000 }, () => {
  it("MOT-04 maximoEnCurso cuenta solo los hilos ocupados", async () => {
    const p = pool(3);
    await p.ejecutar({ accion: "eco" });
    expect(p.estadisticas()).toMatchObject({ maximoEnCurso: 1, enCurso: 0, workers: 3, tareas: 1 });
  });

  it("MOT-04 con un hilo libre se acepta aunque la cola máxima sea 0", async () => {
    const p = pool(2, 0);
    const a = p.ejecutar({ accion: "dormir", ms: 200 });
    await expect.poll(() => p.estadisticas().enCurso).toBe(1);
    expect(await p.ejecutar({ accion: "eco" })).toStrictEqual({ accion: "eco", suma: 0 });
    expect(await codigo(p.ejecutar({ accion: "eco" }).then(() => a))).toBe("resuelve");
  });

  it("MOT-04 tras caer un worker se despacha la tarea en cola", async () => {
    const p = pool(1, 4);
    const [a, b] = await Promise.all([codigo(p.ejecutar({ accion: "salir" })), p.ejecutar({ accion: "eco" })]);
    expect(a).toBe("motor-error-interno");
    expect(b).toStrictEqual({ accion: "eco", suma: 0 });
  });

  it("MOT-05 tras agotar el tiempo se despacha la tarea en cola y el worker viejo no deja hilos de más", async () => {
    const p = pool(1, 4);
    const viejo = p.trabajadores()[0];
    const salida = new Promise((r) => viejo?.once("exit", r));
    const [a, b] = await Promise.all([codigo(p.ejecutar({ accion: "dormir", ms: 5_000 }, { tiempoMs: 30 })), p.ejecutar({ accion: "eco" })]);
    expect(a).toBe("tiempo-agotado");
    expect(b).toStrictEqual({ accion: "eco", suma: 0 });
    await salida;
    expect(p.estadisticas().workers).toBe(1);
    expect(await p.ejecutar({ accion: "eco" })).toStrictEqual({ accion: "eco", suma: 0 });
  });

  it("MOT-04 un worker que muere sin tarea se reemplaza y el pool sigue", async () => {
    const p = pool(1);
    const viejo = p.trabajadores()[0];
    const salida = new Promise((r) => viejo?.once("exit", r));
    await p.ejecutar({ accion: "salir-luego" });
    await salida;
    await expect.poll(() => p.trabajadores()[0]?.threadId !== viejo?.threadId).toBe(true);
    expect(p.estadisticas().workers).toBe(1);
    expect(await p.ejecutar({ accion: "eco" })).toStrictEqual({ accion: "eco", suma: 0 });
  });

  it("MOT-05 una tarea que termina antes del tiempo no deja el temporizador ni la escucha vivos", async () => {
    const p = pool(1);
    const id = p.trabajadores()[0]?.threadId;
    // Calienta el worker: su arranque no debe contar en los 40 ms.
    await p.ejecutar({ accion: "eco" });
    const control = new AbortController();
    await p.ejecutar({ accion: "eco" }, { tiempoMs: 40, senal: control.signal });
    const b = p.ejecutar({ accion: "dormir", ms: 150 });
    control.abort();
    await new Promise((r) => setTimeout(r, 80));
    expect(await b).toStrictEqual({ accion: "dormir", suma: 0 });
    expect(p.trabajadores()[0]?.threadId).toBe(id);
  });

  it("MOT-21 cancelar la tarea en curso no quita la que espera en la cola", async () => {
    const p = pool(1, 4);
    const control = new AbortController();
    const a = codigo(p.ejecutar({ accion: "dormir", ms: 5_000 }, { senal: control.signal }));
    const b = p.ejecutar({ accion: "eco" });
    await expect.poll(() => p.estadisticas().enCurso).toBe(1);
    control.abort();
    expect(await a).toBe("cancelado");
    expect(await b).toStrictEqual({ accion: "eco", suma: 0 });
  });

  it("MOT-04 se ignoran mensajes con otro id y el progreso sin callback no falla", async () => {
    const p = pool(1);
    expect(await p.ejecutar({ accion: "doble" })).toStrictEqual({ accion: "doble", suma: 0 });
    expect(await p.ejecutar({ accion: "progreso" })).toStrictEqual({ accion: "progreso", suma: 0 });
  });

  it("MOT-04 un código de error desconocido del worker es motor-error-interno", async () => {
    const p = pool(1);
    expect(await codigo(p.ejecutar({ accion: "error-raro" }))).toBe("motor-error-interno");
  });

  it("MOT-07 workerData llega al worker y LECTOR_MOTOR_EXEC_ARGV solo cuenta con NODE_ENV=test", async () => {
    const antes = { argv: process.env.LECTOR_MOTOR_EXEC_ARGV, entorno: process.env.NODE_ENV };
    try {
      process.env.LECTOR_MOTOR_EXEC_ARGV = "--no-warnings\n--no-deprecation";
      const con = crearPool({ archivo: FALSO, hilos: 1, colaMaxima: 1, datos: { rutaModelo: "x" } });
      abiertos.push(con);
      expect(await con.ejecutar({ accion: "argv" })).toStrictEqual({ execArgv: ["--no-warnings", "--no-deprecation"], datos: { rutaModelo: "x" } });
      process.env.NODE_ENV = "production";
      const sin = crearPool({ archivo: FALSO, hilos: 1, colaMaxima: 1 });
      abiertos.push(sin);
      expect(await sin.ejecutar({ accion: "argv" })).toStrictEqual({ execArgv: [], datos: null });
    } finally {
      process.env.NODE_ENV = antes.entorno;
      if (antes.argv === undefined) delete process.env.LECTOR_MOTOR_EXEC_ARGV;
      else process.env.LECTOR_MOTOR_EXEC_ARGV = antes.argv;
    }
  });
});
