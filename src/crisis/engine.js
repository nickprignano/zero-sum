// Crisis: rounds, meters, cards, endings and scoring. Pure functions with no DOM: every function
// takes a game state and returns a new one, and every random choice comes from the game's seed.
// The rules are in docs/SPEC.md ("Crisis rules"); the numbers are in data/rules.json.

import { rngFor, shuffle } from './rng.js';

export const MOVES = ['TALK', 'AID', 'HOLD', 'SIGNAL', 'STRIKE'];
export const SIDES = ['player', 'meridian'];
const ESCALATIONS = new Set(['SIGNAL', 'STRIKE']);
export const TEMPERAMENTS = ['calm', 'wary', 'brittle'];

const clamp = (v, max) => Math.max(0, Math.min(max, v));
const other = (bloc) => (bloc === 'ember' ? 'tidewater' : 'ember');

// A new game. data = { rules, cards, regions }; regions is map.json's list.
export function newGame(seed, playerBloc, data) {
  const { rules, cards } = data;
  const { start } = rules;
  return {
    seed: String(seed),
    blocs: { player: playerBloc, meridian: other(playerBloc) },
    temperament: TEMPERAMENTS[Math.floor(rngFor(seed, 'temperament')() * TEMPERAMENTS.length)],
    deck: shuffle(cards.map((c) => c.id), rngFor(seed, 'deck')),
    round: 0,
    tension: start.tension,
    trust: start.trust,
    standing: { player: start.standing, meridian: start.standing },
    locked: { player: 0, meridian: 0 },
    defused: 0,
    playerStruck: false,
    card: null,
    history: [],
    ending: null,
    score: null,
  };
}

// Start the next round: draw a card, place it in a region, decide its secret, and add its
// tension at once (a card never pushes tension past cardTensionCap on its own).
export function drawCard(state, data) {
  const { rules, cards, regions } = data;
  const round = state.round + 1;
  const card = cards.find((c) => c.id === state.deck[round - 1]);
  const random = rngFor(state.seed, 'card', round);
  const region = Math.floor(random() * regions.length);
  const real = card.kind === 'opening' || random() >= card.falseChance;
  const added = card.kind === 'threat' ? Math.min(state.tension + card.tension, rules.cardTensionCap) : state.tension;
  return {
    ...state,
    round,
    roundStartTension: state.tension,
    tension: Math.max(state.tension, added),
    card: { id: card.id, kind: card.kind, text: card.text.replace('{region}', regions[region].name), region, real, verified: false },
  };
}

export function isLocked(state, side) {
  return state.locked[side] > 0;
}

export function legalMoves(state, side) {
  return MOVES.filter((m) => !(isLocked(state, side) && (m === 'TALK' || m === 'AID')));
}

export function canVerify(state) {
  return state.card?.kind === 'threat' && !state.card.verified && !state.ending;
}

// The player checks the facts. Costs standing; the round doesn't advance.
export function verify(state, data) {
  if (!canVerify(state)) throw new Error('nothing to verify');
  return {
    ...state,
    standing: { ...state.standing, player: clamp(state.standing.player - data.rules.verifyCost, data.rules.max.standing) },
    card: { ...state.card, verified: true },
  };
}

// Both moves, revealed together. Returns the state after the round, with `ending` and `score`
// set when the game is over, and `last` describing what happened for the screen.
export function resolve(state, playerMove, meridianMove, data) {
  const { rules } = data;
  const moves = { player: playerMove, meridian: meridianMove };
  for (const side of SIDES) {
    if (!legalMoves(state, side).includes(moves[side])) throw new Error(`${side} can't play ${moves[side]}`);
  }
  const { card } = state;
  let { tension, trust } = state;
  const standing = { ...state.standing };
  const notes = [];

  const raised = { player: false, meridian: false };
  for (const side of SIDES) {
    const m = rules.moves[moves[side]];
    // A SIGNAL against a real threat is a fair answer: it doesn't raise tension.
    const fair = card.kind === 'threat' && card.real && moves[side] === 'SIGNAL';
    const added = fair ? 0 : m.tension;
    raised[side] = added > 0;
    tension += added;
    trust += m.trust;
    standing[side] += m.standing;
    const escalated = ESCALATIONS.has(moves[side]);
    if (card.kind === 'threat' && escalated && !card.real) {
      trust += rules.falseAlarmEscalation.trust;
      notes.push({ side, kind: 'false-alarm-escalation' });
    }
    if (card.kind === 'threat' && !escalated && card.real) {
      standing[side] += rules.ignoredThreat.standing;
      notes.push({ side, kind: 'ignored-threat' });
    }
    if (card.kind === 'opening' && moves[side] === 'TALK') trust += rules.openingTalk.trust;
  }
  if (!raised.player && !raised.meridian) tension -= 1;

  tension = clamp(tension, rules.max.tension);
  trust = clamp(trust, rules.max.trust);
  for (const side of SIDES) standing[side] = clamp(standing[side], rules.max.standing);

  // Hardliners: a side at 0 standing can't TALK or AID for the next rounds, then resets.
  const locked = { ...state.locked };
  for (const side of SIDES) {
    if (locked[side] > 0) {
      locked[side] -= 1;
      if (locked[side] === 0) standing[side] = rules.hardliners.resetStanding;
    } else if (standing[side] === 0) {
      locked[side] = rules.hardliners.rounds;
      trust = clamp(trust + rules.hardliners.trust, rules.max.trust);
      notes.push({ side, kind: 'hardliners' });
    }
  }

  const defused = state.defused + (card.kind === 'threat' && tension <= state.roundStartTension ? 1 : 0);
  const next = {
    ...state,
    tension,
    trust,
    standing,
    locked,
    defused,
    playerStruck: state.playerStruck || playerMove === 'STRIKE',
    history: [...state.history, { round: state.round, card: card.id, real: card.real, verified: card.verified, player: playerMove, meridian: meridianMove, tension, trust }],
    last: { moves, notes },
  };

  if (tension >= rules.max.tension) return end(next, 'lights-out', data);
  if (playerMove === 'TALK' && meridianMove === 'TALK' && trust >= rules.treaty.trust && tension <= rules.treaty.maxTension && state.round >= rules.treaty.fromRound) {
    return end(next, 'treaty', data);
  }
  if (state.round >= rules.rounds) return end(next, 'standoff', data);
  return next;
}

export function scoreFor(state, ending, rules) {
  const s = rules.score;
  if (ending === 'treaty') return s.treaty.base + s.treaty.defused * state.defused + s.treaty.roundLeft * (rules.rounds - state.round);
  if (ending === 'standoff') return s.standoff.base + s.standoff.defused * state.defused + s.standoff.trust * state.trust;
  return state.playerStruck ? 0 : Math.min(s.lightsOut.max, s.lightsOut.perRound * state.round);
}

function end(state, ending, data) {
  return { ...state, ending, score: scoreFor(state, ending, data.rules) };
}
