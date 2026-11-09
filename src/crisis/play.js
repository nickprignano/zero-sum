// Plays one Crisis game on the terminal and the map. The rules live in engine.js; this file only
// shows them: the card, the moves as buttons, what happened, the meters and the ending.

import { canVerify, drawCard, legalMoves, newGame, resolve, verify } from './engine.js';
import { meridianMove } from './meridian.js';
import { newSeed } from './rng.js';

const ENDING_TITLE = { treaty: 'TREATY SIGNED', standoff: 'STANDOFF', 'lights-out': 'LIGHTS OUT' };

// ui = { term, mapView, panel, meters, mapText, scores, name }
export async function playCrisis(ui, data) {
  const { term } = ui;
  term.clear();
  await term.print('CHOOSE YOUR SIDE:');
  const bloc = await term.choose([
    { label: data.map.blocs.ember.toUpperCase(), value: 'ember' },
    { label: data.map.blocs.tidewater.toUpperCase(), value: 'tidewater' },
    { label: 'BACK', value: null },
  ]);
  if (!bloc) return;

  let state = newGame(newSeed(), bloc, data);
  ui.mapView.reset();
  ui.panel.hidden = false;
  document.documentElement.classList.add('playing');
  ui.mapView.layout();
  try {
    while (!state.ending) {
      state = drawCard(state, data);
      showMeters(ui, state, data);
      ui.mapView.show(state.card.region);
      term.clear();
      await term.print(`ROUND ${state.round} OF ${data.rules.rounds}`, `${state.card.kind === 'threat' ? 'REPORT' : 'OPENING'}: ${state.card.text}`, '');
      if (legalMoves(state, 'player').length < 5) await term.print('YOUR HARDLINERS ARE IN CHARGE: TALK AND AID ARE LOCKED.', '');

      let move = await chooseMove(term, state);
      if (move === 'QUIT') return;
      if (move === 'VERIFY') {
        state = verify(state, data);
        showMeters(ui, state, data);
        await term.print(state.card.real ? 'VERIFIED: THE THREAT IS REAL.' : 'VERIFIED: IT IS A FALSE ALARM.', '');
        move = await chooseMove(term, state);
        if (move === 'QUIT') return;
      }
      const before = state;
      state = resolve(state, move, meridianMove(state), data);
      showMeters(ui, state, data);
      await term.print(...roundReport(before, state, data));
      if (!state.ending) {
        await term.choose([{ label: 'NEXT ROUND', value: true }]);
      }
    }
    if (state.ending === 'lights-out') await ui.mapView.lightsOut();
    await showEnding(ui, state, data);
  } finally {
    ui.panel.hidden = true;
    document.documentElement.classList.remove('playing');
  }
}

function chooseMove(term, state) {
  const options = legalMoves(state, 'player').map((m) => ({ label: m, value: m }));
  if (canVerify(state)) options.push({ label: 'VERIFY', value: 'VERIFY' });
  options.push({ label: 'QUIT', value: 'QUIT' });
  return term.choose(options);
}

function roundReport(before, after, data) {
  const { moves, notes } = after.last;
  const lines = [`YOU: ${moves.player}.  MERIDIAN: ${moves.meridian}.`];
  if (before.card.kind === 'threat') lines.push(before.card.real ? 'THE THREAT WAS REAL.' : 'IT WAS A FALSE ALARM.');
  for (const note of notes) {
    const who = note.side === 'player' ? 'YOU' : 'MERIDIAN';
    if (note.kind === 'false-alarm-escalation') lines.push(`${who} ESCALATED OVER A FALSE ALARM. TRUST FALLS.`);
    if (note.kind === 'ignored-threat') lines.push(`${who} LET A REAL THREAT PASS. STANDING AT HOME FALLS.`);
    if (note.kind === 'hardliners') lines.push(`HARDLINERS TAKE OVER ${note.side === 'player' ? 'YOUR SIDE' : 'MERIDIAN\'S SIDE'}. TRUST COLLAPSES. TALK AND AID LOCKED FOR ${data.rules.hardliners.rounds} ROUNDS.`);
  }
  const dt = after.tension - before.tension;
  lines.push(`TENSION ${dt > 0 ? 'RISES' : dt < 0 ? 'EASES' : 'HOLDS'}: ${after.tension} OF ${data.rules.max.tension}. TRUST ${after.trust}.`, '');
  return lines;
}

