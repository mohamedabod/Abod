/* =====================================================================
 * app.js — Aboud Sayem v4.0
 * React 18 via React.createElement. ES5 ONLY (see utils.js header).
 * ===================================================================== */

var h = React.createElement;
var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;

/* ---------------------------------------------------------------------
 * Global re-render + native state cache
 * ------------------------------------------------------------------- */

var _bump = null;
function refresh() { if (_bump) _bump(function (n) { return n + 1; }); }

var BAND = { status: 'idle', hr: 0, battery: -1, name: '', address: '', saved: false, auto: false };
var SENSORS = { steps: 0, activeMinutes: 0, calories: 0, cadence: 0, level: 'still', floors: 0, elevationM: 0, lux: -1, hasStepSensor: false, permission: false, running: false };
var PERMS = { bluetooth: false, activity: false, location: false, camera: false, notifications: false };
var ROUTE = { tracking: false, paused: false, points: 0, distanceM: 0, elapsedMs: 0, paceSecPerKm: 0, elevationM: 0, accuracy: -1, error: '', hasPermission: false };
var ROUTE_PATH = [];
var INVENTORY = {};
var HEALTH = { status: '', granted: 0, total: 11, syncing: false, lastResult: null };

/** Set while a photo picker is open, so the result lands on the right form. */
var _photoTarget = null;

/** Native -> JS entry point (called from JsBridge.java). */
window.__onNative = function (type, data) {
  if (type === 'band') {
    BAND = m(BAND, data || {});
    recordHeartRate(BAND.hr);
  } else if (type === 'sensors') {
    SENSORS = m(SENSORS, data || {});
  } else if (type === 'perms') {
    PERMS = m(PERMS, data || {});
  } else if (type === 'route') {
    ROUTE = m(ROUTE, data || {});
    if (ROUTE.tracking && ROUTE.points > 1) ROUTE_PATH = N.routePath(300);
  } else if (type === 'sleep') {
    if (applySleepEstimate([data])) recomputeStats();
  } else if (type === 'photo') {
    if (_photoTarget) _photoTarget(data && data.id ? data.id : '');
  } else if (type === 'healthState') {
    HEALTH = m(HEALTH, data || {});
    HEALTH.syncing = (data && data.granted === -1) || (data && data.syncing) || false;
    if (data && data.granted >= 0) HEALTH.granted = data.granted;
    S.set('health', m(S.get('health', {}), { status: HEALTH.status, granted: HEALTH.granted }));
  } else if (type === 'health') {
    HEALTH.syncing = false;
    HEALTH.lastResult = applyHealthSync(data);
    HEALTH.lastResult.empty = healthPayloadEmpty(data);
    recomputeStats();
    if (HEALTH.lastResult.error) {
      toast(t('hc_error') + ': ' + HEALTH.lastResult.error);
    } else if (HEALTH.lastResult.empty) {
      // Connected and permitted, but nothing is in the store: the user has
      // no bridge app writing Huawei data into Health Connect yet.
      toast(t('hc_empty_short'));
    } else {
      toast(t('hc_result') + ' — '
        + num(HEALTH.lastResult.days) + ' ' + t('hc_days') + ' · '
        + num(HEALTH.lastResult.workouts) + ' ' + t('hc_workouts'));
    }
  }
  refresh();
};

window.__onResume = function () {
  pullNative();
  // Permissions may have been changed in the Health Connect app while we
  // were backgrounded, so re-read them rather than trusting the cache.
  N.call('healthRefresh');
  refresh();
};

function pullNative() {
  if (!N.ok()) return;
  BAND = m(BAND, N.bandState());
  SENSORS = m(SENSORS, N.sensorsState());
  PERMS = m(PERMS, N.permsState());
  ROUTE = m(ROUTE, N.routeState());
}

/**
 * Rolls live HR into the running fast so the history entry has real data.
 * The band notifies roughly once per second, so the object is mutated in
 * memory and only flushed to localStorage once a minute.
 */
var _hrFlushedAt = 0;
function recordHeartRate(hr) {
  if (!hr || hr <= 0) return;
  var cf = S.data().currentFast;
  if (!cf || !cf.active) return;
  cf.hrSum = (cf.hrSum || 0) + hr;
  cf.hrCount = (cf.hrCount || 0) + 1;
  if (hr > (cf.hrMax || 0)) cf.hrMax = hr;
  var now = Date.now();
  if (now - _hrFlushedAt > 60000) {
    _hrFlushedAt = now;
    S.save();
  }
}

/* ---------------------------------------------------------------------
 * Toast
 * ------------------------------------------------------------------- */

var _notifTimer = null;
function toast(msg) {
  var el = document.getElementById('app-notif');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-notif';
    el.className = 'notif';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(_notifTimer);
  setTimeout(function () { el.className = 'notif show'; }, 20);
  _notifTimer = setTimeout(function () { el.className = 'notif'; }, 2600);
}

/**
 * Pushes reminder settings into the native scheduler.
 *
 * Called after anything that changes what a reminder should say or when it
 * should fire — including stats, since the encouragement copy quotes the
 * personal best and the current streak.
 */
function syncReminders() {
  if (!N.ok()) return;
  var r = S.get('settings.reminders', {});
  var stats = S.get('stats', {});
  var win = effectiveWindow();
  N.call('setReminderConfig', JSON.stringify({
    water: r.water !== false,
    motivation: r.motivation !== false,
    window: r.window !== false,
    checkin: r.checkin !== false,
    supplement: !!r.supplement,
    nudge: !!r.nudge,
    windowStart: win.start,
    windowEnd: win.end,
    checkinTime: r.checkinTime || '20:00',
    supplementTime: r.supplementTime || '18:00',
    nudgeTime: r.nudgeTime || '22:00',
    bestFastMs: stats.longest || 0,
    streak: stats.currentStreak || 0
  }));
}

/**
 * Pushes the expert engine's conclusions into the native scheduler.
 *
 * Two slots, deliberately: a daily one carrying whatever the analysis rates
 * most worth changing this week, and a protein one that fires inside the
 * eating window when the target is too large for one sitting. Both are
 * turned off outright when the data does not support saying anything —
 * a notification that fires with nothing to say trains the user to swipe.
 */
var _insTimer = null;
var _insLast = '';

/** Coalesces the storage writes of one user action into a single analysis. */
function scheduleInsightSync() {
  clearTimeout(_insTimer);
  _insTimer = setTimeout(syncInsights, 2000);
}

function syncInsights() {
  if (!N.ok()) return;
  var list = [];
  try { list = expertInsights(); } catch (e) { list = []; }

  // Remember what the engine raised today so the coach can follow it up.
  if (list.length) { try { recordInsights(list); } catch (e) {} }

  var r = S.get('settings.reminders', {});
  var win = effectiveWindow();
  var dailyTime = r.insightTime || '11:00';
  var top = list.length && r.insight !== false ? list[0] : null;
  var stamp = (top ? top.title + '|' + top.text : '') + '|' + proteinTarget().grams
    + '|' + win.start + '|' + dailyTime + '|' + (r.protein !== false);
  if (stamp === _insLast) return;
  _insLast = stamp;

  N.call('setInsight', 'daily', !!top, dailyTime,
    top ? top.icon + ' ' + top.title : '',
    top ? notifBody(top.text) : '');

  // The protein split only makes sense while there is a target big enough to
  // warrant it; proteinTarget() already refuses to guess without a weight.
  var target = proteinTarget();
  var second = target.grams >= 100 ? Math.round(target.grams * 0.4) : 0;
  var wantProtein = second > 0 && r.protein !== false;
  N.call('setInsight', 'protein', wantProtein, win.start,
    wantProtein ? (isRTL() ? '🍗 جرعة البروتين التانية' : '🍗 Second protein dose')
      : '',
    wantProtein
      ? (isRTL()
        ? 'باقي ' + second + ' جم على هدف النهاردة. زبادي يوناني أو تونة أو واي '
          + 'دلوقتي بيوصلوك للهدف من غير ما تتقل معدتك في وجبة واحدة.'
        : second + 'g still to go today. Greek yoghurt, tuna or whey now gets you '
          + 'there without loading one meal.')
      : '');
}

/** Trims advice prose to something a notification can actually show. */
function notifBody(text) {
  if (!text) return '';
  if (text.length <= 230) return text;
  var cut = text.slice(0, 230);
  var stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('، '), cut.lastIndexOf('. '));
  return (stop > 120 ? cut.slice(0, stop + 1) : cut) + '…';
}

/* ---------------------------------------------------------------------
 * Fast actions
 * ------------------------------------------------------------------- */

function startFast(startTs, goal) {
  var now = Date.now();
  var start = startTs || now;
  if (start > now) start = now;
  S.set('currentFast', {
    active: true,
    startTime: start,
    pausedAt: null,
    elapsed: 0,
    goal: goal || S.get('settings.defaultGoal', 24),
    note: '',
    hrSum: 0, hrCount: 0, hrMax: 0,
    stepsAtStart: SENSORS.steps || 0
  });
  N.syncFast();
  N.call('vibrate', 40);
  toast(t('fast_started'));
  refresh();
}

function pauseFast() {
  var cf = S.get('currentFast', {});
  if (!cf.active || cf.pausedAt) return;
  cf.elapsed = fastElapsed(cf);
  cf.pausedAt = Date.now();
  cf.startTime = null;
  S.set('currentFast', cf);
  N.syncFast();
  refresh();
}

function resumeFast() {
  var cf = S.get('currentFast', {});
  if (!cf.active || !cf.pausedAt) return;
  cf.pausedAt = null;
  cf.startTime = Date.now();
  S.set('currentFast', cf);
  N.syncFast();
  refresh();
}

function stopFast() {
  var cf = S.get('currentFast', {});
  if (!cf.active) return;
  var dur = fastElapsed(cf);
  var goal = parseInt(cf.goal, 10) || 24;
  var steps = Math.max(0, (SENSORS.steps || 0) - (cf.stepsAtStart || 0));
  var end = Date.now();
  var entry = {
    id: uid(),
    start: end - dur,
    end: end,
    duration: dur,
    goal: goal,
    completed: dur / 3600000 >= goal,
    avgHr: cf.hrCount ? Math.round(cf.hrSum / cf.hrCount) : 0,
    maxHr: cf.hrMax || 0,
    steps: steps,
    phase: phaseIndexFor(dur / 3600000)
  };

  var hist = S.get('history', []);
  hist.push(entry);
  if (hist.length > 500) hist = hist.slice(hist.length - 500);
  S.set('history', hist);

  S.set('currentFast', m(S.defaults().currentFast, { goal: goal }));
  recomputeStats();
  N.syncFast();
  syncReminders();
  N.call('vibrate', 60);
  toast(t('fast_ended') + ' — ' + fmtShort(dur));
  refresh();
}

/** Retimes a running fast to a corrected start moment. */
function adjustFastStart(ts) {
  var cf = S.get('currentFast', {});
  if (!cf.active) return;
  if (cf.pausedAt) {
    // Paused: the clock is banked, so move the banked total instead. Time
    // spent paused must not be counted as fasted.
    cf.elapsed = Math.max(0, cf.pausedAt - ts);
  } else {
    cf.startTime = ts;
    cf.elapsed = 0;
  }
  S.set('currentFast', cf);
  N.syncFast();
  toast(t('saved'));
  refresh();
}

function setGoal(g) {
  var cf = S.get('currentFast', {});
  cf.goal = g;
  S.set('currentFast', cf);
  S.set('settings.defaultGoal', g);
  if (cf.active) N.syncFast();
  refresh();
}

/* ---------------------------------------------------------------------
 * Shared little components
 * ------------------------------------------------------------------- */

function Card(props) {
  return h('div', {
    className: (props.flat ? 'card-flat' : 'card') + ' anim' + (props.delay ? ' anim-' + props.delay : ''),
    style: props.style
  },
    props.title ? h('div', { className: 'card-title' },
      props.icon ? h(Icon, { name: props.icon, size: 18 }) : null,
      h('span', null, props.title),
      props.right ? h('span', { style: { marginInlineStart: 'auto' } }, props.right) : null
    ) : null,
    props.children);
}

/**
 * A signed number for display inside right-to-left text.
 *
 * The bidi algorithm treats a leading "-" as neutral and reorders it to the
 * visual end of the run, so -0.71 renders as "0.71-". Isolating the number
 * keeps the sign where it belongs without forcing the whole line to LTR.
 */
function signed(value, dp, suffix) {
  var txt = (value > 0 ? '+' : '') + num(value.toFixed(dp === undefined ? 1 : dp));
  return h('span', { className: 'num-ltr' }, txt + (suffix || ''));
}

function Stat(props) {
  return h('div', { className: 'stat-item' },
    h('div', { className: 'stat-val ' + (props.tone || '') }, props.value),
    h('div', { className: 'stat-label' }, props.label));
}

function Switch(props) {
  return h('button', {
    className: 'switch' + (props.on ? ' on' : ''),
    onClick: props.onChange,
    'aria-pressed': props.on ? 'true' : 'false'
  }, h('span', { className: 'switch-knob' }));
}

/** One reminder: an on/off switch, and a time field when it is a daily one. */
function ReminderToggle(props) {
  var r = S.get('settings.reminders', {});
  var on = props.k === 'supplement' || props.k === 'nudge'
    ? !!r[props.k]
    : r[props.k] !== false;

  function set(key, value) {
    var next = m({}, S.get('settings.reminders', {}));
    next[key] = value;
    S.set('settings.reminders', next);
    syncReminders();
    syncInsights();
    refresh();
  }

  return h('div', { className: 'row' },
    h('div', { className: 'row-main' },
      h('div', { className: 'row-title' }, props.label),
      props.hint ? h('div', { className: 'row-sub' }, props.hint) : null),
    props.timeKey && on
      ? h(TextField, {
          value: r[props.timeKey] || props.defaultTime || '20:00',
          placeholder: props.defaultTime || '20:00',
          onCommit: function (v) { set(props.timeKey, v); }
        })
      : null,
    h(Switch, { on: on, onChange: function () { set(props.k, !on); } }));
}

/**
 * A destructive row action that will not fire on the first tap.
 *
 * A modal for deleting one logged meal is more ceremony than the act
 * deserves, but an immediate delete sitting behind a small target is how
 * records quietly disappear. Arming costs an extra tap only to the person
 * who meant it, and the button disarms itself so a stray tap cannot leave a
 * primed delete waiting in a list.
 */
function DeleteButton(props) {
  var st = useState(false); var armed = st[0], setArmed = st[1];

  useEffect(function () {
    if (!armed) return;
    var id = setTimeout(function () { setArmed(false); }, 3000);
    return function () { clearTimeout(id); };
  }, [armed]);

  if (!armed) {
    return h('button', {
      className: 'icon-btn danger',
      'aria-label': props.label || t('delete'),
      onClick: function () { setArmed(true); }
    }, h(Icon, { name: 'trash', size: 17 }));
  }

  return h('button', {
    className: 'btn btn-sm btn-danger confirm-pill',
    'aria-label': props.label || t('delete'),
    onClick: function () { setArmed(false); props.onConfirm(); }
  }, t('confirm_delete'));
}

function SettingRow(props) {
  return h('div', { className: 'row' },
    h('div', { className: 'row-main' },
      h('div', { className: 'row-title' }, props.label),
      props.hint ? h('div', { className: 'row-sub' }, props.hint) : null),
    props.children);
}

function Empty(props) {
  return h('div', { className: 'empty' }, props.text);
}

/* ---------------------------------------------------------------------
 * Icons
 *
 * Emoji were the loudest "amateur app" tell: they render differently on
 * every device, cannot take the accent colour, and sit off the baseline.
 * These are stroke paths on a 24px grid, inheriting currentColor.
 * Emoji survive only where they are content rather than UI — the mood
 * faces and the drink list.
 * ------------------------------------------------------------------- */

