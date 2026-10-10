// Route handler del backend propio (MOT-12, MOT-13): el motor corre en este proceso del servidor de la empresa.
// Ley 1581 de 2012: la empresa obtiene antes la autorización del titular; aquí no se registra cuerpo, imagen ni campos.
import { crearLectorServidor, type DocumentoConfirmado } from "@lector-cedula/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo para las pruebas del ejemplo: NUIP de la última confirmación, en memoria. */
const confirmaciones = { total: 0, ultimoNuip: null as string | null };
(globalThis as { __confirmacionesEjemplo?: typeof confirmaciones }).__confirmacionesEjemplo = confirmaciones;

const lector = crearLectorServidor({
  alConfirmar(documento: DocumentoConfirmado) {
    confirmaciones.total++;
    confirmaciones.ultimoNuip = ((documento.campos as { nuip?: string }).nuip ?? null);
  },
});

export const POST = lector.next();
