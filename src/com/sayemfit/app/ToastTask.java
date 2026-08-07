package com.sayemfit.app;

import android.content.Context;
import android.widget.Toast;

/** Shows a toast from the UI thread. */
public class ToastTask implements Runnable {

    private final Context ctx;
    private final String msg;

    public ToastTask(Context c, String m) {
        this.ctx = c;
        this.msg = m;
    }

    @Override
    public void run() {
        Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show();
    }
}