var ICONS = {
  timer: ['M10 2h4', 'M12 5.5a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z', 'M12 9.5v4.3l3 1.7'],
  meals: ['M6 3v6a2.5 2.5 0 0 0 5 0V3', 'M8.5 11v10',
    'M17 3c1.9 0 3 1.9 3 4s-1.1 4-3 4-3-1.9-3-4 1.1-4 3-4Z', 'M17 11v10'],
  droplet: ['M12 3.2c3.2 3.7 6 6.6 6 10.2a6 6 0 1 1-12 0c0-3.6 2.8-6.5 6-10.2Z'],
  chart: ['M3 20.5h18', 'M7 20.5v-6.5', 'M12 20.5V8.5', 'M17 20.5v-9.5'],
  coach: ['M9 18h6', 'M10 21.5h4',
    'M12 2.5a6.5 6.5 0 0 0-4 11.6c.7.6 1 1.4 1 2.4h6c0-1 .3-1.8 1-2.4A6.5 6.5 0 0 0 12 2.5Z'],
  settings: ['M4 21v-6', 'M4 11V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-4', 'M20 13V3',
    'M1.5 15h5', 'M9.5 8h5', 'M17.5 17h5'],
  heart: ['M20.4 5.9a5.2 5.2 0 0 0-7.4 0L12 6.9l-1-1a5.2 5.2 0 0 0-7.4 7.4L12 21.8l8.4-8.5a5.2 5.2 0 0 0 0-7.4Z'],
  activity: ['M22 12h-4l-3 8.5L9 3.5 6 12H2'],
  route: ['M9 20.5 3 22.5V6l6-2m0 16.5 6-2m-6 2V4m6 14.5 6 2V6l-6-2m0 16.5V4'],
  camera: ['M21 20.5H3a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3.5l1.7-3h7.6l1.7 3H21a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z',
    'M12 16.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  image: ['M21 19.5H3a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2Z',
    'M8.5 10.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z', 'M23 15.5 17 10 3 19.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  trash: ['M3.5 6h17', 'M8.5 6V3.5h7V6', 'M18.5 6l-1 14.5h-11L5.5 6', 'M10 10.5v6', 'M14 10.5v6'],
  check: ['M20 6.5 9 17.5l-5-5'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  back: ['M19 12H5', 'M11 18l-6-6 6-6'],
  bluetooth: ['M6.5 7 17.5 17.5 12 23V1l5.5 5.5L6.5 17'],
  moon: ['M20.8 13a8.8 8.8 0 1 1-9.8-9.8A6.9 6.9 0 0 0 20.8 13Z'],
  body: ['M12 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z', 'M12 8v7', 'M6.5 11h11',
    'M8.5 21.5 12 15l3.5 6.5'],
  flame: ['M12 22a7 7 0 0 0 7-7c0-4.2-3.2-6.3-4.7-9.3-.7 2.6-2 3.2-3.1 4.7C10 8 9 6.4 9 4.7 6.9 6.8 5 9.4 5 15a7 7 0 0 0 7 7Z'],
  link: ['M10.5 13.5a5 5 0 0 0 7.4.4l2.6-2.6a5 5 0 0 0-7-7l-1.5 1.5',
    'M13.5 10.5a5 5 0 0 0-7.4-.4l-2.6 2.6a5 5 0 0 0 7 7l1.5-1.5'],
  play: ['M6.5 4.3 19 12 6.5 19.7V4.3Z'],
  pause: ['M8.5 5v14', 'M15.5 5v14'],
  stop: ['M6.5 6.5h11v11h-11Z'],
  dumbbell: ['M6.5 6.5v11', 'M17.5 6.5v11', 'M3 9.5v5', 'M21 9.5v5', 'M6.5 12h11'],
  building: ['M4 21.5V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16.5', 'M14 21.5V11h4a2 2 0 0 1 2 2v8.5',
    'M2 21.5h20', 'M8 7h2', 'M8 11h2', 'M8 15h2'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5.2l3.4 2'],
  sparkles: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M6.3 6.3 9 9', 'M15 15l2.7 2.7',
    'M17.7 6.3 15 9', 'M9 15l-2.7 2.7'],
  save: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7.5 10.5 12 15l4.5-4.5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M16.5 7.5 12 3 7.5 7.5', 'M12 3v12'],
  share: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M8.6 13.5l6.8 4', 'M15.4 6.5l-6.8 4'],
  pill: ['M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7l-6 6Z', 'M8 8l8 8'],
  battery: ['M17 7H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z', 'M22 11v2'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z', 'M12 8.5v6', 'M9 11.5h6'],
  ban: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M5.6 5.6l12.8 12.8'],
  trophy: ['M8 21h8', 'M12 17.5V21', 'M6 4h12v5a6 6 0 0 1-12 0V4Z',
    'M6 6H3.5v1.5A3.5 3.5 0 0 0 7 11', 'M18 6h2.5v1.5A3.5 3.5 0 0 1 17 11'],
  sensor: ['M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M8.5 8.5a5 5 0 0 0 0 7', 'M15.5 8.5a5 5 0 0 1 0 7',
    'M5.5 5.5a9 9 0 0 0 0 13', 'M18.5 5.5a9 9 0 0 1 0 13'],
  scale: ['M4 21.5h16', 'M12 3v18.5', 'M12 3 4 9h16L12 3Z'],
  edit: ['M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z'],
  calendar: ['M19 4.5H5a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2Z',
    'M3 10h18', 'M8 2.5v4', 'M16 2.5v4'],
  palette: ['M12 21.5a9.5 9.5 0 1 1 0-19c5.2 0 9.5 3.6 9.5 8 0 2.5-2 4.5-4.5 4.5h-2a1.8 1.8 0 0 0-1.3 3c.4.5.6 1 .6 1.6 0 1-.8 1.9-2.3 1.9Z',
    'M7.5 12.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M10.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
    'M15.5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'],
  moonStars: ['M20.8 13a8.8 8.8 0 1 1-9.8-9.8A6.9 6.9 0 0 0 20.8 13Z', 'M18 3v3', 'M16.5 4.5h3'],
  repeat: ['M17 2.5 20.5 6 17 9.5', 'M3.5 11V9a3 3 0 0 1 3-3h14', 'M7 21.5 3.5 18 7 14.5',
    'M20.5 13v2a3 3 0 0 1-3 3h-14'],
  star: ['M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.6l6.5-.9L12 2.8Z']
};

function Icon(props) {
  var size = props.size || 20;
  var paths = ICONS[props.name];
  if (!paths) return null;
  var children = [];
  for (var i = 0; i < paths.length; i++) {
    children.push(h('path', { key: 'p' + i, d: paths[i] }));
  }
  return h('svg', {
    className: 'ic' + (props.inline ? ' ic-inline' : '') + (props.className ? ' ' + props.className : ''),
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: props.weight || 1.8,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    style: props.color ? { color: props.color } : null,
    'aria-hidden': 'true'
  }, children);
}

/**
 * Number input that does NOT fight the user while typing.
 *
 * The previous version parsed and clamped on every keystroke, so clearing the
 * height field and typing "1" snapped it straight to the minimum (90) and the
 * next keystrokes were lost. Now the raw text is kept locally and only parsed,
 * clamped and saved when the field loses focus.
 */
function NumField(props) {
  var st = useState(props.value === null || props.value === undefined ? '' : String(props.value));
  var raw = st[0], setRaw = st[1];

  function commit() {
    var v = parseFloat(raw);
    if (isNaN(v)) { setRaw(String(props.value)); return; }
    if (props.min !== undefined && v < props.min) v = props.min;
    if (props.max !== undefined && v > props.max) v = props.max;
    setRaw(String(v));
    props.onCommit(v);
  }

  return h('input', {
    className: 'setting-input',
    type: 'number',
    inputMode: 'decimal',
    value: raw,
    onChange: function (e) { setRaw(e.target.value); },
    onBlur: commit,
    onKeyDown: function (e) { if (e.key === 'Enter' && e.target.blur) e.target.blur(); }
  });
}

/** Text input with the same commit-on-blur behaviour. */
function TextField(props) {
  var st = useState(props.value === null || props.value === undefined ? '' : String(props.value));
  var raw = st[0], setRaw = st[1];
  return h('input', {
    className: props.className || 'setting-input',
    type: 'text',
    value: raw,
    placeholder: props.placeholder || '',
    onChange: function (e) {
      setRaw(e.target.value);
      if (props.onInput) props.onInput(e.target.value);
    },
    onBlur: function () { if (props.onCommit) props.onCommit(raw); },
    onKeyDown: function (e) { if (e.key === 'Enter' && e.target.blur) e.target.blur(); }
  });
}

/** 1-5 selector used by the daily check-in. */
function Scale(props) {
  var btns = [];
  for (var i = 1; i <= 5; i++) {
    (function (v) {
      btns.push(h('button', {
        key: 'sc' + props.name + v,
        className: 'scale-btn' + (props.value === v ? ' active' : ''),
        onClick: function () { props.onChange(v); }
      }, props.icons ? props.icons[v - 1] : num(v)));
    })(i);
  }
  return h('div', { className: 'scale-row' },
    h('div', { className: 'scale-label' }, props.label),
    h('div', { className: 'scale-btns' }, btns));
}

/* ---------------------------------------------------------------------
 * Charts
 *
 * Bars and dots read as a homework plot. A filled gradient area with a
 * stroked line on top is what a health app looks like, and it survives being
 * shrunk to a 30px sparkline inside a tile.
 * ------------------------------------------------------------------- */

var _gradSeq = 0;

/** Area + line chart. `values` may contain nulls for missing days. */
function AreaChart(props) {
  var values = props.values || [];
  var w = props.width || 320;
  var hh = props.height || 150;
  var pad = props.pad === undefined ? 10 : props.pad;
  var colour = props.color || 'var(--primary)';

  var real = [];
  var i;
  for (i = 0; i < values.length; i++) {
    if (values[i] !== null && values[i] !== undefined) real.push(values[i]);
  }
  if (real.length < 2) return null;

  // An overlay (a trend line) shares the axis, so it has to be inside the
  // extent too — scaling to the raw series alone clips it.
  var overlay = props.overlay || null;
  var extent = real.slice();
  if (overlay) {
    for (i = 0; i < overlay.length; i++) {
      if (overlay[i] !== null && overlay[i] !== undefined) extent.push(overlay[i]);
    }
  }
  var min = Math.min.apply(null, extent);
  var max = Math.max.apply(null, extent);
  if (max - min < 0.0001) { max = min + 1; }
  // Breathing room so the line never sits on the frame.
  var span = max - min;
  min -= span * 0.15;
  max += span * 0.15;

  var stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  function px(idx) { return pad + idx * stepX; }
  function py(v) { return hh - pad - ((v - min) / (max - min)) * (hh - pad * 2); }

  var line = '', area = '', started = false, lastX = pad, firstX = pad;
  for (i = 0; i < values.length; i++) {
    var v = values[i];
    if (v === null || v === undefined) continue;
    var x = px(i), y = py(v);
    if (!started) { line += 'M' + x.toFixed(1) + ' ' + y.toFixed(1); firstX = x; started = true; }
    else line += 'L' + x.toFixed(1) + ' ' + y.toFixed(1);
    lastX = x;
  }
  area = line + 'L' + lastX.toFixed(1) + ' ' + (hh - pad).toFixed(1)
    + 'L' + firstX.toFixed(1) + ' ' + (hh - pad).toFixed(1) + 'Z';

  var gid = 'g' + (++_gradSeq);
  var dots = [];
  if (props.dots !== false) {
    for (i = values.length - 1; i >= 0; i--) {
      if (values[i] === null || values[i] === undefined) continue;
      dots.push(h('circle', {
        key: 'd', cx: px(i).toFixed(1), cy: py(values[i]).toFixed(1),
        // Punched out with the page background so the dot reads as a dot in
        // either theme; a literal dark value leaves a hole on light.
        r: 3.5, fill: colour, stroke: 'var(--bg)', strokeWidth: 2
      }));
      break;
    }
  }

  var overlayPath = '';
  if (overlay) {
    var op = false;
    for (i = 0; i < overlay.length; i++) {
      var ov = overlay[i];
      if (ov === null || ov === undefined) continue;
      overlayPath += (op ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(ov).toFixed(1);
      op = true;
    }
  }

  return h('svg', {
    className: 'chart-box', width: '100%', height: hh,
    viewBox: '0 0 ' + w + ' ' + hh, preserveAspectRatio: 'none'
  },
    h('defs', null,
      h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' },
        h('stop', { offset: '0%', stopColor: colour, stopOpacity: 0.38 }),
        h('stop', { offset: '100%', stopColor: colour, stopOpacity: 0 }))),
    h('path', { d: area, fill: 'url(#' + gid + ')' }),
    h('path', {
      d: line, fill: 'none', stroke: colour, strokeWidth: props.stroke || 2,
      strokeLinecap: 'round', strokeLinejoin: 'round',
      vectorEffect: 'non-scaling-stroke',
      // The raw series steps back when an overlay carries the signal.
      opacity: overlay ? 0.42 : 1
    }),
    overlayPath
      ? h('path', {
          d: overlayPath, fill: 'none',
          stroke: props.overlayColor || '#f5a623', strokeWidth: 2.4,
          strokeLinecap: 'round', strokeLinejoin: 'round',
          vectorEffect: 'non-scaling-stroke'
        })
      : null,
    dots);
}

/** Rounded bar series, used where each day is a discrete total. */
function BarSeries(props) {
  var values = props.values || [];
  var labels = props.labels || [];
  var colour = props.color || 'var(--primary)';
  var hh = props.height || 120;
  if (!values.length) return null;

  var max = 1;
  var i;
  for (i = 0; i < values.length; i++) if ((values[i] || 0) > max) max = values[i];

  var cols = [];
  for (i = 0; i < values.length; i++) {
    (function (v, idx) {
      var pct = v ? Math.max(5, Math.round(v / max * 100)) : 3;
      cols.push(h('div', { key: 'bs' + idx, className: 'bar-col' },
        h('div', {
          className: 'bar' + (v ? '' : ' dim'),
          style: { height: pct + '%', background: v ? colour : undefined }
        }),
        labels[idx] !== undefined
          ? h('div', { className: 'bar-label' }, labels[idx]) : null));
    })(values[i], i);
  }

  // Bars are measured from zero, which is the honest baseline but flattens a
  // narrow range. The average line is what makes each day readable against it.
  var avgLine = null;
  if (props.avg) {
    var avgPct = Math.max(0, Math.min(100, props.avg / max * 100));
    avgLine = h('div', {
      className: 'bar-avg',
      style: { bottom: 'calc(' + avgPct.toFixed(1) + '% + 15px)' }
    });
  }

  return h('div', { className: 'bar-wrap' },
    h('div', { className: 'bar-chart', style: { height: hh + 'px' } }, cols),
    avgLine);
}

/* ---------------------------------------------------------------------
 * Dashboard tiles
 * ------------------------------------------------------------------- */

function MetricTile(props) {
  var hasValue = props.value !== null && props.value !== undefined && props.value !== '';
  return h('button', {
    className: 'tile anim' + (hasValue ? '' : ' tile-empty'),
    onClick: props.onClick
  },
    h('div', { className: 'tile-head' },
      h(Icon, { name: props.icon, size: 14 }),
      h('span', null, props.label)),
    h('div', { className: 'tile-val', style: { color: hasValue ? props.color : undefined } },
      hasValue ? props.value : '—',
      props.unit ? h('span', { className: 'tile-unit' }, props.unit) : null),
    props.sub ? h('div', { className: 'tile-sub' }, props.sub) : null,
    props.spark && props.spark.length > 1
      ? h('div', { className: 'tile-spark' },
          h(AreaChart, {
            values: props.spark, color: props.color, width: 150, height: 30,
            pad: 3, stroke: 1.8, dots: false
          }))
      : null);
}

/** Full-screen detail for one metric, opened from a tile. */
function DetailSheet(props) {
  return h('div', { className: 'sheet' },
    h('div', { className: 'sheet-hdr' },
      h('button', { className: 'back-btn', onClick: props.onClose },
        h(Icon, { name: 'back', size: 22 })),
      h('span', { className: 'subview-title' }, props.title)),
    h('div', { className: 'sheet-body' }, props.children));
}

/* ---------------------------------------------------------------------
 * Timer ring
 * ------------------------------------------------------------------- */

function Ring(props) {
  var size = 236, stroke = 13;
  var r = (size - stroke) / 2;
  var circ = 2 * Math.PI * r;
  var pct = props.pct;
  if (!(pct >= 0)) pct = 0;
  if (pct > 1) pct = 1;

  return h('div', { className: 'ring-wrap' },
    h('svg', { className: 'ring-svg', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size },
      h('circle', {
        cx: size / 2, cy: size / 2, r: r, fill: 'none',
        stroke: '#2a2a4a', strokeWidth: stroke
      }),
      h('circle', {
        cx: size / 2, cy: size / 2, r: r, fill: 'none',
        stroke: props.color, strokeWidth: stroke, strokeLinecap: 'round',
        strokeDasharray: circ, strokeDashoffset: circ * (1 - pct),
        style: { transition: 'stroke-dashoffset .5s linear, stroke .4s' }
      })),
    h('div', { className: 'ring-center' }, props.children));
}

function PhaseTimeline(props) {
  var hours = props.hours;
  var n = PHASES.length;
  var segs = [];
  var i;

  for (i = 0; i < n; i++) {
    var p = PHASES[i];
    segs.push(h('div', {
      key: 'sg' + i,
      className: 'timeline-seg',
      style: { background: hours >= p.from ? p.color : '#2a2a4a' }
    }));
  }

  // The strip is a phase scale, not a time axis: segments are equal width so
  // the early phases -- where most fasts actually live -- stay readable, and
  // the open-ended 72h+ phase can be drawn at all.
  //
  // Labels and marker must therefore use that same scale. They previously did
  // not: labels were spread by space-between (a 1/6 step across 7 items) while
  // segment boundaries fall on 1/7, and the marker was placed linearly at
  // hours/72. At hour 14 the marker landed at 19.4%, between the "4h" and
  // "12h" labels, so a 14-hour fast read as roughly 8.
  var labels = [];
  for (i = 0; i < n; i++) {
    (function (idx) {
      labels.push(h('span', {
        key: 'lb' + idx,
        className: 'timeline-label',
        // Boundary i sits at i/n; the last label is pinned to the far edge.
        style: { insetInlineStart: (idx / n * 100).toFixed(2) + '%' }
      }, PHASES[idx].from + (isRTL() ? 'س' : 'h')));
    })(i);
  }

  // Marker: which segment, plus how far through that segment.
  var idxNow = phaseIndexFor(hours);
  var seg = PHASES[idxNow];
  var segEnd = idxNow + 1 < n ? PHASES[idxNow + 1].from : seg.from + 24;
  var within = segEnd > seg.from ? (hours - seg.from) / (segEnd - seg.from) : 0;
  if (within < 0) within = 0;
  if (within > 1) within = 1;
  var pos = Math.min(1, (idxNow + within) / n);

  return h('div', null,
    h('div', { className: 'timeline-wrap' },
      h('div', { className: 'timeline' }, segs),
      hours > 0
        ? h('div', {
            className: 'timeline-marker',
            style: { insetInlineStart: 'calc(' + (pos * 100).toFixed(2) + '% - 1.5px)' }
          })
        : null),
    h('div', { className: 'timeline-labels' }, labels));
}


/* ---------------------------------------------------------------------
 * Home
 * ------------------------------------------------------------------- */

function HomePage() {
  var st = useState(false); var showStart = st[0], setShowStart = st[1];
  var se = useState(false); var showEdit = se[0], setShowEdit = se[1];
  var sg = useState(false); var showGoal = sg[0], setShowGoal = sg[1];
  var cf = S.get('currentFast', {});
  var ms = fastElapsed(cf);
  var hours = ms / 3600000;
  var goal = parseInt(cf.goal, 10) || S.get('settings.defaultGoal', 24);
  var phase = phaseFor(hours);
  var pct = goal > 0 ? (hours / goal) : 0;
  var pctShown = Math.min(100, Math.floor(pct * 100));
  var nextMs = msToNextPhase(hours);

  var goalBtns = [];
  for (var i = 0; i < GOAL_OPTIONS.length; i++) {
    (function (g) {
      goalBtns.push(h('button', {
        key: 'g' + g,
        className: 'goal-btn' + (goal === g ? ' active' : ''),
        onClick: function () { setGoal(g); }
      }, num(g) + (isRTL() ? 'س' : 'h')));
    })(GOAL_OPTIONS[i]);
  }

  // One filled button per state, and only where a primary action honestly
  // exists. Mid-fast, before the goal, there is nothing the user should be
  // urged to press — the ring is the content, so both controls stay quiet and
  // nothing competes with it. The moment the goal lands, finishing becomes
  // the natural next step and earns the fill.
  var reached = cf.active && hours >= goal;
  var controls;
  if (!cf.active) {
    controls = h('div', { className: 'btn-group' },
      h('button', { className: 'btn btn-primary', onClick: function () { startFast(Date.now(), goal); } },
        h(Icon,{name:'play',size:17}), t('start_fasting')),
      h('button', { className: 'btn btn-outline', onClick: function () { setShowStart(true); } },
        h(Icon,{name:'clock',size:17}), t('set_start_time')));
  } else if (cf.pausedAt) {
    // Paused is a stalled state; getting going again is the way out of it.
    controls = h('div', { className: 'btn-group' },
      h('button', { className: 'btn btn-primary', onClick: resumeFast },
        h(Icon,{name:'play',size:17}), t('resume')),
      h('button', { className: 'btn btn-outline', onClick: stopFast },
        h(Icon,{name:'stop',size:17}), t('stop')));
  } else {
    controls = h('div', { className: 'btn-group' },
      h('button', {
        className: 'btn ' + (reached ? 'btn-primary' : 'btn-outline'),
        onClick: stopFast
      }, h(Icon,{name:'stop',size:17}), t('stop')),
      h('button', { className: 'btn btn-outline', onClick: pauseFast },
        h(Icon,{name:'pause',size:17}), t('pause')));
  }

  // Reaching the goal is the one moment on this screen worth announcing; it
  // is also what promotes "end" to the primary action, so the label and the
  // button change together rather than the button changing on its own.
  var stateLabel = !cf.active
    ? t('idle_state')
    : cf.pausedAt ? t('paused_state')
    : reached ? t('reached_state')
    : t('running_state');

  return h('div', null,
    h('div', { className: 'hero anim' },
      h(Ring, { pct: pct, color: phase.color },
        h('div', { className: 'timer-time' }, fmtClock(ms)),
        cf.active
          ? h('div', { className: 'timer-pct' }, num(pctShown) + '% ' + t('of_goal'))
          : h('div', { className: 'timer-goal' }, t('start_prompt')),
        h('div', { className: 'timer-goal' },
          t('fasting_goal') + ': ' + num(goal) + ' ' + t('hours')),
        h('div', { className: 'timer-state' + (reached ? ' reached' : '') }, stateLabel)),

      h('div', { className: 'phase-name', style: { color: phase.color } }, phaseName(phase)),
      h('div', { className: 'phase-desc' }, phaseDesc(phase)),
      cf.active && nextMs > 0
        ? h('div', { className: 'phase-next' }, t('next_phase_in') + ' ' + fmtShort(nextMs))
        : null,

      h(PhaseTimeline, { hours: hours }),

      // Picking a goal belongs to the moment before a fast starts. Leaving the
      // row live mid-fast meant one stray tap silently rewrote the percentage
      // and the phase countdown for a fast already 14 hours old. Changing it
      // is still possible while fasting — it just has to be meant.
      !cf.active
        ? h('div', { className: 'goal-strip' },
            h('div', { className: 'goal-selector' }, goalBtns))
        : null,
      controls,

      cf.active ? h('div', { className: 'btn-group', style: { marginTop: '10px' } },
        h('button', {
          className: 'btn btn-sm btn-ghost',
          onClick: function () { setShowEdit(true); }
        }, h(Icon, { name: 'clock', size: 15 }), t('edit_start')),
        h('button', {
          className: 'btn btn-sm btn-ghost',
          onClick: function () { setShowGoal(true); }
        }, h(Icon, { name: 'timer', size: 15 }), t('change_goal'))) : null,

      cf.active && hours >= 48
        ? h('div', { className: 'alert-box' }, t('long_fast_warn'))
        : null),

    h('div', { className: 'section-title' }, t('dashboard')),
    h(Dashboard, null),

    showStart ? h(StartTimeModal, {
      goal: goal,
      onClose: function () { setShowStart(false); },
      onPick: function (ts) { setShowStart(false); startFast(ts, goal); }
    }) : null,

    showEdit ? h(StartTimeModal, {
      title: t('edit_start'),
      onClose: function () { setShowEdit(false); },
      onPick: function (ts) { setShowEdit(false); adjustFastStart(ts); }
    }) : null,

    showGoal ? h(GoalModal, {
      goal: goal,
      hours: hours,
      onClose: function () { setShowGoal(false); },
      onPick: function (g) { setShowGoal(false); setGoal(g); }
    }) : null);
}

/**
 * Changing the goal of a fast already under way.
 *
 * Shown rather than inlined because the consequence is not obvious: the
 * percentage, the projected finish and the next-phase countdown are all
 * recomputed against the new number, on a fast that may be most of a day
 * old. The sheet states what the change would do before it is made.
 */
function GoalModal(props) {
  var st = useState(props.goal); var pick = st[0], setPick = st[1];

  var btns = [];
  for (var i = 0; i < GOAL_OPTIONS.length; i++) {
    (function (g) {
      btns.push(h('button', {
        key: 'gm' + g,
        className: 'goal-btn' + (pick === g ? ' active' : ''),
        onClick: function () { setPick(g); }
      }, num(g) + (isRTL() ? 'س' : 'h')));
    })(GOAL_OPTIONS[i]);
  }

  var pct = Math.min(100, Math.round(props.hours / pick * 100));
  var left = (pick - props.hours) * 3600000;

  return h('div', { className: 'modal-overlay', onClick: props.onClose },
    h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
      h('h3', null, t('change_goal')),
      h('div', { className: 'goal-selector wrap' }, btns),
      h('div', { className: 'info-box', style: { textAlign: 'center' } },
        left > 0
          ? num(pct) + '% ' + t('of_goal') + ' · ' + t('remaining_short') + ' ' + fmtShort(left)
          : num(pct) + '% ' + t('of_goal') + ' · ' + t('goal_reached')),
      h('div', { className: 'modal-btns' },
        h('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () { props.onPick(pick); }
        }, t('save')),
        h('button', { className: 'btn btn-outline btn-sm', onClick: props.onClose }, t('cancel')))));
}

/* ---------------------------------------------------------------------
 * Dashboard
 * ------------------------------------------------------------------- */

var _setDetail = null;
var _curDetail = null;

function Dashboard() {
  var fastS = seriesFastHours(14);
  var stepsS = seriesHealth('steps', 14);
  var sleepS = seriesHealth('sleepMs', 14);
  var hrS = seriesHealth('restingHr', 14);
  var weightS = seriesWeight(14);

  var macros = todayMacros();
  var target = proteinTarget();
  var water = S.get('water', {});
  var el = electrolytesToday();
  var connected = BAND.status === 'connected' && BAND.hr > 0;

  // Live step count beats yesterday's synced total for "today".
  var stepsToday = SENSORS.steps || lastValue(stepsS);
  var sleepLast = lastValue(sleepS);
  var hrLatest = connected ? BAND.hr : lastValue(hrS);
  var weightLatest = lastValue(weightS);
  var sodiumPct = Math.round((el.sodium || 0) / ELECTROLYTE_TARGETS.sodium * 100);

  function open(k) { if (_setDetail) _setDetail(k); }

  return h('div', { className: 'tile-grid' },
    h(MetricTile, {
      icon: 'timer', label: t('fast_today'), color: METRIC_COLORS.fast,
      value: lastValue(fastS) === null ? null : num(lastValue(fastS)),
      unit: t('hour_short'), spark: fastS.values,
      sub: meanValue(fastS) ? t('avg_7') + ' ' + num(meanValue(fastS).toFixed(1)) : null,
      onClick: function () { open('fast'); }
    }),
    h(MetricTile, {
      icon: 'activity', label: t('steps_label'), color: METRIC_COLORS.steps,
      value: stepsToday ? num(stepsToday) : null, spark: stepsS.values,
      sub: SENSORS.floors ? num(SENSORS.floors) + ' ' + t('floors') : null,
      onClick: function () { open('steps'); }
    }),
    h(MetricTile, {
      icon: 'moon', label: t('sleep_metric'), color: METRIC_COLORS.sleep,
      value: sleepLast ? num((sleepLast / 3600000).toFixed(1)) : null,
      unit: t('hour_short'), spark: sleepS.values,
      sub: meanValue(sleepS) ? t('avg_7') + ' ' + fmtShort(meanValue(sleepS)) : null,
      onClick: function () { open('sleep'); }
    }),
    h(MetricTile, {
      icon: 'heart', label: connected ? t('heart_rate') : t('resting_hr'),
      color: METRIC_COLORS.hr,
      value: hrLatest ? num(hrLatest) : null, unit: t('bpm'), spark: hrS.values,
      sub: connected ? t('live') : (lastValue(hrS) ? t('latest') : null),
      onClick: function () { open('hr'); }
    }),
    h(MetricTile, {
      icon: 'dumbbell', label: t('protein'), color: METRIC_COLORS.protein,
      value: target.grams ? num(Math.round(macros.p)) : null,
      unit: target.grams ? '/ ' + num(target.grams) + 'g' : null,
      sub: target.grams
        ? num(Math.max(0, target.grams - Math.round(macros.p))) + 'g ' + t('protein_left')
        : null,
      onClick: function () { open('protein'); }
    }),
    h(MetricTile, {
      icon: 'droplet', label: t('water'), color: METRIC_COLORS.water,
      value: water.ml ? num(water.ml) : null, unit: t('ml'),
      sub: num(Math.round((water.ml || 0) / waterTarget().ml * 100)) + '% '
        + t('of_goal'),
      onClick: function () { open('water'); }
    }),
    h(MetricTile, {
      icon: 'scale', label: t('weight'), color: METRIC_COLORS.weight,
      value: weightLatest ? num(weightLatest.toFixed(1)) : null,
      unit: t('weight_unit'), spark: weightS.values,
      sub: (function () {
        var d = bodyDelta();
        return d && d.kg !== null ? (d.kg > 0 ? '+' : '') + num(d.kg) + ' ' + t('weight_unit') : null;
      })(),
      onClick: function () { open('weight'); }
    }),
    h(MetricTile, {
      icon: 'flame', label: t('electrolytes'), color: METRIC_COLORS.electrolytes,
      value: el.sodium ? num(sodiumPct) : null, unit: '%',
      sub: t('sodium') + ' ' + num(el.sodium || 0) + ' ' + t('mg'),
      onClick: function () { open('electrolytes'); }
    }));
}

/** One metric, full screen, with the chart the tile only hints at. */
function MetricDetail(props) {
  var k = props.metric;
  var title = '', hero = null, unit = '', colour = 'var(--primary)', body = null;

  function chartCard(series, colr, kind, fmt, overlay) {
    var enough = 0;
    for (var i = 0; i < series.values.length; i++) {
      if (series.values[i] !== null && series.values[i] !== undefined) enough++;
    }
    if (enough < 2) return h(Card, null, h(Empty, { text: t('no_series') }));
    return h(Card, { title: t('last_14'), icon: 'chart' },
      kind === 'bar'
        ? h(BarSeries, {
            values: series.values, labels: series.labels, color: colr, height: 130,
            avg: meanValue(series)
          })
        : h(AreaChart, {
            values: series.values, color: colr, height: 160,
            overlay: overlay || null, overlayColor: '#f5a623'
          }),
      h('div', { className: 'chart-legend' },
        h('span', null, h('i', { style: { background: colr } }),
          t('avg_7') + ': ' + (meanValue(series) === null ? '—' : fmt(meanValue(series)))),
        overlay
          ? h('span', null, h('i', { style: { background: '#f5a623' } }), t('trend_7'))
          : null));
  }

  if (k === 'fast') {
    var fastS = seriesFastHours(14);
    var stats = S.get('stats', {});
    title = t('fast_hours');
    colour = METRIC_COLORS.fast;
    hero = lastValue(fastS) === null ? '—' : num(lastValue(fastS));
    unit = t('hour_short');
    body = h('div', null,
      chartCard(fastS, colour, 'bar', function (v) { return num(v.toFixed(1)) + t('hour_short'); }),
      h(Card, { title: t('progress'), icon: 'trophy' },
        h('div', { className: 'stats-grid' },
          h(Stat, { value: num(stats.currentStreak || 0), label: t('current_streak'), tone: 'gold' }),
          h(Stat, { value: num(stats.bestStreak || 0), label: t('best_streak'), tone: 'green' }),
          h(Stat, { value: num(stats.totalHours || 0), label: t('total_hours'), tone: 'blue' }))),
      h(PlanCard, null));

  } else if (k === 'steps') {
    var stepsS = seriesHealth('steps', 14);
    title = t('steps_label');
    colour = METRIC_COLORS.steps;
    hero = num(SENSORS.steps || lastValue(stepsS) || 0);
    body = h('div', null,
      chartCard(stepsS, colour, 'bar', function (v) { return num(Math.round(v)); }),
      h(Card, { title: t('activity'), icon: 'activity' },
        h('div', { className: 'stats-grid' },
          h(Stat, { value: num(SENSORS.activeMinutes || 0), label: t('active_minutes'), tone: 'gold' }),
          h(Stat, { value: num(SENSORS.floors || 0), label: t('floors'), tone: 'green' }),
          h(Stat, { value: num(SENSORS.calories || 0), label: t('calories_burned'), tone: 'blue' })),
        h('div', { className: 'chip-row' },
          h('span', { className: 'chip' }, t('activity_level_now') + ': '
            + t('level_' + (SENSORS.level || 'still'))))));

  } else if (k === 'sleep') {
    var sleepS = seriesHealth('sleepMs', 14);
    var shown = { values: [], labels: sleepS.labels };
    for (var si = 0; si < sleepS.values.length; si++) {
      shown.values.push(sleepS.values[si] === null ? null : sleepS.values[si] / 3600000);
    }
    title = t('sleep_metric');
    colour = METRIC_COLORS.sleep;
    hero = lastValue(sleepS) ? num((lastValue(sleepS) / 3600000).toFixed(1)) : '—';
    unit = t('hour_short');
    body = h('div', null,
      chartCard(shown, colour, 'bar', function (v) { return num(v.toFixed(1)) + t('hour_short'); }),
      h(Card, null, h('div', { className: 'card-sub' }, t('sleep_est_hint'))));

  } else if (k === 'hr') {
    var hrS = seriesHealth('restingHr', 14);
    title = t('resting_hr');
    colour = METRIC_COLORS.hr;
    hero = BAND.status === 'connected' && BAND.hr > 0 ? num(BAND.hr) : (lastValue(hrS) ? num(lastValue(hrS)) : '—');
    unit = t('bpm');
    body = h('div', null,
      chartCard(hrS, colour, 'area', function (v) { return num(Math.round(v)) + ' ' + t('bpm'); }),
      h(HrFastingCard, null));

  } else if (k === 'protein') {
    title = t('protein_target');
    colour = METRIC_COLORS.protein;
    var mac = todayMacros();
    hero = num(Math.round(mac.p));
    unit = 'g';
    body = h('div', null,
      h(ProteinCard, null),
      h(Card, { title: t('todays_total'), icon: 'meals' },
        h('div', { className: 'stats-grid-4' },
          h(Stat, { value: num(Math.round(mac.cal)), label: t('calories'), tone: 'gold' }),
          h(Stat, { value: num(Math.round(mac.p)) + 'g', label: t('protein'), tone: 'green' }),
          h(Stat, { value: num(Math.round(mac.c)) + 'g', label: t('carbs'), tone: 'blue' }),
          h(Stat, { value: num(Math.round(mac.f)) + 'g', label: t('fat'), tone: 'purple' }))));

  } else if (k === 'water') {
    var w = S.get('water', {});
    title = t('water_intake');
    colour = METRIC_COLORS.water;
    hero = num(w.ml || 0);
    unit = t('ml');
    body = h(LiquidsPage, null);

  } else if (k === 'weight') {
    var weightS = seriesWeight(14);
    title = t('weight');
    colour = METRIC_COLORS.weight;
    hero = lastValue(weightS) ? num(lastValue(weightS).toFixed(1)) : '—';
    unit = t('weight_unit');

    // Scale weight is noisy enough during a fast to invert a real trend, so
    // the smoothed line is drawn over it and the raw series fades back.
    var smooth = smoothedWeights(14, 7);
    var trendVals = [];
    for (var sw = 0; sw < smooth.length; sw++) trendVals.push(smooth[sw].avg);
    var trend = weightTrend();

    body = h('div', null,
      chartCard(weightS, colour, 'area',
        function (v) { return num(v.toFixed(1)) + ' ' + t('weight_unit'); },
        trendVals),
      trend
        ? h(Card, { title: t('trend_7'), icon: 'scale' },
            h('div', { className: 'stats-grid' },
              h(Stat, {
                value: signed(trend.kgPerWeek, 2),
                label: t('kg_per_week'),
                tone: trend.kgPerWeek < 0 ? 'green' : 'gold'
              }),
              h(Stat, {
                value: signed(trend.pctPerWeek, 2, '%'),
                label: t('pct_per_week')
              }),
              h(Stat, { value: num(trend.days), label: t('over_days') })),
            h('div', { className: 'info-box' }, t('trend_hint')))
        : h('div', { className: 'info-box' }, t('trend_need_more')),
      h(BodyCompCard, null));

  } else {
    var el2 = electrolytesToday();
    title = t('electrolytes');
    colour = METRIC_COLORS.electrolytes;
    hero = num(el2.sodium || 0);
    unit = t('mg');
    body = h(ElectrolytesCard, null);
  }

  return h(DetailSheet, { title: title, onClose: props.onClose },
    h('div', { className: 'sheet-hero' },
      h('div', { className: 'sheet-hero-val', style: { color: colour } },
        hero, unit ? h('span', { className: 'tile-unit' }, unit) : null),
      h('div', { className: 'sheet-hero-label' }, title)),
    body);
}

function bandStatusText() {
  var s = BAND.status;
  if (s === 'connected') return t('connected') + (BAND.name ? ' · ' + BAND.name : '');
  if (s === 'scanning') return t('scanning');
  if (s === 'connecting' || s === 'discovering') return t('connecting');
  if (s === 'reconnecting') return t('reconnecting');
  if (s === 'not_found') return t('err_not_found');
  if (s === 'no_hr_service') return t('err_no_hr_service');
  if (s === 'scan_failed') return t('err_scan_failed');
  if (s === 'no_permission') return t('err_no_permission');
  return t('disconnected');
}

function connectBand() {
  if (!N.ok()) { toast(t('no_native')); return; }
  var res = BAND.saved ? N.call('bandConnectSaved') : N.call('bandScan');
  if (res && res !== 'ok') {
    if (res === 'no_saved_device') res = N.call('bandScan');
    if (res && res !== 'ok') toast(t('err_' + res) || res);
  }
  setTimeout(function () { pullNative(); refresh(); }, 400);
}

/** Modal: start a fast that actually began earlier (backdated). */
/**
 * Start-time picker.
 *
 * The previous version only had +/- buttons, and minutes moved in steps of
 * five — so an exact time like 23:07 was simply not expressible. Hours and
 * minutes are now typed directly, with the steppers kept for nudging, an
 * explicit today/yesterday choice instead of a silent rollback, quick
 * "N hours ago" chips, and a live preview of the resulting fast length.
 */
function StartTimeModal(props) {
  var now = new Date();
  var st1 = useState(pad2(now.getHours())); var hh = st1[0], setHH = st1[1];
  var st2 = useState(pad2(now.getMinutes())); var mm = st2[0], setMM = st2[1];
  var st3 = useState(0); var dayBack = st3[0], setDayBack = st3[1];

  function clampInt(raw, max) {
    var v = parseInt(raw, 10);
    if (isNaN(v) || v < 0) v = 0;
    if (v > max) v = max;
    return v;
  }

  function computeTs() {
    var d = new Date();
    d.setHours(clampInt(hh, 23), clampInt(mm, 59), 0, 0);
    return d.getTime() - dayBack * 86400000;
  }

  function setFromHoursAgo(hours) {
    var d = new Date(Date.now() - hours * 3600000);
    setHH(pad2(d.getHours()));
    setMM(pad2(d.getMinutes()));
    setDayBack(d.getDate() === new Date().getDate() ? 0 : 1);
  }

  var ts = computeTs();
  var future = ts > Date.now();
  var elapsed = Date.now() - ts;

  function field(value, setter, max, label) {
    return h('div', { className: 'time-col' },
      h('button', {
        className: 'time-btn',
        onClick: function () { setter(pad2((clampInt(value, max) + 1) % (max + 1))); }
      }, h(Icon, { name: 'plus', size: 17 })),
      h('input', {
        className: 'time-input',
        type: 'number',
        inputMode: 'numeric',
        value: value,
        'aria-label': label,
        onChange: function (e) { setter(e.target.value.slice(0, 2)); },
        onBlur: function () { setter(pad2(clampInt(value, max))); }
      }),
      h('button', {
        className: 'time-btn',
        onClick: function () { setter(pad2((clampInt(value, max) + max) % (max + 1))); }
      }, h(Icon, { name: 'minus', size: 17 })));
  }

  var quick = [1, 3, 6, 12, 16, 20];
  var quickBtns = [];
  for (var i = 0; i < quick.length; i++) {
    (function (n) {
      quickBtns.push(h('button', {
        key: 'q' + n, className: 'goal-btn',
        onClick: function () { setFromHoursAgo(n); }
      }, num(n) + (isRTL() ? 'س' : 'h')));
    })(quick[i]);
  }

  return h('div', { className: 'modal-overlay', onClick: props.onClose },
    h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
      h('h3', null, props.title || t('set_start_time')),

      h('div', { className: 'time-picker' },
        field(hh, setHH, 23, 'hours'),
        h('div', { className: 'time-sep' }, ':'),
        field(mm, setMM, 59, 'minutes')),

      h('div', { className: 'goal-selector' },
        h('button', {
          className: 'goal-btn' + (dayBack === 0 ? ' active' : ''),
          onClick: function () { setDayBack(0); }
        }, t('today')),
        h('button', {
          className: 'goal-btn' + (dayBack === 1 ? ' active' : ''),
          onClick: function () { setDayBack(1); }
        }, t('yesterday'))),

      h('div', { className: 'section-title', style: { textAlign: 'center' } }, t('quick_pick')),
      h('div', { className: 'goal-selector' }, quickBtns),

      // A future time almost always means "yesterday". Offer the fix as one
      // tap instead of leaving a disabled Confirm and no way forward.
      future
        ? h('button', {
            className: 'alert-box',
            style: { width: '100%', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(255,77,94,.32)' },
            onClick: function () { setDayBack(1); }
          }, t('time_future'))
        : h('div', { className: 'info-box', style: { textAlign: 'center' } },
            t('will_be') + ' ' + fmtShort(elapsed)),

      h('div', { className: 'modal-btns' },
        h('button', {
          className: 'btn btn-primary btn-sm',
          disabled: future,
          onClick: function () { props.onPick(ts); }
        }, t('confirm')),
        h('button', { className: 'btn btn-outline btn-sm', onClick: props.onClose }, t('cancel')))));
}

/**
 * Logs or edits a fast that has already finished.
 *
 * Without this the record can only ever grow forwards: a fast the app slept
 * through — a dead battery, a trip, simply forgetting — is lost, and it takes
 * the streak and every average down with it. An entry that cannot be
 * corrected is not a record, it is a receipt.
 */
function PastFastModal(props) {
  var edit = props.entry || null;

  function toLocal(ts) {
    var d = new Date(ts);
    return {
      date: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()),
      time: pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    };
  }

  var defEnd = edit ? edit.end : Date.now();
  var defStart = edit ? edit.start : defEnd - 20 * 3600000;
  var s0 = toLocal(defStart), e0 = toLocal(defEnd);

  var a = useState(s0.date); var sDate = a[0], setSDate = a[1];
  var b = useState(s0.time); var sTime = b[0], setSTime = b[1];
  var c = useState(e0.date); var eDate = c[0], setEDate = c[1];
  var d2 = useState(e0.time); var eTime = d2[0], setETime = d2[1];
  var g = useState(edit ? edit.goal : S.get('settings.defaultGoal', 20));
  var goal = g[0], setGoal2 = g[1];

  function parse(dateStr, timeStr) {
    var dp = String(dateStr).split('-');
    var tp = String(timeStr).split(':');
    if (dp.length !== 3 || tp.length !== 2) return NaN;
    var dt = new Date(
      parseInt(dp[0], 10), parseInt(dp[1], 10) - 1, parseInt(dp[2], 10),
      parseInt(tp[0], 10) || 0, parseInt(tp[1], 10) || 0, 0, 0);
    return dt.getTime();
  }

  var startTs = parse(sDate, sTime);
  var endTs = parse(eDate, eTime);
  var valid = !isNaN(startTs) && !isNaN(endTs) && endTs > startTs && endTs <= Date.now() + 60000;
  var dur = valid ? endTs - startTs : 0;
  var tooLong = dur > 14 * 86400000;

  var err = null;
  if (isNaN(startTs) || isNaN(endTs)) err = t('pf_bad_date');
  else if (endTs <= startTs) err = t('pf_end_before_start');
  else if (endTs > Date.now() + 60000) err = t('pf_future');
  else if (tooLong) err = t('pf_too_long');

  function pair(label, dateVal, setDate, timeVal, setTime) {
    return h('div', { style: { marginBottom: 'var(--s3)' } },
      h('div', { className: 'section-title', style: { margin: '0 0 6px' } }, label),
      h('div', { style: { display: 'flex', gap: 'var(--s2)' } },
        h('input', {
          className: 'text-input', type: 'date', value: dateVal,
          style: { flex: 2, direction: 'ltr' },
          onChange: function (ev) { setDate(ev.target.value); }
        }),
        h('input', {
          className: 'text-input', type: 'time', value: timeVal,
          style: { flex: 1, direction: 'ltr' },
          onChange: function (ev) { setTime(ev.target.value); }
        })));
  }

  var goalBtns = [];
  var goals = [16, 18, 20, 24, 36, 48, 72];
  for (var gi = 0; gi < goals.length; gi++) {
    (function (n) {
      goalBtns.push(h('button', {
        key: 'pg' + n,
        className: 'goal-btn' + (parseInt(goal, 10) === n ? ' active' : ''),
        onClick: function () { setGoal2(n); }
      }, num(n) + (isRTL() ? 'س' : 'h')));
    })(goals[gi]);
  }

  return h('div', { className: 'modal-overlay', onClick: props.onClose },
    h('div', { className: 'modal', onClick: function (ev) { ev.stopPropagation(); } },
      h('h3', null, edit ? t('pf_edit') : t('pf_add')),

      pair(t('pf_from'), sDate, setSDate, sTime, setSTime),
      pair(t('pf_to'), eDate, setEDate, eTime, setETime),

      h('div', { className: 'section-title', style: { margin: '0 0 6px' } }, t('fasting_goal')),
      h('div', { className: 'goal-selector' }, goalBtns),

      err
        ? h('div', { className: 'alert-box', style: { textAlign: 'center' } }, err)
        : h('div', { className: 'info-box', style: { textAlign: 'center' } },
            fmtShort(dur) + ' · '
            + (dur / 3600000 >= goal ? t('goal_reached') : t('incomplete'))),

      h('div', { className: 'modal-btns' },
        h('button', {
          className: 'btn btn-primary btn-sm',
          disabled: !valid,
          onClick: function () { props.onSave(startTs, endTs, parseInt(goal, 10) || 20); }
        }, t('save')),
        h('button', { className: 'btn btn-outline btn-sm', onClick: props.onClose }, t('cancel')))));
}

