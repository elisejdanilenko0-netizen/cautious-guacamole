/* ============================================================
   Запуск игры: размеры, ввод, HUD, игровой цикл
   ============================================================ */
import { Game, STATE } from './game.js';
import { AudioEngine } from './audio.js';
import { clamp, fmt } from './util.js';

const $ = (id) => document.getElementById(id);

const canvas = $('game');
const el = {
  hud: $('hud'), menu: $('menu'), over: $('over'),
  score: $('score'), best: $('best'), lives: $('lives'),
  charge: $('charge'), od: $('od'), combo: $('combo'),
  play: $('play'), retry: $('retry'), home: $('home'),
  final: $('final'), bestOver: $('best-over'), bestMenu: $('best-menu'),
  dist: $('dist'), orbs: $('orbs'), record: $('record'),
  sound: $('sound'), flash: $('flash'), install: $('install'),
  tip: $('tip'), pause: $('pause'), resume: $('resume'),
};

/* --------------------------- UI-адаптер --------------------------- */
const ui = {
  _lives: -1, _thousand: 0, _combo: -1, _chargeReady: null,
  setScore(v) {
    const s = fmt(v);
    if (el.score.textContent !== s) el.score.textContent = s;
    const k = Math.floor(v / 1000);
    if (k > this._thousand) {
      this._thousand = k;
      el.score.classList.remove('bump');
      void el.score.offsetWidth;
      el.score.classList.add('bump');
    }
  },
  setBest(v) {
    const s = fmt(v);
    if (el.best.textContent !== s) el.best.textContent = s;
    if (el.bestMenu.textContent !== s) el.bestMenu.textContent = s;
  },
  setLives(n, max) {
    if (n === this._lives) return;
    this._lives = n;
    let html = '';
    for (let i = 0; i < max; i++) html += `<i class="heart${i < n ? '' : ' lost'}"></i>`;
    el.lives.innerHTML = html;
  },
  setCharge(v, ready) {
    el.charge.style.width = clamp(v, 0, 100) + '%';
    const can = v >= 100 && !ready;
    if (can !== this._chargeReady) {
      this._chargeReady = can;
      el.od.classList.toggle('ready', can);
    }
  },
  setCombo(n, mult) {
    const show = n >= 5;
    if (show) {
      el.combo.textContent = `КОМБО ${n}  ×${mult.toFixed(1)}`;
    }
    if (show !== (this._combo >= 5)) el.combo.classList.toggle('show', show);
    this._combo = n;
  },
  showOver(game) {
    el.final.textContent = fmt(game.score);
    el.bestOver.textContent = fmt(game.best);
    el.dist.textContent = fmt(game.dist / (16 * game.S));
    el.orbs.textContent = fmt(game.orbs);
    el.record.classList.toggle('hidden', !game.record);
    el.over.classList.remove('hidden');
    el.hud.classList.add('hidden');
    el.sound.classList.remove('playing');
  },
  showMenu() {
    el.over.classList.add('hidden');
    el.hud.classList.add('hidden');
    el.menu.classList.remove('hidden');
    el.sound.classList.remove('playing');
  },
  showHud() {
    el.menu.classList.add('hidden');
    el.over.classList.add('hidden');
    el.hud.classList.remove('hidden');
    el.sound.classList.add('playing');
    this._thousand = 0;
    this._lives = -1;
    this._combo = -1;
  },
  showTip() {
    if (localStorage.getItem('neondrift.played')) return;
    localStorage.setItem('neondrift.played', '1');
    el.tip.classList.remove('hidden');
    setTimeout(() => el.tip.classList.add('hidden'), 3000);
  },
  showPause(on) {
    el.pause.classList.toggle('hidden', !on);
  },
};

/* --------------------------- ядро --------------------------- */
const audio = new AudioEngine();
const game = new Game(canvas, audio, ui);
audio.setEnabled(game.soundOn);
el.sound.textContent = game.soundOn ? '🔊' : '🔇';
el.sound.classList.toggle('off', !game.soundOn);
ui.showMenu();
ui.setBest(game.best);

/* --------------------------- размеры --------------------------- */
const stage = $('stage');

