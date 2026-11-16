---
phase: 03-experiments-e1-e4
verified: 2026-11-13T16:48:51Z
status: passed
score: 51/51 must-haves verified
covered_files:
  - .gitattributes
  - .gitignore
  - .planning/phases/03-experiments-e1-e4/03-01-PLAN.md
  - .planning/phases/03-experiments-e1-e4/03-01-SUMMARY.md
  - .planning/phases/03-experiments-e1-e4/03-02-PLAN.md
  - .planning/phases/03-experiments-e1-e4/03-02-SUMMARY.md
  - .planning/phases/03-experiments-e1-e4/03-03-PLAN.md
  - .planning/phases/03-experiments-e1-e4/03-03-SUMMARY.md
  - .planning/phases/03-experiments-e1-e4/03-04-PLAN.md
  - .planning/phases/03-experiments-e1-e4/03-04-SUMMARY.md
  - .planning/phases/03-experiments-e1-e4/03-05-PLAN.md
  - .planning/phases/03-experiments-e1-e4/03-05-SUMMARY.md
  - .planning/phases/03-experiments-e1-e4/03-06-PLAN.md
  - .planning/phases/03-experiments-e1-e4/03-06-SUMMARY.md
  - .planning/phases/03-experiments-e1-e4/03-CONTEXT.md
  - .planning/phases/03-experiments-e1-e4/03-REGRESSION.md
  - .planning/phases/03-experiments-e1-e4/03-REVIEW-DISPOSITION.md
  - .planning/phases/03-experiments-e1-e4/03-REVIEW.md
  - .planning/phases/03-experiments-e1-e4/03-SECURITY.md
  - .planning/phases/03-experiments-e1-e4/03-UI-REVIEW.md
  - .planning/phases/03-experiments-e1-e4/03-VALIDATION.md
  - backend/scripts/cli-args.ts
  - backend/scripts/reset.ts
  - backend/src/controllers/admin.controller.ts
  - backend/src/services/sale-admin.service.ts
  - backend/test/cli-args.test.ts
  - backend/test/integration/admin.test.ts
  - backend/test/integration/harness-support.test.ts
  - loadtest/README.md
  - loadtest/lib/admin.ts
  - loadtest/lib/autocannon-phase.ts
  - loadtest/lib/classify.ts
  - loadtest/lib/config.ts
  - loadtest/lib/csv.ts
  - loadtest/lib/docker.ts
  - loadtest/lib/env-info.ts
  - loadtest/lib/histogram.ts
  - loadtest/lib/http.ts
  - loadtest/lib/ids.ts
  - loadtest/lib/ports.ts
  - loadtest/lib/preflight.ts
  - loadtest/lib/reconcile.ts
  - loadtest/lib/session.ts
  - loadtest/lib/types.ts
  - loadtest/lib/verdict.ts
  - loadtest/package-lock.json
  - loadtest/package.json
  - loadtest/results/.gitkeep
  - loadtest/results/e1.csv
  - loadtest/results/e2.csv
  - loadtest/results/e3.csv
  - loadtest/results/e4.csv
  - loadtest/scenarios/e1-correctness.ts
  - loadtest/scenarios/e2-performance.ts
  - loadtest/scenarios/e3-duplicate.ts
  - loadtest/scenarios/e4-mongo-outage.ts
  - loadtest/test/checks.test.ts
  - loadtest/test/classify.test.ts
  - loadtest/test/config.test.ts
  - loadtest/test/csv.test.ts
  - loadtest/test/env-info.test.ts
  - loadtest/test/histogram.test.ts
  - loadtest/test/ids.test.ts
  - loadtest/test/ports.test.ts
  - loadtest/test/verdict.test.ts
  - loadtest/tsconfig.json
covered_digest: "v4:sha256:41d2a2dabf4fcb646370f3e593c18cef77ded1567f3c27b38bb2d2816fb259f4"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 03: Experiments (E1–E4) — Báo cáo xác minh