/**
 * Writes a finished fast into the record.
 *
 * Heart-rate and step figures are left empty rather than guessed: a
 * retroactive entry has no sensor data behind it, and a fabricated average
 * would quietly poison every chart that reads it.
 */
function savePastFast(startTs, endTs, goal, editId) {
  var hist = S.get('history', []);
  var dur = endTs - startTs;
  var entry = {
    id: editId || uid(),
    start: startTs,
    end: endTs,
    duration: dur,
    goal: goal,
    completed: dur / 3600000 >= goal,
    avgHr: 0, maxHr: 0, steps: 0,
    phase: phaseIndexFor(dur / 3600000),
    manual: true
  };

  if (editId) {
    for (var i = 0; i < hist.length; i++) {
      if (hist[i].id !== editId) continue;
      // Keep whatever the sensors recorded the first time round.
      entry.avgHr = hist[i].avgHr || 0;
      entry.maxHr = hist[i].maxHr || 0;
      entry.steps = hist[i].steps || 0;
      entry.manual = hist[i].manual || true;
      hist[i] = entry;
      break;
    }
  } else {
    hist.push(entry);
  }
  sortByTime(hist, 'start');
  if (hist.length > 500) hist = hist.slice(hist.length - 500);
  S.set('history', hist);
  recomputeStats();
  syncReminders();
  toast(t('saved'));
  refresh();
}

