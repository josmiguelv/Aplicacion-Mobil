# Flujo de desarrollo — Pollos B3 Android

Actualizado: 2026-11-27. Alcance **exclusivo**: `josmiguelv/Aplicacion-Mobil`.

## Fuente de trabajo
- Rama de integración revisada: `perf/b3-android-image-loading-isolated-20261127`. Comparada con `fix/b3-android-persist-selected-fulfillment-20261126`: 25 commits por delante, 0 por detrás, cuatro archivos modificados (al momento de la revisión).
- Implementación actual: Android con WebView; **no** fusionar indiscriminadamente con la rama inicial Jetpack Compose.
- Administrador Web y TU VERSO: **solo lectura**. No modificar código, datos, configuración, despliegues ni migraciones de esos proyectos.
- El README y `README_V11_INTEGRATION.md` contienen secciones históricas V11/demo que pueden no describir todos los flujos actuales. Verificar cada afirmación contra el código y el contrato real antes de actualizarla o usarla para una liberación.

## Ciclo corto y seguro
1. `git fetch origin --prune`; `git switch perf/b3-android-image-loading-isolated-20261127`; `git pull --ff-only`; `git status --short`. No sobrescribir trabajo local.
2. Crear rama Android específica para cada cambio desde la rama de integración vigente. No hacer force-push ni modificar `main` directamente.
3. Inspeccionar únicamente los archivos afectados; registrar comportamiento previo, contrato API, estados persistidos y casos límite.
4. Hacer cambios mínimos con pruebas de regresión; no sustituir flujos que ya funcionan.
5. Ejecutar primero verificaciones rápidas y luego compilación. Revisar el diff y ausencia de secretos antes del commit.
6. Abrir PR con alcance, escenarios probados, riesgos y evidencias; no afirmar pruebas en dispositivo si no se realizaron.

## Verificación local (PowerShell)
```powershell
node --check app/src/main/assets/app.js
node --check app/src/main/assets/order-availability.js
node scripts/order-experience-smoke.mjs
node scripts/app-links-smoke.mjs
node --test scripts/order-form-audit-focus.test.mjs
.\gradlew.bat :app:assembleDebug
```
Si alguna prueba no existe en la rama activa, documentar esa ausencia y no marcarla como aprobada. Requisitos de compilación documentados: JDK 17, Android SDK 35, Gradle 8.11.1, AGP 8.7.3. APK debug: `app/build/outputs/apk/debug/app-debug.apk`. Usar `B3_API_BASE` mediante `.env` local o parámetro de compilación; no incluir credenciales ni secretos en el APK.

## Matriz de regresión obligatoria
| Área | Verificar |
| --- | --- |
| Modalidad | Delivery / Pide y Retira solo cambian con selección explícita; se conserva tras cancelar, cerrar y reabrir |
| Carta | Orden ascendente por precio; valores desde catálogo publicado, sin inventar productos ni precios |
| Pedido simultáneo | Pedido aceptado o pagado no bloquea crear otro pedido independiente |
| Recojo programado | Horario y sede válidos, espera de aprobación, pago y rechazo correctamente diferenciados |
| Delivery | Dirección, cobertura, tiempo de preparación distinto del tiempo de viaje |
| Pago | Yape, Plin, tarjeta y efectivo según configuración publicada; no duplicar envíos por reintentos |
| Ciclo de vida | Estados recibidos de fuentes verificadas; no tratar eventos demo como reales |
| Entregado | Mostrar confirmación con número de pedido, luego favorito y después encuesta opcional |
| Encuesta | Cierre con X, sin obligatoriedad, sin bloquear navegación al regresar a la app |
| Imágenes | Carga aislada, placeholders, errores, desplazamiento fluido y sin solicitudes redundantes |
| Seguridad | Idempotencia, validación de entradas, manejo de 429/503/timeouts, no registrar datos personales ni claves |

## Dependencias externas
Consultar contratos y configuración publicada de Administrador Web y TU VERSO en **modo solo lectura**. Si una API externa no soporta el contrato esperado, registrar el bloqueo; no modificar el otro repositorio ni simular una respuesta exitosa. La app no es autoridad de precios, disponibilidad, pagos ni estados comerciales.

## Criterios de finalización
- Diff limitado a Android; pruebas automatizadas pertinentes y compilación registradas con resultado real.
- Evidencia manual en dispositivo para cambios de UX, pagos y ciclo de pedido (si no se ejecutó, marcar **pendiente**).
- Documentación actualizada junto con el cambio funcional; describir restricciones conocidas y pasos de reversión mediante Git.
- Sin cambios en Administrador Web, TU VERSO, bases de datos, Railway ni producción.
