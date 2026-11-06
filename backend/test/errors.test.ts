// Test hợp đồng lỗi: mọi lỗi API đi ra dưới dạng JSON { message, code } với thông báo tiếng Việt.
// Phần đầu chạy qua app thật (createApp); phần sau dựng một app Express chỉ dùng trong test
// để ném từng loại lỗi rồi đi qua notFound + errorHandler thật.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import mongoose from "mongoose";
import { startApp, type StartedApp } from "./helpers.js";
import { errorHandler, notFound } from "../src/middlewares/error.js";
import { HttpError } from "../src/utils/http-error.js";

interface ErrorBody {
  message: string;
  code: string;
}

/** Đọc phản hồi lỗi: kiểm tra content-type JSON utf-8 và body chỉ có đúng hai khóa message, code. */
async function readError(res: Response): Promise<{ status: number; body: ErrorBody; raw: string }> {
  const contentType = res.headers.get("content-type") ?? "";
  assert.ok(contentType.includes("application/json"), `content-type phải là JSON, nhận "${contentType}"`);
  assert.ok(contentType.toLowerCase().includes("charset=utf-8"), `content-type phải có charset=utf-8, nhận "${contentType}"`);
  const raw = await res.text();
  const body = JSON.parse(raw) as ErrorBody;
  assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
  assert.equal(typeof body.message, "string");
  return { status: res.status, body, raw };
}

function postJson(url: string, body: string): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
}

