# Deferred Items — Phase 04

## Deferred Items

- Fixture Windows của 04-06 thất bại vì `netstat` của máy dự án báo sai listener (phát hiện trong 04-07, Task 1)
  status: open
  **What:** Ngày 2026-11-18, chạy `node --test scripts/test/dev-scripts.test.mjs` nhiều lần: hai ca Windows của 04-06 ("a stale or reused PID and similar-root listener survive start and stop", "a damaged owner identity … missing PID/sidecar fallback frees both trees") thất bại lặp lại. Có lượt kéo theo các ca sau vì tiến trình fixture còn giữ cổng. Ca "damaged owner" đạt khi chạy riêng. Probe độc lập (node mở `127.0.0.1:5000`, không dùng mã dự án) cho thấy `netstat -ano` không liệt kê listener trong khoảng 1 giây đầu, sau đó báo trạng thái `CLOSED` thay cho `LISTENING`. `Get-NetTCPConnection` có lúc trả thêm một listener trùng mang PID 0, có lúc không trả listener nào. `Get-DevListeners` trong `scripts/dev-common.ps1` dựa vào `netstat`, nên `start.ps1` không thấy cổng bận rồi backend lỗi EADDRINUSE ("npm run dev kết thúc với mã 1"), còn fallback mất PID của `stop.ps1` không thấy listener để dừng. Không có tiến trình lạ nào bị dừng nhầm.
  **Nghi vấn:** Hàng PID 0 dạng `127.0.0.1:5000  127.0.0.1:0  LISTENING  0` xuất hiện sau khi fixture POSIX chạy trong WSL Ubuntu mở cổng 5000/5173 (WSL2 chuyển tiếp localhost). Chưa chứng minh được, vì agent không được phép `wsl --terminate` hay khởi động lại máy để so sánh.
  **Next:** Người dùng kiểm tra P4 trong `04-DEV-UAT.md` (hoặc khởi động lại/`wsl --shutdown`), rồi chạy lại toàn bộ fixture. Nếu `netstat` vẫn sai khi máy sạch, cân nhắc làm `Get-DevListeners` chắc hơn (kết hợp `Get-NetTCPConnection`, thử kết nối TCP, coi listener PID 0 là "không rõ chủ"). Đó là thay đổi mã Windows của 04-06 và cần quyết định riêng.
