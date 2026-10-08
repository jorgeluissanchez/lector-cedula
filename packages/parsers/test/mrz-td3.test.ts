// Cambio otros-documentos, capacidad mrz-td3: OD-01 a OD-05a con los literales de la spec. Datos sintéticos y
// espécimen público ICAO (Utopía).
import { describe, expect, it, vi } from "vitest";
import { parsearMrzTd3 } from "../src/index.js";
import { DATOS_PASAPORTE_COL, ESPECIMEN_ICAO, generarTd3, PASAPORTE_COL } from "./ayudas/generador-mrz-icao.js";

const REF = { fechaReferencia: "2026-10-08" };
const TODOS_VALIDOS = { numeroDocumento: "valido", nacimiento: "valido", vencimiento: "valido", datoOpcional: "valido", compuesto: "valido" };

function exito(r: ReturnType<typeof parsearMrzTd3>) {
  if (!r.ok) throw new Error(`se esperaba ok: ${JSON.stringify(r)}`);
  return r;
}

describe("OD-01 Parser puro de MRZ TD3", () => {
  it.each([
    ["una línea", [ESPECIMEN_ICAO[0]]],
    ["tres líneas", [...ESPECIMEN_ICAO, ESPECIMEN_ICAO[1]]],
    ["43 caracteres", [ESPECIMEN_ICAO[0], ESPECIMEN_ICAO[1].slice(0, 43)]],
    ["45 caracteres", [ESPECIMEN_ICAO[0] + "<", ESPECIMEN_ICAO[1]]],
    ["null", null],
    ["42", 42],
    ["cadenas vacías", ["", ""]],
    ["no strings", [1, 2]],
  ])("longitudes inválidas: %s", (_n, entrada) => {
    expect(parsearMrzTd3(entrada, REF)).toStrictEqual({ ok: false, error: "formato-td3" });
  });

  it("TD1 no es TD3", () => {
    const digital = ["ICCOL999900123816001<<<<<<<<<<", "9007150F3407150COL9999123456<5", "FICTICIO<EJEMPLO<<ANA<MARIA<<<"];
    expect(parsearMrzTd3(digital, REF)).toStrictEqual({ ok: false, error: "formato-td3" });
  });

  it("no es pasaporte: V<", () => {
    expect(parsearMrzTd3(["V<" + ESPECIMEN_ICAO[0].slice(2), ESPECIMEN_ICAO[1]], REF)).toStrictEqual({ ok: false, error: "no-es-pasaporte" });
  });
});

describe("OD-01b Forma del resultado", () => {
  it("minúsculas y espacios dan formato-td3", () => {
    expect(parsearMrzTd3([ESPECIMEN_ICAO[0].toLowerCase(), ESPECIMEN_ICAO[1]], REF)).toStrictEqual({ ok: false, error: "formato-td3" });
    expect(parsearMrzTd3([ESPECIMEN_ICAO[0].replace("<", " "), ESPECIMEN_ICAO[1]], REF)).toStrictEqual({ ok: false, error: "formato-td3" });
    expect(parsearMrzTd3([ESPECIMEN_ICAO[0], ESPECIMEN_ICAO[1].replace("<", " ")], REF)).toStrictEqual({ ok: false, error: "formato-td3" });
  });

  it("claves exactas del éxito", () => {
    expect(Object.keys(exito(parsearMrzTd3(ESPECIMEN_ICAO, REF))).sort()).toStrictEqual(
      ["campos", "correcciones", "digitosControl", "nombreNacionalidad", "nombrePaisEmisor", "ok", "tipoDocumento", "warnings"],
    );
  });
});

