/* =====================================================================
 * utils.js — Aboud Sayem v4.0
 * Data layer, i18n, fasting science tables, native bridge.
 *
 * ES5 ONLY. No let/const, no arrows, no template literals, no spread,
 * no destructuring, no classes, no async/await. See README.
 * ===================================================================== */

var APP_VERSION = '5.2';
var STORE_KEY = 'sayem_v4';
var LEGACY_KEY = 'sayem_v3';

/* ---------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------- */

/** Object merge — stands in for the forbidden spread operator. */
function m() {
  var out = arguments[0] || {};
  for (var i = 1; i < arguments.length; i++) {
    var src = arguments[i];
    if (!src) continue;
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    }
  }
  return out;
}

function clone(o) {
  try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; }
}

function uid() {
  return String(Date.now()) + '_' + Math.floor(Math.random() * 100000);
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function dayKey(ts) {
  var d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function startOfDay(ts) {
  var d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* ---------------------------------------------------------------------
 * Storage
 * ------------------------------------------------------------------- */

var S = {
  _d: null,

  defaults: function () {
    return {
      v: 4,
      currentFast: {
        active: false, startTime: null, pausedAt: null,
        elapsed: 0, goal: 24, note: '',
        hrSum: 0, hrCount: 0, hrMax: 0, stepsAtStart: 0
      },
      meals: [],
      history: [],
      customFoods: [],
      checkins: [],
      pulseLog: [],
      routes: [],
      workouts: [],
      bodyLog: [],
      healthDays: [],
      health: { lastSync: 0, status: '', granted: 0 },
      water: { date: '', ml: 0, target: 3000 },
      profile: {
        // age stays null until the user sets it: a guessed age silently
        // corrupts every calorie number derived from it.
        name: 'Mohamed', weight: 70, height: 170, age: null,
        gender: 'male', activity: 'moderate', lang: 'ar', weightLog: []
      },
      band: { name: '', address: '', auto: false },
      stats: { currentStreak: 0, bestStreak: 0, totalSessions: 0, totalHours: 0, completed: 0 },
      supplements: [{
        id: 'adam',
        name: 'NOW ADAM Multivitamin',
        dosage: '1 capsule daily',
        withMeal: true,
        warning: 'no_double_dose',
        log: []
      }],
      settings: {
        notifyPhase: true,
        arabicDigits: false,
        defaultGoal: 20,
        disclaimerSeen: false,
        onboarded: false,
        // OMAD-shaped defaults: one evening meal, which is the pattern the
        // logged history actually shows.
        windowStart: '17:00',
        windowEnd: '21:00',
        wakeTime: '09:00',
        sleepTarget: 7.5,
        caffeineCutoffH: 8,
        stimulantCutoffH: 8,
        reminders: {
          water: true, motivation: true, window: true, checkin: true,
          supplement: false, nudge: false,
          checkinTime: '20:00', supplementTime: '18:00', nudgeTime: '22:00'
        }
      }
    };
  },

  load: function () {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        this._d = m(this.defaults(), JSON.parse(raw));
        this._d = this.heal(this._d);
        return;
      } catch (e) { /* fall through to migration */ }
    }
    this._d = this.migrate();
    this.save();
  },

  /** Pulls a v3 install forward instead of throwing the user's history away. */
  migrate: function () {
    var d = this.defaults();
    var raw = null;
    try { raw = localStorage.getItem(LEGACY_KEY); } catch (e) { raw = null; }
    if (!raw) return d;
    var old;
    try { old = JSON.parse(raw); } catch (e) { return d; }
    if (!old) return d;

    if (old.profile) d.profile = m(d.profile, old.profile);
    if (old.stats) d.stats = m(d.stats, old.stats);
    if (old.meals && old.meals.length) d.meals = old.meals;
    if (old.supplements && old.supplements.length) {
      var sup = [];
      for (var i = 0; i < old.supplements.length; i++) {
        var s = old.supplements[i];
        sup.push({
          id: uid(), name: s.name || '', dosage: s.dosage || '',
          withMeal: !!s.withMeal, warning: 'no_double_dose',
          log: s.lastTaken ? [s.lastTaken] : []
        });
      }
      d.supplements = sup;
    }
    if (old.history && old.history.length) {
      var hist = [];
      for (var j = 0; j < old.history.length; j++) {
        var h = old.history[j];
        var dur = h.duration || 0;
        var end = h.end || Date.now();
        hist.push({
          id: uid(), start: end - dur, end: end, duration: dur,
          goal: h.goal || 16, completed: true,
          avgHr: 0, maxHr: 0, steps: 0, phase: phaseIndexFor(dur / 3600000)
        });
      }
      d.history = hist;
    }
    if (old.currentFast && old.currentFast.active) {
      d.currentFast = m(d.currentFast, {
        active: true,
        startTime: old.currentFast.startTime || null,
        pausedAt: old.currentFast.pausedAt || null,
        elapsed: old.currentFast.elapsed || 0,
        goal: old.currentFast.goal || 24
      });
    }
    return d;
  },

  /** Guards against a half-written or hand-edited store. */
  heal: function (d) {
    var def = this.defaults();
    if (!d.currentFast) d.currentFast = def.currentFast;
    else d.currentFast = m(clone(def.currentFast), d.currentFast);
    if (!d.profile) d.profile = def.profile; else d.profile = m(clone(def.profile), d.profile);
    if (!d.settings) d.settings = def.settings; else d.settings = m(clone(def.settings), d.settings);
    if (!d.stats) d.stats = def.stats; else d.stats = m(clone(def.stats), d.stats);
    if (!d.water) d.water = def.water;
    if (!d.band) d.band = def.band;
    if (!d.meals) d.meals = [];
    if (!d.history) d.history = [];
    if (!d.customFoods) d.customFoods = [];
    if (!d.checkins) d.checkins = [];
    if (!d.pulseLog) d.pulseLog = [];
    if (!d.routes) d.routes = [];
    if (!d.workouts) d.workouts = [];
    if (!d.bodyLog) d.bodyLog = [];
    if (!d.healthDays) d.healthDays = [];
    if (!d.health) d.health = def.health;
    if (!d.supplements) d.supplements = def.supplements;
    if (!d.profile.weightLog) d.profile.weightLog = [];
    return d;
  },

  data: function () {
    if (!this._d) this.load();
    return this._d;
  },

  get: function (path, def) {
    var val = this.data();
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (val === null || val === undefined) return def;
      val = val[parts[i]];
    }
    return (val === null || val === undefined) ? def : val;
  },

  set: function (path, v) {
    var obj = this.data();
    var parts = path.split('.');
    for (var i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] === null || obj[parts[i]] === undefined) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = v;
    this.save();
  },

  save: function () {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this._d)); } catch (e) {}
  },

  reset: function () {
    this._d = this.defaults();
    this.save();
  },

  importJson: function (text) {
    try {
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') return false;
      this._d = this.heal(m(this.defaults(), parsed));
      this.save();
      return true;
    } catch (e) { return false; }
  },

  /**
   * Adds an export into the current store instead of replacing it.
   *
   * Replace-on-import is a trap when the data comes from elsewhere (a chat
   * log, an old phone): everything already logged here would vanish. Merge
   * keeps both sides, de-duplicating records by id and by timestamp, and
   * never lets an incoming null overwrite a value that is already known.
   * @return the number of records added, or -1 on a parse failure.
   */
  mergeJson: function (text) {
    var incoming;
    try {
      incoming = JSON.parse(text);
    } catch (e) { return -1; }
    if (!incoming || typeof incoming !== 'object') return -1;

    var d = this.data();
    var added = 0;

    if (incoming.profile) {
      for (var k in incoming.profile) {
        if (!Object.prototype.hasOwnProperty.call(incoming.profile, k)) continue;
        if (k === 'weightLog') continue;
        var v = incoming.profile[k];
        if (v === null || v === undefined || v === '') continue;
        d.profile[k] = v;
      }
      if (incoming.profile.weightLog) {
        added += mergeList(d.profile.weightLog, incoming.profile.weightLog, 'ts');
      }
    }
    if (incoming.settings) d.settings = m(d.settings, incoming.settings);

    added += mergeList(d.history, incoming.history, 'id');
    added += mergeList(d.meals, incoming.meals, 'id');
    added += mergeList(d.customFoods, incoming.customFoods, 'k');
    added += mergeList(d.checkins, incoming.checkins, 'ts');
    added += mergeList(d.pulseLog, incoming.pulseLog, 'ts');
    added += mergeList(d.routes, incoming.routes, 'id');
    added += mergeList(d.workouts, incoming.workouts, 'id');
    added += mergeList(d.bodyLog, incoming.bodyLog, 'ts');

    // Supplements match on name so the same pill does not appear twice.
    if (incoming.supplements) {
      for (var i = 0; i < incoming.supplements.length; i++) {
        var sup = incoming.supplements[i];
        var found = null;
        for (var j = 0; j < d.supplements.length; j++) {
          if (d.supplements[j].name === sup.name) { found = d.supplements[j]; break; }
        }
        if (!found) {
          d.supplements.push(sup);
          added++;
        } else {
          if (!found.log) found.log = [];
          var logs = sup.log || [];
          for (var x = 0; x < logs.length; x++) {
            if (found.log.indexOf(logs[x]) < 0) { found.log.push(logs[x]); added++; }
          }
          found.log.sort(function (a, b) { return a - b; });
        }
      }
    }

    sortByTime(d.history, 'start');
    sortByTime(d.meals, 'ts');
    sortByTime(d.checkins, 'ts');
    sortByTime(d.workouts, 'ts');
    sortByTime(d.bodyLog, 'ts');
    sortByTime(d.profile.weightLog, 'ts');

    this.heal(d);
    this.save();
    return added;
  }
};

/** Appends records missing from `target`, keyed by `key`. */
function mergeList(target, incoming, key) {
  if (!target || !incoming || !incoming.length) return 0;
  var seen = {};
  var i;
  for (i = 0; i < target.length; i++) seen[String(target[i][key])] = true;
  var added = 0;
  for (i = 0; i < incoming.length; i++) {
    var id = String(incoming[i][key]);
    if (seen[id]) continue;
    seen[id] = true;
    target.push(incoming[i]);
    added++;
  }
  return added;
}

function sortByTime(list, key) {
  if (!list) return;
  list.sort(function (a, b) { return (a[key] || 0) - (b[key] || 0); });
}

/* ---------------------------------------------------------------------
 * i18n
 * ------------------------------------------------------------------- */

