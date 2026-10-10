// fixture-sintetico: solo PERSONA_BASE (NUIP 9999123456) y servidores .example, nunca datos reales.
// NAT-01 (lógica del bundle: secuencias arbitrarias) y NAT-12 (decisiones del envío en el bundle: opciones, upload.url
// y menores). Los nativos solo hacen la petición HTTP; todo lo que decide vive aquí.
import { casosPdf417 } from "@lector-cedula/fixtures";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { aBase64, apiFuente, codigoBundle, evaluarEnVm, json, type ApiNucleo } from "./ayuda.js";

/** `TRANSICIONES` de la spec (SDK-28), literales; la igualdad de fase también es válida (evento que no aplica). */
const TRANSICIONES = new Set([
  "inicio>permiso",
  "permiso>activo",
  "permiso>error",
  "activo>listo",
  "listo>activo",
  "listo>leyendo",
  "activo>leyendo",
  "leyendo>resultado",
  "leyendo>activo",
  "leyendo>error",
  "activo>error",
  "listo>error",
  "permiso>inicio",
  "activo>inicio",
  "listo>inicio",
  "leyendo>inicio",
  "resultado>permiso",
  "error>permiso",
]);

const SERVIDOR = "https://api.lector-cedula.example";

const RESULTADO = { tipo: "cedula-ciudadania", campos: { nuip: "9999123456" }, warnings: [], confiable: false, validacion_id: null };

const arbEvento: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom({ tipo: "iniciar" }, { tipo: "camara-lista" }, { tipo: "reintento-automatico" }, { tipo: "cancelar" }, { tipo: "reintentar" }),
  fc.constant({ tipo: "fallo", error: { codigo: "calidad-error", mensaje: "x" } }),
  fc.record({
    tipo: fc.constant("calidad"),
    apto: fc.boolean(),
    frame: fc.record({
      score: fc.integer({ min: -10, max: 110 }),
      motivo: fc.constantFrom(null, "oscuro", "reflejo"),
      guia: fc.record({ x: fc.nat(2000), y: fc.nat(2000), ancho: fc.nat(2000), alto: fc.nat(2000) }),
      anchoVideo: fc.integer({ min: -1, max: 1920 }),
      altoVideo: fc.integer({ min: -1, max: 1080 }),
      contenido: fc.constantFrom(null, "pdf417", "mrz"),
    }),
  }),
  fc.record({ tipo: fc.constant("leyendo"), contenido: fc.constantFrom(null, "pdf417", "mrz-td1") }),
  fc.record({ tipo: fc.constant("progreso"), valor: fc.double({ noNaN: true, min: -1, max: 2 }) }),
  fc.constant({ tipo: "resultado", resultado: RESULTADO, contenido: "pdf417", envio: null }),
  fc.constantFrom({ tipo: "envio", envio: { estado: "enviado", validacion_id: "val_sintetico_01" } }, { tipo: "envio", envio: { estado: "fallido", codigo: "subida-fallida" } }),
  // Entradas arbitrarias del puente nativo: nunca deben hacer lanzar.
  fc.anything(),
);

