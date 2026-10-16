"use strict";
/* ================= Runtime loader =================
 * Mọi bản spine-ts đều khai báo biến global `spine`. Runtime được nạp tuần tự bằng thẻ <script>:
 * reset window.spine -> nạp -> giữ lại tham chiếu namespace. Code bên trong runtime dùng closure
 * nên vẫn chạy đúng sau khi window.spine bị runtime khác ghi đè.
 */
const runtimeCache = {};
let runtimeQueue = Promise.resolve();
function loadRuntime(runtime) {
  if (runtimeCache[runtime.version]) return runtimeCache[runtime.version];
  const p = runtimeQueue.then(() => new Promise((resolve, reject) => {
    window.spine = undefined;
    const s = document.createElement("script");
    s.src = runtime.file;
    s.onload = () => {
      const sp = window.spine; window.spine = undefined;
      if (sp && sp.TextureAtlas) resolve(sp); else reject(new Error(runtime.file + " không phải spine-webgl hợp lệ"));
    };
    s.onerror = () => reject(new Error("không tải được " + runtime.file));
    document.head.appendChild(s);
  }));
  runtimeQueue = p.catch(() => {});
  runtimeCache[runtime.version] = p;
  p.catch(() => { delete runtimeCache[runtime.version]; });
  return p;
}