describe("OD-01a Campos del TD3", () => {
  it("espécimen ICAO", () => {
    const r = exito(parsearMrzTd3(ESPECIMEN_ICAO, REF));
    expect(r.tipoDocumento).toBe("pasaporte");
    expect(r.campos).toStrictEqual({
      codigoDocumento: "P",
      estadoEmisor: "UTO",
      apellidos: "ERIKSSON",
      nombres: "ANNA MARIA",
      numeroDocumento: "L898902C3",
      nacionalidad: "UTO",
      fechaNacimiento: "1974-08-12",
      sexo: "F",
      fechaVencimiento: "2012-04-15",
      datoOpcional: "ZE184226B",
    });
    expect(r.digitosControl).toStrictEqual(TODOS_VALIDOS);
    expect(r.warnings).toContain("documento-vencido");
    expect(r.warnings).toContain("pais-especimen");
    expect(r.warnings.filter((w) => w === "pais-especimen")).toHaveLength(1);
    expect(r.correcciones).toStrictEqual([]);
  });

  it("pasaporte colombiano con apellido compuesto y Ñ transliterada", () => {
    const r = exito(parsearMrzTd3(PASAPORTE_COL, REF));
    expect(r.campos).toMatchObject({
      apellidos: "PEREZ NUNEZ",
      nombres: "ANA MARIA",
      numeroDocumento: "AZ1234567",
      fechaNacimiento: "1990-02-15",
      fechaVencimiento: "2031-02-14",
      datoOpcional: "1234567890",
    });
    expect(r.digitosControl).toStrictEqual(TODOS_VALIDOS);
    expect(r.warnings).toStrictEqual([]);
  });

  it("apellido de varias palabras y sexo M (error pasado)", () => {
    const r = exito(parsearMrzTd3(["P<COLDE<LA<OSSA<<JUAN<<<<<<<<<<<<<<<<<<<<<<<", "AZ76543211COL8501019M3001019<<<<<<<<<<<<<<<0"], REF));
    expect(r.campos).toMatchObject({ apellidos: "DE LA OSSA", nombres: "JUAN", sexo: "M", datoOpcional: null });
    expect(r.digitosControl.datoOpcional).toBe("valido");
  });

  it.each([
    ["<", null],
    ["X", null],
    ["F", "F"],
  ])("sexo %s", (s, esperado) => {
    const r = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, sexo: s as "<" }), REF));
    expect(r.campos.sexo).toBe(esperado);
  });

  it("sexo fuera de F, M, X o < es null", () => {
    const [l1, l2] = generarTd3(DATOS_PASAPORTE_COL);
    // La posición 20 no entra en ningún dígito de control.
    const r = exito(parsearMrzTd3([l1, l2.slice(0, 20) + "Q" + l2.slice(21)], REF));
    expect(r.campos.sexo).toBeNull();
  });

  it("sin nombres (sin <<) y código de dos letras", () => {
    const r = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, codigo: "PD", apellidos: "SOLO", nombres: "" }), REF));
    expect(r.campos.codigoDocumento).toBe("PD");
    expect(r.campos.apellidos).toBe("SOLO");
    expect(r.campos.nombres).toBe("");
  });

  it("apellido sin separador doble devuelve todo como apellidos", () => {
    const l1 = "P<COLUNO<DOS" + "<".repeat(32);
    const r = exito(parsearMrzTd3([l1, PASAPORTE_COL[1]], REF));
    expect(r.campos.apellidos).toBe("UNO DOS");
    expect(r.campos.nombres).toBe("");
  });

  it("no modifica la entrada", () => {
    const entrada = [...PASAPORTE_COL];
    parsearMrzTd3(entrada, REF);
    expect(entrada).toStrictEqual(PASAPORTE_COL);
  });
});

describe("OD-01c Dato opcional sin interpretar (P01)", () => {
  it("el pasaporte colombiano no expone nuip", () => {
    const r = exito(parsearMrzTd3(PASAPORTE_COL, REF));
    expect(r.campos.datoOpcional).toBe("1234567890");
    expect(JSON.stringify(r)).not.toContain('"nuip');
  });
});

