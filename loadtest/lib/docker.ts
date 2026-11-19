// Các lệnh Docker tối thiểu cho E4. Chỉ dừng/khởi động đúng MongoDB của Flashsale.
import { spawn, spawnSync } from "node:child_process";

export const MONGO_CONTAINER = "flashsale-mongo";

export type MongoAction = "stop" | "start";

/** Chạy một trong hai thao tác an toàn của E4, không qua shell. */
export function dockerMongo(action: MongoAction, timeoutMs = 60_000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("docker", [action, MONGO_CONTAINER], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, out });
    };
    child.stdout.setEncoding("utf8").on("data", (data: string) => (out += data));
    child.stderr.setEncoding("utf8").on("data", (data: string) => (out += data));
    const timer = setTimeout(() => {
      out += "\n[harness] docker quá thời gian, đã dừng tiến trình";
      child.kill();
      finish(null);
    }, timeoutMs);
    child.once("error", (err) => {
      out += `\n[harness] không chạy được docker: ${err.message}`;
      finish(null);
    });
    child.once("close", (code) => finish(code));
  });
}

/** Kiểm tra riêng container MongoDB của Flashsale có đang chạy hay không. */
export function mongoContainerRunning(): boolean {
  const result = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", MONGO_CONTAINER], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  return result.error === undefined && result.status === 0 && result.stdout.trim() === "true";
}
