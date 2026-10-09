// Worker de calidad del núcleo (SDK-04): guía de CAM-08 y presencia de OFF-22, como el de la PWA.
import { crearDetectorGuia, iniciarWorkerCalidad, type AlcanceWorker } from "@lector-cedula/capture";

iniciarWorkerCalidad(self as unknown as AlcanceWorker, crearDetectorGuia(), { presencia: true });
