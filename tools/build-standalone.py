#!/usr/bin/env python3
"""Собирает NEON DRIFT в один HTML-файл без внешних ссылок.

Запуск:  python3 tools/build-standalone.py
Результат: neon-drift.html — открывается хоть с диска (file://), хоть из песочницы.

Зачем: модульная версия требует http-сервера (ES-модули с file:// не грузятся),
а одиночный файл работает везде — его можно переслать или положить куда угодно.
"""
import re
import pathlib
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent

SHIM = """/* localStorage на file:// может быть недоступен — подменяем памятью */
(function () {
  try { localStorage.getItem('__probe__'); return; } catch (e) {}
  var mem = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; }
    }
  });
})();
"""

SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<defs><radialGradient id="g" cx="50%" cy="40%" r="70%">'
    '<stop offset="0" stop-color="#1b0a3d"/><stop offset="1" stop-color="#05030f"/>'
    '</radialGradient></defs>'
    '<rect width="100" height="100" fill="url(#g)"/>'
    '<polygon points="50,18 22,78 78,78" fill="#35e6ff" opacity="0.35"/>'
    '<polygon points="50,26 30,72 70,72" fill="#8be9ff"/>'
    '<polygon points="50,26 30,72 50,64" fill="#ffffff"/>'
    '<path d="M50 76 L42 96 L58 96 Z" fill="#ff2fd0" opacity="0.9"/>'
    '</svg>'
)


def bundle(entry: str) -> str:
    """Склеивает ES-модули в один скрипт (импорты у нас однообразные)."""
    seen, out = [], []

    def visit(rel: str, base: pathlib.Path = None):
        path = ((base or ROOT) / rel).resolve()
        if path in seen:
            return
        seen.append(path)
        src = path.read_text(encoding='utf-8')
        for m in re.finditer(r"^import\s+[^;]*?from\s+['\"](\./[^'\"]+)['\"];?\s*$",
                             src, re.M):
            visit(m.group(1), path.parent)
        src = re.sub(r"^import\s+[^;]*?from\s+['\"][^'\"]+['\"];?\s*$", '', src, flags=re.M)
        src = re.sub(r"^export\s+(?=(const|let|var|function|class))", '', src, flags=re.M)
        out.append('/* ===== %s ===== */\n%s' % (path.relative_to(ROOT).as_posix(), src.strip()))

    visit(entry)
    return '\n\n'.join(out)


def main() -> None:
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'css' / 'style.css').read_text(encoding='utf-8')
    js = bundle('js/main.js')

    # стили внутрь
    html = re.sub(r'\s*<link rel="stylesheet"[^>]*>', '\n<style>\n' + css + '\n</style>', html)
    # манифест и иконки — в один файл их не встроить, заменяем favicon на data-URI
    favicon = 'data:image/svg+xml,' + urllib.parse.quote(SVG, safe='')
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
    html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', '', html)
    html = re.sub(r'\s*<link rel="icon"[^>]*>',
                  '\n<link rel="icon" href="' + favicon + '">', html)
    # скрипт внутрь
    script = '<script>\n' + SHIM + '\n(function () {\n"use strict";\n' + js + '\n})();\n</script>'
    html = re.sub(r'\s*<script type="module"[^>]*></script>', '\n' + script, html)

    html = html.replace('<title>', '<!-- собран tools/build-standalone.py: один файл, без сервера -->\n<title>', 1)

    out = ROOT / 'neon-drift.html'
    out.write_text(html, encoding='utf-8')
    print('готово:', out, '-', round(out.stat().st_size / 1024, 1), 'КБ')
    for tag in ('<link rel="stylesheet"', 'type="module"', 'src="js/', 'href="css/'):
        if tag in html:
            print('ВНИМАНИЕ: осталась внешняя ссылка', tag)


if __name__ == '__main__':
    main()
