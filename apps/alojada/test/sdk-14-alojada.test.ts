// SDK-14 (página alojada en modo sesión): lógica pura de la página `/v/{token}` (configuración insertada por el
// servidor, URL de retorno y pantalla según el estado del núcleo). Datos sintéticos únicamente.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { leerConfiguracion, opcionesLector, pantallaDe, tokenDeRuta, urlRetorno } from "../src/logica.js";
import type { EstadoLector } from "@lector-cedula/web";

const ID = "val_0123456789abcdef0123456789abcdef";
const VALIDA = { estado: "valida", validation_id: ID, return_url: "https://app-a.example/volver", version_texto: "2026-10-01", documento: "cedula" };

const BASE: EstadoLector = { fase: "inicio", calidad: null, guia: null, contenido: null, progreso: null, intento: 0, resultado: null, error: null, envio: null };
const RESULTADO = { tipo: "cedula-ciudadania", campos: { nuip: "9999123456" }, warnings: [], confiable: false, validacion_id: null } as unknown as EstadoLector["resultado"];

describe("SDK-14 configuración de la sesión", () => {
  it("SDK-14 sesión válida", () => {
    expect(leerConfiguracion(JSON.stringify(VALIDA))).toStrictEqual(VALIDA);
  });

  it("SDK-14 Token alterado o vencido: estado invalida", () => {
    expect(leerConfiguracion('{"estado":"invalida"}')).toStrictEqual({ estado: "invalida" });
  });

  it("SDK-14 configuración ausente o mal formada es inválida (nunca pide la cámara)", () => {
    for (const t of [null, "", "{", "[]", '{"estado":"valida"}', JSON.stringify({ ...VALIDA, validation_id: "x" }), JSON.stringify({ ...VALIDA, documento: "otro" })]) {
      expect(leerConfiguracion(t)).toStrictEqual({ estado: "invalida" });
    }
  });

  it("SDK-14 sin retorno: return_url null", () => {
    expect(leerConfiguracion(JSON.stringify({ ...VALIDA, return_url: null }))).toStrictEqual({ ...VALIDA, return_url: null });
  });

  it("SDK-14 nunca lanza con cualquier texto", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (t) => {
        expect(leerConfiguracion(t).estado).toBe("invalida");
      }),
      { numRuns: 1000 },
    );
  });
});

describe("SDK-14 La redirección solo lleva identificador y estado", () => {
  it("SDK-14 Flujo completo con retorno", () => {
    expect(urlRetorno("https://app-a.example/volver", ID, "completada")).toBe(`https://app-a.example/volver?validation_id=${ID}&estado=completada`);
  });

  it("SDK-14 Cancelación", () => {
    expect(urlRetorno("https://app-a.example/volver", ID, "cancelada")).toBe(`https://app-a.example/volver?validation_id=${ID}&estado=cancelada`);
  });

  it("SDK-14 Retorno a deeplink", () => {
    expect(urlRetorno("com.ejemplo.appa://lector/retorno", ID, "completada")).toBe(`com.ejemplo.appa://lector/retorno?validation_id=${ID}&estado=completada`);
  });

  it("SDK-14 exactamente dos parámetros y sin fragmento aunque el retorno traiga query o fragmento", () => {
    const u = new URL(urlRetorno("https://app-a.example/volver?x=1#f", ID, "completada"));
    expect([...u.searchParams.keys()]).toStrictEqual(["validation_id", "estado"]);
    expect(u.hash).toBe("");
  });
});

describe("SDK-14 token de la ruta", () => {
  it("SDK-14 extrae el token de /v/{token}", () => {
    expect(tokenDeRuta("/v/abc_DEF-123")).toBe("abc_DEF-123");
    expect(tokenDeRuta("/v/")).toBeNull();
    expect(tokenDeRuta("/otra/abc")).toBeNull();
    expect(tokenDeRuta("/v/a/b")).toBeNull();
  });
});

describe("SDK-14 opciones del núcleo", () => {
  it("SDK-14 cédula: recursos de /sdk/v1/, servidor del mismo origen y sesión; sin menores", () => {
    expect(opcionesLector("https://api.lector-cedula.example", "tok", "cedula")).toStrictEqual({
      recursos: "https://api.lector-cedula.example/sdk/v1/",
      servidor: "https://api.lector-cedula.example",
      sesion: "tok",
    });
  });

  it("SDK-14 tarjeta de identidad: admite y envía menores tras el aviso reforzado", () => {
    expect(opcionesLector("https://api.lector-cedula.example", "tok", "tarjeta-identidad")).toStrictEqual({
      recursos: "https://api.lector-cedula.example/sdk/v1/",
      servidor: "https://api.lector-cedula.example",
      sesion: "tok",
      admitirTi: true,
      enviarMenores: true,
    });
  });
});

describe("SDK-14 pantalla según el estado del núcleo", () => {
  it("SDK-14 captura mientras lee", () => {
    for (const fase of ["inicio", "permiso", "activo", "listo", "leyendo"] as const) expect(pantallaDe({ ...BASE, fase })).toBe("captura");
  });

  it("SDK-14 resultado: enviando, completada o fallo según envio", () => {
    expect(pantallaDe({ ...BASE, fase: "resultado", resultado: RESULTADO, envio: { estado: "enviando" } })).toBe("enviando");
    expect(pantallaDe({ ...BASE, fase: "resultado", resultado: RESULTADO, envio: null })).toBe("enviando");
    expect(pantallaDe({ ...BASE, fase: "resultado", resultado: RESULTADO, envio: { estado: "enviado", validacion_id: ID } })).toBe("completada");
    expect(pantallaDe({ ...BASE, fase: "resultado", resultado: RESULTADO, envio: { estado: "fallido", codigo: "subida-fallida" } })).toBe("fallo");
  });

  it("SDK-14 error del lector", () => {
    expect(pantallaDe({ ...BASE, fase: "error", error: { codigo: "camara-denegada", mensaje: "" } })).toBe("error");
  });
});
