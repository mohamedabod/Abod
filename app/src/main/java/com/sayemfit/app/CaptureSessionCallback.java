package com.sayemfit.app;

import android.hardware.camera2.CameraCaptureSession;

/** Named CameraCaptureSession.StateCallback. */
public class CaptureSessionCallback extends CameraCaptureSession.StateCallback {

    private final PulseCamera pulse;

    public CaptureSessionCallback(PulseCamera p) {
        this.pulse = p;
    }

    @Override
    public void onConfigured(CameraCaptureSession session) {
        pulse.onSessionReady(session);
    }

    @Override
    public void onConfigureFailed(CameraCaptureSession session) {
        pulse.onSessionFailed();
    }
}