**Mục tiêu phase:** Thí nghiệm lặp lại, tự kiểm tra phải cho thấy bằng số liệu V0 bán quá, V1/V2 không bán quá, mỗi người tối đa một đơn, và so sánh thông lượng/độ trễ V1 với V2.

**Xác minh:** 2026-11-13T16:48:51Z  
**Trạng thái:** `passed`  
**Tái xác minh:** Không — xác minh đầu tiên.

## Goal Achievement

### Observable Truths

Điểm số gộp 51 chân lý chi tiết trong sáu PLAN; năm tiêu chí hợp đồng của ROADMAP đều được bao phủ bởi các chân lý này.

| # | Chân lý quan sát được | Trạng thái | Bằng chứng trong mã và artefact |
|---|---|---|---|
| 1 | E1 thực hiện 5 lượt V0/V1/V2, 1.000 user khác nhau, kho 100, reset trước từng lượt và từ chối môi trường không đáng tin. | ✓ VERIFIED | `e1-correctness.ts` gọi `resetAndCheck`, tạo 1.000 id rồi `burst`; `openSession` kiểm tra health test-mode, đăng nhập admin và `uniqueOrderIndex`. CSV chính thức có 15 hàng PASS (5/mode). |
| 2 | E1 chỉ PASS khi V0 bán quá, V1/V2 có đúng `totalQty` đơn, và V2 đối soát sạch; CSV đã được commit. | ✓ VERIFIED | `judgeE1Run` FAIL V0 nếu `oversold=0`, FAIL V1/V2 nếu số đơn sai/bán quá; V2 kiểm tra reconcile. `e1.csv`: V0 oversold 899/900/594/233/739, mọi V1/V2 `orders=distinctUsers=100`, V2 `reconcile=clean`. |
| 3 | E3 bắn đồng thời 10 request từ một user cho V1/V2 và chỉ PASS khi có đúng một đơn, không rò kho; CSV đã được commit. | ✓ VERIFIED | `e3-duplicate.ts` tạo một id rồi `burst` 10 request; `judgeE3Run` kiểm tra 1×201, 9×409, một order và tồn kho/reconcile. `e3.csv` có 10 hàng PASS, mọi hàng `s201=userOrders=1`, `stockLeak=false`. |
| 4 | E2 đo V1/V2 bằng autocannon ở 100/300/500 connections, tách pha còn/hết hàng, tự tính rps/p50/p95 và chỉ đếm 5xx/lỗi kết nối là lỗi thật. | ✓ VERIFIED | `autocannon-phase.ts` dùng shared-counter `setupRequest`, event `response`, histogram tự tính; `e2-performance.ts` ghi hai pha/lượt và dùng `judgeE2Run` chỉ cho correctness. `e2.csv` có 60 hàng VALID: 3 mức × 2 mode × 2 pha × 5 lượt; toàn bộ `realErrors=0`. |
| 5 | E4 chỉ dừng `flashsale-mongo`, chờ request đang bay, khởi động lại, đối soát → `--fix` → đối soát lại; undersell trước sửa là PASS chỉ khi không oversell. | ✓ VERIFIED | `docker.ts` allow-list `stop|start` với tên container cố định, không shell; `e4-mongo-outage.ts` khôi phục trong `finally` và gọi reconcile ba lần. CSV E4 chính thức commit `8f08e3c`: 408/1.000 orders, 74 5xx, oversold 0, missing buyer 0, drift 74 undersell, `fixApplied=yes`, re-check `clean`. Raw JSON cùng session xác nhận các số này. |

**Score:** 51/51 chân lý chi tiết đã xác minh (0 hiện diện nhưng chưa có bằng chứng hành vi).

### Required Artifacts

`verify.artifacts` đã kiểm tra L1/L2 cho mọi artefact khai báo; kiểm tra đọc mã bổ sung đã xác nhận L3 wiring. Không có artefact thiếu, stub, hoặc orphan.

