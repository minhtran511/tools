"use strict";
/* ================= Hierarchy tree / sockets / overlay ================= */
const TREE = { roots: [], all: [], slotNodes: [], boneNodes: [] };
const ATT_LABEL = { region: "R", mesh: "M", point: "⊙", bbox: "BB", path: "P", clip: "C", other: "?" };
const ATT_NAME = { region: "Region", mesh: "Mesh", point: "Point (socket)", bbox: "Bounding box", path: "Path", clip: "Clipping", other: "Khác" };
const INHERIT = ["Normal", "OnlyTranslation", "NoRotationOrReflection", "NoScale", "NoScaleOrReflection"];
const BLEND = ["Normal", "Additive", "Multiply", "Screen"];
const fmt = (v, d = 2) => {
  if (v == null || isNaN(v)) return "—";
  const s = (Math.abs(v) < 1e-9 ? 0 : v).toFixed(d);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};
function forEachNode(fn) { TREE.all.forEach(fn); }
function setOpen(n, open) {
  if (!n.kids) return;
  n.open = open; n.kids.style.display = open ? "" : "none";
  n.tw.textContent = n.children.length ? (open ? "▼" : "▶") : "";
}

function buildTree() {
  const sk = V.skeleton, api = V.api, treeEl = $("tree");
  treeEl.innerHTML = ""; TREE.roots = []; TREE.all = []; TREE.slotNodes = []; TREE.boneNodes = [];
  const mk = (kind, name, depth, parent, extra) => {
    const n = { kind, name, depth, parent, children: [], open: depth < 1, ...extra };
    const wrap = document.createElement("div");
    const row = document.createElement("div"); row.className = "tn-row"; row.style.setProperty("--d", depth);
    const tw = document.createElement("span"); tw.className = "tn-tw";
    const ic = document.createElement("span"); ic.className = "tn-ic ic-" + (kind === "att" ? n.type : kind);
    ic.textContent = kind === "bone" ? "B" : kind === "slot" ? "S" : ATT_LABEL[n.type];
    ic.title = kind === "bone" ? "Bone" : kind === "slot" ? "Slot" : ATT_NAME[n.type];
    const nm = document.createElement("span"); nm.className = "tn-nm"; nm.textContent = name;
    const sub = document.createElement("span"); sub.className = "tn-sub";
    row.append(tw, ic, nm, sub);
    if (kind !== "att") {
      const eye = document.createElement("span"); eye.className = "tn-eye"; eye.textContent = "👁"; eye.title = "Ẩn / hiện";
      eye.onclick = ev => { ev.stopPropagation(); toggleHidden(n); };
      row.append(eye);
    }
    tw.onclick = ev => { ev.stopPropagation(); setOpen(n, !n.open); };
    row.onclick = () => selectNode(n);
    row.ondblclick = () => setOpen(n, !n.open);
    wrap.append(row);
    const kids = document.createElement("div"); wrap.append(kids);
    Object.assign(n, { wrap, row, tw, sub, kids });
    TREE.all.push(n);
    if (parent) { parent.children.push(n); parent.kids.append(wrap); } else { TREE.roots.push(n); treeEl.append(wrap); }
    return n;
  };
  const childBones = sk.bones.map(() => []), slotsOfBone = sk.bones.map(() => []);
  sk.bones.forEach((b, i) => { if (b.data.parent) childBones[b.data.parent.index].push(i); });
  sk.slots.forEach(s => slotsOfBone[s.data.boneData.index].push(s));
  const skins = V.data.skins;
  const addBone = (i, depth, parent) => {
    const b = sk.bones[i], n = mk("bone", b.data.name, depth, parent, { bone: b, index: i });
    TREE.boneNodes[i] = n;
    for (const slot of slotsOfBone[i]) {
      const sn = mk("slot", slot.data.name, depth + 1, n, { slot, index: slot.data.index, attNodes: [] });
      TREE.slotNodes[slot.data.index] = sn;
      for (const skin of skins) {
        const map = skin.attachments && skin.attachments[slot.data.index]; if (!map) continue;
        for (const key of Object.keys(map)) {
          const att = map[key]; if (!att) continue;
          const type = api.attType(att);
          const an = mk("att", key, depth + 2, sn, { att, type, skin: skin.name, slot });
          an.sub.textContent = [att.name && att.name !== key ? att.name : "", skins.length > 1 ? skin.name : ""].filter(Boolean).join(" · ");
          sn.attNodes.push(an);
        }
      }
    }
    for (const c of childBones[i]) addBone(c, depth + 1, n);
  };
  sk.bones.forEach((b, i) => { if (!b.data.parent) addBone(i, 0, null); });
  for (const n of TREE.all) setOpen(n, n.open);
  refreshHiddenRows(); applyTreeFilter(); updateTreeLive(true);
}
function applyTreeFilter() {
  const q = lower($("treeFilter").value.trim());
  const walk = n => {
    let kidsVis = false;
    for (const c of n.children) if (walk(c)) kidsVis = true;
    const self = !q || lower(n.name).includes(q) || (n.kind === "att" && n.att.name && lower(n.att.name).includes(q));
    const vis = self || kidsVis;
    n.wrap.style.display = vis ? "" : "none";
    n.kids.style.display = (q ? kidsVis : n.open) ? "" : "none";
    if (n.children.length) n.tw.textContent = (q ? kidsVis : n.open) ? "▼" : "▶";
    return vis;
  };
  TREE.roots.forEach(walk);
}
function nodeHidden(n) {
  if (n.kind === "bone") return V.hidBones.has(n.index);
  if (n.kind === "slot") return V.hidSlots.has(n.index);
  return false;
}
function toggleHidden(n) {
  if (n.kind === "att") n = n.parent;
  const set = n.kind === "bone" ? V.hidBones : V.hidSlots;
  set.has(n.index) ? set.delete(n.index) : set.add(n.index);
  refreshHiddenRows(); computeVisibility(); renderProps();
}
function refreshHiddenRows() { for (const n of TREE.all) if (n.kind !== "att") n.row.classList.toggle("hid", nodeHidden(n)); }
function boneUnder(boneData, ancestorIndex) { for (let b = boneData; b; b = b.parent) if (b.index === ancestorIndex) return true; return false; }
function slotsOfSelection(n) {
  if (!n) return null;
  if (n.kind === "slot" || n.kind === "att") return new Set([n.kind === "slot" ? n.index : n.slot.data.index]);
  const set = new Set();
  for (const s of V.skeleton.slots) if (boneUnder(s.data.boneData, n.index)) set.add(s.data.index);
  return set;
}
/* Hệ số alpha cho từng slot: ẩn (0), làm mờ (0.15), bình thường (1) */
function computeVisibility() {
  if (!V.skeleton) return;
  const sk = V.skeleton, mul = new Float32Array(sk.slots.length).fill(1);
  const focus = $("selFocus").value, selSlots = focus !== "none" ? slotsOfSelection(V.sel) : null;
  const hiddenByBone = bd => { for (let b = bd; b; b = b.parent) if (V.hidBones.has(b.index)) return true; return false; };
  for (const s of sk.slots) {
    const i = s.data.index;
    if (V.hidSlots.has(i) || hiddenByBone(s.data.boneData)) mul[i] = 0;
    else if (selSlots && !selSlots.has(i)) mul[i] = focus === "solo" ? 0 : 0.15;
  }
  V.alphaMul = mul.some(v => v !== 1) ? mul : null;
  V.ignoredBones = sk.bones.filter(b => hiddenByBone(b.data)).map(b => b.data.name);
}
function selectNode(n, reveal) {
  if (V.sel && V.sel.row) V.sel.row.classList.remove("sel");
  V.sel = n;
  if (n) {
    n.row.classList.add("sel");
    if (reveal) {
      $("treeFilter").value = "";
      for (let p = n.parent; p; p = p.parent) setOpen(p, true);
      applyTreeFilter();
      n.row.scrollIntoView({ block: "nearest" });
    }
  }
  computeVisibility(); renderProps();
}
/* Trạng thái động: attachment đang hiển thị trên slot, bone inactive */
function updateTreeLive(force) {
  if (!V.skeleton || !TREE.all.length) return;
  const api = V.api;
  for (const sn of TREE.slotNodes) {
    if (!sn) continue;
    const cur = api.slotAttachment(sn.slot);
    if (!force && sn.lastAtt === cur) continue;
    sn.lastAtt = cur;
    sn.sub.textContent = cur ? cur.name : "—";
    for (const an of sn.attNodes) an.row.classList.toggle("cur", an.att === cur);
  }
  for (const bn of TREE.boneNodes) if (bn) bn.row.classList.toggle("dim", !api.boneActive(bn.bone));
}

