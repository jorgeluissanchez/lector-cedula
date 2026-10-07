// Worker de prueba igual al de la app (design.md, decisión 2): detector por defecto con la guía de CAM-08.
import { crearDetectorGuia } from "../../src/flujo/guia.js";
import { iniciarWorkerCalidad, type AlcanceWorker } from "../../src/navegador/worker-calidad.js";

iniciarWorkerCalidad(self as unknown as AlcanceWorker, crearDetectorGuia());
