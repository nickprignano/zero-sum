// The player's settings: Reduce effects and whether the content note has been seen.
// Effects are reduced when the player's switch is on or the system asks for reduced motion,
// watched live so a change mid-game applies at once.
import { load, save } from './storage.js';

const KEY = 'zero-sum-settings';

export class Settings {
  constructor(storage, media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')) {
    this.storage = storage;
    this.media = media;
    const saved = load(KEY, {}, storage);
    this.reduceSwitch = saved.reduceSwitch === true;
    this.noteSeen = saved.noteSeen === true;
    this.listeners = [];
    this.media?.addEventListener?.('change', () => this.changed());
  }

  get reduced() {
    return this.reduceSwitch || this.media?.matches === true;
  }

  setReduceSwitch(on) {
    this.reduceSwitch = on;
    this.persist();
    this.changed();
  }

  markNoteSeen() {
    this.noteSeen = true;
    this.persist();
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  changed() {
    for (const fn of this.listeners) fn(this.reduced);
  }

  persist() {
    save(KEY, { reduceSwitch: this.reduceSwitch, noteSeen: this.noteSeen }, this.storage);
  }
}
