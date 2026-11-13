---
gsd_state_version: "1.0"
current_phase: 03
current_phase_name: Experiments (E1-E4)
status: ready_for_verification
stopped_at: "03-06 complete; Phase 03 review and regression passed, verifier pending"
last_updated: "2026-11-13T16:40:52.885Z"
last_activity: 2026-11-13
last_activity_desc: Official E4 verified; all 6 plans complete; review and regression passed
state_head: 0e4c7d57b99e8a0afe93f2b62e819e4d11928b53
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 21
  completed_plans: 21
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-09)

**Core value:** Dưới tải đồng thời, V1 và V2 luôn cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Chứng minh lặp lại bằng thí nghiệm E1 có số liệu.
**Current focus:** Phase 03 — Experiments (E1-E4)

## Current Position

Phase: 03 (Experiments (E1-E4)) — EXECUTING
Plan: 6 of 6
Status: Ready for Phase 03 verification
Last activity: 2026-11-13 ? Official E4 verified; 6/6 plans complete; review clean; 289 loadtest + 172 unit + 200 integration tests passed

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 21
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

- [Init]: Rebuild from scratch per `docs/SPECS.md`; old code at `40dea55` is not restored
- [Init]: Sale mode switches via reset (`POST /admin/sales/:id/reset { mode }`, seed/CLI `--mode`); `GET /sales/:id` reads `remaining` by `sale.mode`
- [Init]: Static sale cache shared by V0/V1/V2, cleared on reset; load scripts reset only through the admin API
- [Init]: E1 uses a dedicated Node `fetch` + `Promise.all` script; E2 uses autocannon with self-computed p95
- [Roadmap]: All four cuttable items stay in v1 and are planned last in their phases (cut order E4 → web chart → admin page → polling)
- [Phase 1]: `start:test` = `dotenv run -q --override -f .env.test` (shell NODE_ENV never leaks in); health exposes `testMode`, load-script preflight must check `testMode === true`
- [Phase 1]: Reset service is the factory `createSaleAdminService({ redis, onSaleReset })`; the Phase 2 admin route passes `saleCache.invalidate`
- [Phase 1]: Body-less POSTs (buy, reset without mode) must omit Content-Type; zero-byte declared-JSON bodies are rejected with 400
- [Phase 2]: V1/V2 dùng chung `insertOrderOrCompensate`; V0 không hoàn kho (D-09). Lỗi không phải E11000 tra `findOne` trước khi hoàn kho
- [Phase 2]: Một `saleAdmin` cho mỗi app, reset qua HTTP xóa đúng cache mà đường mua đọc; stats nằm trong `createSaleAdminService`
- [Phase 2]: Reconcile CLI thoát 0/2/1, `--fix` sửa Redis theo MongoDB bằng một `multi()` có kiểm tra kết quả

### Pending Todos

None yet.

### Blockers/Concerns

- Code freeze 2026-12-06: Phases 01-02 passed re-verification; Phase 03 has 6/6 SUMMARYs, official E1-E4 data and passed review/regression; final verifier pending
- [03-06] Task 1: 6eaa9d2; Task 2 RED: df532cd, GREEN/runbook: 0e4c7d5. Kiểm thử 289/289 đạt; typecheck loadtest/backend và build backend đạt. Smoke kỹ thuật 2026-11-12 PASS, bán thiếu 76 đơn vị/76 buyer thừa, --fix và re-check clean; CSV smoke không được giữ làm kết quả chính thức
- Phase 03 đã có nghiên cứu và kế hoạch; phần dev scripts Phase 04 vẫn cần `--research-phase` trước khi lập kế hoạch
- Port 27017 is the Windows MongoDB service; always use `127.0.0.1:27018`
- [Phase 2] Rủi ro đã chấp nhận ở UAT, phải ghi vào tài liệu rủi ro Phase 5: WR-01 (hoàn kho sau lỗi ghi đơn mơ hồ không phải E11000 có thể ra `totalQty+1`), WR-02 (ioredis `autoResendUnfulfilledCommands` mặc định bật, xem lại trước E4), WR-04 (`?mode=` khác `sale.mode` vượt `totalQty` qua hai kho; báo cáo nêu điều kiện "mọi lượt mua dùng đúng mode của đợt sale")
- [Review 2026-11-12] Các cảnh báo còn mở trong 02-REVIEW.md: WR-03 (reset chồng với lượt mua đang chạy), WR-06 (reset lỗi muộn giữ cache cũ), WR-07 (E1 nhận số user vượt ngân sách cổng); chưa sửa mã nguồn hay chấp nhận thay người dùng
- V1–V2 gap on one machine via Docker Desktop may be small (still a valid result); no Mac available for `.sh` testing

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-13T15:38:25.359Z
Stopped at: 03-06 complete; Phase 03 verifier pending
Resume file: .planning/phases/03-experiments-e1-e4/.continue-here.md
