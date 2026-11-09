// Sounds, all synthesized with the Web Audio API, so there's nothing to license.

import { load, save } from './storage.js';

const MUTE_KEY = 'zero-sum-muted';

export class Audio {
  constructor() {
    this.muted = load(MUTE_KEY, false) === true;
    this.ctx = null;
  }

  // Browsers only allow sound after the player has tapped or pressed a key. iOS also suspends
  // sound after the phone locks or the app goes to the background, so each tap resumes it.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AudioContext) this.ctx = new AudioContext();
  }

  setMuted(muted) {
    this.muted = muted;
    save(MUTE_KEY, muted);
  }

  tone(freq, ms, { type = 'sine', volume = 0.1, slideTo = null, delay = 0 } = {}) {
    const { ctx } = this;
    const start = ctx.currentTime + delay / 1000;
    const end = start + ms / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, end);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.setValueAtTime(volume, Math.max(start, end - 0.02));
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }

  noise(ms, { volume = 0.05, delay = 0 } = {}) {
    const { ctx } = this;
    const length = Math.ceil((ctx.sampleRate * ms) / 1000);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + delay / 1000);
  }

  play(name) {
    if (this.muted || !this.ctx) return;
    switch (name) {
      case 'key':
        this.tone(1800 + Math.random() * 400, 12, { type: 'square', volume: 0.015 });
        break;
      case 'select':
        this.tone(880, 60, { type: 'square', volume: 0.04 });
        break;
      case 'error':
        this.tone(220, 180, { type: 'square', volume: 0.05 });
        break;
      case 'modem':
        // A made-up handshake: dial tones, an answer tone, then a burst of static.
        [697, 770, 852, 941, 770, 697, 852].forEach((f, i) => this.tone(f, 70, { volume: 0.06, delay: i * 95 }));
        this.tone(2100, 700, { volume: 0.05, delay: 900 });
        this.tone(1200, 300, { type: 'triangle', volume: 0.05, delay: 1650, slideTo: 2400 });
        this.noise(900, { volume: 0.03, delay: 1950 });
        break;
    }
  }
}
