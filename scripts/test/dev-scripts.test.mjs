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
