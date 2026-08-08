package com.sayemfit.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Surface;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Heart rate from the phone camera (photoplethysmography).
 *
 * The user covers the rear lens with a fingertip; the torch lights the tissue
 * and each heartbeat changes how much light comes back. Averaging the luma
 * plane per frame gives a waveform whose peaks are beats.
 *
 * This exists because the Huawei band only exposes live HR while its
 * "HR Data Broadcasts" mode is on, which the user does not want to leave
 * running. It is an estimate, not a medical measurement.
 */
public class PulseCamera {

    private static final String TAG = "SayemPulse";

    private static final long WARMUP_MS = 3000L;
    private static final long MEASURE_MS = 20000L;
    /** 220 bpm ceiling -> beats can never be closer than this. */
    private static final long MIN_BEAT_GAP_MS = 270L;
    private static final int MIN_BEATS = 6;

    private final Context ctx;
    private final AppCore core;

    private final ImageAvailableListener frameListener = new ImageAvailableListener(this);
    private final CameraStateCallback cameraCallback = new CameraStateCallback(this);
    private final CaptureSessionCallback sessionCallback = new CaptureSessionCallback(this);

    private CameraManager manager;
    private CameraDevice device;
    private CameraCaptureSession session;
    private ImageReader reader;
    private HandlerThread thread;
    private Handler handler;

    private final List<long[]> samples = new ArrayList<long[]>(); // time, meanLuma x1000
    private boolean running;
    private long startedAt;
    private String status = "idle";
    private int bpm;
    private int quality;
    private long lastEmit;

    public PulseCamera(Context c, AppCore core) {
        this.ctx = c.getApplicationContext();
        this.core = core;
    }

    // ------------------------------------------------------------------
    // Control
    // ------------------------------------------------------------------

    /** @return "ok" | "no_permission" | "no_camera" | "busy" */
    public synchronized String start() {
        if (running) return "busy";
        if (ctx.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return "no_permission";
        }
        manager = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
        if (manager == null) return "no_camera";

        String camId = pickBackCamera();
        if (camId == null) return "no_camera";

        thread = new HandlerThread("sayem-pulse");
        thread.start();
        handler = new Handler(thread.getLooper());

        samples.clear();
        bpm = 0;
        quality = 0;
        startedAt = System.currentTimeMillis();
        running = true;
        setStatus("warmup");

        reader = ImageReader.newInstance(240, 180, ImageFormat.YUV_420_888, 3);
        reader.setOnImageAvailableListener(frameListener, handler);

        try {
            manager.openCamera(camId, cameraCallback, handler);
        } catch (CameraAccessException e) {
            cleanup();
            return "no_camera";
        } catch (SecurityException e) {
            cleanup();
            return "no_permission";
        }
        return "ok";
    }

    public synchronized void cancel() {
        if (!running) return;
        running = false;
        setStatus("idle");
        cleanup();
    }

    public boolean isRunning() {
        return running;
    }

