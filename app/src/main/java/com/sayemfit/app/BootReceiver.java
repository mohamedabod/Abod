package com.sayemfit.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores a running fast after a reboot or an app update. */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        AppCore core = AppCore.get();
        core.init(context);
        // Alarms are cleared by a reboot; re-arm every daily reminder.
        Reminders.scheduleAll(context);
        if (!core.isFasting()) return;
        FastingService.start(context);
    }
}
