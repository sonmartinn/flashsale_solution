# Phase 1: Foundation (Infra, Data, Auth) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log keeps the alternatives that were considered.

**Date:** 2026-11-03
**Phase:** 01-foundation-infra-data-auth
**Areas discussed:** none. The user delegated every area to Claude.

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Dữ liệu seed | 6 sản phẩm, sản phẩm lên sale, email/mật khẩu admin và user | |
| Tham số seed/reset | mode mặc định, cờ CLI, nội dung in ra | |
| Đăng ký/đăng nhập | độ dài mật khẩu, kiểm tra email, đăng ký trả token, phản hồi login | |
| Health & khởi động | maxPoolSize, health báo test mode/pool, chặn URI cổng khác 27018 | |

**User's choice:** "Không cần bàn gì nhiều, cứ chọn những gì mà bạn thấy hợp lí với dự án môn học này là được"
**Notes:** Claude chose defaults in all four areas and recorded them in CONTEXT.md as D-01..D-21.

## Claude's Discretion

- Seed data: 6 VND-priced products with different `attributes` shapes, the sneaker on sale at half price, `@flashsale.local` accounts, shared password `matkhau123`
- Seed/reset CLI: `--qty` (default 100), `--mode` (default v2), reset `--sale`/`--mode`, `parseArgs`
- Auth: string-only input, password 6–72, register returns a token (201), identical 401 for wrong email or password
- Health: `{ mongo, redis, nodeEnv, maxPoolSize }`, pool 100 set explicitly, refuse Mongo port 27017, 5 s timeouts, committed `.env.test`

## Deferred Ideas

- Phase 3: `.gitignore` exception for summary CSVs; optional `totalQty` on admin reset
- Phase 4: `.dev/` in `.gitignore`; product images under `frontend/public/images/products/`
