# Quy trình đo tải (E1, E2, E3, E4)

Tài liệu này là quy trình đo chính thức của đồ án (EXP-07). Ai trong nhóm, hoặc giảng viên chấm, cũng có thể làm theo để chạy lại từng thí nghiệm bằng **một lệnh** và hiểu từng con số trong file CSV kết quả.

## Mục đích

| Thí nghiệm | Lệnh | Câu hỏi cần trả lời |
|---|---|---|
| **E1 – Tính đúng** | `npm run e1` | 1.000 user khác nhau cùng mua một đợt sale còn 100 sản phẩm. V0 có bán quá không? V1 và V2 có luôn đúng 100 đơn không? |
| **E3 – Mua trùng** | `npm run e3` | Một user gửi 10 request mua cùng lúc. V1 và V2 có giữ đúng 1 đơn/người và không rò rỉ tồn kho không? |
| **E2 – Hiệu năng** | `npm run e2` | V1 (MongoDB nguyên tử) so với V2 (Redis + Lua): thông lượng và độ trễ ở 100, 300, 500 kết nối, đo riêng giai đoạn còn hàng và hết hàng. |
| **E4 – Sự cố MongoDB (tùy chọn)** | `npm run e4` | Khi MongoDB dừng giữa lúc bán V2, hệ thống có giữ được giới hạn kho và runbook đối soát có khôi phục Redis không? |

E4 được mô tả trong mục riêng bên dưới; đây là thí nghiệm tùy chọn và là mục cắt đầu tiên nếu thiếu thời gian.

## Chuẩn bị

Làm một lần trên máy đo, từ thư mục gốc của repo:

1. Mở Docker Desktop, rồi chạy:

   ```
   docker compose up -d --wait
   ```

   Lệnh chờ tới khi `flashsale-mongo` (cổng 127.0.0.1:27018) và `flashsale-redis` (cổng 127.0.0.1:6379) đều healthy. Không bao giờ dùng `docker compose down -v`, vì lệnh đó xóa dữ liệu.

2. Tạo `backend/.env` nếu chưa có. Cách tạo nằm ở đầu file `backend/.env.example`: một lệnh `node -e` chép file mẫu và ghi một `JWT_SECRET` ngẫu nhiên thẳng vào file, không in khóa ra màn hình. `JWT_SECRET` bắt buộc và không có giá trị mặc định. Không commit `backend/.env`.

   `MONGO_MAX_POOL_SIZE` (mặc định 100) là kích thước pool kết nối MongoDB của server. Giá trị server thực sự dùng được đọc từ `GET /api/health` và ghi vào cột `maxPoolSize` của **mọi** dòng CSV, nên không cần chép tay. Giữ nguyên giá trị này khi so V1 với V2.

3. Cài thư viện từ lockfile đã commit (không dùng `npm install` để tránh đổi phiên bản):

   ```
   cd backend
   npm ci
   cd ../loadtest
   npm ci
   ```

4. Tạo dữ liệu mẫu một lần, trong `backend/`:

   ```
   npm run seed
   ```

   Sau bước này có đúng **một** đợt sale đang mở, và harness tự tìm ra nó. Nếu có nhiều đợt sale đang mở, harness báo INVALID và yêu cầu truyền `--sale <id>`.

## Chạy server để đo

Mở **terminal A**:

```
cd backend
npm run start:test
```

- `start:test` biên dịch TypeScript sang JS rồi chạy `dist/server.js` ở chế độ test (nạp `backend/.env.test` đè lên `backend/.env`). Chế độ test cho phép header `x-test-user` thay cho JWT, để harness giả lập hàng nghìn user mà không phải đăng nhập từng người.
- **Không bao giờ đo trên `npm run dev`**: `tsx watch` dịch mã khi nạp và có bộ theo dõi file, làm sai số liệu (SPECS §10).
- Harness **không tự bật hay tắt server**. Nó chỉ kiểm tra: `GET /api/health` phải trả 200 với `mongo` và `redis` đều sống và `testMode === true`, đăng nhập admin phải thành công, và collection `orders` phải có index unique `{ saleId: 1, userId: 1 }`. Sai một điều là INVALID (mã thoát 2) và file CSV của phiên trước được giữ nguyên.
- Trong lúc đo, nhất là E2: **đóng trang `/admin`** (hoặc tạm dừng polling của nó) và tắt các ứng dụng nặng khác (trình duyệt nhiều tab, IDE đang build, phần mềm quay màn hình). Trang `/admin` gọi API stats định kỳ (polling), tức là thêm tải MongoDB vào đúng lúc đang đo.

