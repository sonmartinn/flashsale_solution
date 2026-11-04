// Test đơn vị cho kiểm tra đầu vào đăng ký / đăng nhập (D-10): chỉ nhận chuỗi, cắt khoảng trắng,
// email chữ thường, mật khẩu đo theo byte UTF-8 (giới hạn 72 byte của bcrypt), bỏ qua role.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLoginInput, parseRegisterInput } from "../src/utils/validate.js";
import { HttpError } from "../src/utils/http-error.js";

function isValidationError(err: unknown): boolean {
  return err instanceof HttpError && err.status === 400 && err.code === "VALIDATION_ERROR";
}

const VALID = { name: "Lan", email: "lan@example.com", password: "matkhau1" };

describe("validate.test", () => {
  describe("parseRegisterInput", () => {
    it("cắt khoảng trắng, email chữ thường, bỏ qua role và các khóa lạ", () => {
      const out = parseRegisterInput({
        name: "  Lan  ",
        email: " Lan@Example.COM ",
        password: "matkhau1",
        role: "admin",
        passwordHash: "x",
      });
      assert.deepEqual(out, { name: "Lan", email: "lan@example.com", password: "matkhau1" });
      assert.deepEqual(Object.keys(out).sort(), ["email", "name", "password"]);
    });

    const badBodies: Array<[string, unknown]> = [
      ["undefined", undefined],
      ["null", null],
      ["mảng rỗng", []],
      ["object rỗng", {}],
      ["chuỗi JSON", "abc"],
      ["số", 42],
      ["name là object toán tử", { ...VALID, name: { $ne: null } }],
      ["email là số", { ...VALID, email: 123 }],
      ["password là mảng", { ...VALID, password: ["x"] }],
      ["name toàn khoảng trắng", { ...VALID, name: "   " }],
      ["name 101 ký tự", { ...VALID, name: "a".repeat(101) }],
      ["email sai định dạng", { ...VALID, email: "abc" }],
      ["email rỗng", { ...VALID, email: "   " }],
      ["password 5 ký tự", { ...VALID, password: "12345" }],
      ["password 40 chữ ư (80 byte)", { ...VALID, password: "ư".repeat(40) }],
      ["password 73 byte", { ...VALID, password: "a".repeat(73) }],
    ];
    for (const [label, body] of badBodies) {
      it(`từ chối ${label} với 400 VALIDATION_ERROR`, () => {
        assert.throws(() => parseRegisterInput(body), isValidationError);
      });
    }

    it("nhận name đúng 100 ký tự sau khi cắt", () => {
      const out = parseRegisterInput({ ...VALID, name: ` ${"b".repeat(100)} ` });
      assert.equal(out.name.length, 100);
    });

    it('nhận password "a" x 72 (đúng 72 byte) và không cắt khoảng trắng của password', () => {
      assert.equal(parseRegisterInput({ ...VALID, password: "a".repeat(72) }).password, "a".repeat(72));
      assert.equal(parseRegisterInput({ ...VALID, password: " abcdef " }).password, " abcdef ");
    });

    it('nhận password "ư" x 36 (72 byte)', () => {
      assert.equal(parseRegisterInput({ ...VALID, password: "ư".repeat(36) }).password, "ư".repeat(36));
    });
  });

  describe("parseLoginInput", () => {
    it("cắt và hạ chữ thường email, giữ nguyên password, bỏ khóa lạ", () => {
      const out = parseLoginInput({ email: "  LAN@example.com ", password: "matkhau1", role: "admin" });
      assert.deepEqual(out, { email: "lan@example.com", password: "matkhau1" });
    });

    const badBodies: Array<[string, unknown]> = [
      ["undefined", undefined],
      ["null", null],
      ["mảng", [{ email: "a@b.c", password: "x" }]],
      ["object rỗng", {}],
      ["email là object toán tử", { email: { $ne: null }, password: "matkhau1" }],
      ["password là object toán tử", { email: "lan@example.com", password: { $gt: "" } }],
      ["password là số", { email: "lan@example.com", password: 123456 }],
    ];
    for (const [label, body] of badBodies) {
      it(`từ chối ${label} với 400 VALIDATION_ERROR`, () => {
        assert.throws(() => parseLoginInput(body), isValidationError);
      });
    }
  });
});
