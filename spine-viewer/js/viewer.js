"use strict";
/* ================= Viewer state ================= */
const V = {
  api: null, canvas: null, ctx: null, renderer: null, gl: null,
  skeleton: null, state: null, data: null, entry: null, pma: false, pmaAuto: false,
  paused: false, speed: 1,
  dbg: { bones: false, boneNames: false, regions: false, hull: false, tri: false, bbox: false, paths: false, clip: false, sockets: false, socketNames: false },
  sel: null, hidBones: new Set(), hidSlots: new Set(), alphaMul: null, ignoredBones: [], lastTreeUpd: 0, bg: [0.169, 0.184, 0.22], last: 0, shot: false,
  scrubbing: false, animName: null, skins: [],
};
function ensureCanvas(api) {
  if (V.api && V.api.key === api.key && V.canvas) return;
  if (V.canvas) {
    try { const ext = V.ctx.gl.getExtension("WEBGL_lose_context"); ext && ext.loseContext(); } catch (e) {}
    V.canvas.remove();
  }
  const c = document.createElement("canvas"); $("canvasWrap").appendChild(c);
  V.canvas = c; V.api = api;
  resizeCanvas();
  V.ctx = api.createContext(c); V.gl = V.ctx.gl;
  V.renderer = api.createRenderer(c, V.ctx);
  bindCanvasInput(c);
}
function resizeCanvas() {
  if (!V.canvas) return;
  const dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.round(V.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(V.canvas.clientHeight * dpr));
  if (V.canvas.width !== w || V.canvas.height !== h) { V.canvas.width = w; V.canvas.height = h; }
}

/* Đoán premultiplied alpha từ pixel ảnh: ảnh PMA luôn có r,g,b <= a */
function guessPMA(img) {
  try {
    const max = 512, s = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true }); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data; let semi = 0, over = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]; if (a === 0 || a > 245) continue; semi++;
      if (Math.max(d[i], d[i + 1], d[i + 2]) > a + 6) over++;
    }
    if (semi < 20) return null;
    return over / semi < 0.1;
  } catch (e) { return null; }
}

