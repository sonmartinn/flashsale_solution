# Phase 2: Buy Pipeline & Admin APIs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 02-buy-pipeline-admin-apis
**Areas discussed:** none in depth. The user delegated every area to Claude.

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Kiểm tra đầu vào khi mua | Missing `?mode` (400 or fall back to `sale.mode`), `?mode` ≠ `sale.mode`, `qty` given as a string or missing, unknown sale 400 or 404 | |
| Dạng phản hồi API đọc | `/sales/active` as an array or a single sale, 201 body, product info in `/orders/me`, name of the "stock not loaded" flag | |
| Reconcile và stats | Reconcile all sales or only V2, `inSync` flag in stats, missing Redis key | |
| Cache và kiểm thử | Cache TTL vs invalidate only, where the V0 oversell test and the Lua smoke test live | |

**User's choice:** free text, "Oke bạn cứ tự quyết theo khuyến nghị đi" (decide everything using your recommendations).
**Notes:** This matches the Phase 1 discussion, where the user also delegated to Claude.

---

## Claude's Discretion

All four areas were decided by Claude and recorded as D-01..D-35 in 02-CONTEXT.md. The main choices:
- `?mode` is required and never falls back to `sale.mode`. A mismatch with `sale.mode` is allowed, following SPECS. `qty` must be the number 1.
- Unknown sale → 404. Every response body is an object. `SaleDto` carries `remaining` and `stockLoaded`. The 201 response is `{ order }` only.
- Reconcile checks only v2 sales. Exit codes are 0 for clean, 2 for drift, 1 for errors. Stats include `redisInSync` (null for v0/v1).
- The cache has no TTL, does not cache misses and leaves out `mode`. All tests run under `test:int`, and the V0 oversell test allows up to 3 attempts.
- An ambiguous order write (non-E11000 error where the order exists) answers 201 and does not refund.

## Deferred Ideas

- Mode-mismatch guard on the buy endpoint
- Rate-limited error logging during E4 (Phase 3)
- Admin reset accepting `totalQty` (carried over from Phase 1)
