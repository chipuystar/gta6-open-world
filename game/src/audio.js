// All sound is synthesized with WebAudio — no audio files. Engine hum follows
// the car, a two-tone siren follows the wanted level, and a tiny sequencer
// plays a sunset bassline under everything. Created lazily on the first
// user gesture, as browsers require.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a lowpass.
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 90;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(lp);
    this.engineOsc2.connect(g2);
    g2.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    // Siren: one sine, frequency flipped by the update loop.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Called every frame: engine pitch from speed, siren on/off from wanted.
  update(dt, speed, maxSpeed, wanted) {
    if (!this.ctx) return;
    const ratio = Math.min(1, Math.abs(speed) / maxSpeed);
    this.engineOsc.frequency.value = 55 + ratio * 165;
    this.engineOsc2.frequency.value = 82 + ratio * 240;
    this.engineGain.gain.value = 0.05 + ratio * 0.09;
    this.sirenTimer -= dt;
    if (wanted > 0) {
      if (this.sirenTimer <= 0) {
        this.sirenHigh = !this.sirenHigh;
        this.sirenTimer = 0.42;
        this.sirenOsc.frequency.value = this.sirenHigh ? 950 : 700;
      }
      this.sirenGain.gain.value = 0.045;
    } else {
      this.sirenGain.gain.value = 0;
    }
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  noiseBurst(dur, cutoff, vol) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  gunshot() {
    this.noiseBurst(0.12, 1800, 0.35);
    this.blip(180, 0.08, 'square', 0.12);
  }
  crash(intensity) {
    this.noiseBurst(0.25, 500, Math.min(0.5, 0.15 + intensity * 0.3));
  }
  pickup() {
    this.blip(660, 0.09, 'sine', 0.18);
    setTimeout(() => this.blip(990, 0.12, 'sine', 0.18), 90);
  }
  missionComplete() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.2), i * 130));
  }
  busted() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'triangle', 0.2), i * 180));
  }

  // Sunset bassline: Am – F – C – G roots with a soft triangle wave and a
  // hat tick, scheduled on a lookahead timer so it keeps time.
  startMusic() {
    if (this.started || !this.ctx) return;
    this.started = true;
    const roots = [110, 87.31, 130.81, 98];
    const stepDur = 0.24;
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const root = roots[bar];
      const inBar = this.musicStep % 8;
      if (inBar === 0 || inBar === 3 || inBar === 6) {
        this.blip(root, 0.5, 'triangle', 0.12);
      }
      if (inBar % 2 === 1) this.noiseBurst(0.03, 6000, 0.03);
      if (inBar === 4) this.blip(root * 1.5, 0.3, 'sine', 0.07);
      this.musicStep += 1;
    }, stepDur * 1000);
  }
}
