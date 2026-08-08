package com.sayemfit.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Wakes the service on phase / goal milestones even while the device dozes. */
public class AlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        AppCore core = AppCore.get();
        core.init(context);
        if (!core.isFasting()) return;
        FastingService.start(context);
    }
}
