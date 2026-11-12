---
phase: 03-experiments-e1-e4
plan: 05
subsystem: testing
tags: [loadtest, e1, e2, e3, csv, documentation]
requires:
  - phase: 03-04
    provides: "Harness E1/E2/E3, schema CSV và các quy tắc kết luận đã đóng băng"
provides:
  - "Quy trình đo bằng tiếng Việt trong loadtest/README.md"
  - "CSV chính thức E1/E3 PASS và E2 VALID do người dùng chạy và commit"
  - "Kiểm tra hậu checkpoint: header, số dòng, verdict, metadata và điều kiện tồn kho"
affects: [03-06, 05-report, WEB-08, DOC-02]
actuals:
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Khôi phục checkpoint từ commit và kiểm tra CSV mà không đo lại hay ghi đè số liệu chính thức"
key-files:
  created:
    - loadtest/README.md
    - loadtest/results/e1.csv
    - loadtest/results/e2.csv
    - loadtest/results/e3.csv
  modified: []
key-decisions:
  - "Close out manually theo bàn giao: giữ Task 1 đã commit và xác minh Task 2 trên các CSV hiện có"
  - "Ghi đúng session riêng cho từng thí nghiệm; cả ba sử dụng gitCommit 030d691 và maxPoolSize 100"
requirements-completed: [EXP-07, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06]
coverage:
  - id: D1
    description: "README mô tả lệnh đo, smoke, maxPoolSize, cột CSV và giới hạn môi trường"
    requirement: EXP-07
    verification:
      - kind: other
        ref: "Gate README: đủ các lệnh bắt buộc và 43 tên cột của schema E1/E2/E3"
        status: pass
    human_judgment: false
  - id: D2
    description: "15 lượt E1 chính thức: V0 bán quá, V1/V2 đúng kho và số user khác nhau"
    requirement: EXP-02
    verification:
      - kind: other
        ref: "loadtest/results/e1.csv: 15 dòng dữ liệu PASS, 5 lượt mỗi mode, đúng header và khớp commit e07e0db"
        status: pass
    human_judgment: false
  - id: D3
    description: "10 lượt E3 chính thức: một user chỉ có một đơn, không rò kho"
    requirement: EXP-04
    verification:
      - kind: other
        ref: "loadtest/results/e3.csv: 10 dòng PASS, s201=userOrders=1 và stockLeak=false"
        status: pass
    human_judgment: false
  - id: D4
    description: "60 dòng E2 chính thức theo mức kết nối, mode, lượt và pha"
    requirement: EXP-05
    verification:
      - kind: other
        ref: "loadtest/results/e2.csv: 100/300/500 x V1/V2 x in_stock/sold_out x 5 lượt, tất cả VALID"
        status: pass
    human_judgment: false
completed: 2026-11-12
status: complete
---

# Phase 03 Plan 05 — Quy trình đo và kết quả E1/E2/E3

**Ba CSV chính thức đã được xác minh trên bản commit của người dùng: E1/E3 PASS, E2 VALID, không có dòng smoke.**

## Accomplishments

- `loadtest/README.md` có quy trình đo bằng `npm run start:test`, các cờ, từ điển CSV, quy tắc kết luận và giới hạn số liệu trên cùng máy.
- E1 có 15 dòng dữ liệu: V0 bán quá lần lượt 899, 900, 594, 233 và 739 đơn; cả 5 lượt V1 và 5 lượt V2 có `orders = distinctUsers = totalQty = 100`.
- E3 có 10 dòng dữ liệu PASS: mỗi lượt `s201 = userOrders = 1`, `stockLeak = false`.
- E2 có 60 dòng dữ liệu VALID, đủ 12 nhóm `(connections, mode, phase)`, mỗi nhóm 5 lượt.

## Task Commits

1. **Task 1: Quy trình đo và smoke đã thực hiện trước bàn giao** — `8b008d2`.
2. **Task 2: Người dùng chạy và commit kết quả chính thức E1/E2/E3** — `e07e0db`.

## Checkpoint Verification — 2026-11-12

| File | Tổng dòng | Verdict | Session |
|---|---:|---|---|
| `loadtest/results/e1.csv` | 16 | 15 PASS | `20261109T145341Z-5c35` |
| `loadtest/results/e2.csv` | 61 | 60 VALID | `20261109T150213Z-97ea` |
| `loadtest/results/e3.csv` | 11 | 10 PASS | `20261109T145517Z-895b` |

- Cả ba file đã được git theo dõi và không khác bản chính thức tại `e07e0db`.
- Header từng file khớp chính xác các mảng `ENV_COLUMNS` và `E1_COLUMNS`/`E2_COLUMNS`/`E3_COLUMNS` trong `loadtest/lib/csv.ts`.
- File UTF-8 không BOM, xuống dòng LF; không note nào có `smoke`.
- Mọi dòng ghi `gitCommit = 030d691`, `maxPoolSize = 100`.
- README đạt các kiểm tra chuỗi bắt buộc của Task 1, có cả ba lệnh smoke nguyên văn và toàn bộ 43 tên cột khác nhau.
- Lượt khôi phục này chỉ đọc và kiểm tra CSV. Smoke Task 1 là bằng chứng lịch sử từ commit/bàn giao; không chạy lại các thí nghiệm và không ghi đè kết quả chính thức.

## Decisions Made

Thực hiện lựa chọn `close out manually` đã nêu trong AGENTS.md và bàn giao, thay vì thực thi lại plan có commit nhưng thiếu SUMMARY. D-33 được giữ: các kết quả chính thức là kết quả người dùng đã chạy trên máy của mình.

## Deviations from Plan

Plan được hoàn tất qua hai phiên: Task 1 và lượt đo của người dùng đã có commit trước bàn giao; kiểm tra hậu checkpoint và SUMMARY được bổ sung khi khôi phục. Không thay đổi schema hay nội dung CSV.

## Threat Flags

Không phát hiện cờ mới. T-03-16 được kiểm tra bằng verdict, số dòng, header, absence of smoke, session và commit nguồn; không đọc hay in thông tin bí mật.

## Next Phase Readiness

03-05 đã có đủ bằng chứng để mở 03-06. E4 vẫn cần một lượt smoke kỹ thuật và checkpoint đo chính thức của người dùng; chưa có kết quả E4 trong SUMMARY này.

## Self-Check: PASSED

- README và ba CSV tồn tại, được theo dõi trong git.
- Task commits `8b008d2` và `e07e0db` có trên nhánh `develop`.
- Toàn bộ acceptance criteria Task 2 đạt; dữ liệu chính thức được giữ nguyên.
