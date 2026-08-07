package com.sayemfit.app;

/** Handler task: periodic notification refresh for the running fast. */
public class ServiceTickTask implements Runnable {

    private final FastingService service;

    public ServiceTickTask(FastingService s) {
        this.service = s;
    }

    @Override
    public void run() {
        service.onTick();
    }
}
