package com.sayemfit.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.activity.ComponentActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends ComponentActivity {

    private static final int REQ_PERMS = 91;

    private WebView webView;
    private JsBridge bridge;
    private AppCore core;
    private HealthConnectManager health;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        core = AppCore.get();
        core.init(this);

        // Registered here on purpose: an activity result launcher must be
        // created before the activity reaches STARTED.
        health = new HealthConnectManager(this, core);
        health.register();

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(false);

        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setBackgroundColor(0xFF0F0F1A);
        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppChromeClient());

        bridge = new JsBridge(this, webView, core);
        webView.addJavascriptInterface(bridge, "Native");

        webView.loadUrl("file:///android_asset/public/index.html");

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0F0F1A);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        core.setListener(bridge);
        requestRuntimePermissions();
    }

    @Override
    protected void onResume() {
        super.onResume();
        core.setListener(bridge);
        core.sensors().start();
        core.ble().autoConnectIfEnabled();
        if (webView != null) {
            webView.onResume();
            webView.evaluateJavascript("window.__onResume && window.__onResume();", null);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
        // Keep the sensors alive only while a fast or a route is running; the
        // hardware step counter is cumulative so nothing is lost by stopping.
        if (!core.isFasting() && !core.route().isTracking()) core.sensors().stop();
    }

    /**
     * The SPA decides what "back" means. It closes a modal or returns to Home,
     * and calls Native.exitApp() when there is nothing left to pop.
     *
     * (No ValueCallback here on purpose: implementing a generic interface emits
     * a synthetic bridge method that crashes d8 8.2.2 in this manual pipeline.)
     */
    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("window.__onBack && window.__onBack();", null);
    }

    void finishFromWeb() {
        super.onBackPressed();
    }

    public void requestExit() {
        if (webView != null) webView.post(new FinishTask(this));
    }

    // ------------------------------------------------------------------
    // Runtime permissions
    // ------------------------------------------------------------------

    public void requestRuntimePermissions() {
        if (Build.VERSION.SDK_INT < 23) return;
        List<String> need = new ArrayList<String>();

        if (Build.VERSION.SDK_INT >= 31) {
            addIfMissing(need, Manifest.permission.BLUETOOTH_SCAN);
            addIfMissing(need, Manifest.permission.BLUETOOTH_CONNECT);
        }
        // Route recording needs it on every version; pre-Android 12 a BLE scan
        // also silently returns nothing without it.
        addIfMissing(need, Manifest.permission.ACCESS_FINE_LOCATION);
        addIfMissing(need, Manifest.permission.CAMERA);
        if (Build.VERSION.SDK_INT >= 29) {
            addIfMissing(need, Manifest.permission.ACTIVITY_RECOGNITION);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            addIfMissing(need, Manifest.permission.POST_NOTIFICATIONS);
        }

        if (need.isEmpty()) return;
        requestPermissions(need.toArray(new String[need.size()]), REQ_PERMS);
    }

    private void addIfMissing(List<String> out, String perm) {
        if (checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) out.add(perm);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ_PERMS) return;
        // Re-register: the step sensor is only hooked up when ACTIVITY_RECOGNITION
        // is already granted, so a fresh grant needs a restart of the tracker.
        core.sensors().stop();
        core.sensors().start();
        core.emit("perms", bridge.permsState());
    }

    public boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    public HealthConnectManager health() {
        return health;
    }

    public boolean hasCameraPermission() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    // ------------------------------------------------------------------
    // Photos and maps
    // ------------------------------------------------------------------

    public void startPhotoCapture() {
        if (!MediaHelper.capture(this)) {
            core.emit("photo", "{\"id\":\"\",\"error\":\"no_camera_app\"}");
        }
    }

    public void startPhotoPick() {
        if (!MediaHelper.pick(this)) {
            core.emit("photo", "{\"id\":\"\",\"error\":\"no_gallery\"}");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != MediaHelper.REQ_CAMERA && requestCode != MediaHelper.REQ_GALLERY) return;
        if (resultCode != Activity.RESULT_OK) {
            core.emit("photo", "{\"id\":\"\",\"error\":\"cancelled\"}");
            return;
        }
        String id = MediaHelper.handleResult(this, requestCode, data);
        core.emit("photo", "{\"id\":\"" + id + "\",\"error\":\"" + (id.length() == 0 ? "failed" : "") + "\"}");
    }

    /** Opens "lat,lng" in any installed maps app (Google Maps, Petal, OSM…). */
    public void openGeo(String latLng) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("geo:" + latLng + "?q=" + latLng));
            startActivity(i);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://www.google.com/maps/search/?api=1&query=" + latLng)));
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * Aggressive OEM battery managers (Huawei's included) kill background
     * services; this sends the user to the exemption screen.
     */
    public void openBatteryOptimisation() {
        try {
            Intent i = new Intent();
            if (Build.VERSION.SDK_INT >= 23) {
                i.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getPackageName()));
            } else {
                i.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.parse("package:" + getPackageName()));
            }
            startActivity(i);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.parse("package:" + getPackageName()));
                startActivity(fallback);
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    protected void onDestroy() {
        core.clearListener(bridge);
        if (webView != null) {
            webView.removeJavascriptInterface("Native");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
