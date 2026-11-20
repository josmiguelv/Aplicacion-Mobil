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

Android muestra los locales publicados, sus direcciones y el estado abierto/cerrado, con horarios obtenidos de la API. Las sedes cerradas, no habilitadas para recojo o sin horario confirmado pueden visualizarse, pero no seleccionarse para retiro inmediato. El GPS es opcional para mostrar kilómetros aproximados en línea recta; no se necesita ubicación para seleccionar una sede de recojo.

**Al seleccionar una sede** (desde Inicio, la ventana de modalidad o la lista de locales), Android realiza un **GET actualizado** de configuración y comprueba `active`, `pickup_enabled`, `hoursConfigured` e `isOpen`. Si dejó de estar disponible, mantiene al cliente en la selección de sedes. Si está disponible, muestra su detalle, continúa a la carta o abre el carrito si ya tiene productos. Al continuar desde el detalle se vuelve a verificar la sede; desde el checkout se avanza a los datos del cliente.

**No hay cargo de delivery ni consulta POST de fulfillment para recojo.** El total equivale al subtotal de los productos. Al entrar al carrito, avanzar hacia el pago, ver el resumen y confirmar, se consulta de nuevo el GET para detectar cambios de horarios, catálogo y sede. Si no se puede verificar la disponibilidad, no se acepta la confirmación.

Los **medios de pago** provienen exclusivamente de `paymentMethods.pickup` de la sede publicada. Si la lista está vacía, Android avisa desde la selección de locales y bloquea el pago. No habilita Yape, Plin, tarjeta ni efectivo sin que estén configurados por la administración. La finalización continúa siendo una **simulación local**: no transmite un pedido ni realiza cobros reales.

## Integración

La API pública se configura al compilar Android con la propiedad Gradle `B3_API_BASE`, por ejemplo: `gradle :app:assembleDebug -PB3_API_BASE=https://api.ejemplo.com`. Esta URL es ilustrativa; no hay servicio desplegado en ese dominio. La WebView lee la URL HTTPS mediante `AndroidBridge.getApiBase()` sin introducir credenciales en el APK. La app consulta `GET /api/v1/mobile/config?appId=...` y calcula el delivery provisionalmente en el dispositivo, sin POST de fulfillment. El identificador Android se registra en la web con la empresa correspondiente. Sin backend sigue disponible la **demostración**, claramente indicada.

**Pagos reales y envío de pedidos no implementados**. Cuando hay una configuración publicada, el botón de confirmación **no crea órdenes** para evitar pedidos fantasma; solo se muestran los métodos de pago publicados para la sede; la confirmación genera una simulación local, no un pedido comercial.

Antes de pruebas comerciales: configurar app+tenant, subir carta real, habilitar locales y modalidades, verificar coordenadas/cobertura/tarifas, publicar métodos de pago, probar GPS y red, y conectar pasarela y API de pedidos.

Esta V11 WebView se incorpora a una rama separada de GitHub Android y no debe fusionarse simultáneamente con el PR #1 Compose. Se debe decidir la arquitectura Android definitiva y ejecutar CI/Android Studio antes de distribuir un APK.
## Regla obligatoria de fuente única

Toda información administrativa procede de la publicación de la web multiempresa. Si una tienda no tiene horarios informados para el día, Android **no muestra estado Abierto/Cerrado ni hora de cierre**. Cuando la API informa que está cerrada, el cliente puede verla pero no seleccionar un retiro inmediato. La API evalúa el horario en `America/Lima`. Nombres, direcciones, locales, fotos, ofertas y pagos no se inventan ni se incrustan en la app. Antes de la configuración publicada no se muestran locales ficticios.


## Fase 1 V12 — Consultar disponibilidad antes de cotizar el reparto (19/11/2026)

Esta rama añade el paso `Carrito/subtotal → Dirección → Consultar disponibilidad` para la modalidad delivery, sin cambiar la modalidad Pide y Retira. La aplicación lee la regla publicada por sede `consultOrderAvailability` (con `consult_order_availability` como respaldo); un campo ausente/incorrecto no se interpreta como `false`.

- Android revalida el catálogo y ordena sedes activas, abiertas, habilitadas para delivery y dentro del radio de cobertura estimado, descartando coordenadas o tarifas inválidas. Todavía usa distancia Haversine aproximada únicamente en el piloto; la verificación definitiva por carretera corresponde al backend comercial.
- Si la primera sede elegible publica `false`, Android no contacta TU VERSO, puede calcular su tarifa **provisional** y muestra un resumen con subtotal, delivery y total estimado. El cliente debe pulsar «Continuar» para ingresar sus datos y avanzar.
- Si publica `true`, la pantalla indica que necesita aprobación. **No solicita ni simula ACCEPTED, no calcula ni muestra tarifa final, no prueba otra sede por su cuenta y no permite avanzar al pago.** El siguiente paso real requiere la API privada del backend comercial para crear/persistir la interacción y recuperar decisiones.
- Si falta el campo, no hay cobertura o falla el GET, se muestra error sin reusar una cotización vieja. Los cambios de carrito, dirección, modalidad y revisión de catálogo invalidan selección/importe.
- La selección secuencial de sedes después de un rechazo verdadero y la cotización comercial de Google Routes forman parte de la **Fase 2**, no están implementadas aquí. El valor de esta fase es la UI premium, el filtro comercial local y la seguridad fail-closed para `true`.

**Importante:** la pantalla no debe presentarse como un pedido confirmado. Todos los pedidos de esta rama continúan siendo demostraciones locales, sin cobros, envío a sedes o interacción real en TU VERSO.

Pruebas focalizadas: `node --check app/src/main/assets/app.js` y `node --test scripts/checkout-delivery-contract.test.mjs scripts/delivery-availability-v12.test.mjs`. CI: `.github/workflows/checkout-delivery.yml`.

La conexión futura con el backend comercial deberá reutilizar la interfaz sin exponer bearer S2S en APK/WebView. Los estados PENDING, ACCEPTED, REJECTED, EXPIRED son decisiones del contrato de TU VERSO, no respuestas inventadas por Android.
