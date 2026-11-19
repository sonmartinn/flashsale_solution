---
gsd_state_version: "1.0"
current_phase: 5
current_phase_name: Results Chart, README & Analysis
status: planning
stopped_at: Phase 04 complete, ready to plan Phase 5
last_updated: "2026-11-19T11:39:10.422Z"
last_activity: 2026-11-19
last_activity_desc: Phase 04 complete, transitioned to Phase 5
state_head: 8391819d31f29382353e160cdd4e6d1ee7bac2b5
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 30
  completed_plans: 30
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-19)

**Core value:** Dưới tải đồng thời, V1 và V2 luôn cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Chứng minh lặp lại bằng thí nghiệm E1 có số liệu.
**Current focus:** Phase 05 — Results Chart, README & Analysis

## Current Position

Phase: 5 — Results Chart, README & Analysis
Plan: Not started
Status: Ready to plan
Last activity: 2026-11-19 — Phase 04 complete, transitioned to Phase 5

Progress: [████████░░] 80% (4/5 phases), 30/30 plans hiện có đã thực hiện. Phase 05 chưa lập kế hoạch.

## Performance Metrics

**Velocity:**
- Total plans completed: 30
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 10 | - | - |
| 02 | 5 | - | - |
| 03 | 6 | - | - |
| 04 | 9 | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 3]: Script tải chỉ đo JS đã biên dịch qua `start:test`, kiểm tra `health.testMode === true` và reset qua API admin trước mỗi lượt; số liệu chính thức do người dùng chạy (D-33).
- [Phase 3]: E2 dùng autocannon với bộ đếm user chung, tự tính p50/p95 nearest-rank và rps, đo riêng còn hàng/hết hàng; chỉ 5xx và lỗi kết nối tính là lỗi thật, không dùng tốc độ để quyết định tính đúng (D-25).
- [Phase 3]: E4 chấp nhận lệch trước sửa theo hướng bán thiếu nếu không thiếu buyer và không bán quá; bắt buộc `reconcile --fix` rồi kiểm tra lại sạch (D-29). CSV chính thức E4 ghi 74 đơn vị lệch, không dùng số 76 của smoke làm kết quả chính thức.
- [Phase 4]: UI mua theo `sale.mode`; `GET /sales/:id` trả `remaining` theo mode đó. POST không có body phải bỏ Content-Type; khai báo JSON nhưng gửi rỗng trả 400.
- [Phase 4]: Sale và admin đọc định kỳ mỗi 2 giây, dừng khi tab ẩn hoặc rời trang. Có thao tác làm mới thủ công và nút tạm dừng trên admin trước E2.
- [Roadmap]: Giữ phạm vi và thứ tự cắt E4 → biểu đồ web → trang admin → polling; E4 đã hoàn tất. Quyết định đầy đủ và các rủi ro chấp nhận nằm trong PROJECT.md.

### Pending Todos

None yet.

### Blockers/Concerns

- Code freeze 2026-12-06: Phase 01–04 đã đóng. CSV chính thức E1–E4 và bản demo đã xác minh là đầu vào cho Phase 05.
- [Phase 3] Regression 2026-11-13 đạt: 289 loadtest, 172 unit backend, 200 integration; backend/loadtest typecheck và backend build đạt. Báo cáo: `03-REGRESSION.md`, `03-VERIFICATION.md`.
- [Phase 4] Nghiên cứu dev scripts đã hoàn tất trong 04-RESEARCH.md (PowerShell 5.1, bash 3.2, tiến trình nền, ownership và kiểm tra cổng). Kế hoạch có checkpoint xác minh package trước cài đặt và UAT Windows thật ở 04-07; macOS phải ghi rõ nếu chỉ kiểm tra cú pháp.
- [Phase 4] 04-01/02/03 đã duyệt và hoàn tất. 04-03 còn các phát hiện về bố cục, ảnh lớn và ảnh đến muộn khi mạng chậm. Gate OFF, lịch sử OPEN3. Xem frontend/DESIGN.md và 04-03-SUMMARY.md.
- [Phase 4] 04-04, 04-05 và 04-06 hoàn tất. Lượt fixture UI cũ dùng MongoDB flashsale_test_ui_13440 và Redis DB 13. Lock đã được lưu riêng sau khi xác nhận PID cũ đã thoát và cổng 5000 trống.
- [Phase 4] 04-07 hoàn tất với 10/10 ca Windows bắt buộc đạt. Bản sửa `3bf2300` xác định PID khi bảng TCP bỏ sót listener. W05/W11 chạy lại đạt ở đường dẫn dự án. macOS chưa được thử ở runtime và ca bổ sung W12 còn mở. Bằng chứng ở `04-DEV-UAT.md`.
- [Phase 4] UAT giao diện đạt 1/1. Cảnh báo ảnh quá kích thước và giới hạn checker còn tại `04-UI-UAT.md` và `04-REVIEW.md`.
- Port 27017 is the Windows MongoDB service; always use `127.0.0.1:27018`
- [Phase 2] Rủi ro đã chấp nhận ở UAT, phải ghi vào tài liệu rủi ro Phase 5: WR-01 (hoàn kho sau lỗi ghi đơn mơ hồ không phải E11000 có thể ra `totalQty+1`), WR-02 (ioredis `autoResendUnfulfilledCommands` mặc định bật; E4 PASS không loại bỏ rủi ro gửi lại lệnh), WR-04 (`?mode=` khác `sale.mode` vượt `totalQty` qua hai kho; báo cáo nêu điều kiện "mọi lượt mua dùng đúng mode của đợt sale")
- [Review 2026-11-12] Các cảnh báo còn mở trong 02-REVIEW.md: WR-03 (reset chồng với lượt mua đang chạy), WR-06 (reset lỗi muộn giữ cache cũ), WR-07 (E1 nhận số user vượt ngân sách cổng); chưa sửa mã nguồn hay chấp nhận thay người dùng
- V1–V2 gap on one machine via Docker Desktop may be small (still a valid result); no Mac available for `.sh` testing
- [Bàn giao] Giữ nguyên 5 worktree cũ trong `.claude/worktrees/`, nhất là sửa đổi chưa commit của `agent-a0eddd2f1d095e170`; không merge hay xóa khi chưa hỏi. Ghi chú `start:test` cũ trong `.claude/CLAUDE.md` do người dùng cập nhật; `backend/package.json` là chuẩn.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261119-nyl | Đổi font chính sang Be Vietnam Pro | 2026-11-19 | 69fa67a | [261119-nyl-switch-primary-font-to-be-vietnam-pro](./quick/261119-nyl-switch-primary-font-to-be-vietnam-pro/) |
| 2 | Làm nổi bật giá và thông tin của sản phẩm đang sale theo phản hồi UAT Phase 04 | 2026-11-19 | 5ce06d1 | — |
| 3 | Làm rõ liên kết Xem đơn của tôi trong phản hồi trang sale theo UAT Phase 04 | 2026-11-19 | fb68afd | — |
| 4 | Dùng chữ xanh gạch chân cho liên kết Xem đơn của tôi trong phản hồi trang sale | 2026-11-19 | 0662ea4 | — |

## Session Continuity

Last session: 2026-11-19T11:39:10.422Z
Stopped at: Phase 04 complete, ready to plan Phase 5
Resume file: None
