# Flash Sale chống bán quá số lượng (Redis + MongoDB)

Đồ án môn Cơ sở dữ liệu phi quan hệ: hệ thống flash sale cho shop thời trang với ba cách xử lý tồn kho (V0 ngây thơ, V1 MongoDB nguyên tử, V2 Redis + Lua) và bộ thí nghiệm bắn tải. Nguồn yêu cầu duy nhất là [docs/SPECS.md](docs/SPECS.md).

> README đầy đủ (cài đặt từ bản clone sạch, kết quả và phân tích) thuộc Phase 5. Phần dưới chỉ gồm cách khởi chạy môi trường dev.

## Khởi chạy môi trường dev

| Việc | Windows (PowerShell 5.1) | macOS |
|---|---|---|
| Khởi động | `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` | `./scripts/start.sh` |
| Dừng | `powershell -ExecutionPolicy Bypass -File scripts\stop.ps1` | `./scripts/stop.sh` |

`-Seed`/`--seed` xóa và tạo lại dữ liệu mẫu, `-KeepDb`/`--keep-db` dừng ứng dụng nhưng giữ MongoDB và Redis. Hướng dẫn đầy đủ, file log và cách xử lý cổng bận: [scripts/README.md](scripts/README.md).

Script Windows đã chạy bộ kiểm thử fixture và nghiệm thu trên bản sao dùng một lần với Docker thật. [Kết quả nghiệm thu Windows](.planning/phases/04-web-app-dev-scripts/04-DEV-UAT.md)

Script Bash đã qua `bash -n`, kiểm tra tương thích Bash 3.2 và fixture vòng đời trên Linux (WSL). Cặp script này vẫn chưa chạy thử trên macOS.

Script dev không dùng để đo tải. Đo tải theo [loadtest/README.md](loadtest/README.md) với `npm run start:test`.
