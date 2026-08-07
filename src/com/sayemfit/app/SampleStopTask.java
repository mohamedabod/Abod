package com.sayemfit.app;

/** Handler task: closes an accelerometer sampling window and scores it. */
public class SampleStopTask implements Runnable {

    private final SensorTracker tracker;

    public SampleStopTask(SensorTracker t) {
        this.tracker = t;
    }

    @Override
    public void run() {
        tracker.endSampleWindow();
    }
}