## Mỗi thí nghiệm một lệnh

Mở **terminal B**, đứng trong `loadtest/`:

```
cd loadtest
npm run e1
npm run e3
npm run e2
```

Mỗi lệnh là một phiên đo đầy đủ với cấu hình mặc định (cấu hình dùng cho kết quả chính thức). Cờ thêm vào sau `--`. Cách viết này chạy được cả trên PowerShell (npm 11 giữ nguyên `--`) lẫn bash, ví dụ `npm run e1 -- --runs 1`.

### Cờ của E1 (`npm run e1 -- ...`)

| Cờ | Mặc định | Ý nghĩa |
|---|---|---|
| `--runs n` | 5 | Số lượt của mỗi mode. Mỗi lượt chạy lần lượt v0, v1, v2 (1 đến 100). |
| `--users n` | 1000 | Số user khác nhau cùng mua trong một lượt (2 đến 100.000, phải lớn hơn `--stock`). |
| `--stock n` | 100 | Tồn kho (`totalQty`) đặt lại trước mỗi lượt. |
| `--sale id` | tự tìm | ObjectId 24 hex của đợt sale. Bỏ trống thì phải có đúng một đợt sale đang mở. |
| `--base-url url` | `http://127.0.0.1:5000` | Địa chỉ backend (chỉ lấy origin). |

Khi `--runs`, `--users` hoặc `--stock` khác mặc định, mọi dòng `e1.csv` có ghi chú `cấu hình không mặc định`.

### Cờ của E3 (`npm run e3 -- ...`)

| Cờ | Mặc định | Ý nghĩa |
|---|---|---|
| `--runs n` | 5 | Số lượt của mỗi mode. Mỗi lượt chạy v1 rồi v2 (V0 không đo vì không có bù kho theo thiết kế). |
| `--sale id` | tự tìm | Như E1. |
| `--base-url url` | `http://127.0.0.1:5000` | Như E1. |

Tồn kho (100) và số request (10 request đồng thời của cùng một user) cố định, không có cờ.

### Cờ của E2 (`npm run e2 -- ...`)

| Cờ | Mặc định | Ý nghĩa |
|---|---|---|
| `--runs n` | 5 | Số lượt đo của mỗi mode ở mỗi mức kết nối. Nhỏ hơn 5 chỉ được phép khi có `--smoke`. |
| `--stock n` | 5000 | S: tồn kho mỗi lượt, cũng là số request của pha `in_stock`. Nhỏ hơn 1000 chỉ được phép khi có `--smoke`. |
| `--soldout-requests n` | 5000 | M: số request của pha `sold_out`. |
| `--connections a,b,...` | `100,300,500` | Các mức kết nối, đo theo đúng thứ tự. Danh sách khác mặc định chỉ được phép khi có `--smoke`. |
| `--smoke` | tắt | Chạy thử với cấu hình nhỏ. Mọi dòng `e2.csv` có ghi chú `smoke`. |
| `--sale id` | tự tìm | Như E1. |
| `--base-url url` | `http://127.0.0.1:5000` | Như E1. |

S và M phải lớn hơn hoặc bằng số kết nối lớn nhất (autocannon không chạy được khi số request nhỏ hơn số kết nối).

### Biến môi trường (cả bốn thí nghiệm)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `LOADTEST_BASE_URL` | `http://127.0.0.1:5000` | Địa chỉ backend. Cờ `--base-url` được ưu tiên hơn biến này. |
| `LOADTEST_ADMIN_EMAIL` | `admin@flashsale.local` | Tài khoản admin dùng để reset và đọc stats (tài khoản do `npm run seed` tạo). |
| `LOADTEST_ADMIN_PASSWORD` | mật khẩu admin do seed tạo | Chỉ cần đặt khi đã đổi mật khẩu admin. Harness không bao giờ in mật khẩu. |

Đặt biến trên PowerShell: `$env:LOADTEST_BASE_URL = "http://127.0.0.1:5000"` rồi chạy lệnh. Trên bash: `LOADTEST_BASE_URL=http://127.0.0.1:5000 npm run e1`.

Tham số hay biến môi trường sai bị từ chối trước khi bắn tải: harness in `[LỖI] ...` kèm dòng cách dùng và thoát mã 2.

### Chạy thử nhanh (smoke)

Ba lệnh dưới đây kiểm tra toàn bộ đường đo trong vài chục giây, chạy trong `loadtest/` khi server `start:test` đang chạy:

```
npm run e1 -- --runs 1
npm run e3 -- --runs 1
npm run e2 -- --smoke --runs 1 --stock 1000 --soldout-requests 1000 --connections 100
```

Mỗi lệnh phải kết thúc bằng dòng `KẾT LUẬN E1: PASS`, `KẾT LUẬN E3: PASS` và `KẾT LUẬN E2: VALID` tương ứng, mã thoát 0. CSV của các lần chạy thử **không phải kết quả chính thức**: không commit chúng. Chạy lại phiên chính thức (lệnh mặc định) sẽ ghi đè chúng.

## Quy trình đo

Đây là những gì harness làm trong một phiên, để người đọc kết quả biết số liệu đến từ đâu:

1. **Kiểm tra trước khi đo (preflight)**: health và `testMode`, đăng nhập admin, chọn đợt sale, index unique của `orders`. Chỉ khi qua hết mới tạo (ghi đè) file `results/eN.csv`, nên một preflight hỏng không bao giờ xóa kết quả cũ.
2. **Reset trước mỗi lượt**: gọi `POST /api/admin/sales/:id/reset` với `{ mode, totalQty }`. Lệnh này xóa đơn của đợt sale, đặt lại tồn kho MongoDB, đặt lại khóa `stock` của Redis và xóa tập `buyers`. Ngay sau đó harness đọc `GET /api/admin/sales/:id/stats` và kiểm tra: `mode` và `totalQty` đúng như yêu cầu, `mongoRemaining = totalQty`, `orders = 0`, `redisBuyers = 0`, và với v2 thì `redisStock = totalQty`. Sai một điều là INVALID.
3. **Không ghi log trên đường mua**: backend không in gì trong một request mua bình thường (chỉ in khi có lỗi 500 hoặc khi hoàn kho thất bại), và harness không in gì trong lúc bắn tải. Mỗi lượt chỉ in một dòng tóm tắt sau khi bắn xong.
4. **E1 và E3** dùng `fetch` của Node: tạo **toàn bộ** request của lượt (1.000 ở E1, 10 ở E3) trong một vòng đồng bộ rồi mới chờ `Promise.all`, nên mọi request bay cùng lúc. Mỗi request mang header `x-test-user` riêng (E1: 1.000 id khác nhau, E3: cùng một id cho 10 request). Timeout mỗi request là 30 giây. Sau khi bắn, harness đọc stats và với v2 thì chạy công cụ đối soát `backend/scripts/reconcile.ts` (không `--fix`).
5. **E2** dùng autocannon (một tiến trình, pipelining 1, timeout 10 giây mỗi request). Mỗi lượt gồm hai pha trên cùng đợt sale vừa reset về tồn kho S:
   - `in_stock`: S request của S user mới, khác nhau (kỳ vọng S lần 201);
   - `sold_out`: M request của M user mới khác nữa khi kho đã hết (kỳ vọng M lần `409 SOLD_OUT`).

   Thứ tự đo: mức kết nối 100, rồi 300, rồi 500. Đầu mỗi mức có **một lượt khởi động không ghi CSV** cho từng mode (v1 rồi v2, S = M = 1000) để làm nóng JIT, cache đợt sale, socket keep-alive và pool MongoDB. Sau đó các lượt đo **xen kẽ mode đi trước** (lượt lẻ v1 rồi v2, lượt chẵn v2 rồi v1) để triệt tiêu trôi số liệu theo thời gian. Mọi lượt đo đều được ghi, kể cả lượt có lỗi thật: không bỏ, không cắt, không chạy lại.
6. **Chờ cổng TIME_WAIT**: mỗi kết nối ngắn để lại một socket TIME_WAIT khoảng 120 giây, và Windows chỉ có 16.384 cổng tạm thời. Trước mỗi lượt bắn (E1, E3) và trước mỗi pha autocannon (E2), harness đọc `netstat` và **tự chờ** cho tới khi số socket TIME_WAIT tới cổng server cộng số socket sắp mở không vượt 10.000 (kiểm tra lại mỗi 5 giây, tối đa 180 giây, quá thì INVALID). Khi đó màn hình in `Chờ cổng tạm thời: ...` và cột `note` ghi `chờ cổng N s`. Hãy để harness tự chờ, có thể tới khoảng 2 phút mỗi lần. **Không đổi thiết lập mạng của Windows** (registry, `netsh`) để rút ngắn thời gian này.
7. **Khôi phục khi kết thúc**: dù phiên PASS, FAIL hay INVALID, harness reset đợt sale về đúng `mode` và `totalQty` lúc bắt đầu phiên và in `Đã khôi phục đợt sale ...`.
8. **Dữ liệu thô**: mỗi lượt ghi thêm một file JSON vào `results/raw/` (đếm theo từng mã trạng thái, stats trước và sau, kết quả đối soát; E2 có cả mảng độ trễ đầy đủ). Không có token hay mật khẩu trong các file này.

