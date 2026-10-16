# Spine Viewer

Web viewer xem animation Spine nhiều version (3.6 → 4.3). Tự nhận diện version từ file, kéo thả là xem.

## Chạy

Đây là trang tĩnh. Upload cả thư mục lên web host (GitHub Pages, Netlify, nginx…) là chạy được.
Chạy thử trên máy: `python -m http.server` trong thư mục này rồi mở `http://localhost:8000`.

## Cấu trúc

```
index.html                      Giao diện
css/style.css
js/core/utils.js                Helper chung ($, toast, xử lý đường dẫn)
js/runtimes/registry.js         ★ Danh sách version Spine -> file runtime + adapter
js/runtimes/loader.js           Nạp runtime theo yêu cầu, cô lập biến global `spine`
js/runtimes/adapters.js         ★ Khác biệt API giữa các version (class kế thừa nhau)
js/formats/version-detect.js    Đọc version từ header .skel
js/formats/spine-binary-3x.js   Bộ đọc .skel cho 3.6/3.7 (spine-ts gốc không có)
js/files.js                     Nhận file, giải nén zip, ghép skeleton ↔ atlas ↔ ảnh
js/viewer.js                    Mở skeleton, animation, skin, camera, vòng lặp render
js/hierarchy.js                 Cây bone/slot/attachment, sockets, overlay highlight, click chọn
js/ui.js                        Gắn sự kiện giao diện, kéo thả, phím tắt
runtimes/spine-webgl-*.js       Runtime spine-ts chính thức (Esoteric Software)
```

## Thêm version Spine mới

1. Tải bản IIFE của spine-webgl vào `runtimes/`, ví dụ:
   `https://cdn.jsdelivr.net/npm/@esotericsoftware/spine-webgl@4.4.0/dist/iife/spine-webgl.min.js`
   → lưu thành `runtimes/spine-webgl-4.4.0.js`
2. Thêm 1 dòng vào `SPINE_RUNTIMES` trong `js/runtimes/registry.js`:
   ```js
   { version: "4.4", file: "runtimes/spine-webgl-4.4.0.js", adapter: "4.3" },
   ```
3. Mở thử file 4.4. Nếu chạy đúng thì xong.
   Nếu runtime mới đổi API: trong `js/runtimes/adapters.js` tạo class mới kế thừa adapter gần nhất,
   chỉ override những method bị đổi, rồi đăng ký vào `SPINE_ADAPTERS`:
   ```js
   class SpineAdapter44 extends SpineAdapter43 {
     setupPose(sk) { sk.resetToSetup(); }   // ví dụ: API mới
   }
   SPINE_ADAPTERS["4.4"] = SpineAdapter44;
   ```
   và sửa `adapter: "4.4"` ở registry.

Viewer chỉ gọi runtime qua adapter, nên phần còn lại (UI, cây, debug…) không phải sửa.
File có version không nằm trong danh sách sẽ dùng runtime gần nhất phía dưới và hiện cảnh báo.

## License

Các file trong `runtimes/` là Spine Runtimes của Esoteric Software, theo
[Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license).
