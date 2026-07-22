import type { SimEvent } from '../sim/types';
import { loadProfile, saveAudioPrefs } from '../meta/save';

/**
 * Original synthesized audio (issue #8). Every sound is generated with
 * WebAudio — no sampled or copied assets, matching the generated-art
 * approach. SFX are driven from SimEvents; a procedural ambient-combat loop
 * runs underneath. All of this is presentation-only and never touches the
 * deterministic sim.
 *
 * The engine no-ops cleanly when WebAudio is unavailable and never creates an
 * AudioContext before a user gesture (browser autoplay policy), so headless
 * e2e runs stay silent and error-free.
 */

type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private volume: number;
  private muted: boolean;

  private lastPlayed = new Map<string, number>();
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;

  constructor() {
    const profile = loadProfile();
    this.volume = profile.volume;
    this.muted = profile.muted;
  }

  /** Create/resume the context. Must be called from a user-gesture handler. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return; // WebAudio unavailable — stay silent.
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.5;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.connect(this.master);
        this.noiseBuffer = this.buildNoiseBuffer();
        this.applyVolume();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null; // Give up quietly; the game plays fine muted.
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
    saveAudioPrefs(this.volume, this.muted);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolume();
    saveAudioPrefs(this.volume, this.muted);
    return this.muted;
  }

  private applyVolume(): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  // -----------------------------------------------------------------------
  // SFX

  /** Routes a sim event to its sound, throttled so hordes don't clip. */
  playEvent(ev: SimEvent): void {
    if (!this.ctx) return;
    switch (ev.type) {
      case 'attack':
        this.whoosh();
        break;
      case 'projectile-fired':
        this.pew();
        break;
      case 'enemy-shot':
        this.spit();
        break;
      case 'enemy-hit':
        this.thud(220, 0.06, 0.12);
        break;
      case 'enemy-died':
        this.squelch();
        break;
      case 'generator-hit':
        this.crack(0.1);
        break;
      case 'generator-enraged':
        this.alarm();
        break;
      case 'generator-destroyed':
        this.boom();
        break;
      case 'prop-destroyed':
        this.crack(0.16, 340);
        break;
      case 'pickup-collected':
        if (ev.kind === 'gold') this.coin();
        else if (ev.kind === 'key') this.keyChime();
        else this.chomp();
        break;
      case 'gate-opened':
        this.gateClank();
        break;
      case 'secret-revealed':
        this.rumble();
        break;
      case 'powerup-gained':
        this.arpeggio([523, 659, 784, 1047], 'triangle', 0.07, 0.7);
        break;
      case 'player-hit':
        this.hurt();
        break;
      case 'player-died':
        this.arpeggio([440, 330, 262, 196], 'triangle', 0.12, 0.5);
        break;
      case 'ability':
        this.slam();
        break;
      case 'ability-dash':
        this.dashWhoosh();
        break;
      case 'ability-guard':
        this.guardUp();
        break;
      case 'guard-block':
        this.thunk();
        break;
      case 'exit-opened':
        this.arpeggio([392, 523, 659, 784], 'square', 0.09, 0.9);
        break;
      case 'mission-complete':
        this.duckMusic();
        this.arpeggio([523, 659, 784, 1047], 'square', 0.14, 1.0);
        break;
      case 'mission-failed':
        this.duckMusic();
        this.arpeggio([349, 294, 233, 175], 'sawtooth', 0.16, 0.8);
        break;
      default:
        break;
    }
  }

  /** Menu tick, used by UI scenes. */
  uiTick(pitch = 660): void {
    if (!this.ctx) return;
    this.tone(pitch, 'square', 0.04, 0.12);
  }

  uiConfirm(): void {
    if (!this.ctx) return;
    this.arpeggio([523, 784], 'square', 0.07, 0.5);
  }

  private throttle(key: string, ms: number): boolean {
    const now = this.ctx!.currentTime * 1000;
    const last = this.lastPlayed.get(key) ?? -Infinity;
    if (now - last < ms) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private pew(): void {
    if (!this.throttle('pew', 50)) return;
    this.tone(880, 'square', 0.09, 0.12, 330);
  }

  /** Spitter fire: a short wet downward blip, distinct from the player's pew. */
  private spit(): void {
    if (!this.throttle('spit', 60)) return;
    this.tone(300, 'sawtooth', 0.1, 0.12, 120);
  }

  private whoosh(): void {
    if (!this.throttle('whoosh', 55)) return;
    const t = this.ctx!.currentTime;
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    filter.Q.value = 1.2;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(filter).connect(g).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 0.14);
  }

  private thud(freq: number, dur: number, gain: number): void {
    if (!this.throttle('thud', 35)) return;
    this.tone(freq, 'triangle', dur, gain, freq * 0.5);
  }

  private squelch(): void {
    if (!this.throttle('squelch', 45)) return;
    const t = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.18);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  private crack(gain: number, freq = 260): void {
    if (!this.throttle('crack', 35)) return;
    const t = this.ctx!.currentTime;
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = freq * 3;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(filter).connect(g).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 0.09);
    this.tone(freq, 'square', 0.05, gain * 0.6);
  }

  private boom(): void {
    const t = this.ctx!.currentTime;
    // Low sine thump.
    const osc = this.ctx!.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.4);
    const og = this.ctx!.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(og).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.5);
    // Noise blast.
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    const ng = this.ctx!.createGain();
    ng.gain.setValueAtTime(0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(filter).connect(ng).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 0.36);
  }

  private alarm(): void {
    const t = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(700, t + 0.25);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  private coin(): void {
    if (!this.throttle('coin', 40)) return;
    const t = this.ctx!.currentTime;
    this.tone(988, 'square', 0.05, 0.14, undefined, t);
    this.tone(1319, 'square', 0.09, 0.13, undefined, t + 0.05);
  }

  private chomp(): void {
    const t = this.ctx!.currentTime;
    this.tone(523, 'sine', 0.08, 0.2, undefined, t);
    this.tone(784, 'sine', 0.12, 0.2, undefined, t + 0.06);
  }

  private hurt(): void {
    if (!this.throttle('hurt', 90)) return;
    const t = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.23);
  }

  private slam(): void {
    const t = this.ctx!.currentTime;
    // Descending filtered noise sweep.
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    const ng = this.ctx!.createGain();
    ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(filter).connect(ng).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 0.31);
    // Sub thump.
    const osc = this.ctx!.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    const og = this.ctx!.createGain();
    og.gain.setValueAtTime(0.45, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(og).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  /** Volley Step: a short bright noise-whoosh plus a rising bow-snap tone. */
  private dashWhoosh(): void {
    const t = this.ctx!.currentTime;
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.14);
    filter.Q.value = 0.9;
    const ng = this.ctx!.createGain();
    ng.gain.setValueAtTime(0.16, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter).connect(ng).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 0.17);
    this.tone(520, 'square', 0.1, 0.1, 900);
  }

  /** Bastion Wall raise: a low metallic swell as the shield comes up. */
  private guardUp(): void {
    const t = this.ctx!.currentTime;
    this.tone(160, 'triangle', 0.22, 0.22, 240, t);
    this.tone(240, 'sine', 0.26, 0.14, 320, t + 0.02);
  }

  /** Blocked hit: a short, deep shield thunk with a metallic tick on top. */
  private thunk(): void {
    if (!this.throttle('thunk', 40)) return;
    const t = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.15);
    this.tone(640, 'square', 0.03, 0.08);
  }

  /** Key pickup: a bright two-note ping. */
  private keyChime(): void {
    const t = this.ctx!.currentTime;
    this.tone(1175, 'triangle', 0.07, 0.16, undefined, t);
    this.tone(1568, 'triangle', 0.1, 0.14, undefined, t + 0.06);
  }

  /** Gate opening: a metallic clank with a low unlatch thump. */
  private gateClank(): void {
    const t = this.ctx!.currentTime;
    this.tone(180, 'square', 0.12, 0.2, 90, t);
    this.tone(520, 'square', 0.05, 0.12, undefined, t + 0.02);
    this.tone(660, 'square', 0.08, 0.1, undefined, t + 0.1);
  }

  /** Secret wall crumbling: a low filtered-noise rumble. */
  private rumble(): void {
    const t = this.ctx!.currentTime;
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.45);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(filter).connect(g).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + 0.51);
  }

  private arpeggio(freqs: number[], type: OscType, step: number, gain: number): void {
    const t0 = this.ctx!.currentTime;
    freqs.forEach((f, i) => this.tone(f, type, step * 1.4, gain * 0.2, undefined, t0 + i * step));
  }

  /** One enveloped oscillator note. */
  private tone(freq: number, type: OscType, dur: number, gain: number, glideTo?: number, at?: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = at ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private buildNoiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // -----------------------------------------------------------------------
  // Music: procedural ambient-combat loop with a lookahead scheduler.

  startMusic(): void {
    if (!this.ctx || this.musicTimer) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.5);
    this.musicTimer = setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Briefly lower the music bed (mission end stingers sit on top). */
  duckMusic(): void {
    if (this.ctx && this.musicGain) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(0.12, t + 0.15);
    }
  }

  // A dark, driving 16-step loop in E minor: a bassline plus a sparse pad.
  private static readonly BASS = [41.2, 0, 41.2, 0, 55, 0, 41.2, 49, 36.7, 0, 36.7, 0, 49, 0, 55, 61.7];
  private static readonly PAD = [164.8, 0, 0, 0, 196, 0, 0, 0, 146.8, 0, 0, 0, 196, 0, 220, 0];
  private static readonly STEP_DUR = 0.15;

  private scheduleMusic(): void {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
      const i = this.step % 16;
      const bass = AudioEngine.BASS[i]!;
      if (bass > 0) this.musicNote(bass, 'sawtooth', AudioEngine.STEP_DUR * 0.9, 0.5, this.nextNoteTime);
      const pad = AudioEngine.PAD[i]!;
      if (pad > 0) this.musicNote(pad, 'triangle', AudioEngine.STEP_DUR * 3.4, 0.14, this.nextNoteTime);
      // Off-beat hat for drive.
      if (i % 2 === 1) this.musicHat(this.nextNoteTime);
      this.nextNoteTime += AudioEngine.STEP_DUR;
      this.step++;
    }
  }

  private musicNote(freq: number, type: OscType, dur: number, gain: number, at: number): void {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(filter).connect(g).connect(this.musicGain!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private musicHat(at: number): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.06, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(filter).connect(g).connect(this.musicGain!);
    src.start(at);
    src.stop(at + 0.06);
  }
}

/** Shared engine instance; created lazily, safe to import anywhere in src/game. */
export const audio = new AudioEngine();
