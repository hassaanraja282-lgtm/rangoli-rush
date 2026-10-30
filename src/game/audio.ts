// All sound in Rangoli Rush is synthesised at runtime with WebAudio:
// no audio files, no licensing questions, zero download cost.
// Melodic cues use the Bhupali pentatonic (Sa Re Ga Pa Dha).

const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const SA = 293.66; // D4

export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private drone: { stop: () => void } | null = null;
  private lastSprinkle = 0;
  muted = false;
  /** When set, sounds are scheduled at this time (used for offline rendering of the demo soundtrack). */
  renderAt: number | null = null;

  now() {
    return this.renderAt ?? this.ctx!.currentTime;
  }

  /** Use an existing (e.g. Offline) AudioContext instead of creating one. */
  attach(ctx: BaseAudioContext) {
    this.ctx = ctx as AudioContext;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Optional event log hook (used to build the demo video's soundtrack). */
  private logEvent(name: string, args: unknown[]) {
    const log = (window as any).__sfxLog as unknown[] | undefined;
    if (log) log.push({ t: performance.now() / 1000, name, args });
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      // gentle glue compressor
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  private get ok() {
    return !!this.ctx && !this.muted;
  }

  noteFreq(step: number) {
    const oct = Math.floor(step / 5);
    return SA * PENTA[((step % 5) + 5) % 5] * Math.pow(2, oct);
  }

  private bell(freq: number, when: number, vol = 0.18, dur = 1.4) {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(this.master);
    const partials = [1, 2.0, 3.01, 4.2];
    const amps = [1, 0.35, 0.18, 0.08];
    partials.forEach((p, i) => {
      const o = c.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = freq * p;
      const pg = c.createGain();
      pg.gain.value = amps[i];
      o.connect(pg).connect(g);
      o.start(when);
      o.stop(when + dur + 0.05);
    });
  }

  private noise(when: number, dur: number, type: BiquadFilterType, f: number, q: number, vol: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = f;
    filt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(when, Math.random() * 0.5);
    src.stop(when + dur + 0.05);
  }

  /** Soft powder "shhk" while brushing; rate-limited. */
  sprinkle() {
    this.logEvent('sprinkle', []);
    if (!this.ok) return;
    const t = this.now();
    if (t - this.lastSprinkle < 0.07) return;
    this.lastSprinkle = t;
    this.noise(t, 0.09, 'bandpass', 3500 + Math.random() * 2500, 1.2, 0.05);
  }

  pick(colorIdx: number) {
    this.logEvent('pick', [colorIdx]);
    if (!this.ok) return;
    const t = this.now();
    this.noise(t, 0.18, 'lowpass', 900, 0.7, 0.18);
    this.bell(this.noteFreq(colorIdx) / 2, t + 0.01, 0.07, 0.35);
  }

  /** Segment completed. Pitch climbs with the combo. */
  fill(combo: number) {
    this.logEvent('fill', [combo]);
    if (!this.ok) return;
    const t = this.now();
    const step = Math.min(combo, 9);
    this.bell(this.noteFreq(step), t, 0.16, 1.3);
    if (combo >= 3) this.bell(this.noteFreq(step + 2), t + 0.07, 0.08, 1.0);
    this.noise(t, 0.25, 'highpass', 5000, 0.5, 0.05);
  }

  wrong() {
    this.logEvent('wrong', []);
    if (!this.ok) return;
    const c = this.ctx!;
    const t = this.now();
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
    this.noise(t, 0.2, 'lowpass', 500, 0.7, 0.12);
  }

  whoosh() {
    this.logEvent('whoosh', []);
    if (!this.ok) return;
    const c = this.ctx!;
    const t = this.now();
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.35);
  }

  click() {
    this.logEvent('click', []);
    if (!this.ok) return;
    const t = this.now();
    this.bell(this.noteFreq(5), t, 0.08, 0.25);
  }

  tick(urgent: boolean) {
    this.logEvent('tick', [urgent]);
    if (!this.ok) return;
    const t = this.now();
    this.bell(urgent ? 880 : 660, t, 0.05, 0.12);
  }

  fanfare() {
    this.logEvent('fanfare', []);
    if (!this.ok) return;
    const t = this.now();
    [0, 1, 2, 3, 4, 5, 7, 10].forEach((s, i) => this.bell(this.noteFreq(s), t + i * 0.09, 0.13, 1.6));
    this.noise(t + 0.7, 1.2, 'highpass', 6000, 0.4, 0.05);
  }

  timeUp() {
    this.logEvent('timeUp', []);
    if (!this.ok) return;
    const t = this.now();
    [4, 2, 0].forEach((s, i) => this.bell(this.noteFreq(s) / 2, t + i * 0.16, 0.13, 1.0));
  }

  /** Tanpura-like drone of Sa + Pa while a pattern is in play. */
  startDrone() {
    this.logEvent('startDrone', []);
    if (!this.ok || this.drone) return;
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, this.now());
    g.gain.exponentialRampToValueAtTime(0.035, this.now() + 2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(lp.frequency);
    const oscs = [SA / 2, (SA * 3) / 4, SA / 4, SA / 2 + 0.6].map((f) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(this.now());
      return o;
    });
    lfo.start(this.now());
    lp.connect(g).connect(this.master);
    this.drone = {
      stop: () => {
        const t = this.now();
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        oscs.forEach((o) => o.stop(t + 1.3));
        lfo.stop(t + 1.3);
      },
    };
  }

  stopDrone() {
    this.logEvent('stopDrone', []);
    this.drone?.stop();
    this.drone = null;
  }
}

export const sfx = new Sfx();
