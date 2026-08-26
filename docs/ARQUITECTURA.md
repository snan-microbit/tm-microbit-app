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

`openTrainingScreen()` distingue **tres estados**, no dos. La frontera de rehidratación descarta `localModel` cuando el puntero al modelo está roto y conserva el resto del proyecto, así que "no hay `localModel`" dejó de significar "proyecto nuevo":

| Estado | Condición | Qué hace |
|---|---|---|
| Entrenado | `project.localModel` existe **y carga** | usa el modelo |
| Necesita reentrenar | sin `localModel`, **o con uno que no carga** | crea las clases, **carga las muestras**, queda en la pantalla de entrenamiento y lo avisa con `showReadyToast()` |
| Nuevo | sin clases conocidas | `Clase 1` / `Clase 2` |

El marcador de trabajo previo son las **clases** (`project.localModel?.classNames ?? project.classNames`), no el puntero al modelo: las muestras viven bajo una clave derivada del `id`, que nunca estuvo rota. Sin esa distinción el proyecto se abre vacío y el primer `train()` las pisa con `saveSamples()` — el modo de falla exacto que la frontera venía a evitar.

Al estado "necesita reentrenar" se llega por **dos** caminos: que la frontera haya descartado `localModel`, o que el modelo exista pero no cargue (`saveModel()` de audio puede dejar el registro sin pesos; un borrado parcial de IndexedDB produce lo mismo en imagen y pose). Por eso los tres flujos deciden con un `modelLoaded` local y no con la presencia de `localModel`: el intento de carga fallido **no** es un camino aparte, cae por la misma rama que ya maneja ese estado. Mantenerlo como camino propio —con su propio `catch` que recuperaba las clases pero no las muestras— fue exactamente lo que lo desincronizó. `renderTrainingClasses()` y la apertura de cámara o visualizador son la salida única de los tres estados, que es lo que hace imposible que vuelvan a divergir. En los tres flujos las clases se crean **antes** de `loadSamples()`, que descarta las muestras cuyo `classes[s.ci]` todavía no existe (y en audio el nombre de clase *es* la clave de indexado del recognizer).

`renderModels()` además muestra u oculta `#quarantineNotice`, el aviso amarillo arriba de "Mis Proyectos", según el `needsNotice` de `getQuarantineStatus()`: la regla completa vive en `project-store.js` y la UI no la reconstruye. Se escribe con `textContent`, nunca `innerHTML`, y cambia de texto cuando la cuarentena no se pudo persistir entera — el aviso no afirma que los datos se guardaron aparte si la escritura falló o si algo no entró en la cota. Su botón "Entendido" llama a `acknowledgeQuarantine()` y muestra un error si devuelve `false` en vez de apagar el aviso y su listener está a nivel superior, no dentro de `renderModels()`, que corre muchas veces por sesión. `formatDate()` exige `typeof isoString === 'string'` antes de la guarda de `Invalid Date`: la frontera preserva `createdAt` con el tipo que tenga, y `null`, `0` o `false` no dan `Invalid Date` sino la época, que la card mostraría como "1 ene 1970". La ranura de la fecha en la plantilla pasa por `escapeHtml()` como todas las demás.

Todo texto de usuario interpolado en templates HTML (nombres de proyecto/clase, ids en `data-*`) pasa por `escapeHtml()` de `sanitize.js`, que escapa también comillas (seguro en contexto de atributo). Los thumbnails de las galerías (`renderTrainingClasses()`, `updateClassUI()`) se asignan por propiedad (`img.src`), nunca interpolados en el template.

Los nombres de clase se normalizan con `class-name.js` en el punto donde se guardan: el input de renombrado filtra caracteres inseguros y limita a 15 bytes mientras el usuario escribe (con contador `.class-name-counter` visible al acercarse al límite), y el `change` rechaza duplicados (case-insensitive) con toast y revierte. `addClassBtn` busca el primer `Clase N` libre para no colisionar con una clase renombrada. Helper: `updateNameCounter(input)`.

### `js/protocol.js`
Lógica pura del protocolo UART, sin APIs de navegador (solo `TextEncoder`, también global en Node). Cubierto por tests unitarios (junto con `sanitize.js`, `class-name.js` y `storage-keys.js`); no debe adquirir dependencias de DOM/hardware. Importa `stripUnsafeChars()` de `class-name.js` (única dependencia; la relación nunca va en sentido inverso).

Exporta:
- `UART_MAX_BYTES` — constante `20`, límite de bytes por mensaje BLE.
- `formatUartMessage(className, confidence)` — devuelve `Uint8Array` con `"className#confidence\n"` codificado en UTF-8, garantizado ≤ 20 bytes. Filtra el nombre con `stripUnsafeChars()` (defensa en profundidad: `#` y caracteres de control nunca llegan al aire). Redondea la confianza con `Math.round` (no la limita a 0-100). Si el mensaje excede el límite, trunca el nombre de clase a nivel de bytes retrocediendo sobre bytes de continuación UTF-8 para no partir caracteres multibyte.

### `js/class-name.js`
Lógica pura de nombres de clase (mismo patrón que `protocol.js`: sin APIs de navegador, importable desde `node:test`, cubierta por tests). No importa nada. Es la fuente única de las reglas de nombres para sus tres consumidores: el almacenamiento, el cable UART y el enum de TypeScript generado para MakeCode. La normalización ocurre al crear un nombre y al renombrarlo, pero eso no es una garantía para el resto del código: un nombre **rehidratado** desde localStorage no tiene su forma canónica asegurada (la frontera de rehidratación valida el tipo, no el invariante, a propósito por las muestras de audio — ver sección 6 y sección 7). Por eso cada consumidor filtra en su propio punto de uso en vez de asumir que el valor ya llegó limpio.

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
- `MODELS_QUARANTINE_KEY` — `'ml-microbit-models-quarantine'`, clave de localStorage donde la frontera de rehidratación preserva los registros que no pudo canonizar. Es una clave fija y no una familia con timestamp: `loadModels()` corre en cada render, así que una clave por carga crecería sin cota mientras el registro roto siga en la lista.
- `SAMPLES_DB_VERSION` — versión de la base IndexedDB propia (`1`).
- `corruptBackupKey(timestamp)` — clave de localStorage donde se preserva un valor corrupto de `MODELS_KEY` para inspección manual.
- `requireProjectId(projectId)` — el guard de dominio del id, exportado para que `project-schema.js` decida qué es un id válido con el mismo criterio que los constructores. Si lo decidiera por su cuenta habría dos nociones de identidad de proyecto que pueden divergir.

