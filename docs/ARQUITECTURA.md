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

Todo texto de usuario interpolado en templates HTML (nombres de proyecto/clase, ids en `data-*`) pasa por `escapeHtml()` de `sanitize.js`, que escapa también comillas (seguro en contexto de atributo). Los thumbnails de las galerías (`renderTrainingClasses()`, `updateClassUI()`) se asignan por propiedad (`img.src`), nunca interpolados en el template.

Los nombres de clase se normalizan con `class-name.js` en el punto donde se guardan: el input de renombrado filtra caracteres inseguros y limita a 15 bytes mientras el usuario escribe (con contador `.class-name-counter` visible al acercarse al límite), y el `change` rechaza duplicados (case-insensitive) con toast y revierte. `addClassBtn` busca el primer `Clase N` libre para no colisionar con una clase renombrada. Helper: `updateNameCounter(input)`.

### `js/protocol.js`
Lógica pura del protocolo UART, sin APIs de navegador (solo `TextEncoder`, también global en Node). Cubierto por tests unitarios (junto con `sanitize.js`, `class-name.js` y `storage-keys.js`); no debe adquirir dependencias de DOM/hardware. Importa `stripUnsafeChars()` de `class-name.js` (única dependencia; la relación nunca va en sentido inverso).

Exporta:
- `UART_MAX_BYTES` — constante `20`, límite de bytes por mensaje BLE.
- `formatUartMessage(className, confidence)` — devuelve `Uint8Array` con `"className#confidence\n"` codificado en UTF-8, garantizado ≤ 20 bytes. Filtra el nombre con `stripUnsafeChars()` (defensa en profundidad: `#` y caracteres de control nunca llegan al aire). Redondea la confianza con `Math.round` (no la limita a 0-100). Si el mensaje excede el límite, trunca el nombre de clase a nivel de bytes retrocediendo sobre bytes de continuación UTF-8 para no partir caracteres multibyte.

### `js/class-name.js`
Lógica pura de nombres de clase (mismo patrón que `protocol.js`: sin APIs de navegador, importable desde `node:test`, cubierta por tests). No importa nada. Es la fuente única de las reglas de nombres para sus tres consumidores: el almacenamiento, el cable UART y el enum de TypeScript generado para MakeCode. La normalización ocurre **una sola vez, al guardar el nombre**; el resto del código lee el valor ya limpio.

Exporta:
- `MAX_CLASS_NAME_BYTES` — constante `15`. `UART_MAX_BYTES` (20) menos el sufijo del peor caso `#100\n` (5 bytes). Es literal, no derivado de `protocol.js`, para evitar un import circular.
- `stripUnsafeChars(value)` — elimina `#` (separador UART), `"` y `\` (romperían el TypeScript generado) y reemplaza caracteres de control por espacio (`"a\nb"` → `"a b"`, no `"ab"`). Incluye `U+2028`/`U+2029` en ese set porque `JSON.stringify()` **no** los escapa: quedarían como salto de línea real dentro del literal del TypeScript generado.
- `byteLength(value)` — largo en bytes UTF-8.
- `truncateToBytes(value, maxBytes)` — recorta sin partir caracteres multibyte.
- `normalizeClassName(value)` — forma canónica: filtra, colapsa espacios, hace trim y recorta a `MAX_CLASS_NAME_BYTES`. Devuelve `''` si no queda nada; el llamador decide (la UI revierte al nombre anterior).
- `isDuplicateClassName(name, existingNames, ignoreIndex)` — comparación case-insensitive; `ignoreIndex` permite que un rename conserve su propio nombre.
- `toEnumIdentifier(name, fallback)` — identificador ASCII válido para un miembro de enum TS. Translitera acentos, sanea **todos** los caracteres (incluido el primero) y prefija `_` si empieza con dígito.
- `deriveEnumIdentifiers(classNames)` — un identificador por clase, con unicidad garantizada por sufijo numérico ante colisiones.

### `js/storage-keys.js`
Fuente única de los nombres de todo lo que la app persiste (mismo patrón que `protocol.js`: sin APIs de navegador, importable desde `node:test`, cubierta por tests). No importa nada. Existe porque los literales que construían claves estaban dispersos en cuatro archivos, sin constante compartida ni cobertura: un prefijo distinto entre el `saveSamples()` y el `loadSamples()` de un mismo trainer no produce ningún error, solo muestras que no cargan.

Todo nombre que compite por un espacio de nombres del origen lleva prefijo `ml-`. La razón no es cosmética: GitHub Pages sirve los project sites de la organización en `https://ml-microbit.github.io/<repo>/`, el mismo origen que esta app, y localStorage, IndexedDB y Cache Storage están particionados por origen y no por path. El caso más expuesto son los `storageKey` de modelos, que no viven en la base propia sino en la interna de TF.js, compartida con cualquier app del origen que use la librería.

Dos nombres quedan deliberadamente fuera del módulo. `SAMPLES_STORE` no lleva prefijo porque vive dentro de la base propia y no compite con nadie. `CACHE_NAME` sigue siendo un literal en `sw.js`, y esa sí es una excepción real: es un nombre de alcance de origen, pero el Service Worker es un script clásico de worker que no comparte el grafo de módulos ES de la app y no puede importar de acá; además su valor cambia en otra cadencia, en cada deploy que toca archivos precacheados.

