# Pollos B3 — Android App Links /abrir

**URL única para TU VERSO / WhatsApp:** https://app.integra-b2g.com/abrir

**Estado:** código Android y carpeta de hosting preparados; NO publicados ni verificados en dominio real. No modificar TU VERSO en esta intervención.

## Alcance

La rama V11 vigente es una app Android **Java + WebView**, no Compose. El applicationId real sigue siendo \`com.integrab2g.pollosb3\`. La URL exacta \`https://app.integra-b2g.com/abrir\` se declara en el Manifest con HTTPS, host y path estrictos, y \`android:autoVerify="true"\`. \`MainActivity\` utiliza \`singleTask\` para reutilizar la actividad raíz; \`onCreate\` guarda la intención entrante y espera a que el WebView termine de cargar; \`onNewIntent\` atiende enlaces con la app ya abierta. Solo invoca el callback \`window.b3OpenFromLink()\` sobre la SPA existente, que navega a \`Inicio\` sin iniciar login ni crear nuevas pantallas. El splash normal permanece sin alteraciones para accesos que **no** procedan del enlace.

Importante: la redirección automática entre una URL pulsada dentro del navegador integrado de WhatsApp y la app depende de la configuración de Android/WhatsApp. No se garantiza para todos los dispositivos o WebViews.

## A. Configurar dominio, DNS, HTTPS y hosting (sin ejecutar aún)

1. En el proveedor DNS real de \`integra-b2g.com\`, **identificar antes** el servidor que alojará exclusivamente \`app.integra-b2g.com\`; no asumir que el sitio principal usa el mismo hosting. Respaldar cualquier registro existente del host \`app\`. Si ya hay un registro válido o servicio activo, reconciliarlo antes de cambiar DNS.
2. En el panel de hosting elegido (por ejemplo cPanel si el servidor autorizado lo utiliza), crear **solo** el subdominio \`app.integra-b2g.com\`. Establecer como raíz de documentos la carpeta que contendrá los archivos de \`app-links/site/\` (no un subdirectorio extra). Evitar que el dominio sirva una página de bienvenida distinta.
3. En DNS, crear/actualizar el registro del host **app** de tipo A hacia **la IPv4 que entregue ese hosting**, o CNAME hacia **el hostname que el hosting haya indicado** (no ambos simultáneamente para el mismo host). No inventar IP ni destino. Esperar la resolución DNS; verificar con \`nslookup app.integra-b2g.com\` o \`dig app.integra-b2g.com\`.
4. Habilitar un certificado TLS válido para \`app.integra-b2g.com\` usando el mecanismo que ofrezca el hosting (AutoSSL, Let's Encrypt o certificado administrado). Comprobar cadena completa y que el nombre del host coincide. No deshabilitar la validación de HTTPS.
5. Subir **el contenido** de \`app-links/site/\` a la raíz del subdominio, conservando los archivos ocultos \`.htaccess\` y \`.well-known/assetlinks.json\`. En Apache el \`.htaccess\` incluido sirve \`/abrir\` directamente desde \`index.html\` sin añadir una barra ni redirigir. Si se utiliza Nginx/CDN/otro proveedor, configurar equivalente solo para \`/abrir\` y servir \`/.well-known/assetlinks.json\` como archivo estático, sin reescrituras.
6. **No publicar el archivo \`assetlinks.json\` sin primero agregar las huellas reales de firma** (sección B). El archivo en GitHub tiene \`sha256_cert_fingerprints: []\` a propósito: no inventa certificados y **no permite verificación hasta completarse**.
7. Verificar HTTP y contenido (sin redirecciones, HTTP 200):
   \`\`\`bash
   curl -i https://app.integra-b2g.com/abrir
   curl -i https://app.integra-b2g.com/.well-known/assetlinks.json
   \`\`\`
   La URL del archivo JSON debe responder directamente **200**, \`Content-Type: application/json\` y JSON válido **sin redirección 301/302/307/308**, ni autentificación ni página HTML de error. La página \`/abrir\` debe responder **200 HTML**, sin bucle de redirección.
8. La página de respaldo **no** realiza auto-redirect a la app, ni utiliza enlaces \`intent://\` ni inventa descarga. Al publicarse en Google Play, y **solo tras confirmar su enlace real**, reemplazar \`OFFICIAL_GOOGLE_PLAY_URL = ''\` en \`app-links/site/index.html\` con la URL HTTPS real a \`https://play.google.com/store/apps/details?id=com.integrab2g.pollosb3\` (sin agregar otros parámetros de tracking ni suponer publicación).

## B. Certificados y \`assetlinks.json\`

Archivo: \`app-links/site/.well-known/assetlinks.json\`.

Contiene el package real, la relación \`delegate_permission/common.handle_all_urls\` y una lista de firmas **pendiente**. Para un APK de prueba firmado localmente, extraer su SHA-256:

\`\`\`bash
# Android SDK, apksigner (recomendado):
apksigner verify --print-certs /ruta/real/pollos-b3.apk
# O con el almacén real de firma (sustituir ruta/alias):
keytool -list -v -keystore /ruta/real/mi-release-keystore.jks -alias MI_ALIAS
\`\`\`

Alternativa para el keystore de **debug local** en la máquina Android (no representa la firma final):
\`\`\`bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
\`\`\`
En Windows, reemplazar \`~/.android/debug.keystore\` por \`%USERPROFILE%\.android\debug.keystore\` en CMD o \`$env:USERPROFILE\.android\debug.keystore\` en PowerShell.

Si se usa **Google Play App Signing**, obtener **App signing key certificate → SHA-256** en Google Play Console: **Test and release / App integrity / App signing** (los nombres exactos pueden variar con la interfaz). La firma de la clave de subida y la firma de distribución de Google Play **pueden ser distintas**; el dominio debe incluir la **huella de la firma instalada por Play**. Para pruebas con APK local debug, puede incluirse también esa firma en una segunda entrada si se desea, y retirarla al pasar a producción si ya no hace falta.

Editar el archivo con valores reales, sin usar secretos en el repositorio:
\`\`\`bash
node scripts/configure-b3-app-links.mjs "SHA-256-REAL-COPIADO-DEL-CERTIFICADO" ["OTRA-SHA256-SI-APLICA"]
node scripts/app-links-smoke.mjs
\`\`\`
El script valida la longitud y normaliza a pares hexadecimales en mayúsculas separados por \`:\`. Solo imprime número de huellas; **no** recupera certificados, no fabrica huellas ni modifica el dominio. No publicar hasta que esté completo y se corresponda con la APK realmente distribuida.

## C. Pruebas focalizadas

**Sin dominio aún publicado:** \`node scripts/app-links-smoke.mjs\` verifica la declaración de Manifest, callback Android/WebView, ruta exacta, fallback y estructura JSON; \`node --check app/src/main/assets/app.js\` verifica sintaxis; \`gradle :app:assembleDebug\` valida compilación. Son **pruebas estructurales**, no una prueba Android real.

**Con dominio, JSON real y APK firmada en un teléfono de prueba**, antes de probar es conveniente no desinstalar la aplicación del usuario si contiene datos personales o pedidos locales. Usar dispositivo/emulador de pruebas preparado:

\`\`\`bash
# Android 12+; forzar verificación del dominio ya publicado:
adb shell pm verify-app-links --re-verify com.integrab2g.pollosb3
adb shell pm get-app-links com.integrab2g.pollosb3
# Debe aparecer app.integra-b2g.com: verified

# Caso app cerrada:
adb shell am force-stop com.integrab2g.pollosb3
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://app.integra-b2g.com/abrir"

# Caso app abierta/en segundo plano: abrirla, pulsar HOME y ejecutar de nuevo:
adb shell input keyevent KEYCODE_HOME
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://app.integra-b2g.com/abrir"

# Para verificar solo el callback interno (NO prueba verificación del dominio):
adb shell am start -a android.intent.action.VIEW -d "https://app.integra-b2g.com/abrir" -p com.integrab2g.pollosb3
\`\`\`

**Sin app instalada:** comprobar la URL en Chrome y navegador integrado WhatsApp; debe abrir la página de respaldo, mostrar el estado de publicación y **no** ofrecer APK ni Play Store inexistente. No ejecutar un \`adb uninstall\` destructivo en el teléfono principal de un usuario.

**WhatsApp real:** enviar exactamente \`https://app.integra-b2g.com/abrir\` desde un entorno autorizado de prueba, abrir el enlace con y sin aplicación instalada; si el navegador interno no transfiere el enlace a Android, la web ofrece instrucciones para abrir en navegador externo. No atribuir a TU VERSO funciones ni cambios no implementados.

## D. Criterio GO

- Servidor DNS/HTTPS configurado y los dos endpoints accesibles con el tipo de contenido correcto.
- \`assetlinks.json\` con huella de la firma correspondiente y dominio verificado desde Android.
- Apertura real de la app cerrada, abierta y en segundo plano confirmada en dispositivo.
- Sin app instalada, fallback comprobado en navegador móvil.
- Prueba WhatsApp real cuando exista entorno apto.

Antes de completar la lista, el estado es **PREPARADO / NO-GO**. No se modificó ni desplegó TU VERSO, ni se publicó nada en Google Play.
