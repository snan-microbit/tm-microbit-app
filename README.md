# 🤖 TM + micro:bit

Progressive Web App (PWA) que conecta modelos de **Teachable Machine** con el **micro:bit** vía Bluetooth.

## 🎯 Características

### Modelos Soportados
- ✅ **Imagen**: Clasificación de imágenes desde webcam
- ✅ **Pose**: Detección de posturas corporales  
- ✅ **Audio**: Reconocimiento de comandos de voz

### Funcionalidades
- 📱 **PWA**: Instalable en móviles y desktop
- 🔵 **Bluetooth**: Conexión directa con micro:bit
- 📚 **Biblioteca de modelos**: Guarda múltiples modelos
- 🎨 **Visualización de audio**: Barras de frecuencia optimizadas para voz
- 🎤 **Filtro inteligente**: No envía "Ruido de fondo" al micro:bit
- 🌐 **Offline-ready**: Service Worker para uso sin conexión

## 🚀 Uso Rápido

1. Entrena tu modelo en [Teachable Machine](https://teachablemachine.withgoogle.com/)
2. Exporta el modelo y copia la URL
3. Abre la app: [tm-microbit.app](https://tu-dominio.com)
4. Pega la URL del modelo
5. Conecta tu micro:bit por Bluetooth
6. ¡Listo! El micro:bit recibirá las predicciones

## 📡 Formato de Datos Bluetooth

La app envía datos al micro:bit por UART en el formato:

```
clase#certeza\n
```

**Ejemplos:**
```
Arriba#95\n
Gato#87\n
Izquierda#92\n
```

## 🧩 Extensión para MakeCode

Usa la extensión `iaMachine` en MakeCode para programar tu micro:bit:

```blocks
al iniciar
    iaMachine.mostrarNombreBluetooth()

iaMachine.alDetectarClase("Arriba", 80, function () {
    basic.showLeds(`
        . . # . .
        . # # # .
        # . # . #
        . . # . .
        . . # . .
    `)
})
```

### Bloques Disponibles

- **Al detectar clase** - Ejecuta código cuando detecta una clase específica
- **Al detectar cualquier clase** - Ejecuta código con cualquier detección
- **clase detectada** - Devuelve el nombre de la clase
- **certeza detectada** - Devuelve el % de certeza (0-100)
- **mostrar nombre Bluetooth** - Muestra el nombre del micro:bit en la matriz LED
- **Al conectar/desconectar** - Maneja eventos de conexión

## 🎨 Branding Ceibal

La app usa la identidad visual de Plan Ceibal:
- Color primario: `#009f95` (turquoise)
- Iconos personalizados con laptop + micro:bit
- Tipografía: Nunito

## 🏗️ Arquitectura Técnica

### Stack
- **Frontend**: Vanilla JavaScript (ES6 modules)
- **ML**: TensorFlow.js + Teachable Machine libraries
- **Bluetooth**: Web Bluetooth API (UART)
- **Storage**: LocalStorage para biblioteca de modelos
- **PWA**: Service Worker + Web App Manifest

### Estructura de Archivos

```
tm-microbit-app/
├── index.html           # UI principal
├── manifest.json        # PWA manifest
├── sw.js               # Service worker
├── assets/             
│   ├── icon-192.png    # Iconos PWA
│   └── icon-512.png
├── css/
│   └── styles.css      # Estilos responsivos
└── js/
    ├── app.js          # Lógica principal y biblioteca
    ├── model-loader.js # Carga y detección de modelos
    ├── predictions.js  # Webcam, audio y predicciones
    └── bluetooth.js    # Gestión Bluetooth UART
```

### Modelos de Audio

Los modelos de audio usan `speechCommands` de TensorFlow.js como intermediario:

```
Micrófono → Speech Commands → Espectrograma → Tu modelo TM → Predicción
```

El visualizador de audio:
- Muestra 32 barras de frecuencia
- Rango optimizado: 80Hz - 8000Hz (voz humana)
- Barras redondeadas que crecen desde el centro
- Gradient turquesa → azul

### Modelos de Pose

Los modelos de pose usan PoseNet como intermediario:

```
Webcam → PoseNet → 17 keypoints → Tu modelo TM → Predicción
```

Se dibuja el esqueleto sobre el video en tiempo real.

## 🔧 Desarrollo

### Requisitos
- Navegador con soporte de Web Bluetooth (Chrome, Edge)
- Servidor HTTPS (requerido para Bluetooth y getUserMedia)

### Desarrollo Local

```bash
# Servidor HTTPS simple con Python
python3 -m http.server 8000 --bind localhost

# O con Node.js
npx http-server -p 8000 -S
```

### Testing
- **Desktop**: Chrome/Edge (Web Bluetooth habilitado)
- **Mobile**: Android con Chrome
- **iOS**: No soporta Web Bluetooth (usar Android)

## 📦 Despliegue

Ver [DEPLOY.md](DEPLOY.md) para instrucciones detalladas de despliegue en:
- GitHub Pages
- Netlify
- Vercel
- Firebase Hosting

## 🤝 Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para guidelines.

## 📄 Licencia

MIT License - Ver [LICENSE](LICENSE)

## 🎓 Uso Educativo

Esta app fue diseñada para contextos educativos con Plan Ceibal, permitiendo que múltiples estudiantes trabajen con micro:bits en un aula.

**Identificación de dispositivos**: Usa el bloque `mostrar nombre Bluetooth` para que cada estudiante identifique su micro:bit cuando hay varios en el aula.

## 🔗 Enlaces

- [Teachable Machine](https://teachablemachine.withgoogle.com/)
- [micro:bit](https://microbit.org/)
- [Plan Ceibal](https://www.ceibal.edu.uy/)
- [MakeCode](https://makecode.microbit.org/)

---

Hecho con ❤️ para la educación