Los siete constructores validan **dominio**, no solo centinelas: rechazan `undefined`, `null`, string vacío o en blanco, número no finito, y cualquier valor que no sea string ni número. La razón es que el id se rehidrata de localStorage, que el proyecto trata como entrada de usuario, y un valor que coerciona a vacío —`[]`, `''`, `'   '`— produce una clave sin nada después del último guión, que se escribiría en silencio y aparecería mucho después como muestras que no cargan. `0` y `'0'` son ids válidos y se aceptan.

Un string con espacios alrededor se **rechaza, no se recorta**. Recortarlo volvería el mapeo id→clave no inyectivo —`'42'` y `'  42  '` compartirían clave— mientras `project-store.js` los sigue distinguiendo con `===`: los dos archivos discreparían sobre si dos registros son el mismo proyecto. Rechazar mantiene una sola noción de identidad. La coerción número→string sí se conserva, porque `corruptBackupKey()` recibe un timestamp. La versión de la base sí se centraliza acá (`SAMPLES_DB_VERSION`), aunque no sea un espacio de nombres: los tres trainers abren la **misma** base, y el día que un feature necesite un segundo object store, quien suba la versión en un módulo deja a los otros dos llamando `indexedDB.open(nombre, 1)` contra una base que ya está en 2 — `VersionError`, y se cae toda la persistencia de muestras a la vez. La duplicación de los helpers IDB es intencional; este número no forma parte de esa duplicación. Subirlo obliga a que los tres `onupgradeneeded` sean idempotentes (ya lo son: chequean `objectStoreNames.contains()` antes de crear, porque en un bump el handler vuelve a correr contra una base que ya tiene el store y `createObjectStore()` tiraría `ConstraintError`).

### `js/project-schema.js`
Frontera de rehidratación de la lista de proyectos (mismo patrón puro que `protocol.js`, `sanitize.js`, `class-name.js` y `storage-keys.js`: sin APIs de navegador, importable desde `node:test`, cubierto por tests). Importa de `storage-keys.js`. Todo lo que sale de `ml-microbit-models` cruza este módulo antes de que lo vea cualquier otro código, de modo que hay exactamente un lugar donde se decide si un registro es usable, reparable o irrecuperable — y un solo lugar donde engancha una migración futura.

Exporta:
- `PROJECT_SCHEMA_VERSION` — `1`. Se sella en cada registro que escribe esta versión de la app. Un registro sin el campo es anterior al versionado y es v1 por definición; ese fallback se gasta una sola vez, y por eso el campo se introdujo antes de que existieran datos de docentes.
- `PROJECT_TYPES` — `['image', 'audio', 'pose']`.
- `QUARANTINE_REASON` — los códigos de motivo de cuarentena (`registro-no-es-objeto`, `id-invalido`, `tipo-desconocido`, `id-duplicado`). Son strings fijos que nunca se interpolan con dato guardado: el valor ofensor viaja aparte en `detail`, truncado a 120 caracteres. La separación acota lo que un registro roto cuesta en la clave de cuarentena (un `source` de un megabyte se copiaría también dentro del motivo) y evita que una futura pantalla de diagnóstico convierta el motivo en un sink de inyección. Todo lo que renderice `detail` tiene que usar `textContent`.
- `canonicalizeProject(raw)` — devuelve `{ok: true, project}` con todo lo reparable reparado, o `{ok: false, reason, detail}` para un registro cuya **identidad** no se puede recuperar. Ni `reason` ni `detail` son mensajes de usuario.
- `rehydrateProjects(rawList)` — devuelve `{projects, quarantined}`; cada entrada de `quarantined` lleva `reason`, `detail` y el registro crudo intacto. Deduplica por id canónico conservando la primera aparición (la lista es más-nuevo-primero: `addProject()` hace `unshift`). Un hueco del array se canoniza como `undefined` y por lo tanto se cuarentena, a propósito: un hueco es dato que se perdió y la frontera lo reporta en vez de pasarlo por alto. Por eso el recorrido no puede usar `forEach()` ni `every()`, que saltean los índices ausentes.

**La regla: se cuarentena solo cuando la identidad del proyecto es irrecuperable** — el registro no es un objeto, el `id` es inválido o duplicado, o el tipo es desconocido sin ninguna pista. **Cuando lo roto es el modelo, se descarta `localModel` y el proyecto vuelve como no entrenado.**

La razón es que el registro tiene dos mitades de valor muy distinto. El **proyecto** —`name`, `projectType`, `makecodeProject`, `classNames`— es trabajo del docente y los bloques de MakeCode no se regeneran. El **puntero al modelo** (`localModel`) es regenerable por definición: se reentrena en dos minutos. Las tres formas de romperse que tiene un modelo (`storageKey` de un esquema superado, `source` desconocido, `classNames` inservible) son todas de la segunda mitad, y cuarentenar el registro entero las cobraría con la primera. El disparador concreto no es hipotético: el rename `tm-` → `ml-` se hizo sin migración, así que cualquier navegador con datos anteriores a ese commit tiene `storageKey` que ya no validan.

La exigencia de la auditoría se sigue cumpliendo: un `storageKey` que no corresponde al esquema vigente —o uno manipulado— nunca llega a `tf.io`, porque no sobrevive ese bloque. Un modelo descartado igual deja una pista: su `source` dice qué trainer lo escribió, y esa puede ser la única señal que queda del tipo de proyecto.

Qué se repara: el `schemaVersion` inválido se repara a 1 (no ubica ningún dato, y asumir la versión más vieja es la dirección segura, porque una migración futura corre sobre él); el `name` en blanco o de otro tipo cae al nombre por defecto. **`createdAt`, `lastUsed` y `makecodeProject` no se tocan nunca**, ni siquiera cuando su tipo no es el esperado: borrarlos o coercionarlos es la misma ruptura de compatibilidad hacia adelante que la copia superficial existe para evitar, y se vuelve permanente en el próximo `saveModels()`. `makecodeProject` es además el único campo que un docente no puede reconstruir, y este módulo no lo consume — su guarda de forma vive en `makecode-embed.js`, donde el valor entra. Los consumidores que muestran esos campos se protegen solos (ver `formatDate()` en `app.js`).

