package com.sayemfit.app;

import android.app.Activity;

/** Named Runnable that hops the PDF export onto the UI thread. */
final class PrintTask implements Runnable {

    private final Activity activity;
    private final String html;
    private final String name;

    PrintTask(Activity activity, String html, String name) {
        this.activity = activity;
        this.html = html;
        this.name = name;
    }

    @Override
    public void run() {
        PdfExporter.print(activity, html, name);
    }
}