/* ---------------------------------------------------------------------
 * Meals
 * ------------------------------------------------------------------- */

/** Thumbnails are fetched across the bridge once and kept in memory. */
var PHOTO_CACHE = {};
function photoSrc(id) {
  if (!id) return '';
  if (PHOTO_CACHE[id] !== undefined) return PHOTO_CACHE[id];
  var data = N.call('photoData', id) || '';
  PHOTO_CACHE[id] = data;
  return data;
}

/**
 * Protein progress. Sits above the calorie totals on purpose: on one meal a
 * day this is the number that decides whether weight lost is fat or muscle.
 */
function ProteinCard() {
  var target = proteinTarget();
  var tot = todayMacros();
  if (!target.grams) return null;
  var pct = Math.min(100, Math.round(tot.p / target.grams * 100));
  var left = Math.max(0, target.grams - Math.round(tot.p));

  return h(Card, { title: t('protein_target'), icon: 'dumbbell' },
    h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' } },
      h('span', { style: { fontSize: '26px', fontWeight: 700 } },
        num(Math.round(tot.p)),
        h('span', { style: { fontSize: '13px', color: '#9e9ebf' } }, ' / ' + num(target.grams) + 'g')),
      h('span', { className: 'row-end', style: { color: pct >= 100 ? '#00d97e' : '#f5a623' } },
        pct >= 100 ? t('protein_done') : num(left) + 'g ' + t('protein_left'))),
    h('div', { className: 'water-bar' },
      h('div', {
        className: 'water-fill',
        style: {
          width: pct + '%',
          background: pct >= 100
            ? 'linear-gradient(90deg,#00d97e,#00bcd4)'
            : 'linear-gradient(90deg,var(--primary),' + METRIC_COLORS.protein + ')'
        }
      })),
    h('div', { className: 'chip-row' },
      h('span', { className: 'chip' },
        t(target.basis === 'lean' ? 'protein_basis_lean' : 'protein_basis_weight')),
      h('span', { className: 'chip' }, num(target.perKg) + ' ' + t('per_kg')),
      tot.unknown
        ? h('span', { className: 'chip warn' }, num(tot.unknown) + ' × ' + t('no_macros'))
        : null),
    h('div', { className: 'info-box' }, t('protein_hint')));
}

function MealsPage() {
  var s1 = useState(''); var q = s1[0], setQ = s1[1];
  var s2 = useState(null); var pending = s2[0], setPending = s2[1];
  var s3 = useState(false); var showManual = s3[0], setShowManual = s3[1];

  var todayKey = dayKey(Date.now());
  var all = S.get('meals', []);
  var today = [];
  for (var i = 0; i < all.length; i++) {
    if (dayKey(all[i].ts) === todayKey) today.push(all[i]);
  }

  // Meals imported from elsewhere often have no macros at all; a null must
  // read as "unknown", never silently as a zero that skews the day's total.
  var tot = { cal: 0, p: 0, c: 0, f: 0, unknown: 0 };
  for (var j = 0; j < today.length; j++) {
    var it = today[j];
    var mult = it.portions || 1;
    if (it.cal === null || it.cal === undefined) tot.unknown++;
    tot.cal += (it.cal || 0) * mult;
    tot.p += (it.p || 0) * mult;
    tot.c += (it.c || 0) * mult;
    tot.f += (it.f || 0) * mult;
  }

  function reallyAdd(food, photoId) {
    var meals = S.get('meals', []);
    meals.push({
      id: uid(), k: food.k, ar: food.ar, en: food.en,
      cal: food.cal, p: food.p, c: food.c, f: food.f,
      portions: 1, ts: Date.now(), photo: photoId || ''
    });
    // Kept for sixty days: the totals view only needs today, but the expert
    // engine and the monthly report both read a month back, and pruning at a
    // week left them permanently short of data.
    var cutoff = Date.now() - 60 * 86400000;
    var kept = [];
    for (var x = 0; x < meals.length; x++) if (meals[x].ts >= cutoff) kept.push(meals[x]);
    S.set('meals', kept);
    refresh();
  }

  function addFood(food) {
    if (S.get('currentFast.active', false)) { setPending(food); return; }
    reallyAdd(food);
  }

  /** Copies every meal logged yesterday into today, portions included. */
  function repeatYesterday() {
    var yKey = dayKey(Date.now() - 86400000);
    var meals = S.get('meals', []);
    var copied = 0;
    var additions = [];
    for (var x = 0; x < meals.length; x++) {
      if (dayKey(meals[x].ts) !== yKey) continue;
      additions.push(m({}, meals[x], {
        id: uid(),
        ts: Date.now(),
        // The photo belongs to the original meal; copying the reference would
        // make deleting either one blank the other.
        photo: ''
      }));
      copied++;
    }
    if (!copied) { toast(t('repeat_nothing')); return; }
    S.set('meals', meals.concat(additions));
    toast(t('repeat_done') + ' (' + num(copied) + ')');
    refresh();
  }

  function toggleFavourite(key) {
    var favs = S.get('favourites', []).slice();
    var at = favs.indexOf(key);
    if (at >= 0) favs.splice(at, 1); else favs.push(key);
    S.set('favourites', favs);
    refresh();
  }

  function changePortion(id, delta) {
    var meals = S.get('meals', []);
    for (var x = 0; x < meals.length; x++) {
      if (meals[x].id === id) {
        meals[x].portions = Math.max(0.5, Math.round((meals[x].portions + delta) * 2) / 2);
      }
    }
    S.set('meals', meals);
    refresh();
  }

  function removeMeal(id) {
    var meals = S.get('meals', []);
    var kept = [];
    for (var x = 0; x < meals.length; x++) {
      if (meals[x].id !== id) kept.push(meals[x]);
      else if (meals[x].photo) N.call('photoDelete', meals[x].photo);
    }
    S.set('meals', kept);
    refresh();
  }

  var results = searchFood(q);
  var resultRows = [];
  for (var r = 0; r < results.length && r < 30; r++) {
    (function (food) {
      var starred = S.get('favourites', []).indexOf(food.k) >= 0;
      resultRows.push(h('div', { key: 'f' + food.k, className: 'row' },
        h('div', {
          className: 'row-main', style: { cursor: 'pointer' },
          onClick: function () { addFood(food); }
        },
          h('div', { className: 'row-title' }, isRTL() ? food.ar : food.en),
          h('div', { className: 'row-sub' },
            food.cal === null || food.cal === undefined
              ? '—'
              : 'P ' + food.p + ' · C ' + food.c + ' · F ' + food.f)),
        h('div', { className: 'row-end' },
          food.cal === null || food.cal === undefined
            ? '—'
            : num(food.cal) + ' ' + t('calories')),
        h('button', {
          className: 'icon-btn',
          'aria-label': t('favourite'),
          onClick: function () { toggleFavourite(food.k); }
        }, h(Icon, { name: 'star', size: 17, color: starred ? '#f5a623' : undefined }))));
    })(results[r]);
  }

  // Favourites are the answer to a diet that repeats: the same six things
  // should never need searching for.
  var favKeys = S.get('favourites', []);
  var favRows = [];
  for (var fk = 0; fk < favKeys.length; fk++) {
    (function (key) {
      var food = null;
      var pool = allFoods();
      for (var pi = 0; pi < pool.length; pi++) {
        if (pool[pi].k === key) { food = pool[pi]; break; }
      }
      if (!food) return;
      favRows.push(h('div', { key: 'fav' + key, className: 'row' },
        h('div', {
          className: 'row-main', style: { cursor: 'pointer' },
          onClick: function () { addFood(food); }
        },
          h('div', { className: 'row-title' }, isRTL() ? food.ar : food.en),
          h('div', { className: 'row-sub' },
            food.cal === null || food.cal === undefined
              ? '—' : num(food.cal) + ' ' + t('calories'))),
        h('button', {
          className: 'icon-btn',
          'aria-label': t('favourite'),
          onClick: function () { toggleFavourite(key); }
        }, h(Icon, { name: 'star', size: 17, color: '#f5a623' }))));
    })(favKeys[fk]);
  }

  var mealRows = [];
  for (var k2 = today.length - 1; k2 >= 0; k2--) {
    (function (it) {
      var src = it.photo ? photoSrc(it.photo) : '';
      mealRows.push(h('div', { key: 'm' + it.id, className: 'row' },
        src ? h('img', { className: 'photo-thumb', src: src, alt: '' }) : null,
        h('div', { className: 'row-main' },
          h('div', { className: 'row-title' }, isRTL() ? it.ar : it.en),
          h('div', { className: 'row-sub' },
            fmtTimeOfDay(it.ts) + ' · '
            + (it.cal === null || it.cal === undefined
                ? '—'
                : num(Math.round(it.cal * (it.portions || 1))) + ' ' + t('calories')))),
        h('button', { className: 'icon-btn', onClick: function () { changePortion(it.id, -0.5); } }, h(Icon,{name:'minus',size:16})),
        h('span', { className: 'row-end' }, '×' + it.portions),
        h('button', { className: 'icon-btn', onClick: function () { changePortion(it.id, 0.5); } }, h(Icon,{name:'plus',size:16})),
        h(DeleteButton, { onConfirm: function () { removeMeal(it.id); } })));
    })(today[k2]);
  }

  return h('div', null,
    h(ProteinCard, null),
    h(Card, { title: t('todays_total'), icon: 'meals' },
      h('div', { className: 'stats-grid-4' },
        h(Stat, { value: num(Math.round(tot.cal)), label: t('calories'), tone: 'gold' }),
        h(Stat, { value: num(Math.round(tot.p)) + 'g', label: t('protein'), tone: 'green' }),
        h(Stat, { value: num(Math.round(tot.c)) + 'g', label: t('carbs'), tone: 'blue' }),
        h(Stat, { value: num(Math.round(tot.f)) + 'g', label: t('fat'), tone: 'purple' })),
      tot.unknown ? h('div', { className: 'chip-row' },
        h('span', { className: 'chip warn' },
          num(tot.unknown) + ' × ' + t('no_macros'))) : null),

    mealRows.length
      ? h('div', null, h('div', { className: 'section-title' }, t('meals')), mealRows)
      : h(Empty, { text: t('no_meals') }),

    h('div', { className: 'btn-group', style: { marginTop: 0 } },
      h('button', {
        className: 'btn btn-sm btn-primary',
        onClick: function () { setShowManual(true); }
      }, h(Icon,{name:'plus',size:16}), t('manual_meal')),
      h('button', {
        className: 'btn btn-sm btn-outline',
        onClick: repeatYesterday
      }, h(Icon,{name:'repeat',size:16}), t('repeat_yesterday'))),

    favRows.length
      ? h('div', null,
          h('div', { className: 'section-title' }, t('favourites')),
          favRows)
      : null,

    h('div', { className: 'section-title' }, t('search_food')),
    h('input', {
      className: 'search-input', value: q, placeholder: t('search_food'),
      onChange: function (e) { setQ(e.target.value); }
    }),
    h('div', { style: { height: '10px' } }),
    resultRows.length ? resultRows : h(Empty, { text: t('empty_search') }),

    showManual ? h(ManualMealModal, {
      onClose: function () { setShowManual(false); },
      onSave: function (food, photoId) {
        setShowManual(false);
        if (S.get('currentFast.active', false)) {
          setPending(m({}, food, { __photo: photoId }));
        } else {
          reallyAdd(food, photoId);
        }
      }
    }) : null,

    pending ? h('div', { className: 'modal-overlay', onClick: function () { setPending(null); } },
      h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
        h('h3', null, t('eating_while_fasting')),
        h('div', { className: 'modal-btns', style: { flexDirection: 'column' } },
          h('button', {
            className: 'btn btn-primary btn-block',
            onClick: function () {
              var f = pending; setPending(null); stopFast(); reallyAdd(f, f.__photo);
            }
          }, t('end_and_log')),
          h('button', {
            className: 'btn btn-outline btn-block',
            onClick: function () {
              var f = pending; setPending(null); reallyAdd(f, f.__photo);
            }
          }, t('just_log')),
          h('button', {
            className: 'btn btn-outline btn-block',
            onClick: function () { setPending(null); }
          }, t('cancel'))))) : null);
}

/* ---------------------------------------------------------------------
 * Liquids + water
 * ------------------------------------------------------------------- */

function ElectrolytesCard() {
  var e = electrolytesToday();

  function bar(key, colour) {
    var have = e[key] || 0;
    var target = ELECTROLYTE_TARGETS[key];
    var pct = Math.min(100, Math.round(have / target * 100));
    return h('div', { key: 'el' + key, style: { marginBottom: '10px' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' } },
        h('span', null, t(key)),
        h('span', { style: { color: '#9e9ebf', fontWeight: 600 } },
          num(have) + ' / ' + num(target) + ' ' + t('mg'))),
      h('div', { className: 'water-bar', style: { margin: '5px 0 0' } },
        h('div', { className: 'water-fill', style: { width: pct + '%', background: colour } })));
  }

  var sources = [];
  for (var i = 0; i < ELECTROLYTE_SOURCES.length; i++) {
    (function (src) {
      sources.push(h('button', {
        key: 'es' + src.k, className: 'goal-btn',
        onClick: function () { addElectrolytes(src); refresh(); }
      }, isRTL() ? src.ar : src.en));
    })(ELECTROLYTE_SOURCES[i]);
  }

  return h(Card, { title: t('electrolytes'), icon: 'flame' },
    bar('sodium', 'linear-gradient(90deg,' + METRIC_COLORS.hr + ',' + METRIC_COLORS.protein + ')'),
    bar('potassium', 'linear-gradient(90deg,#3d8bfd,#00bcd4)'),
    bar('magnesium', 'linear-gradient(90deg,#a259ff,#3d8bfd)'),
    h('div', { className: 'section-title', style: { marginTop: '12px' } }, t('add_source')),
    h('div', { className: 'goal-selector' }, sources),
    h('div', { className: 'btn-group' },
      h('button', {
        className: 'btn btn-sm btn-outline',
        onClick: function () {
          S.set('electrolytes', { date: dayKey(Date.now()), sodium: 0, potassium: 0, magnesium: 0 });
          refresh();
        }
      }, t('electrolytes_reset'))),
    h('div', { className: 'info-box' }, t('electrolytes_why')));
}

function LiquidsPage() {
  // The goal is recomputed each day rather than stored, so it follows weight
  // and yesterday's training instead of freezing at whatever it once was.
  var goal = waterTarget();
  var water = S.get('water', { date: '', ml: 0 });
  var todayKey = dayKey(Date.now());
  if (water.date !== todayKey) {
    water = { date: todayKey, ml: 0 };
    S.set('water', water);
  }
  var pct = Math.min(100, Math.round(water.ml / goal.ml * 100));

  function addWater(ml) {
    var w = S.get('water', {});
    w.ml = Math.max(0, (w.ml || 0) + ml);
    w.date = todayKey;
    S.set('water', w);
    refresh();
  }

  var okRows = [];
  for (var i = 0; i < LIQUIDS_OK.length; i++) {
    okRows.push(h('div', { key: 'lq' + i, className: 'liquid-item' },
      h('span', { className: 'liquid-emoji' }, LIQUIDS_OK[i].emoji),
      h('span', { style: { fontSize: '13.5px' } }, t(LIQUIDS_OK[i].key))));
  }

  var noRows = [];
  for (var j = 0; j < LIQUIDS_NO.length; j++) {
    noRows.push(h('div', { key: 'lx' + j, className: 'liquid-item forbidden' },
      h('span', { className: 'liquid-emoji' }, LIQUIDS_NO[j].emoji),
      h('span', { style: { fontSize: '13.5px' } }, isRTL() ? LIQUIDS_NO[j].ar : LIQUIDS_NO[j].en)));
  }

  return h('div', null,
    h(Card, { title: t('water_intake'), icon: 'droplet' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        h('span', { style: { fontSize: '24px', fontWeight: 700 } },
          num(water.ml) + ' ', h('span', { style: { fontSize: '12px', color: '#a0a0c0' } }, t('ml'))),
        h('span', { className: 'card-sub' }, t('water_target') + ': ' + num(goal.ml) + ' ' + t('ml'))),
      h('div', { className: 'water-bar' },
        h('div', { className: 'water-fill', style: { width: pct + '%' } })),
      h('div', { className: 'chip-row' },
        goal.manual
          ? h('span', { className: 'chip' }, t('water_manual'))
          : h('span', { className: 'chip' }, t('water_from_weight') + ' ' + num(goal.base)),
        goal.training ? h('span', { className: 'chip' }, '+' + num(goal.training) + ' ' + t('water_training')) : null,
        goal.heat ? h('span', { className: 'chip' }, '+' + num(goal.heat) + ' ' + t('water_heat')) : null),
      h('div', { className: 'btn-group' },
        h('button', { className: 'btn btn-sm btn-outline', onClick: function () { addWater(250); } }, '+250'),
        h('button', { className: 'btn btn-sm btn-outline', onClick: function () { addWater(500); } }, '+500'),
        h('button', { className: 'btn btn-sm btn-outline', onClick: function () { addWater(750); } }, '+750'),
        h('button', { className: 'btn btn-sm btn-outline', onClick: function () { addWater(-250); } }, '−250')),
      h(SettingRow, { label: t('hot_climate'), hint: t('hot_climate_hint') },
        h(Switch, {
          on: S.get('settings.hotClimate', false),
          onChange: function () {
            S.set('settings.hotClimate', !S.get('settings.hotClimate', false));
            refresh();
          }
        }))),

    h(ElectrolytesCard, null),

    h(Card, { title: t('liquids_allowed'), icon: 'check' }, okRows,
      h('div', { className: 'info-box' }, t('electrolytes_note'))),

    h(Card, { title: t('forbidden_drinks'), icon: 'ban' }, noRows,
      h('div', { className: 'alert-box' }, t('forbidden_list'))));
}

/* ---------------------------------------------------------------------
 * Progress
 * ------------------------------------------------------------------- */

/** Deltas, not raw numbers: the trend is the thing worth showing weekly. */
function WeekCompareCard() {
  var w = weekCompare();

  function delta(cur, prev, fmt, higherIsBetter) {
    if (!prev) return h('span', { className: 'row-end' }, fmt(cur));
    var diff = cur - prev;
    var better = higherIsBetter ? diff > 0 : diff < 0;
    var flat = Math.abs(diff) < 0.001;
    return h('span', { className: 'row-end' },
      fmt(cur),
      h('span', {
        className: 'num-ltr',
        style: {
          marginInlineStart: '8px',
          color: flat ? 'var(--text-3)' : (better ? 'var(--green)' : 'var(--gold)'),
          fontSize: 'var(--fs-xs)'
        }
      }, flat ? '—' : (diff > 0 ? '+' : '') + fmt(diff)));
  }

  function hours(v) { return num(Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)) + t('hour_short'); }
  function dur(v) { return fmtShort(Math.abs(v)); }
  function steps(v) { return num(Math.round(v)); }

  if (!w.hasPrev) {
    return h(Card, { title: t('week_compare'), icon: 'chart' },
      h(Empty, { text: t('wk_need_two_weeks') }));
  }

  // Six deltas and no conclusion is a report, not a review; the verdict is
  // whatever the expert engine ranked highest, so the two never disagree.
  var top = expertInsights()[0] || null;

  return h(Card, { title: t('week_compare'), icon: 'calendar' },
    h('div', { className: 'row-plain' },
      h('span', null, t('fast_hours')),
      delta(w.fastHours.cur, w.fastHours.prev, hours, true)),
    h('div', { className: 'row-plain' },
      h('span', null, t('total_sessions')),
      delta(w.sessions.cur, w.sessions.prev, function (v) { return num(Math.round(v)); }, true)),
    h('div', { className: 'row-plain' },
      h('span', null, t('avg_fast')),
      delta(w.avgFast.cur, w.avgFast.prev, dur, true)),
    w.steps.prev ? h('div', { className: 'row-plain' },
      h('span', null, t('avg_steps')),
      delta(w.steps.cur, w.steps.prev, steps, true)) : null,
    w.sleep.prev ? h('div', { className: 'row-plain' },
      h('span', null, t('sleep_avg')),
      delta(w.sleep.cur, w.sleep.prev, dur, true)) : null,
    w.weight.cur && w.weight.prev ? h('div', { className: 'row-plain' },
      h('span', null, t('weight')),
      delta(w.weight.cur, w.weight.prev,
        function (v) { return num(v.toFixed(1)) + ' ' + t('weight_unit'); }, false)) : null,
    h('div', { className: 'chip-row' },
      h('span', { className: 'chip' }, t('vs_last_week'))),
    top
      ? h('div', { className: 'insight-card ' + top.tone,
                   style: { marginTop: 'var(--s3)', marginBottom: 0 } },
          h('div', { className: 'insight-head' },
            h('span', { className: 'insight-icon' }, top.icon),
            h('span', { className: 'insight-title' }, t('wk_one_change'))),
          h('div', { className: 'insight-text' }, top.title + ' — ' + top.text))
      : null);
}

