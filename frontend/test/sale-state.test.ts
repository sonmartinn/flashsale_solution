import assert from "node:assert/strict";
import { it } from "node:test";
import { buyUnavailable, createSingleFlight, remainingSeconds, serverTime, synchronizeClock } from "../src/services/sale-state.ts";
import type { SaleDto } from "../src/services/types.ts";

const startAt = "2026-11-18T00:00:00.000Z";
const endAt = "2026-11-18T00:00:10.500Z";
const sale: SaleDto = {
  id: "sale",
  productId: "product",
  product: { id: "product", name: "Áo", slug: "ao", category: "Áo", images: [], price: 150 },
  salePrice: 100,
  totalQty: 100,
  perUserLimit: 1,
  startAt,
  endAt,
  status: "active",
  mode: "v2",
  remaining: 1,
  stockLoaded: true,
};

it("đếm theo giờ server, khóa đúng endAt và dừng tại không", () => {
  const clock = synchronizeClock(startAt, 150);
  assert.equal(serverTime(clock, 100), Date.parse(startAt));
  assert.equal(remainingSeconds(endAt, serverTime(clock, 150)), 11);
  assert.equal(remainingSeconds(endAt, serverTime(clock, 10_649)), 1);
  assert.equal(buyUnavailable(sale, serverTime(clock, 10_649)), "");
  assert.match(buyUnavailable(sale, serverTime(clock, 10_650)), /kết thúc/);
  assert.equal(remainingSeconds(endAt, serverTime(clock, 20_000)), 0);
  const resynced = synchronizeClock("2026-11-18T00:00:05.500Z", 3_000);
  assert.equal(remainingSeconds(endAt, serverTime(resynced, 4_000)), 4);
});

it("khóa mua theo thời điểm, kho và trạng thái phiên hiện tại", () => {
  const now = Date.parse(startAt);
  assert.equal(buyUnavailable(sale, now), "");
  assert.match(buyUnavailable(sale, now - 1), /chưa mở/);
  assert.match(buyUnavailable({ ...sale, status: "ended" }, now), /kết thúc/);
  assert.match(buyUnavailable({ ...sale, stockLoaded: false, remaining: 1 }, now), /chưa sẵn sàng/);
  assert.match(buyUnavailable({ ...sale, remaining: -1 }, now), /hết hàng/);
  assert.match(buyUnavailable(sale, now, { stale: true }), /đọc lại/);
  assert.match(buyUnavailable(sale, now, { pending: true }), /Đang gửi/);
  assert.match(buyUnavailable(sale, now, { purchased: true }), /đã mua/);
});

it("hai lần gọi cùng lượt chỉ chạy một lần và lỗi giải phóng khóa", async () => {
  const latch = createSingleFlight();
  let fail!: (error: Error) => void;
  let calls = 0;
  const submit = () => {
    calls++;
    return new Promise<void>((_resolve, reject) => { fail = reject; });
  };
  const first = latch.run(submit);
  assert.equal(await latch.run(submit), undefined);
  assert.equal(calls, 1);
  fail(new Error("Mất kết nối"));
  await assert.rejects(first, /Mất kết nối/);
  assert.equal(await latch.run(async () => "đã mở lại"), "đã mở lại");
});
