package com.sayemfit.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

import java.util.Calendar;

/**
 * Process-wide singleton shared by MainActivity and FastingService.
 *
 * The WebView owns the *user data* (localStorage). This class owns only the
 * small slice of state that must survive the Activity being destroyed while a
 * fast is still running: the fast clock, the band link, and the sensor counters.
 */
public class AppCore {

    public static final String PREFS = "sayem_core";

    public static final String K_ACTIVE = "fast_active";
    public static final String K_START = "fast_start";
    public static final String K_ELAPSED = "fast_elapsed";
    public static final String K_PAUSED = "fast_paused";
    public static final String K_GOAL = "fast_goal";
    public static final String K_PHASE = "fast_phase_seen";
    public static final String K_GOAL_DONE = "fast_goal_notified";
    public static final String K_LANG = "lang";

    public static final String K_BAND_ADDR = "band_address";
    public static final String K_BAND_NAME = "band_name";
    public static final String K_BAND_AUTO = "band_auto";

    public static final String K_STEP_DATE = "step_date";
    public static final String K_STEP_BASE = "step_base";
    public static final String K_STEP_TODAY = "step_today";
    public static final String K_ACTIVE_MIN = "active_minutes";
    public static final String K_WEIGHT = "weight_kg";

    private static AppCore sInstance;

    private Context ctx;
    private SharedPreferences prefs;
    private BleManager ble;
    private SensorTracker sensors;
    private RouteTracker route;
    private PulseCamera pulse;
    private NativeListener listener;

    private AppCore() {
    }

    public static synchronized AppCore get() {
        if (sInstance == null) sInstance = new AppCore();
        return sInstance;
    }

    public synchronized void init(Context c) {
        if (ctx != null) return;
        ctx = c.getApplicationContext();
        prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        ble = new BleManager(ctx, this);
        sensors = new SensorTracker(ctx, this);
        route = new RouteTracker(ctx, this);
        pulse = new PulseCamera(ctx, this);
    }

    public Context context() {
        return ctx;
    }

    public SharedPreferences prefs() {
        return prefs;
    }

    public BleManager ble() {
        return ble;
    }

    public SensorTracker sensors() {
        return sensors;
    }

    public RouteTracker route() {
        return route;
    }

    public PulseCamera pulse() {
        return pulse;
    }

    /** A finished camera pulse reading; JS decides where to log it. */
    public void recordPulse(int bpm) {
        emit("pulseResult", "{\"bpm\":" + bpm + ",\"ts\":" + System.currentTimeMillis() + "}");
    }

    public void setListener(NativeListener l) {
        listener = l;
    }

    public void clearListener(NativeListener l) {
        if (listener == l) listener = null;
    }

    /** Fire-and-forget push to JS. Silently dropped when no WebView is alive. */
    public void emit(String type, String json) {
        NativeListener l = listener;
        if (l != null) l.onNativeEvent(type, json);
    }

    // ------------------------------------------------------------------
    // Fast clock
    // ------------------------------------------------------------------

    public void syncFast(boolean active, long startTime, long elapsed,
                         boolean paused, int goalHours) {
        SharedPreferences.Editor e = prefs.edit();
        e.putBoolean(K_ACTIVE, active);
        e.putLong(K_START, startTime);
        e.putLong(K_ELAPSED, elapsed);
        e.putBoolean(K_PAUSED, paused);
        e.putInt(K_GOAL, goalHours);
        if (!active) {
            e.putInt(K_PHASE, -1);
            e.putBoolean(K_GOAL_DONE, false);
        }
        e.apply();
        // Encouragement milestones are per-fast, so clear them with the fast.
        if (!active) Reminders.resetFastState(prefs);
    }

    public boolean isFasting() {
        return prefs.getBoolean(K_ACTIVE, false);
    }

    public boolean isPaused() {
        return prefs.getBoolean(K_PAUSED, false);
    }

    public int goalHours() {
        return prefs.getInt(K_GOAL, 24);
    }

    /**
     * Elapsed fasting time in ms, rebuilt from the wall clock so it stays
     * correct across process death, reboot and multi-day sessions.
     */
    public long elapsedMs() {
        long banked = prefs.getLong(K_ELAPSED, 0L);
        if (!isFasting() || isPaused()) return banked;
        long start = prefs.getLong(K_START, 0L);
        if (start <= 0L) return banked;
        long live = System.currentTimeMillis() - start;
        if (live < 0L) live = 0L;
        return banked + live;
    }

    public boolean isArabic() {
        return !"en".equals(prefs.getString(K_LANG, "ar"));
    }

    // ------------------------------------------------------------------
    // Daily counters
    // ------------------------------------------------------------------

    public String today() {
        Calendar c = Calendar.getInstance();
        return c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH);
    }

    /** Resets the step baseline when the calendar day rolls over. */
    public void rollDayIfNeeded() {
        String stored = prefs.getString(K_STEP_DATE, "");
        String now = today();
        if (!TextUtils.equals(stored, now)) {
            prefs.edit()
                    .putString(K_STEP_DATE, now)
                    .putLong(K_STEP_BASE, -1L)
                    .putInt(K_STEP_TODAY, 0)
                    .putInt(K_ACTIVE_MIN, 0)
                    .putInt("floors_today", 0)
                    .putFloat("altitude_today", 0f)
                    .putFloat("calories_today", 0f)
                    .apply();
        }
    }

    public float weightKg() {
        return prefs.getFloat(K_WEIGHT, 70f);
    }
}
