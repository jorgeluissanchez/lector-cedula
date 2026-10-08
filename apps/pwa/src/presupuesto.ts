/** OFF-23: presupuesto de MRZ de la PWA (LMI-13 usa 40 llamadas y 60 s; aquí se prioriza un error rápido). */
export const PRESUPUESTO_MRZ_PWA = Object.freeze({ maxLlamadasOcr: 12, tiempoLimiteMs: 15_000 });
