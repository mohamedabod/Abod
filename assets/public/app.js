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
var SENSORS = { steps: 0, activeMinutes: 0, calories: 0, cadence: 0, level: 'still', hasStepSensor: false, permission: false, running: false };
var PERMS = { bluetooth: false, activity: false, notifications: false };

/** Native -> JS entry point (called from JsBridge.java). */
window.__onNative = function (type, data) {
  if (type === 'band') {
    BAND = m(BAND, data || {});
    recordHeartRate(BAND.hr);
  } else if (type === 'sensors') {
    SENSORS = m(SENSORS, data || {});
  } else if (type === 'perms') {
    PERMS = m(PERMS, data || {});
  }
  refresh();
};

window.__onResume = function () {
  pullNative();
  refresh();
};

function pullNative() {
  if (!N.ok()) return;
  BAND = m(BAND, N.bandState());
  SENSORS = m(SENSORS, N.sensorsState());
  PERMS = m(PERMS, N.permsState());
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
  return h('div', { className: props.flat ? 'card-flat' : 'card', style: props.style },
    props.title ? h('div', { className: 'card-title' },
      props.icon ? h('span', null, props.icon) : null,
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
        '▶  ' + t('start_fasting')),
      h('button', { className: 'btn btn-outline', onClick: function () { setShowStart(true); } },
        '🕐  ' + t('set_start_time')));
  } else if (cf.pausedAt) {
    controls = h('div', { className: 'btn-group' },
      h('button', { className: 'btn btn-green', onClick: resumeFast }, '▶  ' + t('resume')),
      h('button', { className: 'btn btn-danger', onClick: stopFast }, '■  ' + t('stop')));
  } else {
    controls = h('div', { className: 'btn-group' },
      h('button', { className: 'btn btn-gold', onClick: pauseFast }, '❚❚  ' + t('pause')),
      h('button', { className: 'btn btn-danger', onClick: stopFast }, '■  ' + t('stop')));
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
        ? h('div', { className: 'alert-box' }, '⚠️ ' + t('long_fast_warn'))
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

  return h(Card, { title: t('activity'), icon: '📊' },
    h('div', { className: 'live-row' },
      h('div', { className: 'live-metric' },
        h('div', { className: 'live-val', style: { color: '#e94560' } },
          h('span', { className: connected && BAND.hr > 0 ? 'hr-pulse' : '' }, '❤️'),
          ' ', connected && BAND.hr > 0 ? num(BAND.hr) : '--'),
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
        ? h('span', { className: 'chip' }, '🔋 ' + num(BAND.battery) + '%') : null,
      h('span', { className: 'chip' }, '🔥 ' + num(SENSORS.calories || 0) + ' ' + t('calories')),
      h('span', { className: 'chip' }, '🚶 ' + t(levelKey))),

    !connected ? h('div', { className: 'btn-group', style: { marginTop: '12px' } },
      h('button', { className: 'btn btn-sm btn-outline', onClick: connectBand },
        busy ? t('connecting') : t('connect_band'))) : null);
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
          h('button', { className: 'time-btn', onClick: function () { bump('h', 1); } }, '+'),
          h('div', { className: 'time-val' }, pad2(hh)),
          h('button', { className: 'time-btn', onClick: function () { bump('h', -1); } }, '−')),
        h('div', { className: 'time-sep' }, ':'),
        h('div', { className: 'time-col' },
          h('button', { className: 'time-btn', onClick: function () { bump('m', 5); } }, '+'),
          h('div', { className: 'time-val' }, pad2(mm)),
          h('button', { className: 'time-btn', onClick: function () { bump('m', -5); } }, '−'))),
      h('div', { className: 'card-sub', style: { textAlign: 'center', marginTop: '10px' } },
        t('back_hours')),
      h('div', { className: 'modal-btns' },
        h('button', { className: 'btn btn-primary btn-sm', onClick: confirm }, t('confirm')),
        h('button', { className: 'btn btn-outline btn-sm', onClick: props.onClose }, t('cancel')))));
}

