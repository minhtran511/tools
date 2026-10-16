/* ============================================================
 * DANH SÁCH TOOL — trang chủ đọc file này để hiển thị.
 * Thêm tool mới:
 *   1. Tạo thư mục mới, ví dụ: image-resizer/ có index.html bên trong
 *   2. Thêm 1 mục vào mảng TOOLS bên dưới (path = tên thư mục)
 * ============================================================ */
const TOOLS = [
  {
    path: "spine-viewer",
    name: "Spine Viewer",
    icon: "🦴",
    description: "Xem animation Spine 3.6 → 4.3, tự nhận diện version. Kéo thả JSON/.skel + atlas + ảnh. Có cây bone/slot, sockets và debug.",
    tags: ["spine", "animation", "game"],
  },
  // {
  //   path: "image-resizer",
  //   name: "Image Resizer",
  //   icon: "🖼️",
  //   description: "Mô tả ngắn 1–2 câu.",
  //   tags: ["image"],
  //   hidden: true,          // ẩn khỏi trang chủ khi chưa xong
  // },
];
