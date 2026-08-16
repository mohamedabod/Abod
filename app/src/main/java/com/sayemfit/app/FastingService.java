package com.sayemfit.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Keeps a fast alive while the UI is gone.
 *
 * A 72 hour fast outlives the Activity many times over, so the clock, the band
 * link and the step counter all have to live in a foreground service. The
 * ongoing notification doubles as the always-visible timer.
 */
public class FastingService extends Service {

    public static final String ACTION_START = "com.sayemfit.app.START";
    public static final String ACTION_STOP = "com.sayemfit.app.STOP";
    public static final String ACTION_TICK = "com.sayemfit.app.TICK";

    public static final String CH_ONGOING = "fast_ongoing";
    public static final String CH_ALERTS = "fast_alerts";

    private static final int NOTIF_ID = 4201;
    private static final long REFRESH_MS = 60000L;

    private AppCore core;
    private Handler handler;
    private Runnable ticker;
    private boolean foreground;

    @Override
    public void onCreate() {
        super.onCreate();
        core = AppCore.get();
        core.init(this);
        createChannels();
        handler = new Handler(Looper.getMainLooper());
        ticker = new ServiceTickTask(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            shutdown();
            return START_NOT_STICKY;
        }

        if (!foreground) {
            enterForeground();
            foreground = true;
        }

        core.sensors().start();
        core.ble().autoConnectIfEnabled();

        if (!core.isFasting() && !core.route().isTracking()) {
            // Nothing to keep alive (e.g. restored after reboot with no fast).
            shutdown();
            return START_NOT_STICKY;
        }

        onTick();
        return START_STICKY;
    }

    /**
     * Declares the foreground type at runtime rather than relying on the
     * manifest union: the location type may only be claimed once the location
     * permission is actually granted, otherwise Android 14 throws.
     */
    private void enterForeground() {
        Notification n = buildOngoing();
        if (Build.VERSION.SDK_INT < 29) {
            startForeground(NOTIF_ID, n);
            return;
        }
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        if (core.route().isTracking() && core.route().hasPermission()) {
            type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
        }
        try {
            startForeground(NOTIF_ID, n, type);
        } catch (Exception e) {
            startForeground(NOTIF_ID, n);
        }
    }

    /** Refreshes the notification, fires milestones, re-arms the alarm. */
    void onTick() {
        if (!core.isFasting() && !core.route().isTracking()) {
            shutdown();
            return;
        }
        if (core.isFasting()) {
            checkMilestones();
            Reminders.maybeWater(this);
            Reminders.maybeMilestone(this);
            scheduleAlarm();
        }
        notifyManager().notify(NOTIF_ID, buildOngoing());
        handler.removeCallbacks(ticker);
        handler.postDelayed(ticker, REFRESH_MS);
    }

    private void checkMilestones() {
        SharedPreferences p = core.prefs();
        boolean ar = core.isArabic();
        double hours = core.elapsedMs() / 3600000.0;

        int phase = Phases.indexFor(hours);
        int seen = p.getInt(AppCore.K_PHASE, -1);
        if (phase > seen) {
            p.edit().putInt(AppCore.K_PHASE, phase).apply();
            if (seen >= 0 && p.getBoolean("notify_phase", true)) {
                alert(ar ? "مرحلة جديدة: " + Phases.name(phase, true)
                                : "New phase: " + Phases.name(phase, false),
                        Phases.desc(phase, ar), 4202);
            }
        }

        int goal = core.goalHours();
        if (goal > 0 && hours >= goal && !p.getBoolean(AppCore.K_GOAL_DONE, false)) {
            p.edit().putBoolean(AppCore.K_GOAL_DONE, true).apply();
            alert(ar ? "وصلت للهدف!" : "Goal reached!",
                    ar ? "أكملت " + goal + " ساعة صيام. تقدر تكمل أو تفطر بروتوكول الإفطار."
                            : "You completed " + goal + "h. Continue, or break it with the refeeding protocol.",
                    4203);
        }
    }

    // ------------------------------------------------------------------
    // Notifications
    // ------------------------------------------------------------------

