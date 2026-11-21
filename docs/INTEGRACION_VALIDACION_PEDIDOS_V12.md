# Pollos B3 Android — Integración de atención TU VERSO mediante Administrador

**Actualizado:** 20/11/2026  
**Repositorio intervenido:** `josmiguelv/Aplicacion-Mobil`  
**Rama:** `feat/pollos-b3-v12-order-availability-api-20261120`  
**Alcance:** Solo aplicación Android. No se modifica TU VERSO, Administrador Web, Railway ni PostgreSQL.

## 1. Contrato actual — APIs independientes

La app Android **no contacta TU VERSO directamente** ni conoce sus tokens. Todas las llamadas usan el puente nativo HTTPS de `MainActivity.java` al backend del Administrador, con origen fijo compilado.

1. `GET /api/v1/mobile/config?appId=com.integrab2g.pollosb3`: catálogo, sedes publicadas, horarios, modalidad delivery y opción `consultOrderAvailability`.
2. **Solo lectura**: `GET /api/v1/mobile/stores/{storeId}/agent-availability?appId=com.integrab2g.pollosb3`. Verifica la capacidad elegible en la cola autorizada de TU VERSO. `200 AVAILABLE` significa capacidad, **no reserva de asesor**. `200 UNAVAILABLE` bloquea la creación de interacción en esa sede.
3. `POST /api/v1/mobile/fulfillment/resolve`: cotización de delivery por el Administrador con `revision`, `storeId`, `deliveryFeePen` y medios de pago. El servidor puede devolver una sede diferente: **Android compara los UUID y NO crea interacción si difieren**.
4. `POST /api/v1/mobile/interactions`: crea la interacción **solo tras AVAILABLE y cotización coincidente**. Android envía `appId`, `storeId`, `quoteRevision`, `customerExternalId`, `items`, y encabezado `Idempotency-Key`. El backend vuelve a comprobar capacidad. No se envía `tenantId`, `queueId`, precios inventados ni credenciales S2S.
5. Respuesta `201/200` con `status=PENDING`: confirma únicamente la **creación de una solicitud pendiente**, no aprobación, envío de formulario estructurado, pago, pedido definitivo ni aceptación/rechazo.

La operación anterior `POST /api/v1/mobile/orders/availability` permanece implementada en el cliente legado para compatibilidad de código y tests, pero **el flujo de esta pantalla ya no la llama**.

## 2. Proceso de la pantalla «Consultar disponibilidad»

- Verifica dirección y obtiene su ubicación para ordenar **locales candidatos** publicados por cercanía, horario, cobertura y tarifa. La distancia en línea recta local es solo un filtro preliminar: el costo y cobertura vial definitivos pertenecen a `fulfillment/resolve`.
- Consulta `agent-availability` del local candidato. Si devuelve `UNAVAILABLE`, evalúa el siguiente candidato de la lista.
- Requiere la opción `consultOrderAvailability=true` en las sedes que se consultan; si no está publicada, muestra error de configuración, no presume disponibilidad.
- Antes de crear interacción, confirma **mismo local**, **misma revisión publicada** y productos con UUID publicados.
- Conserva la misma clave de idempotencia si un envío termina sin respuesta definitiva; una interacción `PENDING` guardada en el dispositivo impide crear una segunda por pulsar «Volver a comprobar».
- Durante `PENDING` muestra una espera de asesor, **sin autorizar checkout**, porque el Administrador aún **no expone una API móvil de lectura de decisión**. No hay sondeo falso ni aprobación automática.
- Cuando la operación falla por `409`, `429` o `503`, se muestra el error correspondiente; `health/ready` solo diagnostica el Administrador y **no demuestra disponibilidad de TU VERSO**.

## 3. Restricciones y pendientes críticos

**Todavía NO es un flujo E2E de pedido aceptado.** Para completarlo, fuera de Android se requiere:

1. Reiniciar el proceso local de Node del Administrador con su rama de APIs separadas. Esta versión Android puede usar la nueva ruta, pero no puede demostrar que el Windows donde corre el servidor ya ha cargado la nueva implementación.
2. Tenant activo, aplicación publicada, sede activa/abierta y `consultOrderAvailability=true` publicado.
3. Una integración TU VERSO autorizada por sede y propósito `ORDER_REQUEST`, con scopes `queue.availability.read` e `interactions.create`.
4. `TUVERSO_LIVE_CHECKS_ENABLED=true`; habilitar `TUVERSO_LIVE_REQUESTS_ENABLED=true` solo para una prueba controlada que pueda crear una interacción real en TU VERSO. No cambiar credenciales ni la clave `INTEGRATION_MASTER_KEY`.
5. **Cotización de la sede elegida**: el endpoint actual `fulfillment/resolve` para delivery elige automáticamente una sede. Si difiere de la consultada, Android se detiene correctamente. Para completar los casos de sedes alternativas se necesita que el backend cotice una sede concreta o entregue alternativas verificables.
6. **Decisión del asesor**: falta una API pública de consulta del estado final y su vínculo al móvil. `PENDING` no equivale a formulario visto, aceptado ni rechazado.
7. **Formulario**: `POST /interactions` envía un resumen de productos y subtotal, no un esquema de formulario arbitrario. La representación al asesor y botones de aceptación/rechazo deben verificarse mediante una prueba de TU VERSO independiente.
8. Pedido comercial definitivo, pagos y seguimiento siguen fuera del alcance y **no se simulan como aprobados**.