Dos decisiones de diseño que son la razón de ser del módulo:
- **La canonización parte de una copia superficial del registro crudo, no de una lista blanca de campos.** Un registro escrito por una versión más nueva de la app puede traer campos que esta versión desconoce; si la frontera los descartara, sería ella misma la que rompe la compatibilidad hacia adelante, porque el registro recortado es lo que `saveModels()` persiste en la próxima mutación.
- **Cuando `localModel.source` y `projectType` se contradicen, gana `source`.** `source` es el campo que ubica los **pesos**: es lo que `loadSavedModel()` dereferencia y lo que determina el constructor con el que se valida `storageKey`, así que mientras hay un modelo vivo es donde el dato realmente está. (El borrado ya no conmuta sobre `source`: `deleteProject()` elige el trainer dueño con `trainerFor(projectType)`, porque las muestras se derivan del `id` y tienen que poder borrarse aunque el modelo se haya descartado.) `projectType` se repara a partir de él en vez de cuarentenar el proyecto.

Una `schemaVersion` mayor a `PROJECT_SCHEMA_VERSION` se acepta sin tocar: la escribió un build más nuevo, los cambios son aditivos por regla (ver sección 6) y rechazarla le escondería el proyecto a un usuario que solo recargó estando offline.

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

Exporta: `initTrainer()`, `addClass(name)`, `removeClass(index)`, `renameClass(index, newName)` (lanza si la clase tiene muestras), `clearSamples(index)` (borra solo las muestras de esa clase, con `removeExample(uid)` en bucle — `clearExamples()` de speech-commands no toma argumentos y arrasa el dataset entero, así que no se usa acá), `getClasses()`, `getClassNames()`, `getTotalClasses()`, `getSamples(classIndex)`, `deleteSample(classIndex, sampleIndex)`, `recordSample(classIndex)` (~1 s), `getIsRecording()`, `train(onProgress)`, `startListening(callback)`, `stopListening()`, `isListening()`, `startVisualizer(canvasElement)`, `stopVisualizer()`, `saveModel(projectId)`, `loadSavedModel(localModelInfo)`, `deleteModel(storageKey)`, `saveSamples(projectId)`, `loadSamples(projectId)`, `deleteSamplesDB(projectId)`, `isTrained()`, `dispose()`.

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
CRUD de proyectos sobre `localStorage`. Importa `MODELS_KEY`, `MODELS_QUARANTINE_KEY` y `corruptBackupKey()` de `storage-keys.js` y la frontera de `project-schema.js`; no arma ninguna clave con literales propios. Tolerante a datos corruptos: si el JSON no parsea o no es array, preserva el valor bajo la clave que devuelve `corruptBackupKey(Date.now())` y devuelve `[]`.

Sobre el array ya parseado corre `rehydrateProjects()`: `loadModels()` devuelve proyectos canonizados, nunca registros crudos. Los que la frontera no pudo canonizar se preservan bajo `MODELS_QUARANTINE_KEY`, deduplicados por contenido serializado, así que recargar con el mismo registro roto no escribe de nuevo.

La cuarentena tiene **tres cotas**, porque las entradas varían muchísimo de tamaño (un registro arrastra `makecodeProject` con su `_history`, decenas de KB en un proyecto real, mientras que un stub roto son unos bytes): 20 entradas, 64 KB en total y 32 KB por entrada — la que se pasa se reduce a un resumen diagnosticable (`reason`, `detail`, `recordId`, `recordBytes`, `truncated: true`). Contar solo entradas dejaría que veinte registros grandes se coman la cuota de localStorage del origen, que es la misma contra la que después falla `saveModels()` con un mensaje ("eliminá algún proyecto") que no liberaría ese espacio, porque ninguna vía de la UI borra esta clave.

La lista ya guardada se acota **en la lectura**, aplicando las tres cotas: 20 entradas, `shrinkEntry()` por entrada y el presupuesto de caracteres del total. Sale de localStorage sin cota propia, y el bucle de recorte re-serializa la lista entera por cada entrada que saca, así que miles de entradas guardadas —tampering, o una app hermana del mismo origen— bloqueaban la pestaña varios segundos en cada render, y un `try/catch` no atrapa un cuelgue.

**Esa lectura sí reescribe `MODELS_QUARANTINE_KEY`**, y es la única excepción declarada a la regla de más abajo. `shrinkEntry()` acota cada entrada con `DETAIL_MAX_LENGTH` de `project-schema.js` —la misma cota que `detailOf()` aplica en origen, importada para no duplicar el número— y no reprocesa un resumen ya generado: `entry.truncated === true` corta antes de recalcular `recordId`/`recordBytes`, porque sin ese corte el stub diferiría de sí mismo en cada pasada y forzaría una escritura por carga hasta converger. El resultado recortado se persiste cuando su largo serializado es **menor** que el del valor leído, comparando los dos **serializados** y no por cantidad de entradas: con el tope de entradas lleno, una comparación por cantidad nunca dispara, y la clave sobredimensionada se releía y recortaba en cada carga para siempre. Comparar por largo y no por diferencia hace que "la reparación nunca escribe algo más grande de lo que había" sea un invariante **estructural**. El resultado es un prefijo de lo que ya estaba, con las entradas sobredimensionadas reemplazadas por un resumen diagnosticable; corre una sola vez porque la segunda carga ya encuentra la clave reparada, y su fallo no marca la cuarentena como no persistida, porque el contenido viejo queda intacto en disco. El recorte conserva las entradas **más viejas**, no las más nuevas: una entrada vieja ya fue pisada de `MODELS_KEY` por alguna mutación posterior, así que esta copia es la única que queda, mientras que una reciente todavía suele existir en `MODELS_KEY`. Y la comparación para decidir si hay que escribir se hace contra el **resultado ya recortado**, no contra la mezcla previa: con la cota llena, cualquier otra forma produciría una lista "nueva" en cada carga y escribiría localStorage en cada render. **La lectura no reescribe `MODELS_KEY`:** la canonización es determinística y barata, se aplica en memoria en cada carga y se persiste sola en la próxima mutación que llame a `saveModels()`; convertir una lectura en escritura, en una función que se llama desde cada render y desde cada mutación, sería riesgo de cuota gratis.