describe("OD-02 Dígitos de control", () => {
  it("número de documento alterado", () => {
    const r = parsearMrzTd3([ESPECIMEN_ICAO[0], "L898902C46UTO7408122F1204159ZE184226B<<<<<10"], REF);
    expect(r).toMatchObject({ ok: false, error: "digito-control" });
    expect(r.ok === false && "digitosControl" in r && r.digitosControl.numeroDocumento).toBe("invalido");
    expect(r).not.toHaveProperty("campos");
  });

  it("compuesto alterado", () => {
    const r = parsearMrzTd3([ESPECIMEN_ICAO[0], ESPECIMEN_ICAO[1].slice(0, 43) + "1"], REF);
    expect(r).toStrictEqual({ ok: false, error: "digito-control", digitosControl: { ...TODOS_VALIDOS, compuesto: "invalido" } });
  });

  it.each([
    ["nacimiento", 19],
    ["vencimiento", 27],
    ["datoOpcional", 42],
  ])("%s alterado", (clave, pos) => {
    const l2 = ESPECIMEN_ICAO[1];
    const otro = l2.charAt(pos) === "9" ? "8" : "9";
    const r = parsearMrzTd3([ESPECIMEN_ICAO[0], l2.slice(0, pos) + otro + l2.slice(pos + 1)], REF);
    expect(r).toMatchObject({ ok: false, error: "digito-control", digitosControl: { [clave]: "invalido" } });
  });

  it("dígito no numérico es inválido", () => {
    const l2 = ESPECIMEN_ICAO[1];
    const r = parsearMrzTd3([ESPECIMEN_ICAO[0], l2.slice(0, 9) + "<" + l2.slice(10)], REF);
    expect(r).toMatchObject({ ok: false, error: "digito-control", digitosControl: { numeroDocumento: "invalido" } });
  });

  it("dato opcional vacío admite < y 0 como dígito; otro dígito no", () => {
    const [l1, l2] = generarTd3({ ...DATOS_PASAPORTE_COL, opcional: "" });
    expect(l2.charAt(42)).toBe("0");
    expect(exito(parsearMrzTd3([l1, l2], REF)).digitosControl.datoOpcional).toBe("valido");
    const conRelleno = l2.slice(0, 42) + "<" + l2.charAt(43);
    expect(exito(parsearMrzTd3([l1, conRelleno], REF)).digitosControl.datoOpcional).toBe("valido");
    const conTres = l2.slice(0, 42) + "3" + l2.charAt(43);
    expect(parsearMrzTd3([l1, conTres], REF)).toMatchObject({ ok: false, digitosControl: { datoOpcional: "invalido" } });
  });

  it("dato opcional no vacío con < como dígito es inválido", () => {
    const l2 = PASAPORTE_COL[1];
    const r = parsearMrzTd3([PASAPORTE_COL[0], l2.slice(0, 42) + "<" + l2.charAt(43)], REF);
    expect(r).toMatchObject({ ok: false, digitosControl: { datoOpcional: "invalido" } });
  });
});

