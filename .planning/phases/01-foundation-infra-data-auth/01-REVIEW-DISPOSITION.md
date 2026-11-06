---
phase: 01
review: 01-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "`connectTestStores` leaks a reconnecting Redis client on failure, so `npm run test:int` hangs forever when Redis is down"
  - id: IN-01
    severity: info
    disposition: open
    title: "Duplicate case-sensitivity test (carried forward from the previous review, still open)"
  - id: IN-02
    severity: info
    disposition: open
    title: "Near-miss test list uses literal invisible characters, contradicting its own comment"
  - id: IN-03
    severity: info
    disposition: open
    title: "Warnings printed before `listen` break the \"exactly one stderr line\" contract when listen then fails"
  - id: IN-04
    severity: info
    disposition: open
    title: "`mongoose.disconnect()` on startup-failure paths is not guarded, unlike in seed/reset"
  - id: IN-05
    severity: info
    disposition: open
    title: "Runtime Redis has no command deadline; a connected-but-unresponsive Redis hangs requests indefinitely"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "`nodeEnv` (banner + `/api/health`) reports \"test\" while `isTestMode` is false, which defeats the load-test preflight"
open: 6
total: 7
recorded: 2026-11-06T07:26:41.192Z
---

# Phase 01: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| CR-01 | critical | fixed | 01-06 (UAT G-01-1) (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
