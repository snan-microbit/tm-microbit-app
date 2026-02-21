# TM Microbit App

App web que usa Teachable Machine para clasificación de imágenes/poses y se comunica con microbit vía Web Bluetooth.

## Stack
- Vanilla JS (sin frameworks)
- Teachable Machine image v0.8.3 y pose
- Web Bluetooth API para comunicación con microbit

## Convenciones
- La lógica de predicciones está en js/predictions.js
- No modificar la integración con microbit salvo que se pida explícitamente
- La función applyEnvironmentCamera maneja el flip de cámara (fue problemática, tocar con cuidado)

## Notas importantes
- Compatible con iOS Safari y Chrome Android, tener en cuenta limitaciones de cada uno