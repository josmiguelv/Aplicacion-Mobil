# Pollos B3 Android V11 — modalidades e integración de catálogo

Partiendo del prototipo V10 de WebView, esta versión modifica **solo** los recorridos de modalidad y ubicación, más el filtro de pagos necesario para que los tres recorridos sean coherentes. El resto de pantallas queda en demostración.

## Modalidades

Selector debajo del buscador del Inicio y en la pantalla de elección: **Pollo Delivery y Pide y Retira**. El cliente puede cambiar el modo después. El cambio invalida la cotización, local y pago previos, y avisa que se deben verificar los importes.

### Delivery

Pide permiso de GPS **solo al pulsar Usar mi ubicación actual**. Si el GPS está apagado se muestra aviso. Se puede escribir dirección y referencia manualmente, pero una dirección sin punto georreferenciado no autoriza asignación automática en la API actual. Con coordenadas verificadas, el servidor selecciona local activo, con modalidad delivery, tarifa y radio de cobertura publicados. Actualmente la selección se basa en distancia geográfica; tiempos/rutas reales requieren proveedor de rutas posterior. No se inventa costo ni tienda.

### Pide y Retira

Se muestran locales activos publicados, incluidos los cerrados por horario. Local cerrado o sin modalidad de recojo habilitada: visible pero no seleccionable. Sin fotografías. GPS opcional para kilómetros aproximados en línea recta; dirección manual conservada como referencia sin inventar coordenadas ni distancia.

## Integración

La API pública se configura al compilar Android con la propiedad Gradle `B3_API_BASE`, por ejemplo: `gradle :app:assembleDebug -PB3_API_BASE=https://api.ejemplo.com`. Esta URL es ilustrativa; no hay servicio desplegado en ese dominio. La WebView lee la URL HTTPS mediante `AndroidBridge.getApiBase()` sin introducir credenciales en el APK. Se consultan `GET /api/v1/mobile/config?appId=...` y `POST /api/v1/mobile/fulfillment/resolve`. El identificador Android se registra en la web con la empresa correspondiente. Sin backend sigue disponible la **demostración**, claramente indicada.

**Pagos reales y envío de pedidos no implementados**. Cuando hay una configuración publicada, el botón de confirmación **no crea órdenes** para evitar pedidos fantasma; los métodos habilitados solo sirven para validar el flujo hasta la pantalla de resumen.

Antes de pruebas comerciales: configurar app+tenant, subir carta real, habilitar locales y modalidades, verificar coordenadas/cobertura/tarifas, publicar métodos de pago, probar GPS y red, y conectar pasarela y API de pedidos.

Esta V11 WebView se incorpora a una rama separada de GitHub Android y no debe fusionarse simultáneamente con el PR #1 Compose. Se debe decidir la arquitectura Android definitiva y ejecutar CI/Android Studio antes de distribuir un APK.
## Regla obligatoria de fuente única

Toda información administrativa procede de la publicación de la web multiempresa. Si una tienda no tiene horarios informados para el día, Android **no muestra estado Abierto/Cerrado ni hora de cierre**. Cuando la API informa que está cerrada, el cliente puede verla pero no seleccionar un retiro inmediato. La API evalúa el horario en `America/Lima`. Nombres, direcciones, locales, fotos, ofertas y pagos no se inventan ni se incrustan en la app. Antes de la configuración publicada no se muestran locales ficticios.
