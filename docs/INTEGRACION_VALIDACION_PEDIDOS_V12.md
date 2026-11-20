# Pollos B3 Android — integración API de validación de pedidos (V12 / Fase 2)

**Repositorio:** `josmiguelv/Aplicacion-Mobil`  
**Rama:** `feat/pollos-b3-v12-order-availability-api-20261120`  
**Alcance:** únicamente la aplicación Android Pollos B3; sin cambios en TU VERSO ni en el Administrador.

## 1. Fuente de verdad y arquitectura

La app Android consulta el catálogo publicado del Administrador: `GET /api/v1/mobile/config?appId=com.integrab2g.pollosb3`.

Para cada delivery, **sin importar el valor del interruptor `consultOrderAvailability`**, la app envía la solicitud al Administrador:

`POST /api/v1/mobile/orders/availability`  
`GET /api/v1/mobile/orders/availability/{validationId}`.

El Administrador es la única autoridad para determinar productos, subtotal, horarios, cobertura, orden de evaluación de sedes, distancia por carretera, delivery, método de pago y aceptación. Una sede con `consultOrderAvailability=false` no requiere interacciones con TU VERSO; cuando el indicador es `true`, el Administrador usa internamente sus credenciales S2S y consulta la aceptación. Android jamás hace llamadas directas a `/api/v1/interactions` ni `/api/v1/queues/availability`.

## 2. Archivos de integración

| Archivo | Función |
|---|---|
| `app/src/main/assets/order-availability.js` | Identidad seudónima, token aleatorio, clave UUID, POST/GET, recuperación con idempotencia, manejo de errores |
| `app/src/main/java/com/integrab2g/pollosb3/MainActivity.java` | Pasarela HTTPS nativa de rutas fijas; evita depender de CORS de WebView; no admite URL arbitraria |
| `app/src/main/assets/index.html` | Carga el nuevo módulo antes de `app.js` |
| `app/src/main/assets/app.js` | Inicio de validación, polling, aprobación, cuota del servidor y bloqueo de pago cuando falla |
| `scripts/order-availability-api.test.mjs` | Pruebas contractuales sintéticas, sin conversaciones reales |
| `.github/workflows/availability-apk-v12.yml` | Ejecuta pruebas y compila APK de depuración |

## 3. Datos enviados y seguridad

La app envía `appId`, `validationToken`, `customerExternalId`, `items` con `productId` UUID y `quantity`, y `address/district/city/country`. Las coordenadas `latitude/longitude` y `useGps=true` solo se envían cuando corresponden a un GPS confirmado por el usuario.

- `validationToken`: 32 bytes aleatorios CSPRNG, `ordv1_` + 43 caracteres base64url.
- `Idempotency-Key`: UUID v4 aleatorio; se conserva para reintentar una misma solicitud después de un timeout incierto.
- `customerExternalId`: identificador local aleatorio seudónimo; no incluye DNI, celular, correo ni otros datos sensibles.
- Token, solicitud e idempotencia se conservan en `sessionStorage` de la WebView. No se escriben en logs ni en el `localStorage` del perfil.
- La app **no** envía `tenantId`, `storeId`, `externalLocationId`, cola, tarifa ni total.
- El Java nativo selecciona exclusivamente el endpoint fijo del Administrador y rechaza redirecciones HTTP.
- `B3_API_BASE` debe ser una URL HTTPS del backend del Administrador, accesible desde el teléfono. No debe ser la API S2S de TU VERSO ni contener secretos.

## 4. Estados

| Respuesta del Administrador | Comportamiento de Android |
|---|---|
| `CHECKING_STORES` | Indica consulta de sedes; sigue consultando |
| `WAITING_APPROVAL` | Indica revisión real del asesor; no anticipa aprobación |
| `CREATE_UNCERTAIN` | Reconsulta la misma operación, sin duplicar |
| `READY_FOR_PAYMENT` | Usa sede, tarifa, total y métodos devueltos por el servidor |
| `UNAVAILABLE` | Bloquea avance y muestra que no hay sede disponible |
| `VALIDATION_ERROR` | Bloquea avance y muestra error |
| `CANCELLED` | Bloquea avance |

