// Quote blocks (id like q1..q95); the afterword (id="afterword") is excluded.
const q = Array.from(document.querySelectorAll('blockquote[id^="q"]'));
const search = document.getElementById("qsearch");
const length = document.getElementById("qlength");
const count = document.getElementById("qcount");
const mode = document.getElementById("qmode");
const senseBtn = document.getElementById("qsense");
// The table of contents is the only <ol> on the page; guard it anyway so a
// missing element can't break the search.
const toc = document.querySelector("ol");

let sense = false; // default: exact (substring) mode; toggled by the "по смыслу" button

function words(t) {
  return t.trim().split(/\s+/).length;
}

function bucket(t) {
  const n = words(t);
  return n <= 15 ? "short" : n <= 30 ? "medium" : "long";
}

// Quote number from its id ("q12" -> 12)
function quoteNum(b) {
  return parseInt(b.id.slice(1), 10);
}

// --- Vector index: character 3-gram TF-IDF + cosine similarity ---
const GRAM = 3;

function ngrams(text) {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (t.length < GRAM) return t ? [t] : [];
  const out = [];
  for (let i = 0; i <= t.length - GRAM; i++) out.push(t.slice(i, i + GRAM));
  return out;
}

let DF, VECS, DOCGRAMS;
function buildIndex() {
  DOCGRAMS = q.map(b => ngrams(b.querySelector("p").textContent));
  const N = q.length;
  DF = new Map();
  DOCGRAMS.forEach(doc => new Set(doc).forEach(g => DF.set(g, (DF.get(g) || 0) + 1)));
  VECS = DOCGRAMS.map(doc => {
    const tf = new Map();
    doc.forEach(g => tf.set(g, (tf.get(g) || 0) + 1));
    const vec = new Map();
    tf.forEach((c, g) => {
      const idf = Math.log((N + 1) / (1 + (DF.get(g) || 0))) + 1;
      vec.set(g, (c / doc.length) * idf);
    });
    return vec;
  });
}

