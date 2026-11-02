# Yêu cầu môn học

Tóm tắt từ thư mục `../instructions_docs/` (nằm ngoài `flashsale/`, không đưa lên git). Đọc file gốc khi cần chi tiết.

## Hướng đề tài được chấp nhận

Theo `huong dan bai tap lon.docx`:

- Mô phỏng hệ thống quản lý bằng Windows Form và JSON (chuyển đổi RDB sang JSON)
- Mô phỏng ứng dụng web và MongoDB
- Ứng dụng lập trình di động, Node.js
- Nghiên cứu chuyển đổi dữ liệu quan hệ thành dữ liệu phi quan hệ
- Tìm hiểu một hệ thống sử dụng CSDL NoSQL
- Đề tài dạng "Tìm hiểu NoSQL và ứng dụng…"
- Xây dựng website TMĐT kinh doanh thời trang…

Đề tài của nhóm thuộc hướng *web + MongoDB* và *tìm hiểu NoSQL và ứng dụng*.

## Cấu trúc báo cáo

Theo `Trang bia va huong dan noi dung.docx`:

1. Bìa: tên trường, "BÀI TẬP MÔN HỌC – CƠ SỞ DỮ LIỆU PHI QUAN HỆ", tên đề tài, giáo viên hướng dẫn, nhóm, sinh viên thực hiện, lớp, địa điểm và thời gian
2. Lời mở đầu
3. Mục lục
4. Chương 1. Cơ sở lý thuyết
5. Chương 2. Phân tích thiết kế hệ thống (dùng NoSQL)
6. Chương 3. Tên đề tài, ứng dụng NoSQL trên hệ thống…
7. Kết luận và hướng phát triển
8. Bảng công việc: STT, thành viên, công việc thực hiện

Mẫu bìa ghi "Đà Nẵng, tháng 7 năm 2020" và tên sinh viên mẫu. Phải thay bằng thông tin thật của nhóm.

## Nộp trong ngày thi

Theo `File in ra nop trong ngay thi - Phan cong nhiem vu nhóm.docx`:

- Bản in phân công: nhóm, tên đề tài, nhóm trưởng, bảng chức năng theo từng thành viên (MSSV, họ tên, email, điện thoại, chức năng phân hệ khách hàng và admin)
- Link mã nguồn (GitHub)
- Link video demo
- Dữ liệu JSON hoặc SQL (nộp theo link)
- Hướng dẫn sử dụng và cài đặt, ghi rõ phiên bản đang dùng
- File MD trên GitHub: tính năng, công nghệ, cài đặt, biến môi trường, tài khoản database

File mẫu này chứa thông tin cá nhân của sinh viên khóa trước. Chỉ dùng để xem bố cục, không sao chép nội dung và không đưa lên repo.

## Slide báo cáo

`slide-bao-cao.pptx` là mẫu 31 slide của đề tài RavenDB, theo trình tự:

1. Giới thiệu đề tài: lý do chọn, NoSQL là gì, phù hợp và không phù hợp với ứng dụng nào, mục tiêu, 4 loại NoSQL
2. Tìm hiểu CSDL: giới thiệu, lý do chọn, so sánh với RDBMS và các hệ khác
3. Giới thiệu ứng dụng: chức năng, người dùng, kiến trúc, giao diện, demo
4. Tổng kết: kết quả về lý thuyết và thực nghiệm, hướng phát triển

## Danh mục tài liệu trong `../instructions_docs/`

| File | Nội dung |
|---|---|
| `huong dan bai tap lon.docx` | Các hướng đề tài |
| `Trang bia va huong dan noi dung.docx` | Mẫu bìa, khung nội dung |
| `File in ra nop trong ngay thi - Phan cong nhiem vu nhóm.docx` | Mẫu phân công, mẫu README |
| `slide-bao-cao.pptx` | Slide mẫu |
| `Thuc hanh bai 2/` | Bài tập truy vấn MongoDB, `restaurants.json` |
| `tham khao.rar` | 4 PDF, xem bên dưới |
| `demotham khao.rar` | Demo Laptopshop: Node/Express/Mongoose và React/TypeScript |

Bốn PDF trong `tham khao.rar`, nên dùng cho Chương 1:

- `tai llieu tham khao.pdf`: luận văn thạc sĩ về chuyển đổi lược đồ CSDL quan hệ sang NoSQL (2015, 89 trang)
- `tham khao 2.pdf`: báo cáo nghiên cứu MongoDB, ĐHQGHN (22 trang)
- `tham khao 3.pdf`: luận văn đánh giá hiệu năng một số hệ NoSQL (2020, 71 trang), hữu ích cho cách trình bày thực nghiệm
- `tham khao 4.pdf`: đồ án kết hợp Node.js với MongoDB cho hệ thống thời gian thực (2021, 79 trang)

Các file `.docx`, `.pptx` và `.rar` là nhị phân, cần trích xuất mới đọc được. Máy có WinRAR tại `C:\Program Files\WinRAR\UnRAR.exe`.
