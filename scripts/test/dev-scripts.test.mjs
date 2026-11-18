import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { delimiter, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = fileURLToPath(new URL("../", import.meta.url));
const repo = resolve(scripts, "..");
const system = process.env.SystemRoot ?? "C:\\Windows";
const powershell = join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const psFiles = ["start.ps1", "stop.ps1", "dev-common.ps1", "dev-runner.ps1"];
const ports = [5000, 5173];

// CIM is unavailable in some restricted Windows runners. Only the provider is
// simulated there. Launch, listener checks, creation times and taskkill stay real.
const bootstrap = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$fixtureRoot = $env:DEV_FIXTURE_ROOT
$realCim = $true
try {
    Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction Stop | Out-Null
} catch [Microsoft.Management.Infrastructure.CimException] {
    if ($_.CategoryInfo.Category -ne "PermissionDenied") { throw }
    $realCim = $false
}

function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory, $RedirectStandardOutput, $RedirectStandardError, $WindowStyle, [switch]$PassThru)
    $desktopLocations = @(
        (Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"),
        (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe")
    )
    foreach ($desktopFile in $desktopLocations) {
        if ($FilePath -eq [WildcardPattern]::Escape($desktopFile)) {
            if (-not [IO.File]::Exists($desktopFile) -or $WindowStyle -ne "Hidden" -or $PassThru) { throw "Unexpected Docker Desktop invocation" }
            [IO.File]::WriteAllText((Join-Path $fixtureRoot "desktop-started"), $desktopFile)
            return
        }
    }
    if ($FilePath -ne (Join-Path $PSHOME "powershell.exe") -or $WindowStyle -ne "Hidden" -or -not $PassThru -or
        $ArgumentList -notmatch " -Owner ([a-f0-9]{32}) ") { throw "Unexpected fixture process" }
    $owner = $Matches[1]
    $env:DEV_FIXTURE_OWNER = $owner
    try {
        $p = Microsoft.PowerShell.Management\Start-Process @PSBoundParameters
        $record = @{
            id = $p.Id; parent = $PID; owner = $owner; command = '"' + $FilePath + '" ' + $ArgumentList
            creation = $p.StartTime.ToUniversalTime().Ticks.ToString()
        }
        $record | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $fixtureRoot "processes\$($p.Id).json") -Encoding UTF8
        return $p
    } finally {
        Remove-Item Env:DEV_FIXTURE_OWNER -ErrorAction SilentlyContinue
    }
}

function Get-CimInstance {
    param($ClassName, $Filter, $ErrorAction)
    if ($realCim) {
        return CimCmdlets\Get-CimInstance @PSBoundParameters
    }
    if ($ClassName -ne "Win32_Process" -or $Filter -notmatch "^ProcessId = ([0-9]+)$") { throw "Unexpected fixture CIM query" }
    $idValue = [int]$Matches[1]
    $p = Get-Process -Id $idValue -ErrorAction SilentlyContinue
    if (-not $p) { return }
    try {
        $started = $p.StartTime
        if (-not $started) { return }
        $creation = $started.ToUniversalTime()
        $recordPath = Join-Path $fixtureRoot "processes\$idValue.json"
        $record = $null
        if ([IO.File]::Exists($recordPath)) {
            $record = [IO.File]::ReadAllText($recordPath) | ConvertFrom-Json
            if ($record.creation -and $record.creation -ne $creation.Ticks.ToString()) { return }
            if ($record.startedAt) {
                $age = $record.startedAt - ([DateTimeOffset]$creation).ToUnixTimeMilliseconds()
                if ($age -lt 0 -or $age -gt 5000) { return }
            }
        }
        $parentId = $record.parent
        if ($record.owner -and $p.ProcessName -eq "node") {
            # npm.cmd thêm một cmd.exe giữa runner và tiến trình npm của fixture.
            $owners = Get-ChildItem -LiteralPath (Join-Path $fixtureRoot "processes") -Filter "*.json" |
                ForEach-Object { [IO.File]::ReadAllText($_.FullName) | ConvertFrom-Json }
            $parentId = ($owners | Where-Object { $_.owner -eq $record.owner -and $_.creation } | Select-Object -First 1).id
        }
        [pscustomobject]@{
            Name = $p.ProcessName + ".exe"; ProcessId = $p.Id; ParentProcessId = $parentId
            CommandLine = $record.command; CreationDate = $creation
        }
    } catch [System.InvalidOperationException] {
        # Tiến trình đã thoát giữa Get-Process và StartTime.
    } finally {
        $p.Dispose()
    }
}

function netstat.exe {
    $rows = & (Join-Path $env:SystemRoot "System32\netstat.exe") @args
    $rows
    if ($realCim -or $LASTEXITCODE -ne 0) { return }
    # Một số runner giới hạn bỏ mục khỏi netstat. Chỉ bổ sung cổng fixture
    # đã bind thành công, PID còn sống và socket vẫn nhận được kết nối thật.
    foreach ($file in (Get-ChildItem -LiteralPath $fixtureRoot -Filter "port-*.json")) {
        $binding = [IO.File]::ReadAllText($file.FullName) | ConvertFrom-Json
        if ($rows -match (":{0}\s+0\.0\.0\.0:0\s+\S+\s+{1}\s*$" -f $binding.port,$binding.id)) { continue }
        $listener = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($binding.id)"
        if (-not $listener -or $listener.CommandLine -ne $binding.command) { continue }
        $tcp = [Net.Sockets.TcpClient]::new()
        try {
            if ($tcp.ConnectAsync("127.0.0.1", $binding.port).Wait(300) -and $tcp.Connected) {
                "  TCP    127.0.0.1:$($binding.port)  0.0.0.0:0  LISTENING  $($binding.id)"
            }
        } catch [System.AggregateException] {
            # Socket vừa đóng.
        } finally {
            $tcp.Dispose()
        }
    }
}

