package com.sayemfit.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Home-screen widget: the fast clock without opening the app.
 *
 * Refreshed by FastingService on its normal tick, so there is no separate
 * timer and no extra wakeups — the widget rides along with work the service
 * is already doing.
 */
public class FastWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int i = 0; i < ids.length; i++) {
            mgr.updateAppWidget(ids[i], build(ctx));
        }
    }

    /** Redraws every placed instance. Safe to call from anywhere. */
    public static void refresh(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            ComponentName cn = new ComponentName(ctx, FastWidget.class);
            int[] ids = mgr.getAppWidgetIds(cn);
            if (ids == null || ids.length == 0) return;
            RemoteViews rv = build(ctx);
            for (int i = 0; i < ids.length; i++) {
                mgr.updateAppWidget(ids[i], rv);
            }
        } catch (Exception ignored) {
        }
    }

    private static RemoteViews build(Context ctx) {
        AppCore core = AppCore.get();
        core.init(ctx);
        boolean ar = core.isArabic();
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_fast);

        if (!core.isFasting()) {
            rv.setTextViewText(R.id.w_time, ar ? "مش صايم" : "Not fasting");
            rv.setTextViewText(R.id.w_phase, ar ? "اضغط للبدء" : "Tap to start");
            rv.setTextViewText(R.id.w_goal, "");
            rv.setProgressBar(R.id.w_progress, 100, 0, false);
        } else {
            long ms = core.elapsedMs();
            long totalMin = ms / 60000L;
            long h = totalMin / 60, m = totalMin % 60;
            double hours = ms / 3600000.0;
            int goal = core.goalHours();
            int pct = goal > 0 ? (int) Math.min(100, Math.floor(hours / goal * 100)) : 0;

            rv.setTextViewText(R.id.w_time, h + (ar ? " س " : "h ") + (m < 10 ? "0" + m : "" + m)
                    + (ar ? " د" : "m"));
            rv.setTextViewText(R.id.w_phase, Phases.name(Phases.indexFor(hours), ar));
            rv.setTextViewText(R.id.w_goal, goal > 0
                    ? pct + "% " + (ar ? "من " + goal + " ساعة" : "of " + goal + "h")
                    : "");
            rv.setProgressBar(R.id.w_progress, 100, pct, false);
        }

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, FastingService.piFlags(false));
        rv.setOnClickPendingIntent(R.id.w_root, pi);
        return rv;
    }
}
