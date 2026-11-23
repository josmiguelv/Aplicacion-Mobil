# Pollos B3 Android — fase de horarios futuros y FORM (PR #13)

Base: `feat/b3-mobile-scheduled-order-ui-20261123` (PR #12). Solo `Aplicacion-Mobil`. Sin cambios a TU VERSO.

## Funcionalidad
- Dos modalidades existentes: `delivery` y `pickup`; dos tiempos: `NOW` y `SCHEDULED`.
- El usuario elige fecha de preferencia, y para Recojo selecciona un horario devuelto por el backend con `GET /api/v1/mobile/stores/{storeId}/reservation-slots`. Se utiliza conexión HTTPS del Administrador configurada por la app, con URL/path fijos en Java y validación estricta de la respuesta.
- Una sede de recojo programado puede estar cerrada ahora si está activa, tiene Recojo y reservas configuradas; el servidor valida el horario solicitado.
- Delivery programado todavía **no consulta cobertura ni tarifa futura**. No reutiliza las cotizaciones de la hora actual ni crea una interacción inmediata.
- `scheduledOrderTicketForm()` prepara, pero NO envía un FORM con título `RESERVA DE PEDIDO`, subtítulo dinámico `Confirmar pedido programado - Delivery` / `Confirmar pedido programado - Recojo en tienda`, variables `Fecha solicitada`, `Hora solicitada`, `Productos`, `Subtotal`. La sede y la dirección NO son variables visibles.
- Se muestra `preparationMinutes` si la sede lo publicó. El texto aclara que la preparación solo comienza tras confirmar pago o una modalidad de pago al recibir válidamente aceptada. No incluye tiempo de reparto ni inicia cronómetro antes del pago.
- Las rutas actuales de checkout, cotización, pago y finalización bloquean `SCHEDULED` hasta certificar que el backend admite reservas. Nunca simular una confirmación real.

## Seguridad
- No modificar `type:FORM` del delivery inmediato.
- No enviar un segundo FORM ni auto-reintentos duplicados.
- Las selecciones de horarios son **preliminares**; el backend reporta `acceptingRequests:false` y `capacityVerified:false`.
- Un agente conectado en TU VERSO habilita operativamente la sede cuando se solicita un pedido, pero no constituye garantía de capacidad futura.
- La aplicación no marca reservas ni pagos confirmados.
- Toda la comunicación privada con TU VERSO continúa únicamente a través del Administrador existente.

## Dependencias pendientes
PR #20 del Administrador (configuración + migración 008) y PR #21 (consulta de horarios). Faltan APIs de cupos/creación/confirmación comercial, validación de agente, pago y seguimiento. NO-GO para reservas reales hasta entonces.
