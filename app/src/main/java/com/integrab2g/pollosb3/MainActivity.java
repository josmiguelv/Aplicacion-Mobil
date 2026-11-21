package com.integrab2g.pollosb3;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.Address;
import android.location.Geocoder;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONArray;
import java.util.List;
import java.util.Locale;

/** Android V10: navigation and optional foreground GPS for delivery. No background tracking. */
public class MainActivity extends Activity {
    private static final int LOCATION_REQUEST = 41;
    private static final int NOTIFICATION_REQUEST = 42;
    static final String MARKETING_TOPIC = "pollosb3_promotions";
    static final String NOTIFICATION_CHANNEL = "pollosb3_promotions";
    static final String PREFS = "b3_push_settings";
    private boolean pendingNotificationsScreen = false;
    private String pendingNotificationId = "";
    private WebView web;
    private WebViewAssetLoader assetLoader;
    private LocationManager locationManager;
    private LocationListener currentListener;
    private boolean appLinkPageReady = false;
    private boolean pendingOpenHome = false;
    private static final String LOCAL_APP_URL = "https://appassets.androidplatform.net/assets/index.html";

    /** Accept only the exact Pollos B3 HTTPS entry point; never redirect arbitrary URLs. */
    private static boolean isPollosB3OpenLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return false;
        Uri uri = intent.getData();
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) &&
            "app.integra-b2g.com".equalsIgnoreCase(uri.getHost()) &&
            "/abrir".equals(uri.getPath()) && uri.getPort() == -1 &&
            uri.getUserInfo() == null;
    }

    /** Reuses the existing WebView SPA and navigates only after its handlers exist. */
    private void dispatchPendingNotificationsScreen() {
        if (!pendingNotificationsScreen || !appLinkPageReady || web == null) return;
        pendingNotificationsScreen = false;
        String id = pendingNotificationId;
        pendingNotificationId = "";
        web.evaluateJavascript("window.b3OpenNotifications && window.b3OpenNotifications("+JSONObject.quote(id)+")", null);
    }
    private void dispatchPendingAppLink() {
        if (!pendingOpenHome || !appLinkPageReady || web == null) return;
        pendingOpenHome = false;
        web.evaluateJavascript("window.b3OpenFromLink && window.b3OpenFromLink()", null);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (isMarketingNotificationIntent(intent)) {
            pendingNotificationId = getNotificationId(intent);
            pendingNotificationsScreen = true;
            dispatchPendingNotificationsScreen();
        }
        if (isPollosB3OpenLink(intent)) {
            pendingOpenHome = true;
            dispatchPendingAppLink();
        }
    }
    private static boolean isMarketingNotificationIntent(Intent intent) {
        return intent != null && (intent.getBooleanExtra("b3_open_notifications",false) ||
            ("marketing".equals(intent.getStringExtra("type")) && "notifications".equals(intent.getStringExtra("screen"))));
    }
    private static String getNotificationId(Intent intent) {
        if(intent==null)return "";
        String id=intent.getStringExtra("notificationId");
        if(id==null || id.length()>128 || !id.matches("[a-zA-Z0-9_-]+"))return "";
        return id;
    }
    private boolean marketingEnabled() {
        return getSharedPreferences(PREFS,MODE_PRIVATE).getBoolean("marketing_opt_in",false);
    }
    private void sendMarketingStatus(boolean enabled,String message) {
        if(web==null)return;
        String js="window.b3MarketingStatus && window.b3MarketingStatus("+enabled+","+JSONObject.quote(message)+")";
        runOnUiThread(()->{if(web!=null)web.evaluateJavascript(js,null);});
    }
    private void setMarketingOptIn(boolean enabled){
        if(!enabled){
            getSharedPreferences(PREFS,MODE_PRIVATE).edit().putBoolean("marketing_opt_in",false).apply();
            FirebaseMessaging.getInstance().unsubscribeFromTopic(MARKETING_TOPIC);
            // Al retirar el consentimiento se limpian únicamente avisos comerciales.
            NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            if(manager!=null && Build.VERSION.SDK_INT>=23){
                for(android.service.notification.StatusBarNotification active:manager.getActiveNotifications()){
                    if(Build.VERSION.SDK_INT<26 || NOTIFICATION_CHANNEL.equals(active.getNotification().getChannelId())){
                        manager.cancel(active.getId());
                    }
                }
            }
            sendMarketingStatus(false,"Avisos promocionales desactivados.");
            return;
        }
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_REQUEST);
            return;
        }
        FirebaseMessaging.getInstance().subscribeToTopic(MARKETING_TOPIC).addOnCompleteListener(task->{
            boolean ok=task.isSuccessful();
            getSharedPreferences(PREFS,MODE_PRIVATE).edit().putBoolean("marketing_opt_in",ok).apply();
            sendMarketingStatus(ok,ok?"Avisos promocionales activados.":"No se pudo activar. Vuelve a intentarlo.");
        });
    }
    private final class Bridge {
        @JavascriptInterface public void setSplash(final boolean splash) {
            runOnUiThread(() -> {
                getWindow().setStatusBarColor(splash ? Color.rgb(9, 0, 1) : Color.WHITE);
                getWindow().setNavigationBarColor(splash ? Color.rgb(9, 0, 1) : Color.WHITE);
                getWindow().getDecorView().setSystemUiVisibility(
                    splash ? 0 : (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR)
                );
            });
        }
        /** Public HTTPS base URL only, never secrets or API tokens in Android. */
        @JavascriptInterface public String getApiBase() {
            String configured = getString(R.string.b3_api_base).trim();
            return configured.startsWith("https://") ? configured : "";
        }
        /** Separate HTTPS origin for Pollos B3 commercial notifications. */
        @JavascriptInterface public String getNotificationsApiBase() {
            String configured = getString(R.string.b3_notifications_api_base).trim();
            return configured.startsWith("https://") ? configured : "";
        }
        @JavascriptInterface public boolean marketingNotificationsEnabled() {return marketingEnabled();}
        @JavascriptInterface public void markMarketingNotificationRead(String id) {
            if(id==null||id.length()>128||!id.matches("[a-zA-Z0-9_-]+"))return;
            runOnUiThread(()->{
                NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
                if(manager!=null)manager.cancel(id.hashCode());
            });
        }
        @JavascriptInterface public void setMarketingNotificationsEnabled(boolean enabled) {
            runOnUiThread(()->setMarketingOptIn(enabled));
        }
        @JavascriptInterface public void requestLocation() {
            runOnUiThread(() -> requestOptionalLocation());
        }
        /**
         * Geocode only explicit store addresses supplied by the local app.
         * Runs off the UI thread; unresolved or ambiguous addresses remain unavailable.
         */
        @JavascriptInterface public void geocodeStores(String json) {
            new Thread(() -> {
                JSONArray found = new JSONArray();
                try {
                    JSONArray requested = new JSONArray(json);
                    Geocoder geocoder = new Geocoder(MainActivity.this, new Locale("es", "PE"));
                    if (!Geocoder.isPresent()) throw new IllegalStateException("Geocodificador no disponible");
                    for (int i = 0; i < Math.min(12, requested.length()); i++) {
                        JSONObject item = requested.optJSONObject(i);
                        if (item == null) continue;
                        String id = item.optString("id", "");
                        String address = item.optString("address", "");
                        if (id.length() > 90 || address.length() > 240 ||
                            id.isEmpty() || !address.contains("Santa Anita")) continue;
                        try {
                            List<Address> matches = geocoder.getFromLocationName(address, 1);
                            if (matches == null || matches.isEmpty()) continue;
                            Address match = matches.get(0);
                            if (!match.hasLatitude() || !match.hasLongitude()) continue;
                            // Reject city/region centroids: a street-level result is required.
                            if (match.getThoroughfare() == null || match.getThoroughfare().trim().isEmpty()) continue;
                            // Accept only Lima-area geocodes; never turn wrong-city matches into distances.
                            double lat = match.getLatitude(), lng = match.getLongitude();
                            if (lat < -12.35 || lat > -11.70 || lng < -77.35 || lng > -76.60) continue;
                            JSONObject result = new JSONObject();
                            result.put("id", id);
                            result.put("latitude", lat);
                            result.put("longitude", lng);
                            found.put(result);
                        } catch (Exception ignored) { /* Keep the store distance unavailable. */ }
                    }
                } catch (Exception ignored) { /* An empty result is a valid fallback. */ }
                final String data = found.toString();
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript("window.b3StoreCoordinates("+JSONObject.quote(data)+")", null);
                });
            }).start();
        }
        /**
         * Geocode the explicit delivery address after the customer taps Confirmar.
         * Uses Android's available geocoder (no paid Google Routes API). This is
         * an approximate location; reject results without a street reference.
         */
        @JavascriptInterface public void geocodeDeliveryAddress(String json) {
            new Thread(() -> {
                String token = "";
                Double latitude = null, longitude = null;
                String error = null;
                try {
                    JSONObject request = new JSONObject(json);
                    token = request.optString("token", "");
                    String address = request.optString("address", "").trim();
                    String district = request.optString("district", "").trim();
                    if (!token.matches("[0-9]{1,12}") || address.length() < 6 ||
                        address.length() > 180 || district.length() < 2 || district.length() > 80) {
                        throw new IllegalArgumentException("Dirección incompleta");
                    }
                    if (!Geocoder.isPresent()) throw new IllegalStateException("El servicio de ubicación por dirección no está disponible");
                    Geocoder geocoder = new Geocoder(MainActivity.this, new Locale("es", "PE"));
                    List<Address> matches = geocoder.getFromLocationName(address + ", " + district + ", Perú", 3);
                    if (matches != null) {
                        for (Address item : matches) {
                            if (!item.hasLatitude() || !item.hasLongitude()) continue;
                            if (item.getCountryCode() != null && !"PE".equalsIgnoreCase(item.getCountryCode())) continue;
                            if (item.getThoroughfare() == null || item.getThoroughfare().trim().isEmpty()) continue;
                            double lat = item.getLatitude(), lng = item.getLongitude();
                            // Geographic bounds of Peru. Coverage is always calculated by the server.
                            if (lat < -19 || lat > 1 || lng < -83 || lng > -68) continue;
                            latitude = lat; longitude = lng; break;
                        }
                    }
                    if (latitude == null) throw new IllegalStateException("No se ubicó una calle exacta. Usa la ubicación actual cuando estés en el destino.");
                } catch (Exception ex) {
                    error = ex.getMessage() == null ? "No se pudo localizar la dirección" : ex.getMessage();
                }
                final String resultToken = token;
                final String latArg = latitude == null ? "null" : String.valueOf(latitude);
                final String lngArg = longitude == null ? "null" : String.valueOf(longitude);
                final String errArg = error == null ? "null" : JSONObject.quote(error);
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript(
                        "window.b3DeliveryAddressGeocoded(" + JSONObject.quote(resultToken) + "," +
                        latArg + "," + lngArg + "," + errArg + ")", null);
                });
            }).start();
        }
        /**
         * Convert GPS coordinates into a human-readable address on explicit user request.
         * Geocoder data may be approximate and must be reviewed before checkout.
         */
        @JavascriptInterface public void reverseGeocodeDeliveryLocation(String json) {
            new Thread(() -> {
                String token = "", street = "", district = "", error = "";
                boolean hasNumber = false;
                try {
                    JSONObject request = new JSONObject(json);
                    token = request.optString("token", "");
                    double latitude = request.optDouble("latitude", Double.NaN);
                    double longitude = request.optDouble("longitude", Double.NaN);
                    if (!token.matches("[0-9]{1,12}") || !Double.isFinite(latitude) ||
                        !Double.isFinite(longitude) || latitude < -19 || latitude > 1 ||
                        longitude < -83 || longitude > -68) {
                        throw new IllegalArgumentException("Coordenadas inválidas para buscar la dirección");
                    }
                    if (!Geocoder.isPresent()) {
                        throw new IllegalStateException("Android no dispone de un servicio para identificar la dirección");
                    }
                    Geocoder geocoder = new Geocoder(MainActivity.this, new Locale("es", "PE"));
                    List<Address> matches = geocoder.getFromLocation(latitude, longitude, 3);
                    if (matches != null) {
                        for (Address match : matches) {
                            if (match.getCountryCode() != null &&
                                !"PE".equalsIgnoreCase(match.getCountryCode())) continue;
                            String road = match.getThoroughfare();
                            if (road == null || road.trim().isEmpty()) continue;
                            String number = match.getSubThoroughfare();
                            hasNumber = number != null && !number.trim().isEmpty();
                            street = road.trim() + (hasNumber ? " " + number.trim() : "");
                            String neighborhood = match.getSubLocality();
                            String locality = match.getLocality();
                            district = neighborhood != null && !neighborhood.trim().isEmpty()
                                ? neighborhood.trim()
                                : locality != null ? locality.trim() : "";
                            break;
                        }
                    }
                    if (street.isEmpty()) {
                        throw new IllegalStateException("No se encontró una calle para esta ubicación. Escribe la dirección manualmente.");
                    }
                } catch (Exception ex) {
                    error = ex.getMessage() == null
                        ? "No se pudo identificar una dirección postal"
                        : ex.getMessage();
                }
                final String tokenArg = JSONObject.quote(token);
                final String streetArg = JSONObject.quote(street);
                final String districtArg = JSONObject.quote(district);
                final String numberArg = hasNumber ? "true" : "false";
                final String errorArg = JSONObject.quote(error);
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript(
                        "window.b3DeliveryGpsAddress(" + tokenArg + "," + streetArg + "," +
                        districtArg + "," + numberArg + "," + errorArg + ")", null);
                });
            }).start();
        }
        /** Open only verified wa.me applicant links, without exposing arbitrary Intent URLs. */
        @JavascriptInterface public void openApplicantWhatsApp(String url) {
            try {
                Uri uri = Uri.parse(url);
                if (!"https".equals(uri.getScheme()) || !"wa.me".equals(uri.getHost())) return;
                String path = uri.getPath();
                if (path == null || !path.matches("/519[0-9]{8}")) return;
                String message = uri.getQueryParameter("text");
                if (message == null || message.length() > 350 || !message.startsWith("Hola, estoy interesado(a) en trabajar en Pollos B3.")) return;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) { }
        }
        /** Open an HTTPS complaints book or official consumer guidance outside the WebView. */
        @JavascriptInterface public void openComplaintsBook(String url) {
            try {
                Uri uri = Uri.parse(url);
                if (!"https".equals(uri.getScheme()) || uri.getHost() == null ||
                    uri.getUserInfo() != null || uri.getPort() != -1) return;
                String host = uri.getHost().toLowerCase(java.util.Locale.ROOT);
                if (host.equals("localhost") || host.equals("0.0.0.0") ||
                    host.endsWith(".local") || host.endsWith(".internal") ||
                    host.matches("[0-9.]+") || host.contains("..") ||
                    url.length() > 1024) return;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) { }
        }
        /**
         * Fixed-purpose HTTPS connector for the Administrator's public mobile order API.
         * Requests originate only from bundled WebView assets; the JS caller never
         * chooses an origin/path, supplies S2S secrets or receives HTTP redirect URLs.
         * Native transport avoids relying on cross-origin WebView POST/GET CORS headers.
         */
        @JavascriptInterface public void orderAvailabilityRequest(String requestJson) {
            new Thread(() -> {
                JSONObject reply = new JSONObject();
                String requestId = "";
                try {
                    JSONObject request = new JSONObject(requestJson);
                    requestId = request.optString("requestId", "");
                    if (!requestId.matches("oa_[0-9]{1,10}"))
                        throw new IllegalArgumentException("Invalid request ID");
                    reply.put("requestId", requestId);
                    String origin = getString(R.string.b3_api_base).trim().replaceAll("/+$", "");
                    java.net.URI base = new java.net.URI(origin);
                    if (!"https".equalsIgnoreCase(base.getScheme()) ||
                        base.getHost() == null || base.getUserInfo() != null ||
                        (base.getRawPath() != null && !base.getRawPath().isEmpty()) ||
                        base.getRawQuery() != null || base.getRawFragment() != null)
                        throw new IllegalArgumentException("Invalid HTTPS backend");
                    String operation = request.optString("operation", "");
                    String path;
                    String body = null;
                    String token = null;
                    String key = null;
                    String accessKey = null;
                    if ("POST".equals(operation)) {
                        key = request.optString("idempotencyKey", "");
                        JSONObject payload = request.optJSONObject("body");
                        if (!key.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            payload == null ||
                            !payload.optString("validationToken", "").matches("ordv1_[A-Za-z0-9_-]{43}"))
                            throw new IllegalArgumentException("Invalid POST");
                        body = payload.toString();
                        if (body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 65536)
                            throw new IllegalArgumentException("Body too large");
                        path = "/api/v1/mobile/orders/availability";
                    } else if ("AGENT_AVAILABILITY".equals(operation)) {
                        String storeId = request.optString("storeId", "");
                        String appId = request.optString("appId", "");
                        if (!storeId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !appId.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}"))
                            throw new IllegalArgumentException("Invalid store or app ID");
                        path = "/api/v1/mobile/stores/" + storeId +
                            "/agent-availability?appId=" + java.net.URLEncoder.encode(appId, "UTF-8");
                    } else if ("DELIVERY_QUOTE".equals(operation)) {
                        JSONObject payload = request.optJSONObject("body");
                        if (payload == null || !"delivery".equals(payload.optString("mode")) ||
                            !payload.optString("appId", "").matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}") ||
                            payload.optString("address", "").length() > 250 ||
                            payload.optString("district", "").length() > 90)
                            throw new IllegalArgumentException("Invalid delivery quote");
                        body = payload.toString();
                        path = "/api/v1/mobile/fulfillment/resolve";
                    } else if ("INTERACTION_CREATE".equals(operation)) {
                        JSONObject payload = request.optJSONObject("body");
                        key = request.optString("idempotencyKey", "");
                        if (payload == null ||
                            !key.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !payload.optString("appId", "").matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}") ||
                            !payload.optString("storeId", "").matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            payload.optInt("catalogRevision", payload.optInt("quoteRevision", 0)) < 1 ||
                            payload.optJSONArray("items") == null ||
                            payload.optString("customerExternalId", "").isEmpty())
                            throw new IllegalArgumentException("Invalid interaction request");
                        body = payload.toString();
                        path = "/api/v1/mobile/interactions";
                    } else if ("INTERACTION_MESSAGE".equals(operation)) {
                        JSONObject payload = request.optJSONObject("body");
                        String interactionId = request.optString("interactionId", "");
                        accessKey = request.optString("accessKey", "");
                        if (payload == null ||
                            !interactionId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !accessKey.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !payload.optString("appId", "").matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}") ||
                            !payload.optString("storeId", "").matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            payload.optInt("catalogRevision", payload.optInt("quoteRevision", 0)) < 1 ||
                            payload.optJSONArray("items") == null || payload.optJSONObject("customer") == null)
                            throw new IllegalArgumentException("Invalid interaction message request");
                        body = payload.toString();
                        path = "/api/v1/mobile/interactions/" + interactionId + "/message";
                    } else if ("INTERACTION_STATUS".equals(operation) ||
                               "INTERACTION_CANCEL".equals(operation)) {
                        String appId = request.optString("appId", "");
                        String storeId = request.optString("storeId", "");
                        String interactionId = request.optString("interactionId", "");
                        accessKey = request.optString("accessKey", "");
                        if (!appId.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}") ||
                            !storeId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !interactionId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !accessKey.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                            throw new IllegalArgumentException("Invalid interaction tracking");
                        path = "/api/v1/mobile/interactions/" + interactionId;
                        if ("INTERACTION_STATUS".equals(operation)) {
                            path += "/status?appId=" + java.net.URLEncoder.encode(appId, "UTF-8") +
                                "&storeId=" + java.net.URLEncoder.encode(storeId, "UTF-8");
                        } else {
                            path += "/cancel";
                            JSONObject cancellation = new JSONObject();
                            cancellation.put("appId", appId);
                            cancellation.put("storeId", storeId);
                            body = cancellation.toString();
                        }
                    } else if ("GET".equals(operation)) {
                        String id = request.optString("validationId", "");
                        token = request.optString("validationToken", "");
                        if (!id.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !token.matches("ordv1_[A-Za-z0-9_-]{43}"))
                            throw new IllegalArgumentException("Invalid GET");
                        path = "/api/v1/mobile/orders/availability/" + id;
                    } else if ("HEALTH".equals(operation)) {
                        // Read-only database readiness check; never create an interaction.
                        path = "/health/ready";
                    } else if ("HEALTH_LIVE".equals(operation)) {
                        // Read-only service liveness check; no DB query and no credentials.
                        path = "/health/live";
                    } else {
                        throw new IllegalArgumentException("Unsupported operation");
                    }
                    if (body != null &&
                        body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 65536)
                        throw new IllegalArgumentException("Body too large");
                    java.net.URL destination = new java.net.URL(origin + path);
                    java.net.HttpURLConnection connection =
                        (java.net.HttpURLConnection) destination.openConnection();
                    try {
                        connection.setInstanceFollowRedirects(false);
                        connection.setConnectTimeout(12000);
                        connection.setReadTimeout(15000);
                        String httpMethod = "HEALTH".equals(operation) || "HEALTH_LIVE".equals(operation) ||
                            "AGENT_AVAILABILITY".equals(operation) || "INTERACTION_STATUS".equals(operation) ? "GET" :
                            "DELIVERY_QUOTE".equals(operation) || "INTERACTION_CREATE".equals(operation) ||
                            "INTERACTION_MESSAGE".equals(operation) || "INTERACTION_CANCEL".equals(operation) ? "POST" : operation;
                        connection.setRequestMethod(httpMethod);
                        connection.setRequestProperty("Accept", "application/json");
                        connection.setRequestProperty("Cache-Control", "no-store");
                        if (accessKey != null) connection.setRequestProperty("X-Order-Access-Key", accessKey);
                        if ("POST".equals(httpMethod)) {
                            connection.setRequestProperty("Content-Type", "application/json");
                            if (key != null) connection.setRequestProperty("Idempotency-Key", key);
                            connection.setDoOutput(true);
                            try (java.io.OutputStream output = connection.getOutputStream()) {
                                output.write(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                            }
                        } else if ("GET".equals(operation)) {
                            connection.setRequestProperty("Authorization", "Bearer " + token);
                        }
                        // Neither diagnostic health GET sends an Authorization header.
                        int status = connection.getResponseCode();
                        reply.put("status", status);
                        if (status >= 300 && status < 400) {
                            reply.put("error", "REDIRECT_BLOCKED");
                        } else {
                            java.io.InputStream stream = status >= 400 ?
                                connection.getErrorStream() : connection.getInputStream();
                            if (stream == null) throw new java.io.IOException("Empty response");
                            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                            try (java.io.InputStream input = stream) {
                                byte[] buffer = new byte[4096];
                                int count;
                                while ((count = input.read(buffer)) != -1) {
                                    if (bytes.size() + count > 65536)
                                        throw new java.io.IOException("Response too large");
                                    bytes.write(buffer, 0, count);
                                }
                            }
                            reply.put("data", new JSONObject(bytes.toString("UTF-8")));
                        }
                    } finally {
                        connection.disconnect();
                    }
                } catch (Exception ignored) {
                    try { reply.put("error", "NETWORK_OR_CONTRACT_ERROR"); } catch (Exception ignored2) {}
                }
                final String payload = reply.toString();
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript(
                        "window.b3OrderAvailabilityNativeResponse && window.b3OrderAvailabilityNativeResponse(" +
                        JSONObject.quote(payload) + ")", null);
                });
            }, "b3-order-availability").start();
        }
        @JavascriptInterface public void openMaps(String url) {
            try {
                Uri uri = Uri.parse(url);
                if (!"https".equals(uri.getScheme()) || !"www.google.com".equals(uri.getHost()) ||
                    !"/maps/search/".equals(uri.getPath())) return;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) { }
        }
    }
    private void sendLocation(Double lat, Double lon, String error) {
        if (web == null) return;
        String a = lat == null ? "null" : String.valueOf(lat);
        String b = lon == null ? "null" : String.valueOf(lon);
        String c = error == null ? "null" : JSONObject.quote(error);
        web.evaluateJavascript("window.b3NativeLocation("+a+","+b+","+c+")", null);
    }
    private void requestOptionalLocation() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION_REQUEST);
            return;
        }
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        String provider = locationManager != null && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            ? LocationManager.GPS_PROVIDER
            : locationManager != null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                ? LocationManager.NETWORK_PROVIDER : null;
        if (provider == null) {
            sendLocation(null,null,"Activa la ubicación del teléfono y vuelve a intentarlo.");
            return;
        }
        try {
            if (currentListener != null) locationManager.removeUpdates(currentListener);
            currentListener = location -> {
                if (currentListener != null) {
                    locationManager.removeUpdates(currentListener);
                    currentListener = null;
                }
                sendLocation(location.getLatitude(),location.getLongitude(),null);
            };
            // One foreground GPS fix only, no background collection.
            locationManager.requestSingleUpdate(provider,currentListener,null);
            web.postDelayed(() -> {
                if (currentListener != null) {
                    try {locationManager.removeUpdates(currentListener);}catch(Exception ignored){}
                    currentListener=null;
                    sendLocation(null,null,"No se pudo determinar la ubicación. Ingresa una dirección y vuelve a intentarlo.");
                }
            }, 15000);
        } catch (SecurityException e) {
            sendLocation(null,null,"No hay permiso para obtener la ubicación.");
        }
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if(requestCode==NOTIFICATION_REQUEST){
            if(grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED)setMarketingOptIn(true);
            else sendMarketingStatus(false,"Android no autorizó mostrar avisos. Puedes habilitarlos en Ajustes.");
            return;
        }
        if (requestCode == LOCATION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) requestOptionalLocation();
            else sendLocation(null,null,"Permiso de ubicación denegado. Puedes escribir tu dirección manualmente.");
        }
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        pendingOpenHome = isPollosB3OpenLink(getIntent());
        pendingNotificationsScreen = isMarketingNotificationIntent(getIntent());
        pendingNotificationId = pendingNotificationsScreen ? getNotificationId(getIntent()) : "";
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            if(manager!=null)manager.createNotificationChannel(new NotificationChannel(NOTIFICATION_CHANNEL,"Ofertas Pollos B3",NotificationManager.IMPORTANCE_DEFAULT));
        }
        if(marketingEnabled())FirebaseMessaging.getInstance().subscribeToTopic(MARKETING_TOPIC);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(9, 0, 1));
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (LOCAL_APP_URL.equals(url)) {
                    appLinkPageReady = true;
                    dispatchPendingAppLink();
                    dispatchPendingNotificationsScreen();
                }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                return !("https".equals(uri.getScheme()) &&
                    "appassets.androidplatform.net".equals(uri.getHost()) &&
                    uri.getPath() != null && uri.getPath().startsWith("/assets/"));
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        web.loadUrl(LOCAL_APP_URL);
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.handleB3Back ? window.handleB3Back() : false", result -> {
            if (!"true".equals(result)) { if (web.canGoBack()) web.goBack(); else finish(); }
        });
    }
    @Override protected void onDestroy() {
        appLinkPageReady = false;
        pendingOpenHome = false;
        pendingNotificationsScreen = false;
        pendingNotificationId = "";
        if (locationManager != null && currentListener != null) try {locationManager.removeUpdates(currentListener);}catch(Exception ignored){}
        if (web != null) { web.removeJavascriptInterface("AndroidBridge"); web.destroy(); web=null; }
        super.onDestroy();
    }
}