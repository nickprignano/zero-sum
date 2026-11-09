// The page: content note, dial-in, login and MERIDIAN's menu, plus sound, the site header and
// the installable app. Intercept arrives in the next build (docs/SPEC.md).

import { Audio } from './audio.js';
import { loadCrisisData } from './crisis/data.js';
import { playCrisis } from './crisis/play.js';
import { MapView } from './map.js';
import { Scores } from './scores.js';
import { Settings } from './settings.js';
import { cleanName, Terminal } from './terminal.js';

const THEME_MODULE = 'https://cdn.jsdelivr.net/gh/nickprignano/prignano-theme@4c2effc3829269e40ad663baf130a6b899a402bb/index.js';
const SOURCE = 'https://github.com/nickprignano/zero-sum';

const $ = (id) => document.getElementById(id);
const settings = new Settings();
const audio = new Audio();
const scores = new Scores();
const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const term = new Terminal(
  { screen: $('screen'), out: $('out'), spoken: $('spoken'), choices: $('choices'), prompt: $('prompt'), input: $('cmd'), label: $('cmd-label') },
  { reduced: () => settings.reduced, onChar: () => audio.play('key') },
);
term.onSelect = () => audio.play('select');
term.onError = () => audio.play('error');

function applyEffects() {
  document.documentElement.classList.toggle('reduce', settings.reduced);
}
settings.onChange(applyEffects);
applyEffects();

// Any tap or key skips the typing, and the first one allows sound.
for (const type of ['pointerdown', 'keydown']) {
  addEventListener(type, () => {
    audio.unlock();
    term.skip();
  });
}

function updateMuteButton() {
  $('btn-mute').textContent = audio.muted ? 'Sound off' : 'Sound on';
  $('btn-mute').setAttribute('aria-pressed', String(!audio.muted));
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  updateMuteButton();
}
$('btn-mute').addEventListener('click', toggleMute);
addEventListener('keydown', (event) => {
  if (event.target === $('cmd')) return;
  if (event.key === 'm' || event.key === 'M') toggleMute();
});
updateMuteButton();

// Installable app: sw.js keeps every game file so it plays offline. A new version downloads in the
// background, and the menu offers it; it never reloads the page by itself.
let updateWaiting = null;
let installPrompt = null;
let reloadOnUpdate = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((registration) => {
    const watch = (worker) => worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) updateWaiting = worker;
    });
    if (registration.waiting && navigator.serviceWorker.controller) updateWaiting = registration.waiting;
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    // Installed apps are reopened rather than reloaded, so look for a new version each time.
    document.addEventListener('visibilitychange', () => document.hidden || registration.update().catch(() => {}));
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => reloadOnUpdate && location.reload());
}
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});

// Site header from prignano-theme, loaded at runtime so this repo carries no personal details.
// The game works without it.
function setHeaderCollapsed(collapsed) {
  $('site-header').classList.toggle('collapsed', collapsed);
  $('btn-header').textContent = collapsed ? '▾' : '▴';
  $('btn-header').setAttribute('aria-expanded', String(!collapsed));
  $('btn-header').setAttribute('aria-label', collapsed ? 'Show the site header' : 'Hide the site header');
}
$('btn-header').addEventListener('click', () => setHeaderCollapsed(!$('site-header').classList.contains('collapsed')));
// The installed app starts with the header hidden, to leave the screen to the game.
if (installed) setHeaderCollapsed(true);
import(THEME_MODULE)
  .then(({ headerHtml, initThemeToggle }) => {
    $('site-header').innerHTML = headerHtml({ bio: 'Zero Sum, an original game', links: [] });
    initThemeToggle();
  })
  .catch(() => $('btn-header').remove());

// The phone's status bar takes the color of the bar above the game, in both themes.
function applyTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]').content = bg;
}
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
addEventListener('load', applyTheme);
applyTheme();

const effectsLabel = () => `REDUCE EFFECTS: ${settings.reduceSwitch ? 'ON' : 'OFF'}`;

// Shown once per device (every visit if storage is blocked).
async function contentNote() {
  if (settings.noteSeen) return;
  await term.print(
    'NOTICE',
    '',
    'Zero Sum contains dramatic depictions of nuclear war.',
    'Made for 13 and up. Contains flashing lights.',
    '',
  );
  for (;;) {
    const v = await term.choose([
      { label: 'CONTINUE', value: 'go' },
      { label: effectsLabel(), value: 'effects' },
    ]);
    if (v === 'go') break;
    settings.setReduceSwitch(!settings.reduceSwitch);
    await term.print(settings.reduceSwitch ? 'Flashes, shaking and typing are off.' : 'Full effects are on.');
  }
  settings.markNoteSeen();
  term.clear();
}

