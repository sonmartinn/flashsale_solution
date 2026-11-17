---
gsd_state_version: "1.0"
current_phase: 04
current_phase_name: Web App & Dev Scripts
status: executing
stopped_at: 04-02 Task 1 implemented; awaiting asset/font tracer feedback before Task 2
last_updated: "2026-11-17T15:08:49.408Z"
last_activity: 2026-11-17
last_activity_desc: 04-02 Task 1 committed and summarized; awaiting asset/font tracer feedback
state_head: affa7a62bd49df1d7e19ff57355560aa121760d6
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 30
  completed_plans: 22
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-16)

**Core value:** Dưới tải đồng thời, V1 và V2 luôn cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Chứng minh lặp lại bằng thí nghiệm E1 có số liệu.
**Current focus:** Phase 04 — Web App & Dev Scripts

## Current Position

Phase: 04 (Web App & Dev Scripts) — EXECUTING
Plan: 04-01 accepted; 04-02 Task 1 implemented (1/2 tasks), tracer feedback pending; 1/9 plans complete
Status: Awaiting human verification of 04-02 assets/fonts before Task 2
Last activity: 2026-11-17 — Code eeb9949, SUMMARY affa7a6; 8 frontend tests and both packages typecheck/build pass

Progress: [██████░░░░] 60% (3/5 phases); 22/30 plans hoàn tất, 04-02 halted tại tracer feedback nên không tính complete; Phase 05 chưa lập kế hoạch.

## Performance Metrics

**Velocity:**
- Total plans completed: 22
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 10 | - | - |
| 02 | 5 | - | - |
| 03 | 6 | - | - |

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
- [Roadmap]: Giữ phạm vi và thứ tự cắt E4 → biểu đồ web → trang admin → polling; E4 đã hoàn tất. Quyết định đầy đủ và các rủi ro chấp nhận nằm trong PROJECT.md.

### Pending Todos

None yet.

### Blockers/Concerns

- Code freeze 2026-12-06: Phase 01–03 verification passed; Phase 03 đóng ngày 2026-11-16 với 6/6 SUMMARY, 51/51 must-haves và CSV chính thức E1–E4. Phase 04 có 9 plans/8 waves đã kiểm tra; Phase 05 chưa lập kế hoạch.
- [Phase 3] Regression 2026-11-13 đạt: 289 loadtest, 172 unit backend, 200 integration; backend/loadtest typecheck và backend build đạt. Báo cáo: `03-REGRESSION.md`, `03-VERIFICATION.md`.
- [Phase 4] Nghiên cứu dev scripts đã hoàn tất trong 04-RESEARCH.md (PowerShell 5.1, bash 3.2, tiến trình nền, ownership và kiểm tra cổng). Kế hoạch có checkpoint xác minh package trước cài đặt và UAT Windows thật ở 04-07; macOS phải ghi rõ nếu chỉ kiểm tra cú pháp.
- [Phase 4] 04-01 đã được duyệt (92b3c95). 04-02 Task1 đã commit eeb9949, SUMMARY halted chờ duyệt ảnh/font trước Task2. 8 test frontend và frontend/backend typecheck/build đạt; browser decode6 ảnh, tải2font local ở1440..320, không external resource/tràn ngang. Figtree thiếu chữ Việt nên thêm Be Vietnam Pro local và đính chính DESIGN. Gate hiện OFF do marker cũ đã done; lịch sử OPEN3 và4waiver giữ nguyên. Consistency/perf Task2 chưa chạy. Fixture mới Mongo flashsale_test_ui_39704/Redis14,5173/5174 đang phục vụ; giữ dữ liệu fixture cũ Redis15. Tracking GSD đếm SUMMARY halted như complete nên đã sửa số tổng về22, không advance plan/requirements.
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

## Session Continuity

Last session: 2026-11-17T15:08:48.780Z
Stopped at: 04-02 Task 1 implemented; awaiting asset/font tracer feedback before Task 2
Resume file: .planning/phases/04-web-app-dev-scripts/.continue-here.md
