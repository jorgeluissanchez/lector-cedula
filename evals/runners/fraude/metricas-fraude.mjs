/**
 * Métricas de detección de ataques de presentación según ISO/IEC 30107-3 (cambio deteccion-fraude, FRA-14, FRA-15).
 * Funciones puras. Un puntaje >= umbral clasifica la muestra como ataque.
 */

const Z95 = 1.959963984540054;

/** APCER: fracción de ataques aceptados como auténticos (puntaje < umbral). */
export function apcer(puntajesAtaque, umbral) {
  if (puntajesAtaque.length === 0) return 0;
  return puntajesAtaque.filter((p) => p < umbral).length / puntajesAtaque.length;
}

/** BPCER: fracción de auténticos clasificados como ataque (puntaje >= umbral). */
export function bpcer(puntajesAutenticos, umbral) {
  if (puntajesAutenticos.length === 0) return 0;
  return puntajesAutenticos.filter((p) => p >= umbral).length / puntajesAutenticos.length;
}

/** Intervalo de Wilson al 95 % para `exitos` de `n`. */
export function wilson(exitos, n) {
  if (n === 0) return [0, 1];
  const p = exitos / n;
  const z2 = Z95 * Z95;
  const centro = p + z2 / (2 * n);
  const margen = Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const den = 1 + z2 / n;
  return [Math.max(0, (centro - margen) / den), Math.min(1, (centro + margen) / den)];
}

/** AUC (Mann-Whitney): probabilidad de que un ataque puntúe más que un auténtico; empates cuentan 0,5. */
export function auc(puntajesAtaque, puntajesAutenticos) {
  if (puntajesAtaque.length === 0 || puntajesAutenticos.length === 0) return 0.5;
  let s = 0;
  for (const a of puntajesAtaque) for (const b of puntajesAutenticos) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (puntajesAtaque.length * puntajesAutenticos.length);
}

/** BPCER en el umbral más alto (0 a 101) cuya APCER máxima entre especies no supera `apcerObjetivo`. */
export function bpcerAApcer(especies, puntajesAutenticos, apcerObjetivo) {
  for (let t = 101; t >= 0; t--) {
    const max = Math.max(0, ...Object.values(especies).map((xs) => apcer(xs, t)));
    if (max <= apcerObjetivo) return bpcer(puntajesAutenticos, t);
  }
  return 1;
}

const redondear = (x) => Math.round(x * 1e6) / 1e6;

/** Métricas por documento: `filas` = `{ tipo, clase, puntaje }`; la clase `autentica` es la presentación genuina. */
export function metricasPorDocumento(filas, umbral) {
  const out = {};
  const tipos = [...new Set(filas.map((f) => f.tipo))].sort();
  for (const tipo of tipos) {
    const delTipo = filas.filter((f) => f.tipo === tipo);
    const autenticos = delTipo.filter((f) => f.clase === "autentica").map((f) => f.puntaje);
    const ataquesPorEspecie = {};
    for (const f of delTipo) if (f.clase !== "autentica") (ataquesPorEspecie[f.clase] ??= []).push(f.puntaje);
    const especies = {};
    for (const [clase, xs] of Object.entries(ataquesPorEspecie).sort(([a], [b]) => (a < b ? -1 : 1))) {
      const aceptados = xs.filter((p) => p < umbral).length;
      especies[clase] = { apcer: redondear(apcer(xs, umbral)), ic: wilson(aceptados, xs.length).map(redondear), n: xs.length };
    }
    const todosAtaques = Object.values(ataquesPorEspecie).flat();
    const rechazados = autenticos.filter((p) => p >= umbral).length;
    out[tipo] = {
      bpcer: redondear(bpcer(autenticos, umbral)),
      bpcerIc: wilson(rechazados, autenticos.length).map(redondear),
      apcerMax: Math.max(0, ...Object.values(especies).map((e) => e.apcer)),
      bpcerApcer5: redondear(bpcerAApcer(ataquesPorEspecie, autenticos, 0.05)),
      auc: redondear(auc(todosAtaques, autenticos)),
      n: { autenticos: autenticos.length, ataques: todosAtaques.length },
      especies,
    };
  }
  return out;
}

/** Métricas donde mayor es peor; el resto de las comparadas (auc) empeora al bajar. */
const MAYOR_ES_PEOR = new Set(["apcer", "bpcer", "apcerMax", "bpcerApcer5"]);
const COMPARADAS = new Set([...MAYOR_ES_PEOR, "auc"]);
const TOLERANCIA = 0.01;

function aplanar(obj, prefijo, out) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const ruta = prefijo === "" ? k : `${prefijo}.${k}`;
    if (typeof v === "number" && COMPARADAS.has(k)) out.set(ruta, { clave: k, valor: v });
    else aplanar(v, ruta, out);
  }
  return out;
}

/** Lista de regresiones de más de 1 punto frente al baseline (vacía si no hay). */
export function compararConBaseline(actual, baseline) {
  const a = aplanar(actual, "", new Map());
  const b = aplanar(baseline, "", new Map());
  const regresiones = [];
  for (const [ruta, { clave, valor }] of b) {
    const x = a.get(ruta);
    if (x === undefined) {
      regresiones.push(`${ruta}: ausente`);
      continue;
    }
    const delta = MAYOR_ES_PEOR.has(clave) ? x.valor - valor : valor - x.valor;
    if (delta > TOLERANCIA + 1e-9) regresiones.push(`${ruta}: ${valor} -> ${x.valor}`);
  }
  return regresiones;
}

/** Claves admitidas en un reporte de campo (FRA-15): métricas, conteos, versión y nombres de documento y especie. */
const CLAVES_REPORTE = new Set([
  "version",
  "umbral",
  "fecha",
  "documentos",
  "especies",
  "apcer",
  "bpcer",
  "bpcerIc",
  "apcerMax",
  "bpcerApcer5",
  "auc",
  "ic",
  "n",
  "autenticos",
  "ataques",
  "amarilla",
  "digital",
  "pantalla",
  "fotocopia-gris",
  "fotocopia-color",
  "impresion",
  "recortada",
  "editada",
]);

/** Valida el reporte agregado de campo: solo claves admitidas y valores numéricos (o `fecha` AAAA-MM). */
export function validarReporteCampo(r) {
  const visitar = (x) => {
    if (Array.isArray(x)) {
      for (const v of x) if (typeof v !== "number") return { ok: false, clave: "valor" };
      return null;
    }
    for (const [k, v] of Object.entries(x)) {
      if (!CLAVES_REPORTE.has(k)) return { ok: false, clave: k };
      if (k === "fecha") {
        if (typeof v !== "string" || !/^[0-9]{4}-[0-9]{2}$/.test(v)) return { ok: false, clave: k };
      } else if (v !== null && typeof v === "object") {
        const e = visitar(v);
        if (e !== null) return e;
      } else if (typeof v !== "number") return { ok: false, clave: k };
    }
    return null;
  };
  if (r === null || typeof r !== "object" || Array.isArray(r)) return { ok: false, clave: "raiz" };
  return visitar(r) ?? { ok: true };
}
