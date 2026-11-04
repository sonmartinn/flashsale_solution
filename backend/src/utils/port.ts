import net from "node:net";

/**
 * Kiểm tra cổng còn trống bằng cách thử kết nối tới 127.0.0.1:<port> và [::1]:<port> song song.
 *
 * Vì sao không chỉ dựa vào callback lỗi của listen: server gọi listen(port) không kèm host nên bind "::".
 * Trên Windows, bind "::" vẫn THÀNH CÔNG khi một tiến trình khác đang giữ 127.0.0.1:<port> hoặc 0.0.0.0:<port>,
 * và lúc đó request tới 127.0.0.1 lại đi vào tiến trình kia. Vì vậy phải dò bằng kết nối trước khi listen.
 *
 * Kết nối được bất kỳ địa chỉ nào => cổng bận (trả false). Mọi lỗi (ECONNREFUSED, EADDRNOTAVAIL trên máy
 * không có IPv6, quá thời gian) đều coi là trống.
 */
export async function isPortFree(port: number, timeoutMs = 1000): Promise<boolean> {
  const results = await Promise.all([canConnect("127.0.0.1", port, timeoutMs), canConnect("::1", port, timeoutMs)]);
  return !results.some(Boolean);
}

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(connected);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
