// Calibration mode: draggable pins over the canvas for the 4 cardboard
// corners, the hole (wire base) and the wire top. Edits update the homography
// live and persist to localStorage.

import { saveCalibration } from '../render/homography.js';

const PIN_DEFS = [
  ['tl', 'corner TL'], ['tr', 'corner TR'], ['br', 'corner BR'], ['bl', 'corner BL'],
  ['hole', 'hole / wire'], ['wireTop', 'wire top'],
];

export class CalibrationUI {
  constructor(canvas, layer, cal, onChange, calibrationKey = 'straight') {
    this.canvas = canvas;
    this.layer = layer;
    this.cal = cal;
    this.onChange = onChange;
    this.calibrationKey = calibrationKey;
    this.active = false;
    this.pins = new Map();
    for (const [key, label] of PIN_DEFS) {
      const el = document.createElement('div');
      el.className = 'pin';
      el.dataset.label = label;
      el.style.display = 'none';
      layer.appendChild(el);
      this.pins.set(key, el);
      this.bindDrag(el, key);
    }
    window.addEventListener('resize', () => this.active && this.position());
  }

  getPoint(key) {
    if (key === 'hole') return this.cal.hole;
    if (key === 'wireTop') return this.cal.wireTop;
    return this.cal.corners[key];
  }

  setActive(on) {
    this.active = on;
    for (const el of this.pins.values()) el.style.display = on ? 'block' : 'none';
    if (on) this.position();
  }

  // image px → client px within the stage
  imageToClient(pt) {
    const r = this.canvas.getBoundingClientRect();
    const p = this.layer.getBoundingClientRect();
    return [
      r.left - p.left + (pt[0] / this.canvas.width) * r.width,
      r.top - p.top + (pt[1] / this.canvas.height) * r.height,
    ];
  }

  clientToImage(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    return [
      ((cx - r.left) / r.width) * this.canvas.width,
      ((cy - r.top) / r.height) * this.canvas.height,
    ];
  }

  position() {
    for (const [key, el] of this.pins) {
      const [x, y] = this.imageToClient(this.getPoint(key));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
  }

  bindDrag(el, key) {
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const move = (ev) => {
        const pt = this.clientToImage(ev.clientX, ev.clientY);
        pt[0] = Math.max(0, Math.min(this.canvas.width, pt[0]));
        pt[1] = Math.max(0, Math.min(this.canvas.height, pt[1]));
        if (key === 'hole') this.cal.hole = pt;
        else if (key === 'wireTop') this.cal.wireTop = pt;
        else this.cal.corners[key] = pt;
        this.position();
        this.onChange(this.cal);
      };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        saveCalibration(this.cal, this.calibrationKey);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }
}
