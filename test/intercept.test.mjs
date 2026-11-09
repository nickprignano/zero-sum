// Test 4 in docs/SPEC.md: Intercept's rules, checked on the pure game in src/intercept/game.js.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { citiesStanding, handoverWave, newGame, scan, scanning, startWave, step, tap, tracePos, waveSpec } from '../src/intercept/game.js';

const config = JSON.parse(readFileSync(new URL('../data/intercept.json', import.meta.url)));

// A wave in progress with exactly the traces given, so a test controls everything on screen.
function stage(traces, options) {
  const state = newGame('test', config, options);
  startWave(state);
  state.pending = [];
  state.traces = traces.map((t, i) => ({ id: 100 + i, kind: 'real', x0: t.x, y0: 0, x1: t.x, y1: config.cityY, t0: 0, dur: 10, split: t.kind === 'split', ...t }));
  return state;
}
const run = (state, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60) && state.phase === 'wave'; i++) step(state);
};
// Plays until the game ends (or a wave limit) and collects every event.
function playOut(state, { maxWaves = 50, onStep = () => {} } = {}) {
  const events = [];
  while (state.phase !== 'over' && state.wave < maxWaves) {
    if (state.phase === 'between') startWave(state);
    state.events = [];
    step(state);
    onStep(state);
    events.push(...state.events);
  }
  return events;
}

test('a burst destroys every trace inside its ring and none outside', () => {
  const x = 125; // over the second city
  const state = stage([{ x }, { x: x + 30 }, { x: x + 300 }]);
  run(state, 3);
  const { y } = tracePos(state.traces[0], state.time);
  assert.ok(tap(state, x, y));
  run(state, config.burst.growSeconds + 0.05);
  assert.deepEqual(state.traces.map((t) => t.x0), [x + 300]);
});

test('decoys turn at 60%, vanish at 75% and never hit a city', () => {
  assert.equal(config.decoyReveal, 0.6);
  assert.equal(config.decoyVanish, 0.75);
  const state = stage([{ x: 125, kind: 'decoy' }]);
  run(state, 7.4);
  assert.equal(state.traces.length, 1, 'still falling at 74%');
  state.events = [];
  run(state, 0.2);
  assert.equal(state.traces.length, 0);
  assert.equal(citiesStanding(state), config.cities);
});

test('splits and decoys start on the right waves, and waves only get faster and larger', () => {
  assert.equal(waveSpec(config, 1).decoyShare, 0);
  assert.equal(waveSpec(config, 2).decoyShare, 0.15);
  assert.equal(waveSpec(config, 2).splits, 0);
  assert.equal(waveSpec(config, 3).splits, 1);
  for (let w = 2; w <= 40; w++) {
    const a = waveSpec(config, w - 1);
    const b = waveSpec(config, w);
    assert.ok(b.incoming > a.incoming && b.fallSeconds < a.fallSeconds, `wave ${w}`);
    assert.ok(b.decoyShare >= a.decoyShare && b.decoyShare <= 0.35 && b.splits >= a.splits);
  }
  // The waves the game builds match: count kinds in the queue.
  const state = newGame('kinds', config);
  for (let w = 1; w <= 4; w++) {
    startWave(state);
    const count = (k) => state.pending.filter((p) => p.kind === k).length;
    const spec = waveSpec(config, w);
    assert.equal(state.pending.length, spec.incoming);
    assert.equal(count('decoy'), Math.round(spec.incoming * spec.decoyShare));
    assert.equal(count('split'), spec.splits);
    state.pending = [];
  }
});

test('a split trace becomes three at 40% of the way down', () => {
  const state = stage([{ x: 500, kind: 'split' }]);
  run(state, 4.1);
  assert.equal(state.traces.length, 3);
  assert.ok(state.traces.every((t) => t.kind === 'real' && !t.split));
});

test('scan works once a wave and marks decoys for 3 seconds', () => {
  const state = stage([{ x: 125, kind: 'decoy' }]);
  assert.ok(scan(state));
  assert.equal(scan(state), false, 'only once a wave');
  run(state, 2.9);
  assert.ok(scanning(state));
  run(state, 0.2);
  assert.equal(scanning(state), false);
});