async function openEntry(entry) {
  if (!entry.rtKey) { toast(entry.name + ": không nhận diện được version Spine", "err"); return; }
  if (!entry.exact) toast(`${entry.name}: version ${entry.version} không có runtime riêng, dùng runtime ${entry.rtKey}`, "warn", 6000);
  const atlasPath = findAtlasFor(entry.path);
  if (!atlasPath) { toast("Thiếu file .atlas cho " + entry.name, "err"); return; }
  let spine, api;
  try { const rt = RuntimeRegistry.get(entry.rtKey); spine = await loadRuntime(rt); api = createAdapter(spine, rt); }
  catch (e) { toast("Lỗi nạp runtime " + entry.rtKey + ": " + e.message, "err"); return; }
  ensureCanvas(api);

  const atlasText = pool.atlases.get(atlasPath);
  const mode = $("selPma").value;
  const atlasHasPmaFlag = /^\s*pma\s*:/im.test(atlasText);
  let atlasPma = /^\s*pma\s*:\s*true/im.test(atlasText), guessed = null;
  const missing = [];
  const pagesImg = [];
  const textureFor = (pageName, page) => {
    let img = findImage(pageName, atlasPath);
    if (!img) { missing.push(pageName); const c = document.createElement("canvas"); c.width = c.height = 2; img = c; }
    else pagesImg.push(img);
    if (guessed == null && img.tagName === "IMG") guessed = guessPMA(img);
    let pma;
    if (mode === "on") pma = true; else if (mode === "off") pma = false;
    else pma = atlasHasPmaFlag ? atlasPma : !!guessed;
    V.pma = pma;
    return api.createTexture(V.ctx, img, page ? (mode === "auto" ? (atlasHasPmaFlag ? page.pma : !!guessed) : pma) : pma);
  };
  let atlas, data;
  try {
    atlas = api.createAtlas(atlasText, textureFor);
    for (const page of atlas.pages) {
      const fix = f => (f >= 9984 ? 9729 : f); // tránh mipmap trên texture NPOT
      if (page.texture && page.texture.setFilters) page.texture.setFilters(fix(page.minFilter), fix(page.magFilter));
    }
  } catch (e) { toast("Lỗi đọc atlas " + atlasPath + " (runtime " + entry.rtKey + "): " + e.message + (dirName(atlasPath) !== dirName(entry.path) ? " — atlas không cùng thư mục, có thể không phải của skeleton này" : ""), "err", 9000); console.error(e); return; }
  if (missing.length) toast("Thiếu ảnh: " + missing.join(", "), "warn", 8000);
  try { data = api.readSkeleton(entry.data, entry.isBinary, atlas); }
  catch (e) { toast("Lỗi đọc skeleton (" + entry.rtKey + "): " + e.message, "err", 8000); console.error(e); return; }

  V.pmaAuto = mode === "auto";
  V.entry = entry; V.data = data; V.atlasPath = atlasPath;
  V.skeleton = new spine.Skeleton(data);
  const sd = new spine.AnimationStateData(data); sd.defaultMix = +$("numMix").value || 0;
  V.state = new spine.AnimationState(sd);
  V.state.addListener({
    start() {}, interrupt() {}, end() {}, dispose() {}, complete() {},
    event(_, e) { toast("Event: " + e.data.name + (e.stringValue ? " \"" + e.stringValue + "\"" : ""), "ev", 1500); },
  });
  api.setupPose(V.skeleton);
  api.updateWorld(V.skeleton, 0);

  // UI
  $("info").textContent =
    `File: ${entry.path}\nAtlas: ${atlasPath}\nSpine: ${entry.version || "?"}  →  runtime ${entry.rtKey}${entry.exact ? "" : " (gần nhất)"}\n` +
    `Định dạng: ${entry.isBinary ? "Binary (.skel)" : "JSON"}\nBones: ${data.bones.length} · Slots: ${data.slots.length} · Skins: ${data.skins.length}\n` +
    `Animations: ${data.animations.length} · Kích thước: ${Math.round(data.width || 0)}×${Math.round(data.height || 0)}\n` +
    `PMA: ${V.pma ? "bật" : "tắt"}${mode === "auto" ? (atlasHasPmaFlag ? " (theo atlas)" : " (đoán từ ảnh)") : ""}`;
  // Giữ skin đang chọn khi mở lại / đổi file nếu tên skin vẫn tồn tại
  const kept = (V.skins || []).filter(n => data.findSkin(n));
  if (kept.length) V.skins = kept;
  else {
    // default skin luôn được runtime dùng làm fallback, nên ưu tiên skin riêng đầu tiên
    const first = data.skins.find(sk => sk !== data.defaultSkin && sk.name !== "default") || data.skins[0];
    V.skins = first ? [first.name] : [];
  }
  applySkin(); renderSkinList();
  $("secSkin").classList.toggle("hidden", !data.skins.length);
  renderAnimList();
  ["secInfo", "secAnim", "secView"].forEach(id => $(id).classList.remove("hidden"));
  $("drop").classList.add("hidden"); $("bar").classList.add("show");
  renderSkeletonList();
  V.sel = null; V.hidBones.clear(); V.hidSlots.clear();
  buildTree(); computeVisibility(); renderProps();
  $("hier").classList.toggle("hidden", !$("chkHier").checked);
  const keep = V.animName && data.findAnimation(V.animName) ? V.animName : (data.animations[0] && data.animations[0].name);
  if (keep) playAnim(keep, false); else { V.animName = null; fitView(); }
  fitView();
}
function curTrack() { return V.state ? V.api.currentTrack(V.state, 0) : null; }
function emptySkin(skin) {
  try { if (skin.attachments) return skin.attachments.every(m => !m || Object.keys(m).length === 0); } catch (e) {}
  return false;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function canCombineSkins() { return !!V.data && V.api.canCombineSkins(V.data); }
function applySkin() {
  if (!V.skeleton || !V.skins.length) return;
  try {
    if (V.skins.length === 1) V.skeleton.setSkinByName(V.skins[0]);
    else { // ghép nhiều skin (Spine 3.8+)
      const combined = new V.api.spine.Skin(V.skins.join("+"));
      for (const n of V.skins) combined.addSkin(V.data.findSkin(n));
      V.skeleton.setSkin(combined);
    }
    V.api.setupSlots(V.skeleton);
    if (V.state) V.state.apply(V.skeleton); // áp lại attachment của animation đang chạy
  } catch (e) { toast("Skin lỗi: " + e.message, "err"); }
}
function renderSkinList() {
  const list = $("skinList"), multi = canCombineSkins(); list.innerHTML = "";
  $("skinCount").textContent = V.data.skins.length;
  for (const sk of V.data.skins) {
    const on = V.skins.includes(sk.name);
    const el = document.createElement("div"); el.className = "item" + (on ? " active" : "");
    el.innerHTML = (multi ? `<span class="ck">${on ? "✓" : ""}</span>` : "") + `<span class="n" style="flex:1">${escapeHtml(sk.name)}</span>`;
    el.onclick = e => {
      const toggle = multi && (e.ctrlKey || e.metaKey || e.shiftKey || e.target.classList.contains("ck"));
      if (toggle) {
        if (on && V.skins.length > 1) V.skins = V.skins.filter(n => n !== sk.name);
        else if (!on) V.skins = [...V.skins, sk.name];
      } else V.skins = [sk.name];
      applySkin(); renderSkinList();
    };
    list.appendChild(el);
  }
  $("skinHint").textContent = multi ? "Click: chọn 1 skin · Ctrl+Click hoặc tick ô vuông: ghép nhiều skin" : "Spine " + V.api.key + " không hỗ trợ ghép skin, chỉ chọn 1.";
}
function playAnim(name) {
  if (!V.state || !V.skeleton) return;
  V.animName = name;
  V.state.data.defaultMix = +$("numMix").value || 0;
  if (!(+$("numMix").value)) { V.api.setupPose(V.skeleton); }
  V.state.setAnimation(0, name, $("chkLoop").checked);
  [...$("animList").children].forEach(el => el.classList.toggle("active", el.dataset.name === name));
}
function renderAnimList() {
  const list = $("animList"); list.innerHTML = "";
  $("animCount").textContent = V.data.animations.length;
  for (const a of V.data.animations) {
    const el = document.createElement("div"); el.className = "item"; el.dataset.name = a.name;
    el.innerHTML = `<span class="n">${escapeHtml(a.name)}</span><span class="d">${a.duration.toFixed(2)}s</span>`;
    el.onclick = () => { playAnim(a.name); if (V.paused) togglePause(); };
    list.appendChild(el);
  }
}
function renderSkeletonList() {
  const list = $("skList");
  $("skCount").textContent = skeletonEntries.length || "";
  if (!skeletonEntries.length) { list.innerHTML = '<div class="info">Chưa có dữ liệu. Kéo thả .json/.skel + .atlas + ảnh vào khung bên phải.</div>'; return; }
  list.innerHTML = "";
  for (const e of skeletonEntries) {
    const el = document.createElement("div"); el.className = "item" + (V.entry && V.entry.path === e.path ? " active" : "");
    const cls = !e.rtKey ? "bad" : e.rtKey.startsWith("3") ? "v3" : "v4";
    el.title = e.path;
    el.innerHTML = `<span class="n">${escapeHtml(e.name)}</span><span class="badge ${cls}">${escapeHtml(e.version || "?")}</span>`;
    el.onclick = () => openEntry(e);
    list.appendChild(el);
  }
}

/* ================= Camera ================= */
function computeBounds() {
  const sp = V.api.spine, sk = V.skeleton, off = new sp.Vector2(), size = new sp.Vector2();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = () => {
    sk.getBounds(off, size, []);
    if (isFinite(off.x) && isFinite(size.x) && size.x > 0) {
      minX = Math.min(minX, off.x); minY = Math.min(minY, off.y); maxX = Math.max(maxX, off.x + size.x); maxY = Math.max(maxY, off.y + size.y);
    }
  };
  const entry = curTrack();
  if (entry && entry.animation && entry.animation.duration > 0) {
    // Lấy mẫu animation để khung bao trọn chuyển động
    const tmp = new sp.AnimationState(new sp.AnimationStateData(V.data));
    V.api.setupPose(sk); tmp.setAnimation(0, entry.animation.name, true);
    const steps = 12, dt = entry.animation.duration / steps;
    for (let i = 0; i <= steps; i++) { tmp.apply(sk); V.api.updateWorld(sk, 0, V.api.physicsPose()); acc(); tmp.update(dt); }
    V.api.setupPose(sk);
    V.state.apply(sk); V.api.updateWorld(sk, 0, V.api.physicsPose());
  } else { V.api.updateWorld(sk, 0, V.api.physicsPose()); acc(); }
  if (!isFinite(minX)) return { x: -100, y: -100, w: 200, h: 200 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function fitView() {
  if (!V.skeleton) return;
  resizeCanvas();
  const b = computeBounds(), cam = V.renderer.camera, w = V.canvas.width, h = V.canvas.height;
  cam.position.x = b.x + b.w / 2; cam.position.y = b.y + b.h / 2;
  cam.zoom = Math.max(b.w / (w * 0.85), b.h / (h * 0.8), 0.01);
}
function bindCanvasInput(c) {
  let drag = null;
  let downAt = null;
  c.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; downAt = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); c.style.cursor = "grabbing"; });
  c.addEventListener("pointerup", e => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) pickAt(e.clientX, e.clientY);
    downAt = null;
  });
  c.addEventListener("pointermove", e => {
    if (!drag || !V.renderer) return;
    const dpr = window.devicePixelRatio || 1, cam = V.renderer.camera;
    cam.position.x -= (e.clientX - drag.x) * dpr * cam.zoom; cam.position.y += (e.clientY - drag.y) * dpr * cam.zoom;
    drag = { x: e.clientX, y: e.clientY };
  });
  const up = () => { drag = null; c.style.cursor = ""; };
  c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
  c.addEventListener("dblclick", fitView);
  c.addEventListener("wheel", e => {
    e.preventDefault(); if (!V.renderer) return;
    const dpr = window.devicePixelRatio || 1, cam = V.renderer.camera, r = c.getBoundingClientRect();
    const sx = (e.clientX - r.left) * dpr - c.width / 2, sy = c.height / 2 - (e.clientY - r.top) * dpr;
    const wx = cam.position.x + sx * cam.zoom, wy = cam.position.y + sy * cam.zoom;
    cam.zoom *= Math.pow(1.0015, e.deltaY);
    cam.zoom = Math.min(Math.max(cam.zoom, 0.005), 200);
    cam.position.x = wx - sx * cam.zoom; cam.position.y = wy - sy * cam.zoom;
  }, { passive: false });
}

