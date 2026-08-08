package com.sayemfit.app;

/** Handler task: opens an accelerometer sampling window. */
public class SampleStartTask implements Runnable {

    private final SensorTracker tracker;

    public SampleStartTask(SensorTracker t) {
        this.tracker = t;
    }

    @Override
    public void run() {
        tracker.beginSampleWindow();
    }
}
