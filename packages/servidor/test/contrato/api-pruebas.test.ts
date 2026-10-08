// SDK-19 (contrato del paquete contra la API real): `crearSesion`, errores tipados e idempotencia contra
// `api-pruebas` en Docker (comando `C` de design.md). Datos sintéticos: claves y URL de la spec.
//
//   docker compose -f server/compose.yaml up -d --wait api-pruebas
//   LECTOR_CONTRATO_OBLIGATORIO=1 npx vitest run packages/servidor/test/contrato
//
// Sin la API levantada, la suite se omite salvo con LECTOR_CONTRATO_OBLIGATORIO=1, que la hace fallar.
import { describe, expect, it } from "vitest";
import { crearCliente, ErrorLector } from "../../src/index.js";
import { AUT, KT } from "../ayudas.js";

const SERVIDOR = process.env["LECTOR_API_PRUEBAS"] ?? "http://localhost:8000";
const OBLIGATORIO = process.env["LECTOR_CONTRATO_OBLIGATORIO"] === "1";

async function apiDisponible(): Promise<boolean> {
  try {
    const r = await fetch(`${SERVIDOR}/salud`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

const disponible = await apiDisponible();
if (OBLIGATORIO && !disponible) throw new Error(`api-pruebas no responde en ${SERVIDOR}/salud`);

describe.skipIf(!disponible)("SDK-19 contrato contra api-pruebas", { timeout: 60_000 }, () => {
  const cliente = crearCliente({ servidor: SERVIDOR, clave: KT });

  it("SDK-19 Contrato contra el servidor real", async () => {
    const sesion = await cliente.crearSesion({
      autorizacion: AUT,
      tipoDocumento: "co_national-id-2000",
      urlRetorno: "https://app-a.example/volver",
    });
    expect(sesion.id).toMatch(/^val_[0-9a-f]{32}$/);
    expect(sesion.urlAlojada).toMatch(/^https:\/\/api\.lector-cedula\.example\/v\/[A-Za-z0-9_-]{43,}$/);
    expect(sesion.sandbox).toBe(true);
    expect(sesion.expiraEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    const validacion = await cliente.obtenerResultado(sesion.id);
    expect(validacion["status"]).toBe("pending");
    expect(validacion["return_url"]).toBe("https://app-a.example/volver");
    expect(validacion["hosted_url"]).toBe(sesion.urlAlojada);

    await cliente.suprimir(sesion.id);
    await expect(cliente.obtenerResultado(sesion.id)).rejects.toMatchObject({ estado: 404, tipo: "not-found" });
  });

  it("SDK-19 Error tipado", async () => {
    const error = await cliente
      .crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000", urlRetorno: "https://app-b.example/fin" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorLector);
    expect(error).toMatchObject({
      estado: 422,
      tipo: "invalid-request",
      errores: [{ pointer: "/return_url", code: "return_url_not_allowed" }],
    });
    expect(String((error as Error).message)).not.toContain("sk_test_");
  });

  it("SDK-19 Idempotencia", async () => {
    // Clave única por ejecución: la API guarda la respuesta 86 400 s y la suite puede repetirse.
    const claveIdempotencia = `idem-0001-${Date.now()}`;
    const entrada = { autorizacion: AUT, tipoDocumento: "co_national-id-2000", claveIdempotencia };
    const primera = await cliente.crearSesion(entrada);
    const segunda = await cliente.crearSesion(entrada);
    expect(segunda.id).toBe(primera.id);
  });

  it("SDK-16 Petición de servidor sin Origin y clave desconocida", async () => {
    const ajeno = crearCliente({ servidor: SERVIDOR, clave: "sk_test_99999999999999999999999999999999" });
    await expect(ajeno.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000" })).rejects.toMatchObject({
      estado: 401,
      tipo: "unauthorized",
    });
  });
});
