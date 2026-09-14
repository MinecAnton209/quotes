// Quote blocks (id like q1..q97, plus afterword); the afterword is excluded.
const q = Array.from(document.querySelectorAll('blockquote[id^="q"]'));
const search = document.getElementById("qsearch");
const length = document.getElementById("qlength");
const count = document.getElementById("qcount");
const mode = document.getElementById("qmode");
const senseBtn = document.getElementById("qsense");
const favBtn = document.getElementById("qfav");
const toc = document.querySelector("ol");

let sense = false;
let favOnly = false;

// Check for reduced motion preference
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

// --- Favorites: stored in localStorage as comma-separated IDs ---
function getFavs() {
  return new Set(JSON.parse(localStorage.getItem("fav") || "[]"));
}
function saveFavs(favs) {
  localStorage.setItem("fav", JSON.stringify([...favs]));
}
function toggleFav(bq) {
  const favs = getFavs();
  const id = bq.id;
  const heart = bq.querySelector(".qheart");
  if (favs.has(id)) {
    favs.delete(id);
    heart.setAttribute("aria-pressed", "false");
  } else {
    favs.add(id);
    heart.setAttribute("aria-pressed", "true");
  }
  saveFavs(favs);
  updateFavBtn();
  return favs;
}

function updateFavBtn() {
  const favs = getFavs();
  favBtn.setAttribute("aria-pressed", favOnly ? "true" : "false");
  favBtn.textContent = "★ Избранное" + (favs.size ? " (" + favs.size + ")" : "");
}

function syncFavButtons() {
  const favs = getFavs();
  q.forEach(b => {
    const heart = b.querySelector(".qheart");
    if (heart) {
      heart.setAttribute("aria-pressed", favs.has(b.id) ? "true" : "false");
    }
  });
}

// --- Toast notification ---
let toastEl = null;
function toast(text) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "qtoast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastEl._hide);
  toastEl._hide = setTimeout(() => toastEl.classList.remove("show"), 2000);
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

// Update the URL with current filter state (doesn't reload the page)
function updateURL() {
  const params = new URLSearchParams();
  const raw = search.value.trim();
  if (raw) params.set("q", raw);
  if (length.value !== "all") params.set("len", length.value);
  if (sense) params.set("sense", "1");
  if (favOnly) params.set("fav", "1");
  const qs = params.toString();
  const url = qs ? "?" + qs : window.location.pathname + window.location.hash;
  history.replaceState(null, "", url);
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
  const filtering = !!raw || bucketSel !== "all" || favOnly;
  if (toc) toc.style.display = filtering ? "none" : "";

  // candidates within length bucket
  let cand = q.filter(b =>
    bucketSel === "all" || bucket(b.querySelector("p").textContent) === bucketSel);

  // favorites filter
  if (favOnly) {
    const favs = getFavs();
    cand = cand.filter(b => favs.has(b.id));
    mode.textContent = "★ избранное";
  }

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
  count.textContent = vis.length + " / " + (filtering ? cand.length : q.length);

  // highlight matches in visible quotes
  vis.forEach(b => { if (raw && !isNum) highlight(b, raw); });

  // visual feedback + scroll to first result
  senseBtn.setAttribute("aria-pressed", sense ? "true" : "false");
  senseBtn.classList.toggle("active", sense && !!raw);
  if (scroll && vis.length) {
    vis[0].scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center"
    });
  }

  updateURL();
}