/** Scatter of heart rate against fasted hours — one dot per day. */
function HrFastingCard() {
  var data = hrVsFasting();
  if (!data.points.length) {
    return h(Card, { title: t('hr_vs_fast'), icon: 'heart' },
      h(Empty, { text: t('no_hr_data') }));
  }

  var w = 320, hh = 180, pad = 26;
  var maxH = 1, minBpm = 999, maxBpm = 0;
  var i;
  for (i = 0; i < data.points.length; i++) {
    var p = data.points[i];
    if (p.h > maxH) maxH = p.h;
    if (p.bpm < minBpm) minBpm = p.bpm;
    if (p.bpm > maxBpm) maxBpm = p.bpm;
  }
  if (maxBpm - minBpm < 6) { minBpm -= 3; maxBpm += 3; }

  var dots = [];
  for (i = 0; i < data.points.length; i++) {
    (function (p, idx) {
      var x = pad + (p.h / maxH) * (w - pad * 2);
      var y = hh - pad - ((p.bpm - minBpm) / (maxBpm - minBpm)) * (hh - pad * 2);
      dots.push(h('circle', {
        key: 'hp' + idx, cx: x.toFixed(1), cy: y.toFixed(1), r: 4.5,
        fill: METRIC_COLORS.hr, fillOpacity: 0.85
      }));
    })(data.points[i], i);
  }

  return h(Card, { title: t('hr_vs_fast'), icon: 'heart' },
    h('div', { className: 'map-box', style: { height: '200px', direction: 'ltr' } },
      h('svg', { width: '100%', height: '100%', viewBox: '0 0 ' + w + ' ' + hh },
        h('line', { x1: pad, y1: hh - pad, x2: w - pad, y2: hh - pad, stroke: '#282844', strokeWidth: 1 }),
        h('line', { x1: pad, y1: pad, x2: pad, y2: hh - pad, stroke: '#282844', strokeWidth: 1 }),
        h('text', { x: w - pad, y: hh - 8, fill: '#6b6b8c', fontSize: 10, textAnchor: 'end' },
          num(Math.round(maxH)) + t('hour_short')),
        h('text', { x: 2, y: pad - 4, fill: '#6b6b8c', fontSize: 10 }, num(Math.round(maxBpm))),
        h('text', { x: 2, y: hh - pad + 12, fill: '#6b6b8c', fontSize: 10 }, num(Math.round(minBpm))),
        dots)),
    h('div', { className: 'chip-row' },
      h('span', { className: 'chip' }, t('hr_src_' + data.source)),
      h('span', { className: 'chip' }, num(data.points.length) + ' ' + t('hc_days'))),
    h('div', { className: 'info-box' }, t('hr_vs_fast_hint')));
}

function ProgressPage() {
  var p = S.get('profile', {});
  var stats = S.get('stats', {});
  var hist = S.get('history', []);
  var ed = useState(null); var editing = ed[0], setEditing = ed[1];
  var bmi = calcBMI(p.weight, p.height);
  var bmr = bestBMR(p);
  var tdee = bestTDEE(p);
  var week = last7Days();

  var maxH = 1;
  for (var i = 0; i < week.length; i++) if (week[i].hours > maxH) maxH = week[i].hours;

  var bars = [];
  for (var b = 0; b < week.length; b++) {
    (function (d) {
      var pctH = Math.max(3, Math.round(d.hours / maxH * 100));
      bars.push(h('div', { key: 'b' + d.key, className: 'bar-col' },
        h('div', {
          className: 'bar' + (d.hours > 0 ? '' : ' dim'),
          style: { height: pctH + '%' }
        }),
        h('div', { className: 'bar-label' }, weekdayLabel(d.ts)),
        h('div', { className: 'bar-label' }, d.hours > 0 ? num(d.hours.toFixed(0)) : '')));
    })(week[b]);
  }

  var rows = [];
  for (var k = hist.length - 1; k >= 0 && rows.length < 60; k--) {
    (function (e) {
      rows.push(h('div', { key: 'h' + e.id, className: 'row' },
        h('div', { className: 'row-main' },
          h('div', { className: 'row-title' },
            fmtShort(e.duration) + ' / ' + num(e.goal) + (isRTL() ? 'س' : 'h') + ' ',
            e.completed ? h(Icon,{name:'check',size:14,color:'#00d97e',className:'ic-inline'}) : null,
            e.manual ? h('span', { className: 'sev sev-info', style: { marginInlineStart: '6px' } },
              t('pf_manual')) : null),
          h('div', { className: 'row-sub' },
            fmtDate(e.start) + ' · ' + fmtTimeOfDay(e.start) + ' → ' + fmtTimeOfDay(e.end)
            + (e.avgHr ? ' · ' + num(e.avgHr) + ' ' + t('bpm') : '')
            + (e.steps ? ' · ' + num(e.steps) + ' ' + t('steps') : ''))),
        h('button', {
          className: 'icon-btn',
          'aria-label': t('edit'),
          onClick: function () { setEditing(e); }
        }, h(Icon, { name: 'edit', size: 17 })),
        h(DeleteButton, { onConfirm: function () { deleteHistory(e.id); } })));
    })(hist[k]);
  }

  return h('div', null,
    h(Card, { title: t('last_7_days'), icon: 'chart' },
      h('div', { className: 'bar-chart' }, bars)),

    h(Card, { title: t('progress'), icon: 'trophy' },
      h('div', { className: 'stats-grid' },
        h(Stat, { value: num(stats.currentStreak || 0), label: t('current_streak'), tone: 'gold' }),
        h(Stat, { value: num(stats.bestStreak || 0), label: t('best_streak'), tone: 'green' }),
        h(Stat, { value: num(stats.totalHours || 0), label: t('total_hours'), tone: 'blue' })),
      h('div', { style: { height: '9px' } }),
      h('div', { className: 'stats-grid' },
        h(Stat, { value: num(stats.totalSessions || 0), label: t('total_sessions') }),
        h(Stat, {
          value: stats.totalSessions ? num(Math.round((stats.completed || 0) / stats.totalSessions * 100)) + '%' : '-',
          label: t('completion_rate'), tone: 'green'
        }),
        h(Stat, { value: stats.longest ? fmtShort(stats.longest) : '-', label: t('longest_fast'), tone: 'gold' }))),

    h(WeekCompareCard, null),

    h(HealthTrendsCard, null),

    h(HrFastingCard, null),

    h(BodyCompCard, null),

    h(Card, { title: t('bmi') + ' / ' + t('tdee'), icon: 'scale' },
      h('div', { className: 'row-plain' },
        h('span', null, t('bmi')),
        h('span', { className: 'row-end' }, bmi ? num(bmi.toFixed(1)) + ' · ' + bmiLabel(bmi) : '-')),
      h('div', { className: 'row-plain' },
        h('span', null, t('bmr')),
        h('span', { className: 'row-end' },
          bmr.value === null
            ? t('need_age')
            : num(bmr.value) + ' ' + t('calories')
              + (bmr.source === 'lean' ? ' · ' + t('bmr_lean') : ''))),
      h('div', { className: 'row-plain' },
        h('span', null, t('tdee')),
        h('span', { className: 'row-end' },
          tdee.value === null ? t('need_age') : num(tdee.value) + ' ' + t('calories'))),
      h('div', { className: 'row-plain' },
        h('span', null, t('add_weight')),
        h('button', { className: 'btn btn-sm btn-outline', onClick: logWeight }, t('save')))),

    h(RefeedCard, null),

    h('div', { className: 'section-title' }, t('history')),
    h('button', {
      className: 'btn btn-outline btn-block',
      style: { marginBottom: 'var(--s2)' },
      onClick: function () { setEditing({}); }
    }, h(Icon, { name: 'plus', size: 16 }), t('pf_add')),
    rows.length ? rows : h(Empty, { text: t('no_history') }),

    editing ? h(PastFastModal, {
      entry: editing.id ? editing : null,
      onClose: function () { setEditing(null); },
      onSave: function (st, en, goal) {
        savePastFast(st, en, goal, editing.id || null);
        setEditing(null);
      }
    }) : null);
}

/**
 * Planned refeed days.
 *
 * Marking tomorrow as a deliberate break is a legitimate part of a long
 * protocol. The app used to score it identically to giving up, which meant
 * the correct decision cost the user their streak.
 */
function RefeedCard() {
  var today = Date.now();
  var tomorrow = today + 86400000;
  var list = plannedBreaks();

  function cell(ts, label) {
    var on = isPlannedBreak(ts);
    return h('button', {
      className: 'goal-btn' + (on ? ' active' : ''),
      onClick: function () {
        togglePlannedBreak(ts);
        recomputeStats();
        toast(on ? t('refeed_cleared') : t('refeed_set'));
        refresh();
      }
    }, label);
  }

  return h(Card, { title: t('refeed_day'), icon: 'calendar' },
    h('div', { className: 'card-sub', style: { marginBottom: 'var(--s3)' } }, t('refeed_day_hint')),
    h('div', { className: 'goal-selector' },
      cell(today, t('today')),
      cell(tomorrow, t('tomorrow'))),
    list.length
      ? h('div', { className: 'row-sub', style: { marginTop: 'var(--s2)' } },
          t('refeed_planned') + ': ' + num(list.length))
      : null);
}

/**
 * Recovery, read off resting heart rate against the user's own baseline.
 *
 * Says nothing at all until there are enough mornings to establish that
 * baseline — a recovery verdict from four days of data is astrology.
 */
function RecoveryCard() {
  var rec = recoveryStatus();
  if (!rec) return null;
  var ar = isRTL();

  var title = rec.level === 'strained' ? t('rec_strained')
    : rec.level === 'watch' ? t('rec_watch') : t('rec_good');
  var sub = rec.level === 'good'
    ? t('rec_good_sub')
    : (ar
      ? 'أعلى من خط الأساس بـ' + num(rec.delta.toFixed(1)) + ' نبضة'
        + (rec.streak >= 2 ? ' لـ' + num(rec.streak) + ' صباح ورا بعض' : '')
      : num(rec.delta.toFixed(1)) + ' bpm above baseline'
        + (rec.streak >= 2 ? ' for ' + num(rec.streak) + ' mornings running' : ''));

  return h('div', { className: 'rec-band rec-' + rec.level },
    h('span', { className: 'rec-dot' }),
    h('div', { className: 'rec-main' },
      h('div', { className: 'rec-title' }, title),
      h('div', { className: 'rec-sub' }, sub)),
    h('div', { style: { textAlign: 'end' } },
      h('div', { className: 'rec-num' }, num(rec.recent)),
      h('div', { className: 'rec-sub' }, t('rec_baseline') + ' ' + num(rec.baseline))));
}

function deleteHistory(id) {
  var hist = S.get('history', []);
  var kept = [];
  for (var i = 0; i < hist.length; i++) if (hist[i].id !== id) kept.push(hist[i]);
  S.set('history', kept);
  recomputeStats();
  toast(t('deleted'));
  refresh();
}

function logWeight() {
  var log = S.get('profile.weightLog', []);
  log.push({ ts: Date.now(), kg: S.get('profile.weight', 70) });
  if (log.length > 200) log = log.slice(log.length - 200);
  S.set('profile.weightLog', log);
  toast(t('saved'));
  refresh();
}

/* ---------------------------------------------------------------------
 * Body composition
 * ------------------------------------------------------------------- */

function BodyCompCard() {
  var st = useState(false); var showAdd = st[0], setShowAdd = st[1];
  var latest = latestBody();
  var delta = bodyDelta();
  var log = S.get('bodyLog', []);

  var rows = [];
  for (var i = log.length - 1; i >= 0 && rows.length < 12; i--) {
    (function (e) {
      rows.push(h('div', { key: 'bl' + e.ts, className: 'row' },
        h('div', { className: 'row-main' },
          h('div', { className: 'row-title' },
            num(e.kg) + ' ' + t('weight_unit')
            + (e.fatPct ? ' · ' + num(e.fatPct) + '% ' + t('fat') : '')),
          h('div', { className: 'row-sub' },
            fmtDate(e.ts)
            + (e.muscleKg ? ' · ' + t('muscle_kg') + ' ' + num(e.muscleKg) : '')
            + (e.waterPct ? ' · ' + t('water_pct') + ' ' + num(e.waterPct) : ''))),
        h(DeleteButton, {
          onConfirm: function () {
            var kept = [];
            var all = S.get('bodyLog', []);
            for (var j = 0; j < all.length; j++) if (all[j].ts !== e.ts) kept.push(all[j]);
            S.set('bodyLog', kept);
            toast(t('deleted'));
            refresh();
          }
        })));
    })(log[i]);
  }

  return h(Card, {
    title: t('body_comp'), icon: 'body',
    right: h('button', {
      className: 'btn btn-sm btn-outline',
      onClick: function () { setShowAdd(true); }
    }, t('add_scan'))
  },
    latest ? h('div', null,
      h('div', { className: 'stats-grid' },
        h(Stat, { value: num(latest.kg) + ' ' + t('weight_unit'), label: t('weight'), tone: 'gold' }),
        h(Stat, {
          value: latest.fatPct ? num(latest.fatPct) + '%' : '-',
          label: t('fat_pct'), tone: 'blue'
        }),
        h(Stat, {
          value: latest.muscleKg ? num(latest.muscleKg) : '-',
          label: t('muscle_kg'), tone: 'green'
        })),
      // Only fields measured at least twice are shown; a single scan cannot
      // produce a trend, and printing 0 would read as "no change".
      delta ? h('div', { className: 'chip-row' },
        delta.kg !== null
          ? h('span', { className: 'chip' + (delta.kg < 0 ? ' ok' : '') },
              h(Icon,{name:'scale',size:13}), num(delta.kg > 0 ? '+' + delta.kg : delta.kg) + ' ' + t('weight_unit'))
          : null,
        delta.fatKg !== null
          ? h('span', { className: 'chip' + (delta.fatKg < 0 ? ' ok' : ' warn') },
              h(Icon,{name:'flame',size:13}), t('fat_kg') + ' ' + num(delta.fatKg))
          : null,
        delta.muscleKg !== null
          ? h('span', { className: 'chip' + (delta.muscleKg >= 0 ? ' ok' : ' warn') },
              h(Icon,{name:'dumbbell',size:13}), t('muscle_kg') + ' ' + num(delta.muscleKg))
          : null,
        h('span', { className: 'chip' }, num(delta.days) + ' ' + t('day') + ' ' + t('since_first'))) : null)
      : h(Empty, { text: t('no_scans') }),

    h('div', { className: 'info-box' }, t('body_hint')),

    rows.length ? h('div', null,
      h('div', { className: 'section-title' }, t('body_history')), rows) : null,

    showAdd ? h(BodyScanModal, {
      onClose: function () { setShowAdd(false); },
      onSave: function (entry) {
        var list = S.get('bodyLog', []);
        list.push(entry);
        sortByTime(list, 'ts');
        S.set('bodyLog', list);
        if (entry.kg) S.set('profile.weight', entry.kg);
        setShowAdd(false);
        toast(t('saved'));
        refresh();
      }
    }) : null);
}

function BodyScanModal(props) {
  var p = S.get('profile', {});
  var s1 = useState(p.weight || ''); var kg = s1[0], setKg = s1[1];
  var s2 = useState(''); var fatPct = s2[0], setFatPct = s2[1];
  var s3 = useState(''); var muscle = s3[0], setMuscle = s3[1];
  var s4 = useState(''); var water = s4[0], setWater = s4[1];

  return h('div', { className: 'modal-overlay', onClick: props.onClose },
    h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
      h('h3', null, t('add_scan')),
      h(SettingRow, { label: t('weight') },
        h(NumField, { value: kg, min: 25, max: 350, onCommit: setKg })),
      h(SettingRow, { label: t('fat_pct') },
        h(NumField, { value: fatPct, min: 3, max: 70, onCommit: setFatPct })),
      h(SettingRow, { label: t('muscle_kg') },
        h(NumField, { value: muscle, min: 10, max: 120, onCommit: setMuscle })),
      h(SettingRow, { label: t('water_pct') },
        h(NumField, { value: water, min: 20, max: 80, onCommit: setWater })),
      h('div', { className: 'modal-btns' },
        h('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () {
            var entry = normaliseBody({
              ts: Date.now(),
              kg: parseFloat(kg) || null,
              fatPct: parseFloat(fatPct) || null,
              muscleKg: parseFloat(muscle) || null,
              waterPct: parseFloat(water) || null,
              height: S.get('profile.height', null)
            });
            if (!entry.kg) { toast(t('weight')); return; }
            props.onSave(entry);
          }
        }, t('save')),
        h('button', { className: 'btn btn-outline btn-sm', onClick: props.onClose }, t('cancel')))));
}

/* ---------------------------------------------------------------------
 * Workout log
 * ------------------------------------------------------------------- */