async function dialIn() {
  await term.print('ATDT 0-100-200');
  audio.play('modem');
  await term.pause(2600);
  await term.print('CONNECT 1200', '', 'MERIDIAN STRATEGIC SIMULATION SYSTEM', 'ALL SESSIONS ARE SIMULATIONS', '');
  const name = await term.choose([{ label: 'GUEST', value: 'GUEST' }], {
    ask: { label: 'LOGON:', check: cleanName, error: 'NAMES ARE 3 TO 12 LETTERS. OR CHOOSE GUEST.' },
  });
  await term.print('', `GOOD EVENING, ${name}.`, '');
  return name;
}

const HOW_TO_PLAY = [
  'CRISIS',
  'Two blocs, one shared tension meter, 12 rounds. Each round a crisis card arrives.',
  'You and MERIDIAN pick a move at the same time:',
  '  TALK builds trust but costs a little standing at home. AID does both, more.',
  '  HOLD changes nothing. SIGNAL shows strength and raises tension.',
  '  STRIKE raises tension a lot and wrecks trust.',
  'Some threats are false alarms. VERIFY costs 1 standing and tells you which.',
  'A SIGNAL against a real threat is fair: it does not raise tension.',
  'Escalating over a false alarm costs trust. Letting a real threat pass costs standing.',
  'At 0 standing, your hardliners take over: no TALK or AID for 2 rounds, and trust collapses.',
  'Tension eases in any round where nobody raises it.',
  'From round 4, both sides TALK with trust 8 or more and tension 2 or less: a treaty.',
  'If tension reaches 6, the lights go out for everyone. Peace always scores more.',
  '',
  'INTERCEPT',
  'Tap the sky to set off a burst. Every trace inside the ring is stopped.',
  'Your interceptors refill over time. SCAN once a wave to spot the decoys.',
  'A fast reflex game: it has no screen-reader version. Crisis is fully playable without sight.',
  '',
  'KEYS',
  'Type a command or its number, or use the arrow keys and Enter. M mutes.',
];

async function showScores() {
  for (const [game, title] of [['crisis', 'CRISIS'], ['intercept', 'INTERCEPT']]) {
    const list = scores.list(game);
    await term.print(`${title} HIGH SCORES`);
    await term.print(...(list.length ? list.map((s, i) => `${String(i + 1).padStart(2)}. ${s.name.padEnd(12)} ${String(s.score).padStart(6)}`) : ['  NONE YET']));
    await term.print('');
  }
}

async function about() {
  const lines = [
    'ZERO SUM',
    'An original game. Free software under the MIT license.',
    { text: 'Source code', href: SOURCE },
    'Nothing you do here leaves this device.',
  ];
  if (apple && !installed) lines.push('To install on iPhone or iPad: tap Share, then Add to Home Screen.');
  await term.print(...lines, '');
}

let crisisDataPromise = null;
let mapView = null;
const crisisData = () => (crisisDataPromise ??= loadCrisisData());

async function menu(name) {
  for (;;) {
    await term.print('GAMES AVAILABLE:');
    const options = [
      { label: 'CRISIS', value: 'crisis' },
      { label: 'INTERCEPT', value: 'intercept' },
      { label: 'HOW TO PLAY', value: 'how' },
      { label: 'SCORES', value: 'scores' },
      { label: 'ABOUT', value: 'about' },
      { label: effectsLabel(), value: 'effects' },
    ];
    if (installPrompt) options.push({ label: 'INSTALL AS AN APP', value: 'install' });
    if (updateWaiting) options.push({ label: 'UPDATE THE GAME', value: 'update' });
    const choice = await term.choose(options);
    term.clear();
    if (choice === 'crisis') {
      const data = await crisisData();
      mapView ??= new MapView($('map'), data.map, { reduced: () => settings.reduced });
      await playCrisis({ term, mapView, panel: $('crisis-panel'), meters: $('meters'), mapText: $('map-text'), scores, name }, data);
      term.clear();
    } else if (choice === 'intercept') {
      await term.print(`INTERCEPT IS NOT LOADED ON THIS SYSTEM YET, ${name}.`, 'CHECK BACK SOON.', '');
    } else if (choice === 'how') {
      await term.print(...HOW_TO_PLAY, '');
    } else if (choice === 'scores') {
      await showScores();
    } else if (choice === 'about') {
      await about();
    } else if (choice === 'effects') {
      settings.setReduceSwitch(!settings.reduceSwitch);
    } else if (choice === 'install') {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
    } else if (choice === 'update') {
      reloadOnUpdate = true;
      updateWaiting.postMessage('skip-waiting');
      return;
    }
  }
}

await contentNote();
await menu(await dialIn());
