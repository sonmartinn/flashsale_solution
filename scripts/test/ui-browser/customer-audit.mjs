// Kiểm chứng Task 2 04-05 trên bản build 5174 + API fixture: bàn phím, mobile, giảm chuyển động, phiên/đồng hồ,
// lỗi đọc có kiểm soát, phản hồi cũ của phiên trước và tài nguyên offline trên /login, /sales/:id, /orders.
// Mọi lỗi được tiêm trong trang (hook.js); dữ liệu thật chỉ là đơn của user(U+1..U+10) trong DB fixture (U là tham số thứ tư, mặc định 100).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";

const [, , saleId, outDir, profile, userBase = "100"] = process.argv;
// Mỗi lượt chạy dùng 10 tài khoản chưa mua (U+1..U+10); chạy lại trên cùng fixture thì tăng U.
const U = Number(userBase);
if (!saleId || !outDir || !/[\\/]\.taste-skill[\\/]chrome-0405-[a-z0-9-]+$/.test(profile ?? "")) {
  console.error("Cách dùng: node scripts/test/ui-browser/customer-audit.mjs <saleId của fixture> <thư mục kết quả> <đường dẫn tuyệt đối .taste-skill/chrome-0405-<tên>>");
  console.error("Cần fixture UI (cổng 5000, dữ liệu seed mới) và bản build trên http://localhost:5174.");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const BASE = "http://localhost:5174";
const hook = readFileSync(new URL("./hook.js", import.meta.url), "utf8");
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : " :: " + JSON.stringify(detail)}`); };
const api = async (path, init = {}, token) => {
  const headers = { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const r = await fetch(`http://localhost:5000/api${path}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const login = async email => (await api("/auth/login", { method: "POST", body: { email, password: "matkhau123" } })).body;
const user = n => `user${String(n).padStart(4, "0")}@flashsale.local`;

const helpers = `
  window.__click = (text, sel = "button, a") => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim() === text && e.checkVisibility()); if (!el) throw new Error("Không thấy " + text); el.click(); return true; };
  window.__btn = text => [...document.querySelectorAll("button")].find(e => e.textContent.trim() === text);
  window.__feedback = () => document.querySelector(".sale-feedback")?.innerText.trim() ?? null;
  window.__posts = () => window.__log.filter(e => e.method === "POST" && e.url.includes("/buy")).length;
  window.__gets = p => window.__log.filter(e => e.method === "GET" && e.url.includes(p)).length;
  window.__active = () => { const e = document.activeElement; return e ? (e.textContent || e.getAttribute("aria-label") || e.id || e.tagName).trim().slice(0, 40) : null; };
  window.__ring = () => { const s = getComputedStyle(document.activeElement); return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none"; };
  window.__layout = () => {
    const vw = innerWidth;
    const visible = e => e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && !e.classList.contains("skip-link");
    const offenders = [...document.querySelectorAll("header *, main *")].filter(e => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
      .slice(0, 5).map(e => e.tagName + "." + String(e.className).slice(0, 40));
    const inRunningText = e => e.tagName === "A" && e.parentElement?.tagName === "P" && e.parentElement.textContent.trim() !== e.textContent.trim() && !e.classList.contains("btn");
    const small = [...document.querySelectorAll("header a, header button, main a, main button")].filter(visible).filter(e => !inRunningText(e))
      .map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) }; })
      .filter(x => x.h < 44 || x.w < 44);
    const inputs = [...document.querySelectorAll("main input")].filter(visible).map(e => Math.round(e.getBoundingClientRect().height));
    return { vw, scrollWidth: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth > vw + 1, offenders, small, inputs, h1: document.querySelectorAll("h1").length };
  };`;

const b = await launch(profile);
const shots = [];
const shot = async (name, full = false) => { const path = `${outDir}/${name}.png`; await b.shot(path, full); shots.push(path); };
async function scenario(name, body) {
  try { await body(); }
  catch (error) {
    const state = await b.js(`return { path: location.pathname + location.search, feedback: window.__feedback?.(), log: (window.__log || []).slice(-6).map(e => e.method + " " + e.url + " " + (e.status ?? e.fault)) };`).catch(e => String(e));
    check(`${name}: kịch bản chạy hết`, false, { error: String(error?.message ?? error), state });
  }
}
const tab = () => b.key("Tab", "Tab", 9);
const fillTyped = async (email, password = "matkhau123") => {
  await b.waitFor(`document.querySelector("#auth-email")`);
  await b.type("#auth-email", email);
  await b.type("#auth-password", password);
  await b.key("Enter", "Enter", 13);
};
const logoutUi = async () => { await b.js(`window.__click("Đăng xuất"); return 1;`); await b.waitFor(`!localStorage.getItem("flashsale.session")`); };
const saleReady = `document.querySelector(".sale-feedback") && window.__btn("Mua ngay")`;

