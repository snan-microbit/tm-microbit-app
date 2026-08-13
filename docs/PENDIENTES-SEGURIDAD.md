# Pendientes de seguridad

Backlog de hallazgos **menores** de la auditoría de seguridad integral del 2026-07-31
(agente `auditor-seguridad-ml-microbit`). Los hallazgos altos y medios de esa auditoría
ya fueron corregidos (escape en contexto de atributo, checksums completos de `vendor/`,
validación de muestras de IndexedDB). Estos ítems quedan para ciclos futuros: ninguno
es explotable de forma directa hoy, pero endurecen defensas en profundidad.

Al corregir un ítem: borrarlo de esta lista y actualizar `docs/ARQUITECTURA.md`.

---

## 1. `data.project` de MakeCode se persiste sin validar estructura

- **Severidad:** baja
- **Dónde:** `js/makecode-embed.js`, handler de `workspacesave` en `openMakeCode()`
- **Riesgo:** el objeto recibido del iframe (origen y ventana sí validados) se pasa entero
  a `updateProjectMakeCode()` y a localStorage sin verificar su forma.
- **Fix sugerido:** validar que sea un objeto con `text` de strings antes de guardarlo
  (defensa en profundidad; el desborde de cuota ya lo cubre `StorageQuotaError`).

## 2. `loadModels()` valida el array pero no cada item

- **Severidad:** baja
- **Dónde:** `js/project-store.js`, `loadModels()`
- **Riesgo:** un item con `classNames` no-array o `name` no-string (localStorage editado)
  hace tirar `TypeError` a `renderModels()` y deja el home roto (DoS local menor).
- **Fix sugerido:** filtrar al cargar los items cuya forma no coincida con lo que escribe
  `addProject()`.

## 3. Clickjacking: sin `frame-ancestors`

- **Severidad:** baja
- **Dónde:** CSP en `index.html` (meta tag) / configuración del hosting
- **Riesgo:** `frame-ancestors` no tiene efecto en meta tags, así que la app puede ser
  embebida en un iframe de un sitio hostil que superponga UI.
- **Fix sugerido:** si el hosting lo permite, agregar el header HTTP
  `Content-Security-Policy: frame-ancestors 'none'` (o `X-Frame-Options: DENY`).

## 4. `allow` del iframe de MakeCode más amplio de lo necesario

- **Severidad:** baja
- **Dónde:** `index.html`, iframe de MakeCode
- **Riesgo:** se concede `usb; autoplay; camera; microphone;` a `makecode.microbit.org`.
  `usb` es necesario para flashear; `camera`/`microphone` posiblemente no.
- **Fix sugerido:** verificar qué permisos usa realmente el editor embebido y recortar
  la lista al mínimo.

