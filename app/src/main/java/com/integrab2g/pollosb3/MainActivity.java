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
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.ClearCredentialException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.GoogleAuthProvider;
import android.os.CancellationSignal;
import android.provider.Settings;
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
    private static final int PERSONAL_NOTIFICATION_REQUEST = 43;
    private static final int PAYMENT_FILE_REQUEST = 44;
    private android.webkit.ValueCallback<Uri[]> paymentFileCallback;
    private Uri selectedPaymentProofUri;
    static final String MARKETING_TOPIC = "pollosb3_promotions";
    static final String NOTIFICATION_CHANNEL = "pollosb3_promotions";
    static final String PERSONAL_ORDER_CHANNEL = "pollosb3_personal_orders";
    private String pendingPersonalInteractionId = "";
    static final String PREFS = "b3_push_settings";
    private boolean pendingNotificationsScreen = false;
    private String pendingNotificationId = "";
    private WebView web;
    private WebViewAssetLoader assetLoader;
    private LocationManager locationManager;
    private LocationListener currentListener;
    private boolean resumeLocationAfterSettings = false;
    private boolean appLinkPageReady = false;
    private boolean pendingOpenHome = false;
    private boolean googleSignInRunning = false;
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
    private void dispatchPendingPersonalCheckout() {
        if (pendingPersonalInteractionId.isEmpty() || !appLinkPageReady || web == null) return;
        String id=pendingPersonalInteractionId;
        pendingPersonalInteractionId="";
        web.evaluateJavascript("window.b3OpenPersonalOrderNotification && window.b3OpenPersonalOrderNotification("+JSONObject.quote(id)+")",null);
    }
    private static String personalInteractionFromIntent(Intent intent){
        if(intent==null || !intent.getBooleanExtra("b3_open_personal_order",false))return "";
        String id=intent.getStringExtra("interactionId");
        return id!=null&&id.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")?id:"";
    }
    private void dispatchPendingAppLink() {
        if (!pendingOpenHome || !appLinkPageReady || web == null) return;
        pendingOpenHome = false;
        web.evaluateJavascript("window.b3OpenFromLink && window.b3OpenFromLink()", null);
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode!=PAYMENT_FILE_REQUEST)return;
        android.webkit.ValueCallback<Uri[]> callback=paymentFileCallback;
        paymentFileCallback=null;
        if(callback==null)return;
        Uri uri=resultCode==RESULT_OK&&data!=null?data.getData():null;
        selectedPaymentProofUri=uri;
        // Keep only the explicit user-selected URI for secure payment proof upload.
        callback.onReceiveValue(uri==null?null:new Uri[]{uri});
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingPersonalInteractionId=personalInteractionFromIntent(intent);
        dispatchPendingPersonalCheckout();
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
    /** Only verified Firebase identity metadata reaches the local UI: no ID tokens or secrets. */
    private void sendGoogleAuth(String status, String message, FirebaseUser user) {
        JSONObject result = new JSONObject();
        try {
            result.put("status", status);
            result.put("message", message);
            if ("SIGNED_IN".equals(status) && user != null && user.isEmailVerified()) {
                result.put("uid", user.getUid());
                result.put("displayName", user.getDisplayName() == null ? "" : user.getDisplayName());
                result.put("email", user.getEmail() == null ? "" : user.getEmail());
                result.put("emailVerified", true);
            }
        } catch (Exception ignored) {}
        final String json = result.toString();
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(
                "window.b3GoogleAuthResult && window.b3GoogleAuthResult(" + json + ")", null);
        });
    }

    /** The button launches native Google Credential Manager, never a WebView OAuth popup. */
    private void startGoogleSignIn() {
        if (googleSignInRunning) return;
        String webClientId = getString(R.string.b3_google_web_client_id).trim();
        if (!webClientId.matches("[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com")) {
            sendGoogleAuth("ERROR", "Google aún no está configurado en Pollos B3.", null);
            return;
        }
        googleSignInRunning = true;
        try {
            GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(webClientId).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(option).build();
            CredentialManager.create(this).getCredentialAsync(
                this, request, new CancellationSignal(), getMainExecutor(),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override public void onResult(GetCredentialResponse response) {
                        Credential credential = response.getCredential();
                        if (!(credential instanceof CustomCredential) ||
                            !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                            googleSignInRunning = false;
                            sendGoogleAuth("ERROR", "No recibimos una cuenta de Google válida.", null);
                            return;
                        }
                        try {
                            GoogleIdTokenCredential token = GoogleIdTokenCredential.createFrom(
                                ((CustomCredential) credential).getData());
                            FirebaseAuth.getInstance().signInWithCredential(
                                GoogleAuthProvider.getCredential(token.getIdToken(), null))
                                .addOnCompleteListener(MainActivity.this, task -> {
                                    googleSignInRunning = false;
                                    FirebaseUser user = task.isSuccessful()
                                        ? FirebaseAuth.getInstance().getCurrentUser() : null;
                                    if (user != null && user.isEmailVerified()) {
                                        sendGoogleAuth("SIGNED_IN", "", user);
                                    } else {
                                        FirebaseAuth.getInstance().signOut();
                                        sendGoogleAuth("ERROR", "No se pudo verificar la cuenta de Google.", null);
                                    }
                                });
                        } catch (Exception ignored) {
                            googleSignInRunning = false;
                            sendGoogleAuth("ERROR", "No se pudo procesar la identidad de Google.", null);
                        }
                    }
                    @Override public void onError(GetCredentialException error) {
                        googleSignInRunning = false;
                        if (error instanceof GetCredentialCancellationException)
                            sendGoogleAuth("CANCELLED", "", null);
                        else sendGoogleAuth("ERROR", "No se pudo iniciar sesión con Google. Comprueba tu conexión y la configuración.", null);
                    }
                });
        } catch (Exception ignored) {
            googleSignInRunning = false;
            sendGoogleAuth("ERROR", "Google no está disponible en este dispositivo.", null);
        }
    }

    private void refreshGoogleAuthState() {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) {
            sendGoogleAuth("SIGNED_OUT", "", null);
            return;
        }
        // Force server validation once per app start, never trust local WebView flags.
        user.getIdToken(true).addOnCompleteListener(MainActivity.this, task -> {
            FirebaseUser verified = FirebaseAuth.getInstance().getCurrentUser();
            if (task.isSuccessful() && verified != null && verified.isEmailVerified()) {
                sendGoogleAuth("SIGNED_IN", "", verified);
            } else {
                FirebaseAuth.getInstance().signOut();
                sendGoogleAuth("SIGNED_OUT", "", null);
            }
        });
    }

    private void signOutGoogle() {
        FirebaseAuth.getInstance().signOut();
        sendGoogleAuth("SIGNED_OUT", "", null);
        try {
            CredentialManager.create(this).clearCredentialStateAsync(
                new ClearCredentialStateRequest(), null, getMainExecutor(),
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override public void onResult(Void unused) {}
                    @Override public void onError(ClearCredentialException ignored) {}
                });
        } catch (Exception ignored) {}
    }

    private final class Bridge {
        @JavascriptInterface public void signInWithGoogle() {
            runOnUiThread(() -> startGoogleSignIn());
        }
        @JavascriptInterface public void requestGoogleAuthState() {
            runOnUiThread(() -> refreshGoogleAuthState());
        }
        @JavascriptInterface public void signOutGoogle() {
            runOnUiThread(() -> MainActivity.this.signOutGoogle());
        }
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
        /** Metadata-only audit marker: never logs payloads, keys, names or addresses. */
        @JavascriptInterface public void orderFormDiagnostic(String stage,int count,int status,String type,String result){
            if(!("JS_BUILD".equals(stage)||"JS_RESPONSE".equals(stage))||count!=3||
               status<0||status>599)return;
            String safeType="FORM".equals(type)?"FORM":"TEXT".equals(type)?"TEXT":"OTHER";
            String safeResult="ACK".equals(result)?"ACK":"NO_ACK".equals(result)?"NO_ACK":"UNKNOWN";
            android.util.Log.i("B3FormAudit","stage="+stage+" type="+safeType+
                " fields="+count+" httpStatus="+status+" result="+safeResult);
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
        /** Personal FCM token is used only with the server-authorized interaction; never a topic. */
        @JavascriptInterface public void requestPersonalPushToken() {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{
                if(!task.isSuccessful()||task.getResult()==null)return;
                final String value=task.getResult();
                runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.b3PersonalPushToken && window.b3PersonalPushToken("+JSONObject.quote(value)+")",null);});
            });
            if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
                runOnUiThread(()->requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},PERSONAL_NOTIFICATION_REQUEST));
            }
        }
        @JavascriptInterface public void requestLocation() {
            runOnUiThread(() -> requestOptionalLocation());
        }
        /** Explicit user action only; Android must enable device location itself. */
        @JavascriptInterface public void openLocationSettings() {
            runOnUiThread(() -> openNativeLocationSettings(false));
        }
        /** Direct the user to this app's permissions, never modify permissions silently. */
        @JavascriptInterface public void openAppLocationSettings() {
            runOnUiThread(() -> openNativeLocationSettings(true));
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
                            // getSubLocality() is usually a condominium,
                            // urbanization or neighborhood, NOT a district.
                            // Never put it into the administrative district field.
                            String subAdmin = match.getSubAdminArea();
                            String locality = match.getLocality();
                            String administrative = subAdmin == null ? "" : subAdmin.trim();
                            String city = locality == null ? "" : locality.trim();
                            String candidate = !administrative.isEmpty() &&
                                !administrative.equalsIgnoreCase("Lima") &&
                                !administrative.equalsIgnoreCase("Provincia de Lima")
                                ? administrative : city;
                            // "Lima" alone is not enough to identify Ate,
                            // Santa Anita or another delivery district.
                            district = candidate.equalsIgnoreCase("Lima") ? "" : candidate;
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
        /** Download only a published Pollos B3 payment image from the configured API.
         * Never accept arbitrary hosts or content URIs from the WebView.
         */
        @JavascriptInterface public void downloadPaymentImage(String url) {
            try {
                java.net.URI source = new java.net.URI(url);
                java.net.URI base = new java.net.URI(getString(R.string.b3_api_base).trim().replaceAll("/+$", ""));
                if (!"https".equalsIgnoreCase(source.getScheme()) ||
                    source.getHost() == null || base.getHost() == null ||
                    !source.getHost().equalsIgnoreCase(base.getHost()) ||
                    source.getPort() != base.getPort() ||
                    source.getUserInfo() != null || source.getRawQuery() != null ||
                    source.getRawFragment() != null ||
                    !source.getPath().matches("/api/v1/mobile/images/[a-zA-Z0-9/_-]+"))
                    return;
                android.app.DownloadManager.Request request =
                    new android.app.DownloadManager.Request(Uri.parse(url));
                request.setTitle("Imagen de pago Pollos B3");
                request.setDescription("Imagen publicada por Pollos B3");
                request.setMimeType("image/png");
                request.setNotificationVisibility(
                    android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(MainActivity.this,
                    android.os.Environment.DIRECTORY_DOWNLOADS,
                    "PollosB3-pago-" + System.currentTimeMillis() + ".png");
                android.app.DownloadManager manager =
                    (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (manager != null) manager.enqueue(request);
            } catch (Exception ignored) {
                // Never fall back to loading an arbitrary URL.
            }
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
                String operation = "";
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
                    operation = request.optString("operation", "");
                    String path;
                    String body = null;
                    String token = null;
                    String key = null;
                    String accessKey = null;
                    int approvalFormFields=0;
                    byte[] paymentReceiptBytes=null;
                    String paymentReceiptMime=null;
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
                    } else if ("INTERACTION_RECEIPT_UPLOAD".equals(operation)) {
                        String appId=request.optString("appId","");
                        String storeId=request.optString("storeId","");
                        String interactionId=request.optString("interactionId","");
                        accessKey=request.optString("accessKey","");
                        key=request.optString("receiptId","");
                        if (!appId.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}") ||
                            !storeId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !interactionId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !accessKey.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !key.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            key.equalsIgnoreCase(accessKey)||selectedPaymentProofUri==null)
                            throw new IllegalArgumentException("Invalid proof upload identifiers");
                        try(java.io.InputStream input=getContentResolver().openInputStream(selectedPaymentProofUri);
                            java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream()){
                            if(input==null)throw new IllegalArgumentException("Cannot read selected image");
                            byte[] buffer=new byte[8192];int n;
                            while((n=input.read(buffer))!=-1){
                                if(output.size()+n>4*1024*1024)throw new IllegalArgumentException("Proof exceeds 4MB");
                                output.write(buffer,0,n);
                            }
                            paymentReceiptBytes=output.toByteArray();
                        }
                        if(paymentReceiptBytes.length<12)throw new IllegalArgumentException("Invalid proof bytes");
                        if((paymentReceiptBytes[0]&255)==255&&(paymentReceiptBytes[1]&255)==216&&(paymentReceiptBytes[2]&255)==255)
                            paymentReceiptMime="image/jpeg";
                        else if((paymentReceiptBytes[0]&255)==137&&(paymentReceiptBytes[1]&255)==80&&
                                (paymentReceiptBytes[2]&255)==78&&(paymentReceiptBytes[3]&255)==71)
                            paymentReceiptMime="image/png";
                        else throw new IllegalArgumentException("Proof must be JPEG or PNG");
                        path="/api/v1/mobile/interactions/"+interactionId+"/payment-receipt/upload?appId="+
                            java.net.URLEncoder.encode(appId,"UTF-8")+"&storeId="+
                            java.net.URLEncoder.encode(storeId,"UTF-8");
                    } else if ("INTERACTION_PAYMENT_FORM".equals(operation)) {
                        JSONObject payload=request.optJSONObject("body");
                        String interactionId=request.optString("interactionId","");
                        accessKey=request.optString("accessKey","");
                        key=request.optString("idempotencyKey","");
                        if(payload==null||payload.length()!=3||
                            !key.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")||
                            key.equalsIgnoreCase(accessKey)||
                            !interactionId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")||
                            !accessKey.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")||
                            !payload.optString("appId","").matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}")||
                            !payload.optString("storeId","").matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                            throw new IllegalArgumentException("Invalid payment FORM identifiers");
                        JSONObject form=payload.optJSONObject("form");
                        JSONArray fields=form==null?null:form.optJSONArray("fields");
                        boolean scheduledPayment=form!=null&&form.optString("title","").startsWith("PAGO DE RESERVA - ");
                        String[] required=scheduledPayment?new String[]{"Fecha","N.º de pedido","Pedido","Subtotal","Delivery","Dirección","Total"}:new String[]{"N.º de pedido","Pedido","Subtotal","Delivery","Dirección","Total"};
                        if(form==null||form.length()!=4||
                           !form.optString("title","").matches("PAGO (REALIZADO|DE RESERVA) - (YAPE|PLIN|TARJETA)")||
                           !"Comprobante adjunto".equals(form.optString("subtitle",""))||
                           fields==null||fields.length()!=required.length)
                            throw new IllegalArgumentException("Invalid payment FORM");
                        String imageUrl=form.optString("imageUrl","");
                        try {
                            java.net.URI image=new java.net.URI(imageUrl);
                            if(!"https".equalsIgnoreCase(image.getScheme())||
                               image.getHost()==null||image.getUserInfo()!=null||
                               image.getRawQuery()!=null||image.getRawFragment()!=null||
                               !image.getPath().matches("/api/v1/mobile/payment-receipts/images/[0-9a-fA-F-]{36}"))
                                throw new IllegalArgumentException("Invalid payment receipt URL");
                        } catch(java.net.URISyntaxException exception){
                            throw new IllegalArgumentException("Invalid payment receipt URL");
                        }
                        for(int i=0;i<required.length;i++){
                            JSONObject field=fields.optJSONObject(i);
                            if(field==null||field.length()!=2||
                               !required[i].equals(field.optString("variable",""))||
                               field.optString("value","").trim().isEmpty()||
                               field.optString("value","").length()>500)
                                throw new IllegalArgumentException("Invalid payment FORM field");
                        }
                        approvalFormFields=required.length;
                        body=payload.toString();
                        path="/api/v1/mobile/interactions/"+interactionId+"/payment-receipt";
                    } else if ("INTERACTION_MESSAGE".equals(operation)) {
                        JSONObject payload = request.optJSONObject("body");
                        String interactionId = request.optString("interactionId", "");
                        accessKey = request.optString("accessKey", "");
                        key = request.optString("idempotencyKey", "");
                        if (payload == null ||
                            !key.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            key.equalsIgnoreCase(accessKey) ||
                            !interactionId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !accessKey.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") ||
                            !payload.optString("appId", "").matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}") ||
                            !payload.optString("storeId", "").matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                            throw new IllegalArgumentException("Invalid interaction message identifiers");
                        // Only the approval ticket for a Delivery order may use this operation.
                        // Reject all legacy text or other message types at the native boundary.
                        JSONObject form = payload.optJSONObject("form");
                        JSONArray fields = form == null ? null : form.optJSONArray("fields");
                        boolean scheduledOrder = form!=null&&"VALIDACIÓN DE RESERVA".equals(form.optString("title",""));
                        boolean pickupApproval=form!=null&&"VALIDACIÓN DE RECOJO".equals(form.optString("title",""));
                        boolean orderApproval = scheduledOrder||"VALIDACIÓN DE PEDIDO".equals(form == null ? "" : form.optString("title",""));
                        boolean cashApproval=form!=null&&form.optString("title","").matches("PAGO (AL RECIBIR|DE RESERVA - EFECTIVO)");
                        boolean cashScheduled=cashApproval&&form.optString("title","").startsWith("PAGO DE RESERVA");
                        boolean paymentApproval = form != null &&
                            form.optString("title","").matches("PAGO REALIZADO - (YAPE|PLIN|TARJETA)");
                        if (!"FORM".equals(payload.optString("type", "")) ||
                            payload.length() != 4 || form == null || form.length() != ((orderApproval||pickupApproval||cashApproval)?3:4) ||
                            form.optString("title", "").length() > 180 ||
                            form.optString("subtitle", "").length() > 350 ||
                            !(orderApproval || pickupApproval || paymentApproval || cashApproval) ||
                            (cashApproval&&(!"Confirmar pedido con pago en efectivo".equals(form.optString("subtitle",""))||fields==null||fields.length()!=(cashScheduled?9:8))) ||
                            (orderApproval && (!(scheduledOrder?"Confirmar disponibilidad para delivery programado":"Confirmar disponibilidad para delivery").equals(form.optString("subtitle", "")) ||
                                fields == null || fields.length() < (scheduledOrder?4:3) || fields.length() > 10)) ||
                            (paymentApproval && (!"Comprobante adjunto".equals(form.optString("subtitle", "")) ||
                                !form.optString("imageUrl","").matches("https://[^\\s<>\\\"]+/api/v1/mobile/payment-receipts/[0-9a-fA-F-]{36}") ||
                                fields == null || fields.length() != 5)))
                            throw new IllegalArgumentException("Invalid Pollos B3 approval FORM");
                        if(pickupApproval){
                            if(!"Confirmar disponibilidad de productos para retiro en tienda".equals(form.optString("subtitle",""))||
                               fields==null||(fields.length()!=6&&fields.length()!=7))
                                throw new IllegalArgumentException("Invalid pickup approval FORM");
                            String[] requiredPickup=fields.length()==7?
                                new String[]{"Cliente","Celular","Productos","Subtotal","Tienda de recojo","Modalidad","Fecha y hora"}:
                                new String[]{"Cliente","Celular","Productos","Subtotal","Tienda de recojo","Modalidad"};
                            for(int j=0;j<requiredPickup.length;j++){
                                JSONObject f=fields.optJSONObject(j);
                                if(f==null||f.length()!=2||!requiredPickup[j].equals(f.optString("variable",""))||
                                   f.optString("value","").trim().isEmpty()||f.optString("value","").length()>500)
                                    throw new IllegalArgumentException("Invalid pickup FORM field");
                            }
                            if(!(fields.length()==7?"Recojo programado":"Retirar ahora").equals(fields.optJSONObject(5).optString("value","")))
                                throw new IllegalArgumentException("Invalid pickup modality");
                        }
                        int offset=scheduledOrder?1:0;
                        int productsCount=orderApproval?fields.length()-2-offset:0;
                        java.util.HashSet<String> productLabels=new java.util.HashSet<>();
                        for (int i = 0; i < fields.length(); i++) {
                            JSONObject field=fields.optJSONObject(i);
                            String label=field==null?"":field.optString("variable","");
                            String value=field==null?"":field.optString("value","");
                            if(field==null||field.length()!=2||label.trim().isEmpty()||
                               label.length()>80||value.trim().isEmpty()||value.length()>500||
                               !label.trim().equals(label))
                                throw new IllegalArgumentException("Invalid order FORM fields");
                            if(pickupApproval){
                                String[] labels=fields.length()==7?new String[]{"Cliente","Celular","Productos","Subtotal","Tienda de recojo","Modalidad","Fecha y hora"}:new String[]{"Cliente","Celular","Productos","Subtotal","Tienda de recojo","Modalidad"};
                                if(!labels[i].equals(label))throw new IllegalArgumentException("Invalid pickup field order");
                            }else if(orderApproval){
                                if(scheduledOrder&&i==0){
                                    if(!"Fecha".equals(label))throw new IllegalArgumentException("Missing reservation date");
                                    continue;
                                }
                                int row=i-offset;
                                if(row<productsCount){
                                    boolean legacy=fields.length()==3+offset&&"Productos".equals(fields.optJSONObject(offset).optString("variable",""));
                                    boolean indexed=("Producto "+(row+1)).equals(label)||
                                        (row==7&&"Productos 8 en adelante".equals(label));
                                    boolean named=!label.equalsIgnoreCase("Subtotal")&&
                                        !label.equalsIgnoreCase("Dirección y referencia")&&
                                        !label.equalsIgnoreCase("Productos")&&
                                        (!label.equals("Productos restantes")||row==7)&&
                                        (label.equals("Productos restantes")?
                                            value.contains(" × S/ "):
                                            value.matches("[0-9]+ × S/ [0-9]+(?:\\.[0-9]{2})?"));
                                    if(!(legacy||indexed||named)||
                                       !productLabels.add(label.toLowerCase(java.util.Locale.ROOT)))
                                        throw new IllegalArgumentException("Invalid product FORM row");
                                }else if(!(row==productsCount?"Subtotal":"Dirección y referencia").equals(label))
                                    throw new IllegalArgumentException("Invalid order FORM summary");
                            }else{
                                String[] paymentLabels=cashApproval?(cashScheduled?new String[]{"Fecha","N.º de pedido","Pedido","Subtotal","Delivery","Dirección","Total","Paga con","Vuelto"}:new String[]{"N.º de pedido","Pedido","Subtotal","Delivery","Dirección","Total","Paga con","Vuelto"}):new String[]{"Pedido","Subtotal","Delivery","Dirección","Total"};
                                if(!paymentLabels[i].equals(label))
                                    throw new IllegalArgumentException("Invalid payment FORM field");
                            }
                        }
                        approvalFormFields=fields.length();
                        android.util.Log.i("B3FormAudit","stage=NATIVE_VALIDATED type=FORM fields="+approvalFormFields+
                            " endpoint=/api/v1/mobile/interactions/{id}/message");
                        body = payload.toString();
                        path = "/api/v1/mobile/interactions/" + interactionId + "/message";
                    } else if ("ORDER_SURVEY".equals(operation)) {
                        JSONObject payload=request.optJSONObject("body");
                        String interactionId=request.optString("interactionId","");
                        accessKey=request.optString("accessKey","");
                        key=request.optString("idempotencyKey","");
                        // Accept a standard UUID (8-4-4-4-12) for the same interaction used by checkout.
                        // Validate separately to identify the rejected field without
                        // logging customer identifiers or leaking authorization keys.
                        if(payload==null || payload.length()<4 || payload.length()>5)
                            throw new IllegalArgumentException("Invalid survey payload");
                        if(!interactionId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                            throw new IllegalArgumentException("Invalid survey interactionId");
                        if(!accessKey.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                            throw new IllegalArgumentException("Invalid survey accessKey");
                        if(!key.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                            throw new IllegalArgumentException("Invalid survey idempotencyKey");
                        if(key.equalsIgnoreCase(accessKey))
                            throw new IllegalArgumentException("Invalid survey duplicateKey");
                        if(!payload.optString("appId","").equals("com.integrab2g.pollosb3"))
                            throw new IllegalArgumentException("Invalid survey appId");
                        if(!payload.optString("storeId","").matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
                            throw new IllegalArgumentException("Invalid survey storeId");
                        Object rawRating=payload.opt("rating");
                        if(!(rawRating instanceof Number)||
                           ((Number)rawRating).doubleValue()!=Math.rint(((Number)rawRating).doubleValue())||
                           ((Number)rawRating).intValue()<1||((Number)rawRating).intValue()>5)
                            throw new IllegalArgumentException("Invalid survey rating");
                        JSONArray tags=payload.optJSONArray("tags");
                        if(tags==null||tags.length()>5)throw new IllegalArgumentException("Invalid survey tags");
                        java.util.HashSet<String> uniqueTags=new java.util.HashSet<>();
                        java.util.HashSet<String> permitted=new java.util.HashSet<>(
                            java.util.Arrays.asList("Sabor","Temperatura","Tiempo","Presentación","Atención"));
                        for(int i=0;i<tags.length();i++){
                            String tag=tags.optString(i,"");
                            if(!permitted.contains(tag)||!uniqueTags.add(tag))
                                throw new IllegalArgumentException("Invalid survey tag");
                        }
                        if(payload.has("comment")&&
                           (!(payload.opt("comment") instanceof String)||
                            payload.optString("comment","").length()>500))
                            throw new IllegalArgumentException("Invalid survey comment");
                        body=payload.toString();
                        path="/api/v1/mobile/orders/"+interactionId+"/survey";
                    } else if ("INTERACTION_STATUS".equals(operation) ||
                               "INTERACTION_CANCEL".equals(operation) ||
                               "INTERACTION_DEVICE".equals(operation) ||
                               "INTERACTION_PAYMENT".equals(operation) ||
                               "INTERACTION_PAYMENT_STATUS".equals(operation)) {
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
                        if ("INTERACTION_STATUS".equals(operation) || "INTERACTION_PAYMENT_STATUS".equals(operation)) {
                            path += ("INTERACTION_STATUS".equals(operation)?"/status?appId=":"/payment?appId=") + java.net.URLEncoder.encode(appId, "UTF-8") +
                                "&storeId=" + java.net.URLEncoder.encode(storeId, "UTF-8");
                        } else {
                            path += "INTERACTION_CANCEL".equals(operation)?"/cancel":"INTERACTION_DEVICE".equals(operation)?"/device":"/payment";
                            JSONObject payload = new JSONObject();
                            payload.put("appId",appId);
                            payload.put("storeId",storeId);
                            if("INTERACTION_DEVICE".equals(operation)){
                                String fcmToken=request.optString("fcmToken","");
                                if(fcmToken.length()<50||fcmToken.length()>4096||!fcmToken.matches("[A-Za-z0-9_:.-]+"))
                                    throw new IllegalArgumentException("Invalid personal FCM token");
                                payload.put("fcmToken",fcmToken);
                            }
                            if("INTERACTION_CANCEL".equals(operation))payload.put("reason",request.optString("reason","MODIFY"));
                            body=payload.toString();
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
                        final long trafficStartedAt=android.os.SystemClock.elapsedRealtime();
                        connection.setInstanceFollowRedirects(false);
                        connection.setConnectTimeout(12000);
                        // Transmits the exact FORM object; it is never serialized as TEXT.
                        // This timeout covers only transport, never waiting for an agent.
                        connection.setReadTimeout("INTERACTION_RECEIPT_UPLOAD".equals(operation) ? 50000 : "INTERACTION_MESSAGE".equals(operation) ? 25000 : 15000);
                        String httpMethod = "HEALTH".equals(operation) || "HEALTH_LIVE".equals(operation) ||
                            "AGENT_AVAILABILITY".equals(operation) || "INTERACTION_STATUS".equals(operation) ||
                            "INTERACTION_PAYMENT_STATUS".equals(operation) ? "GET" :
                            "DELIVERY_QUOTE".equals(operation) || "INTERACTION_CREATE".equals(operation) ||
                            "INTERACTION_MESSAGE".equals(operation) || "INTERACTION_PAYMENT_FORM".equals(operation) || "INTERACTION_CANCEL".equals(operation) ||
                            "INTERACTION_DEVICE".equals(operation) || "INTERACTION_PAYMENT".equals(operation) ||
                            "INTERACTION_RECEIPT_UPLOAD".equals(operation) || "ORDER_SURVEY".equals(operation) ? "POST" : operation;
                        connection.setRequestMethod(httpMethod);
                        if ("INTERACTION_MESSAGE".equals(operation) || "INTERACTION_PAYMENT_FORM".equals(operation))
                            android.util.Log.i("B3FormAudit","stage=HTTP_OUTBOUND type=FORM fields="+approvalFormFields+
                                " method=POST endpoint="+("INTERACTION_PAYMENT_FORM".equals(operation)?"/api/v1/mobile/interactions/{id}/payment-receipt":"/api/v1/mobile/interactions/{id}/message")+
                                " contentType=application/json accessKeyValid=true messageKeyDistinct=true");
                        connection.setRequestProperty("Accept", "application/json");
                        connection.setRequestProperty("Cache-Control", "no-store");
                        if (accessKey != null) connection.setRequestProperty("X-Order-Access-Key", accessKey);
                        if ("POST".equals(httpMethod)) {
                            connection.setRequestProperty("Content-Type", paymentReceiptBytes==null?"application/json":paymentReceiptMime);
                            if (key != null) connection.setRequestProperty("Idempotency-Key", key);
                            connection.setDoOutput(true);
                            try (java.io.OutputStream output = connection.getOutputStream()) {
                                output.write(paymentReceiptBytes!=null?paymentReceiptBytes:body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                            }
                            if ("INTERACTION_MESSAGE".equals(operation) || "INTERACTION_PAYMENT_FORM".equals(operation))
                                android.util.Log.i("B3FormAudit","stage=HTTP_BODY_WRITTEN type=FORM fields="+approvalFormFields);
                        } else if ("GET".equals(operation)) {
                            connection.setRequestProperty("Authorization", "Bearer " + token);
                        }
                        // Neither diagnostic health GET sends an Authorization header.
                        int status = connection.getResponseCode();
                        // Counts/durations only: never log names, phone, URLs, tokens or order IDs.
                        if ("INTERACTION_STATUS".equals(operation)||
                            "INTERACTION_CREATE".equals(operation)||
                            "INTERACTION_MESSAGE".equals(operation)||
                            "INTERACTION_RECEIPT_UPLOAD".equals(operation)||
                            "INTERACTION_PAYMENT_FORM".equals(operation))
                            android.util.Log.i("B3HttpAudit","operation="+operation+
                                " method="+httpMethod+" status="+status+
                                " durationMs="+(android.os.SystemClock.elapsedRealtime()-trafficStartedAt));
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
                            JSONObject remote = new JSONObject(bytes.toString("UTF-8"));
                            reply.put("data", remote);
                            if("INTERACTION_MESSAGE".equals(operation)||"INTERACTION_PAYMENT_FORM".equals(operation)){
                                String responseType=remote.optString("type","");
                                String safeType="FORM".equals(responseType)?"FORM":
                                    "TEXT".equals(responseType)?"TEXT":"OTHER";
                                android.util.Log.i("B3FormAudit","stage=HTTP_RESPONSE httpStatus="+status+
                                    " responseType="+safeType+" delivered="+remote.optBoolean("delivered",false)+
                                    " hasInteractionId="+remote.has("interactionId")+
                                    " hasMessageId="+remote.has("messageId"));
                            }
                        }
                    } finally {
                        connection.disconnect();
                    }
                } catch (IllegalArgumentException rejected) {
                    if ("INTERACTION_MESSAGE".equals(operation)||"INTERACTION_PAYMENT_FORM".equals(operation))
                        android.util.Log.w("B3FormAudit","stage=LOCAL_REJECT httpStatus=NONE");
                    if ("ORDER_SURVEY".equals(operation))
                        android.util.Log.w("B3SurveyAudit","stage=LOCAL_REJECT httpStatus=NONE reason="+rejected.getMessage());
                    try {
                        reply.put("error", "LOCAL_CONTRACT_REJECTED");
                        if ("ORDER_SURVEY".equals(operation)) {
                            String reason=rejected.getMessage();
                            // Enumerated validation reasons only; do not expose identifiers or comment content.
                            if (reason!=null&&reason.startsWith("Invalid survey "))
                                reply.put("surveyValidationError",reason);
                        }
                    } catch (Exception ignored2) {}
                } catch (Exception ignored) {
                    if ("INTERACTION_MESSAGE".equals(operation))
                        android.util.Log.w("B3FormAudit","stage=TRANSPORT_ERROR httpStatus=UNKNOWN");
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
    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }
    private void openNativeLocationSettings(boolean appPermissions) {
        try {
            resumeLocationAfterSettings = true;
            Intent action = appPermissions
                ? new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))
                : new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            startActivity(action);
        } catch (Exception e) {
            resumeLocationAfterSettings = false;
            sendLocation(null,null,"No se pudieron abrir los ajustes. Activa Ubicación desde los ajustes de Android.");
        }
    }
    @Override protected void onResume() {
        super.onResume();
        if (!resumeLocationAfterSettings || web == null) return;
        resumeLocationAfterSettings = false;
        web.postDelayed(() -> {
            if (hasLocationPermission()) requestOptionalLocation();
            else sendLocation(null,null,"PERMISSION_DENIED");
        },350);
    }
    private void requestOptionalLocation() {
        if (!hasLocationPermission()) {
            requestPermissions(new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
            return;
        }
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED;
        String provider = locationManager != null && fine &&
            locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            ? LocationManager.GPS_PROVIDER
            : locationManager != null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                ? LocationManager.NETWORK_PROVIDER : null;
        if (provider == null) {
            boolean anyService = locationManager != null &&
                (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                 locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
            sendLocation(null,null,anyService ? "LOCATION_PRECISION_REQUIRED" : "LOCATION_DISABLED");
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
        // Private order push permission must never opt the customer into marketing.
        if(requestCode==PERSONAL_NOTIFICATION_REQUEST)return;
        if(requestCode==NOTIFICATION_REQUEST){
            if(grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED)setMarketingOptIn(true);
            else sendMarketingStatus(false,"Android no autorizó mostrar avisos. Puedes habilitarlos en Ajustes.");
            return;
        }
        if (requestCode == LOCATION_REQUEST) {
            boolean granted = false;
            for (int result : grantResults) if (result == PackageManager.PERMISSION_GRANTED) granted = true;
            if (granted) requestOptionalLocation();
            else sendLocation(null,null,"PERMISSION_DENIED");
        }
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        pendingOpenHome = isPollosB3OpenLink(getIntent());
        pendingNotificationsScreen = isMarketingNotificationIntent(getIntent());
        pendingPersonalInteractionId = personalInteractionFromIntent(getIntent());
        pendingNotificationId = pendingNotificationsScreen ? getNotificationId(getIntent()) : "";
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            if(manager!=null){
                manager.createNotificationChannel(new NotificationChannel(NOTIFICATION_CHANNEL,"Ofertas Pollos B3",NotificationManager.IMPORTANCE_DEFAULT));
                manager.createNotificationChannel(new NotificationChannel(PERSONAL_ORDER_CHANNEL,"Estado de mis pedidos",NotificationManager.IMPORTANCE_HIGH));
            }
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
                    dispatchPendingPersonalCheckout();
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
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view,
                android.webkit.ValueCallback<Uri[]> callback,
                WebChromeClient.FileChooserParams params) {
                if (paymentFileCallback != null) paymentFileCallback.onReceiveValue(null);
                paymentFileCallback = callback;
                try {
                    Intent select = new Intent(Intent.ACTION_GET_CONTENT);
                    select.addCategory(Intent.CATEGORY_OPENABLE);
                    select.setType("image/*");
                    select.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/jpeg","image/png"});
                    startActivityForResult(Intent.createChooser(select, "Seleccionar comprobante"), PAYMENT_FILE_REQUEST);
                    return true;
                } catch (Exception error) {
                    paymentFileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Cache remote catalog images and payment QRs for the active app version.
        // Clear cache once per bundled UI version to avoid stale packaged assets.
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (getSharedPreferences(PREFS, MODE_PRIVATE)
                .getInt("b3_ui_bundle_version", 0) != 20 /* Android B3 splash payment preload V20 bundle */) {
            web.clearCache(true);
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putInt("b3_ui_bundle_version", 20 /* Android B3 splash payment preload V20 bundle */).apply();
        }
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
        pendingPersonalInteractionId = "";
        if (locationManager != null && currentListener != null) try {locationManager.removeUpdates(currentListener);}catch(Exception ignored){}
        if (web != null) { web.removeJavascriptInterface("AndroidBridge"); web.destroy(); web=null; }
        super.onDestroy();
    }
}