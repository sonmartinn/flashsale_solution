# Phase 04 — Pattern Map

Mapped inline on 2026-11-16 from current source, 04-CONTEXT.md and 04-RESEARCH.md. No frontend or root scripts exist yet. Paths in the proposed column are new artifacts, not assertions that files already exist.

| Proposed artifact group | Existing analog / authority | Reuse and boundary |
|---|---|---|
| frontend/package.json, tsconfigs, test runner | backend/package.json; loadtest/package.json | Separate private ESM package; native node:test through tsx; explicit typecheck/build. Frontend bundler resolution differs from backend NodeNext |
| frontend/src/services/types.ts | backend/src/utils/dto.ts; models/flash-sale.ts; models/order.ts | Mirror exact public DTO field names and unions, not Mongoose documents or server runtime imports |
| frontend/src/services/api.ts | loadtest/lib/http.ts; backend/src/middlewares/error.ts | One response/error parser; browser adds AbortSignal and session generation. Never copy the load harness's x-test-user behavior |
| frontend auth provider/services | backend/src/services/auth.service.ts; middlewares/auth.ts | Consume token/user envelope. API remains permission authority; client role is navigation only |
| frontend/src/pages/HomePage.tsx, SalePage.tsx | controllers/product.controller.ts, sale.controller.ts; services/catalog.service.ts | Sale detail uses server now and existing mode-selected remaining; preserve missing stock and negative values |
| frontend/src/pages/OrdersPage.tsx | controllers/order.controller.ts; utils/dto.ts | Use MyOrderDto.product without per-row product requests or client-side joins |
| frontend/src/pages/AdminPage.tsx | controllers/admin.controller.ts; services/sale-admin.service.ts | Stats nullable fields, reset result is not SaleDto; refetch after mutation |
| frontend/src/services/polling.ts + hooks/usePolling.ts | React effect cleanup docs; CONTEXT D-15 | New scheduler; production clock/fetch/visibility seams are testable without a UI testing dependency |
| frontend local assets / layout / CSS | .agents/skills/design-taste-frontend/assets and references | Required skill owns design/dealers/audits; adapt to React, retain original kit files, use waivers for task screens |
| scripts/start.ps1, stop.ps1, dev-common.ps1, dev-runner.ps1 | SPECS §12; backend/test/helpers.ts pattern | New native lifecycle code; helpers centralize project paths, ports and ownership. Fixtures use fake repo/config, never real backend/.env |
| scripts/start.sh, stop.sh, dev-common.sh | SPECS §12; Windows behavior contract from 04-03 | Same behavior and flags, independent POSIX process-group implementation; no claim Windows tree code ports literally |
| scripts/test/dev-scripts.test.mjs | backend/test/build.test.ts; loadtest/test/config.test.ts | node:test + assert; temporary fixtures and production parser/helpers, real controlled children only |
| .gitignore, .gitattributes | Current files | Preserve CSV and GSD rules, append .dev/ and shell EOL rules; git executable bits for .sh |

## Concrete source excerpts

backend/src/utils/dto.ts:

```ts
export interface ProductDto extends ProductSummaryDto {
  attributes: Record<string, unknown>;
  description?: string;
}
```

The comment between these declarations is omitted here; the interface shape is exact. SaleDto has `remaining: number` and `stockLoaded: boolean`, never a frontend-derived Redis estimate.

backend/src/controllers/sale.controller.ts:

```ts
const result = await purchase.buy({ saleId, userId: user.id, mode, qty: 1 });
if (result.kind === "ok") {
  res.status(201).json({ order: result.order });
  return;
}
```

backend/src/controllers/admin.controller.ts:

```ts
res.json({ sale: toResetDto(result) });
res.json({ stats: await saleAdmin.getStats(paramId(req.params["id"])) });
```

These are separate handlers, shown together only to pin envelope names.

backend/test/build.test.ts / loadtest/test/config.test.ts:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
```

Use direct expected outcomes independently of the implementation (e.g. the build test's EXPECTED_REPLACEMENTS). Do not write a fixture that duplicates and validates its own replacement of production logic.

## Cross-cutting notes

- Existing runtime code and manifests are authoritative; the 2026-11-11 codebase map has advisory drift in loadtest.
- No new HTTP endpoint, backend model or root npm workspace is required.
- Use distinct test resources if any backend integration test is added; never point tests at demo MongoDB/Redis db 0.
- Internal API coverage is complete for this phase's intended screens; third-party API integration is out of scope.
