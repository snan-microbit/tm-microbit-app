# Arquitectura — ML · micro:bit

> Fuente de verdad sobre el estado del código para conversaciones de planificación.
> Refleja el código real del repositorio; ver regla de mantenimiento al final.

## 1. Propósito y alcance

ML · micro:bit es una Progressive Web App educativa, desarrollada para Plan Ceibal, que permite entrenar modelos de Machine Learning directamente en el navegador —sin servicios externos ni backend— y conectar sus predicciones a una placa BBC micro:bit por Bluetooth Low Energy. Soporta tres tipos de proyecto: clasificación de **imagen** (webcam + MobileNet), de **audio** (micrófono + Speech Commands) y de **pose** corporal (webcam + MediaPipe PoseLandmarker). El público objetivo son estudiantes y docentes; toda la interfaz está en español.

El flujo completo ocurre en el cliente: el usuario crea un proyecto, define clases, captura muestras, entrena por transfer learning, prueba el modelo en vivo y programa el micro:bit con bloques desde un panel MakeCode embebido. Las predicciones se transmiten por UART BLE en tiempo real. La app es instalable y funciona offline después de la primera carga (salvo el editor MakeCode, que requiere conexión y tiene fallback explícito).

## 2. Mapa de módulos

### `js/app.js`
Orquestador principal: navegación entre pantallas (home / entrenamiento / predicción), renderizado de UI, wiring de eventos, ciclo de vida de la webcam compartida y coordinación de los tres trainers. Registra el Service Worker. Selecciona el trainer activo con `getTrainer()` según `currentModel.projectType`.

Exporta:
- `showToast(message, type)` — muestra un toast de estado (`info` | `success` | `error`) durante 3 segundos.

Funciones internas clave (no exportadas): `renderModels()`, `openTrainingScreen(project)`, `openPredictionScreen(model)`, `renderTrainingClasses()`, `renderTrainingPredictions(predictions)`, `startPredictionLoop()`, `startPosePredictionLoop()`, `openPreviewModal()`, `enterCaptureMode()`.

### `js/protocol.js`
Lógica pura del protocolo UART, sin APIs de navegador (solo `TextEncoder`, también global en Node). Es el único módulo cubierto por tests unitarios y no debe adquirir dependencias de DOM/hardware.

Exporta:
- `UART_MAX_BYTES` — constante `20`, límite de bytes por mensaje BLE.
- `formatUartMessage(className, confidence)` — devuelve `Uint8Array` con `"className#confidence\n"` codificado en UTF-8, garantizado ≤ 20 bytes. Redondea la confianza con `Math.round` (no la limita a 0-100). Si el mensaje excede el límite, trunca el nombre de clase a nivel de bytes retrocediendo sobre bytes de continuación UTF-8 para no partir caracteres multibyte.

### `js/bluetooth.js`
Conexión Web Bluetooth con el micro:bit (servicio UART Nordic) y envío de predicciones. Importa `formatUartMessage` desde `protocol.js`. Mantiene un keep-alive que escribe `"\n"` cada 2 minutos para que la conexión no caduque.

Exporta:
- `connectMicrobit()` — abre el diálogo de dispositivos (filtro `namePrefix: 'BBC micro:bit'`), conecta GATT, obtiene la característica TX y arranca el keep-alive. Devuelve `true` o lanza.
- `disconnectMicrobit()` — desconecta GATT y limpia estado.
- `sendToMicrobit(className, confidence)` — formatea con `formatUartMessage()` y escribe con `writeValueWithoutResponse`. Silencioso si no hay conexión.
- `isConnected()` — booleano de estado de conexión.
- `setDisconnectCallback(fn)` — callback invocado en cada desconexión (la UI lo usa para resetear el botón Conectar).

