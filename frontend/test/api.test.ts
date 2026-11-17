import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { ApiError, requestJson } from "../src/services/api.ts";
import { getHome, getSale, productAttributes } from "../src/services/catalog.ts";

afterEach(() => mock.restoreAll());

describe("Client JSON chung", () => {
  it("đọc envelope qua /api và bỏ JSON header khi không có body", async () => {
    const stub = mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(url, "/api/products");
      assert.equal(init?.cache, "no-store");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Accept"), "application/json");
      assert.equal(headers.has("Content-Type"), false);
      assert.equal(init?.body, undefined);
      return Response.json({ products: [] });
    });
    assert.deepEqual(await requestJson("/products"), { products: [] });
    assert.equal(stub.mock.callCount(), 1);
  });

  it("POST không body không khai báo JSON rỗng; POST có body được encode một lần", async () => {
    const bodies: (BodyInit | null | undefined)[] = [];
    const headers: Headers[] = [];
    const stub = mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(init?.body); headers.push(new Headers(init?.headers));
      return Response.json({ ok: true });
    });
    await requestJson("/action", { method: "POST" });
    await requestJson("/action", { method: "POST", body: { qty: 1 }, headers: { Authorization: "Bearer test" } });
    assert.deepEqual(bodies, [undefined, '{"qty":1}']);
    assert.equal(headers[0].has("Content-Type"), false);
    assert.equal(headers[1].get("Content-Type"), "application/json");
    assert.equal(headers[1].get("Authorization"), "Bearer test");
    assert.equal(stub.mock.callCount(), 2);
  });

  it("giữ status/code/thông báo tiếng Việt và không tự retry lỗi nghiệp vụ", async () => {
    const stub = mock.method(globalThis, "fetch", async () => Response.json({ code: "SOLD_OUT", message: "Đã hết hàng" }, { status: 409 }));
    await assert.rejects(requestJson("/sales/one/buy", { method: "POST", body: { qty: 1 } }),
      (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "SOLD_OUT" && error.message === "Đã hết hàng");
    assert.equal(stub.mock.callCount(), 1);
  });

  it("báo response lỗi không phải JSON và response thành công bị hỏng", async () => {
    mock.method(globalThis, "fetch", async () => new Response("upstream failure", { status: 502 }));
    await assert.rejects(requestJson("/products"), (error: unknown) => error instanceof ApiError && error.status === 502 && error.code === "UNKNOWN_ERROR");
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () => new Response("not json"));
    await assert.rejects(requestJson("/products"), (error: unknown) => error instanceof ApiError && error.code === "INVALID_RESPONSE");
  });

  it("từ chối URL ngoài, backslash, whitespace/control và fragment trước fetch", async () => {
    const stub = mock.method(globalThis, "fetch", async () => Response.json({}));
    for (const path of ["https://example.invalid", "//example.invalid", "/\\example.invalid", "/products\r\n", "/products#x", "/products\u0000", "/ products"]) {
      await assert.rejects(requestJson(path), /đường dẫn nội bộ/);
    }
    assert.equal(stub.mock.callCount(), 0);
  });

  it("truyền AbortSignal và giữ nguyên việc hủy request", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Đã hủy", "AbortError");
    mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.signal, controller.signal);
      throw aborted;
    });
    controller.abort();
    await assert.rejects(requestJson("/products", { signal: controller.signal }), error => error === aborted);
  });

  it("không biến việc hủy trong lúc đọc body thành ApiError", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Đã hủy đọc", "AbortError");
    const response = Response.json({});
    mock.method(response, "json", async () => { controller.abort(); throw aborted; });
    mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(requestJson("/products", { signal: controller.signal }), error => error === aborted);
  });

  it("lỗi kết nối không tự gửi lại mutation", async () => {
    const offline = new TypeError("Không kết nối");
    const stub = mock.method(globalThis, "fetch", async () => { throw offline; });
    await assert.rejects(requestJson("/action", { method: "POST", body: { qty: 1 } }), error => error === offline);
    assert.equal(stub.mock.callCount(), 1);
  });
});

describe("Dữ liệu catalog", () => {
  it("giữ danh sách trống, không bịa sản phẩm hoặc sale", async () => {
    mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => Response.json(String(url).endsWith("/products") ? { products: [] } : { now: "2026-11-17T00:00:00Z", sales: [] }));
    assert.deepEqual(await getHome(), { now: "2026-11-17T00:00:00Z", sales: [], products: [] });
  });

  it("từ chối envelope danh sách sai thay vì hiển thị số liệu giả", async () => {
    mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => Response.json(String(url).endsWith("/products") ? { products: "bad" } : { now: "2026-11-17T00:00:00Z", sales: [] }));
    await assert.rejects(getHome(), (error: unknown) => error instanceof ApiError && error.code === "INVALID_RESPONSE");
  });

  it("saleId được encode thành một segment của đường dẫn", async () => {
    mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
      assert.equal(url, "/api/sales/id%2Fwith%3Fquery");
      return Response.json({ now: "2026-11-17T00:00:00Z", sale: null });
    });
    await getSale("id/with?query");
  });

  it("thuộc tính trình bày đúng dữ liệu API, không lấy thuộc tính từ ảnh", () => {
    assert.deepEqual(productAttributes({ sizes: ["S", "M"], waterproof: false, material: "Nylon", capacity: 12 }),
      [["Kích cỡ", "S, M"], ["Chống nước", "Không"], ["Chất liệu", "Nylon"], ["Sức chứa", "12"]]);
  });

  it("hiện object kích thước của túi tote và tên tiếng Việt cho cỡ giày/vòng eo", () => {
    assert.deepEqual(productAttributes({ dimensionsCm: { w: 38, h: 42, d: 10 }, capacityLiters: 15 }),
      [["Kích thước (cm)", "Rộng: 38; Cao: 42; Sâu: 10"], ["Dung tích (lít)", "15"]]);
    assert.deepEqual(productAttributes({ waistSizes: [28, 30], euSizes: [38, 39] }),
      [["Cỡ vòng eo", "28, 30"], ["Cỡ giày EU", "38, 39"]]);
  });
});
