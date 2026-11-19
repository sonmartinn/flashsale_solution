---
phase: 04-web-app-dev-scripts
plan: "07"
subsystem: infra
tags: [bash, powershell-5.1, windows, docker-compose, tcp, uat]
requires:
  - phase: 04-06
    provides: Vòng đời start/stop trên Windows và kiểm tra quyền sở hữu tiến trình
provides:
  - Cặp script Bash với các tham số tương ứng trên Windows
  - Chẩn đoán cổng Windows khi bảng listener thiếu PID
  - Bằng chứng Windows và trạng thái kiểm thử macOS
affects: [04-08, 04-09, 05-results-chart-readme-analysis]
tech-stack:
  added: []
  patterns: [bash-job-control, process-ownership, tcp-endpoint-pair]
key-files:
  created: [scripts/start.sh, scripts/stop.sh, scripts/dev-common.sh]
  modified: [scripts/dev-common.ps1, scripts/test/dev-scripts.test.mjs, scripts/README.md, README.md, .planning/phases/04-web-app-dev-scripts/04-DEV-UAT.md]
key-decisions:
  - Dùng đúng hai endpoint của kết nối loopback để tìm PID phía server khi Windows bỏ sót listener.
  - Khi cổng nhận kết nối nhưng chưa xác định được PID, chặn start và chỉ báo ở stop để giữ kiểm tra quyền sở hữu.
requirements-completed: [DEV-03, DEV-04, DEV-05]
coverage:
  - id: D1
    description: Cặp Bash tương thích cú pháp Bash 3.2 và có kiểm thử vòng đời trên WSL
    requirement: DEV-03
    verification:
      - kind: integration
        ref: "node --test scripts/test/dev-scripts.test.mjs (bash -n, đối chiếu hành vi, quyền sở hữu nhóm); fixture vòng đời WSL ở lượt 04-07 Task 1"
        status: pass
    human_judgment: false
  - id: D2
    description: Quyền thực thi, định dạng dòng và quy tắc bỏ qua .dev
    requirement: DEV-04
    verification:
      - kind: integration
        ref: "node --test scripts/test/dev-scripts.test.mjs (file policies)"
        status: pass
    human_judgment: false
  - id: D3
    description: Mười ca Windows bắt buộc đạt ở đường dẫn có dấu và khoảng trắng
    requirement: DEV-05
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/04-web-app-dev-scripts/04-DEV-UAT.md (W01–W10)"
        status: pass
    human_judgment: false
completed: 2026-11-19
status: complete
---

# Phase 04 Plan 07 — Script Bash và nghiệm thu Windows

**Cặp script Bash có cùng tham số start/stop với PowerShell. Bộ nghiệm thu Windows đạt 10/10 ca bắt buộc.**

## Kết quả

- `start.sh` và `stop.sh` dùng job control, `nohup`, nhóm riêng và metadata để nhận diện nhóm tiến trình. Hai file có quyền thực thi trong Git. Bash 5.2 trên WSL đã chạy kiểm thử vòng đời ở Task 1. `bash -n` và quét tương thích cú pháp Bash 3.2 đạt. Máy chưa có `shellcheck` và nhóm chưa chạy thử trên macOS.
- Ngày 2026-11-18, nghiệm thu dùng bản sao tại đường dẫn có dấu với Docker Desktop, MongoDB, Redis, backend và frontend thật. Bản sao dùng container và volume riêng. W05 và W11 phát hiện bảng listener có thể bỏ sót socket.
- Ngày 2026-11-19, sau bản sửa PowerShell, `start.ps1` báo PID và dừng tại bước 4 trên cả 5000 và 5173 khi listener bind `127.0.0.1`, `::1` hoặc bind mặc định của Node. Sáu lượt đều thoát 1, listener vẫn sống và ứng dụng chưa khởi động. W05 và W11 được xác minh tại đường dẫn workspace chính.
- Hồi quy Windows có 20 ca đạt và 1 ca POSIX bỏ qua trong lượt mặc định. Ca mất PID dừng được cả hai cây fixture khi bảng TCP giấu dòng listener. Khi bảng thiếu cả PID phía server, fixture xác nhận `start` từ chối và `stop` giữ tiến trình thử sống.
- Backend và frontend đạt `npm run typecheck` và `npm run build`. Loadtest đạt `npm run typecheck`.

## Task và commit

| Task | Kết quả | Commit |
|---|---|---|
| 1 | Vòng đời và nhóm tiến trình Bash | `7b9917d` |
| 2 | Hướng dẫn chạy và bảng nghiệm thu | `ec803fc` |
| 3 | Bằng chứng Windows và bản sửa nhận diện PID | `2e18f0c`, `3bf2300` |

## Giới hạn xác minh

Ca bổ sung W12 trên dữ liệu thật của workspace còn `OPEN`. macOS chưa được thử ở runtime. Chi tiết môi trường, mã thoát và bằng chứng nằm trong [04-DEV-UAT.md](04-DEV-UAT.md).

## Tiếp theo

04-08 bổ sung cập nhật tồn kho theo chu kỳ trên trang sale.