function taskkill.exe {
    $idValue = [int]$args[1]
    if (-not [IO.File]::Exists((Join-Path $fixtureRoot "processes\$idValue.json"))) { throw "Unexpected fixture PID" }
    $before = @()
    if (-not $realCim) {
        $before = @(Get-ChildItem -LiteralPath (Join-Path $fixtureRoot "processes") -Filter "*.json" |
            ForEach-Object { [IO.File]::ReadAllText($_.FullName) | ConvertFrom-Json } |
            ForEach-Object { Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($_.id)" })
    }
    $ErrorActionPreference = "Continue"
    & (Join-Path $env:SystemRoot "System32\taskkill.exe") @args *> $null
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $realCim -and $idValue -in $before.ProcessId) {
        # Trong sandbox, taskkill có thể thiếu quyền duyệt cây. Chỉ dừng các PID fixture
        # đã ghi nhận trước lệnh, đúng quan hệ cha con và đúng thời điểm tạo.
        $queue = @($idValue)
        for ($i = 0; $i -lt $queue.Count; $i++) {
            $queue += @($before | Where-Object ParentProcessId -eq $queue[$i] | ForEach-Object ProcessId)
        }
        [array]::Reverse($queue)
        foreach ($childId in $queue) {
            $p = Get-Process -Id $childId -ErrorAction SilentlyContinue
            if (-not $p) { continue }
            try {
                $old = $before | Where-Object ProcessId -eq $childId | Select-Object -First 1
                $started = $p.StartTime
                if ($started -and $started.ToUniversalTime() -eq $old.CreationDate) {
                    Stop-Process -InputObject $p -Force -ErrorAction Stop
                }
            } catch [System.InvalidOperationException] {
                # taskkill đã dừng tiến trình này.
            } finally {
                $p.Dispose()
            }
        }
        [IO.File]::WriteAllText((Join-Path $fixtureRoot "taskkill-fallback"), "yes")
        $code = 0
    }
    $global:LASTEXITCODE = $code
}

if (-not $realCim) { Write-Host "Fixture CIM: mô phỏng" }
$entry = Join-Path $fixtureRoot ("scripts\" + $env:DEV_FIXTURE_ENTRY + ".ps1")
$flags = @{}
if ($env:DEV_FIXTURE_FLAG) { $flags[$env:DEV_FIXTURE_FLAG] = $true }
& $entry @flags
exit $LASTEXITCODE
`;

function runPowerShell(env, command = bootstrap) {
  const encoded = Buffer.from(command, "utf16le").toString("base64");
  const child = spawn(powershell, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-OutputFormat", "Text", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded,
  ], { cwd: system, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolveRun, reject) => {
    let output = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", async (code) => {
      // A detached Windows child may still hold a copy of a pipe handle.
      await delay(30);
      child.stdout.destroy();
      child.stderr.destroy();
      const errors = [...stderr.matchAll(/<S S="Error">(.*?)<\/S>/gs)].map((match) => match[1]);
      resolveRun({ code, output: output + (stderr.startsWith("#< CLIXML") ? errors.join("\n") : stderr) });
    });
  });
}

async function assertPortsFree() {
  for (const port of ports) {
    const server = createServer();
    await new Promise((resolveListen, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port, exclusive: true }, resolveListen);
    });
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
}

async function until(check, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail(label);
}

function alive(id) {
  try {
    process.kill(id, 0);
    return true;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    return false;
  }
}

async function fixture(t, initial = {}) {
  await assertPortsFree();
  const temp = await mkdtemp(join(repo, "dt-"));
  const root = join(temp, "Dữ liệu [dev] (thử)");
  const path = (...parts) => join(root, ...parts);
  const env = {
    SystemRoot: system,
    WINDIR: system,
    ComSpec: join(system, "System32", "cmd.exe"),
    Path: [path("bin"), join(system, "System32"), system].join(delimiter),
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    TEMP: temp,
    TMP: temp,
    LOCALAPPDATA: path("local-app"),
    ProgramFiles: path("program-files"),
    DEV_FIXTURE_ROOT: root,
    DEV_FIXTURE_NODE: process.execPath,
    DEV_FIXTURE_VERSION: "v24.22.1",
  };
  for (const name of ["scripts", "bin", "backend", "frontend", "processes", "local-app", "program-files"]) {
    await mkdir(path(name), { recursive: true });
  }
  for (const file of psFiles) await copyFile(join(scripts, file), path("scripts", file));
  await copyFile(join(scripts, "test", "fixtures", "fake-command.mjs"), path("bin", "fake-command.mjs"));
  for (const name of ["backend", "frontend"]) {
    await copyFile(join(scripts, "test", "fixtures", "child-server.mjs"), path(name, "child-server.mjs"));
    await writeFile(path(name, "package-lock.json"), "{}");
  }
  await copyFile(join(repo, "backend", ".env.example"), path("backend", ".env.example"));
  await writeFile(path("settings.json"), JSON.stringify(initial));
  await writeFile(path("calls.txt"), "");
  for (const tool of ["npm", "docker"]) {
    await writeFile(path("bin", tool + ".cmd"), '@echo off\r\n"%DEV_FIXTURE_NODE%" "%~dp0fake-command.mjs" ' + tool + ' %*\r\n');
  }
  await writeFile(path("bin", "node.cmd"), [
    "@echo off",
    'if "%~1"=="--version" (echo %DEV_FIXTURE_VERSION%& exit /b 0)',
    '"%DEV_FIXTURE_NODE%" %*',
    "",
  ].join("\r\n"));

  const run = (entry, flag = "", extraEnv = {}) => runPowerShell({
    ...env, ...extraEnv, DEV_FIXTURE_ENTRY: entry, DEV_FIXTURE_FLAG: flag,
  });
  async function processRecords() {
    const files = await readdir(path("processes"));
    return Promise.all(files.map(async (file) => JSON.parse(
      (await readFile(path("processes", file), "utf8")).replace(/^\uFEFF/, ""),
    )));
  }
  t.after(async () => {
    const active = (await processRecords()).filter((record) => alive(record.id));
    if (active.length > 0) await run("stop", "KeepDb");
    await until(async () => (await processRecords()).every((record) => !alive(record.id)), "Fixture processes leaked");
    assert.equal(resolve(temp, ".."), repo);
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  });
  return {
    env, path, run, processRecords,
    runProbe: (probe) => runPowerShell(env, bootstrap.slice(0, bootstrap.lastIndexOf("$entry = ")) + probe),
    settings: (settings) => writeFile(path("settings.json"), JSON.stringify(settings)),
    calls: async () => (await readFile(path("calls.txt"), "utf8")).trim().split(/\r?\n/).filter(Boolean),
    read: (...parts) => readFile(path(...parts), "utf8"),
  };
}

function assertFailure(result, reason) {
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, reason);
  return result.output;
}

function assertOk(result) {
  assert.equal(result.code, 0, result.output);
  return result.output;
}

async function assertTreeStopped(f) {
  const records = await f.processRecords();
  assert.ok(records.filter((record) => record.parent).length >= 8, "fixture must launch real process trees");
  await until(() => records.every((record) => !alive(record.id)), "A recorded fixture process survived stop");
  await assertPortsFree();
}

test("Windows start -> idempotent start -> stop -> restart skips install and seed", { skip: process.platform !== "win32", timeout: 120_000 }, async (t) => {
  const f = await fixture(t, { composeVersion: "5.4.0" });
  const started = assertOk(await f.run("start"));
  assert.deepEqual([...started.matchAll(/\[(\d+)\/10]/g)].map((match) => Number(match[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.match(started, /http:\/\/localhost:5173/);
  assert.match(started, /http:\/\/localhost:5000\/api\/health/);
  assert.match(started, /Get-Content -LiteralPath .*api\.log.* -Wait/);
  assert.match(started, /stop\.ps1/);
  const env = await f.read("backend", ".env");
  const secret = env.match(/^JWT_SECRET=([a-f0-9]{64})\r?$/m)?.[1];
  assert.equal(typeof secret, "string", "must generate 32 bytes of secret");
  assert.equal(started.includes(secret), false, "must not echo the secret");
  const roots = await Promise.all(["api", "web"].map(async (service) => {
    const id = await f.read(".dev", service + ".pid");
    assert.match(id, /^\d+$/);
    assert.ok(alive(Number(id)), service + " wrapper survives the start process");
    const log = await f.read(".dev", "logs", service + ".log");
    assert.match(log, /fake dev stdout/);
    assert.match(log, /fake dev stderr/);
    assert.equal(log.includes(secret), false, "must not log the secret");
    return id;
  }));
  assert.equal((await fetch("http://127.0.0.1:5000/api/health")).status, 200);
  assert.equal((await fetch("http://127.0.0.1:5173")).status, 200);
  assert.match(assertOk(await f.run("start")), /đang chạy/);
  assert.deepEqual(await Promise.all(["api", "web"].map((service) => f.read(".dev", service + ".pid"))), roots);
  assert.equal((await f.calls()).filter((call) => call.endsWith("run dev")).length, 2);

  const staleOwners = await Promise.all(["api", "web"].map((service) => f.read(".dev", service + ".owner.json")));
  const stopped = assertOk(await f.run("stop"));
  assert.deepEqual([...stopped.matchAll(/\[(\d+)\/4]/g)].map((match) => Number(match[1])), [1, 2, 3, 4]);
  await assertTreeStopped(f);
  assert.equal(await f.read("db-running"), "no");
  for (const [index, service] of ["api", "web"].entries()) {
    await writeFile(f.path(".dev", service + ".pid"), roots[index]);
    await writeFile(f.path(".dev", service + ".owner.json"), staleOwners[index]);
  }
  assertOk(await f.run("start"));
  for (const [index, service] of ["api", "web"].entries()) {
    assert.notEqual(await f.read(".dev", service + ".owner.json"), staleOwners[index], "dead PID record must be replaced");
  }
  const calls = await f.calls();
  assert.equal(calls.filter((call) => call.endsWith(" ci")).length, 2);
  assert.equal(calls.filter((call) => call.endsWith("run seed")).length, 1);
  assert.equal(calls.filter((call) => call.endsWith("run dev")).length, 4);
  assert.equal((await f.read("backend", ".env")) === env, true, "existing env must be preserved");
  assertOk(await f.run("stop"));
  await assertTreeStopped(f);
});

test("one lifecycle lock excludes two starts and a stop racing the owner", { skip: process.platform !== "win32", timeout: 120_000 }, async (t) => {
  const f = await fixture(t, { upDelay: 7000, count: "8" });
  const first = f.run("start");
  await until(async () => (await f.calls()).includes("compose up -d --wait"), "first start did not reach Docker");
  const [second, stop] = await Promise.all([f.run("start"), f.run("stop")]);
  for (const result of [second, stop]) {
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Một lệnh start\/stop đang chạy/);
  }
  assertOk(await first);
  assert.equal((await f.calls()).filter((call) => call.endsWith("run dev")).length, 2);
  assert.equal((await f.calls()).includes("compose stop"), false);
  assertOk(await f.run("stop"));
  await assertTreeStopped(f);
});

const windows = { skip: process.platform !== "win32", timeout: 180_000 };

test("Windows PowerShell 5.1 parses UTF-8 BOM/CRLF scripts and Git resolves dev file policies", windows, async () => {
  for (const file of psFiles) {
    const bytes = await readFile(join(scripts, file));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], file + " UTF-8 BOM");
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assert.doesNotMatch(body.replaceAll("\r\n", ""), /[\r\n]/, file + " CRLF");
  }
  const locals = { ...process.env, DEV_FIXTURE_SCRIPT_DIR: scripts };
  const parser = await runPowerShell(locals, String.raw`
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw "Windows PowerShell 5.1 required" }
foreach ($file in "start.ps1","stop.ps1","dev-common.ps1","dev-runner.ps1") {
    $parseErrors = $null
    $tokens = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $env:DEV_FIXTURE_SCRIPT_DIR $file), [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw "$file has parse errors: $($parseErrors -join ', ')" }
    Write-Output "$file PASS"
}
`);
  assert.equal(parser.code, 0, parser.output);
  for (const file of psFiles) assert.ok(parser.output.includes(file + " PASS"), parser.output);

  const attrs = await readFile(join(repo, ".gitattributes"), "utf8");
  for (const rule of ["loadtest/results/*.csv text eol=lf", "*.sh text eol=lf", "*.ps1 text eol=crlf"]) {
    assert.ok(attrs.split(/\r?\n/).includes(rule));
  }
  const git = spawnSync("git", ["check-ignore", "--", ".dev/api.pid"], { cwd: repo, encoding: "utf8", windowsHide: true });
  assert.equal(git.status, 0, git.stderr);
  assert.equal(git.stdout.trim(), ".dev/api.pid");
});

test("help has no side effects and missing tools stop before Docker or config", windows, async (t) => {
  const f = await fixture(t);
  assert.match(assertOk(await f.run("start", "Help")), /-Seed.*xóa dữ liệu/);
  assert.match(assertOk(await f.run("stop", "Help")), /-KeepDb.*giữ/);
  await assert.rejects(access(f.path(".dev")), { code: "ENOENT" });
  assert.deepEqual(await f.calls(), []);
  for (const [file, display] of [["node.cmd", "node"], ["npm.cmd", "npm.cmd"], ["docker.cmd", "docker"]]) {
    const executable = await readFile(f.path("bin", file));
    await unlink(f.path("bin", file));
    assertFailure(await f.run("start"), new RegExp("Thiếu " + display));
    await writeFile(f.path("bin", file), executable);
  }
  await assert.rejects(access(f.path("backend", ".env")), { code: "ENOENT" });
  assert.deepEqual(await f.calls(), []);
});

test("Node 20.18/21/22.11 are rejected, 20.19/22.12/24 reach Docker, Compose v1 is refused", windows, async (t) => {
  const f = await fixture(t);
  for (const version of ["v20.18.3", "v21.9.0", "v22.11.9"]) {
    assertFailure(await f.run("start", "", { DEV_FIXTURE_VERSION: version }), /Node\.js .*không tương thích/);
  }
  assert.deepEqual(await f.calls(), []);
  await f.settings({ daemonDown: true });
  for (const version of ["v20.19.0", "v22.12.0", "v24.0.0"]) {
    assertFailure(await f.run("start", "", { DEV_FIXTURE_VERSION: version }), /không tìm thấy Docker Desktop/);
  }
  await f.settings({ composeVersion: "1.29.2" });
  assertFailure(await f.run("start"), /Cần Docker Compose v2/);
  assert.equal((await f.calls()).includes("compose up -d --wait"), false);
});

test("daemon off: try both Docker Desktop locations and respect the 120-second timeout", { ...windows, timeout: 240_000 }, async (t) => {
  const f = await fixture(t, { daemonDown: true, daemonReadyAfterDesktop: true, composeFail: true });
  assertFailure(await f.run("start"), /không tìm thấy Docker Desktop/);
  const paths = [
    f.path("local-app", "Programs", "DockerDesktop", "Docker Desktop.exe"),
    f.path("program-files", "Docker", "Docker", "Docker Desktop.exe"),
  ];
  for (const path of paths) {
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, "fixture placeholder");
    assertFailure(await f.run("start"), /cổng MongoDB 27018, Redis 6379/);
    assert.equal(await f.read("desktop-started"), path);
    await unlink(path);
    await unlink(f.path("desktop-started"));
  }
  await writeFile(paths[1], "fixture placeholder");
  await f.settings({ daemonDown: true });
  const started = performance.now();
  assertFailure(await f.run("start"), /Hết thời gian chờ Docker Desktop/);
  assert.ok(performance.now() - started >= 119_000, "daemon must be given its specified readiness window");
  await assert.rejects(access(f.path("backend", ".env")), { code: "ENOENT" });
});

test("changed lock reinstalls only that package and failed install leaves no success marker", windows, async (t) => {
  const f = await fixture(t, { count: "12" });
  assertOk(await f.run("start"));
  assertOk(await f.run("stop", "KeepDb"));
  assert.equal(await f.read("db-running"), "yes");
  assert.equal((await f.calls()).includes("compose stop"), false);

  await writeFile(f.path("frontend", "package-lock.json"), '{"changed":true}');
  await f.settings({ count: "12", installFail: "frontend" });
  assertFailure(await f.run("start"), /npm ci thất bại ở frontend.*91/);
  await assert.rejects(access(f.path(".dev", "frontend.lock.sha256")), { code: "ENOENT" });
  const calls = await f.calls();
  assert.equal(calls.filter((line) => line === "backend ci").length, 1);
  assert.equal(calls.filter((line) => line === "frontend ci").length, 2);
  assert.equal(calls.filter((line) => line.endsWith("run dev")).length, 2);
  await f.settings({ count: "12" });
  assertOk(await f.run("start"));
  assert.match(await f.read(".dev", "frontend.lock.sha256"), /^[a-f0-9]{64}$/i);
  assertOk(await f.run("stop"));
  assert.match(assertOk(await f.run("stop")), /Không có gì để dừng/);
  assert.equal((await f.calls()).filter((line) => line === "frontend ci").length, 3);
  await assertTreeStopped(f);
});

test("failed, malformed or unsafe DB count never seeds, explicit -Seed warns and runs", windows, async (t) => {
  const f = await fixture(t);
  for (const settings of [{ count: "0", countFail: true }, { count: "1.2" }, { count: "-1" }, { count: "0\n17" }, { count: "" }]) {
    await f.settings(settings);
    assertFailure(await f.run("start"), /Không đếm được người dùng/);
  }
  await f.settings({ count: "0" });
  const fakeEnv = Buffer.from("MONGODB_URI=mongodb://127.0.0.1:27018/fixture_other\r\nREDIS_URL=redis://127.0.0.1:6379\r\nJWT_SECRET=fixture-existing-secret\r\n");
  await writeFile(f.path("backend", ".env"), fakeEnv);
  const output = assertFailure(await f.run("start"), /Cấu hình MongoDB hoặc Redis khác/);
  assert.equal(output.includes("fixture-existing-secret"), false);
  assert.equal((await f.calls()).some((call) => call.endsWith("run seed")), false);

  await f.settings({ count: "1001" });
  assert.match(assertOk(await f.run("start", "Seed")), /CẢNH BÁO.*-Seed sẽ xóa dữ liệu/);
  assert.equal((await f.calls()).filter((call) => call.endsWith("run seed")).length, 1);
  assert.equal((await readFile(f.path("backend", ".env"))).equals(fakeEnv), true);
  assertOk(await f.run("stop"));
  await assertTreeStopped(f);
});

test("a stale or reused PID and similar-root listener survive start and stop", windows, async (t) => {
  const f = await fixture(t);
  const similar = f.path("..", "Dữ liệu [dev] (thử)-khác", "backend");
  await mkdir(similar, { recursive: true });
  const server = join(similar, "child-server.mjs");
  await copyFile(join(scripts, "test", "fixtures", "child-server.mjs"), server);
  const foreign = spawn(process.execPath, [server, "foreign"], { env: f.env, stdio: "ignore", windowsHide: true });
  const foreignExited = new Promise((resolveExit) => foreign.once("exit", resolveExit));
  try {
    await until(async () => {
      try { await access(f.path("port-5000-" + foreign.pid + ".json")); return true; }
      catch (error) { if (error.code === "ENOENT") return false; throw error; }
    }, "foreign controlled node did not listen");
    await mkdir(f.path(".dev"), { recursive: true });
    for (const service of ["api", "web"]) {
      await writeFile(f.path(".dev", service + ".pid"), String(foreign.pid));
      await writeFile(f.path(".dev", service + ".owner.json"), JSON.stringify({
        Id: foreign.pid, Creation: "1", Token: "f".repeat(32),
      }));
    }
    const expected = new RegExp("Cổng 5000.*PID " + foreign.pid + " \\(node\\)");
    assertFailure(await f.run("start"), expected);
    assertFailure(await f.run("stop", "KeepDb"), expected);
    assert.ok(alive(foreign.pid), "foreign Node must survive mismatched root and stale sidecar");
    assert.equal((await f.calls()).includes("compose up -d --wait"), false);
  } finally {
    foreign.kill();
    await foreignExited;
  }
  assertOk(await f.run("start"));
  assertOk(await f.run("stop"));
  await assertPortsFree();
});

test("a damaged owner identity cannot claim a live pair, and missing PID/sidecar fallback frees both trees", windows, async (t) => {
  const f = await fixture(t, { count: "4" });
  assertOk(await f.run("start"));
  const apiOwner = JSON.parse(await f.read(".dev", "api.owner.json"));
  const webOwner = JSON.parse(await f.read(".dev", "web.owner.json"));
  await writeFile(f.path(".dev", "api.owner.json"), JSON.stringify({ ...apiOwner, Creation: "1" }));
  await writeFile(f.path(".dev", "web.owner.json"), JSON.stringify({ ...webOwner, Token: "b".repeat(32) }));
  const badStart = assertFailure(await f.run("start"), /Cổng dev đang bận|chỉ đang chạy một phần/);
  assert.doesNotMatch(badStart, /Backend và frontend đang chạy/);
  assert.equal((await f.calls()).filter((call) => call.endsWith("run dev")).length, 2);
  for (const service of ["api", "web"]) {
    await unlink(f.path(".dev", service + ".pid"));
    await unlink(f.path(".dev", service + ".owner.json"));
  }
  assertOk(await f.run("stop"));
  await assertTreeStopped(f);
});

test("a partial already-owned run is diagnosed and its live backend is preserved", windows, async (t) => {
  const f = await fixture(t, { count: "4" });
  assertOk(await f.run("start"));
  const apiPid = Number(await f.read(".dev", "api.pid"));
  assertOk(await f.runProbe(String.raw`