| PLAN | Artefact | Kết quả |
|---|---:|---|
| 03-01 | 5/5 | ✓ VERIFIED — reset/stats/CLI và chính sách CSV có mã thực và test tích hợp. |
| 03-02 | 8/8 | ✓ VERIFIED — package, id, CSV, config, classifier và verdict exports có thực. |
| 03-03 | 8/8 | ✓ VERIFIED — session, HTTP/admin/reconcile/preflight, E1/E3 scenarios được nối với nhau. |
| 03-04 | 6/6 | ✓ VERIFIED — autocannon, histogram, config/verdict/CSV, E2 scenario. |
| 03-05 | 4/4 | ✓ VERIFIED — README cùng ba CSV chính thức được Git theo dõi. |
| 03-06 | 6/6 | ✓ VERIFIED — E4 scenario, Docker allow-list, verdict/reconcile/CSV và CSV chính thức. |

### Key Link Verification

`verify.key-links` xác minh 18/18 liên kết khai báo. Các liên kết quan trọng đã đọc trực tiếp:

| Từ | Đến | Trạng thái | Chi tiết |
|---|---|---|---|
| Controller/CLI reset | `sale-admin.service` | ✓ WIRED | Controller và `reset.ts` truyền `totalQty`; service kiểm tra lại, ghi Mongo, Redis `multi`, movement và `uniqueOrderIndex`. |
| E1/E3 scenarios | Admin API, buy API, verdict, reconcile | ✓ WIRED | Session gọi reset/stats/preflight; HTTP dùng `POST /api/sales/:id/buy?mode=` với `x-test-user`; V2 spawn reconcile không shell. |
| E2 scenario | autocannon, histogram, TIME_WAIT guard | ✓ WIRED | `setupRequest` cấp id từ shared counter, event response thu latency, `waitForPortBudget` chạy trước mỗi phase. |
| E4 scenario | Docker CLI và reconcile runbook | ✓ WIRED | Docker chỉ dùng argv `stop/start flashsale-mongo`; scenario wait in-flight trước start và chạy check/fix/re-check. |
| README và CSV E1/E2/E3/E4 | npm scripts và Phase 5 consumers | ✓ WIRED | README nêu lệnh thật; header E2 đã đóng băng để Phase 5 chart/analysis đọc. |

### Data-Flow Trace (Level 4)

| Artefact | Giá trị được ghi/render | Nguồn thực | Trạng thái |
|---|---|---|---|
| E1/E3 scenarios | response counts, stats, reconcile, CSV | HTTP API + Mongo/Redis stats + `backend/scripts/reconcile.ts` | ✓ FLOWING |
| E2 scenario | response latencies, rps, percentiles, counts, CSV | autocannon response event/status data và stats API | ✓ FLOWING |
| E4 scenario | orders, stock, buyers, drift, repair result | V2 API, admin stats, Docker outage, reconcile/fix/re-check | ✓ FLOWING |
| `sale-admin.service` | reset state và stats | MongoDB `FlashSale`/`Order` queries, Redis stock/buyers | ✓ FLOWING |
| CSV artefacts | kết quả chính thức | file Git-tracked; E1/E2/E3 từ `e07e0db`, E4 từ `8f08e3c` | ✓ FLOWING |

### Behavioral Spot-Checks

Không chạy lại tải hay khởi động dịch vụ trong lần xác minh này: các lượt chính thức là dữ liệu do người dùng chạy theo D-33, và regression gate ngay trước lúc verifier được gọi đã chạy trên đúng mã hiện tại (không có thay đổi source sau đó).

| Hành vi | Bằng chứng thực thi hiện tại | Trạng thái |
|---|---|---|
| Các contract harness, CSV, verdict và E4 | `npm --prefix loadtest run typecheck` + 289/289 node:test pass ở regression gate | ✓ PASS |
| Hỗ trợ backend cho reset/stats/reconcile | backend typecheck/build; 172/172 unit và 200/200 integration pass ở regression gate | ✓ PASS |
| Kết quả E1/E2/E3 chính thức | CSV tracked + kiểm tra độc lập cấu trúc/hàng/verdict | ✓ PASS |
| Outage/recovery E4 chính thức | CSV `8f08e3c` + raw JSON session `20261113T161142Z-94ab` | ✓ PASS |

