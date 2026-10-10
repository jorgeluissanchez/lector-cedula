// MOT-11: umbrales del benchmark del motor (spec) y su evaluación. Puro: sin E/S.

/** Umbrales de MOT-11 en `REF_SRV` (2 vCPU, 2 GiB, x64), motor caliente con `hilos: 2`. */
export const UMBRALES = Object.freeze({ p95_amarilla_ms: 1500, p95_digital_ms: 2500, frio_ms: 4000 });

/** Percentil por rango más cercano (`ceil(p/100 * n)`-ésima muestra ordenada); no muta la entrada. */
export function percentil(muestras, p) {
  if (muestras.length === 0) throw new Error("sin-muestras");
  const orden = [...muestras].sort((a, b) => a - b);
  const rango = Math.max(1, Math.ceil((p / 100) * orden.length));
  return orden[rango - 1];
}

const numero = (v) => typeof v === "number" && Number.isFinite(v);

/** Claves que incumplen (en orden fijo). Un valor ausente o no numérico cuenta como incumplido. */
export function evaluar(informe) {
  const fallos = [];
  for (const [clave, maximo] of Object.entries(UMBRALES)) {
    if (!numero(informe[clave]) || informe[clave] > maximo) fallos.push(clave);
  }
  if (informe.lecturas_fallidas !== 0) fallos.push("lecturas_fallidas");
  return fallos;
}
