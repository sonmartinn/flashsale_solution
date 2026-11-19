import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const [mode] = process.argv.slice(2);
const root = process.env.DEV_FIXTURE_ROOT;
if (!root) throw new Error("Fixture root is required");
const record = {
  id: process.pid, parent: process.ppid, startedAt: Date.now(),
  command: '"' + process.execPath + '" "' + process.argv[1] + '" ' + mode,
};
writeFileSync(join(root, "processes", process.pid + ".json"), JSON.stringify(record));

if (mode === "idle") {
  setInterval(() => {}, 1000);
} else {
  const child = mode === "foreign" ? null :
    spawn(process.execPath, [process.argv[1], "idle"], { stdio: "ignore", windowsHide: true });
  if (mode === "unready") {
    setInterval(() => {}, 1000);
  } else {
    const port = mode === "frontend" ? 5173 : 5000;
    const server = createServer((request, response) => {
      response.statusCode = port === 5000 && request.url !== "/api/health" ? 404 : 200;
      response.end("controlled fixture");
    });
    server.on("error", () => {
      child?.kill();
      process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () => {
      writeFileSync(join(root, "port-" + port + "-" + process.pid + ".json"), JSON.stringify({ ...record, port }));
      console.log("listening " + port);
    });
  }
}
