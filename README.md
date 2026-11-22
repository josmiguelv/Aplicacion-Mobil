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


## Ticket de pedido FORM (Android, 22/11/2026)

El flujo conserva la creación de la interacción mediante `POST /api/v1/mobile/interactions` y utiliza el endpoint ya existente `POST /api/v1/mobile/interactions/{interactionId}/message` para el detalle.

El nuevo cuerpo opcional tiene exclusivamente `type: FORM`, `appId`, `storeId` y `form`, que contiene título `VALIDACIÓN DE PEDIDO`, subtítulo `Confirmar disponibilidad para delivery` y campos ordenados `Productos`, `Subtotal`, `Delivery`, `Total final`, `Dirección` y `Referencia` (esta última solo si existe). **No se repiten Cliente ni Teléfono**: la identidad se envía previamente dentro de `customer` en la creación de la interacción.

Las líneas de productos y subtotal se derivan de productos publicados y cantidades del carrito. Son una **vista informativa del catálogo del móvil**: el administrador debe recalcular importes desde su catálogo autorizado, y el costo de Delivery y total final permanecen pendientes de confirmación.

**Compatibilidad:** la versión del administrador revisada todavía rechaza `FORM` en el endpoint `/message`, así que Android mantiene el formato anterior por defecto. El FORM se activa solo para pruebas con un administrador compatible:

```powershell
.\gradlew.bat assembleDebug -PB3_ORDER_FORM_ENABLED=true
```

La compilación estándar `./gradlew assembleDebug` conserva el formato anterior; `B3_ORDER_FORM_ENABLED` vale `false` por defecto. `B3_API_BASE` sigue pudiendo sobrescribirse por Gradle. URL configurada predeterminada: `https://back-neutral-rogers-switched.trycloudflare.com`.

El formato se fija al preparar una nueva interacción; los reintentos mantienen el mismo interactionId, token de seguimiento y ticket. No se habilita un FORM a mitad de una interacción existente. Hasta actualizar y certificar el administrador, no se puede confirmar el renderizado del formulario ni los botones de decisión de TU VERSO.