// Restore state from URL on load
function restoreState() {
  const params = new URLSearchParams(window.location.search);
  const qParam = params.get("q");
  const lenParam = params.get("len");
  const senseParam = params.get("sense");
  const favParam = params.get("fav");

  if (qParam) search.value = qParam;
  if (lenParam) length.value = lenParam;
  sense = !!senseParam;
  favOnly = !!favParam;

  syncFavButtons();
  updateFavBtn();
  apply();

  // If URL had a hash, scroll to that quote
  if (window.location.hash) {
    const el = document.querySelector(window.location.hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Debounced apply for search input
let searchDebounce;
function debouncedApply() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => apply({ scroll: true }), 150);
}

search.addEventListener("input", debouncedApply);
length.addEventListener("change", () => { apply(); });
// Also listen for changes from the URL (back/forward buttons)
window.addEventListener("popstate", (e) => {
  restoreState();
});

document.getElementById("qreset").addEventListener("click", () => {
  search.value = "";
  length.value = "all";
  sense = false;
  favOnly = false;
  setTimeout(() => {
    history.replaceState(null, "", window.location.pathname + window.location.hash);
  }, 50);
  apply();
});

senseBtn.addEventListener("click", () => {
  sense = !sense;
  apply({ scroll: !!search.value.trim() });
});

favBtn.addEventListener("click", () => {
  favOnly = !favOnly;
  updateFavBtn();
  apply({ scroll: !!search.value.trim() });
});

document.getElementById("qrandom").addEventListener("click", () => {
  const vis = q.filter(b => b.style.display !== "none");
  if (!vis.length) return;
  const pick = vis[Math.floor(Math.random() * vis.length)];
  pick.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "center"
  });
  pick.style.outline = "2px solid #059";
  setTimeout(() => pick.style.outline = "", 2000);
});

// Heart buttons: toggle favorite on click
document.querySelectorAll(".qheart").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const bq = btn.closest("blockquote");
    toggleFav(bq);
    toast(bq.style.display === "none" ? "Скрыта из избранного" : "Добавлено в избранное");
  });
});

// Copy quote text to clipboard
document.querySelectorAll(".qcopy").forEach(btn => btn.addEventListener("click", () => {
  const bq = btn.closest("blockquote");
  const text = bq.querySelector("p").textContent;
  const author = bq.querySelector("footer")?.textContent || "";
  navigator.clipboard.writeText(text + "\n" + author).then(() => {
    toast("Цитата скопирована");
  }).catch(() => {
    toast("Не удалось скопировать");
  });
}));

// Copy a permalink to the quote (current page URL + its anchor, e.g. ".../index.html#q12")
document.querySelectorAll(".qlink").forEach(btn => btn.addEventListener("click", async () => {
  const url = location.origin + location.pathname + "#" + btn.closest("blockquote").id;
  try {
    await navigator.clipboard.writeText(url);
    toast("Ссылка скопирована");
  } catch (e) {
    // clipboard unavailable (non-secure context) — fall back to location bar
    location.hash = btn.closest("blockquote").id;
  }
}));

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  // Enter on search field: focus first visible quote
  if (e.target === search && e.key === "Enter") {
    e.preventDefault();
    const vis = q.filter(b => b.style.display !== "none");
    if (vis.length) vis[0].scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
  }
  // Escape: clear search and reset
  if (e.key === "Escape" && document.activeElement === search) {
    search.value = "";
    length.value = "all";
    apply();
  }
  // Arrow navigation: up/down through visible quotes
  if (e.key === "ArrowDown" && document.activeElement === document.body) {
    e.preventDefault();
    const vis = q.filter(b => b.style.display !== "none");
    if (!vis.length) return;
    const hash = window.location.hash.slice(1);
    const idx = vis.findIndex(b => b.id === hash);
    if (idx >= 0 && idx < vis.length - 1) {
      vis[idx + 1].scrollIntoView({ behavior: "smooth", block: "center" });
      history.pushState(null, "", "#" + vis[idx + 1].id);
    }
  }
  if (e.key === "ArrowUp" && document.activeElement === document.body) {
    e.preventDefault();
    const vis = q.filter(b => b.style.display !== "none");
    if (!vis.length) return;
    const hash = window.location.hash.slice(1);
    const idx = vis.findIndex(b => b.id === hash);
    if (idx > 0) {
      vis[idx - 1].scrollIntoView({ behavior: "smooth", block: "center" });
      history.pushState(null, "", "#" + vis[idx - 1].id);
    }
  }
});

restoreState();
