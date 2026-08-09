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
var PULSE = { status: 'idle', running: false, progress: 0, bpm: 0, quality: 0 };
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
  } else if (type === 'pulse') {
    PULSE = m(PULSE, data || {});
  } else if (type === 'pulseResult') {
    logPulse(data && data.bpm, 'camera');
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
  PULSE = m(PULSE, N.pulseState());
}

/** Records one heart-rate reading, from the camera or the band. */
function logPulse(bpm, source) {
  if (!bpm || bpm <= 0) return;
  var log = S.get('pulseLog', []);
  log.push({ ts: Date.now(), bpm: bpm, source: source || 'camera' });
  if (log.length > 400) log = log.slice(log.length - 400);
  S.set('pulseLog', log);
  recordHeartRate(bpm);
  N.call('vibrate', 40);
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
  N.call('vibrate', 60);
  toast(t('fast_ended') + ' — ' + fmtShort(dur));
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
  scale: ['M4 21.5h16', 'M12 3v18.5', 'M12 3 4 9h16L12 3Z']
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
  var segs = [];
  var labels = [];
  for (var i = 0; i < PHASES.length; i++) {
    var p = PHASES[i];
    var reached = hours >= p.from;
    segs.push(h('div', {
      key: 'sg' + i,
      className: 'timeline-seg',
      style: { background: reached ? p.color : '#2a2a4a' }
    }));
    labels.push(h('span', { key: 'lb' + i }, p.from + (isRTL() ? 'س' : 'h')));
  }
  return h('div', null,
    h('div', { className: 'timeline' }, segs),
    h('div', { className: 'timeline-labels' }, labels));
}

/* ---------------------------------------------------------------------
 * Home
 * ------------------------------------------------------------------- */

function HomePage() {
  var st = useState(false); var showStart = st[0], setShowStart = st[1];
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

  var controls;
  if (!cf.active) {
    controls = h('div', { className: 'btn-group' },
      h('button', { className: 'btn btn-primary', onClick: function () { startFast(Date.now(), goal); } },
        h(Icon,{name:'play',size:17}), t('start_fasting')),
      h('button', { className: 'btn btn-outline', onClick: function () { setShowStart(true); } },
        h(Icon,{name:'clock',size:17}), t('set_start_time')));
  } else if (cf.pausedAt) {
    controls = h('div', { className: 'btn-group' },
      h('button', { className: 'btn btn-green', onClick: resumeFast }, h(Icon,{name:'play',size:17}), t('resume')),
      h('button', { className: 'btn btn-danger', onClick: stopFast }, h(Icon,{name:'stop',size:17}), t('stop')));
  } else {
    controls = h('div', { className: 'btn-group' },
      h('button', { className: 'btn btn-gold', onClick: pauseFast }, h(Icon,{name:'pause',size:17}), t('pause')),
      h('button', { className: 'btn btn-danger', onClick: stopFast }, h(Icon,{name:'stop',size:17}), t('stop')));
  }

  var stateLabel = !cf.active ? t('idle_state') : (cf.pausedAt ? t('paused_state') : t('running_state'));

  return h('div', null,
    h(Card, null,
      h(Ring, { pct: pct, color: phase.color },
        h('div', { className: 'timer-time' }, fmtClock(ms)),
        cf.active
          ? h('div', { className: 'timer-pct' }, num(pctShown) + '% ' + t('of_goal'))
          : h('div', { className: 'timer-goal' }, t('start_prompt')),
        h('div', { className: 'timer-goal' },
          t('fasting_goal') + ': ' + num(goal) + ' ' + t('hours')),
        h('div', { className: 'timer-state' }, stateLabel)),

      h('div', { className: 'phase-name', style: { color: phase.color } }, phaseName(phase)),
      h('div', { className: 'phase-desc' }, phaseDesc(phase)),
      cf.active && nextMs > 0
        ? h('div', { className: 'phase-next' }, t('next_phase_in') + ' ' + fmtShort(nextMs))
        : null,

      h(PhaseTimeline, { hours: hours }),
      h('div', { className: 'goal-selector' }, goalBtns),
      controls,

      cf.active && hours >= 48
        ? h('div', { className: 'alert-box' }, t('long_fast_warn'))
        : null),

    h(LiveCard, null),
    h(QuickStats, null),

    showStart ? h(StartTimeModal, {
      goal: goal,
      onClose: function () { setShowStart(false); },
      onPick: function (ts) { setShowStart(false); startFast(ts, goal); }
    }) : null);
}

