/* Маленькие математические помощники */
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Плавное приближение, независимое от кадровой частоты */
export const approach = (cur, target, rate, dt) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

/** Пересечение круга и прямоугольника */
export function circleRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** Кратчайшее расстояние от круга до прямоугольника (0 — пересечение) */
export function circleRectDist(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return Math.hypot(cx - nx, cy - ny) - r;
}

export const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');

/** Лёгкая вибрация, если устройство поддерживает */
export function buzz(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* нет доступа */ } }
}