function resize() {
  const w = Math.round(stage.clientWidth) || window.innerWidth;
  const h = Math.round(stage.clientHeight) || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  game.resize(w, h, dpr);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

/* --------------------------- ввод --------------------------- */
let pointerActive = false;

function posX(e) {
  const r = canvas.getBoundingClientRect();
  return e.clientX - r.left;
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.state !== STATE.PLAY) return;
  pointerActive = true;
  canvas.setPointerCapture?.(e.pointerId);
  game.setTarget(posX(e));
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (!pointerActive || game.state !== STATE.PLAY) return;
  game.setTarget(posX(e));
  e.preventDefault();
}, { passive: false });

const endPointer = () => { pointerActive = false; };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', endPointer);

// страховка от «прилипшего» пальца
window.addEventListener('blur', () => { pointerActive = false; });

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ф' || k === 'Ф') game.nudgeTarget(-game.w * 0.06);
  if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'в' || k === 'В') game.nudgeTarget(game.w * 0.06);
  if (k === ' ') { e.preventDefault(); game.triggerOverdrive(); }
  if (k === 'Enter') {
    if (game.state === STATE.MENU) startGame();
    else if (game.state === STATE.OVER) startGame();
  }
});

// запрет зум-жестов и скролла
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

/* --------------------------- кнопки --------------------------- */
function startGame() {
  audio.init();
  game.start();
  ui.showHud();
  ui.showTip();
}
el.play.addEventListener('click', startGame);
el.retry.addEventListener('click', startGame);
el.home.addEventListener('click', () => { game.toMenu(); ui.showMenu(); audio.ui(); });

el.od.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  game.triggerOverdrive();
});

el.sound.addEventListener('click', (e) => {
  e.stopPropagation();
  game.soundOn = !game.soundOn;
  localStorage.setItem('neondrift.sound', game.soundOn ? '1' : '0');
  audio.init();
  audio.setEnabled(game.soundOn);
  if (game.soundOn && game.state === STATE.PLAY) audio.startMusic();
  el.sound.textContent = game.soundOn ? '🔊' : '🔇';
  el.sound.classList.toggle('off', !game.soundOn);
});

/* --------------------------- пауза --------------------------- */
let paused = false;

function pause() {
  if (paused || game.state !== STATE.PLAY) return;
  paused = true;
  audio.stopMusic();
  audio.suspend();
  ui.showPause(true);
}

function unpause() {
  if (!paused) return;
  paused = false;
  last = performance.now();
  ui.showPause(false);
  audio.resume();
  if (game.state === STATE.PLAY) audio.startMusic();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
el.resume.addEventListener('click', unpause);
el.pause.addEventListener('click', (e) => { if (e.target === el.pause) unpause(); });
window.addEventListener('blur', pause);

/* --------------------------- цикл --------------------------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused) {
    game.update(dt);
    game.draw();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* --------------------------- установка на телефон --------------------------- */
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  el.install.textContent = '⬇ УСТАНОВИТЬ ИГРУ';
  el.install.classList.remove('hidden');
  el.install.style.pointerEvents = 'auto';
  el.install.style.cursor = 'pointer';
  el.install.addEventListener('click', async () => {
    el.install.classList.add('hidden');
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
  }, { once: true });
});

const standalone = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
if (!standalone && !localStorage.getItem('neondrift.tip')) {
  setTimeout(() => {
    if (deferred) return;
    el.install.textContent = 'Меню браузера → «На экран «Домой»»';
    el.install.classList.remove('hidden');
    setTimeout(() => el.install.classList.add('hidden'), 6000);
    localStorage.setItem('neondrift.tip', '1');
  }, 14000);
}

window.addEventListener('appinstalled', () => el.install.classList.add('hidden'));

/* --------------------------- офлайн --------------------------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* не критично */ });
  });
}

/* доступ из консоли для отладки: NEON.game.charge = 100 и т.п. */
window.NEON = { game, audio, ui, STATE };

/* первое включение звука требует жеста — вешаем на любое касание */
window.addEventListener('pointerdown', function once() {
  audio.init();
  window.removeEventListener('pointerdown', once);
}, { once: true });
