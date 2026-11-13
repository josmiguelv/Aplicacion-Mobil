package com.integrab2g.pollosb3.ui

import com.integrab2g.pollosb3.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Public read-only mobile API. Application ID selects the public catalog and is not a credential.
 * Backend performs definitive store assignment, coverage checks and checkout validation.
 */
class CatalogFulfillmentService : FulfillmentService {
    private val baseUrl = BuildConfig.B3_API_URL.trimEnd('/')
    private val appId = BuildConfig.B3_APP_ID

    private fun path(segment: String): String {
        require(baseUrl.startsWith("https://") && appId.isNotBlank()) {
            "Public catalog API has not been configured."
        }
        return "$baseUrl/api/v1/apps/${encode(appId)}/$segment"
    }
    private fun encode(raw: String) = URLEncoder.encode(raw, "UTF-8")
    private suspend fun request(url: String, payload: JSONObject? = null): JSONObject =
        withContext(Dispatchers.IO) {
            val connection = URL(url).openConnection() as HttpURLConnection
            try {
                connection.requestMethod = if (payload == null) "GET" else "POST"
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.setRequestProperty("Accept", "application/json")
                if (payload != null) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
                }
                if (connection.responseCode !in 200..299) {
                    throw IllegalStateException("Catalog service unavailable: ${connection.responseCode}")
                }
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                JSONObject(body)
            } finally { connection.disconnect() }
        }

    private fun parseStore(row: JSONObject): StoreOption =
        StoreOption(
            id = row.getString("id"),
            name = row.getString("name"),
            address = row.optString("address"),
            pickupEnabled = row.optBoolean("pickupEnabled"),
            dineInEnabled = row.optBoolean("dineInEnabled"),
            deliveryEnabled = row.optBoolean("deliveryEnabled")
        )
    private fun parseMethods(items: JSONArray): List<String> =
        (0 until items.length()).map { items.getString(it) }

    override suspend fun stores(): List<StoreOption> {
        val data = request(path("stores")).getJSONArray("stores")
        return (0 until data.length()).map { parseStore(data.getJSONObject(it)) }
    }

    override suspend fun resolveDelivery(location: DeliveryLocation): StoreResolution {
        val payload = JSONObject().apply {
            put("address", location.address)
            put("reference", location.reference)
            location.latitude?.let { put("latitude", it) }
            location.longitude?.let { put("longitude", it) }
        }
        val data = request(path("delivery/resolve"), payload)
        return StoreResolution(
            store = parseStore(data.getJSONObject("store")),
            deliveryFeeCents = data.getLong("deliveryFeeCents"),
            paymentMethodIds = parseMethods(data.getJSONArray("paymentMethodIds"))
        )
    }

    override suspend fun paymentMethods(
        storeId: String, mode: FulfillmentMode
    ): List<String> {
        val query = "storeId=${encode(storeId)}&mode=${encode(mode.name)}"
        return parseMethods(request(path("payments?$query")).getJSONArray("paymentMethodIds"))
    }
}
