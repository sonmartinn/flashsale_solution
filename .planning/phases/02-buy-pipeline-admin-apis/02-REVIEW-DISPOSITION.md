---
phase: 02
review: 02-REVIEW.md
titles: json
findings:
  - id: WR-03
    severity: warning
    disposition: open
    title: "Reset and refunds are not fenced against in-flight buys, so a reset can start the next run already oversold"
  - id: WR-06
    severity: warning
    disposition: open
    title: "Reset lỗi ở bước cuối để cache giữ trạng thái cũ dù dữ liệu đợt sale đã đổi"
  - id: WR-07
    severity: warning
    disposition: open
    title: "E1 nhận số user lớn hơn ngân sách cổng nên luôn chờ rồi INVALID trước khi bắn"
  - id: WR-01
    severity: warning
    disposition: deferred
    title: "D-10 compensation can oversell on an ambiguous write, and can return another request's order"
  - id: WR-02
    severity: warning
    disposition: deferred
    title: "Redis refund is not idempotent; ioredis automatically resends unanswered commands, which can apply INCRBY twice"
  - id: WR-04
    severity: warning
    disposition: deferred
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
open: 10
total: 13
recorded: 2026-11-12T04:16:37.852Z
---

# Phase 02: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-03 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| WR-01 | warning | deferred | Người dùng chấp nhận rủi ro tại 02-UAT test 1; ghi vào tài liệu rủi ro Phase 5 theo STATE.md/PROJECT.md; không phải đã sửa. |
| WR-02 | warning | deferred | Người dùng chấp nhận rủi ro tại 02-UAT test 2; cân nhắc trước E4 và ghi vào tài liệu rủi ro Phase 5 theo STATE.md/PROJECT.md; không phải đã sửa. |
| WR-04 | warning | deferred | Người dùng chấp nhận D-03 tại 02-UAT test 3; Phase 5 phải nêu điều kiện mọi lượt mua dùng đúng sale.mode; không phải đã sửa. |
| WR-05 | warning | open | - (not in the current review) |
| IN-01 | info | open | - (not in the current review) |
| IN-02 | info | open | - (not in the current review) |
| IN-03 | info | open | - (not in the current review) |
| IN-04 | info | open | - (not in the current review) |
| IN-05 | info | open | - (not in the current review) |
| IN-06 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
