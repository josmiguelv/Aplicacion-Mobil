# Pollos B3 Android V11 — modalidades e integración de catálogo

Partiendo del prototipo V10 de WebView, esta versión modifica **solo** los recorridos de modalidad y ubicación, más el filtro de pagos necesario para que los tres recorridos sean coherentes. El resto de pantallas queda en demostración.

## Modalidades

Selector debajo del buscador del Inicio y en la pantalla de elección: **Pollo Delivery y Pide y Retira**. El cliente puede cambiar el modo después. El cambio invalida la cotización, local y pago previos, y avisa que se deben verificar los importes.

### Delivery (cálculo provisional dentro de Android)

El cliente elige una dirección completa. Android usa el geocodificador del dispositivo para obtener las coordenadas de la dirección, o el GPS cuando el usuario pulsa «Usar mi ubicación actual como destino». El geocodificador puede no devolver número de puerta, por lo que la dirección debe revisarse y completarse antes de continuar.

Android solicita **GET /api/v1/mobile/config?appId=...** para obtener locales, coordenadas, tarifas, radios de cobertura y horarios actuales publicados. A partir de esos datos, calcula con Haversine la **distancia en línea recta** a cada sede abierta, activa y habilitada para delivery. Excluye las que no tienen configuración válida o están fuera del radio; la sede elegible más cercana se asigna automáticamente, **sin selector manual**.

- `PER_KM`: kilómetros en línea recta × tarifa publicada, redondeado a céntimos.
- `FIXED`: importe fijo publicado, sin multiplicar por kilómetros. La cobertura se valida igualmente.
- `radiusKm = null`: cobertura sin límite publicado; una cifra indica el radio máximo.

**No se consulta `POST /api/v1/mobile/fulfillment/resolve`** en esta fase de prueba. La app actualiza el GET y calcula otra vez al abrir el carrito con destino, avanzar hacia el pago, ver el resumen y confirmar el pedido de prueba. Si una consulta falla, invalida la cotización anterior; si cambian la sede, los productos o el total, exige revisar el nuevo importe.

Los resultados son **estimados**, no kilómetros por carretera. **Un cliente Android no puede ser autoridad de precios o cobertura en producción**: al implementar pedidos y cobros reales, un servidor debe recalcular y validar el total, la disponibilidad y la tarifa antes de aceptar o cobrar un pedido. No se han creado pedidos ni cobros reales.

### Pide y Retira

Se muestran locales activos publicados, incluidos los cerrados por horario. Local cerrado o sin modalidad de recojo habilitada: visible pero no seleccionable. Sin fotografías. GPS opcional para kilómetros aproximados en línea recta; dirección manual conservada como referencia sin inventar coordenadas ni distancia.

## Integración

La API pública se configura al compilar Android con la propiedad Gradle `B3_API_BASE`, por ejemplo: `gradle :app:assembleDebug -PB3_API_BASE=https://api.ejemplo.com`. Esta URL es ilustrativa; no hay servicio desplegado en ese dominio. La WebView lee la URL HTTPS mediante `AndroidBridge.getApiBase()` sin introducir credenciales en el APK. La app consulta `GET /api/v1/mobile/config?appId=...` y calcula el delivery provisionalmente en el dispositivo, sin POST de fulfillment. El identificador Android se registra en la web con la empresa correspondiente. Sin backend sigue disponible la **demostración**, claramente indicada.

**Pagos reales y envío de pedidos no implementados**. Cuando hay una configuración publicada, el botón de confirmación **no crea órdenes** para evitar pedidos fantasma; solo se muestran los métodos de pago publicados para la sede; la confirmación genera una simulación local, no un pedido comercial.

Antes de pruebas comerciales: configurar app+tenant, subir carta real, habilitar locales y modalidades, verificar coordenadas/cobertura/tarifas, publicar métodos de pago, probar GPS y red, y conectar pasarela y API de pedidos.

Esta V11 WebView se incorpora a una rama separada de GitHub Android y no debe fusionarse simultáneamente con el PR #1 Compose. Se debe decidir la arquitectura Android definitiva y ejecutar CI/Android Studio antes de distribuir un APK.
## Regla obligatoria de fuente única

Toda información administrativa procede de la publicación de la web multiempresa. Si una tienda no tiene horarios informados para el día, Android **no muestra estado Abierto/Cerrado ni hora de cierre**. Cuando la API informa que está cerrada, el cliente puede verla pero no seleccionar un retiro inmediato. La API evalúa el horario en `America/Lima`. Nombres, direcciones, locales, fotos, ofertas y pagos no se inventan ni se incrustan en la app. Antes de la configuración publicada no se muestran locales ficticios.