Exporta:
- `MODELS_KEY` — `'ml-microbit-models'`, clave de localStorage con el array de proyectos.
- `SAMPLES_DB_NAME` — `'ml-microbit-app'`, nombre de la base IndexedDB propia. El sufijo `-app` es deliberado: `ml-microbit` a secas es el nombre de la organización y por lo tanto el candidato más probable a ser elegido por otra app del mismo origen.
- `SAMPLES_STORE` — `'samples'`, object store dentro de esa base.
- `imageSamplesKey(projectId)` / `audioSamplesKey(projectId)` / `poseSamplesKey(projectId)` — clave del registro de muestras dentro del object store.
- `imageModelKey(projectId)` / `audioModelKey(projectId)` / `poseModelKey(projectId)` — `storageKey` del modelo entrenado, dentro de la base de TF.js.
- `corruptBackupKey(timestamp)` — clave de localStorage donde se preserva un valor corrupto de `MODELS_KEY` para inspección manual.

Los siete constructores validan **dominio**, no solo centinelas: rechazan `undefined`, `null`, string vacío o en blanco, número no finito, y cualquier valor que no sea string ni número. La razón es que el id se rehidrata de localStorage, que el proyecto trata como entrada de usuario, y un valor que coerciona a vacío —`[]`, `''`, `'   '`— produce una clave sin nada después del último guión, que se escribiría en silencio y aparecería mucho después como muestras que no cargan. `0` y `'0'` son ids válidos y se aceptan.

Un string con espacios alrededor se **rechaza, no se recorta**. Recortarlo volvería el mapeo id→clave no inyectivo —`'42'` y `'  42  '` compartirían clave— mientras `project-store.js` los sigue distinguiendo con `===`: los dos archivos discreparían sobre si dos registros son el mismo proyecto. Rechazar mantiene una sola noción de identidad. La coerción número→string sí se conserva, porque `corruptBackupKey()` recibe un timestamp. La versión de la base (`1`) **no** se centraliza acá a propósito: es un asunto de migración de esquema que cada `idbOpen()` maneja junto a su `onupgradeneeded`, no un espacio de nombres.

### `js/sanitize.js`
Lógica pura de sanitización (mismo patrón que `protocol.js`: sin APIs de navegador, importable desde `node:test`, cubierta por tests). Centraliza el escape de HTML y la validación de forma de las muestras rehidratadas desde IndexedDB, que el proyecto trata como entrada de usuario.

Exporta:
- `escapeHtml(value)` — escapa `& < > " '`; a diferencia del round-trip `textContent`/`innerHTML`, es seguro también en contexto de atributo entre comillas (`value="${...}"`). `null`/`undefined` devuelven `''`; otros valores se convierten con `String()`.
- `isDataImageUrl(value)` — `true` solo para strings `data:image/jpeg;base64,...` o `data:image/png;base64,...`, los únicos formatos que los trainers producen con `toDataURL()`.
- `isValidImageSample(sample)` — valida `{ci, img224, thumb}` contra la forma que escribe `saveSamples()` de `image-trainer.js` (`ci` entero ≥ 0, data URLs de imagen).
- `isValidPoseSample(sample, featureSize)` — valida `{ci, features, thumb}` contra la forma que escribe `saveSamples()` de `pose-trainer.js` (`features`: array de exactamente `featureSize` números finitos).
- `isValidSpectrogram(spectrogram)` — valida `{data, frameSize}` contra lo que `generateSpectrogramThumb()` de `audio-trainer.js` necesita para dibujar el canvas: `frameSize` entero > 0 y `data` (`Float32Array` o `Array`) no vacía y de largo múltiplo de `frameSize`, porque el ancho del canvas es `data.length / frameSize`. A diferencia de los otros dos validadores recibe el espectrograma y no el registro entero: la forma que lo rodea la maneja el recognizer de la librería y solo el espectrograma llega al canvas.

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

El nombre de la base IndexedDB, el del object store y las claves de muestras (`ml-image-samples-<id>`) y de modelo (`ml-image-local-<id>`) vienen de `storage-keys.js`; el módulo no construye ninguna con literales.

Detalles no obvios: `train()` entrena una cabeza nueva **antes** de hacer dispose de la anterior — un `predict()` en vuelo sobre la cabeza vieja con lectura WebGL pendiente se corrompería si se la libera primero. Tras entrenar, libera las muestras en memoria (quedan las persistidas en IndexedDB). `loadSamples()` descarta registros de IndexedDB con forma inválida (`isValidImageSample()` de `sanitize.js`) y también los que fallan al decodificar como imagen (handler `onerror` — sin él, la promise de carga nunca resolvería y la pantalla quedaría colgada).

### `js/audio-trainer.js`
Transfer learning de audio sobre la librería `speech-commands` (global `speechCommands`, modelo base `BROWSER_FFT`). Genera thumbnails de espectrograma para la galería y dibuja un visualizador de frecuencia en canvas. La primera clase es siempre `Ruido de fondo` (requisito de la librería).

El modelo base está self-hosteado en `vendor/speech-commands/browser_fft/18w/` y se pasa a `create()` en `initTrainer()` con la forma de cuatro argumentos (`fftType`, `vocabulary`, `customModelURL`, `customMetadataURL`); `vocabulary` va en `undefined` porque la librería asserta que sea nulo cuando se da una URL de modelo, y ambas URLs deben darse juntas. **Las dos URLs son absolutas y se anclan a `import.meta.url`**, no al documento: `SPEECH_MODEL_URL` y `SPEECH_METADATA_URL` se arman con `new URL('../vendor/...', import.meta.url).href`. Dos razones distintas lo exigen. Una relativa no sirve para la metadata: la resuelve el loader propio de la librería, que solo acepta `http://`, `https://` y `file://` y tira `Unsupported URL scheme in metadata URL`. Y anclar al documento (sea con `location.href` o, peor, con `document.baseURI`, que además obedece a un `<base>` inyectado) haría que las rutas se resolvieran contra el path desde el que se sirvió la página: como el Service Worker responde sin conexión cualquier navegación same-origin con el app shell (el `.catch()` de la rama network-first), abrir `…/foo/bar/` resolvería el modelo contra `/foo/bar/`. Anclado al módulo, la ruta es correcta venga de donde venga la navegación. No hardcodear la absoluta: la app puede servirse desde la raíz de un origen o desde un subpath, y la ruta tiene que resolver bien en ambos casos. Es la diferencia con `MOBILENET_URL` de `image-trainer.js`, que sigue siendo relativa. El vocabulario de 20 etiquetas en inglés del modelo base es un detalle de implementación —`createTransfer()` lo usa como extractor de features y entrena un head nuevo—, no se traduce ni se muestra en la UI.

