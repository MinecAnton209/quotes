const q = Array.from(document.querySelectorAll("blockquote"));
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

function apply() {
  const s = search.value.toLowerCase().trim();
  const bucketSel = length.value;
  const vis = q.filter(b => {
    const t = b.querySelector("p").textContent;
    return (!s || t.toLowerCase().includes(s)) &&
           (bucketSel === "all" || bucket(t) === bucketSel);
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
