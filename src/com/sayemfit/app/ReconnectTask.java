package com.sayemfit.app;

/** Handler task: retries the band link after it drops. */
public class ReconnectTask implements Runnable {

    private final BleManager manager;

    public ReconnectTask(BleManager m) {
        this.manager = m;
    }

    @Override
    public void run() {
        manager.retryConnect();
    }
}
