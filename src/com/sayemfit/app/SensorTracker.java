package com.sayemfit.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;

/**
 * Physical-activity tracking from the phone's own sensors.
 *
 * - Steps come from the hardware TYPE_STEP_COUNTER (cumulative since boot), so
 *   they keep counting while the screen is off and cost almost no battery.
 * - Activity intensity comes from the accelerometer, sampled in a duty cycle
 *   (a short window each minute) instead of streaming continuously — a 72 hour
 *   fast means 72 hours of tracking, and a permanently registered accelerometer
 *   would flatten the battery.
 */
public class SensorTracker implements SensorEventListener {

    /** Accelerometer sampling window per cycle, ms. */
    private static final long SAMPLE_MS = 12000L;
    /** Full duty cycle length, ms. */
    private static final long CYCLE_MS = 60000L;

    private static final float STILL_MAX = 0.35f;
    private static final float LIGHT_MAX = 1.5f;
    private static final float MODERATE_MAX = 3.5f;

    private final Context ctx;
    private final AppCore core;
    private final SharedPreferences prefs;

    private SensorManager sm;
    private Sensor stepSensor;
    private Sensor accelSensor;

    private HandlerThread thread;
    private Handler handler;

    private boolean running;
    private boolean sampling;

    private int sampleCount;
    private double sumMag;
    private double sumMagSq;

    private String level = "still";
    private float calories;
    private int cadence;
    private int stepsAtCycleStart = -1;

    private final Runnable startSampling = new SampleStartTask(this);
    private final Runnable stopSampling = new SampleStopTask(this);

    public SensorTracker(Context c, AppCore core) {
        this.ctx = c.getApplicationContext();
        this.core = core;
        this.prefs = core.prefs();
    }

    public synchronized void start() {
        if (running) return;
        sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        if (sm == null) return;

        thread = new HandlerThread("sayem-sensors");
        thread.start();
        handler = new Handler(thread.getLooper());

        core.rollDayIfNeeded();
        calories = prefs.getFloat("calories_today", 0f);

        if (hasActivityPermission()) {
            stepSensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
            if (stepSensor != null) {
                sm.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_NORMAL, handler);
            }
        }
        accelSensor = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        running = true;
        handler.post(startSampling);
    }

    public synchronized void stop() {
        if (!running) return;
        running = false;
        try {
            if (sm != null) sm.unregisterListener(this);
        } catch (Exception ignored) {
        }
        if (handler != null) {
            handler.removeCallbacks(startSampling);
            handler.removeCallbacks(stopSampling);
        }
        if (thread != null) {
            thread.quitSafely();
            thread = null;
        }
        persist();
    }

    public boolean isRunning() {
        return running;
    }

    public boolean hasStepSensor() {
        SensorManager m = sm;
        if (m == null) m = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        return m != null && m.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null;
    }

    public boolean hasActivityPermission() {
        if (Build.VERSION.SDK_INT < 29) return true;
        return ctx.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION)
                == PackageManager.PERMISSION_GRANTED;
    }

    public int stepsToday() {
        core.rollDayIfNeeded();
        return prefs.getInt(AppCore.K_STEP_TODAY, 0);
    }

    public int activeMinutes() {
        return prefs.getInt(AppCore.K_ACTIVE_MIN, 0);
    }

    public String stateJson() {
        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"steps\":").append(stepsToday()).append(',');
        sb.append("\"activeMinutes\":").append(activeMinutes()).append(',');
        sb.append("\"calories\":").append(Math.round(calories)).append(',');
        sb.append("\"cadence\":").append(cadence).append(',');
        sb.append("\"level\":\"").append(level).append("\",");
        sb.append("\"hasStepSensor\":").append(hasStepSensor()).append(',');
        sb.append("\"permission\":").append(hasActivityPermission()).append(',');
        sb.append("\"running\":").append(running);
        sb.append('}');
        return sb.toString();
    }

    /** Zeroes today's counters (used by the "reset activity" action). */
    public void resetToday() {
        calories = 0f;
        cadence = 0;
        prefs.edit()
                .putLong(AppCore.K_STEP_BASE, -1L)
                .putInt(AppCore.K_STEP_TODAY, 0)
                .putInt(AppCore.K_ACTIVE_MIN, 0)
                .putFloat("calories_today", 0f)
                .apply();
        core.emit("sensors", stateJson());
    }

    // ------------------------------------------------------------------
    // Duty cycle
    // ------------------------------------------------------------------

    void beginSampleWindow() {
        if (!running) return;
        core.rollDayIfNeeded();
        sampleCount = 0;
        sumMag = 0;
        sumMagSq = 0;
        stepsAtCycleStart = stepsToday();
        if (accelSensor != null && sm != null) {
            sm.registerListener(this, accelSensor, SensorManager.SENSOR_DELAY_UI, handler);
            sampling = true;
        }
        handler.postDelayed(stopSampling, SAMPLE_MS);
    }

    void endSampleWindow() {
        if (!running) return;
        if (sampling && sm != null && accelSensor != null) {
            sm.unregisterListener(this, accelSensor);
            sampling = false;
        }

        if (sampleCount > 4) {
            double mean = sumMag / sampleCount;
            double var = (sumMagSq / sampleCount) - (mean * mean);
            if (var < 0) var = 0;
            double sd = Math.sqrt(var);
            level = classify((float) sd);
        } else {
            level = "still";
        }

        int stepsNow = stepsToday();
        if (stepsAtCycleStart >= 0 && stepsNow >= stepsAtCycleStart) {
            cadence = stepsNow - stepsAtCycleStart;
        }

        float minutes = CYCLE_MS / 60000f;
        if (!"still".equals(level)) {
            prefs.edit().putInt(AppCore.K_ACTIVE_MIN, activeMinutes() + Math.round(minutes)).apply();
        }
        calories += met(level) * core.weightKg() * (minutes / 60f);
        persist();

        core.emit("sensors", stateJson());
        handler.postDelayed(startSampling, CYCLE_MS - SAMPLE_MS);
    }

    private void persist() {
        prefs.edit().putFloat("calories_today", calories).apply();
    }

    private String classify(float sd) {
        if (sd < STILL_MAX) return "still";
        if (sd < LIGHT_MAX) return "light";
        if (sd < MODERATE_MAX) return "moderate";
        return "vigorous";
    }

    private float met(String lv) {
        if ("light".equals(lv)) return 2.5f;
        if ("moderate".equals(lv)) return 4.3f;
        if ("vigorous".equals(lv)) return 7.0f;
        return 1.3f;
    }

    // ------------------------------------------------------------------
    // SensorEventListener
    // ------------------------------------------------------------------

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            handleStepCounter((long) event.values[0]);
        } else if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            float x = event.values[0], y = event.values[1], z = event.values[2];
            double mag = Math.sqrt(x * x + y * y + z * z);
            sumMag += mag;
            sumMagSq += mag * mag;
            sampleCount++;
        }
    }

    private void handleStepCounter(long cumulative) {
        core.rollDayIfNeeded();
        long base = prefs.getLong(AppCore.K_STEP_BASE, -1L);
        // First reading of the day, or the device rebooted (counter went backwards).
        if (base < 0 || cumulative < base) {
            base = cumulative;
            prefs.edit().putLong(AppCore.K_STEP_BASE, base).apply();
        }
        int today = (int) (cumulative - base);
        if (today < 0) today = 0;
        prefs.edit().putInt(AppCore.K_STEP_TODAY, today).apply();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
    }
}
