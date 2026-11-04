---
gsd_state_version: "1.0"
current_phase: 01
current_phase_name: Foundation (Infra, Data, Auth)
status: executing
stopped_at: Phase 1 context gathered
last_updated: "2026-11-04T15:34:10.733Z"
last_activity: 2026-11-04
last_activity_desc: Phase 01 execution started
state_head: 72599335915ef17f47ea697bd4c5d00eef3afadc
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 5
  completed_plans: 4
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-03)

**Core value:** Dưới tải đồng thời, V1 và V2 luôn cho đúng `totalQty` đơn thành công, mỗi người tối đa 1 đơn, còn V0 bán quá. Chứng minh lặp lại bằng thí nghiệm E1 có số liệu.
**Current focus:** Phase 01 — Foundation (Infra, Data, Auth)

## Current Position

Phase: 01 (Foundation (Infra, Data, Auth)) — EXECUTING
Plan: 5 of 5
Status: Executing Phase 01
Last activity: 2026-11-04 — Phase 01 execution started

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

Last session: 2026-11-03T16:40:09.574Z
Stopped at: Phase 1 context gathered
Resume file: .planning/phases/01-foundation-infra-data-auth/01-CONTEXT.md
