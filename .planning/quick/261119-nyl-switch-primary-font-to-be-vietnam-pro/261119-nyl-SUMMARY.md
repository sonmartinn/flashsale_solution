---
type: quick
phase: "04"
status: complete
---

# Dùng Be Vietnam Pro làm font chính

Tiêu đề và nội dung của ứng dụng và trang nguồn ảnh dùng Be Vietnam Pro cục bộ. Bản Regular (400) được preload. Bản Medium (500) dùng cho chữ đậm vừa. Đã gỡ Figtree khỏi bản build.

- Frontend đạt 58/58 test, gồm kiểm tra bảng cmap riêng cho cả hai độ đậm. Frontend và backend đạt `typecheck` và `build`.
- Edge kiểm tra bản build ở 1440, 390 và 320 px khi chặn HTTPS. Tiêu đề tiếng Việt của trang đăng nhập và nguồn ảnh dùng trực tiếp Be Vietnam Pro. Cả hai độ đậm nạp ở trang đăng nhập và không có tràn ngang trên hai trang.
- `GATE: OFF (no build active)`. Ảnh trang đăng nhập lưu trong `.taste-skill/phase04-be-vietnam-pro/`. Kết quả UAT Phase 04 chờ người dùng duyệt.
