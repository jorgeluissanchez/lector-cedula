// Tarea 0.6: el pool real de @lector-cedula/motor conectado a crearLectorServidor. MOT-19 (manejador estándar con la
// amarilla), MOT-21 (confirmación con cliente coincidente) y MOT-22 (`ocupado` y `tiempo-agotado` con pool real).
import { crearMotor, type Motor } from "@lector-cedula/motor";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { crearLectorServidor } from "../../src/index.js";
import { amarilla, NUIP } from "../../../motor/test/ayudas/imagenes.js";
import { eventos, etapas, multipart, peticion, ultimo } from "./ayudas-lector.js";

let A: Uint8Array;
const motores: Motor[] = [];
beforeAll(async () => {
  A = await amarilla();
}, 60_000);
afterAll(async () => {
  await Promise.all(motores.map((m) => m.cerrar()));
});

async function motor(hilos: number, colaMaxima = 64): Promise<Motor> {
  const m = await crearMotor({ hilos, colaMaxima });
  motores.push(m);
  return m;
}

describe("crearLectorServidor con el motor real", { timeout: 120_000 }, () => {
  it("MOT-19 Manejador estándar y MOT-21 Confirmación con el cliente coincidente", async () => {
    const m = await motor(1);
    const local = await m.leerDocumento(A, { fraude: false });
    if (!local.ok) throw new Error("lectura local fallida");
    const cliente = { tipo: local.tipoDocumento, campos: local.campos, warnings: local.warnings, confiable: false, validacion_id: null };
    const alConfirmar = vi.fn();
    // Los fixtures sintéticos en grises dan riesgo alto ("fotocopia"); por defecto no bloquea (FRA-04): se devuelve.
    const lector = crearLectorServidor({ alConfirmar, motor: m });
    const r = await lector.manejar(peticion(multipart(A, cliente)));
    expect(r.status).toBe(200);
    const evs = await eventos(r);
    expect(etapas(evs)).toStrictEqual(["recibido", "leyendo", "fraude", "comparando", "resultado"]);
    expect(ultimo(evs)).toMatchObject({ etapa: "resultado", ok: true, documento: { campos: { nuip: NUIP }, confiable: true }, riesgo: { nivel: "alto" } });
    expect(alConfirmar).toHaveBeenCalledTimes(1);
  });

  it("MOT-22 ocupado con la cola llena del pool real", async () => {
    const m = await motor(1, 0);
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor: m });
    const [a, b] = await Promise.all([lector.manejar(peticion(multipart(A))), lector.manejar(peticion(multipart(A)))]);
    const finales = [ultimo(await eventos(a)), ultimo(await eventos(b))];
    expect(finales.map((f) => (f.ok === true ? "ok" : (f.rechazo as { motivo: string }).motivo)).sort()).toStrictEqual(["ocupado", "ok"]);
  });

  it("MOT-22 fraude con el pool real y bloquearSi alto: la amarilla sintética en grises (fotocopia) se rechaza", async () => {
    const m = await motor(1);
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor: m, fraude: { bloquearSi: "alto" } });
    expect(ultimo(await eventos(await lector.manejar(peticion(multipart(A)))))).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "fraude" } });
  });

  it("MOT-22 tiempo-agotado con el pool real (terminate y reemplazo)", async () => {
    const m = await motor(1);
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor: m, limites: { tiempoMs: 1 } });
    expect(ultimo(await eventos(await lector.manejar(peticion(multipart(A)))))).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "tiempo-agotado" } });
    expect(await m.leerDocumento(A, { fraude: false })).toMatchObject({ campos: { nuip: NUIP } });
  });
});