var LANG = {
  ar: {
    app_name: 'عبود صايم',
    home: 'الرئيسية', meals: 'وجباتي', liquids: 'مشروبات', progress: 'التقدم',
    coach: 'المدرب', settings: 'الإعدادات',

    start_fasting: 'ابدأ الصيام', pause: 'إيقاف مؤقت', resume: 'استئناف', stop: 'إنهاء',
    fasting_for: 'صائم منذ', paused_state: 'موقوف مؤقتاً', running_state: 'جارٍ',
    idle_state: 'غير صائم', not_fasting: 'مش صايم دلوقتي',
    start_prompt: 'اختار هدفك واضغط ابدأ',
    hours: 'ساعة', hour_short: 'س', min_short: 'د', sec_short: 'ث', day: 'يوم', days: 'يوم',
    set_start_time: 'وقت بداية الصيام', start_now: 'ابدأ الآن', back_hours: 'بدأت من كام ساعة؟',
    confirm: 'تأكيد', cancel: 'إلغاء', save: 'حفظ', delete: 'حذف', close: 'إغلاق', add: 'إضافة',
    edit: 'تعديل', done: 'تم',

    fasting_goal: 'هدف الصيام', custom_goal: 'هدف مخصص', progress_pct: 'نسبة التقدم',
    of_goal: 'من الهدف', next_phase_in: 'المرحلة التالية بعد', goal_reached: 'وصلت للهدف',
    elapsed: 'المنقضي', remaining: 'المتبقي', ends_at: 'ينتهي',

    phase: 'المرحلة',
    phase_anabolic: 'بداية الصيام',
    phase_anabolic_desc: 'الجسم يستهلك الجلوكوز المخزّن ومخزون الجليكوجين يقل تدريجياً',
    phase_catabolic: 'حرق الدهون',
    phase_catabolic_desc: 'الإنسولين انخفض والجسم بدأ يعبّئ الدهون كمصدر طاقة',
    phase_ketosis: 'الكيتوزية',
    phase_ketosis_desc: 'إنتاج كيتونات (BHB) — طاقة نظيفة للمخ ووضوح ذهني',
    phase_deep: 'الكيتوزية العميقة',
    phase_deep_desc: 'بداية الالتهام الذاتي وتقليل الالتهابات',
    phase_extended: 'كيتوزية ممتدة',
    phase_extended_desc: 'ذروة الالتهام الذاتي وارتفاع هرمون النمو',
    phase_deep_auto: 'التهام ذاتي عميق',
    phase_deep_auto_desc: 'إصلاح خلوي متقدم — راقب الأملاح والترطيب',
    phase_prolonged: 'صيام مطوّل',
    phase_prolonged_desc: 'مرحلة متقدمة (72 ساعة+) — لا تُمارس بدون إشراف طبي',

    band: 'السوار الذكي', connect_band: 'ربط السوار', disconnect_band: 'فصل السوار',
    forget_band: 'نسيان الجهاز', connected: 'متصل', disconnected: 'غير متصل',
    connecting: 'جاري الربط…', scanning: 'جاري البحث…', reconnecting: 'إعادة الاتصال…',
    heart_rate: 'النبض', bpm: 'ن/د', battery: 'بطارية السوار', auto_connect: 'اتصال تلقائي',
    band_hint: 'شغّل بث النبض من السوار: تطبيق Huawei Health ← الجهاز ← الإعدادات ← بث بيانات معدل ضربات القلب',
    err_bt_off: 'البلوتوث مقفول — افتحه وجرّب تاني',
    err_no_permission: 'محتاج إذن البلوتوث/الموقع للبحث عن السوار',
    err_no_adapter: 'الجهاز لا يدعم البلوتوث منخفض الطاقة',
    err_not_found: 'مالقيتش السوار — تأكد إن بث النبض مفعّل وإن السوار قريب',
    err_no_hr_service: 'السوار متصل لكن بث النبض مقفول — فعّله من Huawei Health',
    err_scan_failed: 'فشل البحث — أعد المحاولة',
    err_no_saved_device: 'مافيش سوار محفوظ — اعمل بحث الأول',
    no_native: 'الميزة دي متاحة داخل التطبيق فقط',

    activity: 'النشاط البدني', steps: 'خطوة', steps_label: 'الخطوات',
    active_minutes: 'دقائق نشاط', calories_burned: 'سعرات محروقة', cadence: 'خطوة/دقيقة',
    level_still: 'ساكن', level_light: 'نشاط خفيف', level_moderate: 'نشاط متوسط', level_vigorous: 'نشاط عالي',
    activity_level_now: 'مستوى النشاط الآن', reset_activity: 'تصفير عدّاد اليوم',
    no_step_sensor: 'الهاتف لا يحتوي على حساس خطوات',
    perm_activity: 'إذن النشاط البدني مطلوب لعد الخطوات',
    grant_permissions: 'منح الأذونات',

    search_food: 'ابحث عن أكل…', calories: 'سعرات', protein: 'بروتين', carbs: 'كارب', fat: 'دهون',
    no_meals: 'مافيش وجبات النهاردة', todays_total: 'إجمالي اليوم', portions: 'عدد الحصص',
    eating_while_fasting: 'أنت صائم دلوقتي — تسجيل وجبة هينهي الصيام. تحب تكمل؟',
    end_and_log: 'أنهِ الصيام وسجّل', just_log: 'سجّل فقط',

    water: 'الماء', water_intake: 'شرب الماء', water_target: 'الهدف اليومي', ml: 'مل',
    add_water: 'أضف', reset_water: 'تصفير',
    liquids_allowed: 'مسموح أثناء الصيام', forbidden_drinks: 'ممنوع أثناء الصيام',
    drink_water: 'ماء + أملاح (صوديوم/هيمالايان)',
    herbal_drinks: 'مشروبات عشبية بدون سكر',
    coffee_tea: 'قهوة / شاي أخضر سادة',
    sparkling_water: 'مياه غازية بليمون',
    aniseed_lemon: 'يانسون بالليمون', mint_tea: 'شاي نعناع', hibiscus: 'كركديه',
    cinnamon_caraway: 'قرفة / كراوية', plain_coffee: 'قهوة سادة', plain_green_tea: 'شاي أخضر سادة',
    club_soda: 'كلوب صودا بليمون وثلج',
    forbidden_list: 'عسل، سكر، محليات صناعية، لبن، عصائر، أي سعرات',
    electrolytes_note: 'في الصيام الممتد (24 ساعة+) الأملاح مش رفاهية: صوديوم وبوتاسيوم ومغنيسيوم يمنعوا الصداع والدوخة.',

    bmi: 'كتلة الجسم', tdee: 'سعراتك اليومية', bmr: 'أيض الراحة',
    current_streak: 'السلسلة الحالية', best_streak: 'أفضل سلسلة', total_sessions: 'عدد الجلسات',
    total_hours: 'إجمالي الساعات', completion_rate: 'نسبة الإكمال', avg_duration: 'متوسط المدة',
    longest_fast: 'أطول صيام', last_7_days: 'آخر 7 أيام',
    history: 'سجل الصيام', no_history: 'لا يوجد سجل بعد', completed: 'مكتمل', incomplete: 'غير مكتمل',
    weight_log: 'سجل الوزن', add_weight: 'سجّل وزنك', weight_change: 'التغير',

    coach_title: 'المدرب الذكي', analysis: 'التحليل الفسيولوجي', tips: 'نصائح علمية',
    exercise_rec: 'التوصية الرياضية', refeeding: 'بروتوكول الإفطار',
    refeed_phase1: 'المرحلة 1: توقظ المعدة',
    refeed_phase1_desc: 'مرق عظام دافئ أو شوربة + ملعقة زيت زيتون بكر. استنى 30 دقيقة.',
    refeed_phase2: 'المرحلة 2: الوجبة الأساسية',
    refeed_phase2_desc: 'بروتين نظيف (مسلوق/مشوي) + سلطة خضراء كبيرة بزيت زيتون وليمون.',
    refeed_rule: 'قاعدة صارمة',
    refeed_rule_desc: 'ممنوع الخبز الأبيض والسكريات والكربوهيدرات البسيطة — تجنّباً لصدمة الإنسولين واضطراب المعدة.',
    refeed_long_warn: 'بعد صيام 48 ساعة+ خطر متلازمة إعادة التغذية حقيقي. ابدأ بكميات صغيرة جداً وتدريجية، ولو حسيت بخفقان أو تنميل أو ارتباك — كسّر الصيام واطلب استشارة طبية.',

    supplements: 'المكملات', take_now: 'أخذتها', taken_today: 'اتأخذت النهاردة',
    dosage: 'الجرعة', safety_warning: 'تحذير أمان', supplement_log: 'سجل المكملات',
    no_double_dose: 'كبسولة واحدة في اليوم بحد أقصى. مضاعفة الجرعة تسبب تراكم الفيتامينات الذائبة في الدهون (A/D/E) وإجهاد الكبد.',
    add_supplement: 'أضف مكمل',

    profile: 'الملف الشخصي', name: 'الاسم', weight: 'الوزن (كجم)', height: 'الطول (سم)',
    age: 'العمر', gender: 'النوع', male: 'ذكر', female: 'أنثى',
    activity_level: 'مستوى النشاط', sedentary: 'قليل الحركة', light: 'خفيف',
    moderate: 'متوسط', active: 'عالي', very_active: 'عالي جداً',
    language: 'اللغة', notifications: 'تنبيهات المراحل', arabic_digits: 'أرقام عربية',
    battery_opt: 'استثناء من موفّر البطارية',
    battery_opt_hint: 'مهم: بدون الاستثناء ده النظام ممكن يوقف عدّاد الخطوات والسوار أثناء الصيام الطويل',
    data: 'البيانات', export_data: 'تصدير / مشاركة', save_file: 'حفظ ملف',
    import_data: 'استيراد', import_hint: 'الصق نسخة JSON هنا',
    reset_data: 'مسح كل البيانات', reset_confirm: 'متأكد إنك عايز تمسح كل البيانات؟ مفيش رجوع.',
    app_version: 'إصدار التطبيق', permissions: 'الأذونات',

    disclaimer: 'تنبيه طبي',
    disclaimer_text: 'التطبيق أداة تتبّع وليس استشارة طبية. الصيام الممتد (24 ساعة فأكثر) مش مناسب للحوامل والمرضعات ومرضى السكري ومن يتناول أدوية ضغط أو سكر أو له تاريخ اضطرابات أكل. استشر طبيبك قبل أي صيام يتجاوز 24 ساعة، ولو حسيت بدوخة شديدة أو خفقان أو إغماء — افطر فوراً.',
    understood: 'فهمت',
    long_fast_warn: 'تجاوزت 48 ساعة. راقب الترطيب والأملاح، وتجنّب المجهود، ولو ظهرت أعراض خطيرة افطر فوراً.',

    activity_hub: 'مركز النشاط', open_activity: 'افتح مركز النشاط',
    phone_sensors: 'مستشعرات الهاتف', available: 'متاح', not_available: 'غير متاح',
    sensor_stepCounter: 'عدّاد خطوات', sensor_stepDetector: 'كاشف خطوة',
    sensor_accelerometer: 'مقياس تسارع', sensor_gyroscope: 'جيروسكوب',
    sensor_barometer: 'بارومتر (ضغط)', sensor_light: 'حساس ضوء',
    sensor_proximity: 'حساس قرب', sensor_magnetometer: 'بوصلة',
    sensor_heartRate: 'حساس نبض',
    floors: 'أدوار', elevation: 'ارتفاع', lux: 'إضاءة',

    pulse_title: 'قياس النبض بالكاميرا', pulse_start: 'ابدأ القياس',
    pulse_cancel: 'إلغاء', pulse_again: 'قياس تاني',
    pulse_howto: 'حط طرف صباعك على الكاميرا الخلفية والفلاش وغطيهم كويس. متضغطش بقوة. ثبّت إيدك 25 ثانية.',
    pulse_warmup: 'تجهيز… ثبّت صباعك',
    pulse_measuring: 'بيقيس… متحركش',
    pulse_done: 'النتيجة',
    pulse_weak: 'الإشارة ضعيفة — غطي الكاميرا والفلاش كويس وجرّب تاني',
    pulse_quality_low: 'مش شايف صباعك — قرّبه من العدسة',
    pulse_quality_high: 'الصورة ساطعة زيادة — غطي الفلاش',
    pulse_disclaimer: 'قياس تقريبي بالكاميرا، مش جهاز طبي. للقياس الدقيق استخدم السوار.',
    pulse_log: 'سجل النبض', pulse_source_camera: 'كاميرا', pulse_source_band: 'سوار',
    err_no_camera: 'مفيش كاميرا متاحة', err_busy: 'القياس شغال بالفعل',

    route: 'المسار', route_title: 'تسجيل مسار المشي/الجري',
    route_start: 'ابدأ التسجيل', route_pause: 'إيقاف مؤقت', route_resume: 'استئناف',
    route_stop: 'إنهاء وحفظ', route_distance: 'المسافة', route_pace: 'الإيقاع',
    route_duration: 'المدة', route_elevation: 'الصعود', route_accuracy: 'دقة GPS',
    route_open_maps: 'افتح في الخرائط', route_export: 'تصدير GPX',
    route_waiting: 'بيدوّر على إشارة GPS…', route_saved: 'المسار اتحفظ',
    route_history: 'مساراتي', no_routes: 'مفيش مسارات متسجلة',
    err_gps_off: 'الـGPS مقفول — افتحه من إعدادات الهاتف',
    err_no_provider: 'الجهاز مش بيدعم تحديد الموقع',
    route_hint: 'سيب التطبيق شغال أثناء المشي. الإشعار هيفضل ظاهر والتسجيل مستمر.',
    km: 'كم', min_per_km: 'د/كم', meter: 'م',

    manual_meal: 'إضافة وجبة يدوي', meal_name: 'اسم الوجبة', add_photo: 'صورة',
    take_photo: 'كاميرا', from_gallery: 'من المعرض', remove_photo: 'شيل الصورة',
    save_to_db: 'احفظها في قائمة الأكل', my_foods: 'أكلاتي',
    photo_failed: 'مافيش صورة اتحفظت',

    checkin: 'حالتك النهاردة', checkin_save: 'سجّل حالتك',
    mood: 'المزاج', energy: 'الطاقة', hunger: 'الجوع', focus: 'التركيز',
    mood_1: 'زفت', mood_2: 'مضايق', mood_3: 'عادي', mood_4: 'كويس', mood_5: 'ممتاز',
    low: 'منخفض', mid: 'متوسط', high: 'عالي',
    checkin_done: 'اتسجلت — المدرب هيظبط نصايحه على كده',
    checkin_history: 'سجل حالتك', personalized: 'مخصص لحالتك',
    coach_hunger_high: 'الجوع عالي',
    coach_energy_low: 'طاقتك منخفضة',
    coach_mood_low: 'مزاجك مش تمام',
    coach_all_good: 'حالتك كويسة',

    body_comp: 'تركيب الجسم', add_scan: 'أضف قياس', body_history: 'سجل القياسات',
    no_scans: 'مفيش قياسات — ضيف قياس InBody أو ميزان ذكي',
    fat_pct: 'نسبة الدهون %', fat_kg: 'كتلة الدهون (كجم)',
    muscle_kg: 'الكتلة العضلية (كجم)', water_pct: 'نسبة المياه %',
    lean_mass: 'الكتلة الصافية', since_first: 'من أول قياس',
    body_hint: 'الميزان لوحده بيكدب أثناء الصيام: أول ٢٤ ساعة بتنزل مياه وجليكوجين مش دهون. القياس ده هو اللي بيفرق.',
    bmr_lean: 'محسوب من الكتلة الصافية', bmr_mifflin: 'محسوب من الوزن والطول والعمر',
    need_age: 'حدد عمرك عشان نحسب السعرات',
    no_macros: 'وجبة من غير ماكروز', weight_unit: 'كجم',
    hc_title: 'Health Connect', hc_connect: 'اربط Health Connect', hc_sync: 'زامن الآن',
    hc_syncing: 'بيزامن…', hc_last_sync: 'آخر مزامنة', hc_never: 'لسه متزامنش',
    hc_granted: 'أذونات ممنوحة', hc_open: 'افتح Health Connect',
    hc_install: 'ثبّت Health Connect', hc_update: 'حدّث Health Connect',
    hc_unsupported: 'الجهاز مش بيدعم Health Connect',
    hc_not_installed: 'Health Connect مش متثبت على الجهاز',
    hc_ready: 'جاهز — اضغط زامن',
    hc_need_perms: 'محتاج تسمح للتطبيق يقرا بياناتك',
    hc_hint: 'هواوي مبتكتبش في Health Connect لوحدها. محتاج تطبيق وسيط (زي Health Sync) يعمل الجسر من Huawei Health لـHealth Connect، وبعدين التطبيق ده بيقرا منها.',
    hc_result: 'اتقرا',
    hc_days: 'يوم', hc_workouts: 'تمرين', hc_weights: 'قياس وزن',
    sleep_last: 'آخر نوم', sleep_avg: 'متوسط النوم', resting_hr: 'نبض الراحة',
    spo2: 'الأكسجين', spo2_avg: 'متوسط الأكسجين', health_trends: 'مؤشراتك',
    no_health_data: 'مفيش بيانات — اربط Health Connect وزامن',
    hc_error: 'المزامنة فشلت',
    reminders: 'التنبيهات', rem_water: 'تذكير بالمياه', rem_water_hint: 'كل ساعتين أثناء الصيام',
    rem_motivation: 'رسايل تحفيز', rem_motivation_hint: 'عند ٢٥٪ و٥٠٪ و٧٥٪ من الهدف، ولما تكسر رقمك',
    rem_window: 'نافذة الأكل', rem_window_hint: 'لما تفتح، وقبل ما تقفل بنص ساعة',
    rem_checkin: 'تذكير بتسجيل حالتك', rem_supplement: 'تذكير بالمكمل',
    rem_nudge: 'نبّهني لو مبدأتش صيام', rem_nudge_hint: 'لو الوقت عدّى ولسه مبدأتش',
    rem_time: 'الميعاد', rem_test: 'جرّب التنبيه', rem_sent: 'اتبعت — بُص فوق',
    rem_need_perm: 'إذن الإشعارات مقفول — التنبيهات مش هتظهر',

    today: 'النهاردة', yesterday: 'امبارح', hours_ago: 'من كام ساعة؟',
    edit_start: 'تعديل وقت البداية', will_be: 'يعني صايم من',
    time_future: 'الوقت ده لسه مجاش — اختار امبارح',
    hour_unit: 'ساعة', quick_pick: 'اختيار سريع',

    onb_skip: 'تخطي', onb_next: 'التالي', onb_back: 'رجوع', onb_start: 'يلا نبدأ',
    onb_step: 'خطوة', onb_of: 'من',
    onb_w_title: 'أهلاً بيك في عبود صايم',
    onb_w_desc: 'مدير صيام متقطع وممتد: عدّاد بيعيش أيام، سجل حقيقي، ربط سوار، وقراءة من مستشعرات موبايلك. دقيقة واحدة نظبّط فيها التطبيق عليك.',
    onb_p_title: 'مين إنت؟',
    onb_p_desc: 'دي الأرقام اللي التطبيق بيحسب بيها سعراتك ومؤشراتك. تقدر تغيّرها في أي وقت من الإعدادات.',
    onb_g_title: 'نظام صيامك',
    onb_g_desc: 'اختار هدفك الافتراضي ونافذة الأكل بتاعتك. المدرب هيبني نصايحه على ده.',
    onb_perm_title: 'الأذونات',
    onb_perm_desc: 'محتاج أذونات عشان أعد خطواتك وأربط السوار وأبعتلك تنبيهات المراحل. كلها اختيارية والتطبيق بيشتغل من غيرها بإمكانيات أقل.',
    onb_battery: 'استثناء موفّر البطارية',
    onb_battery_why: 'من غيره النظام هيقتل عدّاد الخطوات ووصلة السوار في نص الصيام الطويل. ده أهم إعداد على أجهزة هواوي وشاومي.',
    onb_done_title: 'كده تمام',
    onb_done_desc: 'ابدأ أول صيام من الشاشة الرئيسية. لو عندك بيانات قديمة، تقدر تستوردها بالدمج من الإعدادات.',

    hc_empty_short: 'Health Connect فاضية — محتاج تطبيق جسر',
    hc_empty_title: 'الاتصال تمام، بس الخزنة فاضية',
    hc_empty_body: 'التطبيق قرا من Health Connect ومالقاش أي بيانات. ده مش عطل — ده معناه إن مفيش أي تطبيق بيكتب بيانات هواوي جواها. تطبيق Huawei Health نفسه مش بيدعم Health Connect ومش هيظهر في قايمة الأذونات أبداً. محتاج تطبيق جسر (زي Health Sync) تربطه: Huawei Health ← Health Connect، وتسيبه يزامن، وبعدها ارجع اضغط زامن هنا. للتأكد: افتح Health Connect ← Browse data وشوف فيه بيانات فعلاً.',



    workouts: 'التمارين', add_workout: 'سجّل تمرين', workout_type: 'النوع',
    distance_km: 'المسافة (كم)', duration_min: 'المدة (دقيقة)',
    avg_hr: 'متوسط النبض', max_hr: 'أقصى نبض', hr_zone: 'شدة التمرين',
    zone_easy: 'خفيف', zone_moderate: 'متوسط', zone_hard: 'عنيف', zone_max: 'أقصى مجهود',
    no_workouts: 'مفيش تمارين متسجلة', workout_history: 'سجل التمارين',
    fasted_workout: 'صايم', of_max_hr: 'من أقصى نبض متوقع',

    sleep: 'النوم والمنبهات', wake_time: 'موعد الصحيان', sleep_target: 'ساعات النوم',
    bedtime: 'موعد النوم المفترض', caffeine_cutoff: 'آخر كافيين',
    eating_window: 'نافذة الأكل', window_start: 'تبدأ', window_end: 'تنتهي',

    import_merge: 'دمج مع بياناتي', import_replace: 'استبدال كل شيء',
    merged_records: 'سجل اتضاف', import_replace_warn: 'الاستبدال هيمسح كل اللي مسجل دلوقتي',

    saved: 'اتحفظ', deleted: 'اتمسح', copied: 'اتنسخ', file_saved: 'الملف اتحفظ في',
    fast_started: 'بدأ الصيام — بالتوفيق!', fast_ended: 'انتهى الصيام',
    congrats: 'تهانينا!', keep_going: 'كمّل، إنت أقوى مما تتصور',
    empty_search: 'مافيش نتيجة'
  },

  en: {
    app_name: 'Aboud Sayem',
    home: 'Home', meals: 'Meals', liquids: 'Liquids', progress: 'Progress',
    coach: 'Coach', settings: 'Settings',

    start_fasting: 'Start Fast', pause: 'Pause', resume: 'Resume', stop: 'End Fast',
    fasting_for: 'Fasting for', paused_state: 'Paused', running_state: 'Running',
    idle_state: 'Not fasting', not_fasting: 'No active fast',
    start_prompt: 'Pick a goal and start',
    hours: 'hours', hour_short: 'h', min_short: 'm', sec_short: 's', day: 'day', days: 'days',
    set_start_time: 'Fast start time', start_now: 'Start now', back_hours: 'Started how long ago?',
    confirm: 'Confirm', cancel: 'Cancel', save: 'Save', delete: 'Delete', close: 'Close', add: 'Add',
    edit: 'Edit', done: 'Done',

    fasting_goal: 'Fasting goal', custom_goal: 'Custom goal', progress_pct: 'Progress',
    of_goal: 'of goal', next_phase_in: 'Next phase in', goal_reached: 'Goal reached',
    elapsed: 'Elapsed', remaining: 'Remaining', ends_at: 'Ends at',

    phase: 'Phase',
    phase_anabolic: 'Anabolic',
    phase_anabolic_desc: 'Burning stored glucose, glycogen slowly depleting',
    phase_catabolic: 'Fat Burning',
    phase_catabolic_desc: 'Insulin dropped, body mobilises fat for fuel',
    phase_ketosis: 'Ketosis',
    phase_ketosis_desc: 'Ketone (BHB) production — clean brain fuel and mental clarity',
    phase_deep: 'Deep Ketosis',
    phase_deep_desc: 'Autophagy begins, inflammation drops',
    phase_extended: 'Extended Ketosis',
    phase_extended_desc: 'Peak autophagy, growth hormone rises',
    phase_deep_auto: 'Deep Autophagy',
    phase_deep_auto_desc: 'Advanced cellular repair — watch electrolytes and hydration',
    phase_prolonged: 'Prolonged Fast',
    phase_prolonged_desc: 'Advanced stage (72h+) — medical supervision required',

    band: 'Smart band', connect_band: 'Connect band', disconnect_band: 'Disconnect',
    forget_band: 'Forget device', connected: 'Connected', disconnected: 'Disconnected',
    connecting: 'Connecting…', scanning: 'Scanning…', reconnecting: 'Reconnecting…',
    heart_rate: 'Heart rate', bpm: 'bpm', battery: 'Band battery', auto_connect: 'Auto connect',
    band_hint: 'Enable HR broadcast on the band: Huawei Health > device > Settings > HR Data Broadcasts',
    err_bt_off: 'Bluetooth is off — turn it on and retry',
    err_no_permission: 'Bluetooth/location permission is required to scan',
    err_no_adapter: 'This device has no Bluetooth LE',
    err_not_found: 'Band not found — make sure HR broadcast is on and the band is close',
    err_no_hr_service: 'Band connected but HR broadcast is off — enable it in Huawei Health',
    err_scan_failed: 'Scan failed — try again',
    err_no_saved_device: 'No saved band — run a scan first',
    no_native: 'Available inside the Android app only',

    activity: 'Physical activity', steps: 'steps', steps_label: 'Steps',
    active_minutes: 'Active minutes', calories_burned: 'Calories burned', cadence: 'steps/min',
    level_still: 'Still', level_light: 'Light', level_moderate: 'Moderate', level_vigorous: 'Vigorous',
    activity_level_now: 'Current intensity', reset_activity: 'Reset today',
    no_step_sensor: 'No hardware step sensor on this phone',
    perm_activity: 'Activity recognition permission is needed for steps',
    grant_permissions: 'Grant permissions',

    search_food: 'Search food…', calories: 'kcal', protein: 'Protein', carbs: 'Carbs', fat: 'Fat',
    no_meals: 'No meals logged today', todays_total: "Today's total", portions: 'Portions',
    eating_while_fasting: 'You are fasting — logging a meal ends the fast. Continue?',
    end_and_log: 'End fast & log', just_log: 'Log only',

    water: 'Water', water_intake: 'Water intake', water_target: 'Daily target', ml: 'ml',
    add_water: 'Add', reset_water: 'Reset',
    liquids_allowed: 'Allowed while fasting', forbidden_drinks: 'Forbidden while fasting',
    drink_water: 'Water + electrolytes (sodium/Himalayan)',
    herbal_drinks: 'Herbal drinks, no sugar',
    coffee_tea: 'Plain coffee / green tea',
    sparkling_water: 'Sparkling water with lemon',
    aniseed_lemon: 'Aniseed with lemon', mint_tea: 'Mint tea', hibiscus: 'Hibiscus',
    cinnamon_caraway: 'Cinnamon / caraway', plain_coffee: 'Black coffee', plain_green_tea: 'Green tea',
    club_soda: 'Club soda, ice and lemon',
    forbidden_list: 'Honey, sugar, sweeteners, milk, juice, anything caloric',
    electrolytes_note: 'Past 24h, electrolytes are not optional: sodium, potassium and magnesium prevent the headaches and dizziness.',

    bmi: 'BMI', tdee: 'TDEE', bmr: 'BMR',
    current_streak: 'Current streak', best_streak: 'Best streak', total_sessions: 'Sessions',
    total_hours: 'Total hours', completion_rate: 'Completion', avg_duration: 'Average',
    longest_fast: 'Longest fast', last_7_days: 'Last 7 days',
    history: 'Fasting history', no_history: 'Nothing logged yet', completed: 'Completed', incomplete: 'Incomplete',
    weight_log: 'Weight log', add_weight: 'Log weight', weight_change: 'Change',

    coach_title: 'Smart coach', analysis: 'Physiological analysis', tips: 'Science tips',
    exercise_rec: 'Exercise guidance', refeeding: 'Refeeding protocol',
    refeed_phase1: 'Step 1: wake the stomach',
    refeed_phase1_desc: 'Warm bone broth or plain soup + 1 tsp extra virgin olive oil. Wait 30 minutes.',
    refeed_phase2: 'Step 2: main meal',
    refeed_phase2_desc: 'Clean protein (boiled/grilled) + a large green salad with olive oil and lemon.',
    refeed_rule: 'Strict rule',
    refeed_rule_desc: 'No white bread, refined sugar or simple carbs — avoids the insulin spike and GI distress.',
    refeed_long_warn: 'After 48h+ refeeding syndrome is a real risk. Restart with very small portions, and if you feel palpitations, tingling or confusion, break the fast and seek medical advice.',

    supplements: 'Supplements', take_now: 'Taken', taken_today: 'Taken today',
    dosage: 'Dosage', safety_warning: 'Safety warning', supplement_log: 'Supplement log',
    no_double_dose: 'One capsule per day maximum. Doubling the dose accumulates fat-soluble vitamins (A/D/E) and strains the liver.',
    add_supplement: 'Add supplement',

    profile: 'Profile', name: 'Name', weight: 'Weight (kg)', height: 'Height (cm)',
    age: 'Age', gender: 'Gender', male: 'Male', female: 'Female',
    activity_level: 'Activity level', sedentary: 'Sedentary', light: 'Light',
    moderate: 'Moderate', active: 'Active', very_active: 'Very active',
    language: 'Language', notifications: 'Phase alerts', arabic_digits: 'Arabic digits',
    battery_opt: 'Ignore battery optimisation',
    battery_opt_hint: 'Important: without this the system may kill step counting and the band link during a long fast',
    data: 'Data', export_data: 'Export / share', save_file: 'Save file',
    import_data: 'Import', import_hint: 'Paste a JSON backup here',
    reset_data: 'Erase all data', reset_confirm: 'Erase all data? This cannot be undone.',
    app_version: 'App version', permissions: 'Permissions',

    disclaimer: 'Medical notice',
    disclaimer_text: 'This app is a tracker, not medical advice. Extended fasting (24h+) is not suitable during pregnancy or breastfeeding, for people with diabetes, anyone on blood-pressure or glucose medication, or with a history of eating disorders. Talk to your doctor before any fast beyond 24 hours, and break the fast immediately if you feel severe dizziness, palpitations or faintness.',
    understood: 'Understood',
    long_fast_warn: 'Past 48 hours. Watch hydration and electrolytes, avoid exertion, and break the fast if serious symptoms appear.',

    activity_hub: 'Activity hub', open_activity: 'Open activity hub',
    phone_sensors: 'Phone sensors', available: 'available', not_available: 'not available',
    sensor_stepCounter: 'Step counter', sensor_stepDetector: 'Step detector',
    sensor_accelerometer: 'Accelerometer', sensor_gyroscope: 'Gyroscope',
    sensor_barometer: 'Barometer', sensor_light: 'Light sensor',
    sensor_proximity: 'Proximity', sensor_magnetometer: 'Compass',
    sensor_heartRate: 'Heart rate sensor',
    floors: 'Floors', elevation: 'Elevation', lux: 'Light',

    pulse_title: 'Camera pulse', pulse_start: 'Measure',
    pulse_cancel: 'Cancel', pulse_again: 'Measure again',
    pulse_howto: 'Cover the rear camera and the flash with your fingertip. Do not press hard. Hold still for 25 seconds.',
    pulse_warmup: 'Warming up… hold still',
    pulse_measuring: 'Measuring… do not move',
    pulse_done: 'Result',
    pulse_weak: 'Weak signal — cover both the lens and the flash and try again',
    pulse_quality_low: 'No finger detected — move closer to the lens',
    pulse_quality_high: 'Too bright — cover the flash',
    pulse_disclaimer: 'A camera estimate, not a medical device. Use the band for accuracy.',
    pulse_log: 'Pulse log', pulse_source_camera: 'camera', pulse_source_band: 'band',
    err_no_camera: 'No camera available', err_busy: 'A measurement is already running',

    route: 'Route', route_title: 'Record a walk or run',
    route_start: 'Start recording', route_pause: 'Pause', route_resume: 'Resume',
    route_stop: 'Finish & save', route_distance: 'Distance', route_pace: 'Pace',
    route_duration: 'Duration', route_elevation: 'Ascent', route_accuracy: 'GPS accuracy',
    route_open_maps: 'Open in maps', route_export: 'Export GPX',
    route_waiting: 'Waiting for a GPS fix…', route_saved: 'Route saved',
    route_history: 'My routes', no_routes: 'No routes recorded yet',
    err_gps_off: 'GPS is off — turn it on in system settings',
    err_no_provider: 'This device has no location provider',
    route_hint: 'Leave the app running while you walk. The notification stays up and recording continues.',
    km: 'km', min_per_km: 'min/km', meter: 'm',

    manual_meal: 'Add meal manually', meal_name: 'Meal name', add_photo: 'Photo',
    take_photo: 'Camera', from_gallery: 'Gallery', remove_photo: 'Remove photo',
    save_to_db: 'Save to my food list', my_foods: 'My foods',
    photo_failed: 'No photo was saved',

    checkin: 'How you feel today', checkin_save: 'Save check-in',
    mood: 'Mood', energy: 'Energy', hunger: 'Hunger', focus: 'Focus',
    mood_1: 'Awful', mood_2: 'Low', mood_3: 'Okay', mood_4: 'Good', mood_5: 'Great',
    low: 'Low', mid: 'Medium', high: 'High',
    checkin_done: 'Saved — the coach will adapt to this',
    checkin_history: 'Check-in history', personalized: 'Personalised',
    coach_hunger_high: 'Hunger is high',
    coach_energy_low: 'Energy is low',
    coach_mood_low: 'Mood is low',
    coach_all_good: 'You are in good shape',

    body_comp: 'Body composition', add_scan: 'Add scan', body_history: 'Scan history',
    no_scans: 'No scans yet — add an InBody or smart-scale reading',
    fat_pct: 'Body fat %', fat_kg: 'Fat mass (kg)',
    muscle_kg: 'Muscle mass (kg)', water_pct: 'Body water %',
    lean_mass: 'Lean mass', since_first: 'since first scan',
    body_hint: 'The scale alone lies during a fast: the first 24h drops water and glycogen, not fat. This is what tells them apart.',
    bmr_lean: 'from lean mass', bmr_mifflin: 'from weight, height and age',
    need_age: 'Set your age to compute calories',
    no_macros: 'meals without macros', weight_unit: 'kg',
    hc_title: 'Health Connect', hc_connect: 'Connect Health Connect', hc_sync: 'Sync now',
    hc_syncing: 'Syncing…', hc_last_sync: 'Last sync', hc_never: 'never',
    hc_granted: 'Permissions granted', hc_open: 'Open Health Connect',
    hc_install: 'Install Health Connect', hc_update: 'Update Health Connect',
    hc_unsupported: 'This device does not support Health Connect',
    hc_not_installed: 'Health Connect is not installed',
    hc_ready: 'Ready — tap sync',
    hc_need_perms: 'The app needs permission to read your data',
    hc_hint: 'Huawei does not write to Health Connect by itself. A bridge app (such as Health Sync) has to copy Huawei Health into Health Connect, and this app reads it from there.',
    hc_result: 'read',
    hc_days: 'days', hc_workouts: 'workouts', hc_weights: 'weight readings',
    sleep_last: 'Last night', sleep_avg: 'Average sleep', resting_hr: 'Resting HR',
    spo2: 'Oxygen', spo2_avg: 'Average SpO2', health_trends: 'Your metrics',
    no_health_data: 'No data — connect Health Connect and sync',
    hc_error: 'Sync failed',
    reminders: 'Reminders', rem_water: 'Water reminder', rem_water_hint: 'Every 2 hours while fasting',
    rem_motivation: 'Encouragement', rem_motivation_hint: 'At 25%, 50%, 75% of the goal, and on a new record',
    rem_window: 'Eating window', rem_window_hint: 'When it opens, and 30 minutes before it closes',
    rem_checkin: 'Check-in reminder', rem_supplement: 'Supplement reminder',
    rem_nudge: 'Nudge if no fast started', rem_nudge_hint: 'When the time passes and nothing is running',
    rem_time: 'Time', rem_test: 'Send a test', rem_sent: 'Sent — check your notifications',
    rem_need_perm: 'Notification permission is off — reminders will not appear',

    today: 'Today', yesterday: 'Yesterday', hours_ago: 'How long ago?',
    edit_start: 'Edit start time', will_be: 'That is a fast of',
    time_future: 'That time has not happened yet — pick yesterday',
    hour_unit: 'hours', quick_pick: 'Quick pick',

    onb_skip: 'Skip', onb_next: 'Next', onb_back: 'Back', onb_start: 'Get started',
    onb_step: 'Step', onb_of: 'of',
    onb_w_title: 'Welcome to Aboud Sayem',
    onb_w_desc: 'An intermittent and extended fasting tracker: a clock that survives days, a real history, a band link, and readings from your phone sensors. One minute to set it up for you.',
    onb_p_title: 'About you',
    onb_p_desc: 'These are the numbers every calorie and metric is derived from. You can change them any time in settings.',
    onb_g_title: 'Your fasting pattern',
    onb_g_desc: 'Pick a default goal and your eating window. The coach builds its advice on this.',
    onb_perm_title: 'Permissions',
    onb_perm_desc: 'Needed to count steps, link the band and send phase alerts. All optional — the app works without them, with less.',
    onb_battery: 'Battery optimisation exemption',
    onb_battery_why: 'Without it the system kills step counting and the band link mid-fast. This is the single most important setting on Huawei and Xiaomi devices.',
    onb_done_title: 'All set',
    onb_done_desc: 'Start your first fast from the home screen. If you have data elsewhere, import and merge it from settings.',

    hc_empty_short: 'Health Connect is empty — a bridge app is needed',
    hc_empty_title: 'Connected, but the store is empty',
    hc_empty_body: 'The read succeeded and Health Connect returned nothing. That is not a fault here — it means no app is writing Huawei data into it. Huawei Health does not support Health Connect and will never appear in its permission list. Install a bridge app (such as Health Sync), point it Huawei Health -> Health Connect, let it sync, then press sync here. To confirm: open Health Connect > Browse data and check that anything is stored.',



    workouts: 'Workouts', add_workout: 'Log a workout', workout_type: 'Type',
    distance_km: 'Distance (km)', duration_min: 'Duration (min)',
    avg_hr: 'Average HR', max_hr: 'Max HR', hr_zone: 'Intensity',
    zone_easy: 'Easy', zone_moderate: 'Moderate', zone_hard: 'Hard', zone_max: 'All out',
    no_workouts: 'No workouts logged', workout_history: 'Workout history',
    fasted_workout: 'fasted', of_max_hr: 'of estimated max HR',

    sleep: 'Sleep and stimulants', wake_time: 'Wake time', sleep_target: 'Sleep hours',
    bedtime: 'Implied bedtime', caffeine_cutoff: 'Last caffeine',
    eating_window: 'Eating window', window_start: 'Opens', window_end: 'Closes',

    import_merge: 'Merge with my data', import_replace: 'Replace everything',
    merged_records: 'records added', import_replace_warn: 'Replacing erases everything currently stored',

    saved: 'Saved', deleted: 'Deleted', copied: 'Copied', file_saved: 'File saved to',
    fast_started: 'Fast started — good luck!', fast_ended: 'Fast ended',
    congrats: 'Congratulations!', keep_going: 'Keep going, you are stronger than you think',
    empty_search: 'No results'
  }
};

