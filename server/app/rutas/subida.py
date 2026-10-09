"""`POST /v1/validations/{id}/images`: subida única y síncrona (decisión 2, AV-07 a AV-10, AV-22).

Orden de las comprobaciones, todas antes de leer el cuerpo salvo las de las partes:
1. Autenticación: token firmado de `upload.url` (403 si no es válido para este `id` o venció) o clave
   del creador (401, y 404 si la validación es de otro cliente).
2. Rate limiting a cuenta de la clave creadora (429).
3. Estado: solo `pending` admite subida (409); modo live sin motor (503).
4. `Content-Length` y `Content-Type` (413, 415); después, lectura en streaming de las partes.
Las imágenes viven solo en esta función: el motor las recibe y nadie guarda una referencia.
"""

import logging

from fastapi import Request
from fastapi.responses import Response

from app.almacen import Validacion
from app.auth import aplicar_limite, cliente_requerido, exigir_origen
from app.errores import ErrorApi
from app.multipart import comprobar_antes_de_leer, leer_imagenes
from app.representacion import representar, serializar
from app.rutas.alojada import origenes_de_la_sesion
from app.servicio import ServicioValidaciones
from app.token_subida import verificar_token

log = logging.getLogger("lector.subida")


async def _validacion_autorizada(
    request: Request, servicio: ServicioValidaciones, id_validacion: str
) -> Validacion:
    token = request.query_params.get("token")
    if token is not None:
        verificacion = verificar_token(
            request.app.state.config.secreto_subida, id_validacion, token, servicio.puertos.reloj.ahora()
        )
        if verificacion == "invalido":
            raise ErrorApi(403, "upload-token-invalid")
        if verificacion == "vencido":
            raise ErrorApi(403, "upload-token-expired")
        validacion = servicio.obtener(id_validacion, propietario=None)
        if validacion is None:
            raise ErrorApi(404, "not-found")
        request.state.sandbox = validacion.sandbox
        config = request.app.state.config
        creadora = config.claves.get(validacion.propietario)
        if validacion.sesion_alojada:
            exigir_origen(request, origenes_de_la_sesion(config, validacion))
        else:
            exigir_origen(request, config.origenes_de(creadora) if creadora is not None else ())
        aplicar_limite(request, validacion.propietario)
    else:
        cliente = await cliente_requerido(request)
        aplicar_limite(request, cliente.hash_clave)
        validacion = servicio.obtener(id_validacion, propietario=cliente.hash_clave)
        if validacion is None:
            raise ErrorApi(404, "not-found")
    request.state.validation_id = validacion.id
    return validacion


async def subir_imagenes(id_validacion: str, request: Request) -> Response:
    servicio: ServicioValidaciones = request.app.state.servicio
    validacion = await _validacion_autorizada(request, servicio, id_validacion)
    if validacion.status != "pending" or validacion.procesando:
        raise ErrorApi(409, "validation-not-pending")
    motor = servicio.puertos.motor_sandbox if validacion.sandbox else servicio.puertos.motor_live
    if motor is None:
        raise ErrorApi(503, "engine-unavailable")
    limite = comprobar_antes_de_leer(
        request.headers.get("content-type"), request.headers.get("content-length")
    )

    # Reserva la validación: una segunda subida concurrente recibe 409 y el vencimiento no la toca.
    validacion.procesando = True
    try:
        imagenes = await leer_imagenes(
            request.stream(), limite, validacion.face_match, una_cara=validacion.sesion_alojada
        )
        try:
            resultado = await motor.procesar(
                validacion.document_type, validacion.face_match, imagenes, validacion.escenario
            )
        except Exception:  # noqa: BLE001 - el mensaje del motor nunca sale: puede llevar datos
            del imagenes
            validacion.procesando = False
            servicio.fallar_procesamiento(validacion)
            log.error(
                "error_motor",
                extra={"campos": {"validation_id": validacion.id, "sandbox": validacion.sandbox}},
            )
            raise ErrorApi(500, "internal-error") from None
        del imagenes
        validacion.procesando = False
        servicio.completar(validacion, resultado)
    finally:
        validacion.procesando = False
    contenido = serializar(representar(validacion, request.app.state.config))
    return Response(content=contenido, status_code=200, media_type="application/json")