## 4. Seguridad Android

- `MainActivity.java` solo permite las rutas HTTPS de trabajo explícitamente codificadas; no recibe URL ni host arbitrario desde JS, y prohíbe redirecciones.
- Los secretos de TU VERSO no aparecen en la APK.
- `customerExternalId` es un identificador seudónimo, no nombre, DNI ni teléfono.
- `Idempotency-Key` se genera con CSPRNG y persiste con el intento lógico, incluidos timeouts de creación. Tras `PENDING`, el cliente no reenvía la interacción.
- El estado pendiente se guarda localmente para prevenir duplicados; limpiar los datos privados desde la propia aplicación borra también esa referencia. Sin una API para seguimiento/cancelación, el cliente no debe deducir el resultado tras un reinicio o cambio de pedido.
- `GET /health/live` y `GET /health/ready` no envían Authorization ni crean interacción.

## 5. Configuración de pruebas

Endpoint HTTPS temporal configurado en Gradle:

`https://live-proved-lot-theatre.trycloudflare.com`

Es un túnel temporal, **no un dominio de producción**. La presencia del endpoint en la APK no prueba conectividad ni despliegue del Administrador.

Comprobar rutas de solo lectura sin crear una solicitud:

```powershell
$api = "https://live-proved-lot-theatre.trycloudflare.com"
$appId = "com.integrab2g.pollosb3"
Invoke-RestMethod "$api/health/live"
Invoke-RestMethod "$api/health/ready"
$config = Invoke-RestMethod "$api/api/v1/mobile/config?appId=$appId"
$storeId = ($config.stores | Select-Object -First 1).id
Invoke-RestMethod "$api/api/v1/mobile/stores/$storeId/agent-availability?appId=$appId"
```

La disponibilidad devuelve HTTP 200 con `AVAILABLE` o `UNAVAILABLE`. HTTP 409 puede significar sede cerrada, configuración o vínculo no válido. HTTP 503 puede significar conexión S2S no habilitada o no verificable. **No hacer un POST de interacción para diagnosticar una conexión**: puede alcanzar a un asesor.

Actualizar Android desde GitHub:

```powershell
git fetch origin
git switch feat/pollos-b3-v12-order-availability-api-20261120
git pull --ff-only origin feat/pollos-b3-v12-order-availability-api-20261120
node --check app/src/main/assets/app.js
node --check app/src/main/assets/order-availability.js
node --test scripts/checkout-delivery-contract.test.mjs scripts/delivery-availability-v12.test.mjs scripts/order-availability-api.test.mjs scripts/order-availability-flow.test.mjs
.\gradlew.bat :app:assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`. La rama incorpora un workflow propio para pruebas y compilación V12.

## 6. Certificación pendiente

Las pruebas incluidas utilizan respuestas sintéticas de las nuevas APIs y aseguran el orden de llamadas, ausencia de interacciones cuando no hay capacidad, detección de sede distinta, cambios de revisión y conservación de idempotencia. **No constituyen evidencia E2E** de interacción recibida por TU VERSO ni aceptación real del asesor. No se han generado pedidos comerciales ni cobros.


## Fase previa al pago — rama feat/b3-prepayment-flow-20261120

El flujo de Android ahora es **sede elegible y capacidad → interacción PENDING → texto del agente → cotización de la sede aceptada → resumen de productos/delivery → pantalla de métodos de pago**. Un rechazo por texto `rechazado` o `rechazada` agrega la sede a una exclusión temporal y consulta automáticamente la siguiente sede elegible; agotadas las sedes, muestra una respuesta de no disponibilidad sin cobrar.

