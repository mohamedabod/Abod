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

    public static final String VERSION = "8.2";

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
        } else if (!core.route().isTracking()) {
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

    /**
     * Mirrors the reminder settings into native prefs and re-arms the daily
     * alarms. Sent as JSON because there are a dozen fields and a positional
     * signature that long is a bug waiting to happen.
     */
    @JavascriptInterface
    public void setReminderConfig(String json) {
        if (json == null) return;
        try {
            org.json.JSONObject o = new org.json.JSONObject(json);
            android.content.SharedPreferences.Editor e = core.prefs().edit();
            e.putBoolean(Reminders.P_WATER, o.optBoolean("water", true));
            e.putBoolean(Reminders.P_MOTIVATION, o.optBoolean("motivation", true));
            e.putBoolean(Reminders.P_WINDOW, o.optBoolean("window", true));
            e.putBoolean(Reminders.P_SUPPLEMENT, o.optBoolean("supplement", false));
            e.putBoolean(Reminders.P_NUDGE, o.optBoolean("nudge", false));
            e.putString(Reminders.P_WINDOW_START, o.optString("windowStart", "17:00"));
            e.putString(Reminders.P_WINDOW_END, o.optString("windowEnd", "21:00"));
            e.putString(Reminders.P_SUPPLEMENT_TIME, o.optString("supplementTime", "18:00"));
            e.putString(Reminders.P_NUDGE_TIME, o.optString("nudgeTime", "22:00"));
            e.putLong(Reminders.P_BEST_FAST, (long) o.optDouble("bestFastMs", 0));
            e.putInt("streak", o.optInt("streak", 0));
            // The scheduler recomputes the Ramadan window itself, so it needs
            // the inputs rather than the answer.
            e.putBoolean(Reminders.P_RAMADAN, o.optBoolean("ramadan", false));
            e.putFloat(Reminders.P_LAT, (float) o.optDouble("lat", 31.2001));
            e.putFloat(Reminders.P_LON, (float) o.optDouble("lon", 29.9187));
            e.putString(Reminders.P_SUN_CONV, o.optString("sunConvention", "egypt"));
            e.apply();
        } catch (org.json.JSONException ignored) {
            return;
        }
        Reminders.scheduleAll(core.context());
    }

    /**
     * Stores a coaching notification composed by the JS analysis engine.
     * slot is "daily" or "protein"; the schedule is re-armed after each call.
     */
    @JavascriptInterface
    public void setInsight(String slot, boolean on, String time, String title, String body) {
        if (slot == null) return;
        Reminders.setInsight(core.context(), slot, on, time, title, body);
        Reminders.scheduleAll(core.context());
    }

    /** Announces a medal the JS side has just awarded. */
    @JavascriptInterface
    public void celebrate(String title, String text) {
        if (title == null || text == null) return;
        FastingService.celebrate(core.context(), title, text);
    }

    /** Fires one reminder immediately so the user can see what it looks like. */
    @JavascriptInterface
    public void testReminder(String kind) {
        Reminders.fire(core.context(), kind == null ? Reminders.K_WINDOW_OPEN : kind);
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
    public String sensorsInventory() {
        return core.sensors().inventoryJson();
    }

    /** Sleep blocks estimated from stillness and ambient light. */
    @JavascriptInterface
    public String sleepEstimate() {
        return core.sensors().sleepJson();
    }

    @JavascriptInterface
    public void refreshWidget() {
        FastWidget.refresh(core.context());
    }

    // ---------------- Route (GPS) ----------------

    /** @return "ok" | "no_permission" | "gps_off" | "no_provider" */
    @JavascriptInterface
    public String routeStart() {
        String r = core.route().start();
        if ("ok".equals(r)) FastingService.start(core.context());
        return r;
    }

    @JavascriptInterface
    public void routePause() {
        core.route().pause();
    }

    @JavascriptInterface
    public void routeResume() {
        core.route().resume();
    }

    @JavascriptInterface
    public void routeStop() {
        core.route().stop();
        if (!core.isFasting()) FastingService.stop(core.context());
    }

    @JavascriptInterface
    public String routeState() {
        return core.route().stateJson();
    }

    @JavascriptInterface
    public String routePath(int maxPoints) {
        return core.route().pathJson(maxPoints > 0 ? maxPoints : 300);
    }

    /** Saves the current track as GPX and offers it to the share sheet. */
    @JavascriptInterface
    public String routeExportGpx(String name) {
        String gpx = core.route().toGpx(name == null ? "walk" : name);
        String path = saveExport("route-" + System.currentTimeMillis() + ".gpx", gpx);
        share(name, gpx);
        return path;
    }

    /** A cached position, used to place prayer times. @return {lat,lon} or {}. */
    @JavascriptInterface
    public String lastLocation() {
        return core.route().lastLocationJson();
    }

    /** Opens the track's starting point in whatever maps app is installed. */
    @JavascriptInterface
    public void routeOpenInMaps() {
        String p = core.route().firstPoint();
        if (p.length() == 0) return;
        activity.openGeo(p);
    }

    // ---------------- Health Connect ----------------

    /** @return "ok" | "not_installed" | "update_required" | "unsupported" */
    @JavascriptInterface
    public String healthStatus() {
        return activity.health().status();
    }

    @JavascriptInterface
    public void healthRequestPermissions() {
        activity.health().requestPermissions();
    }

    /** Opens the Health Connect app, or its store listing when not installed. */
    @JavascriptInterface
    public void healthOpenProvider() {
        activity.health().openProvider();
    }

    @JavascriptInterface
    public void healthRefresh() {
        activity.health().refreshState();
    }

    /** Reads the last `days` days; the result arrives as a "health" event. */
    @JavascriptInterface
    public void healthSync(int days) {
        activity.health().sync(days > 0 ? days : 30);
    }

    // ---------------- Meal photos ----------------

    @JavascriptInterface
    public void photoCapture() {
        activity.startPhotoCapture();
    }

    @JavascriptInterface
    public void photoPick() {
        activity.startPhotoPick();
    }

    /** @return a data: URI thumbnail for the stored photo id, or "". */
    @JavascriptInterface
    public String photoData(String id) {
        return MediaHelper.dataUri(core.context(), id);
    }

    @JavascriptInterface
    public void photoDelete(String id) {
        MediaHelper.delete(core.context(), id);
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
        sb.append("\"location\":").append(core.route().hasPermission()).append(',');
        sb.append("\"camera\":").append(activity.hasCameraPermission()).append(',');
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

    /**
     * Renders the report HTML through the system print dialog, where the user
     * can save it as a PDF. Posted to the UI thread because a WebView may only
     * be built there, and this arrives on a binder thread.
     */
    @JavascriptInterface
    public void exportPdf(final String html, final String name) {
        if (html == null || html.length() == 0) return;
        web.post(new PrintTask(activity, html, name));
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
