# Pollos B3 — Android V11 (WebView) · entrega de código fuente

Este es el desarrollo funcional basado en la V10 validada en el chat, **conservando sus pantallas**. Contiene el nuevo selector de modalidad en Inicio, dirección y GPS para delivery, selección de local para recojo/consumo, advertencia sobre disponibilidad de mesas, y métodos de pago filtrados por configuración de la web.

Esta rama de GitHub tiene una implementación Android WebView; **es diferente** de la rama Compose inicial (PR #1), que no debe fusionarse simultáneamente. Ver `README_V11_INTEGRATION.md` para API y limitaciones.

## Compilar

Abrir esta carpeta raíz en Android Studio con JDK 17, SDK 35, Gradle 8.11.1 y Android Gradle Plugin 8.7.3. Compilar `app:assembleDebug` o Build APK(s). **No se ha probado este APK en un dispositivo físico**.

## Conexión a la web

`app/src/main/assets/app.js` contiene `API_BASE=''`. Configura allí la URL HTTPS del servicio `Aplicacion-Web-Admin-Movil` antes de distribuir APK. La web publica productos, fotos, promociones, locales, cobertura, modalidades y métodos; Android consulta exclusivamente la versión publicada. No incluir claves privadas en el cliente.

**Importante:** todavía no existe endpoint de creación de pedidos ni pasarela de pagos. No se hacen pedidos comerciales ni cobros reales. Tampoco se garantiza mesa en el local. Los datos antiguos de demostración siguen referenciales cuando la API no está conectada.