/* ---------------------------------------------------------------------
 * Meals
 * ------------------------------------------------------------------- */

function MealsPage() {
  var s1 = useState(''); var q = s1[0], setQ = s1[1];
  var s2 = useState(null); var pending = s2[0], setPending = s2[1];

  var todayKey = dayKey(Date.now());
  var all = S.get('meals', []);
  var today = [];
  for (var i = 0; i < all.length; i++) {
    if (dayKey(all[i].ts) === todayKey) today.push(all[i]);
  }

  var tot = { cal: 0, p: 0, c: 0, f: 0 };
  for (var j = 0; j < today.length; j++) {
    var it = today[j];
    tot.cal += it.cal * it.portions;
    tot.p += it.p * it.portions;
    tot.c += it.c * it.portions;
    tot.f += it.f * it.portions;
  }

  function reallyAdd(food) {
    var meals = S.get('meals', []);
    meals.push({
      id: uid(), k: food.k, ar: food.ar, en: food.en,
      cal: food.cal, p: food.p, c: food.c, f: food.f,
      portions: 1, ts: Date.now()
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
    for (var x = 0; x < meals.length; x++) if (meals[x].id !== id) kept.push(meals[x]);
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
            'P ' + food.p + ' · C ' + food.c + ' · F ' + food.f)),
        h('div', { className: 'row-end' }, num(food.cal) + ' ' + t('calories'))));
    })(results[r]);
  }

  var mealRows = [];
  for (var k2 = today.length - 1; k2 >= 0; k2--) {
    (function (it) {
      mealRows.push(h('div', { key: 'm' + it.id, className: 'row' },
        h('div', { className: 'row-main' },
          h('div', { className: 'row-title' }, isRTL() ? it.ar : it.en),
          h('div', { className: 'row-sub' },
            fmtTimeOfDay(it.ts) + ' · ' + num(Math.round(it.cal * it.portions)) + ' ' + t('calories'))),
        h('button', { className: 'icon-btn', onClick: function () { changePortion(it.id, -0.5); } }, '−'),
        h('span', { className: 'row-end' }, '×' + it.portions),
        h('button', { className: 'icon-btn', onClick: function () { changePortion(it.id, 0.5); } }, '+'),
        h('button', { className: 'icon-btn danger', onClick: function () { removeMeal(it.id); } }, '🗑')));
    })(today[k2]);
  }

  return h('div', null,
    h(Card, { title: t('todays_total'), icon: '🍽️' },
      h('div', { className: 'stats-grid-4' },
        h(Stat, { value: num(Math.round(tot.cal)), label: t('calories'), tone: 'gold' }),
        h(Stat, { value: num(Math.round(tot.p)) + 'g', label: t('protein'), tone: 'green' }),
        h(Stat, { value: num(Math.round(tot.c)) + 'g', label: t('carbs'), tone: 'blue' }),
        h(Stat, { value: num(Math.round(tot.f)) + 'g', label: t('fat') }))),

    mealRows.length
      ? h('div', null, h('div', { className: 'section-title' }, t('meals')), mealRows)
      : h(Empty, { text: t('no_meals') }),

    h('div', { className: 'section-title' }, t('search_food')),
    h('input', {
      className: 'search-input', value: q, placeholder: t('search_food'),
      onChange: function (e) { setQ(e.target.value); }
    }),
    h('div', { style: { height: '10px' } }),
    resultRows.length ? resultRows : h(Empty, { text: t('empty_search') }),

    pending ? h('div', { className: 'modal-overlay', onClick: function () { setPending(null); } },
      h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
        h('h3', null, t('eating_while_fasting')),
        h('div', { className: 'modal-btns', style: { flexDirection: 'column' } },
          h('button', {
            className: 'btn btn-primary btn-block',
            onClick: function () { var f = pending; setPending(null); stopFast(); reallyAdd(f); }
          }, t('end_and_log')),
          h('button', {
            className: 'btn btn-outline btn-block',
            onClick: function () { var f = pending; setPending(null); reallyAdd(f); }
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
    h(Card, { title: t('water_intake'), icon: '💧' },
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

    h(Card, { title: t('liquids_allowed'), icon: '✅' }, okRows,
      h('div', { className: 'info-box' }, t('electrolytes_note'))),

    h(Card, { title: t('forbidden_drinks'), icon: '⛔' }, noRows,
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
  var tdee = calcTDEE(p.weight, p.height, p.age, p.gender, p.activity);
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
            e.completed ? h('span', { style: { color: '#00e676' } }, '✓') : null),
          h('div', { className: 'row-sub' },
            fmtDate(e.start) + ' · ' + fmtTimeOfDay(e.start) + ' → ' + fmtTimeOfDay(e.end)
            + (e.avgHr ? ' · ❤️ ' + num(e.avgHr) : '')
            + (e.steps ? ' · 🚶 ' + num(e.steps) : ''))),
        h('button', {
          className: 'icon-btn danger',
          onClick: function () { deleteHistory(e.id); }
        }, '🗑')));
    })(hist[k]);
  }

  return h('div', null,
    h(Card, { title: t('last_7_days'), icon: '📈' },
      h('div', { className: 'bar-chart' }, bars)),

    h(Card, { title: t('progress'), icon: '🏆' },
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

    h(Card, { title: t('bmi') + ' / ' + t('tdee'), icon: '⚖️' },
      h('div', { className: 'row-plain' },
        h('span', null, t('bmi')),
        h('span', { className: 'row-end' }, bmi ? num(bmi.toFixed(1)) + ' · ' + bmiLabel(bmi) : '-')),
      h('div', { className: 'row-plain' },
        h('span', null, t('bmr')),
        h('span', { className: 'row-end' }, num(Math.round(calcBMR(p.weight, p.height, p.age, p.gender))) + ' ' + t('calories'))),
      h('div', { className: 'row-plain' },
        h('span', null, t('tdee')),
        h('span', { className: 'row-end' }, num(tdee) + ' ' + t('calories'))),
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
 * Coach
 * ------------------------------------------------------------------- */

function CoachPage() {
  var cf = S.get('currentFast', {});
  var hours = fastElapsed(cf) / 3600000;
  var c = coachFor(hours);
  var tips = randomTips(4);

  var tipCards = [];
  for (var i = 0; i < tips.length; i++) {
    tipCards.push(h('div', { key: 'tp' + i, className: 'tip-card' },
      h('div', { className: 'tip-text' }, '• ' + tips[i])));
  }

  return h('div', null,
    h('div', { className: 'tip-card good' },
      h('div', { className: 'tip-title' }, '🧬 ' + t('analysis') + ' — ' + c.analysis.title),
      h('div', { className: 'tip-text' }, c.analysis.text)),

    h('div', { className: 'tip-card exercise' },
      h('div', { className: 'tip-title' }, '🏃 ' + t('exercise_rec')),
      h('div', { className: 'tip-text' }, c.exercise)),

    h('div', { className: 'section-title' }, t('refeeding')),
    h('div', { className: 'refeed-card' },
      h('div', { className: 'refeed-phase' }, t('refeed_phase1')),
      h('div', { className: 'tip-text' }, t('refeed_phase1_desc'))),
    h('div', { className: 'refeed-card' },
      h('div', { className: 'refeed-phase' }, t('refeed_phase2')),
      h('div', { className: 'tip-text' }, t('refeed_phase2_desc'))),
    h('div', { className: 'tip-card warn' },
      h('div', { className: 'tip-title' }, '⛔ ' + t('refeed_rule')),
      h('div', { className: 'tip-text' }, t('refeed_rule_desc'))),
    hours >= 48 ? h('div', { className: 'tip-card warn' },
      h('div', { className: 'tip-title' }, '⚠️ 48h+'),
      h('div', { className: 'tip-text' }, t('refeed_long_warn'))) : null,

    h('div', { className: 'section-title' }, t('tips')),
    tipCards,

    h('div', { className: 'alert-box' }, '⚕️ ' + t('disclaimer_text')));
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
    return h('input', {
      className: 'setting-input', type: 'number', value: p[key],
      onChange: function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v)) v = min;
        if (v < min) v = min;
        if (v > max) v = max;
        setProfile(key, v);
      }
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
        h('div', { className: 'alert-box' }, '⚠️ ' + t(sup.warning || 'no_double_dose')),
        h('div', { className: 'btn-group', style: { marginTop: '10px' } },
          h('button', {
            className: 'btn btn-sm ' + (takenToday ? 'btn-outline' : 'btn-green'),
            disabled: takenToday,
            onClick: function () { takeSupplement(sup.id); }
          }, takenToday ? '✓ ' + t('taken_today') : t('take_now')))));
    })(sups[i]);
  }

  return h('div', null,
    h('div', { className: 'section-title' }, t('profile')),
    h(Card, { flat: true },
      h(SettingRow, { label: t('name') },
        h('input', {
          className: 'setting-input', value: p.name || '',
          onChange: function (e) { setProfile('name', e.target.value); }
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
      h('div', { className: 'info-box' }, 'ℹ️ ' + t('band_hint'))),

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
      (!PERMS.activity || !PERMS.bluetooth || !PERMS.notifications)
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
        h('div', { className: 'modal-btns' },
          h('button', {
            className: 'btn btn-primary btn-sm',
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
          }, t('confirm')),
          h('button', {
            className: 'btn btn-outline btn-sm',
            onClick: function () { setShowImport(false); }
          }, t('cancel'))))) : null,

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
 * Shell
 * ------------------------------------------------------------------- */

var TABS = [
  { id: 'home', icon: '⏱️', label: 'home' },
  { id: 'meals', icon: '🍽️', label: 'meals' },
  { id: 'liquids', icon: '💧', label: 'liquids' },
  { id: 'progress', icon: '📈', label: 'progress' },
  { id: 'coach', icon: '🧠', label: 'coach' },
  { id: 'settings', icon: '⚙️', label: 'settings' }
];

var _setTab = null;
var _curTab = 'home';

function App() {
  var v = useState(0); _bump = v[1];
  var tb = useState('home'); var tab = tb[0]; _setTab = tb[1];
  _curTab = tab;
  var dc = useState(!S.get('settings.disclaimerSeen', false));
  var showDisclaimer = dc[0], setShowDisclaimer = dc[1];

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
        h('span', { className: 'bnav-icon' }, item.icon),
        h('span', null, t(item.label))));
    })(TABS[i]);
  }

  var cf = S.get('currentFast', {});
  var headerRight = [];
  if (cf.active) {
    headerRight.push(h('span', { key: 'hf', className: 'hdr-chip' },
      '⏱ ' + fmtShort(fastElapsed(cf))));
  }
  if (BAND.status === 'connected' && BAND.hr > 0) {
    headerRight.push(h('span', { key: 'hb', className: 'hdr-chip' }, '❤️ ' + num(BAND.hr)));
  }

  return h(React.Fragment, null,
    h('div', { className: 'hdr' },
      h('span', { className: 'hdr-title' }, t('app_name')),
      h('span', { className: 'hdr-side' }, headerRight)),
    h('div', { className: 'content' }, body),
    h('div', { className: 'bnav' }, navItems),

    showDisclaimer ? h('div', { className: 'modal-overlay' },
      h('div', { className: 'modal' },
        h('h3', null, '⚕️ ' + t('disclaimer')),
        h('div', { className: 'tip-text' }, t('disclaimer_text')),
        h('div', { className: 'modal-btns' },
          h('button', {
            className: 'btn btn-primary btn-sm',
            onClick: function () {
              S.set('settings.disclaimerSeen', true);
              setShowDisclaimer(false);
            }
          }, t('understood'))))) : null);
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
  recomputeStats();

  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(h(App, null));
})();
