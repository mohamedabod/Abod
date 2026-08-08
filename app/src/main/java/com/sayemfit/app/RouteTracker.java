package com.sayemfit.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;

import java.util.ArrayList;
import java.util.List;

/**
 * Walk / run route recording from the phone's GPS.
 *
 * Deliberately uses the framework LocationManager rather than the fused
 * provider: this app has no Play Services dependency and must keep working on
 * Huawei devices, which ship without Google Play at all.
 */
public class RouteTracker implements LocationListener {

    /** Points worse than this (metres of reported accuracy) are dropped. */
    private static final float MAX_ACCURACY_M = 35f;
    /** A jump further than this between two fixes is GPS noise, not movement. */
    private static final double MAX_JUMP_M = 120.0;
    private static final long MIN_INTERVAL_MS = 2000L;
    private static final double MIN_ELEVATION_STEP_M = 1.5;

    private final Context ctx;
    private final AppCore core;

    private LocationManager lm;
    private HandlerThread thread;
    private Handler handler;

    private final List<double[]> points = new ArrayList<double[]>(); // lat, lon, alt, time
    private boolean tracking;
    private boolean paused;
    private long startedAt;
    private long pausedTotal;
    private long pausedAt;
    private double distanceM;
    private double elevationGainM;
    private double lastAlt = Double.NaN;
    private float lastAccuracy = -1f;
    private float currentSpeed;
    private String lastError = "";

    public RouteTracker(Context c, AppCore core) {
        this.ctx = c.getApplicationContext();
        this.core = core;
    }

    // ------------------------------------------------------------------
    // Control
    // ------------------------------------------------------------------

    /** @return "ok" | "no_permission" | "gps_off" | "no_provider" */
    public synchronized String start() {
        if (tracking) return "ok";
        if (!hasPermission()) return "no_permission";

        lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return "no_provider";
        if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) return "gps_off";

        thread = new HandlerThread("sayem-route");
        thread.start();
        handler = new Handler(thread.getLooper());

