---
phase: 04-web-app-dev-scripts
plan: "07"
kind: dev-script-uat
requirements: [DEV-05]
windows_status: open
macos_status: untested
---

# 04-DEV-UAT — Nghiệm thu thật script dev trên Windows

Danh sách kiểm thử Windows của [SPECS mục 12](../../../docs/SPECS.md#kiểm-thử), chạy bằng **Windows PowerShell 5.1** trên đường dẫn có dấu tiếng Việt và khoảng trắng. Người dùng thực hiện mọi ca. Agent không chạy `start` thật trên workspace, không tạo, đọc hay in `backend/.env` (D-23, AGENTS.md).

Mỗi dòng ghi lệnh, mã thoát, quan sát và trạng thái. Trạng thái: `OPEN` (chưa chạy), `PASS`, `FAIL`, `ERROR` (không chạy được vì lý do ngoài script). Chỉ đổi thành `PASS` khi đã có quan sát thật trong cột bằng chứng.

## Quy tắc an toàn

- **Không dán nội dung `backend/.env` vào bất kỳ đâu.** Kiểm tra secret chỉ bằng lệnh trả `True`/`False` ở ca W01.
- **Không chạy `-Seed` trên workspace thật** trừ khi muốn xóa dữ liệu hiện tại. Ca cần DB trống hoặc `-Seed` chạy trên bản clone dùng một lần với project Compose riêng (mục P2).
- Không xóa `backend/.env`, `node_modules` hay dữ liệu thật để tạo điều kiện "lần đầu". Dùng bản clone.
- Không chạy `docker compose down -v` ở workspace thật. `docker compose down` **không có** `-v` chỉ xóa container, giữ volume dữ liệu.
- Không kill tiến trình lạ. Không động vào dịch vụ Windows `MongoDB` ở cổng 27017.

## Chuẩn bị

**P1. Ghi môi trường** (dán kết quả vào bảng cuối):

```powershell
$PSVersionTable.PSVersion.ToString()
node --version
npm.cmd --version
docker --version
docker compose version --short
(Get-Location).Path
```

**P2. Bản clone dùng một lần cho ca W01** (chưa có `.env`, chưa có `node_modules`, database trống). Chạy trong PowerShell 5.1:

```powershell
# 1. Ở workspace thật: dừng ứng dụng, rồi gỡ container (giữ volume, dữ liệu thật không mất)
cd "C:\Dữ liệu của ổ D\Vo Chep Bai\CSDL phi quan he\flashsale"
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1 -KeepDb
docker compose down

# 2. Clone sang đường dẫn có dấu, khoảng trắng và ngoặc
git clone "C:\Dữ liệu của ổ D\Vo Chep Bai\CSDL phi quan he\flashsale" "C:\Dữ liệu thử UAT\flashsale bản thử (dùng một lần)"
cd "C:\Dữ liệu thử UAT\flashsale bản thử (dùng một lần)"

# 3. Project Compose riêng: volume mới, rỗng, không chung dữ liệu với workspace thật
$env:COMPOSE_PROJECT_NAME = 'flashsale-uat'
docker compose config --volumes
docker volume ls --filter name=flashsale-uat
```

`git clone` chỉ lấy file đã commit, nên bản clone không có `backend/.env` và `node_modules`. `COMPOSE_PROJECT_NAME` ưu tiên hơn `name:` trong `docker-compose.yml`, nên volume của bản clone là `flashsale-uat_mongo-data` và `flashsale-uat_redis-data`. Giữ biến này trong **mọi** cửa sổ PowerShell dùng cho bản clone.

**P3. Dọn bản clone sau khi xong** (trong cửa sổ đã đặt `COMPOSE_PROJECT_NAME = 'flashsale-uat'`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
docker compose down
# Tùy chọn, chỉ xóa volume của bản thử:
docker volume rm flashsale-uat_mongo-data flashsale-uat_redis-data
```

Sau đó đóng cửa sổ, mở PowerShell mới (không có `COMPOSE_PROJECT_NAME`) ở workspace thật và chạy `start.ps1` (ca W12). Container được tạo lại với volume cũ.

**P4. Kiểm tra `netstat` của máy trước khi chạy.** Script Windows nhận diện tiến trình giữ cổng bằng `netstat -ano`. Ngày 2026-11-18, trên máy dự án, `netstat` có lúc chưa liệt kê một listener node mới mở trong khoảng 1 giây, báo trạng thái `CLOSED` thay cho `LISTENING`, và có dòng trùng mang PID 0. Lúc đó, ở các ca có cổng bận hoặc mất PID, fixture Windows của 04-06 (không sửa trong 04-07) không nhận ra listener. Trước W05, W07, W10, W11, mở một listener rồi chờ vài giây:

```powershell
# Cửa sổ 1
node -e "require('http').createServer().listen(5000,'127.0.0.1')"
# Cửa sổ 2, sau vài giây
netstat -ano | findstr ":5000"
Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,OwningProcess
```

Bình thường có một dòng `127.0.0.1:5000  0.0.0.0:0  LISTENING  <PID của node>`. Nếu thấy `CLOSED`, PID 0 hoặc không có dòng nào, ghi kết quả vào bảng môi trường. Khởi động lại máy (hoặc `wsl --shutdown` nếu không cần WSL/Docker lúc đó) rồi kiểm tra lại trước khi chạy các ca trên. Ca thất bại vì lỗi này ghi `ERROR` kèm dòng `netstat`, không ghi `FAIL`.

**Lệnh kiểm tra dùng chung** (chạy ở thư mục gốc của bản đang thử):

```powershell
# Mã thoát của lệnh vừa chạy
$LASTEXITCODE
# Cổng dev đang LISTEN (rỗng nghĩa là đã trống)
Get-NetTCPConnection -LocalPort 5000,5173 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess
# Tiến trình node của đúng thư mục này
$root = (Get-Location).Path
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$root*" } | Select-Object ProcessId,CommandLine
# Container đang chạy
docker compose ps --status running
# API health
(Invoke-WebRequest http://localhost:5000/api/health -UseBasicParsing).StatusCode
```

## Ca bắt buộc (SPECS mục 12)

| ID | Ca | Nơi chạy | Lệnh | Mong đợi | Mã thoát | Quan sát / bằng chứng | Trạng thái |
|---|---|---|---|---|---|---|---|
| W01 | `start` lần đầu: chưa có `.env`, chưa có `node_modules`, database trống | Bản clone (P2) | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` | Đủ `[1/10]`..`[10/10]`; tạo `.env`; `npm ci` hai package; seed chạy vì DB trống; in 2 URL, lệnh log, lệnh stop. `Select-String -Path backend\.env -Pattern '^JWT_SECRET=[0-9a-f]{64}$' -Quiet` trả `True`; output không chứa secret. Health 200, mở được `http://localhost:5173`. | — | — | OPEN |
| W02 | `start` lần hai khi đang chạy | Bản clone | Chạy lại lệnh W01 | Báo "Backend và frontend đang chạy.", in lại URL, không khởi động bản thứ hai (`.dev\api.pid`, `.dev\web.pid` không đổi). | — | — | OPEN |
| W03 | `start` sau khi `stop` | Bản clone | `scripts\stop.ps1` rồi `scripts\start.ps1` | Có "Bỏ qua npm ci cho backend.", "Bỏ qua npm ci cho frontend.", "Đã có người dùng, bỏ qua seed."; `.env` giữ nguyên. | — | — | OPEN |
| W04 | `start` khi Docker Desktop đang tắt | Bản clone hoặc workspace thật | Thoát Docker Desktop (Quit), chờ `docker info` lỗi, rồi `scripts\start.ps1` | Bước `[3/10]` mở Docker Desktop, chờ (tối đa ~120 giây) rồi chạy tiếp, mã 0. Nếu Desktop không lên kịp: thông báo "Hết thời gian chờ Docker Desktop", mã 1. Ghi thời gian chờ thực tế. | — | — | OPEN |
| W05 | `start` khi cổng 5000 bị tiến trình khác chiếm | Bản clone hoặc workspace thật, sau `stop -KeepDb` | Cửa sổ khác: `node -e "require('http').createServer().listen(5000)"`; rồi `scripts\start.ps1` | Mã 1; in "Cổng 5000 đang được giữ bởi PID <pid> (node)."; tiến trình lạ vẫn sống; không có tiến trình dự án nào được khởi động. Đóng cửa sổ giữ cổng sau khi ghi kết quả. | — | — | OPEN |
| W06 | Đóng terminal đã chạy `start`, backend và frontend vẫn chạy | Bản clone hoặc workspace thật | Mở cửa sổ PowerShell mới, chạy `scripts\start.ps1`, bấm nút X đóng cửa sổ; mở PowerShell khác | Health 200, trang 5173 vẫn mở được, PID trong `.dev\*.pid` vẫn sống (`Get-Process -Id <pid>`). | — | — | OPEN |
| W07 | `stop`: giải phóng cổng, không còn `node` của dự án, container dừng | Bản clone hoặc workspace thật | `scripts\stop.ps1` | Đủ `[1/4]`..`[4/4]`, "Hai cổng dev đã trống."; lệnh cổng trả rỗng; lệnh tiến trình node của thư mục trả rỗng; `docker compose ps --status running` không còn container. | — | — | OPEN |
| W08 | `stop -KeepDb`: container vẫn chạy | Bản clone hoặc workspace thật | `scripts\start.ps1` rồi `scripts\stop.ps1 -KeepDb` | "Giữ MongoDB và Redis đang chạy."; cổng 5000/5173 trống; `docker compose ps --status running` còn `flashsale-mongo` và `flashsale-redis`. | — | — | OPEN |
| W09 | `stop` khi không có gì đang chạy | Bản clone hoặc workspace thật | Chạy `scripts\stop.ps1 -KeepDb` hai lần liên tiếp | Lần hai: "Không có gì để dừng.", mã 0. | — | — | OPEN |
| W10 | `stop` khi file PID đã bị xóa nhưng dịch vụ vẫn chạy | Bản clone hoặc workspace thật | `scripts\start.ps1`; xóa `.dev\api.pid`, `.dev\api.owner.json`, `.dev\web.pid`, `.dev\web.owner.json`; rồi `scripts\stop.ps1` | Mã 0; cổng 5000/5173 trống; không còn `node` của thư mục; cửa sổ PowerShell đang dùng vẫn mở. Chỉ xóa đúng bốn file này, không xóa gì khác. | — | — | OPEN |

## Ca bổ sung

| ID | Ca | Nơi chạy | Lệnh | Mong đợi | Mã thoát | Quan sát / bằng chứng | Trạng thái |
|---|---|---|---|---|---|---|---|
| W11 | Cổng 5173 bị tiến trình khác chiếm | Bản clone hoặc workspace thật, sau `stop -KeepDb` | Cửa sổ khác: `node -e "require('http').createServer().listen(5173)"`; rồi `scripts\start.ps1` | Mã 1; in "Cổng 5173 đang được giữ bởi PID <pid> (node)."; tiến trình lạ vẫn sống. | — | — | OPEN |
| W12 | Workspace thật giữ nguyên dữ liệu | Workspace thật (không có `COMPOSE_PROJECT_NAME`) | Trước: `docker exec flashsale-mongo mongosh flashsale --quiet --eval "db.users.countDocuments()"`; `scripts\start.ps1`; đếm lại; `scripts\stop.ps1 -KeepDb` | Không có dòng seed, "Giữ nguyên backend/.env."; số user trước và sau bằng nhau. | — | — | OPEN |
| W13 | `start` lỗi giữa chừng chỉ dọn tiến trình vừa khởi động | Chỉ ghi nếu gặp trong lúc chạy các ca trên | — | Có in log gần nhất; container và dữ liệu giữ nguyên; tiến trình có từ trước không bị dừng. | — | — | OPEN |
| W14 | `-Seed` trên dữ liệu dùng một lần | Bản clone | `scripts\start.ps1 -Seed` | In "[CẢNH BÁO] -Seed sẽ xóa dữ liệu…" trước khi seed; mã 0; `.env` giữ nguyên. | — | — | OPEN |

W13 là `OPEN` cho đến khi gặp; không gặp thì ghi "không phát sinh" và giữ ngoài điều kiện DEV-05.

## Môi trường đã ghi (P1)

| Mục | Giá trị |
|---|---|
| PowerShell | — |
| Node / npm | — |
| Docker / Compose | — |
| Đường dẫn workspace thật | — |
| Đường dẫn bản clone | — |
| `netstat` với listener thử ở 5000 (P4) | — |

## macOS

**UNTESTED.** Nhóm không có máy macOS. Bằng chứng hiện có chỉ gồm `bash -n` (bash 5.2 của Git Bash), quét cú pháp bash 3.2, harness logic với `ps`/`lsof`/`kill` giả và fixture vòng đời thật trên Linux WSL. Không ca nào trong số đó là bằng chứng runtime macOS. Nếu sau này có máy Mac, chạy các ca tương tự với `./scripts/start.sh`, `./scripts/start.sh --seed`, `./scripts/stop.sh`, `./scripts/stop.sh --keep-db`, xóa `.dev/*.pid` và `.dev/*.owner` cho ca mất PID, và thêm một bảng kết quả riêng ở đây.

## Kết luận

DEV-05 chỉ hoàn tất khi W01–W10 đều `PASS` với bằng chứng thật. Ca nào `FAIL` thì quay lại sửa script, chạy lại fixture và chỉ lặp lại các ca bị ảnh hưởng.
