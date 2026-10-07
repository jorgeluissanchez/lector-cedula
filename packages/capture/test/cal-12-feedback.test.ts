import { describe, expect, it } from "vitest";
import type { Motivo } from "../src/calidad/tipos.js";
import { crearFeedback, TEXTOS_FEEDBACK, textoSituacion } from "../src/flujo/feedback.js";

describe("CAL-12 Feedback en tiempo real", () => {
  it("CAL-12 Textos", () => {
    const situaciones = ["inicial", "acerca", "oscuro", "sobreexpuesto", "reflejo", "desenfocado", "estable", "listo"] as const;
    expect(situaciones.map(textoSituacion)).toStrictEqual([
      "Ubica la cédula dentro del recuadro",
      "Acerca la cédula",
      "Busca un lugar con más luz",
      "Hay demasiada luz",
      "Hay reflejo, inclina la cédula",
      "Desenfocado, mantén la cámara quieta",
      "No te muevas",
      "Listo",
    ]);
    expect(Object.keys(TEXTOS_FEEDBACK)).toHaveLength(8);
  });

  it("CAL-12 Textos alcanzados por el flujo", () => {
    const f = crearFeedback();
    expect(f.texto).toBe("Ubica la cédula dentro del recuadro");
    const motivos: (Motivo | null)[] = ["acerca", "oscuro", "sobreexpuesto", "reflejo", "desenfocado", null];
    const textos = motivos.map((m) => {
      f.actualizar({ motivo: m });
      return f.actualizar({ motivo: m });
    });
    expect(textos).toStrictEqual([
      "Acerca la cédula",
      "Busca un lugar con más luz",
      "Hay demasiada luz",
      "Hay reflejo, inclina la cédula",
      "Desenfocado, mantén la cámara quieta",
      "No te muevas",
    ]);
    expect(f.listo()).toBe("Listo");
    expect(f.texto).toBe("Listo");
  });

  it("CAL-12 Histéresis", () => {
    const f = crearFeedback();
    const motivos: Motivo[] = ["reflejo", "reflejo", "desenfocado", "reflejo", "desenfocado", "desenfocado"];
    expect(motivos.map((m) => f.actualizar({ motivo: m }))).toStrictEqual([
      "Ubica la cédula dentro del recuadro",
      "Hay reflejo, inclina la cédula",
      "Hay reflejo, inclina la cédula",
      "Hay reflejo, inclina la cédula",
      "Hay reflejo, inclina la cédula",
      "Desenfocado, mantén la cámara quieta",
    ]);
  });

  it("CAL-12 Listo es inmediato y reiniciar vuelve al texto inicial", () => {
    const f = crearFeedback();
    f.actualizar({ motivo: "reflejo" });
    expect(f.listo()).toBe("Listo");
    f.reiniciar();
    expect(f.texto).toBe("Ubica la cédula dentro del recuadro");
    expect(f.actualizar({ motivo: "oscuro" })).toBe("Ubica la cédula dentro del recuadro");
  });
});
