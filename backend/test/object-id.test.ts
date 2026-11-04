// Test đơn vị cho normalizeObjectId: chỉ nhận chuỗi đúng 24 ký tự hex, trả về dạng chữ thường.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeObjectId } from "../src/utils/object-id.js";

describe("object-id.test", () => {
  it("chuẩn hóa chuỗi 24 hex về chữ thường", () => {
    assert.equal(normalizeObjectId("64AB64AB64AB64AB64AB64AB"), "64ab64ab64ab64ab64ab64ab");
  });

  it("giữ nguyên chuỗi 24 hex đã là chữ thường", () => {
    assert.equal(normalizeObjectId("0123456789abcdef01234567"), "0123456789abcdef01234567");
  });

  it("từ chối chuỗi 23 hoặc 25 ký tự", () => {
    assert.equal(normalizeObjectId("64ab64ab64ab64ab64ab64a"), null);
    assert.equal(normalizeObjectId("64ab64ab64ab64ab64ab64abc"), null);
  });

  it("từ chối ký tự không phải hex", () => {
    assert.equal(normalizeObjectId("64ab64ab64ab64ab64ab64ag"), null);
    assert.equal(normalizeObjectId(" 64ab64ab64ab64ab64ab64ab"), null);
  });

  it("từ chối header trùng bị nối thành \"a, b\"", () => {
    assert.equal(normalizeObjectId("64ab64ab64ab64ab64ab64ab, 64ab64ab64ab64ab64ab64ab"), null);
    assert.equal(normalizeObjectId("a, b"), null);
  });

  it("từ chối giá trị không phải chuỗi", () => {
    assert.equal(normalizeObjectId(123), null);
    assert.equal(normalizeObjectId({ $ne: null }), null);
    assert.equal(normalizeObjectId(["64ab64ab64ab64ab64ab64ab"]), null);
    assert.equal(normalizeObjectId(undefined), null);
    assert.equal(normalizeObjectId(null), null);
  });
});
