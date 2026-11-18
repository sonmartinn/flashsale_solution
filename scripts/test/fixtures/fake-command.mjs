import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const root = process.env.DEV_FIXTURE_ROOT;
if (!root) throw new Error("Fixture root is required");
const [tool, ...args] = process.argv.slice(2);
const cwd = basename(process.cwd());
const settings = JSON.parse(readFileSync(join(root, "settings.json"), "utf8"));
const record = (name) => appendFileSync(join(root, "calls.txt"), name + "\n");
const running = join(root, "db-running");

if (tool === "docker") {
  const command = args.join(" ");
  record(command);
  switch (command) {
    case "compose version --short":
      console.log(settings.composeVersion ?? "2.39.0");
      break;
    case "info":
      process.exitCode = settings.daemonDown ? 1 : 0;
      break;
    case "compose up -d --wait":
      if (settings.upDelay) await new Promise((resolve) => setTimeout(resolve, settings.upDelay));
      if (!settings.composeFail) writeFileSync(running, "yes");
      process.exitCode = settings.composeFail ? 86 : 0;
      break;
    case "exec flashsale-mongo mongosh flashsale --quiet --eval db.users.countDocuments()":
      console.log(settings.count ?? "0");
      process.exitCode = settings.countFail ? 4 : 0;
      break;
    case "compose ps --status running -q":
      if (existsSync(running) && readFileSync(running, "utf8") === "yes") console.log("fake-db");
      break;
    case "compose stop":
      writeFileSync(running, "no");
      break;
    default:
      throw new Error("Unexpected fake Docker arguments");
  }
} else if (tool === "npm") {
  record(cwd + " " + args.join(" "));
  if (args.join(" ") === "--version") {
    console.log("11.19.1");
  } else if (args.join(" ") === "ci" && ["backend", "frontend"].includes(cwd)) {
    mkdirSync("node_modules", { recursive: true });
    if (settings.installFail === cwd) {
      console.error("fake install failed");
      process.exitCode = 91;
    } else if (cwd === "backend") {
      mkdirSync(join("node_modules", "dotenv"), { recursive: true });
      writeFileSync(join("node_modules", "dotenv", "config.js"), "process.loadEnvFile();\n");
    }
  } else if (args.join(" ") === "run seed" && cwd === "backend") {
    writeFileSync(join(root, "settings.json"), JSON.stringify({ ...settings, count: "1001" }));
  } else if (args.join(" ") === "run dev" && ["backend", "frontend"].includes(cwd)) {
    console.log("fake dev stdout " + cwd);
    console.error("fake dev stderr " + cwd);
    if (settings.exitEarly === cwd) {
      process.exitCode = 17;
    } else {
      const server = join(process.cwd(), "child-server.mjs");
      const mode = settings.unready === cwd ? "unready" : cwd;
      const child = spawn(process.execPath, [server, mode], { stdio: "inherit", windowsHide: true });
      writeFileSync(join(root, "processes", process.pid + ".json"), JSON.stringify({
        id: process.pid, parent: process.ppid, owner: process.env.DEV_FIXTURE_OWNER, startedAt: Date.now(),
        command: '"' + process.execPath + '" "' + process.argv[1] + '" npm run dev',
      }));
      process.exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => resolve(code ?? 1));
      });
    }
  } else {
    throw new Error("Unexpected fake npm arguments");
  }
} else {
  throw new Error("Unexpected fake executable");
}
