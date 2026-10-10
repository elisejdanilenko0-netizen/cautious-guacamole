/* ============================================================
   NEON DRIFT — игровое ядро
   Вертикальный неоновый раннер: веди корабль пальцем,
   собирай энергию, уходи в Овердрайв.
   ============================================================ */
import {
  TAU, clamp, lerp, rand, randInt, pick, approach,
  circleRect, circleRectDist, buzz,
} from './util.js';
import { FX } from './fx.js';

const REF = 420;               // ширина, под которую свёрстан игровой мир
const COL = {
  cyan: '#35e6ff',
  magenta: '#ff2fd0',
  violet: '#8a5cff',
  yellow: '#ffe14d',
  green: '#4dffb0',
  red: '#ff3b5c',
  white: '#ffffff',
};

export const STATE = { MENU: 'menu', PLAY: 'play', DYING: 'dying', OVER: 'over' };

export class Game {
  constructor(canvas, audio, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = audio;
    this.ui = ui;
    this.fx = new FX();
    this.state = STATE.MENU;

    this.w = 0; this.h = 0; this.S = 1; this.dpr = 1;
    this.timeScale = 1;
    this.paused = false;

    this.ship = { x: 0, y: 0, r: 14, tx: 0, vx: 0, tilt: 0 };
    this.ents = [];
    this.stars = [];
    this.speedLines = [];
    this.bgGrad = null;

    this.best = Number(localStorage.getItem('neondrift.best') || 0);
    this.soundOn = localStorage.getItem('neondrift.sound') !== '0';

    this.reset();
    this._buildStars();
  }

  /* ------------------------- размеры ------------------------- */
  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.S = clamp(w / REF, 0.55, 2.4);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.ship.r = 15 * this.S;
    this.ship.y = h * 0.78;
    if (this.ship.x === 0) { this.ship.x = w / 2; this.ship.tx = w / 2; }
    this.ship.x = clamp(this.ship.x, this.ship.r, w - this.ship.r);
    this.ship.tx = clamp(this.ship.tx, this.ship.r, w - this.ship.r);

    const g = this.ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b0a3d');
    g.addColorStop(0.45, '#0a0520');
    g.addColorStop(1, '#04020b');
    this.bgGrad = g;

    // кэшируем градиенты, которые нужны каждый кадр
    const hg = this.ctx.createLinearGradient(0, 0, 0, h * 0.34);
    hg.addColorStop(0, 'rgba(120,60,255,0.30)');
    hg.addColorStop(1, 'rgba(120,60,255,0)');
    this.horizonGrad = hg;

    const vg = this.ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    this.vignette = vg;