/* ================= Render loop ================= */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = V.last ? Math.min((now - V.last) / 1000, 0.1) : 0; V.last = now;
  if (!V.renderer) return;
  resizeCanvas();
  if (!V.skeleton) clearOverlay();
  const gl = V.gl, cam = V.renderer.camera;
  gl.viewport(0, 0, V.canvas.width, V.canvas.height);
  cam.viewportWidth = V.canvas.width; cam.viewportHeight = V.canvas.height;
  gl.clearColor(V.bg[0], V.bg[1], V.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
  if (!V.skeleton) return;
  const step = V.paused || V.scrubbing ? 0 : dt * V.speed;
  try {
    V.state.update(step); V.state.apply(V.skeleton); V.api.updateWorld(V.skeleton, step);
    const g = V.dbg, dr = V.renderer.skeletonDebugRenderer, dbgOn = g.bones || g.regions || g.hull || g.tri || g.bbox || g.paths || g.clip;
    if (dr) { dr.drawBones = g.bones; dr.drawRegionAttachments = g.regions; dr.drawMeshHull = g.hull; dr.drawMeshTriangles = g.tri;
      dr.drawBoundingBoxes = g.bbox; dr.drawPaths = g.paths; dr.drawClipping = g.clip; dr.drawSkeletonXY = false; }
    // Ẩn / làm mờ slot bằng cách tạm hạ alpha màu slot trong lúc vẽ
    const saved = [];
    if (V.alphaMul) for (const slot of V.skeleton.slots) {
      const m = V.alphaMul[slot.data.index]; if (m === 1) continue;
      const col = V.api.slotColor(slot); saved.push(col, col.a); col.a *= m;
    }
    V.renderer.begin(); V.api.draw(V.renderer, V.skeleton, V.pma, dbgOn, V.ignoredBones.length ? V.ignoredBones : undefined); V.renderer.end();
    for (let i = 0; i < saved.length; i += 2) saved[i].a = saved[i + 1];
  } catch (e) { toast("Lỗi render: " + e.message, "err"); console.error(e); V.skeleton = null; return; }
  try { drawOverlay(); } catch (e) { console.error(e); }
  if (now - V.lastTreeUpd > 200) { V.lastTreeUpd = now; try { updateTreeLive(); renderPropsTable(); } catch (e) { console.error(e); } }
  if (V.shot) { V.shot = false; V.canvas.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b);
    a.download = (stripExt(V.entry.name) + "_" + (V.animName || "pose")).replace(/[^\w.-]+/g, "_") + ".png"; a.click(); }); }
  const tr = curTrack();
  if (tr && tr.animation) {
    const d = tr.animation.duration, t = d > 0 ? (tr.loop ? tr.trackTime % d : Math.min(tr.trackTime, d)) : 0;
    if (!V.scrubbing) $("rngTime").value = d > 0 ? Math.round(t / d * 1000) : 0;
    $("lblTime").textContent = `${t.toFixed(2)} / ${d.toFixed(2)}s`;
  }
  $("hud").textContent = `Spine ${V.entry.version || "?"} · runtime ${V.api.key} · zoom ${(1 / cam.zoom * 100).toFixed(0)}%`;
}
requestAnimationFrame(frame);
