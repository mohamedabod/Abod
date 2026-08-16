package com.sayemfit.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Wakes the service on phase / goal milestones even while the device dozes,
 * and delivers the scheduled daily reminders.
 */
public class AlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        AppCore core = AppCore.get();
        core.init(context);

        String action = intent != null ? intent.getAction() : null;
        if (Reminders.ACTION_REMIND.equals(action)) {
            String kind = intent.getStringExtra(Reminders.EXTRA_KIND);
            if (kind != null) Reminders.fire(context, kind);
            return;
        }

        if (!core.isFasting()) return;
        FastingService.start(context);
    }
}