**Ciclo de vida del modelo base.** `initTrainer()` publica `baseRecognizer` recién después de que `ensureModelLoaded()` resolvió: asignarlo antes dejaría, ante un fallo de carga, un `baseRecognizer` no nulo sin modelo detrás, y el guard de reentrada daría por buenas todas las llamadas siguientes con `transfer` en nulo. `dispose()` **no** libera `baseRecognizer`: son 5,9 MB de pesos y corre en toda transición de pantalla, también al abrir proyectos de imagen o pose (mismo criterio ya aplicado a `poseLandmarker` en `pose-trainer.js`). Sus tensores tampoco se disponen, porque el modelo de transfer comparte capas con el base y disponer uno dejaría al otro con tensores muertos. Como contrapartida de mantener el base vivo, `releaseTransfer()` da de baja el recognizer de transfer del registro interno `baseRecognizer.transferRecognizers`: `createTransfer()` registra ahí cada instancia y la librería no expone forma de quitarla, así que sin eso cada apertura de pantalla y cada reentrenamiento acumularían un modelo de transfer entero con sus espectrogramas. El nombre se lleva en `transferName` porque el recognizer no lo expone.

**Thumbnails y muestras rehidratadas.** `rebuildThumbs()` es el único punto que regenera `classThumbs` a partir de los ejemplos del recognizer (lo usan `train()` y `loadSamples()`), y filtra con `isValidSpectrogram()` de `sanitize.js`: los espectrogramas pueden venir de IndexedDB, que el proyecto trata como entrada de usuario, y un `frameSize` corrupto dimensionaría mal el canvas y cortaría el render a la mitad. En `loadSamples()` la llamada va dentro de su propio `try/catch`, separado del de `loadExamples()`.

Exporta: `initTrainer()`, `addClass(name)`, `removeClass(index)`, `renameClass(index, newName)` (lanza si la clase tiene muestras), `clearSamples(index)` (⚠ borra las muestras de **todas** las clases — limitación de `clearExamples()` de la librería), `getClasses()`, `getClassNames()`, `getTotalClasses()`, `getSamples(classIndex)`, `deleteSample(classIndex, sampleIndex)`, `recordSample(classIndex)` (~1 s), `startContinuousRecording(classIndex)` / `stopContinuousRecording()` (sin uso actual desde `app.js`), `getIsRecording()`, `train(onProgress)`, `startListening(callback)`, `stopListening()`, `isListening()`, `startVisualizer(canvasElement)`, `stopVisualizer()`, `saveModel(projectId)`, `loadSavedModel(localModelInfo)`, `deleteModel(storageKey)`, `saveSamples(projectId)`, `loadSamples(projectId)`, `deleteSamplesDB(projectId)`, `isTrained()`, `dispose()`.

El nombre de la base IndexedDB, el del object store y las claves de muestras (`ml-audio-samples-<id>`) y de modelo (`ml-audio-local-<id>`) vienen de `storage-keys.js`; el módulo no construye ninguna con literales. No confundirlas con `transferName`, que nombra al recognizer de transfer dentro del registro en memoria de la librería y no se persiste.

Detalles no obvios: **el nombre de clase es la clave con la que el transfer recognizer indexa las muestras** (`countExamples()`, `serializeExamples()`), no un rótulo aparte. De ahí que `renameClass()` lance si la clase ya tiene muestras: cambiar el nombre sin re-mapear las dejaría huérfanas. `train()` serializa las muestras, recrea el transfer recognizer desde cero y las recarga (evita corrupción de estado interno al re-entrenar tras `transfer.load()`). Las predicciones de `startListening()` llegan en orden **alfabético** (`transfer.wordLabels()`), no en orden de creación de clases; la UI las matchea por nombre. `saveModel()` intenta `transfer.save()` y cae a guardar el modelo interno; si ambos fallan solo emite warning (las muestras se guardan aparte).

### `js/pose-trainer.js`
Clasificador de pose: MediaPipe PoseLandmarker (lite, GPU, `runningMode: VIDEO`) extrae 33 keypoints (99 floats x,y,z) como features, y una cabeza TF.js `Dense(64, relu) → Dense(N, softmax)` (Adam 1e-3, 50 épocas) clasifica. Espera los globales `PoseLandmarker`/`FilesetResolver` que publica `mediapipe-loader.js` (con polling en `initTrainer()`).

Exporta: mismo contrato que `image-trainer.js` (con `captureOne(classIndex, webcamCanvas, imageSource, flip)` y `startCapture(...)` con firma extendida, y `captureOne` devuelve `false` si no detectó pose) más `extractKeypoints(imageSource, timestamp)`, `getLastLandmarks()` y `drawSkeleton(ctx, landmarks, canvasWidth, canvasHeight, flip)`.

