# tools.domain.com

Site tĩnh gồm nhiều tool nhỏ. Không cần build, upload nguyên thư mục này lên host là chạy.

```
index.html          Trang chủ (danh sách tool)
tools.js            ★ Danh sách tool hiển thị ở trang chủ
style.css           Style trang chủ
spine-viewer/       Tool: Spine Viewer   -> tools.domain.com/spine-viewer/
```

## Thêm tool mới

1. Tạo thư mục mới, ví dụ `image-resizer/`, có `index.html` bên trong
   (tên thư mục chính là đường dẫn: `tools.domain.com/image-resizer/`).
   Mỗi tool tự do giao diện và cấu trúc riêng; trang chủ mở tool ở tab mới.
2. Thêm 1 mục vào `tools.js`:
   ```js
   { path: "image-resizer", name: "Image Resizer", icon: "🖼️", description: "…", tags: ["image"] },
   ```
   Thêm `hidden: true` nếu muốn tool chưa hiện ở trang chủ (vẫn truy cập được bằng URL).

Mỗi tool nằm gọn trong thư mục của nó và chỉ dùng đường dẫn tương đối,
nên thêm, sửa hay xóa một tool không ảnh hưởng tool khác.

## Deploy

Bất kỳ host tĩnh nào: GitHub Pages, Cloudflare Pages, Netlify, Vercel, hoặc nginx/Apache.
Trỏ subdomain `tools.domain.com` vào thư mục này. Host tự phục vụ `index.html` khi truy cập
`/spine-viewer/`.

Chạy thử trên máy: `python -m http.server 8000` trong thư mục này → `http://localhost:8000`.