describe("errors.test", () => {
  describe("qua app thật (createApp)", () => {
    let app: StartedApp;

    before(async () => {
      app = await startApp();
    });

    after(async () => {
      await app.close();
    });

    it("đường dẫn không tồn tại: 404 NOT_FOUND, tiếng Việt, JSON utf-8", async () => {
      const { status, body } = await readError(await fetch(`${app.baseUrl}/api/khong-ton-tai`));
      assert.equal(status, 404);
      assert.equal(body.code, "NOT_FOUND");
      assert.equal(body.message, "Không tìm thấy đường dẫn");
    });

    it("JSON hỏng: 400 INVALID_JSON", async () => {
      const { status, body } = await readError(await postJson(`${app.baseUrl}/api/anything`, '{"a":'));
      assert.equal(status, 400);
      assert.equal(body.code, "INVALID_JSON");
      assert.equal(body.message, "Body JSON không hợp lệ");
    });

    it("JSON là giá trị nguyên thủy (parser strict): 400 INVALID_JSON", async () => {
      const { status, body } = await readError(await postJson(`${app.baseUrl}/api/anything`, "abc"));
      assert.equal(status, 400);
      assert.equal(body.code, "INVALID_JSON");
    });

    it("JSON là số nguyên thủy: 400 INVALID_JSON", async () => {
      const { status, body } = await readError(await postJson(`${app.baseUrl}/api/anything`, "42"));
      assert.equal(status, 400);
      assert.equal(body.code, "INVALID_JSON");
    });

    it("body rỗng với content-type JSON (Content-Length: 0): 400 INVALID_JSON", async () => {
      const { status, body } = await readError(await postJson(`${app.baseUrl}/api/anything`, ""));
      assert.equal(status, 400);
      assert.equal(body.code, "INVALID_JSON");
      assert.equal(body.message, "Body JSON không hợp lệ");
    });

    it("body JSON 200 kB: 413 VALIDATION_ERROR", async () => {
      const big = JSON.stringify({ a: "x".repeat(200_000) });
      const { status, body } = await readError(await postJson(`${app.baseUrl}/api/anything`, big));
      assert.equal(status, 413);
      assert.equal(body.code, "VALIDATION_ERROR");
      assert.equal(body.message, "Yêu cầu không hợp lệ");
    });
  });

  describe("qua app thử với các loại lỗi", () => {
    let server: Server;
    let baseUrl: string;
    const originalConsoleError = console.error;
    const logged: unknown[] = [];

    before(async () => {
      // Lỗi 500 được ghi ra log server; trong test thì gom lại thay vì in ra.
      console.error = (...args: unknown[]) => {
        logged.push(args);
      };
      const app = express();
      app.use(express.json());
      app.get("/http-error", () => {
        throw new HttpError(409, "Email đã được sử dụng", "EMAIL_TAKEN");
      });
      app.get("/cast", () => {
        throw new mongoose.Error.CastError("ObjectId", "abc", "_id");
      });
      app.get("/validation", () => {
        throw new mongoose.Error.ValidationError();
      });
      app.get("/duplicate", () => {
        throw new mongoose.mongo.MongoServerError({ message: "E11000 duplicate key error", code: 11000 });
      });
      app.get("/other-mongo", () => {
        throw new mongoose.mongo.MongoServerError({ message: "lỗi mongo khác", code: 2 });
      });
      app.get("/plain", async () => {
        await Promise.resolve();
        throw new Error("bí mật nội bộ /duong/dan");
      });
      app.use(notFound);
      app.use(errorHandler);
      server = await new Promise<Server>((resolve, reject) => {
        const s = app.listen(0, "127.0.0.1", (error?: Error) => {
          if (error) reject(error);
          else resolve(s);
        });
      });
      const addr = server.address();
      if (addr === null || typeof addr === "string") throw new Error("Không đọc được địa chỉ server test");
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    after(async () => {
      console.error = originalConsoleError;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("HttpError giữ nguyên status, message và code", async () => {
      const { status, body } = await readError(await fetch(`${baseUrl}/http-error`));
      assert.equal(status, 409);
      assert.equal(body.message, "Email đã được sử dụng");
      assert.equal(body.code, "EMAIL_TAKEN");
    });

    it("CastError: 400 INVALID_ID", async () => {
      const { status, body } = await readError(await fetch(`${baseUrl}/cast`));
      assert.equal(status, 400);
      assert.equal(body.code, "INVALID_ID");
      assert.equal(body.message, "Mã định danh không hợp lệ");
    });

    it("ValidationError: 400 VALIDATION_ERROR", async () => {
      const { status, body } = await readError(await fetch(`${baseUrl}/validation`));
      assert.equal(status, 400);
      assert.equal(body.code, "VALIDATION_ERROR");
      assert.equal(body.message, "Dữ liệu không hợp lệ");
    });

    it("MongoServerError E11000: 409 DUPLICATE", async () => {
      const { status, body } = await readError(await fetch(`${baseUrl}/duplicate`));
      assert.equal(status, 409);
      assert.equal(body.code, "DUPLICATE");
      assert.equal(body.message, "Dữ liệu bị trùng");
    });

    it("MongoServerError khác E11000: 500 INTERNAL_ERROR", async () => {
      const { status, body } = await readError(await fetch(`${baseUrl}/other-mongo`));
      assert.equal(status, 500);
      assert.equal(body.code, "INTERNAL_ERROR");
    });

    it("Error thường từ handler async: 500 chỉ có message + code, không lộ chi tiết", async () => {
      const { status, body, raw } = await readError(await fetch(`${baseUrl}/plain`));
      assert.equal(status, 500);
      assert.equal(body.code, "INTERNAL_ERROR");
      assert.equal(body.message, "Lỗi máy chủ, vui lòng thử lại sau");
      assert.ok(!raw.includes("bí mật nội bộ"), "body 500 không được chứa thông báo lỗi gốc");
      assert.ok(!raw.includes("/duong/dan"), "body 500 không được chứa đường dẫn");
      assert.ok(!raw.includes("at "), "body 500 không được chứa stack");
    });

    it("route không có trong app thử: 404 NOT_FOUND", async () => {
      const { status, body } = await readError(await fetch(`${baseUrl}/khong-co`));
      assert.equal(status, 404);
      assert.equal(body.code, "NOT_FOUND");
    });
  });
});
