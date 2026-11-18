// Kiểm chứng Task 1 04-05 trên bản build 5174 + API fixture: đơn của tôi, các mã nghiệp vụ, kết quả chưa rõ, đổi tài khoản, reset.
import { readFileSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";

const [, , saleId, outDir, profile] = process.argv;
if (!saleId || !outDir || !/[\\/]\.taste-skill[\\/]chrome-0405-[a-z0-9-]+$/.test(profile ?? "")) {
  console.error("Cách dùng: node scripts/test/ui-browser/purchase-orders.mjs <saleId của fixture> <thư mục kết quả> <đường dẫn tuyệt đối .taste-skill/chrome-0405-<tên>>");
  console.error("Cần fixture UI (cổng 5000, dữ liệu seed mới) và bản build trên http://localhost:5174. Kịch bản tạo đơn và reset sale trong fixture.");
  process.exit(2);
}
const BASE = "http://localhost:5174";
const hook = readFileSync(new URL("./hook.js", import.meta.url), "utf8");
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : " :: " + JSON.stringify(detail)}`); };
const api = async (path, init = {}, token) => {
  const headers = { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const r = await fetch(`http://localhost:5000/api${path}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const login = async (email) => (await api("/auth/login", { method: "POST", body: { email, password: "matkhau123" } })).body;

