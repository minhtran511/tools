"use strict";
/* ================= UI wiring ================= */
function togglePause() { V.paused = !V.paused; $("btnPlay").textContent = V.paused ? "▶" : "⏸"; }
$("btnPlay").onclick = togglePause;
$("rngTime").addEventListener("input", () => {
  const tr = V.state && curTrack(); if (!tr) return;
  V.scrubbing = true;
  const d = tr.animation.duration; tr.trackTime = +$("rngTime").value / 1000 * d;
  $("lblTime").textContent = `${tr.trackTime.toFixed(2)} / ${d.toFixed(2)}s`;
});
$("rngTime").addEventListener("change", () => { V.scrubbing = false; if (!V.paused) togglePause(); });
$("chkLoop").onchange = () => { const tr = V.state && curTrack(); if (tr) tr.loop = $("chkLoop").checked; };
$("numMix").onchange = () => { if (V.state) V.state.data.defaultMix = +$("numMix").value || 0; };
$("rngSpeed").oninput = () => { V.speed = +$("rngSpeed").value; $("numSpeed").value = V.speed; };
$("numSpeed").oninput = () => { const v = Math.max(0, +$("numSpeed").value || 0); V.speed = v; $("rngSpeed").value = Math.min(v, 10); };
$("colBg").oninput = () => { const h = $("colBg").value; V.bg = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255); };
const DBG_IDS = { dbgBones: "bones", dbgBoneNames: "boneNames", dbgRegions: "regions", dbgHull: "hull", dbgTri: "tri", dbgBBox: "bbox",
  dbgPaths: "paths", dbgClip: "clip", dbgSockets: "sockets", dbgSocketNames: "socketNames" };
for (const [id, k] of Object.entries(DBG_IDS)) $(id).onchange = () => { V.dbg[k] = $(id).checked; };
$("chkHier").onchange = () => { $("hier").classList.toggle("hidden", !$("chkHier").checked || !V.entry); };
$("selFocus").onchange = () => computeVisibility();
$("treeFilter").oninput = () => applyTreeFilter();
$("btnExpand").onclick = () => { forEachNode(n => setOpen(n, true)); applyTreeFilter(); };
$("btnCollapse").onclick = () => { forEachNode(n => setOpen(n, n.depth < 1)); applyTreeFilter(); };
$("btnShowAll").onclick = () => { V.hidBones.clear(); V.hidSlots.clear(); refreshHiddenRows(); computeVisibility(); renderProps(); };
$("selPma").onchange = () => { if (V.entry) openEntry(V.entry); };
$("btnFit").onclick = fitView;
$("btnShot").onclick = () => { V.shot = true; };
$("btnFiles").onclick = () => $("inFiles").click();
$("btnFolder").onclick = () => $("inFolder").click();
$("btnClear").onclick = () => {
  pool.images.clear(); pool.atlases.clear(); pool.skeletons.clear(); skeletonEntries = [];
  V.skeleton = null; V.entry = null; renderSkeletonList();
  ["secInfo", "secAnim", "secView", "secSkin", "hier"].forEach(id => $(id).classList.add("hidden"));
  V.sel = null; TREE.roots = []; TREE.all = []; TREE.slotNodes = []; TREE.boneNodes = []; $("tree").innerHTML = "";
  $("drop").classList.remove("hidden"); $("bar").classList.remove("show"); $("hud").textContent = "";
};
async function onPicked(input) {
  const list = [...input.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name }));
  input.value = ""; await ingest(list);
}
$("inFiles").onchange = () => onPicked($("inFiles"));
$("inFolder").onchange = () => onPicked($("inFolder"));

/* ================= Kéo thả (toàn trang) ================= */
const stage = $("stage");
let dragDepth = 0;
const isFileDrag = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
function showDrag(on) {
  stage.classList.toggle("dragover", on);
  if (on) $("drop").classList.remove("hidden"); else if (V.entry) $("drop").classList.add("hidden");
}
window.addEventListener("dragenter", e => { if (!isFileDrag(e)) return; e.preventDefault(); dragDepth++; showDrag(true); });
window.addEventListener("dragover", e => { if (!isFileDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
window.addEventListener("dragleave", e => { if (!isFileDrag(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) showDrag(false); });
window.addEventListener("drop", async e => {
  e.preventDefault(); dragDepth = 0; showDrag(false);
  const dt = e.dataTransfer; if (!dt) return;
  // Lấy dữ liệu đồng bộ trước mọi await (DataTransfer hết hiệu lực sau khi handler trả về)
  const plain = [], dirs = [];
  for (const it of [...(dt.items || [])]) {
    if (it.kind !== "file") continue;
    let entry = null; try { entry = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; } catch (err) {}
    if (entry && entry.isDirectory) dirs.push(entry);
    else { const f = it.getAsFile(); if (f) plain.push({ file: f, path: f.name }); }
  }
  if (!plain.length && !dirs.length) for (const f of dt.files || []) plain.push({ file: f, path: f.name });
  const out = plain.slice();
  for (const d of dirs) {
    try { await readEntryRecursive(d, "", out); }
    catch (err) { toast("Không đọc được thư mục " + d.name + ": " + err.message + " — hãy dùng nút \"Mở thư mục…\"", "err", 8000); }
  }
  if (!out.length) { toast("Không nhận được file nào. Thử dùng nút \"Mở file…\"", "warn"); return; }
  try { await ingest(out); } catch (err) { toast("Lỗi xử lý file: " + err.message, "err", 8000); console.error(err); }
});

window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox") return;
  if (e.target.tagName === "SELECT") return;
  if (e.code === "Space") { e.preventDefault(); togglePause(); }
  else if (e.code === "Escape") selectNode(null);
  else if (e.code === "KeyH" && V.sel) toggleHidden(V.sel);
  else if (e.code === "KeyF") fitView();
  else if ((e.code === "ArrowRight" || e.code === "ArrowLeft") && V.data && V.data.animations.length) {
    e.preventDefault();
    const arr = V.data.animations, i = arr.findIndex(a => a.name === V.animName);
    const ni = (i + (e.code === "ArrowRight" ? 1 : -1) + arr.length) % arr.length; playAnim(arr[ni].name);
  }
});
window.addEventListener("resize", () => resizeCanvas());

/* Phụ đề liệt kê các version đang hỗ trợ (lấy từ registry) */
{ const vs = RuntimeRegistry.sorted().map(r => r.version);
  $("subtitle").textContent = `Tự nhận diện version · Spine ${vs[0]} → ${vs[vs.length - 1]} · JSON & .skel`; }
