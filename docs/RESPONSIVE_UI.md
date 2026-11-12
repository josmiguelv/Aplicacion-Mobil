# Pollos B3 — Splash e Inicio (fase 1)

## Alcance
Código nativo **Kotlin + Jetpack Compose**; no se ha importado el APK V9 previo.

- Splash: fondo oscuro con acentos rojos y lema aprobado. Es una pantalla de lanzamiento propia de 1.4 segundos, no reemplaza el splash de sistema Android 12+.
- Inicio: cabecera roja, buscador, destacado, categorías horizontales, secciones de promociones y locales.
- Navegación con cuatro destinos: Inicio, Carta, Pedidos, Mi Cuenta. Solo Inicio está desarrollado; los otros destinos muestran estados provisionales.
- Acceso de ayuda visible, con diálogo informativo hasta integrar el chat.
- **Sin información comercial inventada**: imágenes, productos, horarios, promociones, precios, direcciones y logos oficiales no aparecen hasta recibir contenido aprobado.
- Icono y logo oficial están pendientes de incorporarse como recursos binarios originales. El título tipográfico temporal *Pollos B3* no pretende sustituir el logo.

## Responsive y accesibilidad
- Se usan `dp`, `sp`, `fillMaxWidth`, `widthIn`, `heightIn`, `LazyColumn`, `LazyRow` y `WindowInsets.safeDrawing`.
- Contenido principal verticalmente desplazable, sin depender de una altura fija.
- Botones y campos de búsqueda con objetivos táctiles adecuados.
- Previews Android Studio: **320×640**, **393×852**, **480×1000 dp**.
- Probar también escala de texto 1.3x/2x, modo de navegación por gestos, teclados, pantallas plegables y tabletas; las previews son solo una ayuda, no certificación.
- Algunas tarjetas utilizan altura mínima para permitir contenido en varias líneas.

## Próximas entregas
1. Incorporar logotipo e imágenes oficiales proporcionadas por Pollos B3 sin alterarlos.
2. Conectar la carta y destacados con la API publicada del catálogo.
3. Sustituir estados de demostración por datos reales; no activar CTA de compra sin disponibilidad y precios validados.
4. Completar detalles de producto, carrito, delivery/recojo, pagos, pedidos y cuenta.
5. Validar compilación, TalkBack, contraste, recortes de texto, conectividad y dispositivos físicos.

## Compilación
Abrir el proyecto con Android Studio compatible con AGP 8.9.2, JDK 17 y Android SDK 35. En CI se usa Gradle 8.11.1. No incluir secretos ni archivos `local.properties`.