### Probe Execution

SKIPPED — không có `scripts/**/probe-*.sh` và PLAN/SUMMARY không khai báo probe thực thi. Các từ “edge-probe” chỉ là ghi chú nghiên cứu, không phải script probe.

### Requirements Coverage

| Requirement | PLAN nguồn | Trạng thái | Bằng chứng |
|---|---|---|---|
| EXP-01 | 03-01, 03-02, 03-03 | ✓ SATISFIED | Thư viện chung, preflight, reset/stats, user-id, CSV và integration tests tồn tại/wired. `REQUIREMENTS.md` còn ghi Pending là trạng thái registry cũ, không phản ánh thiếu triển khai. |
| EXP-02 | 03-02, 03-03, 03-05 | ✓ SATISFIED | 15 E1 PASS gồm 5 lượt/mode; V0 oversell, V1/V2 chính xác. |
| EXP-03 | 03-02, 03-03, 03-05 | ✓ SATISFIED | E1 verdict/reconcile contract và CSV commit chứng minh đầy đủ. |
| EXP-04 | 03-02, 03-03, 03-05 | ✓ SATISFIED | 10 E3 PASS, một user/10 concurrent requests chỉ tạo một order. |
| EXP-05 | 03-04, 03-05 | ✓ SATISFIED | E2 100/300/500, V1/V2, 5 lượt/mode/level, shared distinct ids. |
| EXP-06 | 03-04, 03-05 | ✓ SATISFIED | response-time, p50/p95, rps, counts tách pha và 60 CSV rows VALID. |
| EXP-07 | 03-05 | ✓ SATISFIED | README mô tả `start:test`, reset, đo, các cột và giới hạn môi trường. |
| EXP-08 | 03-06 | ✓ SATISFIED | E4 outage allow-list, reconcile/fix/re-check và committed PASS CSV. |

Không có requirement orphan: tám ID EXP-01…EXP-08 đều được ít nhất một PLAN nhận và có bằng chứng triển khai. `EXP-01` là mục duy nhất còn Pending trong bảng registry, được ghi nhận là drift tài liệu, không phải gap chức năng.

### Decision Coverage

`check.decision-coverage-verify` báo **33/33** quyết định trong `03-CONTEXT.md` được artefact đã ship tôn trọng; không có quyết định chưa được phản chiếu.

### Anti-Patterns Found

| Phạm vi | Kết quả | Ảnh hưởng |
|---|---|---|
| 41 file source/test/document phase | Không có `TBD`, `FIXME`, `XXX`, placeholder hay implementation rỗng có thể đi tới output. | Không có blocker. |
| Requirement-linked tests | Không có `skip`, `todo`, `pending`, hoặc test bị tắt. Assertions kiểm tra giá trị/hành vi (không chỉ existence). | Không có blocker. |
| Test provenance | Không có fixture được sinh từ SUT để tự chứng minh SUT; unit tests dùng oracle độc lập, còn kết quả tải là artefact operator đã commit. | Không có circular test finding. |
| Prohibitions | Diff phase không chạm buy path; TIME_WAIT chỉ `netstat` + wait; E2 verdict không dùng latency/rps để pass/fail; E4 không chứa Redis hay `down -v`. | Các must-NOT đã được xác minh. |

### Human Verification Required

Không có mục còn lại. Checkpoint D-33 đã hoàn tất bởi người dùng: CSV chính thức E1/E2/E3 được commit `e07e0db`, CSV E4 được commit `8f08e3c`; raw E4 cùng session đối chiếu được với hàng CSV. Không yêu cầu chạy lại đo chính thức.

### Gaps Summary

Không có gap chặn mục tiêu. Không có hạng mục cần hoãn sang phase sau. Kết quả chỉ chứng minh trong điều kiện đo đã ghi (máy người dùng, `start:test`, pool 100); không mở rộng thành bảo đảm tuyệt đối ngoài các điều kiện này.

---

_Verified: 2026-11-13T16:48:51Z_  
_Verifier: the agent (gsd-verifier)_
