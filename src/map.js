// Draws the invented continent on a canvas: regions in glowing lines (solid for the Ember Compact,
// dashed for the Tidewater League, so colorblind players can tell them apart), city dots, a pulse
// on the region where the crisis is, and cities going dark one at a time when the lights go out.
// Glow is a wide faint stroke under a thin bright one, not shadowBlur, which is slow on phones.

const COLORS = { ember: '255, 179, 71', tidewater: '90, 209, 255' };
const DASH = { ember: [], tidewater: [7, 5] };
const PULSE_MS = 1400;
const DARK_STEP_MS = 140;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class MapView {
  constructor(canvas, map, { reduced = () => false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.reduced = reduced;
    this.focus = -1;
    this.darkCities = new Set();
    this.pulseStart = 0;
    new ResizeObserver(() => this.layout()).observe(canvas);
  }

  layout() {
    const { canvas, map } = this;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const scale = Math.min(w / map.width, h / map.height);
    this.transform = [scale * ratio, (w - map.width * scale) / 2 * ratio, (h - map.height * scale) / 2 * ratio];
    this.draw();
  }

  reset() {
    this.focus = -1;
    this.darkCities.clear();
    this.draw();
  }

  // Point at the region where the crisis is, with a pulse unless effects are reduced.
  show(region) {
    this.focus = region;
    this.pulseStart = performance.now();
    if (this.reduced()) return this.draw();
    const frame = (now) => {
      this.draw(now);
      if (now - this.pulseStart < PULSE_MS && this.focus === region) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // The lights go out: every city goes dark, one at a time (all at once with reduced effects).
  async lightsOut() {
    const cities = this.map.regions.flatMap((r, i) => r.cities.map((_, j) => `${i}:${j}`));
    for (const id of cities) {
      this.darkCities.add(id);
      if (!this.reduced()) {
        this.draw();
        await sleep(DARK_STEP_MS);
      }
    }
    this.draw();
  }

  draw(now = performance.now()) {
    const { ctx, canvas, map, transform } = this;
    if (!transform) return;
    const [s, ox, oy] = transform;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    const glow = !this.reduced();

    map.regions.forEach((region, i) => {
      const rgb = COLORS[region.bloc];
      const lit = i === this.focus;
      ctx.beginPath();
      region.points.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = `rgba(${rgb}, ${lit ? 0.22 : 0.06})`;
      ctx.fill();
      ctx.setLineDash(DASH[region.bloc]);
      if (glow) {
        ctx.strokeStyle = `rgba(${rgb}, 0.18)`;
        ctx.lineWidth = 7;
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${rgb}, ${lit ? 1 : 0.75})`;
      ctx.lineWidth = lit ? 2.5 : 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      region.cities.forEach(([x, y], j) => {
        const dark = this.darkCities.has(`${i}:${j}`);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        if (dark) {
          ctx.strokeStyle = 'rgba(120, 120, 120, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          if (glow) {
            ctx.fillStyle = `rgba(${rgb}, 0.25)`;
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
          }
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fill();
        }
      });
    });

    if (this.focus >= 0) {
      const region = map.regions[this.focus];
      const [cx, cy] = centroid(region.points);
      const rgb = COLORS[region.bloc];
      const t = (now - this.pulseStart) / PULSE_MS;
      if (glow && t < 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, 20 + t * 90, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb}, ${0.8 * (1 - t)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = '600 22px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.fillText(region.name.toUpperCase(), cx, cy - 34);
    }
  }
}

function centroid(points) {
  const n = points.length;
  return [points.reduce((a, p) => a + p[0], 0) / n, points.reduce((a, p) => a + p[1], 0) / n];
}