/* ---------- Bảng thông số node đang chọn ---------- */
function renderProps() {
  const box = $("props"), n = V.sel;
  if (!n || !V.skeleton) { box.innerHTML = '<div class="info">Chọn một node trong cây, hoặc click lên nhân vật để chọn slot.</div>'; return; }
  const kindLabel = n.kind === "bone" ? "Bone" : n.kind === "slot" ? "Slot" : ATT_NAME[n.type];
  const icCls = "tn-ic ic-" + (n.kind === "att" ? n.type : n.kind);
  box.innerHTML = `<h3><span class="${icCls}">${n.kind === "bone" ? "B" : n.kind === "slot" ? "S" : ATT_LABEL[n.type]}</span>${escapeHtml(n.name)}</h3>
    <div class="info">${kindLabel}</div><div class="btns" id="propBtns"></div><table id="propTable"></table>`;
  const btns = $("propBtns");
  const addBtn = (label, fn, title) => { const b = document.createElement("button"); b.textContent = label; if (title) b.title = title; b.onclick = fn; btns.append(b); };
  if (n.kind !== "att") addBtn(nodeHidden(n) ? "Hiện" : "Ẩn", () => toggleHidden(n), "Phím H");
  addBtn("Solo", () => { $("selFocus").value = $("selFocus").value === "solo" ? "none" : "solo"; computeVisibility(); }, "Chỉ hiện phần đang chọn");
  if (n.kind === "att") addBtn("Gắn lên slot", () => { V.api.setSlotAttachment(n.slot, n.att); updateTreeLive(true); },
    "Hiển thị attachment này trên slot (animation có key attachment sẽ ghi đè)");
  addBtn("Copy tên", () => { navigator.clipboard && navigator.clipboard.writeText(n.name); toast("Đã copy: " + n.name, "", 1500); });
  renderPropsTable();
}
function renderPropsTable() {
  const t = $("propTable"), n = V.sel; if (!t || !n || !V.skeleton) return;
  const api = V.api, rows = [];
  const sep = s => rows.push(`<tr class="sep"><td colspan="2">${s}</td></tr>`);
  const r = (k, v) => rows.push(`<tr><td>${k}</td><td>${v}</td></tr>`);
  const boneRows = b => {
    const p = api.bonePose(b), wr = Math.atan2(p.c, p.a) * 180 / Math.PI;
    const inh = p.inherit != null ? p.inherit : (b.data.inherit != null ? b.data.inherit : b.data.transformMode);
    sep("Bone · local");
    r("x, y", `${fmt(p.x)}, ${fmt(p.y)}`); r("rotation", fmt(p.rotation)); r("scale", `${fmt(p.scaleX, 3)}, ${fmt(p.scaleY, 3)}`);
    r("shear", `${fmt(p.shearX)}, ${fmt(p.shearY)}`);
    sep("Bone · world");
    r("x, y", `${fmt(p.worldX)}, ${fmt(p.worldY)}`); r("rotation", fmt(wr));
    r("scale", `${fmt(Math.hypot(p.a, p.c), 3)}, ${fmt(Math.hypot(p.b, p.d), 3)}`);
    sep("Bone · data");
    r("bone", escapeHtml(b.data.name));
    r("parent", b.data.parent ? escapeHtml(b.data.parent.name) : "—"); r("length", fmt(b.data.length));
    r("inherit", INHERIT[inh] || inh); r("active", api.boneActive(b) ? "có" : "không (skin required)");
  };
  if (n.kind === "bone") {
    boneRows(n.bone);
    r("bone con", n.children.filter(c => c.kind === "bone").length); r("slot", n.children.filter(c => c.kind === "slot").length);
  } else {
    const slot = n.slot, cur = api.slotAttachment(slot), col = api.slotColor(slot);
    if (n.kind === "att") {
      const a = n.att; sep("Attachment");
      r("tên thật", escapeHtml(a.name || n.name)); r("skin", escapeHtml(n.skin)); r("đang hiển thị", a === cur ? "có" : "không");
      if (a.path) r("path", escapeHtml(a.path));
      if (n.type === "region") {
        r("x, y", `${fmt(a.x)}, ${fmt(a.y)}`); r("rotation", fmt(a.rotation));
        r("scale", `${fmt(a.scaleX, 3)}, ${fmt(a.scaleY, 3)}`); r("w × h", `${fmt(a.width)} × ${fmt(a.height)}`);
      }
      if (n.type === "mesh") {
        r("vertices", a.worldVerticesLength / 2); r("triangles", a.triangles ? a.triangles.length / 3 : "—");
        r("weighted", a.bones ? "có" : "không"); r("hull", a.hullLength / 2);
        const pm = a.getParentMesh ? a.getParentMesh() : a.parentMesh; if (pm) r("linked tới", escapeHtml(pm.name));
      }
      if (n.type === "point") {
        const w = api.pointWorld(slot, a); sep("Socket");
        r("local x, y", `${fmt(a.x)}, ${fmt(a.y)}`); r("local rotation", fmt(a.rotation));
        r("world x, y", `${fmt(w.x)}, ${fmt(w.y)}`); r("world rotation", fmt(w.rot));
      }
      if (n.type === "bbox" || n.type === "clip" || n.type === "path") r("vertices", a.worldVerticesLength / 2);
      if (n.type === "clip" && a.endSlot) r("end slot", escapeHtml(a.endSlot.name));
    }
    sep("Slot");
    r("slot", escapeHtml(slot.data.name));
    r("attachment", cur ? escapeHtml(cur.name) + ` <span class="info">(${ATT_NAME[api.attType(cur)]})</span>` : "—");
    r("color", `<span class="sw" style="background:rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},${col.a})"></span> ${fmt(col.r, 3)}, ${fmt(col.g, 3)}, ${fmt(col.b, 3)}, ${fmt(col.a, 3)}`);
    r("blend", BLEND[slot.data.blendMode] || slot.data.blendMode);
    r("draw order", api.drawOrder(V.skeleton).indexOf(slot));
    boneRows(slot.bone);
  }
  t.innerHTML = rows.join("");
}

