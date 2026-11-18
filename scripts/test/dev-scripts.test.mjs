import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
    calls: async () => (await readFile(path("calls.txt"), "utf8")).trim().split(/\r?\n/).filter(Boolean),
    read: (...parts) => readFile(path(...parts), "utf8"),
  };
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
  const f = await fixture(t);
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

  const stopped = assertOk(await f.run("stop"));
  assert.deepEqual([...stopped.matchAll(/\[(\d+)\/4]/g)].map((match) => Number(match[1])), [1, 2, 3, 4]);
  await assertTreeStopped(f);
  assert.equal(await f.read("db-running"), "no");
  assertOk(await f.run("start"));
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
