# Script khởi chạy nhanh môi trường dev

Một lệnh dựng và khởi động toàn bộ môi trường dev (MongoDB, Redis, backend, frontend), một lệnh dừng toàn bộ. Hành vi theo [SPECS mục 12](../docs/SPECS.md#12-script-khởi-chạy-nhanh-môi-trường-dev).

> **Trạng thái kiểm thử:** Windows có bộ fixture tự động. Nghiệm thu thật trên Windows ghi ở [04-DEV-UAT.md](../.planning/phases/04-web-app-dev-scripts/04-DEV-UAT.md). **macOS: chưa chạy thử trên macOS.** Nhóm không có máy Mac. Chi tiết ở [mục Trạng thái kiểm thử](#trạng-thái-kiểm-thử).

## Lệnh

Chạy từ bất kỳ thư mục nào. Script tự về thư mục gốc dự án theo vị trí của file.

| Việc | Windows (PowerShell 5.1 trở lên) | macOS (bash 3.2 trở lên) |
|---|---|---|
| Khởi động | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` | `./scripts/start.sh` |
| Khởi động và tạo lại dữ liệu mẫu | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Seed` | `./scripts/start.sh --seed` |
| Dừng tất cả | `powershell -ExecutionPolicy Bypass -File scripts\stop.ps1` | `./scripts/stop.sh` |
| Dừng backend/frontend, giữ MongoDB và Redis | `powershell -ExecutionPolicy Bypass -File scripts\stop.ps1 -KeepDb` | `./scripts/stop.sh --keep-db` |
| In hướng dẫn | thêm `-Help` | thêm `--help` |

`-ExecutionPolicy Bypass` chỉ áp dụng cho lần chạy đó. Script không đổi execution policy của máy.

Khởi động xong, script in ra:

- Frontend: `http://localhost:5173`
- API health: `http://localhost:5000/api/health`
- Lệnh xem log trực tiếp: `Get-Content -LiteralPath '...\.dev\logs\api.log' -Encoding UTF8 -Wait` trên Windows, `tail -f '.../.dev/logs/api.log'` trên macOS (tương tự cho `web.log`)
- Lệnh `stop`

## `-Seed` / `--seed` xóa dữ liệu

`-Seed` (`--seed`) chạy `npm run seed` trong `backend/`. Seed **xóa sạch** MongoDB và Redis của dự án rồi tạo lại dữ liệu mẫu. Script in dòng `[CẢNH BÁO]` trước khi seed và không hỏi lại.

Không có `-Seed`, script chỉ tự seed khi đếm được chính xác 0 user trong `flashsale-mongo` **và** `backend/.env` trỏ đúng MongoDB `127.0.0.1:27018/flashsale` cùng Redis `127.0.0.1:6379`. Đếm lỗi hoặc kết quả không phải một số nguyên không âm thì script dừng, không seed. Đã có dữ liệu thì không bao giờ tự seed.

## `start` làm gì

Mười bước, mỗi bước in một dòng `[n/10]`:

1. Về thư mục gốc dự án.
2. Kiểm tra `node`, `npm`, `docker`, `docker compose` v2. Node phải là 20.19+ (nhánh 20) hoặc 22.12+. Thiếu thì in cách cài rồi dừng, không tự cài.
3. Docker daemon chưa chạy thì mở Docker Desktop và chờ tối đa khoảng 120 giây.
4. Kiểm tra `.dev/` và cổng 5000, 5173. Đang chạy đủ thì báo "đang chạy", in lại URL, thoát 0. Cổng bị tiến trình khác giữ thì in PID và tên rồi dừng, **không kill**.
5. `docker compose up -d --wait`.
6. Chưa có `backend/.env` thì tạo từ `.env.example` với `JWT_SECRET` ngẫu nhiên 32 byte. Không in secret. Đã có thì giữ nguyên.
7. `npm ci` cho `backend/` và `frontend/` khi chưa có `node_modules` hoặc `package-lock.json` đổi so với lần cài thành công trước (so SHA-256 lưu trong `.dev/`).
8. Seed theo quy tắc ở mục trên.
9. Chạy nền `npm run dev` của backend và frontend. Tiến trình sống tiếp sau khi `start` kết thúc và sau khi đóng terminal.
10. Chờ API health trả 200 và cổng 5173 mở (khoảng 30 giây). Quá hạn thì in 20 dòng cuối của log, dừng **chỉ những tiến trình vừa khởi động**, thoát khác 0. Container và dữ liệu giữ nguyên.

Chạy `start` nhiều lần không hỏng gì: lần sau khi đang chạy chỉ báo "đang chạy". Sau `stop`, `start` bỏ qua bước cài và bước seed.

## `stop` làm gì

1. Dừng cả cây tiến trình backend và frontend đã ghi trong `.dev/`, rồi xóa file PID. Windows dùng `taskkill /T /F` sau khi xác minh PID, thời điểm tạo và token của runner. macOS gửi tín hiệu cho nhóm tiến trình riêng của runner sau khi xác minh PID, PGID, thời điểm tạo và nhãn của dự án; không bao giờ gửi cho nhóm của terminal đang gọi.
   - Mất file PID mà cổng 5000/5173 vẫn bị giữ: chỉ dừng khi tiến trình là `node` có dòng lệnh chứa đúng đường dẫn `backend/` hoặc `frontend/` của dự án này. Tiến trình khác chỉ được báo.
2. `docker compose stop`, trừ khi có `-KeepDb`/`--keep-db`. Không bao giờ chạy `docker compose down -v`.
3. Kiểm tra lại hai cổng đã trống.
4. Không có gì đang chạy thì báo "Không có gì để dừng." và thoát 0.

## File trong `.dev/`

`.dev/` nằm trong `.gitignore`, không commit.

| File | Nội dung |
|---|---|
| `api.pid`, `web.pid` | PID số của runner |
| `api.owner.json`, `web.owner.json` (Windows) / `api.owner`, `web.owner` (macOS) | Thông tin xác minh quyền sở hữu: PID, thời điểm tạo, token (macOS thêm PGID) |
| `logs/api.log`, `logs/web.log` | stdout và stderr của `npm run dev` |
| `backend.lock.sha256`, `frontend.lock.sha256` | SHA-256 của `package-lock.json` ở lần `npm ci` thành công |
| `lifecycle.lock` (Windows) / `lifecycle.lock.d/` (macOS) | Khóa để hai lệnh start/stop không chạy chồng nhau |

Nếu `start`/`stop` báo "Một lệnh start/stop đang chạy" mà chắc chắn không còn lệnh nào: trên Windows khóa tự nhả khi tiến trình thoát, chỉ cần chạy lại. Trên macOS script tự gỡ khóa của tiến trình đã chết; khóa không ghi chủ sở hữu thì script báo và để người dùng tự xóa `.dev/lifecycle.lock.d`.

## Cổng bận

Script không kill tiến trình lạ: một server cũ còn chạy sẽ âm thầm nhận request. Tìm tiến trình giữ cổng rồi tự quyết định:

- Windows: `Get-NetTCPConnection -LocalPort 5000,5173 -State Listen | Select-Object LocalPort,OwningProcess`, rồi `Get-Process -Id <PID>`. Khi bảng listener thiếu PID, script đối chiếu kết nối TCP loopback. Nếu vẫn chưa thấy PID nhưng cổng nhận kết nối, script báo cổng bận và yêu cầu kiểm tra thủ công.
- macOS: `lsof -nP -iTCP:5000 -sTCP:LISTEN` (tương tự cho 5173).

Nếu đó là backend/frontend của chính dự án do `start` trước để lại, chạy `stop` (`-KeepDb` nếu muốn giữ container). Cổng MongoDB 27018 hoặc Redis 6379 bận thì bước 5 báo lỗi kèm gợi ý; kiểm tra `docker compose ps` và `docker compose logs`. Cổng 27017 là dịch vụ MongoDB có sẵn của Windows, script không đụng tới.

## Dev khác đo tải

Script chỉ dành cho dev: `npm run dev` chạy `tsx watch` và Vite. **Không đo tải trên môi trường này.** Đo tải dùng `npm run start:test` trong `backend/` (JS đã biên dịch), theo [loadtest/README.md](../loadtest/README.md). Trước khi đo, dừng dev bằng `stop -KeepDb`/`--keep-db` để cổng 5000 trống.

## Trạng thái kiểm thử

| Nền tảng | Đã kiểm | Chưa kiểm |
|---|---|---|
| Windows 11, PowerShell 5.1 | Bộ fixture `node --test scripts/test/dev-scripts.test.mjs` và nghiệm thu với Docker Desktop, MongoDB, Redis và seed thật trên bản sao dùng một lần. [Kết quả từng ca](../.planning/phases/04-web-app-dev-scripts/04-DEV-UAT.md) | Ca bổ sung W12 trên dữ liệu workspace chính. |
| macOS | `bash -n` cho cả ba file `.sh` (bằng bash 5.2 của Git Bash), quét tĩnh các cú pháp không có trong bash 3.2, logic sở hữu nhóm tiến trình với `ps`/`lsof`/`kill` giả, và vòng đời thật (job control, `nohup`, `lsof`, `ps`) trên Linux WSL Ubuntu với bash 5.2. `shellcheck` không có trên máy nên chưa chạy. | **Chưa chạy thử trên macOS.** Chưa chạy bằng bash 3.2 thật, chưa chạy với `ps`/`lsof`/Docker Desktop của macOS, chưa thử đóng cửa sổ Terminal. Kết quả trên Linux không thay cho macOS. |

Chạy bộ fixture:

```
node --test scripts/test/dev-scripts.test.mjs
```

Trên macOS/Linux có `python3`, `lsof`, `curl`, ca vòng đời POSIX chạy luôn. Trên Windows, ca đó bị bỏ qua (có in lý do); đặt `DEV_POSIX_FIXTURE=wsl` để chạy nó trong WSL (bản phân phối mặc định `Ubuntu`, đổi bằng `DEV_WSL_DISTRO`). Fixture không bao giờ đọc hay tạo `backend/.env` thật.

Ca WSL mở cổng 5000/5173 bên trong WSL. Cơ chế chuyển tiếp localhost của WSL2 có thể để lại một listener `127.0.0.1:5000` mang PID 0 trên Windows một lúc sau đó. Trong lúc đó các ca Windows và `start.ps1` thật sẽ gặp lỗi cổng bận. Chạy ca WSL riêng, đợi WSL dừng (`wsl -l -v` báo `Stopped`) rồi mới chạy ca Windows hoặc script thật.
