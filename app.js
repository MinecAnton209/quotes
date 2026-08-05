// All quote blocks (blockquote with id like q1..q95); the afterword (id="afterword") is excluded.
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

function apply() {
  const raw = search.value.trim();
  const isNum = /^\d+$/.test(raw);          // pure number => filter by quote number
  const s = raw.toLowerCase();
  const bucketSel = length.value;
  const vis = q.filter(b => {
    const t = b.querySelector("p").textContent;
    const textOk = isNum ? quoteNum(b) === parseInt(raw, 10)
                         : (!s || t.toLowerCase().includes(s));
    return textOk && (bucketSel === "all" || bucket(t) === bucketSel);
  });
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
