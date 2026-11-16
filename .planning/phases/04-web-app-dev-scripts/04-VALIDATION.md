---
phase: "04"
slug: "web-app-dev-scripts"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-16"
---

# Phase 04 — Validation Strategy

Planning contract only: commands targeting frontend or scripts are not runnable until their owning plan creates those files. No behavior test, browser audit or manual acceptance is recorded as passed by this document.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Native node:test and node:assert/strict; tsx for frontend TypeScript tests |
| Existing pattern | backend/test/build.test.ts; loadtest/test/config.test.ts |
| Frontend configuration | New frontend/package.json, app/node/test tsconfigs in 04-01 |
| Quick frontend command | npm.cmd --prefix frontend test |
| Quick script command | node --test scripts/test/dev-scripts.test.mjs |
| Focused TypeScript command | From frontend: node --import tsx --test test/sale-state.test.ts (substitute owning file) |
| Full gate | Frontend tests/typecheck/build; script fixture suite; backend typecheck/build/test and integration suite when affected/runtime available |
| Browser | agent-browser skill plus the selected design skill's own audit scripts; real dev /api proxy |
| Feedback target | Focused tests under 30 seconds; measure during implementation |

On Windows use npm.cmd; equivalent npm commands work in bash. Invoke checks separately in PowerShell 5.1 and inspect exit codes. Never run the actual start script as the agent in this workspace: it can create/read the prohibited backend/.env. Disposable fixtures may use fake configuration. A real-service UAT checkpoint is explicitly assigned to 04-04.

## Sampling Rate

- After each code task: focused tests and relevant typecheck. Styling/assets: rendered page checks instead of mirrored unit tests.
- At each wave: owning package build and behavior suites; repeat browser scenarios when the changed route/lifecycle warrants them.
- Before verify-work: all required gates green and real Windows UAT evidence recorded. macOS runtime may be explicitly UNTESTED under DEV-05, never silently passed.
- No three consecutive implementation tasks lack automated verification. Checkpoints use the completed preceding automated evidence; they never create fake passes.

## Per-Task Verification Map

| Task ID | Wave | Requirements | Threat Ref | Secure behavior | Automated verification | Additional evidence |
|---|---|---|---|---|---|---|
| 04-01-01 | 1 | WEB-01 | T-04-01 | Official package identity before install | GSD package-legitimacy query | Human verifies SUS package versions/repositories before install |
| 04-01-02 | 1 | WEB-01, WEB-03 | T-04-01 | Render text safely; relative /api | Frontend typecheck/build + api.test.ts | Actual proxy response on home; gate armed before creating page |
| 04-01-03 | 1 | WEB-03 | T-04-01 | Local assets, honest product information | Frontend build + asset checks | Design checker/layout/perf, licensed six images, offline browser |
| 04-02-01 | 2 | WEB-02, WEB-04 | T-04-02 | Current-session Bearer, internal return path | auth.test.ts + sale-state.test.ts | Real login -> one buy on sale.mode |
| 04-02-02 | 2 | WEB-04, WEB-06 | T-04-03 | No automatic retry; current account only | sale-state.test.ts + api.test.ts | Business codes, uncertain result, own orders |
| 04-02-03 | 2 | WEB-02, WEB-04, WEB-06 | T-04-02 | Late old-session replies discarded | Frontend test/typecheck/build | Guest/user switching, reload, clock boundaries; browser route audits |
| 04-03-01 | 2 | DEV-01, DEV-02 | T-04-04 | Only owned launcher tree | Script fixture suite | Fake repo with spaces/accents, start -> stop -> restart |
| 04-03-02 | 2 | DEV-01, DEV-02, DEV-04 | T-04-05 | Seed only on proven empty DB; no secret output | Script fixture suite with PS5.1 AST/encoding checks | Failed Docker/count/npm/health, reused/missing PID, partial start |
| 04-04-01 | 3 | DEV-03, DEV-04 | T-04-06 | Isolated PGID, never caller/foreign group | Script suite + Git Bash bash -n | Runtime remains UNTESTED until macOS evidence |
| 04-04-02 | 3 | DEV-05 | T-04-06 | Accurate validation report and git modes | Script suite + git mode/attribute checks | Manual matrix prepared from every SPECS case |
| 04-04-03 | 3 | DEV-05 | T-04-04 | Agent does not touch real secret file | Prerequisite fixture suite, no real start by agent | User runs all real Windows tests including terminal close |
| 04-05-01 | 4 | WEB-05 | T-04-07 | No overlapping reads or late updates | polling.test.ts with controlled scheduler | Browser delayed request, hide/show, route/account/sale change |
| 04-05-02 | 4 | WEB-05 | T-04-07 | Stale state never becomes invented stock | Full frontend suite/typecheck/build | Retain negative stock and stockLoaded=false, manual refresh fallback |
| 04-06-01 | 5 | WEB-07 | T-04-08 | Server-backed admin permission; honest stats | admin-state.test.ts + frontend suite | Guest/user/admin, null Redis, v0/v1 badge N/A |
| 04-06-02 | 5 | WEB-07 | T-04-08 | Confirmed single reset and invalidated reads | admin-state.test.ts + frontend suite | Cancel/send/fail reset; pause in-flight response |
| 04-06-03 | 5 | WEB-01..07, DEV-05 | all | Full regression and truthful evidence | Frontend/backend typecheck/build; script/behavior suites | Five-route design reports, end-of-phase browser UAT |