Exporta:
- `loadModels()` — devuelve el array de proyectos ya canonizados por la frontera (o `[]`).
- `getQuarantineStatus()` — `{count, needsNotice, persisted}`. `count` refleja lo que hay **apartado**, no solo lo que rechazó esta carga: apenas una mutación reescribe `MODELS_KEY` sin los registros rotos, la copia de la cuarentena es la única que queda, que es justo cuando el aviso tiene que seguir visible y no el momento de apagarlo. `needsNotice` es **la regla completa**, decidida acá para que ningún consumidor la reconstruya: se muestra el aviso mientras haya algo apartado sin acusar, o siempre que la copia esté incompleta. `persisted` es `false` cuando esa copia no se pudo escribir o cuando alguna entrada no entró en la cota, y gana sobre cualquier acuse.
- `acknowledgeQuarantine()` — marca la cuarentena actual como vista guardando una **huella de contenido** (cantidad de entradas más largo serializado) en `MODELS_QUARANTINE_SEEN_KEY`, y devuelve si pudo registrarla. **Es un acuse de recibo, no un borrado**: la copia de la cuarentena puede ser la única que queda de un registro, así que el botón del aviso no puede eliminarla. Es una huella y **no un conteo** porque un conteo no es comparable contra una lista topada: `count` mezcla lo guardado —tope de 20— con lo que rechazó una carga, que no tiene tope, así que un acuse tomado en una carga que rechazó 50 registros quedaba por encima de todo lo que `count` puede volver a alcanzar y el aviso quedaba sordo para siempre. La huella cambia apenas la cuarentena gana algo. Además **se niega a acusar si la cuarentena no está completamente persistida**: apagar ahí el único aviso que dice que hay dato en riesgo lo perdería en la próxima mutación.
- `readQuarantine()` — los registros preservados. Nunca se rehidrata desde acá. Se exporta a propósito como **API de consola**: cuando un docente reporta un proyecto que desapareció, llamarla desde DevTools es la forma de recuperar el registro. Es además la semilla de la mitad de diagnóstico del futuro export. Todo lo que renderice estos valores tiene que usar `textContent` — `detail` trae texto que salió de localStorage.
- `saveModels(models)` — persiste; si se excede la cuota lanza `StorageQuotaError`.
- `StorageQuotaError` — clase de error con mensaje amigable para la UI.
- `addProject(name, projectType)` — crea `{schemaVersion, id (timestamp), name, projectType, createdAt, lastUsed, makecodeProject: null}` y lo inserta al principio.
- `deleteProject(id, trainerModules)` — devuelve `{samplesDeleted}`. Borra las muestras **siempre, por id**, y los pesos solo si hay `storageKey`; después saca el proyecto de la lista. El trainer dueño se elige con `trainerFor(projectType)` y no por `localModel.source`, porque las muestras viven bajo una clave derivada del `id` y no tienen nada que ver con el puntero al modelo: un proyecto al que la frontera le descartó `localModel` tiene que poder borrarlas igual. En imagen y pose son dataURLs JPEG de la webcam, así que dejarlas atrás mientras la UI dice "Proyecto eliminado" es la peor combinación posible en una máquina compartida de aula. Ningún fallo se propaga: se registran en consola y el registro sale de la lista igual, porque abortar dejaba el proyecto en su lugar sin ningún error y el único recurso del docente era borrar datos del sitio, perdiendo también todos los demás proyectos. Pero el resultado sí se informa: `samplesDeleted` en `false` hace que la UI diga que las fotos quedaron, en vez de reportar "Proyecto eliminado" justo en el caso que esta función existe para evitar. Los pesos de un modelo cuyo puntero se descartó quedan huérfanos, porque su clave no se puede derivar del registro canonizado.
- `updateProjectMakeCode(id, makecodeProject)` — guarda el proyecto MakeCode y actualiza `lastUsed`.
- `updateProjectModel(id, localModelInfo)` — guarda `localModel` y `classNames`; devuelve el proyecto actualizado o `null`.

### `js/makecode-embed.js`
Panel MakeCode embebido por iframe (modo `?controller=1`) con comunicación `postMessage`. Genera el proyecto inicial con la extensión `pxt-tm-microbit-link-v2` (pineada por commit) y un archivo `tm-classes.ts` con enum tipado de las clases del modelo, regenerado en cada carga para mantener los nombres sincronizados. En `generateTmClassesTs()` cada nombre pasa primero por `stripUnsafeChars()` de `class-name.js`, y de ahí salen tanto los identificadores (`deriveEnumIdentifiers()`, válidos y únicos aunque el nombre no lo sea) como los literales interpolados con `JSON.stringify()` en la anotación `//% block=...` y en el array `_tmClaseNombres` — los tres desde la **misma** lista saneada, para que el enum y el array no queden construidos sobre strings distintos. El filtrado es defensa en profundidad y un no-op para entrada bien formada, igual que el que `formatUartMessage()` aplica en su propio punto de uso: `JSON.stringify()` escapa comillas y backslashes pero **no** `U+2028`/`U+2029`, que son terminadores de línea de la gramática de ECMAScript, así que uno de ellos dentro de un nombre corta la línea `//% block=` a la mitad y el archivo generado deja de ser TypeScript válido. Antes alcanzaba con que los nombres se normalizaran al guardarse; la frontera de rehidratación dejó de garantizarlo a propósito (normalizar ahí huerfanaría las muestras de un proyecto de audio, donde el nombre de clase es la clave con la que el recognizer las indexa), así que **cada punto de uso se protege solo**.

