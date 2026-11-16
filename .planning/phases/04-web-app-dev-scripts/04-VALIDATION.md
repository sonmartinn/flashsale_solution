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
| Frontend configuration | New frontend/package.json and app/node tsconfigs in 04-01; node project includes pure test files |
| Quick frontend command | npm.cmd --prefix frontend test |
| Quick script command | node --test scripts/test/dev-scripts.test.mjs |
| Focused TypeScript command | From frontend: node --import tsx --test test/sale-state.test.ts (substitute owning file) |
| Full gate | Frontend tests/typecheck/build; script fixture suite; backend typecheck/build plus tests through scripts/test/run-backend-checks.mjs (disposable DOTENV_CONFIG_PATH); integration when warranted |
| Browser | agent-browser skill plus the selected design skill's own audit scripts; real dev /api proxy |
| Feedback target | Focused tests under 30 seconds; measure during implementation |

On Windows use npm.cmd; equivalent npm commands work in bash. Invoke checks separately in PowerShell 5.1 and inspect exit codes. Never run the actual start script as the agent in this workspace: it can create/read the prohibited backend/.env. Disposable fixtures may use fake configuration. A real-service UAT checkpoint is explicitly assigned to 04-07. Browser smoke uses the real isolated API launcher from 04-01, which sets disposable cwd/config before importing backend modules.

## Sampling Rate

- After each code task: focused tests and relevant typecheck. Styling/assets: rendered page checks instead of mirrored unit tests.
- At each wave: owning package build and behavior suites; repeat browser scenarios when the changed route/lifecycle warrants them.
- Before verify-work: all required gates green and real Windows UAT evidence recorded. macOS runtime may be explicitly UNTESTED under DEV-05, never silently passed.
- No three consecutive implementation tasks lack automated verification. Checkpoints use the completed preceding automated evidence; they never create fake passes.

## Per-Task Verification Map

| Task ID | Wave | Requirements | Threat Ref | Secure behavior | Automated verification | Additional evidence |
|---|---|---|---|---|---|---|
| 04-01-01 | 1 | WEB-01 | T-04-01 | Official package identity before install | GSD package-legitimacy query | Human verifies SUS package versions/repositories before install |
| 04-01-02 | 1 | WEB-01, WEB-03 | T-04-01 | Relative /api; isolated API configuration | Frontend typecheck/build | Real proxy/home tracer; gate/deals before first page |
| 04-02-01 | 2 | WEB-01, WEB-03 | T-04-09 | Local licensed six photos/fonts | Asset tests/typecheck/build | Actual served URLs/glyphs |
| 04-02-02 | 2 | WEB-01, WEB-03 | T-04-09 | Honest stand-ins; no runtime CDN | Asset tests/typecheck/build | Offline browser/perf evidence |
| 04-03-01 | 3 | WEB-01, WEB-03 | T-04-10 | Safe typed catalog and text | api.test.ts/typecheck/build | Complete home/catalog/mobile navigation |
| 04-03-02 | 3 | WEB-01, WEB-03 | T-04-10 | Real responsive/read-state evidence | Native suite/typecheck/build | Skill checker/layout/screenshots/perf/gate |
| 04-04-01 | 4 | WEB-02, WEB-04 | T-04-02 | Current-session Bearer, internal return path | auth.test.ts + sale-state.test.ts | Real login -> one mode-correct buy |
| 04-04-02 | 4 | WEB-02, WEB-04 | T-04-02 | Storage/session/clock boundaries | Native suite/typecheck/build | Reload, bad storage and guest/login return |
| 04-05-01 | 5 | WEB-04, WEB-06 | T-04-03 | No automatic retry; current-account orders | sale-state.test.ts + api.test.ts | Business codes, uncertain result, own orders |
| 04-05-02 | 5 | WEB-02, WEB-04, WEB-06 | T-04-03 | Late old-session replies discarded | Native suite/typecheck/build | Customer route/role/clock/browser audit |
| 04-06-01 | 4 | DEV-01, DEV-02 | T-04-04 | Exclusive lifecycle and owned tree | Script fixture suite | Accented repo start -> stop -> restart, concurrent starts |
| 04-06-02 | 4 | DEV-01, DEV-02, DEV-04 | T-04-05 | Proven empty DB; no secret output | Script suite + PS5.1 AST/encoding | Docker/count/npm/health failure, reused/missing PID |
| 04-07-01 | 6 | DEV-03, DEV-04 | T-04-06 | Isolated PGID, never caller/foreign group | Script suite + individual bash -n per file | macOS runtime UNTESTED unless observed |
| 04-07-02 | 6 | DEV-05 | T-04-06 | Accurate report/git modes | Script suite + mode/attribute checks | Every SPECS real-case row prepared |
| 04-07-03 | 6 | DEV-05 | T-04-04 | Agent never touches real secret | Green fixture prerequisite | User real Windows checklist/terminal close |
| 04-08-01 | 7 | WEB-05 | T-04-07 | No overlapping reads or late updates | polling.test.ts + typecheck | Browser delayed/hide/route/account lifecycle |
| 04-08-02 | 7 | WEB-05 | T-04-07 | Stale stock remains honest | Native suite/typecheck/build | Negative/missing stock and manual refresh |
| 04-09-01 | 8 | WEB-07 | T-04-08 | Server-backed admin; honest nullable stats | admin-state.test.ts + typecheck | Roles, pause and nullable badge |
| 04-09-02 | 8 | WEB-07 | T-04-08 | Confirmed single reset; no stale read | Native suite/build | Cancel/send/fail reset and pause race |
| 04-09-03 | 8 | WEB-01..07, DEV-05 | all | Full regression; no actual env read | Frontend/backend typecheck/build; protected backend runner; fixture suite | Five-route skill/UI-UAT and real Windows evidence |

## Wave 0 Requirements

- [ ] 04-01 creates manifest/test script/strict configs and the isolated real API launcher; tests begin in 04-02, so the bootstrap checks type/build/browser rather than claiming zero tests.
- [ ] 04-02 creates frontend/test/assets.test.ts; 04-03 creates api.test.ts.
- [ ] 04-04 creates frontend/test/auth.test.ts and sale-state.test.ts.
- [ ] 04-06 creates scripts/test/dev-scripts.test.mjs and disposable fake command/repo fixtures.
- [ ] 04-08 creates frontend/test/polling.test.ts for the actual production scheduler.
- [ ] 04-09 creates admin-state.test.ts and scripts/test/run-backend-checks.mjs protecting backend tests from implicit dotenv reads.
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
