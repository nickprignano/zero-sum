// Draws Intercept on a canvas: the sky, the coast and its city skylines, falling traces, burst
// rings, and the effects of a city hit (a local glow, a shockwave, a short shake, the skyline
// breaking apart and a column of glowing smoke that spreads into a cloud). Everything is lines,
// glow and particles: no bitmaps. Glow is a wide faint stroke under a thin bright one with
// 'lighter' blending, never shadowBlur, which is slow on iPhones. With effects reduced, only the
// rings, traces and cities are drawn.

import { burstRadius, scanning, tracePos } from './game.js';

const MAX_PARTICLES = 200;
const SKY_TOP = [[6, 18, 42], [40, 18, 8]];
const SKY_BOTTOM = [[10, 30, 60], [70, 30, 10]];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// A city skyline as rectangles [dx, height, width], the same for a city every time.
function skyline(i) {
  let s = i * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 5 }, (_, k) => [-30 + k * 12, 14 + Math.round(r() * 34), 10]);
}

export class SkyView {
  constructor(canvas, { reduced = () => false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.particles = [];
    this.shakeUntil = 0;
    this.lost = 0;
    this.shown = 0;
  }

  layout(config) {
    const { canvas } = this;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    this.scale = Math.min(w / config.width, h / config.height);
    this.ratio = ratio;
    this.offset = [(w - config.width * this.scale) / 2, (h - config.height * this.scale) / 2];
  }

  // Page coordinates (CSS px inside the canvas) to playfield units.
  toField(px, py) {
    return [(px - this.offset[0]) / this.scale, (py - this.offset[1]) / this.scale];
  }

  // React to what the game reported this frame.
  effects(state, now) {
    const fx = !this.reduced();
    for (const e of state.events) {
      if (e.type !== 'city' || !fx) continue;
      this.shakeUntil = now + 400;
      const index = state.cities.findIndex((c) => c.x === e.x);
      for (const [dx, h, w] of skyline(index)) {
        for (const [ax, ay, bx, by] of [[0, 0, 0, -h], [0, -h, w, -h], [w, -h, w, 0]]) {
          this.add({ kind: 'segment', x: e.x + dx, y: e.y, ax, ay, bx, by, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, spin: (Math.random() - 0.5) * 4, life: 1.6 });
        }
      }
      for (let i = 0; i < 40; i++) {
        this.add({ kind: 'smoke', x: e.x + (Math.random() - 0.5) * 16, y: e.y, vx: 0, vy: -90 - Math.random() * 60, top: e.y - 220 - Math.random() * 60, spread: (Math.random() - 0.5) * 160, r: 6 + Math.random() * 10, life: 4 + Math.random() * 2 });
      }
      this.add({ kind: 'shock', x: e.x, y: e.y, life: 0.8 });
    }
    this.lost = 1 - state.cities.filter((c) => c.alive).length / state.cities.length;
  }

  add(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ age: 0, rot: 0, ...p });
  }

  draw(state, now, dt) {
    const { ctx, canvas, scale, ratio, offset } = this;
    if (!scale) return;
    const { config } = state;
    const fx = !this.reduced();

    // The sky fades toward dark orange as cities fall, never in a sudden cut.
    this.shown += Math.sign(this.lost - this.shown) * Math.min(Math.abs(this.lost - this.shown), dt / 0.6);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, `rgb(${mix(SKY_TOP[0], SKY_TOP[1], this.shown)})`);
    sky.addColorStop(1, `rgb(${mix(SKY_BOTTOM[0], SKY_BOTTOM[1], this.shown)})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let sx = 0;
    let sy = 0;
    if (fx && now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 400;
      sx = (Math.random() - 0.5) * 10 * k;
      sy = (Math.random() - 0.5) * 10 * k;
    }
    ctx.setTransform(scale * ratio, 0, 0, scale * ratio, (offset[0] + sx) * ratio, (offset[1] + sy) * ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const glowLine = (rgb, width, alpha = 1) => {
      if (fx) {
        ctx.strokeStyle = `rgba(${rgb}, ${0.18 * alpha})`;
        ctx.lineWidth = width * 4;
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    ctx.globalCompositeOperation = 'lighter';

    // Local glows from city hits: never more than a quarter of the playfield, fading out.
    for (const g of state.glows) {
      const age = state.time - g.t0;
      if (age > 0.6) continue;
      const a = 0.55 * (1 - age / 0.6);
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.radius);
      grad.addColorStop(0, `rgba(255, 240, 210, ${a})`);
      grad.addColorStop(1, 'rgba(255, 240, 210, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(g.x - g.radius, g.y - g.radius, g.radius * 2, g.radius * 2);
    }

    // Coast and cities.
    ctx.beginPath();
    ctx.moveTo(0, config.cityY + 8);
    for (let x = 0; x <= config.width; x += 50) ctx.lineTo(x, config.cityY + 8 + ((x * 7) % 11) - 5);
    glowLine('75, 255, 122', 1.5, 0.7);
    state.cities.forEach((city, i) => {
      if (!city.alive) {
        ctx.beginPath();
        ctx.moveTo(city.x - 32, config.cityY);
        ctx.lineTo(city.x + 30, config.cityY);
        glowLine('120, 120, 120', 1.5, 0.5);
        return;
      }
      ctx.beginPath();
      for (const [dx, h, w] of skyline(i)) {
        ctx.moveTo(city.x + dx, config.cityY);
        ctx.lineTo(city.x + dx, config.cityY - h);
        ctx.lineTo(city.x + dx + w, config.cityY - h);
        ctx.lineTo(city.x + dx + w, config.cityY);
      }
      glowLine('75, 255, 122', 1.5);
    });

    // Traces. Decoys turn dotted when close, and SCAN marks them early.
    const scan = scanning(state);
    for (const trace of state.traces) {
      const { p, x, y } = tracePos(trace, state.time);
      const decoyShown = trace.kind === 'decoy' && (p >= config.decoyReveal || scan);
      ctx.beginPath();
      ctx.moveTo(trace.x0, trace.y0);
      ctx.lineTo(x, y);
      ctx.setLineDash(decoyShown ? [3, 7] : []);
      glowLine(decoyShown ? '140, 170, 210' : '255, 200, 120', 1.2, decoyShown ? 0.7 : 0.9);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = decoyShown ? 'rgba(140, 170, 210, 0.9)' : 'rgba(255, 240, 210, 1)';
      ctx.fill();
    }

    // Burst rings.
    for (const b of state.bursts) {
      const r = burstRadius(b, state.time, config);
      if (r <= 0) continue;
      const fade = Math.min(1, (config.burst.lifeSeconds - (state.time - b.t0)) / 0.3);
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160, 230, 255, ${0.08 * fade})`;
      ctx.fill();
      glowLine('160, 230, 255', 2, fade);
    }

    // Particles: shockwaves, falling skyline pieces, smoke.
    if (fx) {
      this.particles = this.particles.filter((p) => (p.age += dt) < p.life);
      for (const p of this.particles) {
        const k = p.age / p.life;
        if (p.kind === 'shock') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 20 + k * 200, Math.PI, Math.PI * 2);
          glowLine('255, 220, 170', 2, 1 - k);
        } else if (p.kind === 'segment') {
          p.vy += 220 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt;
          const c = Math.cos(p.rot);
          const s = Math.sin(p.rot);
          ctx.beginPath();
          ctx.moveTo(p.x + p.ax * c - p.ay * s, p.y + p.ax * s + p.ay * c);
          ctx.lineTo(p.x + p.bx * c - p.by * s, p.y + p.bx * s + p.by * c);
          glowLine('75, 255, 122', 1.2, 1 - k);
        } else {
          // Smoke rises in a column, then spreads into a cloud at the top.
          if (p.y > p.top) p.y += p.vy * dt;
          else p.x += p.spread * dt * 0.5;
          const r = p.r * (1 + k * 2.5);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 150, 90, ${0.07 * (1 - k)})`;
          ctx.fill();
        }
      }
    } else {
      this.particles = [];
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