Valida los mensajes entrantes por ventana emisora **y** origen, y valida además la **forma** de `makecodeProject` en las **dos puertas** por las que entra: el `workspacesave` del iframe y `openMakeCode()`, que lo recibe desde localStorage. La frontera de `project-schema.js` preserva ese campo tal cual a propósito —es el único que el docente no puede reconstruir—, así que la guarda de forma vive en cada punto de lectura, y **es asimétrica entre las dos puertas a propósito**: `workspacesave` usa `isPlainMakeCodeProject()` (objeto plano, con `text` también objeto plano cuando está presente — un string ahí produciría un objeto de claves numéricas al expandirse con spread), permisiva porque rechazar ahí costaría los bloques que el docente acaba de escribir; `openMakeCode()` usa `hasUsableText()`, que además exige que `text` tenga al menos un archivo, porque un `text` vacío (`null`, `undefined` o `{}`) produciría un proyecto de un solo archivo —el `tm-classes.ts` regenerado— sin `pxt.json` ni la dependencia de la extensión, y el panel abriría un proyecto que no compila; ahí descartar no destruye nada, porque el dato sigue intacto en el registro. La normalización de `openMakeCode()` va antes de que el valor entre en `lastCallParams`, para que el reintento use el valor ya normalizado; una forma inesperada se ignora y se abre un proyecto nuevo. Si MakeCode no responde en 8 s o no hay conexión, muestra overlay de fallback con botón de reintento.

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
- `project-schema.test.js` — cubre la canonización campo por campo (id numérico a string, `schemaVersion` ausente tratada como v1 e inválida reparada a 1, versión más nueva aceptada sin tocar, nombre en blanco reparado, `projectType` reparado desde `localModel.source`), el **descarte del modelo conservando el proyecto** (`storageKey` de un esquema superado o apuntando a otro proyecto, `source` desconocido, `source` que nombra un miembro de `Object.prototype`, `classNames` con huecos) incluida la pista de tipo que deja un modelo descartado, los cuatro motivos de cuarentena como códigos fijos con el valor ofensor truncado en `detail`, la preservación intacta de `createdAt`, `lastUsed` y `makecodeProject` sea cual sea su tipo, la deduplicación por id, la preservación de campos desconocidos y la idempotencia. Un test verifica el **acuerdo con `storage-keys.js`**: la frontera acepta exactamente los mismos ids que el guard de construcción de claves, recorriendo el mismo conjunto de valores rechazados que usa `storage-keys.test.js`. Si alguna vez divergen, vuelve el bug de las dos identidades. Incluye además el test del fixture de regresión (`tests/fixtures/projects-v1.json`).
- `class-name.test.js` — cubre el filtrado de caracteres inseguros (incluidos `U+2028`/`U+2029`), el conteo y truncado por bytes UTF-8 sin partir caracteres, la forma canónica de `normalizeClassName()`, la detección de duplicados case-insensitive y la derivación de identificadores de enum (primer carácter saneado, dígito inicial, acentos, fallback y unicidad ante colisiones).

`tests/fixtures/projects-v1.json` es un volcado real de `ml-microbit-models` tomado del sitio desplegado (v8.0) antes de que existiera el versionado: tres proyectos entrenados —imagen, audio y pose—, los tres con su proyecto de MakeCode guardado y ninguno con `schemaVersion`. Es la forma ejecutable de "un cambio no puede romper los proyectos que los docentes ya tienen". **Si un cambio futuro hace fallar ese test, lo que está mal es el cambio, no el fixture:** editarlo para que el test pase es exactamente el momento en que el trabajo guardado de un docente deja de abrir. No se puede regenerar — una vez que el código nuevo corre sobre ese localStorage, los registros quedan reescritos con `schemaVersion` sellado.

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
    // audio, clase 0 (ruido de fondo): recordBatchContinuous(ci, 10) → una sola regresiva y las 10 muestras seguidas

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
[abrir]    renderModels() → loadModels() → rehydrateProjects() → openTrainingScreen(model)
                                                                 // auto-forward si entrenado
[borrar]   deleteProject(id, {trainer, audioTrainer, poseTrainer})
               → <trainer por projectType>.deleteSamplesDB(id)      // siempre, por id
               → <trainer>.deleteModel(storageKey)                  // solo si hay storageKey
               → saveModels(models sin el proyecto)
