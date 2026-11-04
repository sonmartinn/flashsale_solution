// Test đơn vị cho requireAuth / requireAdmin (D-13, D-14, SPECS mục 7).
// File này KHÔNG kết nối MongoDB: mọi request được bảo vệ phải trả lời trong 1 giây, chứng minh
// requireAuth chỉ xác minh token mà không đọc database (mongoose chưa kết nối sẽ treo lệnh 10 giây).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { loadBaseConfig, type BaseConfig } from "../src/config/env.js";
import { createAuthMiddleware } from "../src/middlewares/auth.js";
import { errorHandler, notFound } from "../src/middlewares/error.js";
import { TEST_JWT_SECRET, startApp, testConfig, type StartedApp } from "./helpers.js";

interface ErrorBody {
  message: string;
  code: string;
}

const USER_ID = "64b7f0c2a1b2c3d4e5f60718";
const ADMIN_ID = "64b7f0c2a1b2c3d4e5f60719";
const UPPER_ID = "64B7F0C2A1B2C3D4E5F6071A";

function sign(sub: string, role: string, secret = TEST_JWT_SECRET): string {
  return jwt.sign({ role }, secret, { algorithm: "HS256", expiresIn: "7d", subject: sub });
}

const userToken = sign(USER_ID, "user");
const adminToken = sign(ADMIN_ID, "admin");

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

