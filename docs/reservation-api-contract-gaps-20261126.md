# Pollos B3 — contrato de reserva pendiente en Administrador Web (solo lectura)
Fecha de revisión: 2026-11-26. Rama Admin inspeccionada: `consolidate/admin-reservations-payment-api-20261124`.

## Implementado en Android en esta rama

- Ambos FORM de reserva (validación y comprobante) utilizan una única variable `Fecha`, con fecha seleccionada e intervalo **-15/+15 minutos**, zona Perú UTC-5. Ejemplo: `28/11/2026 · 7:15 p. m. – 7:45 p. m.`. Cruces de medianoche conservan ambas fechas del intervalo. No se envían variables separadas `Fecha de reserva` ni `Intervalo`.
- Límite contractual: 1 a 10 variables opcionales según contenido; título, subtítulo e imagen del comprobante son campos independientes. Al unificar Fecha se libera una posición para el detalle de productos. El constructor actual agrupa importes y forma de pago, por lo que no exige nueve ni diez variables.
- Productos agrupados en campos "Productos N"; **máximo 10 variables por FORM**, 500 caracteres de valor por variable y 80 por nombre. Si el detalle completo no cabe se bloquea el envío; no se recorta silenciosamente.
- Métodos de pago obtenidos de `stores[].paymentMethods.reservation`, filtrados por la cotización cuando está disponible.
- Efectivo exacto (=total, vuelto 0) o monto superior al total con cálculo monetario entero (céntimos), validación de 2 decimales.
- Títulos propuestos: `VALIDACIÓN DE RESERVA` y `PAGO DE RESERVA REALIZADO - YAPE/PLIN/TARJETA`.
- Selección de sede según `stores[].reservationSettings.enabled`, visualización de `acceptingRequests` y consulta al endpoint de cotización `POST /api/v1/mobile/reservations/quote`.
- Sin POST de creación de reserva: no se falsifica aceptación ni se envía una solicitud que el contrato actual no puede representar correctamente.

## Bloqueos verificados — NO modificar Admin Web sin autorización explícita

1. `server/mobile-reservation-domain.mjs` `normalizeReserveRequest` **rechaza campos extra**. Admite fecha, hora, modo, sede, ítems, cliente, coordenadas y tarifa esperada; **no admite forma de pago, efectivo entregado ni vuelto antes de la aceptación del agente**.
2. `normalizedForm` del mismo archivo genera el título `RESERVA DE PEDIDO` y solo cuatro variables: `Fecha solicitada`, `Hora solicitada`, `Productos`, `Subtotal`. Es el **Administrador** quien entrega el FORM a TU VERSO, no Android. No incluye intervalo ni forma de pago y rechaza el resumen de productos si supera 500 caracteres.
3. `server/mobile-reservations.mjs` requiere la bandera `B3_RESERVATIONS_LIVE_ENABLED=true` para procesar `POST /reservations/quote` y `POST /reservations`. No se ha comprobado el estado real del despliegue; no asumir activación.
4. El endpoint `POST /api/v1/mobile/reservations/{id}/payment` solo permite `{appId,method}` y **se llama después de que el agente acepta**. Para efectivo marca `DUE_AT_RECEIPT` y `CONFIRMED`, pero no recibe ni transmite el importe entregado/vuelto.
5. `server/mobile-reservation-settings.mjs` publica `reservationSettings.enabled` y `preparationMinutes`; **no publica una anticipación mínima propia**. No corresponde interpretar preparación como anticipación mínima. `server/mobile-reservation-slots.mjs` consulta fecha/hora futura, no aplica ese mínimo.
6. Los FORM de los pedidos inmediatos están estrictamente validados por `order-availability.js` y por el código Java nativo. No reutilizarlos para enviar una reserva por un canal equivocado.

## Contrato a acordar/implementar en Admin Web (cuando se autorice)

- Proyectar la anticipación mínima definida en el panel, separada de tiempo de preparación; o aprobar explícitamente una regla equivalente.
- Autorizar al cliente a elegir método publicado de **reserva** y, si es efectivo, monto exacto u otro importe. El Administrador debe recalcular el total (catálogo + Delivery) y el vuelto en céntimos y persistirlos con la interacción.
- Enviar esos valores al agente **en el primer FORM de reserva**, antes de aceptar: una sola variable `Fecha` con fecha y ventana ±15, modalidad, productos completos, subtotal, tarifa, total, método y vuelto.
- Mantener máximo 10 variables por FORM; admitir empaquetado de ítems en varios campos y, cuando exceda el tamaño total, definir extensión de detalle verificable o múltiples mensajes autorizados sin fingir contenido.
- Para anticipados, un segundo FORM de pago con la misma variable `Fecha` (fecha e intervalo juntos) y comprobante verificable; para efectivo, no declarar pago realizado, mantener `DUE_AT_RECEIPT`.
- Conservar la primera decisión real del agente sobre la reserva y una segunda decisión únicamente para pagos que requieren comprobante.
- Garantizar idempotencia y lectura de estado por pedido independiente.

## Pruebas pendientes

- Ejecutar tests Node locales y Gradle; probar un backend habilitado real y pedidos con datos publicados (no datos ficticios).
- E2E: reserva Delivery, Recojo, efectivo exacto, vuelto, Yape/Plin/tarjeta según opciones publicadas, 50 líneas cortas, límite de 10 variables y cruce de fecha.

## Actualización Android — Fecha unificada

- Implementación: `app/src/main/assets/reservation-forms.js`, funciones `request` y `paymentProof`.
- Pruebas: `scripts/reservation-forms-10-fields.test.mjs`, fecha normal y cruces de medianoche en ambos formularios, sin variables duplicadas y con límite de diez.
- Esta modificación afecta al constructor local, no habilita el POST de creación ni cambia el FORM generado por el Administrador. Los bloqueos de integración anteriores permanecen pendientes; no se modificaron Administrador ni TuVerso.
