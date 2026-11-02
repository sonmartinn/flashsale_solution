# Review dự án Flash Sale

Ngày review: 2/11/2026, đầu tuần 1 của lộ trình. Đã đọc toàn bộ mã nguồn (khoảng 600 dòng), cấu hình và tài liệu trong `docs/`. Đợt review này không sửa mã nguồn.

## Kết luận

Khung dự án tốt: chạy được, gọn, bám sát thiết kế và không có gì ngoài phạm vi mục 2. Phần cốt lõi của đề tài (V0, V1, V2, auth, bắn tải) chưa được viết, nên chưa thể đánh giá việc chống bán quá.

Rủi ro lớn nhất không nằm ở mã hiện có mà ở các bẫy sẽ gặp trong tuần 2–3. Năm vấn đề mức cao bên dưới đều cần xử lý trước hoặc trong lúc làm mốc M2. Vấn đề đáng lo nhất: nếu dùng mảng `requests` của autocannon theo cách tự nhiên, E1 sẽ không chứng minh được V0 bán quá, dù V0 viết đúng.

Việc gấp nhất là `git init`, vì hiện toàn bộ mã nguồn chỉ nằm trên một máy.

## Hiện trạng

| Thành phần | Tình trạng |
|---|---|
| Docker Compose (MongoDB 7, Redis 7 có AOF) | Xong, cả hai container healthy |
| 5 model và index | Xong, khớp mục 4 của đề tài |
| Seed, reset | Xong, nhưng cần sửa (vấn đề 2 và 4) |
| API đọc sản phẩm, đợt sale, health | Xong |
| Script Lua `buy.lua` | Đúng logic, nhưng chưa được nối vào API |
| Mua hàng V0, V1, V2 | Chưa làm, trả 501 |
| Auth, đơn hàng, API admin | Chưa làm, trả 501 |
| Frontend | Có trang chủ, 4 trang còn là trang tạm |
| Bắn tải (`loadtest/`) | Chưa có kịch bản |
| Git | Chưa khởi tạo |

Tiến độ đang đúng lịch vì hôm nay là ngày đầu tuần 1.

## Kết quả kiểm chứng

Các kiểm tra Lua chạy trên Redis DB 15 với khóa riêng và đã dọn sạch. Backend chạy tạm ở cổng 5099 và chỉ gọi API đọc. Dữ liệu của dự án không bị thay đổi.

| Kiểm tra | Kết quả |
|---|---|
| `defineCommand` với ioredis 6.0.0 | Chạy được |
| `buy.lua`: 1.000 lệnh song song, kho 100 | Đúng 100 thành công, 900 hết hàng, kho về 0, Set có 100 người |
| `buy.lua`: 1 người gửi 10 lệnh, kho 5 | 1 thành công, 9 lệnh trả `-1`, kho còn 4 |
| `buy.lua`: `qty = -5`, kho 10 | **Trả thành công, kho tăng lên 15** (vấn đề 1) |
| `buy.lua`: `qty = 0`, kho 10 | **Trả thành công, kho giữ nguyên, người dùng vẫn vào Set** (vấn đề 1) |
| `buy.lua`: khóa kho không tồn tại | **Trả `0`, tức "hết hàng"** (vấn đề 5) |
| `GET /api/products/:id` | Mã đúng 200, mã sai 400, không tồn tại 404 |
| `mode` sai, route không tồn tại | 400 và 404, thông báo tiếng Việt |
| JSON hỏng trong body | 400 nhưng thông báo tiếng Anh (vấn đề 14) |
| `app.listen` khi cổng đã bị chiếm | **Vẫn gọi callback, không throw** (vấn đề 6) |
| autocannon với mảng `requests` | **12 request chỉ dùng 3 user** (vấn đề 3) |
| Dữ liệu sau seed | 1.001 user, 6 sản phẩm, 1 đợt sale, 0 đơn; unique index `saleId_1_userId_1` có mặt; Redis có `stock:<saleId>` |
| Redis AOF | `appendfsync everysec` |
| `vite build`, `npm audit` cả hai phía | Build thành công, 0 lỗ hổng |

Chưa kiểm chứng:

- `npm run reset` khi đã có đơn. Đọc mã thấy đúng, nhưng chạy thử cần ghi vào dữ liệu dự án nên tôi không làm.
- Giao diện trên trình duyệt. Tôi chỉ build, không mở trang.
- Mọi kết luận về V0, V1, V2 ở mức HTTP, vì mã chưa có.

## Vấn đề mức cao

### 1. `qty` không được kiểm tra, có thể làm tăng tồn kho

`backend/src/controllers/sale.controller.js:21` truyền thẳng `req.body?.qty ?? 1` xuống service. Khi nối vào `buy.lua`, chỉ cần gửi `{"qty": -5}` là kho tăng thêm 5 và đơn vẫn thành công. V1 cũng có cùng rủi ro, vì điều kiện `$gte: -5` luôn đúng và `$inc` thành cộng thêm 5 (suy ra từ thiết kế, V1 chưa có để chạy).

Cách sửa: `ghi-chu-ky-thuat.md` đã chốt chỉ cho `qty = 1`, nên từ chối mọi giá trị khác ngay ở controller, trước khi rẽ sang V0/V1/V2.

```js
const qty = req.body?.qty ?? 1;
if (qty !== 1) throw new HttpError(400, "Mỗi người chỉ được mua 1 sản phẩm");
```

### 2. Đợt sale hết hạn ngày 9/11 và `reset` không gia hạn

`backend/scripts/seed.js:92` đặt `endAt` sau 7 ngày, nên đợt sale hiện tại hết hạn lúc 15:30 ngày 9/11, đúng ngày bắt đầu tuần 2. `resetSale` (`backend/src/services/sale.service.js:12`) chỉ khôi phục tồn kho, không đổi thời gian.

Hiện chưa gây lỗi vì chưa có API mua. Nhưng khi API mua kiểm tra thời gian theo hợp đồng trong `ghi-chu-ky-thuat.md`, mọi request sẽ nhận 400 mà không có dấu hiệu rõ ràng, kể cả ngay sau `npm run reset`. Trong khi đó `listActiveSales` (`sale.controller.js:6`) chỉ lọc theo `status`, nên trang chủ vẫn hiện "Đang flash sale". Không có cơ chế nào tự chuyển `status` sang `ended`.

Cách sửa: `resetSale` đặt lại `startAt`, `endAt` và `status: "active"`. Ngày demo cuối tháng 12 cũng cần đúng điều này.

### 3. Mảng `requests` của autocannon không phân phối user như mong đợi

Đây là rủi ro trực tiếp với mốc M2. Mỗi kết nối của autocannon duyệt mảng `requests` từ đầu, nên các kết nối gửi trùng user. Đo thực tế với 4 kết nối và 12 request: chỉ 3 user khác nhau (`u0 u0 u0 u0 u1 u1 u1 u1 u2 u2 u2 u2`).

Suy ra cho E1: 1.000 user trên 100 kết nối chỉ còn khoảng 10 user khác nhau. Unique index `(saleId, userId)` sẽ chặn phần còn lại, nên V0 không thể bán quá và thí nghiệm kết luận sai.

Cách sửa, chọn một trong hai:

- Dùng `setupRequest` với biến đếm chung. Đã đo: 12 request, đủ 12 user khác nhau. Biến đếm chỉ chung trong một tiến trình, nên không dùng tùy chọn `workers`.
- E1 chỉ cần đếm kết quả, không cần đo thông lượng, nên có thể viết bằng script Node ngắn dùng `fetch` và `Promise.all`.

```js
let next = 0;
const requests = [{
  setupRequest: (req) => ({
    ...req,
    headers: { ...req.headers, "x-test-user": users[next++ % users.length] },
  }),
}];
```

Dù dùng cách nào, script phải tự kiểm tra số `userId` khác nhau trong `orders` và so với kỳ vọng trước khi tin kết quả.

### 4. E2 chưa chạy được với dữ liệu hiện có

E2 cần kho 1.000, nhưng `SALE_QTY` cố định là 100 (`backend/scripts/seed.js:13`) và `reset` đưa kho về `totalQty`. Ngoài ra chỉ có đúng 1.000 user cho kho 1.000, nên mỗi mức đồng thời chỉ có 1.000 lượt ghi thành công. V2 có thể bán hết trong vài giây hoặc nhanh hơn, mẫu đo rất mỏng. Nếu để autocannon chạy tiếp, phần lớn request sẽ là 409 và số đo phản ánh đường từ chối, không phải đường mua.

