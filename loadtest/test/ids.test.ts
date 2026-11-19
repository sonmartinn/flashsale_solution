// Test đơn vị cho bộ sinh id người dùng thử nghiệm (D-08).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countDistinct, createIdFactory, isTestUserId } from "../lib/ids.js";

describe("ids.test", () => {
  it("mọi id gồm đúng 24 ký tự hex thường", () => {
    const factory = createIdFactory();
    const next = factory.stream();
    const ids = [...factory.nextBlock(50), next(), next()];
    for (const id of ids) {
      assert.match(id, /^[0-9a-f]{24}$/);
      assert.equal(isTestUserId(id), true);
    }
  });

  it("10.000 id trong một khối đều khác nhau", () => {
    const ids = createIdFactory().nextBlock(10_000);
    assert.equal(ids.length, 10_000);
    assert.equal(countDistinct(ids), 10_000);
  });

  it("hai khối dùng chung tiền tố nhưng không bao giờ trùng id", () => {
    const factory = createIdFactory();
    const a = factory.nextBlock(1000);
    const b = factory.nextBlock(1000);
    const next = factory.stream();
    const c = Array.from({ length: 1000 }, () => next());
    for (const id of [...a, ...b, ...c]) assert.ok(id.startsWith(factory.prefix));
    assert.equal(countDistinct([...a, ...b, ...c]), 3000);
  });

  it("dùng tiền tố truyền vào", () => {
    const factory = createIdFactory("0123456789");
    assert.equal(factory.prefix, "0123456789");
    assert.deepEqual(factory.nextBlock(2), ["01234567890000" + "0000000000", "01234567890000" + "0000000001"]);
    assert.equal(factory.nextBlock(1)[0], "0123456789000100000000" + "00");
  });

  for (const bad of ["", "abc", "0123456789a", "ABCDEF0123", "xyz0123456"]) {
    it(`từ chối tiền tố "${bad}"`, () => {
      assert.throws(() => createIdFactory(bad), /Tiền tố id/);
    });
  }

  it("ném lỗi khi đã dùng hết khối ffff", () => {
    const factory = createIdFactory("aaaaaaaaaa");
    for (let i = 0; i <= 0xffff; i++) factory.nextBlock(0);
    assert.throws(() => factory.nextBlock(1), /hết 65536 khối/);
    assert.throws(() => factory.stream(), /hết 65536 khối/);
  });

  it("countDistinct đếm số id khác nhau", () => {
    assert.equal(countDistinct(["a", "a", "b"]), 2);
    assert.equal(countDistinct([]), 0);
  });

  it("isTestUserId từ chối id sai định dạng", () => {
    assert.equal(isTestUserId("0".repeat(23)), false);
    assert.equal(isTestUserId("A".repeat(24)), false);
    assert.equal(isTestUserId("g".repeat(24)), false);
  });
});