/** Band + phone-sensor live panel. */
function LiveCard() {
  var connected = BAND.status === 'connected';
  var busy = BAND.status === 'scanning' || BAND.status === 'connecting'
    || BAND.status === 'discovering' || BAND.status === 'reconnecting';

  var dotClass = 'dot';
  if (connected) dotClass += ' ok';
  else if (busy) dotClass += ' warn';
  else if (BAND.status && BAND.status.indexOf('err') === 0) dotClass += ' bad';

  var levelKey = 'level_' + (SENSORS.level || 'still');

  return h(Card, {
    title: t('activity'), icon: 'activity',
    right: h('button', {
      className: 'btn btn-sm btn-outline',
      onClick: function () { if (_setView) _setView('activity'); }
    }, t('open_activity'))
  },
    h('div', { className: 'live-row' },
      h('div', { className: 'live-metric' },
        h('div', { className: 'live-val', style: { color: '#e94560' } },
          h('span', { className: connected && BAND.hr > 0 ? 'hr-pulse' : '' },
            h(Icon,{name:'heart',size:19,color:'#e94560'})),
          connected && BAND.hr > 0 ? num(BAND.hr) : '--'),
        h('div', { className: 'live-unit' }, t('heart_rate') + ' (' + t('bpm') + ')')),
      h('div', { className: 'live-metric' },
        h('div', { className: 'live-val', style: { color: '#00e676' } }, num(SENSORS.steps || 0)),
        h('div', { className: 'live-unit' }, t('steps_label'))),
      h('div', { className: 'live-metric' },
        h('div', { className: 'live-val', style: { color: '#f5a623' } }, num(SENSORS.activeMinutes || 0)),
        h('div', { className: 'live-unit' }, t('active_minutes')))),

    h('div', { className: 'chip-row' },
      h('span', { className: 'chip' }, h('span', { className: dotClass }), bandStatusText()),
      connected && BAND.battery >= 0
        ? h('span', { className: 'chip' }, h(Icon,{name:'battery',size:13}), num(BAND.battery) + '%') : null,
      h('span', { className: 'chip' }, h(Icon,{name:'flame',size:13}), num(SENSORS.calories || 0) + ' ' + t('calories')),
      h('span', { className: 'chip' }, h(Icon,{name:'activity',size:13}), t(levelKey)),
      SENSORS.floors > 0
        ? h('span', { className: 'chip' }, h(Icon,{name:'building',size:13}), num(SENSORS.floors) + ' ' + t('floors')) : null,
      ROUTE.tracking
        ? h('span', { className: 'chip ok' }, h(Icon,{name:'route',size:13}), fmtDistance(ROUTE.distanceM)) : null),

    h('div', { className: 'btn-group', style: { marginTop: '12px' } },
      !connected ? h('button', { className: 'btn btn-sm btn-outline', onClick: connectBand },
        busy ? t('connecting') : t('connect_band')) : null,
      h('button', {
        className: 'btn btn-sm btn-outline',
        onClick: function () { if (_setView) _setView('activity'); }
      }, h(Icon,{name:'heart',size:16}), t('pulse_title'))));
}

