# Flash Sale – đồ án môn Cơ sở dữ liệu phi quan hệ

Hệ thống flash sale chống bán quá số lượng cho shop thời trang, dùng Redis và MongoDB. Nhóm 2 sinh viên, quen Node.js, MongoDB, React. Trả lời bằng tiếng Việt.

## Đọc trước khi làm

- `docs/tien-do.md`: đang làm tới đâu, việc tiếp theo, quyết định đã chốt. **Đọc đầu tiên.**
- `docs/ghi-chu-ky-thuat.md`: môi trường, hướng cài đặt V0/V1/V2, cạm bẫy. Đọc trước khi sửa backend hoặc viết test tải.
- `docs/de-tai-va-lo-trinh.md`: mục tiêu, phạm vi, thiết kế dữ liệu, thí nghiệm, lộ trình 6 tuần.
- `docs/yeu-cau-mon-hoc.md`: yêu cầu của giáo viên, cấu trúc báo cáo, đồ nộp. Đọc khi viết báo cáo hoặc slide.

Cập nhật `docs/tien-do.md` khi xong một việc hoặc chốt một quyết định.

## Nhánh

- `develop`: nhánh làm việc chính, mọi thay đổi làm ở đây. Chỉ nhánh này có `docs/` và `CLAUDE.md`.
- `main`: chỉ có mã nguồn chạy được. Không sửa trực tiếp, không merge `develop` vào vì sẽ kéo `docs/` và `CLAUDE.md` theo.
- `README.md` và `loadtest/README.md` có mặt trên `main`, nên không link tới `docs/` và không nhắc tới `CLAUDE.md`.

Đưa mã sang `main`, chỉ khi phần đó đã chạy được và khi được yêu cầu:

```bash
git switch main
git restore --source=develop --staged --worktree -- . ':!docs' ':!CLAUDE.md'
git commit -m "feat: ..."
git switch develop
```

## Lệnh

```bash
docker compose up -d
```

Trong `backend/`: `npm run dev`, `npm start`, `npm run seed` (xóa rồi tạo lại dữ liệu), `npm run reset`.

Trong `frontend/`: `npm run dev`, `npm run build`.

## Quy ước

- MongoDB của dự án ở cổng **27018**, không phải 27017.
- Backend dùng ES modules, Express 5, nên handler async không cần bọc try/catch. Lỗi nghiệp vụ dùng `HttpError` trong `src/middlewares/error.js`.
- Chú thích và thông báo lỗi bằng tiếng Việt.
- MongoDB là nguồn dữ liệu gốc, Redis chỉ là lớp xử lý nhanh.
- Không làm ngoài phạm vi trong `docs/de-tai-va-lo-trinh.md` mục 2 nếu chưa hỏi. Không cắt V0, V1, V2, E1, E2.
- Chỉ commit khi được yêu cầu.
- Không thêm dòng `Co-Authored-By` vào commit, trên mọi nhánh.

Tài liệu gốc của giáo viên ở `../instructions_docs/`, ngoài thư mục này. Không đưa lên repo vì có thông tin cá nhân của người khác.