function lang() { return S.get('profile.lang', 'ar'); }
function isRTL() { return lang() === 'ar'; }

function t(key) {
  var dict = LANG[lang()] || LANG.ar;
  var v = dict[key];
  if (v === undefined) v = LANG.en[key];
  return v === undefined ? key : v;
}

/** Western digits by default; Arabic-Indic when the user opts in. */
function num(n) {
  var s = String(n);
  if (!S.get('settings.arabicDigits', false) || lang() !== 'ar') return s;
  var d = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    out += (c >= '0' && c <= '9') ? d[parseInt(c, 10)] : c;
  }
  return out;
}

/* ---------------------------------------------------------------------
 * Fasting phases (7 — extended past 72h)
 * ------------------------------------------------------------------- */

var PHASES = [
  { i: 0, from: 0,  to: 4,   key: 'anabolic',  color: '#f5a623' },
  { i: 1, from: 4,  to: 12,  key: 'catabolic', color: '#e94560' },
  { i: 2, from: 12, to: 18,  key: 'ketosis',   color: '#9c27b0' },
  { i: 3, from: 18, to: 24,  key: 'deep',      color: '#2196f3' },
  { i: 4, from: 24, to: 48,  key: 'extended',  color: '#00e676' },
  { i: 5, from: 48, to: 72,  key: 'deep_auto', color: '#00bcd4' },
  { i: 6, from: 72, to: 999, key: 'prolonged', color: '#ff4444' }
];