function QuickStats() {
  var stats = S.get('stats', {});
  return h('div', { className: 'stats-grid' },
    h(Stat, { value: num(stats.currentStreak || 0), label: t('current_streak'), tone: 'gold' }),
    h(Stat, { value: num(stats.bestStreak || 0), label: t('best_streak'), tone: 'green' }),
    h(Stat, { value: num(stats.totalSessions || 0), label: t('total_sessions'), tone: 'blue' }));
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
function StartTimeModal(props) {
  var now = new Date();
  var st1 = useState(now.getHours()); var hh = st1[0], setHH = st1[1];
  var st2 = useState(now.getMinutes()); var mm = st2[0], setMM = st2[1];

  function bump(which, delta) {
    if (which === 'h') setHH((hh + delta + 24) % 24);
    else setMM((mm + delta + 60) % 60);
  }

  function confirm() {
    var d = new Date();
    d.setHours(hh, mm, 0, 0);
    var ts = d.getTime();
    // A time later than "now" means the user meant yesterday.
    if (ts > Date.now()) ts -= 86400000;
    props.onPick(ts);
  }

  return h('div', { className: 'modal-overlay', onClick: props.onClose },
    h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
      h('h3', null, t('set_start_time')),
      h('div', { className: 'time-picker' },
        h('div', { className: 'time-col' },
          h('button', { className: 'time-btn', onClick: function () { bump('h', 1); } }, h(Icon,{name:'plus',size:18})),
          h('div', { className: 'time-val' }, pad2(hh)),
          h('button', { className: 'time-btn', onClick: function () { bump('h', -1); } }, h(Icon,{name:'minus',size:18}))),
        h('div', { className: 'time-sep' }, ':'),
        h('div', { className: 'time-col' },
          h('button', { className: 'time-btn', onClick: function () { bump('m', 5); } }, h(Icon,{name:'plus',size:18})),
          h('div', { className: 'time-val' }, pad2(mm)),
          h('button', { className: 'time-btn', onClick: function () { bump('m', -5); } }, h(Icon,{name:'minus',size:18})))),
      h('div', { className: 'card-sub', style: { textAlign: 'center', marginTop: '10px' } },
        t('back_hours')),
      h('div', { className: 'modal-btns' },
        h('button', { className: 'btn btn-primary btn-sm', onClick: confirm }, t('confirm')),
        h('button', { className: 'btn btn-outline btn-sm', onClick: props.onClose }, t('cancel')))));
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
    // Keep the log bounded: a week of meals is plenty for the totals view.
    var cutoff = Date.now() - 7 * 86400000;
    var kept = [];
    for (var x = 0; x < meals.length; x++) if (meals[x].ts >= cutoff) kept.push(meals[x]);
    S.set('meals', kept);
    refresh();
  }

  function addFood(food) {
    if (S.get('currentFast.active', false)) { setPending(food); return; }
    reallyAdd(food);
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
      resultRows.push(h('div', {
        key: 'f' + food.k, className: 'row',
        onClick: function () { addFood(food); }
      },
        h('div', { className: 'row-main' },
          h('div', { className: 'row-title' }, isRTL() ? food.ar : food.en),
          h('div', { className: 'row-sub' },
            food.cal === null || food.cal === undefined
              ? '—'
              : 'P ' + food.p + ' · C ' + food.c + ' · F ' + food.f)),
        h('div', { className: 'row-end' },
          food.cal === null || food.cal === undefined
            ? '—'
            : num(food.cal) + ' ' + t('calories'))));
    })(results[r]);
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
        h('button', { className: 'icon-btn danger', onClick: function () { removeMeal(it.id); } }, h(Icon, { name: 'trash', size: 17 }))));
    })(today[k2]);
  }

  return h('div', null,
    h(Card, { title: t('todays_total'), icon: 'meals' },
      h('div', { className: 'stats-grid-4' },
        h(Stat, { value: num(Math.round(tot.cal)), label: t('calories'), tone: 'gold' }),
        h(Stat, { value: num(Math.round(tot.p)) + 'g', label: t('protein'), tone: 'green' }),
        h(Stat, { value: num(Math.round(tot.c)) + 'g', label: t('carbs'), tone: 'blue' }),
        h(Stat, { value: num(Math.round(tot.f)) + 'g', label: t('fat') })),
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
      }, h(Icon,{name:'plus',size:16}), t('manual_meal'))),

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

