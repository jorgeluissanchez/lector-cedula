// fixture-sintetico: solo catálogos del generador (PERSONA_BASE, NUIP 9999123456), nunca datos reales.
// NAT-07 "Igualdad entre motores" y "Errores pasados" (sdk-nativo): el mismo bundle evaluado en QuickJS (el motor del
// núcleo Kotlin, aquí vía quickjs-emscripten, MIT) da salidas JSON idénticas byte a byte a las de Node, y conserva los
// literales de la skill formato-cedula (RH AB+ y O-, sexo F con M en el apellido, Ñ, orden de apellidos).
import variante from "@jitl/quickjs-wasmfile-release-sync";
import { casosMrz, casosPdf417 } from "@lector-cedula/fixtures";
import { newQuickJSWASMModuleFromVariant, type QuickJSContext } from "quickjs-emscripten-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aBase64, codigoBundle, evaluarEnVm, type ApiNucleo } from "./ayuda.js";

const FECHA = "2026-10-09";
let qjs: QuickJSContext;
let node: ApiNucleo;

/** Llama `LectorCedulaNucleo.<fn>(...args)` dentro de QuickJS y devuelve el JSON serializado allí. */
function enQuickJs(fn: string, ...args: unknown[]): string {
  const r = qjs.evalCode(`JSON.stringify(LectorCedulaNucleo.${fn}(${args.map((a) => JSON.stringify(a)).join(",")}))`);
  const h = qjs.unwrapResult(r);
  try {
    return qjs.getString(h);
  } finally {
    h.dispose();
  }
}

beforeAll(async () => {
  const codigo = await codigoBundle();
  node = evaluarEnVm(codigo).api;
  const modulo = await newQuickJSWASMModuleFromVariant(variante);
  qjs = modulo.newContext();
  // Sin globals de navegador en QuickJS: ni window, ni document, ni fetch.
  qjs.unwrapResult(qjs.evalCode(codigo)).dispose();
}, 60_000);

afterAll(() => qjs?.dispose());

describe("NAT-07 Igualdad entre motores (Node y QuickJS)", { timeout: 60_000 }, () => {
  it("NAT-07 QuickJS no tiene globals de navegador y expone la misma versión", () => {
    expect(enQuickJs("crearEstado")).toBe(JSON.stringify(node.crearEstado()));
    const tipos = qjs.unwrapResult(qjs.evalCode("[typeof window, typeof document, typeof fetch, typeof XMLHttpRequest, LectorCedulaNucleo.version].join(',')"));
    expect(qjs.getString(tipos)).toBe(`undefined,undefined,undefined,undefined,${node.version}`);
    tipos.dispose();
  });

  it("NAT-07 Igualdad entre motores en todos los PDF417 del catálogo", () => {
    for (const { id, fixture } of casosPdf417()) {
      const b64 = aBase64(fixture.bytes);
      for (const opciones of [{ fechaReferencia: FECHA }, { fechaReferencia: FECHA, enmascarar: true }, { fechaReferencia: "2000-01-01", admitirTi: true }]) {
        expect({ id, salida: enQuickJs("procesarPdf417", b64, opciones) }).toStrictEqual({ id, salida: JSON.stringify(node.procesarPdf417(b64, opciones)) });
      }
    }
  });

  it("NAT-07 Igualdad entre motores en todas las MRZ del catálogo", () => {
    for (const { id, fixture } of casosMrz()) {
      const opciones = { fechaReferencia: FECHA };
      expect({ id, salida: enQuickJs("procesarMrz", [...fixture.lineas], opciones) }).toStrictEqual({ id, salida: JSON.stringify(node.procesarMrz([...fixture.lineas], opciones)) });
    }
  });

  it("NAT-07 Igualdad entre motores en entradas inválidas y transiciones", () => {
    const entradas: [string, unknown[]][] = [
      ["procesarPdf417", ["no-es-base64!", { fechaReferencia: FECHA }]],
      ["procesarPdf417", ["", { fechaReferencia: FECHA }]],
      ["procesarPdf417", [aBase64(new Uint8Array([1, 2, 3])), { fechaReferencia: "2026-02-30" }]],
      ["procesarMrz", [["a", "b"], { fechaReferencia: FECHA }]],
      ["procesarMrz", [null, null]],
      ["validarOpciones", [{ sesion: "abc" }]],
      ["crearEstado", [{ sesion: "abc" }]],
      ["crearEstado", [{ servidor: "ftp://x", idioma: "en" }]],
      ["transicion", [node.crearEstado(), { tipo: "iniciar" }]],
      ["transicion", [{ fase: "nada" }, { tipo: "iniciar" }]],
      ["validarUrlSubida", ["https://otro.example/subir", "https://api.lector-cedula.example"]],
    ];
    for (const [fn, args] of entradas) {
      const enNode = JSON.stringify((node as unknown as Record<string, (...a: unknown[]) => unknown>)[fn]?.(...args));
      expect({ fn, args, salida: enQuickJs(fn, ...args) }).toStrictEqual({ fn, args, salida: enNode });
    }
  });

  it("NAT-07 Errores pasados en QuickJS", () => {
    const campos = (id: string): Record<string, unknown> => {
      const caso = casosPdf417().find((c) => c.id === id);
      if (caso === undefined) throw new Error(id);
      const r = JSON.parse(enQuickJs("procesarPdf417", aBase64(caso.fixture.bytes), { fechaReferencia: FECHA })) as { ok: boolean; resultado: { campos: Record<string, unknown> } };
      expect(r.ok, id).toBe(true);
      return r.resultado.campos;
    };
    expect(campos("rh-ab-positivo")["rh"]).toBe("AB+");
    expect(campos("rh-ab-negativo")["rh"]).toBe("AB-");
    expect(campos("rh-o-negativo")["rh"]).toBe("O-");
    expect(campos("sexo-f-apellido-con-m")).toMatchObject({ sexo: "F", apellidos: "MARTINEZ EJEMPLO" });
    expect(campos("enie")).toMatchObject({ apellidos: "PEÑA NUÑEZ" });
    expect(campos("completa-base")).toMatchObject({ apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ" });
    expect(campos("apellido-compuesto")).toMatchObject({ apellidos: "DE LA OSSA EJEMPLO" });
    expect(campos("nuip-corto")).toMatchObject({ nuip: "99991234" });
  });
});
