"use strict";
/* ================= File pool ================= */
const pool = { images: new Map(), atlases: new Map(), skeletons: new Map() }; // key = path
let skeletonEntries = []; // {path, name, version, rtKey, exact, isBinary, data, atlasPath}

async function readEntryRecursive(entry, prefix, out) {
  if (entry.isFile) {
    const f = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file: f, path: (prefix + f.name).replace(/^\/+/, "") });
  } else if (entry.isDirectory) {
    const reader = entry.createReader(); let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const e of batch) await readEntryRecursive(e, prefix + entry.name + "/", out);
    } while (batch.length);
  }
}
function classify(name) {
  const n = lower(name);
  if (/\.(png|jpe?g|webp)(\.bytes)?$/.test(n)) return "image";
  if (/\.atlas(\.txt|\.bytes)?$/.test(n)) return "atlas";
  if (/\.json(\.txt|\.bytes)?$/.test(n)) return "json";
  if (/\.skel(\.bytes|\.txt)?$/.test(n) || /\.bytes$/.test(n)) return "skel";
  if (/\.txt$/.test(n)) return "maybeAtlas";
  return null;
}
async function addFiles(list) {
  let added = 0;
  for (const { file, path } of list) {
    const kind = classify(file.name);
    try {
      if (kind === "image") {
        const url = URL.createObjectURL(file);
        const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Không đọc được ảnh")); im.src = url; });
        pool.images.set(path, img); added++;
      } else if (kind === "atlas" || kind === "maybeAtlas") {
        const text = await file.text();
        if (kind === "maybeAtlas" && !/\n\s*(size|format|filter|repeat|pma)\s*:/i.test(text)) continue;
        pool.atlases.set(path, text); added++;
      } else if (kind === "json") {
        const text = await file.text(); let obj;
        try { obj = JSON.parse(text); } catch (e) { continue; }
        if (!obj || (!obj.skeleton && !obj.bones)) continue;
        const version = (obj.skeleton && obj.skeleton.spine) || null;
        pool.skeletons.set(path, { path, isBinary: false, data: text, version }); added++;
      } else if (kind === "skel") {
        const u8 = new Uint8Array(await file.arrayBuffer());
        const version = detectBinaryVersion(u8);
        if (!version && /\.bytes$/i.test(file.name) && !/\.skel/i.test(file.name)) continue;
        pool.skeletons.set(path, { path, isBinary: true, data: u8, version }); added++;
      }
    } catch (e) { toast(file.name + ": " + e.message, "err"); }
  }
  rebuildEntries();
  return added;
}
function findAtlasFor(skPath) {
  const atl = [...pool.atlases.keys()]; if (!atl.length) return null;
  const dir = dirName(skPath), base = lower(stripExt(baseName(skPath)));
  const sameBase = atl.filter(a => lower(stripExt(baseName(a))) === base);
  return sameBase.find(a => dirName(a) === dir) || sameBase[0]
    || atl.find(a => dirName(a) === dir && atl.filter(x => dirName(x) === dir).length === 1)
    || (atl.length === 1 ? atl[0] : atl.find(a => dirName(a) === dir) || atl[0]);
}
function findImage(pageName, atlasPath) {
  const dir = dirName(atlasPath), full = (dir ? dir + "/" : "") + pageName;
  if (pool.images.has(full)) return pool.images.get(full);
  const bn = lower(baseName(pageName)), bnNoExt = lower(stripExt(bn));
  let cand = null;
  for (const [p, img] of pool.images) {
    const b = lower(baseName(p));
    if (b === bn || b === bn + ".bytes") { if (dirName(p) === dir) return img; cand = cand || img; }
  }
  if (cand) return cand;
  for (const [p, img] of pool.images) if (lower(stripExt(baseName(p))) === bnNoExt) return img;
  return null;
}
function rebuildEntries() {
  skeletonEntries = [...pool.skeletons.values()].map(s => {
    const rt = RuntimeRegistry.resolve(s.version);
    return { ...s, name: baseName(s.path), rtKey: rt && rt.runtime.version, exact: rt && rt.exact };
  }).sort((a, b) => a.path.localeCompare(b.path));
  renderSkeletonList();
}

/* ================= Giải nén .zip (không cần thư viện) ================= */
async function inflateRaw(u8) {
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), out = [];
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("file zip không hợp lệ");
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loc = dv.getUint32(p + 42, true), name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || !classify(baseName(name))) continue;
    const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    const raw = u8.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw.slice(); else if (method === 8) data = await inflateRaw(raw);
    else { toast(name + ": kiểu nén zip không hỗ trợ (" + method + ")", "warn"); continue; }
    out.push({ name, data });
  }
  return out;
}
async function expandZips(list) {
  const res = [];
  for (const it of list) {
    if (!/\.zip$/i.test(it.file.name)) { res.push(it); continue; }
    try {
      const prefix = it.path.replace(/\.zip$/i, "") + "/";
      for (const z of await unzip(await it.file.arrayBuffer())) res.push({ file: new File([z.data], baseName(z.name)), path: prefix + z.name });
    } catch (err) { toast(it.file.name + ": " + err.message, "err"); }
  }
  return res;
}
async function ingest(list) {
  list = await expandZips(list);
  const before = new Set(pool.skeletons.keys());
  const n = await addFiles(list);
  if (!n) { toast("Không tìm thấy file Spine hợp lệ trong " + list.length + " file (.json/.skel/.atlas/.png/.zip)", "warn", 6000); return; }
  toast(`Đã nạp ${n} file · ${skeletonEntries.length} skeleton`, "", 2500);
  const fresh = skeletonEntries.filter(e => !before.has(e.path));
  const target = fresh[0] || (V.entry ? null : skeletonEntries[0]);
  if (target) await openEntry(target);
  else if (V.entry) await openEntry(skeletonEntries.find(e => e.path === V.entry.path) || V.entry); // ảnh/atlas mới -> nạp lại
}