```

## 4. Persistencia

### localStorage

| Clave | Contenido |
|---|---|
| `ml-microbit-models` | Array de proyectos: `{schemaVersion, id, name, projectType, createdAt, lastUsed, makecodeProject, localModel?, classNames?}` |
| `ml-microbit-models-corrupt-<timestamp>` | Backup automático del valor si se detectó corrupto al cargar. Es de solo escritura: ningún código lo lee de vuelta, existe para inspección manual |
| `ml-microbit-models-quarantine-seen` | **Huella** (`<entradas>:<largo serializado>`) de la cuarentena que ya se le avisó al usuario. Es un **acuse de recibo, no un borrado**: el botón "Entendido" escribe acá y no toca la cuarentena. Es una huella y no un conteo porque un conteo no es comparable contra una lista topada — ver sección 2. Cambia apenas la cuarentena gana algo, así que un registro apartado después vuelve a encender el aviso solo |
| `ml-microbit-models-quarantine` | Registros que la frontera de rehidratación no pudo canonizar, con su código de motivo, el `detail` truncado y el registro crudo. Tres cotas (20 entradas, 64 K en total, 32 K por entrada, medidas en unidades UTF-16 y no en bytes — ver sección 6) y deduplicada por contenido; una entrada que excede su presupuesto se reemplaza por un resumen diagnosticable y **pierde el registro crudo**. Solo diagnóstico: la app nunca rehidrata desde acá |

`schemaVersion` es la marca de versión del registro, sellada por `addProject()` con `PROJECT_SCHEMA_VERSION` de `project-schema.js`. Va **por registro y no en un envoltorio del contenedor**: `ml-microbit-models` sigue siendo un array pelado, así que el campo es puramente aditivo y una versión vieja de la app lo ignora y sigue funcionando. Un registro sin el campo es anterior al versionado y se trata como v1.

`localModel` según el tipo: `{source: 'local' \| 'local-audio' \| 'local-pose', storageKey, classNames, trainedAt}` (imagen agrega `featureExtractor: "mobilenet_v1_0.25_224"`). Los valores de `source` conservan su forma histórica y no llevan prefijo: son vocabulario interno del dato, no claves.

### IndexedDB

Base propia `ml-microbit-app`, versión `SAMPLES_DB_VERSION` (hoy `1`, centralizada en `storage-keys.js` porque los tres trainers abren la misma base), object store `samples`:

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

`storageKey` se persiste además como string dentro de cada proyecto, y hay dos caminos que lo tratan distinto: `saveModel()` de cada trainer lo **reconstruye** desde el `projectId` en cada entrenamiento, mientras que `loadSavedModel()` y `deleteProject()` leen el string **verbatim** del dato guardado. Por eso un cambio de esquema de claves rompe los proyectos ya guardados aunque el código sea consistente: el valor viejo persiste apuntando a un registro que ya no existe. Desde la frontera de rehidratación ese valor ya no llega crudo al código: `canonicalizeProject()` acepta solo el `storageKey` que produciría el constructor vigente para ese id. **Un valor que no corresponde ya no cuesta el proyecto: se descarta `localModel` y el proyecto vuelve como no entrenado**, con su nombre, sus clases y sus bloques de MakeCode intactos, listo para reentrenar. Esa es la resolución vigente para los proyectos anteriores al rename `tm-` → `ml-` (que se hizo sin migración), y es mejor que el comportamiento desplegado hasta v8.0, donde el proyecto se listaba pero el modelo no cargaba nunca. Ya no hace falta borrar datos del sitio.

Además, el Service Worker mantiene el Cache Storage `ml-microbit-v8.2` con el app shell y todo `vendor/`.

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
- **Todo cambio a la forma del registro de proyecto tiene que ser aditivo:** agregar campos nuevos, nunca renombrar ni reinterpretar los existentes. La razón es la flota mixta de versiones. La app se sirve desde GitHub Pages con un Service Worker que se actualiza solo —no hay forma de que un docente se quede en una versión vieja—, así que el único mecanismo de compatibilidad posible es que el dato viejo siga siendo legible por el código nuevo; y un cliente que quedó offline conserva el Service Worker viejo hasta la próxima carga con conexión, así que durante un tiempo conviven versiones distintas de la app contra el mismo esquema de datos, y un build viejo puede tener que leer lo que escribió uno nuevo. Renombrar o reinterpretar un campo rompe a ese cliente sin forma de hacer rollback. El gancho de migración es `canonicalizeProject()` en `project-schema.js`, y `PROJECT_SCHEMA_VERSION` solo se sube junto con una migración ahí. Lo verifica el fixture de regresión `tests/fixtures/projects-v1.json`.
- **El archivo de exportación de proyectos llevará su propia versión de formato, independiente de `schemaVersion`** (decisión de A3, feature todavía no implementada). Son dos contratos distintos: `schemaVersion` versiona el registro tal como vive en localStorage y cambia con las necesidades internas de la app, mientras que el archivo exportado es un formato de intercambio que puede tener que leer una app de otra versión, o incluso otra herramienta. El fixture `tests/fixtures/projects-v1.json` es la semilla de ese formato.
- **Mensajes postMessage validados** por ventana emisora y origen exacto (`MAKECODE_ORIGIN`).
- **Los nombres de clase se normalizan en el origen:** al autogenerarse (`Clase N`) y al renombrarse, vía `normalizeClassName()` de `class-name.js` (máximo 15 bytes UTF-8, sin `#`, comillas, backslash ni caracteres de control). Esa igualdad byte a byte vale para un nombre bien formado. **Un nombre rehidratado no tiene garantizada su forma canónica**: la frontera de rehidratación (`project-schema.js`) valida que `classNames` sea un array de strings, no que cada nombre cumpla el invariante de `class-name.js` — a propósito, porque normalizar ahí huerfanaría las muestras de un proyecto de audio, donde el nombre de clase es la clave de indexado del recognizer. Por eso **cada consumidor filtra en su propio punto de uso**: `formatUartMessage()` y `generateTmClassesTs()` aplican `stripUnsafeChars()` como defensa en profundidad. Queda un desajuste de largo y de colisión entre ambos para un nombre rehidratado (ver sección 7): `formatUartMessage()` trunca a 20 bytes mientras `_tmClaseNombres` guarda el nombre entero, y dos nombres distintos pueden colapsar en el mismo valor filtrado.
- **Mínimos de entrenamiento:** 2 clases y 8 muestras por clase, validado en la UI (`updateTrainButton()`). Los `train()` de imagen y pose lo re-validan clase por clase; el de audio solo exige que haya ≥2 clases con 8+ muestras (una clase adicional con menos muestras no lo hace fallar — ahí la barrera es solo la UI).
- **Webcam cuadrada center-crop:** el usuario ve exactamente el encuadre que recibe el modelo.
- **La lógica testeable se extrae a módulos puros** (patrón `protocol.js`; también `sanitize.js`, `class-name.js`, `storage-keys.js` y `project-schema.js`): sin APIs de navegador a nivel de módulo, importables desde `node:test`. Los tests documentan lo que el código hace.
- **IndexedDB y localStorage se tratan como entrada de usuario:** las muestras rehidratadas por `loadSamples()` se validan con `sanitize.js` en los tres trainers (`isValidImageSample`, `isValidPoseSample`, `isValidSpectrogram`); los thumbnails se asignan por propiedad (`img.src`), nunca interpolados en templates HTML. `escapeHtml()` escapa comillas y es la única vía para interpolar texto de usuario en templates (texto o atributo).
- **localStorage defensivo:** datos corruptos se preservan en clave de backup; cuota excedida se reporta con `StorageQuotaError` y mensaje accionable. Los registros individuales que la frontera de rehidratación no puede canonizar no se descartan en silencio: se preservan en `ml-microbit-models-quarantine` (con tres cotas —20 entradas, 64 K y 32 K por entrada, medidas en **unidades UTF-16** y no en bytes, así que el presupuesto real es del orden del doble— y deduplicados) y `renderModels()` muestra un aviso arriba de "Mis Proyectos" con el conteo de lo que hay **apartado**, no solo de lo que rechazó la carga actual: apenas una mutación reescribe `MODELS_KEY`, la copia de la cuarentena es la única que queda, que es cuando el aviso más hace falta. Si esa copia no se pudo escribir, el aviso lo dice en vez de afirmar que se guardó. Se escribe con `textContent`, nunca `innerHTML`: hoy no interpola texto de usuario y mantenerlo así impide que se vuelva un punto de inyección. Ese aviso es lo que convierte un proyecto perdido en un reporte que se puede investigar.

## 7. Estado actual

**Última actualización:** 2026-08-26

**Features completas:** tres trainers (imagen, audio, pose) con captura, entrenamiento, preview en vivo y persistencia; conexión BLE con keep-alive y envío de la clase ganadora; panel MakeCode inline con proyecto generado, guardado automático y fallback offline; biblioteca de proyectos (crear/abrir/borrar); PWA instalable y offline; cambio de cámara frontal/trasera; modo expandido de predicción; suites de tests (protocolo UART, sanitización, nombres de clase, claves de almacenamiento y frontera de rehidratación con fixture de regresión) con CI (tests + consistencia del precache + checksums de todo vendor/ con verificación de cobertura).