### `js/image-trainer.js`
Transfer learning de imagen: MobileNet v1 (alpha 0.25, entrada 224×224, self-hosted) truncado en la capa `conv_pw_13_relu` como extractor de features (12544 floats), más una cabeza densa entrenable `Dense(100, relu, L2) → Dense(N, softmax)` (Adam 1e-4, 50 épocas, batch 16, validationSplit 0.15). Depende del global `tf` (TF.js cargado por `<script>` clásico).

Exporta: `initTrainer()`, `addClass(name)`, `removeClass(index)`, `renameClass(index, newName)`, `clearSamples(index)`, `getClasses()` (→ `[{name, count}]`), `getClassNames()`, `getTotalClasses()`, `getSamples(classIndex)` (→ `[{index, thumb}]`), `deleteSample(classIndex, sampleIndex)`, `captureOne(classIndex, webcamCanvas)`, `startCapture(classIndex, webcamCanvas)` (~5 fps), `stopCapture()`, `train(onProgress)`, `predict(canvas)` (→ `[{className, probability}]`), `saveModel(projectId)`, `loadSavedModel(localModelInfo)`, `deleteModel(storageKey)`, `saveSamples(projectId)`, `loadSamples(projectId)`, `deleteSamplesDB(projectId)`, `isTrained()`, `dispose()`.

Detalle no obvio: `train()` entrena una cabeza nueva **antes** de hacer dispose de la anterior — un `predict()` en vuelo sobre la cabeza vieja con lectura WebGL pendiente se corrompería si se la libera primero. Tras entrenar, libera las muestras en memoria (quedan las persistidas en IndexedDB).

### `js/audio-trainer.js`
Transfer learning de audio sobre la librería `speech-commands` (global `speechCommands`, modelo base `BROWSER_FFT`). Genera thumbnails de espectrograma para la galería y dibuja un visualizador de frecuencia en canvas. La primera clase es siempre `Ruido de fondo` (requisito de la librería).

Exporta: `initTrainer()`, `addClass(name)`, `removeClass(index)`, `renameClass(index, newName)` (lanza si la clase tiene muestras), `clearSamples(index)` (⚠ borra las muestras de **todas** las clases — limitación de `clearExamples()` de la librería), `getClasses()`, `getClassNames()`, `getTotalClasses()`, `getSamples(classIndex)`, `deleteSample(classIndex, sampleIndex)`, `recordSample(classIndex)` (~1 s), `startContinuousRecording(classIndex)` / `stopContinuousRecording()` (sin uso actual desde `app.js`), `getIsRecording()`, `train(onProgress)`, `startListening(callback)`, `stopListening()`, `isListening()`, `startVisualizer(canvasElement)`, `stopVisualizer()`, `saveModel(projectId)`, `loadSavedModel(localModelInfo)`, `deleteModel(storageKey)`, `saveSamples(projectId)`, `loadSamples(projectId)`, `deleteSamplesDB(projectId)`, `isTrained()`, `dispose()`.

Detalles no obvios: `train()` serializa las muestras, recrea el transfer recognizer desde cero y las recarga (evita corrupción de estado interno al re-entrenar tras `transfer.load()`). Las predicciones de `startListening()` llegan en orden **alfabético** (`transfer.wordLabels()`), no en orden de creación de clases; la UI las matchea por nombre. `saveModel()` intenta `transfer.save()` y cae a guardar el modelo interno; si ambos fallan solo emite warning (las muestras se guardan aparte).

### `js/pose-trainer.js`
Clasificador de pose: MediaPipe PoseLandmarker (lite, GPU, `runningMode: VIDEO`) extrae 33 keypoints (99 floats x,y,z) como features, y una cabeza TF.js `Dense(64, relu) → Dense(N, softmax)` (Adam 1e-3, 50 épocas) clasifica. Espera los globales `PoseLandmarker`/`FilesetResolver` que publica `mediapipe-loader.js` (con polling en `initTrainer()`).