describe("OD-03 Correcciones OCR-B solo en zonas numéricas", () => {
  it("fecha leída con O", () => {
    const r = exito(parsearMrzTd3([ESPECIMEN_ICAO[0], ESPECIMEN_ICAO[1].replace("7408122", "74O8122")], REF));
    expect(r.campos.fechaNacimiento).toBe("1974-08-12");
    expect(r.correcciones).toStrictEqual([{ posicion: 15, de: "O", a: "0" }]);
  });

  it.each([
    ["Q", "0", "900215"],
    ["I", "1", "900215"],
    ["Z", "2", "900215"],
    ["S", "5", "900215"],
    ["G", "6", "860101"],
    ["B", "8", "850101"],
  ])("corrige %s por %s en la fecha de nacimiento", (de, a, nacimiento) => {
    const [l1, l2] = generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento });
    const i = l2.indexOf(a, 13);
    expect(i).toBeGreaterThanOrEqual(13);
    expect(i).toBeLessThan(19);
    const r = exito(parsearMrzTd3([l1, l2.slice(0, i) + de + l2.slice(i + 1)], REF));
    expect(r.correcciones).toStrictEqual([{ posicion: i, de, a }]);
  });

  it("corrige los dígitos de control [9], [42] y [43]", () => {
    const [l1, l2] = generarTd3({ ...DATOS_PASAPORTE_COL, numero: "AZ1234560", opcional: "5" });
    const letra: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B" };
    let alterada = l2;
    const cambios = [];
    for (const p of [9, 42, 43]) {
      const c = l2.charAt(p);
      const l = letra[c];
      if (l !== undefined) {
        alterada = alterada.slice(0, p) + l + alterada.slice(p + 1);
        cambios.push({ posicion: p, de: l, a: c });
      }
    }
    expect(cambios.length).toBeGreaterThan(0);
    expect(exito(parsearMrzTd3([l1, alterada], REF)).correcciones).toStrictEqual(cambios);
  });

  it("número de documento con O no se corrige", () => {
    const r = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, numero: "AO1234567" }), REF));
    expect(r.campos.numeroDocumento).toBe("AO1234567");
    expect(r.correcciones).toStrictEqual([]);
  });

  it("no corrige nombres, países, sexo ni dato opcional", () => {
    const r = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, apellidos: "OSSO", nacionalidad: "BOL", opcional: "ABZ" }), REF));
    expect(r.campos.apellidos).toBe("OSSO");
    expect(r.campos.nacionalidad).toBe("BOL");
    expect(r.campos.datoOpcional).toBe("ABZ");
    expect(r.correcciones).toStrictEqual([]);
  });

  it("una letra no corregible en zona numérica rompe el dígito de control", () => {
    const l2 = PASAPORTE_COL[1];
    const r = parsearMrzTd3([PASAPORTE_COL[0], l2.slice(0, 13) + "A" + l2.slice(14)], REF);
    expect(r).toMatchObject({ ok: false, error: "digito-control" });
  });
});

describe("OD-04 Países", () => {
  it("Alemania con D<<", () => {
    const r = exito(parsearMrzTd3(["P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<", "C01X00T478D<<6408125F3103315<<<<<<<<<<<<<<<2"], REF));
    expect(r.campos.estadoEmisor).toBe("D");
    expect(r.campos.nacionalidad).toBe("D");
    expect(r.nombreNacionalidad).toBe("Alemania");
    expect(r.nombrePaisEmisor).toBe("Alemania");
    expect(r.warnings).not.toContain("pais-desconocido");
  });

  it("código inexistente QQQ", () => {
    const r = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacionalidad: "QQQ" }), REF));
    expect(r.nombreNacionalidad).toBeNull();
    expect(r.nombrePaisEmisor).toBe("Colombia");
    expect(r.warnings).toStrictEqual(["pais-desconocido"]);
  });

  it("emisor y nacionalidad desconocidos dan un solo warning", () => {
    const r = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, emisor: "QQQ", nacionalidad: "QQQ" }), REF));
    expect(r.warnings).toStrictEqual(["pais-desconocido"]);
    expect(r.nombrePaisEmisor).toBeNull();
  });

  it("Colombia", () => {
    expect(exito(parsearMrzTd3(PASAPORTE_COL, REF)).nombrePaisEmisor).toBe("Colombia");
  });
});

