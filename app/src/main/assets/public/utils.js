/* =====================================================================
 * utils.js — Aboud Sayem v4.0
 * Data layer, i18n, fasting science tables, native bridge.
 *
 * ES5 ONLY. No let/const, no arrows, no template literals, no spread,
 * no destructuring, no classes, no async/await. See README.
 * ===================================================================== */

var APP_VERSION = '8.2';
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
      insightLog: [],
      plannedBreaks: [],
      favourites: [],
      medals: {},
      challenge: null,
      customFoods: [],
      routes: [],
      workouts: [],
      bodyLog: [],
      healthDays: [],
      health: { lastSync: 0, status: '', granted: 0 },
      electrolytes: { date: '', sodium: 0, potassium: 0, magnesium: 0 },
      backup: { lastAt: 0, lastPath: '' },
      water: { date: '', ml: 0 },
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
        plan: 'custom',
        proteinPerKgLean: 2.0,
        autoBackup: true,
        // OMAD-shaped defaults: one evening meal, which is the pattern the
        // logged history actually shows.
        windowStart: '17:00',
        windowEnd: '21:00',
        wakeTime: '09:00',
        sleepTarget: 7.5,
        caffeineCutoffH: 8,
        stimulantCutoffH: 8,
        reminders: {
          water: true, motivation: true, window: true,
          supplement: false, nudge: false,
          supplementTime: '18:00', nudgeTime: '22:00'
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
    if (!d.insightLog) d.insightLog = [];
    if (!d.plannedBreaks) d.plannedBreaks = [];
    if (!d.favourites) d.favourites = [];
    if (!d.medals) d.medals = {};
    if (!d.customFoods) d.customFoods = [];
    if (!d.routes) d.routes = [];
    if (!d.workouts) d.workouts = [];
    if (!d.bodyLog) d.bodyLog = [];
    if (!d.healthDays) d.healthDays = [];
    if (!d.health) d.health = def.health;
    if (!d.electrolytes) d.electrolytes = def.electrolytes;
    if (!d.backup) d.backup = def.backup;
    if (!d.supplements) d.supplements = def.supplements;
    if (!d.profile.weightLog) d.profile.weightLog = [];
    // Red was retired as an accent when it became the destructive colour;
    // anyone carrying the old choice is moved to the new default.
    if (d.settings && d.settings.accent === 'red') d.settings.accent = 'blue';
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
    // Anything that re-reads the data to reach a conclusion — the expert
    // engine and its notifications — hangs off here rather than off every
    // call site that happens to write.
    if (typeof this._onSave === 'function') this._onSave();
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
    added += mergeList(d.insightLog, incoming.insightLog, 'ts');
    // Earned is earned: an import can add medals but never revoke one, and the
    // earlier of two unlock times wins.
    if (incoming.medals) {
      for (var mk in incoming.medals) {
        if (!Object.prototype.hasOwnProperty.call(incoming.medals, mk)) continue;
        if (!d.medals[mk] || incoming.medals[mk] < d.medals[mk]) {
          if (!d.medals[mk]) added++;
          d.medals[mk] = incoming.medals[mk];
        }
      }
    }
    added += mergeList(d.meals, incoming.meals, 'id');
    added += mergeList(d.customFoods, incoming.customFoods, 'k');
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

/**
 * Arabic counts do not take a bare numeral the way English does: one and two
 * have their own forms, and the noun changes shape again past ten. Rendering
 * "1 مرة" or "0 يوم" is the tell that a string was assembled by a machine.
 */
function arCount(n, one, two, few, many) {
  if (n === 0) return many;
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return n + ' ' + few;
  return n + ' ' + many;
}

/** Sorts in place by a numeric timestamp field and returns the same list. */
function sortByTime(list, key) {
  if (!list) return list;
  list.sort(function (a, b) { return (a[key] || 0) - (b[key] || 0); });
  return list;
}

/** Health rows carry an ISO date string, so they sort on the parsed value. */
function sortByDate(list) {
  if (!list) return list;
  list.sort(function (a, b) { return Date.parse(a.date) - Date.parse(b.date); });
  return list;
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
    paused_state: 'موقوف مؤقتاً', running_state: 'جارٍ',
    idle_state: 'غير صائم', start_prompt: 'اختار هدفك واضغط ابدأ',
    hours: 'ساعة', hour_short: 'س', min_short: 'د', day: 'يوم', set_start_time: 'وقت بداية الصيام', confirm: 'تأكيد', cancel: 'إلغاء', save: 'حفظ', delete: 'حذف', close: 'إغلاق', edit: 'تعديل', fasting_goal: 'هدف الصيام', of_goal: 'من الهدف', next_phase_in: 'المرحلة التالية بعد', goal_reached: 'وصلت للهدف',
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
    heart_rate: 'النبض', bpm: 'ن/د', auto_connect: 'اتصال تلقائي',
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
    active_minutes: 'دقائق نشاط', calories_burned: 'سعرات محروقة', level_still: 'ساكن', level_light: 'نشاط خفيف', level_moderate: 'نشاط متوسط', level_vigorous: 'نشاط عالي',
    activity_level_now: 'مستوى النشاط الآن', reset_activity: 'تصفير عدّاد اليوم',
    no_step_sensor: 'الهاتف لا يحتوي على حساس خطوات',
    perm_activity: 'إذن النشاط البدني مطلوب لعد الخطوات',
    grant_permissions: 'منح الأذونات',

    search_food: 'ابحث عن أكل…', calories: 'سعرات', protein: 'بروتين', carbs: 'كارب', fat: 'دهون',
    no_meals: 'مافيش وجبات النهاردة', todays_total: 'إجمالي اليوم', eating_while_fasting: 'أنت صائم دلوقتي — تسجيل وجبة هينهي الصيام. تحب تكمل؟',
    end_and_log: 'أنهِ الصيام وسجّل', just_log: 'سجّل فقط',

    water: 'الماء', water_intake: 'شرب الماء', water_target: 'الهدف اليومي', ml: 'مل',
    liquids_allowed: 'مسموح أثناء الصيام', forbidden_drinks: 'ممنوع أثناء الصيام',
    drink_water: 'ماء + أملاح (صوديوم/هيمالايان)',
    aniseed_lemon: 'يانسون بالليمون', mint_tea: 'شاي نعناع', hibiscus: 'كركديه',
    cinnamon_caraway: 'قرفة / كراوية', plain_coffee: 'قهوة سادة', plain_green_tea: 'شاي أخضر سادة',
    club_soda: 'كلوب صودا بليمون وثلج',
    forbidden_list: 'عسل، سكر، محليات صناعية، لبن، عصائر، أي سعرات',
    electrolytes_note: 'في الصيام الممتد (24 ساعة+) الأملاح مش رفاهية: صوديوم وبوتاسيوم ومغنيسيوم يمنعوا الصداع والدوخة.',

    bmi: 'كتلة الجسم', tdee: 'سعراتك اليومية', bmr: 'أيض الراحة',
    current_streak: 'السلسلة الحالية', best_streak: 'أفضل سلسلة', total_sessions: 'عدد الجلسات',
    total_hours: 'إجمالي الساعات', completion_rate: 'نسبة الإكمال', longest_fast: 'أطول صيام', last_7_days: 'آخر 7 أيام',
    history: 'سجل الصيام', no_history: 'لا يوجد سجل بعد', completed: 'مكتمل', incomplete: 'غير مكتمل',
    add_weight: 'سجّل وزنك', coach_title: 'المدرب الذكي', analysis: 'التحليل الفسيولوجي', tips: 'نصائح علمية',
    trend_7: 'خط الاتجاه (٧ أيام)', kg_per_week: 'كجم/أسبوع', pct_per_week: '٪ من وزنك/أسبوع',
    over_days: 'يوم', trend_hint: 'الخط ده هو اللي بيتقاس عليه التقدم — الميزان لوحده بيتأرجح كيلو ونص في اليوم على مية وجليكوجين.',
    trend_need_more: 'محتاج أسبوعين قراءات وزن على الأقل قبل ما أقدر أقول اتجاه بثقة.',
    plan_window: 'الخطة والنافذة',
    set_profile_hint: 'وزنك وطولك وسنك ولغتك',
    set_plan_window_hint: 'الخطة، مواعيد الأكل، النوم، الهدف الافتراضي',
    set_reminders_hint: 'مواعيد التنبيهات وتشغيلها',
    set_appearance_hint: 'الثيم واللون وحجم الخط',
    set_ramadan_mode_hint: 'نافذة تتحرك مع المغرب والفجر',
    set_band_hint: 'السوار، المستشعرات، الأذونات، البطارية',
    set_supplements_hint: 'الفيتامينات والمكمّلات',
    set_data_hint: 'التقرير، النسخ الاحتياطي، الاستيراد، المسح',
    report_pdf: 'PDF مع الصور', report_building: 'بجهّز التقرير…',
    report_text: 'نسخة نصية', report_text_hint: 'للصق في شات أو رسالة',
    exercises_hint: 'تمرينين مقاومة في الأسبوع هما اللي بيخلوا اللي بينزل دهون مش عضل. كل حركة معاها شرح متحرك وأهم غلطة فيها.',
    exercises: 'التمارين', kit_none: 'من غير أدوات', kit_weight: 'دامبل أو مطاط',
    common_mistake: 'الغلطة الشائعة',
    exercise_disclaimer: 'لو عندك إصابة أو ألم في الظهر أو الركبة، اسأل دكتور أو أخصائي علاج طبيعي قبل ما تبدأ. الألم الحاد أثناء الحركة معناه توقف، مش كمّل.',
    open_exercises: 'شوف التمارين',
    import_bad: 'الملف مش JSON صالح',
    medals: 'الميداليات', medals_earned: 'ميدالية', medal_earned: 'ميدالية جديدة', nice: 'تمام',
    grp_consistency: 'الاستمرارية', grp_milestone: 'معالم', grp_nutrition: 'التغذية',
    grp_training: 'التدريب', grp_recovery: 'الاستشفاء',
    challenge: 'التحدي', challenge_hint: 'تحدي شخصي بينك وبين نفسك، بمدة محددة. مفيش ترتيب ولا مقارنة بحد.',
    challenge_started: 'التحدي ابتدا', challenge_done: 'خلصته', challenge_expired: 'الوقت خلص',
    challenge_quit: 'إلغاء التحدي', challenge_restart: 'جرّب تاني', challenge_cleared: 'اتشال',
    days_left: 'يوم فاضل', collect: 'استلم',
    gram_unit: 'جم',
    reached_state: 'وصلت لهدفك',
    change_goal: 'تغيير الهدف', remaining_short: 'باقي',
    confirm_delete: 'متأكد؟',
    pf_overlaps: 'بيتعارض مع صيام مسجّل:', pf_overlaps_running: 'بيتعارض مع الصيام الشغّال دلوقتي',
    pf_add: 'أضف صيام سابق', pf_edit: 'تعديل الصيام', pf_from: 'من', pf_to: 'إلى',
    pf_manual: 'يدوي', pf_bad_date: 'تاريخ أو وقت غير صالح',
    pf_end_before_start: 'وقت النهاية لازم يكون بعد البداية',
    pf_future: 'مينفعش تسجّل صيام في المستقبل', pf_too_long: 'المدة أطول من ١٤ يوم — راجع التواريخ',
    wk_need_two_weeks: 'محتاج أسبوعين بيانات عشان المقارنة تبقى ليها معنى.',
    wk_one_change: 'حاجة واحدة تغيّرها', refeed_day: 'يوم فطار مخطط', refeed_day_hint: 'الفطار المقصود جزء من الخطة — مش كسر للسلسلة.',
    refeed_set: 'اتسجّل كيوم فطار مخطط', refeed_cleared: 'اتشال', refeed_planned: 'أيام مخططة',
    tomorrow: 'بكرة',
    rec_good: 'الاستشفاء كويس', rec_watch: 'خلي بالك من الاستشفاء', rec_strained: 'جسمك مرهق',
    rec_good_sub: 'نبض الراحة عند خط الأساس بتاعك', rec_baseline: 'الأساس',
    pa_title: 'قراءتي لبياناتك', pa_sub: 'تحليل مكتوب على سجلك إنت، مش قواعد عامة',
    sev_high: 'مهم', sev_medium: 'يستاهل نظرة', sev_info: 'للعلم',
    followups: 'متابعة',
    repeat_yesterday: 'زي امبارح', repeat_done: 'اتنقلت وجبات امبارح',
    repeat_nothing: 'مفيش وجبات مسجّلة امبارح', favourites: 'المفضّلة', favourite: 'مفضّلة',
    water_from_weight: 'من وزنك', water_training: 'تمرين', water_heat: 'جو حر', water_manual: 'هدف يدوي',
    hot_climate: 'جو حر', hot_climate_hint: 'يزوّد نص لتر في شهور الصيف',
    appearance: 'المظهر', theme: 'الثيم', theme_dark: 'غامق', theme_light: 'فاتح', theme_system: 'النظام',
    accent: 'اللون الأساسي', text_size: 'حجم الخط',
    size_s: 'صغير', size_m: 'عادي', size_l: 'كبير', size_xl: 'أكبر',
    ramadan_mode: 'وضع رمضان', ramadan_enable: 'فعّل وضع رمضان',
    ramadan_hint: 'النافذة تتحسب من المغرب للفجر تلقائياً كل يوم',
    ramadan_note: 'النافذة والتذكيرات بتتحرك مع الشمس كل يوم. الحسابات فلكية تقديرية — اعتمد على مواقيت بلدك للصلاة.',
    ramadan_no_location: 'محتاج إحداثيات صحيحة عشان أحسب المواقيت.',
    maghrib: 'المغرب', fajr: 'الفجر', fast_length: 'مدة الصيام',
    latitude: 'خط العرض', longitude: 'خط الطول', calc_method: 'طريقة الحساب',
    use_my_location: 'استخدم موقعي', use_my_location_hint: 'من آخر موقع معروف للهاتف',
    detect: 'حدّد', location_unavailable: 'مفيش موقع محفوظ — افتح الخرايط مرة الأول',
    report: 'تقرير شهري', report_hint: 'ملخص مقروء تبعته لدكتور أو تحتفظ بيه',
    share_report: 'شارك التقرير',
    expert_title: 'قراءة أرقامك', expert_sub: 'تحليل تغذية وتدريب مبني على اللي إنت سجّلته',
    expert_empty: 'لسه مفيش بيانات كفاية. سجّل وزنك ووجباتك وتمارينك أسبوع، وهنا هتلاقي تحليل مخصوص ليك.',
    prio_1: 'غيّر ده الأسبوع ده', prio_2: 'يستاهل انتباهك', prio_3: 'محافظة',
    insight_time: 'ميعاد نصيحة اليوم', insight_time_hint: 'أهم ملاحظة من تحليل أرقامك، مرة في اليوم',
    rem_protein: 'جرعة البروتين التانية', rem_protein_hint: 'داخل نافذة الأكل لما الهدف كبير على وجبة واحدة',
    exercise_rec: 'التوصية الرياضية', refeeding: 'بروتوكول الإفطار',
    refeed_phase1: 'المرحلة 1: توقظ المعدة',
    refeed_phase1_desc: 'مرق عظام دافئ أو شوربة + ملعقة زيت زيتون بكر. استنى 30 دقيقة.',
    refeed_phase2: 'المرحلة 2: الوجبة الأساسية',
    refeed_phase2_desc: 'بروتين نظيف (مسلوق/مشوي) + سلطة خضراء كبيرة بزيت زيتون وليمون.',
    refeed_rule: 'قاعدة صارمة',
    refeed_rule_desc: 'ممنوع الخبز الأبيض والسكريات والكربوهيدرات البسيطة — تجنّباً لصدمة الإنسولين واضطراب المعدة.',
    refeed_long_warn: 'بعد صيام 48 ساعة+ خطر متلازمة إعادة التغذية حقيقي. ابدأ بكميات صغيرة جداً وتدريجية، ولو حسيت بخفقان أو تنميل أو ارتباك — كسّر الصيام واطلب استشارة طبية.',

    supplements: 'المكملات', take_now: 'أخذتها', taken_today: 'اتأخذت النهاردة',
    dosage: 'الجرعة', no_double_dose: 'كبسولة واحدة في اليوم بحد أقصى. مضاعفة الجرعة تسبب تراكم الفيتامينات الذائبة في الدهون (A/D/E) وإجهاد الكبد.',
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
    long_fast_warn: 'تجاوزت 48 ساعة. راقب الترطيب والأملاح، وتجنّب المجهود، ولو ظهرت أعراض خطيرة افطر فوراً.',

    activity_hub: 'مركز النشاط', phone_sensors: 'مستشعرات الهاتف', sensor_stepCounter: 'عدّاد خطوات', sensor_stepDetector: 'كاشف خطوة',
    sensor_accelerometer: 'مقياس تسارع', sensor_gyroscope: 'جيروسكوب',
    sensor_barometer: 'بارومتر (ضغط)', sensor_light: 'حساس ضوء',
    sensor_proximity: 'حساس قرب', sensor_magnetometer: 'بوصلة',
    sensor_heartRate: 'حساس نبض',
    floors: 'أدوار', elevation: 'ارتفاع', route: 'المسار', route_title: 'تسجيل مسار المشي/الجري',
    route_start: 'ابدأ التسجيل', route_pause: 'إيقاف مؤقت', route_resume: 'استئناف',
    route_stop: 'إنهاء وحفظ', route_distance: 'المسافة', route_duration: 'المدة', route_open_maps: 'افتح في الخرائط', route_export: 'تصدير GPX',
    route_waiting: 'بيدوّر على إشارة GPS…', route_saved: 'المسار اتحفظ',
    route_history: 'مساراتي', err_gps_off: 'الـGPS مقفول — افتحه من إعدادات الهاتف',
    err_no_provider: 'الجهاز مش بيدعم تحديد الموقع',
    route_hint: 'سيب التطبيق شغال أثناء المشي. الإشعار هيفضل ظاهر والتسجيل مستمر.',
    km: 'كم', min_per_km: 'د/كم', meter: 'م',

    manual_meal: 'إضافة وجبة يدوي', meal_name: 'اسم الوجبة', take_photo: 'كاميرا', from_gallery: 'من المعرض', remove_photo: 'شيل الصورة',
    save_to_db: 'احفظها في قائمة الأكل', photo_failed: 'مافيش صورة اتحفظت',

    high: 'عالي',
    body_comp: 'تركيب الجسم', add_scan: 'أضف قياس', body_history: 'سجل القياسات',
    no_scans: 'مفيش قياسات — ضيف قياس InBody أو ميزان ذكي',
    fat_pct: 'نسبة الدهون %', fat_kg: 'كتلة الدهون (كجم)',
    muscle_kg: 'الكتلة العضلية (كجم)', water_pct: 'نسبة المياه %',
    since_first: 'من أول قياس',
    body_hint: 'الميزان لوحده بيكدب أثناء الصيام: أول ٢٤ ساعة بتنزل مياه وجليكوجين مش دهون. القياس ده هو اللي بيفرق.',
    bmr_lean: 'محسوب من الكتلة الصافية', need_age: 'حدد عمرك عشان نحسب السعرات',
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
    spo2_avg: 'متوسط الأكسجين', health_trends: 'مؤشراتك',
    no_health_data: 'مفيش بيانات — اربط Health Connect وزامن',
    hc_error: 'المزامنة فشلت',
    sleep_metric: 'النوم', fast_today: 'صيام النهاردة', avg_7: 'متوسط ٧ أيام', last_14: 'آخر ١٤ يوم',
    dashboard: 'لوحتك', no_series: 'مفيش بيانات كفاية للرسم',
    live: 'مباشر', latest: 'آخر قراءة',

    protein_target: 'هدف البروتين', protein_left: 'فاضل', protein_done: 'وصلت لهدفك',
    protein_basis_lean: 'محسوب من كتلتك الصافية', protein_basis_weight: 'محسوب من وزنك',
    protein_hint: 'مع وجبة واحدة في اليوم، البروتين أصعب رقم توصله — وهو اللي بيحمي عضلك.',
    per_kg: 'جم/كجم',

    electrolytes: 'الأملاح', sodium: 'صوديوم', potassium: 'بوتاسيوم', magnesium: 'مغنيسيوم',
    mg: 'مجم', add_source: 'أضف مصدر', electrolytes_reset: 'تصفير',
    electrolytes_why: 'في الصيام الممتد الأملاح أهم من السعرات. أغلب الصداع والدوخة سببها صوديوم ناقص مش أكل ناقص.',

    plan: 'خطة الصيام', plan_adherence: 'الالتزام', plan_days: 'أيام الصيام',
    plan_none: 'مفيش خطة — الأهداف يدوية', plan_last14: 'آخر ١٤ يوم',
    plan_applied: 'الخطة اتفعّلت',

    week_compare: 'الأسبوع ده مقابل اللي فاته', vs_last_week: 'عن الأسبوع اللي فات',
    fast_hours: 'ساعات الصيام', avg_fast: 'متوسط الصيام', avg_steps: 'متوسط الخطوات',

    hr_vs_fast: 'النبض مقابل الصيام',
    hr_src_resting: 'نبض الراحة اليومي', hr_src_session: 'متوسط نبض كل جلسة',
    hr_vs_fast_hint: 'كل نقطة يوم: المحور الأفقي ساعات صيامك، والرأسي نبضك. لو النبض بيقل مع الساعات، ده تأقلم كويس. لو بيزيد فجأة، غالباً أملاح أو إجهاد.',
    no_hr_data: 'مفيش بيانات نبض كفاية لسه',

    sleep_est_hint: 'تقدير من سكون الموبايل والإضاءة. مش دقة السوار، بس بيسد الفجوة.',

    widget: 'ويدجت الشاشة الرئيسية',
    widget_hint: 'اضغط مطوّلاً على الشاشة الرئيسية ← ويدجتس ← عبود صايم.',
    auto_backup: 'نسخة احتياطية تلقائية', auto_backup_hint: 'ملف JSON كل أسبوع في مساحة التطبيق',
    last_backup: 'آخر نسخة',

    reminders: 'التنبيهات', rem_water: 'تذكير بالمياه', rem_water_hint: 'كل ساعتين أثناء الصيام',
    rem_motivation: 'رسايل تحفيز', rem_motivation_hint: 'عند ٢٥٪ و٥٠٪ و٧٥٪ من الهدف، ولما تكسر رقمك',
    rem_window: 'نافذة الأكل', rem_window_hint: 'لما تفتح، وقبل ما تقفل بنص ساعة',
    rem_supplement: 'تذكير بالمكمل',
    rem_nudge: 'نبّهني لو مبدأتش صيام', rem_nudge_hint: 'لو الوقت عدّى ولسه مبدأتش',
    rem_test: 'جرّب التنبيه', rem_sent: 'اتبعت — بُص فوق',
    rem_need_perm: 'إذن الإشعارات مقفول — التنبيهات مش هتظهر',

    today: 'النهاردة', yesterday: 'امبارح', edit_start: 'تعديل وقت البداية', will_be: 'يعني صايم من',
    time_future: 'الوقت ده لسه مجاش — اختار امبارح',
    quick_pick: 'اختيار سريع',

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



    workouts: 'التمارين', add_workout: 'سجّل تمرين', distance_km: 'المسافة (كم)', duration_min: 'المدة (دقيقة)',
    avg_hr: 'متوسط النبض', max_hr: 'أقصى نبض', zone_easy: 'خفيف', zone_moderate: 'متوسط', zone_hard: 'عنيف', zone_max: 'أقصى مجهود',
    no_workouts: 'مفيش تمارين متسجلة', fasted_workout: 'صايم', sleep: 'النوم والمنبهات', wake_time: 'موعد الصحيان', sleep_target: 'ساعات النوم',
    bedtime: 'موعد النوم المفترض', caffeine_cutoff: 'آخر كافيين',
    eating_window: 'نافذة الأكل', window_start: 'تبدأ', window_end: 'تنتهي',

    import_merge: 'دمج مع بياناتي', import_replace: 'استبدال كل شيء',
    merged_records: 'سجل اتضاف', import_replace_warn: 'الاستبدال هيمسح كل اللي مسجل دلوقتي',

    saved: 'اتحفظ', deleted: 'اتمسح', file_saved: 'الملف اتحفظ في',
    fast_started: 'بدأ الصيام — بالتوفيق!', fast_ended: 'انتهى الصيام',
    empty_search: 'مافيش نتيجة'
  },

  en: {
    app_name: 'Aboud Sayem',
    home: 'Home', meals: 'Meals', liquids: 'Liquids', progress: 'Progress',
    coach: 'Coach', settings: 'Settings',

    start_fasting: 'Start Fast', pause: 'Pause', resume: 'Resume', stop: 'End Fast',
    paused_state: 'Paused', running_state: 'Running',
    idle_state: 'Not fasting', start_prompt: 'Pick a goal and start',
    hours: 'hours', hour_short: 'h', min_short: 'm', day: 'day', set_start_time: 'Fast start time', confirm: 'Confirm', cancel: 'Cancel', save: 'Save', delete: 'Delete', close: 'Close', edit: 'Edit', fasting_goal: 'Fasting goal', of_goal: 'of goal', next_phase_in: 'Next phase in', goal_reached: 'Goal reached',
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
    heart_rate: 'Heart rate', bpm: 'bpm', auto_connect: 'Auto connect',
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
    active_minutes: 'Active minutes', calories_burned: 'Calories burned', level_still: 'Still', level_light: 'Light', level_moderate: 'Moderate', level_vigorous: 'Vigorous',
    activity_level_now: 'Current intensity', reset_activity: 'Reset today',
    no_step_sensor: 'No hardware step sensor on this phone',
    perm_activity: 'Activity recognition permission is needed for steps',
    grant_permissions: 'Grant permissions',

    search_food: 'Search food…', calories: 'kcal', protein: 'Protein', carbs: 'Carbs', fat: 'Fat',
    no_meals: 'No meals logged today', todays_total: "Today's total", eating_while_fasting: 'You are fasting — logging a meal ends the fast. Continue?',
    end_and_log: 'End fast & log', just_log: 'Log only',

    water: 'Water', water_intake: 'Water intake', water_target: 'Daily target', ml: 'ml',
    liquids_allowed: 'Allowed while fasting', forbidden_drinks: 'Forbidden while fasting',
    drink_water: 'Water + electrolytes (sodium/Himalayan)',
    aniseed_lemon: 'Aniseed with lemon', mint_tea: 'Mint tea', hibiscus: 'Hibiscus',
    cinnamon_caraway: 'Cinnamon / caraway', plain_coffee: 'Black coffee', plain_green_tea: 'Green tea',
    club_soda: 'Club soda, ice and lemon',
    forbidden_list: 'Honey, sugar, sweeteners, milk, juice, anything caloric',
    electrolytes_note: 'Past 24h, electrolytes are not optional: sodium, potassium and magnesium prevent the headaches and dizziness.',

    bmi: 'BMI', tdee: 'TDEE', bmr: 'BMR',
    current_streak: 'Current streak', best_streak: 'Best streak', total_sessions: 'Sessions',
    total_hours: 'Total hours', completion_rate: 'Completion', longest_fast: 'Longest fast', last_7_days: 'Last 7 days',
    history: 'Fasting history', no_history: 'Nothing logged yet', completed: 'Completed', incomplete: 'Incomplete',
    add_weight: 'Log weight', coach_title: 'Smart coach', analysis: 'Physiological analysis', tips: 'Science tips',
    trend_7: '7-day trend', kg_per_week: 'kg/week', pct_per_week: '% bodyweight/week',
    over_days: 'days', trend_hint: 'This line is what progress is measured on — raw scale weight swings over a kilo a day on water and glycogen alone.',
    trend_need_more: 'At least a fortnight of weigh-ins is needed before a direction can be called.',
    plan_window: 'Plan & window',
    set_profile_hint: 'Weight, height, age and language',
    set_plan_window_hint: 'Plan, eating window, sleep, default goal',
    set_reminders_hint: 'What fires and when',
    set_appearance_hint: 'Theme, accent and text size',
    set_ramadan_mode_hint: 'A window that follows maghrib and fajr',
    set_band_hint: 'Band, sensors, permissions, battery',
    set_supplements_hint: 'Vitamins and supplements',
    set_data_hint: 'Report, backup, import, reset',
    report_pdf: 'PDF with photos', report_building: 'Building the report…',
    report_text: 'Plain text', report_text_hint: 'To paste into a chat or message',
    exercises_hint: 'Two resistance sessions a week are what keep the weight you lose fat rather than muscle. Every movement has an animated demonstration and the mistake to avoid.',
    exercises: 'Exercises', kit_none: 'No equipment', kit_weight: 'Dumbbell or band',
    common_mistake: 'Common mistake',
    exercise_disclaimer: 'If you have an injury or back or knee pain, check with a doctor or physiotherapist before starting. Sharp pain during a movement means stop, not push through.',
    open_exercises: 'See the exercises',
    import_bad: 'Not valid JSON',
    medals: 'Medals', medals_earned: 'earned', medal_earned: 'Medal earned', nice: 'Good',
    grp_consistency: 'Consistency', grp_milestone: 'Milestones', grp_nutrition: 'Nutrition',
    grp_training: 'Training', grp_recovery: 'Recovery',
    challenge: 'Challenge', challenge_hint: 'A personal, time-boxed commitment. No leaderboard, no comparison with anyone.',
    challenge_started: 'Challenge started', challenge_done: 'Completed', challenge_expired: 'Time is up',
    challenge_quit: 'Cancel challenge', challenge_restart: 'Try again', challenge_cleared: 'Cleared',
    days_left: 'days left', collect: 'Collect',
    gram_unit: 'g',
    reached_state: 'Goal reached',
    change_goal: 'Change goal', remaining_short: 'left',
    confirm_delete: 'Sure?',
    pf_overlaps: 'Overlaps a logged fast:', pf_overlaps_running: 'Overlaps the fast running now',
    pf_add: 'Log a past fast', pf_edit: 'Edit fast', pf_from: 'From', pf_to: 'To',
    pf_manual: 'Manual', pf_bad_date: 'Invalid date or time',
    pf_end_before_start: 'The end must come after the start',
    pf_future: 'A fast cannot end in the future', pf_too_long: 'Longer than 14 days — check the dates',
    wk_need_two_weeks: 'Two weeks of data are needed before a comparison means anything.',
    wk_one_change: 'One thing to change', refeed_day: 'Planned refeed day', refeed_day_hint: 'A deliberate break is part of the plan, not a broken streak.',
    refeed_set: 'Marked as a planned refeed', refeed_cleared: 'Cleared', refeed_planned: 'Days planned',
    tomorrow: 'Tomorrow',
    rec_good: 'Recovery looks fine', rec_watch: 'Watch your recovery', rec_strained: 'You are under-recovered',
    rec_good_sub: 'Resting heart rate is at your baseline', rec_baseline: 'baseline',
    pa_title: 'My reading of your data', pa_sub: 'Written against your own record, not general rules',
    sev_high: 'Important', sev_medium: 'Worth a look', sev_info: 'For reference',
    followups: 'Follow-up',
    repeat_yesterday: 'Same as yesterday', repeat_done: "Copied yesterday's meals",
    repeat_nothing: 'No meals logged yesterday', favourites: 'Favourites', favourite: 'Favourite',
    water_from_weight: 'from weight', water_training: 'training', water_heat: 'heat', water_manual: 'manual target',
    hot_climate: 'Hot climate', hot_climate_hint: 'Adds half a litre through the summer months',
    appearance: 'Appearance', theme: 'Theme', theme_dark: 'Dark', theme_light: 'Light', theme_system: 'System',
    accent: 'Accent colour', text_size: 'Text size',
    size_s: 'Small', size_m: 'Normal', size_l: 'Large', size_xl: 'Larger',
    ramadan_mode: 'Ramadan mode', ramadan_enable: 'Enable Ramadan mode',
    ramadan_hint: 'The window follows maghrib to fajr, recomputed daily',
    ramadan_note: 'The window and its reminders move with the sun each day. These are astronomical estimates — follow your local prayer timetable.',
    ramadan_no_location: 'Valid coordinates are needed to compute the times.',
    maghrib: 'Maghrib', fajr: 'Fajr', fast_length: 'Fast length',
    latitude: 'Latitude', longitude: 'Longitude', calc_method: 'Calculation method',
    use_my_location: 'Use my location', use_my_location_hint: "From the phone's last known position",
    detect: 'Detect', location_unavailable: 'No cached position — open a maps app once first',
    report: 'Monthly report', report_hint: 'A readable summary to send to a doctor or keep',
    share_report: 'Share report',
    expert_title: 'Reading your numbers', expert_sub: 'Nutrition and training analysis from what you logged',
    expert_empty: 'Not enough data yet. Log your weight, meals and workouts for a week and your own analysis appears here.',
    prio_1: 'Change this week', prio_2: 'Worth your attention', prio_3: 'Upkeep',
    insight_time: 'Daily insight time', insight_time_hint: 'The single most useful finding, once a day',
    rem_protein: 'Second protein dose', rem_protein_hint: 'Inside the eating window when the target is large for one meal',
    exercise_rec: 'Exercise guidance', refeeding: 'Refeeding protocol',
    refeed_phase1: 'Step 1: wake the stomach',
    refeed_phase1_desc: 'Warm bone broth or plain soup + 1 tsp extra virgin olive oil. Wait 30 minutes.',
    refeed_phase2: 'Step 2: main meal',
    refeed_phase2_desc: 'Clean protein (boiled/grilled) + a large green salad with olive oil and lemon.',
    refeed_rule: 'Strict rule',
    refeed_rule_desc: 'No white bread, refined sugar or simple carbs — avoids the insulin spike and GI distress.',
    refeed_long_warn: 'After 48h+ refeeding syndrome is a real risk. Restart with very small portions, and if you feel palpitations, tingling or confusion, break the fast and seek medical advice.',

    supplements: 'Supplements', take_now: 'Taken', taken_today: 'Taken today',
    dosage: 'Dosage', no_double_dose: 'One capsule per day maximum. Doubling the dose accumulates fat-soluble vitamins (A/D/E) and strains the liver.',
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
    long_fast_warn: 'Past 48 hours. Watch hydration and electrolytes, avoid exertion, and break the fast if serious symptoms appear.',

    activity_hub: 'Activity hub', phone_sensors: 'Phone sensors', sensor_stepCounter: 'Step counter', sensor_stepDetector: 'Step detector',
    sensor_accelerometer: 'Accelerometer', sensor_gyroscope: 'Gyroscope',
    sensor_barometer: 'Barometer', sensor_light: 'Light sensor',
    sensor_proximity: 'Proximity', sensor_magnetometer: 'Compass',
    sensor_heartRate: 'Heart rate sensor',
    floors: 'Floors', elevation: 'Elevation', route: 'Route', route_title: 'Record a walk or run',
    route_start: 'Start recording', route_pause: 'Pause', route_resume: 'Resume',
    route_stop: 'Finish & save', route_distance: 'Distance', route_duration: 'Duration', route_open_maps: 'Open in maps', route_export: 'Export GPX',
    route_waiting: 'Waiting for a GPS fix…', route_saved: 'Route saved',
    route_history: 'My routes', err_gps_off: 'GPS is off — turn it on in system settings',
    err_no_provider: 'This device has no location provider',
    route_hint: 'Leave the app running while you walk. The notification stays up and recording continues.',
    km: 'km', min_per_km: 'min/km', meter: 'm',

    manual_meal: 'Add meal manually', meal_name: 'Meal name', take_photo: 'Camera', from_gallery: 'Gallery', remove_photo: 'Remove photo',
    save_to_db: 'Save to my food list', photo_failed: 'No photo was saved',

    high: 'High',
    body_comp: 'Body composition', add_scan: 'Add scan', body_history: 'Scan history',
    no_scans: 'No scans yet — add an InBody or smart-scale reading',
    fat_pct: 'Body fat %', fat_kg: 'Fat mass (kg)',
    muscle_kg: 'Muscle mass (kg)', water_pct: 'Body water %',
    since_first: 'since first scan',
    body_hint: 'The scale alone lies during a fast: the first 24h drops water and glycogen, not fat. This is what tells them apart.',
    bmr_lean: 'from lean mass', need_age: 'Set your age to compute calories',
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
    spo2_avg: 'Average SpO2', health_trends: 'Your metrics',
    no_health_data: 'No data — connect Health Connect and sync',
    hc_error: 'Sync failed',
    sleep_metric: 'Sleep', fast_today: "Today's fast", avg_7: '7-day average', last_14: 'Last 14 days',
    dashboard: 'Your day', no_series: 'Not enough data to chart',
    live: 'live', latest: 'latest',

    protein_target: 'Protein target', protein_left: 'left', protein_done: 'Target reached',
    protein_basis_lean: 'from your lean mass', protein_basis_weight: 'from your weight',
    protein_hint: 'On one meal a day, protein is the hardest number to reach — and it is what protects muscle.',
    per_kg: 'g/kg',

    electrolytes: 'Electrolytes', sodium: 'Sodium', potassium: 'Potassium', magnesium: 'Magnesium',
    mg: 'mg', add_source: 'Add a source', electrolytes_reset: 'Reset',
    electrolytes_why: 'On an extended fast electrolytes matter more than calories. Most headaches and dizziness are low sodium, not low food.',

    plan: 'Fasting plan', plan_adherence: 'Adherence', plan_days: 'Fasting days',
    plan_none: 'No plan — goals are manual', plan_last14: 'last 14 days',
    plan_applied: 'Plan applied',

    week_compare: 'This week vs last', vs_last_week: 'vs last week',
    fast_hours: 'Fasted hours', avg_fast: 'Average fast', avg_steps: 'Average steps',

    hr_vs_fast: 'Heart rate vs fasting',
    hr_src_resting: 'daily resting HR', hr_src_session: 'per-session average HR',
    hr_vs_fast_hint: 'Each dot is a day: fasted hours across, heart rate up. Falling HR as hours rise means good adaptation. A sudden rise usually means electrolytes or strain.',
    no_hr_data: 'Not enough heart-rate data yet',

    sleep_est_hint: 'Estimated from phone stillness and light. Not band accuracy, but it fills the gap.',

    widget: 'Home screen widget',
    widget_hint: 'Long-press the home screen > Widgets > Aboud Sayem.',
    auto_backup: 'Automatic backup', auto_backup_hint: 'A JSON file weekly in app storage',
    last_backup: 'Last backup',

    reminders: 'Reminders', rem_water: 'Water reminder', rem_water_hint: 'Every 2 hours while fasting',
    rem_motivation: 'Encouragement', rem_motivation_hint: 'At 25%, 50%, 75% of the goal, and on a new record',
    rem_window: 'Eating window', rem_window_hint: 'When it opens, and 30 minutes before it closes',
    rem_supplement: 'Supplement reminder',
    rem_nudge: 'Nudge if no fast started', rem_nudge_hint: 'When the time passes and nothing is running',
    rem_test: 'Send a test', rem_sent: 'Sent — check your notifications',
    rem_need_perm: 'Notification permission is off — reminders will not appear',

    today: 'Today', yesterday: 'Yesterday', edit_start: 'Edit start time', will_be: 'That is a fast of',
    time_future: 'That time has not happened yet — pick yesterday',
    quick_pick: 'Quick pick',

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



    workouts: 'Workouts', add_workout: 'Log a workout', distance_km: 'Distance (km)', duration_min: 'Duration (min)',
    avg_hr: 'Average HR', max_hr: 'Max HR', zone_easy: 'Easy', zone_moderate: 'Moderate', zone_hard: 'Hard', zone_max: 'All out',
    no_workouts: 'No workouts logged', fasted_workout: 'fasted', sleep: 'Sleep and stimulants', wake_time: 'Wake time', sleep_target: 'Sleep hours',
    bedtime: 'Implied bedtime', caffeine_cutoff: 'Last caffeine',
    eating_window: 'Eating window', window_start: 'Opens', window_end: 'Closes',

    import_merge: 'Merge with my data', import_replace: 'Replace everything',
    merged_records: 'records added', import_replace_warn: 'Replacing erases everything currently stored',

    saved: 'Saved', deleted: 'Deleted', file_saved: 'File saved to',
    fast_started: 'Fast started — good luck!', fast_ended: 'Fast ended',
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

/**
 * The clock split into the part worth reading and the part that only moves.
 *
 * Seconds change nothing about a twenty-hour fast, but they were rendered at
 * 36px and animated once a second, which is the strongest attention cue on
 * the screen spent on its least useful digit. Callers render `hm` large and
 * `sec` small and muted.
 */
function clockParts(ms) {
  if (ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  return {
    hm: pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)),
    sec: pad2(s % 60)
  };
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
  // Null, not 0: a BMI of zero is a number the UI will happily print.
  return (m2 <= 0 || !kg) ? null : kg / m2;
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
/**
 * Katch-McArdle: when a body-composition scan is available it beats
 * Mifflin-St Jeor, because it works from lean mass and needs no age at all.
 */
function calcBMRLean(leanKg) {
  if (!leanKg) return null;
  return 370 + 21.6 * leanKg;
}

/** Best available resting-energy estimate, with its source named. */
/**
 * Fat-free mass in kg, which is what Katch-McArdle and the protein target
 * both actually want.
 *
 * The reliable route is weight minus fat, because a scale's fat percentage
 * is the one composition number it measures rather than models. A scale's
 * "muscle" figure is skeletal muscle, which is materially smaller — for a
 * 96 kg body at 24.5% fat it reads about 59 kg against a true fat-free mass
 * of 72.5 kg. Feeding that into Katch-McArdle understates resting burn by
 * roughly 290 kcal a day, and every calorie floor built on it inherits the
 * error. Muscle mass is therefore only a last resort, and says so.
 *
 * @return {{kg: number, source: string}|null}
 */
/** Plausible bounds for a body scan, applied whichever route it arrived by.
 *  The entry form clamps these already; Health Connect and a merged export do
 *  not, and one bad reading otherwise propagates into the resting-burn
 *  estimate, the protein target and every calorie warning built on them. */
var BODY_LIMITS = { kg: [25, 350], fatPct: [3, 70], muscleKg: [10, 120], waterPct: [20, 80] };

function inBounds(field, v) {
  var r = BODY_LIMITS[field];
  if (!r) return typeof v === 'number' && !isNaN(v);
  return typeof v === 'number' && !isNaN(v) && v >= r[0] && v <= r[1];
}

function fatFreeMass() {
  var byFat = latestBodyWith('fatKg');
  if (byFat && inBounds('kg', byFat.kg) && byFat.fatKg > 0 && byFat.fatKg < byFat.kg) {
    return { kg: Math.round((byFat.kg - byFat.fatKg) * 10) / 10, source: 'fat_mass' };
  }
  var byPct = latestBodyWith('fatPct');
  if (byPct && inBounds('kg', byPct.kg) && inBounds('fatPct', byPct.fatPct)) {
    return { kg: Math.round(byPct.kg * (1 - byPct.fatPct / 100) * 10) / 10, source: 'fat_pct' };
  }
  var byMuscle = latestBodyWith('muscleKg');
  if (byMuscle && inBounds('muscleKg', byMuscle.muscleKg)) {
    return { kg: byMuscle.muscleKg, source: 'muscle' };
  }
  return null;
}

function bestBMR(profile) {
  var ffm = fatFreeMass();
  if (ffm) return { value: Math.round(calcBMRLean(ffm.kg)), source: 'lean', basis: ffm.source };
  var v = calcBMR(profile.weight, profile.height, profile.age, profile.gender);
  return v === null
    ? { value: null, source: 'none' }
    : { value: Math.round(v), source: 'mifflin' };
}

/**
 * Daily burn from the best BMR available. Using lean mass means a body scan
 * removes the need for an age entirely, instead of blocking the whole number.
 */
var ACTIVITY_FACTORS = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9
};

function bestTDEE(profile) {
  var bmr = bestBMR(profile);
  if (bmr.value === null) return { value: null, source: 'none' };
  return {
    value: Math.round(bmr.value * (ACTIVITY_FACTORS[profile.activity] || 1.55)),
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
 * Most recent entry that actually carries `field`.
 *
 * Scans arrive from different sources: a full InBody has muscle mass, a scale
 * reading synced through Health Connect has only weight. Reading the newest
 * entry alone meant one scale reading silently discarded a known lean mass,
 * downgrading both the protein target and the BMR to weaker formulas.
 */
function latestBodyWith(field) {
  var log = S.get('bodyLog', []);
  for (var i = log.length - 1; i >= 0; i--) {
    if (log[i][field] !== null && log[i][field] !== undefined) return log[i];
  }
  return null;
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
  var bmiRaw = calcBMI(e.kg, e.height);
  if (bmiRaw !== null) e.bmi = Math.round(bmiRaw * 10) / 10;
  return e;
}

/* ---------------------------------------------------------------------
 * Workouts
 * ------------------------------------------------------------------- */

var WORKOUT_TYPES = [
  { k: 'walk', icon: 'walk', ar: 'مشي', en: 'Walk' },
  { k: 'cycle', icon: 'cycle', ar: 'عجلة', en: 'Cycling' },
  { k: 'run', icon: 'run', ar: 'جري', en: 'Run' },
  { k: 'gym', icon: 'dumbbell', ar: 'مقاومة', en: 'Resistance' },
  { k: 'swim', icon: 'swim', ar: 'سباحة', en: 'Swim' },
  { k: 'other', icon: 'sparkles', ar: 'غير ذلك', en: 'Other' }
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
  { icon: 'droplet', key: 'drink_water' },
  { icon: 'leaf', key: 'aniseed_lemon' },
  { icon: 'leaf', key: 'mint_tea' },
  { icon: 'leaf', key: 'hibiscus' },
  { icon: 'flame', key: 'cinnamon_caraway' },
  { icon: 'coffee', key: 'plain_coffee' },
  { icon: 'leaf', key: 'plain_green_tea' },
  { icon: 'droplet', key: 'club_soda' }
];

var LIQUIDS_NO = [
  { icon: 'ban', ar: 'عسل', en: 'Honey' },
  { icon: 'ban', ar: 'سكر ومحليات صناعية', en: 'Sugar & artificial sweeteners' },
  { icon: 'ban', ar: 'لبن / كريمة', en: 'Milk / cream' },
  { icon: 'ban', ar: 'عصائر', en: 'Juices' },
  { icon: 'ban', ar: 'مشروبات غازية', en: 'Soft drinks' },
  { icon: 'ban', ar: 'أي شيء به سعرات', en: 'Anything with calories' }
];

/* ---------------------------------------------------------------------
 * History & stats
 * ------------------------------------------------------------------- */

/** Consecutive-day streak counting back from today (or yesterday). */
/**
 * Consecutive days with a completed fast.
 *
 * A day marked as a planned refeed bridges the streak without adding to it:
 * a deliberate break is part of the protocol, so it should not reset the
 * count, but it did not involve fasting either, so it should not inflate it.
 */
function computeStreak(history) {
  if (!history || !history.length) return 0;
  var days = {};
  for (var i = 0; i < history.length; i++) {
    days[dayKey(history[i].end || history[i].start)] = true;
  }
  var streak = 0;
  var cursor = startOfDay(Date.now());
  // Today may simply not be over yet, so an empty today is not a break.
  if (!days[dayKey(cursor)] && !isPlannedBreak(cursor)) {
    cursor -= 86400000;
    if (!days[dayKey(cursor)] && !isPlannedBreak(cursor)) return 0;
  }
  while (days[dayKey(cursor)] || isPlannedBreak(cursor)) {
    if (days[dayKey(cursor)]) streak++;
    cursor -= 86400000;
  }
  return streak;
}

/**
 * History as non-overlapping intervals, oldest first.
 *
 * The entry form now refuses to create an overlap, but an imported export or
 * a merged history from another phone can still contain one, and the totals
 * used to simply add them: a 19-hour day with a 10-hour entry inside it
 * reported 29 fasted hours out of a possible 24. Every aggregate reads
 * through here so a duplicate inflates nothing.
 */
function mergedFastIntervals() {
  var hist = S.get('history', []);
  var spans = [];
  for (var i = 0; i < hist.length; i++) {
    var a = hist[i].start;
    var b = hist[i].end || (a && hist[i].duration ? a + hist[i].duration : null);
    if (!a || !b || b <= a) continue;
    spans.push([a, b]);
  }
  spans.sort(function (x, y) { return x[0] - y[0]; });

  var out = [];
  for (var j = 0; j < spans.length; j++) {
    var last = out[out.length - 1];
    if (last && spans[j][0] < last[1]) {
      if (spans[j][1] > last[1]) last[1] = spans[j][1];
    } else {
      out.push([spans[j][0], spans[j][1]]);
    }
  }
  return out;
}

function recomputeStats() {
  var hist = S.get('history', []);
  var completed = 0, longest = 0;
  for (var i = 0; i < hist.length; i++) {
    if (hist[i].completed) completed++;
    if ((hist[i].duration || 0) > longest) longest = hist[i].duration;
  }
  // Elapsed time actually spent fasting, counted once even where two records
  // cover the same hours.
  var merged = mergedFastIntervals();
  var totalMs = 0;
  for (var j = 0; j < merged.length; j++) totalMs += merged[j][1] - merged[j][0];
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


/* ---------------------------------------------------------------------
 * Expert engine — nutrition and training analysis
 *
 * The coach used to react to the clock and a mood slider. This reads the
 * user's own numbers the way a nutrition and strength coach would: what the
 * training actually consists of, how fast weight is moving, whether intake
 * clears the floor, and whether recovery supports any of it.
 *
 * Every rule states the reasoning, not just the verdict, and stays silent
 * when the data is too thin to justify it. Fitness guidance, not medical
 * advice — the app's medical notice still stands.
 * ------------------------------------------------------------------- */

/** Days in the last `n` where every logged meal had known calories. */
function completeCalorieDays(n) {
  var meals = S.get('meals', []);
  var byDay = {};
  var i;
  for (i = 0; i < meals.length; i++) {
    var age = Date.now() - meals[i].ts;
    if (age > n * 86400000 || age < 0) continue;
    var k = dayKey(meals[i].ts);
    if (!byDay[k]) byDay[k] = { cal: 0, p: 0, unknown: 0 };
    var mult = meals[i].portions || 1;
    if (meals[i].cal === null || meals[i].cal === undefined) byDay[k].unknown++;
    byDay[k].cal += (meals[i].cal || 0) * mult;
    byDay[k].p += (meals[i].p || 0) * mult;
  }
  var out = [];
  for (var k2 in byDay) {
    if (!Object.prototype.hasOwnProperty.call(byDay, k2)) continue;
    if (byDay[k2].unknown > 0) continue;
    out.push(byDay[k2]);
  }
  return out;
}

/**
 * Daily weight carried forward, so a gap between weigh-ins does not read as
 * a gap in the trend. Each day takes the most recent reading on or before it.
 * @return {Array<{ts:number, kg:number|null}>} oldest first
 */
function dailyWeights(days) {
  var log = sortByTime(S.get('profile.weightLog', []).slice(), 'ts');
  if (!log.length) return [];
  var out = [];
  var span = lastDays(days || 60);
  for (var i = 0; i < span.length; i++) {
    var kg = null;
    for (var j = 0; j < log.length; j++) {
      if (log[j].ts <= span[i].ts + 86399999 && log[j].kg) kg = log[j].kg;
    }
    out.push({ ts: span[i].ts, kg: kg });
  }
  return out;
}

/**
 * Centred moving average of bodyweight.
 *
 * Scale weight during a fast swings well over a kilo on water and glycogen
 * alone, so two raw readings can differ by more than a fortnight of real
 * change — enough to invert the sign of the trend. Everything that reasons
 * about direction reads this instead of the raw log.
 *
 * @return {Array<{ts:number, kg:number|null, avg:number|null}>}
 */
function smoothedWeights(days, window) {
  var raw = dailyWeights(days || 60);
  var w = window || 7;
  var half = Math.floor(w / 2);
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var sum = 0, n = 0;
    for (var j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= raw.length || raw[j].kg === null) continue;
      sum += raw[j].kg;
      n++;
    }
    out.push({ ts: raw[i].ts, kg: raw[i].kg, avg: n ? sum / n : null });
  }
  return out;
}

/**
 * Rate of weight change, measured on the smoothed line rather than on two
 * raw weigh-ins.
 *
 * Needs a fortnight before it will commit to a direction: below that the
 * smoothing window is wider than the sample and the slope is noise.
 *
 * @return {{pctPerWeek:number, kgPerWeek:number, days:number,
 *           from:number, to:number, readings:number}|null}
 */
function weightTrend() {
  var series = smoothedWeights(60, 7);
  var points = [];
  for (var i = 0; i < series.length; i++) {
    if (series[i].avg !== null) points.push(series[i]);
  }
  if (points.length < 14) return null;

  var first = points[0], last = points[points.length - 1];
  var days = (last.ts - first.ts) / 86400000;
  if (days < 14 || !first.avg) return null;

  var kgPerWeek = (last.avg - first.avg) / (days / 7);
  var raw = S.get('profile.weightLog', []).length;
  return {
    pctPerWeek: (kgPerWeek / first.avg) * 100,
    kgPerWeek: kgPerWeek,
    days: Math.round(days),
    from: Math.round(first.avg * 10) / 10,
    to: Math.round(last.avg * 10) / 10,
    readings: raw
  };
}

/** Days since the last workout of a given type, or null if never. */
function daysSinceWorkout(type) {
  var w = S.get('workouts', []);
  for (var i = w.length - 1; i >= 0; i--) {
    if (type && w[i].type !== type) continue;
    return Math.floor((Date.now() - w[i].ts) / 86400000);
  }
  return null;
}

/** Recent training load: how hard the last sessions ran, as % of ceiling. */
function trainingLoad(days) {
  var w = S.get('workouts', []);
  var cutoff = Date.now() - (days || 14) * 86400000;
  var hard = 0, total = 0, late = 0, sumPct = 0, withHr = 0;
  for (var i = 0; i < w.length; i++) {
    if (w[i].ts < cutoff) continue;
    total++;
    if (new Date(w[i].ts).getHours() >= 21) late++;
    var z = hrZone(w[i].maxHr);
    if (z) {
      withHr++;
      sumPct += z.pct;
      if (z.level === 'hard' || z.level === 'max') hard++;
    }
  }
  return {
    total: total, hard: hard, late: late,
    avgPct: withHr ? sumPct / withHr : null
  };
}

function avgSleepHours(n) {
  var v = healthAverage('sleepMs', n || 7);
  return v === null ? null : v / 3600000;
}

/**
 * The prioritised advice list. Priority 1 is something worth changing this
 * week; 3 is upkeep. The UI shows them in order and does not pad the list.
 */
function expertInsights() {
  var ar = isRTL();
  var out = [];
  var profile = S.get('profile', {});
  var body = latestBodyWith('muscleKg');
  var bmr = bestBMR(profile);
  var tdee = bestTDEE(profile);
  var target = proteinTarget();
  var load = trainingLoad(14);
  var trend = weightTrend();
  var sleepH = avgSleepHours(7);
  var lastGym = daysSinceWorkout('gym');

  // `id` is what the insight log follows over time, so it must stay stable
  // even as the wording changes; `metric` is the number the follow-up check
  // re-reads to decide whether anything actually moved.
  function push(id, priority, tone, icon, title, text, metric) {
    out.push({
      id: id, priority: priority, tone: tone, icon: icon,
      title: title, text: text,
      metric: metric === undefined ? null : metric
    });
  }

  /* --- 1. Cardio-only while losing weight: the muscle problem ---------- */
  if (load.total >= 2 && (lastGym === null || lastGym > 10)) {
    push('resistance', 1, 'warn', 'dumbbell',
      ar ? 'كل تمارينك كارديو — ده بياكل من عضلك' : 'All cardio, no resistance',
      ar
        ? 'آخر ١٤ يوم فيهم ' + load.total + ' تمرين، ومفيش ولا واحد مقاومة. '
          + 'إنت بتعمل عجز في السعرات + صيام ممتد + كارديو طويل، والتلاتة مع بعض '
          + 'بيخلوا الجسم ياخد من العضل مش من الدهون بس. '
          + (body ? 'عندك ' + body.muscleKg + ' كجم كتلة صافية — دي اللي بتحدد أيضك، '
            + 'ولو نزلت هيبقى تثبيت الوزن بعدين أصعب بكتير. ' : '')
          + 'المطلوب مش كتير: تمرينين مقاومة في الأسبوع، ٤٠ دقيقة، حركات مركّبة '
          + '(سكوات، ضغط، سحب). ده مش عشان تكبّر عضل — ده عشان تدّي الجسم سبب إنه '
          + 'يحافظ على اللي عندك وهو في عجز.'
        : 'Fourteen days, ' + load.total + ' sessions, none of them resistance. '
          + 'A calorie deficit plus extended fasting plus long cardio pushes the body '
          + 'to take from muscle, not only fat. '
          + (body ? 'You have ' + body.muscleKg + ' kg of lean mass, which sets your '
            + 'metabolic rate; losing it makes maintenance far harder later. ' : '')
          + 'Two sessions a week, 40 minutes, compound movements (squat, press, pull). '
          + 'Not to build — to give the body a reason to keep what you have.');
  }

  /* --- 2. Rate of loss ------------------------------------------------- */
  if (trend && trend.pctPerWeek < -1.0) {
    push('loss_rate', 1, 'warn', 'scale',
      ar ? 'بتنزل بسرعة أكتر من اللازم' : 'Losing weight too fast',
      ar
        ? 'خط الاتجاه (متوسط ٧ أيام) نازل ' + Math.abs(trend.kgPerWeek).toFixed(2)
          + ' كجم في الأسبوع — يعني ' + Math.abs(trend.pctPerWeek).toFixed(1)
          + '٪ من وزنك — على مدار ' + trend.days + ' يوم، من ' + trend.from + ' لـ'
          + trend.to + ' كجم. فوق ١٪ في الأسبوع، نسبة كبيرة من النازل بتبقى عضل ومياه '
          + 'مش دهون. هدّي المعدل لـ٠.٥-١٪ بزيادة الأكل في نافذتك، مش بتقليل الصيام.'
        : 'The smoothed line is falling ' + Math.abs(trend.kgPerWeek).toFixed(2)
          + ' kg a week — ' + Math.abs(trend.pctPerWeek).toFixed(1) + '% of bodyweight — '
          + 'over ' + trend.days + ' days, from ' + trend.from + ' to ' + trend.to + ' kg. '
          + 'Past 1% a week, a large share of that is muscle and water rather than fat. '
          + 'Slow it to 0.5-1% by eating more inside your window, not by shortening the fast.');
  } else if (trend && trend.pctPerWeek > 0.4) {
    push('gaining', 2, 'exercise', 'scale',
      ar ? 'الوزن بيزيد' : 'Weight is climbing',
      ar
        ? 'خط الاتجاه طالع ' + trend.kgPerWeek.toFixed(2) + ' كجم في الأسبوع رغم الصيام. '
          + 'الصيام بينظّم التوقيت مش الكمية — لو السعرات في النافذة أعلى من احتياجك '
          + 'هتزيد برضه. سجّل ماكروز وجبتك أسبوع وهتشوف الفجوة.'
        : 'The smoothed line is up ' + trend.kgPerWeek.toFixed(2) + ' kg a week despite fasting. '
          + 'Fasting controls timing, not amount — if the window exceeds your needs you '
          + 'still gain. Log macros for a week and the gap will show.');
  }

  /* --- 3. Calorie floor ------------------------------------------------ */
  var days = completeCalorieDays(10);
  if (days.length >= 3 && bmr.value) {
    var sum = 0;
    for (var i = 0; i < days.length; i++) sum += days[i].cal;
    var avg = sum / days.length;
    if (avg < bmr.value * 1.05) {
      push('calorie_floor', 1, 'warn', 'trendDown',
        ar ? 'أكلك تحت أيض الراحة' : 'Intake is below your resting burn',
        ar
          ? 'متوسط أكلك ' + Math.round(avg) + ' سعرة في اليوم على ' + days.length + ' أيام '
            + 'مسجّلة كاملة، وأيض الراحة عندك ' + bmr.value + '. الأكل تحت أيض الراحة '
            + 'باستمرار بينزّل هرمونات الغدة الدرقية ويقلل الحركة التلقائية، فالعجز '
            + 'بيتآكل من نفسه. المدى المنطقي ليك ' + Math.round(bmr.value * 1.15) + '-'
            + Math.round((tdee.value || bmr.value * 1.55) - 400) + ' سعرة في نافذتك.'
          : 'You are averaging ' + Math.round(avg) + ' kcal across ' + days.length
            + ' fully-logged days, against a resting burn of ' + bmr.value + '. Sitting '
            + 'under resting burn suppresses thyroid output and spontaneous movement, so '
            + 'the deficit erodes itself. A sane range is '
            + Math.round(bmr.value * 1.15) + '-'
            + Math.round((tdee.value || bmr.value * 1.55) - 400) + ' kcal in your window.');
    }
  }

  /* --- 4. Protein in one sitting --------------------------------------- */
  if (target.grams >= 100) {
    push('protein_split', 2, 'good', 'meals',
      ar ? 'قسّم البروتين على جرعتين' : 'Split the protein in two',
      ar
        ? 'هدفك ' + target.grams + ' جم بروتين، ونافذتك ساعات قليلة. الجسم بيستفيد '
          + 'أحسن لما الكمية تتقسم: وجبة أساسية فيها ' + Math.round(target.grams * 0.6)
          + ' جم، وبعدها بساعة ونص جرعة تانية ' + Math.round(target.grams * 0.4) + ' جم '
          + '(زبادي يوناني، تونة، واي). ده كمان بيريّح المعدة بعد صيام طويل.'
        : 'Your target is ' + target.grams + 'g in a short window. It lands better split: '
          + 'a main plate of about ' + Math.round(target.grams * 0.6) + 'g, then '
          + Math.round(target.grams * 0.4) + 'g ninety minutes later (Greek yoghurt, tuna, '
          + 'whey). It is also far easier on the gut after a long fast.');
  }

  /* --- 5. Intensity distribution --------------------------------------- */
  if (load.avgPct !== null && load.total >= 3) {
    if (load.hard >= load.total * 0.6) {
      push('intensity', 2, 'exercise', 'cycle',
        ar ? 'كل تمارينك عنيفة' : 'Everything is a hard session',
        ar
          ? load.hard + ' من ' + load.total + ' تمارينك في المنطقة العنيفة '
            + '(متوسط ' + Math.round(load.avgPct * 100) + '٪ من سقف نبضك). '
            + 'الشغل ده بيرفع الكورتيزول ويأخر الاستشفاء، خصوصاً وإنت صايم وبتنام قليل. '
            + 'التقسيم اللي بيشتغل: ٨٠٪ من وقتك في نبض هادي تقدر تتكلم فيه، و١-٢ جلسة '
            + 'عنيفة بس في الأسبوع. الهادي هو اللي بيبني القاعدة الهوائية ويحرق دهون أكتر.'
          : load.hard + ' of ' + load.total + ' sessions sat in the hard zone (averaging '
            + Math.round(load.avgPct * 100) + '% of your ceiling). That raises cortisol and '
            + 'delays recovery, more so while fasted and short on sleep. The split that '
            + 'works: 80% of your time at a pace you can hold a conversation in, and one or '
            + 'two hard sessions a week. The easy volume is what builds the aerobic base.');
    }
  }

  /* --- 6. Recovery: late training, short sleep, stimulants ------------- */
  if (load.late >= 2 && sleepH !== null && sleepH < 7) {
    push('late_sleep', 1, 'warn', 'moon',
      ar ? 'بتتمرن بالليل وبتنام قليل' : 'Late training on short sleep',
      ar
        ? 'متوسط نومك ' + sleepH.toFixed(1) + ' ساعة، و' + load.late + ' تمرين بدأوا بعد '
          + 'الساعة ٩ بالليل. التمرين العنيف بيرفع حرارة الجسم والنبض ويأخر النوم ساعة '
          + 'لساعتين، وقلة النوم بترفع الجريلين فتصحى جعان أكتر وتلاقي الالتزام أصعب. '
          + 'لو التمرين بالليل مفيش منه فكاك، خلي الجلسات العنيفة بدري في اليوم وسيب '
          + 'الليل للمشي.'
        : 'You are averaging ' + sleepH.toFixed(1) + ' hours of sleep with ' + load.late
          + ' sessions starting after 21:00. Hard training raises core temperature and heart '
          + 'rate and pushes sleep back an hour or two, and short sleep raises ghrelin, so '
          + 'you wake hungrier and find the fast harder. If evening training is fixed, move '
          + 'the hard sessions earlier and leave the night for walking.');
  } else if (sleepH !== null && sleepH < 6.5) {
    push('short_sleep', 2, 'warn', 'moon',
      ar ? 'النوم قليل' : 'Sleep is short',
      ar
        ? 'متوسط ' + sleepH.toFixed(1) + ' ساعة. تحت ٧ ساعات، الجسم بيميل يخسر عضل بدل '
          + 'دهون في العجز، والجوع بيزيد. النوم هنا مش رفاهية — هو جزء من الخطة.'
        : 'Averaging ' + sleepH.toFixed(1) + ' hours. Under seven, a deficit tilts toward '
          + 'losing muscle rather than fat, and appetite rises. Sleep is part of the plan '
          + 'here, not a luxury.');
  }

  /* --- 7. Breaking a long fast on sugar -------------------------------- */
  var meals = S.get('meals', []);
  var sugary = 0;
  for (var mi = 0; mi < meals.length; mi++) {
    if (Date.now() - meals[mi].ts > 14 * 86400000) continue;
    var carbs = (meals[mi].c || 0) * (meals[mi].portions || 1);
    var prot = (meals[mi].p || 0) * (meals[mi].portions || 1);
    if (carbs >= 35 && prot < 10) sugary++;
  }
  if (sugary >= 2) {
    push('refeed_order', 2, 'warn', 'meals',
      ar ? 'ترتيب الأكل بعد الصيام' : 'The order you break the fast in',
      ar
        ? 'سجّلت ' + sugary + ' صنف عالي الكارب وقليل البروتين آخر أسبوعين. بعد ٢٠ ساعة '
          + 'صيام، حساسية الإنسولين بتبقى عالية — وده سلاح ذو حدين: نفس الحتة الحلوة '
          + 'بتعمل قفزة أعنف من المعتاد وبعدها هبوط وجوع. الترتيب بيفرق أكتر من الامتناع: '
          + 'بروتين وسلطة الأول، والحلو في آخر الوجبة لو ناوي عليه.'
        : 'You logged ' + sugary + ' high-carb, low-protein items in the last fortnight. '
          + 'After 20 fasted hours insulin sensitivity is high, which cuts both ways: the '
          + 'same dessert spikes harder and drops you further afterwards. Order matters more '
          + 'than abstinence — protein and salad first, sweets at the end if at all.');
  }

  /* --- 8. Electrolytes on long fasts ----------------------------------- */
  var cf = S.get('currentFast', {});
  if (cf.active) {
    var hoursNow = fastElapsed(cf) / 3600000;
    var el = electrolytesToday();
    if (hoursNow >= 16 && (el.sodium || 0) < ELECTROLYTE_TARGETS.sodium * 0.4) {
      push('sodium', 1, 'warn', 'flame',
        ar ? 'الصوديوم ناقص وإنت في ساعة ' + Math.floor(hoursNow) : 'Sodium is low at hour ' + Math.floor(hoursNow),
        ar
          ? 'مسجّل ' + (el.sodium || 0) + ' مجم صوديوم النهاردة. أثناء الصيام الإنسولين '
            + 'بينزل، والكلى بتطرد صوديوم أسرع — وده سبب أغلب الصداع والدوخة والتقلصات، '
            + 'مش الجوع. نص ملعقة ملح في مياه دلوقتي هتفرق خلال نص ساعة.'
          : 'You have logged ' + (el.sodium || 0) + ' mg of sodium today. Fasting lowers '
            + 'insulin and the kidneys dump sodium faster — that, not hunger, is behind most '
            + 'fasting headaches, dizziness and cramps. Half a teaspoon of salt in water now '
            + 'shows up within thirty minutes.');
    }
  }

  /* --- 9. Fibre and micronutrients on OMAD ----------------------------- */
  if (S.get('settings.plan', 'custom') === 'omad' || S.get('settings.defaultGoal', 20) >= 20) {
    push('fibre', 3, 'good', 'leaf',
      ar ? 'الخضار مش رفاهية في وجبة واحدة' : 'Vegetables are not optional on one meal',
      ar
        ? 'وجبة واحدة معناها فرصة واحدة للألياف والميكرو. استهدف نص الطبق خضار متنوعة '
          + 'الألوان — الألياف بتبطّئ امتصاص السكر، وبتغذّي بكتيريا القولون اللي '
          + 'بتضعف مع الصيام الطويل المتكرر.'
        : 'One meal is one chance at fibre and micronutrients. Aim for half the plate as '
          + 'mixed-colour vegetables — fibre blunts the glucose curve and feeds the gut '
          + 'bacteria that thin out on repeated long fasts.');
  }

  out.sort(function (a, b) { return a.priority - b.priority; });
  return out;
}

/* ---------------------------------------------------------------------
 * Adaptive coaching — phase + how the user actually feels
 * ------------------------------------------------------------------- */

/**
 * Coach cards for the current phase.
 *
 * This used to take a self-reported mood, energy and hunger reading and
 * branch on it. That input is gone: a 1-5 slider is a worse signal than the
 * measurements the app now holds, and it was being answered after eating —
 * when energy is high and hunger low for reasons that say nothing about the
 * fast. Resting-heart-rate baseline, sleep and training load carry the same
 * job and are measured rather than guessed.
 */
function coachAdvice(hours, fasting) {
  var ar = isRTL();
  var idx = phaseIndexFor(hours);
  var out = [];

  out.push({
    tone: 'good',
    icon: 'sparkles',
    title: t('analysis') + ' — ' + (ar ? COACH_AR : COACH_EN)[idx].title,
    text: (ar ? COACH_AR : COACH_EN)[idx].text
  });

  out.push({
    tone: 'exercise',
    icon: 'run',
    title: t('exercise_rec'),
    text: (ar ? EXERCISE_AR : EXERCISE_EN)[idx]
  });

  if (fasting && hours >= 48) {
    out.push({
      tone: 'warn', icon: 'shield', title: '48h+',
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
        tone: 'warn', icon: 'pill', title: ar ? 'جرعة مكررة النهاردة' : 'Doubled dose today',
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
    icon: 'coffee',
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
    var win = effectiveWindow();
    var ws = parseHHMM(win.start, 17);
    var we = parseHHMM(win.end, 21);
    var startMin = ws.h * 60 + ws.mn;
    var endMin = we.h * 60 + we.mn;
    if (nowMin >= startMin && nowMin <= endMin && hours >= 16) {
      out.push({
        tone: 'good', icon: 'meals', title: ar ? 'نافذة الأكل بتاعتك' : 'Your eating window',
        text: ar
          ? 'إنت جوه نافذة الأكل (' + win.start + ' - ' + win.end + ') وكملت '
            + Math.floor(hours) + ' ساعة. '
            + 'ابدأ ببروتين وسلطة قبل أي كارب — الترتيب ده بيقلل قفزة الإنسولين بعد صيام طويل.'
          : 'You are inside your eating window (' + win.start + ' - ' + win.end + ') at hour '
            + Math.floor(hours) + '. '
            + 'Start with protein and salad before any carbs — that order blunts the insulin spike after a long fast.'
      });
    }
  }

  return out;
}

/* ---------------------------------------------------------------------
 * Daily series for the dashboard
 *
 * Every tile and every detail chart reads from here, so a metric is drawn the
 * same way wherever it appears. Missing days stay null rather than zero: a day
 * with no reading is not a day with a reading of nothing.
 * ------------------------------------------------------------------- */

/** The last `n` calendar days, oldest first. */
function lastDays(n) {
  var out = [];
  for (var d = n - 1; d >= 0; d--) {
    var ts = startOfDay(Date.now() - d * 86400000);
    out.push({ ts: ts, key: dayKey(ts), label: String(new Date(ts).getDate()) });
  }
  return out;
}

/** Fasted hours credited to the day each fast ended on. */
function seriesFastHours(n) {
  // Merged, so a duplicated record cannot push a day past 24 hours.
  var merged = mergedFastIntervals();
  var byDay = {};
  var i;
  for (i = 0; i < merged.length; i++) {
    var k = dayKey(merged[i][1]);
    byDay[k] = (byDay[k] || 0) + (merged[i][1] - merged[i][0]) / 3600000;
  }
  var days = lastDays(n), values = [], labels = [];
  for (i = 0; i < days.length; i++) {
    values.push(byDay[days[i].key] === undefined ? null : Math.round(byDay[days[i].key] * 10) / 10);
    labels.push(days[i].label);
  }
  return { values: values, labels: labels, days: days };
}

/** Any numeric field off the Health Connect daily rows. */
function seriesHealth(field, n) {
  var rows = S.get('healthDays', []);
  var byDay = {};
  var i;
  for (i = 0; i < rows.length; i++) {
    var parts = rows[i].date.split('-');
    if (parts.length !== 3) continue;
    var k = parts[0] + '-' + pad2(parseInt(parts[1], 10)) + '-' + pad2(parseInt(parts[2], 10));
    if (rows[i][field] !== null && rows[i][field] !== undefined) byDay[k] = rows[i][field];
  }
  var days = lastDays(n), values = [], labels = [];
  for (i = 0; i < days.length; i++) {
    values.push(byDay[days[i].key] === undefined ? null : byDay[days[i].key]);
    labels.push(days[i].label);
  }
  return { values: values, labels: labels, days: days };
}

/** Weight, carried forward so the line is continuous between weigh-ins. */
function seriesWeight(n) {
  var log = S.get('profile.weightLog', []);
  var days = lastDays(n), values = [], labels = [];
  var i, j;
  for (i = 0; i < days.length; i++) {
    var latest = null;
    for (j = 0; j < log.length; j++) {
      if (log[j].ts <= days[i].ts + 86399999) latest = log[j].kg;
    }
    values.push(latest);
    labels.push(days[i].label);
  }
  return { values: values, labels: labels, days: days };
}

/** Most recent non-null entry of a series. */
function lastValue(series) {
  for (var i = series.values.length - 1; i >= 0; i--) {
    if (series.values[i] !== null && series.values[i] !== undefined) return series.values[i];
  }
  return null;
}

/** Mean of the non-null entries. */
function meanValue(series) {
  var sum = 0, n = 0;
  for (var i = 0; i < series.values.length; i++) {
    var v = series.values[i];
    if (v === null || v === undefined) continue;
    sum += v; n++;
  }
  return n ? sum / n : null;
}

/** Colour per metric, used by both the tile and its detail view. */
/**
 * Chart and tile hues, one per metric.
 *
 * These are data colours: they appear inside charts and tiles, never on a
 * control. Two of them used to break that: `fast` carried the old brand red
 * that is no longer in the theme at all, and `hr` was byte-identical to
 * --danger, so a heart-rate line and a delete button were literally the same
 * colour. Heart rate keeps a red — that reading is conventional and it only
 * ever appears in a chart — but a visibly different one.
 */
var METRIC_COLORS = {
  fast: '#8b5cf6',
  steps: '#00d97e',
  sleep: '#a259ff',
  hr: '#f43f5e',
  protein: '#f5a623',
  water: '#3d8bfd',
  weight: '#00bcd4',
  electrolytes: '#f5a623'
};

/* ---------------------------------------------------------------------
 * Protein target
 * ------------------------------------------------------------------- */

/**
 * Daily protein target.
 *
 * Lean mass is the better basis when a body scan exists — protein needs track
 * muscle, not total weight, and using bodyweight overshoots at higher body fat.
 * OMAD makes this the hardest number to hit, which is why it gets its own
 * tracker rather than sitting inside a macro row.
 * @return { grams, basis, perKg }
 */
function proteinTarget() {
  var perKg = parseFloat(S.get('settings.proteinPerKgLean', 2.0)) || 2.0;
  var ffm = fatFreeMass();
  if (ffm) return { grams: Math.round(ffm.kg * perKg), basis: 'lean', perKg: perKg };
  var kg = S.get('profile.weight', 0);
  if (!kg) return { grams: 0, basis: 'none', perKg: perKg };
  // Without a scan, 1.6 g/kg of bodyweight is the conservative equivalent.
  return { grams: Math.round(kg * 1.6), basis: 'weight', perKg: 1.6 };
}

/** Today's totals across logged meals, with unknown macros counted separately. */
function todayMacros() {
  var todayKey = dayKey(Date.now());
  var all = S.get('meals', []);
  var tot = { cal: 0, p: 0, c: 0, f: 0, unknown: 0, count: 0 };
  for (var i = 0; i < all.length; i++) {
    var it = all[i];
    if (dayKey(it.ts) !== todayKey) continue;
    var mult = it.portions || 1;
    tot.count++;
    if (it.cal === null || it.cal === undefined) tot.unknown++;
    tot.cal += (it.cal || 0) * mult;
    tot.p += (it.p || 0) * mult;
    tot.c += (it.c || 0) * mult;
    tot.f += (it.f || 0) * mult;
  }
  return tot;
}

/* ---------------------------------------------------------------------
 * Electrolytes
 * ------------------------------------------------------------------- */

/** Daily targets in mg. Higher than ordinary guidance, by design: an extended
 *  fast excretes sodium fast, and that is what causes the headaches. */
var ELECTROLYTE_TARGETS = { sodium: 4000, potassium: 2000, magnesium: 350 };

var ELECTROLYTE_SOURCES = [
  { k: 'salt_quarter', ar: 'ربع ملعقة ملح', en: '1/4 tsp salt', sodium: 575, potassium: 0, magnesium: 0 },
  { k: 'salt_half', ar: 'نص ملعقة ملح', en: '1/2 tsp salt', sodium: 1150, potassium: 0, magnesium: 0 },
  { k: 'lite_salt', ar: 'ملعقة ملح بوتاسيوم', en: '1 tsp potassium salt', sodium: 300, potassium: 900, magnesium: 0 },
  { k: 'broth', ar: 'كوب مرق عظام', en: 'Cup of bone broth', sodium: 600, potassium: 250, magnesium: 15 },
  { k: 'mag_supp', ar: 'كبسولة مغنيسيوم', en: 'Magnesium capsule', sodium: 0, potassium: 0, magnesium: 200 },
  { k: 'electrolyte_mix', ar: 'كيس إلكتروليت', en: 'Electrolyte sachet', sodium: 1000, potassium: 200, magnesium: 60 }
];

function electrolytesToday() {
  var e = S.get('electrolytes', {});
  var today = dayKey(Date.now());
  if (e.date !== today) {
    e = { date: today, sodium: 0, potassium: 0, magnesium: 0 };
    S.set('electrolytes', e);
  }
  return e;
}

function addElectrolytes(src) {
  var e = electrolytesToday();
  e.sodium += src.sodium || 0;
  e.potassium += src.potassium || 0;
  e.magnesium += src.magnesium || 0;
  S.set('electrolytes', e);
}

/* ---------------------------------------------------------------------
 * Fasting plans
 * ------------------------------------------------------------------- */

var FASTING_PLANS = [
  { k: 'custom', ar: 'مخصص', en: 'Custom', goal: 0, window: null, days: null },
  { k: '16_8', ar: '16:8', en: '16:8', goal: 16, window: ['13:00', '21:00'], days: null },
  { k: '18_6', ar: '18:6', en: '18:6', goal: 18, window: ['15:00', '21:00'], days: null },
  { k: '20_4', ar: '20:4', en: '20:4', goal: 20, window: ['17:00', '21:00'], days: null },
  { k: 'omad', ar: 'وجبة واحدة', en: 'OMAD', goal: 23, window: ['18:00', '19:00'], days: null },
  // 0 = Sunday. Two fasting days a week, the classic 5:2 split.
  { k: '5_2', ar: '5:2', en: '5:2', goal: 24, window: ['18:00', '21:00'], days: [1, 4] },
  { k: 'adf', ar: 'يوم بيوم', en: 'Alternate day', goal: 36, window: ['18:00', '21:00'], days: [0, 2, 4] }
];

function planByKey(k) {
  for (var i = 0; i < FASTING_PLANS.length; i++) {
    if (FASTING_PLANS[i].k === k) return FASTING_PLANS[i];
  }
  return FASTING_PLANS[0];
}

function applyPlan(k) {
  var p = planByKey(k);
  S.set('settings.plan', k);
  if (p.goal) {
    S.set('settings.defaultGoal', p.goal);
    S.set('currentFast.goal', p.goal);
  }
  if (p.window) {
    S.set('settings.windowStart', p.window[0]);
    S.set('settings.windowEnd', p.window[1]);
  }
  return p;
}

/**
 * Adherence over the last 14 days: of the days the plan asks you to fast, how
 * many actually have a completed fast. A plan with no fixed days counts every
 * day as a target.
 */
function planAdherence() {
  var p = planByKey(S.get('settings.plan', 'custom'));
  if (p.k === 'custom') return null;
  var hist = S.get('history', []);
  var done = {};
  for (var i = 0; i < hist.length; i++) {
    if (hist[i].completed) done[dayKey(hist[i].end || hist[i].start)] = true;
  }
  var target = 0, hit = 0;
  for (var d = 13; d >= 0; d--) {
    var ts = startOfDay(Date.now() - d * 86400000);
    var dow = new Date(ts).getDay();
    if (p.days && p.days.indexOf(dow) < 0) continue;
    target++;
    if (done[dayKey(ts)]) hit++;
  }
  if (!target) return null;
  return { plan: p, target: target, hit: hit, pct: Math.round(hit / target * 100) };
}

/* ---------------------------------------------------------------------
 * Week over week
 * ------------------------------------------------------------------- */

function sumRange(fromTs, toTs) {
  var hist = S.get('history', []);
  var days = S.get('healthDays', []);
  var out = { fastMs: 0, sessions: 0, steps: 0, stepDays: 0, sleepMs: 0, sleepDays: 0 };
  var i;
  for (i = 0; i < hist.length; i++) {
    var end = hist[i].end || hist[i].start;
    if (end < fromTs || end >= toTs) continue;
    out.fastMs += hist[i].duration || 0;
    out.sessions++;
  }
  for (i = 0; i < days.length; i++) {
    var ts = new Date(days[i].date + 'T12:00:00').getTime();
    if (isNaN(ts) || ts < fromTs || ts >= toTs) continue;
    if (days[i].steps) { out.steps += days[i].steps; out.stepDays++; }
    if (days[i].sleepMs) { out.sleepMs += days[i].sleepMs; out.sleepDays++; }
  }
  return out;
}

/** This week against the one before it, as deltas rather than raw numbers. */
function weekCompare() {
  var now = Date.now();
  var weekMs = 7 * 86400000;
  var cur = sumRange(now - weekMs, now + 1);
  var prev = sumRange(now - 2 * weekMs, now - weekMs);

  function avg(total, n) { return n ? total / n : 0; }

  var weights = S.get('profile.weightLog', []);
  var wCur = null, wPrev = null;
  for (var i = weights.length - 1; i >= 0; i--) {
    if (wCur === null && weights[i].ts >= now - weekMs) wCur = weights[i].kg;
    if (wPrev === null && weights[i].ts < now - weekMs) { wPrev = weights[i].kg; break; }
  }

  return {
    fastHours: { cur: cur.fastMs / 3600000, prev: prev.fastMs / 3600000 },
    sessions: { cur: cur.sessions, prev: prev.sessions },
    avgFast: { cur: avg(cur.fastMs, cur.sessions), prev: avg(prev.fastMs, prev.sessions) },
    steps: { cur: avg(cur.steps, cur.stepDays), prev: avg(prev.steps, prev.stepDays) },
    sleep: { cur: avg(cur.sleepMs, cur.sleepDays), prev: avg(prev.sleepMs, prev.sleepDays) },
    weight: { cur: wCur, prev: wPrev },
    hasPrev: prev.sessions > 0 || prev.stepDays > 0
  };
}

/* ---------------------------------------------------------------------
 * Insight history
 *
 * Advice repeated verbatim every day is wallpaper. Recording what was
 * raised, and when, lets the coach do the thing that separates coaching
 * from a rule engine: come back later and say whether it worked.
 * ------------------------------------------------------------------- */

/** Remembers today's top insights so their effect can be checked later. */
function recordInsights(list) {
  var log = S.get('insightLog', []);
  var today = dayKey(Date.now());
  var seen = {};
  var i;
  for (i = 0; i < log.length; i++) {
    if (dayKey(log[i].ts) === today) seen[log[i].id] = true;
  }
  var added = 0;
  for (i = 0; i < list.length && i < 3; i++) {
    if (seen[list[i].id]) continue;
    log.push({
      id: list[i].id,
      ts: Date.now(),
      title: list[i].title,
      metric: list[i].metric === undefined ? null : list[i].metric
    });
    added++;
  }
  // A year of entries is plenty; older ones cannot be followed up usefully.
  if (log.length > 400) log = log.slice(log.length - 400);
  if (added) S.set('insightLog', log);
  return added;
}

/**
 * Insights that describe a correctable state, as opposed to standing advice
 * that stays true no matter what the user does. Only the former can be
 * reported back as resolved.
 */
var CORRECTABLE_INSIGHTS = {
  resistance: true, loss_rate: true, gaining: true, calorie_floor: true,
  intensity: true, late_sleep: true, short_sleep: true, refeed_order: true,
  sodium: true
};

/**
 * Insights raised at least a week ago that no longer appear, phrased as a
 * follow-up rather than a fresh warning.
 * @return {Array<{title:string, text:string, improved:boolean}>}
 */
function insightFollowUps() {
  var ar = isRTL();
  var log = S.get('insightLog', []);
  var out = [];
  var current = {};
  var live = expertInsights();
  var i;
  for (i = 0; i < live.length; i++) current[live[i].id] = live[i];

  var seen = {};
  for (i = log.length - 1; i >= 0; i--) {
    var e = log[i];
    var age = Date.now() - e.ts;
    if (age < 7 * 86400000 || age > 60 * 86400000) continue;
    if (seen[e.id]) continue;
    seen[e.id] = true;
    if (current[e.id]) continue;               // still true — not a follow-up yet
    if (!CORRECTABLE_INSIGHTS[e.id]) continue; // standing advice never "resolves"

    var days = Math.round(age / 86400000);
    out.push({
      id: e.id,
      improved: true,
      title: ar ? 'اتحسّن: ' + e.title : 'Resolved: ' + e.title,
      text: ar
        ? 'نبّهتك على ده من ' + days + ' يوم، ودلوقتي مبقاش ظاهر في أرقامك. '
          + 'ده اللي إحنا عايزينه — كمّل على نفس الشغل.'
        : 'Raised ' + days + ' days ago and no longer showing in your numbers. '
          + 'That is the outcome we wanted — keep doing what changed it.'
    });
    if (out.length >= 2) break;
  }
  return out;
}

/* ---------------------------------------------------------------------
 * Planned refeed days
 *
 * A deliberate break is part of any long protocol; the app used to record
 * it identically to a failure, which punished the correct decision.
 * ------------------------------------------------------------------- */

function plannedBreaks() {
  return S.get('plannedBreaks', []);
}

function isPlannedBreak(ts) {
  var key = dayKey(ts);
  var list = plannedBreaks();
  for (var i = 0; i < list.length; i++) if (list[i] === key) return true;
  return false;
}

/** Toggles a day's planned-break flag. @return the new state. */
function togglePlannedBreak(ts) {
  var key = dayKey(ts);
  var list = plannedBreaks().slice();
  var idx = list.indexOf(key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(key);
  S.set('plannedBreaks', list);
  return idx < 0;
}

/* ---------------------------------------------------------------------
 * Heart rate against fasting
 * ------------------------------------------------------------------- */

/**
 * Pairs each day's resting heart rate with how many hours were fasted that
 * day. Falls back to per-session average HR when no resting data exists, so
 * the chart still says something for a band-only user.
 * @return { points: [{h, bpm, date}], source }
 */
function hrVsFasting() {
  var days = S.get('healthDays', []);
  var hist = S.get('history', []);
  var byDay = {};
  var i;
  for (i = 0; i < hist.length; i++) {
    var k = dayKey(hist[i].end || hist[i].start);
    byDay[k] = (byDay[k] || 0) + (hist[i].duration || 0) / 3600000;
  }

  var points = [];
  for (i = 0; i < days.length; i++) {
    if (!days[i].restingHr) continue;
    var iso = days[i].date;
    var parts = iso.split('-');
    var key = parts[0] + '-' + pad2(parseInt(parts[1], 10)) + '-' + pad2(parseInt(parts[2], 10));
    points.push({ h: byDay[key] || 0, bpm: days[i].restingHr, date: iso });
  }
  if (points.length >= 3) return { points: points, source: 'resting' };

  points = [];
  for (i = 0; i < hist.length; i++) {
    if (!hist[i].avgHr) continue;
    points.push({
      h: (hist[i].duration || 0) / 3600000,
      bpm: hist[i].avgHr,
      date: dayKey(hist[i].end || hist[i].start)
    });
  }
  return { points: points, source: 'session' };
}

/* ---------------------------------------------------------------------
 * Sleep estimated by the phone
 * ------------------------------------------------------------------- */

/**
 * Folds phone-estimated sleep blocks into the daily rows, but never over a
 * figure that came from Health Connect — a wrist sensor beats stillness.
 */
function applySleepEstimate(blocks) {
  if (!blocks || !blocks.length) return 0;
  var days = S.get('healthDays', []);
  var index = {};
  var i;
  for (i = 0; i < days.length; i++) index[days[i].date] = i;

  var added = 0;
  for (i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (!b.start || !b.end || b.end <= b.start) continue;
    // A block is credited to the morning it ended on.
    var d = new Date(b.end);
    var iso = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    var ms = b.end - b.start;
    if (index[iso] === undefined) {
      days.push({ date: iso, sleepMs: ms, sleepSource: 'phone' });
      index[iso] = days.length - 1;
      added++;
    } else {
      var row = days[index[iso]];
      if (!row.sleepMs || row.sleepSource === 'phone') {
        row.sleepMs = ms;
        row.sleepSource = 'phone';
        added++;
      }
    }
  }
  days.sort(function (a, b2) { return a.date < b2.date ? -1 : 1; });
  S.set('healthDays', days);
  return added;
}

/* ---------------------------------------------------------------------
 * Automatic backup
 * ------------------------------------------------------------------- */

/** Writes a JSON snapshot to app storage at most once a week. */
function maybeAutoBackup() {
  if (!N.ok()) return null;
  if (!S.get('settings.autoBackup', true)) return null;
  var last = S.get('backup.lastAt', 0);
  if (Date.now() - last < 7 * 86400000) return null;
  var name = 'sayem-auto-' + dayKey(Date.now()) + '.json';
  var path = N.call('saveExport', name, exportJson());
  S.set('backup', { lastAt: Date.now(), lastPath: path || '' });
  return path;
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
 * Ramadan mode
 *
 * For a month every year the eating window is not a setting — it is dawn and
 * sunset, and it moves a little every day. Rather than make the user edit two
 * times each evening, the window is computed from the sun's position for
 * their coordinates.
 *
 * The maths is the standard NOAA solar-position approximation, accurate to
 * well under a minute for this purpose. Fajr and isha are defined by solar
 * depression angles below the horizon, and the angle depends on the
 * convention a region follows; Egypt uses the Egyptian General Authority of
 * Survey's 19.5°/17.5°, which is what the default reflects.
 * ------------------------------------------------------------------- */

var SUN_CONVENTIONS = {
  egypt: { fajr: 19.5, isha: 17.5, ar: 'الهيئة المصرية العامة للمساحة', en: 'Egyptian General Authority of Survey' },
  mwl: { fajr: 18, isha: 17, ar: 'رابطة العالم الإسلامي', en: 'Muslim World League' },
  makkah: { fajr: 18.5, isha: 18, ar: 'أم القرى', en: 'Umm al-Qura' },
  isna: { fajr: 15, isha: 15, ar: 'إسنا (أمريكا الشمالية)', en: 'ISNA (North America)' }
};

// Alexandria. A sensible default beats an empty field, and the user can move it.
var DEFAULT_COORDS = { lat: 31.2001, lon: 29.9187 };

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

/**
 * Sun times for one local day.
 *
 * Works in Julian days and returns local wall-clock hours, taking the
 * device's own UTC offset so it stays correct wherever the phone is.
 *
 * @return {{fajr:number, sunrise:number, maghrib:number, isha:number}|null}
 *         hours after local midnight, or null above the polar circles where
 *         a depression angle may never be reached.
 */
function sunTimes(date, lat, lon, conv) {
  var angles = SUN_CONVENTIONS[conv] || SUN_CONVENTIONS.egypt;
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var julian = Math.floor(d.getTime() / 86400000 + 2440587.5);
  var n = julian - 2451545.0 + 0.0008;

  var meanSolarNoon = n - lon / 360;
  var meanAnomaly = (357.5291 + 0.98560028 * meanSolarNoon) % 360;
  var center = 1.9148 * Math.sin(toRad(meanAnomaly))
    + 0.02 * Math.sin(toRad(2 * meanAnomaly))
    + 0.0003 * Math.sin(toRad(3 * meanAnomaly));
  var eclipticLon = (meanAnomaly + center + 180 + 102.9372) % 360;
  var solarTransit = 2451545.0 + meanSolarNoon + 0.0053 * Math.sin(toRad(meanAnomaly))
    - 0.0069 * Math.sin(toRad(2 * eclipticLon));
  var declination = Math.asin(Math.sin(toRad(eclipticLon)) * Math.sin(toRad(23.44)));

  // Hour angle for a given depression below the horizon, in days.
  function hourAngle(depression) {
    var cosH = (Math.sin(toRad(-depression)) - Math.sin(toRad(lat)) * Math.sin(declination))
      / (Math.cos(toRad(lat)) * Math.cos(declination));
    if (cosH > 1 || cosH < -1) return null;   // never reached at this latitude
    return toDeg(Math.acos(cosH)) / 360;
  }

  var offsetHours = -d.getTimezoneOffset() / 60;
  function localHours(julianDay) {
    if (julianDay === null) return null;
    var h = (julianDay - Math.floor(julianDay) - 0.5) * 24 + offsetHours;
    return ((h % 24) + 24) % 24;
  }

  // -0.833° accounts for refraction and the sun's own radius at the horizon.
  var hSun = hourAngle(0.833);
  var hFajr = hourAngle(angles.fajr);
  var hIsha = hourAngle(angles.isha);
  if (hSun === null) return null;

  return {
    fajr: hFajr === null ? null : localHours(solarTransit - hFajr),
    sunrise: localHours(solarTransit - hSun),
    maghrib: localHours(solarTransit + hSun),
    isha: hIsha === null ? null : localHours(solarTransit + hIsha)
  };
}

/**
 * The eating window actually in force, which is the Ramadan one when that
 * mode is on and the stored setting otherwise. Everything that reminds,
 * advises or displays reads this rather than the raw setting, so turning
 * Ramadan mode on moves all of it at once.
 *
 * @return {{start:string, end:string, source:string}}
 */
function effectiveWindow() {
  var ram = ramadanWindow();
  if (ram) return { start: ram.start, end: ram.end, source: 'ramadan' };
  return {
    start: S.get('settings.windowStart', '17:00'),
    end: S.get('settings.windowEnd', '21:00'),
    source: 'manual'
  };
}

function hoursToHHMM(h) {
  if (h === null || h === undefined) return '';
  var total = Math.round(h * 60);
  return pad2(Math.floor(total / 60) % 24) + ':' + pad2(total % 60);
}

/**
 * Today's eating window under Ramadan mode: iftar at maghrib, suhoor ending
 * at fajr. Returns null when the mode is off or the location is unusable.
 *
 * @return {{start:string, end:string, fastHours:number,
 *           maghrib:string, fajr:string}|null}
 */
function ramadanWindow(when) {
  if (!S.get('settings.ramadan', false)) return null;
  var lat = parseFloat(S.get('settings.lat', DEFAULT_COORDS.lat));
  var lon = parseFloat(S.get('settings.lon', DEFAULT_COORDS.lon));
  if (isNaN(lat) || isNaN(lon)) return null;

  var now = when ? new Date(when) : new Date();
  var today = sunTimes(now, lat, lon, S.get('settings.sunConvention', 'egypt'));
  if (!today || today.maghrib === null) return null;

  // Suhoor ends at the next dawn, which belongs to tomorrow's solar day.
  var tomorrow = sunTimes(new Date(now.getTime() + 86400000), lat, lon,
    S.get('settings.sunConvention', 'egypt'));
  var fajr = tomorrow && tomorrow.fajr !== null ? tomorrow.fajr : today.fajr;
  if (fajr === null) return null;

  var fastHours = (24 - today.maghrib) + today.sunrise;
  return {
    start: hoursToHHMM(today.maghrib),
    end: hoursToHHMM(fajr),
    maghrib: hoursToHHMM(today.maghrib),
    fajr: hoursToHHMM(fajr),
    sunrise: hoursToHHMM(today.sunrise),
    fastHours: Math.round(fastHours * 10) / 10
  };
}

/* ---------------------------------------------------------------------
 * Recovery
 *
 * Resting heart rate is the cheapest honest recovery signal there is: it
 * needs no extra logging, and it moves before the subjective feeling does.
 * The number on its own means nothing, though — 58 is excellent for one
 * person and elevated for another. What carries information is the distance
 * from that person's own settled baseline.
 * ------------------------------------------------------------------- */

/**
 * Median resting HR over an older stretch, used as the personal baseline.
 * Median rather than mean so one bad night does not move the reference.
 * The most recent `skip` days are excluded so today is compared against
 * where the body has been, not against itself.
 *
 * @return {{bpm:number, days:number}|null}
 */
function restingBaseline(skip) {
  var rows = S.get('healthDays', []);
  var cut = Date.now() - (skip || 3) * 86400000;
  var vals = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].restingHr) continue;
    var ts = Date.parse(rows[i].date);
    if (isNaN(ts) || ts > cut) continue;
    vals.push(rows[i].restingHr);
  }
  if (vals.length < 7) return null;
  vals.sort(function (a, b) { return a - b; });
  var mid = Math.floor(vals.length / 2);
  var bpm = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  return { bpm: Math.round(bpm * 10) / 10, days: vals.length };
}

/**
 * Where recovery stands right now.
 *
 * A single elevated morning is noise — travel, a late meal, a warm room.
 * Two or more consecutive mornings above baseline is the pattern worth
 * acting on, which is why `streak` gates the verdict rather than the last
 * reading alone.
 *
 * @return {{level:string, recent:number, baseline:number, delta:number,
 *           streak:number}|null} level is 'good' | 'watch' | 'strained'
 */
function recoveryStatus() {
  var base = restingBaseline(3);
  if (!base) return null;

  var rows = sortByDate(S.get('healthDays', []).slice().filter(function (r) {
    return r.restingHr && !isNaN(Date.parse(r.date));
  }));
  if (!rows.length) return null;

  var recent = [];
  for (var i = rows.length - 1; i >= 0 && recent.length < 3; i--) recent.push(rows[i].restingHr);
  if (!recent.length) return null;

  var sum = 0;
  for (var j = 0; j < recent.length; j++) sum += recent[j];
  var avg = sum / recent.length;
  var delta = avg - base.bpm;

  // Consecutive mornings sitting at least 3 bpm over baseline.
  var streak = 0;
  for (var k = rows.length - 1; k >= 0; k--) {
    if (rows[k].restingHr - base.bpm >= 3) streak++;
    else break;
  }

  var level = 'good';
  if (delta >= 5 && streak >= 2) level = 'strained';
  else if (delta >= 3 || streak >= 2) level = 'watch';

  return {
    level: level,
    recent: Math.round(avg * 10) / 10,
    baseline: base.bpm,
    delta: Math.round(delta * 10) / 10,
    streak: streak
  };
}

/* ---------------------------------------------------------------------
 * Hydration
 * ------------------------------------------------------------------- */

/**
 * Daily water goal in millilitres.
 *
 * A flat three litres is wrong in both directions — too much for a small
 * sedentary body, not nearly enough for a 96 kg one riding 20 km in an
 * Alexandrian summer. Baseline scales with bodyweight, then training and
 * heat are added as what they are: replacement for measured losses.
 *
 * @return {{ml:number, base:number, training:number, heat:number,
 *           manual:boolean}}
 */
function waterTarget() {
  var manual = parseInt(S.get('settings.waterTargetManual', 0), 10) || 0;
  var kg = parseFloat(S.get('profile.weight', 0)) || 0;

  // 35 ml/kg is the usual clinical starting point for a healthy adult.
  var base = kg ? Math.round(kg * 35) : 2500;

  // Roughly half a litre per active hour logged in the last day.
  var activeMin = 0;
  var w = S.get('workouts', []);
  for (var i = 0; i < w.length; i++) {
    if (Date.now() - w[i].ts > 86400000) continue;
    activeMin += (w[i].durationMs || 0) / 60000;
  }
  var training = Math.round(activeMin / 60 * 500);

  // A hot-climate allowance the user turns on for the summer months.
  var heat = S.get('settings.hotClimate', false) ? 500 : 0;

  var total = manual > 0 ? manual : base + training + heat;
  return {
    ml: Math.max(1500, Math.min(6000, Math.round(total / 50) * 50)),
    base: base, training: training, heat: heat, manual: manual > 0
  };
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
  var bmi = calcBMI(d.profile.weight, d.profile.height);
  L.push(t('bmi') + ': ' + (bmi === null ? '-' : bmi.toFixed(1)));
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
 * Personal analysis
 *
 * expertInsights() applies rules. This reads the record as a whole and says
 * what it means — the things you only see by looking at how the pieces sit
 * together, and the things that are wrong with the *data* rather than with
 * the person. A coach who never questions the measurements is only ever
 * coaching the measurements.
 *
 * Each section states what was observed, what it implies, and what to do.
 * Sections stay silent unless the record actually supports them.
 * ------------------------------------------------------------------- */

/**
 * A logged fast that overlaps the given range, or null.
 *
 * Nothing stopped a retroactive entry from covering hours already recorded,
 * and the totals simply added them: one 19-hour day plus a 10-hour entry
 * inside it reported 29 fasted hours out of 24. That flows into the streak,
 * the weekly chart, the comparison and the medals.
 *
 * @param exceptId the entry being edited, which cannot overlap itself
 */
function overlappingFast(start, end, exceptId) {
  var hist = S.get('history', []);
  for (var i = 0; i < hist.length; i++) {
    var e = hist[i];
    if (exceptId && e.id === exceptId) continue;
    var a = e.start, b = e.end || e.start;
    if (!a || !b) continue;
    if (start < b && end > a) return e;
  }
  var cf = S.get('currentFast', {});
  if (cf.active && cf.startTime && end > cf.startTime) {
    return { id: 'current', start: cf.startTime, end: Date.now(), running: true };
  }
  return null;
}

/** Gap in hours between consecutive fasts, oldest first. */
function fastGaps() {
  var hist = sortByTime(S.get('history', []).slice(), 'start');
  var out = [];
  for (var i = 1; i < hist.length; i++) {
    var prevEnd = hist[i - 1].end || hist[i - 1].start;
    if (!prevEnd || !hist[i].start) continue;
    out.push({ hours: (hist[i].start - prevEnd) / 3600000, at: hist[i].start });
  }
  return out;
}

/** Workouts that began within `hours` of a fast ending. */
function workoutsAfterBreaking(hours) {
  var w = S.get('workouts', []);
  var hist = S.get('history', []);
  var out = [];
  for (var i = 0; i < w.length; i++) {
    for (var j = 0; j < hist.length; j++) {
      var end = hist[j].end;
      if (!end) continue;
      var gap = (w[i].ts - end) / 3600000;
      if (gap >= 0 && gap <= (hours || 3)) { out.push({ workout: w[i], gapH: gap }); break; }
    }
  }
  return out;
}

/**
 * My reading of this particular record.
 * @return {Array<{id:string, severity:string, title:string, body:string,
 *                 action:string|null}>}
 */
function personalAnalysis() {
  var ar = isRTL();
  var out = [];
  var profile = S.get('profile', {});
  var hist = S.get('history', []);
  var body = latestBody();
  var ffm = fatFreeMass();

  function add(id, severity, title, bodyText, action) {
    out.push({ id: id, severity: severity, title: title, body: bodyText, action: action || null });
  }

  /* --- 1. What the composition actually says -------------------------- */
  if (body && body.fatPct && ffm && profile.height && profile.weight) {
    var bmi = calcBMI(profile.weight, profile.height);
    var fatKg = body.fatKg || Math.round(profile.weight * body.fatPct / 10) / 10;
    // Weight that would put him at 18% fat while keeping every kilo of lean.
    var goalKg = Math.round(ffm.kg / (1 - 0.18) * 10) / 10;
    add('composition', 'info',
      ar ? 'قراءة تركيب جسمك — الرقم المهم مش الوزن' : 'What your composition actually says',
      ar
        ? 'وزنك ' + profile.weight + ' كجم و BMI ' + bmi.toFixed(1) + '، والرقم ده لوحده '
          + 'بيحطك في خانة "سمنة درجة أولى" تقريباً. بس تركيبك بيحكي حكاية تانية: '
          + fatKg + ' كجم دهون، و' + ffm.kg + ' كجم كتلة خالية من الدهون. '
          + 'الكتلة دي كبيرة — ودي حاجة كويسة جداً، لأنها هي اللي بتحدد أيضك وبتخلي '
          + 'العجز يشتغل لصالحك. يعني مشكلتك مش إنك "تقيل"، مشكلتك إنك شايل '
          + fatKg + ' كجم دهون زيادة فوق هيكل قوي.\n\n'
          + 'لو حافظت على الـ' + ffm.kg + ' كجم دي بالكامل ونزلت للدهون لـ١٨٪، '
          + 'هتقف عند ' + goalKg + ' كجم تقريباً. ده الهدف الحقيقي — مش رقم على الميزان '
          + 'اخترته من دماغك. وكل قرار تدريب وأكل من هنا المفروض يتقاس بسؤال واحد: '
          + 'هل ده بيحمي الـ' + ffm.kg + ' كجم دي ولا بياكل منها؟'
        : 'You are ' + profile.weight + ' kg at a BMI of ' + bmi.toFixed(1) + ', which on its own '
          + 'reads as class-one obesity. Your composition says something different: '
          + fatKg + ' kg of fat over ' + ffm.kg + ' kg of fat-free mass. That fat-free figure '
          + 'is large, and that is good news — it sets your metabolic rate and it is what makes '
          + 'a deficit work in your favour. Your problem is not that you are heavy; it is that '
          + fatKg + ' kg of fat is sitting on a strong frame.\n\n'
          + 'Keep every kilo of that ' + ffm.kg + ' kg and drop to 18% fat and you land near '
          + goalKg + ' kg. That is the real target, rather than a number you picked off a scale. '
          + 'From here, every training and eating decision answers one question: does this '
          + 'protect those ' + ffm.kg + ' kg, or eat into them?',
      ar ? 'اعتبر ' + ffm.kg + ' كجم دي خط أحمر. الميزان ينزل، الرقم ده ما ينزلش.'
         : 'Treat those ' + ffm.kg + ' kg as the line you do not cross. The scale falls; that number does not.');
  }

  /* --- 2. The blind spot: no calorie data ----------------------------- */
  var loggedDays = completeCalorieDays(30).length;
  var customs = S.get('customFoods', []);
  var blankCustoms = 0;
  for (var ci = 0; ci < customs.length; ci++) {
    if (customs[ci].cal === null || customs[ci].cal === undefined) blankCustoms++;
  }
  if (loggedDays < 3) {
    add('no_intake', 'high',
      ar ? 'أكبر فجوة في بياناتك: مفيش سعرات مسجّلة' : 'The blind spot: no intake data',
      ar
        ? (loggedDays === 0
            ? 'مفيش ولا يوم واحد مسجّل بسعرات كاملة آخر شهر'
            : 'عندك ' + arCount(loggedDays, 'يوم واحد بس', 'يومين بس', 'أيام بس', 'يوم') + ' مسجّلة بسعرات كاملة آخر شهر')
          + (blankCustoms ? '، و' + arCount(blankCustoms, 'واحدة', 'اتنين', 'من أكلاتك المحفوظة', 'من أكلاتك المحفوظة')
            + (blankCustoms <= 2 ? ' من أكلاتك المحفوظة' : '') + ' متسجّلة من غير أي ماكروز' : '')
          + '. ده معناه إن نص المعادلة غايب.\n\n'
          + 'الصيام بيتحكم في **التوقيت**. الوزن بيتحكم فيه **الكمية**. إنت ماسك التوقيت '
          + 'كويس جداً — والدليل إن كل صياماتك المسجّلة وصلت لهدفها. بس من غير أرقام أكل، '
          + 'لا أنا ولا إنت نقدر نعرف إنت في عجز ولا فايض، ولا نعرف البروتين كفاية ولا لأ. '
          + 'كل نصيحة عن السعرات بعد كده هتبقى تخمين.\n\n'
          + 'وأنا مش بطلب منك تسجّل كل لقمة للأبد. اسبوع واحد بس، بصدق، وهتعرف الفجوة '
          + 'فين — وبعدها تقدر تسيبها.'
        : 'Only ' + loggedDays + ' day(s) in the last month carry complete calorie data'
          + (blankCustoms ? ', and ' + blankCustoms + ' of your saved foods have no macros at all' : '')
          + '. Half the equation is missing.\n\n'
          + 'Fasting controls **timing**. Bodyweight is controlled by **amount**. You have the '
          + 'timing handled — every logged fast of yours reached its goal. But without intake '
          + 'numbers, neither of us can tell whether you are in a deficit or a surplus, or '
          + 'whether protein is anywhere near sufficient. Every calorie recommendation after '
          + 'this is a guess.\n\n'
          + 'I am not asking you to log every bite forever. One honest week is enough to find '
          + 'the gap, and then you can stop.',
      ar ? 'سجّل ٧ أيام بالسعرات. ده أعلى عائد لأقل مجهود في التطبيق كله.'
         : 'Log seven days with calories. It is the highest-return, lowest-effort thing in the app.');
  }

  /* --- 3. The window that is not there -------------------------------- */
  var gaps = fastGaps();
  var tight = 0, shortest = null;
  for (var gi = 0; gi < gaps.length; gi++) {
    if (gaps[gi].hours < 2) tight++;
    if (shortest === null || gaps[gi].hours < shortest) shortest = gaps[gi].hours;
  }
  if (gaps.length && tight > 0) {
    add('window', 'high',
      ar ? 'نافذة الأكل عندك شبه معدومة في السجل' : 'Your eating window barely exists on paper',
      ar
        ? 'في سجلك ' + arCount(tight, 'مرة واحدة', 'مرتين', 'مرات', 'مرة')
          + ' الصيام الجديد ابتدا فوراً بعد اللي قبله'
          + (shortest !== null && shortest < 0.2 ? ' — في مرة بفرق صفر دقيقة' : '')
          + '. إعداداتك بتقول النافذة من ' + S.get('settings.windowStart', '17:00') + ' لـ'
          + S.get('settings.windowEnd', '21:00') + '، يعني ٤ ساعات. الواقع المسجّل أقل من كده بكتير.\n\n'
          + 'واحد من اتنين: يا إما إنت فعلاً بتاكل في وقت ضيق جداً، وساعتها المشكلة إنك '
          + 'مش هتعرف تاكل احتياجك من البروتين ولا السعرات في الوقت ده — ودي أسرع طريقة '
          + 'لخسارة عضل. يا إما إنك بتاكل عادي بس مش بتوقف المؤقت، وساعتها كل الأرقام '
          + 'اللي التطبيق بيحسبها متضخّمة وبتديك إحساس زائف بالإنجاز.\n\n'
          + 'الاتنين محتاجين نفس الحل: اوقف المؤقت وقت ما تاكل أول لقمة فعلاً، وابدأ '
          + 'الصيام الجديد وقت ما تخلص آخر لقمة.'
        : tight + ' time(s) in your record a new fast starts the instant the previous one ends'
          + (shortest !== null && shortest < 0.2 ? ' — once with a zero-minute gap' : '')
          + '. Your settings declare a window of ' + S.get('settings.windowStart', '17:00') + ' to '
          + S.get('settings.windowEnd', '21:00') + ', four hours. The record shows far less.\n\n'
          + 'It is one of two things. Either you really are eating in a very narrow slot, in which '
          + 'case you cannot physically fit your protein or your calories into it — the fastest '
          + 'route to losing muscle there is. Or you are eating normally and not stopping the '
          + 'timer, in which case every number the app computes is inflated and gives you a '
          + 'false sense of progress.\n\n'
          + 'Both need the same fix: stop the timer at the first bite, start the next fast at the last.',
      ar ? 'اوقف المؤقت عند أول لقمة، مش عند آخر واحدة.'
         : 'Stop the timer at the first bite, not the last.');
  }

  /* --- 4. Training stacked on top of a broken fast --------------------- */
  var after = workoutsAfterBreaking(3);
  if (after.length >= 1) {
    var hardAfter = 0, soonest = null;
    for (var ai = 0; ai < after.length; ai++) {
      var z = hrZone(after[ai].workout.maxHr);
      if (z && (z.level === 'hard' || z.level === 'max')) hardAfter++;
      if (soonest === null || after[ai].gapH < soonest) soonest = after[ai].gapH;
    }
    if (hardAfter > 0) {
      add('post_break_load', 'medium',
        ar ? 'بتحمّل على نفسك بعد الفطار على طول' : 'You stack hard work right after breaking',
        ar
          ? 'لقيت ' + arCount(after.length, 'تمرين واحد', 'تمرينين', 'تمارين', 'تمرين')
            + ' بدأوا خلال ٣ ساعات من فطارك، منهم '
            + arCount(hardAfter, 'واحد', 'اتنين', 'في المنطقة العنيفة', 'في المنطقة العنيفة')
            + (hardAfter <= 2 ? ' في المنطقة العنيفة' : '')
            + (soonest !== null ? '، وأقربهم بعد ' + Math.round(soonest * 60) + ' دقيقة بس' : '')
            + '.\n\n'
            + 'التوقيت ده مش غلط في حد ذاته — بالعكس، التمرين بعد الأكل بيبقى أداؤه أحسن. '
            + 'المشكلة في الترتيب: لو الوجبة لسه في المعدة وطلعت تركب ٢٠ كيلو بنبض ١٧٠+، '
            + 'الدم بيتسحب من الهضم للعضل، فلا الوجبة اتهضمت كويس ولا التمرين خد وقوده. '
            + 'وده بيفسّر كتير من الإرهاق اللي بيجي بعدها.\n\n'
            + 'الترتيب اللي بيشتغل: تفطر خفيف (بروتين + سوائل + ملح)، تستنى ٦٠-٩٠ دقيقة، '
            + 'تتمرن، وبعدها الوجبة الكبيرة. كده التمرين بياخد وقوده والوجبة الكبيرة بتروح '
            + 'على عضلة فاتحة.'
          : after.length + ' session(s) started within three hours of you breaking a fast, '
            + hardAfter + ' of them in the hard zone'
            + (soonest !== null ? ', the closest just ' + Math.round(soonest * 60) + ' minutes after' : '')
            + '.\n\n'
            + 'The timing is not wrong in itself — training after eating performs better. The '
            + 'ordering is. If the meal is still in your stomach when you go out for 20 km at '
            + '170+ bpm, blood leaves digestion for the working muscle: the meal digests badly '
            + 'and the session runs unfuelled. That accounts for a lot of the wipe-out afterwards.\n\n'
            + 'The order that works: break light (protein, fluid, salt), wait 60-90 minutes, '
            + 'train, then eat the main meal. The session gets fuel and the big meal lands on '
            + 'a muscle that is primed to take it.',
        ar ? 'فطار خفيف → ٦٠-٩٠ دقيقة → تمرين → الوجبة الكبيرة.'
           : 'Break light → wait 60-90 min → train → main meal.');
    }
  }

  /* --- 5. Data hygiene: a double dose in the log ---------------------- */
  var sups = S.get('supplements', []);
  var doubled = null;
  for (var si = 0; si < sups.length && !doubled; si++) {
    var log = (sups[si].log || []).slice().sort(function (a, b) { return a - b; });
    for (var li = 1; li < log.length; li++) {
      if (dayKey(log[li]) === dayKey(log[li - 1])) {
        doubled = { name: sups[si].name, gapH: (log[li] - log[li - 1]) / 3600000 };
        break;
      }
    }
  }
  if (doubled) {
    add('double_dose', 'medium',
      ar ? 'جرعة مكرّرة في سجل المكمّلات' : 'A repeated dose in your supplement log',
      ar
        ? 'سجّلت "' + doubled.name + '" مرتين في نفس اليوم بفارق '
          + doubled.gapH.toFixed(1) + ' ساعة.\n\n'
          + 'لو ده مالتي فيتامين، الجرعة المكرّرة مش مجرد "زيادة مالهاش لازمة": الفيتامينات '
          + 'الذائبة في الدهون (A و D و E و K) بتتخزّن في الكبد ومابتتخلصش مع البول زي '
          + 'فيتامين C. تكرار ده بانتظام هو اللي بيوصل للتسمم، مش المرة الواحدة. '
          + 'والحديد كمان لو موجود في التركيبة، الجرعة الزيادة بتوجع المعدة على الفاضي.\n\n'
          + 'الأغلب إن ده تسجيل مكرر مش أخد مكرر. بس ده بالظبط سبب وجود التنبيه — '
          + 'من غير سجل نضيف مش هتعرف تفرّق.'
        : 'You logged "' + doubled.name + '" twice on the same day, '
          + doubled.gapH.toFixed(1) + ' hours apart.\n\n'
          + 'If that is a multivitamin, a repeat dose is not merely redundant: the fat-soluble '
          + 'vitamins (A, D, E, K) accumulate in the liver rather than clearing in urine the way '
          + 'vitamin C does. Toxicity comes from repetition, not from one occasion. And if the '
          + 'formula contains iron, the extra dose buys you stomach upset for nothing.\n\n'
          + 'Most likely this was a double entry rather than a double dose. That is exactly why '
          + 'the warning exists — without a clean log you cannot tell the two apart.',
      ar ? 'راجع اليوم ده. ولو التسجيل غلط، امسح الجرعة الزيادة عشان السجل يفضل موثوق.'
         : 'Check that day, and delete the extra entry if it was a mislog — the record is only useful if it is true.');
  }

  /* --- 6. A measurement that does not add up -------------------------- */
  if (body && body.waterPct && body.fatPct) {
    // Fat-free tissue is about 73% water, so total body water tracks lean mass.
    var expectedWater = Math.round((100 - body.fatPct) * 0.73);
    if (Math.abs(body.waterPct - expectedWater) >= 8) {
      add('water_reading', 'info',
        ar ? 'قراءة الماء في الميزان مش متسقة' : 'The body-water reading does not add up',
        ar
          ? 'الميزان مسجّل ماء الجسم ' + body.waterPct + '٪ ونسبة دهون ' + body.fatPct + '٪. '
            + 'الأنسجة الخالية من الدهون تقريباً ٧٣٪ ماء، يعني عند نسبة الدهون دي المتوقع '
            + 'يكون حوالي ' + expectedWater + '٪. الفرق كبير جداً على إنه صدفة.\n\n'
            + 'أغلب الظن إنك عملت القياس وإنت في ساعة متأخرة من الصيام. أجهزة البيو-إمبيدانس '
            + 'بتقيس مقاومة كهربائية وبتترجمها لتركيب جسم — والجفاف بيرفع المقاومة، '
            + 'فالجهاز بيقرا ماء أقل ودهون أعلى من الحقيقة. يعني نسبة دهونك الحقيقية '
            + 'غالباً أقل من ' + body.fatPct + '٪.\n\n'
            + 'القياس مالوش معنى غير لما يتكرر بنفس الظروف: نفس الوقت من اليوم، وقبل '
            + 'الأكل والشرب، ومن غير تمرين قبلها بساعات.'
          : 'The scale recorded ' + body.waterPct + '% body water against ' + body.fatPct
            + '% fat. Fat-free tissue is roughly 73% water, so at that fat percentage you would '
            + 'expect around ' + expectedWater + '%. The gap is too wide to be chance.\n\n'
            + 'The likely explanation is that you measured late into a fast. Bioimpedance devices '
            + 'measure electrical resistance and infer composition from it; dehydration raises '
            + 'resistance, so the device reads less water and more fat than is really there. Your '
            + 'true body fat is probably below ' + body.fatPct + '%.\n\n'
            + 'The measurement only means anything when repeated under the same conditions: same '
            + 'time of day, before eating or drinking, and not within hours of training.',
        ar ? 'أعد القياس الصبح قبل الأكل والشرب، وقارن بالقراءة دي.'
           : 'Re-measure in the morning before food or fluid, and compare against this reading.');
    }
  }

  /* --- 7. Age is missing and it costs you a real number ---------------- */
  if (!profile.age) {
    var seenMax = 0;
    var wl = S.get('workouts', []);
    for (var wi = 0; wi < wl.length; wi++) {
      if ((wl[wi].maxHr || 0) > seenMax) seenMax = wl[wi].maxHr;
    }
    add('age_missing', 'info',
      ar ? 'سنك ناقص — ودي بتكسر مناطق النبض' : 'Your age is missing, and heart-rate zones need it',
      ar
        ? 'أيض الراحة عندك محسوب من الكتلة الخالية من الدهون، فالسن مش لازم له — كويس. '
          + 'بس مناطق النبض لازم لها سقف، والسقف بيتحسب من السن.\n\n'
          + (seenMax
            ? 'أعلى نبض مسجّل عندك ' + seenMax + '. التطبيق بيستخدمه كسقف مؤقت، وده تقدير '
              + 'أقل من الحقيقة دايماً لأن نادراً حد يوصل لسقفه الفعلي في تمرين عادي — '
              + 'يعني كل جلساتك بتتحسب "أعنف" مما هي فعلاً.'
            : 'ومن غير سن ولا نبض مسجّل، التطبيق مش قادر يحكم على شدة أي جلسة.')
        : 'Your resting metabolic rate is computed from fat-free mass, so it does not need your '
          + 'age — that part is fine. Heart-rate zones do need a ceiling, and the ceiling comes '
          + 'from age.\n\n'
          + (seenMax
            ? 'Your highest recorded heart rate is ' + seenMax + '. The app is using that as a '
              + 'stand-in ceiling, which always understates the true one — almost nobody reaches '
              + 'their real maximum in ordinary training. Every session is therefore being scored '
              + 'as harder than it was.'
            : 'With neither an age nor a recorded heart rate, the app cannot judge how hard any '
              + 'session was.'),
      ar ? 'اكتب سنك في الملف الشخصي — ثانية واحدة وبتصلّح كل حسابات الشدة.'
         : 'Add your age in the profile — one field, and every intensity figure becomes real.');
  }

  var rank = { high: 0, medium: 1, info: 2 };
  out.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
  return out;
}

/* ---------------------------------------------------------------------
 * Monthly report
 *
 * exportText() above dumps the raw record. This is the other thing a record
 * is for: something a person can hand to a doctor, or paste into a chat,
 * and have it understood without the app.
 * ------------------------------------------------------------------- */

/**
 * A readable report over the last `days` days.
 * @return {string} Markdown, because it survives being pasted anywhere.
 */
function monthlyReport(days) {
  var ar = isRTL();
  var n = days || 30;
  var since = Date.now() - n * 86400000;
  var profile = S.get('profile', {});
  var L = [];

  function head(text) { L.push('', '## ' + text, ''); }
  function line(label, value) { if (value !== null && value !== '' && value !== undefined) L.push('- **' + label + ':** ' + value); }

  L.push('# ' + (ar ? 'تقرير الصيام المتقطع' : 'Intermittent fasting report'));
  L.push('');
  L.push((ar ? 'الفترة: آخر ' : 'Period: last ') + n + (ar ? ' يوم — حتى ' : ' days — to ') + fmtDate(Date.now()));
  L.push((ar ? 'الاسم: ' : 'Name: ') + (profile.name || '—'));

  /* --- composition --------------------------------------------------- */
  head(ar ? 'القياسات' : 'Measurements');
  var body = latestBody();
  var ffm = fatFreeMass();
  var bmr = bestBMR(profile);
  var tdee = bestTDEE(profile);
  line(ar ? 'الوزن' : 'Weight', profile.weight ? profile.weight + ' kg' : null);
  line(ar ? 'الطول' : 'Height', profile.height ? profile.height + ' cm' : null);
  var bmiVal = calcBMI(profile.weight, profile.height);
  if (bmiVal !== null) line('BMI', bmiVal.toFixed(1));
  if (body && body.fatPct) line(ar ? 'نسبة الدهون' : 'Body fat', body.fatPct + '%');
  if (ffm) line(ar ? 'الكتلة الخالية من الدهون' : 'Fat-free mass', ffm.kg + ' kg');
  if (bmr.value) line(ar ? 'أيض الراحة (تقديري)' : 'Resting metabolic rate (est.)', bmr.value + ' kcal');
  if (tdee.value) line(ar ? 'إجمالي الصرف اليومي (تقديري)' : 'Total daily expenditure (est.)', tdee.value + ' kcal');

  var trend = weightTrend();
  if (trend) {
    line(ar ? 'اتجاه الوزن' : 'Weight trend',
      trend.kgPerWeek.toFixed(2) + ' kg/' + (ar ? 'أسبوع' : 'week')
      + ' (' + trend.from + ' → ' + trend.to + ' kg ' + (ar ? 'خلال ' : 'over ') + trend.days + (ar ? ' يوم' : ' days') + ')');
  }

  /* --- adherence ------------------------------------------------------ */
  head(ar ? 'الالتزام' : 'Adherence');
  var hist = S.get('history', []);
  var inRange = [], totalMs = 0, longest = 0, completedN = 0;
  for (var i = 0; i < hist.length; i++) {
    if ((hist[i].end || hist[i].start) < since) continue;
    inRange.push(hist[i]);
    totalMs += hist[i].duration || 0;
    if ((hist[i].duration || 0) > longest) longest = hist[i].duration;
    if (hist[i].completed) completedN++;
  }
  line(ar ? 'عدد الصيامات' : 'Fasts logged', inRange.length);
  if (inRange.length) {
    line(ar ? 'إجمالي الساعات' : 'Total fasted hours', (totalMs / 3600000).toFixed(1));
    line(ar ? 'متوسط الصيام' : 'Average fast', (totalMs / inRange.length / 3600000).toFixed(1) + ' h');
    line(ar ? 'أطول صيام' : 'Longest fast', (longest / 3600000).toFixed(1) + ' h');
    line(ar ? 'وصل للهدف' : 'Goal reached', completedN + ' / ' + inRange.length);
  }
  line(ar ? 'السلسلة الحالية' : 'Current streak', S.get('stats.currentStreak', 0) + (ar ? ' يوم' : ' days'));

  /* --- intake --------------------------------------------------------- */
  head(ar ? 'التغذية' : 'Nutrition');
  var logged = completeCalorieDays(n);
  if (logged.length) {
    var cal = 0, prot = 0;
    for (var c = 0; c < logged.length; c++) { cal += logged[c].cal; prot += logged[c].p; }
    line(ar ? 'أيام مسجّلة بالكامل' : 'Fully logged days', logged.length + ' / ' + n);
    line(ar ? 'متوسط السعرات' : 'Average intake', Math.round(cal / logged.length) + ' kcal');
    line(ar ? 'متوسط البروتين' : 'Average protein', Math.round(prot / logged.length) + ' g');
  } else {
    L.push('- ' + (ar
      ? '_لا توجد أيام مسجّلة بسعرات كاملة في هذه الفترة، فلا يمكن الحكم على كفاية الأكل._'
      : '_No days with complete calorie data in this period, so intake adequacy cannot be assessed._'));
  }
  var target = proteinTarget();
  if (target.grams) line(ar ? 'هدف البروتين' : 'Protein target', target.grams + ' g');

  /* --- training ------------------------------------------------------- */
  head(ar ? 'التدريب' : 'Training');
  var w = S.get('workouts', []);
  var byType = {}, sessions = 0, km = 0;
  for (var j = 0; j < w.length; j++) {
    if (w[j].ts < since) continue;
    sessions++;
    byType[w[j].type] = (byType[w[j].type] || 0) + 1;
    km += w[j].distanceKm || 0;
  }
  line(ar ? 'عدد الجلسات' : 'Sessions', sessions);
  if (km) line(ar ? 'إجمالي المسافة' : 'Total distance', km.toFixed(1) + ' km');
  var types = [];
  for (var tk in byType) {
    if (!Object.prototype.hasOwnProperty.call(byType, tk)) continue;
    types.push(workoutType(tk)[ar ? 'ar' : 'en'] + ' ×' + byType[tk]);
  }
  if (types.length) line(ar ? 'التوزيع' : 'Breakdown', types.join('، '));

  /* --- recovery ------------------------------------------------------- */
  head(ar ? 'الاستشفاء' : 'Recovery');
  var sleep = avgSleepHours(Math.min(n, 30));
  if (sleep !== null) line(ar ? 'متوسط النوم' : 'Average sleep', sleep.toFixed(1) + ' h');
  var rec = recoveryStatus();
  if (rec) {
    line(ar ? 'نبض الراحة' : 'Resting heart rate',
      rec.recent + ' bpm (' + (ar ? 'خط الأساس ' : 'baseline ') + rec.baseline + ')');
  }

  /* --- findings ------------------------------------------------------- */
  var insights = expertInsights();
  if (insights.length) {
    head(ar ? 'الملاحظات' : 'Findings');
    for (var k = 0; k < insights.length; k++) {
      L.push((k + 1) + '. **' + insights[k].title + '** — ' + insights[k].text);
    }
  }

  L.push('');
  L.push('---');
  L.push('_' + (ar
    ? 'تقرير مولّد من تطبيق ' + t('app_name') + '. أرقام الأيض والصرف تقديرية، وليست تشخيصاً طبياً.'
    : 'Generated by ' + t('app_name') + '. Metabolic figures are estimates, not a medical diagnosis.') + '_');

  return L.join('\n');
}

/* ---------------------------------------------------------------------
 * Medals
 *
 * A deliberate design constraint runs through this list: nothing rewards a
 * longer fast than the last one. In a fasting app an escalating ladder of
 * duration badges is an instruction to push past what is safe for the sake of
 * the badge, and the person most likely to chase it is the one who should
 * least be doing so. Duration milestones therefore stop at 36 hours and do
 * not repeat.
 *
 * What is rewarded instead is the behaviour that actually moves the numbers:
 * turning up repeatedly, eating enough protein, lifting something, sleeping,
 * and logging honestly.
 * ------------------------------------------------------------------- */

/**
 * One pass over the data, shared by every medal check, so opening the medals
 * screen is a single read rather than thirty.
 */
function medalContext() {
  var now = Date.now();
  var hist = S.get('history', []);
  var workouts = S.get('workouts', []);
  var days = S.get('healthDays', []);
  var i;

  var longest = 0;
  for (i = 0; i < hist.length; i++) {
    if ((hist[i].duration || 0) > longest) longest = hist[i].duration;
  }

  var resistance = 0, easy = 0;
  for (i = 0; i < workouts.length; i++) {
    if (workouts[i].type === 'gym') resistance++;
    var z = hrZone(workouts[i].maxHr);
    if (z && (z.level === 'easy' || z.level === 'moderate')) easy++;
  }

  var goodSleep = 0;
  for (i = 0; i < days.length; i++) {
    if ((days[i].sleepMs || 0) >= 7 * 3600000) goodSleep++;
  }

  // Days where logged protein actually cleared the target.
  var target = proteinTarget().grams;
  var byDay = {};
  var meals = S.get('meals', []);
  for (i = 0; i < meals.length; i++) {
    var k = dayKey(meals[i].ts);
    byDay[k] = (byDay[k] || 0) + (meals[i].p || 0) * (meals[i].portions || 1);
  }
  var proteinDays = 0;
  for (var dk in byDay) {
    if (!Object.prototype.hasOwnProperty.call(byDay, dk)) continue;
    if (target > 0 && byDay[dk] >= target) proteinDays++;
  }

  return {
    now: now,
    fasts: hist.length,
    longestH: longest / 3600000,
    streak: S.get('stats.currentStreak', 0),
    bestStreak: S.get('stats.bestStreak', 0),
    loggedDays: completeCalorieDays(365).length,
    proteinDays: proteinDays,
    resistance: resistance,
    easy: easy,
    goodSleep: goodSleep,
    weighIns: S.get('profile.weightLog', []).length,
    reports: S.get('stats.reportsShared', 0)
  };
}

/**
 * Medals. `need` is the threshold and `have` reads the context, so the UI can
 * show partial progress instead of a locked box with no idea how close it is.
 */
var MEDALS = [
  // --- turning up, repeatedly ---------------------------------------------
  { k: 'streak3',   tier: 'bronze', group: 'consistency', need: 3,
    have: function (c) { return c.bestStreak; },
    ar: 'ثلاث أيام ورا بعض', en: 'Three days running',
    ar_d: 'البداية دايماً أصعب حاجة.', en_d: 'Starting is always the hard part.' },
  { k: 'streak7',   tier: 'silver', group: 'consistency', need: 7,
    have: function (c) { return c.bestStreak; },
    ar: 'أسبوع كامل', en: 'A full week',
    ar_d: 'أسبوع متواصل — الجسم بدأ يتعوّد.', en_d: 'Seven straight days; the body has begun to adapt.' },
  { k: 'streak30',  tier: 'gold',   group: 'consistency', need: 30,
    have: function (c) { return c.bestStreak; },
    ar: 'شهر', en: 'A month',
    ar_d: 'شهر متواصل. ده مبقاش تجربة، ده بقى روتين.',
    en_d: 'A month unbroken. This stopped being an experiment and became a routine.' },
  { k: 'fasts50',   tier: 'silver', group: 'consistency', need: 50,
    have: function (c) { return c.fasts; },
    ar: '٥٠ صيام', en: '50 fasts',
    ar_d: 'خمسين مرة قررت وكمّلت.', en_d: 'Fifty times you decided and followed through.' },

  // --- duration, capped on purpose ----------------------------------------
  { k: 'first16',   tier: 'bronze', group: 'milestone', need: 16,
    have: function (c) { return c.longestH; },
    ar: 'أول ١٦ ساعة', en: 'First 16 hours',
    ar_d: 'الجليكوجين خلص والجسم بدأ يقلب على الدهون.',
    en_d: 'Glycogen ran down and the body turned to fat.' },
  { k: 'first20',   tier: 'silver', group: 'milestone', need: 20,
    have: function (c) { return c.longestH; },
    ar: 'أول ٢٠ ساعة', en: 'First 20 hours',
    ar_d: 'الكيتوزية بجد، مش على الورق.', en_d: 'Ketosis for real, not on paper.' },
  { k: 'first24',   tier: 'gold',   group: 'milestone', need: 24,
    have: function (c) { return c.longestH; },
    ar: 'أول ٢٤ ساعة', en: 'First 24 hours',
    ar_d: 'يوم كامل. وهنا بنقف عن مكافأة المدة — أطول مش أحسن تلقائياً، '
      + 'واللي بعد كده قرار بينك وبين جسمك مش بينك وبين ميدالية.',
    en_d: 'A full day. Duration medals stop here on purpose: longer is not automatically '
      + 'better, and anything beyond this is between you and your body, not you and a badge.' },

  // --- eating like someone who lifts --------------------------------------
  { k: 'protein7',  tier: 'silver', group: 'nutrition', need: 7,
    have: function (c) { return c.proteinDays; },
    ar: 'سبع أيام بروتين كامل', en: 'Seven days on protein',
    ar_d: 'ده الرقم اللي بيحدد إن النازل دهون ولا عضل.',
    en_d: 'This is the number that decides whether what you lose is fat or muscle.' },
  { k: 'logged14',  tier: 'silver', group: 'nutrition', need: 14,
    have: function (c) { return c.loggedDays; },
    ar: 'أسبوعين تسجيل صادق', en: 'A fortnight logged honestly',
    ar_d: 'من غير أرقام أكل، كل نصيحة عن السعرات تخمين. إنت شلت التخمين.',
    en_d: 'Without intake numbers every calorie recommendation is a guess. You removed the guess.' },

  // --- the gap the coach keeps naming --------------------------------------
  { k: 'lift1',     tier: 'bronze', group: 'training', need: 1,
    have: function (c) { return c.resistance; },
    ar: 'أول تمرين مقاومة', en: 'First resistance session',
    ar_d: 'أهم تمرين في التطبيق كله — ده اللي بيحمي عضلك وإنت في عجز.',
    en_d: 'The single most valuable session here: this is what protects muscle in a deficit.' },
  { k: 'lift8',     tier: 'silver', group: 'training', need: 8,
    have: function (c) { return c.resistance; },
    ar: 'تمانية تمارين مقاومة', en: 'Eight resistance sessions',
    ar_d: 'شهر بمعدل تمرينين في الأسبوع.', en_d: 'A month at two sessions a week.' },
  { k: 'lift24',    tier: 'gold',   group: 'training', need: 24,
    have: function (c) { return c.resistance; },
    ar: '٢٤ تمرين مقاومة', en: '24 resistance sessions',
    ar_d: 'دي مش تجربة، ده بقى جزء من حياتك.', en_d: 'No longer a trial; part of your life.' },
  { k: 'easy10',    tier: 'bronze', group: 'training', need: 10,
    have: function (c) { return c.easy; },
    ar: 'عشر جلسات هادية', en: 'Ten easy sessions',
    ar_d: 'الشغل الهادي هو اللي بيبني القاعدة الهوائية، مش العنيف.',
    en_d: 'The easy volume builds the aerobic base, not the hard days.' },

  // --- recovery, which is where the deficit is won or lost -----------------
  { k: 'sleep7',    tier: 'silver', group: 'recovery', need: 7,
    have: function (c) { return c.goodSleep; },
    ar: 'سبع ليالي نوم كفاية', en: 'Seven nights of real sleep',
    ar_d: 'تحت ٧ ساعات، العجز بيميل ياخد من العضل. النوم جزء من الخطة.',
    en_d: 'Under seven hours a deficit tilts toward muscle. Sleep is part of the plan.' },
  { k: 'weigh30',   tier: 'bronze', group: 'recovery', need: 30,
    have: function (c) { return c.weighIns; },
    ar: '٣٠ قراءة وزن', en: '30 weigh-ins',
    ar_d: 'قراءات كفاية عشان خط الاتجاه يبقى ليه معنى.',
    en_d: 'Enough readings for the trend line to mean something.' }
];

var MEDAL_TIERS = { bronze: '#c08457', silver: '#b8c0cc', gold: '#f5a623' };

/**
 * Every medal with its progress, and the ones newly earned by this call.
 * Unlock times are persisted so a medal cannot un-earn itself later — a
 * thirty-day streak you once held stays held even after you break it.
 *
 * @return {{list:Array, earned:number, fresh:Array}}
 */
function evaluateMedals() {
  var c = medalContext();
  var won = S.get('medals', {});
  var fresh = [];
  var list = [];
  var changed = false;

  for (var i = 0; i < MEDALS.length; i++) {
    var m2 = MEDALS[i];
    var have = m2.have(c) || 0;
    var done = have >= m2.need;
    if (done && !won[m2.k]) {
      won[m2.k] = Date.now();
      fresh.push(m2);
      changed = true;
    }
    list.push({
      medal: m2,
      // Duration medals compare fractional hours; a progress label reading
      // "23.333333333333332/24" is a leaked float, not information.
      have: Math.round(Math.min(have, m2.need) * 10) / 10,
      need: m2.need,
      pct: Math.min(100, Math.round(have / m2.need * 100)),
      at: won[m2.k] || 0,
      done: !!won[m2.k]
    });
  }
  if (changed) S.set('medals', won);

  var earned = 0;
  for (var j = 0; j < list.length; j++) if (list[j].done) earned++;
  return { list: list, earned: earned, fresh: fresh };
}

/* ---------------------------------------------------------------------
 * Challenges
 *
 * Personal and time-boxed, never social. A leaderboard would have this user
 * competing on hours fasted, which is the one number that should not be
 * competed on; a two-week commitment he made to himself is motivation
 * without that pressure.
 * ------------------------------------------------------------------- */

var CHALLENGES = [
  { k: 'lift2x2', days: 14, need: 4, medal: 'lift8',
    ar: 'أربع تمارين مقاومة في أسبوعين', en: 'Four resistance sessions in a fortnight',
    ar_d: 'تمرينين في الأسبوع. ده اللي التحليل بيطلبه منك من أسابيع.',
    en_d: 'Two a week — exactly what the analysis has been asking for.',
    count: function (since) {
      var w = S.get('workouts', []), n = 0;
      for (var i = 0; i < w.length; i++) if (w[i].ts >= since && w[i].type === 'gym') n++;
      return n;
    } },
  { k: 'log7', days: 7, need: 7, medal: 'logged14',
    ar: 'سبع أيام تسجّل فيها سعراتك', en: 'Seven days with calories logged',
    ar_d: 'أسبوع واحد بصدق يكفي عشان تعرف الفجوة فين.',
    en_d: 'One honest week is enough to find the gap.',
    count: function (since) {
      var days = completeCalorieDays(Math.ceil((Date.now() - since) / 86400000) + 1);
      return days.length;
    } },
  { k: 'protein10', days: 14, need: 10, medal: 'protein7',
    ar: 'عشر أيام توصل هدف البروتين', en: 'Ten days hitting your protein target',
    ar_d: 'الرقم اللي بيحمي عضلك وإنت بتنزل.',
    en_d: 'The number that protects muscle while the weight comes off.',
    count: function (since) {
      var target = proteinTarget().grams;
      if (!target) return 0;
      var meals = S.get('meals', []), byDay = {};
      for (var i = 0; i < meals.length; i++) {
        if (meals[i].ts < since) continue;
        var k = dayKey(meals[i].ts);
        byDay[k] = (byDay[k] || 0) + (meals[i].p || 0) * (meals[i].portions || 1);
      }
      var n = 0;
      for (var d in byDay) {
        if (Object.prototype.hasOwnProperty.call(byDay, d) && byDay[d] >= target) n++;
      }
      return n;
    } },
  { k: 'sleep10', days: 14, need: 10, medal: 'sleep7',
    ar: 'عشر ليالي نوم ٧ ساعات', en: 'Ten nights of seven hours',
    ar_d: 'النوم هو اللي بيقرر إن النازل دهون ولا عضل، أكتر من التمرين نفسه.',
    en_d: 'Sleep decides whether the loss is fat or muscle, more than training does.',
    count: function (since) {
      var days = S.get('healthDays', []), n = 0;
      for (var i = 0; i < days.length; i++) {
        var ts = Date.parse(days[i].date);
        if (isNaN(ts) || ts < since) continue;
        if ((days[i].sleepMs || 0) >= 7 * 3600000) n++;
      }
      return n;
    } }
];

function challengeByKey(k) {
  for (var i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].k === k) return CHALLENGES[i];
  return null;
}

/**
 * The challenge currently running, with progress and time left.
 * @return {{def:Object, have:number, need:number, pct:number,
 *           daysLeft:number, done:boolean, expired:boolean}|null}
 */
function activeChallenge() {
  var a = S.get('challenge', null);
  if (!a || !a.k) return null;
  var def = challengeByKey(a.k);
  if (!def) return null;

  var ends = a.startedAt + def.days * 86400000;
  var have = def.count(a.startedAt);
  return {
    def: def,
    have: Math.min(have, def.need),
    need: def.need,
    pct: Math.min(100, Math.round(have / def.need * 100)),
    daysLeft: Math.max(0, Math.ceil((ends - Date.now()) / 86400000)),
    done: have >= def.need,
    expired: Date.now() > ends && have < def.need,
    startedAt: a.startedAt
  };
}

function startChallenge(k) {
  if (!challengeByKey(k)) return false;
  S.set('challenge', { k: k, startedAt: Date.now() });
  return true;
}

function endChallenge() {
  S.set('challenge', null);
}

/* ---------------------------------------------------------------------
 * Exercise library
 *
 * The coach has been telling this user for weeks that all his training is
 * cardio and that a deficit without resistance work costs lean mass. Saying
 * so without showing the movement is where that advice stops being useful.
 *
 * Demonstrations are a rigged SVG stick figure animated with CSS transforms —
 * not video, not GIF. A video of eight exercises would be tens of megabytes
 * and would have to be decoded on every view; this is a few hundred bytes of
 * markup per exercise, scales to any screen, follows the theme, and costs the
 * compositor a rotation.
 *
 * Every movement here is compound, needs no gym, and targets exactly the gap
 * the analysis keeps reporting.
 * ------------------------------------------------------------------- */

var EXERCISES = [
  {
    k: 'squat', move: 'squat', kit: 'none',
    ar: 'سكوات', en: 'Bodyweight squat',
    muscles_ar: 'الأرجل والمؤخرة والجذع', muscles_en: 'Quads, glutes, core',
    cues_ar: [
      'رجليك بعرض الكتفين وأصابعك مفتوحة شوية لبرّه',
      'انزل كأنك بتقعد على كرسي ورّاك — الركبة تتحرك في اتجاه أصابع رجلك',
      'انزل لحد ما الفخذ يوازي الأرض، أو لأبعد نقطة ظهرك فيها لسه مفرود',
      'اطلع بالضغط على كعبك، ولمّا تقف اعصر مؤخرتك'
    ],
    cues_en: [
      'Feet shoulder width, toes turned out slightly',
      'Sit back as if reaching for a chair; knees track over the toes',
      'Descend until the thigh is parallel, or as far as your back stays flat',
      'Drive up through the heels and squeeze the glutes at the top'
    ],
    mistake_ar: 'الكعب بيرفع من الأرض والوزن بيروح على أصابعك — قرّب رجليك شوية أو حط حاجة رفيعة تحت كعبك.',
    mistake_en: 'Heels lifting so the weight rolls onto the toes — narrow the stance slightly, or raise the heels a little.'
  },
  {
    k: 'pushup', move: 'pushup', kit: 'none',
    ar: 'ضغط', en: 'Push-up',
    muscles_ar: 'الصدر والترايسبس والكتف الأمامي', muscles_en: 'Chest, triceps, front delts',
    cues_ar: [
      'إيدك أوسع من كتفك شوية، وجسمك خط واحد من كعبك لراسك',
      'انزل لحد ما صدرك يقرب من الأرض، وكوعك مايل ٤٥ درجة مش مفرود للجانب',
      'اضغط الأرض بعيد عنك، واقفل حركتك وإنت شادد بطنك',
      'لو صعبة، ابدأ بإيدك على حافة سرير أو طرابيزة'
    ],
    cues_en: [
      'Hands slightly wider than the shoulders; body one line from heel to head',
      'Lower until the chest is near the floor, elbows at about 45°, not flared',
      'Push the floor away and finish with the abs braced',
      'Too hard? Start with hands on a bed or table edge'
    ],
    mistake_ar: 'الوسط بينزل والمؤخرة بترفع — شدّ بطنك ومؤخرتك قبل ما تنزل، واعتبر جسمك لوح واحد.',
    mistake_en: 'Hips sagging or riding up — brace the abs and glutes before you descend and move as one plank.'
  },
  {
    k: 'row', move: 'row', kit: 'weight',
    ar: 'سحب بالدامبل', en: 'Dumbbell row',
    muscles_ar: 'الظهر والبايسبس والكتف الخلفي', muscles_en: 'Lats, biceps, rear delts',
    cues_ar: [
      'ميّل من الحوض لحد ما جذعك يقرب من الموازاة للأرض، وظهرك مفرود',
      'اسحب الوزن ناحية وسطك مش ناحية صدرك',
      'ابدأ الحركة من لوح كتفك — اسحبه ناحية عمودك الفقري الأول',
      'نزّل الوزن ببطء وفرد ذراعك بالكامل'
    ],
    cues_en: [
      'Hinge from the hips until the torso is near parallel, back flat',
      'Pull the weight toward your waist, not your chest',
      'Start the movement from the shoulder blade — retract it first',
      'Lower slowly and let the arm straighten fully'
    ],
    mistake_ar: 'السحب بالذراع لوحدها والظهر بيتقوّس — ابدأ من الكتف وخلي ظهرك مشدود طول الحركة.',
    mistake_en: 'Yanking with the arm while the back rounds — initiate from the shoulder blade and keep the spine set.'
  },
  {
    k: 'rdl', move: 'hinge', kit: 'weight',
    ar: 'رفعة ميتة رومانية', en: 'Romanian deadlift',
    muscles_ar: 'خلفية الفخذ والمؤخرة وأسفل الظهر', muscles_en: 'Hamstrings, glutes, lower back',
    cues_ar: [
      'ركبتك مثنية شوية وثابتة كده — دي حركة حوض مش حركة ركبة',
      'ادفع حوضك لورا وخلي الوزن قريب من رجلك وهو نازل',
      'انزل لحد ما تحس بشد في خلفية الفخذ، وقف عند الحد ده',
      'ارجع بدفع حوضك لقدّام مش بسحب ظهرك'
    ],
    cues_en: [
      'Knees softly bent and staying there — this is a hip movement, not a knee one',
      'Push the hips back and keep the weight grazing your legs on the way down',
      'Stop at the point you feel the hamstrings stretch',
      'Return by driving the hips forward, not by pulling with the back'
    ],
    mistake_ar: 'تقويس الظهر عشان توصل لأبعد — المدى بيحدده الشد في خلفية الفخذ، مش وصول الوزن للأرض.',
    mistake_en: 'Rounding the back to reach lower — the hamstring stretch sets the range, not the floor.'
  },
  {
    k: 'press', move: 'press', kit: 'weight',
    ar: 'ضغط كتف واقف', en: 'Overhead press',
    muscles_ar: 'الكتف والترايسبس والجذع', muscles_en: 'Shoulders, triceps, core',
    cues_ar: [
      'الوزن عند مستوى ذقنك وكوعك تحت إيدك مش لبرّه',
      'شدّ بطنك ومؤخرتك عشان ظهرك مايتقوّسش',
      'اطلع الوزن لفوق وخلي راسك تعدّي تحته في آخر الحركة',
      'نزّل ببطء لنفس نقطة البداية'
    ],
    cues_en: [
      'Weight at chin height, elbows under the hands rather than flared',
      'Brace the abs and glutes so the lower back does not arch',
      'Press up and let the head move through at the top',
      'Lower under control to the same starting point'
    ],
    mistake_ar: 'تقويس أسفل الظهر عشان تكمل الحركة — ده معناه إن الوزن تقيل أو إن كتفك مش بيفرد كفاية.',
    mistake_en: 'Arching the lower back to finish the rep — the weight is too heavy, or the shoulders lack the range.'
  },
  {
    k: 'lunge', move: 'lunge', kit: 'none',
    ar: 'اندفاع', en: 'Split squat / lunge',
    muscles_ar: 'الأرجل والمؤخرة والاتزان', muscles_en: 'Quads, glutes, balance',
    cues_ar: [
      'خطوة كبيرة لقدّام، وجذعك مفرود عمودي',
      'انزل لحد ما ركبتك الخلفية تقرب من الأرض',
      'ركبتك الأمامية فوق كعبك تقريباً، مش سابقة أصابعك بكتير',
      'اطلع بالضغط على كعب الرجل الأمامية'
    ],
    cues_en: [
      'A long step forward, torso upright',
      'Lower until the back knee is close to the floor',
      'Front knee roughly above the heel, not far past the toes',
      'Drive up through the front heel'
    ],
    mistake_ar: 'خطوة قصيرة بتحوّل الحركة لضغط على الركبة — كبّر الخطوة لحد ما تحس المؤخرة بتشتغل.',
    mistake_en: 'A short step turns it into knee strain — lengthen the stride until the glute takes the load.'
  },
  {
    k: 'plank', move: 'plank', kit: 'none',
    ar: 'بلانك', en: 'Plank',
    muscles_ar: 'الجذع كله', muscles_en: 'Whole core',
    cues_ar: [
      'كوعك تحت كتفك بالظبط، وساعدك على الأرض',
      'جسمك خط واحد — مؤخرتك لا عالية ولا نازلة',
      'شدّ بطنك كأن حد هيلكمك، واعصر مؤخرتك',
      'اتنفس عادي. الوقت مش هو الهدف — الشكل الصح هو الهدف'
    ],
    cues_en: [
      'Elbows directly under the shoulders, forearms down',
      'One straight line — hips neither high nor sagging',
      'Brace the abs as if bracing for a punch, and squeeze the glutes',
      'Keep breathing. Duration is not the goal; position is'
    ],
    mistake_ar: 'الاستمرار بعد ما الوسط بينزل — ثلاثين ثانية بشكل صح أنفع من دقيقتين والظهر مقوّس.',
    mistake_en: 'Holding on after the hips drop — thirty honest seconds beat two minutes with a sagging back.'
  },
  {
    k: 'bridge', move: 'bridge', kit: 'none',
    ar: 'جسر الحوض', en: 'Glute bridge',
    muscles_ar: 'المؤخرة وخلفية الفخذ', muscles_en: 'Glutes, hamstrings',
    cues_ar: [
      'نام على ضهرك وركبك مثنية ورجلك قريبة من مؤخرتك',
      'ادفع بكعبك وارفع حوضك لحد ما جسمك يبقى خط من ركبتك لكتفك',
      'اعصر مؤخرتك فوق ثانية كاملة',
      'نزّل ببطء من غير ما ترتاح على الأرض بين العدّات'
    ],
    cues_en: [
      'On your back, knees bent, feet close to your hips',
      'Drive through the heels until knees, hips and shoulders form a line',
      'Squeeze the glutes hard for a full second at the top',
      'Lower slowly without resting on the floor between reps'
    ],
    mistake_ar: 'الرفع بأسفل الظهر بدل المؤخرة — لو حاسس بالمجهود في ضهرك، قرّب رجلك من مؤخرتك أكتر.',
    mistake_en: 'Lifting with the lower back instead of the glutes — if you feel it in your back, bring the feet closer.'
  }
];

/**
 * A starter routine built from the library: the two sessions a week the
 * coach keeps asking for, ordered largest movement first while you are
 * freshest, and sized to fit inside a short eating window.
 */
function starterRoutine() {
  var ar = isRTL();
  return {
    title: ar ? 'تمرينين في الأسبوع — ٤٠ دقيقة' : 'Two sessions a week, 40 minutes',
    note: ar
      ? 'الحركات الكبيرة الأول وإنت لسه فايق. ٣ مجموعات × ٨-١٢ عدّة، وريّح دقيقة ونص بين المجموعات. '
        + 'ابدأ بوزن تقدر توقف عنده وعندك عدّتين في الرصيد — مش لحد الفشل.'
      : 'Largest movements first, while you are fresh. Three sets of 8-12, ninety seconds between '
        + 'sets. Start with a load you could stop two reps short of failure — not at it.',
    days: [
      { label: ar ? 'اليوم الأول' : 'Day one', items: ['squat', 'pushup', 'row', 'plank'] },
      { label: ar ? 'اليوم التاني' : 'Day two', items: ['rdl', 'press', 'lunge', 'bridge'] }
    ]
  };
}

function exerciseByKey(k) {
  for (var i = 0; i < EXERCISES.length; i++) if (EXERCISES[i].k === k) return EXERCISES[i];
  return null;
}

/* ---------------------------------------------------------------------
 * Printable report
 *
 * monthlyReport() above produces Markdown for pasting into a chat. This
 * builds the same material as a self-contained HTML document — styled for
 * paper rather than for a phone, with the meal photos embedded — which the
 * native side hands to Android's print pipeline to become a PDF.
 * ------------------------------------------------------------------- */

/** Escapes text for HTML. The report embeds user-entered meal names. */
function esc(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Meals from the last `days` days that carry a photo, newest first.
 * Photos come across the bridge one at a time and are capped, because each
 * is a base64 thumbnail and a year of meals would not fit in one document.
 */
function reportPhotos(days, max) {
  var meals = S.get('meals', []);
  var since = Date.now() - (days || 30) * 86400000;
  var out = [];
  for (var i = meals.length - 1; i >= 0 && out.length < (max || 24); i--) {
    if (meals[i].ts < since || !meals[i].photo) continue;
    var data = N.call('photoData', meals[i].photo) || '';
    if (!data) continue;
    out.push({ meal: meals[i], data: data });
  }
  return out;
}

/**
 * The report as a printable HTML document.
 *
 * Deliberately styled light regardless of the app's theme: this is going to
 * paper or to a PDF someone opens on a laptop, and a dark page prints as a
 * solid block of ink.
 */
function reportHtml(days) {
  var ar = isRTL();
  var n = days || 30;
  var since = Date.now() - n * 86400000;
  var profile = S.get('profile', {});
  var H = [];

  function section(title) { H.push('<h2>' + esc(title) + '</h2>'); }
  function row(label, value) {
    if (value === null || value === undefined || value === '') return;
    H.push('<div class="r"><span class="k">' + esc(label) + '</span>'
      + '<span class="v">' + esc(value) + '</span></div>');
  }

  /* --- measurements ---------------------------------------------------- */
  section(ar ? 'القياسات' : 'Measurements');
  var body = latestBody();
  var ffm = fatFreeMass();
  var bmr = bestBMR(profile);
  var tdee = bestTDEE(profile);
  row(ar ? 'الوزن (كجم)' : 'Weight (kg)', profile.weight || null);
  row(ar ? 'الطول (سم)' : 'Height (cm)', profile.height || null);
  var bmiVal = calcBMI(profile.weight, profile.height);
  if (bmiVal !== null) row('BMI', bmiVal.toFixed(1));
  if (body && body.fatPct) row(ar ? 'نسبة الدهون' : 'Body fat', body.fatPct + '%');
  if (ffm) row(ar ? 'الكتلة الخالية من الدهون (كجم)' : 'Fat-free mass (kg)', ffm.kg);
  if (bmr.value) row(ar ? 'أيض الراحة التقديري (سعرة)' : 'Resting burn, est. (kcal)', bmr.value);
  if (tdee.value) row(ar ? 'الصرف اليومي التقديري (سعرة)' : 'Daily expenditure, est. (kcal)', tdee.value);
  var trend = weightTrend();
  if (trend) {
    row(ar ? 'اتجاه الوزن (كجم/أسبوع)' : 'Weight trend (kg/week)',
      trend.kgPerWeek.toFixed(2) + '  (' + trend.from + ' \u2192 ' + trend.to + ')');
  }

  /* --- adherence ------------------------------------------------------- */
  section(ar ? 'الالتزام' : 'Adherence');
  var hist = S.get('history', []);
  var kept = [], totalMs = 0, longest = 0, done = 0;
  for (var i = 0; i < hist.length; i++) {
    if ((hist[i].end || hist[i].start) < since) continue;
    kept.push(hist[i]);
    totalMs += hist[i].duration || 0;
    if ((hist[i].duration || 0) > longest) longest = hist[i].duration;
    if (hist[i].completed) done++;
  }
  row(ar ? 'عدد الصيامات' : 'Fasts logged', kept.length);
  if (kept.length) {
    row(ar ? 'إجمالي الساعات' : 'Total fasted hours', (totalMs / 3600000).toFixed(1));
    row(ar ? 'متوسط الصيام (ساعة)' : 'Average fast (h)', (totalMs / kept.length / 3600000).toFixed(1));
    row(ar ? 'أطول صيام (ساعة)' : 'Longest fast (h)', (longest / 3600000).toFixed(1));
    row(ar ? 'وصل للهدف' : 'Goal reached', done + ' / ' + kept.length);
  }
  row(ar ? 'السلسلة الحالية (يوم)' : 'Current streak (days)', S.get('stats.currentStreak', 0));

  /* --- nutrition ------------------------------------------------------- */
  section(ar ? 'التغذية' : 'Nutrition');
  var logged = completeCalorieDays(n);
  if (logged.length) {
    var cal = 0, prot = 0;
    for (var c = 0; c < logged.length; c++) { cal += logged[c].cal; prot += logged[c].p; }
    row(ar ? 'أيام مسجّلة بالكامل' : 'Fully logged days', logged.length + ' / ' + n);
    row(ar ? 'متوسط السعرات (سعرة)' : 'Average intake (kcal)', Math.round(cal / logged.length));
    row(ar ? 'متوسط البروتين (جم)' : 'Average protein (g)', Math.round(prot / logged.length));
  } else {
    H.push('<p class="note">' + esc(ar
      ? 'لا توجد أيام مسجّلة بسعرات كاملة في هذه الفترة، فلا يمكن الحكم على كفاية الأكل.'
      : 'No days with complete calorie data in this period, so intake cannot be assessed.') + '</p>');
  }
  var target = proteinTarget();
  if (target.grams) row(ar ? 'هدف البروتين (جم)' : 'Protein target (g)', target.grams);

  /* --- training and recovery ------------------------------------------- */
  section(ar ? 'التدريب والاستشفاء' : 'Training & recovery');
  var w = S.get('workouts', []);
  var sessions = 0, km = 0, byType = {};
  for (var j = 0; j < w.length; j++) {
    if (w[j].ts < since) continue;
    sessions++;
    km += w[j].distanceKm || 0;
    byType[w[j].type] = (byType[w[j].type] || 0) + 1;
  }
  row(ar ? 'عدد الجلسات' : 'Sessions', sessions);
  if (km) row(ar ? 'إجمالي المسافة (كم)' : 'Total distance (km)', km.toFixed(1));
  var types = [];
  for (var tk in byType) {
    if (!Object.prototype.hasOwnProperty.call(byType, tk)) continue;
    types.push(workoutType(tk)[ar ? 'ar' : 'en'] + ' \u00d7' + byType[tk]);
  }
  if (types.length) {
    H.push('<div class="r"><span class="k">' + esc(ar ? 'التوزيع' : 'Breakdown')
      + '</span><span class="v mixed">' + esc(types.join('\u060c ')) + '</span></div>');
  }
  var sleep = avgSleepHours(Math.min(n, 30));
  if (sleep !== null) row(ar ? 'متوسط النوم (ساعة)' : 'Average sleep (h)', sleep.toFixed(1));
  var rec = recoveryStatus();
  if (rec) {
    row(ar ? 'نبض الراحة / الأساس' : 'Resting HR / baseline',
      rec.recent + ' / ' + rec.baseline);
  }

  /* --- findings -------------------------------------------------------- */
  var insights = expertInsights();
  if (insights.length) {
    section(ar ? 'الملاحظات' : 'Findings');
    H.push('<ol class="find">');
    for (var k = 0; k < insights.length; k++) {
      H.push('<li><strong>' + esc(insights[k].title) + '</strong><br>'
        + esc(insights[k].text) + '</li>');
    }
    H.push('</ol>');
  }

  /* --- photos ---------------------------------------------------------- */
  var shots = reportPhotos(n, 24);
  if (shots.length) {
    section(ar ? 'صور الوجبات' : 'Meal photos');
    H.push('<div class="grid">');
    for (var q = 0; q < shots.length; q++) {
      var it = shots[q].meal;
      H.push('<figure><img src="' + esc(shots[q].data) + '" alt="">'
        + '<figcaption><b>' + esc(ar ? it.ar : it.en) + '</b><br>'
        + esc(fmtDate(it.ts))
        + (it.cal === null || it.cal === undefined
            ? '' : ' \u00b7 ' + Math.round(it.cal * (it.portions || 1)) + ' kcal')
        + '</figcaption></figure>');
    }
    H.push('</div>');
  }

  var title = ar ? 'تقرير الصيام المتقطع' : 'Intermittent fasting report';
  return '<!DOCTYPE html><html dir="' + (ar ? 'rtl' : 'ltr') + '" lang="' + (ar ? 'ar' : 'en') + '">'
    + '<head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(title) + '</title><style>'
    // Paper, not phone: dark backgrounds print as a solid block of ink.
    + '@page{margin:14mm}'
    + '*{box-sizing:border-box}'
    + 'body{font-family:system-ui,"Segoe UI",Roboto,sans-serif;color:#111;background:#fff;'
    + 'margin:0;font-size:12pt;line-height:1.7}'
    + 'h1{font-size:20pt;margin:0 0 2mm}'
    + 'h2{font-size:13pt;margin:8mm 0 2mm;padding-bottom:1.5mm;border-bottom:1.5pt solid #111;'
    + 'page-break-after:avoid}'
    + '.meta{color:#555;font-size:10pt;margin-bottom:2mm}'
    + '.r{display:flex;justify-content:space-between;gap:6mm;padding:1.4mm 0;'
    + 'border-bottom:.4pt solid #ddd}'
    + '.k{color:#444}'
    + '.v{font-weight:700;text-align:end;white-space:nowrap;'
    + 'direction:ltr;unicode-bidi:isolate}'
    + '.v.mixed{direction:inherit;unicode-bidi:normal}'
    + '.note{color:#666;font-style:italic}'
    + '.find{padding-inline-start:6mm}.find li{margin-bottom:3mm;page-break-inside:avoid}'
    + '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}'
    + 'figure{margin:0;page-break-inside:avoid}'
    + 'figure img{width:100%;height:34mm;object-fit:cover;border-radius:2mm;display:block}'
    + 'figcaption{font-size:8.5pt;color:#444;margin-top:1mm;line-height:1.45}'
    + 'footer{margin-top:8mm;padding-top:3mm;border-top:.4pt solid #ccc;'
    + 'color:#666;font-size:9pt}'
    + '</style></head><body>'
    + '<h1>' + esc(title) + '</h1>'
    + '<div class="meta">' + esc((ar ? 'الاسم: ' : 'Name: ') + (profile.name || '\u2014'))
    + ' \u00b7 ' + esc((ar ? 'الفترة: آخر ' : 'Period: last ') + n + (ar ? ' يوم' : ' days'))
    + ' \u00b7 ' + esc(fmtDate(Date.now())) + '</div>'
    + H.join('')
    + '<footer>' + esc(ar
      ? 'تقرير مولّد من تطبيق ' + t('app_name') + '. أرقام الأيض والصرف تقديرية وليست تشخيصاً طبياً.'
      : 'Generated by ' + t('app_name') + '. Metabolic figures are estimates, not a medical diagnosis.')
    + '</footer></body></html>';
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