function WorkoutCard() {
  var st = useState(false); var showAdd = st[0], setShowAdd = st[1];
  var list = S.get('workouts', []);

  var rows = [];
  for (var i = list.length - 1; i >= 0 && rows.length < 15; i--) {
    (function (w) {
      var wt = workoutType(w.type);
      var z = hrZone(w.maxHr);
      var fasted = null;
      var hist = S.get('history', []);
      for (var j = 0; j < hist.length; j++) {
        if (w.ts >= hist[j].start && w.ts <= hist[j].end) {
          fasted = (w.ts - hist[j].start) / 3600000;
          break;
        }
      }
      rows.push(h('div', { key: 'wk' + w.id, className: 'row' },
        h('span', { style: { fontSize: '19px' } }, wt.emoji),
        h('div', { className: 'row-main' },
          h('div', { className: 'row-title' },
            (isRTL() ? wt.ar : wt.en)
            + (w.distanceKm ? ' · ' + num(w.distanceKm) + ' ' + t('km') : '')
            + (w.durationMs ? ' · ' + fmtShort(w.durationMs) : '')),
          h('div', { className: 'row-sub' },
            fmtDate(w.ts) + ' ' + fmtTimeOfDay(w.ts)
            + (w.calories ? ' · ' + num(w.calories) + ' ' + t('calories') : '')
            + (w.maxHr ? ' · ' + num(w.maxHr) + ' ' + t('bpm') : '')
            + (z ? ' · ' + t('zone_' + z.level) : '')
            + (fasted !== null ? ' · ' + t('fasted_workout') + ' ' + num(Math.floor(fasted)) + t('hour_short') : ''))),
        h(DeleteButton, {
          onConfirm: function () {
            var kept = [];
            var all = S.get('workouts', []);
            for (var x = 0; x < all.length; x++) if (all[x].id !== w.id) kept.push(all[x]);
            S.set('workouts', kept);
            toast(t('deleted'));
            refresh();
          }
        })));
    })(list[i]);
  }

  return h(Card, {
    title: t('workouts'), icon: 'dumbbell',
    right: h('button', {
      className: 'btn btn-sm btn-outline',
      onClick: function () { setShowAdd(true); }
    }, t('add_workout'))
  },
    rows.length ? rows : h(Empty, { text: t('no_workouts') }),
    showAdd ? h(WorkoutModal, {
      onClose: function () { setShowAdd(false); },
      onSave: function (w) {
        var all = S.get('workouts', []);
        all.push(w);
        sortByTime(all, 'ts');
        S.set('workouts', all);
        setShowAdd(false);
        toast(t('saved'));
        refresh();
      }
    }) : null);
}

function WorkoutModal(props) {
  var s0 = useState('cycle'); var type = s0[0], setType = s0[1];
  var s1 = useState(''); var dist = s1[0], setDist = s1[1];
  var s2 = useState(''); var mins = s2[0], setMins = s2[1];
  var s3 = useState(''); var cals = s3[0], setCals = s3[1];
  var s4 = useState(''); var avg = s4[0], setAvg = s4[1];
  var s5 = useState(''); var mx = s5[0], setMx = s5[1];

  var typeBtns = [];
  for (var i = 0; i < WORKOUT_TYPES.length; i++) {
    (function (wt) {
      typeBtns.push(h('button', {
        key: 'wt' + wt.k,
        className: 'goal-btn' + (type === wt.k ? ' active' : ''),
        onClick: function () { setType(wt.k); }
      }, wt.emoji + ' ' + (isRTL() ? wt.ar : wt.en)));
    })(WORKOUT_TYPES[i]);
  }

  return h('div', { className: 'modal-overlay', onClick: props.onClose },
    h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
      h('h3', null, t('add_workout')),
      h('div', { className: 'goal-selector' }, typeBtns),
      h(SettingRow, { label: t('distance_km') },
        h(NumField, { value: dist, min: 0, max: 500, onCommit: setDist })),
      h(SettingRow, { label: t('duration_min') },
        h(NumField, { value: mins, min: 0, max: 1440, onCommit: setMins })),
      h(SettingRow, { label: t('calories_burned') },
        h(NumField, { value: cals, min: 0, max: 10000, onCommit: setCals })),
      h(SettingRow, { label: t('avg_hr') },
        h(NumField, { value: avg, min: 30, max: 230, onCommit: setAvg })),
      h(SettingRow, { label: t('max_hr') },
        h(NumField, { value: mx, min: 30, max: 230, onCommit: setMx })),
      h('div', { className: 'modal-btns' },
        h('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () {
            props.onSave({
              id: uid(), ts: Date.now(), type: type,
              distanceKm: parseFloat(dist) || null,
              durationMs: (parseFloat(mins) || 0) * 60000 || null,
              calories: parseFloat(cals) || null,
              avgHr: parseFloat(avg) || null,
              maxHr: parseFloat(mx) || null
            });
          }
        }, t('save')),
        h('button', { className: 'btn btn-outline btn-sm', onClick: props.onClose }, t('cancel')))));
}

/* ---------------------------------------------------------------------
 * Coach
 * ------------------------------------------------------------------- */

function CoachPage() {
  var cf = S.get('currentFast', {});
  var hours = fastElapsed(cf) / 3600000;
  var checkin = latestCheckin();
  var cards = coachAdvice(hours, checkin, !!cf.active);
  var tips = randomTips(4);

  var adviceCards = [];
  for (var a = 0; a < cards.length; a++) {
    (function (c) {
      adviceCards.push(h('div', { key: 'ad' + a, className: 'tip-card ' + c.tone },
        h('div', { className: 'tip-title' }, c.icon + ' ' + c.title),
        h('div', { className: 'tip-text' }, c.text)));
    })(cards[a]);
  }

  var tipCards = [];
  for (var i = 0; i < tips.length; i++) {
    tipCards.push(h('div', { key: 'tp' + i, className: 'tip-card' },
      h('div', { className: 'tip-text' }, '• ' + tips[i])));
  }

  // The expert engine reads the logged numbers rather than the clock, so it
  // sits above the phase advice: when it has something to say it is the most
  // useful thing on the page, and when it has nothing it says nothing.
  var insights = [];
  try { insights = expertInsights(); } catch (e) { insights = []; }

  // My reading of the record as a whole, which is a different job from
  // applying rules to it — including where the data itself is the problem.
  var analysis = [];
  try { analysis = personalAnalysis(); } catch (e) { analysis = []; }
  var analysisCards = [];
  for (var q = 0; q < analysis.length; q++) {
    (function (sec) {
      analysisCards.push(h('div', { key: 'pa' + sec.id, className: 'pa-card ' + sec.severity },
        h('div', { className: 'pa-head' },
          h('span', { className: 'pa-title' }, sec.title),
          h('span', { className: 'sev sev-' + sec.severity },
            t('sev_' + sec.severity))),
        h('div', { className: 'pa-body' }, sec.body),
        sec.action ? h('div', { className: 'pa-action' }, sec.action) : null));
    })(analysis[q]);
  }

  // Anything previously flagged that has since cleared, reported back.
  var follows = [];
  try { follows = insightFollowUps(); } catch (e) { follows = []; }
  var followCards = [];
  for (var f = 0; f < follows.length; f++) {
    followCards.push(h('div', { key: 'fu' + follows[f].id, className: 'insight-card good' },
      h('div', { className: 'insight-head' },
        h('span', { className: 'insight-icon' }, '✅'),
        h('span', { className: 'insight-title' }, follows[f].title)),
      h('div', { className: 'insight-text' }, follows[f].text)));
  }
  var insightCards = [];
  for (var k = 0; k < insights.length; k++) {
    (function (c, idx) {
      insightCards.push(h('div', { key: 'ix' + idx, className: 'insight-card ' + c.tone },
        h('div', { className: 'insight-head' },
          h('span', { className: 'insight-icon' }, c.icon),
          h('span', { className: 'insight-title' }, c.title),
          h('span', { className: 'prio prio-' + c.priority }, t('prio_' + c.priority))),
        h('div', { className: 'insight-text' }, c.text)));
    })(insights[k], k);
  }

  return h('div', null,
    h(RecoveryCard, null),
    h(CheckInCard, null),

    analysisCards.length
      ? h('div', null,
          h('div', { className: 'section-title' }, t('pa_title')),
          h('div', { className: 'section-sub' }, t('pa_sub')),
          analysisCards)
      : null,

    followCards.length
      ? h('div', null,
          h('div', { className: 'section-title' }, t('followups')),
          followCards)
      : null,

    h('div', { className: 'section-title' }, t('expert_title')),
    h('div', { className: 'section-sub' }, t('expert_sub')),
    insightCards.length ? insightCards
      : h('div', { className: 'tip-card' }, h('div', { className: 'tip-text' }, t('expert_empty'))),

    h('div', { className: 'section-title' },
      t('coach_title') + (checkin ? ' — ' + t('personalized') : '')),
    adviceCards,

    h('div', { className: 'section-title' }, t('refeeding')),
    h('div', { className: 'refeed-card' },
      h('div', { className: 'refeed-phase' }, t('refeed_phase1')),
      h('div', { className: 'tip-text' }, t('refeed_phase1_desc'))),
    h('div', { className: 'refeed-card' },
      h('div', { className: 'refeed-phase' }, t('refeed_phase2')),
      h('div', { className: 'tip-text' }, t('refeed_phase2_desc'))),
    h('div', { className: 'tip-card warn' },
      h('div', { className: 'tip-title' }, h(Icon,{name:'ban',size:15}), t('refeed_rule')),
      h('div', { className: 'tip-text' }, t('refeed_rule_desc'))),
    hours >= 48 ? h('div', { className: 'tip-card warn' },
      h('div', { className: 'tip-title' }, t('refeeding') + ' 48h+'),
      h('div', { className: 'tip-text' }, t('refeed_long_warn'))) : null,

    h('div', { className: 'section-title' }, t('tips')),
    tipCards,

    h('div', { className: 'alert-box' }, t('disclaimer_text')));
}

/* ---------------------------------------------------------------------
 * Settings
 * ------------------------------------------------------------------- */

/**
 * Pushes the stored appearance settings onto <html>.
 *
 * Theme and accent are attributes rather than inline styles so the CSS keeps
 * every value in one place; the type scale is a single multiplier, which
 * keeps headings and body text in proportion instead of letting one grow
 * into the other.
 */
function applyAppearance() {
  var root = document.documentElement;
  var theme = S.get('settings.theme', 'dark');
  var accent = S.get('settings.accent', 'blue');
  var scale = parseFloat(S.get('settings.textScale', 1)) || 1;

  if (theme === 'system') {
    var dark = !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
  if (accent === 'blue') root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);
  root.style.setProperty('--scale', String(scale));

  // Keep the system chrome in step with the surface behind it.
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content',
      root.getAttribute('data-theme') === 'light' ? '#f4f5f9' : '#0e0e18');
  }
}

/**
 * Accent choices. Red is absent by design: it is the destructive colour, and
 * an accent sitting on the same hue teaches the user that red means "press
 * me" — right up until the red thing they press deletes something.
 */
var ACCENTS = [
  { k: 'blue', hex: '#3d8bfd' },
  { k: 'teal', hex: '#00b3a4' },
  { k: 'green', hex: '#00b368' },
  { k: 'amber', hex: '#f5a623' },
  { k: 'purple', hex: '#a259ff' }
];

function AppearanceCard() {
  var theme = S.get('settings.theme', 'dark');
  var accent = S.get('settings.accent', 'blue');
  var scale = parseFloat(S.get('settings.textScale', 1)) || 1;

  function set(key, value) {
    S.set('settings.' + key, value);
    applyAppearance();
    refresh();
  }

  function segment(current, options, key) {
    var btns = [];
    for (var i = 0; i < options.length; i++) {
      (function (opt) {
        btns.push(h('button', {
          key: 'sg' + key + opt.v,
          className: 'seg-btn' + (current === opt.v ? ' on' : ''),
          onClick: function () { set(key, opt.v); }
        }, opt.label));
      })(options[i]);
    }
    return h('div', { className: 'seg' }, btns);
  }

  var swatches = [];
  for (var a = 0; a < ACCENTS.length; a++) {
    (function (c) {
      swatches.push(h('button', {
        key: 'ac' + c.k,
        className: 'swatch' + (accent === c.k ? ' on' : ''),
        'aria-label': c.k,
        onClick: function () { set('accent', c.k); }
      }, h('i', { style: { background: c.hex } })));
    })(ACCENTS[a]);
  }

  return h(Card, { flat: true },
    h(SettingRow, { label: t('theme') }),
    segment(theme, [
      { v: 'dark', label: t('theme_dark') },
      { v: 'light', label: t('theme_light') },
      { v: 'system', label: t('theme_system') }
    ], 'theme'),

    h('div', { style: { height: 'var(--s4)' } }),
    h(SettingRow, { label: t('accent') }),
    h('div', { className: 'swatch-row' }, swatches),

    h('div', { style: { height: 'var(--s4)' } }),
    h(SettingRow, { label: t('text_size') }),
    segment(scale, [
      { v: 0.92, label: t('size_s') },
      { v: 1, label: t('size_m') },
      { v: 1.12, label: t('size_l') },
      { v: 1.25, label: t('size_xl') }
    ], 'textScale'));
}

/**
 * Ramadan mode.
 *
 * The window stops being a setting and becomes the sun: iftar at maghrib,
 * suhoor closing at fajr, recomputed daily for the user's coordinates.
 */
function RamadanCard() {
  var on = S.get('settings.ramadan', false);
  var win = on ? ramadanWindow() : null;

  function set(key, value) {
    S.set('settings.' + key, value);
    syncReminders();
    refresh();
  }

  var convBtns = [];
  for (var k in SUN_CONVENTIONS) {
    if (!Object.prototype.hasOwnProperty.call(SUN_CONVENTIONS, k)) continue;
    (function (key) {
      convBtns.push(h('button', {
        key: 'cv' + key,
        className: 'goal-btn' + (S.get('settings.sunConvention', 'egypt') === key ? ' active' : ''),
        onClick: function () { set('sunConvention', key); }
      }, isRTL() ? SUN_CONVENTIONS[key].ar : SUN_CONVENTIONS[key].en));
    })(k);
  }

  return h(Card, { flat: true },
    h(SettingRow, { label: t('ramadan_enable'), hint: t('ramadan_hint') },
      h(Switch, { on: on, onChange: function () { set('ramadan', !on); } })),

    on ? h('div', null,
      win
        ? h('div', null,
            h('div', { className: 'ram-strip', style: { marginTop: 'var(--s3)' } },
              h('div', { className: 'ram-cell' },
                h('div', { className: 'ram-time' }, win.maghrib),
                h('div', { className: 'ram-label' }, t('maghrib'))),
              h('div', { className: 'ram-cell' },
                h('div', { className: 'ram-time' }, win.fajr),
                h('div', { className: 'ram-label' }, t('fajr'))),
              h('div', { className: 'ram-cell' },
                h('div', { className: 'ram-time' }, num(win.fastHours)),
                h('div', { className: 'ram-label' }, t('fast_length')))),
            h('div', { className: 'info-box', style: { marginTop: 0 } }, t('ramadan_note')))
        : h('div', { className: 'alert-box' }, t('ramadan_no_location')),

      h(SettingRow, { label: t('latitude') },
        h(NumField, {
          value: S.get('settings.lat', DEFAULT_COORDS.lat), step: 0.0001,
          onCommit: function (v) { set('lat', v); }
        })),
      h(SettingRow, { label: t('longitude') },
        h(NumField, {
          value: S.get('settings.lon', DEFAULT_COORDS.lon), step: 0.0001,
          onCommit: function (v) { set('lon', v); }
        })),
      h(SettingRow, { label: t('use_my_location'), hint: t('use_my_location_hint') },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () {
            var loc = N.parse(N.call('lastLocation'), null);
            if (!loc || !loc.lat) { toast(t('location_unavailable')); return; }
            S.set('settings.lat', Math.round(loc.lat * 10000) / 10000);
            S.set('settings.lon', Math.round(loc.lon * 10000) / 10000);
            toast(t('saved'));
            refresh();
          }
        }, t('detect'))),

      h('div', { className: 'section-title' }, t('calc_method')),
      h('div', { className: 'goal-selector' }, convBtns)
    ) : null);
}

/** Preset schedules, with adherence measured against the days each plan asks
 *  for rather than against every day. */
function PlanCard() {
  var current = S.get('settings.plan', 'custom');
  var adherence = planAdherence();

  var btns = [];
  for (var i = 0; i < FASTING_PLANS.length; i++) {
    (function (p) {
      btns.push(h('button', {
        key: 'pl' + p.k,
        className: 'goal-btn' + (current === p.k ? ' active' : ''),
        onClick: function () {
          var applied = applyPlan(p.k);
          syncReminders();
          toast(t('plan_applied') + ' — ' + (isRTL() ? applied.ar : applied.en));
          refresh();
        }
      }, isRTL() ? p.ar : p.en));
    })(FASTING_PLANS[i]);
  }

  var plan = planByKey(current);
  var dayNames = isRTL() ? WEEKDAYS_AR : WEEKDAYS_EN;
  var days = '';
  if (plan.days) {
    var parts = [];
    for (var d = 0; d < plan.days.length; d++) parts.push(dayNames[plan.days[d]]);
    days = parts.join(' · ');
  }

  return h(Card, { flat: true },
    h('div', { className: 'goal-selector', style: { marginTop: 0 } }, btns),
    plan.k === 'custom'
      ? h('div', { className: 'card-sub', style: { marginTop: '12px', textAlign: 'center' } },
          t('plan_none'))
      : h('div', null,
          h('div', { className: 'chip-row', style: { justifyContent: 'center' } },
            h('span', { className: 'chip' },
              t('fasting_goal') + ': ' + num(plan.goal) + t('hour_short')),
            plan.window
              ? h('span', { className: 'chip' }, plan.window[0] + ' - ' + plan.window[1])
              : null,
            days ? h('span', { className: 'chip' }, t('plan_days') + ': ' + days) : null),
          adherence
            ? h('div', { className: 'stats-grid', style: { marginTop: '12px' } },
                h(Stat, { value: num(adherence.pct) + '%', label: t('plan_adherence'), tone: 'green' }),
                h(Stat, { value: num(adherence.hit) + '/' + num(adherence.target), label: t('plan_last14') }),
                h(Stat, { value: num(plan.goal) + t('hour_short'), label: t('fasting_goal'), tone: 'gold' }))
            : null));
}

