package com.sayemfit.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;

/**
 * The `window.Native` object seen by app.js.
 *
 * Everything the browser sandbox cannot do — BLE, hardware sensors, foreground
 * service, notifications, file export — enters through here. All methods are
 * called on a binder thread, so anything touching the WebView is posted back.
 */
public class JsBridge implements NativeListener {

    public static final String VERSION = "4.0";

    private final MainActivity activity;
    private final WebView web;
    private final AppCore core;

    public JsBridge(MainActivity a, WebView w, AppCore core) {
        this.activity = a;
        this.web = w;
        this.core = core;
    }

    // ------------------------------------------------------------------
    // Native -> JS
    // ------------------------------------------------------------------

    @Override
    public void onNativeEvent(final String type, final String json) {
        if (web == null) return;
        final String js = "window.__onNative && window.__onNative('" + Json.esc(type) + "'," + json + ");";
        web.post(new JsEvalTask(web, js));
    }

    // ------------------------------------------------------------------
    // JS -> Native
    // ------------------------------------------------------------------

    @JavascriptInterface
    public boolean available() {
        return true;
    }

    @JavascriptInterface
    public String version() {
        return VERSION;
    }

    /**
     * Mirrors the fast into native storage and starts/stops the foreground
     * service. Longs travel as strings so a 13-digit epoch never rounds.
     */
    @JavascriptInterface
    public void syncFast(boolean active, String startTime, String elapsed, boolean paused, int goalHours) {
        long start = parseLong(startTime);
        long el = parseLong(elapsed);
        core.syncFast(active, start, el, paused, goalHours);
        Context c = core.context();
        if (active) {
            FastingService.start(c);
        } else {
            FastingService.stop(c);
        }
    }

    @JavascriptInterface
    public void setLang(String lang) {
        core.prefs().edit().putString(AppCore.K_LANG, "en".equals(lang) ? "en" : "ar").apply();
    }

    @JavascriptInterface
    public void setWeight(float kg) {
        if (kg <= 0) return;
        core.prefs().edit().putFloat(AppCore.K_WEIGHT, kg).apply();
    }

    @JavascriptInterface
    public void setNotifyPhase(boolean on) {
        core.prefs().edit().putBoolean("notify_phase", on).apply();
    }

    // ---------------- Band ----------------

    @JavascriptInterface
    public String bandState() {
        return core.ble().stateJson();
    }

    /** @return "ok" | "bt_off" | "no_permission" | "no_adapter" */
    @JavascriptInterface
    public String bandScan() {
        return core.ble().startScan();
    }

    @JavascriptInterface
    public String bandConnectSaved() {
        return core.ble().connectSaved();
    }

    @JavascriptInterface
    public void bandDisconnect(boolean forget) {
        core.ble().disconnect(forget);
    }

    @JavascriptInterface
    public void bandAuto(boolean on) {
        core.ble().setAutoConnect(on);
        if (on) core.ble().autoConnectIfEnabled();
    }

    // ---------------- Sensors ----------------

    @JavascriptInterface
    public String sensorsState() {
        return core.sensors().stateJson();
    }

    @JavascriptInterface
    public void sensorsStart() {
        core.sensors().start();
    }

    @JavascriptInterface
    public void sensorsReset() {
        core.sensors().resetToday();
    }

    // ---------------- Permissions / system ----------------

    @JavascriptInterface
    public void requestPerms() {
        activity.requestRuntimePermissions();
    }

    @JavascriptInterface
    public String permsState() {
        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"bluetooth\":").append(core.ble().hasScanPermission()).append(',');
        sb.append("\"activity\":").append(core.sensors().hasActivityPermission()).append(',');
        sb.append("\"notifications\":").append(activity.hasNotificationPermission());
        sb.append('}');
        return sb.toString();
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        if (ms <= 0 || ms > 3000) return;
        Vibrator v = (Vibrator) core.context().getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null) return;
        try {
            v.vibrate(ms);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void toast(final String msg) {
        if (msg == null) return;
        web.post(new ToastTask(core.context(), msg));
    }

    /** Writes an export into the app's own Documents dir. @return path or "". */
    @JavascriptInterface
    public String saveExport(String filename, String content) {
        if (filename == null || content == null) return "";
        String safe = filename.replaceAll("[^A-Za-z0-9._-]", "_");
        try {
            File dir = core.context().getExternalFilesDir(null);
            if (dir == null) dir = core.context().getFilesDir();
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, safe);
            FileOutputStream fos = new FileOutputStream(out);
            OutputStreamWriter w = new OutputStreamWriter(fos, "UTF-8");
            try {
                w.write(content);
            } finally {
                w.close();
                fos.close();
            }
            return out.getAbsolutePath();
        } catch (Exception e) {
            return "";
        }
    }

    /** Hands the export text to the system share sheet (Drive, mail, WhatsApp...). */
    @JavascriptInterface
    public void share(String subject, String text) {
        if (text == null) return;
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        if (subject != null) i.putExtra(Intent.EXTRA_SUBJECT, subject);
        i.putExtra(Intent.EXTRA_TEXT, text);
        Intent chooser = Intent.createChooser(i, subject);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            core.context().startActivity(chooser);
        } catch (Exception ignored) {
        }
    }

    /** Called by window.__onBack when the SPA has no view left to pop. */
    @JavascriptInterface
    public void exitApp() {
        activity.requestExit();
    }

    @JavascriptInterface
    public void openBatterySettings() {
        activity.openBatteryOptimisation();
    }

    private static long parseLong(String s) {
        if (s == null) return 0L;
        try {
            int dot = s.indexOf('.');
            if (dot >= 0) s = s.substring(0, dot);
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    static int sdk() {
        return Build.VERSION.SDK_INT;
    }
}