Cách sửa:

- Cho `seed` hoặc `reset` nhận tham số số lượng kho.
- `orders.userId` không có ràng buộc khóa ngoại. Nếu `requireAuth` ở chế độ test không tra DB (xem vấn đề 8), script bắn tải có thể tự sinh ObjectId, không bị giới hạn ở 1.000 user.
- Nếu 1.000 đơn hết quá nhanh để p95 có ý nghĩa, tăng kho lên và ghi rõ thay đổi trong báo cáo.

### 5. V2 báo "hết hàng" khi Redis chưa có dữ liệu

`backend/src/lua/buy.lua:6` gộp hai trường hợp `stock == nil` và hết hàng thành `0`. Sau `docker compose down -v`, hoặc khi tạo đợt sale mà chưa nạp Redis, V2 sẽ trả 409 cho tất cả mọi người trong khi MongoDB còn nguyên hàng, và không có lỗi nào để lần theo.

Tương tự, `saleId` sai sẽ trả "hết hàng" ở V2, trong khi V0 và V1 trả 400. Điều này phá vỡ yêu cầu mã trả về thống nhất giữa ba phiên bản.

Cách sửa: thêm mã `-2` cho trường hợp chưa nạp kho, và kiểm tra đợt sale tồn tại ở tầng dùng chung trước khi rẽ nhánh.

```lua
local raw = redis.call('GET', KEYS[1])
if not raw then return -2 end                     -- chưa nạp kho
if tonumber(raw) < tonumber(ARGV[2]) then return 0 end
```

## Vấn đề mức trung bình

### 6. Server báo chạy thành công dù cổng đã bị chiếm

Express 5 chuyển lỗi `listen` vào callback thay vì throw. `backend/src/server.js:15` bỏ qua tham số này, nên khi cổng 5000 đã bận, server vẫn in "API chạy tại...". Trường hợp dễ gặp: quên tắt `npm run dev` rồi chạy `npm start` để đo tải. Tải sẽ bắn vào tiến trình cũ, có thể đang chạy mã cũ, mà không ai biết.

