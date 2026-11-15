/**
 * All sound is synthesised at runtime — no audio files, no download, works offline.
 * Each weapon has its own noise/filter/envelope fingerprint so they feel physically different.
 */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* chord voicings (MIDI), D minor */
const CHORDS = {
  Dm: [50, 57, 62, 65], Dm9: [50, 57, 64, 65], Bb: [46, 53, 58, 62], Bbmaj7: [46, 53, 57, 62],
  F: [53, 57, 60, 65], C: [48, 55, 60, 64], Gm: [55, 58, 62, 67], A: [45, 52, 57, 61], Eb: [51, 58, 63, 67],
};

/* An original theme. Melody rows are [bar, sixteenth, midi note, length in sixteenths]. */
const SCORE = {
  explore: {
    bpm: 76,
    chords: ['Dm9', 'Bbmaj7', 'Gm', 'A', 'Dm9', 'Bbmaj7', 'F', 'A'],
    melody: [
      [0, 0, 69, 6], [0, 6, 74, 2], [0, 8, 72, 4], [0, 12, 69, 4],
      [1, 0, 70, 8], [1, 8, 69, 4], [1, 12, 65, 4],
      [2, 0, 67, 6], [2, 6, 70, 2], [2, 8, 69, 4], [2, 12, 67, 4],
      [3, 0, 69, 16],
      [4, 0, 74, 6], [4, 6, 76, 2], [4, 8, 77, 4], [4, 12, 76, 4],
      [5, 0, 74, 8], [5, 8, 72, 4], [5, 12, 70, 4],
      [6, 0, 72, 6], [6, 6, 69, 2], [6, 8, 65, 8],
      [7, 0, 73, 8], [7, 8, 76, 8],
    ],
  },
  combat: {
    bpm: 104,
    chords: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'C', 'A'],
    melody: [
      [0, 0, 69, 6], [0, 6, 67, 2], [0, 8, 69, 8],
      [1, 0, 70, 6], [1, 6, 69, 2], [1, 8, 65, 8],
      [2, 0, 72, 6], [2, 6, 70, 2], [2, 8, 69, 4], [2, 12, 65, 4],
      [3, 0, 67, 12], [3, 12, 64, 4],
      [4, 0, 74, 6], [4, 6, 72, 2], [4, 8, 74, 8],
      [5, 0, 77, 6], [5, 6, 74, 2], [5, 8, 70, 8],
      [6, 0, 72, 4], [6, 4, 74, 4], [6, 8, 76, 8],
      [7, 0, 73, 16],
    ],
  },
  boss: {
    bpm: 120,
    chords: ['Dm', 'Eb', 'Dm', 'A', 'Dm', 'Eb', 'C', 'A'],
    melody: [
      [0, 0, 74, 16], [1, 0, 75, 16], [2, 0, 77, 8], [2, 8, 76, 8], [3, 0, 73, 16],
      [4, 0, 69, 16], [5, 0, 70, 16], [6, 0, 72, 16], [7, 0, 73, 16],
    ],
  },
};

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
    // honour SOUND OFF chosen before the first tap (wind and drone would play otherwise)
    this.master.gain.value = this.enabled ? 0.9 : 0;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;

    // gentle saturation adds harmonics, so low thumps are heard on a phone speaker
    const sat = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); }
    sat.curve = curve; sat.oversample = '2x';
    this.bus = this.ctx.createGain();          // everything ends here: dry master + reverb return
    this.master.connect(this.bus);
    this.bus.connect(sat); sat.connect(comp);
    comp.connect(this.ctx.destination);
    // iOS: play through the silent switch, like a game, not like a web page
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { }

    // white noise buffer
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.buildReverb();
    this.startWind();
    this.startDrone();
  }

  /* ---------------------------------------------------------- canyon reverb
     A generated impulse: noise decaying with a couple of early reflections.
     Without this the guns have no tail and the canyon sounds like a closet. */
  buildReverb() {
    const rate = this.ctx.sampleRate;
    const seconds = 2.2;
    const len = Math.floor(rate * seconds);
    const ir = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // diffuse tail + slight stereo decorrelation
        const decay = Math.pow(1 - t, 2.7);
        d[i] = (Math.random() * 2 - 1) * decay * (ch ? 0.92 : 1);
      }
      // two slap-backs off canyon walls, 90ms and 210ms
      [[0.09, 0.5], [0.21, 0.34], [0.36, 0.22]].forEach(([at, amp]) => {
        const idx = Math.floor(at * rate) + (ch * 37);
        if (idx < len) d[idx] += amp;
      });
    }
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = ir;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.30;
    // a send: master -> reverb -> bus. It used to feed back into master, a loop with
    // no delay in it, which browsers mute, so the reverb was never heard
    this.reverb.connect(this.wet);
    this.wet.connect(this.bus);
    this.master.connect(this.reverb);
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
    // overtone a phone can play (the fundamental is often below what it reproduces)
    const h = this.ctx.createOscillator();
    h.type = 'triangle';
    h.frequency.setValueAtTime(f0 * 2.4, t);
    h.frequency.exponentialRampToValueAtTime(Math.max(60, f1 * 2.4), t + dur * 0.6);
    const hg = this.ctx.createGain();
    hg.gain.setValueAtTime(amp * vol * 0.35, t);
    hg.gain.exponentialRampToValueAtTime(0.0008, t + dur * 0.6);
    h.connect(hg); hg.connect(this.master);
    h.start(t); h.stop(t + dur * 0.6 + 0.02);
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

  /** low growl with a rising edge: the brute wind-up and the boss enraging */
  roar(dist = 0, big = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.t;
    const vol = 1 / (1 + dist * 0.06);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(big ? 46 : 70, t);
    o.frequency.linearRampToValueAtTime(big ? 92 : 128, t + (big ? 0.9 : 0.6));
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = big ? 520 : 680;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.linearRampToValueAtTime((big ? 0.5 : 0.32) * vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0008, t + (big ? 1.0 : 0.7));
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.05);
  }

  /** a bright two-note tick when a shot kills */
  killTick() {
    this.click(0, 0.16, 1900);
    this.click(0.045, 0.13, 2600);
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

  /* ---------------------------------------------------------- music
     An original adventure score, synthesised live. Three moods share one key
     (D minor) so they can cut into each other on a bar line:
       explore  76 bpm  harp, warm strings, a wooden-flute melody   (title, between waves)
       combat  104 bpm  string ostinato, taiko, horns carrying the theme
       boss    120 bpm  low brass stabs, choir, timpani rolls
     Everything is voiced from about 150 Hz up and given harmonics, because a phone
     speaker plays nothing below that: the old score's bass and kick were 27-115 Hz
     and its melody peaked at 1.5% volume, so on a phone it was silent. */
  startMusic() {
    if (this.musicGain || !this.ctx) return;
    const t = this.t;
    this.musicLevel = 0.42;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);       // through master so SOUND OFF silences it; master also sends to the reverb
    this.musicGain.gain.setTargetAtTime(this.musicLevel, t, 1.5);

    // one shared vibrato for every sustained voice
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 5.2;
    this.vib = this.ctx.createGain(); this.vib.gain.value = 9;          // cents
    lfo.connect(this.vib); lfo.start(t);

    this.mood = 'explore'; this.nextMood = 'explore';
    this.density = 0.3;
    this.musicStep = 0;
    this.nextTime = t + 0.12;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 40);
  }

  /** 'explore' | 'combat' | 'boss'; takes effect on the next bar line */
  setMood(m) { this.nextMood = m; }

  scheduleMusic() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') { this.nextTime = this.ctx.currentTime + 0.05; return; }
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      if (this.musicStep % 16 === 0 && this.nextMood !== this.mood) {
        this.mood = this.nextMood;
        this.musicStep = 0;
        if (this.mood !== 'explore') this.stinger(this.nextTime);
      }
      const sixteenth = 60 / SCORE[this.mood].bpm / 4;
      this.playStep(this.musicStep, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.musicStep = (this.musicStep + 1) % 128;
    }
  }

  playStep(step, t, s16) {
    const S = SCORE[this.mood];
    const bar = Math.floor(step / 16), st = step % 16;
    const chord = CHORDS[S.chords[bar]];
    const dens = this.density;

    // sustained harmony
    if (st === 0) {
      if (this.mood === 'boss') this.choir(chord, t, s16 * 16 * 1.02, 0.6);
      else this.strings(chord, t, s16 * 16 * 1.04, this.mood === 'explore' ? 0.55 : 0.42);
    }

    // melody
    for (const [b, at, n, len] of S.melody) {
      if (b === bar && at === st) {
        const dur = len * s16;
        if (this.mood === 'explore') this.flute(n, t, dur);
        else if (this.mood === 'combat') { if (dens > 0.25) this.horn(n, t, dur); }
        else this.choirLead(n, t, dur);
      }
    }

    if (this.mood === 'explore') {
      // harp: chord tones up an octave, rising then falling, every eighth
      if (st % 2 === 0) {
        const idx = [0, 1, 2, 3, 2, 3, 1, 2][st / 2];
        this.harp(chord[idx] + 12, t, st === 0 ? 1 : 0.7);
      }
      if (st === 0 && bar % 2 === 0) this.timpani(chord[0], t, 0.35);
      if (st === 8 || st === 14) this.shaker(t, 0.35);
    } else if (this.mood === 'combat') {
      // driving low-string ostinato on eighths (an octave above the old bass, so it carries)
      if (st % 2 === 0) {
        const r = chord[0] + 12;
        const off = [0, 12, 0, 7, 0, 12, 7, 12][st / 2];
        this.ostinato(r + off, t, s16 * 1.7);
      }
      if (st === 0 || st === 8) this.taiko(t, st === 0 ? 1 : 0.8);
      if (st === 6 && dens > 0.45) this.taiko(t, 0.5);
      if (st === 4 || st === 12) this.snare(t, 0.55);
      if (bar % 4 === 3 && st >= 12) this.snare(t, 0.3 + (st - 12) * 0.12);   // fill into the next phrase
      if (dens > 0.6 && st % 2 === 1) this.shaker(t, 0.25);
    } else {
      // boss: chromatic sixteenth ostinato, brass stabs in a dotted rhythm, timpani
      const r = chord[0] + 12;
      this.ostinato(r + [0, 0, 12, 0, 7, 0, 12, 1][st % 8], t, s16 * 0.9, 0.8);
      if (st === 0 || st === 3 || st === 6) this.brassStab(chord, t, s16 * 2.2);
      if (st === 0 || st === 10) this.timpani(chord[0], t, 1);
      if (st === 4 || st === 12) this.snare(t, 0.7);
      if (bar % 2 === 1 && st >= 12) this.timpani(chord[0], t, 0.45 + (st - 12) * 0.12);
    }
  }

  /* ---- instruments: each returns nothing and cleans itself up */
  _env(g, t, a, peak, d, sustain, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (d) g.gain.setTargetAtTime(peak * sustain, t + a, d);
    g.gain.setTargetAtTime(0.0001, end, rel);
  }
  _osc(type, f, t, stop, dest, cents = 0, vib = false) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = cents;
    if (vib) {
      this.vib.connect(o.detune);
      o.onended = () => { try { this.vib.disconnect(o.detune); } catch { } };   // else every note stays referenced
    }
    o.connect(dest); o.start(t); o.stop(stop);
    return o;
  }
  _out(gain, pan = 0) {
    const g = this.ctx.createGain();
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); p.connect(this.musicGain);
    } else g.connect(this.musicGain);
    return g;
  }

  strings(chord, t, dur, vel) {
    chord.forEach((n, i) => {
      const f = mtof(n + (n < 52 ? 12 : 0));            // keep the lowest voice audible
      const g = this._out(0, (i - 1.5) * 0.25);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 0.5;
      lp.connect(g);
      for (const c of [-8, 0, 7]) this._osc('sawtooth', f, t, t + dur + 0.8, lp, c, true);
      this._env(g, t, Math.min(0.6, dur * 0.25), 0.024 * vel, 0, 1, 0.35, t + dur);
    });
  }
  ostinato(n, t, dur, vel = 1) {
    const g = this._out(0, 0.15);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(700, t + dur);
    lp.connect(g);
    this._osc('sawtooth', mtof(n), t, t + dur + 0.1, lp, -6);
    this._osc('sawtooth', mtof(n), t, t + dur + 0.1, lp, 6);
    this._env(g, t, 0.008, 0.07 * vel, 0, 1, 0.05, t + dur);
  }
  horn(n, t, dur) {
    const g = this._out(0, -0.1);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1700, t + 0.07);
    lp.frequency.setTargetAtTime(1150, t + 0.07, 0.2);
    lp.connect(g);
    const f = mtof(n);
    this._osc('sawtooth', f, t, t + dur + 0.4, lp, -4, true);
    this._osc('square', f / 2, t, t + dur + 0.4, lp, 3);
    this._osc('sawtooth', f, t, t + dur + 0.4, lp, 5, true);
    this._env(g, t, 0.06, 0.085, 0.3, 0.75, 0.12, t + dur * 0.96);
  }
  flute(n, t, dur) {
    const g = this._out(0, 0.12);
    const f = mtof(n);
    this._osc('sine', f, t, t + dur + 0.4, g, 0, true);
    const tri = this.ctx.createGain(); tri.gain.value = 0.25; tri.connect(g);
    this._osc('triangle', f, t, t + dur + 0.4, tri, 0, true);
    // breath
    const nz = this.ctx.createBufferSource(); nz.buffer = this.noiseBuf; nz.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 6;
    const ng = this.ctx.createGain(); ng.gain.value = 0.25;
    nz.connect(bp); bp.connect(ng); ng.connect(g); nz.start(t); nz.stop(t + dur + 0.4);
    this._env(g, t, 0.07, 0.075, 0.4, 0.8, 0.15, t + dur * 0.95);
  }
  harp(n, t, vel) {
    const g = this._out(0, (n % 5 - 2) * 0.15);
    const f = mtof(n);
    this._osc('triangle', f, t, t + 1.5, g);
    const h = this.ctx.createGain(); h.gain.value = 0.3; h.connect(g);
    this._osc('sine', f * 2, t, t + 1.5, h);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 1.4);
  }
  choir(chord, t, dur, vel) {
    // "ah": saws through two vowel formants
    const g = this._out(0, 0);
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 760; f1.Q.value = 3;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 4;
    f1.connect(g); f2.connect(g);
    chord.forEach((n) => {
      const f = mtof(n + 12);
      for (const c of [-10, 9]) { this._osc('sawtooth', f, t, t + dur + 1, f1, c, true); this._osc('sawtooth', f, t, t + dur + 1, f2, c, true); }
    });
    this._env(g, t, 0.5, 0.05 * vel, 0, 1, 0.4, t + dur);
  }
  choirLead(n, t, dur) { this.choir([n - 12], t, dur, 1.6); this.horn(n - 12, t, dur); }
  brassStab(chord, t, dur) {
    const g = this._out(0, 0);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    lp.connect(g);
    for (const n of chord.slice(0, 3)) this._osc('sawtooth', mtof(n + 12), t, t + dur + 0.1, lp, -5);
    this._env(g, t, 0.01, 0.06, 0, 1, 0.06, t + dur);
  }
  timpani(n, t, vel) {
    const f = mtof(n < 45 ? n + 12 : n);
    const g = this._out(0, -0.2);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.35, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    o.connect(g); o.start(t); o.stop(t + 1.1);
    // the overtone is what a phone speaker actually plays
    const h = this.ctx.createGain(); h.gain.value = 0.55; h.connect(g);
    this._osc('sine', f * 2.6, t, t + 0.4, h);
    g.gain.setValueAtTime(0.18 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 1.0);
    this._hit(t, 900, 0.06 * vel, 0.07);
  }
  taiko(t, vel) {
    const g = this._out(0, 0);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(62, t + 0.22);
    o.connect(g); o.start(t); o.stop(t + 0.5);
    const h = this.ctx.createGain(); h.gain.value = 0.6; h.connect(g);
    const o2 = this.ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.setValueAtTime(330, t); o2.frequency.exponentialRampToValueAtTime(170, t + 0.12);
    o2.connect(h); o2.start(t); o2.stop(t + 0.3);
    g.gain.setValueAtTime(0.22 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 0.45);
    this._hit(t, 1400, 0.09 * vel, 0.05);
  }
  snare(t, vel) { this._hit(t, 2600, 0.07 * vel, 0.11, 'bandpass'); }
  shaker(t, vel) { this._hit(t, 6500, 0.03 * vel, 0.05, 'highpass'); }
  _hit(t, f, amp, dur, type = 'lowpass') {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = type === 'bandpass' ? 0.8 : 0.7;
    const g = this._out(0, 0);
    n.connect(fl); fl.connect(g);
    g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
    n.start(t + Math.random() * 0.003); n.stop(t + dur + 0.02);
  }
  /** kill streak: a short horn call that climbs with the streak */
  streak(n) {
    if (!this.musicGain || !this.enabled) return;
    const t = this.t, top = Math.min(4, 1 + Math.floor(n / 3));
    [69, 74, 77, 81].slice(0, top + 1).forEach((m, i) => this.horn(m, t + i * 0.08, i === top ? 0.35 : 0.1));
    this.taiko(t, 0.7);
  }

  /** a rising swell and hit when the music moves into a fight */
  stinger(t) {
    this.timpani(50, t, 1);
    this.taiko(t, 1);
    this.brassStab(CHORDS.Dm, t, 0.5);
  }

  /** fight density within a mood (wave number): more layers as it climbs */
  setMusicIntensity(v) { this.density = v; }

  /** gunfire dips the music a little, at most a few times a second */
  duck() {
    if (!this.musicGain || !this.ctx) return;
    const t = this.t;
    if (t - (this._lastDuck || 0) < 0.25) return;
    this._lastDuck = t;
    const g = this.musicGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.musicLevel * 0.72, t, 0.03);
    g.setTargetAtTime(this.musicLevel, t + 0.12, 0.3);
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
