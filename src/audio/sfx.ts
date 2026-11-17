import { WEIGHT_SPECS } from '../game/config';

/** Alle geluiden worden live gesynthetiseerd met Web Audio: geen samples, geen auteursrecht. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master) master.gain.value = on ? 0.9 : 0;
}

/** Aanroepen bij een gebruikersactie (autoplay-beleid). */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function ready(): AudioContext | null {
  if (!enabled || !ctx || !master || ctx.state !== 'running') return null;
  return ctx;
}

function env(c: AudioContext, t: number, peak: number, attack: number, decay: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function tone(freq: number, t: number, dur: number, peak: number, type: OscillatorType = 'sine', attack = 0.002) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  const g = env(c, t, peak, attack, dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
  return o;
}

function noise(t: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, q = 1) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  f.Q.value = q;
  const g = env(c, t, peak, 0.002, dur);
  s.connect(f).connect(g).connect(master!);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
  return f;
}

/** Metalen "klink" — hoger en lichter voor messing, doffer en zwaarder voor ijzer, beton en staal. */
export function clink(idx: number, strength = 1) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const v = 0.15 + 0.25 * strength;
  // index op een schaal 0–9 brengen, ongeacht hoeveel gewichten er zijn
  const heft = WEIGHT_SPECS[idx]?.heft ?? 0.5;
  idx = Math.round(heft * 9);
  if (idx <= 2) {
    const f0 = 2900 - idx * 550 + Math.random() * 120;
    [1, 2.76, 5.4].forEach((r, i) => tone(f0 * r, t, 0.35 / (i + 1), v / (i + 1.5)));
    noise(t, 0.02, v * 0.5, 'highpass', 5000);
  } else if (idx <= 5) {
    const f0 = 900 - (idx - 3) * 220;
    [1, 2.4, 3.9].forEach((r, i) => tone(f0 * r, t, 0.22 / (i + 1), v * 0.8 / (i + 1.4), 'triangle'));
    tone(120 - idx * 8, t, 0.12, v * 0.9);
    noise(t, 0.05, v * 0.6, 'bandpass', 1800, 0.8);
  } else {
    // zware klap + nagalm van staal
    tone(70 - (idx - 6) * 8, t, 0.35, v * 1.2);
    noise(t, 0.18, v * 0.9, 'lowpass', 500 - (idx - 6) * 60);
    [1, 1.9].forEach((r, i) => tone((260 - idx * 12) * r, t + 0.01, 0.5, v * 0.25 / (i + 1), 'triangle'));
  }
}

/** Zachte "plof" als het voorwerp landt. */
export function plof(strength = 1) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  const g = env(c, t, 0.5 * strength + 0.1, 0.004, 0.2);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + 0.3);
  noise(t, 0.08, 0.25 * strength, 'lowpass', 700);
}

/** Wegnemen van een gewicht. */
export function lift() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const o = tone(500, t, 0.08, 0.12, 'triangle');
  o.frequency.exponentialRampToValueAtTime(900, t + 0.08);
}

/** "Klik" van het slot. */
export function lockClick() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  noise(t, 0.015, 0.6, 'highpass', 3000);
  noise(t + 0.06, 0.02, 0.5, 'bandpass', 2200, 2);
  tone(1800, t + 0.06, 0.04, 0.12, 'square');
}

/** Kraak + zwiep bij het kantelen. Sterker bij grotere hoek. */
export function creak(amount = 1) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(95, t);
  o.frequency.linearRampToValueAtTime(140, t + 0.25);
  o.frequency.linearRampToValueAtTime(80, t + 0.6);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 8;
  const lfo = c.createOscillator();
  lfo.frequency.value = 23;
  const lg = c.createGain();
  lg.gain.value = 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09 * amount + 0.02, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
  lfo.connect(lg).connect(g.gain);
  o.connect(f).connect(g).connect(master!);
  o.start(t);
  lfo.start(t);
  o.stop(t + 0.7);
  lfo.stop(t + 0.7);
  const wf = noise(t, 0.45, 0.12 * amount + 0.03, 'bandpass', 400, 1.5);
  wf.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
}

/** Klein tikje bij het optellen van de score. */
export function tick(i: number) {
  const c = ready();
  if (!c) return;
  tone(1200 + i * 9, c.currentTime, 0.03, 0.05, 'triangle');
}

/** Jingle bij een score van 90 of meer. */
export function jingle(perfect = false) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const notes = perfect ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    tone(f, t + i * 0.085, 0.4, 0.16, 'triangle');
    tone(f * 2, t + i * 0.085, 0.25, 0.04, 'sine');
  });
}

/** Droog "wa-wah" bij 0 punten. */
export function fail() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  [311, 233].forEach((f, i) => {
    const o = tone(f, t + i * 0.2, 0.3, 0.1, 'triangle', 0.01);
    o.frequency.linearRampToValueAtTime(f * 0.94, t + i * 0.2 + 0.3);
  });
}

/** Zwiep voor de ronde-intro. */
export function whoosh() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const f = noise(t, 0.35, 0.12, 'bandpass', 300, 1.2);
  f.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
}

/** Cartoon-"boing" als je het hoofd van de balans aantikt. */
export function boing() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
  o.frequency.exponentialRampToValueAtTime(260, t + 0.3);
  const lfo = c.createOscillator();
  lfo.frequency.value = 28;
  const lg = c.createGain();
  lg.gain.value = 40;
  lfo.connect(lg).connect(o.frequency);
  const g = env(c, t, 0.22, 0.005, 0.35);
  o.connect(g).connect(master!);
  o.start(t);
  lfo.start(t);
  o.stop(t + 0.4);
  lfo.stop(t + 0.4);
}
