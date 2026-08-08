package com.sayemfit.app;

import android.media.ImageReader;

/** Named ImageReader.OnImageAvailableListener. */
public class ImageAvailableListener implements ImageReader.OnImageAvailableListener {

    private final PulseCamera pulse;

    public ImageAvailableListener(PulseCamera p) {
        this.pulse = p;
    }

    @Override
    public void onImageAvailable(ImageReader reader) {
        pulse.onFrame(reader);
    }
}