## Wave 0 Requirements

- [ ] 04-01 creates frontend manifest/test script with tsx and compiler configs that include tests.
- [ ] 04-01 creates frontend/test/api.test.ts and local asset verification.
- [ ] 04-02 creates frontend/test/auth.test.ts and sale-state.test.ts.
- [ ] 04-03 creates scripts/test/dev-scripts.test.mjs and disposable fake command/repo fixtures.
- [ ] 04-05 creates frontend/test/polling.test.ts exercising the actual production scheduler.
- [ ] 04-06 creates frontend/test/admin-state.test.ts.
- [ ] Browser route checks use actual components and network observations, complementing pure helper tests.

Each harness is created and run with its owning slice. Existing backend tests are reused rather than copied into a different framework.

## Manual-Only Verifications

| Behavior | Requirement | Why manual | Instructions |
|---|---|---|---|
| First real start with missing .env/modules/empty DB | DEV-01, DEV-05 | Agent cannot create/read backend/.env or silently destroy current data | User performs in a disposable clone at an accented path after fixture checks; never delete current data to manufacture this condition |
| Docker Desktop off, terminal closed, real tree cleanup | DEV-02, DEV-05 | Desktop/session boundary and real background lifetime | User exercises SPECS §12 checklist, captures exit codes, ports, container status and logs without secrets |
| Existing repo with real data stays intact | DEV-01, DEV-05 | Real config/service mutation | User starts/stops here after preserving data; no automatic reseed; -Seed tested only on disposable data |
| macOS launch and stop | DEV-03, DEV-05 | No macOS host | bash -n and compatibility review here; README explicitly says runtime not tested unless user supplies evidence |
| Visual final assessment | WEB-01..07 | Images, glyphs, interaction and task-screen waiver review | Render all routes at skill widths 1440/1024/820/768/390/320; keyboard/reduced motion; report PASS/OPEN/ERROR honestly |

## Validation Sign-Off

- [ ] Each task has automated verification or an explicit dependency on its owning harness.
- [ ] Focused command paths exist after the corresponding implementation task.
- [ ] Full tests exercise observable behaviors, not just source strings.
- [ ] Every Windows checklist case has a result and evidence.
- [ ] Required typechecks and builds pass.
- [ ] No unverified browser/gate/macOS result is claimed as passed.
- [ ] nyquist_compliant is updated only after implementation/audit proves it.

**Approval:** pending execution; this is not a claim of passing validation.