function LiquidsPage() {
  var water = S.get('water', { date: '', ml: 0, target: 3000 });
  var todayKey = dayKey(Date.now());
  if (water.date !== todayKey) {
    water = { date: todayKey, ml: 0, target: water.target || 3000 };
    S.set('water', water);
  }
  var pct = Math.min(100, Math.round(water.ml / (water.target || 3000) * 100));

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
        h('span', { className: 'card-sub' }, t('water_target') + ': ' + num(water.target) + ' ' + t('ml'))),
      h('div', { className: 'water-bar' },
        h('div', { className: 'water-fill', style: { width: pct + '%' } })),
      h('div', { className: 'btn-group' },
        h('button', { className: 'btn btn-sm btn-outline', onClick: function () { addWater(250); } }, '+250'),
        h('button', { className: 'btn btn-sm btn-outline', onClick: function () { addWater(500); } }, '+500'),
        h('button', { className: 'btn btn-sm btn-outline', onClick: function () { addWater(750); } }, '+750'),
        h('button', { className: 'btn btn-sm btn-outline', onClick: function () { addWater(-250); } }, '−250'))),

    h(Card, { title: t('liquids_allowed'), icon: 'check' }, okRows,
      h('div', { className: 'info-box' }, t('electrolytes_note'))),

    h(Card, { title: t('forbidden_drinks'), icon: 'ban' }, noRows,
      h('div', { className: 'alert-box' }, t('forbidden_list'))));
}

/* ---------------------------------------------------------------------
 * Progress
 * ------------------------------------------------------------------- */

