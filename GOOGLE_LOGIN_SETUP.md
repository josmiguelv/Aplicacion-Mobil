# Google Login — Pollos B3 Android (23/11/2026)

## Estado y alcance

El botón **Continuar con Google** usa Credential Manager nativo para obtener un Google ID token, que se canjea y verifica mediante **Firebase Authentication**. La WebView únicamente recibe UID, nombre y correo verificado del usuario tras el éxito de Firebase; los tokens nunca se envían al JavaScript ni a la API de pedidos.

Se retiraron los botones de Facebook y correo manual. El acceso por celular sigue marcado como **demostración sin OTP**; el acceso como invitado permanece. Los pedidos y datos del perfil siguen locales o bajo sus contratos preexistentes; **Google Login no añade autorización al backend del Administrador ni vinculación de historial remoto**. No afirmar lo contrario.

## Configuración externa obligatoria (acción del propietario)

Existe un Firebase de Pollos B3 en `app/google-services.json` con proyecto `pollosb3-84297` y paquete `com.integrab2g.pollosb3`, pero su versión actual **no contiene clientes OAuth Google**, así que todavía **no se puede certificar un inicio de sesión real**.

1. Abrir https://console.firebase.google.com/ → proyecto `pollosb3-84297` (si se tiene acceso).
2. Authentication → Sign-in method → habilitar **Google** y configurar el correo de soporte que corresponda.
3. Configuración del proyecto → Tus apps → Android `com.integrab2g.pollosb3`. Añadir SHA-1 del certificado **debug** usado para pruebas y del certificado **release** que se utilice para distribuir APK. Para SHA-1 local: `gradlew signingReport` (no compartir keystores ni contraseñas).
4. Descargar la versión actualizada de `google-services.json` y reemplazar `app/google-services.json` en la copia local de Android. Debe contener los clientes OAuth correctos.
5. Copiar `.env.example` a `.env`, mantener `B3_API_BASE` real y añadir `B3_GOOGLE_WEB_CLIENT_ID=XXXXXXXX-XXXXX.apps.googleusercontent.com` usando el **OAuth 2.0 client ID de tipo Aplicación web**, no el identificador Android ni un client secret.
6. Compilar con `gradlew :app:assembleDebug`, instalar la APK y comprobar: seleccionar cuenta Google, sesión verificada, cierre de sesión, volver a abrir la app y cambiar de cuenta. La APK de GitHub Actions no tendrá habilitado Google hasta que el flujo CI reciba una configuración pública válida.
7. No publicar como autenticación productiva sin aprobar una política de privacidad de Pollos B3 que detalle el tratamiento de datos por Firebase/Google y el procedimiento para eliminar cuentas.

La compilación **no falla** cuando `B3_GOOGLE_WEB_CLIENT_ID` está vacío, pero la autenticación muestra claramente que falta configuración. Nunca se convierte en un login simulado.

## Seguridad y límites

- El OAuth client ID **Web** no es secreto; jamás introducir un client secret, service-account JSON ni tokens privados en Gradle, Git, WebView o archivos de configuración compartidos.
- Firebase Authentication persiste una sesión segura en Android. Al volver a abrir la app, Android fuerza la validación del token; WebView no puede validar una sesión de Google solo con localStorage.
- `uid` y `email` son metadatos de visualización local: no conceden permisos a APIs ni sustituyen la autenticación server-to-server.
- El teléfono ingresado en pedidos **no** queda verificado por Google; mantener su confirmación por pedido.
- No modifica TU VERSO, Administrador Web, WhatsApp ni los contratos de pedidos.