function queryVec(text) {
  const grams = ngrams(text);
  const vec = new Map();
  grams.forEach(g => {
    const idf = Math.log((q.length + 1) / (1 + (DF.get(g) || 0))) + 1;
    vec.set(g, (vec.get(g) || 0) + idf / grams.length);
  });
  return vec;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  a.forEach((v, k) => { dot += v * (b.get(k) || 0); na += v * v; });
  b.forEach(v => { nb += v * v; });
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

buildIndex();

// Collapse adjacent text nodes under the quote's <p> into one, so that
// highlighting never works against pieces of a previously split text node.
function collapseText(p) {
  // normalize() would merge adjacent text nodes across the whole subtree,
  // but it also merges inside <mark> children; do it only on the top level.
  const nodes = Array.from(p.childNodes);
  let prev = null;
  for (const node of nodes) {
    if (node.nodeType === 3) {
      if (prev) {
        prev.nodeValue += node.nodeValue;
        node.parentNode.removeChild(node);
      } else {
        prev = node;
      }
    } else {
      prev = null;
    }
  }
}

// Clear any <mark> highlighting left from a previous search
function clearMarks(b) {
  const p = b.querySelector("p");
  p.querySelectorAll("mark").forEach(m => m.replaceWith(m.firstChild));
  collapseText(p);
}

// Wrap each query term occurrence in the quote's full text with <mark>,
// preserving the leading <b>N.</b> number node.
function highlight(b, raw) {
  const p = b.querySelector("p");
  const terms = raw.toLowerCase().split(/\s+/).filter(Boolean);
  // The quote text is the last (only) text node under <p>; the <b> number
  // precedes it. Highlight just the text, keeping the number untouched.
  const numNode = p.querySelector("b");
  const textNode = numNode ? numNode.nextSibling : p.firstChild;
  const text = (textNode && textNode.nodeType === 3) ? textNode.nodeValue : "";
  if (!text) return;
  const lower = text.toLowerCase();
  const out = document.createDocumentFragment();
  let i = 0;
  while (i < text.length) {
    let bestAt = -1, bestLen = 0;
    for (const term of terms) {
      const idx = lower.indexOf(term, i);
      if (idx >= 0 && (bestAt < 0 || idx < bestAt)) { bestAt = idx; bestLen = term.length; }
    }
    if (bestAt < 0) { out.appendChild(document.createTextNode(text.slice(i))); break; }
    if (bestAt > i) out.appendChild(document.createTextNode(text.slice(i, bestAt)));
    const mk = document.createElement("mark");
    mk.textContent = text.slice(bestAt, bestAt + bestLen);
    out.appendChild(mk);
    i = bestAt + bestLen;
  }
  textNode.parentNode.replaceChild(out, textNode);
}

function apply({ scroll = false } = {}) {
  const raw = search.value.trim();
  const isNum = /^\d+$/.test(raw);
  const bucketSel = length.value;

  // reset state
  q.forEach(b => {
    clearMarks(b);
    b.style.display = "";
  });
  count.textContent = q.length + " / " + q.length;
  mode.textContent = "";

  // hide the table of contents while filtering so results aren't pushed below it
  const filtering = !!raw || bucketSel !== "all";
  if (toc) toc.style.display = filtering ? "none" : "";

  // candidates within length bucket
  const cand = q.filter(b =>
    bucketSel === "all" || bucket(b.querySelector("p").textContent) === bucketSel);

  let vis;
  if (isNum) {
    vis = cand.filter(b => quoteNum(b) === parseInt(raw, 10));
  } else if (raw && sense) {
    // semantic: rank by cosine similarity
    const qv = queryVec(raw);
    vis = cand
      .map(b => ({ b, s: cosine(VECS[q.indexOf(b)], qv) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 8)
      .map(x => x.b);
    mode.textContent = "по смыслу — ближайшие";
    // dim off the mode button so it's clear it's active
  } else if (raw) {
    // exact/near: substring across gram-expanded text OR plain substring
    const lower = raw.toLowerCase();
    vis = cand.filter(b => {
      const t = b.querySelector("p").textContent;
      return t.toLowerCase().includes(lower) ||
             ngrams(raw).some(g => DOCGRAMS[q.indexOf(b)].includes(g));
    });
    mode.textContent = "по тексту";
  } else {
    vis = cand;
    mode.textContent = "";
  }

  q.forEach(b => b.style.display = vis.includes(b) ? "" : "none");
  count.textContent = vis.length + " / " + q.length;

  // highlight matches in visible quotes
  vis.forEach(b => { if (raw && !isNum) highlight(b, raw); });

  // visual feedback + scroll to first result
  senseBtn.classList.toggle("active", sense && !!raw);
  if (scroll && vis.length) vis[0].scrollIntoView({ behavior: "smooth", block: "center" });
}

search.addEventListener("input", () => apply({ scroll: true }));
length.addEventListener("change", () => apply());
document.getElementById("qreset").addEventListener("click", () => {
  search.value = "";
  length.value = "all";
  sense = false;
  apply();
});
senseBtn.addEventListener("click", () => {
  sense = !sense;
  apply({ scroll: !!search.value.trim() });
});
document.getElementById("qrandom").addEventListener("click", () => {
  const vis = q.filter(b => b.style.display !== "none");
  if (!vis.length) return;
  const pick = vis[Math.floor(Math.random() * vis.length)];
  pick.scrollIntoView({ behavior: "smooth", block: "center" });
  pick.style.outline = "2px solid #059";
  setTimeout(() => pick.style.outline = "", 2000);
});

document.querySelectorAll(".qcopy").forEach(btn => btn.addEventListener("click", () => {
  const bq = btn.closest("blockquote");
  const text = bq.querySelector("p").textContent;
  const author = bq.querySelector("footer")?.textContent || "";
  navigator.clipboard.writeText(text + "\n" + author);
}));

// Copy a permalink to the quote (current page URL + its anchor, e.g. ".../index.html#q12")
document.querySelectorAll(".qlink").forEach(btn => btn.addEventListener("click", async () => {
  const url = location.origin + location.pathname + "#" + btn.closest("blockquote").id;
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    // clipboard unavailable (non-secure context) — fall back to location bar
    location.hash = btn.closest("blockquote").id;
  }
}));

apply();