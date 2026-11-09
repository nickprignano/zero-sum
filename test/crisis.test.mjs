// Run with: node --test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canVerify, drawCard, legalMoves, MOVES, newGame, resolve, verify } from '../src/crisis/engine.js';
import { meridianMove } from '../src/crisis/meridian.js';
import { data, play, players } from './sim.mjs';

const { rules } = data;

test('every card and region loads, and cards fill in a real region name', () => {
  assert.ok(data.cards.length >= 30);
  assert.equal(data.regions.length, 12);
  assert.equal(new Set(data.cards.map((c) => c.id)).size, data.cards.length);
  for (const card of data.cards) {
    assert.ok(['threat', 'opening'].includes(card.kind), card.id);
    assert.ok(card.text.includes('{region}'), card.id);
    if (card.kind === 'threat') assert.ok(card.falseChance >= 0 && card.falseChance <= 1, card.id);
  }
  for (const region of data.regions) {
    assert.ok(['ember', 'tidewater'].includes(region.bloc));
    assert.ok(region.points.length >= 3 && region.cities.length >= 2);
  }
  const state = drawCard(newGame(1, 'ember', data), data);
  assert.ok(!state.card.text.includes('{region}'));
});

test('meters stay in range and the round order holds, over many seeded games', () => {
  for (let seed = 1; seed <= 500; seed++) {
    let state = newGame(seed, 'ember', data);
    while (!state.ending) {
      const startTension = state.tension;
      state = drawCard(state, data);
      assert.ok(state.tension <= rules.cardTensionCap || state.tension === startTension, 'a card never pushes tension past the cap');
      const move = players.random(state, data);
      const m = move === 'VERIFY' ? players.random((state = verify(state, data)), data) : move;
      state = resolve(state, m === 'VERIFY' ? 'HOLD' : m, meridianMove(state), data);
      assert.ok(state.tension >= 0 && state.tension <= rules.max.tension);
      assert.ok(state.trust >= 0 && state.trust <= rules.max.trust);
      for (const side of ['player', 'meridian']) assert.ok(state.standing[side] >= 0 && state.standing[side] <= rules.max.standing);
      assert.ok(state.round <= rules.rounds);
    }
  }
});

test('VERIFY works once per threat card, costs standing, and does not advance the round', () => {
  let state = newGame(3, 'ember', data);
  do state = drawCard(state, data); while (state.card.kind !== 'threat');
  const checked = verify(state, data);
  assert.equal(checked.round, state.round);
  assert.equal(checked.standing.player, state.standing.player - rules.verifyCost);
  assert.equal(canVerify(checked), false);
  assert.throws(() => verify(checked, data));
});

test('a fair SIGNAL against a real threat does not raise tension; one over a false alarm costs trust', () => {
  const base = { ...drawCard(newGame(5, 'ember', data), data), tension: 2, trust: 5, roundStartTension: 2 };
  const real = { ...base, card: { ...base.card, kind: 'threat', real: true } };
  const fake = { ...base, card: { ...base.card, kind: 'threat', real: false } };
  // Nobody raised tension (the fair SIGNAL doesn't count), so it eases by 1.
  assert.equal(resolve(real, 'SIGNAL', 'HOLD', data).tension, 1);
  assert.equal(resolve(real, 'SIGNAL', 'SIGNAL', data).tension, 1);
  const over = resolve(fake, 'SIGNAL', 'HOLD', data);
  assert.equal(over.tension, 3);
  assert.equal(over.trust, 5 + rules.falseAlarmEscalation.trust);
  assert.equal(resolve(fake, 'HOLD', 'HOLD', data).tension, 1);
  // Letting a real threat pass costs standing.
  assert.equal(resolve(real, 'HOLD', 'HOLD', data).standing.player, base.standing.player + rules.ignoredThreat.standing);
});

test('hardliners lock TALK and AID, cost trust, then release with reset standing', () => {
  let state = { ...drawCard(newGame(9, 'ember', data), data), standing: { player: 1, meridian: 5 }, trust: 6 };
  state = { ...state, card: { ...state.card, kind: 'opening', real: true } };
  state = resolve(state, 'TALK', 'HOLD', data);
  assert.equal(state.locked.player, rules.hardliners.rounds);
  assert.ok(!legalMoves(state, 'player').includes('TALK') && !legalMoves(state, 'player').includes('AID'));
  assert.throws(() => resolve({ ...drawCard(state, data) }, 'TALK', 'HOLD', data));
  for (let i = 0; i < rules.hardliners.rounds; i++) state = resolve(drawCard(state, data), 'HOLD', 'HOLD', data);
  assert.equal(state.locked.player, 0);
  assert.equal(state.standing.player, rules.hardliners.resetStanding);
  assert.deepEqual(legalMoves(state, 'player'), MOVES);
});

test('the same seed and moves always give the same game', () => {
  for (const seed of [11, 12, 13]) assert.deepEqual(play(seed, players.random), play(seed, players.random));
});

test('the hook: every lights-out scores below every standoff and treaty, and judgment pays', () => {
  const N = 10000;
  const results = {};
  let worstPeace = Infinity;
  let bestWar = -Infinity;
  for (const [name, player] of Object.entries(players)) {
    let total = 0;
    let brittle = 0;
    let brittleTreaties = 0;
    for (let seed = 1; seed <= N; seed++) {
      const game = play(seed, player);
      total += game.score;
      if (game.ending === 'lights-out') bestWar = Math.max(bestWar, game.score);
      else worstPeace = Math.min(worstPeace, game.score);
      if (game.temperament === 'brittle') {
        brittle++;
        if (game.ending === 'treaty') brittleTreaties++;
      }
    }
    results[name] = { avg: total / N, brittleTreatyShare: brittleTreaties / brittle };
  }
  assert.ok(bestWar < worstPeace, `best lights-out ${bestWar} vs worst peace ${worstPeace}`);
  assert.equal(results.alwaysStrike.avg, 0);
  assert.ok(results.alwaysTalk.brittleTreatyShare < 0.5, 'always talking does not usually win a treaty against a brittle MERIDIAN');
  assert.ok(results.verifyThenAnswer.avg > results.alwaysTalk.avg, JSON.stringify(results));
  assert.ok(results.verifyThenAnswer.avg > results.alwaysStrike.avg);
});
