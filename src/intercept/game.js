// Intercept: waves, traces, decoys, splits, bursts, the flash limiter and scoring. No DOM: the page
// calls tap(), scan() and step() and draws what's in the state. Every random choice comes from the
// game's seed, so a run is repeatable in tests. docs/SPEC.md, "Intercept rules"; the numbers are
// in data/intercept.json.

import { rngFor } from '../crisis/rng.js';

export const STEP = 1 / 60;

// A new game. handover = { incoming, decoys } plays one overwhelming, unscored wave after a lost
// Crisis; otherwise waves go on until the last city falls. effects: false gives no glow events.
export function newGame(seed, config, { handover = null, effects = true } = {}) {
  const gap = config.width / config.cities;
  const state = {
    seed: String(seed),
    config,
    handover,
    effects,
    time: 0,
    wave: 0,
    phase: 'between',
    score: 0,
    pool: config.pool.size,
    cities: Array.from({ length: config.cities }, (_, i) => ({ x: Math.round(gap * (i + 0.5)), alive: true })),
    traces: [],
    pending: [],
    bursts: [],
    scanUntil: -1,
    scanUsed: false,
    glows: [],
    events: [],
    nextId: 1,
    waveBursts: 0,
    waveMisses: 0,
  };
  return state;
}

export const citiesStanding = (state) => state.cities.filter((c) => c.alive).length;

export function waveSpec(config, wave) {
  const { wave1, perWave } = config;
  const n = wave - 1;
  return {
    incoming: wave1.incoming + perWave.incoming * n,
    fallSeconds: wave1.fallSeconds * perWave.fallFactor ** n,
    decoyShare: wave < perWave.decoyShareFrom ? 0 : Math.min(perWave.decoyShareMax, perWave.decoyShareStart + perWave.decoyShareStep * (wave - perWave.decoyShareFrom)),
    splits: wave < perWave.splitsFrom ? 0 : wave - perWave.splitsFrom + 1,
  };
}

// Start the next wave: queue its traces with their spawn times.
export function startWave(state) {
  const { config } = state;
  state.wave += 1;
  state.phase = 'wave';
  state.scanUsed = false;
  state.waveBursts = 0;
  state.waveMisses = 0;
  const random = rngFor(state.seed, 'wave', state.wave);
  let spec = waveSpec(config, state.wave);
  let gapShare = config.spawnGapShare;
  let decoys = Math.round(spec.incoming * spec.decoyShare);
  if (state.handover) {
    const h = config.handover;
    spec = { ...waveSpec(config, 1), incoming: state.handover.incoming, splits: 0 };
    decoys = state.handover.decoys;
    gapShare = h.spawnGapShare;
    state.pool = config.pool.size;
  }
  const kinds = Array.from({ length: spec.incoming }, (_, i) => (i < decoys ? 'decoy' : i < decoys + spec.splits ? 'split' : 'real'));
  // Shuffle kinds so decoys and splits aren't all first.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const gap = spec.fallSeconds * gapShare;
  state.pending = kinds.map((kind, i) => ({
    kind,
    at: state.time + 1 + i * gap * (0.6 + random() * 0.8),
    x0: 20 + random() * (config.width - 40),
    target: random(),
    dur: spec.fallSeconds,
  }));
  state.events.push({ type: 'wave', wave: state.wave });
}

function targetCity(state, pick) {
  const alive = state.cities.filter((c) => c.alive);
  const list = alive.length ? alive : state.cities;
  return list[Math.min(list.length - 1, Math.floor(pick * list.length))];
}

function makeTrace(state, { kind, x0, y0 = 0, target, dur }) {
  const city = targetCity(state, target);
  return { id: state.nextId++, kind, x0, y0, x1: city.x, y1: state.config.cityY, t0: state.time, dur, split: kind === 'split' };
}

export function tracePos(trace, time) {
  const p = Math.min(1, (time - trace.t0) / trace.dur);
  return { p, x: trace.x0 + (trace.x1 - trace.x0) * p, y: trace.y0 + (trace.y1 - trace.y0) * p };
}

// A burst's ring grows, holds, and is gone after lifeSeconds. Its full size is at least the
// page's minimum (so a tap on a small phone screen still covers a fingertip).
export function burstRadius(burst, time, config) {
  const { radius, growSeconds, lifeSeconds } = config.burst;
  const age = time - burst.t0;
  if (age < 0 || age > lifeSeconds) return 0;
  const full = Math.max(radius, burst.minRadius);
  return age < growSeconds ? full * (age / growSeconds) : full;
}

