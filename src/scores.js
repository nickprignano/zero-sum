// High scores kept on the player's device: the top 10 per game, best first. Crisis entries also
// keep the ending and the seed, so a game can be replayed.
import { load, save } from './storage.js';

const KEY = 'zero-sum-scores';
const MAX_SCORES = 10;

export class Scores {
  constructor(storage) {
    this.storage = storage;
  }

  // [{ name, score, date, ...extra }] for a game ('crisis' or 'intercept').
  list(game) {
    return load(KEY, {}, this.storage)[game] ?? [];
  }

  qualifies(game, score) {
    const list = this.list(game);
    return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
  }

  add(game, name, score, extra = {}) {
    const all = load(KEY, {}, this.storage);
    const entry = { name, score, date: new Date().toISOString().slice(0, 10), ...extra };
    all[game] = [...(all[game] ?? []), entry].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
    save(KEY, all, this.storage);
    return all[game];
  }
}
