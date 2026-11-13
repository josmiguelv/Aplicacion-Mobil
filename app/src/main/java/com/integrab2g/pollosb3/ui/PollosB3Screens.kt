package com.integrab2g.pollosb3.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LocalDining
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.RestaurantMenu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.foundation.lazy.LazyColumn

/** Splash designed to respect small screens, cutouts and Android font scale. */
@Composable
fun PollosB3Splash(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(BrandPalette.Dark, Color(0xFF2D0609), BrandPalette.Dark)))
            .windowInsetsPadding(WindowInsets.safeDrawing),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Box(
                modifier = Modifier.widthIn(max = 420.dp).fillMaxWidth()
                    .background(Brush.horizontalGradient(listOf(BrandPalette.DarkRed, BrandPalette.Red)),
                        RoundedCornerShape(14.dp))
                    .padding(vertical = 5.dp, horizontal = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("LA POLLERÍA", color = BrandPalette.White,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center,
                    maxLines = 2)
            }
            Text("MÁS VIRAL", color = BrandPalette.Yellow,
                style = MaterialTheme.typography.displayMedium,
                fontWeight = FontWeight.Black, textAlign = TextAlign.Center,
                maxLines = 2, lineHeight = 52.sp)
            Text("DE SANTA ANITA", color = BrandPalette.White,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            HorizontalDivider(modifier = Modifier.width(84.dp), thickness = 4.dp,
                color = BrandPalette.Yellow)
        }
        Text(
            "POLLOS B3",
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 26.dp),
            color = BrandPalette.White.copy(alpha = 0.72f),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp
        )
    }
}

private enum class Destination(val label: String, val icon: ImageVector) {
    HOME("Inicio", Icons.Outlined.Home),
    MENU("Carta", Icons.Outlined.LocalDining),
    ORDERS("Pedidos", Icons.Outlined.ShoppingBag),
    ACCOUNT("Mi Cuenta", Icons.Outlined.AccountCircle)
}

@Composable
fun PollosB3App() {
    var selected by remember { mutableStateOf(Destination.HOME) }
    var chatOpen by remember { mutableStateOf(false) }
    var fulfillment by remember { mutableStateOf<OrderContext?>(null) }
    var pendingMode by remember { mutableStateOf<FulfillmentMode?>(null) }
    val fulfillmentService = remember { CatalogFulfillmentService() }

    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = BrandPalette.Red,
            onPrimary = BrandPalette.White,
            surface = BrandPalette.White,
            onSurface = BrandPalette.Ink
        ),
    ) {
        Scaffold(
            containerColor = BrandPalette.White,
            bottomBar = {
                NavigationBar(containerColor = BrandPalette.White,
                    tonalElevation = 4.dp) {
                    Destination.entries.forEach { destination ->
                        NavigationBarItem(
                            selected = selected == destination,
                            onClick = { selected = destination },
                            icon = { Icon(destination.icon, contentDescription = null) },
                            label = {
                                Text(destination.label, maxLines = 1,
                                    overflow = TextOverflow.Ellipsis)
                            },
                            alwaysShowLabel = true,
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = BrandPalette.Red,
                                selectedTextColor = BrandPalette.Red,
                                indicatorColor = BrandPalette.Red.copy(alpha = .09f)
                            )
                        )
                    }
                }
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { chatOpen = true },
                    containerColor = BrandPalette.Red,
                    contentColor = BrandPalette.White,
                    shape = CircleShape,
                    modifier = Modifier.size(54.dp)
                ) {
                    Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = "Abrir ayuda")
                }
            },
            floatingActionButtonPosition = FabPosition.End
        ) { padding ->
            when (selected) {
                Destination.HOME -> PollosB3Home(
                    modifier = Modifier.padding(padding),
                    onOpenMenu = { selected = Destination.MENU },
                    currentOrder = fulfillment,
                    onChooseFulfillment = { pendingMode = it }
                )
                else -> PlaceholderPage(
                    title = selected.label,
                    modifier = Modifier.padding(padding)
                )
            }
        }
        pendingMode?.let { mode ->
            FulfillmentSetup(mode = mode, service = fulfillmentService,
                onDismiss = { pendingMode = null },
                onConfirmed = { newOrder -> fulfillment = newOrder; pendingMode = null })
        }
        if (chatOpen) {
            AlertDialog(
                onDismissRequest = { chatOpen = false },
                title = { Text("Atención Pollos B3") },
                text = { Text("El chat estará disponible cuando se configure la integración de atención. No se envió ningún mensaje.") },
                confirmButton = {
                    TextButton(onClick = { chatOpen = false }) { Text("Entendido") }
                }
            )
        }
    }
}