const b = await launch(profile);
try {
  await b.addInit(hook);
  const helpers = `
    window.__click = (text, sel = "button, a") => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim() === text && !e.closest("[hidden]")); if (!el) throw new Error("Không thấy " + text); el.click(); return true; };
    window.__btn = text => [...document.querySelectorAll("button")].find(e => e.textContent.trim() === text);
    window.__feedback = () => document.querySelector(".sale-feedback")?.innerText.trim() ?? null;
    window.__posts = () => window.__log.filter(e => e.method === "POST" && e.url.includes("/buy")).length;
    window.__gets = p => window.__log.filter(e => e.method === "GET" && e.url.includes(p)).length;`;
  await b.addInit(helpers);
  const ready = `document.querySelector(".sale-feedback") && !document.querySelector("[aria-busy='true']")`;
  const fill = async (email, password = "matkhau123") => {
    await b.waitFor(`document.querySelector("#auth-email")`);
    await b.type("#auth-email", email);
    await b.type("#auth-password", password);
    await b.key("Enter", "Enter", 13);
  };
  const enabled = text => b.js(`return window.__btn(${JSON.stringify(text)})?.disabled === false;`);

  // 1. Khách bấm mua -> đăng nhập user1 -> quay lại sale, đọc đơn để biết đã mua chưa.
  await b.goto(`${BASE}/sales/${saleId}`);
  await b.waitFor(ready);
  await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`);
  await b.js(`window.__click("Mua ngay"); return 1;`);
  await b.waitFor(`location.pathname === "/login"`);
  check("Khách bấm mua được đưa tới /login với returnTo sale", await b.js(`return location.search;`) === `?returnTo=%2Fsales%2F${saleId}`);
  await fill("user0001@flashsale.local", "sai-mat-khau");
  await b.waitFor(`document.querySelector("#auth-error")`);
  check("Sai mật khẩu báo trên form, không đăng xuất toàn cục", await b.js(`return document.querySelector("#auth-error").textContent + "|" + (localStorage.getItem("flashsale.session") === null);`), "Email hoặc mật khẩu không đúng|true");
  await b.js(`document.querySelector("#auth-email").value=""; return 1;`);
  await fill("user0001@flashsale.local");
  await b.waitFor(`location.pathname === "/sales/${saleId}"`);
  await b.waitFor(`window.__gets("/orders/me") >= 1 && window.__btn("Mua ngay")?.disabled === false`);
  check("Đăng nhập xong đọc /orders/me và mở nút mua (chưa có đơn)", true, await b.js(`return { orders: window.__gets("/orders/me"), feedback: window.__feedback() };`));

  // 2. Mất phản hồi: POST thật tới server nhưng trình duyệt nhận lỗi mạng -> chưa rõ, không gửi lại.
  await b.js(`window.__faults.push({ method: "POST", match: "/buy", kind: "passthrough-lost", once: true }); return 1;`);
  await b.js(`window.__click("Mua ngay"); window.__click("Mua ngay"); return 1;`);
  await b.waitFor(`window.__feedback()?.includes("Chưa xác nhận")`);
  await sleep(1500);
  const lost = await b.js(`return { posts: window.__posts(), feedback: window.__feedback(), buyDisabled: window.__btn("Mua ngay").disabled, link: !!document.querySelector('.sale-feedback a[href="/orders"]') };`);
  check("Phản hồi bị mất: 1 POST, thông báo chưa rõ, khóa mua, có link đơn", lost.posts === 1 && lost.buyDisabled && lost.link, lost);
  await b.js(`window.__click("Mua ngay"); return 1;`).catch(() => 0);
  await sleep(800);
  check("Bấm thêm khi chưa rõ không tạo POST thứ hai", await b.js(`return window.__posts();`) === 1);
  await b.js(`window.__click("Làm mới tồn kho"); return 1;`);
  await b.waitFor(`window.__feedback()?.includes("đã được ghi nhận")`);
  const confirmed = await b.js(`return { feedback: window.__feedback(), buyDisabled: window.__btn("Mua ngay").disabled, posts: window.__posts(), stock: document.querySelector(".stock").textContent };`);
  check("Đọc lại đơn xác nhận đơn đã tạo, vẫn khóa mua và vẫn 1 POST", confirmed.buyDisabled && confirmed.posts === 1, confirmed);
  const user1 = await login("user0001@flashsale.local");
  const user1Orders = (await api("/orders/me", {}, user1.token)).body.orders;
  check("Server có đúng 1 đơn cho user1 sau phản hồi bị mất", user1Orders.length === 1, user1Orders.map(o => o.id));

  // 3. Reload: trạng thái đã mua khôi phục từ đơn, không từ cờ lưu trữ.
  await b.goto(`${BASE}/sales/${saleId}`);
  await b.waitFor(`window.__feedback()?.includes("Bạn đã mua")`);
  check("Sau reload biết đã mua nhờ đọc đơn; localStorage chỉ có phiên", await b.js(`return Object.keys(localStorage).join(",") + "|" + window.__btn("Mua ngay").disabled;`), "flashsale.session|true");

  // 4. /orders của user1.
  await b.js(`window.__click("Đơn của tôi", "a"); return 1;`);
  await b.waitFor(`document.querySelector(".order-list") || document.querySelector(".orders__empty")`);
  const orders1 = await b.js(`return [...document.querySelectorAll(".order")].map(li => li.innerText.replace(/\\s+/g, " "));`);
  check("/orders của user1 hiện 1 đơn với tên/giá/trạng thái/mã đơn từ API", orders1.length === 1 && orders1[0].includes(user1Orders[0].id) && orders1[0].includes("Thành công"), orders1);
  await b.shot(`${outDir}/04-05-orders-user1-1440.png`, true);

  // 5. Đăng xuất trên /orders -> login, đăng nhập user2 -> không thấy đơn user1.
  await b.js(`window.__click("Đăng xuất"); return 1;`);
  await b.waitFor(`location.pathname === "/login"`);
  check("Đăng xuất trên /orders đưa về đăng nhập, không hiện thông báo hết hạn", await b.js(`return location.search + "|" + !!document.querySelector(".auth-notice");`), "?returnTo=%2Forders|false");
  await fill("user0002@flashsale.local");
  await b.waitFor(`location.pathname === "/orders" && (document.querySelector(".order-list") || document.querySelector(".orders__empty"))`);
  const orders2 = await b.js(`return { empty: document.querySelector(".orders__empty")?.innerText.replace(/\\s+/g, " "), rows: document.querySelectorAll(".order").length, body: document.querySelector("main").innerText.includes(${JSON.stringify(user1Orders[0].id)}) };`);
  check("user2 thấy trạng thái trống, không thấy đơn user1", orders2.rows === 0 && !orders2.body && orders2.empty, orders2);
  await b.shot(`${outDir}/04-05-orders-empty-1440.png`, true);

  // 6. Lỗi nghiệp vụ tiêm có kiểm soát cho user2 trên trang sale: mỗi mã một thông báo, mỗi lần đúng 1 POST.
  await b.js(`history.pushState({}, "", "/sales/${saleId}"); dispatchEvent(new PopStateEvent("popstate")); return 1;`);
  await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`);
  const codes = [
    [409, "SOLD_OUT", "Sản phẩm đã hết hàng. Chọn Sản phẩm để xem các mặt hàng khác."],
    [400, "SALE_NOT_ACTIVE", "Đợt sale chưa mở hoặc đã kết thúc. Chọn Flash Sale để xem đợt sale đang mở trên trang chủ."],
    [503, "STOCK_NOT_LOADED", "Kho chưa sẵn sàng."],
  ];
  for (const [status, code, text] of codes) {
    const before = await b.js(`return window.__posts();`);
    await b.js(`window.__faults.push({ method: "POST", match: "/buy", status: ${status}, body: { code: "${code}", message: "từ API" }, once: true }); window.__click("Mua ngay"); return 1;`);
    await b.waitFor(`window.__feedback()?.startsWith(${JSON.stringify(text)})`);
    await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`, 5000).catch(() => false);
    const state = await b.js(`return { posts: window.__posts() - ${before}, outcome: document.querySelector(".sale-feedback").dataset.outcome, role: document.querySelector(".sale-feedback").getAttribute("role") };`);
    check(`${code} hiện thông báo riêng, 1 POST, vùng role=status`, state.posts === 1 && state.role === "status", state);
  }
  // 500 -> chưa rõ; làm mới -> chưa thấy đơn -> người dùng tự quyết định mua lại -> thành công thật.
  await b.js(`window.__faults.push({ method: "POST", match: "/buy", status: 500, body: { code: "INTERNAL_ERROR", message: "Lỗi" }, once: true }); window.__click("Mua ngay"); return 1;`);
  await b.waitFor(`window.__feedback()?.includes("Chưa xác nhận")`);
  check("500 là kết quả chưa rõ và khóa mua", await b.js(`return window.__btn("Mua ngay").disabled;`));
  await b.js(`window.__click("Làm mới tồn kho"); return 1;`);
  await b.waitFor(`window.__feedback()?.includes("Chưa thấy đơn")`);
  check("Sau khi kiểm tra đơn hiện tại, mua lại chỉ mở bằng quyết định của người dùng", await enabled("Mua ngay"));
  const beforeReal = await b.js(`return window.__posts();`);
  await b.js(`window.__click("Mua ngay"); return 1;`);
  await b.waitFor(`window.__feedback()?.startsWith("Mua thành công. Mã đơn")`);
  check("Mua lại thành công thật với 1 POST mới, xác nhận có link Xem đơn của tôi", await b.js(`return window.__posts() - ${beforeReal} === 1 && !!document.querySelector('.sale-feedback a[href="/orders"]');`), await b.js(`return window.__feedback();`));
  await b.shot(`${outDir}/04-05-sale-success-1440.png`);

  // 7. ALREADY_BOUGHT thật: user3 đăng nhập trên trang, mua bằng API ở "tab khác", rồi bấm mua trên trang.
  await b.js(`window.__click("Đăng xuất"); return 1;`);
  await b.waitFor(`document.querySelector('a[href^="/login"]')`);
  await b.js(`window.__click("Mua ngay"); return 1;`);
  await fill("user0003@flashsale.local");
  await b.waitFor(`location.pathname === "/sales/${saleId}" && window.__btn("Mua ngay")?.disabled === false`);
  const user3 = await login("user0003@flashsale.local");
  const direct = await api(`/sales/${saleId}/buy?mode=v2`, { method: "POST", body: { qty: 1 } }, user3.token);
  const beforeAb = await b.js(`return window.__posts();`);
  await b.js(`window.__click("Mua ngay"); return 1;`);
  await b.waitFor(`window.__feedback()?.startsWith("Bạn đã mua sản phẩm trong đợt sale này.")`);
  const ab = await b.js(`return { posts: window.__posts() - ${beforeAb}, status: window.__log.filter(e => e.method === "POST").at(-1).status, outcome: document.querySelector(".sale-feedback").dataset.outcome, disabled: window.__btn("Mua ngay").disabled };`);
  check("ALREADY_BOUGHT thật (409) hiện thông báo riêng, khóa mua", direct.status === 201 && ab.status === 409 && ab.disabled && ab.posts === 1, ab);

  // 8. SOLD_OUT thật: admin reset totalQty=1 (fixture), user3 thấy còn 1; user4 mua qua API; user3 bấm mua -> 409 SOLD_OUT.
  const admin = await login("admin@flashsale.local");
  const reset = await api(`/admin/sales/${saleId}/reset`, { method: "POST", body: { mode: "v2", totalQty: 1 } }, admin.token);
  await b.js(`window.__click("Làm mới tồn kho"); return 1;`);
  await b.waitFor(`document.querySelector(".stock").textContent === "Còn 1 sản phẩm" && window.__btn("Mua ngay")?.disabled === false`);
  check("Reset (startAt mới) làm mới trạng thái đã mua: user3 mua được lại", reset.status === 200, await b.js(`return { feedback: window.__feedback(), orders: window.__gets("/orders/me") };`));
  const user4 = await login("user0004@flashsale.local");
  const take = await api(`/sales/${saleId}/buy?mode=v2`, { method: "POST", body: { qty: 1 } }, user4.token);
  const beforeSo = await b.js(`return window.__posts();`);
  await b.js(`window.__click("Mua ngay"); return 1;`);
  await b.waitFor(`window.__feedback()?.startsWith("Sản phẩm đã hết hàng.")`);
  await b.waitFor(`document.querySelector(".stock").textContent === "Còn 0 sản phẩm"`);
  const so = await b.js(`return { posts: window.__posts() - ${beforeSo}, status: window.__log.filter(e => e.method === "POST").at(-1).status, disabled: window.__btn("Mua ngay").disabled, stock: document.querySelector(".stock").textContent };`);
  check("SOLD_OUT thật (409) hiện thông báo riêng, đọc lại tồn = 0 và khóa mua", take.status === 201 && so.status === 409 && so.disabled && so.posts === 1, so);
  await b.shot(`${outDir}/04-05-sale-soldout-1440.png`);

  // 9. Phiên hết hạn: token bị làm hỏng -> 401 khi mua -> về /login có thông báo hết hạn.
  await api(`/admin/sales/${saleId}/reset`, { method: "POST", body: { mode: "v2", totalQty: 100 } }, admin.token);
  await b.js(`const s = JSON.parse(localStorage.getItem("flashsale.session")); s.token = "x" + s.token.slice(1); localStorage.setItem("flashsale.session", JSON.stringify(s)); return 1;`);
  await b.goto(`${BASE}/sales/${saleId}`);
  await b.waitFor(`location.pathname === "/login" || window.__btn("Mua ngay")?.disabled === false`, 10000).catch(() => false);
  const expiry = await b.js(`return { path: location.pathname, notice: document.querySelector(".auth-notice")?.textContent ?? null, session: localStorage.getItem("flashsale.session") };`);
  if (expiry.path !== "/login") {
    await b.js(`window.__click("Mua ngay"); return 1;`).catch(() => 0);
    await b.waitFor(`location.pathname === "/login"`).catch(() => false);
  }
  const expiry2 = await b.js(`return { path: location.pathname + location.search, notice: document.querySelector(".auth-notice")?.textContent ?? null, session: localStorage.getItem("flashsale.session") };`);
  check("Token hỏng: phiên bị xóa, trang đăng nhập báo hết hạn", expiry2.notice === "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." && expiry2.session === null, { first: expiry, final: expiry2 });

  check("Không có lỗi console trong trang", b.consoleErrors.length === 0, b.consoleErrors.slice(0, 5));
} catch (error) {
  const state = await b.js(`return { path: location.pathname, feedback: window.__feedback?.(), log: window.__log.slice(-6).map(e => e.method + " " + e.url + " " + (e.status ?? e.fault)), buy: window.__btn?.("Mua ngay")?.disabled };`).catch(e => String(e));
  check("Kịch bản chạy hết", false, { error: String(error?.message ?? error), state });
} finally {
  writeFileSync(`${outDir}/04-05-task1-browser.json`, JSON.stringify(results, null, 2));
  await b.close();
}
process.exitCode = results.every(r => r.ok) ? 0 : 1;
