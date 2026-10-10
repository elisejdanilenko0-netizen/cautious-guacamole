#!/usr/bin/env python3
"""Генерация иконок игры без внешних зависимостей (чистый Python + zlib).

Запуск:  python3 tools/make_icons.py
Результат: icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def write_png(path, size, pixels):
    """pixels: список строк, каждая строка — список (r,g,b,a)."""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + dx * t), py - (ay + dy * t))


def inside_tri(px, py, a, b, c):
    def sign(x1, y1, x2, y2, x3, y3):
        return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)

    d1 = sign(px, py, a[0], a[1], b[0], b[1])
    d2 = sign(px, py, b[0], b[1], c[0], c[1])
    d3 = sign(px, py, c[0], c[1], a[0], a[1])
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def add(c1, w1, c2, w2):
    return tuple(c1[i] * w1 + c2[i] * w2 for i in range(len(c1)))


def make(size, scale=1.0):
    s = size
    tri = (
        (0.5, 0.20 * scale + (1 - scale) / 2),
        (0.20 * scale + (1 - scale) / 2, 0.76 * scale + (1 - scale) / 2),
        (0.80 * scale + (1 - scale) / 2, 0.76 * scale + (1 - scale) / 2),
    )
    rows = []
    for y in range(s):
        row = []
        py = y / s
        for x in range(s):
            px = x / s
            # фон: радиальный градиент
            d = math.hypot(px - 0.5, py - 0.42)
            bg = add((27, 10, 61), 1.0, (5, 3, 15), min(d * 1.9, 1.0))
            r, g, b = bg[0], bg[1], bg[2]
            a = 255.0

            dist = min(
                seg_dist(px, py, *tri[0], *tri[1]),
                seg_dist(px, py, *tri[1], *tri[2]),
                seg_dist(px, py, *tri[2], *tri[0]),
            )
            if inside_tri(px, py, *tri):
                dist = -dist

            # свечение вокруг корабля
            glow = math.exp(-max(dist, 0.0) * 11.0) * 0.85
            r = r * (1 - glow) + 53 * glow
            g = g * (1 - glow) + 200 * glow
            b = b * (1 - glow) + 255 * glow

            if dist < 0:
                # корпус: от белого носа к фиолетовой корме
                t = (py - tri[0][1]) / (tri[1][1] - tri[0][1])
                t = max(0.0, min(1.0, t))
                body = add((255, 255, 255), 1 - t, (120, 40, 200), t)
                core = min(1.0, -dist * 9.0)
                r = r * (1 - core) + body[0] * core
                g = g * (1 - core) + body[1] * core
                b = b * (1 - core) + body[2] * core

            # шлейф пламени
            fx = px - 0.5
            fy = py - 0.80
            flame = math.exp(-((fx * fx) * 90.0 + (max(fy, 0.0) ** 2) * 26.0)) * (1.0 if py > 0.72 else 0.25)
            flame *= 0.9
            r = r * (1 - flame) + 255 * flame
            g = g * (1 - flame) + 90 * flame
            b = b * (1 - flame) + 220 * flame

            row.append((int(max(0, min(255, r))), int(max(0, min(255, g))),
                        int(max(0, min(255, b))), int(a)))
        rows.append(row)
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("icon-192.png", 192, 0.86),
        ("icon-512.png", 512, 0.86),
        ("icon-maskable-512.png", 512, 0.62),
        ("apple-touch-icon.png", 180, 0.80),
    ]
    for name, size, scale in targets:
        path = os.path.join(OUT, name)
        write_png(path, size, make(size, scale))
        print("ok", name, size, size)
    print("Иконки готовы:", OUT)


if __name__ == "__main__":
    main()
