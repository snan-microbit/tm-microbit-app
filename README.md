# Teachable Machine + micro:bit

Una aplicación web progresiva (PWA) que conecta modelos de [Teachable Machine](https://teachablemachine.withgoogle.com/) con [micro:bit](https://microbit.org/) vía Bluetooth.

## 🎯 Propósito

Esta aplicación permite a estudiantes y educadores integrar aprendizaje automático en sus proyectos de micro:bit de manera simple, conectando modelos entrenados en Teachable Machine con el hardware micro:bit mediante conexión Bluetooth.

## ✨ Características

- 📷 Soporte para modelos de **imagen** y **poses** de Teachable Machine
- 🔵 Conexión Bluetooth con micro:bit (UART service)
- 📊 Visualización en tiempo real de predicciones
- 📱 PWA instalable (funciona offline después de la primera carga)
- 🎨 Interfaz amigable para estudiantes
- 📤 Envío automático de clases detectadas y nivel de certeza

## 🚀 Uso rápido

### 1. Accede a la aplicación

Visita: `https://TU-USUARIO.github.io/TU-REPO/`

### 2. Carga tu modelo

1. Entrena tu modelo en [Teachable Machine](https://teachablemachine.withgoogle.com/)
2. Haz clic en "Export Model"
3. Selecciona "Upload (shareable link)" y sube tu modelo
4. Copia la URL generada
5. Pégala en la aplicación y haz clic en "Cargar Modelo"

### 3. Conecta tu micro:bit

1. Asegúrate de que tu micro:bit tenga un programa con Bluetooth UART habilitado
2. Haz clic en "Conectar micro:bit"
3. Selecciona tu dispositivo en el diálogo de Bluetooth

### 4. ¡Listo!

La aplicación enviará automáticamente la clase detectada y su nivel de certeza a tu micro:bit.

## 📡 Formato de datos

Los datos se envían por Bluetooth en formato de texto:

```
CLASE:CERTEZA\n
```

**Ejemplos:**
- `Gato:95\n`
- `Perro:87\n`
- `Fondo:12\n`

## 🛠️ Instalación en GitHub Pages

### Opción 1: Subir archivos manualmente

1. Crea un nuevo repositorio en GitHub
2. Sube todos los archivos de este proyecto
3. Ve a Settings → Pages
4. Selecciona la rama `main` y carpeta `/root`
5. Guarda y espera unos minutos

### Opción 2: Usar GitHub CLI

```bash
# Inicializar repositorio
git init
git add .
git commit -m "Initial commit"

# Crear repositorio en GitHub y subir
gh repo create tm-microbit-app --public --source=. --push

# Habilitar GitHub Pages
gh repo edit --enable-pages --pages-branch main
```

## 📂 Estructura del proyecto

```
tm-microbit-app/
├── index.html              # Página principal
├── manifest.json           # Configuración PWA
├── sw.js                   # Service Worker (offline support)
├── css/
│   └── styles.css         # Estilos de la aplicación
├── js/
│   ├── app.js             # Inicialización principal
│   ├── model-loader.js    # Carga de modelos TM
│   ├── bluetooth.js       # Conexión Bluetooth
│   ├── predictions.js     # Predicciones y webcam
│   └── ui.js              # Utilidades de UI
└── assets/
    ├── icon-192.png       # Icono PWA (192x192)
    └── icon-512.png       # Icono PWA (512x512)
```

## 🔧 Desarrollo local

Para probar localmente necesitas un servidor HTTPS (requerido para Bluetooth Web API):

### Opción 1: Python

```bash
# Python 3
python -m http.server 8000
```

Luego accede a `http://localhost:8000` (Bluetooth no funcionará sin HTTPS)

### Opción 2: Live Server (VS Code)

1. Instala la extensión "Live Server"
2. Click derecho en `index.html` → "Open with Live Server"

### Opción 3: Usar ngrok para HTTPS local

```bash
# Instala ngrok: https://ngrok.com/
ngrok http 8000
# Usa la URL HTTPS que te proporciona
```

## 📱 Compatibilidad

### Navegadores soportados:
- ✅ Chrome/Chromium (escritorio y Android)
- ✅ Edge (escritorio)
- ❌ Firefox (no soporta Web Bluetooth)
- ❌ Safari (no soporta Web Bluetooth)

### Requisitos:
- Conexión HTTPS (GitHub Pages lo proporciona automáticamente)
- Permisos de cámara
- Permisos de Bluetooth

## 🎓 Uso educativo

### Para estudiantes:

1. **Entrena tu modelo** en Teachable Machine con ejemplos de lo que quieres detectar
2. **Exporta y carga** el modelo en la aplicación
3. **Programa tu micro:bit** para recibir datos por Bluetooth
4. **Conecta** y prueba tu proyecto

### Ejemplo de código micro:bit (MakeCode)

En la extensión de MakeCode (Fase 2), podrás usar bloques como:

```
cuando reciba clase "Gato" con certeza > 80:
    mostrar icono corazón
```

## 🐛 Solución de problemas

### El modelo no carga
- Verifica que hayas **exportado** el modelo usando "Upload my model"
- Asegúrate de copiar la URL completa
- Comprueba tu conexión a internet

### Bluetooth no conecta
- Verifica que estés usando **Chrome o Edge**
- Asegúrate de estar en **HTTPS** (GitHub Pages lo usa automáticamente)
- Comprueba que el micro:bit esté encendido y cerca
- Verifica que el micro:bit tenga Bluetooth habilitado

### La cámara no funciona
- Concede permisos de cámara cuando el navegador lo solicite
- Verifica que otra aplicación no esté usando la cámara

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si tienes ideas para mejorar la aplicación:

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## 🙏 Créditos

- [Teachable Machine](https://teachablemachine.withgoogle.com/) de Google
- [micro:bit](https://microbit.org/)
- [TensorFlow.js](https://www.tensorflow.org/js)

## 📞 Soporte

Si tienes preguntas o necesitas ayuda:
- Abre un [Issue](https://github.com/TU-USUARIO/TU-REPO/issues)
- Consulta la [documentación de Teachable Machine](https://teachablemachine.withgoogle.com/)
- Visita la [documentación de micro:bit](https://microbit.org/get-started/)

---

Hecho con ❤️ para educadores y estudiantes
