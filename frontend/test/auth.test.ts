import assert from "node:assert/strict";
import { afterEach, it, mock } from "node:test";
import { ApiError } from "../src/services/api.ts";
import { authenticate, createSessionStore, safeReturnPath, SESSION_KEY, StaleSessionError } from "../src/services/auth.ts";

const first = {
  token: "first-token",
  user: { id: "0123456789abcdef01234567", name: "Người mua", email: "first@example.test", role: "user" },
};
const second = { ...first, token: "next-token", user: { ...first.user, email: "next@example.test" } };
const unauthorized = () => Response.json({ code: "UNAUTHORIZED" }, { status: 401 });

afterEach(() => mock.restoreAll());

it("chỉ giữ đường quay lại thuộc router của cửa hàng", () => {
  const sale = "/sales/0123456789abcdef01234567";
  assert.equal(safeReturnPath(sale), sale);
  assert.equal(safeReturnPath("/#products"), "/#products");
  for (const path of ["//outside.test", "https://outside.test", "/\\outside.test", "/%2foutside.test", "/sales/..", "/login", "/orders\n"]) {
    assert.equal(safeReturnPath(path), "/", path);
  }
});

it("qua tải lại chỉ giữ token và hồ sơ tối thiểu, đăng xuất xóa dữ liệu", () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); },
    removeItem: (key: string) => { saved.delete(key); },
  };
  const store = createSessionStore(storage);
  store.accept({ ...first, password: "secret", user: { ...first.user, password: "secret" } });
  assert.deepEqual(JSON.parse(saved.get(SESSION_KEY)!), first);
  const reloaded = createSessionStore(storage);
  assert.deepEqual(reloaded.getSnapshot().session, first);
  reloaded.logout();
  assert.equal(saved.has(SESSION_KEY), false);

  saved.set(SESSION_KEY, "{");
  assert.equal(createSessionStore(storage).getSnapshot().session, null);
  assert.equal(saved.has(SESSION_KEY), false);
});

it("đăng nhập và đăng xuất trong bộ nhớ khi trình duyệt chặn storage", () => {
  const unavailable = () => { throw new Error("Bị chặn"); };
  const store = createSessionStore({ getItem: unavailable, setItem: unavailable, removeItem: unavailable });
  store.accept(first);
  assert.deepEqual(store.getSnapshot().session, first);
  assert.equal(store.getSnapshot().persistent, false);
  store.logout();
  assert.equal(store.getSnapshot().session, null);
});

it("đăng ký gửi đúng trường và giữ INVALID_CREDENTIALS cho biểu mẫu đăng nhập", async () => {
  const stub = mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url === "/api/auth/login") return Response.json({ code: "INVALID_CREDENTIALS" }, { status: 401 });
    assert.equal(url, "/api/auth/register");
    assert.deepEqual(JSON.parse(String(init.body)), { name: "Tên", email: "first@example.test", password: "test-password" });
    return Response.json(first, { status: 201 });
  });
  const input = { name: "Tên", email: "first@example.test", password: "test-password", role: "admin" };
  assert.deepEqual(await authenticate("register", input), first);
  await assert.rejects(authenticate("login", input), error => error instanceof ApiError && error.code === "INVALID_CREDENTIALS");
  assert.equal(stub.mock.callCount(), 2);
});

it("trả 401 muộn của token cũ không xóa tài khoản mới", async () => {
  const store = createSessionStore();
  store.accept(first);
  let finish!: (response: Response) => void;
  mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer first-token");
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const pending = store.request("/orders/me");
  store.accept(second);
  finish(unauthorized());
  await assert.rejects(pending, StaleSessionError);
  assert.deepEqual(store.getSnapshot().session, second);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer next-token");
    return unauthorized();
  });
  await assert.rejects(store.request("/orders/me"), error => error instanceof ApiError && error.code === "UNAUTHORIZED");
  assert.equal(store.getSnapshot().session, null);
});

it("bỏ dữ liệu cá nhân đến muộn sau đăng xuất", async () => {
  const store = createSessionStore();
  store.accept(first);
  let finish!: (response: Response) => void;
  mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => { finish = resolve; }));
  const pending = store.request("/orders/me");
  store.logout();
  finish(Response.json({ orders: [{ id: "old-order" }] }));
  await assert.rejects(pending, StaleSessionError);
});
