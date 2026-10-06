// Métricas por campo para las evals (principio II). Funciones puras para poder probarlas.

/** Distancia de Levenshtein entre dos cadenas. */
export function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  // Los tres atajos son equivalentes a la programación dinámica de abajo (tools/test/metricas.test.mjs,
  // "levenshtein coincide con la definición recursiva"): con s === t la diagonal suma 0; con s vacía no
  // entra en el bucle y devuelve prev[t.length] = t.length; con t vacía cada fila es [i] y devuelve s.length.
  // Por eso, de las dos variantes de ConditionalExpression de cada atajo, solo la `false` (quitar el atajo)
  // es equivalente. La `true` (tomar siempre el atajo) no lo es: devolvería 0, t.length o s.length para
  // cualquier par. Se desactivan las dos a conciencia porque Stryker no permite desactivar una sola variante;
  // la `true` la cubre la propiedad contra el oráculo recursivo de tools/test/metricas.test.mjs.
  // Stryker disable next-line ConditionalExpression: solo la variante false es equivalente; true la cubre el oráculo.
  if (s === t) return 0;
  // Stryker disable next-line ConditionalExpression: solo la variante false es equivalente; true la cubre el oráculo.
  if (s.length === 0) return t.length;
  // Stryker disable next-line ConditionalExpression: solo la variante false es equivalente; true la cubre el oráculo.
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

/** `esperado` válido (EV-05): objeto no nulo que no es array. */
function esObjetoPlano(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Nombre legible del tipo de un valor para los mensajes de EV-05. */
function describirTipo(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
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
    if (!esObjetoPlano(esperado)) {
      throw new Error(`El esperado de un caso de tipo "${tipo}" no es un objeto: es ${describirTipo(esperado)} (EV-05)`);
    }
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

/**
 * Lanza un `Error` con la ruta, el tipo y la palabra `esperado` en el primer fixture cuyo `esperado` no es
 * un objeto no nulo ni array (EV-05). El corredor la llama antes de compilar para fallar pronto.
 * @param {{ruta: string, tipo: string, esperado: unknown}[]} fixtures
 */
export function validarEsperados(fixtures) {
  for (const f of fixtures) {
    if (!esObjetoPlano(f.esperado)) {
      throw new Error(`${f.ruta}: el esperado del fixture de tipo "${f.tipo}" no es un objeto: es ${describirTipo(f.esperado)} (EV-05)`);
    }
  }
}

/**
 * Convierte fixtures en casos para `agregar` (EV-01, EV-05). Primero valida el `esperado` de todos los
 * fixtures y lanza un `Error` con la ruta, el tipo y la palabra `esperado` si alguno no es un objeto no
 * nulo ni array, sin invocar al evaluador. Después evalúa cada fixture con `evaluar(tipo, entrada, opciones)`;
 * una excepción del evaluador se recoge en `errores` como `"<ruta>: <mensaje>"` y el caso queda con
 * resultado `{}`. `clavesExactas` solo es `true` si el fixture trae el booleano `true`.
 * @param {{ruta: string, tipo: string, entrada: unknown, opciones?: unknown, esperado: unknown, clavesExactas?: unknown}[]} fixtures
 * @param {(tipo: string, entrada: unknown, opciones: unknown) => unknown} evaluar
 * @returns {{casos: {tipo: string, esperado: object, obtenido: unknown, clavesExactas: boolean}[], errores: string[]}}
 */
export function construirCasos(fixtures, evaluar) {
  validarEsperados(fixtures);
  const casos = [];
  const errores = [];
  for (const f of fixtures) {
    let obtenido;
    try {
      obtenido = evaluar(f.tipo, f.entrada, f.opciones);
    } catch (e) {
      errores.push(`${f.ruta}: ${e.message}`);
      obtenido = {};
    }
    casos.push({ tipo: f.tipo, esperado: f.esperado, obtenido, clavesExactas: f.clavesExactas === true });
  }
  return { casos, errores };
}

/**
 * Decide si la caída de `n` se evalúa (EV-03): solo entre ejecuciones del mismo modo (`quick` o
 * `completo`). Un baseline sin modo, guardado antes de registrar el modo, se compara siempre.
 */
export function mismoModo(modoBaseline, modoActual) {
  return modoBaseline === undefined || modoBaseline === modoActual;
}

/**
 * Compara con el baseline y devuelve la lista de regresiones: campo desaparecido, caída de `n` (EV-03,
 * si `compararN`), caída de exact match y subida de CER (tolerancia para ruido de punto flotante).
 */
export function regresiones(actual, baseline, { tolerancia = 1e-9, compararN = true } = {}) {
  const r = [];
  for (const [tipo, campos] of Object.entries(baseline ?? {})) {
    for (const [campo, base] of Object.entries(campos)) {
      const act = actual?.[tipo]?.[campo];
      if (!act) {
        r.push(`${tipo}.${campo}: desapareció de las evals (antes n=${base.n})`);
        continue;
      }
      if (compararN && act.n < base.n) {
        r.push(`${tipo}.${campo}: n bajó de ${base.n} a ${act.n} (se perdieron casos)`);
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
