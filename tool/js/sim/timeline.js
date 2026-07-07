// Take timeline: a sorted list of events dispatched at exact sim times inside
// the worker (never from wall-clock timers) so takes replay deterministically.
//
// Event shapes:
//   { t, type: 'sprinkle', count, pattern, radius, clump }
//   { t, type: 'current',  on, amp, mode, freq, rampDur }
//   { t, type: 'tap',      strength }
//   { t, type: 'tapBurst', n, interval, strength }   (expanded into taps)
//   { t, type: 'autoTap',  rate }                    (0 stops)
//   { t, type: 'clear' }

export function expandTimeline(events) {
  const out = [];
  for (const ev of events) {
    if (ev.type === 'tapBurst') {
      const n = Math.max(1, ev.n | 0);
      for (let k = 0; k < n; k++) {
        out.push({ t: ev.t + k * (ev.interval ?? 0.4), type: 'tap', strength: ev.strength });
      }
    } else {
      out.push({ ...ev });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export class TimelineRunner {
  constructor(engine) {
    this.engine = engine;
    this.events = [];
    this.cursor = 0;
  }

  load(events) {
    this.events = expandTimeline(events);
    this.cursor = 0;
  }

  reset() { this.cursor = 0; }

  // Fire everything scheduled up to sim time t (call once per substep).
  dispatchUpTo(t) {
    const eng = this.engine;
    while (this.cursor < this.events.length && this.events[this.cursor].t <= t) {
      const ev = this.events[this.cursor++];
      switch (ev.type) {
        case 'sprinkle': eng.doSprinkle(ev); break;
        case 'current': eng.doCurrent(ev); break;
        case 'tap': eng.doTap(ev); break;
        case 'autoTap': eng.setParams({ autoTapRate: ev.rate || 0 }); eng.scheduleAutoTap(); break;
        case 'clear': eng.doClear(); break;
      }
    }
  }
}