// Cada escenario corre sobre el bundle (vm) y sobre la fuente importada (para cobertura y mutación con Stryker).
describe.each(["bundle", "fuente"] as const)("%s", (modo) => {
  let api: ApiNucleo;
  beforeAll(async () => {
    api = modo === "bundle" ? evaluarEnVm(await codigoBundle()).api : await apiFuente();
  }, 60_000);

  describe("NAT-01 Secuencias arbitrarias sobre el bundle", { timeout: 60_000 }, () => {
    it("NAT-01 Secuencias arbitrarias: cada par pertenece a TRANSICIONES y ninguna llamada lanza", () => {
      let utiles = 0;
      let total = 0;
      fc.assert(
        fc.property(fc.nat(3), fc.array(arbEvento, { maxLength: 48 }), (dado, resto) => {
          // Tres de cada cuatro secuencias arrancan la cámara para recorrer las fases profundas; el resto es libre.
          const eventos = dado > 0 ? [{ tipo: "iniciar" }, { tipo: "camara-lista" }, ...resto] : resto;
          total++;
          let e = api.crearEstado({}) as { fase: string };
          const fases = new Set<string>([e.fase]);
          for (const ev of eventos) {
            const s = api.transicion(e, ev) as { fase: string };
            const par = `${e.fase}>${s.fase}`;
            if (s.fase !== e.fase && !TRANSICIONES.has(par)) throw new Error(`transición no permitida ${par}`);
            fases.add(s.fase);
            e = s;
          }
          if (fases.size > 2) utiles++;
        }),
        { numRuns: 1000 },
      );
      // Sin propiedad vacía: más de la mitad de las secuencias recorre al menos tres fases.
      expect(utiles / total).toBeGreaterThan(0.5);
    });

    it("NAT-01 Flujo feliz con la máquina del bundle", () => {
      const fases: string[] = [];
      let e = api.crearEstado({}) as { fase: string };
      const frame = (score: number) => ({ score, motivo: null, guia: { x: 0, y: 0, ancho: 10, alto: 10 }, anchoVideo: 1920, altoVideo: 1080, contenido: "pdf417" });
      for (const ev of [
        { tipo: "iniciar" },
        { tipo: "camara-lista" },
        { tipo: "calidad", frame: frame(10), apto: false },
        { tipo: "calidad", frame: frame(90), apto: true },
        { tipo: "leyendo", contenido: "pdf417" },
        { tipo: "resultado", resultado: RESULTADO, contenido: "pdf417", envio: null },
      ]) {
        e = api.transicion(e, ev) as { fase: string };
        if (fases.at(-1) !== e.fase) fases.push(e.fase);
      }
      expect(fases).toStrictEqual(["permiso", "activo", "listo", "leyendo", "resultado"]);
      expect(json(e)).toMatchObject({ resultado: { campos: { nuip: "9999123456" }, confiable: false, validacion_id: null } });
    });

    it("NAT-01 Estado o evento inválidos devuelven un estado válido sin lanzar", () => {
      expect(api.transicion(null, { tipo: "iniciar" })).toStrictEqual(api.crearEstado());
      expect(api.transicion({ fase: "nada" }, { tipo: "iniciar" })).toStrictEqual(api.crearEstado());
      const e = api.crearEstado();
      expect(api.transicion(e, { tipo: "calidad" })).toStrictEqual(e);
      expect(api.transicion(e, "iniciar")).toStrictEqual(e);
    });
  });

  describe("NAT-12 Decisiones del envío en el bundle", { timeout: 60_000 }, () => {
    it("NAT-12 Sesión sin servidor", () => {
      expect(api.validarOpciones({ sesion: "sesion_sintetica" })).toBe("servidor");
      expect(json(api.crearEstado({ sesion: "sesion_sintetica" }))).toMatchObject({ fase: "error", error: { codigo: "opcion-invalida", opcion: "servidor" } });
      expect((json(api.crearEstado({ sesion: "s" })) as { error: { mensaje: string } }).error.mensaje).not.toBe("");
      expect(json(api.crearEstado({ sesion: "s", idioma: "en" }))).toStrictEqual(json(api.crearEstado({ sesion: "s", idioma: "en" })));
      expect(api.validarOpciones({ servidor: SERVIDOR, sesion: "sesion_sintetica" })).toBeNull();
      expect(json(api.crearEstado({ servidor: SERVIDOR, sesion: "sesion_sintetica" }))).toMatchObject({ fase: "inicio", error: null });
      expect(api.validarOpciones(null)).toBe("opciones");
      expect(api.validarOpciones({ servidor: "http://api.lector-cedula.example" })).toBe("servidor");
    });

    it("NAT-12 upload.url de otro origen", () => {
      expect(api.validarUrlSubida("https://otro.example/subir", SERVIDOR)).toBe(false);
      expect(api.validarUrlSubida(`${SERVIDOR}/v/s/subir`, SERVIDOR)).toBe(true);
      expect(api.validarUrlSubida("http://api.lector-cedula.example/subir", "http://api.lector-cedula.example")).toBe(false);
      expect(api.validarUrlSubida("http://localhost:8000/s", "http://localhost:8000")).toBe(true);
      expect(api.validarUrlSubida(42, SERVIDOR)).toBe(false);
      expect(api.validarUrlSubida("no es url", SERVIDOR)).toBe(false);
    });

    it("NAT-12 Menor sin envío", () => {
      const con = { servidor: SERVIDOR, sesion: "sesion_sintetica" };
      const ti = { ok: true, resultado: { ...RESULTADO, tipo: "tarjeta-identidad" }, contenido: "pdf417", menorDeEdad: true };
      expect(api.decidirEnvio(ti, con)).toStrictEqual({ accion: "no-enviar", envio: { estado: "fallido", codigo: "menor-no-enviado" } });
      expect(api.decidirEnvio(ti, { ...con, enviarMenores: true })).toStrictEqual({ accion: "enviar", envio: { estado: "enviando" } });
      const pasaporteMenor = { ok: true, resultado: { ...RESULTADO, tipo: "pasaporte" }, contenido: "mrz-td3", menorDeEdad: true };
      expect(api.decidirEnvio(pasaporteMenor, con)).toStrictEqual({ accion: "no-enviar", envio: { estado: "fallido", codigo: "menor-no-enviado" } });
    });

    it("NAT-12 Envío solo con servidor y sesión válidos", () => {
      const adulto = { ok: true, resultado: RESULTADO, contenido: "pdf417", menorDeEdad: false };
      expect(api.decidirEnvio(adulto, { servidor: SERVIDOR, sesion: "sesion_sintetica" })).toStrictEqual({ accion: "enviar", envio: { estado: "enviando" } });
      expect(api.decidirEnvio(adulto, {})).toStrictEqual({ accion: "ninguno", envio: null });
      expect(api.decidirEnvio(adulto, { servidor: SERVIDOR })).toStrictEqual({ accion: "ninguno", envio: null });
      expect(api.decidirEnvio(adulto, { sesion: "s" })).toStrictEqual({ accion: "ninguno", envio: null });
      expect(api.decidirEnvio({ ok: false, error: { codigo: "lectura-fallida" } }, { servidor: SERVIDOR, sesion: "s" })).toStrictEqual({ accion: "ninguno", envio: null });
      expect(api.decidirEnvio(null, null)).toStrictEqual({ accion: "ninguno", envio: null });
    });

    it("NAT-12 La salida real de procesarPdf417 marca la mayoría de edad", () => {
      const fx = casosPdf417()[0]?.fixture;
      if (fx === undefined) throw new Error("catálogo vacío");
      const salida = api.procesarPdf417(aBase64(fx.bytes), { fechaReferencia: "2026-10-09" });
      expect(json(salida)).toMatchObject({ ok: true, menorDeEdad: false });
      // Persona nacida en 1985 vista desde 2000: TI admitida (15 años), menor.
      const ti = json(api.procesarPdf417(aBase64(fx.bytes), { fechaReferencia: "2000-06-01", admitirTi: true })) as { ok: boolean; menorDeEdad: boolean; resultado: { tipo: string } };
      expect(ti).toMatchObject({ ok: true, menorDeEdad: true, resultado: { tipo: "tarjeta-identidad" } });
      expect(api.decidirEnvio(ti, { servidor: SERVIDOR, sesion: "s" })).toStrictEqual({ accion: "no-enviar", envio: { estado: "fallido", codigo: "menor-no-enviado" } });
      expect(json(api.procesarPdf417(aBase64(fx.bytes), { fechaReferencia: "2000-06-01" }))).toMatchObject({ ok: false, error: { codigo: "menor-de-edad" } });
    });

    it("NAT-07 Entradas inválidas nunca lanzan", () => {
      fc.assert(
        fc.property(fc.anything(), fc.anything(), (a, b) => {
          api.procesarPdf417(a, b);
          api.procesarMrz(a, b);
          api.validarOpciones(a);
          api.crearEstado(a);
          api.transicion(a, b);
          api.validarUrlSubida(a, b);
          api.decidirEnvio(a, b);
        }),
        { numRuns: 1000 },
      );
      fc.assert(
        fc.property(fc.string(), fc.string({ unit: "binary" }), (a, b) => {
          expect(json(api.procesarPdf417(a, { fechaReferencia: "2026-10-09" }))).toHaveProperty("ok");
          expect(json(api.procesarMrz([a, b, a], { fechaReferencia: "2026-10-09" }))).toHaveProperty("ok", false);
        }),
        { numRuns: 1000 },
      );
    });

    it("NAT-07 Base64 inválido y fecha inválida", () => {
      expect(api.procesarPdf417("%%%", { fechaReferencia: "2026-10-09" })).toStrictEqual({ ok: false, error: { codigo: "lectura-fallida", motivo: "entrada-invalida" } });
      expect(api.procesarPdf417("QUJD", { fechaReferencia: "2026-13-01" })).toStrictEqual({ ok: false, error: { codigo: "opcion-invalida", motivo: "fecha-referencia-invalida" } });
      expect(api.procesarPdf417("QUJD", {})).toStrictEqual({ ok: false, error: { codigo: "opcion-invalida", motivo: "fecha-referencia-invalida" } });
      expect(api.procesarMrz("x", { fechaReferencia: "2026-10-09" })).toStrictEqual({ ok: false, error: { codigo: "lectura-fallida", motivo: "entrada-invalida" } });
      expect(api.procesarMrz(["a"], { fechaReferencia: "2026-10-09" })).toStrictEqual({ ok: false, error: { codigo: "lectura-fallida", motivo: "entrada-invalida" } });
      expect(api.procesarMrz(["a", "b", "c"], { fechaReferencia: "2026-10-09" })).toStrictEqual({ ok: false, error: { codigo: "lectura-fallida", motivo: "mrz-no-encontrada" } });
    });

    it("NAT-07 Documento fuera de opciones.documentos", () => {
      const fx = casosPdf417()[0]?.fixture;
      if (fx === undefined) throw new Error("catálogo vacío");
      expect(api.procesarPdf417(aBase64(fx.bytes), { fechaReferencia: "2026-10-09", documentos: ["pasaporte"] })).toStrictEqual({
        ok: false,
        error: { codigo: "documento-no-admitido", motivo: "documento-no-admitido" },
      });
    });
  });

});


