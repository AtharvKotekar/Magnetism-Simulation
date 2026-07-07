// Preset takes. Each is { name, hint, duration, params?, timeline }.
// Timelines use the un-expanded event grammar from sim/timeline.js.

export const PRESETS = [
  {
    name: 'Manual stage',
    hint: 'Starts with only a random sprinkle. Turn current on and tap when you want the reveal.',
    duration: 20,
    params: { currentA: 30, currentMode: 'dc', currentAutoAlign: false },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 11000, pattern: 'disk', radius: 0.17, clump: 0.03 },
    ],
  },
  {
    name: 'Classic reveal',
    hint: 'Sprinkle → current on → taps → cheated field arcs bloom outward from the wire.',
    duration: 9,
    params: { currentA: 30, currentMode: 'dc' },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 11000, pattern: 'disk', radius: 0.17, clump: 0.03 },
      { t: 2.0, type: 'current', on: true, amp: 30, mode: 'dc', rampDur: 0.5 },
      { t: 3.0, type: 'tap', strength: 8 },
      { t: 3.6, type: 'tap', strength: 8 },
      { t: 4.2, type: 'tap', strength: 9 },
      { t: 5.0, type: 'tap', strength: 7 },
      { t: 5.8, type: 'tap', strength: 6 },
    ],
  },
  {
    name: 'High current bloom',
    hint: '80 A — the aligned region expands quickly after taps.',
    duration: 9,
    params: { currentA: 80, currentMode: 'dc' },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 13000, pattern: 'disk', radius: 0.18, clump: 0.04 },
      { t: 1.8, type: 'current', on: true, amp: 80, mode: 'dc', rampDur: 0.6 },
      { t: 2.8, type: 'tapBurst', n: 5, interval: 0.55, strength: 9 },
      { t: 6.2, type: 'tap', strength: 5 },
    ],
  },
  {
    name: 'Tap vs no tap',
    hint: 'Current on for 3 s — it waits. Then taps reveal the field.',
    duration: 12,
    params: { currentA: 30, currentMode: 'dc' },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 11000, pattern: 'disk', radius: 0.17, clump: 0.03 },
      { t: 1.5, type: 'current', on: true, amp: 30, mode: 'dc', rampDur: 0.4 },
      { t: 6.0, type: 'tapBurst', n: 6, interval: 0.6, strength: 8 },
    ],
  },
  {
    name: 'AC shimmer',
    hint: '8 Hz AC — filings near the wire shimmer without settling far away.',
    duration: 10,
    params: { currentA: 45, currentMode: 'ac', acFreq: 8 },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 11000, pattern: 'disk', radius: 0.17, clump: 0.03 },
      { t: 1.5, type: 'current', on: true, amp: 45, mode: 'ac', freq: 8, rampDur: 0.8 },
      { t: 3.0, type: 'autoTap', rate: 1.2 },
      { t: 8.0, type: 'autoTap', rate: 0 },
    ],
  },
  {
    name: 'Reverse & re-align',
    hint: 'DC on, settle, change polarity — the visual pattern twitches and re-forms.',
    duration: 14,
    params: { currentA: 40, currentMode: 'dc' },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 11000, pattern: 'disk', radius: 0.17, clump: 0.03 },
      { t: 1.5, type: 'current', on: true, amp: 40, mode: 'dc', rampDur: 0.4 },
      { t: 2.5, type: 'tapBurst', n: 4, interval: 0.5, strength: 8 },
      { t: 7.0, type: 'current', on: true, amp: -40, mode: 'dc', rampDur: 0.8 },
      { t: 8.5, type: 'tapBurst', n: 4, interval: 0.5, strength: 8 },
    ],
  },
  {
    name: 'Bare stage',
    hint: 'Empty timeline — drive everything live from the panel.',
    duration: 20,
    timeline: [],
  },
];