El nombre de la base IndexedDB, el del object store y las claves de muestras (`ml-pose-samples-<id>`) y de modelo (`ml-pose-local-<id>`) vienen de `storage-keys.js`; el módulo no construye ninguna con literales.

Detalles no obvios: `dispose()` **no** libera `poseLandmarker` (recrearlo cuesta 2-3 s); solo libera la cabeza y las muestras. `loadSamples()` descarta registros de IndexedDB con forma inválida (`isValidPoseSample()` de `sanitize.js`, largo exacto de features incluido).

### `js/webcam.js`
Exporta la clase `Webcam` — wrapper liviano de `getUserMedia`. El canvas es siempre cuadrado, center-crop de la resolución nativa: lo que se ve es exactamente lo que recibe el modelo. Espejado horizontal opcional (cámara frontal).

Métodos: `constructor(flip)`, `setup(facingMode)` (`'user'` | `'environment'`), `play()`, `update()` (dibuja el frame actual al canvas), `stop()`; getters `canvas` y `video`.

### `js/project-store.js`
CRUD de proyectos sobre `localStorage`. Importa `MODELS_KEY` y `corruptBackupKey()` de `storage-keys.js`; no arma ninguna clave con literales propios. Tolerante a datos corruptos: si el JSON no parsea o no es array, preserva el valor bajo la clave que devuelve `corruptBackupKey(Date.now())` y devuelve `[]`.

Exporta:
- `loadModels()` — devuelve el array de proyectos (o `[]`).
- `saveModels(models)` — persiste; si se excede la cuota lanza `StorageQuotaError`.
- `StorageQuotaError` — clase de error con mensaje amigable para la UI.
- `addProject(name, projectType)` — crea `{id (timestamp), name, projectType, createdAt, lastUsed, makecodeProject: null}` y lo inserta al principio.
- `deleteProject(id, trainerModules)` — borra modelo entrenado y muestras del trainer correspondiente (según `localModel.source`) y saca el proyecto de la lista.
- `updateProjectMakeCode(id, makecodeProject)` — guarda el proyecto MakeCode y actualiza `lastUsed`.
- `updateProjectModel(id, localModelInfo)` — guarda `localModel` y `classNames`; devuelve el proyecto actualizado o `null`.

### `js/makecode-embed.js`
Panel MakeCode embebido por iframe (modo `?controller=1`) con comunicación `postMessage`. Genera el proyecto inicial con la extensión `pxt-tm-microbit-link-v2` (pineada por commit) y un archivo `tm-classes.ts` con enum tipado de las clases del modelo, regenerado en cada carga para mantener los nombres sincronizados. Los identificadores del enum se derivan con `deriveEnumIdentifiers()` de `class-name.js` (válidos y únicos aunque el nombre de clase no lo sea) y los nombres se interpolan con `JSON.stringify()`, tanto en la anotación `//% block=...` como en el array `_tmClaseNombres`. Valida los mensajes entrantes por ventana emisora **y** origen. Si MakeCode no responde en 8 s o no hay conexión, muestra overlay de fallback con botón de reintento.

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

### Tests (`tests/`)
Suites del runner nativo de Node (`node:test`, sin dependencias npm), corridas con `npm test` (script: `node --test`, sin argumentos posicionales — descubre `**/*.test.js` desde la raíz del repo):
- `protocol.test.js` — cubre `formatUartMessage`: formato, redondeo, ausencia de clamp, límite de 20 bytes, truncado con sufijo preservado, fronteras UTF-8 (ñ, emojis), filtrado de `#` y caracteres de control, y casos borde; más un test de humo que verifica que `bluetooth.js` importa limpio en Node y conserva su API pública.
- `sanitize.test.js` — cubre `escapeHtml` (comillas dobles y simples, texto, no doble-escape, payload de escape de atributo de la auditoría, `null`/`undefined`/números) y los validadores de muestras (`isDataImageUrl`, `isValidImageSample`, `isValidPoseSample`, `isValidSpectrogram`).
- `storage-keys.test.js` — cubre la forma exacta de las siete claves (las seis de registro más la de backup de datos corruptos, que se verifica derivada de `MODELS_KEY`), la equivalencia entre id numérico y string, el rechazo de dominio del guard (`undefined`, `null`, string vacío o en blanco, `NaN`, infinitos, objetos, arrays, booleanos y strings con espacios alrededor) junto con `0` como id válido, el prefijo `ml-` en todo nombre de alcance de origen, la ausencia del prefijo `tm` heredado, que el nombre de la base no sea el nombre pelado de la organización, y el invariante de que **ningún prefijo sea prefijo de otro** — más fuerte que la distinción mutua, porque un futuro constructor cuyo prefijo extienda a otro produciría claves que se leen como válidas de la familia más corta. El test recorre los pares por índice y no por valor (dos prefijos idénticos son la peor colisión y una comparación por valor los saltearía) y asserta que la clave termine en el id antes de derivar el prefijo por largo (sin eso, un constructor con sufijo dejaría el invariante evaluándose sobre una string basura).
- `class-name.test.js` — cubre el filtrado de caracteres inseguros (incluidos `U+2028`/`U+2029`), el conteo y truncado por bytes UTF-8 sin partir caracteres, la forma canónica de `normalizeClassName()`, la detección de duplicados case-insensitive y la derivación de identificadores de enum (primer carácter saneado, dígito inicial, acentos, fallback y unicidad ante colisiones).

