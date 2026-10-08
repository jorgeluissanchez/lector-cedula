/** OFF-23: presupuesto de MRZ de la PWA (LMI-13 usa 40 llamadas y 60 s; aquí se prioriza un error rápido). */
export const PRESUPUESTO_MRZ_PWA = Object.freeze({ maxLlamadasOcr: 12, tiempoLimiteMs: 15_000 });
/** OFF-28: realce del PDF417 para frames de vídeo y límite del decodificador por frame en la PWA. */
export const PDF417_PWA = Object.freeze({ realcePdf417: true, limitePdf417Ms: 6_000 });
