// Métricas por campo para las evals (principio II). Funciones puras para poder probarlas.

/** Distancia de Levenshtein entre dos cadenas. */
export function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

/** CER: ediciones / longitud de la referencia. Valor nulo o ausente cuenta como error total. */
export function cer(obtenido, esperado) {
  const ref = esperado == null ? "" : String(esperado);
  const hyp = obtenido == null ? "" : String(obtenido);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return Math.min(1, levenshtein(hyp, ref) / ref.length);
}

function normalizar(v) {
  return v === undefined ? null : JSON.stringify(v);
}

/** Campo de métrica reservado para la comparación del conjunto de claves (EV-01, EV-02). */
export const CAMPO_CLAVES = "__claves";

/** Claves propias enumerables ordenadas, como JSON; conjunto vacío si no es objeto o es null (EV-01). */
function clavesOrdenadas(v) {
  return JSON.stringify(typeof v === "object" && v !== null ? Object.keys(v).sort() : []);
}

/**
 * Agrega resultados: {tipo: {campo: {n, exactos, cerSuma}}} -> {tipo: {campo: {n, exact_match, cer}}}
 * Con `clavesExactas: true` el caso suma además el campo `__claves` (EV-01): exacto si el conjunto de
 * claves del resultado es igual al de `esperado`, con CER 0 o 1. `__claves` en `esperado` lanza (EV-02).
 * @param {{tipo: string, esperado: object, obtenido: unknown, clavesExactas?: boolean}[]} casos
 */
export function agregar(casos) {
  const acc = {};
  for (const { tipo, esperado, obtenido, clavesExactas } of casos) {
    if (Object.hasOwn(esperado, CAMPO_CLAVES)) {
      throw new Error(`El esperado de un caso de tipo "${tipo}" usa el campo reservado "${CAMPO_CLAVES}" (EV-02)`);
    }
    acc[tipo] ??= {};
    if (clavesExactas === true) {
      const a = (acc[tipo][CAMPO_CLAVES] ??= { n: 0, exactos: 0, cerSuma: 0 });
      const exacto = clavesOrdenadas(obtenido) === clavesOrdenadas(esperado);
      a.n += 1;
      if (exacto) a.exactos += 1;
      else a.cerSuma += 1;
    }
    for (const [campo, valor] of Object.entries(esperado)) {
      const real = obtenido?.[campo];
      const a = (acc[tipo][campo] ??= { n: 0, exactos: 0, cerSuma: 0 });
      a.n += 1;
      if (normalizar(real) === normalizar(valor)) a.exactos += 1;
      a.cerSuma += typeof valor === "string" || typeof real === "string" ? cer(real, valor) : normalizar(real) === normalizar(valor) ? 0 : 1;
    }
  }
  const salida = {};
  for (const [tipo, campos] of Object.entries(acc)) {
    salida[tipo] = {};
    for (const [campo, a] of Object.entries(campos)) {
      salida[tipo][campo] = { n: a.n, exact_match: a.exactos / a.n, cer: a.cerSuma / a.n };
    }
  }
  return salida;
}

/** Compara con el baseline y devuelve la lista de regresiones (tolerancia para ruido de punto flotante). */
export function regresiones(actual, baseline, tolerancia = 1e-9) {
  const r = [];
  for (const [tipo, campos] of Object.entries(baseline ?? {})) {
    for (const [campo, base] of Object.entries(campos)) {
      const act = actual?.[tipo]?.[campo];
      if (!act) {
        r.push(`${tipo}.${campo}: desapareció de las evals (antes n=${base.n})`);
        continue;
      }
      if (act.exact_match + tolerancia < base.exact_match) {
        r.push(`${tipo}.${campo}: exact_match bajó de ${base.exact_match.toFixed(4)} a ${act.exact_match.toFixed(4)}`);
      }
      if (act.cer > base.cer + tolerancia) {
        r.push(`${tipo}.${campo}: CER subió de ${base.cer.toFixed(4)} a ${act.cer.toFixed(4)}`);
      }
    }
  }
  return r;
}
