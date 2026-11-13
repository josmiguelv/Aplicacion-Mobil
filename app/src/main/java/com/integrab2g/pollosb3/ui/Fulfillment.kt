package com.integrab2g.pollosb3.ui

import android.Manifest
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeliveryDining
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.Store
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

/**
 * This UI never chooses a delivery store by raw distance. Backend validates coverage,
 * opening hours, enabled payment methods and delivery fee for the selected address.
 */
enum class FulfillmentMode(val display: String) {
    DELIVERY("Delivery"), PICKUP("Recojo en tienda"), DINE_IN("Comer en tienda")
}
data class StoreOption(
    val id: String, val name: String, val address: String,
    val pickupEnabled: Boolean, val dineInEnabled: Boolean, val deliveryEnabled: Boolean
)
data class DeliveryLocation(
    val address: String, val reference: String,
    val latitude: Double? = null, val longitude: Double? = null
)
data class OrderContext(
    val mode: FulfillmentMode,
    val storeId: String,
    val storeName: String,
    val delivery: DeliveryLocation? = null,
    val deliveryFeeCents: Long = 0L,
    val paymentMethodIds: List<String> = emptyList()
)
data class StoreResolution(
    val store: StoreOption,
    val deliveryFeeCents: Long,
    val paymentMethodIds: List<String>
)
interface FulfillmentService {
    suspend fun stores(): List<StoreOption>
    suspend fun resolveDelivery(location: DeliveryLocation): StoreResolution
    suspend fun paymentMethods(storeId: String, mode: FulfillmentMode): List<String>
}

