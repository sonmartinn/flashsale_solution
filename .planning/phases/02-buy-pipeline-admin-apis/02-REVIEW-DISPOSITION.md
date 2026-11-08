---
phase: 02
review: 02-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "D-10 compensation can oversell on an ambiguous write, and can return another request's order"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Redis refund is not idempotent; ioredis automatically resends unanswered commands, which can apply INCRBY twice"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Reset and refunds are not fenced against in-flight buys, so a reset can start the next run already oversold"
  - id: WR-04
    severity: warning
    disposition: open
    title: "`?mode=` lets any authenticated user bypass the sale's stock store and oversell a V1/V2 sale"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Rethrowing the original insert error can produce a 4xx, so internal write failures leave the error-rate metric"
  - id: IN-01
    severity: info
    disposition: open
    title: "Generality without instantiation: `SaleCache.invalidate()` with no argument"
  - id: IN-02
    severity: info
    disposition: open
    title: "`createApp` builds a V2 buy path that depends on a script registration it does not do"
  - id: IN-03
    severity: info
    disposition: open
    title: "Shared `HttpError` singletons are thrown for SOLD_OUT, ALREADY_BOUGHT and STOCK_NOT_LOADED"
  - id: IN-04
    severity: info
    disposition: open
    title: "The V1 refund ignores `matchedCount` but still logs a compensation row"
  - id: IN-05
    severity: info
    disposition: open
    title: "`perUserLimit` is exposed but never enforced"
  - id: IN-06
    severity: info
    disposition: open
    title: "Admin reset silently ignores a non-JSON body"
open: 11
total: 11
recorded: 2026-11-08T13:07:53.299Z
---

# Phase 02: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