function SettingsPage() {
  var s1 = useState(false); var showImport = s1[0], setShowImport = s1[1];
  var s2 = useState(''); var importText = s2[0], setImportText = s2[1];
  var s3 = useState(false); var confirmReset = s3[0], setConfirmReset = s3[1];

  var p = S.get('profile', {});

  function setProfile(key, val) {
    S.set('profile.' + key, val);
    if (key === 'lang') N.call('setLang', val);
    if (key === 'weight') N.call('setWeight', parseFloat(val) || 70);
    refresh();
  }

  function numberField(key, min, max) {
    return h(NumField, {
      key: 'nf_' + key,
      value: p[key],
      min: min,
      max: max,
      onCommit: function (v) { setProfile(key, v); }
    });
  }

  var sups = S.get('supplements', []);
  var supCards = [];
  for (var i = 0; i < sups.length; i++) {
    (function (sup) {
      var takenToday = false;
      for (var j = 0; j < (sup.log || []).length; j++) {
        if (dayKey(sup.log[j]) === dayKey(Date.now())) takenToday = true;
      }
      supCards.push(h('div', { key: 'sp' + sup.id, className: 'card-flat' },
        h('div', { className: 'row-title', style: { color: '#f5a623' } }, sup.name),
        h('div', { className: 'row-sub' }, t('dosage') + ': ' + sup.dosage),
        h('div', { className: 'alert-box' }, t(sup.warning || 'no_double_dose')),
        h('div', { className: 'btn-group', style: { marginTop: '10px' } },
          h('button', {
            className: 'btn btn-sm ' + (takenToday ? 'btn-outline' : 'btn-green'),
            disabled: takenToday,
            onClick: function () { takeSupplement(sup.id); }
          }, takenToday ? [h(Icon,{key:'ck',name:'check',size:15}), t('taken_today')] : t('take_now')))));
    })(sups[i]);
  }

  return h('div', null,
    h('div', { className: 'section-title' }, t('profile')),
    h(Card, { flat: true },
      h(SettingRow, { label: t('name') },
        h(TextField, {
          value: p.name || '',
          onCommit: function (v) { setProfile('name', v); }
        })),
      h(SettingRow, { label: t('weight') }, numberField('weight', 25, 350)),
      h(SettingRow, { label: t('height') }, numberField('height', 90, 250)),
      h(SettingRow, { label: t('age') }, numberField('age', 10, 110)),
      h(SettingRow, { label: t('gender') },
        h('select', {
          className: 'setting-input', value: p.gender,
          onChange: function (e) { setProfile('gender', e.target.value); }
        },
          h('option', { value: 'male' }, t('male')),
          h('option', { value: 'female' }, t('female')))),
      h(SettingRow, { label: t('activity_level') },
        h('select', {
          className: 'setting-input', value: p.activity,
          onChange: function (e) { setProfile('activity', e.target.value); }
        },
          h('option', { value: 'sedentary' }, t('sedentary')),
          h('option', { value: 'light' }, t('light')),
          h('option', { value: 'moderate' }, t('moderate')),
          h('option', { value: 'active' }, t('active')),
          h('option', { value: 'very_active' }, t('very_active')))),
      h(SettingRow, { label: t('language') },
        h('div', { className: 'lang-toggle' },
          h('button', {
            className: 'lang-btn' + (p.lang === 'ar' ? ' active' : ''),
            onClick: function () { setProfile('lang', 'ar'); }
          }, 'ع'),
          h('button', {
            className: 'lang-btn' + (p.lang === 'en' ? ' active' : ''),
            onClick: function () { setProfile('lang', 'en'); }
          }, 'EN')))),

    h('div', { className: 'section-title' }, t('band')),
    h(Card, { flat: true },
      h(SettingRow, { label: bandStatusText(), hint: BAND.name || '' },
        h('button', {
          className: 'btn btn-sm ' + (BAND.status === 'connected' ? 'btn-outline' : 'btn-primary'),
          onClick: function () {
            if (BAND.status === 'connected') { N.call('bandDisconnect', false); setTimeout(pullNative, 300); refresh(); }
            else connectBand();
          }
        }, BAND.status === 'connected' ? t('disconnect_band') : t('connect_band'))),
      h(SettingRow, { label: t('auto_connect') },
        h(Switch, {
          on: !!BAND.auto,
          onChange: function () {
            var next = !BAND.auto;
            BAND.auto = next;
            N.call('bandAuto', next);
            refresh();
          }
        })),
      BAND.saved ? h(SettingRow, { label: t('forget_band') },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () { N.call('bandDisconnect', true); setTimeout(pullNative, 300); refresh(); }
        }, t('delete'))) : null,
      h('div', { className: 'info-box' }, t('band_hint'))),

    h('div', { className: 'section-title' }, t('activity')),
    h(Card, { flat: true },
      h(SettingRow, {
        label: t('steps_label'),
        hint: SENSORS.hasStepSensor ? '' : t('no_step_sensor')
      }, h('span', { className: 'row-end' }, num(SENSORS.steps || 0))),
      h(SettingRow, { label: t('activity_level_now') },
        h('span', { className: 'row-end' }, t('level_' + (SENSORS.level || 'still')))),
      h(SettingRow, { label: t('reset_activity') },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () { N.call('sensorsReset'); setTimeout(pullNative, 300); refresh(); }
        }, t('confirm'))),
      (!PERMS.activity || !PERMS.bluetooth || !PERMS.notifications
        || !PERMS.location || !PERMS.camera)
        ? h(SettingRow, { label: t('permissions'), hint: t('perm_activity') },
          h('button', {
            className: 'btn btn-sm btn-primary',
            onClick: function () { N.call('requestPerms'); }
          }, t('grant_permissions')))
        : null,
      h(SettingRow, { label: t('battery_opt'), hint: t('battery_opt_hint') },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () { N.call('openBatterySettings'); }
        }, t('confirm')))),

    h('div', { className: 'section-title' }, t('supplements')),
    supCards,

    h('div', { className: 'section-title' }, t('settings')),
    h(Card, { flat: true },
      h(SettingRow, { label: t('notifications') },
        h(Switch, {
          on: S.get('settings.notifyPhase', true),
          onChange: function () {
            var next = !S.get('settings.notifyPhase', true);
            S.set('settings.notifyPhase', next);
            N.call('setNotifyPhase', next);
            refresh();
          }
        })),
      h(SettingRow, { label: t('arabic_digits') },
        h(Switch, {
          on: S.get('settings.arabicDigits', false),
          onChange: function () {
            S.set('settings.arabicDigits', !S.get('settings.arabicDigits', false));
            refresh();
          }
        }))),

    h('div', { className: 'section-title' }, t('plan')),
    h(PlanCard, null),

    h('div', { className: 'section-title' }, t('sleep')),
    h(Card, { flat: true },
      h(SettingRow, { label: t('wake_time') },
        h(TextField, {
          value: S.get('settings.wakeTime', '09:00'),
          placeholder: '09:00',
          onCommit: function (v) { S.set('settings.wakeTime', v); refresh(); }
        })),
      h(SettingRow, { label: t('sleep_target') },
        h(NumField, {
          value: S.get('settings.sleepTarget', 7.5), min: 4, max: 12,
          onCommit: function (v) { S.set('settings.sleepTarget', v); refresh(); }
        })),
      h(SettingRow, { label: t('bedtime') },
        h('span', { className: 'row-end' }, stimulantCutoff('caffeine').bed)),
      h(SettingRow, { label: t('caffeine_cutoff') },
        h('span', { className: 'row-end', style: { color: '#f5a623' } },
          stimulantCutoff('caffeine').cutoff))),

    h('div', { className: 'section-title' }, t('eating_window')),
    h(Card, { flat: true },
      h(SettingRow, { label: t('window_start') },
        h(TextField, {
          value: S.get('settings.windowStart', '17:00'), placeholder: '17:00',
          onCommit: function (v) { S.set('settings.windowStart', v); syncReminders(); refresh(); }
        })),
      h(SettingRow, { label: t('window_end') },
        h(TextField, {
          value: S.get('settings.windowEnd', '21:00'), placeholder: '21:00',
          onCommit: function (v) { S.set('settings.windowEnd', v); syncReminders(); refresh(); }
        }))),

    h('div', { className: 'section-title' }, t('reminders')),
    h(Card, { flat: true },
      !PERMS.notifications
        ? h('div', { className: 'alert-box', style: { marginTop: 0, marginBottom: '10px' } },
            t('rem_need_perm'))
        : null,
      h(ReminderToggle, { k: 'water', label: t('rem_water'), hint: t('rem_water_hint') }),
      h(ReminderToggle, { k: 'motivation', label: t('rem_motivation'), hint: t('rem_motivation_hint') }),
      h(ReminderToggle, { k: 'window', label: t('rem_window'), hint: t('rem_window_hint') }),
      h(ReminderToggle, { k: 'checkin', label: t('rem_checkin'), timeKey: 'checkinTime' }),
      h(ReminderToggle, { k: 'supplement', label: t('rem_supplement'), timeKey: 'supplementTime' }),
      h(ReminderToggle, { k: 'nudge', label: t('rem_nudge'), hint: t('rem_nudge_hint'), timeKey: 'nudgeTime' }),
      h(ReminderToggle, { k: 'insight', label: t('insight_time'), hint: t('insight_time_hint'),
        timeKey: 'insightTime', defaultTime: '11:00' }),
      h(ReminderToggle, { k: 'protein', label: t('rem_protein'), hint: t('rem_protein_hint') }),
      h(SettingRow, { label: t('rem_test') },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () {
            N.call('testReminder', 'checkin');
            toast(t('rem_sent'));
          }
        }, t('confirm')))),

    h('div', { className: 'section-title' }, t('appearance')),
    h(AppearanceCard, null),

    h('div', { className: 'section-title' }, t('ramadan_mode')),
    h(RamadanCard, null),

    h('div', { className: 'section-title' }, t('data')),
    h(Card, { flat: true },
      h(SettingRow, { label: t('report'), hint: t('report_hint') },
        h('button', {
          className: 'btn btn-sm btn-primary',
          onClick: function () {
            if (N.ok()) N.call('share', t('report'), monthlyReport(30));
            else toast(t('no_native'));
          }
        }, t('share_report'))),
      h(SettingRow, { label: t('export_data') },
        h('button', {
          className: 'btn btn-sm btn-primary',
          onClick: function () {
            if (N.ok()) N.call('share', t('app_name'), exportText());
            else toast(t('no_native'));
          }
        }, t('export_data'))),
      h(SettingRow, { label: t('save_file') },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () {
            var path = N.call('saveExport', 'sayem-backup.json', exportJson());
            toast(path ? t('file_saved') + ' ' + path : t('no_native'));
          }
        }, t('save'))),
      h(SettingRow, { label: t('import_data') },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () { setShowImport(true); }
        }, t('import_data'))),
      h(SettingRow, { label: t('reset_data') },
        h('button', {
          className: 'btn btn-sm btn-danger',
          onClick: function () { setConfirmReset(true); }
        }, t('delete'))),
      h(SettingRow, { label: t('auto_backup'), hint: t('auto_backup_hint') },
        h(Switch, {
          on: S.get('settings.autoBackup', true),
          onChange: function () {
            S.set('settings.autoBackup', !S.get('settings.autoBackup', true));
            refresh();
          }
        })),
      S.get('backup.lastAt', 0)
        ? h(SettingRow, { label: t('last_backup') },
            h('span', { className: 'row-end' }, fmtDate(S.get('backup.lastAt', 0))))
        : null,
      h(SettingRow, { label: t('widget'), hint: t('widget_hint') },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () { N.call('refreshWidget'); toast(t('saved')); }
        }, t('confirm'))),
      h(SettingRow, { label: t('app_version') },
        h('span', { className: 'row-end' }, 'v' + APP_VERSION + (N.ok() ? '' : ' (web)')))),

    showImport ? h('div', { className: 'modal-overlay', onClick: function () { setShowImport(false); } },
      h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
        h('h3', null, t('import_data')),
        h('textarea', {
          className: 'search-input', rows: 6, placeholder: t('import_hint'),
          value: importText,
          onChange: function (e) { setImportText(e.target.value); }
        }),
        h('div', { className: 'modal-btns', style: { flexDirection: 'column' } },
          h('button', {
            className: 'btn btn-primary btn-block btn-sm',
            onClick: function () {
              var added = S.mergeJson(importText);
              if (added < 0) { toast('JSON ✗'); return; }
              setShowImport(false);
              recomputeStats();
              N.syncFast();
              toast(num(added) + ' ' + t('merged_records'));
              refresh();
            }
          }, t('import_merge')),
          h('button', {
            className: 'btn btn-danger btn-block btn-sm',
            onClick: function () {
              if (S.importJson(importText)) {
                setShowImport(false);
                recomputeStats();
                N.syncFast();
                toast(t('saved'));
              } else {
                toast('JSON ✗');
              }
              refresh();
            }
          }, t('import_replace')),
          h('button', {
            className: 'btn btn-outline btn-block btn-sm',
            onClick: function () { setShowImport(false); }
          }, t('cancel'))),
        h('div', { className: 'alert-box' }, t('import_replace_warn')))) : null,

    confirmReset ? h('div', { className: 'modal-overlay', onClick: function () { setConfirmReset(false); } },
      h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
        h('h3', null, t('reset_confirm')),
        h('div', { className: 'modal-btns' },
          h('button', {
            className: 'btn btn-danger-solid btn-sm',
            onClick: function () {
              S.reset();
              N.syncFast();
              setConfirmReset(false);
              toast(t('deleted'));
              refresh();
            }
          }, t('delete')),
          h('button', {
            className: 'btn btn-outline btn-sm',
            onClick: function () { setConfirmReset(false); }
          }, t('cancel'))))) : null);
}

function takeSupplement(id) {
  var sups = S.get('supplements', []);
  for (var i = 0; i < sups.length; i++) {
    if (sups[i].id === id) {
      if (!sups[i].log) sups[i].log = [];
      sups[i].log.push(Date.now());
      if (sups[i].log.length > 400) sups[i].log = sups[i].log.slice(sups[i].log.length - 400);
    }
  }
  S.set('supplements', sups);
  toast(t('saved'));
  refresh();
}

/* ---------------------------------------------------------------------
 * Activity hub — camera pulse, GPS route, sensor inventory
 * ------------------------------------------------------------------- */

function ActivityView(props) {
  return h('div', { className: 'subview' },
    h('div', { className: 'subview-hdr' },
      h('button', { className: 'back-btn', onClick: props.onClose }, h(Icon,{name:'back',size:22})),
      h('span', { className: 'subview-title' }, t('activity_hub'))),
    h('div', { className: 'subview-body' },
      h(HealthConnectCard, null),
      h(RouteCard, null),
      h(WorkoutCard, null),
      h(SensorInventoryCard, null)));
}

/**
 * Health Connect: the only route by which Huawei Health data (sleep, SpO2,
 * resting HR, workouts) can reach this app, and only once a bridge app has
 * copied it into Health Connect first.
 */
function HealthConnectCard() {
  var status = HEALTH.status || 'unknown';
  var granted = HEALTH.granted || 0;
  var last = S.get('health.lastSync', 0);

  var chipClass = 'chip';
  var label;
  if (status === 'ok' && granted > 0) { chipClass += ' ok'; label = t('hc_ready'); }
  else if (status === 'ok') { chipClass += ' warn'; label = t('hc_need_perms'); }
  else if (status === 'not_installed') { chipClass += ' bad'; label = t('hc_not_installed'); }
  else if (status === 'update_required') { chipClass += ' warn'; label = t('hc_update'); }
  else if (status === 'unsupported') { chipClass += ' bad'; label = t('hc_unsupported'); }
  else { label = '…'; }

  var actions = [];
  if (status === 'ok' && granted > 0) {
    actions.push(h('button', {
      key: 'sync', className: 'btn btn-sm btn-primary',
      disabled: HEALTH.syncing,
      onClick: function () {
        HEALTH.syncing = true;
        N.call('healthSync', 30);
        refresh();
      }
    }, HEALTH.syncing ? t('hc_syncing') : t('hc_sync')));
    actions.push(h('button', {
      key: 'open', className: 'btn btn-sm btn-outline',
      onClick: function () { N.call('healthOpenProvider'); }
    }, t('hc_open')));
  } else if (status === 'ok') {
    actions.push(h('button', {
      key: 'perm', className: 'btn btn-sm btn-primary',
      onClick: function () { N.call('healthRequestPermissions'); }
    }, t('hc_connect')));
  } else if (status === 'not_installed' || status === 'update_required') {
    actions.push(h('button', {
      key: 'install', className: 'btn btn-sm btn-primary',
      onClick: function () { N.call('healthOpenProvider'); }
    }, status === 'update_required' ? t('hc_update') : t('hc_install')));
  }

  var r = HEALTH.lastResult;

  return h(Card, { title: t('hc_title'), icon: 'link' },
    h('div', { className: 'chip-row' },
      h('span', { className: chipClass }, label),
      h('span', { className: 'chip' },
        t('hc_granted') + ': ' + num(granted) + '/' + num(HEALTH.total || 11)),
      h('span', { className: 'chip' },
        t('hc_last_sync') + ': ' + (last ? fmtDate(last) + ' ' + fmtTimeOfDay(last) : t('hc_never')))),

    actions.length ? h('div', { className: 'btn-group' }, actions) : null,

    r && !r.error && !r.empty ? h('div', { className: 'chip-row' },
      h('span', { className: 'chip ok' }, num(r.days) + ' ' + t('hc_days')),
      h('span', { className: 'chip ok' }, num(r.workouts) + ' ' + t('hc_workouts')),
      h('span', { className: 'chip ok' }, num(r.weights) + ' ' + t('hc_weights'))) : null,
    r && r.error ? h('div', { className: 'alert-box' }, t('hc_error') + ': ' + r.error) : null,

    // The commonest failure is not an error at all: an empty Health Connect
    // because nothing is writing Huawei data into it.
    r && r.empty ? h('div', { className: 'alert-box' },
      h('div', { style: { fontWeight: 700, marginBottom: '6px' } }, t('hc_empty_title')),
      h('div', null, t('hc_empty_body'))) : null,

    h('div', { className: 'info-box' }, t('hc_hint')));
}

/** Sleep, resting heart rate and SpO2 — everything the band knows but the
 *  phone cannot sense on its own. */
function HealthTrendsCard() {
  var sleep = latestSleep();
  var sleepAvg = healthAverage('sleepMs', 7);
  var restAvg = healthAverage('restingHr', 7);
  var spo2Avg = healthAverage('spo2Avg', 7);
  var days = S.get('healthDays', []);

  if (!days.length) {
    return h(Card, { title: t('health_trends'), icon: 'moon' },
      h(Empty, { text: t('no_health_data') }));
  }

  var bars = [];
  var maxSleep = 1;
  var recent = days.slice(Math.max(0, days.length - 7));
  var i;
  for (i = 0; i < recent.length; i++) {
    if ((recent[i].sleepMs || 0) > maxSleep) maxSleep = recent[i].sleepMs;
  }
  for (i = 0; i < recent.length; i++) {
    (function (d) {
      var pct = d.sleepMs ? Math.max(4, Math.round(d.sleepMs / maxSleep * 100)) : 3;
      bars.push(h('div', { key: 'sl' + d.date, className: 'bar-col' },
        h('div', {
          className: 'bar' + (d.sleepMs ? '' : ' dim'),
          style: { height: pct + '%', background: d.sleepMs ? '#9c27b0' : undefined }
        }),
        h('div', { className: 'bar-label' }, d.date.slice(8)),
        h('div', { className: 'bar-label' },
          d.sleepMs ? num((d.sleepMs / 3600000).toFixed(1)) : '')));
    })(recent[i]);
  }

  return h(Card, { title: t('health_trends'), icon: 'moon' },
    h('div', { className: 'stats-grid' },
      h(Stat, {
        value: sleep ? fmtShort(sleep.sleepMs) : '-',
        label: t('sleep_last'), tone: 'blue'
      }),
      h(Stat, {
        value: restAvg ? num(Math.round(restAvg)) : '-',
        label: t('resting_hr'), tone: 'gold'
      }),
      h(Stat, {
        value: spo2Avg ? num(spo2Avg.toFixed(0)) + '%' : '-',
        label: t('spo2_avg'), tone: 'green'
      })),
    h('div', { className: 'bar-chart' }, bars),
    sleepAvg ? h('div', { className: 'chip-row' },
      h('span', { className: 'chip' }, t('sleep_avg') + ': ' + fmtShort(sleepAvg))) : null);
}

function RouteCard() {
  var tracking = ROUTE.tracking;
  var km = ROUTE.distanceM / 1000;

  function saveRoute() {
    var path = N.routePath(400);
    var entry = {
      id: uid(),
      end: Date.now(),
      distanceM: ROUTE.distanceM,
      elapsedMs: ROUTE.elapsedMs,
      elevationM: ROUTE.elevationM,
      paceSecPerKm: ROUTE.paceSecPerKm,
      path: path
    };
    if (entry.distanceM > 20) {
      var routes = S.get('routes', []);
      routes.push(entry);
      if (routes.length > 100) routes = routes.slice(routes.length - 100);
      S.set('routes', routes);
      toast(t('route_saved') + ' — ' + fmtDistance(entry.distanceM));
    }
    N.call('routeStop');
    ROUTE_PATH = [];
    setTimeout(function () { pullNative(); refresh(); }, 200);
  }

  var controls;
  if (!tracking) {
    controls = h('button', {
      className: 'btn btn-sm btn-primary',
      onClick: function () {
        if (!N.ok()) { toast(t('no_native')); return; }
        var r = N.call('routeStart');
        if (r && r !== 'ok') toast(t('err_' + r) || r);
        setTimeout(function () { pullNative(); refresh(); }, 300);
      }
    }, h(Icon,{name:'play',size:16}), t('route_start'));
  } else {
    controls = h('div', { className: 'btn-group', style: { marginTop: 0 } },
      ROUTE.paused
        ? h('button', {
            className: 'btn btn-sm btn-green',
            onClick: function () { N.call('routeResume'); setTimeout(pullNative, 200); refresh(); }
          }, t('route_resume'))
        : h('button', {
            className: 'btn btn-sm btn-gold',
            onClick: function () { N.call('routePause'); setTimeout(pullNative, 200); refresh(); }
          }, t('route_pause')),
      h('button', { className: 'btn btn-sm btn-outline', onClick: saveRoute }, t('route_stop')));
  }

  var routes = S.get('routes', []);
  var histRows = [];
  for (var i = routes.length - 1; i >= 0 && histRows.length < 10; i--) {
    (function (r) {
      histRows.push(h('div', { key: 'rt' + r.id, className: 'row' },
        h('div', { className: 'row-main' },
          h('div', { className: 'row-title' }, fmtDistance(r.distanceM)),
          h('div', { className: 'row-sub' },
            fmtDate(r.end) + ' · ' + fmtShort(r.elapsedMs)
            + ' · ' + fmtPace(r.paceSecPerKm) + ' ' + t('min_per_km'))),
        h(DeleteButton, {
          onConfirm: function () {
            var kept = [];
            var all = S.get('routes', []);
            for (var j = 0; j < all.length; j++) if (all[j].id !== r.id) kept.push(all[j]);
            S.set('routes', kept);
            toast(t('deleted'));
            refresh();
          }
        })));
    })(routes[i]);
  }

  return h(Card, { title: t('route_title'), icon: 'route' },
    h(RouteMap, { path: ROUTE_PATH, live: tracking }),
    h('div', { className: 'stats-grid' },
      h(Stat, { value: fmtDistance(ROUTE.distanceM), label: t('route_distance'), tone: 'green' }),
      h(Stat, { value: fmtShort(ROUTE.elapsedMs), label: t('route_duration'), tone: 'gold' }),
      h(Stat, { value: fmtPace(ROUTE.paceSecPerKm), label: t('min_per_km'), tone: 'blue' })),
    h('div', { className: 'chip-row' },
      h('span', { className: 'chip' }, h(Icon,{name:'building',size:13}), num(ROUTE.elevationM) + ' ' + t('meter')),
      ROUTE.accuracy >= 0
        ? h('span', { className: 'chip' + (ROUTE.accuracy > 25 ? ' warn' : ' ok') },
            h(Icon,{name:'sensor',size:13}), '±' + num(ROUTE.accuracy) + ' ' + t('meter'))
        : null,
      h('span', { className: 'chip' }, h(Icon,{name:'route',size:13}), num(ROUTE.points))),
    h('div', { className: 'btn-group' }, controls),
    ROUTE.points > 1 ? h('div', { className: 'btn-group' },
      h('button', {
        className: 'btn btn-sm btn-outline',
        onClick: function () { N.call('routeOpenInMaps'); }
      }, t('route_open_maps')),
      h('button', {
        className: 'btn btn-sm btn-outline',
        onClick: function () { N.call('routeExportGpx', t('route')); }
      }, t('route_export'))) : null,
    h('div', { className: 'info-box' }, t('route_hint')),
    histRows.length ? h('div', null,
      h('div', { className: 'section-title' }, t('route_history')), histRows) : null);
}

