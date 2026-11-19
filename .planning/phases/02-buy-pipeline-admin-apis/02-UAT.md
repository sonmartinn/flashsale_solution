---
status: complete
phase: 02-buy-pipeline-admin-apis
source: [02-VERIFICATION.md]
started: 2026-11-08T13:25:00Z
updated: 2026-11-09T07:11:32.948Z
---

## Current Test

[testing complete]

## Tests

### 1. WR-01 — V1/V2 refund after a network-ambiguous (non-E11000) order insert error
expected: Accept as documented residual risk (recorded in Phase 5 risk docs), or open a gap to refund only on errors that prove no write happened. On a non-E11000 insert error (e.g. MongoNetworkError after the insert reached mongod), compensate() refunds when findOne returns null, which can race a still-committing insert and yield totalQty+1 orders — this conflicts with the 02-01/02-03 prohibition "ambiguous writes resolve to undersell, never oversell".
result: pass

### 2. WR-02 — ioredis autoResendUnfulfilledCommands (default true)
expected: Accept as documented risk, or set `autoResendUnfulfilledCommands: false` in createRedis before Phase 3 E4 (which stops a store mid-sale). After a reconnect ioredis can replay the bare INCRBY refund (V2 E11000 branch) or the flashBuy EVALSHA.
result: pass

### 3. WR-04 — `?mode=` cross-store buys
expected: Confirm D-03 (mode comes from the query, never from the sale) stays accepted and the report states "the V1/V2 guarantee holds when every buy uses the sale's mode", or add a mismatch check outside test mode. Today an authenticated user can buy a V2 sale with `?mode=v1`/`v0` and exceed totalQty across stores.
result: pass

### 4. READ-01 edge (backstop truth) — product reads are side-effect free under concurrency
expected: Confirm by review that catalog.service listProducts/getProduct issue only find/findById().lean() and no write path exists.
result: pass

### 5. READ-03 edge (backstop truth) — `remaining` is a point-in-time snapshot from the store selected by sale.mode
expected: Confirm the read.test per-mode cases (v2 reads Redis, not remainingQty; v0/v1 read remainingQty) are sufficient, or run GET /api/sales/:id during a burst. It may lag during a burst but must never be read from the wrong store.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
