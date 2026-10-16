"use strict";
/* ================= Adapter theo version =================
 * Viewer chỉ gọi runtime qua adapter, nên khác biệt API giữa các version Spine nằm gọn ở đây.
 * Mỗi adapter kế thừa adapter của version trước và chỉ override phần đã thay đổi.
 * Version mới có API thay đổi: tạo class extends adapter gần nhất, đăng ký vào SPINE_ADAPTERS,
 * rồi trỏ `adapter` trong registry.js tới tên đó.
 */

/** Spine 3.6 – 3.8: namespace spine.webgl, atlas nhận textureLoader trong constructor. */
class SpineAdapter3x {
  constructor(spine, runtime) {
    this.spine = spine;
    this.runtime = runtime;
    this.key = runtime.version;
    this.W = spine.webgl || spine; // namespace chứa các class WebGL
  }
  // ---- Khởi tạo WebGL ----
  createContext(canvas) { return new this.W.ManagedWebGLRenderingContext(canvas, { alpha: false, premultipliedAlpha: false, antialias: true }); }
  createRenderer(canvas, ctx) { return new this.W.SceneRenderer(canvas, ctx, true); }
  createTexture(ctx, img, pma) { return new this.W.GLTexture(ctx, img); }
  createAtlas(text, textureFor) { return new this.spine.TextureAtlas(text, path => textureFor(path, null)); }
  // ---- Đọc dữ liệu ----
  readSkeleton(data, isBinary, atlas) {
    const sp = this.spine, loader = new sp.AtlasAttachmentLoader(atlas);
    if (!isBinary) { const j = new sp.SkeletonJson(loader); j.scale = 1; return j.readSkeletonData(data); }
    if (sp.SkeletonBinary) { const b = new sp.SkeletonBinary(loader); b.scale = 1; return b.readSkeletonData(data); }
    // spine-ts 3.6/3.7 không có SkeletonBinary -> dùng bộ đọc port từ spine-libgdx
    return makeLegacyBinaryReader(sp, +this.key.split(".")[1]).readSkeletonData(data, loader);
  }
  canCombineSkins(data) { return !!(data.skins[0] && typeof data.skins[0].addSkin === "function"); }
  // ---- Pose / update ----
  setupPose(sk) { sk.setToSetupPose(); }
  setupSlots(sk) { sk.setSlotsToSetupPose(); }
  updateWorld(sk, dt, physicsMode) { sk.updateWorldTransform(); }
  physicsPose() { return undefined; }
  currentTrack(state, i = 0) { return state.getCurrent(i); }
  // ---- Vẽ ----
  draw(renderer, sk, pma, debug, ignoredBones) {
    renderer.drawSkeleton(sk, pma);
    if (debug) renderer.drawSkeletonDebug(sk, pma, ignoredBones);
  }
  // ---- Truy cập bone / slot ----
  bonePose(b) { return b; }
  boneActive(b) { return b.active === undefined ? true : !!b.active; }
  slotColor(s) { return s.color; }
  slotAttachment(s) { return s.getAttachment(); }
  setSlotAttachment(s, a) { s.setAttachment(a); }
  drawOrder(sk) { return sk.drawOrder; }
  regionOffsets(slot, att) { return att.offset; }
  computeVertexAttachment(sk, slot, att, out) { att.computeWorldVertices(slot, 0, att.worldVerticesLength, out, 0, 2); }
  // ---- Dùng chung cho mọi version ----
  attType(a) {
    if (!a) return null;
    const sp = this.spine;
    // Thứ tự quan trọng: từ 4.3 PointAttachment kế thừa VertexAttachment
    const T = [["point", "PointAttachment"], ["clip", "ClippingAttachment"], ["bbox", "BoundingBoxAttachment"],
      ["path", "PathAttachment"], ["mesh", "MeshAttachment"], ["region", "RegionAttachment"]];
    for (const [k, c] of T) if (sp[c] && a instanceof sp[c]) return k;
    return "other";
  }
  worldVertices(sk, slot, att) {
    const type = this.attType(att);
    if (type === "region") {
      const o = this.regionOffsets(slot, att), bp = this.bonePose(slot.bone), out = new Float32Array(8);
      for (let i = 0; i < 8; i += 2) {
        out[i] = o[i] * bp.a + o[i + 1] * bp.b + bp.worldX;
        out[i + 1] = o[i] * bp.c + o[i + 1] * bp.d + bp.worldY;
      }
      return out;
    }
    if (type === "mesh" || type === "bbox" || type === "clip" || type === "path") {
      const out = new Float32Array(att.worldVerticesLength);
      this.computeVertexAttachment(sk, slot, att, out);
      return out;
    }
    return null;
  }
  pointWorld(slot, att) {
    const bp = this.bonePose(slot.bone), p = att.computeWorldPosition(bp, { x: 0, y: 0 });
    return { x: p.x, y: p.y, rot: att.computeWorldRotation(bp) };
  }
}

/** Spine 4.0 – 4.1: namespace phẳng, TextureAtlas(text) + page.setTexture(). */
class SpineAdapter40 extends SpineAdapter3x {
  createAtlas(text, textureFor) {
    const atlas = new this.spine.TextureAtlas(text);
    for (const page of atlas.pages) page.setTexture(textureFor(page.name, page));
    return atlas;
  }
}

/** Spine 4.2: thêm physics. */
class SpineAdapter42 extends SpineAdapter40 {
  updateWorld(sk, dt, physicsMode) {
    sk.update(dt);
    sk.updateWorldTransform(physicsMode != null ? physicsMode : this.spine.Physics.update);
  }
  physicsPose() { return this.spine.Physics.pose; }
}

/** Spine 4.3: pose tách ra appliedPose, texture tự premultiply, đổi tên setupPose, getTrack. */
class SpineAdapter43 extends SpineAdapter42 {
  createTexture(ctx, img, pma) { return new this.W.GLTexture(ctx, img, pma); }
  setupPose(sk) { sk.setupPose(); }
  setupSlots(sk) { sk.setupPoseSlots(); }
  currentTrack(state, i = 0) { return state.getTrack(i); }
  draw(renderer, sk, pma, debug, ignoredBones) {
    renderer.drawSkeleton(sk);
    if (debug) renderer.drawSkeletonDebug(sk, ignoredBones);
  }
  bonePose(b) { return b.appliedPose; }
  slotColor(s) { return s.appliedPose.color; }
  slotAttachment(s) { return s.appliedPose.attachment; }
  setSlotAttachment(s, a) { s.pose.setAttachment(a); }
  drawOrder(sk) { return sk.drawOrder.appliedPose; }
  regionOffsets(slot, att) { return att.getOffsets(slot.appliedPose); }
  computeVertexAttachment(sk, slot, att, out) { att.computeWorldVertices(sk, slot, 0, att.worldVerticesLength, out, 0, 2); }
}

const SPINE_ADAPTERS = {
  "3.x": SpineAdapter3x,
  "4.0": SpineAdapter40,
  "4.2": SpineAdapter42,
  "4.3": SpineAdapter43,
};

function createAdapter(spine, runtime) {
  const A = SPINE_ADAPTERS[runtime.adapter];
  if (!A) throw new Error(`Chưa có adapter "${runtime.adapter}" cho runtime ${runtime.version}`);
  return new A(spine, runtime);
}
