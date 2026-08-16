package com.sayemfit.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;
import java.util.Random;

/**
 * Daily reminders and in-fast encouragement.
 *
 * Scheduling uses inexact repeating alarms: they need no special permission,
 * the system batches them, and nothing here is worth waking a sleeping phone
 * to the minute for. Milestones that must land on time (phase changes, goal
 * reached) stay in FastingService, which uses allow-while-idle alarms.
 */
public final class Reminders {

    public static final String ACTION_REMIND = "com.sayemfit.app.REMIND";
    public static final String EXTRA_KIND = "kind";

    public static final String K_WINDOW_OPEN = "window_open";
    public static final String K_WINDOW_CLOSE = "window_close";
    public static final String K_CHECKIN = "checkin";
    public static final String K_SUPPLEMENT = "supplement";
    public static final String K_START_NUDGE = "start_nudge";

    // Prefs written from JS through JsBridge.setReminderConfig
    public static final String P_WATER = "rem_water";
    public static final String P_MOTIVATION = "rem_motivation";
    public static final String P_WINDOW = "rem_window";
    public static final String P_CHECKIN = "rem_checkin";
    public static final String P_SUPPLEMENT = "rem_supplement";
    public static final String P_NUDGE = "rem_nudge";
    public static final String P_WINDOW_START = "rem_window_start";
    public static final String P_WINDOW_END = "rem_window_end";
    public static final String P_CHECKIN_TIME = "rem_checkin_time";
    public static final String P_SUPPLEMENT_TIME = "rem_supplement_time";
    public static final String P_NUDGE_TIME = "rem_nudge_time";
    public static final String P_BEST_FAST = "best_fast_ms";

    /** Water nudges while fasting. */
    public static final long WATER_INTERVAL_MS = 2 * 3600000L;
    public static final String P_LAST_WATER = "rem_last_water";
    public static final String P_MILESTONES = "rem_milestones";

    private static final Random RND = new Random();

    private Reminders() {
    }

    // ------------------------------------------------------------------
    // Scheduling
    // ------------------------------------------------------------------

    /** (Re)schedules every daily reminder from the current settings. */
    public static void scheduleAll(Context ctx) {
        AppCore core = AppCore.get();
        core.init(ctx);
        SharedPreferences p = core.prefs();

        daily(ctx, K_WINDOW_OPEN, p.getBoolean(P_WINDOW, true),
                p.getString(P_WINDOW_START, "17:00"), 0);
        // Half an hour before the window shuts, not at the moment it does.
        daily(ctx, K_WINDOW_CLOSE, p.getBoolean(P_WINDOW, true),
                p.getString(P_WINDOW_END, "21:00"), -30);
        daily(ctx, K_CHECKIN, p.getBoolean(P_CHECKIN, true),
                p.getString(P_CHECKIN_TIME, "20:00"), 0);
        daily(ctx, K_SUPPLEMENT, p.getBoolean(P_SUPPLEMENT, false),
                p.getString(P_SUPPLEMENT_TIME, "18:00"), 0);
        daily(ctx, K_START_NUDGE, p.getBoolean(P_NUDGE, false),
                p.getString(P_NUDGE_TIME, "22:00"), 0);
    }

    private static void daily(Context ctx, String kind, boolean on, String hhmm, int offsetMin) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent i = new Intent(ctx, AlarmReceiver.class);
        i.setAction(ACTION_REMIND);
        i.putExtra(EXTRA_KIND, kind);
        // The kind must be part of the identity, or every reminder would
        // overwrite the previous one's PendingIntent.
        i.setData(android.net.Uri.parse("sayem://remind/" + kind));
        PendingIntent pi = PendingIntent.getBroadcast(ctx, kind.hashCode(), i,
                FastingService.piFlags(true));

        if (!on) {
            am.cancel(pi);
            return;
        }