/**
 * Draws the recorded track as a plain SVG polyline.
 * No map tiles on purpose: the app ships with no network permission at all,
 * and the shape of the walk is what is actually informative offline.
 */
function RouteMap(props) {
  var path = props.path || [];
  if (path.length < 4) {
    return h('div', { className: 'map-box' },
      h('div', { className: 'map-empty' },
        props.live ? t('route_waiting') : t('route_hint')));
  }
  var w = 320, hh = 200;
  var d = routeToPath(path, w, hh, 14);
  var startX = null;
  return h('div', { className: 'map-box' },
    h('svg', { width: '100%', height: '100%', viewBox: '0 0 ' + w + ' ' + hh, preserveAspectRatio: 'xMidYMid meet' },
      h('path', {
        d: d, fill: 'none', stroke: '#00e676', strokeWidth: 3,
        strokeLinecap: 'round', strokeLinejoin: 'round'
      })));
}

function SensorInventoryCard() {
  var keys = ['stepCounter', 'stepDetector', 'accelerometer', 'gyroscope',
    'barometer', 'light', 'proximity', 'magnetometer', 'heartRate'];
  var cells = [];
  for (var i = 0; i < keys.length; i++) {
    (function (k) {
      var on = !!INVENTORY[k];
      cells.push(h('div', { key: 'sn' + k, className: 'sensor-cell' + (on ? '' : ' off') },
        h(Icon, { name: on ? 'check' : 'close', size: 14 }),
        h('span', null, t('sensor_' + k))));
    })(keys[i]);
  }
  return h(Card, { title: t('phone_sensors'), icon: 'sensor' },
    h('div', { className: 'stats-grid' },
      h(Stat, { value: num(SENSORS.steps || 0), label: t('steps_label'), tone: 'green' }),
      h(Stat, { value: num(SENSORS.floors || 0), label: t('floors'), tone: 'gold' }),
      h(Stat, { value: num(SENSORS.elevationM || 0) + ' ' + t('meter'), label: t('elevation'), tone: 'blue' })),
    h('div', { style: { height: '10px' } }),
    h('div', { className: 'sensor-grid' }, cells));
}

/* ---------------------------------------------------------------------
 * Daily check-in (feeds the coach)
 * ------------------------------------------------------------------- */

var MOOD_ICONS = ['😖', '😕', '😐', '🙂', '😄'];
var LEVEL_ICONS = ['1', '2', '3', '4', '5'];

function CheckInCard() {
  var last = latestCheckin();
  var s1 = useState(last ? last.mood : 3); var mood = s1[0], setMood = s1[1];
  var s2 = useState(last ? last.energy : 3); var energy = s2[0], setEnergy = s2[1];
  var s3 = useState(last ? last.hunger : 3); var hunger = s3[0], setHunger = s3[1];

  function save() {
    var list = S.get('checkins', []);
    list.push({ ts: Date.now(), mood: mood, energy: energy, hunger: hunger });
    if (list.length > 400) list = list.slice(list.length - 400);
    S.set('checkins', list);
    toast(t('checkin_done'));
    refresh();
  }

  var trend = checkinTrend(7);

  return h(Card, { title: t('checkin'), icon: 'heart' },
    h(Scale, { name: 'mood', label: t('mood'), value: mood, icons: MOOD_ICONS, onChange: setMood }),
    h(Scale, { name: 'energy', label: t('energy'), value: energy, icons: LEVEL_ICONS, onChange: setEnergy }),
    h(Scale, { name: 'hunger', label: t('hunger'), value: hunger, icons: LEVEL_ICONS, onChange: setHunger }),
    h('div', { className: 'btn-group', style: { marginTop: '4px' } },
      h('button', { className: 'btn btn-sm btn-primary', onClick: save }, t('checkin_save'))),
    trend ? h('div', { className: 'chip-row' },
      h('span', { className: 'chip' }, '😊 ' + num(trend.mood.toFixed(1))),
      h('span', { className: 'chip' }, h(Icon,{name:'activity',size:13}), num(trend.energy.toFixed(1))),
      h('span', { className: 'chip' }, h(Icon,{name:'meals',size:13}), num(trend.hunger.toFixed(1))),
      h('span', { className: 'chip' }, num(trend.count) + ' × ' + t('checkin'))) : null);
}

/* ---------------------------------------------------------------------
 * Manual meal entry with a photo
 * ------------------------------------------------------------------- */

function ManualMealModal(props) {
  var s1 = useState(''); var name = s1[0], setName = s1[1];
  var s2 = useState(''); var cal = s2[0], setCal = s2[1];
  var s3 = useState(''); var prot = s3[0], setProt = s3[1];
  var s4 = useState(''); var carb = s4[0], setCarb = s4[1];
  var s5 = useState(''); var fat = s5[0], setFat = s5[1];
  var s6 = useState(''); var photo = s6[0], setPhoto = s6[1];
  var s7 = useState(''); var thumb = s7[0], setThumb = s7[1];
  var s8 = useState(false); var toDb = s8[0], setToDb = s8[1];

  function grabPhoto(which) {
    if (!N.ok()) { toast(t('no_native')); return; }
    _photoTarget = function (id) {
      _photoTarget = null;
      if (!id) { toast(t('photo_failed')); return; }
      setPhoto(id);
      setThumb(N.call('photoData', id) || '');
    };
    N.call(which === 'camera' ? 'photoCapture' : 'photoPick');
  }

  function save() {
    var trimmed = (name || '').replace(/^\s+|\s+$/g, '');
    if (!trimmed) { toast(t('meal_name')); return; }
    var food = {
      k: 'custom_' + uid(),
      ar: trimmed, en: trimmed,
      cal: parseFloat(cal) || 0,
      p: parseFloat(prot) || 0,
      c: parseFloat(carb) || 0,
      f: parseFloat(fat) || 0,
      custom: true
    };
    if (toDb) {
      var list = S.get('customFoods', []);
      list.unshift(food);
      if (list.length > 200) list = list.slice(0, 200);
      S.set('customFoods', list);
    }
    props.onSave(food, photo);
  }

  return h('div', { className: 'modal-overlay', onClick: props.onClose },
    h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
      h('h3', null, t('manual_meal')),
      h(TextField, {
        className: 'search-input', value: name,
        placeholder: t('meal_name'), onInput: setName
      }),
      h('div', { style: { height: '8px' } }),
      h(SettingRow, { label: t('calories') },
        h(NumField, { value: cal, min: 0, max: 5000, onCommit: function (v) { setCal(v); } })),
      h(SettingRow, { label: t('protein') },
        h(NumField, { value: prot, min: 0, max: 500, onCommit: function (v) { setProt(v); } })),
      h(SettingRow, { label: t('carbs') },
        h(NumField, { value: carb, min: 0, max: 900, onCommit: function (v) { setCarb(v); } })),
      h(SettingRow, { label: t('fat') },
        h(NumField, { value: fat, min: 0, max: 400, onCommit: function (v) { setFat(v); } })),
      h(SettingRow, { label: t('save_to_db') },
        h(Switch, { on: toDb, onChange: function () { setToDb(!toDb); } })),
      h('div', { className: 'btn-group', style: { marginTop: '6px' } },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () { grabPhoto('camera'); }
        }, h(Icon,{name:'camera',size:16}), t('take_photo')),
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () { grabPhoto('gallery'); }
        }, h(Icon,{name:'image',size:16}), t('from_gallery'))),
      thumb ? h('img', { className: 'photo-preview', src: thumb, alt: '' }) : null,
      thumb ? h('div', { className: 'btn-group' },
        h('button', {
          className: 'btn btn-sm btn-outline',
          onClick: function () {
            N.call('photoDelete', photo);
            setPhoto(''); setThumb('');
          }
        }, t('remove_photo'))) : null,
      h('div', { className: 'modal-btns' },
        h('button', { className: 'btn btn-primary btn-sm', onClick: save }, t('save')),
        h('button', { className: 'btn btn-outline btn-sm', onClick: props.onClose }, t('cancel')))));
}

/* ---------------------------------------------------------------------
 * First-run onboarding
 *
 * Replaces dropping the user straight into a settings-heavy home screen.
 * Four steps: the medical notice, who they are, how they fast, and the
 * permissions — each explaining why it is being asked for.
 * ------------------------------------------------------------------- */

function Onboarding(props) {
  var st = useState(0); var step = st[0], setStep = st[1];
  var p = S.get('profile', {});

  function setProfile(key, val) {
    S.set('profile.' + key, val);
    if (key === 'weight') N.call('setWeight', parseFloat(val) || 70);
    refresh();
  }

  function finish() {
    S.set('settings.onboarded', true);
    S.set('settings.disclaimerSeen', true);
    props.onDone();
  }

  var body;
  if (step === 0) {
    body = h('div', null,
      h('div', { className: 'onb-hero' }, h(Icon, { name: 'timer', size: 76, weight: 1.3 })),
      h('div', { className: 'onb-title' }, t('onb_w_title')),
      h('div', { className: 'onb-desc' }, t('onb_w_desc')),
      h('div', { className: 'alert-box' },
        h('div', { style: { fontWeight: 700, marginBottom: '6px' } }, t('disclaimer')),
        h('div', null, t('disclaimer_text'))));
  } else if (step === 1) {
    body = h('div', null,
      h('div', { className: 'onb-title' }, t('onb_p_title')),
      h('div', { className: 'onb-desc' }, t('onb_p_desc')),
      h('div', { style: { height: '14px' } }),
      h(Card, { flat: true },
        h(SettingRow, { label: t('name') },
          h(TextField, { value: p.name || '', onCommit: function (v) { setProfile('name', v); } })),
        h(SettingRow, { label: t('weight') },
          h(NumField, { value: p.weight, min: 25, max: 350, onCommit: function (v) { setProfile('weight', v); } })),
        h(SettingRow, { label: t('height') },
          h(NumField, { value: p.height, min: 90, max: 250, onCommit: function (v) { setProfile('height', v); } })),
        h(SettingRow, { label: t('age') },
          h(NumField, { value: p.age, min: 10, max: 110, onCommit: function (v) { setProfile('age', v); } })),
        h(SettingRow, { label: t('gender') },
          h('select', {
            className: 'setting-input', value: p.gender,
            onChange: function (e) { setProfile('gender', e.target.value); }
          },
            h('option', { value: 'male' }, t('male')),
            h('option', { value: 'female' }, t('female'))))));
  } else if (step === 2) {
    var goalBtns = [];
    var current = S.get('settings.defaultGoal', 20);
    for (var i = 0; i < GOAL_OPTIONS.length; i++) {
      (function (g) {
        goalBtns.push(h('button', {
          key: 'og' + g,
          className: 'goal-btn' + (current === g ? ' active' : ''),
          onClick: function () {
            S.set('settings.defaultGoal', g);
            S.set('currentFast.goal', g);
            refresh();
          }
        }, num(g) + (isRTL() ? 'س' : 'h')));
      })(GOAL_OPTIONS[i]);
    }
    body = h('div', null,
      h('div', { className: 'onb-title' }, t('onb_g_title')),
      h('div', { className: 'onb-desc' }, t('onb_g_desc')),
      h('div', { style: { height: '14px' } }),
      h(Card, { flat: true },
        h('div', { className: 'section-title', style: { marginTop: 0 } }, t('fasting_goal')),
        h('div', { className: 'goal-selector' }, goalBtns),
        h('div', { style: { height: '14px' } }),
        h(SettingRow, { label: t('window_start') },
          h(TextField, {
            value: S.get('settings.windowStart', '17:00'), placeholder: '17:00',
            onCommit: function (v) { S.set('settings.windowStart', v); refresh(); }
          })),
        h(SettingRow, { label: t('window_end') },
          h(TextField, {
            value: S.get('settings.windowEnd', '21:00'), placeholder: '21:00',
            onCommit: function (v) { S.set('settings.windowEnd', v); refresh(); }
          })),
        h(SettingRow, { label: t('wake_time') },
          h(TextField, {
            value: S.get('settings.wakeTime', '09:00'), placeholder: '09:00',
            onCommit: function (v) { S.set('settings.wakeTime', v); refresh(); }
          }))));
  } else {
    body = h('div', null,
      h('div', { className: 'onb-title' }, t('onb_perm_title')),
      h('div', { className: 'onb-desc' }, t('onb_perm_desc')),
      h('div', { style: { height: '14px' } }),
      h(Card, { flat: true },
        h(SettingRow, { label: t('permissions'), hint: t('perm_activity') },
          h('button', {
            className: 'btn btn-sm btn-primary',
            onClick: function () { N.call('requestPerms'); }
          }, t('grant_permissions'))),
        h(SettingRow, { label: t('onb_battery'), hint: t('onb_battery_why') },
          h('button', {
            className: 'btn btn-sm btn-outline',
            onClick: function () { N.call('openBatterySettings'); }
          }, t('confirm')))),
      h('div', { className: 'info-box' }, t('band_hint')),
      h('div', { style: { height: '10px' } }),
      h('div', { className: 'onb-title', style: { fontSize: '19px' } }, t('onb_done_title')),
      h('div', { className: 'onb-desc' }, t('onb_done_desc')));
  }

  var dots = [];
  for (var d = 0; d < 4; d++) {
    dots.push(h('span', { key: 'dot' + d, className: 'onb-dot' + (d === step ? ' on' : '') }));
  }

  return h('div', { className: 'onb' },
    h('div', { className: 'onb-body' },
      h('div', { className: 'onb-step' },
        t('onb_step') + ' ' + num(step + 1) + ' ' + t('onb_of') + ' ' + num(4)),
      body),
    h('div', { className: 'onb-dots' }, dots),
    h('div', { style: { display: 'flex', gap: '8px' } },
      step > 0 ? h('button', {
        className: 'btn btn-outline btn-sm',
        onClick: function () { setStep(step - 1); }
      }, t('onb_back')) : h('button', {
        className: 'btn btn-ghost btn-sm',
        onClick: finish
      }, t('onb_skip')),
      h('button', {
        className: 'btn btn-primary btn-block',
        onClick: function () { if (step < 3) setStep(step + 1); else finish(); }
      }, step < 3 ? t('onb_next') : t('onb_start'))));
}

/* ---------------------------------------------------------------------
 * Shell
 * ------------------------------------------------------------------- */

var TABS = [
  { id: 'home', icon: 'timer', label: 'home' },
  { id: 'meals', icon: 'meals', label: 'meals' },
  { id: 'liquids', icon: 'droplet', label: 'liquids' },
  { id: 'progress', icon: 'chart', label: 'progress' },
  { id: 'coach', icon: 'coach', label: 'coach' },
  { id: 'settings', icon: 'settings', label: 'settings' }
];

var _setTab = null;
var _curTab = 'home';
var _setView = null;
var _curView = null;

function App() {
  var v = useState(0); _bump = v[1];
  var tb = useState('home'); var tab = tb[0]; _setTab = tb[1];
  var vw = useState(null); var view = vw[0]; _setView = vw[1];
  var dt = useState(null); var detail = dt[0]; _setDetail = dt[1];
  _curTab = tab;
  _curView = view;
  _curDetail = detail;
  // Existing installs already accepted the notice, so they skip onboarding.
  var dc = useState(!S.get('settings.onboarded', false) && !S.get('settings.disclaimerSeen', false));
  var showOnboarding = dc[0], setShowOnboarding = dc[1];

  // 1 Hz tick while a fast runs; idle otherwise so we do not spin for nothing.
  useEffect(function () {
    var id = setInterval(function () {
      if (S.get('currentFast.active', false) && !S.get('currentFast.pausedAt', null)) refresh();
    }, 1000);
    return function () { clearInterval(id); };
  }, []);

  // Poll native every 15s as a safety net in case a push event is missed.
  useEffect(function () {
    pullNative();
    var id = setInterval(function () { pullNative(); refresh(); }, 15000);
    return function () { clearInterval(id); };
  }, []);

  useEffect(function () {
    document.documentElement.setAttribute('dir', isRTL() ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang());
  });

  var body;
  if (tab === 'meals') body = h(MealsPage, null);
  else if (tab === 'liquids') body = h(LiquidsPage, null);
  else if (tab === 'progress') body = h(ProgressPage, null);
  else if (tab === 'coach') body = h(CoachPage, null);
  else if (tab === 'settings') body = h(SettingsPage, null);
  else body = h(HomePage, null);

  var navItems = [];
  for (var i = 0; i < TABS.length; i++) {
    (function (item) {
      navItems.push(h('button', {
        key: item.id,
        className: 'bnav-item' + (tab === item.id ? ' active' : ''),
        onClick: function () { _setTab(item.id); }
      },
        h('span', { className: 'bnav-ico' }, h(Icon, { name: item.icon, size: 21 })),
        h('span', null, t(item.label))));
    })(TABS[i]);
  }

  var cf = S.get('currentFast', {});
  var headerRight = [];
  if (cf.active) {
    headerRight.push(h('span', { key: 'hf', className: 'hdr-chip' },
      h(Icon, { name: 'timer', size: 13 }), fmtShort(fastElapsed(cf))));
  }
  if (BAND.status === 'connected' && BAND.hr > 0) {
    headerRight.push(h('span', { key: 'hb', className: 'hdr-chip' },
      h(Icon, { name: 'heart', size: 13, color: METRIC_COLORS.hr }), num(BAND.hr)));
  }

  return h(React.Fragment, null,
    h('div', { className: 'hdr' },
      h('span', { className: 'hdr-title' }, t('app_name')),
      h('span', { className: 'hdr-side' }, headerRight)),
    h('div', { className: 'content' }, body),
    h('div', { className: 'bnav' }, navItems),

    view === 'activity'
      ? h(ActivityView, { onClose: function () { _setView(null); } })
      : null,

    detail
      ? h(MetricDetail, { metric: detail, onClose: function () { _setDetail(null); } })
      : null,

    showOnboarding ? h(Onboarding, {
      onDone: function () { setShowOnboarding(false); }
    }) : null);
}

/**
 * Hardware back: close an open modal, then pop to Home, then leave the app.
 * Native cannot read a return value here (see MainActivity.onBackPressed),
 * so the "nothing left to pop" case calls back into the bridge instead.
 */
window.__onBack = function () {
  var overlay = document.querySelector('.modal-overlay');
  if (overlay) {
    // Every dismissible modal closes on an overlay click, so replay one.
    var evt = document.createEvent('MouseEvents');
    evt.initEvent('click', true, true);
    overlay.dispatchEvent(evt);
    return;
  }
  if (_setDetail && _curDetail) {
    _setDetail(null);
    return;
  }
  if (_setView && _curView) {
    _setView(null);
    return;
  }
  if (_setTab && _curTab !== 'home') {
    _setTab('home');
    return;
  }
  N.call('exitApp');
};

/* ---------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------- */

(function boot() {
  S.load();
  // Before the first render, so the app never flashes the wrong theme.
  applyAppearance();

  // Reconcile: the service is the source of truth for whether we are fasting.
  N.call('setLang', S.get('profile.lang', 'ar'));
  N.call('setWeight', parseFloat(S.get('profile.weight', 70)) || 70);
  N.call('setNotifyPhase', S.get('settings.notifyPhase', true));
  N.syncFast();
  N.call('sensorsStart');
  pullNative();
  INVENTORY = N.inventory();
  N.call('healthRefresh');
  recomputeStats();
  syncReminders();
  S._onSave = scheduleInsightSync;
  syncInsights();
  if (applySleepEstimate(N.parse(N.call('sleepEstimate'), []))) recomputeStats();
  maybeAutoBackup();
  N.call('refreshWidget');

  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(h(App, null));
})();