Exporta: mismo contrato que `image-trainer.js` (con `captureOne(classIndex, webcamCanvas, imageSource, flip)` y `startCapture(...)` con firma extendida, y `captureOne` devuelve `false` si no detectó pose) más `extractKeypoints(imageSource, timestamp)`, `getLastLandmarks()` y `drawSkeleton(ctx, landmarks, canvasWidth, canvasHeight, flip)`.

Detalle no obvio: `dispose()` **no** libera `poseLandmarker` (recrearlo cuesta 2-3 s); solo libera la cabeza y las muestras.

### `js/webcam.js`
Exporta la clase `Webcam` — wrapper liviano de `getUserMedia`. El canvas es siempre cuadrado, center-crop de la resolución nativa: lo que se ve es exactamente lo que recibe el modelo. Espejado horizontal opcional (cámara frontal).

Métodos: `constructor(flip)`, `setup(facingMode)` (`'user'` | `'environment'`), `play()`, `update()` (dibuja el frame actual al canvas), `stop()`; getters `canvas` y `video`.

### `js/project-store.js`
CRUD de proyectos sobre `localStorage`. Tolerante a datos corruptos: si el JSON no parsea o no es array, preserva el valor bajo una clave de backup y devuelve `[]`.

Exporta:
- `loadModels()` — devuelve el array de proyectos (o `[]`).
- `saveModels(models)` — persiste; si se excede la cuota lanza `StorageQuotaError`.
- `StorageQuotaError` — clase de error con mensaje amigable para la UI.
- `addProject(name, projectType)` — crea `{id (timestamp), name, projectType, createdAt, lastUsed, makecodeProject: null}` y lo inserta al principio.
- `deleteProject(id, trainerModules)` — borra modelo entrenado y muestras del trainer correspondiente (según `localModel.source`) y saca el proyecto de la lista.
- `updateProjectMakeCode(id, makecodeProject)` — guarda el proyecto MakeCode y actualiza `lastUsed`.
- `updateProjectModel(id, localModelInfo)` — guarda `localModel` y `classNames`; devuelve el proyecto actualizado o `null`.

### `js/makecode-embed.js`
Panel MakeCode embebido por iframe (modo `?controller=1`) con comunicación `postMessage`. Genera el proyecto inicial con la extensión `pxt-tm-microbit-link-v2` (pineada por commit) y un archivo `tm-classes.ts` con enum tipado de las clases del modelo, regenerado en cada carga para mantener los nombres sincronizados. Valida los mensajes entrantes por ventana emisora **y** origen. Si MakeCode no responde en 8 s o no hay conexión, muestra overlay de fallback con botón de reintento.

Exporta:
- `openMakeCode(classNames, savedProject, onSave, projectName, iframeId, hideSimulator)` — abre el editor; `onSave` recibe el proyecto en cada guardado de MakeCode.
- `closeMakeCode(iframeId)` — desregistra el handler, cancela timeouts y limpia el iframe.
- `retryMakeCode(iframeId)` — reintenta con los últimos parámetros usados.

### `js/mediapipe-loader.js`
Publica en `window` las clases de MediaPipe Tasks Vision (`FilesetResolver`, `PoseLandmarker`, `DrawingUtils`) importadas del bundle ESM self-hosted. Existe como archivo separado (no inline) para que la CSP mantenga `script-src 'self'` sin excepciones.

### `js/trainer-config.js`
Tabla de configuración declarativa (`TRAINER_CONFIGS`) con las diferencias de UI/comportamiento por tipo de trainer (labels e íconos de captura, modo de captura, primera clase fija de audio, mensajes de fallo). Sin lógica ni imports.

Exporta: `TRAINER_CONFIGS`, `getConfig(projectType)`.

### `js/regenerator-guard.js`
Script clásico (no módulo) que debe cargar **antes** de TF.js: declara `window.regeneratorRuntime = undefined` para que la asignación de regenerator-runtime no dispare el fallback con `Function(...)`, que la CSP bloquearía. Permite mantener `script-src` sin `'unsafe-eval'`.

