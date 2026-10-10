# Backend Go

El módulo Go (`motor.Nuevo`, `LeerDocumento(ctx)`) está (planeado). Mientras tanto: sidecar Node con `crearLectorServidor` ([backend-express.md](backend-express.md)) o protocolo a mano según [protocolo.md](protocolo.md).

## Responder NDJSON

```go
func leer(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	f, _ := w.(http.Flusher)
	enviar := func(linea string) {
		io.WriteString(w, linea+"\n")
		if f != nil {
			f.Flush()
		}
	}
	enviar(`{"etapa":"recibido"}`)
	enviar(`{"etapa":"leyendo","progreso":0.5}`)
	// ... tu lectura; nunca datos del documento en eventos intermedios
	enviar(`{"etapa":"resultado","ok":false,"rechazo":{"motivo":"ilegible"}}`)
}
```

Con `Accept: application/json` (sin `application/x-ndjson`) o `?streaming=0`, responde un único JSON igual al evento final.

## Verificar un webhook (modo microservicio)

```go
func verificar(cuerpo []byte, firma, secreto string, ahora int64) bool {
	var t int64 = -1
	var v1 [][]byte
	for _, parte := range strings.Split(firma, ",") {
		kv := strings.SplitN(strings.TrimSpace(parte), "=", 2)
		if len(kv) != 2 {
			return false
		}
		switch kv[0] {
		case "t":
			n, err := strconv.ParseInt(kv[1], 10, 64)
			if err != nil {
				return false
			}
			t = n
		case "v1":
			b, err := hex.DecodeString(kv[1])
			if err != nil {
				return false
			}
			v1 = append(v1, b)
		}
	}
	if t < 0 || len(v1) == 0 {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secreto))
	mac.Write([]byte(strconv.FormatInt(t, 10) + "."))
	mac.Write(cuerpo)
	esperado := mac.Sum(nil)
	ok := false
	for _, v := range v1 {
		ok = hmac.Equal(esperado, v) || ok
	}
	d := ahora - t
	return ok && d <= 300 && d >= -300
}
```

Cabecera `X-Lector-Signature`; lee el cuerpo crudo antes de deserializar; 204 si lo procesaste, 400 si la firma no es válida.