    public String stateJson() {
        long elapsed = running ? System.currentTimeMillis() - startedAt : 0;
        long total = WARMUP_MS + MEASURE_MS;
        int progress = (int) Math.min(100, elapsed * 100 / total);
        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"status\":\"").append(status).append("\",");
        sb.append("\"running\":").append(running).append(',');
        sb.append("\"progress\":").append(running ? progress : 0).append(',');
        sb.append("\"bpm\":").append(bpm).append(',');
        sb.append("\"quality\":").append(quality).append(',');
        sb.append("\"samples\":").append(samples.size());
        sb.append('}');
        return sb.toString();
    }

    // ------------------------------------------------------------------
    // Camera plumbing (called from the named callback classes)
    // ------------------------------------------------------------------

    void onCameraOpened(CameraDevice cam) {
        device = cam;
        if (!running) {
            cleanup();
            return;
        }
        try {
            List<Surface> outputs = Collections.singletonList(reader.getSurface());
            cam.createCaptureSession(outputs, sessionCallback, handler);
        } catch (CameraAccessException e) {
            fail("no_camera");
        } catch (IllegalStateException e) {
            fail("no_camera");
        }
    }

    void onCameraFailed() {
        fail("no_camera");
    }

    void onSessionReady(CameraCaptureSession s) {
        session = s;
        if (!running) {
            cleanup();
            return;
        }
        try {
            CaptureRequest.Builder b = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            b.addTarget(reader.getSurface());
            // Torch on: without it the finger signal is far too dark to read.
            b.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_TORCH);
            b.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            b.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO);
            s.setRepeatingRequest(b.build(), null, handler);
            setStatus("warmup");
        } catch (CameraAccessException e) {
            fail("no_camera");
        } catch (IllegalStateException e) {
            fail("no_camera");
        }
    }

    void onSessionFailed() {
        fail("no_camera");
    }

    /** One preview frame: average the luma plane over a centred window. */
    void onFrame(ImageReader r) {
        Image img = null;
        try {
            img = r.acquireLatestImage();
            if (img == null || !running) return;

            Image.Plane plane = img.getPlanes()[0];
            ByteBuffer buf = plane.getBuffer();
            int rowStride = plane.getRowStride();
            int width = img.getWidth();
            int height = img.getHeight();

            int x0 = width / 4, x1 = width * 3 / 4;
            int y0 = height / 4, y1 = height * 3 / 4;
            long sum = 0;
            int count = 0;
            for (int y = y0; y < y1; y += 2) {
                int base = y * rowStride;
                for (int x = x0; x < x1; x += 2) {
                    int idx = base + x;
                    if (idx < buf.limit()) {
                        sum += (buf.get(idx) & 0xFF);
                        count++;
                    }
                }
            }
            if (count == 0) return;

            double mean = (double) sum / count;
            long now = System.currentTimeMillis();
            long elapsed = now - startedAt;

            if (elapsed > WARMUP_MS) {
                if (!"measuring".equals(status)) setStatus("measuring");
                synchronized (samples) {
                    samples.add(new long[]{now, Math.round(mean * 1000)});
                }
            }

            // Finger check: covered + lit reads bright and even, not dark.
            if (mean < 12) {
                quality = 0;
            } else if (mean > 250) {
                quality = 1;
            } else {
                quality = 2;
            }

            if (now - lastEmit > 400) {
                lastEmit = now;
                core.emit("pulse", stateJson());
            }

            if (elapsed >= WARMUP_MS + MEASURE_MS) finish();
        } catch (IllegalStateException e) {
            Log.w(TAG, "frame drop");
        } finally {
            if (img != null) img.close();
        }
    }

    // ------------------------------------------------------------------
    // Signal processing
    // ------------------------------------------------------------------

    private synchronized void finish() {
        if (!running) return;
        running = false;

        int result = analyse();
        if (result > 0) {
            bpm = result;
            setStatus("done");
            core.recordPulse(result);
        } else {
            setStatus("weak_signal");
        }
        cleanup();
        core.emit("pulse", stateJson());
    }

    /** @return bpm, or 0 when the trace is not usable. */
    private int analyse() {
        long[][] data;
        synchronized (samples) {
            if (samples.size() < 60) return 0;
            data = samples.toArray(new long[samples.size()][]);
        }

        int n = data.length;
        double[] v = new double[n];
        long[] ts = new long[n];
        for (int i = 0; i < n; i++) {
            ts[i] = data[i][0];
            v[i] = data[i][1] / 1000.0;
        }

        // Detrend: subtract a ~0.8s moving average to kill the slow drift from
        // finger pressure and auto-exposure, leaving the pulse ripple.
        double spanMs = 800;
        double[] d = new double[n];
        for (int i = 0; i < n; i++) {
            double sum = 0;
            int c = 0;
            for (int j = i; j >= 0 && ts[i] - ts[j] <= spanMs; j--) { sum += v[j]; c++; }
            for (int j = i + 1; j < n && ts[j] - ts[i] <= spanMs; j++) { sum += v[j]; c++; }
            d[i] = v[i] - (c > 0 ? sum / c : v[i]);
        }

        double sd = stdDev(d);
        if (sd < 0.02) return 0; // flat trace: no finger, or no contact

        // Peak picking on the detrended trace.
        double threshold = sd * 0.6;
        List<Long> beats = new ArrayList<Long>();
        for (int i = 1; i < n - 1; i++) {
            if (d[i] > threshold && d[i] >= d[i - 1] && d[i] > d[i + 1]) {
                if (beats.isEmpty() || ts[i] - beats.get(beats.size() - 1) >= MIN_BEAT_GAP_MS) {
                    beats.add(ts[i]);
                }
            }
        }
        if (beats.size() < MIN_BEATS) return 0;

        double[] gaps = new double[beats.size() - 1];
        for (int i = 1; i < beats.size(); i++) gaps[i - 1] = beats.get(i) - beats.get(i - 1);
        Arrays.sort(gaps);
        double median = gaps[gaps.length / 2];
        if (median <= 0) return 0;

        // Reject a trace whose beat spacing is all over the place.
        int consistent = 0;
        for (int i = 0; i < gaps.length; i++) {
            if (Math.abs(gaps[i] - median) < median * 0.35) consistent++;
        }
        if (consistent < gaps.length * 0.6) return 0;

        int result = (int) Math.round(60000.0 / median);
        if (result < 35 || result > 210) return 0;
        return result;
    }

    private static double stdDev(double[] a) {
        double mean = 0;
        for (int i = 0; i < a.length; i++) mean += a[i];
        mean /= a.length;
        double var = 0;
        for (int i = 0; i < a.length; i++) var += (a[i] - mean) * (a[i] - mean);
        return Math.sqrt(var / a.length);
    }

    // ------------------------------------------------------------------
    // Teardown
    // ------------------------------------------------------------------

    private String pickBackCamera() {
        try {
            String[] ids = manager.getCameraIdList();
            String fallback = null;
            for (int i = 0; i < ids.length; i++) {
                CameraCharacteristics cc = manager.getCameraCharacteristics(ids[i]);
                Integer facing = cc.get(CameraCharacteristics.LENS_FACING);
                if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) continue;
                Boolean flash = cc.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (flash != null && flash) return ids[i];
                if (fallback == null) fallback = ids[i];
            }
            if (fallback != null) return fallback;
            return ids.length > 0 ? ids[0] : null;
        } catch (CameraAccessException e) {
            return null;
        }
    }

    private void fail(String code) {
        running = false;
        setStatus(code);
        cleanup();
    }

    private void setStatus(String s) {
        status = s;
        core.emit("pulse", stateJson());
    }

    private synchronized void cleanup() {
        try {
            if (session != null) { session.close(); session = null; }
        } catch (Exception ignored) {
        }
        try {
            if (device != null) { device.close(); device = null; }
        } catch (Exception ignored) {
        }
        try {
            if (reader != null) { reader.close(); reader = null; }
        } catch (Exception ignored) {
        }
        if (thread != null) {
            thread.quitSafely();
            thread = null;
            handler = null;
        }
    }
}