Las respuestas HTTP 200/202 se procesan sin inferir aceptación; 400/401/404/409/422/429/500/503 se tratan como errores y **nunca** se convierten en un estado aprobado. El polling es incremental y acotado; si vence su presupuesto, la interfaz permite **volver a comprobar la misma validación**. Si el usuario cambia carrito, dirección o modalidad, se invalida la validación y se inicia otra únicamente al volver a solicitarla.

## 5. Barreras y límites funcionales

1. La WebView **no cotiza comercialmente desde Haversine**: cualquier ruta de delivery exige el POST de validación del Administrador y una cotización de servidor.
2. Solo productos publicados con UUID y cantidades válidas pueden enviarse a las APIs. Los productos y ofertas demostrativos no generan validaciones.
3. `READY_FOR_PAYMENT` **no es una orden confirmada**, ni reserva inventario, ni cobra Yape, Plin, efectivo o tarjeta.
4. El botón final permanece como **pedido de prueba local**, hasta desarrollar/publicar el contrato independiente de pedido definitivo y pagos.
5. La modalidad **Pide y Retira** y su flujo previo no se alteran por esta integración de delivery.
6. El servicio del Administrador debe estar operativo, con migración 006 y configuración por tenant, app y sede, catálogo publicado y credenciales TU VERSO apropiadas cuando proceda.
7. No se certificó E2E real contra un Administrador migrado ni TU VERSO; las pruebas disponibles son sintéticas y de compilación.
8. La URL Cloudflare de ejemplo incluida antes en la configuración Gradle no constituye un backend de producción; configurar una URL HTTPS real antes de instalar para pruebas conectadas.

## 6. Compilar y probar (PowerShell, repositorio de la app móvil)

```powershell
git fetch origin
git switch feat/pollos-b3-v12-order-availability-api-20261120
git pull --ff-only origin feat/pollos-b3-v12-order-availability-api-20261120
node --check app/src/main/assets/app.js
node --check app/src/main/assets/order-availability.js
node --test scripts/checkout-delivery-contract.test.mjs scripts/delivery-availability-v12.test.mjs scripts/order-availability-api.test.mjs
.\gradlew.bat :app:assembleDebug -PB3_API_BASE=https://TU_BACKEND_ADMIN_HTTPS
```

No ejecutar la app en producción con un túnel temporal o URL ilustrativa. La API del Administrador debe estar levantada y accesible desde Android, no solo desde `localhost` del equipo de desarrollo.

## 7. Pruebas E2E pendientes para habilitar producción

- Tenant y app ID vinculados, catálogo publicado, disponibilidad configurada por sede.
- Local con consulta deshabilitada: respuesta `READY_FOR_PAYMENT` sin interacción TU VERSO.
- Local con consulta habilitada: `WAITING_APPROVAL` y aceptación real, resultando `READY_FOR_PAYMENT`.
- Rechazo real y avance a sede siguiente **solo por el servidor**.
- Ausencia de asesores, expiración, cierre de sede, error de geocodificación, timeout de red y 429.
- Coherencia centavo a centavo entre catálogo, `subtotal`, `deliveryFee` y `total`.
- Comportamiento tras pérdida de conexión y regreso a la app.
- Pruebas físicas Android 24–35 (permisos, reanudación, doble toque, navegación).
- Backend adicional para creación de pedido definitivo, pagos y estados del pedido: fuera del contrato de disponibilidad actual.

## 8. Control de cambios

La implementación se desarrolla en rama separada basada en `6b30ef7468194075e4580223e267c15bcd5d7552`. No se cambia ninguna base de datos, infraestructura, rama `main` ni ningún otro repositorio. La aprobación y despliegue dependen de revisión y pruebas finales.
