---
phase: "2"
slug: "buy-pipeline-admin-apis"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-08"
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client → buy route | `POST /api/sales/:id/buy?mode=…` with JWT; query, body and `:id` are untrusted | mode string, qty, ObjectId |
| Client → admin routes | `POST /api/admin/sales/:id/reset`, `GET /api/admin/sales/:id/stats`; admin JWT required | mode string, ObjectId; sale counters out |
| Client → read routes | products, sales, `GET /api/orders/me` | ObjectIds in; whitelisted DTOs out (own orders only) |
| API → MongoDB / Redis | stock step, order insert, compensation, Lua script; stores bound to 127.0.0.1 | stock counters, buyer sets, orders, stock_movements |
| Developer → reconcile CLI | `npm run reconcile -- --sale <id> [--fix]` | ObjectId in; ObjectIds and counts printed |
| npm registry → repo | dependency installs during execution | package code (supply chain) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering | buy route query/body/id | high | mitigate | string-only mode in SALE_MODES, body must be object with qty 1, normalizeObjectId before `purchase.buy` (sale.controller.ts:56-69); buy.test.ts:228-248 | closed |
| T-02-02 | Tampering | V1/V2 stock step under concurrency | high | mitigate | V1 single `findOneAndUpdate` with `$gte`; V2 atomic Lua; unique (saleId, userId) index; buy.test.ts:403-429, lua.test.ts:41-52 | closed |
| T-02-03 | Elevation of privilege | x-test-user on buy route | medium | accept | see Accepted Risks Log (AR-02-01) | closed |
| T-02-04 | Information disclosure | unexpected Lua reply / store error | low | mitigate | plain Error → generic 500 INTERNAL_ERROR (lua.ts:26-27, error.ts:53-54); errors.test.ts:258-271 | closed |
| T-02-05 | Denial of service | logging/warnings on buy path | low | mitigate | no console on success path, no `new: true`; buy.test.ts:162-200, compensation.test.ts:463 | closed |
| T-02-06 | Tampering | reconcile `--sale` argument | low | mitigate | strict parseArgs + normalizeObjectId, exit 1 with usage (cli-args.ts:111-130); cli-args.test.ts:127-153 | closed |
| T-02-07 | Tampering | `--fix` during in-flight buys | medium | mitigate | warning printed first and in usage; CLI-only, never imported by server (reconcile.ts:17-19); reconcile.test.ts:59-60 | closed |
| T-02-08 | Tampering | partial `multi()` failure in `--fix` | medium | mitigate | null exec and per-command `[err]` checked, movement only after clean exec (reconcile.service.ts:130-143); reconcile.test.ts:308-327 | closed |
| T-02-09 | Information disclosure | sample user ids printed by CLI | low | accept | see Accepted Risks Log (AR-02-02) | closed |
| T-02-10 | Tampering | compensation after ambiguous order write | high | mitigate | order lookup by (saleId, userId) before any non-E11000 refund; lookup failure → no refund (purchase.service.ts:170-177); compensation.test.ts:191-248, 377-435 | closed |
| T-02-11 | Repudiation | refunds without audit trail | low | mitigate | one compensate_v1/v2 stock_movements row after successful refund (purchase.service.ts:125-133); compensation.test.ts:162-185 | closed |
| T-02-12 | Information disclosure | compensation failure log lines | low | mitigate | log text limited to saleId, userId, mode, error message (purchase.service.ts:130, 146); compensation.test.ts:270-271 | closed |
| T-02-13 | Tampering | E11000 → DUPLICATE / removing real buyer | medium | mitigate | E11000 → already_bought; V2 refund INCRBY only (no SREM); failed refund → 500 not 409 (purchase.service.ts:108-167); compensation.test.ts:162-187, 305-373 | closed |
| T-02-14 | Elevation of privilege | POST reset / GET stats | high | mitigate | `router.use(requireAuth, requireAdmin)` first on admin router (admin.routes.ts:14); admin.test.ts:227-245 (401 / 403 / x-test-user 403) | closed |
| T-02-15 | Tampering | reset request body | medium | mitigate | non-array object, only string `mode` in SALE_MODES, id normalized (admin.controller.ts:47-59); admin.test.ts:249-265 | closed |
| T-02-16 | Denial of service | admin reset during a measurement | low | accept | see Accepted Risks Log (AR-02-03) | closed |
| T-02-17 | Information disclosure | stats response | low | accept | see Accepted Risks Log (AR-02-04) | closed |
| T-02-18 | Information disclosure | `GET /api/orders/me` | high | mitigate | auth required, user id only from `req.user.id`, `Order.find({ userId })` (order.routes.ts:10, catalog.service.ts:95-96); read.test.ts:362-396 | closed |
| T-02-19 | Tampering | `:id` params on products/sales | low | mitigate | normalizeObjectId → 400 INVALID_ID before queries (catalog.service.ts:56-57, 83-84); read.test.ts:194-197, 307-318 | closed |
| T-02-20 | Information disclosure | response serialization | low | mitigate | explicit whitelist DTO mappers, no document spread (dto.ts); `assertNoMongoInternals` on every read endpoint | closed |
| T-02-21 | Denial of service | list endpoints | low | mitigate | `/orders/me` capped at 100 (catalog.service.ts:18, 96); read.test.ts:398-405 | closed |
| T-02-SC | Tampering | npm installs (all 5 plans) | high | mitigate | no dependency changes since phase start (only a `reconcile` script line in backend/package.json); executors ran `npm ci` from the tracked lockfile | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Paths in the Mitigation column are relative to `backend/src/` (code) and `backend/test/` (tests).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-03 | `x-test-user` is honored only when `NODE_ENV` is exactly `"test"`, always yields role `user`, and `npm start` never enables it (Phase 1 design) | plan 02-01 threat model | 2026-11-08 |
| AR-02-02 | T-02-09 | Reconcile is a local developer CLI against 127.0.0.1-bound stores; it prints ObjectIds only — no names, emails or tokens | plan 02-02 threat model | 2026-11-08 |
| AR-02-03 | T-02-16 | Reset is admin-only; the Phase 3 harness controls when resets happen; mode mixing during a measurement is documented for Phase 5 | plan 02-04 threat model | 2026-11-08 |
| AR-02-04 | T-02-17 | Stats are admin-only and expose counts plus sale mode/status — no user ids or emails | plan 02-04 threat model | 2026-11-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-08 | 22 | 22 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

Notes (non-blocking): only 02-03-SUMMARY has a `## Threat Flags` section (none raised); T-02-05 console-zero assertions live in the single-buy tests, the burst tests assert `emitWarning` only.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-08

## Security Audit 2026-11-12

| Metric | Count |
|---|---|
| Threats found | 22 |
| Closed | 22 |
| Open | 0 |