### Herramientas (`tools/`)
Scripts de verificación en Node nativo, sin dependencias npm. No forman parte de lo que se sirve.
- `check-precache.js` — verifica que el precache de `sw.js` y los assets que el navegador realmente pide estén exactamente en sincronía. Corre con `node tools/check-precache.js`. Falla si (a) una referencia local de `index.html` lleva query string, porque `caches.match()` compara la URL completa y la entrada precacheada nunca se serviría; (b) algo que el navegador pide no está en la lista — recolecta los `href`/`src` de `index.html` **y camina el grafo de imports estáticos** desde cada script local, que es como se detecta un módulo nuevo olvidado en el precache; (c) una entrada del precache apunta a un archivo inexistente, que haría fallar `cache.addAll()` entero (es atómico) y dejaría la app sin offline. `vendor/` se chequea solo por pertenencia, nunca contra disco ni descendiendo a sus bundles: el CI corre este paso sobre un checkout esparso sin `vendor/`, y su integridad la cubre el job de checksums.

El CI (GitHub Actions) ejecuta los tests en Node 20, corre `tools/check-precache.js` y además verifica la integridad de `vendor/` en un job aparte con checkout completo: checksums SHA-256 de **todos** los archivos (`vendor/CHECKSUMS.txt`, MobileNet incluido), un paso de cobertura que falla si aparece un archivo en `vendor/` sin checksum o una entrada huérfana, y un paso que diffea las entradas `./vendor/...` del precache de `sw.js` contra `git ls-files vendor/`. Este último cubre el único punto ciego que quedaba: `check-precache.js` corre en el job de tests, sobre un checkout esparso sin `vendor/`, así que no puede verificar que esas rutas existan — y `cache.addAll()` es atómico, un solo 404 deja la app sin offline.

`.gitattributes` marca `vendor/** -text` para que ninguna conversión de fin de línea altere los bundles, con `vendor/CHECKSUMS.txt text eol=lf` como excepción: el archivo de checksums sí es texto y debe quedar en LF, porque con CRLF el `\r` pasaría a formar parte del nombre de archivo y `sha256sum -c` fallaría en CI.

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
| `ml-microbit-models` | Array de proyectos: `{id, name, projectType, createdAt, lastUsed, makecodeProject, localModel?, classNames?}` |
| `ml-microbit-models-corrupt-<timestamp>` | Backup automático del valor si se detectó corrupto al cargar. Es de solo escritura: ningún código lo lee de vuelta, existe para inspección manual |

`localModel` según el tipo: `{source: 'local' \| 'local-audio' \| 'local-pose', storageKey, classNames, trainedAt}` (imagen agrega `featureExtractor: "mobilenet_v1_0.25_224"`). Los valores de `source` conservan su forma histórica y no llevan prefijo: son vocabulario interno del dato, no claves.

### IndexedDB

Base propia `ml-microbit-app` (v1), object store `samples`:

| Clave | Contenido |
|---|---|
| `ml-image-samples-<projectId>` | Muestras de imagen: `[{ci, img224 (dataURL JPEG 224×224), thumb}]` |
| `ml-audio-samples-<projectId>` | Muestras de audio serializadas por `transfer.serializeExamples()` |
| `ml-pose-samples-<projectId>` | Muestras de pose: `[{ci, features (99 números), thumb}]` |

El nombre de la base no es `ml-microbit` a propósito: ese es el nombre de la organización y por lo tanto el candidato más probable a ser elegido por otra app del mismo origen. A diferencia de una colisión de clave, una colisión de nombre de base falla duro — `indexedDB.open(nombre, 1)` contra una base que otra app creó en v2 rechaza con `VersionError`, y se cae toda la persistencia de muestras.

Modelos entrenados vía `tf.io` (`indexeddb://<storageKey>`), **en la base interna de TF.js, no en `ml-microbit-app`**:

| storageKey | Modelo |
|---|---|
| `ml-image-local-<projectId>` | Cabeza de imagen |
| `ml-audio-local-<projectId>` | Modelo de audio |
| `ml-pose-local-<projectId>` | Cabeza de pose |

Todos los nombres persistidos se construyen en `js/storage-keys.js`: las dos claves de localStorage, el nombre de la base, el del object store y las seis claves de registro. Ningún archivo arma claves con literales sueltos. La única excepción es `CACHE_NAME` en `sw.js`, por una razón técnica: el Service Worker es un script clásico de worker, no comparte el grafo de módulos ES de la app y no puede importar de este módulo.

`storageKey` se persiste además como string dentro de cada proyecto, y hay dos caminos que lo tratan distinto: `saveModel()` de cada trainer lo **reconstruye** desde el `projectId` en cada entrenamiento, mientras que `loadSavedModel()` y `deleteProject()` leen el string **verbatim** del dato guardado. Por eso un cambio de esquema de claves rompe los proyectos ya guardados aunque el código sea consistente: el valor viejo persiste apuntando a un registro que ya no existe. Es el punto exacto donde rompe, y se resuelve borrando datos del sitio.

Además, el Service Worker mantiene el Cache Storage `ml-microbit-v8.0` con el app shell y todo `vendor/`.

## 5. Protocolo BLE

- **Servicio UART (Nordic):** `6e400001-b5a3-f393-e0a9-e50e24dcca9e`; característica TX `6e400003-...` (escritura con `writeValueWithoutResponse`).
- **Mensaje:** `className#confidence\n`, UTF-8, máximo **20 bytes** (`UART_MAX_BYTES`). La confianza es el porcentaje redondeado a entero (sin clamp a 0-100 — el llamador ya envía 0-100).
- **Nombres normalizados en origen:** los nombres de clase se limitan a **15 bytes** (`MAX_CLASS_NAME_BYTES`) al guardarse, de modo que el truncado en el cable no debería dispararse nunca en la práctica. Esto importa porque la extensión del micro:bit compara el nombre recibido contra el array `_tmClaseNombres` de `tm-classes.ts`: si el nombre se trunca en el cable pero no en el array, los bloques de detección dejan de dispararse **sin ningún error**. 15 y no 16: un nombre de 16 bytes funcionaría al 95 % de confianza y fallaría al 100 %.
- **Truncado:** si el mensaje excede 20 bytes se recorta el nombre de clase a nivel de bytes, sin partir caracteres multibyte y preservando siempre el sufijo `#NN\n`.
- **Filtrado:** `formatUartMessage()` elimina `#` y caracteres de control del nombre antes de codificar (`stripUnsafeChars()`, compartido con la normalización en origen).

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

