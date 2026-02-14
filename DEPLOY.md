# 🚀 Guía Rápida: Publicar en GitHub Pages

## Opción 1: Interfaz web de GitHub (Más fácil)

### Paso 1: Crear repositorio
1. Ve a [GitHub](https://github.com) e inicia sesión
2. Haz clic en el botón **"+"** arriba a la derecha → **"New repository"**
3. Nombre del repositorio: `tm-microbit-app` (o el que prefieras)
4. Selecciona **"Public"**
5. **NO** marques "Initialize with README" (ya tenemos uno)
6. Haz clic en **"Create repository"**

### Paso 2: Subir archivos
1. En la página del nuevo repositorio, haz clic en **"uploading an existing file"**
2. Arrastra TODOS los archivos del proyecto (excepto .gitignore si no lo ves)
3. Escribe un mensaje de commit: "Initial commit"
4. Haz clic en **"Commit changes"**

### Paso 3: Activar GitHub Pages
1. Ve a **Settings** (⚙️) de tu repositorio
2. En el menú lateral, haz clic en **"Pages"**
3. En "Source", selecciona **"main"** branch
4. Haz clic en **"Save"**
5. Espera 1-2 minutos

### Paso 4: ¡Listo! 🎉
Tu app estará disponible en:
```
https://TU-USUARIO.github.io/tm-microbit-app/
```

---

## Opción 2: Línea de comandos (Para usuarios avanzados)

### Requisitos previos
- Git instalado
- Cuenta de GitHub

### Comandos

```bash
# 1. Navega a la carpeta del proyecto
cd /ruta/a/tm-microbit-app

# 2. Inicializa git
git init

# 3. Agrega todos los archivos
git add .

# 4. Primer commit
git commit -m "Initial commit: Teachable Machine + micro:bit app"

# 5. Conecta con GitHub (reemplaza TU-USUARIO y TU-REPO)
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git

# 6. Sube los archivos
git branch -M main
git push -u origin main
```

### Activar GitHub Pages por CLI (opcional)

Si tienes [GitHub CLI](https://cli.github.com/) instalado:

```bash
gh repo create tm-microbit-app --public --source=. --push
gh repo edit --enable-pages --pages-branch main
```

---

## ⚙️ Configuración adicional (Opcional)

### Personalizar el dominio
1. Ve a Settings → Pages
2. En "Custom domain" ingresa tu dominio
3. Sigue las instrucciones de configuración DNS

### Agregar iconos PWA
Para crear iconos reales (en lugar del placeholder SVG):

1. Crea un ícono de 512x512px
2. Usa una herramienta como [RealFaviconGenerator](https://realfavicongenerator.net/)
3. Descarga los iconos generados
4. Reemplaza `assets/icon-192.png` y `assets/icon-512.png`

---

## 🔄 Actualizar la app después

Cuando hagas cambios:

### Por interfaz web:
1. Ve a tu repositorio en GitHub
2. Navega al archivo que quieres editar
3. Haz clic en el ícono del lápiz ✏️
4. Edita y haz commit

### Por línea de comandos:
```bash
git add .
git commit -m "Descripción de los cambios"
git push
```

---

## 📱 Probar la app

1. Abre Chrome o Edge
2. Ve a tu URL de GitHub Pages
3. Acepta permisos de cámara
4. Carga tu modelo de Teachable Machine
5. ¡Disfruta!

---

## ❓ Problemas comunes

### "404 - Not Found"
- Espera 2-5 minutos después de activar Pages
- Verifica que el repositorio sea público
- Comprueba que los archivos estén en la raíz del repositorio

### "La app no carga"
- Verifica la consola del navegador (F12)
- Asegúrate de que todos los archivos se hayan subido correctamente
- Comprueba que las rutas en `index.html` sean correctas

### "Bluetooth no funciona"
- GitHub Pages usa HTTPS automáticamente ✅
- Usa Chrome o Edge (Firefox/Safari no soportan Web Bluetooth)
- Verifica permisos de Bluetooth en el navegador

---

¿Necesitas ayuda? Abre un [Issue](https://github.com/TU-USUARIO/TU-REPO/issues) 🙋‍♂️