- El reconocimiento de decisión se realiza con `GET /api/v1/mobile/interactions/{interactionId}/status` autenticado con clave aleatoria propia de ese intento, vía puente HTTPS nativo.
- Android espera sin botón de continuación. Ante `aceptado`, solicita cotización con `storeId` exacto, y abre la pantalla `prepaymentReview` con subtotal de catálogo y tarifa del Administrador.
- `Elegir método de pago` muestra solamente los métodos publicados por la sede y modalidad; no avanza a cobro, simulaciones de pago ni crea un pedido definitivo.
- `Agregar o cambiar productos` notifica cancelación al agente mediante la API del Administrador, bloquea alteraciones del carrito hasta recibir acuse y devuelve a la carta. La siguiente solicitud obtiene un `interactionId` nuevo.
- Se conserva el botón y pantalla de chat existentes, con campo de texto y botón enviar deshabilitados. No hay mensajes ficticios almacenados como conversaciones reales.
- Un cliente puede reanudar una interacción pendiente tras reiniciar la app, con la misma clave; no se garantiza todavía coordinación multi-dispositivo ni orquestación SQL duradera de búsqueda de sedes.
- **Dependencias:** primera respuesta textual del agente mientras está `PENDING` en TU VERSO (aún no soportada por el contrato inspeccionado); Google Routes y conexión S2S real; confirmación/cobro, seguimiento del pedido, mensajería bidireccional y cierre con etiqueta fuera de esta fase.
- Todo cambio está aislado en rama; sin despliegue productivo ni cobro.


### Prueba de pedido por texto (21/11/2026)

Android recoge los datos de contacto (nombres, apellidos, teléfono peruano) **antes** de iniciar la consulta de sedes por delivery, y agrega `customer` a la solicitud de interacción: dirección, distrito, referencia opcional y modalidad. No crea `summary`, no envía precios sin validación ni llama directamente a TU VERSO: el Administrador verifica catálogo y contacto y envía el texto dentro de la conversación móvil mediante S2S.

La prueba utiliza la dirección HTTPS temporal del Administrador `https://ratios-represents-signals-allergy.trycloudflare.com/` configurada como `b3_api_base` en Gradle. Puede sustituirse en compilación mediante `-PB3_API_BASE=https://NUEVA_URL_HTTPS` si el túnel cambia. No almacenar tokens S2S en Android. Comprobar `/health/ready` antes de las pruebas; un 200/ready solo verifica el Administrador, no certifica TU VERSO. El agente recibe mensaje INBOUND con texto; confirmar visualmente la presentación real en su bandeja. Sin pagos reales, sin botones ni formulario de TU VERSO.


### Propiedad de la decisión del asesor: Android (21/11/2026)

TU VERSO retorna su estado formal y mensajes al Administrador mediante el conector autorizado. El Administrador es únicamente puerta de enlace autenticada: la API `GET /api/v1/mobile/interactions/{id}/status` retorna `status` y `agentMessages` (`id`, `text`, `createdAt`), sin campo `decision`. Android consulta periódicamente, valida IDs y formatos, reconoce `Acepto`/`Aceptado`/`Aceptada` o `Rechazado`/`Rechazada` en textos completos de agente y decide cuándo cotizar la sede aceptada, consultar otra o esperar. El estado formal remoto prevalece sobre el texto (rechazada/expirada/cancelada nunca avanza por un «Acepto» antiguo).

Este contrato no usa un push directo a Android: sin conexión persistente ni servicio push, la aplicación **consulta periódicamente** al Administrador. La actualización exige compilar APK nueva y actualizar Administrador local al mismo contrato; ningún cambio en TU VERSO. El aviso «No hay sedes disponibles» pertenece a la fase Android de cobertura, sedes habilitadas y comprobación de capacidad, no es evidencia de que la aprobación del asesor se haya procesado.


### Espera de la respuesta del agente sin límite comercial local y recuperación del 503 (21/11/2026)

Android realiza **dos HTTP independientes**: (1) `INTERACTION_CREATE` registra de manera persistente `interactionId` y clave de idempotencia, y (2) `INTERACTION_MESSAGE` envía el texto mediante la pasarela del Administrador. Si el segundo paso falla/da 503, Android muestra el estado `CREATE_UNCERTAIN` y reintenta **solo el envío del texto**, usando la clave de la interacción original, nunca creando otra solicitud. Al confirmarse el mensaje, la app comienza/continúa las lecturas `INTERACTION_STATUS` del asesor y avanza cuando TU VERSO emite estado formal o respuesta de mensaje reconocida por el cliente.

**Los intervalos técnicos NO son límites de atención**: la consulta periódica está alrededor de 3,2 s en condiciones normales; ante fallo de red se reintenta más tarde (~8 s); los límites de conexión HTTP de JavaScript/Java/servidor abortan únicamente una llamada individual. La app no debe cerrar/expirar la interacción por 1 minuto ni por otro límite comercial arbitrario. La responsabilidad de reglas de timeout, reasignación y respuestas automáticas es exclusiva de TU VERSO, cuando esas reglas estén efectivamente configuradas. La consulta periódica ocurre con la aplicación en la pantalla de atención; al reabrir se restaura la interacción persistida y se reanuda el seguimiento. Se mantiene prohibido finalizar el pago sin aceptación y cotización válida.

No se modificó TU VERSO. El cierre del socket HTTP al terminar cada petición es normal y no cierra la conversación persistida en TU VERSO.
