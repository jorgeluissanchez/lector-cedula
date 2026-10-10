// NAT-12 (sdk-nativo): `URL` propio del bundle (src/url.ts) frente a la `URL` de Node, importado desde la fuente para
// que Stryker vea la cobertura. Diferencia documentada: un host no ASCII se rechaza (más estricto que IDNA).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { URLNucleo } from "../src/url.js";
import { decodificarBase64 } from "../src/base64.js";

const desc = (f: () => { protocol: string; hostname: string; port: string; origin: string }): string => {
  try {
    const u = f();
    return [u.protocol, u.hostname, u.port, u.origin].join("|");
  } catch {
    return "INVALIDA";
  }
};

const arbUrl = fc
  .tuple(
    fc.constantFrom("https", "http", "HTTPS", "ftp", "ws", "javascript", "file", "", "h"),
    fc.constantFrom("://", ":/", ":", "//", ":///", ":\\\\", ":/\\"),
    fc.constantFrom("", "usuario@", "u:c@", "@", "a@b@"),
    fc.constantFrom("api.example", "API.Ex.EXAMPLE", "localhost", "127.0.0.1", "127.1", "0x7f.1", "1.2.3.4.5", "999", "a.1", "1.", "[::1]", "[zz]", "", "a b", "a%20b", "x_y", "localhost.", "%41"),
    fc.constantFrom("", ":443", ":80", ":8000", ":0", ":65536", ":abc", ":", ":0443"),
    fc.constantFrom("", "/", "/v", "?q=1", "#f", "\\x", " "),
  )
  .map((p) => p.join(""));

describe("NAT-12 URL del núcleo frente a la URL de Node", () => {
  it("NAT-12 mismo protocolo, host, puerto, origen y validez", () => {
    fc.assert(
      fc.property(fc.oneof(arbUrl, fc.webUrl(), fc.string()), (s) => {
        expect(desc(() => new URLNucleo(s))).toBe(desc(() => new URL(s)));
        expect(desc(() => new URLNucleo(s, "http://localhost/")) === "INVALIDA").toBe(desc(() => new URL(s, "http://localhost/")) === "INVALIDA");
      }),
      { numRuns: 3000 },
    );
  });

  it("NAT-12 literales", () => {
    const u = new URLNucleo("HTTPS://u:c@API.Example:443/x");
    expect([u.protocol, u.hostname, u.port, u.host, u.origin, String(u)]).toStrictEqual(["https:", "api.example", "", "api.example", "https://api.example", "https://api.example"]);
    expect(new URLNucleo("http://0x7f.1:8000").host).toBe("127.0.0.1:8000");
    expect(new URLNucleo("javascript:x").origin).toBe("null");
    expect(() => new URLNucleo("https://ñ.example")).toThrow(TypeError);
    expect(() => new URLNucleo("/x")).toThrow(TypeError);
    expect(new URLNucleo("/x", new URLNucleo("https://a.example")).origin).toBe("https://a.example");
  });
});

describe("NAT-07 Base64 del núcleo", () => {
  it("NAT-07 round-trip con Buffer y rechazo estricto", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 600 }), (b) => {
        expect(decodificarBase64(Buffer.from(b).toString("base64"))).toStrictEqual(new Uint8Array(b));
      }),
      { numRuns: 1000 },
    );
    for (const x of ["", "A", "AB=C", "A===", "QU%D", 5, null]) expect(decodificarBase64(x)).toBeNull();
    expect(decodificarBase64("QQ==")).toStrictEqual(new Uint8Array([65]));
    expect(decodificarBase64("QUI=")).toStrictEqual(new Uint8Array([65, 66]));
  });
});