### `js/tm-import/` (archivado)
`model-loader.js` y `predictions.js` implementaban la importación de modelos de Teachable Machine por URL; la feature se eliminó y los archivos se conservan fuera del flujo de carga (nada los importa; no están en el precache del SW). Su README documenta los pasos para re-habilitarlos. Nota: tal como está archivado, `predictions.js` importa `./bluetooth.js`, ruta que solo vuelve a resolver si los archivos se mueven de vuelta a `js/` como indica ese README.

### Tests (`tests/protocol.test.js`)
Suite del runner nativo de Node (`node:test`, sin dependencias npm) que cubre `formatUartMessage`: formato, redondeo, ausencia de clamp, límite de 20 bytes, truncado con sufijo preservado, fronteras UTF-8 (ñ, emojis) y casos borde; más un test de humo que verifica que `bluetooth.js` importa limpio en Node y conserva su API pública. Se corre con `npm test` (script: `node --test tests/`). El CI (GitHub Actions) los ejecuta en Node 20 y además verifica los checksums SHA-256 de `vendor/`.

## 3. Flujos principales

### Entrenar un modelo (imagen; audio y pose son análogos)

```
[click "Abrir" o crear proyecto]
renderModels() → openTrainingScreen(project)
    → trainer.initTrainer()                      // carga MobileNet, arma extractor
    → si project.localModel:
        trainer.loadSavedModel() → trainer.loadSamples(project.id)
        → si trainer.isTrained(): openPredictionScreen(project)   // salta directo
    → renderTrainingClasses() → openCaptureWebcam()

[capturar muestras]
btn Capturar → trainer.captureOne(ci, canvas)
btn Grabar   → trainer.startCapture(ci, canvas) … trainer.stopCapture()
    // audio: recordWithCountdown(ci) → audioTrainer.recordSample(ci) (batch de 10 en loop)

[click "Entrenar"]  (habilitado con ≥2 clases y ≥8 muestras por clase)
trainBtn → trainer.saveSamples(id) → trainer.train(onProgress)
    → trainer.saveModel(id) → updateProjectModel(id, info)
    → trainer.loadSamples(id) → renderTrainingClasses()   // camera trainers
    → openPreviewModal()                                   // prueba en vivo
[desde el preview] previewProgramBtn → openPredictionScreen(currentModel)
```

### Predecir y enviar por BLE

```
openPredictionScreen(model)
    → startPredictionLoop()            // imagen: rAF loop
       | startPosePredictionLoop()     // pose: rAF loop + drawSkeleton()
       | audioTrainer.startListening() // audio: callback de la librería
    → openMakeCode(classNames, model.makecodeProject, onSave, …)

[cada frame / resultado]
webcam.update() → trainer.predict(canvas) → renderTrainingPredictions(preds)
    → si isConnected(): sendToMicrobit(ganadora.className, prob*100)
        → formatUartMessage() → txCharacteristic.writeValueWithoutResponse()

[botón Conectar]
predictionConnectBtn → connectMicrobit() → startKeepAlive()   // '\n' cada 2 min
```

Solo se envía la clase ganadora de cada tanda de predicciones. Las predicciones se muestran sin reordenar (el orden de audio es alfabético y se matchea por nombre).

### Guardar / cargar un proyecto

```
[crear]    startTrainingBtn → addProject(name, type) → openTrainingScreen()
[entrenar] train → updateProjectModel(id, localModelInfo)   // localModel + classNames
[MakeCode] workspacesave → onSave(proj) → updateProjectMakeCode(id, proj)
[abrir]    renderModels() → loadModels() → openTrainingScreen(model)  // auto-forward si entrenado
[borrar]   deleteProject(id, {trainer, audioTrainer, poseTrainer})
               → <trainer>.deleteModel(storageKey) → <trainer>.deleteSamplesDB(id)
               → saveModels(models sin el proyecto)
```