function bar(value, max) {
  return '■'.repeat(value) + '□'.repeat(max - value);
}

function showMeters(ui, state, data) {
  const { max, rounds } = data.rules;
  // The first word of each bloc's name, in its map color, shows who is who.
  const blocName = (side) => data.map.blocs[state.blocs[side]].split(' ')[0].toUpperCase();
  const standing = (side) => `STANDING ${state.standing[side]}${state.locked[side] ? ' · HARDLINERS' : ''}`;
  const rows = [
    ['ROUND', `${state.round} / ${rounds}`],
    ['TENSION', `${bar(state.tension, max.tension)} ${state.tension}`, state.tension >= max.tension - 1 ? 'danger' : ''],
    ['TRUST', `${state.trust} / ${max.trust}`],
    [`YOU · ${blocName('player')}`, standing('player'), '', state.blocs.player],
    [`MERIDIAN · ${blocName('meridian')}`, standing('meridian'), '', state.blocs.meridian],
  ];
  ui.meters.replaceChildren(...rows.map(([k, v, valueClass = '', bloc = '']) => {
    const row = document.createElement('div');
    row.className = 'meter';
    const a = document.createElement('span');
    a.textContent = k;
    a.className = bloc;
    const b = document.createElement('span');
    b.textContent = v;
    b.className = valueClass;
    row.append(a, b);
    return row;
  }));
  // The map's text version for screen readers.
  ui.mapText.replaceChildren(...data.regions.map((r, i) => {
    const li = document.createElement('li');
    li.textContent = `${r.name}: ${data.map.blocs[r.bloc]}${i === state.card?.region ? ', where the crisis is' : ''}`;
    return li;
  }));
}

async function showEnding(ui, state, data) {
  const { term, scores, name } = ui;
  const s = data.rules.score;
  const lines = [ENDING_TITLE[state.ending], ''];
  if (state.ending === 'treaty') {
    lines.push(`BOTH SIDES TALKED AND SIGNED IN ROUND ${state.round}.`,
      `${s.treaty.base} + ${s.treaty.defused} x ${state.defused} CRISES DEFUSED + ${s.treaty.roundLeft} x ${data.rules.rounds - state.round} ROUNDS LEFT`);
  } else if (state.ending === 'standoff') {
    lines.push('NO TREATY, BUT NOBODY LAUNCHED.',
      `${s.standoff.base} + ${s.standoff.defused} x ${state.defused} CRISES DEFUSED + ${s.standoff.trust} x ${state.trust} TRUST`);
  } else {
    lines.push('TENSION REACHED THE TOP. THE CITIES WENT DARK.',
      state.playerStruck ? 'YOU STRUCK AT LEAST ONCE: NO SCORE.' : `${s.lightsOut.perRound} x ${state.round} ROUNDS, AT MOST ${s.lightsOut.max}. PEACE ALWAYS SCORES MORE.`);
  }
  lines.push(`SCORE: ${state.score}`, `MERIDIAN WAS ${state.temperament.toUpperCase()}. GAME SEED ${state.seed}.`, '');
  await term.print(...lines);
  if (scores.qualifies('crisis', state.score)) {
    scores.add('crisis', name, state.score, { ending: state.ending, seed: state.seed });
    await term.print('A NEW HIGH SCORE.', '');
  }
  await term.choose([{ label: 'BACK TO THE MENU', value: true }]);
}