function ProgressPage() {
  var p = S.get('profile', {});
  var stats = S.get('stats', {});
  var hist = S.get('history', []);
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
            e.completed ? h(Icon,{name:'check',size:14,color:'#00d97e',className:'ic-inline'}) : null),
          h('div', { className: 'row-sub' },
            fmtDate(e.start) + ' · ' + fmtTimeOfDay(e.start) + ' → ' + fmtTimeOfDay(e.end)
            + (e.avgHr ? ' · ' + num(e.avgHr) + ' ' + t('bpm') : '')
            + (e.steps ? ' · ' + num(e.steps) + ' ' + t('steps') : ''))),
        h('button', {
          className: 'icon-btn danger',
          onClick: function () { deleteHistory(e.id); }
        }, h(Icon, { name: 'trash', size: 17 }))));
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

    h(HealthTrendsCard, null),

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

    h('div', { className: 'section-title' }, t('history')),
    rows.length ? rows : h(Empty, { text: t('no_history') }));
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
        h('button', {
          className: 'icon-btn danger',
          onClick: function () {
            var kept = [];
            var all = S.get('bodyLog', []);
            for (var j = 0; j < all.length; j++) if (all[j].ts !== e.ts) kept.push(all[j]);
            S.set('bodyLog', kept);
            toast(t('deleted'));
            refresh();
          }
        }, h(Icon, { name: 'trash', size: 17 }))));
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
        h('button', {
          className: 'icon-btn danger',
          onClick: function () {
            var kept = [];
            var all = S.get('workouts', []);
            for (var x = 0; x < all.length; x++) if (all[x].id !== w.id) kept.push(all[x]);
            S.set('workouts', kept);
            toast(t('deleted'));
            refresh();
          }
        }, h(Icon, { name: 'trash', size: 17 }))));
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

  return h('div', null,
    h(CheckInCard, null),

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
          onCommit: function (v) { S.set('settings.windowStart', v); refresh(); }
        })),
      h(SettingRow, { label: t('window_end') },
        h(TextField, {
          value: S.get('settings.windowEnd', '21:00'), placeholder: '21:00',
          onCommit: function (v) { S.set('settings.windowEnd', v); refresh(); }
        }))),

    h('div', { className: 'section-title' }, t('data')),
    h(Card, { flat: true },
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
            className: 'btn btn-danger btn-sm',
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
      h(PulseCard, null),
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

function PulseCard() {
  var running = PULSE.running;
  var status = PULSE.status;

  var hint = t('pulse_howto');
  if (running && status === 'warmup') hint = t('pulse_warmup');
  else if (running && status === 'measuring') hint = t('pulse_measuring');
  else if (status === 'weak_signal') hint = t('pulse_weak');
  else if (status === 'no_permission') hint = t('err_no_permission');
  else if (status === 'no_camera') hint = t('err_no_camera');

  if (running && PULSE.quality === 0) hint = t('pulse_quality_low');
  else if (running && PULSE.quality === 1) hint = t('pulse_quality_high');

  var log = S.get('pulseLog', []);
  var rows = [];
  for (var i = log.length - 1; i >= 0 && rows.length < 6; i--) {
    (function (e) {
      rows.push(h('div', { key: 'pl' + e.ts, className: 'row-plain' },
        h('span', { style: { fontSize: '13px' } },
          num(e.bpm) + ' ' + t('bpm'),
          h('span', { style: { color: '#6c6c8a', fontSize: '11px' } },
            '  ' + t('pulse_source_' + (e.source === 'band' ? 'band' : 'camera')))),
        h('span', { className: 'row-end', style: { fontSize: '11px' } },
          fmtDate(e.ts) + ' ' + fmtTimeOfDay(e.ts))));
    })(log[i]);
  }

  return h(Card, { title: t('pulse_title'), icon: 'heart' },
    h('div', { className: 'pulse-big' },
      running ? '···' : (PULSE.bpm > 0 ? num(PULSE.bpm) : '--')),
    h('div', { className: 'pulse-sub' }, t('bpm')),
    running ? h('div', { className: 'progress-track' },
      h('div', { className: 'progress-fill', style: { width: PULSE.progress + '%' } })) : null,
    h('div', { className: 'card-sub', style: { marginTop: '10px', textAlign: 'center' } }, hint),
    h('div', { className: 'btn-group' },
      running
        ? h('button', {
            className: 'btn btn-sm btn-outline',
            onClick: function () { N.call('pulseCancel'); setTimeout(pullNative, 200); refresh(); }
          }, t('pulse_cancel'))
        : h('button', {
            className: 'btn btn-sm btn-primary',
            onClick: function () {
              if (!N.ok()) { toast(t('no_native')); return; }
              var r = N.call('pulseStart');
              if (r && r !== 'ok') toast(t('err_' + r) || r);
              setTimeout(function () { pullNative(); refresh(); }, 300);
            }
          }, PULSE.bpm > 0 ? t('pulse_again') : t('pulse_start'))),
    h('div', { className: 'info-box' }, t('pulse_disclaimer')),
    rows.length ? h('div', null,
      h('div', { className: 'section-title' }, t('pulse_log')), rows) : null);
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
      h('button', { className: 'btn btn-sm btn-danger', onClick: saveRoute }, t('route_stop')));
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
        h('button', {
          className: 'icon-btn danger',
          onClick: function () {
            var kept = [];
            var all = S.get('routes', []);
            for (var j = 0; j < all.length; j++) if (all[j].id !== r.id) kept.push(all[j]);
            S.set('routes', kept);
            toast(t('deleted'));
            refresh();
          }
        }, h(Icon, { name: 'trash', size: 17 }))));
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
  _curTab = tab;
  _curView = view;
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
      h(Icon, { name: 'heart', size: 13, color: '#e94560' }), num(BAND.hr)));
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

  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(h(App, null));
})();