- **Cero dependencias npm en runtime.** `package.json` existe solo para el script de test (`node --test`, runner nativo de Node ≥18) y está marcado `private`. No introducir dependencias. El script no lleva argumentos posicionales: desde Node 22 el runner interpreta un positional como patrón de archivo y no como directorio, así que `node --test tests/` falla antes de correr un solo test. Sin argumentos el comportamiento es idéntico de Node 18 a 24. Tampoco poner un glob: los globs del runner requieren Node ≥21 y el CI pinea Node 20.
- **Vanilla JS con módulos ES, sin frameworks ni build step.** Lo que está en el repo es lo que se sirve.
- **Librerías self-hosted y pineadas** en `vendor/` (TF.js 4.22.0, Speech Commands 0.5.4, MediaPipe Tasks Vision 0.10.14, MobileNet v1 0.25, modelo base de audio `BROWSER_FFT` 18w, fuentes Nunito; ~33 MiB en total). Sin CDNs en runtime. El CI verifica `vendor/CHECKSUMS.txt` (SHA-256, cubre **todos** los archivos de `vendor/`, MobileNet incluido) y falla si hay archivos de `vendor/` sin checksum. Los hashes se calculan sobre los blobs de git (checkout LF de CI); al agregar un archivo a `vendor/`, agregar su hash con `git cat-file blob HEAD:<ruta> | sha256sum`. `.gitattributes` (`vendor/** -text`) mantiene blob y working copy idénticos, así que el hash da lo mismo se calcule donde se calcule.
- **CSP estricta** en `index.html`: `script-src 'self' 'wasm-unsafe-eval'` (sin `unsafe-eval` — de ahí `regenerator-guard.js` y `mediapipe-loader.js`), `frame-src` limitado a `https://makecode.microbit.org`, `object-src 'none'`.
- **MakeCode pineado a v7.1.47** (`MAKECODE_URL`) por el bug upstream microsoft/pxt-microbit#6629 (panic 070 con `music.*` + BLE en v8). No subir de versión sin verificar el fix. La extensión se pinea por commit en `generateProject()`.
- **Offline-first:** Service Worker con cache-first para `vendor/` (inmutable, ~33 MB) y network-first para el app shell; no se cachean respuestas de error; fallback a `index.html` en navegaciones y 503 explícito como último recurso. Al tocar archivos precacheados hay que subir `CACHE_NAME` (convención `ml-microbit-vX.Y`). **Las referencias a assets locales en `index.html` no llevan query string:** `caches.match()` compara la URL completa, así que `styles.css?v=4.0` y la entrada `./css/styles.css` del precache son entradas distintas y la precacheada nunca se sirve. El cache-busting lo hace `CACHE_NAME`, no un `?v=`. Esta regla, la cobertura del precache sobre el grafo de imports y la existencia de cada entrada las verifica `tools/check-precache.js` en CI.
- **La app es path-agnostic y hoy se sirve desde la raíz del origen.** Toda ruta local es relativa: `start_url` e `icons[].src` del manifest, las entradas de `urlsToCache`, el `register('sw.js')` de `app.js`, `MOBILENET_URL` de `image-trainer.js`, las dos rutas de MediaPipe de `initTrainer()` en `pose-trainer.js` (`forVisionTasks()` y `modelAssetPath`) y los `url()` de las fuentes en `styles.css`; las dos URLs del modelo de audio se anclan a `import.meta.url`. Los anclajes difieren según quién resuelva cada ruta —el documento, el script del Service Worker, la hoja de estilos o el módulo—, pero para la pregunta raíz-vs-subpath son equivalentes; la diferencia entre `MOBILENET_URL` y las URLs de audio está explicada en la sección 2. Ni el manifest ni el registro del Service Worker declaran `scope`, así que cada uno cae en su default: el manifest, `start_url` truncada al último `/`; el registro, el directorio de `sw.js`. **Al servirse desde la raíz del origen en vez de un subpath, ese scope pasa a ser `/`,** con tres consecuencias reales: la rama cache-first del handler `fetch` entra con `url.pathname.includes('/vendor/')`, así que cualquier path same-origin que contenga `/vendor/` en cualquier posición queda pinneado hasta el próximo bump de `CACHE_NAME`; la rama network-first hace `cache.put()` de toda respuesta same-origin con status 200, no solo del app shell; y `clients.claim()` reclama clientes de todo el origen. (El fallback a `index.html` en navegaciones vive en el `.catch()` de la rama network-first y solo actúa sin conexión.) **Mientras el Service Worker filtre por substring, ningún otro repo de la organización puede publicar Pages sin que este Service Worker le interfiera:** los project sites se sirven en `https://<org>.github.io/<repo>/`, o sea el mismo origen que esta app. Ver la precondición anotada en la sección 7.
- **Todo nombre persistido se construye en `js/storage-keys.js`** y lleva prefijo `ml-`, con dos excepciones declaradas: el object store `samples`, que vive dentro de la base propia y no compite con nadie, y `CACHE_NAME` en `sw.js`, que sí es un nombre de alcance de origen pero no puede importarse — el Service Worker es un script clásico de worker, fuera del grafo de módulos ES de la app — y además cambia en una cadencia distinta, en cada deploy que toca archivos precacheados. El prefijo no es cosmético: los project sites de la organización se sirven en `https://ml-microbit.github.io/<repo>/`, el mismo origen que esta app, y los tres mecanismos de almacenamiento están particionados por origen y no por path. Los `storageKey` de modelos son el caso crítico, porque viven en la base interna de TF.js junto a los de cualquier otra app del origen que use la librería. No construir claves con literales: agregar un constructor al módulo, que los tests cubren.
- **Mensajes postMessage validados** por ventana emisora y origen exacto (`MAKECODE_ORIGIN`).
- **Los nombres de clase se normalizan en el origen:** al autogenerarse (`Clase N`) y al renombrarse, vía `normalizeClassName()` de `class-name.js` (máximo 15 bytes UTF-8, sin `#`, comillas, backslash ni caracteres de control). Todo consumidor —UART, enum de MakeCode, `_tmClaseNombres`— lee el valor ya normalizado, garantizando que lo que va por el cable y lo que está en el array sean idénticos byte a byte. No hay normalización al rehidratar: un proyecto guardado antes de `class-name.js` puede tener un nombre que excede el presupuesto, en cuyo caso el bloque de detección no dispara. Como no hubo despliegue, la resolución es descartar esos proyectos, no migrarlos.
- **Mínimos de entrenamiento:** 2 clases y 8 muestras por clase, validado en la UI (`updateTrainButton()`). Los `train()` de imagen y pose lo re-validan clase por clase; el de audio solo exige que haya ≥2 clases con 8+ muestras (una clase adicional con menos muestras no lo hace fallar — ahí la barrera es solo la UI).
- **Webcam cuadrada center-crop:** el usuario ve exactamente el encuadre que recibe el modelo.
- **La lógica testeable se extrae a módulos puros** (patrón `protocol.js`; también `sanitize.js`, `class-name.js` y `storage-keys.js`): sin APIs de navegador a nivel de módulo, importables desde `node:test`. Los tests documentan lo que el código hace.
- **IndexedDB y localStorage se tratan como entrada de usuario:** las muestras rehidratadas por `loadSamples()` se validan con `sanitize.js` en los tres trainers (`isValidImageSample`, `isValidPoseSample`, `isValidSpectrogram`); los thumbnails se asignan por propiedad (`img.src`), nunca interpolados en templates HTML. `escapeHtml()` escapa comillas y es la única vía para interpolar texto de usuario en templates (texto o atributo).
- **localStorage defensivo:** datos corruptos se preservan en clave de backup; cuota excedida se reporta con `StorageQuotaError` y mensaje accionable.