        points.clear();
        distanceM = 0;
        elevationGainM = 0;
        lastAlt = Double.NaN;
        pausedTotal = 0;
        pausedAt = 0;
        paused = false;
        startedAt = System.currentTimeMillis();
        lastError = "";

        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, MIN_INTERVAL_MS, 0f,
                    this, thread.getLooper());
        } catch (SecurityException e) {
            stopThread();
            return "no_permission";
        } catch (IllegalArgumentException e) {
            stopThread();
            return "no_provider";
        }

        tracking = true;
        core.emit("route", stateJson());
        return "ok";
    }

    public synchronized void pause() {
        if (!tracking || paused) return;
        paused = true;
        pausedAt = System.currentTimeMillis();
        core.emit("route", stateJson());
    }

    public synchronized void resume() {
        if (!tracking || !paused) return;
        paused = false;
        pausedTotal += System.currentTimeMillis() - pausedAt;
        pausedAt = 0;
        core.emit("route", stateJson());
    }

    public synchronized void stop() {
        if (!tracking) return;
        tracking = false;
        paused = false;
        try {
            if (lm != null) lm.removeUpdates(this);
        } catch (SecurityException ignored) {
        }
        stopThread();
        core.emit("route", stateJson());
    }

    private void stopThread() {
        if (thread != null) {
            thread.quitSafely();
            thread = null;
            handler = null;
        }
    }

    public boolean isTracking() {
        return tracking;
    }

    public boolean hasPermission() {
        return ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    public long elapsedMs() {
        if (startedAt == 0) return 0;
        long end = paused && pausedAt > 0 ? pausedAt : System.currentTimeMillis();
        long ms = end - startedAt - pausedTotal;
        return ms < 0 ? 0 : ms;
    }

    // ------------------------------------------------------------------
    // LocationListener
    // ------------------------------------------------------------------

    @Override
    public void onLocationChanged(Location loc) {
        if (loc == null || !tracking || paused) return;

        lastAccuracy = loc.getAccuracy();
        if (loc.hasAccuracy() && loc.getAccuracy() > MAX_ACCURACY_M) {
            core.emit("route", stateJson());
            return;
        }

        double lat = loc.getLatitude();
        double lon = loc.getLongitude();
        double alt = loc.hasAltitude() ? loc.getAltitude() : Double.NaN;
        currentSpeed = loc.hasSpeed() ? loc.getSpeed() : 0f;

        synchronized (points) {
            if (!points.isEmpty()) {
                double[] prev = points.get(points.size() - 1);
                double d = haversine(prev[0], prev[1], lat, lon);
                if (d > MAX_JUMP_M) {
                    // Teleport: keep the point as a new anchor but do not bank the distance.
                    points.add(new double[]{lat, lon, alt, System.currentTimeMillis()});
                    return;
                }
                distanceM += d;
            }
            points.add(new double[]{lat, lon, alt, System.currentTimeMillis()});
            if (points.size() > 20000) points.remove(0);
        }

        if (!Double.isNaN(alt)) {
            if (!Double.isNaN(lastAlt)) {
                double dAlt = alt - lastAlt;
                if (dAlt > MIN_ELEVATION_STEP_M) elevationGainM += dAlt;
                if (Math.abs(dAlt) > MIN_ELEVATION_STEP_M) lastAlt = alt;
            } else {
                lastAlt = alt;
            }
        }

        core.emit("route", stateJson());
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {
    }

    @Override
    public void onProviderEnabled(String provider) {
        lastError = "";
    }

    @Override
    public void onProviderDisabled(String provider) {
        lastError = "gps_off";
        core.emit("route", stateJson());
    }

    // ------------------------------------------------------------------
    // Output
    // ------------------------------------------------------------------

    public String stateJson() {
        long ms = elapsedMs();
        double km = distanceM / 1000.0;
        // Pace in seconds per km — the number runners actually read.
        long paceSecPerKm = km > 0.02 ? (long) (ms / 1000.0 / km) : 0;

        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"tracking\":").append(tracking).append(',');
        sb.append("\"paused\":").append(paused).append(',');
        sb.append("\"points\":").append(points.size()).append(',');
        sb.append("\"distanceM\":").append(Math.round(distanceM)).append(',');
        sb.append("\"elapsedMs\":").append(ms).append(',');
        sb.append("\"paceSecPerKm\":").append(paceSecPerKm).append(',');
        sb.append("\"speed\":").append(String.format(java.util.Locale.US, "%.2f", currentSpeed)).append(',');
        sb.append("\"elevationM\":").append(Math.round(elevationGainM)).append(',');
        sb.append("\"accuracy\":").append(Math.round(lastAccuracy)).append(',');
        sb.append("\"error\":\"").append(Json.esc(lastError)).append("\",");
        sb.append("\"hasPermission\":").append(hasPermission());
        sb.append('}');
        return sb.toString();
    }

    /**
     * Track as a flat [lat,lon,...] array, thinned to at most `max` points so
     * the SVG the UI draws stays cheap.
     */
    public String pathJson(int max) {
        StringBuilder sb = new StringBuilder("[");
        synchronized (points) {
            int n = points.size();
            if (n == 0) return "[]";
            int step = max > 0 && n > max ? (int) Math.ceil((double) n / max) : 1;
            boolean first = true;
            for (int i = 0; i < n; i += step) {
                double[] p = points.get(i);
                if (!first) sb.append(',');
                sb.append(String.format(java.util.Locale.US, "%.6f,%.6f", p[0], p[1]));
                first = false;
            }
        }
        return sb.append(']').toString();
    }

    /** Standard GPX 1.1 so the track opens in any maps or running app. */
    public String toGpx(String name) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<gpx version=\"1.1\" creator=\"Aboud Sayem\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n");
        sb.append("<trk><name>").append(Json.esc(name)).append("</name><trkseg>\n");
        synchronized (points) {
            for (int i = 0; i < points.size(); i++) {
                double[] p = points.get(i);
                sb.append(String.format(java.util.Locale.US,
                        "<trkpt lat=\"%.6f\" lon=\"%.6f\">", p[0], p[1]));
                if (!Double.isNaN(p[2])) {
                    sb.append(String.format(java.util.Locale.US, "<ele>%.1f</ele>", p[2]));
                }
                sb.append("<time>").append(iso((long) p[3])).append("</time>");
                sb.append("</trkpt>\n");
            }
        }
        sb.append("</trkseg></trk></gpx>\n");
        return sb.toString();
    }

    /** First recorded point as "lat,lon" for a geo: intent, or "". */
    public String firstPoint() {
        synchronized (points) {
            if (points.isEmpty()) return "";
            double[] p = points.get(0);
            return String.format(java.util.Locale.US, "%.6f,%.6f", p[0], p[1]);
        }
    }

    private static String iso(long ms) {
        java.text.SimpleDateFormat f =
                new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return f.format(new java.util.Date(ms));
    }

    static double haversine(double lat1, double lon1, double lat2, double lon2) {
        double r = 6371000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
