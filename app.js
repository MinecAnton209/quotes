// Quote blocks (id like q1..q95); the afterword (id="afterword") is excluded.
const q = Array.from(document.querySelectorAll('blockquote[id^="q"]'));
const search = document.getElementById("qsearch");
const length = document.getElementById("qlength");
const count = document.getElementById("qcount");

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

// --- Vector search: character 3-gram TF-IDF + cosine similarity ---
// Each quote becomes a sparse vector over its character 3-grams, weighted by
// TF-IDF. Char n-grams beat whole words for Russian: "света" and "свет" share
// the grams "све"/"вет", so morphologically related forms stay similar.
const GRAM = 3;

function ngrams(text) {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (t.length < GRAM) return t ? [t] : [];
  const out = [];
  for (let i = 0; i <= t.length - GRAM; i++) out.push(t.slice(i, i + GRAM));
  return out;
}

let DF, VECS;
function buildIndex() {
  const grams = q.map(b => ngrams(b.querySelector("p").textContent));
  const N = q.length;
  DF = new Map();
  grams.forEach(doc => new Set(doc).forEach(g => DF.set(g, (DF.get(g) || 0) + 1)));
  VECS = grams.map(doc => {
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

const RESULT_LIMIT = 10; // ponytail: fixed top-10 shortlist, add a threshold control if recall matters

function apply() {
  const raw = search.value.trim();
  const isNum = /^\d+$/.test(raw);
  const bucketSel = length.value;
  const cand = q.filter(b =>
    bucketSel === "all" || bucket(b.querySelector("p").textContent) === bucketSel);

  let vis;
  if (isNum) {
    vis = q.filter(b => quoteNum(b) === parseInt(raw, 10));
  } else if (!raw) {
    vis = q;
  } else if (raw.length < GRAM) {
    // too short for n-gram vectors; fall back to plain substring
    vis = q.filter(b =>
      b.querySelector("p").textContent.toLowerCase().includes(raw.toLowerCase()));
  } else {
    const qv = queryVec(raw);
    vis = q
      .filter(b => cand.includes(b))
      .map(b => ({ b, s: cosine(VECS[q.indexOf(b)], qv) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, RESULT_LIMIT)
      .map(x => x.b);
  }
  if (bucketSel !== "all") vis = vis.filter(b => cand.includes(b));
  q.forEach(b => b.style.display = vis.includes(b) ? "" : "none");
  count.textContent = vis.length + " / " + q.length;
}

search.addEventListener("input", apply);
length.addEventListener("change", apply);
document.getElementById("qreset").addEventListener("click", () => {
  search.value = "";
  length.value = "all";
  apply();
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

apply();
