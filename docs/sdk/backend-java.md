# Backend Java

La librería Java (motor y manejador) está (planeado). Mientras tanto hay dos opciones:

1. **Sidecar Node**: corre un servicio Node pequeño con `crearLectorServidor` (ver [backend-express.md](backend-express.md)) en la misma red privada y haz de proxy desde tu backend Java (sidecar con `compose.yaml`: (planeado)).
2. **Protocolo a mano**: si ya tienes un lector propio, implementa la respuesta según [protocolo.md](protocolo.md) para que el front `@lector-cedula/web` la entienda.

## Responder NDJSON (Spring MVC)

```java
@PostMapping(path = "/api/cedula", produces = "application/x-ndjson")
public StreamingResponseBody leer(@RequestParam("imagen") MultipartFile imagen,
                                  @RequestParam(value = "cliente", required = false) String cliente) {
  return salida -> {
    escribir(salida, "{\"etapa\":\"recibido\"}");
    escribir(salida, "{\"etapa\":\"leyendo\",\"progreso\":0.5}");
    // ... tu lectura, comparación y fraude; nunca datos del documento en eventos intermedios
    escribir(salida, "{\"etapa\":\"resultado\",\"ok\":false,\"rechazo\":{\"motivo\":\"ilegible\"}}");
  };
}

private static void escribir(OutputStream s, String linea) throws IOException {
  s.write((linea + "\n").getBytes(StandardCharsets.UTF_8));
  s.flush();
}
```

Si la petición trae `Accept: application/json` sin `application/x-ndjson`, o `?streaming=0`, responde un único JSON igual al evento final con `Content-Type: application/json`.

## Verificar un webhook (modo microservicio)

Cabecera `X-Lector-Signature: t=<unix>,v1=<hex>`; `v1` es HMAC-SHA256 con el secreto sobre `<t>.<bytes exactos del cuerpo>`. Compara en tiempo constante y rechaza si `|ahora - t| > 300` s.

```java
static boolean verificar(byte[] cuerpo, String firma, String secreto, long ahora) throws Exception {
  if (firma == null) return false;
  Long t = null; List<String> v1 = new ArrayList<>();
  for (String parte : firma.split(",")) {
    String[] kv = parte.trim().split("=", 2);
    if (kv.length != 2) return false;
    if (kv[0].equals("t")) t = Long.parseLong(kv[1]);
    else if (kv[0].equals("v1")) v1.add(kv[1]);
  }
  if (t == null || v1.isEmpty()) return false;
  Mac mac = Mac.getInstance("HmacSHA256");
  mac.init(new SecretKeySpec(secreto.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
  mac.update((t + ".").getBytes(StandardCharsets.UTF_8));
  byte[] esperado = mac.doFinal(cuerpo);
  boolean ok = false;
  for (String v : v1) ok |= MessageDigest.isEqual(esperado, HexFormat.of().parseHex(v));
  return ok && Math.abs(ahora - t) <= 300;
}
```

Lee el cuerpo como bytes antes de cualquier deserialización; responde 204 si lo procesaste, 400 si la firma no es válida.
