package com.sayemfit.app;

/** Closes the activity from the UI thread when the SPA has nothing left to pop. */
public class FinishTask implements Runnable {

    private final MainActivity activity;

    public FinishTask(MainActivity a) {
        this.activity = a;
    }

    @Override
    public void run() {
        activity.finishFromWeb();
    }
}
