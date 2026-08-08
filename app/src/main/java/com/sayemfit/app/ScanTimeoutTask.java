package com.sayemfit.app;

/** Handler task: gives up on a scan that found nothing. */
public class ScanTimeoutTask implements Runnable {

    private final BleManager manager;

    public ScanTimeoutTask(BleManager m) {
        this.manager = m;
    }

    @Override
    public void run() {
        manager.onScanTimedOut();
    }
}
