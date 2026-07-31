/**
 * mediapipe-loader.js
 * Expone las clases de MediaPipe Tasks Vision en `window` para que
 * pose-trainer.js las consuma.
 *
 * Vive en un archivo separado (en vez de inline en index.html) para que
 * la Content-Security-Policy pueda mantener `script-src 'self'` sin
 * excepciones por hash.
 *
 * Como módulo ES, se ejecuta de forma diferida. pose-trainer.js hace
 * polling sobre window.PoseLandmarker en initTrainer(), así que el orden
 * de carga está contemplado.
 */

import { FilesetResolver, PoseLandmarker, DrawingUtils }
    from "../vendor/mediapipe/tasks-vision-0.10.14.mjs";

window.FilesetResolver = FilesetResolver;
window.PoseLandmarker = PoseLandmarker;
window.DrawingUtils = DrawingUtils;
