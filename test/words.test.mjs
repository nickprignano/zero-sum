// Run with: node --test
// Keeps the film's and other games' names out of everything the site serves. The list is stored
// encoded so the repo never spells it out; tests and docs aren't served, so they aren't scanned.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gameFiles } from '../tools/sw-version.mjs';

const BANNED = Buffer.from(
  'd2FyZ2FtZXN8d2FyIGdhbWVzfHdvcHJ8am9zaHVhfGZhbGtlbnxnbG9iYWwgdGhlcm1vbnVjbGVhcnxzaGFsbCB3ZSBwbGF5fGRlZmNvbnxtaXNzaWxlIGNvbW1hbmR8bm9yYWQ=',
  'base64',
).toString('utf8').split('|');

test('no banned name appears in any served file', () => {
  const files = gameFiles().filter((f) => !f.endsWith('.png'));
  assert.ok(files.includes('/') && files.includes('data/crises.json'));
  for (const file of files) {
    const text = readFileSync(file === '/' ? 'index.html' : file, 'utf8').toLowerCase().replace(/\s+/g, ' ');
    for (const word of BANNED) assert.ok(!text.includes(word), `${file} contains a banned name`);
  }
});
