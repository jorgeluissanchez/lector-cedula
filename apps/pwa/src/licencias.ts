/**
 * Textos de la pantalla "Acerca de y licencias" (pwa-lectura-offline, OFF-20; condiciones C1 y C2 del revisor de
 * licencias). Atribución de los datos DIVIPOL y DIVIPOLA bajo CC BY-SA 4.0, indicación de cambios y alcance de la
 * licencia: los datos van bajo CC BY-SA 4.0; el código de la aplicación es MIT y no queda sujeto a ella.
 */

export const LICENCIA_CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/legalcode.es";
export const RUTA_AVISOS = "/assets/THIRD_PARTY_LICENSES.txt";
export const TEXTO_ENLACE_FUENTES = "Fuentes: DANE y Registraduría (CC BY-SA 4.0)";

export interface SeccionLicencia {
  readonly titulo: string;
  readonly parrafos: readonly string[];
  readonly fuente?: string;
}

export const SECCIONES_LICENCIAS: readonly SeccionLicencia[] = [
  {
    titulo: "DIVIPOLA (DANE)",
    parrafos: [
      "Autor: Departamento Administrativo Nacional de Estadística (DANE). Título: DIVIPOLA Códigos municipios (datos.gov.co, conjunto gdxc-w37w). Licencia: CC BY-SA 4.0.",
      "Material adaptado: solo pares de códigos DIVIPOL-DIVIPOLA. No se copian nombres, coordenadas ni tipos del DANE.",
    ],
    fuente: "https://www.datos.gov.co/d/gdxc-w37w",
  },
  {
    titulo: "Divipole Exterior 2018 (Registraduría)",
    parrafos: [
      "Autor: Registraduría Nacional del Estado Civil. Título: Divipole Exterior Presidente 2018 (datos.gov.co, conjunto vh8b-jfhg). Licencia: CC BY-SA 4.0.",
      "Cambios: extracto de los códigos y nombres de consulados; erratas corregidas (AZERBAIYAN, VIETNAM y SINGAPUR) y códigos alternos 88195 y 88480.",
    ],
    fuente: "https://www.datos.gov.co/d/vh8b-jfhg",
  },
  {
    titulo: "Condiciones",
    parrafos: [
      "El material adaptado se ofrece tal cual, sin garantías, y se redistribuye bajo CC BY-SA 4.0. Se usa sin aval del DANE ni de la Registraduría.",
      "El código de la aplicación se distribuye bajo licencia MIT y no queda sujeto a CC BY-SA 4.0. Las tablas generadas (archivos *.generated.ts) y su generador están en el repositorio fuente del proyecto: packages/parsers/src/divipola/, packages/parsers/src/divipol-2018/ y tools/divipol/generar-divipol.mjs.",
    ],
  },
];

/** Todo el texto visible de la pantalla (para pruebas y para el lector de pantalla). */
export const TEXTO_LICENCIAS: readonly string[] = SECCIONES_LICENCIAS.flatMap((s) => [s.titulo, ...s.parrafos]);
