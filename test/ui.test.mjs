// Run with: node --test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scores } from '../src/scores.js';
import { Settings } from '../src/settings.js';
import { cleanName, matchChoice } from '../src/terminal.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

function fakeMedia(matches) {
  const listeners = [];
  return {
    matches,
    addEventListener: (_, fn) => listeners.push(fn),
    set(value) { this.matches = value; listeners.forEach((fn) => fn()); },
  };
}

test('login names are 3 to 12 letters, upper-cased', () => {
  assert.equal(cleanName(' ada '), 'ADA');
  assert.equal(cleanName('abcdefghijkl'), 'ABCDEFGHIJKL');
  for (const bad of ['ab', 'abcdefghijklm', 'ad4', 'a b c', '']) assert.equal(cleanName(bad), null, bad);
});

test('typed commands match by number, whole label or a unique start', () => {
  const labels = ['CRISIS', 'INTERCEPT', 'HOW TO PLAY', 'SCORES', 'ABOUT'];
  assert.equal(matchChoice('2', labels), 1);
  assert.equal(matchChoice('how  to play', labels), 2);
  assert.equal(matchChoice('cr', labels), 0);
  assert.equal(matchChoice('a', labels), 4);
  assert.equal(matchChoice('9', labels), -1);
  assert.equal(matchChoice('x', labels), -1);
  assert.equal(matchChoice('  ', labels), -1);
  assert.equal(matchChoice('s', ['SCAN', 'SCORES']), -1, 'ambiguous start');
});

test('reduce effects follows the switch or the system setting, live', () => {
  const storage = memoryStorage();
  const media = fakeMedia(false);
  const settings = new Settings(storage, media);
  const seen = [];
  settings.onChange((reduced) => seen.push(reduced));
  assert.equal(settings.reduced, false);
  media.set(true);
  assert.equal(settings.reduced, true);
  media.set(false);
  settings.setReduceSwitch(true);
  assert.deepEqual(seen, [true, false, true]);
  settings.markNoteSeen();
  const again = new Settings(storage, fakeMedia(false));
  assert.equal(again.reduced, true);
  assert.equal(again.noteSeen, true);
});

test('settings still work when storage is blocked (the note shows every visit)', () => {
  const settings = new Settings(blocked, fakeMedia(false));
  settings.setReduceSwitch(true);
  settings.markNoteSeen();
  assert.equal(settings.reduced, true);
  assert.equal(new Settings(blocked, fakeMedia(false)).noteSeen, false);
});

test('scores keep the top 10 per game, with extra fields', () => {
  const scores = new Scores(memoryStorage());
  for (let i = 1; i <= 12; i++) scores.add('crisis', 'ADA', i * 100, { ending: 'standoff', seed: i });
  const list = scores.list('crisis');
  assert.equal(list.length, 10);
  assert.equal(list[0].score, 1200);
  assert.equal(list[0].seed, 12);
  assert.equal(scores.qualifies('crisis', 200), false);
  assert.equal(scores.qualifies('crisis', 400), true);
  assert.equal(scores.qualifies('intercept', 0), false);
  assert.deepEqual(scores.list('intercept'), []);
});

test('scores still work when storage is blocked', () => {
  const scores = new Scores(blocked);
  assert.deepEqual(scores.list('crisis'), []);
  assert.equal(scores.add('crisis', 'ADA', 500)[0].score, 500);
});
