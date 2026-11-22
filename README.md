# Pollos B3 — Android V11 (WebView) · entrega de código fuente

Este es el desarrollo funcional basado en la V10 validada en el chat, **conservando sus pantallas**. Contiene el nuevo selector de modalidad en Inicio, dirección y GPS para delivery, selección de local para recojo/consumo, advertencia sobre disponibilidad de mesas, y métodos de pago filtrados por configuración de la web.

Esta rama de GitHub tiene una implementación Android WebView; **es diferente** de la rama Compose inicial (PR #1), que no debe fusionarse simultáneamente. Ver `README_V11_INTEGRATION.md` para API y limitaciones.

## Compilar

Abrir esta carpeta raíz en Android Studio con JDK 17, SDK 35, Gradle 8.11.1 y Android Gradle Plugin 8.7.3. Compilar `app:assembleDebug` o Build APK(s). **No se ha probado este APK en un dispositivo físico**.

## Conexión a la web

La app lee `API_BASE` desde `AndroidBridge.getApiBase()`; configura la URL HTTPS del servicio `Aplicacion-Web-Admin-Movil` antes de distribuir APK. La web publica productos, fotos, promociones, locales, cobertura, modalidades y métodos; Android consulta exclusivamente la versión publicada. No incluir claves privadas en el cliente.

**Importante:** todavía no existe endpoint de creación de pedidos ni pasarela de pagos. No se hacen pedidos comerciales ni cobros reales. Tampoco se garantiza mesa en el local. Los datos antiguos de demostración siguen referenciales cuando la API no está conectada.
## Favorite, tracking and feedback (feature pilot)

- **Inicio** displays a favorite order card only after a completed order has been explicitly saved as favorite. The app asks to replace an existing favorite when a different order is completed, and never changes it without confirmation. Reordering reloads current catalog products and proceeds through the normal fulfillment choice, checking delivery/pickup again. Favorite data persists only in the local device during this pilot.
- **Pedidos** is accessible to guests with local order history; it no longer forces demo sign-in. The detail shows RECEIVED → ACCEPTED → PREPARING → DISPATCH → DELIVERED as a purely visual five-step timeline. **Demo orders are prominently labeled and do not reflect staff processing.** Tests can advance their stage manually using the *Simular siguiente etapa* control; no staff or real delivery confirmation is fabricated.
- The timeline remains active for **less than 60 minutes from the recorded delivery timestamp**. From that point the order remains in history as delivered, with a summary instead of live stages.
- Upon the delivery event, the app prompts whether to save a different basket as the favorite; afterwards it can show an **optional and dismissible bottom-sheet satisfaction survey** (one to five stars, experience tags, optional 250-character comment). Closing it does not block navigation or mark the review as answered; the order detail offers a later rating opportunity.
- **No commercial order submission, backend order status events or feedback ingestion exist yet.** Demo ratings and demo favorite choices are kept only on the device. These UI behaviors must be wired to authenticated staff order status events, secure guest tracking capability and a real opinion endpoint when the ordering backend is built. Do not expose simulated tracking as real order events.

Focused verification: `node scripts/order-experience-smoke.mjs`, followed by `gradle :app:assembleDebug`. GitHub Actions runs both checks.


## Solicitud de aprobación de pedido por Delivery — FORM obligatorio (22/11/2026)

Exclusivamente en **Android Pollos B3**: después de crear una interacción mediante `POST /api/v1/mobile/interactions`, la solicitud de **aprobación comercial del pedido** se envía por `POST /api/v1/mobile/interactions/{interactionId}/message` con `type: "FORM"`. No existen bandera de activación, modo `TEXT` ni fallback en este flujo.

El formulario tiene exactamente **cinco** campos `variable`/`value`, conforme a la última especificación de auditoría: **Productos**, **Subtotal**, **Delivery** (`Por calcular`), **Total final** (`Pendiente de confirmación`) y **Dirección y referencia** (en un solo campo). Si no hay referencia, la última fila contiene solo la dirección. No incluye **Cliente** ni **Teléfono**: esos datos ya viajan en `customer` al crear la interacción.

Los campos de productos/precios son una representación de la carta publicada en el móvil, **no son autoridad para pagos**. El administrador debe recalcular desde su catálogo antes de validar un importe. La respuesta del asesor debe leerse desde los mensajes verificados `OUTBOUND`: `aceptar/acepto/aceptado/aceptada` equivale a `ACCEPTED`; `rechazar/rechazado/rechazada` a `REJECTED`. Que la interacción esté técnicamente `ACCEPTED` no implica que el pedido haya sido aprobado. El cierre sin respuesta comercial es no confirmado.

**Alcance:** `FORM` se utiliza únicamente para solicitar aprobación del pedido de Delivery. Cancelaciones, seguimiento, cotizaciones, pagos y notificaciones no lo usan. La creación utiliza `Idempotency-Key` propio, mientras que el FORM utiliza **otra clave UUID persistente** y el `X-Order-Access-Key` original. Reintentos permitidos usan el mismo FORM y la misma clave. Tras HTTP 503, timeout o fallo de transporte incierto se **suspende el reenvío automático** hasta que el backend pueda confirmar si registró el FORM. Tras HTTP 400/409 o un HTTP 200 sin `type: "FORM"`, no se confirma entrega ni se reenvía automáticamente.

**Compilación estándar:** `.\gradlew.bat assembleDebug`. La URL predeterminada del administrador es `https://back-neutral-rogers-switched.trycloudflare.com`; `-PB3_API_BASE=...` puede sobrescribirla. Se retiró `B3_ORDER_FORM_ENABLED`.

**Dependencia externa conocida:** la última implementación del administrador revisada todavía valida el cuerpo antiguo del endpoint `/message` y puede rechazar un `FORM`. No se ha modificado el administrador ni TU VERSO en este cambio. Hasta verificar compatibilidad en el administrador, no afirmar entrega real del FORM ni botones renderizados.

### Auditoría focal FORM vs TEXT

- Pruebas sin red ni datos productivos: `node --test scripts/order-form-audit-focus.test.mjs`. Son cuatro escenarios: FORM con cinco variables, rechazo de seis, respuesta TEXT no aceptada como FORM y reintento idempotente del mismo FORM.
- Metadatos no sensibles por `adb logcat -s B3FormAudit`: `JS_BUILD`, `NATIVE_VALIDATED`, `HTTP_OUTBOUND`, `HTTP_BODY_WRITTEN`, `HTTP_RESPONSE`, `JS_RESPONSE`, `LOCAL_REJECT` y `TRANSPORT_ERROR`. Nunca se registran UUID, claves, nombres, números, direcciones ni cuerpo JSON.
- El puente distingue `LOCAL_CONTRACT_REJECTED` (no salió HTTP) de respuestas HTTP reales. Para marcar `messageDelivered=true`, el Administrador debe responder HTTP 200 con `interactionId` correcto, `messageId` UUID, `delivered: true` y `type: "FORM"`.
- **Bloqueo externo sin resolver en Android:** el contrato revisado del Administrador `server/mobile-tuverso-routes.mjs` todavía exige el cuerpo legado en `/message`, rechaza `type/form` con HTTP 400 y su integración `server/tuverso-mobile-connector.mjs` solo transmite `{text}` a TU VERSO. No se modifica el servidor aquí. La compilación Android correcta NO demuestra registro de FORM en TU VERSO.