/** GET có giới hạn 1 giây: nếu middleware đọc MongoDB (chưa kết nối) thì request sẽ bị hủy và test fail. */
function get(url: string, headers: Record<string, string> | Array<[string, string]> = {}): Promise<Response> {
  return fetch(url, { headers, signal: AbortSignal.timeout(1000) });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function expectError(res: Response, status: number, code: string, message?: string): Promise<void> {
  assert.equal(res.status, status);
  const body = (await res.json()) as ErrorBody;
  assert.equal(body.code, code);
  if (message !== undefined) assert.equal(body.message, message);
}

/**
 * Dựng cấu hình qua loadBaseConfig từ một env tự tạo (KHÔNG dùng process.env), chỉ đổi NODE_ENV.
 * Nhờ vậy test đi trọn đường NODE_ENV -> loadBaseConfig -> requireAuth -> HTTP.
 */
function configFromNodeEnv(nodeEnv: string): BaseConfig {
  const base = testConfig();
  return loadBaseConfig({ MONGODB_URI: base.mongoUri, REDIS_URL: base.redisUrl, NODE_ENV: nodeEnv });
}

interface EchoApp {
  baseUrl: string;
  close: () => Promise<void>;
}

/** App Express chỉ dùng trong test: GET /me trả lại req.user; GET /chi-admin chỉ có requireAdmin. */
async function startEchoApp(isTestMode: boolean): Promise<EchoApp> {
  const auth = createAuthMiddleware({ cfg: testConfig({ isTestMode }), jwtSecret: TEST_JWT_SECRET });
  const app = express();
  app.use(express.json());
  app.get("/me", auth.requireAuth, (req, res) => {
    res.json(req.user ?? null);
  });
  app.get("/chi-admin", auth.requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(notFound);
  app.use(errorHandler);
  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve(s);
    });
  });
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("Không đọc được địa chỉ server test");
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("auth.test", () => {
  describe("chế độ thường (isTestMode false)", () => {
    let api: StartedApp;
    let echo: EchoApp;
    let adminUrl: string;

    before(async () => {
      api = await startApp({ cfg: testConfig({ isTestMode: false }), jwtSecret: TEST_JWT_SECRET });
      echo = await startEchoApp(false);
      adminUrl = `${api.baseUrl}/api/admin/thu`;
    });

    after(async () => {
      await api.close();
      await echo.close();
    });

    it("không có Authorization: 401 UNAUTHORIZED 'Bạn chưa đăng nhập'", async () => {
      await expectError(await get(adminUrl), 401, "UNAUTHORIZED", "Bạn chưa đăng nhập");
    });

    it("Authorization không đúng dạng Bearer: 401", async () => {
      await expectError(await get(adminUrl, { authorization: userToken }), 401, "UNAUTHORIZED", "Bạn chưa đăng nhập");
      await expectError(await get(adminUrl, { authorization: "Bearer a b" }), 401, "UNAUTHORIZED");
    });

    it("'Bearer rac': 401 'Token không hợp lệ'", async () => {
      await expectError(await get(adminUrl, bearer("rac")), 401, "UNAUTHORIZED", "Token không hợp lệ");
    });

    it("token ký bằng khóa khác: 401 'Token không hợp lệ'", async () => {
      const forged = sign(ADMIN_ID, "admin", "mot-khoa-khac-hoan-toan-0123456789abcdef");
      await expectError(await get(adminUrl, bearer(forged)), 401, "UNAUTHORIZED", "Token không hợp lệ");
    });

    it("token hết hạn 60 giây trước: 401 'Phiên đăng nhập đã hết hạn'", async () => {
      const now = Math.floor(Date.now() / 1000);
      const expired = jwt.sign({ sub: ADMIN_ID, role: "admin", iat: now - 3600, exp: now - 60 }, TEST_JWT_SECRET, {
        algorithm: "HS256",
      });
      await expectError(await get(adminUrl, bearer(expired)), 401, "UNAUTHORIZED", "Phiên đăng nhập đã hết hạn");
    });

    it("token alg none tự dựng: 401", async () => {
      const now = Math.floor(Date.now() / 1000);
      const none = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: ADMIN_ID, role: "admin", iat: now, exp: now + 3600 })}.`;
      await expectError(await get(adminUrl, bearer(none)), 401, "UNAUTHORIZED", "Token không hợp lệ");
    });

    it("role 'superuser': 401", async () => {
      await expectError(await get(adminUrl, bearer(sign(ADMIN_ID, "superuser"))), 401, "UNAUTHORIZED", "Token không hợp lệ");
    });

    it("sub 'abc' (không phải ObjectId): 401", async () => {
      await expectError(await get(adminUrl, bearer(sign("abc", "admin"))), 401, "UNAUTHORIZED", "Token không hợp lệ");
    });

    it("token không có sub: 401", async () => {
      const noSub = jwt.sign({ role: "admin" }, TEST_JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });
      await expectError(await get(adminUrl, bearer(noSub)), 401, "UNAUTHORIZED", "Token không hợp lệ");
    });

    it("token user hợp lệ trên /api/admin/*: 403 FORBIDDEN", async () => {
      await expectError(await get(adminUrl, bearer(userToken)), 403, "FORBIDDEN", "Bạn không có quyền truy cập");
      await expectError(await get(`${api.baseUrl}/api/admin/sales/abc/stats`, bearer(userToken)), 403, "FORBIDDEN");
    });

    it("token admin hợp lệ qua được guard: 404 NOT_FOUND (Phase 1 chưa có endpoint admin)", async () => {
      await expectError(await get(adminUrl, bearer(adminToken)), 404, "NOT_FOUND");
    });

    it("x-test-user bị bỏ qua ngoài chế độ test: không token thì 401", async () => {
      await expectError(await get(adminUrl, { "x-test-user": USER_ID }), 401, "UNAUTHORIZED", "Bạn chưa đăng nhập");
      const res = await get(`${echo.baseUrl}/me`, { "x-test-user": USER_ID });
      await expectError(res, 401, "UNAUTHORIZED");
    });

    it("x-test-user kèm token user ngoài chế độ test: dùng token", async () => {
      const res = await get(`${echo.baseUrl}/me`, { "x-test-user": ADMIN_ID, ...bearer(userToken) });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { id: USER_ID, role: "user" });
    });

    it("sub chữ hoa được chuẩn hóa thành chữ thường trong req.user", async () => {
      const res = await get(`${echo.baseUrl}/me`, bearer(sign(UPPER_ID, "user")));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { id: UPPER_ID.toLowerCase(), role: "user" });
    });

    it("token admin: req.user mang role admin", async () => {
      const res = await get(`${echo.baseUrl}/me`, bearer(adminToken));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { id: ADMIN_ID, role: "admin" });
    });

    it("requireAdmin khi chưa có req.user: 401 UNAUTHORIZED", async () => {
      await expectError(await get(`${echo.baseUrl}/chi-admin`), 401, "UNAUTHORIZED");
    });

    it("request admin và user đồng thời không lẫn quyền của nhau", async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => get(adminUrl, bearer(i % 2 === 0 ? adminToken : userToken))),
      );
      for (const [i, res] of results.entries()) {
        assert.equal(res.status, i % 2 === 0 ? 404 : 403);
        await res.arrayBuffer();
      }
    });
  });

  describe("chế độ test (isTestMode true)", () => {
    let api: StartedApp;
    let echo: EchoApp;
    let adminUrl: string;

    before(async () => {
      api = await startApp({ cfg: testConfig({ isTestMode: true }), jwtSecret: TEST_JWT_SECRET });
      echo = await startEchoApp(true);
      adminUrl = `${api.baseUrl}/api/admin/thu`;
    });

    after(async () => {
      await api.close();
      await echo.close();
    });

    it("x-test-user chữ hoa thắng cả token admin: req.user = { id chữ thường, role user }", async () => {
      const res = await get(`${echo.baseUrl}/me`, { "x-test-user": UPPER_ID, ...bearer(adminToken) });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { id: UPPER_ID.toLowerCase(), role: "user" });
    });

    it("x-test-user không cần token", async () => {
      const res = await get(`${echo.baseUrl}/me`, { "x-test-user": USER_ID });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { id: USER_ID, role: "user" });
    });

    it("x-test-user 'abc': 401", async () => {
      await expectError(
        await get(`${echo.baseUrl}/me`, { "x-test-user": "abc" }),
        401,
        "UNAUTHORIZED",
        "x-test-user không phải ObjectId hợp lệ",
      );
    });

    it("hai giá trị x-test-user (bị nối thành 'a, b'): 401", async () => {
      const res = await get(`${echo.baseUrl}/me`, [
        ["x-test-user", USER_ID],
        ["x-test-user", ADMIN_ID],
      ]);
      await expectError(res, 401, "UNAUTHORIZED");
    });

    it("không có x-test-user thì dùng Bearer: token admin cho role admin", async () => {
      const res = await get(`${echo.baseUrl}/me`, bearer(adminToken));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { id: ADMIN_ID, role: "admin" });
    });

    it("/api/admin/*: x-test-user kèm token admin vẫn là user nên 403", async () => {
      await expectError(await get(adminUrl, { "x-test-user": USER_ID, ...bearer(adminToken) }), 403, "FORBIDDEN");
    });

    it("/api/admin/*: token admin không kèm header qua được guard (404)", async () => {
      await expectError(await get(adminUrl, bearer(adminToken)), 404, "NOT_FOUND");
    });

    it("/api/admin/*: không header, không token thì 401", async () => {
      await expectError(await get(adminUrl), 401, "UNAUTHORIZED", "Bạn chưa đăng nhập");
    });
  });

  // AUTH-05, D-14: chỉ NODE_ENV thô đúng chính xác "test" mới bật x-test-user.
  // "test " là giá trị mà `set NODE_ENV=test && npm start` của cmd tạo ra.
  describe("NODE_ENV thô quyết định x-test-user (loadBaseConfig -> requireAuth)", () => {
    it(`NODE_ENV ${JSON.stringify("test")}: x-test-user được nhận là user nên /api/admin/* trả 403`, async () => {
      const api = await startApp({ cfg: configFromNodeEnv("test"), jwtSecret: TEST_JWT_SECRET });
      try {
        await expectError(await get(`${api.baseUrl}/api/admin/thu`, { "x-test-user": USER_ID }), 403, "FORBIDDEN");
      } finally {
        await api.close();
      }
    });

    for (const value of ["test ", " test", "test\t"]) {
      it(`NODE_ENV ${JSON.stringify(value)}: x-test-user bị bỏ qua, không token thì 401 'Bạn chưa đăng nhập'`, async () => {
        const api = await startApp({ cfg: configFromNodeEnv(value), jwtSecret: TEST_JWT_SECRET });
        try {
          const res = await get(`${api.baseUrl}/api/admin/thu`, { "x-test-user": USER_ID });
          await expectError(res, 401, "UNAUTHORIZED", "Bạn chưa đăng nhập");
        } finally {
          await api.close();
        }
      });
    }
  });
});