/** URLs parecidas a las reales con las variantes que cambian el origen o la seguridad. */
const arbUrl: fc.Arbitrary<string> = fc.oneof(
  fc.webUrl({ withQueryParameters: true, withFragments: true }),
  fc
    .tuple(
      fc.constantFrom("https", "http", "HTTPS", "Http", "ftp", "javascript", "file", ""),
      fc.constantFrom("://", ":/", ":", "//", ":///"),
      fc.constantFrom("", "usuario@", "u:c@"),
      fc.constantFrom("api.lector-cedula.example", "API.Lector-Cedula.EXAMPLE", "localhost", "127.0.0.1", "otro.example", "[::1]", "", "a b", "xn--e1afmkfd.example", "localhost."),
      fc.constantFrom("", ":443", ":80", ":8000", ":0", ":65536", ":abc", ":"),
      fc.constantFrom("", "/", "/v/s/subir", "?q=1", "#f", "/a/../b", "/%2e%2e/", "/%7e", "/%41b"),
    )
    .map((p) => p.join("")),
  fc.string(),
);

// Solo el bundle: la fuente usa la URL de Node; el bundle, la de src/url.ts.
let api: ApiNucleo;
beforeAll(async () => {
  api = evaluarEnVm(await codigoBundle()).api;
}, 60_000);