## 7. Estado actual

**Última actualización:** 2026-08-21

**Features completas:** tres trainers (imagen, audio, pose) con captura, entrenamiento, preview en vivo y persistencia; conexión BLE con keep-alive y envío de la clase ganadora; panel MakeCode inline con proyecto generado, guardado automático y fallback offline; biblioteca de proyectos (crear/abrir/borrar); PWA instalable y offline; cambio de cámara frontal/trasera; modo expandido de predicción; suites de tests (protocolo UART, sanitización, nombres de clase y claves de almacenamiento) con CI (tests + consistencia del precache + checksums de todo vendor/ con verificación de cobertura).

**Deuda y pendientes conocidos:**

- Quedan 4 hallazgos menores (baja/informativa) de la auditoría de seguridad del 2026-07-31 como backlog en `docs/PENDIENTES-SEGURIDAD.md`. Los altos/medios de esa auditoría ya fueron corregidos. De los menores, dos —inyección de TS por nombre de clase y filtrado del nombre en UART— se cerraron con la normalización de nombres de clase; el de **matching de rutas del SW por substring lo cerró solo parcialmente** el chequeo `url.origin === self.location.origin` del handler `fetch` de `sw.js`, que descarta las URLs cross-origin: el matching same-origin sigue siendo `includes('/vendor/')`.
- **Precondición para mover `pxt-tm-microbit-link-v2` a la organización `ml-microbit`:** ese PR tiene que endurecer `sw.js` **antes** de habilitar Pages en el repo de la extensión. Son dos problemas distintos, y el segundo no lo resuelve el fix del primero:
  1. **Interferencia en `fetch`** — filtrar por `self.registration.scope` en vez de por substring, tanto en la rama `/vendor/` del handler `fetch` como en el `cache.put()` de la rama network-first. Afecta qué se sirve.
  2. **Borrado de datos ajenos en `activate`** — el predicado actual borra todo cache cuyo nombre no sea el `CACHE_NAME` exacto. `caches.keys()` devuelve los nombres de **todo el origen**: Cache Storage no está particionado por Service Worker ni por scope. Ya hoy, sin ningún rename de por medio, cada activación de una versión nueva de este Service Worker borraría el Cache Storage completo de cualquier otra app del origen. El fix es filtrar también acá por `self.registration.scope` o por prefijo propio; no basta con corregir `fetch`.

  Los project sites de la organización se sirven en `https://ml-microbit.github.io/<repo>/`, el mismo origen que esta app, y con el scope en `/` este Service Worker alcanza a todos. Ver el bullet de path-agnosticismo de la sección 6.