**Deuda y pendientes conocidos:**

- Quedan 4 hallazgos menores (baja/informativa) de la auditoría de seguridad del 2026-07-31 como backlog en `docs/PENDIENTES-SEGURIDAD.md`. Los altos/medios de esa auditoría ya fueron corregidos. De los menores, dos —inyección de TS por nombre de clase y filtrado del nombre en UART— se cerraron con la normalización de nombres de clase; el de **matching de rutas del SW por substring lo cerró solo parcialmente** el chequeo `url.origin === self.location.origin` del handler `fetch` de `sw.js`, que descarta las URLs cross-origin: el matching same-origin sigue siendo `includes('/vendor/')`.
- **Precondición para mover `pxt-tm-microbit-link-v2` a la organización `ml-microbit`:** ese PR tiene que endurecer `sw.js` **antes** de habilitar Pages en el repo de la extensión. Son dos problemas distintos, y el segundo no lo resuelve el fix del primero:
  1. **Interferencia en `fetch`** — filtrar por `self.registration.scope` en vez de por substring, tanto en la rama `/vendor/` del handler `fetch` como en el `cache.put()` de la rama network-first. Afecta qué se sirve.
  2. **Borrado de datos ajenos en `activate`** — el predicado actual borra todo cache cuyo nombre no sea el `CACHE_NAME` exacto. `caches.keys()` devuelve los nombres de **todo el origen**: Cache Storage no está particionado por Service Worker ni por scope. Ya hoy, sin ningún rename de por medio, cada activación de una versión nueva de este Service Worker borraría el Cache Storage completo de cualquier otra app del origen. El fix es filtrar también acá por `self.registration.scope` o por prefijo propio; no basta con corregir `fetch`.

  Los project sites de la organización se sirven en `https://ml-microbit.github.io/<repo>/`, el mismo origen que esta app, y con el scope en `/` este Service Worker alcanza a todos. Ver el bullet de path-agnosticismo de la sección 6.
- **El rename L4 queda pendiente, y su costo depende de qué parte se toque.** L4 es el contrato con MakeCode: `TMClase`, `tm-classes.ts`, `_tmClaseNombres`, `tm_clase_picker`, `controllerId: 'tm-microbit-app'` y el id de la extensión. No es una sola cosa y se separa limpio por costo.

  **Gratis, ahora y siempre:** mover `pxt-tm-microbit-link-v2` a la organización (los proyectos guardados pinean la extensión **por commit** en su propio `pxt.json`, y GitHub mantiene el redirect tras una transferencia), cambiar `controllerId` (es el handshake app–iframe y no se persiste) y renombrar lo que sea interno de la app.

  **Caro desde que un docente guarda un proyecto de MakeCode:** `TMClase`, `tm_clase_picker`, `_tmClaseNombres` y el namespace de los bloques. El `tm-classes.ts` generado sí se regenera en cada carga del panel y el texto viejo se pisa solo, pero **no es el único archivo que referencia esos identificadores**. El `main.blocks` y el `main.ts` los llevan verbatim, son del docente y **no se regeneran nunca**: vuelven en el `workspacesave` y se guardan tal cual dentro de `makecodeProject.text`, en `ml-microbit-models`.

      <shadow type="tm_clase_picker"><field name="clase">TMClase.Clase_1</field></shadow>

      iaMachine.alDetectarClase(TMClase.Clase_2, 80, function () { ... })

  Renombrarlos hace que la app le inyecte a un proyecto viejo un enum con nombres nuevos mientras sus bloques siguen referenciando los viejos, y los bloques dejan de cargar. Sin error, como todo lo de este contrato.

  **Dos salidas, decisión abierta.** (1) **Congelar** los identificadores que ven los bloques como legado permanente: la superficie visible es chica —en los bloques se ve la etiqueta (`Clase 1`), no el identificador; `TMClase` solo asoma en la vista de JavaScript, y `iaMachine` ya no lleva `tm`— y no hay migración ni camino doble en el generador. (2) **Migrar**: generar el enum que corresponde a la extensión que *ese* proyecto pinea, leyéndolo de su propio `pxt.json` guardado. Eso es ground truth y no exige contabilidad aparte; apoyarse en `schemaVersion` sería una segunda fuente de verdad que puede divergir. La opción 2 recién es posible desde la frontera de rehidratación: antes no había forma de distinguir un proyecto viejo de uno nuevo.