```js
app.listen(config.port, (err) => {
  if (err) {
    console.error(`Không mở được cổng ${config.port}:`, err.message);
    process.exit(1);
  }
  console.log(`API chạy tại http://localhost:${config.port}/api`);
});
```

### 7. Hai kho riêng biệt, trộn V1 và V2 sẽ bán gấp đôi

V0 và V1 trừ `remainingQty`, V2 trừ `stock:<saleId>`, và `?mode=` chọn theo từng request. Nếu không reset giữa hai chế độ, một đợt sale 100 chiếc có thể bán 200. Rủi ro này dễ xảy ra lúc demo. Cùng gốc đó là lỗi đã ghi trong `ghi-chu-ky-thuat.md`: `HomePage.jsx:33` hiện sai số còn lại khi chạy V2.

Đề xuất gom hai việc vào một quyết định, đồng thời giải quyết câu hỏi còn mở về `flash_sales.mode`: giữ trường này (`FlashSale.js:16`) làm chế độ của đợt sale. API `GET /sales/:id` trả thêm trường `remaining`, đọc từ Redis hoặc MongoDB tùy `sale.mode`. Giao diện dùng `remaining` và gọi mua theo `sale.mode`. Script tải vẫn dùng `?mode=`, nhưng luôn reset trước mỗi lần chạy.

### 8. Cách đọc thông tin đợt sale ảnh hưởng đến độ công bằng của E2

Cả ba phiên bản đều cần `salePrice`, `productId`, `startAt`, `endAt` để kiểm tra và tạo đơn. Nếu V2 gọi `FlashSale.findById` mỗi request, nó mất phần lớn lợi thế và mọi request vẫn chạm MongoDB. Nếu chỉ V2 được cache thì so sánh không công bằng.

Đề xuất: cache phần dữ liệu tĩnh này trong bộ nhớ Node, dùng chung cho cả ba phiên bản, xóa cache khi reset. `remainingQty` không được cache, V0 phải đọc giá trị mới nhất. Ghi lại lựa chọn này trong Chương 3.

Tương tự, `requireAuth` không nên tra DB mỗi request, kể cả với JWT thật. Xóa `console.log` khỏi đường mua khi đo.

### 9. Bù trừ của V2 có giới hạn cần ghi rõ

- Hai lệnh hoàn kho `INCRBY` và `SREM` nên gộp trong `multi()`, như `resetSale` đang làm.
- Bù trừ chỉ chạy khi tiến trình Node còn sống. Nếu Node chết giữa bước Lua và bước ghi đơn, kho Redis bị mất một đơn vị. Lỗi này gây bán thiếu, không gây bán quá, và chỉ script đối chiếu mới sửa được.
- Script đối chiếu có trong mục 11 và lộ trình tuần 5, nhưng chưa có trong `tien-do.md`. Điều cần kiểm tra: `stock = totalQty - số đơn` và `buyers` trùng với tập `userId` trong `orders`.
- Với E4: khi MongoDB bị ngắt, thao tác ghi đơn phải chờ timeout trước khi bù trừ chạy (`serverSelectionTimeoutMS: 5000` ở `backend/src/config/db.js:5`). Theo cấu hình, độ trễ này ở mức vài giây, chưa đo thực tế. Trong lúc đó kho Redis đang bị giữ.

V1 có điểm tương tự: request trùng vẫn trừ kho rồi mới hoàn lại khi gặp `E11000`, nên trong khoảnh khắc đó người khác có thể nhận "hết hàng" dù chiếc cuối cùng sẽ được trả về. Đây là đánh đổi có thể nêu trong phần bàn luận, không cần sửa.

### 10. MongoDB và Redis mở trên mọi giao diện mạng, không có mật khẩu

`docker-compose.yml:7` và `:22` publish cổng trên `0.0.0.0`. Khi dùng wifi trường, máy khác trong mạng có thể truy cập được, tùy cấu hình tường lửa Windows. Sửa bằng cách chỉ mở cho máy cục bộ:

```yaml
- "127.0.0.1:27018:27017"
- "127.0.0.1:6379:6379"
```

### 11. Kết quả đo không lên git trong khi người vẽ biểu đồ cần chúng

`.gitignore:8` bỏ qua toàn bộ `loadtest/results/`, trong khi phân công giao Người A đo và Người B vẽ biểu đồ. Ngoài ra đề tài mục 5 ghi `results/` chứa cả biểu đồ, còn `loadtest/README.md` ghi biểu đồ để ở `docs/`. Nếu máy đo gặp sự cố, số liệu của Chương 3 mất theo.

Đề xuất: file thô vẫn bỏ qua, nhưng commit một file CSV tổng hợp cho mỗi thí nghiệm, ghi kèm ngày đo, cấu hình và kích thước pool.

### 12. Cú pháp `NODE_ENV=test` không chạy trên PowerShell

Chế độ `x-test-user` phụ thuộc `NODE_ENV=test`, nhưng nhóm dùng Windows và chưa có script nào đặt biến này. Đề xuất thêm script `start:test` trong `backend/package.json`, đọc từ một file env riêng, ví dụ `node --env-file=.env.test src/server.js`, thay vì đặt tay mỗi lần. Như vậy cũng tránh được việc quên bật hoặc lỡ bật ngoài chế độ test.

### 13. README ghi sai phiên bản Node, kích thước pool chưa được khai báo

- `README.md:9` ghi "Node.js 20 trở lên", nhưng `engines` của gói đã cài yêu cầu cao hơn: mongoose và mongodb cần `>=20.19.0`, vite cần `^20.19.0 || >=22.12.0`. Nên sửa README và thêm `engines` vào `package.json`, vì yêu cầu môn học đòi ghi rõ phiên bản.
- `maxPoolSize` đang dùng mặc định 100. Ở mức 300 và 500 kết nối của E2, request V1 sẽ xếp hàng ngay trong Node. Nên đặt tường minh trong `backend/src/config/db.js` để báo cáo nêu được con số, đúng như `ghi-chu-ky-thuat.md` yêu cầu.

## Vấn đề mức thấp

- **14.** `backend/src/middlewares/error.js:26` trả nguyên thông báo tiếng Anh khi JSON hỏng, trái quy ước. Xử lý `err.type === "entity.parse.failed"` riêng.
- **15.** `backend/src/services/purchase.service.js:3` ghi "đọc tồn kho rồi ghi lại", chưa khớp quyết định ngày 2/11 là V0 dùng `findOne` rồi `$inc`.

## Lưu ý khi làm auth (tuần 1)

- `error.js` chưa xử lý `ValidationError` và lỗi `E11000`, nên đăng ký trùng email hiện sẽ thành 500. Cần trả 409 và 400.
- Không đặt giá trị mặc định cho `JWT_SECRET` trong `config/index.js`. Thiếu biến này thì server phải báo lỗi và thoát, giống cách đang xử lý khi thiếu CSDL.
- Điều kiện nhận `x-test-user` phải nằm ở một chỗ duy nhất và so sánh chính xác `NODE_ENV === "test"`.

## Lưu ý về thí nghiệm

- **Khoảng cách giữa V1 và V2 có thể nhỏ hơn kỳ vọng.** Mỗi đơn thành công ở V2 vẫn ghi một lần vào MongoDB, và Node chỉ có một luồng xử lý chính. V2 chủ yếu tiết kiệm bước trừ kho và đường từ chối. Nên đo riêng giai đoạn còn hàng và giai đoạn hết hàng. Nếu chênh lệch nhỏ, đó vẫn là kết quả hợp lệ để bàn luận, không phải thí nghiệm thất bại.
- **Phân biệt 409 với lỗi thật.** autocannon gộp mọi phản hồi khác 2xx vào `non2xx`. "Tỷ lệ lỗi" của E2 chỉ nên tính 5xx và lỗi kết nối, và phải đếm riêng 201 với 409.
- **Bắn tải và server chạy chung một máy** nên tranh CPU, MongoDB và Redis còn đi qua lớp mạng của Docker Desktop. Cần nêu trong phần giới hạn của báo cáo.
- **AOF đang ở `everysec`,** nên Redis có thể mất khoảng 1 giây dữ liệu khi sập. Đây là con số cụ thể cho câu hỏi nghiên cứu thứ ba.

## Quyết định đề xuất

| Câu hỏi còn mở | Đề xuất |
|---|---|
| Có giữ `flash_sales.mode` không? | Giữ, làm chế độ của đợt sale cho giao diện và trang hiển thị (vấn đề 7) |
| `stock_movements` ghi ở đâu? | Ngoài đường đo: chỉ ghi khi bù trừ và reset. Đơn thành công đã có trong `orders`, và cách này giữ E2 công bằng |
| E1 dùng công cụ gì? | Script Node riêng, vì E1 cần độ chính xác về user hơn là thông lượng. E2 mới dùng autocannon |

## Những điểm làm tốt

- Bộ tài liệu rõ ràng, có nhật ký quyết định, cạm bẫy và thứ tự cắt bỏ. Đây là điểm mạnh nhất của dự án.
- Schema khớp thiết kế. `remainingQty` không có `min`, đúng ý đồ để V0 có thể âm.
- Unique index, `buyHandlers`, `BUY_MODES` và `redisKeys` đều đặt ở một chỗ, nên việc thêm V0/V1/V2 không cần đổi cấu trúc.
- Xử lý lỗi gọn, tận dụng đúng việc Express 5 tự bắt lỗi async.
- Server báo lỗi và thoát khi thiếu CSDL, `.env` không lên git, cổng 27018 được giải thích ở cả README và tài liệu.

## Thứ tự xử lý đề xuất

**Tuần 1**

1. `git init` và commit đầu tiên.
2. Sửa nhanh: vấn đề 6, 10, 13, 14, 15 (mỗi việc vài dòng).
3. Vấn đề 2: `resetSale` gia hạn đợt sale.
4. Làm auth theo lưu ý ở trên, thêm script `start:test` (vấn đề 12).

**Tuần 2, trước khi đo**

5. Vấn đề 1: kiểm tra `qty` ngay khi nối controller.
6. Vấn đề 8: chốt cách đọc thông tin đợt sale trước khi viết V0, để không phải viết lại.
7. Vấn đề 3: viết script E1 có kiểm tra số user khác nhau.
8. Vấn đề 11: thống nhất cách lưu kết quả đo trước lần đo đầu tiên.

**Tuần 3 trở đi**

9. Vấn đề 5: sửa `buy.lua` khi nối V2.
10. Vấn đề 7 và 9: `remaining`, bù trừ bằng `multi()`, script đối chiếu.
11. Vấn đề 4: dữ liệu cho E2 trước tuần 4.