Thời gian tham khảo trên máy phát triển: E1 và E3 vài phút (E1 có thể dừng chờ cổng giữa các lượt), E2 từ vài chục phút trở lên vì có khởi động và nhiều lần chờ cổng.

## Cách tính số liệu

| Đại lượng | Cách tính |
|---|---|
| Độ trễ E2 | Harness tự ghi `responseTime` (ms) của **từng** phản hồi qua sự kiện `response` của autocannon, không dùng histogram của autocannon (histogram đó không có p95 và chỉ xấp xỉ). |
| `p50Ms`, `p95Ms`, `p99Ms` | Nearest-rank trên mảng độ trễ đã sắp xếp tăng dần đầy đủ: phần tử thứ `ceil(p/100 × n)` (đếm từ 1). |
| `meanMs`, `maxMs` | Trung bình cộng và giá trị lớn nhất của cùng mảng đó. |
| `durationMs` (E2) | Từ ngay trước khi gọi autocannon tới phản hồi **cuối cùng**. Không dùng `duration` của autocannon vì nó chỉ trả kết quả ở nhịp lấy mẫu kế tiếp, thêm tới khoảng 1 giây chờ không. |
| `durationMs` (E1) | Từ ngay trước request đầu tiên tới khi request cuối cùng xong, làm tròn tới ms. |
| `rps` | `số phản hồi / durationMs × 1000`. |
| `realErrors` | `s5xx + connErrors + timeouts`. Đây là "lỗi thật" theo SPECS §10. **409 không bao giờ là lỗi**: hết hàng và đã mua là phản hồi đúng của hệ thống dưới tải. 401 và 4xx khác được đếm riêng. |
| `connErrors` (E2) | `errors - timeouts` của autocannon, vì `errors` của autocannon đã gồm cả timeout. Không đếm timeout hai lần. |
| `connErrors` (E1) | Lỗi kết nối **cộng** timeout phía client (E1 không có cột `timeouts` riêng). Trong E3 cả hai cùng nằm trong `realErrors`. |
| `oversold` | `max(0, orders - totalQty)`: số đơn vượt tính từ số đơn trong MongoDB, không chỉ nhìn tồn kho. |
| Trung vị cuối phiên E2 | Bảng in ra màn hình: trung vị `rps`, `p50`, `p95` theo (connections, mode, phase). Không ghi file tổng hợp riêng; phân tích ở Phase 5 tính lại từ `e2.csv`. |

## Cột CSV

Mọi file bắt đầu bằng chín cột môi trường, giống nhau ở mọi dòng của một phiên:

| Cột | Ý nghĩa |
|---|---|
| `session` | Mã phiên đo, dạng `20261109T103000Z-ab12` (giờ UTC lúc bắt đầu + 4 hex ngẫu nhiên). |
| `date` | Thời điểm ghi dòng, ISO-8601 UTC. |
| `gitCommit` | Commit ngắn của HEAD; thêm `-dirty` khi `backend/` hoặc `loadtest/` có thay đổi chưa commit (không tính `loadtest/results`). Trống khi không đọc được git. |
| `nodeVersion` | Phiên bản Node chạy harness. |
| `os` | Hệ điều hành và phiên bản. |
| `cpuModel` | Tên CPU. |
| `cpuCount` | Số luồng CPU. |
| `totalMemGB` | Tổng RAM (GB, 2 chữ số thập phân). |
| `maxPoolSize` | Kích thước pool MongoDB của server, đọc từ `/api/health` (từ `MONGO_MAX_POOL_SIZE`). |

### `e1.csv` (một dòng mỗi lượt × mode)

