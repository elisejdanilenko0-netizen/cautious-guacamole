/* Головоломный тест игрового ядра без браузера:
   заглушки DOM/Canvas + «робот», который играет за нас.
   Запуск: node tools/simulate.mjs            */
import { Game, STATE } from '../js/game.js';

/* ---------- заглушки окружения ---------- */
const grad = { addColorStop() {} };
const ctxTarget = {
  setTransform() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, closePath() {},
  fill() {}, stroke() {}, fillRect() {}, clearRect() {}, fillText() {}, strokeText() {},
  quadraticCurveTo() {}, setLineDash() {},
  createLinearGradient: () => grad, createRadialGradient: () => grad,
  measureText: () => ({ width: 10 }),
};
const ctx = new Proxy(ctxTarget, {
  get: (t, k) => (k in t ? t[k] : undefined),
  set: () => true,
});

globalThis.window = { devicePixelRatio: 2, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate: null }, writable: true, configurable: true,
});
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, String(v)); },
};
globalThis.document = { addEventListener() {} };

const canvas = { getContext: () => ctx, style: {}, addEventListener() {} };
const audio = new Proxy({}, { get: () => () => {} });
const ui = new Proxy({ showOver() {} }, { get: (t, k) => (k in t ? t[k] : () => {}) });

/* ---------- «робот»: выбирает безопасную точку ---------- */
function robot(game) {
  const w = game.w, S = game.S;
  let bestX = w / 2, bestScore = -Infinity;
  for (let i = 0; i < 40; i++) {
    const x = (i / 39) * w;
    let score = 0;
    for (const e of game.ents) {
      const dy = game.ship.y - e.y;                 // >0 — объект выше корабля
      if (dy < 0 || dy > game.h * 0.75) continue;   // уже пролетели / слишком далеко
      const near = 1 - dy / (game.h * 0.75);
      if (e.kind === 'wall') {
        score += (Math.abs(x - e.gapX) < e.gapW / 2 - game.ship.r ? 6 : -14) * near;
      } else if (e.kind === 'mine') {
        score += (Math.abs(x - e.x) < 42 * S ? -16 : 1) * near;
      } else if (e.kind === 'orb') {
        score += (Math.abs(x - e.x) < 40 * S ? 3 : 0) * near;
      } else if (e.kind === 'power') {
        score += (Math.abs(x - e.x) < 40 * S ? 4 : 0) * near;
      }
    }
    score -= Math.abs(x - game.ship.x) * 0.004;     // не дёргаться без причины
    if (score > bestScore) { bestScore = score; bestX = x; }
  }
  game.setTarget(bestX);
  if (game.charge >= 100) game.triggerOverdrive();
}

/* ---------- прогон ---------- */
function run(label, { w, h, useRobot, seconds }) {
  const game = new Game(canvas, audio, ui);
  game.resize(w, h, 2);
  game.start();
  const dt = 1 / 60;
  let frames = 0, maxEnts = 0, odCount = 0, prevOd = 0;
  const N = Math.round(seconds / dt);
  for (let i = 0; i < N; i++) {
    if (useRobot) robot(game);
    if (game.odTimer > 0 && prevOd === 0) odCount++;
    prevOd = game.odTimer;
    game.update(dt);
    game.draw();
    maxEnts = Math.max(maxEnts, game.ents.length);
    frames++;
    if (game.state !== STATE.PLAY) break;
  }
  const t = frames * dt;
  console.log(
    `${label.padEnd(26)} время ${t.toFixed(1)}с | счёт ${Math.floor(game.score)} | ` +
    `жизней ${game.lives} | энергии ${game.orbs} | OD ${odCount} | ` +
    `сложность ${(game.diff * 100).toFixed(0)}% | объектов max ${maxEnts} | ` +
    `м/с ${(game.speed / h).toFixed(2)}`
  );
  return { t, score: Math.floor(game.score), lives: game.lives, diff: game.diff };
}

console.log('--- игра за робота (умеет уворачиваться) ---');
for (const [w, h] of [[390, 844], [360, 640], [430, 932], [820, 1180]]) {
  run(`экраны ${w}x${h}`, { w, h, useRobot: true, seconds: 180 });
}
console.log('\n--- корабль стоит по центру (мы проверяем, что игра вообще убивает) ---');
run('пассивный', { w: 390, h: 844, useRobot: false, seconds: 60 });

/* ---------- статистика: от чего именно умираем ---------- */
function stats(runs = 12) {
  const causes = { wall: 0, mine: 0, unknown: 0 };
  const times = [];
  for (let r = 0; r < runs; r++) {
    const game = new Game(canvas, audio, ui);
    game.resize(390, 844, 2);
    game.start();
    const orig = game._damage.bind(game);
    game._damage = function () {
      const sh = game.ship;
      let best = null, bd = 1e9;
      for (const e of game.ents) {
        const ey = e.kind === 'wall' ? e.y + e.th / 2 : e.y;
        const d = Math.abs(sh.y - ey);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && bd < game.h * 0.25) causes[best.kind === 'wall' ? 'wall' : 'mine']++;
      else causes.unknown++;
      orig();
    };
    const dt = 1 / 60;
    let i = 0;
    for (; i < 60 * 240; i++) {
      robot(game);
      game.update(dt);
      if (game.state !== STATE.PLAY) break;
    }
    times.push(i * dt);
  }
  times.sort((a, b) => a - b);
  console.log(`\nробот, ${runs} забегов: медиана ${times[times.length >> 1].toFixed(1)}с, ` +
    `мин ${times[0].toFixed(1)}с, макс ${times[times.length - 1].toFixed(1)}с`);
  console.log('причины смертей:', causes);
}
stats();
