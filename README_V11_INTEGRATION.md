# Pollos B3 Android V11 — modalidades e integración de catálogo

Partiendo del prototipo V10 de WebView, esta versión modifica **solo** los recorridos de modalidad y ubicación, más el filtro de pagos necesario para que los tres recorridos sean coherentes. El resto de pantallas queda en demostración.

## Modalidades

Selector debajo del buscador del Inicio y en la pantalla de elección: **Delivery, Recojo en tienda, Comer en tienda**. El cliente puede cambiar el modo después. El cambio invalida la cotización, local y pago previos, y avisa que se deben verificar los importes.

### Delivery

Pide permiso de GPS **solo al pulsar Usar mi ubicación actual**. Si el GPS está apagado se muestra aviso. Se puede escribir dirección y referencia manualmente, pero una dirección sin punto georreferenciado no autoriza asignación automática en la API actual. Con coordenadas verificadas, el servidor selecciona local activo, con modalidad delivery, tarifa y radio de cobertura publicados. Actualmente la selección se basa en distancia geográfica; tiempos/rutas reales requieren proveedor de rutas posterior. No se inventa costo ni tienda.

### Recojo y Comer en tienda

Se listan únicamente locales habilitados en configuración publicada. En tienda se muestra: **"La disponibilidad de mesas depende de la concurrencia del local al momento de tu llegada. Este pedido no reserva una mesa."** No existe NFC, QR, mesa ni reserva.

## Integración

El archivo `app/src/main/assets/app.js` incluye `const API_BASE=''`. Al desplegar la API web, cambia exclusivamente esa constante por la URL HTTPS del servidor publicado, sin barra final. Se consultan `GET /api/v1/mobile/config?appId=...` y `POST /api/v1/mobile/fulfillment/resolve`. El identificador Android se registra en la web con la empresa correspondiente. Sin backend sigue disponible la **demostración**, claramente indicada.

**Pagos reales y envío de pedidos no implementados**. Cuando hay una configuración publicada, el botón de confirmación **no crea órdenes** para evitar pedidos fantasma; los métodos habilitados solo sirven para validar el flujo hasta la pantalla de resumen.

Antes de pruebas comerciales: configurar app+tenant, subir carta real, habilitar locales y modalidades, verificar coordenadas/cobertura/tarifas, publicar métodos de pago, probar GPS y red, y conectar pasarela y API de pedidos.

Esta V11 WebView se incorpora a una rama separada de GitHub Android y no debe fusionarse simultáneamente con el PR #1 Compose. Se debe decidir la arquitectura Android definitiva y ejecutar CI/Android Studio antes de distribuir un APK.