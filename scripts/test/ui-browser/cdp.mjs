// Trình điều khiển CDP tối giản cho Edge headless (04-05): chỉ dừng đúng tiến trình Edge do chính nó khởi động.
// Không dùng cho đo tải; chạy cùng scripts/test/ui-api-fixture.mjs và `vite preview --port 5174 --strictPort`.
// Đường dẫn Edge mặc định của Windows; đặt EDGE_PATH để dùng trình duyệt Chromium khác.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const EDGE = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch(profileDir, { width = 1440, height = 900, offline = false } = {}) {
  // Hồ sơ mới mỗi lần: không mang phiên/localStorage của lượt trước.
  if (/[\\/]\.taste-skill[\\/]chrome-0405-[a-z0-9-]+$/.test(profileDir)) rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const portFile = join(profileDir, "DevToolsActivePort");
  if (existsSync(portFile)) rmSync(portFile);
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`, "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", `--window-size=${width},${height}`, "about:blank"];
  const child = spawn(EDGE, args, { stdio: "ignore" });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    if (existsSync(portFile)) port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
  }
  if (!port) { child.kill(); throw new Error("Edge không mở cổng CDP"); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
    else if (msg.method) listeners.forEach(l => l(msg));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const consoleErrors = [];
  listeners.push(msg => {
    if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") consoleErrors.push(msg.params.args.map(a => a.value ?? a.description).join(" "));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 640 });
  // Giả lập không có Internet: app chạy http://localhost nên chặn mọi https và ghi lại mọi URL tài nguyên để đối chiếu origin.
  if (offline) await send("Network.setBlockedURLs", { urls: ["https://*"] });
  const resources = [];
  listeners.push(msg => { if (msg.method === "Network.requestWillBeSent") resources.push(msg.params.request.url); });
  const api = {
    send, consoleErrors, child, resources,
    async viewport(w, h) { await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 640 }); },
    async addInit(source) { await send("Page.addScriptToEvaluateOnNewDocument", { source }); },
    async js(expression) {
      const r = await send("Runtime.evaluate", { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url) {
      const loaded = new Promise(resolve => { const l = msg => { if (msg.method === "Page.loadEventFired") { listeners.splice(listeners.indexOf(l), 1); resolve(); } }; listeners.push(l); });
      await send("Page.navigate", { url }); await loaded; await sleep(300);
    },
    async waitFor(expression, timeout = 8000) {
      const end = Date.now() + timeout;
      for (;;) {
        const value = await api.js(`const v = (${expression}); return v instanceof Node ? true : v;`).catch(() => false);
        if (value) return value;
        if (Date.now() > end) throw new Error(`Hết giờ chờ: ${expression}`);
        await sleep(100);
      }
    },
    async key(key, code = key, keyCode = 0) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, text: key === "Enter" ? "\r" : undefined });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
    },
    async type(selector, text) {
      await api.js(`const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select?.();`);
      await send("Input.insertText", { text });
    },
    async shot(path, full = false) {
      const metrics = full ? await send("Page.getLayoutMetrics") : null;
      const params = { format: "png", captureBeyondViewport: full };
      if (full) params.clip = { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 };
      const r = await send("Page.captureScreenshot", params);
      writeFileSync(path, Buffer.from(r.data, "base64"));
    },
    async close() { try { await send("Browser.close"); } catch { /* đã đóng */ } ws.close(); await sleep(300); if (child.exitCode === null) child.kill(); },
  };
  return api;
}
export { sleep };
