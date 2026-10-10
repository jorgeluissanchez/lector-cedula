// fixture-sintetico: solo PERSONA_BASE y catálogos del generador (NUIP 9999123456), nunca datos reales.
// NAT-07 (sdk-nativo): el bundle es un único IIFE ES2020 sin DOM ni E/S, síncrono y con entrada/salida JSON, y da en un
// contexto vm vacío lo mismo que el código fuente que usa la CLI (`leer-foto --sin-mascara`) y la PWA.
import { casosMrz, casosPdf417, PERSONA_BASE } from "@lector-cedula/fixtures";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { conLugarNacimiento, leerDocumento, type DependenciasLectura, type ResultadoLectura } from "../../capture/src/index.js";
import { buscarDivipol, parsearPdf417Amarilla } from "../../parsers/src/index.js";
import { aBase64, codigoBundle, evaluarEnVm, json, type ApiNucleo } from "./ayuda.js";

const FECHA = "2026-10-09";

function primero<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error("catálogo vacío");
  return x;
}
let codigo = "";
let api: ApiNucleo;
let crudo: ApiNucleo;
let contexto: Record<string, unknown>;

beforeAll(async () => {
  codigo = await codigoBundle();
  ({ api, crudo, contexto } = evaluarEnVm(codigo));
}, 60_000);

/** Pipeline de `leerDocumento` de packages/capture (el de la PWA) con el decodificador sustituido por los bytes dados. */
async function leerConFuente(bytes: Uint8Array | null, lineas: readonly string[] | null): Promise<ResultadoLectura> {
  const deps: DependenciasLectura = {
    decodificar: async () => (bytes === null ? { ok: false, error: "pdf417-no-encontrado" } : { ok: true, bytes, intento: "nativo" }) as never,
    lectorMrz: {
      leer: async (_p, op) => {
        const { interpretarLineasMrz } = await import("../../capture/src/index.js");
        if (lineas === null) return { ok: false, error: "mrz-no-encontrada" };
        const formato = (op as { formato?: string } | undefined)?.formato === "td3" ? "td3" : "td1";
        if ((lineas.length === 2) !== (formato === "td3")) return { ok: false, error: "mrz-no-encontrada" };
        return interpretarLineasMrz(lineas, formato, FECHA, "nativo" as never);
      },
    },
    parsearPdf417: parsearPdf417Amarilla,
    buscarDivipol,
  };
  return leerDocumento({ ancho: 1, alto: 1, datos: new Uint8ClampedArray(4) } as never, deps, {
    fechaReferencia: FECHA,
    enmascarar: false,
    ...(lineas?.length === 2 ? { pista: "mrz-td3" as const } : {}),
  });
}

function presentacion(r: ResultadoLectura): unknown {
  if (!r.ok) return { ok: false, motivo: r.error };
  return { ok: true, resultado: { tipo: r.tipoDocumento, campos: r.campos, warnings: [...r.warnings], confiable: false, validacion_id: null } };
}