## 4. Persistencia

### localStorage

| Clave | Contenido |
|---|---|
| `tm_microbit_models` | Array de proyectos: `{id, name, projectType, createdAt, lastUsed, makecodeProject, localModel?, classNames?}` |
| `tm_microbit_models_corrupt_<timestamp>` | Backup automático del valor si se detectó corrupto al cargar |

`localModel` según el tipo: `{source: 'local' \| 'local-audio' \| 'local-pose', storageKey, classNames, trainedAt}` (imagen agrega `featureExtractor: "mobilenet_v1_0.25_224"`).

### IndexedDB

Base propia `tm-microbit` (v1), object store `samples`:

| Clave | Contenido |
|---|---|
| `tm-samples-<projectId>` | Muestras de imagen: `[{ci, img224 (dataURL JPEG 224×224), thumb}]` |
| `tm-audio-samples-<projectId>` | Muestras de audio serializadas por `transfer.serializeExamples()` |
| `tm-pose-samples-<projectId>` | Muestras de pose: `[{ci, features (99 números), thumb}]` |

Modelos entrenados vía `tf.io` (`indexeddb://<storageKey>`, en la base interna de TF.js):

| storageKey | Modelo |
|---|---|
| `tm-local-<projectId>` | Cabeza de imagen |
| `tm-audio-local-<projectId>` | Modelo de audio |
| `tm-pose-local-<projectId>` | Cabeza de pose |

Además, el Service Worker mantiene el Cache Storage `tm-microbit-v7.3` con el app shell y todo `vendor/`.

## 5. Protocolo BLE

- **Servicio UART (Nordic):** `6e400001-b5a3-f393-e0a9-e50e24dcca9e`; característica TX `6e400003-...` (escritura con `writeValueWithoutResponse`).
- **Mensaje:** `className#confidence\n`, UTF-8, máximo **20 bytes** (`UART_MAX_BYTES`). La confianza es el porcentaje redondeado a entero (sin clamp a 0-100 — el llamador ya envía 0-100).
- **Truncado:** si el mensaje excede 20 bytes se recorta el nombre de clase a nivel de bytes, sin partir caracteres multibyte y preservando siempre el sufijo `#NN\n`.

Ejemplos concretos:

| Llamada | Bytes enviados |
|---|---|
| `formatUartMessage('Gato', 95)` | `Gato#95\n` (8 bytes) |
| `formatUartMessage('Perro', 87.6)` | `Perro#88\n` (9 bytes) |
| `formatUartMessage('Señal', 95)` | `Señal#95\n` (10 bytes, ñ = 2 bytes) |
| `formatUartMessage('NombreMuyLargoDeClase', 100)` | `NombreMuyLargoD#100\n` (20 bytes, nombre truncado) |

- **Keep-alive:** cada 120 s se escribe `"\n"` para evitar el timeout de la conexión; se detiene al desconectar.
- **Emisión:** solo la clase ganadora de cada tanda, únicamente con conexión activa.
- **Recepción en el micro:bit:** la extensión MakeCode `pxt-tm-microbit-link-v2` parsea `clase#certeza\n` y expone bloques de detección (ver README del repo).

## 6. Decisiones y restricciones vigentes

