import { spawnSync } from "node:child_process";
import { mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--integration")) {
  console.error("Cách chạy: node scripts/test/run-backend-checks.mjs [--integration]");
  process.exitCode = 1;
} else {
  const directory = await mkdtemp(join(tmpdir(), "flashsale-backend-checks-"));
  const emptyConfig = join(directory, "empty.env");
  try {
    await writeFile(emptyConfig, "", { flag: "wx" });
    const testScript = args.length === 1 ? "test:int" : "test";
    const windows = process.platform === "win32";
    const result = spawnSync(windows ? (process.env.ComSpec ?? "cmd.exe") : "npm",
      windows ? ["/d", "/s", "/c", `npm.cmd run ${testScript}`] : ["run", testScript], {
        cwd: fileURLToPath(new URL("../../backend/", import.meta.url)),
        env: { ...process.env, DOTENV_CONFIG_PATH: emptyConfig },
        stdio: "inherit",
        windowsHide: true,
      });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
  } finally {
    await rm(emptyConfig, { force: true });
    await rmdir(directory);
  }
}