function phaseIndexFor(hours) {
  var idx = 0;
  for (var i = 0; i < PHASES.length; i++) {
    if (hours >= PHASES[i].from) idx = i;
  }
  return idx;
}

function phaseFor(hours) { return PHASES[phaseIndexFor(hours)]; }
function phaseName(p) { return t('phase_' + p.key); }
function phaseDesc(p) { return t('phase_' + p.key + '_desc'); }

/** ms until the next phase boundary, or -1 in the final phase. */
function msToNextPhase(hours) {
  for (var i = 0; i < PHASES.length; i++) {
    if (PHASES[i].from > hours) return (PHASES[i].from - hours) * 3600000;
  }
  return -1;
}

var GOAL_OPTIONS = [16, 18, 20, 24, 36, 48, 72];

/* ---------------------------------------------------------------------
 * Time formatting
 * ------------------------------------------------------------------- */

function fmtClock(ms) {
  if (ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600);
  var mn = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  return pad2(h) + ':' + pad2(mn) + ':' + pad2(sec);
}

function fmtShort(ms) {
  if (ms < 0) ms = 0;
  var totalMin = Math.floor(ms / 60000);
  var h = Math.floor(totalMin / 60);
  var mn = totalMin % 60;
  if (h >= 24) {
    var d = Math.floor(h / 24);
    return num(d) + ' ' + t('day') + ' ' + num(h % 24) + ' ' + t('hour_short');
  }
  if (h > 0) return num(h) + ' ' + t('hour_short') + ' ' + num(mn) + ' ' + t('min_short');
  return num(mn) + ' ' + t('min_short');
}

