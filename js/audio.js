/* ============================================================
   Процедурный звук: музыка и эффекты синтезируются на лету,
   никаких внешних файлов — игра весит копейки и работает офлайн.
   ============================================================ */

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Прогрессия: Am — F — C — G (классический synthwave)
const CHORDS = [
  { root: 45, notes: [45, 48, 52, 57] }, // Am
  { root: 41, notes: [41, 45, 48, 53] }, // F
  { root: 48, notes: [48, 52, 55, 60] }, // C
  { root: 43, notes: [43, 47, 50, 55] }, // G
];
const ARP = [0, 2, 1, 3, 2, 3, 1, 2, 0, 2, 3, 2, 1, 3, 2, 0];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.bpm = 128;
    this.intensity = 0;
    this.noise = null;
  }

  /* --- инициализация по первому жесту пользователя --- */
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    this.master.connect(comp).connect(ctx.destination);

    // шины для музыки и эффектов
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9;

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 900;
    this.musicFilter.Q.value = 0.9;

    this.musicBus.connect(this.musicFilter).connect(this.master);
    this.sfxBus.connect(this.master);

    // задержка для «пространства»
    const delay = ctx.createDelay(0.6);
    delay.delayTime.value = 0.26;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.28;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.master);
    this.delay = delay;

    // шум для ударных и взрывов
    const len = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(on ? 0.85 : 0, t, 0.05);
    }
  }

  /* ------------------------- музыка ------------------------- */
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stopMusic() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  setIntensity(v) {
    this.intensity = v;
    if (this.musicFilter) {
      const f = 800 + v * 3600 + (this.od ? 2500 : 0);
      this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.4);
    }
  }

  _schedule() {
    if (!this.playing || !this.ctx) return;
    const stepDur = 60 / this.bpm / 2; // восьмые
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this._playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 32;
    }
  }

  _playStep(step, t, dur) {
    const bar = (step / 8) | 0;
    const chord = CHORDS[bar % CHORDS.length];
    const s = step % 8;
    const I = this.intensity;

    if (s === 0 || s === 4 || (s === 6 && I > 0.45)) this._kick(t);
    if (s % 2 === 1) this._hat(t, s === 7 ? 0.16 : 0.075);
    if (s === 0 || s === 3 || s === 6) this._bass(t, chord.root, dur * (s === 6 ? 1.4 : 2.1));

    if (s === 0) this._pad(t, chord.notes, dur * 8);

    if (I > 0.12 && s % 2 === 0) {
      const n = chord.notes[ARP[(step) % ARP.length] % chord.notes.length] + 12;
      this._pluck(t, n, 0.055 + I * 0.075);
    }
    if (I > 0.6 && s === 5) {
      this._pluck(t, chord.notes[3] + 24, 0.03);
    }
  }

  /* ------------------------- инструменты ------------------------- */
  _env(node, t, a, d, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    this._env(g, t, 0.004, 0.2, 0.9);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.3);
  }

  _hat(t, level) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 1.7;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain();
    this._env(g, t, 0.002, 0.05, level);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t); src.stop(t + 0.09);
  }

  _bass(t, note, len) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = midi(note - 12);
    o2.type = 'square'; o2.frequency.value = midi(note - 24); o2.detune.value = 6;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(320 + this.intensity * 900, t);
    f.Q.value = 6;
    this._env(g, t, 0.008, len, 0.34);
    o.connect(f); o2.connect(f);
    f.connect(g).connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + len + 0.1); o2.stop(t + len + 0.1);
  }

  _pad(t, notes, len) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    this._env(g, t, 0.35, len, 0.075);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
    g.connect(f).connect(this.musicBus);
    for (const n of notes) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(n);
      o.detune.value = (Math.random() * 12) - 6;
      o.connect(g);
      o.start(t); o.stop(t + len + 0.5);
    }
  }

  _pluck(t, note, level) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = midi(note);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = midi(note) * 1.6; f.Q.value = 1.6;
    this._env(g, t, 0.004, 0.16, level);
    o.connect(f).connect(g);
    g.connect(this.musicBus);
    g.connect(this.delay);
    o.start(t); o.stop(t + 0.3);
  }

  /* ------------------------- эффекты ------------------------- */
  _tone({ type = 'sine', from, to, dur, level = 0.2, delaySend = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to && to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    this._env(g, t, 0.005, dur, level);
    o.connect(g).connect(this.sfxBus);
    if (delaySend && this.delay) {
      const dg = ctx.createGain(); dg.gain.value = delaySend;
      g.connect(dg).connect(this.delay);
    }
    o.start(t); o.stop(t + dur + 0.1);
  }

  _noiseBurst(dur, level, type = 'lowpass', freq = 1400) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 1 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    this._env(g, t, 0.005, dur, level);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  pickup(combo = 0) {
    const n = 72 + Math.min(combo, 14); // нота растёт вместе с комбо
    this._tone({ type: 'triangle', from: midi(n), to: midi(n + 7), dur: 0.14, level: 0.24, delaySend: 0.25 });
  }
  graze() {
    this._tone({ type: 'sine', from: 1800, to: 2600, dur: 0.06, level: 0.09 });
  }
  power() {
    if (!this.ctx) return;
    [0, 4, 7, 12].forEach((s, i) => {
      setTimeout(() => this._tone({ type: 'square', from: midi(72 + s), to: midi(79 + s), dur: 0.12, level: 0.16, delaySend: 0.3 }), i * 55);
    });
  }
  hit() {
    this._noiseBurst(0.45, 0.5, 'lowpass', 900);
    this._tone({ type: 'sawtooth', from: 220, to: 40, dur: 0.5, level: 0.4 });
  }
  overdrive() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(1760, t + 0.55);
    f.type = 'lowpass'; f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + 0.55);
    this._env(g, t, 0.02, 0.6, 0.3);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + 0.8);
    this.od = true;
    setTimeout(() => { this.od = false; this.setIntensity(this.intensity); }, 3200);
    this.setIntensity(this.intensity);
  }
  gameover() {
    if (!this.ctx) return;
    [0, -3, -7, -12].forEach((s, i) => {
      setTimeout(() => this._tone({ type: 'triangle', from: midi(69 + s), to: midi(62 + s), dur: 0.42, level: 0.24, delaySend: 0.4 }), i * 130);
    });
    this._noiseBurst(0.7, 0.28, 'lowpass', 500);
  }
  ui() {
    this._tone({ type: 'square', from: midi(76), to: midi(83), dur: 0.07, level: 0.12 });
  }
}