@Composable
fun PollosB3Home(modifier: Modifier = Modifier, onOpenMenu: () -> Unit = {},
    currentOrder: OrderContext? = null,
    onChooseFulfillment: (FulfillmentMode) -> Unit = {}) {
    var search by remember { mutableStateOf("") }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            Column(
                modifier = Modifier.fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(BrandPalette.DarkRed, BrandPalette.Red)))
                    .padding(horizontal = 18.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // The original official logo is not in the repository yet.
                // This typographic text deliberately does not recreate its artwork.
                Text("Pollos B3", color = BrandPalette.Yellow,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Black)
                Text("¿Qué se te antoja hoy?",
                    color = BrandPalette.White,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.ExtraBold)
                Surface(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    color = BrandPalette.White,
                    shape = RoundedCornerShape(15.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 15.dp)) {
                        Icon(Icons.Outlined.Search, null, tint = BrandPalette.Red)
                        Spacer(Modifier.width(10.dp))
                        BasicTextField(
                            value = search,
                            onValueChange = { search = it },
                            singleLine = true,
                            textStyle = MaterialTheme.typography.bodyMedium.copy(color = BrandPalette.Ink),
                            decorationBox = { inner ->
                                Box(contentAlignment = Alignment.CenterStart) {
                                    if (search.isEmpty()) Text("Buscar platos",
                                        color = BrandPalette.Muted,
                                        style = MaterialTheme.typography.bodyMedium)
                                    inner()
                                }
                            },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
        item {
            Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                FulfillmentSelector(currentOrder, onChooseFulfillment)
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionHeading("Destacados")
                FeatureCard(
                    title = "El sabor que nos representa",
                    subtitle = "Explora nuestra carta",
                    action = "Ver carta",
                    onClick = onOpenMenu
                )
                Text("Los destacados se publicarán desde el catálogo oficial.",
                    style = MaterialTheme.typography.labelSmall, color = BrandPalette.Muted)
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionHeading("Te recomendamos", Modifier.padding(horizontal = 16.dp))
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(listOf("Pollos a la brasa", "Combos", "Complementos")) { category ->
                        CategoryCard(category, onOpenMenu)
                    }
                }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionHeading("Promociones")
                EmptyCatalogCard(
                    heading = "Próximas promociones",
                    body = "Las ofertas y sus precios se mostrarán cuando Pollos B3 las publique.",
                    onOpenMenu = onOpenMenu
                )
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionHeading("Nuestros locales")
                EmptyCatalogCard(
                    heading = "Elige dónde disfrutar",
                    body = "Horarios y direcciones disponibles cuando se conecte la información oficial.",
                    onOpenMenu = onOpenMenu
                )
            }
        }
    }
}

@Composable
private fun SectionHeading(title: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(4.dp).height(22.dp).clip(RoundedCornerShape(3.dp))
            .background(BrandPalette.Red))
        Spacer(Modifier.width(9.dp))
        Text(title, style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.ExtraBold, color = BrandPalette.Ink)
    }
}

@Composable
private fun FeatureCard(title: String, subtitle: String, action: String, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().heightIn(min = 178.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(22.dp),
        color = BrandPalette.Dark
    ) {
        Box(
            modifier = Modifier.background(Brush.linearGradient(
                listOf(BrandPalette.Dark, BrandPalette.DarkRed, Color(0xFF5D0B08))))
        ) {
            Column(
                modifier = Modifier.fillMaxSize().padding(22.dp),
                verticalArrangement = Arrangement.SpaceBetween,
                horizontalAlignment = Alignment.Start
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(title, color = BrandPalette.White,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Black)
                    Text(subtitle, color = BrandPalette.White.copy(alpha = .85f),
                        style = MaterialTheme.typography.bodyMedium)
                }
                Surface(
                    color = BrandPalette.Yellow,
                    contentColor = BrandPalette.Ink,
                    shape = RoundedCornerShape(30.dp)
                ) {
                    Row(modifier = Modifier.padding(horizontal = 15.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text(action, style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.ExtraBold)
                        Spacer(Modifier.width(7.dp))
                        Icon(Icons.Outlined.ArrowForward, null, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryCard(label: String, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.width(156.dp).heightIn(min = 150.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 3.dp,
        color = BrandPalette.White
    ) {
        Column {
            Box(
                modifier = Modifier.fillMaxWidth().height(88.dp)
                    .background(Brush.linearGradient(listOf(BrandPalette.Red, BrandPalette.DarkRed))),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Outlined.RestaurantMenu, contentDescription = null,
                    tint = BrandPalette.Yellow, modifier = Modifier.size(35.dp))
            }
            Text(label, modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.titleSmall,
                color = BrandPalette.Ink, fontWeight = FontWeight.Bold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun EmptyCatalogCard(heading: String, body: String, onOpenMenu: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, Color(0xFFECECEC)),
        color = BrandPalette.Subtle
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Text(heading, style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold)
            Text(body, style = MaterialTheme.typography.bodyMedium,
                color = BrandPalette.Muted)
            TextButton(onClick = onOpenMenu, contentPadding = PaddingValues(0.dp)) {
                Text("Explorar carta")
                Icon(Icons.Outlined.ArrowForward, null,
                    modifier = Modifier.padding(start = 5.dp).size(18.dp))
            }
        }
    }
}

@Composable
private fun PlaceholderPage(title: String, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.ExtraBold)
            Text("Esta sección se implementará en las siguientes etapas.",
                style = MaterialTheme.typography.bodyLarge,
                color = BrandPalette.Muted, textAlign = TextAlign.Center)
        }
    }
}

@Preview(name = "Home compact", showBackground = true, widthDp = 320, heightDp = 640)
@Composable
private fun PreviewCompact() { PollosB3App() }

@Preview(name = "Home medium", showBackground = true, widthDp = 393, heightDp = 852)
@Composable
private fun PreviewMedium() { PollosB3App() }

@Preview(name = "Home large", showBackground = true, widthDp = 480, heightDp = 1000)
@Composable
private fun PreviewLarge() { PollosB3App() }

@Preview(name = "Splash compact", widthDp = 320, heightDp = 640)
@Composable
private fun PreviewSplash() { MaterialTheme { PollosB3Splash() } }