| Cột | Ý nghĩa |
|---|---|
| `run` | Số thứ tự lượt (1..runs). |
| `mode` | `v0`, `v1` hoặc `v2`. |
| `users` | Số user khác nhau đã bắn. |
| `totalQty` | Tồn kho đặt lại trước lượt. |
| `s201` | Số phản hồi 201 (mua thành công). |
| `s409SoldOut` | Số 409 có mã `SOLD_OUT`. |
| `s409AlreadyBought` | Số 409 có mã `ALREADY_BOUGHT`. |
| `s401` | Số 401 (phải bằng 0, khác 0 là INVALID). |
| `sOther4xx` | Các phản hồi khác dưới 500 không thuộc nhóm trên. |
| `s5xx` | Số phản hồi 5xx. |
| `connErrors` | Lỗi kết nối cộng timeout phía client. |
| `orders` | Số đơn của đợt sale trong MongoDB sau lượt. |
| `distinctUsers` | Số user khác nhau trong các đơn đó (phải bằng `orders`). |
| `finalStock` | Tồn kho cuối: `mongoRemaining` với v0/v1 (v0 có thể âm), `redisStock` với v2. |
| `oversold` | Số đơn vượt, `max(0, orders - totalQty)`. |
| `reconcile` | Kết quả đối soát Redis với MongoDB: `clean` (khớp), `drift` (lệch), `n/a` (v0, v1, hoặc đối soát không chạy được; khi đó `note` ghi mã thoát). |
| `durationMs` | Thời gian bắn của lượt (ms). |
| `status` | `PASS`, `FAIL` hoặc `INVALID` của lượt. |
| `note` | Ghi chú: lý do FAIL/INVALID, `cấu hình không mặc định`, `chờ cổng N s`. |

### `e3.csv` (một dòng mỗi lượt × mode)

| Cột | Ý nghĩa |
|---|---|
| `run` | Số thứ tự lượt. |
| `mode` | `v1` hoặc `v2`. |
| `requests` | Số request đồng thời của cùng một user (luôn 10). |
| `totalQty` | Tồn kho đặt lại trước lượt (luôn 100). |
| `s201` | Số 201 (phải đúng 1). |
| `s409SoldOut` | Số 409 `SOLD_OUT`. |
| `s409AlreadyBought` | Số 409 `ALREADY_BOUGHT`. |
| `sOther` | 401 cộng các 4xx khác. |
| `realErrors` | `s5xx + connErrors + timeouts`. |
| `userOrders` | Số đơn của user đó trong MongoDB (phải đúng 1). |
| `finalStock` | Tồn kho cuối: `mongoRemaining` (v1) hoặc `redisStock` (v2). |
| `expectedStock` | `totalQty - 1` (99). |
| `stockLeak` | `true` khi tồn kho cuối khác kỳ vọng (với v2 còn khi `redisBuyers ≠ 1` hoặc đối soát không `clean`). |
| `reconcile` | `clean`, `drift` hoặc `n/a` (v1). |
| `status` | `PASS`, `FAIL` hoặc `INVALID`. |
| `note` | Ghi chú: lý do, `chờ cổng N s`. |

### `e2.csv` (một dòng mỗi lượt × pha)

| Cột | Ý nghĩa |
|---|---|
| `connections` | Số kết nối autocannon (100, 300 hoặc 500). |
| `mode` | `v1` hoặc `v2`. |
| `run` | Số thứ tự lượt đo trong mức kết nối (lượt khởi động không được ghi). |
| `phase` | `in_stock` (còn hàng) hoặc `sold_out` (đã hết hàng). |
| `requests` | Số request của pha: S với `in_stock`, M với `sold_out`. |
| `totalQty` | Tồn kho S của lượt. |
| `durationMs` | Thời lượng pha do harness đo (xem trên). |
| `rps` | Phản hồi mỗi giây. |
| `p50Ms` | Độ trễ trung vị (nearest-rank). |
| `p95Ms` | Độ trễ phân vị 95. |
| `p99Ms` | Độ trễ phân vị 99. |
| `meanMs` | Độ trễ trung bình. |
| `maxMs` | Độ trễ lớn nhất. |
| `s201` | Số 201. |
| `s409SoldOut` | Số 409 `SOLD_OUT`. |
| `s409AlreadyBought` | Số 409 `ALREADY_BOUGHT`. |
| `s5xx` | Số 5xx. |
| `connErrors` | Lỗi kết nối không kể timeout. |
| `timeouts` | Số request quá 10 giây. |
| `realErrors` | `s5xx + connErrors + timeouts`. |
| `status` | `VALID`, `FAIL` hoặc `INVALID` của dòng. |
| `note` | Ghi chú: `smoke`, `chờ cổng N s`, `kho chưa hết (...)`, lý do FAIL/INVALID. |

Số thực ghi 2 chữ số thập phân với dấu chấm. Ô trống nghĩa là bước đó chưa đo được (ví dụ lượt INVALID dừng trước khi bắn).

## Kết luận và mã thoát

Mỗi phiên kết thúc bằng một bảng tổng hợp theo mode (E2: bảng trung vị) và **một dòng kết luận**: `KẾT LUẬN E1: <kết luận> — <lý do>` (tương tự E2, E3).