    this._buildStars();
  }

  _buildStars() {
    const n = Math.round((this.w * this.h) / 9000);
    this.stars = [];
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        z: rand(0.15, 1),
        s: rand(0.6, 2.0),
      });
    }
    this.speedLines = [];
    for (let i = 0; i < 26; i++) {
      this.speedLines.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        len: rand(0.04, 0.16) * this.h,
        z: rand(0.4, 1.2),
      });
    }
  }

  /* ------------------------- сброс ------------------------- */
  reset() {
    this.t = 0;
    this.dist = 0;
    this.score = 0;
    this.shownScore = 0;
    this.orbs = 0;
    this.lives = 3;
    this.combo = 0;
    this.comboTimer = 0;
    this.charge = 0;
    this.odTimer = 0;
    this.shield = false;
    this.shieldTimer = 0;
    this.magnetTimer = 0;
    this.slowTimer = 0;
    this.invuln = 0;
    this.sinceSpawn = 0;
    this.spawnCount = 0;
    this.ents.length = 0;
    this.fx.clear();
    this.timeScale = 1;
    this.deathT = 0;
    this.ship.tx = this.w / 2;
    this.ship.x = this.w / 2;
    this.ship.vx = 0;
    this.ship.tilt = 0;
    this.streakBest = 0;
    this.hitFlash = 0;
    this.beatBest = false;
    this.syncHud(true);
  }

  start() {
    this.reset();
    this.state = STATE.PLAY;
    this.audio.resume();
    this.audio.startMusic();
    this.audio.ui();
    buzz(12);
  }

  toMenu() {
    this.state = STATE.MENU;
    this.reset();
  }

  /* ------------------------- управление ------------------------- */
  setTarget(x) {
    if (this.state !== STATE.PLAY) return;
    this.ship.tx = clamp(x, this.ship.r + 2, this.w - this.ship.r - 2);
  }
  nudgeTarget(dx) {
    this.setTarget(this.ship.tx + dx);
  }

  triggerOverdrive() {
    if (this.state !== STATE.PLAY || this.charge < 100 || this.odTimer > 0) return;
    this.charge = 0;
    this.odTimer = 3.4;
    this.audio.overdrive();
    this.fx.shake(0.5);
    this.fx.screenFlash(0.8);
    this.fx.ring(this.ship.x, this.ship.y, COL.cyan, 10, this.w * 1.2, 0.7, 6);
    this.fx.burst(this.ship.x, this.ship.y, COL.cyan, 40, { speed: rand(120, 520), ttl: 0.8 });
    this.fx.text(this.ship.x, this.ship.y - 60 * this.S, 'ОВЕРДРАЙВ!', COL.cyan, 26 * this.S);
    buzz([18, 30, 18]);
  }

  /* ------------------------- обновление ------------------------- */
  update(rawDt) {
    const dt = Math.min(rawDt, 1 / 30) * this.timeScale;

    if (this.state === STATE.DYING) {
      this.deathT += rawDt;
      this.timeScale = approach(this.timeScale, 0.15, 3, rawDt);
      this._updateEnts(dt, true);
      this.fx.update(dt);
      this._updateStars(dt);
      if (this.deathT > 1.15) {
        this.state = STATE.OVER;
        this.audio.stopMusic();
        this.ui.showOver(this);
      }
      return;
    }

    if (this.state !== STATE.PLAY) {
      this.t += dt;
      this._updateStars(dt * 0.35);
      this.fx.update(dt);
      return;
    }

    this.t += dt;

    /* --- скорость и сложность --- */
    const diff = this.diff;
    const slowK = this.slowTimer > 0 ? 0.62 : 1;
    const odK = this.odTimer > 0 ? 1.42 : 1;
    this.speed = this.h * (0.44 + 0.40 * diff) * slowK * odK;
    this.dist += this.speed * dt;
    this.score += (this.speed * dt) * 0.055 * (this.odTimer > 0 ? 2 : 1);

    // только что побили собственный рекорд — скажем об этом
    if (!this.beatBest && this.best > 0 && this.score > this.best) {
      this.beatBest = true;
      this.fx.text(this.w / 2, this.h * 0.32, 'РЕКОРД ПОБИТ!', COL.yellow, 24 * this.S);
      this.fx.ring(this.ship.x, this.ship.y, COL.yellow, this.ship.r, 200 * this.S, 0.7, 4);
      this.audio.power();
    }

    /* --- таймеры --- */
    this.invuln = Math.max(0, this.invuln - dt);
    this.odTimer = Math.max(0, this.odTimer - dt);
    this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) this.shield = false;
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0 && this.combo > 0) this.combo = 0;
    }
    this.audio.setIntensity(diff + (this.odTimer > 0 ? 0.6 : 0));

    /* --- корабль --- */
    const sh = this.ship;
    const prevX = sh.x;
    sh.x = approach(sh.x, sh.tx, 15, dt);
    sh.vx = (sh.x - prevX) / Math.max(dt, 1e-4);
    sh.tilt = approach(sh.tilt, clamp(sh.vx / (900 * this.S), -1, 1), 12, dt);
    sh.y = this.h * 0.78 + Math.sin(this.t * 2.2) * 3 * this.S;

    // след двигателя
    const flame = this.odTimer > 0 ? COL.violet : COL.cyan;
    if (Math.random() < (this.odTimer > 0 ? 1 : 0.75)) {
      this.fx.spark(
        sh.x + rand(-3, 3) * this.S,
        sh.y + sh.r * 0.9,
        flame,
        { angle: Math.PI / 2 + rand(-0.35, 0.35), speed: rand(90, 240) * this.S, grav: -60, ttl: rand(0.18, 0.42), size: rand(1.4, 3.2) * this.S }
      );
    }
    if (this.odTimer > 0 && Math.random() < 0.5) {
      this.fx.spark(sh.x + rand(-10, 10) * this.S, sh.y, COL.magenta,
        { angle: rand(0, TAU), speed: rand(60, 200), grav: 0, ttl: 0.4, size: 2 * this.S });
    }

    /* --- спавн волн --- */
    this.sinceSpawn += this.speed * dt;
    const gap = this.h * lerp(0.92, 0.52, diff);
    if (this.sinceSpawn >= gap) {
      this.sinceSpawn = 0;
      this.spawnCount++;
      this._spawnWave();
    }

    /* --- столкновения и сбор --- */
    this._collide(dt);
    this._updateEnts(dt, false);
    this._updateStars(dt);

    /* --- фон --- */
    this.fx.update(dt);

    this.syncHud(false);
  }

  get diff() {
    return clamp(this.dist / (this.h * 62), 0, 1);
  }
  get comboMult() {
    return 1 + Math.min(Math.floor(this.combo / 5), 8) * 0.5;
  }

  /* ------------------------- сущности ------------------------- */
  _spawnWave() {
    const w = this.w, S = this.S, d = this.diff;
    const kinds = ['wall', 'wall', 'mines', 'wallorb'];
    if (d > 0.15) kinds.push('double', 'mines');
    if (d > 0.35) kinds.push('zigzag', 'orbline', 'double');
    if (d > 0.6) kinds.push('zigzag', 'wallorb', 'mines');
    const kind = pick(kinds);

    if (this.spawnCount % randInt(9, 14) === 0) this._spawnPower();

    switch (kind) {
      case 'wall':
        this._wall(0, lerp(0.46, 0.30, d));
        break;

      case 'wallorb': {
        const gw = lerp(0.44, 0.30, d);
        const gx = this._wall(0, gw);
        const n = randInt(3, 5);
        for (let i = 0; i < n; i++) {
          this.ents.push(this._orb(gx + lerp(-gw * w * 0.32, gw * w * 0.32, i / (n - 1)), -70 * S - i * 26 * S));
        }
        break;
      }

      case 'double': {
        const gap = this.h * 0.42;
        this._wall(0, lerp(0.44, 0.30, d));
        this._wall(-gap, lerp(0.44, 0.30, d), true);
        break;
      }

      case 'mines': {
        const n = randInt(2, d > 0.5 ? 4 : 3);
        for (let i = 0; i < n; i++) {
          this.ents.push(this._mine(rand(0.1, 0.9) * w, -40 * S - i * rand(55, 120) * S, d));
        }
        break;
      }

      case 'zigzag': {
        const n = randInt(3, 5);
        const dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) {
          const x = clamp(w / 2 + dir * (i - n / 2) * (w * 0.17), 40 * S, w - 40 * S);
          this.ents.push(this._mine(x, -40 * S - i * (this.h * 0.30), d, true));
          this.ents.push(this._orb(x + dir * w * 0.085, -40 * S - i * (this.h * 0.30) - this.h * 0.15));
        }
        break;
      }

      case 'orbline': {
        const n = 6, amp = rand(0.12, 0.26) * w, ph = rand(0, TAU);
        for (let i = 0; i < n; i++) {
          const x = clamp(w / 2 + Math.sin(ph + i * 0.65) * amp, 30 * S, w - 30 * S);
          this.ents.push(this._orb(x, -50 * S - i * 34 * S));
        }
        break;
      }
    }
  }

  _wall(yOff, gapFrac, forceOpp = false) {
    const w = this.w, S = this.S, d = this.diff;
    const gapW = gapFrac * w;
    let base = rand(gapW / 2 + 8 * S, w - gapW / 2 - 8 * S);
    if (forceOpp) {
      // вторая стена — подальше от предыдущей, чтобы траектория была интересной
      const last = this.ents.filter((e) => e.kind === 'wall').pop();
      if (last) {
        const alt = base < w / 2 ? base + w * 0.42 : base - w * 0.42;
        base = clamp(alt, gapW / 2 + 8 * S, w - gapW / 2 - 8 * S);
      }
    }
    const amp = lerp(0, 0.16 * w, d) * (Math.random() < 0.55 ? 1 : 0.35);
    const e = {
      kind: 'wall',
      y: -30 * S + yOff,
      th: Math.max(16 * S, 18 * S * (1 - d * 0.25)),
      base, gapW, amp,
      freq: rand(0.5, 1.1),
      phase: rand(0, TAU),
      gapX: base,
      grazed: false,
      hitDone: false,
    };
    this.ents.push(e);
    return base;
  }

  _mine(x, y, d, still = false) {
    const S = this.S, w = this.w;
    return {
      kind: 'mine',
      x: clamp(x, 26 * S, w - 26 * S),
      baseX: clamp(x, 26 * S, w - 26 * S),
      y,
      r: 15 * S,
      amp: still ? 0 : rand(0.04, 0.13) * w * (0.4 + d),
      freq: rand(0.6, 1.5),
      phase: rand(0, TAU),
      rot: rand(0, TAU),
      vr: rand(-2.2, 2.2),
      grazed: false,
    };
  }

  _orb(x, y) {
    const S = this.S;
    return {
      kind: 'orb',
      x: clamp(x, 20 * S, this.w - 20 * S),
      y,
      r: 9 * S,
      phase: rand(0, TAU),
      vx: 0, vy: 0,
    };
  }

  _spawnPower() {
    const S = this.S;
    const kind = pick(['shield', 'magnet', 'slow']);
    this.ents.push({
      kind: 'power', type: kind,
      x: rand(0.15, 0.85) * this.w,
      y: -60 * S,
      r: 15 * S,
      phase: rand(0, TAU),
    });
  }

  _updateEnts(dt, dying) {
    const sp = this.speed || this.h * 0.4;
    const sh = this.ship;
    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i];
      e.y += sp * dt;

      if (e.kind === 'wall') {
        e.gapX = e.base + Math.sin(this.t * e.freq * 2 + e.phase) * e.amp;
      } else if (e.kind === 'mine') {
        e.x = clamp(e.baseX + Math.sin(this.t * e.freq * 2 + e.phase) * e.amp, e.r, this.w - e.r);
        e.rot += e.vr * dt;
      } else if (e.kind === 'orb' || e.kind === 'power') {
        e.phase += dt * 4;
        // магнит / овердрайв притягивают добычу
        const pull = (this.magnetTimer > 0 ? 220 : 0) + (this.odTimer > 0 ? 320 : 0);
        if (pull > 0 && !dying) {
          const dx = sh.x - e.x, dy = sh.y - e.y;
          const dd = Math.hypot(dx, dy);
          if (dd < pull * this.S && dd > 1) {
            const f = (1 - dd / (pull * this.S)) * 900 * this.S * dt;
            e.x += (dx / dd) * f;
            e.y += (dy / dd) * f;
          }
        }
      }

      // пролетело мимо
      if (e.kind === 'orb' && e.y > this.h + 40 * this.S) {
        this.ents.splice(i, 1);
        if (!dying && this.combo > 0) { this.combo = 0; this.comboTimer = 0; }
        continue;
      }
      if (e.y > this.h + 80 * this.S) this.ents.splice(i, 1);
    }
  }

  _updateStars(dt) {
    const sp = this.speed || this.h * 0.3;
    for (const s of this.stars) {
      s.y += sp * s.z * 0.35 * dt;
      if (s.y > this.h + 4) { s.y = -4; s.x = Math.random() * this.w; }
    }
    for (const l of this.speedLines) {
      l.y += sp * l.z * (this.odTimer > 0 ? 3.2 : 1.1) * dt;
      if (l.y > this.h + l.len) { l.y = -l.len - rand(0, 200); l.x = Math.random() * this.w; }
    }
  }

  /* ------------------------- столкновения ------------------------- */
  _collide(dt) {
    const sh = this.ship, S = this.S;
    const invincible = this.invuln > 0 || this.odTimer > 0;

    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i];

      if (e.kind === 'wall') {
        const leftW = e.gapX - e.gapW / 2;
        const rightX = e.gapX + e.gapW / 2;
        const hitL = circleRect(sh.x, sh.y, sh.r, -20, e.y, leftW + 20, e.th);
        const hitR = circleRect(sh.x, sh.y, sh.r, rightX, e.y, this.w - rightX + 20, e.th);
        if ((hitL || hitR) && !e.hitDone) {
          if (this.odTimer > 0) {
            // овердрайв проламывает стену
            e.hitDone = true;
            this.fx.burst(sh.x, e.y + e.th / 2, COL.violet, 26, { speed: rand(100, 420) });
            this.fx.shake(0.25);
            this.addScore(120, sh.x, e.y, 'ПРОЛОМ +120', COL.violet);
            this.audio.hit();
            buzz(15);
            continue;
          }
          if (!invincible) { this._damage(); e.hitDone = true; continue; }
        }
        // «бритьё»
        if (!e.grazed && !e.hitDone) {
          const dl = circleRectDist(sh.x, sh.y, sh.r, -20, e.y, leftW + 20, e.th);
          const dr = circleRectDist(sh.x, sh.y, sh.r, rightX, e.y, this.w - rightX + 20, e.th);
          const d = Math.min(dl, dr);
          if (d > 0 && d < 14 * S && Math.abs(sh.y - (e.y + e.th / 2)) < e.th) {
            e.grazed = true;
            this._graze(sh.x, sh.y - 26 * S);
          }
        }
      } else if (e.kind === 'mine') {
        const dd = Math.hypot(sh.x - e.x, sh.y - e.y);
        if (dd < sh.r + e.r * 0.85) {
          if (this.odTimer > 0) {
            this.ents.splice(i, 1);
            this.fx.burst(e.x, e.y, COL.magenta, 24, { speed: rand(120, 420) });
            this.fx.ring(e.x, e.y, COL.magenta, 4, 70 * S, 0.4, 3);
            this.fx.shake(0.18);
            this.addScore(80, e.x, e.y, '+80', COL.magenta);
            this.audio.hit();
            buzz(12);
            continue;
          }
          if (!invincible) { this._damage(); this.ents.splice(i, 1); continue; }
        } else if (!e.grazed && dd < sh.r + e.r * 0.85 + 20 * S) {
          e.grazed = true;
          this._graze(sh.x, sh.y - 26 * S);
        }
      } else if (e.kind === 'orb') {
        if (Math.hypot(sh.x - e.x, sh.y - e.y) < sh.r + e.r + 6 * S) {
          this.ents.splice(i, 1);
          this.orbs++;
          this.combo++;
          this.comboTimer = 3.2;
          this.charge = Math.min(100, this.charge + 7.5);
          const pts = Math.round(25 * this.comboMult);
          this.score += pts;
          if (this.combo > 0 && this.combo % 5 === 0) {
            this.fx.text(sh.x, sh.y - 40 * S, `x${this.comboMult.toFixed(1)}`, COL.yellow, 20 * S);
          }
          this.fx.burst(e.x, e.y, COL.yellow, 12, { speed: rand(60, 220), ttl: 0.45, grav: 120 });
          this.fx.ring(e.x, e.y, COL.yellow, 2, 34 * S, 0.3, 2);
          this.audio.pickup(this.combo);
          buzz(8);
        }
      } else if (e.kind === 'power') {
        if (Math.hypot(sh.x - e.x, sh.y - e.y) < sh.r + e.r + 6 * S) {
          this.ents.splice(i, 1);
          this._applyPower(e.type, e.x, e.y);
        }
      }
    }
  }

  _applyPower(type, x, y) {
    const S = this.S;
    this.audio.power();
    this.fx.ring(x, y, COL.green, 4, 90 * S, 0.5, 4);
    this.fx.burst(x, y, COL.green, 24, { speed: rand(80, 320) });
    buzz([10, 20]);
    if (type === 'shield') { this.shield = true; this.shieldTimer = 22; this.fx.text(x, y, 'ЩИТ', COL.cyan, 22 * S); }
    if (type === 'magnet') { this.magnetTimer = 9; this.fx.text(x, y, 'МАГНИТ', COL.violet, 22 * S); }
    if (type === 'slow') { this.slowTimer = 6; this.fx.text(x, y, 'ЗАМЕДЛЕНИЕ', COL.green, 20 * S); }
    this.score += 60;
  }

  _graze(x, y) {
    this.score += 15;
    this.charge = Math.min(100, this.charge + 1.5);
    this.combo++;
    this.comboTimer = 3.2;
    this.fx.text(x, y, 'БРИТЬЁ +15', COL.cyan, 15 * this.S);
    this.fx.spark(x, y, COL.cyan, { angle: rand(-2.6, -0.5), speed: rand(60, 180), ttl: 0.3 });
    this.audio.graze();
  }

  addScore(pts, x, y, label, color) {
    this.score += pts;
    if (label) this.fx.text(x, y, label, color, 18 * this.S);
  }

  _damage() {
    const S = this.S, sh = this.ship;
    if (this.shield) {
      this.shield = false;
      this.shieldTimer = 0;
      this.invuln = 1.1;
      this.fx.ring(sh.x, sh.y, COL.cyan, sh.r, 130 * S, 0.5, 5);
      this.fx.burst(sh.x, sh.y, COL.cyan, 34, { speed: rand(120, 420) });
      this.fx.text(sh.x, sh.y - 44 * S, 'ЩИТ ПОГЛОТИЛ', COL.cyan, 18 * S);
      this.fx.shake(0.45);
      this.audio.hit();
      buzz(30);
      return;
    }

    this.lives--;
    this.invuln = 2.0;
    this.combo = 0;
    this.comboTimer = 0;
    this.charge = Math.max(0, this.charge - 25);
    this.audio.hit();
    this.fx.shake(0.95);
    this.fx.screenFlash(1);
    this.hitFlash = 1;
    this.fx.burst(sh.x, sh.y, COL.red, 40, { speed: rand(150, 560) });
    this.fx.shard(sh.x, sh.y, COL.magenta, 8);
    this.fx.ring(sh.x, sh.y, COL.red, sh.r, 160 * S, 0.6, 6);
    buzz([40, 40, 60]);
    this.syncHud(true);

    if (this.lives <= 0) this._die();
  }

  _die() {
    const S = this.S, sh = this.ship;
    this.state = STATE.DYING;
    this.deathT = 0;
    this.fx.shake(1);
    this.fx.screenFlash(1);
    this.fx.burst(sh.x, sh.y, COL.cyan, 70, { speed: rand(120, 700), ttl: rand(0.5, 1.2) });
    this.fx.burst(sh.x, sh.y, COL.magenta, 50, { speed: rand(80, 520), ttl: rand(0.5, 1.2) });
    this.fx.shard(sh.x, sh.y, COL.white, 14);
    this.fx.ring(sh.x, sh.y, COL.white, 6, 260 * S, 0.9, 8);
    this.audio.gameover();
    buzz([60, 60, 120]);

    const final = Math.floor(this.score);
    const record = final > this.best;
    if (record) {
      this.best = final;
      localStorage.setItem('neondrift.best', String(this.best));
    }
    this.record = record;
  }

  /* ------------------------- HUD ------------------------- */
  syncHud(force) {
    const ui = this.ui;
    this.shownScore = force ? this.score : approach(this.shownScore, this.score, 14, 1 / 60);
    ui.setScore(Math.floor(this.shownScore));
    ui.setBest(this.best);
    ui.setLives(this.lives, 3);
    ui.setCharge(this.charge, this.odTimer > 0);
    ui.setCombo(this.combo, this.comboMult);
  }

  /* ------------------------- отрисовка ------------------------- */
  draw() {
    const ctx = this.ctx, w = this.w, h = this.h, S = this.S;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.bgGrad || '#05030f';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.fx.shakeX, this.fx.shakeY);

    this._drawBg(ctx);
    this._drawEnts(ctx);

    if (this.state === STATE.PLAY || this.state === STATE.DYING) {
      if (!(this.state === STATE.DYING && this.deathT > 0.12)) this._drawShip(ctx);
    }

    this.fx.draw(ctx);

    if (this.state === STATE.MENU) this._drawMenuShip(ctx);

    ctx.restore();

    // затемнение / вспышка при ударе
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - 0.06);
      ctx.fillStyle = `rgba(255,59,92,${this.hitFlash * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.fx.flash > 0) {
      ctx.fillStyle = `rgba(180,240,255,${this.fx.flash * 0.18})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.odTimer > 0) {
      const a = 0.10 + Math.sin(this.t * 18) * 0.03;
      ctx.fillStyle = `rgba(138,92,255,${Math.max(0, a)})`;
      ctx.fillRect(0, 0, w, h);
    }
    // виньетка
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, w, h);
  }

  _drawBg(ctx) {
    const w = this.w, h = this.h, S = this.S;

    // звёзды
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.stars) {
      ctx.globalAlpha = 0.25 + s.z * 0.6;
      ctx.fillStyle = s.z > 0.75 ? '#bfe9ff' : '#8f7ad6';
      ctx.fillRect(s.x, s.y, s.s * S, s.s * S * (1 + s.z));
    }
    ctx.restore();

    // сетка
    ctx.save();
    ctx.strokeStyle = 'rgba(120,90,220,0.16)';
    ctx.lineWidth = 1;
    const step = 58 * S;
    const off = (this.dist * 0.35) % step;
    ctx.beginPath();
    for (let y = -step + off; y < h + step; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    for (let x = 0; x <= w; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    ctx.stroke();
    ctx.restore();

    // линии скорости
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fast = this.odTimer > 0;
    for (const l of this.speedLines) {
      const a = (fast ? 0.55 : 0.16) * l.z;
      const g = ctx.createLinearGradient(0, l.y, 0, l.y + l.len);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, fast ? `rgba(160,220,255,${a})` : `rgba(120,140,255,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(l.x, l.y, 1.6 * S, l.len);
    }
    ctx.restore();

    // свечение сверху («горизонт»)
    ctx.fillStyle = this.horizonGrad;
    ctx.fillRect(0, 0, w, h * 0.34);
  }

  _drawEnts(ctx) {
    const w = this.w, S = this.S;
    for (const e of this.ents) {
      if (e.kind === 'wall') this._drawWall(ctx, e, w, S);
      else if (e.kind === 'mine') this._drawMine(ctx, e, S);
      else if (e.kind === 'orb') this._drawOrb(ctx, e, S);
      else if (e.kind === 'power') this._drawPower(ctx, e, S);
    }
  }

  _drawWall(ctx, e, w, S) {
    const leftW = e.gapX - e.gapW / 2;
    const rightX = e.gapX + e.gapW / 2;
    const y = e.y, th = e.th;
    const segs = [
      [-20, leftW + 20],
      [rightX, w - rightX + 20],
    ];
    ctx.save();
    for (const [x0, ww] of segs) {
      if (ww <= 0) continue;
      // тело
      const g = ctx.createLinearGradient(0, y, 0, y + th);
      g.addColorStop(0, '#3a1170');
      g.addColorStop(0.5, '#1b0a3c');
      g.addColorStop(1, '#3a1170');
      ctx.fillStyle = g;
      ctx.fillRect(x0, y, ww, th);

      // неоновая кромка
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(53,230,255,0.10)';
      ctx.fillRect(x0, y - 6 * S, ww, th + 12 * S);
      ctx.fillStyle = COL.cyan;
      ctx.fillRect(x0, y, ww, Math.max(1.5, 2 * S));
      ctx.fillRect(x0, y + th - Math.max(1.5, 2 * S), ww, Math.max(1.5, 2 * S));
      ctx.fillStyle = 'rgba(255,47,208,0.85)';
      ctx.fillRect(x0, y + th * 0.5 - 1 * S, ww, Math.max(1, 1.5 * S));
      ctx.globalCompositeOperation = 'source-over';
    }

    // маркеры края прохода
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = COL.magenta;
    const mw = 3 * S, mh = th * 1.5;
    ctx.fillRect(leftW - mw, y + th / 2 - mh / 2, mw, mh);
    ctx.fillRect(rightX, y + th / 2 - mh / 2, mw, mh);
    ctx.restore();
  }

  _drawMine(ctx, e, S) {
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);

    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.6);
    g.addColorStop(0, 'rgba(255,47,208,0.55)');
    g.addColorStop(1, 'rgba(255,47,208,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.rotate(e.rot);
    // шипы
    ctx.fillStyle = COL.magenta;
    ctx.beginPath();
    const spikes = 7;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU;
      const rr = i % 2 === 0 ? r * 1.42 : r * 0.92;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();

    // сердцевина
    const cg = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 1, 0, 0, r);
    cg.addColorStop(0, '#fff');
    cg.addColorStop(0.4, '#ff7ae0');
    cg.addColorStop(1, '#8a0d63');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _drawOrb(ctx, e, S) {
    const r = e.r * (1 + Math.sin(e.phase) * 0.12);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.2);
    g.addColorStop(0, 'rgba(255,225,77,0.85)');
    g.addColorStop(0.35, 'rgba(255,180,40,0.32)');
    g.addColorStop(1, 'rgba(255,180,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 3.2, 0, TAU); ctx.fill();

    ctx.fillStyle = '#fff9d6';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _drawPower(ctx, e, S) {
    const r = e.r * (1 + Math.sin(e.phase) * 0.1);
    const color = e.type === 'shield' ? COL.cyan : e.type === 'magnet' ? COL.violet : COL.green;
    const glyph = e.type === 'shield' ? '◈' : e.type === 'magnet' ? '⊂' : '◐';
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    ctx.rotate(Math.sin(e.phase * 0.5) * 0.3);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,5,30,0.9)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * S;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = `700 ${r * 1.1}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 0, r * 0.06);
    ctx.restore();
  }

  _drawShip(ctx) {
    const sh = this.ship, S = this.S, r = sh.r;
    const blink = this.invuln > 0 && this.odTimer <= 0 && Math.floor(this.t * 14) % 2 === 0;
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(sh.tilt * 0.35);
    if (blink) ctx.globalAlpha = 0.35;

    const main = this.odTimer > 0 ? COL.violet : COL.cyan;

    // свечение
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.4);
    g.addColorStop(0, this.odTimer > 0 ? 'rgba(180,140,255,0.75)' : 'rgba(53,230,255,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 3.4, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // корпус — стрелка
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.25);
    ctx.lineTo(r * 0.95, r * 0.72);
    ctx.quadraticCurveTo(0, r * 0.30, -r * 0.95, r * 0.72);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, -r, 0, r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.45, main);
    bg.addColorStop(1, '#1b0b45');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, 1.4 * S);
    ctx.stroke();

    // кабина
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.30, r * 0.26, r * 0.42, 0, 0, TAU);
    ctx.fillStyle = 'rgba(5,3,15,0.85)';
    ctx.fill();

    // пламя
    const fl = r * (1.1 + Math.random() * 0.5) * (this.odTimer > 0 ? 1.7 : 1);
    const fg = ctx.createLinearGradient(0, r * 0.5, 0, r * 0.5 + fl);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(0.35, this.odTimer > 0 ? COL.magenta : COL.cyan);
    fg.addColorStop(1, 'rgba(138,92,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, r * 0.5);
    ctx.lineTo(0, r * 0.5 + fl);
    ctx.lineTo(r * 0.42, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // щит
    if (this.shield) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const p = 0.6 + Math.sin(this.t * 6) * 0.25;
      ctx.strokeStyle = `rgba(53,230,255,${p})`;
      ctx.lineWidth = 2.5 * S;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.r * 2.0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${p * 0.5})`;
      ctx.lineWidth = 1 * S;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.r * 2.0 + 3 * S, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // магнит
    if (this.magnetTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(138,92,255,${0.25 + Math.sin(this.t * 9) * 0.12})`;
      ctx.lineWidth = 1.5 * S;
      ctx.setLineDash([6 * S, 8 * S]);
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 110 * S, this.t * 2, this.t * 2 + TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawMenuShip(ctx) {
    const S = this.S;
    const x = this.w / 2;
    const y = this.h * 0.72 + Math.sin(this.t * 1.6) * 8 * S;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.9;
    const r = 15 * S;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.25);
    ctx.lineTo(r * 0.95, r * 0.72);
    ctx.quadraticCurveTo(0, r * 0.30, -r * 0.95, r * 0.72);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, -r, 0, r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.45, COL.cyan);
    bg.addColorStop(1, '#1b0b45');
    ctx.fillStyle = bg;
    ctx.fill();
    const fl = r * (1.1 + Math.random() * 0.4);
    const fg = ctx.createLinearGradient(0, r * 0.5, 0, r * 0.5 + fl);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(0.35, COL.cyan);
    fg.addColorStop(1, 'rgba(138,92,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, r * 0.5);
    ctx.lineTo(0, r * 0.5 + fl);
    ctx.lineTo(r * 0.4, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (Math.random() < 0.6) {
      this.fx.spark(x + rand(-3, 3) * S, y + 14 * S, COL.cyan,
        { angle: Math.PI / 2 + rand(-0.3, 0.3), speed: rand(60, 180), grav: -40, ttl: 0.5, size: 2 * S });
    }
  }
}
