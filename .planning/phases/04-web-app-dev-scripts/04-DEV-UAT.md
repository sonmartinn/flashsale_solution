---
phase: 04-web-app-dev-scripts
plan: "07"
kind: dev-script-uat
requirements: [DEV-05]
windows_status: passed
macos_status: untested
---

# 04-DEV-UAT — Nghiệm thu thật script dev trên Windows

Danh sách kiểm thử Windows của [SPECS mục 12](../../../docs/SPECS.md#kiểm-thử), chạy bằng **Windows PowerShell 5.1** trên đường dẫn có dấu tiếng Việt và khoảng trắng.

Ngày 2026-11-18, người dùng giao Codex chạy nghiệm thu. Bản thử lấy các file đã commit qua `git archive` và nằm dưới `.dev/` của workspace. Các script PowerShell nguyên bản chạy với Node, npm, Express, Vite, MongoDB và Redis thật. Bản thử dùng project Compose, tên container và volume riêng. Lệnh đếm user được chuyển tới đúng container MongoDB thử. `npm ci` dùng cache cục bộ. File cấu hình được script tạo trong bản thử. File `backend/.env` và dữ liệu của workspace chính được giữ nguyên.

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

**P4. Đối chiếu bảng TCP nếu cần chẩn đoán.** Ngày 2026-11-18, `netstat -ano` có lúc bỏ sót listener mới mở, báo `CLOSED` hoặc kèm dòng trùng mang PID 0. Khi thiếu PID lắng nghe, script hiện thử kết nối qua `127.0.0.1` và `::1`, rồi đối chiếu cặp địa chỉ và cổng để tìm PID phía server. Nếu kết nối được nhưng thiếu PID, `start` vẫn báo cổng bận và `stop` chỉ báo tình trạng cổng. Để quan sát bảng TCP trong W05 hoặc W11:

```powershell
# Cửa sổ 1
node -e "require('http').createServer().listen(5000,'127.0.0.1')"
# Cửa sổ 2, sau vài giây
netstat -ano | findstr ":5000"
Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,OwningProcess
```

Bình thường có một dòng `127.0.0.1:5000  0.0.0.0:0  LISTENING  <PID của node>`. Nếu thấy `CLOSED`, PID 0 hoặc không có dòng nào, ghi kết quả vào bảng môi trường và chạy tiếp ca kiểm thử. Ca W05 và W11 kiểm tra đầu ra của `start.ps1`, mã thoát và tiến trình giữ cổng sau khi script dừng.

Ở lượt tự động đầu tiên, `start.ps1` bỏ sót cổng 5000 khi chỉ dựa vào bảng listener. Backend phát hiện cổng bận ở bước 10, `start` trả 1 và dọn các tiến trình ứng dụng vừa tạo. `Get-NetTCPConnection -State Listen` cũng có lúc bỏ sót socket. Nguyên nhân WSL2 chưa được xác nhận.

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
| W01 | `start` lần đầu: chưa có `.env`, chưa có `node_modules`, database trống | Bản clone (P2) | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` | Đủ `[1/10]`..`[10/10]`; tạo `.env`; `npm ci` hai package; seed chạy vì DB trống; in 2 URL, lệnh log, lệnh stop. `Select-String -Path backend\.env -Pattern '^JWT_SECRET=[0-9a-f]{64}$' -Quiet` trả `True`; output không chứa secret. Health 200, mở được `http://localhost:5173`. | 0 | Đủ 10 bước, tạo cấu hình trong bản thử, `npm ci` từ cache cho hai package, seed 1.001 user, có URL và lệnh log/stop. API và frontend trả HTTP 200. Kiểm tra định dạng secret và không xuất secret đạt trong fixture tổng hợp. | PASS |
| W02 | `start` lần hai khi đang chạy | Bản clone | Chạy lại lệnh W01 | Báo "Backend và frontend đang chạy.", in lại URL, không khởi động bản thứ hai (`.dev\api.pid`, `.dev\web.pid` không đổi). | 0 | Báo backend và frontend đang chạy. PID `19260` và `13576` giữ nguyên, cả hai endpoint trả HTTP 200. | PASS |
| W03 | `start` sau khi `stop` | Bản clone | `scripts\stop.ps1` rồi `scripts\start.ps1` | Có "Bỏ qua npm ci cho backend.", "Bỏ qua npm ci cho frontend.", "Đã có người dùng, bỏ qua seed."; `.env` giữ nguyên. | 0 | Bỏ qua `npm ci` cho cả hai package và bỏ qua seed. Thời gian sửa file cấu hình giữ nguyên, cả hai endpoint trả HTTP 200. | PASS |
| W04 | `start` khi Docker Desktop đang tắt | Bản clone hoặc workspace thật | Thoát Docker Desktop (Quit), chờ `docker info` lỗi, rồi `scripts\start.ps1` | Bước `[3/10]` mở Docker Desktop, chờ (tối đa ~120 giây) rồi chạy tiếp, mã 0. Nếu Desktop không lên kịp: thông báo "Hết thời gian chờ Docker Desktop", mã 1. Ghi thời gian chờ thực tế. | 0 | Dừng Desktop khi không có container chạy và xác nhận daemon ngắt kết nối. `start.ps1` tự mở Desktop, Compose chạy lại. Cả hai endpoint trả HTTP 200 sau 267 giây tính từ khi gọi `start`. | PASS |
| W05 | `start` khi cổng 5000 bị tiến trình khác chiếm | Workspace chính | Mở listener Node ở cổng 5000, rồi gọi `powershell.exe -ExecutionPolicy Bypass -File scripts\start.ps1` | Mã 1; in PID và tên tiến trình đang giữ cổng; listener vẫn sống; không khởi động tiến trình dự án. | 1 | Ngày 2026-11-19, bind `127.0.0.1`, bind mặc định và bind `::1` đều dừng ở bước 4, báo đúng PID `32448 (node)` và giữ listener sống. Không tới bước 5, không sinh file PID của ứng dụng. Lượt 2026-11-18 từng bỏ sót cả bind IPv4 và bind mặc định. | PASS |
| W06 | Đóng terminal đã chạy `start`, backend và frontend vẫn chạy | Bản clone hoặc workspace thật | Mở cửa sổ PowerShell mới, chạy `scripts\start.ps1`, bấm nút X đóng cửa sổ; mở PowerShell khác | Health 200, trang 5173 vẫn mở được, PID trong `.dev\*.pid` vẫn sống (`Get-Process -Id <pid>`). | 0 | Đóng console Windows thử PID `43360` qua `WM_CLOSE` và xác nhận console đã thoát. Hai runner `57224`, `52476` vẫn sống, PID giữ nguyên, API và frontend trả HTTP 200. | PASS |
| W07 | `stop`: giải phóng cổng, không còn `node` của dự án, container dừng | Bản clone hoặc workspace thật | `scripts\stop.ps1` | Đủ `[1/4]`..`[4/4]`, "Hai cổng dev đã trống."; lệnh cổng trả rỗng; lệnh tiến trình node của thư mục trả rỗng; `docker compose ps --status running` không còn container. | 0 | Đủ 4 bước, mở lại được cả hai cổng; 0 tiến trình `node` thuộc bản thử và 0 container đang chạy. | PASS |
| W08 | `stop -KeepDb`: container vẫn chạy | Bản clone hoặc workspace thật | `scripts\start.ps1` rồi `scripts\stop.ps1 -KeepDb` | "Giữ MongoDB và Redis đang chạy."; cổng 5000/5173 trống; `docker compose ps --status running` còn `flashsale-mongo` và `flashsale-redis`. | 0 | `stop -KeepDb` giải phóng hai cổng, còn 0 tiến trình `node` thuộc bản thử. Cùng hai container vẫn chạy. | PASS |
| W09 | `stop` khi không có gì đang chạy | Bản clone hoặc workspace thật | Chạy `scripts\stop.ps1 -KeepDb` hai lần liên tiếp | Lần hai: "Không có gì để dừng.", mã 0. | 0 | Chạy `stop -KeepDb` hai lần. Lượt hai báo không có gì để dừng, hai cổng trống. | PASS |
| W10 | `stop` khi file PID đã bị xóa nhưng dịch vụ vẫn chạy | Bản clone hoặc workspace thật | `scripts\start.ps1`; xóa `.dev\api.pid`, `.dev\api.owner.json`, `.dev\web.pid`, `.dev\web.owner.json`; rồi `scripts\stop.ps1` | Mã 0; cổng 5000/5173 trống; không còn `node` của thư mục; cửa sổ PowerShell đang dùng vẫn mở. Chỉ xóa đúng bốn file này, không xóa gì khác. | 0 | Lượt 2026-11-18 dừng hai cây, mở lại được hai cổng, không còn `node` của bản thử và tiến trình điều phối còn sống. Hồi quy 2026-11-19 chủ động ẩn dòng listener của cả hai cổng trong fixture Windows. `stop` vẫn nhận diện và dừng hai cây fixture. | PASS |

## Ca bổ sung

| ID | Ca | Nơi chạy | Lệnh | Mong đợi | Mã thoát | Quan sát / bằng chứng | Trạng thái |
|---|---|---|---|---|---|---|---|
| W11 | Cổng 5173 bị tiến trình khác chiếm | Workspace chính | Mở listener Node ở cổng 5173, rồi gọi `powershell.exe -ExecutionPolicy Bypass -File scripts\start.ps1` | Mã 1; in PID và tên tiến trình đang giữ cổng; listener vẫn sống. | 1 | Ngày 2026-11-19, bind `127.0.0.1`, bind mặc định và bind `::1` đều dừng ở bước 4, báo đúng PID `32448 (node)` và giữ listener sống. Không tới bước 5, không sinh file PID của ứng dụng. Lượt 2026-11-18 từng bỏ sót bind mặc định. | PASS |
| W12 | Workspace thật giữ nguyên dữ liệu | Workspace thật (không có `COMPOSE_PROJECT_NAME`) | Trước: `docker exec flashsale-mongo mongosh flashsale --quiet --eval "db.users.countDocuments()"`; `scripts\start.ps1`; đếm lại; `scripts\stop.ps1 -KeepDb` | Không có dòng seed, "Giữ nguyên backend/.env."; số user trước và sau bằng nhau. | — | Workspace chính được giữ nguyên. Lượt xác minh dùng bản thử, nên chưa chạy ca này trên workspace chính. | OPEN |
| W13 | `start` lỗi giữa chừng chỉ dọn tiến trình vừa khởi động | Chỉ ghi nếu gặp trong lúc chạy các ca trên | — | Có in log gần nhất; container và dữ liệu giữ nguyên; tiến trình có từ trước không bị dừng. | 1 | Khi backend gặp cổng 5000 bận, script in log gần nhất của API và web, dọn các runner mới. Listener Node thử vẫn còn sống. Container thử được dọn bằng bước riêng sau lượt kiểm tra. | PASS |
| W14 | `-Seed` trên dữ liệu dùng một lần | Bản clone | `scripts\start.ps1 -Seed` | In "[CẢNH BÁO] -Seed sẽ xóa dữ liệu…" trước khi seed; mã 0; `.env` giữ nguyên. | 0 | Có cảnh báo xóa dữ liệu trước khi seed. File cấu hình giữ nguyên, MongoDB thử có 1.001 user sau seed. | PASS |

W13 là `OPEN` cho đến khi gặp; không gặp thì ghi "không phát sinh" và giữ ngoài điều kiện DEV-05.

## Môi trường đã ghi (P1)

| Mục | Giá trị |
|---|---|
| PowerShell | 5.1.26100.9818 |
| Node / npm | 24.22.1 / 11.19.1 |
| Docker / Compose | 29.7.2 / 5.4.0 |
| Đường dẫn workspace thật | `C:\Dữ liệu của ổ D\Vo Chep Bai\CSDL phi quan he\flashsale` |
| Đường dẫn bản thử | `.dev\uat-Rol7JY\Dữ liệu thử (Windows)` và `.dev\uat-w7cWeG\Dữ liệu thử (Windows)` |
| `netstat` với listener thử ở 5000 (P4) | Kết quả `ERROR`. Một lượt không có dòng 5000. Hai lượt sau báo `127.0.0.1:5000  0.0.0.0:0  CLOSED` với PID `35768` và `46128` khi socket đã mở. `Get-NetTCPConnection -State Listen` không tìm thấy listener trong cả ba lượt. |

## macOS

**UNTESTED.** Nhóm không có máy macOS. Bằng chứng hiện có chỉ gồm `bash -n` (bash 5.2 của Git Bash), quét cú pháp bash 3.2, harness logic với `ps`/`lsof`/`kill` giả và fixture vòng đời thật trên Linux WSL. Không ca nào trong số đó là bằng chứng runtime macOS. Nếu sau này có máy Mac, chạy các ca tương tự với `./scripts/start.sh`, `./scripts/start.sh --seed`, `./scripts/stop.sh`, `./scripts/stop.sh --keep-db`, xóa `.dev/*.pid` và `.dev/*.owner` cho ca mất PID, và thêm một bảng kết quả riêng ở đây.

## Kết luận

**10/10 ca Windows bắt buộc đạt.** Ngày 2026-11-19, W05 và W11 đều đạt khi chạy lại tại đường dẫn dự án, với Docker daemon 29.7.2 và Windows PowerShell 5.1. Cả sáu lượt dừng trước khi gọi Compose để dựng dịch vụ. Ca bổ sung W12 vẫn `OPEN`.

Fixture mới có 20 ca đạt, 0 thất bại và 1 ca POSIX bỏ qua trên Windows. `bash -n` đạt. Typecheck và build của backend và frontend đều đạt. Typecheck của loadtest đạt.

Các tiến trình, container và volume thử đã được dọn sau nghiệm thu.