| Kết luận | Mã thoát | Ý nghĩa |
|---|---|---|
| `PASS` (E1, E3, E4) / `VALID` (E2) | 0 | Phép đo đáng tin và khẳng định đúng. |
| `FAIL` | 1 | Phép đo đáng tin nhưng khẳng định bị phá (bán quá, sai số đơn, rò rỉ tồn kho, đối soát lệch). |
| `INVALID` | 2 | Phép đo không đáng tin: server không chạy hoặc không ở chế độ test, preflight sai, stats sau reset sai, có 401, số id gửi khác số request, `distinctUsers ≠ orders`, đối soát v2 không chạy được, hết thời gian chờ cổng; E1/E3 còn tính cả mọi lỗi thật. Tham số dòng lệnh sai cũng thoát mã 2. |

- Kết luận phiên là kết luận **nặng nhất** của các lượt: có INVALID thì INVALID, có FAIL thì FAIL, còn lại PASS/VALID.
- **INVALID dừng phiên ngay**: các dòng đã đo vẫn được ghi, đợt sale được khôi phục, rồi thoát.
- **FAIL không dừng phiên**: harness chạy hết mọi lượt đã định để CSV cho thấy toàn cảnh.
- **Không có thử lại tự động** ở bất kỳ đâu. Chạy lại là quyết định của người đo, và một phiên FAIL hay INVALID phải được báo cáo đúng như nó là.
- **E1 PASS** khi mọi lượt hợp lệ, **mọi** lượt V0 đều bán quá (`oversold > 0`), mọi lượt V1 và V2 có đúng `totalQty` đơn, không bán quá, và V2 đối soát `clean` với Redis khớp MongoDB.
- **E3 PASS** khi mọi lượt có đúng một 201, chín 409, một đơn của user, tồn kho giảm đúng 1 (`stockLeak = false`), và V2 có `redisBuyers = 1`, đối soát `clean`.
- **E2 chỉ xét tính đúng, không bao giờ xét tốc độ.** Không có ngưỡng độ trễ hay thông lượng nào: E2 không gắn nhãn V1 hay V2 nhanh hơn, chậm hơn hay đạt/trượt. Một dòng E2 là FAIL khi bán quá, khi số đơn sai, hoặc (v2) khi đối soát lệch hay Redis lệch MongoDB. Lỗi thật (5xx, lỗi kết nối, timeout) **không** làm lượt E2 thành INVALID: chúng là một phần của số liệu và được đếm. Khi có lỗi thật, kho có thể chưa bán hết một cách hợp lệ, nên harness chỉ đòi không bán quá và `orders ≤ S`, và ghi `kho chưa hết (đơn/S, có N lỗi thật)` vào `note`. Không có lỗi thật thì bắt buộc đúng S đơn.

## Chính sách file

- Mỗi lần chạy `npm run eN` **ghi đè** `results/eN.csv` bằng các dòng của riêng phiên đó (chỉ sau khi preflight qua). Mỗi dòng được ghi xuống đĩa ngay khi lượt xong, nên nếu tiến trình chết giữa chừng thì các dòng đã ghi vẫn còn. Lịch sử các phiên nằm trong git.
- `results/raw/` (JSON thô của từng lượt) bị git bỏ qua. Chỉ các file `results/*.csv` được commit.
- Chỉ commit phiên **chính thức** (lệnh mặc định, không cờ) có kết luận `PASS` (E1, E3, E4) hoặc `VALID` (E2). Không commit CSV của lần chạy thử: dòng E2 chạy thử có `smoke` trong `note`, dòng E1 cấu hình khác mặc định có `cấu hình không mặc định`, còn E3 chạy thử nhận ra qua số dòng ít hơn 10. E4 không có cờ `--smoke`: một lượt chạy thử vẫn có thể tạo CSV hai dòng giống phiên chính thức, nên người chạy phải phân biệt mục đích của phiên và không commit CSV smoke.
- Một phiên chính thức FAIL hoặc INVALID không được thay bằng một lần chạy lại "đẹp hơn" mà không nói ra. Hãy ghi lại dòng kết luận và bảng tổng hợp của phiên đó.
- CSV là UTF-8 **không BOM**, xuống dòng LF, dấu phẩy phân cách, dấu chấm thập phân. Mở bằng Excel qua **Data > From Text/CSV** và chọn File Origin **65001: Unicode (UTF-8)**, nếu không cột `note` tiếng Việt sẽ bị lỗi font. Trên Windows có `core.autocrlf=true`, git có thể checkout file thành CRLF; nội dung không đổi.