/* ---------- Click chọn slot trên canvas ---------- */
function screenToWorld(clientX, clientY) {
  const c = V.canvas, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, cam = V.renderer.camera;
  return { x: cam.position.x + ((clientX - r.left) * dpr - c.width / 2) * cam.zoom, y: cam.position.y + (c.height / 2 - (clientY - r.top) * dpr) * cam.zoom };
}
function pointInPoly(x, y, v, n) {
  let inside = false;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = v[i], yi = v[i + 1], xj = v[j], yj = v[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInTri(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function pickAt(clientX, clientY) {
  if (!V.skeleton || !TREE.slotNodes.length) return;
  const api = V.api, sk = V.skeleton, p = screenToWorld(clientX, clientY), order = api.drawOrder(sk);
  for (let i = order.length - 1; i >= 0; i--) {
    const slot = order[i], idx = slot.data.index;
    if (V.alphaMul && V.alphaMul[idx] < 0.5) continue;
    if (!api.boneActive(slot.bone) || api.slotColor(slot).a <= 0.02) continue;
    const att = api.slotAttachment(slot), type = api.attType(att);
    if (type !== "region" && type !== "mesh") continue;
    const v = api.worldVertices(sk, slot, att); if (!v) continue;
    let hit = false;
    if (type === "region") hit = pointInPoly(p.x, p.y, v, 8);
    else {
      const tr = att.triangles;
      for (let k = 0; k < tr.length && !hit; k += 3) {
        const a = tr[k] * 2, b = tr[k + 1] * 2, c = tr[k + 2] * 2;
        hit = pointInTri(p.x, p.y, v[a], v[a + 1], v[b], v[b + 1], v[c], v[c + 1]);
      }
    }
    if (hit) { selectNode(TREE.slotNodes[idx], true); return; }
  }
  selectNode(null);
}

/* ---------- Overlay 2D: highlight, sockets, tên bone ---------- */
function clearOverlay() { const o = $("overlay"); o.getContext("2d").clearRect(0, 0, o.width, o.height); }
function drawOverlay() {
  const o = $("overlay"), c = V.canvas;
  if (o.width !== c.width || o.height !== c.height) { o.width = c.width; o.height = c.height; }
  const g = o.getContext("2d"); g.clearRect(0, 0, o.width, o.height);
  if (!V.skeleton) return;
  const api = V.api, sk = V.skeleton, cam = V.renderer.camera, dpr = window.devicePixelRatio || 1, W = o.width, H = o.height;
  const sx = x => (x - cam.position.x) / cam.zoom + W / 2, sy = y => H / 2 - (y - cam.position.y) / cam.zoom;
  const font = `${11 * dpr}px system-ui, sans-serif`;
  const label = (text, x, y, color) => {
    g.font = font; const w = g.measureText(text).width, pad = 3 * dpr;
    g.fillStyle = "rgba(0,0,0,.65)"; g.fillRect(x + 6 * dpr, y - 8 * dpr, w + pad * 2, 15 * dpr);
    g.fillStyle = color; g.fillText(text, x + 6 * dpr + pad, y + 3 * dpr);
  };
  const hiddenSlot = s => V.alphaMul && V.alphaMul[s.data.index] === 0;
  if (V.dbg.boneNames) for (const b of sk.bones) {
    if (!api.boneActive(b) || V.ignoredBones.includes(b.data.name)) continue;
    const p = api.bonePose(b); label(b.data.name, sx(p.worldX), sy(p.worldY), "#ffb3b3");
  }
  const drawSocket = (slot, att, color, big, name) => {
    const w = api.pointWorld(slot, att), x = sx(w.x), y = sy(w.y), r = (big ? 7 : 5) * dpr, rad = -w.rot * Math.PI / 180;
    g.strokeStyle = color; g.lineWidth = (big ? 2.5 : 1.5) * dpr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(rad) * r * 2.6, y + Math.sin(rad) * r * 2.6); g.stroke();
    if (name) label(name, x + r, y, color);
  };
  if (V.dbg.sockets || V.dbg.socketNames) for (const slot of sk.slots) {
    if (hiddenSlot(slot) || !api.boneActive(slot.bone)) continue;
    const att = api.slotAttachment(slot);
    if (api.attType(att) === "point") drawSocket(slot, att, "#ffcc33", false, V.dbg.socketNames ? att.name : null);
  }
  const n = V.sel; if (!n) return;
  const HL = "#33d1ff";
  const drawBone = (b, strong) => {
    const p = api.bonePose(b), x0 = sx(p.worldX), y0 = sy(p.worldY);
    const len = b.data.length, x1 = sx(p.worldX + len * p.a), y1 = sy(p.worldY + len * p.c);
    g.strokeStyle = HL; g.fillStyle = HL; g.lineWidth = (strong ? 3 : 1.5) * dpr;
    if (len > 0) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    g.beginPath(); g.arc(x0, y0, (strong ? 4.5 : 3) * dpr, 0, Math.PI * 2); g.fill();
  };
  const drawPoly = (v, closed, fill) => {
    if (!v || v.length < 4) return;
    g.beginPath(); g.moveTo(sx(v[0]), sy(v[1]));
    for (let i = 2; i < v.length; i += 2) g.lineTo(sx(v[i]), sy(v[i + 1]));
    if (closed) g.closePath();
    if (fill) { g.fillStyle = "rgba(51,209,255,.15)"; g.fill(); }
    g.strokeStyle = HL; g.lineWidth = 2 * dpr; g.stroke();
  };
  const drawAtt = (slot, att) => {
    const type = api.attType(att);
    if (type === "point") { drawSocket(slot, att, HL, true, att.name); return; }
    const v = api.worldVertices(sk, slot, att); if (!v) return;
    if (type === "mesh") {
      const tr = att.triangles; g.strokeStyle = "rgba(51,209,255,.35)"; g.lineWidth = 1 * dpr; g.beginPath();
      for (let k = 0; k < tr.length; k += 3) {
        const a = tr[k] * 2, b = tr[k + 1] * 2, c2 = tr[k + 2] * 2;
        g.moveTo(sx(v[a]), sy(v[a + 1])); g.lineTo(sx(v[b]), sy(v[b + 1])); g.lineTo(sx(v[c2]), sy(v[c2 + 1])); g.closePath();
      }
      g.stroke();
      drawPoly(v.subarray(0, att.hullLength), true, true);
    } else drawPoly(v, type !== "path" || att.closed, type !== "path");
  };
  if (n.kind === "bone") {
    for (const b of sk.bones) if (b !== n.bone && boneUnder(b.data, n.index)) drawBone(b, false);
    drawBone(n.bone, true);
    const p = api.bonePose(n.bone); label(n.name, sx(p.worldX), sy(p.worldY) - 14 * dpr, HL);
  } else {
    const slot = n.slot, cur = api.slotAttachment(slot);
    drawBone(slot.bone, false);
    if (n.kind === "slot") { if (cur) drawAtt(slot, cur); }
    else if (n.att === cur || n.type === "point") drawAtt(slot, n.att);
  }
}
