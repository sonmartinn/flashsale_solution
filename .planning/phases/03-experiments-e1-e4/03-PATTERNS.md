# Phase 3: Experiments (E1-E4) - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 31 (8 backend modified/added, 23 new under `loadtest/` + `.gitignore`)
**Analogs found:** 27 / 31 (all analogs are git-tracked under `backend/`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/services/sale-admin.service.ts` (MOD: D-01 totalQty, D-07 uniqueOrderIndex) | service | CRUD | itself (lines 19-22, 65-110, 127-158) | exact |
| `backend/src/controllers/admin.controller.ts` (MOD: D-01 body check) | controller | request-response | itself (lines 45-64, mode check) | exact |
| `backend/scripts/cli-args.ts` (MOD: `--qty` for reset) | utility | transform | itself `parseQty` (51-56), `parseResetArgs` (76-93) | exact |
| `backend/scripts/reset.ts` (MOD: pass totalQty) | CLI | batch | itself (line 54) | exact |
| `backend/test/integration/reset.test.ts` / new `reset-qty` cases | test | CRUD | `backend/test/integration/reset.test.ts` | exact |
| `backend/test/integration/admin.test.ts` (MOD: STATS_KEYS + 400 cases) | test | request-response | itself (lines 26-39, 154) | exact |
| `backend/test/cli-args.test.ts` (MOD: reset `--qty`) | test | transform | itself (seed `--qty` cases) | exact |
| `.gitignore` (MOD, D-12) | config | - | lines 7-9 | exact |
| `loadtest/package.json` | config | - | `backend/package.json` | role-match |
| `loadtest/tsconfig.json` | config | - | `backend/tsconfig.json` | exact |
| `loadtest/lib/config.ts` | utility | transform | `backend/scripts/cli-args.ts` | exact |
| `loadtest/lib/reconcile.ts` | utility | process spawn | `backend/test/helpers.ts` `spawnCli` (306, 313-324) | exact |
| `loadtest/lib/admin.ts` | service (HTTP client) | request-response | `backend/test/integration/admin.test.ts` (reset/stats helpers) + RESEARCH Pattern 5 | role-match |
| `loadtest/lib/http.ts` | service (HTTP client) | request-response burst | RESEARCH Pattern 2; `backend/test/integration/buy.test.ts` concurrency | partial |
| `loadtest/lib/preflight.ts` | service | request-response | RESEARCH Pattern 5 contract | partial |
| `loadtest/lib/ids.ts` | utility | transform | `backend/src/utils/object-id.ts` (format) | partial |
| `loadtest/lib/csv.ts` | utility | file-I/O | none | no analog |
| `loadtest/lib/histogram.ts` | utility | transform | none | no analog |
| `loadtest/lib/env-info.ts` | utility | process spawn | `backend/test/helpers.ts` (spawnSync import line 10) | partial |
| `loadtest/lib/ports.ts` | utility | process spawn | RESEARCH Pattern 4 | no analog |
| `loadtest/lib/verdict.ts` | utility | transform | none (pure rules from D-13..D-16, D-25, D-29) | no analog |
| `loadtest/scenarios/e1-correctness.ts` | CLI entry | batch | `backend/scripts/reset.ts` (CLI skeleton) | role-match |
| `loadtest/scenarios/e3-duplicate.ts` | CLI entry | batch | `backend/scripts/reset.ts` | role-match |
| `loadtest/scenarios/e2-performance.ts` | CLI entry | streaming load | `backend/scripts/reset.ts` + RESEARCH Pattern 1 | role-match |
| `loadtest/scenarios/e4-mongo-outage.ts` | CLI entry | event-driven | `backend/scripts/reset.ts` + `lib/reconcile.ts` | role-match |
| `loadtest/test/*.test.ts` | test | transform | `backend/test/cli-args.test.ts` | exact |
| `loadtest/README.md` | doc | - | - | n/a |
| `loadtest/results/.gitkeep` | config | - | existing | exact |

## Pattern Assignments

### `backend/src/services/sale-admin.service.ts` (service, CRUD) — D-01 + D-07

**Analog:** itself.

Extend `ResetOptions` (lines 19-22):
```typescript
export interface ResetOptions {
  /** Có thì ghi đè mode của đợt sale; không có thì giữ mode hiện tại (D-07). */
  mode?: SaleMode;
}
```
Add `totalQty?: number` with a Vietnamese doc comment. Validate in the service as well (the CLI calls the service directly), mirroring the mode check lines 68-70:
```typescript
if (opts.mode !== undefined && !SALE_MODES.includes(opts.mode)) {
  throw new HttpError(400, "mode phải là v0, v1 hoặc v2", "VALIDATION_ERROR");
}
```
Change line 74 `const totalQty = sale.totalQty;` to `const totalQty = opts.totalQty ?? sale.totalQty;` and add `totalQty` to the `$set` at lines 84-90 (same conditional-spread style as `mode`). Update the comment on line 80 ("totalQty không bao giờ bị đổi") — it is no longer true. The checked `multi()` (98-102) and `StockMovement.create({ delta: totalQty, reason: "reset" })` (106) pick up the new value with no further change.

D-07: add `uniqueOrderIndex: boolean` to `SaleStats` (27-46) and `Order.listIndexes()` to the `Promise.all` at lines 131-137. Narrow the `any[]` result; true iff an index has `unique === true` and `Object.keys(key)` is exactly `["saleId","userId"]` with both values `1`. Catch MongoServerError code 26 -> false, rethrow otherwise. Update the doc comment (line 123 "năm lần đọc" -> sáu).

---

### `backend/src/controllers/admin.controller.ts` (controller, request-response)

**Analog:** itself, lines 47-62 — copy the `raw: unknown` read-one-field pattern:
```typescript
const body: unknown = req.body ?? {};
if (typeof body !== "object" || body === null || Array.isArray(body)) {
  throw new HttpError(400, "Body phải là một object JSON", "VALIDATION_ERROR");
}
const raw: unknown = (body as { mode?: unknown }).mode;
...
const result = await saleAdmin.resetSale(paramId(req.params["id"]), mode !== undefined ? { mode } : {});
```
Add after the mode check: `const rawQty: unknown = (body as { totalQty?: unknown }).totalQty;` and if defined require `typeof rawQty === "number" && Number.isSafeInteger(rawQty) && rawQty >= 1 && rawQty <= 1_000_000`, else `throw new HttpError(400, "...", "VALIDATION_ERROR")`. Build opts with conditional spreads. No try/catch (Express 5). Update JSDoc on line 42 to `{ mode?, totalQty? }`.

---

### `backend/scripts/cli-args.ts` + `backend/scripts/reset.ts`

**Analog:** `parseQty` (cli-args.ts 51-56) — reuse as-is:
```typescript
function parseQty(raw: string): number {
  if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > MAX_QTY) {
    throw new CliArgsError(`--qty phải là số nguyên dương từ 1 đến ${MAX_QTY}, nhận "${raw}"`);
  }
  return Number(raw);
}
```
In `parseResetArgs` (76-93) add `qty: { type: "string" }` to options, `qty?: number` to `ResetArgs` (26-29), and `if (rawQty !== undefined) out.qty = parseQty(rawQty);`. Update `RESET_USAGE` (line 16). In `reset.ts` line 54 build opts with both `mode` and `totalQty: args.qty` conditionally; line 1 comment and line 62 log already print totalQty.

---

### `backend/test/integration/*.test.ts` (test)

**Analog:** `backend/test/integration/reset.test.ts` (lines 1-12, 16-23, 35, 56-58) and `admin.test.ts`.
- Header comment names db and Redis index; one top-level `describe("<file>.test", ...)` (helpers.ts lines 3-5).
- `({ redis } = await connectTestStores("reset", 3));` / `dropTestDatabaseAndDisconnect` in `after`.
- Error assertion helper `isHttpError(status, code)` (reset.test.ts 16-23).
- **Redis db indices already used:** 1 health, 2 seed, 3 reset, 4 auth, 6 lua, 7 buy, 8 compensation, 9 read, 10 admin, 11 reconcile. **Free: 5, 12-15.** If adding a new file, use 12 (and 13, ...). Prefer adding cases to existing `reset.test.ts` (db 3) and `admin.test.ts` (db 10) instead of new files.
- `admin.test.ts` lines 26-39 `STATS_KEYS` (sorted list of eleven keys) MUST gain `"uniqueOrderIndex"` (sorted position: after `totalQty`), otherwise the existing exact-keys test breaks. Comment "Mười một trường" -> "Mười hai".
- `test/cli-args.test.ts`: copy the seed `--qty` cases loop `for (const bad of ["0","-1","1.5","abc","1000001","","007"])` for `parseResetArgs`.

---

### `.gitignore` (D-12)

Current lines 7-9:
```
# Kết quả thô khi chạy test tải, chỉ giữ thư mục
loadtest/results/*
!loadtest/results/.gitkeep
```
Replace with `loadtest/results/raw/` ignore, keeping `*.csv` and `.gitkeep` tracked (simplest: just `loadtest/results/raw/`). Consider adding `.gitattributes` `loadtest/results/*.csv text eol=lf` (RESEARCH Pitfall 8, autocrlf=true on operator machine).

---

### `loadtest/package.json` + `loadtest/tsconfig.json` (config)

**Analog:** `backend/package.json`, `backend/tsconfig.json`.
tsconfig to copy verbatim, changing only `include`:
```json
{
  "compilerOptions": {
    "target": "es2023", "lib": ["ES2023"], "module": "nodenext", "types": ["node"],
    "strict": true, "verbatimModuleSyntax": true, "skipLibCheck": true, "noEmit": true
  },
  "include": ["lib", "scenarios", "test"]
}
```
Note: `lib: ["ES2023"]` has no DOM; `fetch`, `AbortSignal`, `performance` come from `@types/node` — fine.
package.json fields to copy: `"private": true, "type": "module", "engines": {"node": ">=20.19.0"}`, `"typecheck": "tsc --noEmit"`, test pattern `node --import tsx --test \"test/*.test.ts\"` (no build step needed). Scenario scripts follow `"reset": "tsx scripts/reset.ts"` style: `"e1": "tsx scenarios/e1-correctness.ts"`, etc. devDeps versions identical to backend: `@types/node ^24.19.2`, `tsx ^4.23.15`, `typescript ~7.0.2`; plus `autocannon ^8.0.0`, `@types/autocannon ^7.12.7`.

---

### `loadtest/lib/config.ts` (utility, transform)

**Analog:** `backend/scripts/cli-args.ts` — copy `CliArgsError` class (8-13), `parseStrict` wrapper (38-49) translating parseArgs errors to Vietnamese, positive-int parser (51-56), boolean flag handling as in `parseReconcileArgs` (107-131, `fix: { type: "boolean" }` -> use for `--smoke`). Keep it pure (no I/O) so `test/config.test.ts` can cover it like `backend/test/cli-args.test.ts`. Env fallbacks (`LOADTEST_BASE_URL`, `LOADTEST_ADMIN_EMAIL`, `LOADTEST_ADMIN_PASSWORD`) read via a passed-in env object for testability.

---

### `loadtest/lib/reconcile.ts` (utility, process spawn) — D-10

**Analog:** `backend/test/helpers.ts` lines 25-26, 306, 313-324:
```typescript
export const BACKEND_ROOT = fileURLToPath(new URL("../", import.meta.url));
const TSX_LOADER = import.meta.resolve("tsx");
...
const entry = path.join(BACKEND_ROOT, "scripts", `${script}.ts`);
return spawnNodeAndCollect(["--import", TSX_LOADER, entry, ...(opts.args ?? [])], ...);
```
In loadtest use `fileURLToPath(new URL("../../backend/", import.meta.url))`, `spawn(process.execPath, args, { cwd: BACKEND_DIR, stdio: ["ignore","pipe","pipe"], windowsHide: true })`, 30 s kill timer (full code in RESEARCH Pattern 3). `cwd` must be `backend/` so `dotenv/config` loads `backend/.env`. Exit 0 clean, 2 drift, else INVALID. Same helper reused for `--fix` in E4 and (shell-less) `docker stop|start flashsale-mongo` via `spawn("docker", [...])`.

---

### `loadtest/lib/admin.ts` + `lib/preflight.ts` (HTTP client, request-response)

**Analog:** `backend/test/integration/admin.test.ts` (reset/stats calls against `startApp().baseUrl`); response shapes:
- reset: `res.json({ sale: toResetDto(result) })` (admin.controller.ts 63) -> `{ sale: { saleId, mode, totalQty, startAt, endAt } }`.
- stats: `res.json({ stats: ... })` (line 68) with `SaleStats` fields (sale-admin.service.ts 27-46) + `uniqueOrderIndex`.
- health/login/active-sale shapes: RESEARCH Pattern 5. Narrow every `unknown` JSON field the same way the controller narrows `body` (typeof checks, no casts of whole objects).
- Body-less POSTs omit Content-Type; reset with body sends `content-type: application/json`.

---

### `loadtest/lib/ids.ts` (utility)

**Analog (format only):** `backend/src/utils/object-id.ts` `normalizeObjectId` — server accepts 24 hex; harness emits lowercase. Unit test asserts `/^[0-9a-f]{24}$/` and uniqueness.

---

### `loadtest/scenarios/*.ts` (CLI entry, batch)

**Analog:** `backend/scripts/reset.ts` skeleton:
- Top-level await, top-of-file usage comment (line 1-3).
- Parse args first in try/catch, `if (err instanceof CliArgsError) fail(...)` (18-24) — but the harness exits **2** on INVALID (D-16), so write a local `fail`-like helper modeled on `backend/src/utils/fail.ts`:
```typescript
export function fail(message: string): never {
  console.error(`[LỖI] ${message}`);
  process.exit(1);
}
```
with exit code parameterised (0/1/2).
- `try { ... } finally { restore sale (D-04) }` mirrors reset.ts 52-71 (`finally` cleanup, `process.exitCode = n` instead of `process.exit` so finally runs).
- E2 core: RESEARCH Pattern 1 (`runPhase`), E1/E3: Pattern 2, pacing: Pattern 4.

---

### `loadtest/test/*.test.ts` (test, pure)

**Analog:** `backend/test/cli-args.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CliArgsError, parseReconcileArgs, parseResetArgs, parseSeedArgs } from "../scripts/cli-args.js";

describe("cli-args.test", () => {
  ...
    for (const bad of ["0", "-1", "1.5", "abc", "1000001", "", "007"]) {
      it(`từ chối --qty "${bad}"`, () => { assert.throws(() => parseSeedArgs([`--qty=${bad}`]), CliArgsError); });
    }
```
One top-level `describe("<file>.test")`, Vietnamese `it` names, `.js` import suffixes, table-driven cases.

## Shared Patterns

### ESM / TS conventions
**Source:** `backend/src/controllers/admin.controller.ts` lines 1-4. `import type` for types, `.js` suffix on relative imports, default import for CJS (`import autocannon from "autocannon"`), named node built-ins from `node:*`.

### Untrusted JSON narrowing
**Source:** `admin.controller.ts` 47-58; `backend/test/helpers.ts` 147-150 (`const pkg: unknown = JSON.parse(...)`, then `typeof x === "object" && x !== null ? (x as { k?: unknown }).k : undefined`). Apply to every HTTP response parsed in `loadtest/lib/admin.ts`, `http.ts`, `preflight.ts`.

### Paths with Vietnamese characters / spaces
**Source:** `backend/test/helpers.ts` 26, 146: always `fileURLToPath(new URL(..., import.meta.url))` / `import.meta.resolve`, never `URL.pathname`; spawn `process.execPath` with argv array, no shell. Apply to `lib/reconcile.ts`, `lib/env-info.ts` (git), `lib/ports.ts` (netstat), E4 docker calls, and CSV output paths.

### CLI error messages
**Source:** `backend/src/utils/fail.ts`, `scripts/cli-args.ts` 47: one-line `[LỖI] ...` Vietnamese; usage line after arg errors.

### Redis `multi()` result check
**Source:** `sale-admin.service.ts` 96-102 — keep unchanged when the reset carries the new totalQty.

## No Analog Found

| File | Role | Data Flow | Reason / Use instead |
|---|---|---|---|
| `loadtest/lib/csv.ts` | utility | file-I/O | No CSV writer in repo. Follow D-11 (LF, no BOM, quote only when needed, `appendFileSync` per row) |
| `loadtest/lib/histogram.ts` | utility | transform | Nearest-rank on `Float64Array.sort()` (RESEARCH anti-patterns) |
| `loadtest/lib/ports.ts` | utility | process spawn | RESEARCH Pattern 4 (netstat, maxBuffer >= 64 MiB, budget 10,000) |
| `loadtest/lib/verdict.ts` | utility | transform | Pure rules from CONTEXT D-13..D-16, D-19, D-25 (amended), D-29 (amended) |

## Metadata

**Analog search scope:** `backend/src`, `backend/scripts`, `backend/test`, root `.gitignore` (all git-tracked; `loadtest/` contains only `results/.gitkeep` today)
**Files scanned:** ~12
**Pattern extraction date:** 2026-11-09