. (Join-Path $fixtureRoot "scripts\dev-common.ps1")
$webRoot = Get-OwnedRunner (Get-DevRecord "web") "web"
if (-not (Stop-VerifiedTree $webRoot)) { exit 1 }
exit 0
`));
  assertFailure(await f.run("start"), /chỉ đang chạy một phần/);
  assert.ok(alive(apiPid), "startup error must preserve the pre-existing backend");
  assert.equal((await f.calls()).filter((call) => call.endsWith("run dev")).length, 2);
  assertOk(await f.run("stop"));
  await assertTreeStopped(f);
});

for (const [packageName, service] of [["backend", "api"], ["frontend", "web"]]) {
  test(packageName + " exits early and only newly launched processes are cleaned up", windows, async (t) => {
    const f = await fixture(t, { count: "3", exitEarly: packageName });
    const out = assertFailure(await f.run("start"), new RegExp("tiến trình " + service, "i"));
    assert.match(out, /fake dev stderr/);
    assert.match(out, /mã 17/);
    await assertPortsFree();
    assert.equal(await f.read("db-running"), "yes");
    assert.equal((await f.calls()).includes("compose stop"), false);
  });
}

test("readiness timeout prints canonical logs and cleans the full startup trees", windows, async (t) => {
  const f = await fixture(t, { count: "3", unready: "frontend" });
  const started = performance.now();
  const out = assertFailure(await f.run("start"), /Hết thời gian chờ dịch vụ .*web/);
  assert.ok(performance.now() - started >= 29_000);
  assert.match(out, /web\.log/);
  assert.match(out, /fake dev stderr frontend/);
  assert.doesNotMatch(out, /Frontend: http/);
  await assertTreeStopped(f);
});

// ---------------- Cặp script macOS (bash 3.2) ----------------
// Các kiểm tra dưới đây chứng minh cú pháp, tương thích bash 3.2 theo quét tĩnh, logic sở hữu
// nhóm tiến trình với ps/lsof/kill giả và (trên máy POSIX) vòng đời thật. Không ca nào là
// bằng chứng runtime macOS: máy dự án là Windows, macOS ghi là UNTESTED trong README.

const shFiles = ["start.sh", "stop.sh", "dev-common.sh"];
const shEntries = ["start.sh", "stop.sh"];
const shFixtures = ["shell-guards.sh", "posix-lifecycle.sh"];
const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";

function findBash() {
  if (process.platform !== "win32") return "bash";
  return spawnSync(gitBash, ["--version"], { windowsHide: true }).status === 0 ? gitBash : null;
}

function runShell(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolveRun({ code, output }));
  });
}

// Bỏ chú thích và chuỗi trong nháy đơn trước khi quét cú pháp cấm.
function shellCode(text) {
  return text.split("\n").map((line) => line.replace(/'[^']*'/g, "''").replace(/(^|\s)#.*$/, "$1")).join("\n");
}

function functionBody(text, name) {
  const start = text.indexOf("\n" + name + "() {\n");
  assert.notEqual(start, -1, "missing function " + name);
  return text.slice(start, text.indexOf("\n}\n", start));
}

test("shell scripts: LF, shebang, strict mode, bash 3.2 constructs, Git modes and attributes", async () => {
  const forbidden = [
    [/\b(declare|local|typeset)\s+-[a-zA-Z]*A/, "mảng kết hợp"],
    [/\b(mapfile|readarray|coproc)\b/, "mapfile/readarray/coproc"],
    [/\$\{[#!]?[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?(,,?|\^\^?)\}/, "${var,,} / ${var^^}"],
    [/\bsetsid\b/, "setsid (macOS không có)"],
    [/\bsed\s+(-[a-zA-Z]*\s+)*-i\b/, "sed -i"],
    [/&>>|\|&/, "&>> hoặc |&"],
    [/\b(declare|local)\s+-n\b/, "nameref"],
    [/\bwait\s+-n\b/, "wait -n"],
    [/\b(EPOCHSECONDS|EPOCHREALTIME|BASHPID)\b/, "biến của bash 4/5"],
    [/@[QEPAa]\}/, "${var@Q}"],
    [/\[\[\s+-v\b|\btest\s+-v\b/, "-v"],
    [/;;&|;&\s*$/m, "case ;& / ;;&"],
    [/\b(readlink|realpath)\s+-[a-zA-Z]*[fem]\b|\brealpath\b/, "readlink -f / realpath"],
    [/\bstat\s+-c\b|\bdate\s+-d\b|\bgrep\s+-[a-zA-Z]*P\b|\btimeout\s+\d/, "công cụ GNU riêng"],
    [/\{[A-Za-z_][A-Za-z0-9_]*\}[<>]/, "fd có tên {fd}>"],
    [/printf\s+['"]?%\(/, "printf %(...)T"],
  ];
  for (const file of shFiles) {
    const bytes = await readFile(join(scripts, file));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], file + " không được có BOM");
    const text = bytes.toString("utf8");
    assert.equal(text.includes("\r"), false, file + " phải dùng LF");
    const code = shellCode(text);
    for (const [pattern, label] of forbidden) assert.doesNotMatch(code, pattern, file + ": " + label);
  }
  for (const file of shEntries) {
    const text = await readFile(join(scripts, file), "utf8");
    assert.equal(text.split("\n")[0], "#!/usr/bin/env bash", file + " shebang");
    assert.ok(text.split("\n").includes("set -euo pipefail"), file + " set -euo pipefail");
    assert.match(text, /^for arg in \$\{1\+"\$@"\}; do$/m, file + " lặp tham số an toàn với set -u của bash 3.2");
  }
  const staged = spawnSync("git", ["ls-files", "-s", "--", ...shFiles.map((file) => "scripts/" + file)], { cwd: repo, encoding: "utf8", windowsHide: true });
  assert.equal(staged.status, 0, staged.stderr);
  const modes = Object.fromEntries(staged.stdout.trim().split(/\r?\n/).map((line) => [line.split("\t")[1], line.split(" ")[0]]));
  for (const file of shEntries) assert.equal(modes["scripts/" + file], "100755", file + " phải có quyền thực thi trong Git");
  assert.ok(modes["scripts/dev-common.sh"], "dev-common.sh phải được Git theo dõi");
  const attrs = spawnSync("git", ["check-attr", "eol", "--", "scripts/start.sh", "scripts/stop.sh", "scripts/dev-common.sh", "scripts/start.ps1"], { cwd: repo, encoding: "utf8", windowsHide: true });
  assert.equal(attrs.status, 0, attrs.stderr);
  for (const file of shFiles) assert.match(attrs.stdout, new RegExp("scripts/" + file.replace(".", "\\.") + ": eol: lf"));
  assert.match(attrs.stdout, /scripts\/start\.ps1: eol: crlf/);
});

test("bash -n parses each shell file; shellcheck only if already installed", async (t) => {
  const bash = findBash();
  if (!bash) {
    t.skip("không có bash (Git Bash) trên máy Windows này");
    return;
  }
  const version = spawnSync(bash, ["-c", "echo $BASH_VERSION"], { encoding: "utf8", windowsHide: true }).stdout.trim();
  t.diagnostic("bash " + version + ": bằng chứng cú pháp, không phải runtime bash 3.2 của macOS");
  for (const file of [...shFiles.map((name) => join(scripts, name)), ...shFixtures.map((name) => join(scripts, "test", "fixtures", name))]) {
    const parsed = spawnSync(bash, ["-n", file], { encoding: "utf8", windowsHide: true });
    assert.equal(parsed.status, 0, file + "\n" + parsed.stderr);
  }
  const shellcheck = spawnSync("shellcheck", ["--version"], { encoding: "utf8", windowsHide: true });
  if (shellcheck.error) {
    t.diagnostic("shellcheck không có trên máy: không chạy và không tự cài");
    return;
  }
  const linted = spawnSync("shellcheck", ["-s", "bash", "-x", ...shFiles.map((name) => join(scripts, name))], { cwd: repo, encoding: "utf8", windowsHide: true });
  assert.equal(linted.status, 0, linted.stdout + linted.stderr);
});

test("start/stop shell steps, flags, files and messages mirror the Windows pair", async () => {
  const read = (file) => readFile(join(scripts, file), "utf8");
  const [startPs, stopPs, commonPs, startSh, stopSh, commonSh] = await Promise.all(
    ["start.ps1", "stop.ps1", "dev-common.ps1", "start.sh", "stop.sh", "dev-common.sh"].map(read),
  );
  const steps = (text, total, call) => [...text.matchAll(new RegExp(call + " '(\\[\\d+\\/" + total + "\\][^']*)'", "g"))].map((match) => match[1]);
  const startSteps = steps(startSh, 10, "say");
  assert.deepEqual(startSteps.map((line) => Number(line.match(/\d+/)[0])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(startSteps, steps(startPs, 10, "Write-Host"));
  assert.deepEqual(steps(stopSh, 4, "say"), steps(stopPs, 4, "Write-Host"));
  // Thứ tự lệnh thực sự trong start.sh khớp mười bước.
  const order = ["init_caller", "check_tools", "wait_docker", "check_running", '"$DOCKER" compose up -d --wait', "init_env", "install_deps backend", "seed_if_needed", "launch_service api", "wait_services"];
  const main = startSh.slice(startSh.indexOf("say '[1/10]"));
  const positions = order.map((call) => main.indexOf(call));
  assert.ok(positions.every((position) => position > 0), "start.sh main is missing a step call");
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "start.sh step calls are out of order");

  assert.match(startSh, /--seed\) SEED=1/);
  assert.match(stopSh, /--keep-db\) KEEP_DB=1/);
  for (const text of [startSh, stopSh]) assert.match(text, /--help \| -h\)/);
  assert.match(startSh, /--seed xóa dữ liệu/);
  assert.match(stopSh, /--keep-db giữ MongoDB và Redis/);
  assert.match(commonSh, /api\) printf '5000'/);
  assert.match(commonSh, /web\) printf '5173'/);
  assert.match(commonPs, /api = 5000; web = 5173/);
  assert.match(commonSh, /DEV_ROOT="\$PROJECT_ROOT\/\.dev"/);
  assert.match(commonSh, /LOG_ROOT="\$DEV_ROOT\/logs"/);
  assert.match(commonSh, /"\$DEV_ROOT\/\$service\.pid"/);
  assert.match(startSh, /LOG_ROOT\/\$service\.log/);
  assert.match(commonSh, /tail -f /);
  for (const text of [startPs + stopPs + commonPs, startSh + stopSh + commonSh]) {
    for (const message of ["Cổng dev đang bận", "chỉ đang chạy một phần", "Không có gì để dừng.", "Hai cổng dev đã trống.",
      "Một lệnh start/stop đang chạy", "Không đếm được người dùng", "Đã có người dùng, bỏ qua seed.", "Giữ nguyên backend/.env.",
      "Hết thời gian chờ Docker Desktop", "cổng MongoDB 27018, Redis 6379", "không tương thích", "Cần Docker Compose v2"]) {
      assert.ok(text.includes(message), "missing parity message: " + message);
    }
    assert.doesNotMatch(text, /down\s+-v/);
  }
  assert.match(startSh, /"\$DOCKER" exec flashsale-mongo mongosh flashsale --quiet --eval 'db\.users\.countDocuments\(\)'/);
  assert.match(startSh, /open -a Docker/);
  assert.match(startSh, /SECONDS \+ 120/);
  assert.match(startSh, /SECONDS \+ 30/);
  assert.match(startSh, /nohup "\$BASH" -c "\$RUNNER_JS" "\$label" "\$PROJECT_ROOT\/\$folder" "\$NPM" <\/dev\/null >"\$log" 2>&1 &/);
  assert.match(startSh, /set -m\n\s+nohup/);
  // Mọi tín hiệu theo nhóm chỉ được gửi sau khi đã từ chối nhóm của lệnh gọi.
  for (const name of ["stop_group", "stop_listener"]) {
    const body = functionBody(commonSh, name);
    assert.ok(body.indexOf("safe_group") >= 0 && body.indexOf("safe_group") < body.indexOf("kill -"), name + " phải gọi safe_group trước kill");
  }
  const launch = functionBody(startSh, "launch_service");
  assert.ok(launch.indexOf("safe_group") < launch.indexOf('kill -TERM -- "-$pgid"'), "launch_service phải kiểm tra nhóm trước kill nhóm");
  assert.match(functionBody(commonSh, "safe_group"), /\[ "\$1" != "\$CALLER_PGID" \] \|\| return 1/);
  assert.match(functionBody(commonSh, "safe_group"), /\[ "\$1" -gt 1 \] \|\| return 1/);
});

test("shell ownership guards: caller/foreign groups are never signalled (stubbed ps/lsof/kill)", { timeout: 600_000 }, async (t) => {
  const bash = findBash();
  if (!bash) {
    t.skip("không có bash (Git Bash) trên máy Windows này");
    return;
  }
  const result = await runShell(bash, [join(scripts, "test", "fixtures", "shell-guards.sh"), scripts]);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /# fail 0/);
  t.diagnostic(result.output.match(/# pass \d+/)?.[0] + " (logic shell với công cụ giả, không phải runtime macOS)");
});

const posixReason = process.platform === "win32" && process.env.DEV_POSIX_FIXTURE !== "wsl"
  ? "vòng đời POSIX thật cần macOS/Linux; trên Windows đặt DEV_POSIX_FIXTURE=wsl để chạy trong WSL (vẫn không phải bằng chứng macOS)"
  : false;

test("POSIX runtime lifecycle: real job-control groups, nohup, lsof and ps on an accented path", { skip: posixReason, timeout: 600_000 }, async (t) => {
  const fixtureScript = "scripts/test/fixtures/posix-lifecycle.sh";
  const result = process.platform === "win32"
    ? await runShell("wsl.exe", ["-d", process.env.DEV_WSL_DISTRO ?? "Ubuntu", "--cd", repo, "--", "bash", fixtureScript, "scripts"])
    : await runShell("bash", [fixtureScript, "scripts"]);
  if (result.code === 77) {
    t.skip(result.output.trim());
    return;
  }
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /# fail 0/);
  t.diagnostic(result.output.match(/# pass \d+/)?.[0] + " trên " + (process.platform === "win32" ? "WSL" : process.platform) + " (không phải bằng chứng macOS)");
});

// ---------------- Tài liệu và checklist nghiệm thu ----------------

test("script guide and README disclose macOS status; DEV-UAT rows carry evidence before PASS", async () => {
  const guide = await readFile(join(scripts, "README.md"), "utf8");
  for (const text of ["scripts\\start.ps1", "scripts\\stop.ps1", "./scripts/start.sh", "./scripts/stop.sh", "-Seed", "--seed",
    "-KeepDb", "--keep-db", "-Help", "--help", "xóa sạch", "[CẢNH BÁO]", "Get-Content", "tail -f", ".dev/", "logs/api.log",
    "Cổng bận", "lsof -nP -iTCP:5000 -sTCP:LISTEN", "Get-NetTCPConnection", "npm run start:test", "Không đo tải",
    "chưa chạy thử trên macOS", "Chưa chạy thử trên macOS", "shellcheck", "DEV_POSIX_FIXTURE=wsl", "04-DEV-UAT.md"]) {
    assert.ok(guide.includes(text), "scripts/README.md thiếu: " + text);
  }
  const readme = await readFile(join(repo, "README.md"), "utf8");
  assert.match(readme, /\]\(scripts\/README\.md\)/);
  assert.match(readme, /chưa chạy thử trên macOS/);
  assert.match(readme, /scripts\\start\.ps1/);
  assert.match(readme, /\.\/scripts\/start\.sh/);
  assert.match(readme, /Phase 5/);

  const uat = await readFile(join(repo, ".planning", "phases", "04-web-app-dev-scripts", "04-DEV-UAT.md"), "utf8");
  const rows = uat.split(/\r?\n/).filter((line) => /^\| W\d\d \|/.test(line)).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  const ids = rows.map((row) => row[0]);
  for (let index = 1; index <= 10; index += 1) assert.ok(ids.includes("W" + String(index).padStart(2, "0")), "thiếu ca W" + index);
  assert.equal(new Set(ids).size, ids.length, "ID ca bị trùng");
  for (const row of rows) {
    assert.equal(row.length, 8, row[0] + " phải có 8 cột");
    assert.ok(["OPEN", "PASS", "FAIL", "ERROR"].includes(row[7]), row[0] + " trạng thái không hợp lệ: " + row[7]);
    assert.ok(row[3].length > 0 && row[4].length > 0, row[0] + " thiếu lệnh hoặc mong đợi");
    if (row[7] === "PASS") {
      assert.notEqual(row[5], "—", row[0] + " PASS nhưng chưa ghi mã thoát");
      assert.notEqual(row[6], "—", row[0] + " PASS nhưng chưa có bằng chứng");
    }
  }
  for (const text of ["COMPOSE_PROJECT_NAME", "dùng một lần", "Không dán nội dung `backend/.env`", "-Quiet", "docker compose down",
    "Không chạy `docker compose down -v`", "UNTESTED", "PowerShell 5.1", "$LASTEXITCODE"]) {
    assert.ok(uat.includes(text), "04-DEV-UAT.md thiếu: " + text);
  }
  // Không có lệnh nào in nội dung file secret.
  assert.doesNotMatch(uat, /(Get-Content|\bgc\b|\btype\b|\bcat\b|\bmore\b)\s+[^\n|]*backend[\\/]\.env\b/i);
  assert.doesNotMatch(guide + readme, /(Get-Content|\btype\b|\bcat\b)\s+[^\n|]*backend[\\/]\.env\b/i);

  for (const path of [".dev/api.owner", ".dev/web.owner.json", ".dev/lifecycle.lock.d/owner", ".dev/logs/api.log", ".dev/backend.lock.sha256"]) {
    const ignored = spawnSync("git", ["check-ignore", "--no-index", "-q", "--", path], { cwd: repo, windowsHide: true });
    assert.equal(ignored.status, 0, path + " phải bị Git bỏ qua");
  }
});