@Composable
fun FulfillmentSelector(current: OrderContext?, onSelect: (FulfillmentMode) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Text("¿Cómo recibirás tu pedido?", fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            val options = listOf(
                Triple(FulfillmentMode.DELIVERY, Icons.Outlined.DeliveryDining, "Delivery"),
                Triple(FulfillmentMode.PICKUP, Icons.Outlined.ShoppingBag, "Recojo"),
                Triple(FulfillmentMode.DINE_IN, Icons.Outlined.Store, "En tienda")
            )
            options.forEach { (mode, icon, title) ->
                val active = current?.mode == mode
                Surface(
                    modifier = Modifier.weight(1f).heightIn(min = 76.dp).clickable { onSelect(mode) },
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(if (active) 2.dp else 1.dp,
                        if (active) BrandPalette.Red else MaterialTheme.colorScheme.outlineVariant),
                    color = if (active) BrandPalette.Red.copy(alpha = .06f) else BrandPalette.White
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(icon, contentDescription = null, tint = BrandPalette.Red)
                        Text(title, style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold, maxLines = 2)
                    }
                }
            }
        }
        if (current != null) {
            Text(
                if (current.mode == FulfillmentMode.DELIVERY)
                    "Envío desde ${current.storeName} · ${current.delivery?.address.orEmpty()}"
                else "${current.mode.display} · ${current.storeName}",
                color = BrandPalette.Muted, style = MaterialTheme.typography.bodySmall
            )
        } else {
            Text("Selecciona una modalidad para preparar tu pedido.",
                color = BrandPalette.Muted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FulfillmentSetup(
    mode: FulfillmentMode,
    service: FulfillmentService,
    onDismiss: () -> Unit,
    onConfirmed: (OrderContext) -> Unit
) {
    val context = LocalContext.current
    var stores by remember { mutableStateOf<List<StoreOption>>(emptyList()) }
    var selectedStore by remember { mutableStateOf<StoreOption?>(null) }
    var address by remember { mutableStateOf("") }
    var reference by remember { mutableStateOf("") }
    var latitude by remember { mutableStateOf<Double?>(null) }
    var longitude by remember { mutableStateOf<Double?>(null) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun obtainLocation() {
        try {
            val manager = context.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager
            if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER) &&
                !manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                error = "Activa la ubicación del teléfono o escribe tu dirección manualmente."
                return
            }
            val providers = manager.getProviders(true)
            val best = providers.mapNotNull { provider ->
                try { manager.getLastKnownLocation(provider) } catch (_: SecurityException) { null }
            }.maxByOrNull { it.time }
            if (best != null) {
                latitude = best.latitude
                longitude = best.longitude
                error = "Ubicación aproximada obtenida. Confirma la dirección escrita antes de continuar."
            } else {
                error = "No hay una posición reciente. Puedes escribir la dirección sin activar el GPS."
            }
        } catch (_: Exception) {
            error = "No se pudo obtener la ubicación. Escribe tu dirección manualmente."
        }
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.any { it }) obtainLocation()
        else error = "Permiso denegado. Puedes ingresar tu dirección manualmente."
    }
    LaunchedEffect(mode, service) {
        if (mode != FulfillmentMode.DELIVERY) {
            try { stores = service.stores().filter {
                if (mode == FulfillmentMode.PICKUP) it.pickupEnabled else it.dineInEnabled
            } } catch (_: Exception) {
                error = "No se pudieron cargar los locales. Comprueba tu conexión."
            }
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(mode.display, style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold)
            if (mode == FulfillmentMode.DELIVERY) {
                Text("Dirección de entrega",
                    style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                OutlinedTextField(
                    value = address, onValueChange = { address = it; latitude = null; longitude = null },
                    modifier = Modifier.fillMaxWidth(), label = { Text("Calle, número y distrito") },
                    singleLine = false, maxLines = 3
                )
                OutlinedTextField(
                    value = reference, onValueChange = { reference = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Referencia (opcional)") }, maxLines = 2
                )
                OutlinedButton(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        val granted = listOf(Manifest.permission.ACCESS_COARSE_LOCATION,
                            Manifest.permission.ACCESS_FINE_LOCATION).any {
                            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
                        }
                        if (granted) obtainLocation()
                        else permissionLauncher.launch(arrayOf(
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                            Manifest.permission.ACCESS_FINE_LOCATION
                        ))
                    }
                ) {
                    Icon(Icons.Outlined.LocationOn, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Usar mi ubicación (opcional)")
                }
                Text("Tu dirección será validada por la tienda. El GPS no es obligatorio.",
                    style = MaterialTheme.typography.bodySmall, color = BrandPalette.Muted)
            } else {
                Text("Selecciona un local habilitado",
                    style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (stores.isEmpty()) {
                    Text("No hay locales disponibles o falta conectar el catálogo publicado.",
                        color = BrandPalette.Muted, style = MaterialTheme.typography.bodyMedium)
                }
                LazyColumn(Modifier.heightIn(max = 280.dp)) {
                    items(stores, key = { it.id }) { store ->
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable { selectedStore = store }
                                .padding(vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = selectedStore?.id == store.id,
                                onClick = { selectedStore = store })
                            Column {
                                Text(store.name, fontWeight = FontWeight.SemiBold)
                                Text(store.address,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = BrandPalette.Muted)
                            }
                        }
                    }
                }
                if (mode == FulfillmentMode.DINE_IN)
                    Surface(color = BrandPalette.Red.copy(alpha = .05f),
                        shape = RoundedCornerShape(12.dp)) {
                        Text("La disponibilidad de mesas depende de la concurrencia del local al momento de llegar. Tu pedido no reserva una mesa.",
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodySmall)
                    }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall) }
            Button(
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                enabled = !working && if (mode == FulfillmentMode.DELIVERY)
                    address.isNotBlank() else selectedStore != null,
                onClick = {
                    working = true
                    error = null
                    scope.launch {
                        try {
                            val resolved = if (mode == FulfillmentMode.DELIVERY)
                                service.resolveDelivery(DeliveryLocation(
                                    address.trim(), reference.trim(), latitude, longitude))
                            else {
                                val store = requireNotNull(selectedStore)
                                StoreResolution(store, 0L, service.paymentMethods(store.id, mode))
                            }
                            onConfirmed(OrderContext(
                                mode = mode, storeId = resolved.store.id,
                                storeName = resolved.store.name,
                                delivery = if (mode == FulfillmentMode.DELIVERY)
                                    DeliveryLocation(address.trim(), reference.trim(), latitude, longitude)
                                    else null,
                                deliveryFeeCents = resolved.deliveryFeeCents,
                                paymentMethodIds = resolved.paymentMethodIds
                            ))
                        } catch (_: Exception) {
                            error = "No se pudo validar la tienda o cobertura. Intenta nuevamente."
                        } finally { working = false }
                    }
                }
            ) {
                Text(if (working) "Validando..." else "Confirmar y continuar")
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}
