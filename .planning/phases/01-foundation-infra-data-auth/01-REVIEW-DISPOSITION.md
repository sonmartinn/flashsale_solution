---
phase: 01
review: 01-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Kill path on Windows can hang the test run forever when `taskkill` fails"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The guard against drift between the `start:test` script and the helper is one-directional, so the tests can pass against a script that behaves differently"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Short `JWT_SECRET` warning breaks the \"exactly one stderr line\" boot-failure contract"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Test mode (identity taken from `x-test-user`, no auth) is served on every network interface"
  - id: IN-01
    severity: info
    disposition: open
    title: "`.env.example` gives two conflicting ways to generate the secret, and one of them prints it"
  - id: IN-02
    severity: info
    disposition: open
    title: "\"start:test chỉ ép riêng NODE_ENV=test\" holds only while `.env.test` has a single key"
  - id: IN-03
    severity: info
    disposition: open
    title: "Quoted glob in `--test` may not work on the declared minimum Node (20.19)"
  - id: IN-04
    severity: info
    disposition: open
    title: "Generality without instantiation: `args` option of the spawn helpers has no caller"
  - id: IN-05
    severity: info
    disposition: open
    title: "Boot catch blocks drop the underlying error, so non-\"not running\" failures are misreported"
  - id: IN-06
    severity: info
    disposition: open
    title: "Helper does not clear `DOTENV_*` variables, so a developer shell can break test isolation"
  - id: IN-07
    severity: info
    disposition: open
    title: "`DOTENV_CLI` is resolved eagerly at import, so the dedicated `build.test` assertion is unreachable on failure"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "`nodeEnv` (banner + `/api/health`) reports \"test\" while `isTestMode` is false, which defeats the load-test preflight"
open: 11
total: 12
recorded: 2026-11-07T09:35:54.779Z
---

# Phase 01: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| CR-01 | critical | fixed | 01-06 (UAT G-01-1) (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
