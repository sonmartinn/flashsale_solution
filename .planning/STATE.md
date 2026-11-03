---
gsd_state_version: '1.0'
status: planning
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-03)

**Core value:** Dưới tải đồng thời, V1 và V2 luôn cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Chứng minh lặp lại bằng thí nghiệm E1 có số liệu.
**Current focus:** Phase 1 - Foundation (Infra, Data, Auth)

## Current Position

Phase: 1 of 5 (Foundation (Infra, Data, Auth))
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-11-03 — Roadmap created (5 phases, 58/58 v1 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

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

### Pending Todos

None yet.

### Blockers/Concerns

- Code freeze 2026-12-06 (today 2026-11-03): Phases 1–3 (never-cut core + E1/E2 proof) must land first
- Phase 3 and Phase 4 dev scripts are flagged for `--research-phase` before planning
- Port 27017 is the Windows MongoDB service; always use `127.0.0.1:27018`
- V1–V2 gap on one machine via Docker Desktop may be small (still a valid result); no Mac available for `.sh` testing

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-03
Stopped at: Roadmap and state initialized; next is `/gsd-plan-phase 1`
Resume file: None
