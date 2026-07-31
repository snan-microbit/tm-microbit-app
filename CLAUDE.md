# ML-micro:bit

PWA educativa de Plan Ceibal: entrena modelos de ML en el navegador (imagen, audio, pose) y envía predicciones a BBC micro:bit por Bluetooth UART. Usuarios: docentes y estudiantes.

## Restricciones innegociables

- Vanilla JavaScript (módulos ES6). Sin frameworks, sin TypeScript, sin build step.
- CERO dependencias npm en runtime. Todo por CDN con versiones pinneadas (TF.js 4.22.0, MediaPipe Tasks Vision 0.10.14, Speech Commands 0.5.4). No cambiar versiones.
- Offline-capable tras la primera carga (Service Worker con precache; al tocar archivos precacheados, agregarlos a la lista y subir la versión del cache).
- Español en strings de UI; inglés en código, comentarios y nombres.
- Mobile-friendly: responsive, touch targets ≥ 44×44 px, UX simple para contexto educativo.
- Única dependencia de desarrollo permitida: ninguna — los tests usan `node:test` nativo (`npm test`).

## Convenciones

- Un solo `index.html` con todas las pantallas; un solo `css/styles.css`.
- Referenciar código por nombre de función, nunca por número de línea.
- Persistencia: metadata en localStorage (`tm_microbit_models`), pesos en IndexedDB (`tm-local-{id}`, `tm-audio-local-{id}`, `tm-pose-local-{id}`), muestras en object store `samples`. Los helpers IDB duplicados por módulo son intencionales: no unificar.
- En transiciones de pantalla: liberar webcam, detener audio, desconectar BLE, cerrar iframe de MakeCode, limpiar listeners, `dispose()` de trainers.
- TF.js: tensores intermedios en `tf.tidy()`; disponer salidas de `predict()` tras `.data()`; al reentrenar, entrenar el head nuevo ANTES de disponer el viejo.
- No mostrar validation accuracy al usuario.

## Fuentes y flujo de trabajo

- **Mapa del código**: leé `docs/ARQUITECTURA.md` antes de trabajar; actualizalo al terminar cualquier cambio que toque funciones exportadas, flujos, persistencia o protocolo (y su fecha).
- **Tests**: corré `npm test` antes de dar por terminada cualquier tarea. Lógica pura nueva → test nuevo en `tests/`.
- **QA**: tras implementar, invocar el subagente `revisor-ml-microbit`. Si el cambio toca entrada de usuario, DOM, postMessage, SW o persistencia: también `auditor-seguridad-ml-microbit`.
- **Discrepancias**: si el código real difiere de lo que asume un documento (este incluido), reportalo — no corrijas en silencio.
- Las decisiones de arquitectura las toma Santi: ante alternativas relevantes, presentá opciones con pros y contras en vez de decidir.