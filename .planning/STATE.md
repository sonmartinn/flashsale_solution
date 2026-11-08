---
gsd_state_version: "1.0"
current_phase: 02
current_phase_name: Buy Pipeline & Admin APIs
status: executing
stopped_at: Phase 2 context gathered
last_updated: "2026-11-08T08:31:38.121Z"
last_activity: 2026-11-08
last_activity_desc: Phase 01 complete, transitioned to Phase 2
state_head: cc9a3241b89df685a06bf421745c1f418c78d51b
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 15
  completed_plans: 10
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-08)

**Core value:** Dưới tải đồng thời, V1 và V2 luôn cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Chứng minh lặp lại bằng thí nghiệm E1 có số liệu.
**Current focus:** Phase 2 — Buy Pipeline & Admin APIs

## Current Position

Phase: 02 (Buy Pipeline & Admin APIs) — READY TO EXECUTE
Plan: Not started
Status: Ready to execute
Last activity: 2026-11-08 — Phase 01 complete, transitioned to Phase 2

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 10 | - | - |

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

### Pending Todos

None yet.

### Blockers/Concerns

- Code freeze 2026-12-06 (today 2026-11-08, Phase 1 done): Phases 2–3 (never-cut core + E1/E2 proof) must land first
- Phase 3 and Phase 4 dev scripts are flagged for `--research-phase` before planning
- Port 27017 is the Windows MongoDB service; always use `127.0.0.1:27018`
- V1–V2 gap on one machine via Docker Desktop may be small (still a valid result); no Mac available for `.sh` testing

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-08T07:08:46.878Z
Stopped at: Phase 2 context gathered
Resume file: .planning/phases/02-buy-pipeline-admin-apis/02-CONTEXT.md
