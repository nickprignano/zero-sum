// Runs one Intercept game on the page: the frame loop, taps and keys, pause, the control bar and
// sounds. The rules are in game.js and the drawing in draw.js.

import { newSeed } from '../crisis/rng.js';
import { citiesStanding, newGame, scan, startWave, step, STEP, tap } from './game.js';
import { SkyView } from './draw.js';

const BETWEEN_SECONDS = 2.5;
const HOLD_SECONDS = 3;
const MIN_BURST_PX = 22; // a ring at least 44 CSS px across, the size of a fingertip target

// ui = { root, canvas, scanButton, pauseButton, quitButton, status, audio, settings }
// Resolves with { score, wave, kept, quit } when the game ends.
export function playIntercept(ui, landscape, { handover = null, seed = newSeed() } = {}) {
  const { root, canvas, audio, settings } = ui;
  root.hidden = false;
  document.documentElement.classList.add('intercepting');
  // A portrait phone gets a tall field, so the sky fills the screen. It keeps its shape for the
  // whole game, scaled to fit, if the phone turns.
  const config = canvas.clientHeight > canvas.clientWidth ? { ...landscape, ...landscape.portrait } : landscape;
  const state = newGame(seed, config, { handover, effects: !settings.reduced });
  const view = new SkyView(canvas, { reduced: () => settings.reduced });
  let paused = false;
  let resumeAt = 0; // a countdown before play goes on after a pause
  let betweenUntil = 0;
  let overAt = 0;
  let last = 0;
  let banner = '';
  let frame = 0;
  let carry = 0;
  let hiddenPause = false;

  ui.quitButton.textContent = handover ? 'SKIP' : 'QUIT';
  view.layout(config);

  return new Promise((done) => {
    const now = () => performance.now() / 1000;
    betweenUntil = now() + 1;
    banner = handover ? 'INCOMING' : 'WAVE 1';

    const finish = (quit) => {
      cancelAnimationFrame(frame);
      // Skipping the hand-over wave plays the rest of it out unseen, with no more taps, so the
      // cities-kept count is honest.
      if (handover && state.phase === 'between') startWave(state);
      if (handover) for (let i = 0; i < 60 * 600 && state.phase === 'wave'; i++) step(state);
      for (const [target, type, fn] of listeners) target.removeEventListener(type, fn);
      root.hidden = true;
      document.documentElement.classList.remove('intercepting');
      done({ score: state.score, wave: state.wave, kept: citiesStanding(state), quit });
    };

    const setPaused = (value) => {
      if (state.phase === 'over') return;
      if (value) {
        paused = true;
      } else if (paused) {
        paused = false;
        resumeAt = now() + 3;
      }
      ui.pauseButton.textContent = paused ? 'RESUME' : 'PAUSE';
    };

    const playing = () => !paused && now() >= resumeAt && state.phase === 'wave';

    const onTap = (event) => {
      event.preventDefault();
      audio.unlock();
      if (!playing()) return;
      const rect = canvas.getBoundingClientRect();
      const [x, y] = view.toField(event.clientX - rect.left, event.clientY - rect.top);
      tap(state, x, Math.min(y, config.cityY - 10), MIN_BURST_PX / view.scale);
    };
    const doScan = () => playing() && scan(state);
    const onKey = (event) => {
      const key = event.key.toLowerCase();
      if (key === 's') doScan();
      if (key === 'p' || key === 'escape') {
        hiddenPause = false;
        setPaused(!paused);
      }
    };
    // Leaving the tab pauses; coming back resumes after the countdown.
    const onVisibility = () => {
      if (document.hidden && !paused) {
        hiddenPause = true;
        setPaused(true);
      } else if (!document.hidden && hiddenPause) {
        hiddenPause = false;
        setPaused(false);
      }
    };
    const onResize = () => view.layout(config);

    const listeners = [
      [canvas, 'pointerdown', onTap],
      [ui.scanButton, 'click', doScan],
      [ui.pauseButton, 'click', () => setPaused(!paused)],
      [ui.quitButton, 'click', () => finish(true)],
      [document, 'keydown', onKey],
      [document, 'visibilitychange', onVisibility],
      [globalThis, 'resize', onResize],
    ];
    for (const [target, type, fn] of listeners) target.addEventListener(type, fn);
    ui.pauseButton.textContent = 'PAUSE';

    const sounds = () => {
      for (const e of state.events) {
        if (e.type === 'launch') audio.play('launch');
        if (e.type === 'city') audio.play('boom');
        if (e.type === 'wave') audio.play('siren');
      }
    };

    const showStatus = () => {
      const pool = Math.floor(state.pool);
      const text = handover
        ? `INTERCEPTORS ${pool} · CITIES ${citiesStanding(state)} OF ${config.cities}`
        : `WAVE ${Math.max(1, state.wave)} · SCORE ${state.score} · INTERCEPTORS ${pool}`;
      if (ui.status.textContent !== text) ui.status.textContent = text;
      ui.scanButton.disabled = state.scanUsed || state.phase !== 'wave';
    };

    const tick = () => {
      const t = now();
      const dt = Math.min(0.1, last ? t - last : 0);
      last = t;
      state.effects = !settings.reduced; // a mid-game change to Reduce effects applies at once
      state.events = [];

      if (!paused && t >= resumeAt) {
        if (state.phase === 'between' && t >= betweenUntil) {
          startWave(state);
          banner = '';
        } else if (state.phase === 'wave') {
          // Fixed steps of game time, at most 5 a frame so a slow phone slows down, not skips.
          carry = Math.min(carry + dt, STEP * 5);
          while (carry >= STEP && state.phase === 'wave') {
            step(state);
            carry -= STEP;
          }
          const ended = state.events.find((e) => e.type === 'wave-end');
          if (ended) {
            betweenUntil = t + BETWEEN_SECONDS;
            banner = `WAVE ${ended.wave} HELD · +${ended.points}${ended.rebuilt ? ' · STEADY HANDS: A CITY IS REBUILT' : ''}`;
          }
          if (state.phase === 'over') {
            overAt = t;
            banner = handover ? '' : 'THE LAST CITY HAS FALLEN';
          }
        }
      }
      // Between waves, the next wave's banner shows near the end of the pause.
      if (state.phase === 'between' && betweenUntil - t < 1 && state.wave > 0) banner = `WAVE ${state.wave + 1}`;

      sounds();
      view.effects(state, t * 1000);
      view.draw(state, t * 1000, paused ? 0 : dt);
      const overlay = paused ? 'PAUSED' : t < resumeAt ? String(Math.ceil(resumeAt - t)) : banner;
      if (overlay) drawBanner(canvas, overlay);
      showStatus();

      // After the last city, hold on the dark coast with the smoke drifting, then hand back.
      if (state.phase === 'over' && t - overAt > HOLD_SECONDS) return finish(false);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
}

function drawBanner(canvas, text) {
  const ctx = canvas.getContext('2d');
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const w = canvas.clientWidth;
  const size = Math.max(14, Math.min(28, w / 28));
  ctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(75, 255, 122, 0.95)';
  ctx.fillText(text, w / 2, canvas.clientHeight * 0.35, w - 32);
}
