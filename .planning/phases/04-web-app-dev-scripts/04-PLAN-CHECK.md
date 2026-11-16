# Phase 04 — Planning verification and source coverage

**Date:** 2026-11-16
**Result:** VERIFICATION PASSED (planning only)
**Plans:** 9; **waves:** 8; **tasks:** 20

Research and initial planning were performed inline. An independent typed gsd-plan-checker reviewed the plans twice. First review found two scope BLOCKERs: old 04-01 declared 29 paths and old 04-02 declared 17. Both were split without cutting functionality. Second review returned `VERIFICATION PASSED`, no new actionable issue, with all requirements and D-01..25 retained. This document does not claim any application build, browser audit or real-machine UAT has already passed.

## Final execution shape

| Wave | Plans | Deliverable | Declared paths |
|---|---|---|---|
| 1 | 04-01 | Package checkpoint, design/deals, bounded real home/proxy tracer and isolated API fixture | 14 |
| 2 | 04-02 | Six local photographs, dealt fonts, asset licences and offline evidence | 12 |
| 3 | 04-03 | Complete public storefront, shared layout and typed catalog client | 9 |
| 4 | 04-04, 04-06 | Login-to-buy tracer; independent Windows start/stop fixtures | 13, 9 |
| 5 | 04-05 | Own orders, complete purchase outcomes and customer-route audits | 12 |
| 6 | 04-07 | Bash parity and blocking real Windows UAT | 7 |
| 7 | 04-08 | Cuttable sale polling | 6 |
| 8 | 04-09 | Cuttable admin monitor/reset and full phase verification evidence | 11 |

04-04 and 04-06 have disjoint write ownership. 04-08's dependency on completed scripts is an explicit priority fence, preserving mandatory work before cuttable work. No automatic advance to implementation was requested.

## Requirement source audit

| Source | ID | Implementing plan(s) | Status |
|---|---|---|---|
| GOAL | Browser demo and one-command cross-platform dev lifecycle | 01–09 | COVERED |
| REQ | WEB-01 | 01, 02, 03, 09 | COVERED |
| REQ | WEB-02 | 04, 05 | COVERED |
| REQ | WEB-03 | 01, 02, 03 | COVERED |
| REQ | WEB-04 | 04, 05 | COVERED |
| REQ | WEB-05 | 08 | COVERED |
| REQ | WEB-06 | 05 | COVERED |
| REQ | WEB-07 | 09 | COVERED |
| REQ | DEV-01 | 06 | COVERED |
| REQ | DEV-02 | 06 | COVERED |
| REQ | DEV-03 | 07 | COVERED |
| REQ | DEV-04 | 06, 07 | COVERED |
| REQ | DEV-05 | 07 | COVERED |

WEB-08/Recharts, full README, measured-results analysis and backend-risk documentation stay in Phase 5. No official experiment is rerun, no current user configuration is accessed, and no old worktree is merged/deleted.

## Decision source audit

| CONTEXT decision | Full implementing work | Plans |
|---|---|---|
| D-01 | Required design skill, references and own audit scripts | 01–05, 08, 09 |
| D-02 | Product/other fashion storefront, no technical marketing | 01–03 |
| D-03 | Gate before page, first-valid deals, local typography, motion/reduced motion | 01, 02, 03 |
| D-04 | Functional task screens and semantic data, justified waivers | 03–05, 09 |
| D-05 | All six exact local product image paths, licences/stand-ins/credit | 01, 02 |
| D-06 | Shared nav, account/admin links and keyboard mobile menu | 03, 04, 05, 09 |
| D-07 | Sale-first home, real six-product catalog, no false non-sale buy action | 01, 03 |
| D-08 | Sale product/attributes, VND prices and corrected endAt countdown | 04 |
| D-09 | Loading/empty/error/stale/retry states without invented values | 03, 05, 08, 09 |
| D-10 | Login/register, minimal persisted session, no password/role input | 04 |
| D-11 | Guest return path, route guards, protected401 vs invalid credentials | 04, 05, 09 |
| D-12 | One numeric-qty purchase on sale.mode and eligibility lock | 04, 05 |
| D-13 | Accessible distinct outcomes, uncertain POST/no retry, reset/account state | 05, 08 |
| D-14 | Current user's newest orders from MyOrderDto | 05 |
| D-15 | Serial2000ms reads, cancellation/visibility cleanup/manual refresh | 08, 09 |
| D-16 | Negative stock/missing Redis/failed reads remain truthful | 05, 08, 09 |
| D-17 | Active or explicit validated sale selection including ended sales | 09 |
| D-18 | Exact stats/nulls, red oversold, count-only V2 sync badge | 09 |
| D-19 | Pause/resume and last update, E2 other-tab notice | 09 |
| D-20 | Confirmed mode-only single reset, invalidate reads, no retry | 09 |
| D-21 | Exact ten/four step lifecycle, flags, Vietnamese status and URLs/logs | 06, 07 |
| D-22 | No foreign kills/install/reseed, explicit Seed destructive notice | 06, 07 |
| D-23 | Real env remains user-only; agent fixtures isolate all config | 01, 06, 07, 09 |
| D-24 | PS5.1 BOM/CRLF, bash3.2 LF/modes, ownership/tree/group cleanup | 06, 07 |
| D-25 | Type/build + functional/design + actual Windows evidence, macOS disclosure | 03, 05, 07, 08, 09 |

## Research source audit