## E4 (tùy chọn): ngắt MongoDB khi đang bán V2

Giữ terminal A chạy `npm run start:test` trong `backend/`. Từ terminal B trong `loadtest/`, chạy:

```
npm run e4
```

E4 chỉ dừng container `flashsale-mongo` của dự án, không dừng dịch vụ MongoDB Windows ở cổng 27017. Redis luôn chạy; harness không bao giờ dùng `docker compose down -v`. Dừng các lượt mua khác trong lúc đo vì E4 reset đợt sale và chạy `reconcile --fix` khi kết thúc tải.

### Cờ của E4

| Cờ | Mặc định | Ý nghĩa |
|---|---|---|
| `--stock n` | 1000 | Tồn kho mỗi lượt, số nguyên từ 10 đến 1.000.000. |
| `--concurrency n` | 50 | Số worker gửi request liên tiếp, từ 1 đến 500. |
| `--runs n` | 1 | Số lượt thí nghiệm, từ 1 đến 100. |
| `--sale id` | tự tìm | ObjectId của đợt sale; bỏ trống thì cần đúng một đợt sale đang mở. |
| `--base-url url` | `http://127.0.0.1:5000` | Origin của backend; ưu tiên hơn `LOADTEST_BASE_URL`. |

Ví dụ cấu hình khác mặc định: `npm run e4 -- --stock 2000 --concurrency 100 --runs 1`. Các biến admin và base URL dùng chung với E1/E2/E3. Kết quả chính thức dùng lệnh mặc định và phải do người đo chạy trên máy của mình (D-33).

### Trình tự và phục hồi

1. Kiểm tra test mode, tài khoản admin, unique index và container MongoDB đang chạy; chờ ngân sách cổng rồi reset V2 về kho 1000 (mặc định).
2. Khởi động 50 worker với user khác nhau. Khi số phản hồi 201 đạt `ceil(0.3 × stock)`, gọi `docker stop flashsale-mongo`; `stopAfter201` ghi số 201 tại thời điểm phát lệnh. Nếu không đạt ngưỡng trong 120 giây thì INVALID.
3. Tiếp tục phát tải trong 5 giây sau khi lệnh stop thành công, rồi ngừng phát request mới. **Chờ toàn bộ request đang chạy kết thúc trước khi khởi động MongoDB**, để kết quả bù trừ không phụ thuộc thời điểm restart. Timeout phía client là 30 giây/request.
4. Gọi `docker start flashsale-mongo`, kiểm tra health mỗi 2 giây trong tối đa 90 giây. Terminal backend có thể in nhiều dòng lỗi 500 trong lúc MongoDB ngừng hoạt động; đó là hành vi dự kiến của E4 (D-30), không được tắt log hay sửa backend để làm đẹp kết quả.
5. Đọc stats, chạy đối soát cho đúng đợt sale, sau đó `reconcile --fix` và đối soát lại. Đây là runbook SPECS §8: **phát hiện lệch → sửa Redis theo MongoDB → kiểm tra đã đồng bộ**.
6. Ghi CSV và JSON thô, rồi reset đợt sale về mode/tổng kho ban đầu. Nếu đã phát lệnh stop mà start chưa thành công, khối `finally` thử khởi động MongoDB trở lại.

Kết quả dự kiến là Redis giữ ít hàng hơn mức `totalQty - orders` và có một số buyer thừa: hệ thống bán thiếu trong sự cố; `--fix` khôi phục đồng bộ. Thời điểm sự cố cũng có thể tạo kết quả không lệch. Cả hai trường hợp được đánh giá theo bất biến bên dưới, không theo một con số drift cố định. JSON thô lưu số lượng từng mã phản hồi, cả ba đầu ra reconcile, `driftUnits`, độ trễ 5xx lớn nhất và thời gian lượt đo; có thể so độ lệch với số 5xx để phân tích kết quả thực tế.

**Nếu lượt chạy bị ngắt, chạy `docker start flashsale-mongo`**, rồi dùng `docker ps` xác nhận cả `flashsale-mongo` và `flashsale-redis` đang chạy. Nếu tự khởi động lại thất bại, không tiếp tục đo cho đến khi MongoDB khỏe trở lại.

### Verdict E4