// The player taps the sky. minRadius lets the page keep a burst at least 44 CSS px wide on small
// screens. Returns false when the pool is empty.
export function tap(state, x, y, minRadius = 0) {
  if (state.phase !== 'wave' || state.pool < 1) return false;
  state.pool -= 1;
  state.bursts.push({ x, y, t0: state.time, minRadius, hits: 0 });
  state.waveBursts += 1;
  state.events.push({ type: 'launch', x, y });
  return true;
}

export function scan(state) {
  if (state.phase !== 'wave' || state.scanUsed) return false;
  state.scanUsed = true;
  state.scanUntil = state.time + state.config.scanSeconds;
  state.events.push({ type: 'scan' });
  return true;
}

export const scanning = (state) => state.time < state.scanUntil;

// A glow on a city hit, if the flash limiter allows it: at most maxPerSecond in any second, and
// none at all with effects off. Its radius keeps it well under a quarter of the playfield.
function requestGlow(state, x, y) {
  if (!state.effects) return;
  const { maxPerSecond, radius } = state.config.glow;
  const recent = state.glows.filter((g) => state.time - g.t0 < 1);
  if (recent.length >= maxPerSecond) return;
  state.glows = [...recent, { x, y, t0: state.time, radius }];
}

// Advance the game by one fixed step.
export function step(state) {
  const { config } = state;
  if (state.phase !== 'wave') return;
  state.time += STEP;
  const t = state.time;

  if (!state.handover) state.pool = Math.min(config.pool.size, state.pool + config.pool.refillPerSecond * STEP);

  while (state.pending.length && state.pending[0].at <= t) state.traces.push(makeTrace(state, state.pending.shift()));

  const next = [];
  for (const trace of state.traces) {
    const { p, x, y } = tracePos(trace, t);
    // Bursts destroy every trace inside their ring.
    const hitBy = state.bursts.find((b) => {
      const r = burstRadius(b, t, config);
      return r > 0 && Math.hypot(x - b.x, y - b.y) <= r;
    });
    if (hitBy) {
      if (trace.kind !== 'decoy') hitBy.hits += 1;
      state.events.push({ type: 'intercept', x, y, decoy: trace.kind === 'decoy' });
      continue;
    }
    if (trace.kind === 'decoy' && p >= config.decoyVanish) {
      state.events.push({ type: 'fizzle', x, y });
      continue;
    }
    if (trace.split && p >= config.splitAt) {
      const random = rngFor(state.seed, 'split', trace.id);
      for (let i = 0; i < 3; i++) next.push(makeTrace(state, { kind: 'real', x0: x, y0: y, target: random(), dur: trace.dur * (1 - config.splitAt) }));
      state.events.push({ type: 'split', x, y });
      continue;
    }
    if (p >= 1) {
      const city = state.cities.find((c) => c.x === trace.x1);
      if (city.alive) {
        city.alive = false;
        requestGlow(state, city.x, config.cityY);
        state.events.push({ type: 'city', x: city.x, y: config.cityY });
      }
      continue;
    }
    next.push(trace);
  }
  state.traces = next;

  // Bursts that end without hitting a real trace count as misses.
  state.bursts = state.bursts.filter((b) => {
    if (t - b.t0 <= config.burst.lifeSeconds) return true;
    if (b.hits === 0) state.waveMisses += 1;
    return false;
  });

  if (citiesStanding(state) === 0) {
    state.phase = 'over';
    state.events.push({ type: 'over' });
    return;
  }
  if (!state.pending.length && !state.traces.length && !state.bursts.length) endWave(state);
}

function endWave(state) {
  const { config } = state;
  if (state.handover) {
    state.phase = 'over';
    state.events.push({ type: 'over' });
    return;
  }
  // Steady hands: a wave where every burst hit a real trace rebuilds one lost city.
  const lost = state.cities.find((c) => !c.alive);
  const rebuilt = state.waveBursts > 0 && state.waveMisses === 0 && lost;
  if (rebuilt) lost.alive = true;
  const points = config.scorePerCityPerWave * state.wave * citiesStanding(state);
  state.score += points;
  state.phase = 'between';
  state.events.push({ type: 'wave-end', wave: state.wave, points, rebuilt: Boolean(rebuilt) });
}

// The wave that follows a lost Crisis: overwhelming by design, and never scored.
export function handoverWave(crisisState, config) {
  const h = config.handover;
  const standings = crisisState.standing.player + crisisState.standing.meridian;
  return {
    incoming: Math.max(h.min, h.base + h.perStanding * standings),
    decoys: Math.max(0, h.decoysFrom - crisisState.defused),
  };
}