describe("OD-05 Siglo de fechas y vigencia", () => {
  it("siglo del nacimiento", () => {
    const a = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "260101" }), REF));
    const b = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "270101" }), REF));
    expect(a.campos.fechaNacimiento).toBe("2026-01-01");
    expect(b.campos.fechaNacimiento).toBe("1927-01-01");
  });

  it("nacimiento igual a la referencia es del siglo XXI", () => {
    expect(exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "261008" }), REF)).campos.fechaNacimiento).toBe("2026-10-08");
    expect(exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "261009" }), REF)).campos.fechaNacimiento).toBe("1926-10-09");
  });

  it.each(["900230", "901301", "900001", "900100", "900431", "900631", "900931", "901131"])("fecha imposible %s", (f) => {
    expect(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: f }), REF)).toStrictEqual({ ok: false, error: "fecha-invalida" });
  });

  it("vencimiento imposible", () => {
    expect(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, vencimiento: "310230" }), REF)).toStrictEqual({ ok: false, error: "fecha-invalida" });
  });

  it("bisiestos: 29 de febrero de 2000 existe, de 1900 no", () => {
    expect(exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, vencimiento: "000229" }), REF)).campos.fechaVencimiento).toBe("2000-02-29");
    expect(exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "040229" }), REF)).campos.fechaNacimiento).toBe("2004-02-29");
    expect(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, vencimiento: "010229" }), REF)).toStrictEqual({ ok: false, error: "fecha-invalida" });
  });

  it("1900 no es bisiesto: 29 de febrero de 1900 es imposible", () => {
    expect(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "000229" }), { fechaReferencia: "1999-12-31" })).toStrictEqual({
      ok: false,
      error: "fecha-invalida",
    });
  });

  it("dato opcional con relleno intermedio lo conserva", () => {
    expect(exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, opcional: "12<34" }), REF)).campos.datoOpcional).toBe("12<34");
  });

  it("documento vencido es warning y no rechazo; el día del vencimiento sigue vigente", () => {
    const vencido = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, vencimiento: "261007" }), REF));
    expect(vencido.warnings).toContain("documento-vencido");
    const hoy = exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, vencimiento: "261008" }), REF));
    expect(hoy.warnings).not.toContain("documento-vencido");
  });
});

describe("OD-05a Fecha de referencia", () => {
  it.each([{ fechaReferencia: "2026-02-30" }, { fechaReferencia: "2026-13-01" }, { fechaReferencia: "20261008" }, { fechaReferencia: "2026/10/08" }, { fechaReferencia: 20261008 }, { fechaReferencia: null }])(
    "inválida %j",
    (o) => {
      expect(parsearMrzTd3(ESPECIMEN_ICAO, o)).toStrictEqual({ ok: false, error: "fecha-referencia-invalida" });
    },
  );

  it("ausente usa la fecha del sistema", () => {
    for (const o of [undefined, {}, null, 5]) {
      const r = exito(parsearMrzTd3(PASAPORTE_COL, o));
      expect(r.campos.fechaNacimiento).toBe("1990-02-15");
    }
    // El espécimen venció en 2012: con la fecha del sistema también está vencido.
    expect(exito(parsearMrzTd3(ESPECIMEN_ICAO)).warnings).toContain("documento-vencido");
  });

  it("sin referencia usa la fecha de Bogotá (UTC-5), no la de UTC", () => {
    vi.useFakeTimers();
    try {
      // 2026-10-09 03:00 UTC es 2026-10-08 22:00 en Bogotá: un pasaporte que vence el 2026-10-08 sigue vigente.
      vi.setSystemTime(new Date("2026-10-09T03:00:00Z"));
      const vence = generarTd3({ ...DATOS_PASAPORTE_COL, vencimiento: "261008" });
      expect(exito(parsearMrzTd3(vence)).warnings).not.toContain("documento-vencido");
      // 2026-10-09 05:00 UTC ya es 2026-10-09 en Bogotá.
      vi.setSystemTime(new Date("2026-10-09T05:00:00Z"));
      expect(exito(parsearMrzTd3(vence)).warnings).toContain("documento-vencido");
      // 2026-10-08 04:00 UTC es todavía 2026-10-07 en Bogotá: nacimiento del 2026-10-08 es del siglo XX.
      vi.setSystemTime(new Date("2026-10-08T04:00:00Z"));
      expect(exito(parsearMrzTd3(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "261008" }))).campos.fechaNacimiento).toBe("1926-10-08");
    } finally {
      vi.useRealTimers();
    }
  });

  it("el formato de línea se valida antes que la fecha de referencia", () => {
    expect(parsearMrzTd3(null, { fechaReferencia: "x" })).toStrictEqual({ ok: false, error: "formato-td3" });
  });
});
