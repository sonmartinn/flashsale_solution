---
phase: 04-web-app-dev-scripts
plan: "06"
subsystem: infra
tags: [powershell-5.1, windows, docker-compose, node-test, dev-scripts]
requires:
  - phase: 04-03
    provides: Frontend Vite dùng cổng cố định cùng backend Express
provides:
  - Khởi động Windows theo 10 bước, chạy nền và khóa vòng đời
  - Dừng cây tiến trình theo quyền sở hữu và giữ container khi có -KeepDb
  - Fixture Windows PowerShell 5.1 và quy tắc BOM, CRLF, LF, Git ignore
affects: [04-07, 04-09, 05-results-chart-readme-analysis]
actuals:
  tokens: 15540
  tasks: 2
  commits: 2
  plan_head_before: 6e14d8a40b7598033c7d0aff88092eacb08a3315
  plan_head_after: 9b02c697830ae77cc313e5ec48e61208849588e3
tech-stack:
  added: []
  patterns: [exclusive-file-handle, runner-ownership-token, creation-time-validation, lockfile-sha256, windows-process-tree]
key-files:
  created: [scripts/start.ps1, scripts/stop.ps1, scripts/dev-common.ps1, scripts/dev-runner.ps1, scripts/test/dev-scripts.test.mjs, scripts/test/fixtures/fake-command.mjs, scripts/test/fixtures/child-server.mjs]
  modified: [.gitattributes, .gitignore, .planning/REQUIREMENTS.md]
key-decisions:
  - Khóa vòng đời dùng handle file độc quyền. PID số đi cùng metadata chứa token và thời điểm tạo runner.
  - Seed tự động cần số user bằng 0 và đích MongoDB cùng Redis trùng cấu hình dev đã kiểm tra.
  - Dependency marker giữ SHA-256 của package-lock.json sau lần cài thành công.
requirements-completed: [DEV-01, DEV-02]
coverage:
  - id: D1
    description: Script start chạy nền với hai dịch vụ, tạo cấu hình và seed có điều kiện
    requirement: DEV-01
    verification:
      - kind: integration
        ref: "node --test scripts/test/dev-scripts.test.mjs (startup, Docker, npm ci, env, seed, readiness)"
        status: pass
    human_judgment: false
  - id: D2
    description: Script stop xác minh quyền sở hữu, dừng cả cây và hỗ trợ KeepDb
    requirement: DEV-02
    verification:
      - kind: integration
        ref: "node --test scripts/test/dev-scripts.test.mjs (lifecycle lock, stale/reused/missing PID, foreign process, KeepDb)"
        status: pass
    human_judgment: false
  - id: D3
    description: Các script Windows dùng UTF-8 BOM và CRLF, Git đặt LF cho shell và bỏ qua .dev/
    requirement: DEV-04
    verification:
      - kind: integration
        ref: "scripts/test/dev-scripts.test.mjs (PowerShell 5.1 ParseFile, BOM/CRLF và Git policies)"
        status: pass
    human_judgment: false
duration: 45min
completed: 2026-11-18
status: complete
---

# Phase 04 Plan 06 — Tổng kết script dev Windows

**Hai script khởi động và dừng toàn bộ môi trường dev trên Windows, xác minh nguồn gốc tiến trình và chỉ seed tự động khi MongoDB của dự án chưa có người dùng.**

## Tiến độ

- Bắt đầu `2026-11-18T09:19:47Z`.
- Hoàn tất kiểm tra `2026-11-18T10:04:55.954Z`.
- Hoàn thành 2 task với 9 file triển khai và fixture.

## Kết quả

- `start.ps1` chạy 10 bước, kiểm tra Docker/Node, tạo cấu hình nếu thiếu và dùng SHA-256 của lockfile để quyết định `npm ci`. Hai runner sống sau khi lệnh start trả về và ghi log vào `.dev/logs/`.
- `stop.ps1` kiểm tra thời điểm tạo, token của runner và đường dẫn của tiến trình trước khi dừng. Khi thiếu metadata, script kiểm tra cây của Node đang lắng nghe. Cổng ngoại lai được báo cùng PID và tên tiến trình.
- Khóa file Windows tuần tự hóa start/stop. Các script PowerShell có UTF-8 BOM và CRLF. Git dùng LF cho shell và CSV kết quả, đồng thời bỏ qua `.dev/`.

## Task và commit

| Task | Bằng chứng | Commit |
|---|---|---|
| 1 | Hai ca tracer đạt trước khi mở rộng. Start theo đúng thứ tự, start lần hai giữ PID, stop giải phóng cây, restart bỏ qua cài/seed và khóa chặn start/stop chạy đua. | `6c18151` |
| 2 | Ma trận lỗi và quyền sở hữu, AST, encoding và quy tắc Git. | `9b02c69` |

## Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| `node --test --test-reporter=tap scripts/test/dev-scripts.test.mjs` | 14/14 đạt trên Windows PowerShell 5.1. Fixture khởi tạo ở đường dẫn có dấu tiếng Việt, dấu cách, ngoặc vuông và ngoặc tròn. |
| Tool và timeout | Help, thiếu Node/npm/Docker, các mốc Node, Compose v2, hai đường dẫn Desktop, daemon chờ 120 giây, cổng DB bận và readiness chờ 30 giây. |
| Compose trên máy dự án | `docker compose version --short` trả 5.4.0 và `docker compose up -d --wait` xác nhận hai container healthy. Sau khi mở điều kiện cho plugin từ v2 trở lên, chạy lại 3/3 ca ngoài sandbox gồm vòng đời với fixture báo 5.4.0, các mốc Node và từ chối Compose v1, cùng AST/encoding. |
| Dữ liệu | Cấu hình giả giữ nguyên từng byte. Khóa tạo mới mã hóa 32 byte ngẫu nhiên. npm ci chỉ ghi marker sau thành công, số user lỗi hoặc không hợp lệ dừng trước seed, số dương bỏ qua seed, và `-Seed` cảnh báo trước khi chạy. |
| Tiến trình | PID chết, PID bị tái sử dụng, token/thời điểm tạo sai, thiếu metadata, tiến trình cùng tiền tố thư mục, khởi động một phần, tiến trình thoát sớm, `-KeepDb` và stop lặp. Các cây fixture được thu dọn. |
| Build | Backend và frontend đều đạt `npm.cmd run typecheck` và `npm.cmd run build` trong package tương ứng. Bản build backend có Lua và frontend có `dist/index.html`. |
| Regression bổ sung | 30 test frontend và 7 test build backend đạt với preload tạm để xử lý lỗi `os.userInfo()` của sandbox khi tsx nạp. |
| Git và encoding | `git diff --check`, `git check-attr` và `git check-ignore .dev/api.pid` đạt. AST PowerShell 5.1 phân tích đủ bốn file, byte đầu là UTF-8 BOM và toàn bộ dòng dùng CRLF. |

## Deviations from Plan

- **[Rule 1 — lỗi đường dẫn, Task 1]** Windows PowerShell 5.1 diễn giải ngoặc vuông trong `WorkingDirectory` như wildcard và kiểm tra thư mục tương đối phụ thuộc provider. Runner chuyển thư mục bằng `Set-Location -LiteralPath`, launcher escape tham số đường dẫn của `Start-Process`, marker kiểm tra thư mục bằng đường dẫn tuyệt đối. Fixture đường dẫn có dấu và ký tự đặc biệt đạt trong `6c18151`.
- **[Rule 1 — lỗi stderr, Task 2]** PowerShell 5.1 có thể ném lỗi khi lệnh ngoài ghi stderr trước khi nhánh xử lý đọc `$LASTEXITCODE`. Hàm gọi lệnh giữ stderr bên ngoài thông báo và cho phép xử lý mã thoát. Ca Docker/seed lỗi và `npm ci` trả 91 xác minh thay đổi của Task 2.
- **[Rule 3 — giới hạn sandbox, Task 1 và Task 2]** Sandbox từ chối CIM và có lúc ẩn hàng listener của `netstat` hoặc từ chối `taskkill` duyệt cây. Fixture chỉ thay dữ liệu CIM khi quyền bị chặn, bổ sung listener đã bind qua kết nối TCP thật và dùng `Stop-Process` cho PID fixture đã xác minh nếu taskkill thất bại. PowerShell 5.1, khởi chạy runner, kết nối HTTP/TCP, thời điểm tạo và kiểm tra tiến trình sống đều chạy trên Windows.

- **[Rule 1 — phiên bản Compose, Task 2]** Chấp nhận plugin `docker compose` từ phiên bản chính 2 trở lên để dùng được plugin 5.4.0 đã cài trên máy dự án. Compose v1 vẫn bị từ chối.

**Tổng deviations** 4. Nghiệm thu Windows với dịch vụ thật thuộc 04-07.

## User Setup Required

Fixture chạy với các công cụ có sẵn và cấu hình giả của riêng nó.

## Next Phase Readiness

Docker Desktop thật, Docker Compose/MongoDB/Redis thật, seed thật và đóng cửa sổ terminal thuộc 04-07. DEV-04 còn dùng chung với 04-07 và DEV-05 thuộc UAT.

## Issues Encountered

DEV-01 và DEV-02 đã được đánh dấu hoàn tất trong `.planning/REQUIREMENTS.md`. Orchestrator ghi commit trong worktree sau khi sandbox từ chối tạo `index.lock`.

## Self-Check: PASSED

Hiện diện đủ 9 file. Hai commit Task 1 và Task 2 thuộc nhánh worktree. Các kiểm tra chức năng, typecheck và build đều đạt.