try {
  await b.addInit(hook);
  await b.addInit(helpers);

  // A. Bàn phím: skip link đầu tiên, đăng nhập chỉ bằng phím, mua bằng Enter, link đơn bằng Enter.
  await scenario("Bàn phím", async () => {
    await b.goto(`${BASE}/login?returnTo=%2Fsales%2F${saleId}`);
    await b.waitFor(`document.querySelector("#auth-email")`);
    await tab();
    const first = await b.js(`return { text: window.__active(), href: document.activeElement.getAttribute("href"), ring: window.__ring(), rect: document.activeElement.getBoundingClientRect().height };`);
    check("/login: Tab đầu tiên tới “Đến nội dung” và có vòng focus", first.text === "Đến nội dung" && first.href === "#top" && first.ring, first);
    // Tab qua nav tới ô email; nhập bằng insertText vào ô đang focus, Tab sang mật khẩu, Enter gửi form.
    let steps = 0;
    while (steps++ < 15 && (await b.js(`return document.activeElement.id;`)) !== "auth-email") await tab();
    await b.send("Input.insertText", { text: user(U + 1) });
    await tab();
    const onPassword = await b.js(`return document.activeElement.id;`);
    await b.send("Input.insertText", { text: "matkhau123" });
    await b.key("Enter", "Enter", 13);
    await b.waitFor(`location.pathname === "/sales/${saleId}"`);
    check("/login: tới ô email sau " + steps + " lần Tab, Tab sang mật khẩu, Enter đăng nhập và về đúng sale", onPassword === "auth-password", { steps });
    await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`);
    steps = 0;
    while (steps++ < 25 && (await b.js(`return window.__active();`)) !== "Mua ngay") await tab();
    const ring = await b.js(`return window.__ring();`);
    await b.key("Enter", "Enter", 13);
    await b.waitFor(`window.__feedback()?.startsWith("Mua thành công. Mã đơn")`);
    check("/sales: Tab tới “Mua ngay” (vòng focus hiện), Enter gửi đúng 1 POST và báo thành công", ring && (await b.js(`return window.__posts();`)) === 1, { steps, feedback: await b.js(`return window.__feedback();`) });
    steps = 0;
    while (steps++ < 10 && (await b.js(`return window.__active();`)) !== "Xem đơn của tôi") await tab();
    await b.key("Enter", "Enter", 13);
    await b.waitFor(`location.pathname === "/orders" && document.querySelector(".order-list")`);
    check("/sales → /orders bằng Tab + Enter trên “Xem đơn của tôi”", true, { steps });
    const getsBefore = await b.js(`return window.__gets("/orders/me");`);
    steps = 0;
    while (steps++ < 15 && (await b.js(`return window.__active();`)) !== "Làm mới đơn hàng") await tab();
    await b.key("Enter", "Enter", 13);
    await b.waitFor(`window.__gets("/orders/me") === ${getsBefore + 1} && !document.querySelector("main[aria-busy='true']")`);
    check("/orders: “Làm mới đơn hàng” bằng Enter tạo đúng 1 GET /orders/me", true, { before: getsBefore, steps });
    // Menu mobile: Enter mở, Escape đóng và trả focus về nút menu.
    await b.viewport(390, 844);
    await sleep(300);
    await b.js(`document.querySelector(".nav__toggle").focus(); return 1;`);
    await b.key("Enter", "Enter", 13);
    await sleep(300);
    const open = await b.js(`return document.querySelector(".nav__toggle").getAttribute("aria-expanded");`);
    steps = 0;
    while (steps++ < 3) await tab();
    const inMenu = await b.js(`return !!document.activeElement.closest("header");`);
    await b.key("Escape", "Escape", 27);
    await sleep(300);
    const closed = await b.js(`return { expanded: document.querySelector(".nav__toggle").getAttribute("aria-expanded"), focus: document.activeElement === document.querySelector(".nav__toggle") };`);
    check("390: Enter mở menu (aria-expanded=true), Tab ở trong header, Escape đóng và trả focus về nút", open === "true" && inMenu && closed.expanded === "false" && closed.focus, { open, inMenu, closed });
    await b.viewport(1440, 900);
    await logoutUi();
  });

  // B. Bố cục thật ở các bề rộng: không tràn ngang, vùng chạm, ô nhập, một h1; ảnh chụp từng route.
  await scenario("Bố cục", async () => {
    const t102 = await login(user(U + 2));
    await api(`/sales/${saleId}/buy?mode=v2`, { method: "POST", body: { qty: 1 } }, t102.token);
    const routes = [
      ["login", `${BASE}/login`, `document.querySelector("#auth-email")`, false],
      ["sale-guest", `${BASE}/sales/${saleId}`, saleReady, false],
      ["sale-bought", `${BASE}/sales/${saleId}`, `window.__feedback()?.startsWith("Bạn đã mua")`, true],
      ["orders", `${BASE}/orders`, `document.querySelector(".order-list")`, true],
    ];
    await b.goto(`${BASE}/`);
    for (const [name, url, ready, signedIn] of routes) {
      await b.js(signedIn ? `localStorage.setItem("flashsale.session", ${JSON.stringify(JSON.stringify(t102))}); return 1;` : `localStorage.clear(); return 1;`);
      for (const [w, h] of [[1440, 900], [1024, 768], [820, 1180], [768, 1024], [390, 844], [320, 640]]) {
        await b.viewport(w, h);
        await b.goto(url);
        await b.waitFor(ready);
        await sleep(400);
        const layout = await b.js(`return window.__layout();`);
        check(`${name} ${w}px: không tràn ngang, vùng chạm ≥44px, ô nhập ≥48px, một h1`, !layout.overflowX && layout.offenders.length === 0 && layout.small.length === 0 && layout.inputs.every(v => v >= 48) && layout.h1 === 1, layout);
        if (name === "sale-guest" && w <= 390) {
          const full = await b.js(`const o = document.querySelector(".sale-offer").getBoundingClientRect(); const btn = window.__btn("Mua ngay").getBoundingClientRect(); return Math.abs(btn.width - o.width) <= 1;`);
          check(`sale ${w}px: nút “Mua ngay” rộng hết cụm mua`, full);
        }
        await shot(`${name}-${w}`, w <= 390);
      }
    }
    await b.viewport(1440, 900);
    await b.js(`localStorage.clear(); return 1;`);
  });

  // B2. Danh sách nhiều đơn (12, tiêm trong trang từ đúng DTO đơn thật) và chữ dài: không đè footer, không tràn ở 1440..320.
  await scenario("Nhiều đơn", async () => {
    const t102 = await login(user(U + 2));
    const real = (await api("/orders/me", {}, t102.token)).body.orders[0];
    const many = Array.from({ length: 12 }, (_, i) => ({ ...real, id: real.id.slice(0, -2) + String(i).padStart(2, "0"),
      product: { ...real.product, name: i === 0 ? "Áo khoác gió chống nước siêu nhẹ phối màu xanh rêu dành cho mùa mưa Việt Nam" : real.product.name } }));
    await b.goto(`${BASE}/`);
    await b.js(`localStorage.setItem("flashsale.session", ${JSON.stringify(JSON.stringify(t102))}); return 1;`);
    for (const [w, h] of [[1440, 900], [1024, 768], [820, 1180], [390, 844], [320, 640]]) {
      await b.viewport(w, h);
      await b.goto(`${BASE}/orders`);
      await b.js(`window.__faults.push({ method: "GET", match: "/orders/me", status: 200, body: ${JSON.stringify({ orders: many })} }); window.__click("Làm mới đơn hàng"); return 1;`);
      await b.waitFor(`document.querySelectorAll(".order").length === 12`);
      await sleep(300);
      const geo = await b.js(`const last = document.querySelector(".order:last-child").getBoundingClientRect(); const foot = document.querySelector("footer").getBoundingClientRect(); const sec = document.querySelector("section.task-screen").getBoundingClientRect();
        return { lastBottom: Math.round(last.bottom + scrollY), sectionBottom: Math.round(sec.bottom + scrollY), footerTop: Math.round(foot.top + scrollY), count: document.querySelector(".orders__count").textContent, layout: window.__layout() };`);
      check(`/orders 12 đơn + tên dài ở ${w}px: danh sách nằm trong section, không đè footer, không tràn ngang`, geo.lastBottom <= geo.sectionBottom && geo.sectionBottom <= geo.footerTop && !geo.layout.overflowX && geo.layout.offenders.length === 0, geo);
      if (w === 1440 || w === 320) await shot(`orders-many-${w}`, true);
    }
    await b.viewport(1440, 900);
    await b.js(`localStorage.clear(); return 1;`);
  });

  // C. Giảm chuyển động: nội dung hiện đủ, countdown vẫn chạy theo giây.
  await scenario("Giảm chuyển động", async () => {
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    for (const [url, ready] of [[`${BASE}/sales/${saleId}`, saleReady], [`${BASE}/login`, `document.querySelector("#auth-email")`]]) {
      await b.goto(url);
      await b.waitFor(ready);
      await sleep(1200);
      const state = await b.js(`const h1 = document.querySelector("h1"); const s = getComputedStyle(h1); return { reduce: matchMedia("(prefers-reduced-motion: reduce)").matches, opacity: s.opacity, visibility: s.visibility, transform: s.transform, timer: document.querySelector("[role=timer]")?.textContent ?? null };`);
      await sleep(2100);
      const later = await b.js(`return document.querySelector("[role=timer]")?.textContent ?? null;`);
      check(`Giảm chuyển động ${new URL(url).pathname.split("/")[1] || "/"}: h1 hiện đủ${state.timer ? ", countdown vẫn đổi" : ""}`, state.reduce && state.opacity === "1" && state.visibility === "visible" && (state.timer === null || later !== state.timer), { ...state, later });
    }
    await shot("sale-reduced-1440");
    await b.send("Emulation.setEmulatedMedia", { features: [] });
  });

  // D. Phiên: reload khi đã đăng nhập, sai mật khẩu, token hết hạn ở /orders, /admin của user thường.
  await scenario("Phiên", async () => {
    await b.goto(`${BASE}/login?returnTo=%2Forders`);
    await fillTyped(user(U + 3), "sai-mat-khau");
    await b.waitFor(`document.querySelector("#auth-error")`);
    const wrong = await b.js(`return { error: document.querySelector("#auth-error").textContent, invalid: document.querySelector("#auth-password").getAttribute("aria-invalid"), describedBy: document.querySelector("#auth-password").getAttribute("aria-describedby"), notice: !!document.querySelector(".auth-notice"), session: localStorage.getItem("flashsale.session"), path: location.pathname };`);
    check("Sai mật khẩu: lỗi cạnh form (aria-invalid/aria-describedby), không báo hết hạn, không tạo phiên", wrong.error === "Email hoặc mật khẩu không đúng" && wrong.invalid === "true" && wrong.describedBy === "auth-error" && !wrong.notice && wrong.session === null && wrong.path === "/login", wrong);
    await b.js(`document.querySelector("#auth-email").value = ""; return 1;`);
    await fillTyped(user(U + 3));
    await b.waitFor(`location.pathname === "/orders" && document.querySelector(".orders__empty")`);
    const before = await b.js(`return window.__gets("/orders/me");`);
    await b.goto(`${BASE}/orders`);
    await b.waitFor(`document.querySelector(".orders__empty")`);
    check("Reload /orders khi đã đăng nhập: giữ phiên, đọc lại đơn đúng 1 lần, không về /login", (await b.js(`return location.pathname + "|" + window.__gets("/orders/me") + "|" + !!localStorage.getItem("flashsale.session");`)) === "/orders|1|true", { getsBeforeReload: before });
    await b.goto(`${BASE}/sales/${saleId}`);
    await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`);
    check("Reload /sales khi đã đăng nhập: giữ phiên, đọc sale 1 lần và đơn 1 lần", (await b.js(`return window.__gets("/sales/${saleId}") + "|" + window.__gets("/orders/me");`)) === "1|1");
    // Token hết hạn/hỏng: lần đọc /orders/me nhận 401 -> xóa phiên -> /login?returnTo=/orders có thông báo hết hạn.
    await b.js(`const s = JSON.parse(localStorage.getItem("flashsale.session")); s.token = "x" + s.token.slice(1); localStorage.setItem("flashsale.session", JSON.stringify(s)); return 1;`);
    await b.goto(`${BASE}/orders`);
    await b.waitFor(`location.pathname === "/login"`);
    const expired = await b.js(`return { path: location.pathname + location.search, notice: document.querySelector(".auth-notice")?.textContent ?? null, session: localStorage.getItem("flashsale.session"), status: window.__log.filter(e => e.url.includes("/orders/me")).map(e => e.status) };`);
    check("Token hỏng trên /orders: 401, xóa phiên, về /login?returnTo=/orders với thông báo hết hạn", expired.path === "/login?returnTo=%2Forders" && expired.notice === "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." && expired.session === null && expired.status.includes(401), expired);
    await fillTyped(user(U + 3));
    await b.waitFor(`location.pathname === "/orders" && document.querySelector(".orders__empty")`);
    check("Đăng nhập lại sau hết hạn quay về /orders, thông báo hết hạn biến mất", !(await b.js(`return !!document.querySelector(".auth-notice");`)));
    // /admin: route thuộc 04-09; ghi nhận thực tế hiện tại và quyền ở API.
    await b.goto(`${BASE}/admin`);
    await sleep(500);
    const admin = await b.js(`return { h1: document.querySelector("h1")?.textContent, path: location.pathname };`);
    const t103 = await login(user(U + 3));
    const apiAdmin = await api(`/admin/sales/${saleId}/stats`, {}, t103.token);
    check("User thường: API /admin/sales/:id/stats từ chối (403)", apiAdmin.status === 403, { apiStatus: apiAdmin.status, code: apiAdmin.body?.code, uiNow: admin });
    await logoutUi();
  });

  // E. Đơn trống, sale không tồn tại, mã sai định dạng: điều hướng còn dùng được, không tự đọc lại.
  await scenario("Trống và 404", async () => {
    await b.goto(`${BASE}/login?returnTo=%2Forders`);
    await fillTyped(user(U + 4));
    await b.waitFor(`document.querySelector(".orders__empty")`);
    const empty = await b.js(`return document.querySelector(".orders__empty").innerText.replace(/\\s+/g, " ");`);
    await b.js(`window.__click("Về trang chủ", "a"); return 1;`);
    await b.waitFor(`location.pathname === "/"`);
    check("Đơn trống: “Bạn chưa có đơn hàng” + “Về trang chủ” dẫn về /", empty.startsWith("Bạn chưa có đơn hàng Về trang chủ để xem đợt sale đang mở."), empty);
    for (const id of ["ffffffffffffffffffffffff", "khong-phai-ma"]) {
      await b.goto(`${BASE}/sales/${id}`);
      await b.waitFor(`document.querySelector(".sale-missing")`);
      await sleep(1500);
      const missing = await b.js(`return { h1: document.querySelector("h1").textContent, gets: window.__gets("/sales/${id}"), status: window.__log.filter(e => e.url.includes("/sales/${id}")).map(e => e.status) };`);
      await b.js(`window.__click("Xem sản phẩm", "main a"); return 1;`);
      await b.waitFor(`location.pathname === "/" && location.hash === "#products"`);
      check(`/sales/${id}: “Không tìm thấy đợt sale.”, 1 GET (${missing.status.join(",")}), “Xem sản phẩm” về /#products`, missing.h1 === "Không tìm thấy đợt sale." && missing.gets === 1, missing);
    }
    await b.goto(`${BASE}/sales/${saleId}`);
    await b.waitFor(saleReady);
    await logoutUi();
  });

  // F. Lỗi đọc: lần đầu có “Thử đọc lại”; khi đã có dữ liệu thì giữ số cũ, báo đã cũ và khóa mua.
  await scenario("Lỗi đọc", async () => {
    await b.goto(`${BASE}/login?returnTo=%2Forders`);
    await fillTyped(user(U + 5));
    await b.waitFor(`document.querySelector(".orders__empty")`);
    await b.js(`window.__faults.push({ method: "GET", match: "/sales/${saleId}", kind: "network", once: true }); return 1;`);
    await b.js(`history.pushState({}, "", "/sales/${saleId}"); dispatchEvent(new PopStateEvent("popstate")); return 1;`);
    await b.waitFor(`document.querySelector(".read-error")`);
    const first = await b.js(`return { text: document.querySelector(".read-error").innerText.replace(/\\s+/g, " "), role: document.querySelector(".read-error").getAttribute("role"), buy: !!window.__btn("Mua ngay") };`);
    await b.js(`window.__click("Thử đọc lại"); return 1;`);
    await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`);
    check("Sale: lỗi mạng lần đầu hiện “Không đọc được đợt sale.” + “Thử đọc lại”, không có nút mua; thử lại tải được", first.text === "Không đọc được đợt sale. Thử đọc lại" && first.role === "alert" && !first.buy, first);
    const stockBefore = await b.js(`return document.querySelector(".stock").textContent;`);
    await b.js(`window.__faults.push({ method: "GET", match: "/sales/${saleId}", kind: "network", once: true }); window.__click("Làm mới tồn kho"); return 1;`);
    await b.waitFor(`document.querySelector(".field__error[role=alert]")`);
    const stale = await b.js(`return { alert: document.querySelector(".field__error[role=alert]").textContent, stock: document.querySelector(".stock").textContent, buyDisabled: window.__btn("Mua ngay").disabled, refreshDisabled: window.__btn("Làm mới tồn kho")?.disabled, feedback: window.__feedback() };`);
    check("Sale: lỗi khi làm mới giữ tồn đã đọc, báo “Dữ liệu đã cũ … Cập nhật lúc”, khóa mua, nút làm mới còn dùng được", stale.stock === stockBefore && stale.alert.startsWith("Dữ liệu đã cũ. Không đọc được đợt sale. Cập nhật lúc") && stale.buyDisabled && stale.refreshDisabled === false, stale);
    await b.js(`window.__click("Làm mới tồn kho"); return 1;`);
    await b.waitFor(`!document.querySelector(".field__error[role=alert]") && window.__btn("Mua ngay")?.disabled === false`);
    check("Sale: làm mới thành công xóa cảnh báo cũ và mở lại mua", true);
    await b.js(`window.__faults.push({ method: "GET", match: "/orders/me", kind: "network", once: true }); history.pushState({}, "", "/orders"); dispatchEvent(new PopStateEvent("popstate")); return 1;`);
    await b.waitFor(`document.querySelector(".read-error")`);
    const ordersFirst = await b.js(`return document.querySelector(".read-error").innerText.replace(/\\s+/g, " ");`);
    await b.js(`window.__click("Thử đọc lại"); return 1;`);
    await b.waitFor(`document.querySelector(".orders__empty")`);
    await b.js(`window.__faults.push({ method: "GET", match: "/orders/me", status: 500, body: { code: "INTERNAL_ERROR", message: "Lỗi" }, once: true }); window.__click("Làm mới đơn hàng"); return 1;`);
    await b.waitFor(`document.querySelector(".field__error[role=alert]")`);
    const ordersStale = await b.js(`return { alert: document.querySelector(".field__error[role=alert]").textContent, empty: !!document.querySelector(".orders__empty"), refresh: window.__btn("Làm mới đơn hàng")?.disabled };`);
    check("/orders: lỗi lần đầu có “Thử đọc lại”; lỗi khi làm mới giữ danh sách cũ và báo “Dữ liệu đã cũ”", ordersFirst === "Không đọc được đơn hàng. Thử đọc lại" && ordersStale.alert.startsWith("Dữ liệu đã cũ. Không đọc được đơn hàng.") && ordersStale.empty && ordersStale.refresh === false, { ordersFirst, ordersStale });
    await logoutUi();
  });

  // G. Ranh giới giờ theo đồng hồ server (lệch 2 giờ so với máy): chưa mở -> mở; còn 5 giây -> khóa đúng hạn.
  await scenario("Đồng hồ", async () => {
    await b.goto(`${BASE}/login?returnTo=%2Fsales%2F${saleId}`);
    await fillTyped(user(U + 6));
    await b.waitFor(`location.pathname === "/sales/${saleId}" && window.__btn("Mua ngay")?.disabled === false`);
    const startPatch = "j => { const s = Date.parse(j.now) - 7200000; j.now = new Date(s).toISOString(); j.sale.startAt = new Date(s + 4000).toISOString(); j.sale.endAt = new Date(s + 3600000).toISOString(); return j; }";
    await b.js(`window.__faults.push({ method: "GET", match: "/api/sales/${saleId}", kind: "patch-json", patch: ${JSON.stringify(startPatch)} }); window.__click("Làm mới tồn kho"); return 1;`);
    await b.waitFor(`window.__feedback() === "Đợt sale chưa mở hoặc đã kết thúc." && window.__btn("Mua ngay").disabled`);
    const t0 = Date.now();
    const getsAtStart = await b.js(`return window.__gets("/sales/${saleId}");`);
    await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`, 9000);
    const opened = Date.now() - t0;
    check("Giờ server lệch −2h: trước startAt khóa mua “Đợt sale chưa mở…”, tự mở khi qua startAt (~4s) không cần đọc lại", opened >= 2000 && opened <= 6000 && (await b.js(`return window.__gets("/sales/${saleId}");`)) === getsAtStart, { openedAfterMs: opened });
    const endPatch = "j => { const s = Date.parse(j.now) - 7200000; j.now = new Date(s).toISOString(); j.sale.startAt = new Date(s - 3600000).toISOString(); j.sale.endAt = new Date(s + 5000).toISOString(); return j; }";
    await b.js(`window.__faults = []; window.__faults.push({ method: "GET", match: "/api/sales/${saleId}", kind: "patch-json", patch: ${JSON.stringify(endPatch)} }); window.__click("Làm mới tồn kho"); return 1;`);
    await b.waitFor(`document.querySelector("[role=timer]").textContent.endsWith("phút 5 giây") || document.querySelector("[role=timer]").textContent.endsWith("phút 4 giây")`);
    const t1 = Date.now();
    const enabledBeforeEnd = await b.js(`return window.__btn("Mua ngay").disabled === false;`);
    await b.waitFor(`window.__btn("Mua ngay").disabled && document.querySelector("[role=timer]").textContent === "0 ngày 0 giờ 0 phút 0 giây"`, 9000);
    const closed = Date.now() - t1;
    const gets = await b.js(`return window.__gets("/sales/${saleId}");`);
    await sleep(1500);
    const after = await b.js(`return { timer: document.querySelector("[role=timer]").textContent, feedback: window.__feedback(), gets: window.__gets("/sales/${saleId}"), live: document.querySelector("[role=timer]").getAttribute("aria-live") };`);
    check("Còn 5 giây theo giờ server: nút mở trước hạn, đồng hồ về 0 và khóa “Đợt sale chưa mở…” đúng hạn, không phát sinh GET", enabledBeforeEnd && closed >= 3000 && closed <= 6500 && after.timer === "0 ngày 0 giờ 0 phút 0 giây" && after.feedback === "Đợt sale chưa mở hoặc đã kết thúc." && after.gets === gets && after.live === "off", { closedAfterMs: closed, after });
    await shot("sale-ended-boundary-1440");
    await b.js(`window.__faults = []; window.__click("Làm mới tồn kho"); return 1;`);
    await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`);
    check("Bỏ lỗi tiêm: đọc lại sale thật mở mua lại", true);
    check("Ranh giới giờ không gửi POST mua nào", (await b.js(`return window.__posts();`)) === 0);
    await logoutUi();
  });

  // H. Phản hồi cũ của phiên trước: GET /orders/me và POST mua đến muộn sau khi đổi tài khoản.
  await scenario("Phiên cũ", async () => {
    const t107 = await login(user(U + 7));
    const own = await api(`/sales/${saleId}/buy?mode=v2`, { method: "POST", body: { qty: 1 } }, t107.token);
    await b.goto(`${BASE}/login?returnTo=%2Forders`);
    await fillTyped(user(U + 7));
    await b.waitFor(`document.querySelector(".order-list")`);
    await b.js(`window.__faults.push({ method: "GET", match: "/orders/me", kind: "passthrough-delayed", delay: 3000, once: true, ignoreAbort: true }); window.__click("Làm mới đơn hàng"); return 1;`);
    await logoutUi();
    await b.waitFor(`location.pathname === "/login"`);
    await fillTyped(user(U + 8));
    await b.waitFor(`location.pathname === "/orders" && document.querySelector(".orders__empty")`);
    await sleep(3500);
    const late = await b.js(`return { lateReply: window.__log.filter(e => e.fault === "passthrough-delayed").map(e => e.status), rows: document.querySelectorAll(".order").length, leaked: document.body.innerText.includes(${JSON.stringify(own.body.order.id)}), empty: !!document.querySelector(".orders__empty") };`);
    check(`GET /orders/me của ${user(U + 7)} về muộn (sau khi ${user(U + 8)} đăng nhập) không hiện trên trang ${user(U + 8)}`, late.lateReply.includes(200) && late.rows === 0 && !late.leaked && late.empty, late);
    await b.js(`history.pushState({}, "", "/sales/${saleId}"); dispatchEvent(new PopStateEvent("popstate")); return 1;`);
    await b.waitFor(`window.__btn("Mua ngay")?.disabled === false`);
    await logoutUi();
    await b.goto(`${BASE}/login?returnTo=%2Fsales%2F${saleId}`);
    await fillTyped(user(U + 9));
    await b.waitFor(`location.pathname === "/sales/${saleId}" && window.__btn("Mua ngay")?.disabled === false`);
    const postsBefore = await b.js(`return window.__posts();`);
    // Đăng xuất ngay trên CÙNG trang sale trong lúc POST còn chờ: phản hồi 201 đến sau không được áp vào trang khách.
    await b.js(`window.__faults.push({ method: "POST", match: "/buy", kind: "passthrough-delayed", delay: 3500, once: true, ignoreAbort: true }); window.__click("Mua ngay"); return 1;`);
    await b.waitFor(`window.__btn("Đang mua…")`);
    await logoutUi();
    await b.waitFor(`window.__log.some(e => e.method === "POST" && e.fault === "passthrough-delayed" && e.status)`, 8000);
    await sleep(500);
    const guest = await b.js(`return { path: location.pathname, feedback: window.__feedback(), buy: window.__btn("Mua ngay")?.disabled === false, signedOut: !!document.querySelector('a[href^="/login"]'), lateStatus: window.__log.filter(e => e.method === "POST" && e.fault === "passthrough-delayed").map(e => e.status) };`);
    const tBuyer = await login(user(U + 9));
    const oBuyer = (await api("/orders/me", {}, tBuyer.token)).body.orders;
    check(`POST mua của ${user(U + 9)} về muộn (201) sau khi đăng xuất trên cùng trang: không báo thành công cho khách, không lộ mã đơn, nút mua trở lại`, guest.lateStatus.includes(201) && guest.path === `/sales/${saleId}` && !guest.feedback?.includes("Mua thành công") && !guest.feedback?.includes(oBuyer[0]?.id ?? "-") && guest.buy && guest.signedOut && oBuyer.length === 1, { guest, buyerOrders: oBuyer.length });
    await b.js(`window.__click("Mua ngay"); return 1;`);
    await fillTyped(user(U + 10));
    await b.waitFor(`location.pathname === "/sales/${saleId}" && window.__btn("Mua ngay")?.disabled === false`);
    const tSecond = await login(user(U + 10));
    const oSecond = (await api("/orders/me", {}, tSecond.token)).body.orders;
    const page = await b.js(`return { feedback: window.__feedback(), posts: window.__posts() - ${postsBefore} };`);
    check(`${user(U + 10)} đăng nhập sau đó: nút mua mở theo đơn của chính mình, không có thông báo của phiên trước, tổng cộng 1 POST`, page.posts === 1 && !page.feedback && oSecond.length === 0, page);
    await logoutUi();
  });

  // I. Offline: chặn mọi https, ảnh/font chỉ từ localhost, giải mã và nạp được trên ba route.
  await scenario("Offline", async () => {
    await b.send("Network.setBlockedURLs", { urls: ["https://*"] });
    const t102 = await login(user(U + 2));
    await b.goto(`${BASE}/`);
    for (const [name, url, ready, signedIn] of [["login", `${BASE}/login`, `document.querySelector("#auth-email")`, false], ["sale", `${BASE}/sales/${saleId}`, saleReady, false], ["orders", `${BASE}/orders`, `document.querySelector(".order-list")`, true]]) {
      await b.js(signedIn ? `localStorage.setItem("flashsale.session", ${JSON.stringify(JSON.stringify(t102))}); return 1;` : `localStorage.clear(); return 1;`);
      b.resources.length = 0;
      await b.goto(url);
      await b.waitFor(ready);
      const state = await b.js(`
        await document.fonts.ready;
        await Promise.all([...document.images].map(i => i.decode().catch(() => null)));
        const faces = [...document.fonts].map(f => f.family.replace(/"/g, "") + ":" + f.status);
        return { faces, images: [...document.images].map(i => ({ src: new URL(i.src).pathname, ok: i.complete && i.naturalWidth > 0 })) };`);
      const external = b.resources.filter(u => !u.startsWith("http://localhost:5174/") && !u.startsWith("data:"));
      check(`Offline ${name}: không tài nguyên ngoài, font local nạp, ảnh giải mã`, external.length === 0 && state.faces.includes("Figtree:loaded") && state.images.every(i => i.ok), { external, ...state });
    }
    await b.send("Network.setBlockedURLs", { urls: [] });
    await b.js(`localStorage.clear(); return 1;`);
  });

  check("Không có lỗi console trong trang", b.consoleErrors.length === 0, b.consoleErrors.slice(0, 5));
} finally {
  writeFileSync(`${outDir}/04-05-task2-browser.json`, JSON.stringify({ results, shots }, null, 2));
  await b.close();
}
process.exitCode = results.every(r => r.ok) ? 0 : 1;
