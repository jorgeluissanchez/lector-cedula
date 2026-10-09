// Worker de calidad de la app (design.md, decisión 2): detector por defecto con la guía de CAM-08.
import { crearDetectorGuia, iniciarWorkerCalidad, type AlcanceWorker } from "@lector-cedula/capture";

// OFF-22: sin cédula (PDF417 o MRZ) dentro de la guía, nunca `listo`. OD-20: contenido "mrz-td1" o "mrz-td3".
iniciarWorkerCalidad(self as unknown as AlcanceWorker, crearDetectorGuia(), { presencia: true, contenidoTd: true });
