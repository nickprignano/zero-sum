// Plays seeded Crisis games for the tests. Players are functions (state, data) => move or 'VERIFY'.
import { readFileSync } from 'node:fs';
import { canVerify, drawCard, legalMoves, newGame, resolve, verify } from '../src/crisis/engine.js';
import { meridianMove } from '../src/crisis/meridian.js';
import { rngFor } from '../src/crisis/rng.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
export const data = (() => {
  const map = read('data/map.json');
  return { rules: read('data/rules.json'), cards: read('data/crises.json').cards, regions: map.regions, map, lines: read('data/meridian-lines.json') };
})();

export function play(seed, player, d = data) {
  let state = newGame(seed, seed % 2 ? 'ember' : 'tidewater', d);
  while (!state.ending) {
    state = drawCard(state, d);
    let move = player(state, d);
    if (move === 'VERIFY') {
      state = verify(state, d);
      move = player(state, d);
    }
    state = resolve(state, move, meridianMove(state), d);
  }
  return state;
}

const pick = (state, wanted) => (legalMoves(state, 'player').includes(wanted) ? wanted : 'HOLD');

export const players = {
  random: (state) => {
    const r = rngFor(state.seed, 'random-player', state.round, state.card.verified);
    if (canVerify(state) && r() < 0.2) return 'VERIFY';
    const legal = legalMoves(state, 'player');
    return legal[Math.floor(r() * legal.length)];
  },
  alwaysStrike: () => 'STRIKE',
  alwaysTalk: (state) => pick(state, 'TALK'),
  // Checks every threat it can afford to, answers real ones with SIGNAL and talks otherwise.
  verifyThenAnswer: (state) => {
    if (state.card.kind === 'opening') return pick(state, 'TALK');
    if (canVerify(state) && state.standing.player >= 2) return 'VERIFY';
    if (!state.card.verified) return 'HOLD';
    return state.card.real ? 'SIGNAL' : pick(state, 'TALK');
  },
};
