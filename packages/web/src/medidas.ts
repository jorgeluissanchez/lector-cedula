// SDK-09: medida `lector-cedula:tiempo` (de `leyendo` a `resultado`) con la User Timing API, si existe. Solo tiempos.
const MARCA = "lector-cedula:inicio";
type Rendimiento = Pick<Performance, "mark" | "measure" | "clearMarks">;
const rendimiento = (): Rendimiento | undefined => (globalThis as { performance?: Rendimiento }).performance;

export function marcarInicioLectura(): void {
  try {
    rendimiento()?.clearMarks(MARCA);
    rendimiento()?.mark(MARCA);
  } catch {
    // Sin User Timing: no hay medida.
  }
}

export function medirLectura(): void {
  try {
    rendimiento()?.measure("lector-cedula:tiempo", MARCA);
  } catch {
    // Sin marca previa o sin User Timing.
  }
}