- **Quedan huérfanos acotados en IndexedDB, por dos vías distintas.** (a) Los **pesos** de un modelo cuyo puntero descartó la frontera: su `storageKey` era de un esquema superado y no se puede derivar del registro canonizado, así que no hay forma de borrarlos. Se acepta porque el modelo es lo regenerable y ahí no queda nada del docente. (b) Las muestras y los pesos de un proyecto **cuarentenado**, que al no aparecer en `loadModels()` no tiene vía de borrado desde la UI; la próxima mutación reescribe `MODELS_KEY` sin ese registro y el único puntero al `id` que queda es el de la clave de cuarentena, que `readQuarantine()` expone. El caso del proyecto vivo con `localModel` descartado **ya está cerrado**: `deleteProject()` borra las muestras por id fuera de todo guard.
- **`isCacheable()` de `sw.js` no chequea el origen en la rama network-first.** Solo exige `ok`, `status === 200` y `type !== 'opaque'`, así que una respuesta cross-origin con CORS sería cacheable. Hoy la página no hace ningún fetch cross-origin (MakeCode va por iframe, que no pasa por este Service Worker), pero un chequeo `url.origin === self.location.origin` cierra la puerta antes de que aparezca el primero. Va junto a los dos puntos de endurecimiento del Service Worker ya anotados arriba.
- **Un nombre rehidratado no tiene garantizada su forma canónica, y el desajuste es de largo Y de colisión.** `usableClassNames()` valida que `classNames` sea un array de strings no vacío, no que cada nombre cumpla el invariante de `class-name.js`, y eso es deliberado: normalizar en la frontera huerfanaría las muestras de un proyecto de audio, donde el nombre de clase es la clave de indexado del recognizer. Cada consumidor filtra en su punto de uso (`formatUartMessage()` y `generateTmClassesTs()` aplican `stripUnsafeChars()`), pero quedan dos huecos. **Largo:** `formatUartMessage()` trunca por su cota de 20 bytes mientras `_tmClaseNombres` guarda el nombre entero, así que un nombre de más de 15 bytes deja de disparar su bloque de detección sin ningún error. **Colisión:** dos nombres distintos pueden colapsar en el mismo valor filtrado —`"Gato"` y `"Gato#"` dan los dos `Gato`—, y `deriveEnumIdentifiers()` desambigua los *identificadores* del enum (`Gato`, `Gato_2`) pero no las etiquetas `//% block=`, ni las entradas de `_tmClaseNombres`, ni lo que va por el cable: el picker de MakeCode muestra dos opciones indistinguibles y el bloque de una clase dispara con las predicciones de la otra. Cerrar cualquiera de los dos exige que el generador y el emisor UART apliquen la misma normalización, o sea tocar `protocol.js` y sus tests; la solución (una sola `normalizeClassName()` de los dos lados más desambiguación de etiquetas) los cubre juntos. Es el mismo caso ya documentado para los proyectos anteriores a `class-name.js`.
- **Falta extraer a módulos puros la lógica que hoy no se puede testear.** Dos zonas quedaron fuera de la suite porque tocan APIs de navegador: `generateTmClassesTs()` de `js/makecode-embed.js` (no se exporta, y su guarda de `stripUnsafeChars()` es el único filtro de su clase sin test de regresión — un refactor que derive los identificadores de `classNames` en vez de `safeNames` pasaría `npm test` en verde) y la lógica de cuarentena de `js/project-store.js` (mezcla, cotas, huella, decisión de `needsNotice`), que hoy solo se verifica con arneses de Node y un stub de `localStorage` armados a mano en cada ronda de QA. Corresponde extraerlas a módulos puros con el almacenamiento inyectado, mismo patrón que `protocol.js`, `sanitize.js`, `class-name.js`, `storage-keys.js` y `project-schema.js`, y convertir esos arneses en tests permanentes. Va después del merge de esta rama.
- **`preserveCorruptData()` no tiene cota.** Escribe un backup nuevo en cada `loadModels()` mientras el valor siga corrupto, y `loadModels()` se llama desde siete lugares. Contra una cuota de localStorage que ahora se comparte con cualquier otra app del origen, un valor corrupto persistente puede llenarla sola. Corresponde una cota (un backup por valor corrupto, o descartar el anterior). `MODELS_QUARANTINE_KEY`, agregada después, sí nace acotada (20 entradas, 64 K en total, 32 K por entrada en unidades UTF-16, deduplicadas por contenido) y sirve de referencia para cómo cerrar este ítem. Las tres rigen tanto para lo que la app escribe por el camino de mezcla como para la reparación de una clave sobredimensionada —una escrita por tampering o por otra app del origen—, que aplica las mismas cotas, incluida la de `detail` por entrada.
- **Un valor no-array bajo `MODELS_QUARANTINE_KEY` nunca se repara.** `readQuarantine()` devuelve `[]` ante cualquier valor que no sea un array (incluido JSON inválido), así que la comparación de largos en `updateQuarantine()` nunca dispara y el blob queda indefinidamente sin recortar. Misma familia que el ítem de `preserveCorruptData()` de arriba; se cierra distinguiendo "clave ausente" de "clave presente pero ilegible" y forzando la reparación en el segundo caso.
- **`#trainingCaptureSection` nunca recibe la clase `hidden` en todo el repo**, así que las llamadas a `remove('hidden')` sobre ese elemento y su regla CSS son código muerto. Sacarlas es limpieza, no corrección — y `enterCaptureMode()` conserva la misma asimetría entre sus tres ramas que se emparejó en `openTrainingScreen()`. Los dos, fuera de esta rama.
- **`app.js` vuelca `error.message` crudo a los toasts.** Los mensajes de error internos están en inglés por convención del proyecto, así que cualquier fallo interno le llega al docente en inglés y con vocabulario técnico. Corresponde separar el mensaje de usuario del mensaje de diagnóstico.
- Cobertura de tests limitada al protocolo UART, `sanitize.js`, `class-name.js`, `storage-keys.js` y `project-schema.js`. Fases futuras previstas: operaciones sobre clases/muestras y ordenamiento de predicciones (requieren extraer esa lógica a módulos puros, mismo patrón que `protocol.js`).
- `getClassColor()` en `app.js` ignora el índice y devuelve siempre el primer color: la paleta `CLASS_COLORS` de 6 colores está definida pero todas las clases se pintan iguales (decisión o regresión — a confirmar antes de "arreglarlo").
- **`vendor/CHECKSUMS.txt` prueba inmutabilidad, no procedencia** (auditoría del 2026-08-13). Los hashes se calcularon sobre lo que se descargó, así que el CI verifica "estos bytes no cambiaron desde el commit", no "estos bytes son los del bucket oficial"; ningún archivo del repo registra de qué URL salió cada artefacto. Mitigación propuesta y **pospuesta**: `vendor/PROVENANCE.md` con URL, fecha y hash upstream de cada artefacto, más un verificador opcional fuera de CI.
- `saveModel()` de audio puede terminar sin persistir pesos (solo deja warning en consola) si ni `transfer.save()` ni el modelo interno están disponibles; el proyecto queda dependiente de re-entrenar desde muestras, **que ahora se recuperan solas**: un modelo que no carga entra por la misma rama que un `localModel` descartado, así que las clases y las muestras vuelven y el reentrenamiento cuesta un click. Sigue siendo un bug —el modelo no queda persistido— pero ya no cuesta las muestras.
- `js/tm-import/` archivado con imports que no resuelven en su ubicación actual (esperado; ver su README para re-habilitar).
- El botón `newModelBtn` del home está `display:none` (reemplazado por la card "Nuevo Proyecto"); el markup sigue en `index.html`.
- **Conexión USB intermitente en el panel MakeCode embebido** (observado 2026-08-20): al descargar a la placa desde el iframe, la conexión WebUSB falla y a veces anda al reintentar. El mismo comportamiento se reproduce en el MakeCode oficial fuera de la app, así que la causa es upstream y no de la integración por iframe. Sin diagnóstico ni issue abierto; pendiente de investigar.

---

> **Regla de mantenimiento:** todo documento de implementación futuro debe incluir como paso final la actualización de este archivo con los cambios introducidos. El revisor QA verifica que se haya hecho. Tras cada actualización, subir la nueva versión al conocimiento del proyecto en claude.ai.