test('steady hands rebuilds one city, and nothing else brings cities back', () => {
  const clean = stage([{ x: 125 }]);
  clean.cities[3].alive = false;
  run(clean, 3);
  tap(clean, 125, tracePos(clean.traces[0], clean.time).y);
  clean.events = [];
  run(clean, 5);
  assert.equal(citiesStanding(clean), config.cities);
  assert.equal(clean.phase, 'between');

  // One wasted burst in the wave: no rebuild.
  const sloppy = stage([{ x: 125 }]);
  sloppy.cities[3].alive = false;
  run(sloppy, 3);
  tap(sloppy, 125, tracePos(sloppy.traces[0], sloppy.time).y);
  tap(sloppy, 800, 100);
  run(sloppy, 5);
  assert.equal(citiesStanding(sloppy), config.cities - 1);

  // With no taps, cities only ever go down.
  const state = newGame('no-defense', config);
  let last = citiesStanding(state);
  playOut(state, { onStep: (s) => {
    assert.ok(citiesStanding(s) <= last);
    last = citiesStanding(s);
  } });
});

test('the game ends when the last city falls', () => {
  const state = newGame('end', config);
  const events = playOut(state);
  assert.equal(state.phase, 'over');
  assert.equal(citiesStanding(state), 0);
  assert.equal(events.filter((e) => e.type === 'over').length, 1);
});

test('the flash limiter allows at most 3 glows a second, each under a quarter of the playfield', () => {
  const field = config.width * config.height;
  for (let seed = 0; seed < 20; seed++) {
    const state = stage(Array.from({ length: 8 }, (_, i) => ({ x: Math.round((config.width / 8) * (i + 0.5)) })));
    state.seed = `glow-${seed}`;
    const seen = new Map();
    playOut(state, { onStep: (s) => s.glows.forEach((g) => seen.set(g, true)) });
    const glows = [...seen.keys()];
    assert.ok(glows.length > 0);
    for (const g of glows) {
      assert.ok(Math.PI * g.radius ** 2 < field / 4);
      assert.ok(glows.filter((h) => h.t0 >= g.t0 && h.t0 < g.t0 + 1).length <= 3);
    }
  }
});

test('the tall portrait field keeps glows under a quarter of the playfield too', () => {
  const tall = { ...config, ...config.portrait };
  assert.ok(Math.PI * tall.glow.radius ** 2 < (tall.width * tall.height) / 4);
  const state = newGame('tall', tall);
  playOut(state);
  assert.equal(state.phase, 'over');
  assert.ok(state.cities.every((c) => c.x > 0 && c.x < tall.width));
});

test('Reduce effects gives zero glow events', () => {
  const state = newGame('reduced', config, { effects: false });
  let glows = 0;
  playOut(state, { onStep: (s) => (glows += s.glows.length) });
  assert.equal(glows, 0);
});

test('the hand-over wave follows the Crisis state and is never scored', () => {
  assert.deepEqual(handoverWave({ standing: { player: 5, meridian: 4 }, defused: 2 }, config), { incoming: 30, decoys: 4 });
  assert.deepEqual(handoverWave({ standing: { player: 0, meridian: 1 }, defused: 9 }, config), { incoming: 20, decoys: 0 });

  const crisis = { standing: { player: 3, meridian: 3 }, defused: 1, score: 120 };
  const before = structuredClone(crisis);
  const state = newGame('handover', config, { handover: handoverWave(crisis, config) });
  startWave(state);
  assert.equal(state.pending.length, 24);
  // Even a player who taps every real trace can't refill: the pool is 10 and doesn't grow.
  playOut(state, { onStep: (s) => {
    for (const t of s.traces) if (t.kind === 'real' && s.pool >= 1) tap(s, tracePos(t, s.time).x, tracePos(t, s.time).y);
  } });
  assert.equal(state.wave, 1, 'one wave only');
  assert.equal(state.phase, 'over');
  assert.equal(state.score, 0);
  assert.ok(citiesStanding(state) < config.cities, 'overwhelming');
  assert.deepEqual(crisis, before, 'the Crisis state is untouched');
  // The page never saves it: the hand-over path in main.js has no score call.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = main.slice(main.indexOf('async function handover'), main.indexOf('\n}\n', main.indexOf('async function handover')));
  assert.ok(body.length > 0 && !body.includes('scores.'));
});

test('the same seed gives the same waves', () => {
  const a = newGame('same', config);
  const b = newGame('same', config);
  const c = newGame('other', config);
  for (const s of [a, b, c]) startWave(s);
  assert.deepEqual(a.pending, b.pending);
  assert.notDeepEqual(a.pending, c.pending);
  playOut(a);
  playOut(b);
  assert.equal(a.wave, b.wave);
  assert.deepEqual(a.cities, b.cities);
});
