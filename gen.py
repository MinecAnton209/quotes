#!/usr/bin/env python3
"""Parse _quotes.txt and generate index.html. The author is taken from "— ..." lines."""
import html
import re
import sys

blocks = []       # list of tuples: (kind, text, author), kind: 'quote' | 'after'
header = None

cur_text, cur_author = None, None
after_mode = False
numbered = re.compile(r"^(\d+)\.\s*>(.*)$")   # e.g. "12. > Some quote"
numbered_missing_marker = re.compile(r"^(\d+)\.\s+(?!>)(.*)$")  # "12. Some quote" (no ">")
author_re = re.compile(r"^—\s*(.*)$")          # e.g. "— MinecAnton209"

def flush():
    """Save the current quote block and reset the accumulators."""
    global cur_text, cur_author
    if cur_text is not None:
        kind = "after" if after_mode else "quote"
        blocks.append((kind, cur_text.strip(), cur_author))
    cur_text, cur_author = None, None

with open("_quotes.txt", encoding="utf-8") as f:
    for raw in f:
        line = raw.rstrip("\n")
        s = line.strip()
        if not s:
            continue
        m = numbered.match(s)
        if m:
            # start of a new numbered quote; begin a fresh quote block
            flush()
            cur_text, cur_author = m.group(2).strip(), None
            continue
        if numbered_missing_marker.match(s):
            # looks like a quote header but lacks the ">" marker; would silently
            # get appended to the previous quote, so surface it as a warning
            print(f"WARNING: quote header without '>' marker (will be treated "
                  f"as continuation): {s[:70]}", file=sys.stderr)
            # fall through so the line is still handled as quote text
        m = author_re.match(s)
        if m:
            # author line; attach to the current quote if one is open
            cur_author = m.group(1).strip() if cur_text is not None else cur_author
            continue
        if s.startswith("#"):
            # plain-text H1 heading
            header = s.lstrip("#").strip()
            continue
        if s.startswith("**Послесловие"):
            # "Послесловие" marker: everything after it is the afterword
            flush()
            cur_text, cur_author = "", None
            after_mode = True
            continue
        # drop the leading ">" markdown quote marker
        if s.startswith(">"):
            s = s[1:].lstrip()
        # continuation line of the current quote text
        if cur_text is not None:
            cur_text += " " + s

flush()

def esc(s):
    return html.escape(s, quote=False)

lines = []
lines.append("<!doctype html>")
lines.append('<html lang="ru">')
lines.append("<head>")
lines.append('<meta charset="utf-8">')
lines.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
lines.append('<link rel="stylesheet" href="style.css">')
lines.append("<title>Цитаты MinecAnton209</title>")
lines.append("</head>")
lines.append("<body>")
lines.append(f"<h1>{esc(header) if header else 'Цитаты MinecAnton209'}</h1>")

lines.append('<div id="controls">')
lines.append('<input id="qsearch" type="search" placeholder="Поиск по тексту или номеру…">')
lines.append('<select id="qlength">')
lines.append('  <option value="all">Любая длина</option>')
lines.append('  <option value="short">Короткие (≤15 слов)</option>')
lines.append('  <option value="medium">Средние (16–30 слов)</option>')
lines.append('  <option value="long">Длинные (31+ слов)</option>')
lines.append("</select>")
lines.append('<button id="qrandom" type="button">Случайная</button>')
lines.append('<button id="qreset" type="button">Показать все</button>')
lines.append('<span id="qcount"></span>')
lines.append("</div>")

# Table of contents (numbered list with quote snippets)
lines.append("<ol>")
num = 0
for kind, text, author in blocks:
    if kind == "quote":
        num += 1
        snippet = text if len(text) <= 50 else text[:50] + "…"
        lines.append(f'  <li><a href="#q{num}">{num}. {esc(snippet)}</a></li>')
lines.append("</ol>")
lines.append("<hr>")

num = 0
for kind, text, author in blocks:
    if kind == "after":
        lines.append('<h2 id="afterword">Послесловие</h2>')
        bq_id = "afterword"
    else:
        num += 1
        bq_id = f"q{num}"
    lines.append(f'<blockquote id="{bq_id}">')
    if kind == "quote":
        lines.append(f"  <p><b>{num}.</b> {esc(text)}</p>")
    else:
        lines.append(f"  <p>{esc(text)}</p>")
    if author:
        lines.append(f"  <footer>&mdash; {esc(author)}</footer>")
    lines.append(f'  <button class="qcopy" type="button" title="Скопировать" '
                 f'data-text="{esc(text)}">⧉</button>')
    lines.append("</blockquote>")

lines.append("")
lines.append("<hr>")
lines.append('<p>Все цитаты автора MinecAnton209 лицензированы по лицензии '
             '<a rel="license" href="https://creativecommons.org/licenses/by-nd/4.0/">'
             'CC BY-ND 4.0</a>.</p>')
lines.append('<script src="app.js" defer></script>')
lines.append("</body>")
lines.append("</html>")
lines.append("")

with open("index.html", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"quotes: {sum(1 for b in blocks if b[0]=='quote')}, afterwords: {sum(1 for b in blocks if b[0]=='after')}")