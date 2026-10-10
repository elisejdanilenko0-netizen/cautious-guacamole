/* Эффекты: частицы, всплывающий текст, тряска экрана */
import { TAU, rand, clamp } from './util.js';

class Particle {
  constructor() { this.dead = true; }
  spawn(o) {
    Object.assign(this, o);
    this.dead = false;
    this.life = 0;
    return this;
  }
}

export class FX {
  constructor() {
    this.pool = [];
    this.texts = [];
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;
  }

  get(o) {
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].dead) return this.pool[i].spawn(o);
    }
    const p = new Particle().spawn(o);
    if (this.pool.length < 700) this.pool.push(p);
    return p;
  }

  shake(amount) { this.trauma = clamp(this.trauma + amount, 0, 1); }
  screenFlash(v) { this.flash = Math.max(this.flash, v); }

  /* ---------- генераторы ---------- */
  spark(x, y, color, opts = {}) {
    const a = opts.angle !== undefined ? opts.angle : rand(0, TAU);
    const sp = opts.speed !== undefined ? opts.speed : rand(60, 260);
    this.get({
      kind: 'spark', x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      grav: opts.grav ?? 320,
      drag: opts.drag ?? 2.4,
      size: opts.size ?? rand(1.6, 3.4),
      color, ttl: opts.ttl ?? rand(0.3, 0.7),
      glow: opts.glow ?? true,
    });
  }

  burst(x, y, color, n = 18, opts = {}) {
    for (let i = 0; i < n; i++) this.spark(x, y, color, opts);
  }

  ring(x, y, color, r0 = 4, r1 = 90, ttl = 0.45, width = 3) {
    this.get({ kind: 'ring', x, y, r0, r1, color, ttl, width });
  }

  glow(x, y, color, r = 30, ttl = 0.35) {
    this.get({ kind: 'glow', x, y, r, color, ttl, vx: 0, vy: 0, grav: 0, drag: 0, size: r });
  }

  shard(x, y, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(90, 320);
      this.get({
        kind: 'shard', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: rand(0, TAU), vr: rand(-9, 9),
        grav: 500, drag: 1.2,
        size: rand(3, 7), color, ttl: rand(0.5, 1.1),
      });
    }
  }

  text(x, y, str, color = '#fff', size = 18) {
    this.texts.push({ x, y, str, color, size, life: 0, ttl: 0.85, vy: -70, vx: rand(-18, 18) });
  }

  update(dt) {
    // тряска
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const s = this.trauma * this.trauma;
    const mag = s * 26;
    this.shakeX = rand(-mag, mag);
    this.shakeY = rand(-mag, mag);
    this.flash = Math.max(0, this.flash - dt * 3);

    for (const p of this.pool) {
      if (p.dead) continue;
      p.life += dt;
      if (p.life >= p.ttl) { p.dead = true; continue; }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy *= k;
      }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt;
      t.y += t.vy * dt; t.x += t.vx * dt;
      t.vy *= Math.exp(-2.2 * dt);
      if (t.life >= t.ttl) this.texts.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const p of this.pool) {
      if (p.dead) continue;
      const k = p.life / p.ttl;
      const a = 1 - k;
      ctx.globalAlpha = a;

      if (p.kind === 'spark') {
        const len = 1 + Math.hypot(p.vx, p.vy) * 0.012;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * a;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.014 * len, p.y - p.vy * 0.014 * len);
        ctx.stroke();
      } else if (p.kind === 'ring') {
        const r = p.r0 + (p.r1 - p.r0) * k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
      } else if (p.kind === 'glow') {
        const r = p.r * (0.6 + k * 1.6);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-p.size, -p.size * 0.6);
        ctx.lineTo(p.size, 0);
        ctx.lineTo(-p.size * 0.7, p.size * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // текст
    ctx.globalCompositeOperation = 'source-over';
    for (const t of this.texts) {
      const k = t.life / t.ttl;
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      ctx.font = `800 ${t.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fff';
      ctx.fillText(t.str, t.x, t.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  clear() {
    for (const p of this.pool) p.dead = true;
    this.texts.length = 0;
    this.trauma = 0;
    this.flash = 0;
  }
}