describe("NAT-07 Reglas en un único bundle JS", { timeout: 60_000 }, () => {
  it("NAT-07 Sin globals de navegador", async () => {
    for (const g of ["window", "document", "fetch", "XMLHttpRequest", "self", "navigator"]) expect(contexto[g]).toBeUndefined();
    const paquete = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(api.version).toBe(paquete.version);
    expect(Object.keys(crudo).sort()).toStrictEqual(
      ["crearEstado", "decidirEnvio", "evaluarTextoMrz", "mensajeError", "procesarMrz", "procesarPdf417", "transicion", "validarOpciones", "validarUrlSubida", "version"].sort(),
    );
  });

  it("NAT-07 IIFE ES2020 sin E/S ni import dinámico", () => {
    expect(codigo.startsWith('"use strict";') || codigo.trimStart().startsWith("(()")).toBe(true);
    for (const prohibido of [/\bimport\s*\(/u, /\brequire\s*\(/u, /\bfetch\s*\(/u, /\bXMLHttpRequest\b/u, /\bdocument\./u, /\blocalStorage\b/u, /\bWorker\s*\(/u]) {
      expect(codigo).not.toMatch(prohibido);
    }
  });

  it("NAT-07 Funciones síncronas con salida JSON", () => {
    const fx = primero(casosPdf417()).fixture;
    const salidas = [
      crudo.procesarPdf417(aBase64(fx.bytes), { fechaReferencia: FECHA }),
      crudo.procesarMrz([...primero(casosMrz()).fixture.lineas], { fechaReferencia: FECHA }),
      crudo.crearEstado({}),
      crudo.transicion(crudo.crearEstado({}), { tipo: "iniciar" }),
      crudo.validarOpciones({}),
    ];
    for (const s of salidas) {
      expect(s).not.toBeInstanceOf(Promise);
      expect(typeof (s as { then?: unknown } | null)?.then).not.toBe("function");
      expect(json(s)).toStrictEqual(s === null ? null : json(s));
    }
  });

  it("NAT-07 PDF417 de la persona base con los literales de la spec", () => {
    const fx = primero(casosPdf417()).fixture;
    const r = json(api.procesarPdf417(aBase64(fx.bytes), { fechaReferencia: FECHA })) as { ok: true; resultado: Record<string, unknown>; contenido: string };
    expect(r.ok).toBe(true);
    expect(r.contenido).toBe("pdf417");
    expect(r.resultado).toMatchObject({
      tipo: "cedula-ciudadania",
      confiable: false,
      validacion_id: null,
      campos: {
        numeroDocumento: PERSONA_BASE.nuip,
        nuip: "9999123456",
        apellidos: "PRUEBA EJEMPLO",
        nombres: "FICTICIA LUZ",
        fechaNacimiento: "1985-03-14",
        sexo: "F",
        rh: "O+",
        nacionalidad: "COL",
        paisEmisor: "COL",
        fechaVencimiento: null,
      },
    });
  });

  it("NAT-07 Igualdad con el código fuente en todos los PDF417 del catálogo", async () => {
    for (const { id, fixture } of casosPdf417()) {
      const esperado = presentacion(await leerConFuente(new Uint8Array(fixture.bytes), null));
      const real = json(api.procesarPdf417(aBase64(fixture.bytes), { fechaReferencia: FECHA })) as { ok: boolean; resultado?: unknown; motivo?: string };
      expect({ id, ok: real.ok, resultado: real.resultado ?? null }).toStrictEqual({ id, ok: (esperado as { ok: boolean }).ok, resultado: (esperado as { resultado?: unknown }).resultado ?? null });
    }
  });

  it("NAT-07 Igualdad con la salida de la CLI (leer-foto --sin-mascara) en PDF417", () => {
    // Misma composición que tools/leer-foto.mjs: parsearPdf417Amarilla + conLugarNacimiento, sin máscara.
    for (const { id, fixture } of casosPdf417()) {
      const cli = conLugarNacimiento(parsearPdf417Amarilla(new Uint8Array(fixture.bytes), { divipol: buscarDivipol }) as never, buscarDivipol) as {
        ok: boolean;
        campos: Record<string, string | null>;
        warnings: string[];
      };
      const r = json(api.procesarPdf417(aBase64(fixture.bytes), { fechaReferencia: FECHA })) as { ok: boolean; resultado: { campos: Record<string, unknown>; warnings: string[] } };
      expect(r.ok, id).toBe(cli.ok);
      const c = cli.campos;
      const unir = (...p: (string | null | undefined)[]): string => p.filter((x) => x !== null && x !== undefined && x !== "").join(" ");
      expect({ id, ...r.resultado.campos }).toMatchObject({
        id,
        nuip: c["numeroDocumento"],
        apellidos: unir(c["primerApellido"], c["segundoApellido"]),
        nombres: unir(c["primerNombre"], c["segundoNombre"]),
        fechaNacimiento: c["fechaNacimiento"],
        sexo: c["sexo"],
        rh: c["rh"],
        lugarNacimiento: json(c["lugarNacimiento"] ?? null),
      });
      expect(r.resultado.warnings).toStrictEqual(cli.warnings);
    }
  });

  it("NAT-07 Igualdad con el código fuente en las MRZ del catálogo, la CE y el pasaporte", async () => {
    const extra = await Promise.all(
      ["clasificar-documento/ce.json", "mrz-td3/pasaporte-col.json"].map(async (r) => {
        const f = JSON.parse(await readFile(new URL(`../../../evals/fixtures/sinteticos/${r}`, import.meta.url), "utf8")) as { entrada: string[] };
        return { id: r, lineas: f.entrada };
      }),
    );
    const todos = [...casosMrz().map((c) => ({ id: c.id, lineas: [...c.fixture.lineas] })), ...extra];
    let exitos = 0;
    for (const { id, lineas } of todos) {
      const esperado = presentacion(await leerConFuente(null, lineas)) as { ok: boolean; resultado?: unknown; motivo?: string };
      const real = json(api.procesarMrz(lineas, { fechaReferencia: FECHA, admitirTi: false })) as { ok: boolean; resultado?: unknown; error?: { motivo: string } };
      expect({ id, ok: real.ok, resultado: real.resultado ?? null, motivo: real.error?.motivo ?? null }).toStrictEqual({
        id,
        ok: esperado.ok,
        resultado: esperado.resultado ?? null,
        motivo: esperado.motivo ?? null,
      });
      if (real.ok) exitos++;
    }
    // Sin propiedades vacías: la mayoría de los casos llega a un resultado.
    expect(exitos).toBeGreaterThan(todos.length / 2);
  });

  it("NAT-07 Pasaporte y CE con su tipo", () => {
    const pas = json(api.procesarMrz(["P<COLPEREZ<NUNEZ<<ANA<MARIA<<<<<<<<<<<<<<<<<", "AZ12345673COL9002155F31021451234567890<<<<78"], { fechaReferencia: FECHA })) as {
      ok: true;
      resultado: { tipo: string; campos: { numeroDocumento: string } };
      contenido: string;
    };
    expect(pas.resultado.tipo).toBe("pasaporte");
    expect(pas.contenido).toBe("mrz-td3");
    expect(pas.resultado.campos.numeroDocumento).toBe("AZ1234567");
    const ce = json(api.procesarMrz(["I<COL1234567<<4<<<<<<<<<<<<<<<", "8001014F3001019VEN<<<<<<<<<<<4", "GARCIA<<MARIA<JOSE<<<<<<<<<<<<"], { fechaReferencia: FECHA })) as {
      resultado: { tipo: string };
      contenido: string;
    };
    expect(ce.resultado.tipo).toBe("cedula-extranjeria");
    expect(ce.contenido).toBe("mrz-td1");
  });

  it("NAT-07 Máscara opcional", () => {
    const fx = primero(casosPdf417()).fixture;
    const r = json(api.procesarPdf417(aBase64(fx.bytes), { fechaReferencia: FECHA, enmascarar: true })) as { resultado: { campos: { nuip: string; nombres: string } } };
    expect(r.resultado.campos.nuip).toBe("********56");
    expect(r.resultado.campos.nombres).toBe("F******* L**");
  });
});
