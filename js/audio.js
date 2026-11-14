/**
 * All sound is synthesised at runtime — no audio files, no download, works offline.
 * Each weapon has its own noise/filter/envelope fingerprint so they feel physically different.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.noiseBuf = null;
    this.wind = null;
    this.drone = null;
    this.intensity = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;

    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // white noise buffer
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.startWind();
    this.startDrone();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get t() { return this.ctx.currentTime; }

  _noise(dur, when = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start(this.t + when);
    s.stop(this.t + when + dur + 0.02);
    return s;
  }

  /* ---------------------------------------------------------- weapons */
  shot(type, dist = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const vol = 1 / (1 + dist * 0.045);
    switch (type) {
      case 'blaster': return this._blaster(t, vol);
      case 'scatter': return this._scatter(t, vol);
      case 'beam': return this._beam(t, vol);
      case 'bomber': return this._thump(t, vol, 150, 62, 0.16, 0.9);
      default: return this._blaster(t, vol);
    }
  }

  _blaster(t, vol) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.85 * vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(5200, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.11);
    bp.Q.value = 1.1;

    const n = this._noise(0.2);
    n.connect(bp); bp.connect(g); g.connect(this.master);

    // body thump
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.09);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.7 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.0008, t + 0.12);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.14);

    // mechanical click
    const c = this.ctx.createOscillator();
    c.type = 'square';
    c.frequency.value = 2400;
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.09 * vol, t);
    cg.gain.exponentialRampToValueAtTime(0.0006, t + 0.02);
    c.connect(cg); cg.connect(this.master);
    c.start(t); c.stop(t + 0.03);
  }

  _scatter(t, vol) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1.15 * vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.30);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(7000, t);
    lp.frequency.exponentialRampToValueAtTime(420, t + 0.26);
    lp.Q.value = 0.9;

    const n = this._noise(0.4);
    const n2 = this._noise(0.3, 0.012);
    n.connect(lp); n2.connect(lp);
    lp.connect(g); g.connect(this.master);

    // fat sub
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(128, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(1.0 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.3);

    // shell rack
    this.click(t + 0.16, 0.12 * vol, 900);
  }

  _beam(t, vol) {
    // charge zip then discharge
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(2300, t + 0.045);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.24);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    bp.Q.value = 4.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.55 * vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
    o.connect(bp); bp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.28);

    // capacitor crack
    const n = this._noise(0.12);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3200;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.30 * vol, t);
    ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.10);
    n.connect(hp); hp.connect(ng); ng.connect(this.master);

    // low recoil slam
    this._thump(t, vol * 0.9, 165, 44, 0.24, 0.85);
  }

  _thump(t, vol, f0, f1, dur, amp) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  explosion(dist = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const vol = 1 / (1 + dist * 0.05);

    const n = this._noise(0.9);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.8);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.linearRampToValueAtTime(1.2 * vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    n.connect(lp); lp.connect(g); g.connect(this.master);

    this._thump(t, vol * 1.1, 110, 28, 0.55, 1.0);

    // debris crackle
    for (let i = 0; i < 4; i++) this.click(t + 0.06 + i * 0.055, 0.10 * vol, 1400 + Math.random() * 2200);
  }

  click(when = 0, vol = 0.2, freq = 1200) {
    if (!this.ctx || !this.enabled) return;
    const t = this.t + when;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.02);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 600;
    o.connect(hp); hp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.03);
  }

  reload(stage = 0) {
    if (!this.ctx || !this.enabled) return;
    if (stage === 0) { this.click(0, 0.24, 700); this.click(0.055, 0.14, 1500); }
    else if (stage === 1) { this.click(0, 0.22, 500); this.click(0.09, 0.18, 1100); }
    else { this.click(0, 0.26, 950); this.click(0.05, 0.2, 1900); }
  }

  hitmarker(crit = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(crit ? 1750 : 1200, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.06);
  }

  enemyHit(dist = 0) {
    if (!this.ctx || !this.enabled) return;
    const vol = 1 / (1 + dist * 0.08);
    this.click(0, 0.10 * vol, 380 + Math.random() * 200);
  }

  enemyDeath(dist = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const vol = 1 / (1 + dist * 0.06);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.34);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.20 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.36);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.38);

    // eco shimmer
    for (let i = 0; i < 3; i++) {
      const s = this.ctx.createOscillator();
      s.type = 'triangle';
      s.frequency.value = 900 + i * 420;
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.0006, t + i * 0.04);
      sg.gain.exponentialRampToValueAtTime(0.05 * vol, t + i * 0.04 + 0.01);
      sg.gain.exponentialRampToValueAtTime(0.0004, t + i * 0.04 + 0.3);
      s.connect(sg); sg.connect(this.master);
      s.start(t + i * 0.04); s.stop(t + i * 0.04 + 0.32);
    }
  }

  enemyShoot(dist = 0) {
    if (!this.ctx || !this.enabled) return;
    const vol = 1 / (1 + dist * 0.1);
    const t = this.t;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(760, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.10 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.12);
  }

  playerHurt() {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const n = this._noise(0.2);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.18);
    n.connect(lp); lp.connect(g); g.connect(this.master);
    this._thump(t, 0.5, 180, 50, 0.14, 0.7);
  }

  pickup(kind = 'health') {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const base = kind === 'health' ? 620 : 440;
    [0, 1, 2].forEach((i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = base * Math.pow(1.26, i);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0005, t + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.05 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0004, t + i * 0.05 + 0.16);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.18);
    });
  }

  step() {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const n = this._noise(0.09);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380 + Math.random() * 220;
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
    n.connect(bp); bp.connect(g); g.connect(this.master);
  }

  land() {
    if (!this.ctx || !this.enabled) return;
    this._thump(0, 0.5, 150, 48, 0.16, 0.6);
    this.step();
  }

  waveStart() {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    [0, 4, 7, 12].forEach((semi, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 110 * Math.pow(2, semi / 12);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t + i * 0.09);
      lp.frequency.exponentialRampToValueAtTime(2600, t + i * 0.09 + 0.4);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0005, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.11, t + i * 0.09 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0005, t + i * 0.09 + 0.9);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.95);
    });
  }

  waveClear() {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    [0, 5, 9, 12, 16].forEach((semi, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 220 * Math.pow(2, semi / 12);
      const g = this.ctx.createGain();
      const at = t + i * 0.07;
      g.gain.setValueAtTime(0.0005, at);
      g.gain.exponentialRampToValueAtTime(0.13, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0004, at + 0.5);
      o.connect(g); g.connect(this.master);
      o.start(at); o.stop(at + 0.52);
    });
  }

  gameOver() {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 1.6);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0005, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 1.7);
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.75);
  }

  /* ---------------------------------------------------------- ambience */
  startWind() {
    const t = this.t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'bandpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.045;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t);

    // slow gust LFO
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.06;
    const lg = this.ctx.createGain(); lg.gain.value = 0.028;
    lfo.connect(lg); lg.connect(g.gain);
    lfo.start(t);

    const lfo2 = this.ctx.createOscillator();
    lfo2.type = 'sine'; lfo2.frequency.value = 0.13;
    const lg2 = this.ctx.createGain(); lg2.gain.value = 180;
    lfo2.connect(lg2); lg2.connect(lp.frequency);
    lfo2.start(t);
    this.wind = g;
  }

  startDrone() {
    const t = this.t;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 240;
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.6;
    const o3 = this.ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 27.5;
    o1.connect(lp); o2.connect(lp); o3.connect(g); lp.connect(g);
    g.connect(this.master);
    [o1, o2, o3].forEach(o => o.start(t));
    this.drone = g;
  }

  setIntensity(v) {
    this.intensity = v;
    if (this.drone && this.ctx) {
      this.drone.gain.setTargetAtTime(0.012 + v * 0.05, this.t, 0.8);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.t, 0.1);
  }
}
