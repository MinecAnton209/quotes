#!/usr/bin/env python3
"""Parse _quotes.txt and generate index.html. The author is taken from "— ..." lines."""
import html
import re

blocks = []       # list of tuples: (kind, text, author), kind: 'quote' | 'after'
header = None

cur_text, cur_author = None, None
after_mode = False
numbered = re.compile(r"^(\d+)\.\s*>(.*)$")   # e.g. "12. > Some quote"
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
lines.append("<title>Мои цитаты</title>")
lines.append("</head>")
lines.append("<body>")
lines.append(f"<h1>{esc(header) if header else 'Мои цитаты'}</h1>")

for i, (kind, text, author) in enumerate(blocks, 1):
    if kind == "after":
        lines.append("<h2>Послесловие</h2>")
    lines.append("<blockquote>")
    lines.append(f"  <p>{esc(text)}</p>")
    if author:
        lines.append(f"  <footer>&mdash; {esc(author)}</footer>")
    lines.append("</blockquote>")

lines.append("")
lines.append("<hr>")
lines.append('<p>Все цитаты автора MinecAnton209 лицензированы по лицензии '
             '<a rel="license" href="https://creativecommons.org/licenses/by-nd/4.0/">'
             'CC BY-ND 4.0</a>.</p>')
lines.append("</body>")
lines.append("</html>")
lines.append("")

with open("index.html", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"quotes: {sum(1 for b in blocks if b[0]=='quote')}, afterwords: {sum(1 for b in blocks if b[0]=='after')}")