        int[] t = parseTime(hhmm);
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, t[0]);
        c.set(Calendar.MINUTE, t[1]);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.add(Calendar.MINUTE, offsetMin);
        if (c.getTimeInMillis() <= System.currentTimeMillis()) {
            c.add(Calendar.DAY_OF_YEAR, 1);
        }
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY, pi);
    }

    static int[] parseTime(String hhmm) {
        int h = 12, m = 0;
        try {
            String[] parts = hhmm.split(":");
            h = Integer.parseInt(parts[0].trim());
            m = Integer.parseInt(parts[1].trim());
        } catch (Exception ignored) {
        }
        if (h < 0 || h > 23) h = 12;
        if (m < 0 || m > 59) m = 0;
        return new int[]{h, m};
    }

    // ------------------------------------------------------------------
    // Firing
    // ------------------------------------------------------------------

    public static void fire(Context ctx, String kind) {
        AppCore core = AppCore.get();
        core.init(ctx);
        boolean ar = core.isArabic();
        SharedPreferences p = core.prefs();
        boolean fasting = core.isFasting();
        double hours = core.elapsedMs() / 3600000.0;

        if (K_WINDOW_OPEN.equals(kind)) {
            if (!fasting) return; // nothing to break
            notify(ctx, 4210,
                    ar ? "نافذة الأكل فتحت" : "Your eating window is open",
                    ar ? "كملت " + (int) hours + " ساعة. ابدأ ببروتين وسلطة قبل أي كارب."
                            : "You are at hour " + (int) hours + ". Start with protein and salad before any carbs.");

        } else if (K_WINDOW_CLOSE.equals(kind)) {
            if (fasting) return; // already fasting again
            notify(ctx, 4211,
                    ar ? "نص ساعة وتقفل النافذة" : "Window closes in 30 minutes",
                    ar ? "لو خلصت أكل، ابدأ الصيام دلوقتي عشان تلحق هدفك بكرة."
                            : "If you are done eating, start the fast now to hit tomorrow's goal.");

        } else if (K_CHECKIN.equals(kind)) {
            notify(ctx, 4212,
                    ar ? "إزاي حاسس النهاردة؟" : "How do you feel today?",
                    ar ? "سجّل مزاجك وطاقتك وجوعك — المدرب بيظبط نصايحه على كده."
                            : "Log your mood, energy and hunger — the coach adapts to it.");

        } else if (K_SUPPLEMENT.equals(kind)) {
            notify(ctx, 4213,
                    ar ? "معاد المكمل" : "Supplement time",
                    ar ? "خده مع أول وجبة فيها دهون — مش على معدة فاضية."
                            : "Take it with the first meal containing fat, not on an empty stomach.");

        } else if (K_START_NUDGE.equals(kind)) {
            if (fasting) return;
            int streak = p.getInt("streak", 0);
            String body = streak > 1
                    ? (ar ? "سلسلتك " + streak + " يوم. متكسرهاش النهاردة."
                          : "Your streak is " + streak + " days. Do not break it tonight.")
                    : (ar ? "ابدأ صيامك دلوقتي وهدفك يخلص في ميعاده."
                          : "Start now and your goal finishes on time.");
            notify(ctx, 4214, ar ? "مبدأتش الصيام لسه" : "No fast started yet", body);
        }
    }

    /** Water nudge, throttled, only while actively fasting. */
    public static void maybeWater(Context ctx) {
        AppCore core = AppCore.get();
        SharedPreferences p = core.prefs();
        if (!p.getBoolean(P_WATER, true)) return;
        if (!core.isFasting() || core.isPaused()) return;

        long now = System.currentTimeMillis();
        long last = p.getLong(P_LAST_WATER, 0L);
        if (now - last < WATER_INTERVAL_MS) return;
        p.edit().putLong(P_LAST_WATER, now).apply();
        // Skip the very first tick of a fast; a reminder one minute in is noise.
        if (last == 0L) return;

        boolean ar = core.isArabic();
        double hours = core.elapsedMs() / 3600000.0;
        String body = hours >= 24
                ? (ar ? "بعد ٢٤ ساعة الأملاح مش رفاهية: صوديوم وبوتاسيوم ومغنيسيوم."
                      : "Past 24h electrolytes are not optional: sodium, potassium, magnesium.")
                : (ar ? "كوباية مياه ورشة ملح. أغلب صداع الصيام سببه الصوديوم مش الجوع."
                      : "A glass of water and a pinch of salt. Most fasting headaches are sodium, not hunger.");
        notify(ctx, 4215, ar ? "اشرب مياه" : "Drink water", body);
    }

    /**
     * One-off encouragement at 25/50/75% of the goal, and when the fast passes
     * the user's own record. Each fires at most once per fast.
     */
    public static void maybeMilestone(Context ctx) {
        AppCore core = AppCore.get();
        SharedPreferences p = core.prefs();
        if (!p.getBoolean(P_MOTIVATION, true)) return;
        if (!core.isFasting() || core.isPaused()) return;

        int goal = core.goalHours();
        if (goal <= 0) return;
        long elapsed = core.elapsedMs();
        double pct = (elapsed / 3600000.0) / goal * 100.0;
        int fired = p.getInt(P_MILESTONES, 0);
        boolean ar = core.isArabic();

        int bit = 0;
        String title = null, body = null;
        if (pct >= 75 && (fired & 4) == 0) {
            bit = 4;
            title = ar ? "٧٥٪ من الهدف" : "75% of your goal";
            body = pick(ar ? M75_AR : M75_EN);
        } else if (pct >= 50 && (fired & 2) == 0) {
            bit = 2;
            title = ar ? "نص الطريق" : "Halfway";
            body = pick(ar ? M50_AR : M50_EN);
        } else if (pct >= 25 && (fired & 1) == 0) {
            bit = 1;
            title = ar ? "٢٥٪ خلصت" : "25% done";
            body = pick(ar ? M25_AR : M25_EN);
        }

        long best = p.getLong(P_BEST_FAST, 0L);
        if (best > 0 && elapsed > best && (fired & 8) == 0) {
            bit = 8;
            title = ar ? "رقم شخصي جديد" : "New personal best";
            long h = best / 3600000L;
            body = ar ? "عدّيت أطول صيام ليك (" + h + " ساعة). ده رقمك الجديد."
                      : "You just passed your longest fast (" + h + "h). That is the new record.";
        }

        if (bit == 0 || title == null) return;
        p.edit().putInt(P_MILESTONES, fired | bit).apply();
        notify(ctx, 4216 + bit, title, body);
    }

    public static void resetFastState(SharedPreferences p) {
        p.edit().putInt(P_MILESTONES, 0).putLong(P_LAST_WATER, 0L).apply();
    }

    // ------------------------------------------------------------------
    // Message pools — varied so a daily user does not read the same line
    // ------------------------------------------------------------------

    private static final String[] M25_AR = {
            "ربع الطريق خلص. أصعب جزء هو أول موجة جوع، وهي بتعدّي في ٢٠ دقيقة.",
            "٢٥٪ ورا ضهرك. الجليكوجين بدأ يقل والجسم بيحوّل ترسه.",
            "بدأت كويس. اشرب مياه دلوقتي قبل ما تحس بالعطش."
    };
    private static final String[] M25_EN = {
            "A quarter done. The hardest part is the first hunger wave, and it passes in 20 minutes.",
            "25% behind you. Glycogen is dropping and the body is changing gear.",
            "Good start. Drink now, before you feel thirsty."
    };
    private static final String[] M50_AR = {
            "نص الطريق. اللي فات أصعب من اللي جاي — الجوع بيقل من هنا مش بيزيد.",
            "٥٠٪. الإنسولين نزل والجسم بقى بيحرق دهون فعلاً.",
            "نصّها خلص. لو حسيت بصداع، ده ملح ناقص مش أكل ناقص."
    };
    private static final String[] M50_EN = {
            "Halfway. The hard part is behind you — hunger fades from here, it does not build.",
            "50%. Insulin has dropped and you are genuinely burning fat now.",
            "Half done. A headache here means salt, not food."
    };
    private static final String[] M75_AR = {
            "٧٥٪. فاضل شوية — الكيتونات شغالة والمخ صافي.",
            "ثلاثة أرباع. متكسرش دلوقتي، إنت في أحسن جزء فسيولوجياً.",
            "قربت. جهّز إفطارك: بروتين وسلطة، مش خبز وسكر."
    };
    private static final String[] M75_EN = {
            "75%. Nearly there — ketones are running and the head is clear.",
            "Three quarters. Do not stop now, this is the best part physiologically.",
            "Almost done. Plan the meal: protein and salad, not bread and sugar."
    };

    private static String pick(String[] pool) {
        return pool[RND.nextInt(pool.length)];
    }

    // ------------------------------------------------------------------

    private static void notify(Context ctx, int id, String title, String text) {
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, id, open, FastingService.piFlags(false));

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(ctx, FastingService.CH_ALERTS);
        } else {
            b = new Notification.Builder(ctx);
            b.setPriority(Notification.PRIORITY_DEFAULT);
        }
        b.setContentTitle(title);
        b.setContentText(text);
        b.setStyle(new Notification.BigTextStyle().bigText(text));
        b.setSmallIcon(R.mipmap.ic_launcher);
        b.setContentIntent(pi);
        b.setAutoCancel(true);
        nm.notify(id, b.build());
    }
}
