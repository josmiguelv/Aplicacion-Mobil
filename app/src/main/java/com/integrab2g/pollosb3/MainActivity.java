package com.integrab2g.pollosb3;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
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
        if (locationManager == null || !locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            sendLocation(null,null,"Activa el GPS o ingresa la dirección manualmente.");
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
            locationManager.requestSingleUpdate(LocationManager.GPS_PROVIDER,currentListener,null);
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