- El rename L4 (contrato con MakeCode: `TMClase`, `tm-classes.ts`, `_tmClaseNombres`, `tm_clase_picker`, `controllerId: 'tm-microbit-app'`, id de la extensión) queda pendiente para el PR que mueva `pxt-tm-microbit-link-v2` a la organización, donde se reverifica contra hardware. Nota no obvia: la salida de L4 **vive persistida dentro de una clave de L3** — el `tm-classes.ts` generado viaja de vuelta en el `workspacesave` de MakeCode y se guarda como texto plano dentro de `makecodeProject.text`, en `ml-microbit-models`. No genera conflicto porque ese archivo se regenera en cada carga del panel y el texto viejo se pisa solo.
- **`deleteProject()` puede dejar un borrado que no borra.** Si `deleteSamplesDB()` falla, la excepción aborta la función antes de `saveModels()`: el proyecto sigue en la lista, sus muestras pueden haber quedado a medio borrar, y el usuario no ve ningún error. El handler no tiene `try/catch`. Es un bug de comportamiento, no endurecimiento. El guard de `storage-keys.js` amplía su alcance: un registro con `id` malformado —ausente, vacío o con espacios— ahora lanza al construir la clave de muestras, así que también aborta el borrado antes de `saveModels()` y deja el proyecto indeleteable sin ningún feedback. Es el comportamiento correcto del guard (fallar rápido sobre dato corrupto), pero es el caso a contemplar cuando se agregue el `try/catch`.
- **La validación de forma del `id` pertenece a `loadModels()`, no al constructor de claves.** Hoy `loadModels()` valida el contenedor (parsea con `try/catch` y exige un array) pero devuelve los registros crudos, y el id recién se valida al armar cada clave. Eso deja dos nociones de identidad de proyecto que no coinciden: `storage-keys.js` coerciona número a string, mientras `project-store.js` y `renderModels()` comparan con `===`, de modo que un registro con id numérico produce claves correctas pero resulta imposible de abrir y de borrar. Corresponde validar y canonizar cada registro en la frontera de rehidratación —función pura testeable, mismo patrón que `sanitize.js`—, descartando los que no tengan id válido y deduplicando por id canónico. Es la misma idea que el ítem del `storageKey` verbatim y los cierra juntos.
- **`preserveCorruptData()` no tiene cota.** Escribe un backup nuevo en cada `loadModels()` mientras el valor siga corrupto, y `loadModels()` se llama desde siete lugares. Contra una cuota de localStorage que ahora se comparte con cualquier otra app del origen, un valor corrupto persistente puede llenarla sola. Corresponde una cota (un backup por valor corrupto, o descartar el anterior).
- **`storageKey` se lee verbatim del dato guardado** y se pasa a `tf.io` sin validar su forma. El auditor verificó que no hay path traversal —TF.js la trata como clave opaca— pero sí alcance arbitrario: un valor manipulado en localStorage puede leer o borrar cualquier clave del keyspace de TF.js, que ahora se comparte con las demás apps del origen. Mitigación natural: validar que el valor coincida con el que produciría el constructor correspondiente de `storage-keys.js`.
- **`app.js` vuelca `error.message` crudo a los toasts.** Los mensajes de error internos están en inglés por convención del proyecto, así que cualquier fallo interno le llega al docente en inglés y con vocabulario técnico. Corresponde separar el mensaje de usuario del mensaje de diagnóstico.
- Cobertura de tests limitada al protocolo UART, `sanitize.js`, `class-name.js` y `storage-keys.js`. Fases futuras previstas: serialización de proyectos en localStorage, operaciones sobre clases/muestras y ordenamiento de predicciones (requieren extraer esa lógica a módulos puros, mismo patrón que `protocol.js`).
- `getClassColor()` en `app.js` ignora el índice y devuelve siempre el primer color: la paleta `CLASS_COLORS` de 6 colores está definida pero todas las clases se pintan iguales (decisión o regresión — a confirmar antes de "arreglarlo").
- En `audio-trainer.js`, `clearSamples()` borra las muestras de **todas** las clases (limitación de `clearExamples()` de speech-commands); la UI no lo advierte.
- **`vendor/CHECKSUMS.txt` prueba inmutabilidad, no procedencia** (auditoría del 2026-08-13). Los hashes se calcularon sobre lo que se descargó, así que el CI verifica "estos bytes no cambiaron desde el commit", no "estos bytes son los del bucket oficial"; ningún archivo del repo registra de qué URL salió cada artefacto. Mitigación propuesta y **pospuesta**: `vendor/PROVENANCE.md` con URL, fecha y hash upstream de cada artefacto, más un verificador opcional fuera de CI.
- `saveModel()` de audio puede terminar sin persistir pesos (solo deja warning en consola) si ni `transfer.save()` ni el modelo interno están disponibles; el proyecto queda dependiente de re-entrenar desde muestras.
- `startContinuousRecording()`/`stopContinuousRecording()` de audio están exportadas pero sin uso desde `app.js` (el batch usa `recordSample()` en loop con countdown).
- `js/tm-import/` archivado con imports que no resuelven en su ubicación actual (esperado; ver su README para re-habilitar).
- El botón `newModelBtn` del home está `display:none` (reemplazado por la card "Nuevo Proyecto"); el markup sigue en `index.html`.
- **Conexión USB intermitente en el panel MakeCode embebido** (observado 2026-08-20): al descargar a la placa desde el iframe, la conexión WebUSB falla y a veces anda al reintentar. El mismo comportamiento se reproduce en el MakeCode oficial fuera de la app, así que la causa es upstream y no de la integración por iframe. Sin diagnóstico ni issue abierto; pendiente de investigar.

---

> **Regla de mantenimiento:** todo documento de implementación futuro debe incluir como paso final la actualización de este archivo con los cambios introducidos. El revisor QA verifica que se haya hecho. Tras cada actualización, subir la nueva versión al conocimiento del proyecto en claude.ai.