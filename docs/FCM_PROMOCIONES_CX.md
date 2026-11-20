# Pollos B3 — contrato de notificaciones comerciales FCM (Android)

## Alcance y arquitectura

El administrador web de Pollos B3 publica avisos comerciales mediante el backend propio.
La aplicación Android consulta:

`GET /api/v1/mobile/notifications?appId=com.integrab2g.pollosb3`

El backend, **no la APK**, envía las notificaciones push mediante Firebase Cloud Messaging (FCM) al tema
`pollosb3_promotions`. El cliente únicamente se suscribe después de su consentimiento explícito.
No requiere una cuenta de usuario. No depende de TuVerso ni de WhatsApp.

## Contrato de envío FCM

Enviar **solo un mensaje `data`**, no un mensaje combinado `notification + data`. El servicio nativo
`B3FirebaseMessagingService` valida y representa los avisos, evitando diferencias entre el primer
plano y segundo plano. Todos los valores del mapa `data` deben ser cadenas.

```json
{
  "message": {
    "topic": "pollosb3_promotions",
    "data": {
      "type": "marketing",
      "notificationId": "<ID real de la notificación publicada en la API>",
      "title": "<título real>",
      "body": "<texto real>",
      "scheduledAt": "<fecha ISO 8601 UTC, si aplica, por ejemplo 2026-11-19T16:03:00.000Z>",
      "expiresAt": "<fecha ISO 8601 UTC, si aplica, por ejemplo 2026-11-19T21:53:00.000Z>"
    },
    "android": {
      "priority": "NORMAL",
      "ttl": "3600s"
    }
  }
}
```

Los valores entre corchetes angulares son **marcadores**, no promociones reales. Usar el UUID **exacto** de
la API como `notificationId`. El servicio admite identificadores alfanuméricos con guion y guion bajo,
de 1 a 128 caracteres. El cliente filtra horarios futuros y promociones vencidas.

La propiedad `ttl` del envío debe calcularse por notificación para evitar entrega tardía: usar un
valor igual o menor al tiempo restante hasta `expiresAt`; si la promoción ya venció, **no enviar**.
El backend también debe respetar el momento programado `scheduledAt`, evitar envíos duplicados y
comprobar que la notificación esté publicada. No enviar ofertas a usuarios sin consentimiento.

La imagen de una promoción **no se envía como enlace de compra**. La API conserva `imageUrl`; la app
la resuelve con el mismo origen HTTPS y muestra el detalle solo si la notificación sigue vigente.

## Navegación y estado de lectura

1. Al tocar la notificación Android, `MainActivity` recibe `notificationId` y abre el detalle.
2. La app vuelve a consultar la API antes de validar el contenido.
3. Si el aviso está vigente, presenta título, imagen, mensaje, expiración y botón «Explorar la carta».
4. Si venció o fue retirado, muestra «Esta promoción ya no está disponible» y «Ver la carta actual».
5. La bandeja `Mi Cuenta > Notificaciones` diferencia avisos leídos y pendientes. La lectura se
   conserva **localmente en ese dispositivo**; no está sincronizada con un perfil ni otros móviles.
6. El botón «Explorar la carta» **no** aplica descuentos automáticamente, porque la API no establece
   un vínculo entre cada promoción y un producto/cupón del carrito.
7. El launcher Android puede mostrar punto o cantidad sobre el ícono si lo soporta; no garantiza
   un número preciso en todas las marcas/versiones.

## Seguridad y operaciones

- Firebase service account y credenciales de servidor: exclusivamente en el backend, jamás en GitHub
  público ni en la APK.
- Firebase Android `google-services.json` es una configuración cliente; no autoriza el envío push.
- El tema es de promociones generales, **nunca** usarlo para pedidos, pagos o información personal.
- El usuario activa o desactiva avisos desde `Mi Cuenta > Notificaciones`.
- `notificationId`, `title`, `body` y fechas deben validarse antes de cada envío.
- Para evitar duplicados cuando la app está cerrada, utilizar el formato `data-only` indicado.
- Los cambios de túnel Cloudflare requieren actualizar el origen API y generar una APK nueva.
- La compilación y las pruebas de recepción en un teléfono deben certificarse antes de darlo como producción.

Documentación oficial:
- https://firebase.google.com/docs/cloud-messaging/android/receive-messages
- https://firebase.google.com/docs/cloud-messaging/send-message
- https://developer.android.com/develop/ui/views/notifications/badges

## Vigencia y orden en la bandeja Android

- **Avisos con `expiresAt`:** visibles únicamente hasta su vencimiento real; no extenderlos siete días.
- **Avisos sin `expiresAt`:** visibles siete días desde `scheduledAt` (fecha de publicación); si tampoco existe una fecha válida de publicación, no se listan por falta de base temporal verificable.
- **Orden:** fecha de publicación más reciente primero, máximo 20 avisos vigentes.
- **Lectura:** al abrir el detalle se marca como leído; no se borra hasta que caduque o sea retirado de la API.
- **Preferencias:** la opción «Avisos en mi celular» se presenta como fila pequeña al final de la bandeja; las promociones tienen prioridad visual.
- **Backend:** debería proporcionar `scheduledAt` real incluso a novedades sin vencimiento y retirar las promociones anuladas de la API.
- **Sin archivo histórico:** no se presentan promociones vencidas como si fueran vigentes.

