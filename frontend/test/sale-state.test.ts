import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buyUnavailable, classifyPurchaseError, createSingleFlight, PURCHASE_COPY, remainingSeconds, resolvePurchase, saleEpoch, serverTime,
  stockLabel, synchronizeClock, type PurchaseKind, type PurchaseRecord,
} from "../src/services/sale-state.ts";
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

const reply = (status: number, code: string, message = "Thông báo của API") => ({ status, code, message });

it("mỗi mã nghiệp vụ có trạng thái và câu chữ riêng, không gộp thành lỗi máy chủ", () => {
  const cases: [unknown, PurchaseKind][] = [
    [reply(409, "SOLD_OUT"), "sold-out"],
    [reply(409, "ALREADY_BOUGHT"), "already-bought"],
    [reply(400, "SALE_NOT_ACTIVE"), "not-active"],
    [reply(503, "STOCK_NOT_LOADED"), "stock-not-loaded"],
    [reply(404, "NOT_FOUND"), "not-found"],
    [reply(401, "UNAUTHORIZED"), "unauthorized"],
    [reply(400, "INVALID_MODE", "Chế độ mua phải là v0, v1 hoặc v2"), "rejected"],
  ];
  const messages = new Set<string>();
  for (const [error, kind] of cases) {
    const outcome = classifyPurchaseError(error);
    assert.equal(outcome.kind, kind);
    assert.ok(outcome.message.length > 0);
    messages.add(outcome.message);
  }
  assert.equal(messages.size, cases.length, "Mỗi kết quả phải có câu riêng");
  assert.equal(classifyPurchaseError(reply(409, "SOLD_OUT")).message, PURCHASE_COPY.soldOut);
  assert.equal(classifyPurchaseError(reply(503, "STOCK_NOT_LOADED")).message, "Kho chưa sẵn sàng.");
  assert.notEqual(classifyPurchaseError(reply(409, "SOLD_OUT")).message, PURCHASE_COPY.uncertain);
});

it("500, 502 không JSON, 503 khác, lỗi mạng và 201 hỏng đều là kết quả chưa rõ", () => {
  for (const error of [reply(500, "INTERNAL_ERROR"), reply(502, "UNKNOWN_ERROR"), reply(503, "UNKNOWN_ERROR"),
    new TypeError("Failed to fetch"), reply(201, "INVALID_RESPONSE"), undefined]) {
    assert.deepEqual(classifyPurchaseError(error), { kind: "uncertain", message: PURCHASE_COPY.uncertain });
  }
});

it("tồn âm V0 hiện nguyên số và kho chưa nạp thắng số dương suy ra", () => {
  assert.deepEqual(stockLabel({ remaining: -3, stockLoaded: true }), { text: "Tồn kho âm: -3 sản phẩm (đã bán vượt)", negative: true });
  assert.deepEqual(stockLabel({ remaining: 0, stockLoaded: true }), { text: "Còn 0 sản phẩm", negative: false });
  assert.deepEqual(stockLabel({ remaining: 42, stockLoaded: false }), { text: "Kho chưa sẵn sàng", negative: false });
});

it("đang kiểm tra đơn chỉ khóa khi sale thực sự mua được", () => {
  const now = Date.parse(startAt);
  assert.equal(buyUnavailable(sale, now, { checking: true }), PURCHASE_COPY.checking);
  assert.match(buyUnavailable({ ...sale, remaining: 0 }, now, { checking: true }), /hết hàng/);
});

describe("Trạng thái đã mua theo phiên và lượt sale", () => {
  const epoch = saleEpoch(sale);
  const current = { generation: 3, epoch };
  const record = (fields: Partial<PurchaseRecord>): PurchaseRecord =>
    ({ generation: 3, epoch, seq: 5, kind: "uncertain", message: PURCHASE_COPY.uncertain, ...fields });

  it("reset đổi startAt hoặc mode tạo lượt mới; đơn của lượt cũ không còn khóa mua", () => {
    const reset = { ...sale, startAt: "2026-11-25T00:00:00.000Z" };
    assert.notEqual(saleEpoch(reset), epoch);
    assert.notEqual(saleEpoch({ ...sale, mode: "v1" }), epoch);
    const next = { generation: 3, epoch: saleEpoch(reset) };
    const stale = resolvePurchase(next, record({ kind: "success", orderId: "o1", message: "x" }), { generation: 3, epoch, seq: 1, orderId: "o1" });
    assert.deepEqual(stale, { bought: false, locked: false, message: "" });
    assert.equal(resolvePurchase(next, undefined, { generation: 3, epoch: next.epoch, seq: 9 }).bought, false);
  });

  it("phiên khác không thấy kết quả mua hay đơn của phiên trước", () => {
    const view = resolvePurchase({ generation: 4, epoch }, record({ kind: "success", orderId: "o1" }), { generation: 3, epoch, seq: 6, orderId: "o1" });
    assert.deepEqual(view, { bought: false, locked: false, message: "" });
  });

  it("đọc đơn hiện tại khôi phục trạng thái đã mua sau reload mà không lưu cờ", () => {
    const view = resolvePurchase(current, undefined, { generation: 3, epoch, seq: 1, orderId: "o9" });
    assert.equal(view.bought, true);
    assert.equal(view.message, PURCHASE_COPY.alreadyBought);
  });

  it("kết quả chưa rõ khóa mua tới khi một lần đọc đơn bắt đầu sau lỗi trả lời", () => {
    const uncertain = record({});
    assert.equal(resolvePurchase(current, uncertain).locked, true);
    // Lần đọc bắt đầu TRƯỚC lỗi không được dùng để mở khóa.
    assert.equal(resolvePurchase(current, uncertain, { generation: 3, epoch, seq: 4 }).locked, true);
    const cleared = resolvePurchase(current, uncertain, { generation: 3, epoch, seq: 6 });
    assert.deepEqual({ locked: cleared.locked, bought: cleared.bought, kind: cleared.kind }, { locked: false, bought: false, kind: "cleared" });
    const confirmed = resolvePurchase(current, uncertain, { generation: 3, epoch, seq: 6, orderId: "o7" });
    assert.deepEqual({ bought: confirmed.bought, message: confirmed.message }, { bought: true, message: PURCHASE_COPY.confirmed("o7") });
  });

  it("ALREADY_BOUGHT khóa mua; hết hàng hay chưa mở chỉ báo kết quả", () => {
    assert.equal(resolvePurchase(current, record({ kind: "already-bought", message: PURCHASE_COPY.alreadyBought })).bought, true);
    const soldOut = resolvePurchase(current, record({ kind: "sold-out", message: PURCHASE_COPY.soldOut }));
    assert.deepEqual(soldOut, { bought: false, locked: false, kind: "sold-out", message: PURCHASE_COPY.soldOut });
  });
});
