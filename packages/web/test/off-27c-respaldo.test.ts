// OFF-27c en el núcleo: el respaldo MRZ final de una pista PDF417 viaja con `respaldoDe: "pdf417"` hasta el Worker
// (presupuesto corto: TD1 y 4 llamadas); otras llamadas no lo llevan.
import type { FrameLectura, ResultadoLectura, TipoLectura } from "@lector-cedula/capture";
import { describe, expect, it } from "vitest";
import { crearClienteLector, type PuertoLector } from "../src/cliente-lector.js";
import { leerSecuencia } from "../src/secuencia.js";

const NO: ResultadoLectura = { ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" };
const frame = (): FrameLectura => ({ ancho: 2, alto: 2, pixeles: new Uint8ClampedArray(16).fill(9), origen: "video" });

async function llamadas(pista: TipoLectura | null, n = 2): Promise<{ lector: TipoLectura | null; respaldoDe: TipoLectura | undefined }[]> {
  const vistas: { lector: TipoLectura | null; respaldoDe: TipoLectura | undefined }[] = [];
  await leerSecuencia(
    Array.from({ length: n }, frame),
    pista,
    async (_f, lector, respaldoDe) => {
      vistas.push({ lector, respaldoDe });
      return NO;
    },
    { ahora: () => 0 },
  );
  return vistas;
}

describe("OFF-27c respaldo acotado en leerSecuencia", () => {
  it("OFF-27c pista pdf417: solo la llamada final de respaldo (mrz) lleva respaldoDe pdf417", async () => {
    expect(await llamadas("pdf417")).toStrictEqual([
      { lector: "pdf417", respaldoDe: undefined },
      { lector: "pdf417", respaldoDe: undefined },
      { lector: "mrz", respaldoDe: "pdf417" },
    ]);
  });

  it("OFF-27c pista mrz: el respaldo pdf417 no lleva respaldoDe; sin pista tampoco", async () => {
    expect(await llamadas("mrz", 1)).toStrictEqual([
      { lector: "mrz", respaldoDe: undefined },
      { lector: "pdf417", respaldoDe: undefined },
    ]);
    expect(await llamadas(null, 1)).toStrictEqual([{ lector: null, respaldoDe: undefined }]);
  });

  it("OFF-27c el cliente del Worker reenvía respaldoDe pdf417 en el mensaje y no lo inventa", async () => {
    const mensajes: Record<string, unknown>[] = [];
    let alMensaje: (e: MessageEvent<unknown>) => void = () => undefined;
    const puerto: PuertoLector = {
      postMessage(m) {
        const msg = m as Record<string, unknown>;
        mensajes.push(msg);
        queueMicrotask(() => alMensaje({ data: { tipo: "resultado", id: msg.id, resultado: NO } } as MessageEvent<unknown>));
      },
      addEventListener(tipo: string, f: (e: never) => void) {
        if (tipo === "message") alMensaje = f as (e: MessageEvent<unknown>) => void;
      },
      terminate() {},
    };
    const c = crearClienteLector(puerto);
    await c.leer(frame(), "2026-10-06", undefined, { pista: "mrz", respaldo: false, respaldoDe: "pdf417" });
    await c.leer(frame(), "2026-10-06", undefined, { pista: "mrz", respaldo: false });
    expect(mensajes[0]?.respaldoDe).toBe("pdf417");
    expect("respaldoDe" in (mensajes[1] ?? {})).toBe(false);
  });
});