function fmtTimeOfDay(ts) {
  var d = new Date(ts);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function fmtDate(ts) {
  var d = new Date(ts);
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

/* ---------------------------------------------------------------------
 * Body maths
 * ------------------------------------------------------------------- */

function calcBMI(kg, cm) {
  var m2 = (cm / 100) * (cm / 100);
  return m2 <= 0 ? 0 : kg / m2;
}

function bmiLabel(bmi) {
  var ar = isRTL();
  if (bmi <= 0) return '-';
  if (bmi < 18.5) return ar ? 'نحافة' : 'Underweight';
  if (bmi < 25) return ar ? 'طبيعي' : 'Normal';
  if (bmi < 30) return ar ? 'زيادة وزن' : 'Overweight';
  return ar ? 'سمنة' : 'Obese';
}

/** @return BMR, or null when a required input is missing. */
function calcBMR(kg, cm, age, gender) {
  if (!kg || !cm || !age) return null;
  // Mifflin-St Jeor
  return gender === 'female'
    ? (10 * kg + 6.25 * cm - 5 * age - 161)
    : (10 * kg + 6.25 * cm - 5 * age + 5);
}

/** @return TDEE, or null when BMR cannot be computed. */
function calcTDEE(kg, cm, age, gender, activity) {
  var bmr = calcBMR(kg, cm, age, gender);
  if (bmr === null) return null;
  var f = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  return Math.round(bmr * (f[activity] || 1.55));
}

/**
 * Katch-McArdle: when a body-composition scan is available it beats
 * Mifflin-St Jeor, because it works from lean mass and needs no age at all.
 */
function calcBMRLean(leanKg) {
  if (!leanKg) return null;
  return 370 + 21.6 * leanKg;
}

/** Best available resting-energy estimate, with its source named. */
function bestBMR(profile) {
  var body = latestBody();
  if (body && body.muscleKg) {
    return { value: Math.round(calcBMRLean(body.muscleKg)), source: 'lean' };
  }
  var v = calcBMR(profile.weight, profile.height, profile.age, profile.gender);
  return v === null ? { value: null, source: 'none' } : { value: Math.round(v), source: 'mifflin' };
}

/**
 * Daily burn from the best BMR available. Using lean mass means a body scan
 * removes the need for an age entirely, instead of blocking the whole number.
 */
function bestTDEE(profile) {
  var bmr = bestBMR(profile);
  if (bmr.value === null) return { value: null, source: 'none' };
  var f = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  return {
    value: Math.round(bmr.value * (f[profile.activity] || 1.55)),
    source: bmr.source
  };
}

/* ---------------------------------------------------------------------
 * Body composition (InBody-style scans)
 * ------------------------------------------------------------------- */

function latestBody() {
  var log = S.get('bodyLog', []);
  return log.length ? log[log.length - 1] : null;
}

/**
 * Change per field between the first and last scan that actually carry it.
 *
 * Comparing whole entries is wrong here: scans arrive from different sources
 * (a full InBody has muscle mass, a smart scale synced through Health Connect
 * may only have weight). Treating a missing field as zero once produced a
 * "-59 kg of muscle" reading. A field with fewer than two measurements is
 * reported as null so the UI can leave it out entirely.
 */
function bodyDelta() {
  var log = S.get('bodyLog', []);
  if (log.length < 2) return null;

  var fields = ['kg', 'fatKg', 'muscleKg', 'fatPct', 'waterPct'];
  var out = { days: 0 };
  var any = false;
  var minTs = null, maxTs = null;

  for (var f = 0; f < fields.length; f++) {
    var key = fields[f];
    var first = null, last = null, i;
    for (i = 0; i < log.length; i++) {
      if (log[i][key] !== null && log[i][key] !== undefined) { first = log[i]; break; }
    }
    for (i = log.length - 1; i >= 0; i--) {
      if (log[i][key] !== null && log[i][key] !== undefined) { last = log[i]; break; }
    }
    if (first && last && first !== last) {
      out[key] = Math.round((last[key] - first[key]) * 10) / 10;
      any = true;
      if (minTs === null || first.ts < minTs) minTs = first.ts;
      if (maxTs === null || last.ts > maxTs) maxTs = last.ts;
    } else {
      out[key] = null;
    }
  }
  if (!any) return null;
  out.days = Math.max(1, Math.round((maxTs - minTs) / 86400000));
  return out;
}

/** Fat-mass and lean-mass split, derived when only one of them is given. */
function normaliseBody(entry) {
  var e = m({}, entry);
  if (e.kg && e.fatPct && !e.fatKg) e.fatKg = Math.round(e.kg * e.fatPct / 10) / 10;
  if (e.kg && e.fatKg && !e.fatPct) e.fatPct = Math.round(e.fatKg / e.kg * 1000) / 10;
  if (e.kg && e.height) e.bmi = Math.round(calcBMI(e.kg, e.height) * 10) / 10;
  return e;
}

/* ---------------------------------------------------------------------
 * Workouts
 * ------------------------------------------------------------------- */

var WORKOUT_TYPES = [
  { k: 'walk', emoji: '🚶', ar: 'مشي', en: 'Walk' },
  { k: 'cycle', emoji: '🚴', ar: 'عجلة', en: 'Cycling' },
  { k: 'run', emoji: '🏃', ar: 'جري', en: 'Run' },
  { k: 'gym', emoji: '🏋️', ar: 'مقاومة', en: 'Resistance' },
  { k: 'swim', emoji: '🏊', ar: 'سباحة', en: 'Swim' },
  { k: 'other', emoji: '⚡', ar: 'غير ذلك', en: 'Other' }
];

function workoutType(k) {
  for (var i = 0; i < WORKOUT_TYPES.length; i++) {
    if (WORKOUT_TYPES[i].k === k) return WORKOUT_TYPES[i];
  }
  return WORKOUT_TYPES[WORKOUT_TYPES.length - 1];
}

/** Age-predicted max heart rate (Tanaka), or null without an age. */
function maxHrFor(age) {
  if (!age) return null;
  return Math.round(208 - 0.7 * age);
}

/**
 * How hard a session was relative to the user's own ceiling.
 * Falls back to the highest HR ever logged when age is unknown, so the zone
 * is still meaningful rather than silently absent.
 */
function hrZone(maxHr) {
  if (!maxHr) return null;
  var age = S.get('profile.age', null);
  var ceiling = maxHrFor(age);
  var basis = 'age';
  if (!ceiling) {
    // Without an age, fall back to the highest HR this user has ever logged.
    // That makes their own hardest session read as 100%, so the value is
    // flagged as observed rather than presented as a physiological ceiling.
    var best = 0;
    var w = S.get('workouts', []);
    for (var i = 0; i < w.length; i++) if ((w[i].maxHr || 0) > best) best = w[i].maxHr;
    var hist = S.get('history', []);
    for (var j = 0; j < hist.length; j++) if ((hist[j].maxHr || 0) > best) best = hist[j].maxHr;
    if (!best) return null;
    ceiling = best;
    basis = 'observed';
  }
  var pct = maxHr / ceiling;
  var level = 'easy';
  if (pct >= 0.9) level = 'max';
  else if (pct >= 0.8) level = 'hard';
  else if (pct >= 0.7) level = 'moderate';
  return { pct: pct, level: level, ceiling: ceiling, basis: basis };
}

/**
 * Sessions that started shortly AFTER a fast ended — the "eat, then train"
 * pattern, which needs different advice from training while fasted.
 */
function postFastWorkouts(windowH) {
  var w = S.get('workouts', []);
  var hist = S.get('history', []);
  var gap = (windowH || 2) * 3600000;
  var out = [];
  for (var i = w.length - 1; i >= 0; i--) {
    for (var j = 0; j < hist.length; j++) {
      var after = w[i].ts - hist[j].end;
      if (after >= 0 && after <= gap) {
        out.push(m({}, w[i], {
          minutesAfterMeal: Math.round(after / 60000),
          fastHours: (hist[j].duration || 0) / 3600000
        }));
        break;
      }
    }
  }
  return out;
}

/** Workouts that happened inside a recorded fast, newest first. */
function fastedWorkouts() {
  var w = S.get('workouts', []);
  var hist = S.get('history', []);
  var out = [];
  for (var i = w.length - 1; i >= 0; i--) {
    var ts = w[i].ts;
    var inFast = null;
    for (var j = 0; j < hist.length; j++) {
      if (ts >= hist[j].start && ts <= hist[j].end) {
        inFast = (ts - hist[j].start) / 3600000;
        break;
      }
    }
    if (inFast !== null) out.push(m({}, w[i], { fastHours: inFast }));
  }
  return out;
}

/* ---------------------------------------------------------------------
 * Sleep and stimulants
 * ------------------------------------------------------------------- */

function parseHHMM(s, fallbackH) {
  if (!s || s.indexOf(':') < 0) return { h: fallbackH || 0, mn: 0 };
  var parts = s.split(':');
  return { h: parseInt(parts[0], 10) || 0, mn: parseInt(parts[1], 10) || 0 };
}

/**
 * Latest time to take caffeine or a stimulant so it is mostly cleared by
 * bedtime. Bedtime is derived from the wake target and the sleep goal.
 */
function stimulantCutoff(kind) {
  var wake = parseHHMM(S.get('settings.wakeTime', '09:00'), 9);
  var sleepH = parseFloat(S.get('settings.sleepTarget', 7.5)) || 7.5;
  var cutoffH = parseFloat(S.get('settings.' + (kind === 'stimulant' ? 'stimulantCutoffH' : 'caffeineCutoffH'))) || 8;

  var wakeMin = wake.h * 60 + wake.mn;
  var bedMin = ((wakeMin - Math.round(sleepH * 60)) % 1440 + 1440) % 1440;
  var cutMin = ((bedMin - Math.round(cutoffH * 60)) % 1440 + 1440) % 1440;
  return {
    bed: pad2(Math.floor(bedMin / 60)) + ':' + pad2(bedMin % 60),
    cutoff: pad2(Math.floor(cutMin / 60)) + ':' + pad2(cutMin % 60),
    cutoffMin: cutMin
  };
}

/** Supplement doses taken today, per supplement. */
function dosesToday(sup) {
  var today = dayKey(Date.now());
  var n = 0;
  var log = (sup && sup.log) || [];
  for (var i = 0; i < log.length; i++) if (dayKey(log[i]) === today) n++;
  return n;
}

/* ---------------------------------------------------------------------
 * Food database
 * ------------------------------------------------------------------- */

var FOOD_DB = [
  { k: 'chicken_grilled', ar: 'دجاج مشوي', en: 'Grilled chicken', cal: 165, p: 31, c: 0, f: 3.6 },
  { k: 'chicken_fried', ar: 'دجاج مقلي', en: 'Fried chicken', cal: 246, p: 19, c: 10, f: 15 },
  { k: 'chicken_breast', ar: 'صدور دجاج مسلوقة', en: 'Boiled chicken breast', cal: 150, p: 30, c: 0, f: 3 },
  { k: 'chicken_pie', ar: 'فطيرة فراخ', en: 'Chicken pie', cal: 320, p: 14, c: 35, f: 15 },
  { k: 'crepe_bbq', ar: 'كريب تشيكن باربيكيو', en: 'Chicken BBQ crepe', cal: 480, p: 28, c: 42, f: 22 },
  { k: 'shawarma_chicken', ar: 'شاورما دجاج', en: 'Chicken shawarma', cal: 264, p: 26, c: 11, f: 13 },
  { k: 'shawarma_beef', ar: 'شاورما لحم', en: 'Beef shawarma', cal: 310, p: 22, c: 12, f: 20 },
  { k: 'lamb_grilled', ar: 'لحم ضاني مشوي', en: 'Grilled lamb', cal: 250, p: 26, c: 0, f: 16 },
  { k: 'beef_boiled', ar: 'لحم بقري مسلوق', en: 'Boiled beef', cal: 215, p: 32, c: 0, f: 8 },
  { k: 'kofta', ar: 'كفتة مشوية', en: 'Grilled kofta', cal: 280, p: 20, c: 4, f: 20 },
  { k: 'liver', ar: 'كبدة إسكندراني', en: 'Alexandrian liver', cal: 230, p: 24, c: 6, f: 12 },
  { k: 'sogo2', ar: 'سجق', en: 'Sausage (sogo2)', cal: 300, p: 15, c: 6, f: 24 },
  { k: 'fish_grilled', ar: 'سمك مشوي', en: 'Grilled fish', cal: 150, p: 26, c: 0, f: 5 },
  { k: 'fish_fried', ar: 'سمك مقلي', en: 'Fried fish', cal: 232, p: 19, c: 9, f: 14 },
  { k: 'mullet', ar: 'بوري مشوي', en: 'Grilled grey mullet', cal: 140, p: 24, c: 0, f: 4.5 },
  { k: 'tuna', ar: 'تونة (علبة)', en: 'Tuna (can)', cal: 190, p: 33, c: 0, f: 6 },
  { k: 'shrimp_boiled', ar: 'جمبري مسلوق', en: 'Boiled shrimp', cal: 265, p: 55, c: 1, f: 3 },
  { k: 'shrimp_fried', ar: 'جمبري مقلي', en: 'Fried shrimp', cal: 300, p: 20, c: 12, f: 20 },
  { k: 'calamari', ar: 'كاليماري', en: 'Calamari', cal: 175, p: 18, c: 8, f: 8 },
  { k: 'egg_boiled', ar: 'بيض مسلوق', en: 'Boiled egg', cal: 155, p: 13, c: 1, f: 11 },
  { k: 'egg_fried', ar: 'بيض مقلي', en: 'Fried egg', cal: 196, p: 14, c: 1, f: 15 },
  { k: 'omelette', ar: 'أومليت', en: 'Omelette', cal: 220, p: 15, c: 3, f: 16 },
  { k: 'foul', ar: 'فول مدمس', en: 'Fava beans', cal: 110, p: 8, c: 19, f: 0.4 },
  { k: 'falafel', ar: 'طعمية', en: 'Falafel', cal: 333, p: 13, c: 32, f: 18 },
  { k: 'hummus', ar: 'حمص', en: 'Hummus', cal: 166, p: 8, c: 14, f: 10 },
  { k: 'koshary', ar: 'كشري', en: 'Koshary', cal: 420, p: 12, c: 78, f: 8 },
  { k: 'molokhia', ar: 'ملوخية', en: 'Molokhia', cal: 120, p: 5, c: 8, f: 7 },
  { k: 'mahshi', ar: 'محشي', en: 'Stuffed vegetables', cal: 180, p: 5, c: 28, f: 6 },
  { k: 'grape_leaves', ar: 'ورق عنب', en: 'Grape leaves', cal: 150, p: 4, c: 18, f: 7 },
  { k: 'bechamel', ar: 'مكرونة بشاميل', en: 'Bechamel pasta', cal: 400, p: 16, c: 42, f: 19 },
  { k: 'rice_white', ar: 'أرز أبيض', en: 'White rice', cal: 206, p: 4, c: 45, f: 0.4 },
  { k: 'rice_brown', ar: 'أرز بني', en: 'Brown rice', cal: 216, p: 5, c: 45, f: 1.8 },
  { k: 'pasta', ar: 'مكرونة', en: 'Pasta', cal: 220, p: 8, c: 43, f: 1.3 },
  { k: 'potato_fried', ar: 'بطاطس محمرة', en: 'French fries', cal: 312, p: 3, c: 41, f: 15 },
  { k: 'potato_boiled', ar: 'بطاطس مسلوقة', en: 'Boiled potato', cal: 87, p: 2, c: 20, f: 0.1 },
  { k: 'bread_baladi', ar: 'عيش بلدي (رغيف)', en: 'Baladi bread', cal: 180, p: 6, c: 36, f: 1.5 },
  { k: 'bread_white', ar: 'عيش أبيض (رغيف)', en: 'White bread loaf', cal: 130, p: 4, c: 25, f: 1.2 },
  { k: 'bread_arabic', ar: 'خبز عربي', en: 'Arabic bread', cal: 265, p: 8, c: 50, f: 2.5 },
  { k: 'oats', ar: 'شوفان', en: 'Oats', cal: 150, p: 5, c: 27, f: 3 },
  { k: 'mixed_salad', ar: 'سلطة خضراء كبيرة', en: 'Large green salad', cal: 85, p: 3, c: 12, f: 3 },
  { k: 'tabbouleh', ar: 'تبولة', en: 'Tabbouleh', cal: 93, p: 3, c: 15, f: 2 },
  { k: 'fattoush', ar: 'فتوش', en: 'Fattoush', cal: 120, p: 3, c: 14, f: 6 },
  { k: 'baba_ganoush', ar: 'بابا غنوج', en: 'Baba ganoush', cal: 130, p: 3, c: 10, f: 9 },
  { k: 'soup_veg', ar: 'شوربة خضار', en: 'Vegetable soup', cal: 95, p: 3, c: 16, f: 1.5 },
  { k: 'soup_lentil', ar: 'شوربة عدس', en: 'Lentil soup', cal: 180, p: 11, c: 28, f: 2 },
  { k: 'bone_broth', ar: 'مرق عظام', en: 'Bone broth', cal: 45, p: 5, c: 1, f: 2 },
  { k: 'yogurt', ar: 'زبادي', en: 'Yogurt', cal: 59, p: 10, c: 4, f: 0.4 },
  { k: 'labneh', ar: 'لبنة', en: 'Labneh', cal: 120, p: 6, c: 8, f: 8 },
  { k: 'cheese_white', ar: 'جبنة بيضاء', en: 'White cheese', cal: 264, p: 14, c: 4, f: 21 },
  { k: 'cheese_yellow', ar: 'جبنة رومي/صفراء', en: 'Yellow cheese', cal: 402, p: 25, c: 1, f: 33 },
  { k: 'milk', ar: 'لبن', en: 'Milk', cal: 149, p: 8, c: 12, f: 8 },
  { k: 'olive_oil', ar: 'زيت زيتون (ملعقة)', en: 'Olive oil (tbsp)', cal: 119, p: 0, c: 0, f: 14 },
  { k: 'tahini', ar: 'طحينة', en: 'Tahini', cal: 180, p: 5, c: 8, f: 16 },
  { k: 'nuts_mixed', ar: 'مكسرات (حفنة)', en: 'Mixed nuts (handful)', cal: 175, p: 5, c: 6, f: 15 },
  { k: 'peanut_butter', ar: 'زبدة فول سوداني', en: 'Peanut butter (tbsp)', cal: 94, p: 4, c: 3, f: 8 },
  { k: 'avocado', ar: 'أفوكادو', en: 'Avocado', cal: 160, p: 2, c: 9, f: 15 },
  { k: 'banana', ar: 'موزة', en: 'Banana', cal: 105, p: 1, c: 27, f: 0.4 },
  { k: 'apple', ar: 'تفاحة', en: 'Apple', cal: 95, p: 0, c: 25, f: 0.3 },
  { k: 'orange', ar: 'برتقالة', en: 'Orange', cal: 62, p: 1, c: 15, f: 0.2 },
  { k: 'dates', ar: 'تمر (3 حبات)', en: 'Dates (3)', cal: 200, p: 2, c: 54, f: 0.3 },
  { k: 'watermelon', ar: 'بطيخ (شريحة)', en: 'Watermelon slice', cal: 85, p: 2, c: 21, f: 0.4 },
  { k: 'juice_orange', ar: 'عصير برتقال', en: 'Orange juice', cal: 112, p: 2, c: 26, f: 0.5 },
  { k: 'soda', ar: 'مشروب غازي', en: 'Soft drink', cal: 140, p: 0, c: 39, f: 0 },
  { k: 'tea_plain', ar: 'شاي سادة', en: 'Plain tea', cal: 2, p: 0, c: 0, f: 0 },
  { k: 'coffee_plain', ar: 'قهوة سادة', en: 'Black coffee', cal: 2, p: 0, c: 0, f: 0 },
  { k: 'baklava', ar: 'بقلاوة (قطعة)', en: 'Baklava piece', cal: 334, p: 5, c: 46, f: 16 },
  { k: 'kunafa', ar: 'كنافة (قطعة)', en: 'Kunafa piece', cal: 400, p: 8, c: 45, f: 22 },
  { k: 'rice_pudding', ar: 'أرز باللبن', en: 'Rice pudding', cal: 220, p: 6, c: 38, f: 5 },
  { k: 'chocolate', ar: 'شوكولاتة (لوح)', en: 'Chocolate bar', cal: 250, p: 3, c: 28, f: 14 },
  { k: 'whey', ar: 'واي بروتين (سكوب)', en: 'Whey protein (scoop)', cal: 120, p: 24, c: 3, f: 1.5 }
];

/** Built-in database plus anything the user added by hand. */
function allFoods() {
  return S.get('customFoods', []).concat(FOOD_DB);
}

function searchFood(q) {
  var src = allFoods();
  if (!q) return src.slice(0, 24);
  var needle = q.toLowerCase();
  var out = [];
  for (var i = 0; i < src.length; i++) {
    var f = src[i];
    if ((f.ar && f.ar.indexOf(q) >= 0) || (f.en && f.en.toLowerCase().indexOf(needle) >= 0)) {
      out.push(f);
    }
  }
  return out;
}

/* ---------------------------------------------------------------------
 * Liquids protocol
 * ------------------------------------------------------------------- */

var LIQUIDS_OK = [
  { emoji: '💧', key: 'drink_water' },
  { emoji: '🌿', key: 'aniseed_lemon' },
  { emoji: '🍵', key: 'mint_tea' },
  { emoji: '🌺', key: 'hibiscus' },
  { emoji: '🥄', key: 'cinnamon_caraway' },
  { emoji: '☕', key: 'plain_coffee' },
  { emoji: '🍃', key: 'plain_green_tea' },
  { emoji: '🫧', key: 'club_soda' }
];

var LIQUIDS_NO = [
  { emoji: '🍯', ar: 'عسل', en: 'Honey' },
  { emoji: '🧂', ar: 'سكر ومحليات صناعية', en: 'Sugar & artificial sweeteners' },
  { emoji: '🥛', ar: 'لبن / كريمة', en: 'Milk / cream' },
  { emoji: '🧃', ar: 'عصائر', en: 'Juices' },
  { emoji: '🥤', ar: 'مشروبات غازية', en: 'Soft drinks' },
  { emoji: '🍺', ar: 'أي شيء به سعرات', en: 'Anything with calories' }
];

/* ---------------------------------------------------------------------
 * History & stats
 * ------------------------------------------------------------------- */

/** Consecutive-day streak counting back from today (or yesterday). */
function computeStreak(history) {
  if (!history || !history.length) return 0;
  var days = {};
  for (var i = 0; i < history.length; i++) {
    days[dayKey(history[i].end || history[i].start)] = true;
  }
  var streak = 0;
  var cursor = startOfDay(Date.now());
  if (!days[dayKey(cursor)]) {
    cursor -= 86400000;
    if (!days[dayKey(cursor)]) return 0;
  }
  while (days[dayKey(cursor)]) {
    streak++;
    cursor -= 86400000;
  }
  return streak;
}

function recomputeStats() {
  var hist = S.get('history', []);
  var totalMs = 0, completed = 0, longest = 0;
  for (var i = 0; i < hist.length; i++) {
    totalMs += hist[i].duration || 0;
    if (hist[i].completed) completed++;
    if ((hist[i].duration || 0) > longest) longest = hist[i].duration;
  }
  var streak = computeStreak(hist);
  var best = Math.max(S.get('stats.bestStreak', 0), streak);
  var stats = {
    currentStreak: streak,
    bestStreak: best,
    totalSessions: hist.length,
    totalHours: Math.round(totalMs / 3600000),
    completed: completed,
    longest: longest,
    avg: hist.length ? Math.round(totalMs / hist.length) : 0
  };
  S.set('stats', stats);
  return stats;
}

/** Fasted hours per day for the last 7 days, oldest first. */
function last7Days() {
  var hist = S.get('history', []);
  var out = [];
  for (var d = 6; d >= 0; d--) {
    var day = startOfDay(Date.now() - d * 86400000);
    var key = dayKey(day);
    var total = 0;
    for (var i = 0; i < hist.length; i++) {
      if (dayKey(hist[i].end || hist[i].start) === key) total += hist[i].duration || 0;
    }
    out.push({ key: key, ts: day, hours: total / 3600000 });
  }
  return out;
}

var WEEKDAYS_AR = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
var WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayLabel(ts) {
  var i = new Date(ts).getDay();
  return isRTL() ? WEEKDAYS_AR[i] : WEEKDAYS_EN[i];
}

/* ---------------------------------------------------------------------
 * Coach
 * ------------------------------------------------------------------- */

var COACH_AR = [
  { title: 'بداية الصيام', text: 'الجسم لسه بيستهلك الجليكوجين المخزّن في الكبد والعضلات. اشرب مياه كتير وحطّ رشة ملح.' },
  { title: 'حرق الدهون بدأ', text: 'الجليكوجين قرب يخلص والإنسولين نزل، فالجسم بدأ يعبّئ الدهون. الجوع بيجي في موجات — الموجة بتعدّي في 20 دقيقة.' },
  { title: 'كيتوزية', text: 'الكبد بينتج كيتونات (BHB) والمخ بيستفيد منها. أغلب الناس بتحس بصفاء ذهني هنا.' },
  { title: 'الالتهام الذاتي بدأ', text: 'الخلايا بدأت تعيد تدوير البروتينات التالفة والالتهاب بيقل. ابدأ تركّز على الترطيب والأملاح.' },
  { title: 'ذروة الالتهام الذاتي', text: 'هرمون النمو مرتفع والنورإبينفرين بيديك طاقة. ده أنسب وقت للراحة الذهنية والمشي الخفيف بس.' },
  { title: 'إصلاح خلوي عميق', text: 'إنت في مرحلة متقدمة. الأملاح (صوديوم/بوتاسيوم/مغنيسيوم) دلوقتي ضرورية مش اختيارية.' },
  { title: 'صيام مطوّل (72 ساعة+)', text: 'المرحلة دي محتاجة إشراف طبي فعلي. راقب الضغط والدوخة، وأي أعراض غريبة = افطر فوراً.' }
];

var COACH_EN = [
  { title: 'Fast started', text: 'Still burning liver and muscle glycogen. Drink plenty of water with a pinch of salt.' },
  { title: 'Fat burning', text: 'Glycogen is running out and insulin has dropped, so fat mobilises. Hunger comes in waves — each one passes in about 20 minutes.' },
  { title: 'Ketosis', text: 'The liver is producing ketones (BHB) and the brain runs on them. Most people feel sharp here.' },
  { title: 'Autophagy started', text: 'Cells recycle damaged proteins and inflammation drops. Start prioritising hydration and electrolytes.' },
  { title: 'Peak autophagy', text: 'Growth hormone is elevated and norepinephrine gives you energy. Rest and light walking only.' },
  { title: 'Deep cellular repair', text: 'Advanced stage. Electrolytes (sodium, potassium, magnesium) are now mandatory, not optional.' },
  { title: 'Prolonged fast (72h+)', text: 'This stage needs real medical supervision. Watch blood pressure and dizziness — any odd symptom means break the fast.' }
];

var EXERCISE_AR = [
  'مشي ومقاومة خفيفة عادي في المرحلة دي.',
  'كارديو خفيف ومشي كويسين. تجنّب المجهود العنيف على معدة فاضية لو لسه بتتعوّد.',
  'مشي أو كارديو خفيف. لو هتتمرن مقاومة خليها خفيفة وقصيرة.',
  'مشي خفيف 30-45 دقيقة. بطّل أوزان تقيلة — الجليكوجين خلص.',
  'مشي خفيف بس. رفع الأثقال هنا بيزوّد تكسير العضل (gluconeogenesis).',
  'راحة + مشي بطيء جداً لو مضطر. متعملش أي مجهود شديد.',
  'راحة تامة. أي مجهود في المرحلة دي مخاطرة مش محتاجها.'
];

var EXERCISE_EN = [
  'Walking and light resistance are fine here.',
  'Light cardio and walking are good. Avoid hard efforts on an empty stomach while adapting.',
  'Walking or light cardio. Keep any resistance work short and light.',
  'Light walking, 30-45 min. Drop heavy weights — glycogen is gone.',
  'Light walking only. Lifting here increases muscle breakdown (gluconeogenesis).',
  'Rest plus very slow walking if you must. No hard effort.',
  'Complete rest. Any exertion at this stage is a risk you do not need.'
];

var TIPS_AR = [
  'الصداع أول 24 ساعة غالباً نقص صوديوم مش جوع — رشة ملح في المياه بتحل المشكلة.',
  'موجة الجوع بتعدّي في 20 دقيقة. اشرب مياه أو شاي أخضر سادة واستنى.',
  'القهوة السادة مش بتكسر الصيام، بس على معدة فاضية ممكن تزوّد الحموضة.',
  'النوم الكويس بيقلل هرمون الجريلين (هرمون الجوع) لليوم اللي بعده.',
  'أول وجبة بعد الصيام الطويل تكون صغيرة — مرق أو شوربة، مش وجبة كاملة.',
  'الوزن اللي بينزل أول 24 ساعة أغلبه مياه وجليكوجين، مش دهون. متتعلقش بالرقم.',
  'البروتين الكافي في نافذة الأكل هو اللي بيحافظ على العضل مع الصيام المتكرر.',
  'لو بتاخد أدوية ضغط أو سكر، الصيام الممتد لازم يتظبط مع الدكتور الأول.',
  'المشي الخفيف بيسرّع دخول الكيتوزية من غير ما يرهق العضل.',
  'الدوخة عند الوقوف بعد 24 ساعة طبيعية نسبياً — قوم ببطء واشرب أملاح.'
];

var TIPS_EN = [
  'A headache in the first 24h is usually low sodium, not hunger — a pinch of salt in water fixes it.',
  'A hunger wave passes in about 20 minutes. Drink water or plain green tea and wait.',
  'Black coffee does not break the fast, but on an empty stomach it can raise acidity.',
  'Good sleep lowers ghrelin (the hunger hormone) for the next day.',
  'The first meal after a long fast should be small — broth or soup, not a full plate.',
  'Most of the weight lost in the first 24h is water and glycogen, not fat. Do not chase the number.',
  'Enough protein in the eating window is what protects muscle across repeated fasts.',
  'If you take blood-pressure or glucose medication, extended fasting must be planned with your doctor.',
  'Light walking speeds up entry into ketosis without straining muscle.',
  'Light-headedness when standing after 24h is fairly common — get up slowly and take electrolytes.'
];

function coachFor(hours) {
  var idx = phaseIndexFor(hours);
  var ar = isRTL();
  return {
    analysis: (ar ? COACH_AR : COACH_EN)[idx],
    exercise: (ar ? EXERCISE_AR : EXERCISE_EN)[idx],
    index: idx
  };
}

/* ---------------------------------------------------------------------
 * Adaptive coaching — phase + how the user actually feels
 * ------------------------------------------------------------------- */

/** Most recent check-in, or null when none was logged in the last 12h. */
function latestCheckin() {
  var list = S.get('checkins', []);
  if (!list.length) return null;
  var last = list[list.length - 1];
  if (Date.now() - last.ts > 12 * 3600000) return null;
  return last;
}

/**
 * Builds the coach card list from the fasting phase AND the last check-in.
 * The psychological state changes the advice, not just the hour count: the
 * same 20th hour needs different words when energy is 1 versus 5.
 */
function coachAdvice(hours, checkin, fasting) {
  var ar = isRTL();
  var idx = phaseIndexFor(hours);
  var out = [];

  out.push({
    tone: 'good',
    icon: '🧬',
    title: t('analysis') + ' — ' + (ar ? COACH_AR : COACH_EN)[idx].title,
    text: (ar ? COACH_AR : COACH_EN)[idx].text
  });

  out.push({
    tone: 'exercise',
    icon: '🏃',
    title: t('exercise_rec'),
    text: (ar ? EXERCISE_AR : EXERCISE_EN)[idx]
  });

  if (!checkin) return out.concat(routineAdvice(hours, fasting));

  var mood = checkin.mood || 3;
  var energy = checkin.energy || 3;
  var hunger = checkin.hunger || 3;

  // Hunger — the wave, and what actually blunts it at this phase.
  if (hunger >= 4) {
    out.push({
      tone: 'warn', icon: '🍽️', title: t('coach_hunger_high'),
      text: ar
        ? (hours < 12
            ? 'الجوع في أول ١٢ ساعة أغلبه عادة مش حاجة فعلية. اشرب ٥٠٠ مل مياه برشة ملح، واتحرك ١٠ دقايق — الموجة بتعدّي في ٢٠ دقيقة.'
            : 'إنت في الكيتوزية والجوع المفروض يقل. لو زاد فجأة بعد ' + Math.floor(hours) + ' ساعة، ده غالباً نقص أملاح مش جوع. صوديوم + بوتاسيوم + مغنيسيوم.')
        : (hours < 12
            ? 'Hunger in the first 12h is mostly habit, not need. Drink 500ml with a pinch of salt and move for 10 minutes — the wave passes in about 20.'
            : 'You are in ketosis and hunger should be fading. A sudden spike at hour ' + Math.floor(hours) + ' usually means electrolytes, not food. Sodium, potassium, magnesium.')
    });
  }

  // Energy — the fork between "push on" and "this is your body saying stop".
  if (energy <= 2) {
    out.push({
      tone: hours >= 24 ? 'warn' : 'exercise', icon: '🔋', title: t('coach_energy_low'),
      text: ar
        ? (hours >= 24
            ? 'طاقة منخفضة بعد ٢٤ ساعة تستاهل انتباه. الأول: أملاح ومياه ونوم. لو مع الإرهاق فيه دوخة عند الوقوف أو خفقان أو برودة أطراف — دي علامة توقف، افطر بمرق دافئ.'
            : 'طاقة منخفضة بدري في الصيام طبيعية وإنت لسه بتتحول لحرق الدهون. قلّل المجهود النهاردة، وخلي حركتك مشي بس، ونام بدري.')
        : (hours >= 24
            ? 'Low energy past 24h deserves attention. First: electrolytes, water, sleep. If it comes with dizziness on standing, palpitations or cold hands, that is a stop signal — break the fast with warm broth.'
            : 'Low energy early in a fast is normal while you switch to fat burning. Cut the effort today, keep movement to walking, and sleep early.')
    });
  } else if (energy >= 4 && hours >= 18) {
    out.push({
      tone: 'good', icon: '⚡', title: t('coach_all_good'),
      text: ar
        ? 'طاقتك عالية بعد ' + Math.floor(hours) + ' ساعة — ده النورإبينفرين والكيتونات شغالين. استغل الوقت ده في شغل ذهني مركّز، بس متستغلوش في تمرين تقيل.'
        : 'High energy at hour ' + Math.floor(hours) + ' is norepinephrine and ketones doing their job. Spend it on focused mental work, not on a heavy workout.'
    });
  }

  // Mood — irritability during a fast is physiological, and it is worth saying so.
  if (mood <= 2) {
    out.push({
      tone: 'warn', icon: '🧠', title: t('coach_mood_low'),
      text: ar
        ? 'العصبية وضيق المزاج أثناء الصيام حاجة فسيولوجية: سكر الدم بينزل والكورتيزول بيطلع. مش ضعف إرادة. جرّب ٥ دقايق تنفس بطيء، اخرج لضوء الشمس، وأجّل أي قرار أو نقاش متوتر لبعد الإفطار. ولو المزاج بينزل كل مرة تصوم فيها — ده سبب حقيقي تراجع بيه خطة الصيام مع دكتور.'
        : 'Irritability while fasting is physiological: blood glucose drops and cortisol rises. It is not weak will. Try five minutes of slow breathing, get into daylight, and postpone any tense decision or argument until after you eat. If your mood drops every single fast, that is a real reason to review the plan with a doctor.'
    });
  }

  if (fasting && hours >= 48) {
    out.push({
      tone: 'warn', icon: '⚠️', title: '48h+',
      text: t('long_fast_warn')
    });
  }

  return out.concat(routineAdvice(hours, fasting));
}

/**
 * Advice driven by what the user actually does, not by the clock alone:
 * hard training late in a fast, stacked supplement doses, and stimulants
 * too close to the target bedtime.
 */
function routineAdvice(hours, fasting) {
  var ar = isRTL();
  var out = [];

  // --- Training hard while deep in a fast ---
  var fw = fastedWorkouts();
  var recentHard = null;
  for (var i = 0; i < fw.length && i < 6; i++) {
    var z = hrZone(fw[i].maxHr);
    if (z && (z.level === 'hard' || z.level === 'max') && fw[i].fastHours >= 16) {
      recentHard = m({}, fw[i], { zone: z });
      break;
    }
  }
  if (recentHard) {
    var wt = workoutType(recentHard.type);
    out.push({
      tone: 'exercise', icon: wt.emoji, title: ar ? 'تمرين عنيف وإنت صايم' : 'Hard training deep in a fast',
      text: ar
        ? 'سجّلت ' + (ar ? wt.ar : wt.en) + ' بأقصى نبض ' + recentHard.maxHr
          + ' بعد ' + Math.floor(recentHard.fastHours) + ' ساعة صيام — ده '
          + Math.round(recentHard.zone.pct * 100) + '% من سقفك التقريبي. مش هقولك متعملهوش '
          + 'لأنك بتعمله فعلاً وجسمك متأقلم، بس ٤ قواعد بتفرق: '
          + '(١) أملاح قبل التمرين مش بعده — الصوديوم هو اللي بيمنع الدوخة والتقلصات. '
          + '(٢) متكررش الوصول لأقصى نبض أكتر من مرة أو مرتين في الأسبوع وإنت صايم. '
          + '(٣) بروتين خلال ساعة من الإفطار — ده اللي بيحمي العضل مع OMAD متكرر. '
          + '(٤) دوخة عند الوقوف أو برودة في الأطراف أو خفقان بعد التمرين = افطر، مش "كمّل".'
        : 'You logged ' + wt.en + ' peaking at ' + recentHard.maxHr + ' bpm after '
          + Math.floor(recentHard.fastHours) + ' fasted hours — about '
          + Math.round(recentHard.zone.pct * 100) + '% of your estimated ceiling. '
          + 'Four rules matter here: electrolytes BEFORE the session, not after; '
          + 'do not hit max heart rate fasted more than once or twice a week; '
          + 'protein within an hour of breaking the fast, which is what protects muscle '
          + 'on repeated OMAD; and dizziness on standing, cold extremities or palpitations '
          + 'after a session mean eat, not push on.'
    });
  }

  // --- Training right after breaking a long fast ---
  if (!recentHard) {
    var pf = postFastWorkouts(2);
    if (pf.length) {
      var last = pf[0];
      var lt = workoutType(last.type);
      out.push({
        tone: 'exercise', icon: lt.emoji,
        title: ar ? 'بتتمرن بعد الفطار على طول' : 'Training right after you eat',
        text: ar
          ? 'آخر ' + lt.ar + ' كان بعد الفطار بـ' + last.minutesAfterMeal + ' دقيقة، والفطار ده كان بعد '
            + Math.floor(last.fastHours) + ' ساعة صيام. التوقيت ده منطقي فعلاً — الجليكوجين اترجّع فمعاك وقود. '
            + 'بس حاجتين: (١) بعد صيام طويل، المعدة بتكون بطيئة، فالتمرين العنيف بعد أقل من ساعة من وجبة تقيلة '
            + 'بيعمل غثيان وحموضة — خلي المسافة ٩٠ دقيقة على الأقل لو الوجبة كبيرة. '
            + '(٢) إنت بتتمرن بالليل، فالتمرين العنيف بيرفع النبض والحرارة الداخلية ويأخر النوم ساعة لساعتين. '
            + 'لو النوم أولوية، قدّم التمرين قبل الفطار بدل ما تأخره بعده.'
          : 'Your last ' + lt.en.toLowerCase() + ' started ' + last.minutesAfterMeal
            + ' minutes after breaking a ' + Math.floor(last.fastHours) + '-hour fast. The timing makes sense — '
            + 'glycogen is back, so you have fuel. Two caveats: after a long fast the gut is slow, so hard effort '
            + 'less than an hour after a big meal invites nausea and reflux — leave 90 minutes if the meal was large. '
            + 'And training this late raises heart rate and core temperature, pushing sleep back an hour or two. '
            + 'If sleep matters more, move the session to before the meal instead.'
      });
    }
  }

  // --- Stacked supplement doses ---
  var sups = S.get('supplements', []);
  for (var s = 0; s < sups.length; s++) {
    if (dosesToday(sups[s]) > 1) {
      out.push({
        tone: 'warn', icon: '💊', title: ar ? 'جرعة مكررة النهاردة' : 'Doubled dose today',
        text: ar
          ? 'مسجّل أكتر من جرعة من "' + sups[s].name + '" النهاردة. لو ده متعدد فيتامينات، '
            + 'الفيتامينات الذائبة في الدهون (A/D/E) بتتراكم ومبتتخلصش زي فيتامين C. '
            + 'جرعة واحدة في اليوم، ومع أول وجبة فيها دهون — مش على معدة فاضية.'
          : 'More than one dose of "' + sups[s].name + '" is logged today. If that is a '
            + 'multivitamin, the fat-soluble vitamins (A/D/E) accumulate instead of being '
            + 'flushed out like vitamin C. One dose a day, with the first meal containing fat.'
      });
      break;
    }
  }

  // --- Stimulants versus the sleep target ---
  var cut = stimulantCutoff('caffeine');
  var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  var pastCutoff = nowMin > cut.cutoffMin && nowMin < cut.cutoffMin + 600;
  out.push({
    tone: pastCutoff ? 'warn' : 'good',
    icon: '☕',
    title: ar ? 'الكافيين والنوم' : 'Caffeine and sleep',
    text: ar
      ? 'هدفك تصحى ' + S.get('settings.wakeTime', '09:00') + '، يعني نومك المفروض يبدأ حوالي '
        + cut.bed + '. آخر قهوة أو منبّه (زي ليمتلس باور ماكس) يبقى قبل ' + cut.cutoff + '. '
        + (pastCutoff
            ? 'إنت عدّيت الوقت ده دلوقتي — أي كافيين من هنا هيقصّر النوم العميق حتى لو نمت عادي.'
            : 'الكافيين عمره النصفي ٥-٦ ساعات، فاللي بتشربه بالليل نصه لسه شغال وقت النوم.')
      : 'Your wake target is ' + S.get('settings.wakeTime', '09:00') + ', so sleep should start near '
        + cut.bed + '. Last coffee or stimulant before ' + cut.cutoff + '. '
        + (pastCutoff
            ? 'You are past that window now — caffeine from here shortens deep sleep even if you fall asleep fine.'
            : 'Caffeine has a 5-6 hour half-life, so half of an evening dose is still active at bedtime.')
  });

  // --- Eating window ---
  if (fasting) {
    var ws = parseHHMM(S.get('settings.windowStart', '17:00'), 17);
    var we = parseHHMM(S.get('settings.windowEnd', '21:00'), 21);
    var startMin = ws.h * 60 + ws.mn;
    var endMin = we.h * 60 + we.mn;
    if (nowMin >= startMin && nowMin <= endMin && hours >= 16) {
      out.push({
        tone: 'good', icon: '🍽️', title: ar ? 'نافذة الأكل بتاعتك' : 'Your eating window',
        text: ar
          ? 'إنت جوه نافذة الأكل (' + S.get('settings.windowStart', '17:00') + ' - '
            + S.get('settings.windowEnd', '21:00') + ') وكملت ' + Math.floor(hours) + ' ساعة. '
            + 'ابدأ ببروتين وسلطة قبل أي كارب — الترتيب ده بيقلل قفزة الإنسولين بعد صيام طويل.'
          : 'You are inside your eating window (' + S.get('settings.windowStart', '17:00') + ' - '
            + S.get('settings.windowEnd', '21:00') + ') at hour ' + Math.floor(hours) + '. '
            + 'Start with protein and salad before any carbs — that order blunts the insulin spike after a long fast.'
      });
    }
  }

  return out;
}

/** Rolling averages of the last N check-ins, for the trend row. */
function checkinTrend(n) {
  var list = S.get('checkins', []);
  var take = list.slice(Math.max(0, list.length - (n || 7)));
  if (!take.length) return null;
  var mood = 0, energy = 0, hunger = 0;
  for (var i = 0; i < take.length; i++) {
    mood += take[i].mood || 3;
    energy += take[i].energy || 3;
    hunger += take[i].hunger || 3;
  }
  return {
    count: take.length,
    mood: mood / take.length,
    energy: energy / take.length,
    hunger: hunger / take.length
  };
}

/* ---------------------------------------------------------------------
 * Health Connect
 * ------------------------------------------------------------------- */

/**
 * Folds a Health Connect sync into the store.
 *
 * Everything is merged rather than replaced, and an incoming null never wins
 * over a value already recorded — the bridge apps that feed Health Connect
 * routinely deliver partial days.
 * @return { added, days, workouts, weights, error }
 */
function applyHealthSync(payload) {
  var res = { added: 0, days: 0, workouts: 0, weights: 0, spo2: 0, error: '' };
  if (!payload) { res.error = 'empty'; return res; }
  if (!payload.ok) { res.error = payload.error || 'failed'; return res; }

  var i;

  // --- SpO2 samples collapsed into a daily average ---
  var spo2ByDay = {};
  var spo2 = payload.spo2 || [];
  for (i = 0; i < spo2.length; i++) {
    var k = dayKey(spo2[i].ts);
    if (!spo2ByDay[k]) spo2ByDay[k] = { sum: 0, n: 0, min: 100 };
    spo2ByDay[k].sum += spo2[i].pct;
    spo2ByDay[k].n++;
    if (spo2[i].pct < spo2ByDay[k].min) spo2ByDay[k].min = spo2[i].pct;
    res.spo2++;
  }

  // --- Daily rows ---
  var days = S.get('healthDays', []);
  var index = {};
  for (i = 0; i < days.length; i++) index[days[i].date] = i;

  var incoming = payload.days || [];
  for (i = 0; i < incoming.length; i++) {
    var row = incoming[i];
    var s = spo2ByDay[row.date];
    if (s) {
      row.spo2Avg = Math.round(s.sum / s.n * 10) / 10;
      row.spo2Min = s.min;
    }
    if (index[row.date] === undefined) {
      days.push(row);
      index[row.date] = days.length - 1;
      res.added++;
      res.days++;
    } else {
      // Refresh an existing day, but never blank a known value.
      var existing = days[index[row.date]];
      for (var f in row) {
        if (!Object.prototype.hasOwnProperty.call(row, f)) continue;
        if (row[f] === null || row[f] === undefined) continue;
        existing[f] = row[f];
      }
    }
  }
  // Leftover SpO2 for days with no other data at all.
  for (var dk in spo2ByDay) {
    if (!Object.prototype.hasOwnProperty.call(spo2ByDay, dk)) continue;
    if (index[dk] !== undefined) continue;
    days.push({
      date: dk,
      spo2Avg: Math.round(spo2ByDay[dk].sum / spo2ByDay[dk].n * 10) / 10,
      spo2Min: spo2ByDay[dk].min
    });
    res.added++;
    res.days++;
  }
  days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (days.length > 400) days = days.slice(days.length - 400);
  S.set('healthDays', days);

  // --- Weight and body fat feed the body-composition log ---
  var body = S.get('bodyLog', []);
  var weightLog = S.get('profile.weightLog', []);
  var bodyByDay = {};
  for (i = 0; i < body.length; i++) bodyByDay[dayKey(body[i].ts)] = body[i];

  var weights = payload.weights || [];
  for (i = 0; i < weights.length; i++) {
    var wKey = dayKey(weights[i].ts);
    var known = false;
    for (var w = 0; w < weightLog.length; w++) {
      if (dayKey(weightLog[w].ts) === wKey) { known = true; break; }
    }
    if (!known) {
      weightLog.push({ ts: weights[i].ts, kg: weights[i].kg });
      res.added++;
      res.weights++;
    }
    if (!bodyByDay[wKey]) {
      bodyByDay[wKey] = { ts: weights[i].ts, kg: weights[i].kg };
      body.push(bodyByDay[wKey]);
    } else if (!bodyByDay[wKey].kg) {
      bodyByDay[wKey].kg = weights[i].kg;
    }
  }

  var fats = payload.bodyFat || [];
  for (i = 0; i < fats.length; i++) {
    var fKey = dayKey(fats[i].ts);
    if (!bodyByDay[fKey]) {
      bodyByDay[fKey] = { ts: fats[i].ts, fatPct: fats[i].pct };
      body.push(bodyByDay[fKey]);
      res.added++;
    } else if (!bodyByDay[fKey].fatPct) {
      bodyByDay[fKey].fatPct = fats[i].pct;
    }
  }

  var height = S.get('profile.height', null);
  for (i = 0; i < body.length; i++) {
    if (height && !body[i].height) body[i].height = height;
    body[i] = normaliseBody(body[i]);
  }
  sortByTime(body, 'ts');
  sortByTime(weightLog, 'ts');
  S.set('bodyLog', body);
  S.set('profile.weightLog', weightLog);
  if (weightLog.length) S.set('profile.weight', weightLog[weightLog.length - 1].kg);

  // --- Workouts (ids are prefixed hc_, so re-syncing never duplicates) ---
  var workouts = S.get('workouts', []);
  var added = mergeList(workouts, payload.workouts || [], 'id');
  res.added += added;
  res.workouts = added;
  sortByTime(workouts, 'ts');
  S.set('workouts', workouts);

  S.set('health', m(S.get('health', {}), { lastSync: payload.syncedAt || Date.now() }));
  return res;
}

/**
 * True when a sync succeeded but Health Connect held nothing at all.
 *
 * This is the normal state for a Huawei user who has not installed a bridge
 * app: permissions are granted, the read works, and the store is simply
 * empty. Reporting "0 days" would read as a bug in this app instead of a
 * missing data source.
 */
function healthPayloadEmpty(payload) {
  if (!payload || !payload.ok) return false;
  var counts = [payload.days, payload.spo2, payload.weights, payload.bodyFat, payload.workouts];
  for (var i = 0; i < counts.length; i++) {
    if (counts[i] && counts[i].length) return false;
  }
  return true;
}

/** The most recent day that actually carries a sleep figure. */
function latestSleep() {
  var days = S.get('healthDays', []);
  for (var i = days.length - 1; i >= 0; i--) {
    if (days[i].sleepMs) return days[i];
  }
  return null;
}

/** Average of a numeric field across the last N health days that have it. */
function healthAverage(field, n) {
  var days = S.get('healthDays', []);
  var sum = 0, count = 0;
  for (var i = days.length - 1; i >= 0 && count < (n || 7); i--) {
    var v = days[i][field];
    if (v === null || v === undefined) continue;
    sum += v;
    count++;
  }
  return count ? sum / count : null;
}

/* ---------------------------------------------------------------------
 * Route helpers
 * ------------------------------------------------------------------- */

function fmtPace(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return '--';
  var m = Math.floor(secPerKm / 60);
  var s = Math.round(secPerKm % 60);
  return num(m) + ':' + pad2(s);
}

function fmtDistance(metres) {
  if (metres >= 1000) return num((metres / 1000).toFixed(2)) + ' ' + t('km');
  return num(Math.round(metres)) + ' ' + t('meter');
}

/**
 * Projects a flat [lat,lon,...] track onto an SVG viewbox.
 * Longitude is scaled by cos(latitude) so the shape is not stretched — at
 * Alexandria's latitude a degree of longitude is ~0.85 of a degree of latitude.
 */
function routeToPath(flat, w, h, pad) {
  if (!flat || flat.length < 4) return '';
  var minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  var i;
  for (i = 0; i < flat.length; i += 2) {
    if (flat[i] < minLat) minLat = flat[i];
    if (flat[i] > maxLat) maxLat = flat[i];
    if (flat[i + 1] < minLon) minLon = flat[i + 1];
    if (flat[i + 1] > maxLon) maxLon = flat[i + 1];
  }
  var midLat = (minLat + maxLat) / 2;
  var kx = Math.cos(midLat * Math.PI / 180);
  var spanLat = Math.max(maxLat - minLat, 0.00001);
  var spanLon = Math.max((maxLon - minLon) * kx, 0.00001);
  var span = Math.max(spanLat, spanLon);

  var innerW = w - pad * 2, innerH = h - pad * 2;
  var scale = Math.min(innerW, innerH) / span;
  var offX = pad + (innerW - spanLon * scale) / 2;
  var offY = pad + (innerH - spanLat * scale) / 2;

  var d = '';
  for (i = 0; i < flat.length; i += 2) {
    var x = offX + ((flat[i + 1] - minLon) * kx) * scale;
    var y = offY + (maxLat - flat[i]) * scale;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d;
}

function randomTips(n) {
  var src = (isRTL() ? TIPS_AR : TIPS_EN).slice();
  for (var i = src.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = src[i]; src[i] = src[j]; src[j] = tmp;
  }
  return src.slice(0, n || 4);
}

/* ---------------------------------------------------------------------
 * Export
 * ------------------------------------------------------------------- */

function exportJson() {
  return JSON.stringify(S.data(), null, 2);
}

function exportText() {
  var d = S.data();
  var L = [];
  L.push('=== ' + t('app_name') + ' v' + APP_VERSION + ' ===');
  L.push(fmtDate(Date.now()));
  L.push('');
  L.push('--- ' + t('profile') + ' ---');
  L.push(t('name') + ': ' + (d.profile.name || '-'));
  L.push(t('weight') + ': ' + d.profile.weight);
  L.push(t('height') + ': ' + d.profile.height);
  L.push(t('bmi') + ': ' + calcBMI(d.profile.weight, d.profile.height).toFixed(1));
  var tdee = bestTDEE(d.profile);
  L.push(t('tdee') + ': ' + (tdee.value === null ? '-' : tdee.value));
  var body = latestBody();
  if (body) {
    L.push(t('body_comp') + ': ' + body.kg + ' ' + t('weight_unit')
      + (body.fatPct ? ' · ' + body.fatPct + '% ' + t('fat') : '')
      + (body.muscleKg ? ' · ' + body.muscleKg + ' ' + t('muscle_kg') : ''));
  }
  L.push('');
  L.push('--- ' + t('progress') + ' ---');
  L.push(t('current_streak') + ': ' + d.stats.currentStreak);
  L.push(t('best_streak') + ': ' + d.stats.bestStreak);
  L.push(t('total_sessions') + ': ' + d.stats.totalSessions);
  L.push(t('total_hours') + ': ' + d.stats.totalHours);
  L.push('');
  L.push('--- ' + t('history') + ' ---');
  if (!d.history.length) {
    L.push(t('no_history'));
  } else {
    for (var i = d.history.length - 1; i >= 0; i--) {
      var h = d.history[i];
      L.push(fmtDate(h.start) + '  ' + fmtTimeOfDay(h.start) + ' -> ' + fmtTimeOfDay(h.end)
        + '  ' + (h.duration / 3600000).toFixed(1) + 'h / ' + h.goal + 'h'
        + (h.completed ? '  [' + t('completed') + ']' : '')
        + (h.avgHr ? '  HR ' + h.avgHr : '')
        + (h.steps ? '  ' + h.steps + ' ' + t('steps') : ''));
    }
  }
  return L.join('\n');
}

/* ---------------------------------------------------------------------
 * Native bridge (window.Native, injected by JsBridge.java)
 * ------------------------------------------------------------------- */

var N = {
  ok: function () {
    return typeof Native !== 'undefined' && Native && typeof Native.available === 'function';
  },
  call: function (fn) {
    if (!this.ok() || typeof Native[fn] !== 'function') return null;
    var args = Array.prototype.slice.call(arguments, 1);
    try {
      return Native[fn].apply(Native, args);
    } catch (e) {
      return null;
    }
  },
  parse: function (raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  },

  syncFast: function () {
    var cf = S.get('currentFast', {});
    this.call('syncFast',
      !!cf.active,
      String(cf.startTime || 0),
      String(Math.round(cf.elapsed || 0)),
      !!cf.pausedAt,
      parseInt(cf.goal, 10) || 24);
  },
  bandState: function () {
    return this.parse(this.call('bandState'), { status: 'idle', hr: 0, battery: -1, name: '', saved: false, auto: false });
  },
  sensorsState: function () {
    return this.parse(this.call('sensorsState'), { steps: 0, activeMinutes: 0, calories: 0, level: 'still', hasStepSensor: false, permission: false });
  },
  permsState: function () {
    return this.parse(this.call('permsState'),
      { bluetooth: false, activity: false, location: false, camera: false, notifications: false });
  },
  routeState: function () {
    return this.parse(this.call('routeState'),
      { tracking: false, paused: false, points: 0, distanceM: 0, elapsedMs: 0,
        paceSecPerKm: 0, elevationM: 0, accuracy: -1, error: '', hasPermission: false });
  },
  routePath: function (max) {
    return this.parse(this.call('routePath', max || 300), []);
  },
  pulseState: function () {
    return this.parse(this.call('pulseState'),
      { status: 'idle', running: false, progress: 0, bpm: 0, quality: 0 });
  },
  inventory: function () {
    return this.parse(this.call('sensorsInventory'), {});
  }
};

/** Elapsed ms of the fast held in storage. */
function fastElapsed(cf) {
  if (!cf || !cf.active) return 0;
  var banked = cf.elapsed || 0;
  if (cf.pausedAt) return banked;
  if (!cf.startTime) return banked;
  var live = Date.now() - cf.startTime;
  if (live < 0) live = 0;
  return banked + live;
}
