"use strict";
/* ================= Danh sách runtime Spine =================
 * Muốn hỗ trợ thêm 1 version Spine mới:
 *   1. Tải spine-webgl bản IIFE của version đó vào thư mục runtimes/
 *      npm:  https://cdn.jsdelivr.net/npm/@esotericsoftware/spine-webgl@<ver>/dist/iife/spine-webgl.min.js
 *   2. Thêm 1 dòng vào SPINE_RUNTIMES bên dưới.
 *   3. `adapter`: tên adapter trong js/runtimes/adapters.js.
 *      - API runtime không đổi so với bản trước -> dùng lại adapter cũ, xong.
 *      - API có thay đổi -> tạo class mới kế thừa adapter gần nhất, chỉ override chỗ khác biệt,
 *        rồi đăng ký vào SPINE_ADAPTERS.
 * File được nhận diện theo major.minor (vd "4.2.43" -> "4.2"). Version không có trong danh sách
 * sẽ dùng runtime gần nhất phía dưới (hoặc thấp nhất/cao nhất nếu nằm ngoài khoảng).
 */
const SPINE_RUNTIMES = [
  { version: "3.6", file: "runtimes/spine-webgl-3.6.js",      adapter: "3.x" },
  { version: "3.7", file: "runtimes/spine-webgl-3.7.js",      adapter: "3.x" },
  { version: "3.8", file: "runtimes/spine-webgl-3.8.js",      adapter: "3.x" },
  { version: "4.0", file: "runtimes/spine-webgl-4.0.31.js",   adapter: "4.0" },
  { version: "4.1", file: "runtimes/spine-webgl-4.1.56.js",   adapter: "4.0" },
  { version: "4.2", file: "runtimes/spine-webgl-4.2.120.js",  adapter: "4.2" },
  { version: "4.3", file: "runtimes/spine-webgl-4.3.13.js",   adapter: "4.3" },
];

const RuntimeRegistry = {
  VERSION_RE: /^(\d+)\.(\d+)/,
  parse(v) { const m = this.VERSION_RE.exec(v || ""); return m ? [+m[1], +m[2]] : null; },
  cmp(a, b) { return a[0] - b[0] || a[1] - b[1]; },
  sorted() { return SPINE_RUNTIMES.slice().sort((a, b) => this.cmp(this.parse(a.version), this.parse(b.version))); },
  get(version) { return SPINE_RUNTIMES.find(r => r.version === version) || null; },
  /** Chọn runtime cho version đọc được từ file. @returns {{runtime, exact}|null} */
  resolve(fileVersion) {
    const v = this.parse(fileVersion); if (!v) return null;
    const list = this.sorted();
    const exact = list.find(r => this.cmp(this.parse(r.version), v) === 0);
    if (exact) return { runtime: exact, exact: true };
    let best = list[0];
    for (const r of list) if (this.cmp(this.parse(r.version), v) <= 0) best = r;
    return { runtime: best, exact: false };
  },
};
