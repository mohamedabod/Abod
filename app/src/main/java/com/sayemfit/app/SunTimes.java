package com.sayemfit.app;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * Sunset and dawn for a coordinate, in local wall-clock minutes.
 *
 * This duplicates the calculation that already exists in utils.js, and the
 * duplication is deliberate. The JS copy runs when the app is open and drives
 * what the user sees; the alarms are armed by the system days in advance and
 * cannot call into a WebView that is not running. Without a native copy the
 * scheduler can only replay whatever time the JS last handed it, so an iftar
 * reminder set on the first evening of Ramadan keeps firing at that time all
 * month while the screen correctly shows maghrib drifting twenty minutes
 * later — the app tells the truth and rings at the wrong moment.
 *
 * Standard NOAA solar-position approximation, accurate to well under a minute
 * at these latitudes. Any change here must be mirrored in sunTimes().
 */
final class SunTimes {

    /** Solar depression angles, matching SUN_CONVENTIONS in utils.js. */
    private static double fajrAngle(String convention) {
        if ("mwl".equals(convention)) return 18.0;
        if ("makkah".equals(convention)) return 18.5;
        if ("isna".equals(convention)) return 15.0;
        return 19.5;                                    // Egyptian survey
    }

    private SunTimes() {
    }

    /**
     * @return minutes after local midnight, or -1 when the sun never reaches
     *         the angle on that day (possible above the polar circles).
     */
    static int minutesFor(long dayMillis, double lat, double lon,
                          String convention, boolean wantFajr) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(dayMillis);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);

        long julian = (long) Math.floor(c.getTimeInMillis() / 86400000.0 + 2440587.5);
        double n = julian - 2451545.0 + 0.0008;

        double meanSolarNoon = n - lon / 360.0;
        double meanAnomaly = (357.5291 + 0.98560028 * meanSolarNoon) % 360.0;
        double center = 1.9148 * Math.sin(Math.toRadians(meanAnomaly))
                + 0.02 * Math.sin(Math.toRadians(2 * meanAnomaly))
                + 0.0003 * Math.sin(Math.toRadians(3 * meanAnomaly));
        double eclipticLon = (meanAnomaly + center + 180 + 102.9372) % 360.0;
        double transit = 2451545.0 + meanSolarNoon
                + 0.0053 * Math.sin(Math.toRadians(meanAnomaly))
                - 0.0069 * Math.sin(Math.toRadians(2 * eclipticLon));
        double declination = Math.asin(Math.sin(Math.toRadians(eclipticLon))
                * Math.sin(Math.toRadians(23.44)));

        // -0.833° at the horizon accounts for refraction and the sun's radius.
        double depression = wantFajr ? fajrAngle(convention) : 0.833;
        double cosH = (Math.sin(Math.toRadians(-depression))
                - Math.sin(Math.toRadians(lat)) * Math.sin(declination))
                / (Math.cos(Math.toRadians(lat)) * Math.cos(declination));
        if (cosH > 1 || cosH < -1) return -1;

        double hourAngle = Math.toDegrees(Math.acos(cosH)) / 360.0;
        double event = wantFajr ? transit - hourAngle : transit + hourAngle;

        // The device's own offset for that day, so a DST change is included.
        TimeZone tz = TimeZone.getDefault();
        double offsetHours = tz.getOffset(c.getTimeInMillis()) / 3600000.0;
        double hours = (event - Math.floor(event) - 0.5) * 24 + offsetHours;
        hours = ((hours % 24) + 24) % 24;
        return (int) Math.round(hours * 60);
    }

    /** "HH:MM" for the given event, or null when it does not occur. */
    static String format(long dayMillis, double lat, double lon,
                         String convention, boolean wantFajr) {
        int mins = minutesFor(dayMillis, lat, lon, convention, wantFajr);
        if (mins < 0) return null;
        int h = (mins / 60) % 24, m = mins % 60;
        return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
}
