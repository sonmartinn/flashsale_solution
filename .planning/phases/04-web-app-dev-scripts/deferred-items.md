# Deferred Items — Phase 04

## Deferred Items

- Fixture Windows của 04-06 thất bại vì `netstat` của máy dự án báo sai listener (phát hiện trong 04-07, Task 1)
  status: resolved
  **What:** Ngày 2026-11-18, chạy `node --test scripts/test/dev-scripts.test.mjs` nhiều lần: hai ca Windows của 04-06 ("a stale or reused PID and similar-root listener survive start and stop", "a damaged owner identity … missing PID/sidecar fallback frees both trees") thất bại lặp lại. Có lượt kéo theo các ca sau vì tiến trình fixture còn giữ cổng. Ca "damaged owner" đạt khi chạy riêng. Probe độc lập (node mở `127.0.0.1:5000`, không dùng mã dự án) cho thấy `netstat -ano` không liệt kê listener trong khoảng 1 giây đầu, sau đó báo trạng thái `CLOSED` thay cho `LISTENING`. `Get-NetTCPConnection` có lúc trả thêm một listener trùng mang PID 0, có lúc không trả listener nào. `Get-DevListeners` trong `scripts/dev-common.ps1` dựa vào `netstat`, nên `start.ps1` không thấy cổng bận rồi backend lỗi EADDRINUSE ("npm run dev kết thúc với mã 1"), còn fallback mất PID của `stop.ps1` không thấy listener để dừng. Không có tiến trình lạ nào bị dừng nhầm.
  **Nghi vấn:** Hàng PID 0 dạng `127.0.0.1:5000  127.0.0.1:0  LISTENING  0` xuất hiện sau khi fixture POSIX chạy trong WSL Ubuntu mở cổng 5000/5173 (WSL2 chuyển tiếp localhost). Chưa chứng minh được, vì agent không được phép `wsl --terminate` hay khởi động lại máy để so sánh.
  **Kết quả 2026-11-19.** Cổng thiếu dòng listener được kiểm tra bằng kết nối TCP loopback. Script chỉ dùng PID từ đúng cặp endpoint và báo cổng bận khi chưa tìm được PID. Fixture Windows đạt cả ca thiếu dòng listener và mất PID. W05 và W11 đạt trên máy dự án với bind IPv4, IPv6 và bind mặc định. [Kết quả nghiệm thu](04-DEV-UAT.md)
