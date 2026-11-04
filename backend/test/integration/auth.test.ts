// Test tích hợp đăng ký / đăng nhập qua HTTP thật (createApp) với MongoDB thật.
// Cần "docker compose up -d --wait" (MongoDB 127.0.0.1:27018, Redis 127.0.0.1:6379).
// Database riêng flashsale_test_auth_<pid>, Redis db 4; tự xóa trong after().
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Redis } from "ioredis";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, ensureIndexes } from "../../src/models/index.js";
import {
  TEST_JWT_SECRET,
  connectTestStores,
  dropTestDatabaseAndDisconnect,
  startApp,
  type StartedApp,
} from "../helpers.js";

interface AuthBody {
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

interface ErrorBody {
  message: string;
  code: string;
}

let app: StartedApp;
let redis: Redis;

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${app.baseUrl}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postRaw(path: string, body: string | undefined, contentType?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (contentType !== undefined) headers["content-type"] = contentType;
  return fetch(`${app.baseUrl}/api/auth/${path}`, { method: "POST", headers, body });
}

function decode(token: string): jwt.Jwt {
  return jwt.verify(token, TEST_JWT_SECRET, { algorithms: ["HS256"], complete: true });
}

const LAN = { name: "Lan", email: "lan@example.com", password: "matkhau1" };

describe("auth.test", () => {
  before(async () => {
    ({ redis } = await connectTestStores("auth", 4));
    await ensureIndexes();
    app = await startApp({ jwtSecret: TEST_JWT_SECRET });
  });

  after(async () => {
    await app.close();
    await dropTestDatabaseAndDisconnect(redis);
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe("register", () => {
    it("201 { token, user }, role luôn là user dù client gửi admin, không lộ passwordHash", async () => {
      const res = await post("register", { ...LAN, name: "  Lan  ", email: " Lan@Example.COM ", role: "admin" });
      assert.equal(res.status, 201);
      const raw = await res.text();
      assert.ok(!raw.includes("passwordHash"), "phản hồi không được chứa passwordHash");
      const body = JSON.parse(raw) as AuthBody;
      assert.deepEqual(Object.keys(body).sort(), ["token", "user"]);
      assert.deepEqual(Object.keys(body.user).sort(), ["email", "id", "name", "role"]);
      assert.match(body.user.id, /^[0-9a-f]{24}$/);
      assert.equal(body.user.name, "Lan");
      assert.equal(body.user.email, "lan@example.com");
      assert.equal(body.user.role, "user");

      const stored = await User.findById(body.user.id).lean();
      assert.ok(stored);
      assert.equal(stored.role, "user");
      assert.ok(stored.passwordHash.startsWith("$2"), "passwordHash phải là bcrypt");
    });

    it("token HS256 hạn 7 ngày, payload sub = user.id và role", async () => {
      const res = await post("register", LAN);
      const body = (await res.json()) as AuthBody;
      const decoded = decode(body.token);
      assert.equal(decoded.header.alg, "HS256");
      const payload = decoded.payload as jwt.JwtPayload;
      assert.equal(payload.sub, body.user.id);
      assert.equal(payload["role"], "user");
      assert.equal((payload.exp ?? 0) - (payload.iat ?? 0), 604800);
    });

    it("email trùng (kể cả khác hoa thường và khoảng trắng) trả 409 EMAIL_TAKEN", async () => {
      assert.equal((await post("register", LAN)).status, 201);
      for (const email of [LAN.email, " LAN@example.com "]) {
        const res = await post("register", { ...LAN, email });
        assert.equal(res.status, 409);
        assert.deepEqual(await res.json(), { message: "Email đã được sử dụng", code: "EMAIL_TAKEN" });
      }
      assert.equal(await User.countDocuments({}), 1);
    });

    it("hai đăng ký đồng thời cùng email mới: đúng một 201, một 409 và một user", async () => {
      const [a, b] = await Promise.all([post("register", LAN), post("register", LAN)]);
      const statuses = [a.status, b.status].sort();
      assert.deepEqual(statuses, [201, 409]);
      const loser = a.status === 409 ? a : b;
      assert.equal(((await loser.json()) as ErrorBody).code, "EMAIL_TAKEN");
      assert.equal(await User.countDocuments({ email: LAN.email }), 1);
    });

    it("body thiếu, rỗng, mảng, primitive hay trường không phải chuỗi đều trả 400, không bao giờ 500", async () => {
      const cases: Array<[string | undefined, string | undefined, string]> = [
        [undefined, undefined, "VALIDATION_ERROR"],
        ["{}", "application/json", "VALIDATION_ERROR"],
        ["[]", "application/json", "VALIDATION_ERROR"],
        ['"abc"', "application/json", "INVALID_JSON"],
        ["{khong-phai-json", "application/json", "INVALID_JSON"],
        [JSON.stringify({ ...LAN, name: { $ne: null } }), "application/json", "VALIDATION_ERROR"],
        [JSON.stringify({ ...LAN, email: 123 }), "application/json", "VALIDATION_ERROR"],
        [JSON.stringify({ ...LAN, password: "   " }), "application/json", "VALIDATION_ERROR"],
        [JSON.stringify({ ...LAN, password: "ư".repeat(40) }), "application/json", "VALIDATION_ERROR"],
      ];
      for (const [body, ct, code] of cases) {
        const res = await postRaw("register", body, ct);
        assert.equal(res.status, 400, `body ${String(body)} phải trả 400`);
        assert.equal(((await res.json()) as ErrorBody).code, code, `body ${String(body)}`);
      }
      assert.equal(await User.countDocuments({}), 0);
    });
  });

  describe("login", () => {
    it("200 cùng dạng { token, user }, email khác hoa thường vẫn đăng nhập được", async () => {
      const reg = (await (await post("register", LAN)).json()) as AuthBody;
      const res = await post("login", { email: "  LAN@Example.com", password: LAN.password });
      assert.equal(res.status, 200);
      const body = (await res.json()) as AuthBody;
      assert.deepEqual(Object.keys(body).sort(), ["token", "user"]);
      assert.deepEqual(body.user, reg.user);
      const payload = decode(body.token).payload as jwt.JwtPayload;
      assert.equal(payload.sub, reg.user.id);
      assert.equal(payload["role"], "user");
      assert.equal((payload.exp ?? 0) - (payload.iat ?? 0), 604800);
    });

    it("sai mật khẩu và email không tồn tại trả cùng một body 401 INVALID_CREDENTIALS", async () => {
      await post("register", LAN);
      const wrongPass = await post("login", { email: LAN.email, password: "saimatkhau" });
      const unknown = await post("login", { email: "khongco@example.com", password: LAN.password });
      assert.equal(wrongPass.status, 401);
      assert.equal(unknown.status, 401);
      const expected = { message: "Email hoặc mật khẩu không đúng", code: "INVALID_CREDENTIALS" };
      assert.deepEqual(await wrongPass.json(), expected);
      assert.deepEqual(await unknown.json(), expected);
    });

    it("email là object toán tử { $ne: null } trả 400", async () => {
      await post("register", LAN);
      const res = await post("login", { email: { $ne: null }, password: LAN.password });
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as ErrorBody).code, "VALIDATION_ERROR");
    });

    it("mật khẩu quá 72 byte bị từ chối 401, không bị bcrypt cắt bớt rồi khớp", async () => {
      const pw = "a".repeat(72);
      assert.equal((await post("register", { ...LAN, password: pw })).status, 201);
      assert.equal((await post("login", { email: LAN.email, password: pw })).status, 200);
      const res = await post("login", { email: LAN.email, password: `${pw}b` });
      assert.equal(res.status, 401);
      assert.equal(((await res.json()) as ErrorBody).code, "INVALID_CREDENTIALS");
    });

    it("mật khẩu rỗng trả 401 INVALID_CREDENTIALS", async () => {
      await post("register", LAN);
      const res = await post("login", { email: LAN.email, password: "" });
      assert.equal(res.status, 401);
      assert.equal(((await res.json()) as ErrorBody).code, "INVALID_CREDENTIALS");
    });

    it("5 lần đăng nhập đồng thời cùng tài khoản đều 200 với token hợp lệ", async () => {
      const reg = (await (await post("register", LAN)).json()) as AuthBody;
      const results = await Promise.all(
        Array.from({ length: 5 }, () => post("login", { email: LAN.email, password: LAN.password })),
      );
      for (const res of results) {
        assert.equal(res.status, 200);
        const body = (await res.json()) as AuthBody;
        assert.equal((decode(body.token).payload as jwt.JwtPayload).sub, reg.user.id);
      }
    });

    it("admin chèn trực tiếp đăng nhập được và token mang role admin", async () => {
      const passwordHash = await bcrypt.hash("admin123", 10);
      const admin = await User.create({ name: "Quản trị", email: "admin@example.com", passwordHash, role: "admin" });
      const res = await post("login", { email: "admin@example.com", password: "admin123" });
      assert.equal(res.status, 200);
      const body = (await res.json()) as AuthBody;
      assert.equal(body.user.role, "admin");
      assert.equal(body.user.id, admin._id.toString());
      const payload = decode(body.token).payload as jwt.JwtPayload;
      assert.equal(payload["role"], "admin");
      assert.equal(payload.sub, admin._id.toString());
    });
  });
});