describe("NAT-12 Diferencial de URL del bundle frente a la web en Node", { timeout: 60_000 }, () => {
  it("NAT-12 validarOpciones y validarUrlSubida coinciden con @lector-cedula/web (URL de Node)", async () => {
    const { opcionInvalida } = await import("../../web/src/opciones.js");
    const { urlSubidaValida } = await import("../../web/src/envio.js");
    let aceptadas = 0;
    fc.assert(
      fc.property(arbUrl, arbUrl, (servidor, subida) => {
        const op = { servidor, sesion: "sesion_sintetica", recursos: subida };
        expect(api.validarOpciones(op)).toBe(opcionInvalida(op));
        expect(api.validarUrlSubida(subida, servidor)).toBe(urlSubidaValida(subida, servidor));
        expect(api.validarUrlSubida(servidor, servidor)).toBe(urlSubidaValida(servidor, servidor));
        if (opcionInvalida({ servidor }) === null) aceptadas++;
      }),
      { numRuns: 2000 },
    );
    // Sin propiedad vacía: una parte relevante de los servidores generados es válida.
    expect(aceptadas).toBeGreaterThan(200);
  });
});

describe("NAT-12 URL del bundle: diferencias documentadas", () => {
  it("NAT-12 Un host no ASCII se rechaza (más estricto que IDNA)", () => {
    expect(api.validarOpciones({ servidor: "https://ñandú.example" })).toBe("servidor");
    expect(api.validarUrlSubida("https://ñandú.example/s", "https://ñandú.example")).toBe(false);
  });

  it("NAT-12 Literales de origen y seguridad", () => {
    expect(api.validarOpciones({ servidor: "HTTPS://API.Lector-Cedula.EXAMPLE:443/" })).toBeNull();
    expect(api.validarUrlSubida("https://api.lector-cedula.example:443/v/s", "https://API.lector-cedula.example")).toBe(true);
    expect(api.validarUrlSubida("https://api.lector-cedula.example:8443/v/s", SERVIDOR)).toBe(false);
    expect(api.validarOpciones({ servidor: "http://127.1" })).toBeNull();
    expect(api.validarOpciones({ servidor: "http://0x7f.0.0.1:8000" })).toBeNull();
    expect(api.validarOpciones({ servidor: "http://256.0.0.1" })).toBe("servidor");
    expect(api.validarOpciones({ servidor: "http://[::1]:8000" })).toBe("servidor");
    expect(api.validarOpciones({ servidor: "https://[::1]:8000" })).toBeNull();
    expect(api.validarOpciones({ servidor: "https://a b.example" })).toBe("servidor");
    expect(api.validarOpciones({ servidor: "https:\\api.lector-cedula.example" })).toBeNull();
  });
});
