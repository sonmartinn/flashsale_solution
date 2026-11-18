// Ghi lại mọi fetch /api và cho phép tiêm lỗi có kiểm soát; chỉ trong trang, không chạm DB.
(() => {
  if (!window.__realFetch) window.__realFetch = window.fetch.bind(window);
  window.__log = window.__log || [];
  window.__faults = window.__faults || [];
  window.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    const entry = { method, url, at: Date.now(), auth: new Headers(init.headers).get("Authorization")?.slice(-12) || null, body: init.body || null };
    window.__log.push(entry);
    const fault = window.__faults.find(f => (!f.method || f.method === method) && url.includes(f.match));
    if (fault) {
      if (fault.once) window.__faults = window.__faults.filter(f => f !== fault);
      entry.fault = fault.status || fault.kind;
      if (fault.delay) await new Promise(r => setTimeout(r, fault.delay));
      if (fault.kind === "network") throw new TypeError("Failed to fetch");
      if (fault.kind === "passthrough-lost") { await window.__realFetch(input, init); throw new TypeError("Failed to fetch"); }
      return new Response(fault.text ?? JSON.stringify(fault.body ?? {}), { status: fault.status, headers: { "Content-Type": fault.text ? "text/plain" : "application/json" } });
    }
    const response = await window.__realFetch(input, init);
    entry.status = response.status;
    return response;
  };
  return "hooked";
})();