- **INVALID (mã 2):** có 401; id không khác nhau theo số request; chưa xác nhận MongoDB đã dừng; số user khác số đơn; reconcile trước hoặc sau fix không dùng được; hoặc báo drift nhưng không đọc được số buyer thiếu/thừa. Lỗi preflight, timeout phục hồi và tham số sai cũng làm phiên INVALID.
- **FAIL (mã 1):** bán quá, số đơn vượt kho đã cấu hình, có đơn thiếu buyer Redis, `driftUnits < 0` (Redis hứa nhiều hàng hơn MongoDB có thể đáp ứng), `--fix` không thoát 0 hoặc đối soát sau fix vẫn chưa clean.
- **PASS (mã 0):** không có các lỗi trên. Drift chỉ theo hướng bán thiếu được chấp nhận khi runbook đã sửa xong; note ghi số đơn vị bán thiếu và số buyer thừa. Drift trước fix của E4 tự nó không phải FAIL. Lỗi 5xx trong lúc MongoDB ngừng hoạt động là số liệu cần ghi lại, không tự làm E4 INVALID.

Mỗi phiên kết thúc bằng `KẾT LUẬN E4: PASS|FAIL|INVALID — ...`. Nếu FAIL hoặc INVALID, giữ dòng kết luận và đường dẫn JSON thô để báo cáo, không commit CSV đó và không chạy lại để thay bằng một kết quả đẹp hơn mà không giải thích.

### Cột e4.csv

Chín cột môi trường đầu (`session`, `date`, `gitCommit`, `nodeVersion`, `os`, `cpuModel`, `cpuCount`, `totalMemGB`, `maxPoolSize`) có cùng nghĩa với các bảng CSV ở trên. Các cột tiếp theo có thứ tự cố định:

| Cột | Ý nghĩa |
|---|---|
| `stopAfter201` | Số 201 khi bắt đầu phát lệnh dừng MongoDB. |
| `s201` | Tổng số request tạo đơn thành công. |
| `s409` | Tổng số 409 SOLD_OUT và ALREADY_BOUGHT. |
| `s5xx` | Số lỗi HTTP 5xx quan sát được trong lượt. |
| `driftUnits` | `(totalQty - orders) - redisStock`, đo sau sự cố, trước fix; dương là bán thiếu, âm là hứa quá; ô trống khi không đọc được kho Redis. |
| `connErrors` | Lỗi kết nối cộng timeout phía client. |
| `ordersAfter` | Số đơn trong MongoDB sau khi tải kết thúc và MongoDB phục hồi, trước fix. |
| `redisStockAfter` | Kho Redis tại cùng snapshot trước fix. |
| `redisBuyersAfter` | Số buyer Redis tại cùng snapshot trước fix. |
| `reconcile` | Đối soát trước fix: `clean`, `drift`, hoặc `n/a` khi không dùng được. |
| `fixApplied` | `yes` khi có drift và fix thoát 0; `failed` khi có drift nhưng fix thất bại; `no` khi ban đầu không drift (CLI fix vẫn được gọi). |
| `reconcileAfterFix` | Đối soát sau fix: `clean`, `drift`, hoặc `n/a`. |
| `status` | Verdict của lượt: PASS, FAIL hoặc INVALID. |
| `note` | Lý do kết luận, gồm độ lệch bán thiếu nếu có. |

CSV E4 mặc định có đúng hai dòng: header và một lượt đo. Lượt E4 chính thức chỉ được commit khi `status = PASS` và `reconcileAfterFix = clean`; JSON thô vẫn nằm trong `results/raw/` và được git bỏ qua.

## Giới hạn

- Máy bắn tải và server chạy **chung một máy**, nên hai bên tranh CPU với nhau.
- MongoDB và Redis đi qua lớp mạng của **Docker Desktop**, chậm hơn chạy trực tiếp.
- Vì vậy số liệu chỉ dùng để **so sánh tương đối** giữa các phiên bản trên cùng một máy, không phải con số tuyệt đối của hệ thống thật.
- Chế độ test bỏ qua chi phí xác thực JWT (header `x-test-user` thay cho token), nên độ trễ đo được thấp hơn một request thật một chút, như nhau cho mọi mode.
- Khoảng cách V1–V2 có thể nhỏ, vì mỗi lần mua thành công ở V2 vẫn ghi một đơn vào MongoDB. Đó vẫn là kết quả hợp lệ. Khác biệt rõ hơn ở pha `sold_out`, nơi V2 trả 409 ngay từ Redis.
- Redis bật AOF `everysec`: khi sập có thể mất khoảng 1 giây dữ liệu. Điều này không ảnh hưởng các thí nghiệm trên, nhưng là con số cần nêu khi bàn về rủi ro.

## Kiểm tra harness

Trong `loadtest/`:

```
npm run typecheck
npm test
```

`typecheck` phải sạch và mọi test phải đạt trước khi tin kết quả một phiên đo.