    private Notification buildOngoing() {
        boolean ar = core.isArabic();
        if (!core.isFasting() && core.route().isTracking()) return buildRouteOngoing(ar);
        long ms = core.elapsedMs();
        long totalMin = ms / 60000L;
        long h = totalMin / 60;
        long m = totalMin % 60;
        int goal = core.goalHours();
        double hours = ms / 3600000.0;
        int phase = Phases.indexFor(hours);

        String title = (ar ? "صائم منذ " : "Fasting for ") + h + (ar ? " س " : "h ") + m + (ar ? " د" : "m");
        if (core.isPaused()) title = (ar ? "موقوف مؤقتاً — " : "Paused — ") + title;

        String text = Phases.name(phase, ar);
        if (goal > 0) {
            int pct = (int) Math.floor(hours / goal * 100.0);
            if (pct > 100) pct = 100;
            text = text + " · " + pct + "% " + (ar ? "من الهدف" : "of goal");
        }
        int hr = core.ble().getHeartRate();
        if (hr > 0) text = text + " · " + hr + (ar ? " ن/د" : " bpm");

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags(false));

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, CH_ONGOING);
        } else {
            b = new Notification.Builder(this);
            b.setPriority(Notification.PRIORITY_LOW);
        }
        b.setContentTitle(title);
        b.setContentText(text);
        b.setSmallIcon(R.mipmap.ic_launcher);
        b.setContentIntent(pi);
        b.setOngoing(true);
        b.setOnlyAlertOnce(true);
        if (Build.VERSION.SDK_INT >= 24) b.setShowWhen(false);
        if (goal > 0) {
            int pct = (int) Math.floor(hours / goal * 100.0);
            if (pct > 100) pct = 100;
            b.setProgress(100, pct, false);
        }
        return b.build();
    }

    /** Ongoing notification for a walk recorded outside of a fast. */
    private Notification buildRouteOngoing(boolean ar) {
        RouteTracker r = core.route();
        long ms = r.elapsedMs();
        long min = ms / 60000L;
        String title = (ar ? "تسجيل المسار — " : "Recording route — ")
                + (min / 60) + (ar ? " س " : "h ") + (min % 60) + (ar ? " د" : "m");

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags(false));

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, CH_ONGOING);
        } else {
            b = new Notification.Builder(this);
            b.setPriority(Notification.PRIORITY_LOW);
        }
        b.setContentTitle(title);
        b.setContentText(ar ? "المسافة قيد التسجيل" : "Distance is being recorded");
        b.setSmallIcon(R.mipmap.ic_launcher);
        b.setContentIntent(pi);
        b.setOngoing(true);
        b.setOnlyAlertOnce(true);
        return b.build();
    }

    private void alert(String title, String text, int id) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, id, open, piFlags(false));

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, CH_ALERTS);
        } else {
            b = new Notification.Builder(this);
            b.setPriority(Notification.PRIORITY_DEFAULT);
        }
        b.setContentTitle(title);
        b.setContentText(text);
        b.setStyle(new Notification.BigTextStyle().bigText(text));
        b.setSmallIcon(R.mipmap.ic_launcher);
        b.setContentIntent(pi);
        b.setAutoCancel(true);
        notifyManager().notify(id, b.build());
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = notifyManager();
        NotificationChannel ongoing = new NotificationChannel(
                CH_ONGOING, getString(R.string.channel_fast), NotificationManager.IMPORTANCE_LOW);
        ongoing.setShowBadge(false);
        nm.createNotificationChannel(ongoing);

        NotificationChannel alerts = new NotificationChannel(
                CH_ALERTS, getString(R.string.channel_alerts), NotificationManager.IMPORTANCE_DEFAULT);
        nm.createNotificationChannel(alerts);
    }

    private NotificationManager notifyManager() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }

    // ------------------------------------------------------------------
    // Doze-proof scheduling
    // ------------------------------------------------------------------

    /**
     * postDelayed does not wake a sleeping CPU, so phase changes would land late
     * during a long overnight fast. An inexact allow-while-idle alarm on the next
     * milestone fixes that without needing SCHEDULE_EXACT_ALARM.
     */
    private void scheduleAlarm() {
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (am == null || core.isPaused()) return;

        double hours = core.elapsedMs() / 3600000.0;
        double nextH = Phases.nextBoundaryH(hours);
        int goal = core.goalHours();
        if (goal > 0 && hours < goal && (nextH < 0 || goal < nextH)) nextH = goal;
        if (nextH < 0) return;

        long deltaMs = (long) ((nextH - hours) * 3600000.0);
        if (deltaMs < 30000L) deltaMs = 30000L;
        long triggerAt = System.currentTimeMillis() + deltaMs;

        Intent i = new Intent(this, AlarmReceiver.class);
        i.setAction(ACTION_TICK);
        PendingIntent pi = PendingIntent.getBroadcast(this, 7, i, piFlags(true));
        if (Build.VERSION.SDK_INT >= 23) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
    }

    static int piFlags(boolean update) {
        int f = update ? PendingIntent.FLAG_UPDATE_CURRENT : 0;
        if (Build.VERSION.SDK_INT >= 23) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }

    private void shutdown() {
        handler.removeCallbacks(ticker);
        core.sensors().stop();
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        foreground = false;
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(ticker);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ------------------------------------------------------------------
    // Helpers for other components
    // ------------------------------------------------------------------

    public static void start(Context c) {
        Intent i = new Intent(c, FastingService.class);
        i.setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) {
            c.startForegroundService(i);
        } else {
            c.startService(i);
        }
    }

    public static void stop(Context c) {
        Intent i = new Intent(c, FastingService.class);
        i.setAction(ACTION_STOP);
        try {
            c.startService(i);
        } catch (IllegalStateException e) {
            c.stopService(new Intent(c, FastingService.class));
        }
    }
}
