package com.sayemfit.app;

import android.hardware.camera2.CameraDevice;

/** Named CameraDevice.StateCallback (no anonymous classes in this pipeline). */
public class CameraStateCallback extends CameraDevice.StateCallback {

    private final PulseCamera pulse;

    public CameraStateCallback(PulseCamera p) {
        this.pulse = p;
    }

    @Override
    public void onOpened(CameraDevice camera) {
        pulse.onCameraOpened(camera);
    }

    @Override
    public void onDisconnected(CameraDevice camera) {
        camera.close();
        pulse.onCameraFailed();
    }

    @Override
    public void onError(CameraDevice camera, int error) {
        camera.close();
        pulse.onCameraFailed();
    }
}