- **Cero dependencias npm en runtime.** `package.json` existe solo para el script de test (`node --test tests/`, runner nativo de Node ≥18) y está marcado `private`. No introducir dependencias.
- **Vanilla JS con módulos ES, sin frameworks ni build step.** Lo que está en el repo es lo que se sirve.
- **Librerías self-hosted y pineadas** en `vendor/` (TF.js 4.22.0, Speech Commands 0.5.4, MediaPipe Tasks Vision 0.10.14, MobileNet v1 0.25, fuentes Nunito). Sin CDNs en runtime. El CI verifica `vendor/CHECKSUMS.txt` (SHA-256).
- **CSP estricta** en `index.html`: `script-src 'self' 'wasm-unsafe-eval'` (sin `unsafe-eval` — de ahí `regenerator-guard.js` y `mediapipe-loader.js`), `frame-src` limitado a `https://makecode.microbit.org`, `object-src 'none'`.
- **MakeCode pineado a v7.1.47** (`MAKECODE_URL`) por el bug upstream microsoft/pxt-microbit#6629 (panic 070 con `music.*` + BLE en v8). No subir de versión sin verificar el fix. La extensión se pinea por commit en `generateProject()`.
- **Offline-first:** Service Worker con cache-first para `vendor/` (inmutable, ~28 MB) y network-first para el app shell; no se cachean respuestas de error; fallback a `index.html` en navegaciones y 503 explícito como último recurso. Al tocar archivos precacheados hay que subir `CACHE_NAME` (convención `tm-microbit-vX.Y`).
- **Mensajes postMessage validados** por ventana emisora y origen exacto (`MAKECODE_ORIGIN`).
- **Mínimos de entrenamiento:** 2 clases y 8 muestras por clase, validado en la UI (`updateTrainButton()`). Los `train()` de imagen y pose lo re-validan clase por clase; el de audio solo exige que haya ≥2 clases con 8+ muestras (una clase adicional con menos muestras no lo hace fallar — ahí la barrera es solo la UI).
- **Webcam cuadrada center-crop:** el usuario ve exactamente el encuadre que recibe el modelo.
- **La lógica testeable se extrae a módulos puros** (patrón `protocol.js`): sin APIs de navegador a nivel de módulo, importables desde `node:test`. Los tests documentan lo que el código hace.
- **localStorage defensivo:** datos corruptos se preservan en clave de backup; cuota excedida se reporta con `StorageQuotaError` y mensaje accionable.

## 7. Estado actual

**Última actualización:** 2026-07-31

**Features completas:** tres trainers (imagen, audio, pose) con captura, entrenamiento, preview en vivo y persistencia; conexión BLE con keep-alive y envío de la clase ganadora; panel MakeCode inline con proyecto generado, guardado automático y fallback offline; biblioteca de proyectos (crear/abrir/borrar); PWA instalable y offline; cambio de cámara frontal/trasera; modo expandido de predicción; suite de tests del protocolo UART con CI (tests + checksums de vendor).

**Deuda y pendientes conocidos:**

- Cobertura de tests limitada al protocolo UART. Fases futuras previstas: serialización de proyectos en localStorage, operaciones sobre clases/muestras y ordenamiento de predicciones (requieren extraer esa lógica a módulos puros, mismo patrón que `protocol.js`).
- `getClassColor()` en `app.js` ignora el índice y devuelve siempre el primer color: la paleta `CLASS_COLORS` de 6 colores está definida pero todas las clases se pintan iguales (decisión o regresión — a confirmar antes de "arreglarlo").
- En `audio-trainer.js`, `clearSamples()` borra las muestras de **todas** las clases (limitación de `clearExamples()` de speech-commands); la UI no lo advierte.
- `saveModel()` de audio puede terminar sin persistir pesos (solo deja warning en consola) si ni `transfer.save()` ni el modelo interno están disponibles; el proyecto queda dependiente de re-entrenar desde muestras.
- `startContinuousRecording()`/`stopContinuousRecording()` de audio están exportadas pero sin uso desde `app.js` (el batch usa `recordSample()` en loop con countdown).
- `js/tm-import/` archivado con imports que no resuelven en su ubicación actual (esperado; ver su README para re-habilitar).
- El botón `newModelBtn` del home está `display:none` (reemplazado por la card "Nuevo Proyecto"); el markup sigue en `index.html`.

---

> **Regla de mantenimiento:** todo documento de implementación futuro debe incluir como paso final la actualización de este archivo con los cambios introducidos. El revisor QA verifica que se haya hecho. Tras cada actualización, subir la nueva versión al conocimiento del proyecto en claude.ai.
