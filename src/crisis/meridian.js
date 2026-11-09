// MERIDIAN's play: a small, readable rule table, not machine learning. It sees what the player
// sees (the card's text, the meters, the player's past moves), never the card's secret or the
// player's move this round. Its temperament, picked from the seed, sets how much it believes
// threat cards and how much trust it needs before it will talk.

import { isLocked, legalMoves } from './engine.js';
import { rngFor } from './rng.js';

const TRUST_DOUBT = 0.05;

export const TEMPERAMENT = {
  //        believes threats  escalates when it believes  talks from trust  only talks at tension <=
  calm:    { belief: 0.4, escalate: 0.3, talkTrust: 6, talkTension: 6 },
  wary:    { belief: 0.6, escalate: 0.5, talkTrust: 7, talkTension: 6 },
  brittle: { belief: 0.85, escalate: 0.7, talkTrust: 8, talkTension: 2 },
};

export function meridianMove(state) {
  const t = TEMPERAMENT[state.temperament];
  const random = rngFor(state.seed, 'meridian', state.round);
  const legal = legalMoves(state, 'meridian');
  const can = (m) => legal.includes(m);
  const recent = state.history.slice(-3).map((h) => h.player);
  const lastPlayer = recent[recent.length - 1];
  const playerHostile = recent.some((m) => m === 'SIGNAL' || m === 'STRIKE');
  const friendly = state.trust >= t.talkTrust && state.tension <= t.talkTension;

  if (state.card.kind === 'opening') return can('TALK') && state.trust >= t.talkTrust - 2 ? 'TALK' : 'HOLD';

  // A player who looks weak at home gets pushed, unless MERIDIAN is calm.
  if (state.standing.player <= 2 && state.temperament !== 'calm' && random() < t.escalate) return 'SIGNAL';

  // A threat card: does MERIDIAN believe it?
  // Trust above the starting level makes it doubt alarms; a hostile player makes it believe them.
  const belief = Math.max(0.05, Math.min(0.95, t.belief - TRUST_DOUBT * (state.trust - 5) + (playerHostile ? 0.2 : 0)));
  const believes = random() < belief;
  if (believes) {
    if (lastPlayer === 'STRIKE' && state.temperament === 'brittle') return 'STRIKE';
    if (state.standing.meridian <= 2 || isLocked(state, 'meridian')) return 'SIGNAL';
    return random() < t.escalate ? 'SIGNAL' : 'HOLD';
  }
  if (friendly && can('TALK') && (lastPlayer === 'TALK' || lastPlayer === 'AID')) return 'TALK';
  if (can('TALK') && random() < 0.4) return 'TALK';
  return 'HOLD';
}
