// Timeline strip: event chips with editable times, add-event modal,
// and optional logging of live panel actions into the take.

const EVENT_TYPES = [
  ['sprinkle', 'sprinkle'],
  ['current', 'current'],
  ['tap', 'tap'],
  ['tapBurst', 'tap burst'],
  ['autoTap', 'auto-tap'],
  ['clear', 'clear'],
];

export class TimelineUI {
  constructor(app) {
    this.app = app;
    this.wrap = document.getElementById('timeline-events');
    document.getElementById('btn-add-event').onclick = () => this.openModal();
    this.buildModal();
  }

  render() {
    const evs = this.app.timeline;
    this.wrap.innerHTML = '';
    const sorted = [...evs].sort((a, b) => a.t - b.t);
    for (const ev of sorted) {
      const chip = document.createElement('div');
      chip.className = 'ev-chip';
      const t = document.createElement('input');
      t.type = 'number'; t.step = '0.1'; t.value = ev.t.toFixed(1);
      t.title = 'event time (s)';
      t.onchange = () => { ev.t = +t.value; this.app.timelineChanged(); };
      const label = document.createElement('span');
      label.textContent = describe(ev);
      const x = document.createElement('span');
      x.className = 'ev-x'; x.textContent = '✕';
      x.onclick = () => {
        this.app.timeline.splice(this.app.timeline.indexOf(ev), 1);
        this.app.timelineChanged();
      };
      chip.append(t, label, x);
      this.wrap.appendChild(chip);
    }
    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No events — add some, load a preset, or drive the panel live with “log live actions” on.';
      this.wrap.appendChild(empty);
    }
  }

  buildModal() {
    const back = document.createElement('div');
    back.id = 'modal-back';
    back.className = 'hidden';
    back.innerHTML = `
      <div class="modal">
        <h3>ADD TIMELINE EVENT</h3>
        <div class="ctl"><label>Type</label><select id="me-type"></select></div>
        <div class="ctl"><label>Time (s)</label><input id="me-t" type="number" step="0.1" value="1.0"></div>
        <div id="me-fields"></div>
        <div class="modal-actions">
          <button id="me-cancel">Cancel</button>
          <button id="me-ok" class="active">Add</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const typeSel = back.querySelector('#me-type');
    for (const [v, t] of EVENT_TYPES) {
      const o = document.createElement('option');
      o.value = v; o.textContent = t;
      typeSel.appendChild(o);
    }
    typeSel.onchange = () => this.renderFields(typeSel.value);
    back.querySelector('#me-cancel').onclick = () => back.classList.add('hidden');
    back.addEventListener('click', (e) => { if (e.target === back) back.classList.add('hidden'); });
    back.querySelector('#me-ok').onclick = () => {
      const ev = this.collect();
      this.app.timeline.push(ev);
      this.app.timelineChanged();
      back.classList.add('hidden');
    };
    this.modal = back;
    this.fieldsEl = back.querySelector('#me-fields');
    this.renderFields('sprinkle');
  }

  openModal() {
    this.modal.classList.remove('hidden');
    this.modal.querySelector('#me-t').value = Math.round(this.app.stats.time * 10) / 10;
  }

  renderFields(type) {
    const p = this.app.params;
    const F = {
      sprinkle: [['count', p.sprinkleCount], ['strayCount', p.strayCount], ['radius', p.sprinkleR], ['clump', p.sprinkleClump]],
      current: [['amp', p.currentA], ['freq', p.acFreq], ['rampDur', p.rampDur]],
      tap: [['strength', p.tapStrength]],
      tapBurst: [['n', 4], ['interval', 0.5], ['strength', p.tapStrength]],
      autoTap: [['rate', 1.0]],
      clear: [],
    }[type] || [];
    this.fieldsEl.innerHTML = '';
    for (const [name, def] of F) {
      const row = document.createElement('div');
      row.className = 'ctl';
      row.innerHTML = `<label>${name}</label><input data-f="${name}" type="number" step="any" value="${def}">`;
      this.fieldsEl.appendChild(row);
    }
    if (type === 'current') {
      const row = document.createElement('div');
      row.className = 'ctl';
      row.innerHTML = `<label>state</label>
        <select data-f="onmode">
          <option value="dc-on">DC on</option>
          <option value="ac-on">AC on</option>
          <option value="off">off</option>
        </select>`;
      this.fieldsEl.appendChild(row);
    }
    if (type === 'sprinkle') {
      const row = document.createElement('div');
      row.className = 'ctl';
      row.innerHTML = `<label>pattern</label>
        <select data-f="pattern">
          <option value="sheet">sheet</option><option value="disk">disk</option>
          <option value="ring">ring</option>
        </select>`;
      this.fieldsEl.appendChild(row);
    }
  }

  collect() {
    const type = this.modal.querySelector('#me-type').value;
    const ev = { t: +this.modal.querySelector('#me-t').value, type };
    for (const inp of this.fieldsEl.querySelectorAll('[data-f]')) {
      const k = inp.dataset.f;
      if (k === 'onmode') {
        ev.on = inp.value !== 'off';
        ev.mode = inp.value === 'ac-on' ? 'ac' : 'dc';
      } else if (k === 'pattern') {
        ev.pattern = inp.value;
      } else {
        ev[k] = +inp.value;
      }
    }
    if (type === 'current' && ev.on === false) ev.amp = 0;
    return ev;
  }
}

function describe(ev) {
  switch (ev.type) {
    case 'sprinkle': return `sprinkle ${fmtK(ev.count)} + ${fmtK(ev.strayCount ?? 0)} stray ${ev.pattern || 'sheet'}`;
    case 'current':
      if (ev.on === false || ev.amp === 0) return 'current OFF';
      return `current ${ev.amp} A ${ev.mode === 'ac' ? `AC ${ev.freq ?? ''} Hz` : 'DC'}`;
    case 'tap': return `tap ${ev.strength ?? ''} g`;
    case 'tapBurst': return `tap ×${ev.n} @${ev.interval}s`;
    case 'autoTap': return ev.rate > 0 ? `auto-tap ${ev.rate}/s` : 'auto-tap off';
    case 'clear': return 'clear filings';
    default: return ev.type;
  }
}

function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : String(n ?? ''); }
