package com.sayemfit.app;

/**
 * The 7 fasting phases, duplicated here for the notification layer.
 * Must stay in sync with PHASES in assets/public/utils.js.
 */
public final class Phases {

    /** Lower bound, in hours. */
    public static final double[] START_H = {0, 4, 12, 18, 24, 48, 72};

    public static final String[] NAME_AR = {
            "بداية الصيام",
            "حرق الدهون",
            "الكيتوزية",
            "الكيتوزية العميقة",
            "كيتوزية ممتدة",
            "التهام ذاتي عميق",
            "صيام مطوّل"
    };

    public static final String[] NAME_EN = {
            "Anabolic",
            "Catabolic",
            "Ketosis",
            "Deep Ketosis",
            "Extended Ketosis",
            "Deep Autophagy",
            "Prolonged Fast"
    };

    public static final String[] DESC_AR = {
            "الجسم يستهلك الجلوكوز المخزّن",
            "بدأ حرق الدهون وانخفاض الإنسولين",
            "إنتاج الكيتونات ووضوح ذهني",
            "بدء الالتهام الذاتي",
            "ذروة الالتهام الذاتي وارتفاع هرمون النمو",
            "إصلاح خلوي عميق",
            "مرحلة متقدمة — تابع حالتك مع طبيبك"
    };

    public static final String[] DESC_EN = {
            "Burning stored glucose",
            "Fat burning started, insulin dropping",
            "Ketone production, mental clarity",
            "Autophagy begins",
            "Peak autophagy, HGH surge",
            "Deep cellular repair",
            "Advanced stage — stay under medical supervision"
    };

    private Phases() {
    }

    public static int indexFor(double hours) {
        int idx = 0;
        for (int i = 0; i < START_H.length; i++) {
            if (hours >= START_H[i]) idx = i;
        }
        return idx;
    }

    public static String name(int idx, boolean ar) {
        if (idx < 0) idx = 0;
        if (idx >= START_H.length) idx = START_H.length - 1;
        return ar ? NAME_AR[idx] : NAME_EN[idx];
    }

    public static String desc(int idx, boolean ar) {
        if (idx < 0) idx = 0;
        if (idx >= START_H.length) idx = START_H.length - 1;
        return ar ? DESC_AR[idx] : DESC_EN[idx];
    }

    /** Hours at which the next phase begins, or -1 when already in the last one. */
    public static double nextBoundaryH(double hours) {
        for (int i = 0; i < START_H.length; i++) {
            if (START_H[i] > hours) return START_H[i];
        }
        return -1;
    }
}
