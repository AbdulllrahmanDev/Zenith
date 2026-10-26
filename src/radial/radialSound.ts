/**
 * Web Audio Procedural Synthesizer matching Rovyl.
 * 10 distinct futuristic haptic/percussive sound profiles:
 * 'thump' | 'sub-tick' | 'knock' | 'pluck' | 'pulse' | 'drop' | 'felt-tap' | 'rubber' | 'reese' | 'haptic'
 */

export type RadialSoundId =
  | 'thump'
  | 'sub-tick'
  | 'knock'
  | 'pluck'
  | 'pulse'
  | 'drop'
  | 'felt-tap'
  | 'rubber'
  | 'reese'
  | 'haptic';

export const RADIAL_SOUNDS: { id: RadialSoundId; name: string }[] = [
  { id: 'sub-tick', name: 'Sub Tick' },
  { id: 'thump', name: 'Thump' },
  { id: 'knock', name: 'Knock' },
  { id: 'pluck', name: 'Pluck' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'drop', name: 'Drop' },
  { id: 'felt-tap', name: 'Felt Tap' },
  { id: 'rubber', name: 'Rubber' },
  { id: 'reese', name: 'Reese' },
  { id: 'haptic', name: 'Haptic' },
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastVoice: GainNode | null = null;
let sleepTimer: any = null;
let noiseBuffer: AudioBuffer | null = null;

const MASTER_GAIN = 0.7;
let volume = 0.7;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new AudioCtx({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  master = ctx.createGain();
  master.gain.value = masterGain();
  master.connect(limiter).connect(ctx.destination);
  return ctx;
}

function masterGain(): number {
  return MASTER_GAIN * volume * volume;
}

export function setRadialSoundVolume(vol: number) {
  volume = Math.max(0, Math.min(100, vol)) / 100;
  if (master && ctx) {
    master.gain.setValueAtTime(masterGain(), ctx.currentTime);
  }
}

function envelope(c: BaseAudioContext, t: number, attack: number, peak: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function tone(c: BaseAudioContext, type: OscillatorType, from: number, to: number, t: number, glide: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + glide);
  return o;
}

function lowpass(c: BaseAudioContext, frequency: number, q = 0.7): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

function noise(c: BaseAudioContext): AudioBufferSourceNode {
  if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
    noiseBuffer = c.createBuffer(1, Math.ceil(c.sampleRate * 0.25), c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = c.createBufferSource();
  source.buffer = noiseBuffer;
  return source;
}

function run(nodes: AudioScheduledSourceNode[], t: number, duration: number): void {
  for (const node of nodes) {
    node.start(t);
    node.stop(t + duration);
  }
}

const VOICES: Record<RadialSoundId, (c: BaseAudioContext, out: AudioNode, t: number) => void> = {
  thump(c, out, t) {
    const g = envelope(c, t, 0.002, 1, 0.12);
    const o = tone(c, 'sine', 110, 36, t, 0.08);
    o.connect(g).connect(out);
    run([o], t, 0.15);
  },
  'sub-tick'(c, out, t) {
    const gBody = envelope(c, t, 0.001, 0.95, 0.07);
    const oBody = tone(c, 'sine', 180, 42, t, 0.04);
    oBody.connect(gBody).connect(out);
    const gClick = envelope(c, t, 0.0005, 0.35, 0.01);
    const n = noise(c);
    const fClick = lowpass(c, 2400, 2);
    n.connect(fClick).connect(gClick).connect(out);
    run([oBody, n], t, 0.09);
  },
  knock(c, out, t) {
    const g = envelope(c, t, 0.001, 1, 0.04);
    const o = tone(c, 'sine', 340, 95, t, 0.035);
    o.connect(g).connect(out);
    run([o], t, 0.05);
  },
  pluck(c, out, t) {
    const g = envelope(c, t, 0.001, 0.85, 0.14);
    const o = tone(c, 'triangle', 480, 220, t, 0.12);
    o.connect(g).connect(out);
    run([o], t, 0.16);
  },
  pulse(c, out, t) {
    const g = envelope(c, t, 0.004, 0.9, 0.18);
    const o = tone(c, 'sine', 95, 55, t, 0.15);
    o.connect(g).connect(out);
    run([o], t, 0.2);
  },
  drop(c, out, t) {
    const g = envelope(c, t, 0.001, 0.8, 0.08);
    const o = tone(c, 'sine', 600, 140, t, 0.07);
    o.connect(g).connect(out);
    run([o], t, 0.09);
  },
  'felt-tap'(c, out, t) {
    const g = envelope(c, t, 0.002, 0.9, 0.05);
    const n = noise(c);
    const f = lowpass(c, 800, 1.2);
    n.connect(f).connect(g).connect(out);
    run([n], t, 0.06);
  },
  rubber(c, out, t) {
    const g = envelope(c, t, 0.003, 0.9, 0.09);
    const o = tone(c, 'sine', 130, 80, t, 0.08);
    o.connect(g).connect(out);
    run([o], t, 0.1);
  },
  reese(c, out, t) {
    const g = envelope(c, t, 0.005, 0.7, 0.22);
    const o1 = tone(c, 'sawtooth', 65, 62, t, 0.2);
    const o2 = tone(c, 'sawtooth', 67, 64, t, 0.2);
    const f = lowpass(c, 320, 2);
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(out);
    run([o1, o2], t, 0.24);
  },
  haptic(c, out, t) {
    const g = envelope(c, t, 0.0008, 1, 0.025);
    const o = tone(c, 'sine', 220, 80, t, 0.02);
    o.connect(g).connect(out);
    run([o], t, 0.03);
  },
};

export function playRadialSound(id: RadialSoundId) {
  const c = getContext();
  if (!c || !master) return;
  if (c.state === 'suspended') {
    void c.resume();
  }
  if (sleepTimer) {
    clearTimeout(sleepTimer);
  }
  sleepTimer = setTimeout(() => {
    if (ctx && ctx.state === 'running') {
      void ctx.suspend();
    }
  }, 1500);

  const t = c.currentTime;
  if (lastVoice) {
    try {
      lastVoice.gain.cancelScheduledValues(t);
      lastVoice.gain.setValueAtTime(lastVoice.gain.value, t);
      lastVoice.gain.linearRampToValueAtTime(0.0001, t + 0.005);
    } catch {}
  }

  const voiceGain = c.createGain();
  voiceGain.connect(master);
  lastVoice = voiceGain;

  const synth = VOICES[id] || VOICES.thump;
  synth(c, voiceGain, t);
}

export function playRadialBloom(volumePercent = 70) {
  setRadialSoundVolume(volumePercent);
  playRadialSound('sub-tick');
}

export function playRadialHover(volumePercent = 70) {
  setRadialSoundVolume(volumePercent);
  playRadialSound('thump');
}
