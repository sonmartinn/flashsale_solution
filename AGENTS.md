# AGENTS.md — hướng dẫn cho Codex

Đồ án môn Cơ sở dữ liệu phi quan hệ: **Flash Sale chống bán quá số lượng (Redis + MongoDB)**. Gồm Express 5 + React 19, ba cách xử lý tồn kho (V0 ngây thơ, V1 MongoDB nguyên tử, V2 Redis + Lua) và bộ thí nghiệm E1–E4. Nguồn yêu cầu duy nhất là `docs/SPECS.md`.

**Hướng dẫn đầy đủ của dự án nằm ở `.claude/CLAUDE.md`.** File đó gồm ràng buộc, stack có ghi phiên bản, cấu hình đã kiểm chứng, và danh sách những thứ không được dùng. Đọc nó trước khi làm bất cứ việc gì. Mọi quy tắc trong đó áp dụng y nguyên cho Codex. Phần dưới chỉ tóm tắt những điểm dễ sai nhất.

## Quy tắc bắt buộc (tóm tắt)

- **Định nghĩa xong:** `npm run typecheck` đạt và `npm run build` đạt. `tsx` và Vite không kiểm tra kiểu.
- **Mã nguồn:**
  - TypeScript `strict`. Backend dùng ESM NodeNext, import tương đối phải ghi đuôi `.js`.
  - Express 5 tự bắt lỗi async, không bọc try/catch. Lỗi nghiệp vụ ném `HttpError(status, message)`.
  - Thông báo lỗi và chú thích viết bằng tiếng Việt.
- **Bảo mật:**
  - `JWT_SECRET` không có giá trị mặc định.
  - Mọi trường đầu vào phải là chuỗi.
  - Client không được tự đặt `role`.
  - Docker compose chỉ bind 127.0.0.1.
- **Đo lường:**
  - Chỉ đo trên `npm run start:test` (JS đã biên dịch), không đo trên `dev`. Reset trước mỗi lần đo.
  - Không ghi log trong đường mua. Tỷ lệ lỗi chỉ tính 5xx và lỗi kết nối.
  - Lượt đo chính thức chỉ chạy trên máy của người dùng (D-33).
- **MongoDB luôn ở `127.0.0.1:27018`.** Cổng 27017 là dịch vụ MongoDB của Windows.
- **Không được tự làm:** cài phần mềm, kill tiến trình lạ, chạy `docker compose down -v`.
- **`backend/.env`:** agent không bao giờ tạo, đọc, in ra hay commit file này.
- **Git:**
  - Không thêm dòng `Co-Authored-By` vào commit.
  - Không push nếu người dùng chưa yêu cầu.
  - Nhánh làm việc là `develop`.
- **Script dev:** `.ps1` phải chạy được trên PowerShell 5.1 (không dùng `&&`, `||`, `??`, toán tử ba ngôi) và lưu UTF-8 có BOM. `.sh` dùng bash 3.2 với `set -euo pipefail`.
- **`.claude/CLAUDE.md` thuộc về người dùng, không sửa.** Một ghi chú trong đó đã lỗi thời: `start:test` thực tế là `npm run build && dotenv run -q --override -f .env.test -- node dist/server.js` (plan 01-09), không còn là `node --env-file=.env.test`. Khi lệch nhau, `backend/package.json` là chuẩn.

## Quy trình GSD

Dự án theo quy trình GSD 1.20.0. Kế hoạch và trạng thái nằm trong `.planning/` (đã có trên git). Mọi thay đổi trong repo đều đi qua một lệnh GSD: `fast`, `quick`, `debug` hoặc `execute-phase`.

Cài GSD cho Codex một lần, ở thư mục gốc. Người dùng tự chạy lệnh này; agent không tự cài:

```
npx -y @opengsd/gsd-core@1.20.0 --codex --local --profile=full
```

- Bộ cài ghi vào `.codex/`. Thư mục này đã nằm trong `.gitignore` vì bộ cài ghi cứng đường dẫn của từng máy.
- Nếu bộ cài sửa `AGENTS.md` hoặc `.gitignore`, kiểm tra lại để không mất nội dung này.
- Không nâng cấp GSD riêng lẻ. Cả nhóm dùng chung phiên bản 1.20.0.
- Máy hiện chưa có `jq`, nên dùng `node` để xử lý JSON trong shell.

## Trạng thái hiện tại (bàn giao từ Claude Code, 2026-11-11)

Chi tiết nằm ở `.planning/HANDOFF.json` và `.planning/phases/03-experiments-e1-e4/.continue-here.md`. Bắt đầu bằng lệnh `resume-work` của GSD.

| Phase | Tình trạng |
|---|---|
| 01 Foundation (Infra, Data, Auth) | 10/10 plan xong. VERIFICATION.md `stale`, cần chạy lại execute-phase 01 để xác minh lại |
| 02 Buy Pipeline & Admin APIs | 5/5 plan xong. VERIFICATION.md `stale` |
| 03 Experiments (E1–E4) | 4/6 plan xong. **03-05** đã có kết quả E1/E2/E3 chính thức (commit `e07e0db`) nhưng chưa có SUMMARY. **03-06** (E4) chưa làm |
| 04 Web App & Dev Scripts | chưa lập kế hoạch |
| 05 Results Chart, README & Analysis | chưa lập kế hoạch |

**Việc đầu tiên:**
1. Chạy `docker compose up -d --wait`. Hai container đang tắt.
2. Chạy execute-phase cho phase 03. Ở cổng safe-resume, chọn "close out manually" cho 03-05: kiểm tra các CSV theo acceptance criteria của Task 2, rồi viết `03-05-SUMMARY.md`.
3. Làm tiếp 03-06.

**Hạn chót:** đóng băng mã ngày **2026-12-06**. Nếu thiếu thời gian, cắt theo thứ tự E4 → biểu đồ trực tiếp trên web → trang theo dõi → polling tự động. Không được cắt V0, V1, V2, E1, E2.

**Còn tồn:**
- Có 5 worktree agent cũ trong `.claude/worktrees/`. Trong đó `agent-a0eddd2f1d095e170` giữ một sửa đổi chưa commit ở `backend/src/services/purchase.service.ts`. Người dùng quyết định giữ nguyên; không merge hay xoá khi chưa hỏi.
- Rủi ro đã chấp nhận ở Phase 2 (WR-01, WR-02, WR-04) phải ghi vào tài liệu rủi ro của Phase 5. Xem `.planning/STATE.md`.
