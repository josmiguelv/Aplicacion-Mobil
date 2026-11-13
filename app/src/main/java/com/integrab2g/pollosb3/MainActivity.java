package com.integrab2g.pollosb3;

import android.Manifest;
import android.app.Activity;
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
import org.json.JSONArray;
import java.util.List;
import java.util.Locale;

/** Android V10: navigation and optional foreground GPS for delivery. No background tracking. */
public class MainActivity extends Activity {
    private static final int LOCATION_REQUEST = 41;
    private WebView web;
    private WebViewAssetLoader assetLoader;
    private LocationManager locationManager;
    private LocationListener currentListener;
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
        if (requestCode == LOCATION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) requestOptionalLocation();
            else sendLocation(null,null,"Permiso de ubicación denegado. Puedes escribir tu dirección manualmente.");
        }
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(9, 0, 1));
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
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
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.handleB3Back ? window.handleB3Back() : false", result -> {
            if (!"true".equals(result)) { if (web.canGoBack()) web.goBack(); else finish(); }
        });
    }
    @Override protected void onDestroy() {
        if (locationManager != null && currentListener != null) try {locationManager.removeUpdates(currentListener);}catch(Exception ignored){}
        if (web != null) { web.removeJavascriptInterface("AndroidBridge"); web.destroy(); web=null; }
        super.onDestroy();
    }
}