| Research result | Implementing work | Status |
|---|---|---|
| R1 session-bound typed client | 01/03 client, 04 auth, 05 private data | COVERED |
| R2 uncertain purchase state | 04 latch, 05 outcomes/orders/reset epoch | COVERED |
| R3 countdown and serial reads | 04 clock, 08 scheduler, 09 pause/reset | COVERED |
| R4 selected design skill/offline assets | 01/02/03 plus every new task route | COVERED |
| R5 Windows launcher/ownership | 06 fixtures, 07 real UAT | COVERED |
| R6 macOS groups/nohup | 07 shell slice and explicit runtime limitation | COVERED |
| R7 exact ordered lifecycle/seed guard | 06/07 fixtures and real UAT | COVERED |
| Package-age SUS | 01 pre-install human verification checkpoint | COVERED |
| Environment limitations | 06 fixtures, 07 manual/platform disclosure | COVERED |
| Implicit dotenv reads | 01 real API isolated cwd/config; 09 protected backend test runner | COVERED |

## Deterministic verification evidence

Executed after the split:

- `verify plan-structure` on all nine plans: valid=true, errors=[], warnings=[] for each, 2–3 tasks per plan.
- `check verify-command-paths 4 --raw`: exit0, status pending_creation, 48 commands, blocker0/warning0, readError=null. Frontend targets are deliberately pending their owning bootstrap; this is not evidence commands already ran.
- `check verify-failure-directions 4 --raw`: exit0, status ok, 48 commands, blocker0/warning0, readError=null.
- `query check.decision-coverage-plan <phase-dir> <context>`: passed=true, total25/covered25, uncovered=[].
- `check gap-analysis-plan-post`: passed=true, block=false, all37 source items covered (12 requirements +25 decisions).
- UI gate before planning: frontend=true, hasFrontendEvidence=false, hasUiSpec=false, block=false. No skip override was used. 04-01 owns required design/deal work before page creation; no UI-SPEC is fabricated in this run.
- Context drift precheck skipped for no upstream artifacts. Codebase drift advisory names ten changed loadtest structural elements; direct current-code inspection supplied API contracts. No mapper rerun was necessary for this planning task.

Existing source-of-truth paths were read and confirmed tracked with git ls-files. New frontend/script paths are explicitly declared artifacts. The design skill's local kit is a read/copy reference; plans do not edit its checker or ignored installation files.

## Spec-less edge fallback

The deterministic edge probe ran over all twelve requirement descriptions. It returned 16 items: nine classified edges and seven unclassified requirements. No item was silently dismissed. Classified edges have explicit criteria below; unclassified items remain flagged in the relevant PLAN planning_assumptions blocks, with existing SPECS/CONTEXT behavior criteria as the execution contract.

| Requirement | Probe category | Disposition / exact planned evidence |
|---|---|---|
| WEB-01 | concurrency | Explicit, 01/03 strict5173 and cancellable reads; 06 lifecycle prevents duplicate starts |
| WEB-02 | unclassified | Flag retained, 04 auth/return/session acceptance; no inferred relaxation |
| WEB-03 | unclassified | Flag retained, 03 real/empty catalog criteria |
| WEB-04 | unclassified | Flag retained, 04/05 server-clock/single-purchase/outcome criteria |
| WEB-05 | adjacency | Explicit, 08 one completion-scheduled2000ms timer and coalesced manual refresh |
| WEB-05 | empty | Explicit, 08 invalid/absent sale cancels reads; no invented stock |
| WEB-05 | ordering | Explicit, 08 latest generation wins, old replies ignored |
| WEB-06 | unclassified | Flag retained, 05 current-user order DTO criteria |
| WEB-07 | concurrency | Explicit, 09 pause/reset invalidates outstanding reads and single-submit reset |
| DEV-01 | unclassified | Flag retained, 06 exact ten-step cases |
| DEV-02 | concurrency | Explicit, 06 exclusive lifecycle lock and own tree teardown |
| DEV-03 | adjacency | Explicit, 07 service PGID equal to caller is rejected |
| DEV-03 | empty | Explicit, 07 no PID/listener is a successful no-op |
| DEV-03 | ordering | Explicit, 07 exact10-step startup/4-step shutdown with parity checks |
| DEV-04 | unclassified | Flag retained, 06/07 EOL/modes/ignore criteria |
| DEV-05 | unclassified | Flag retained, 07 real Windows checkpoint/platform disclosure |

Equality: 16 surfaced = 9 explicit behavioral criteria + 7 retained classification flags. These flags are classifier uncertainty, not unresolved product choices the planner silently answered.

Prohibition recall examined false product claims, fake brand endorsements, misleading runtime evidence, official-result substitution, secret exposure, foreign kills, unintended reseed, permission bypass, stale responses and invasive dependency installation. Canonical security/process correctness was referred to existing controls/threat models rather than minting new duplicate tests. Two trust/judgment prohibitions remain in 02 and 07: honest stand-in imagery and honest platform acceptance. They were serialized through projectProhibitions as descriptor-less resolved/judgment items; their execution-time judgment is flagged for review, never a fabricated mechanical PASS.

Assumption-delta detector matched only roadmap wording `alongside Phase 3`. Decision: **no-change**; primary noun stays one sale/account identity in the existing API, with Windows/macOS launchers as OS-specific implementations. This match introduces no second domain identity or schema migration.

## Remaining execution gates

1. 04-01: package-legitimacy human verification for required packages that the age heuristic marked SUS, before installing dependencies.
2. 04-07: user-run real Windows checklist. AGENTS.md/D-23 prohibit the agent from exercising actual secret-file/desktop/terminal scenarios.
3. During implementation: actual typechecks/builds, tests, five-route browser/skill reports and honest waivers. macOS runtime can remain explicitly UNTESTED under SPECS if only syntax/compatibility evidence exists.

The planning checker is green; implementation validation remains draft in 04-VALIDATION.md until executed.
