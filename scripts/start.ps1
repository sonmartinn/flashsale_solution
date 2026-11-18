param([switch]$Seed, [switch]$Help)

if ($Help) {
    Write-Host 'Cách chạy: powershell -ExecutionPolicy Bypass -File scripts\start.ps1 [-Seed] [-Help]'
    Write-Host 'Tùy chọn -Seed xóa dữ liệu cũ và tạo lại dữ liệu mẫu. Chỉ dùng script này cho môi trường dev.'
    exit 0
}

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dev-common.ps1')

function Wait-Docker([string]$Docker, [int]$TimeoutSeconds = 120) {
    Invoke-DevCommand $Docker @('info') | Out-Null
    if ($LASTEXITCODE -eq 0) { return }

    $desktop = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
    ) | Where-Object { [IO.File]::Exists($_) } | Select-Object -First 1
    if (-not $desktop) {
        throw 'Docker daemon chưa chạy và không tìm thấy Docker Desktop. Hãy mở hoặc cài Docker Desktop rồi thử lại.'
    }
    Start-Process -FilePath ([WildcardPattern]::Escape($desktop)) -WindowStyle Hidden
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        Start-Sleep -Seconds 2
        Invoke-DevCommand $Docker @('info') | Out-Null
        if ($LASTEXITCODE -eq 0) { return }
    }
    throw 'Hết thời gian chờ Docker Desktop. Kiểm tra Docker daemon đã sẵn sàng rồi thử lại.'
}

function Initialize-DevEnv([string]$Node) {
    if ([IO.File]::Exists((Join-Path $ProjectRoot 'backend\.env'))) {
        Write-Host 'Giữ nguyên backend/.env.'
        return
    }
    Push-Location -LiteralPath (Join-Path $ProjectRoot 'backend')
    try {
        $code = "const fs=require('node:fs');try{const t=fs.readFileSync('.env.example','utf8');if(!/^JWT_SECRET=[^\r\n]*/m.test(t))process.exit(1);fs.writeFileSync('.env',t.replace(/^JWT_SECRET=[^\r\n]*/m,'JWT_SECRET='+require('node:crypto').randomBytes(32).toString('hex')),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')process.exit(1);}"
        Invoke-DevCommand $Node @('-e', $code) | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Không tạo được backend/.env. Kiểm tra .env.example và quyền ghi thư mục backend.' }
    } finally {
        Pop-Location
    }
}

function Install-DevDependencies([string]$Npm, [string]$Package) {
    $packagePath = Join-Path $ProjectRoot $Package
    Push-Location -LiteralPath $packagePath
    try {
        $lockPath = Join-Path $packagePath 'package-lock.json'
        $marker = Join-Path $DevRoot "$Package.lock.sha256"
        $hash = (Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash
        if ([IO.Directory]::Exists((Join-Path $packagePath 'node_modules')) -and
            [IO.File]::Exists($marker) -and [IO.File]::ReadAllText($marker) -eq $hash) {
            Write-Host "Bỏ qua npm ci cho $Package."
            return
        }
        [IO.File]::Delete($marker)
        Invoke-DevCommand $Npm @('ci') | Out-Null
        $code = $LASTEXITCODE
        if ($code -ne 0) { throw "npm ci thất bại ở $Package (mã $code). Kiểm tra mạng và package-lock.json, rồi thử lại." }
        if ((Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash -ne $hash) {
            throw "package-lock.json của $Package đã đổi trong lúc cài. Chạy start lại."
        }
        [IO.File]::WriteAllText($marker, $hash)
    } finally {
        Pop-Location
    }
}

function Invoke-DevSeed([string]$Docker, [string]$Npm, [string]$Node) {
    if (-not $Seed) {
        $count = Invoke-DevCommand $Docker @('exec', 'flashsale-mongo', 'mongosh', 'flashsale', '--quiet', '--eval', 'db.users.countDocuments()')
        if ($LASTEXITCODE -ne 0 -or @($count).Count -ne 1 -or "$count".Trim() -notmatch '^[0-9]+$') {
            throw 'Không đếm được người dùng trong MongoDB. Kiểm tra flashsale-mongo và chạy start lại.'
        }
        if ("$count".Trim() -notmatch '^0+$') {
            Write-Host 'Đã có người dùng, bỏ qua seed.'
            return
        }
    }

    Push-Location -LiteralPath (Join-Path $ProjectRoot 'backend')
    try {
        if ($Seed) {
            Write-Host '[CẢNH BÁO] -Seed sẽ xóa dữ liệu MongoDB và Redis đã cấu hình rồi tạo lại dữ liệu mẫu.'
        } else {
            # Dùng cùng cách nạp cấu hình với seed. Chỉ tự seed đúng database vừa đếm và Redis dev.
            $check = "require('dotenv/config');const e=process.env;const m=e.MONGODB_URI?.trim(),r=e.REDIS_URL?.trim();if(m!=='mongodb://127.0.0.1:27018/flashsale')process.exit(1);if(!['redis://127.0.0.1:6379','redis://127.0.0.1:6379/','redis://127.0.0.1:6379/0'].includes(r))process.exit(1);"
            Invoke-DevCommand $Node @('-e', $check) | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw 'Cấu hình MongoDB hoặc Redis khác môi trường dev mặc định. Kiểm tra đích dữ liệu trước khi yêu cầu -Seed.'
            }
        }
        Invoke-DevCommand $Npm @('run', 'seed') | Out-Null
        $code = $LASTEXITCODE
        if ($code -ne 0) { throw "Seed thất bại (mã $code). Kiểm tra cấu hình MongoDB và Redis trước khi thử lại." }
    } finally {
        Pop-Location
    }
}

function Get-HealthyDevServices($Listeners, $Roots) {
    foreach ($service in $DevServices.Keys) {
        $atPort = @($Listeners | Where-Object Port -eq $DevServices[$service])
        if (-not $Roots[$service] -or $atPort.Count -eq 0) { continue }
        $foreign = @($atPort | Where-Object { -not (Test-DevDescendant $_.Id $Roots[$service]) })
        if ($foreign.Count -eq 0 -and ($service -ne 'api' -or (Test-ApiHealth))) {
            $service
        }
    }
}

function Start-DevService([string]$Service, [string]$Npm, [string]$Folder) {
    $token = [guid]::NewGuid().ToString('N')
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Service {1} -Owner {2} -NpmPath "{3}"' -f $RunnerPath, $Service, $token, $Npm
    $options = @{
        FilePath = Join-Path $PSHOME 'powershell.exe'
        ArgumentList = $arguments
        # Start-Process 5.1 giải đường dẫn qua wildcard, kể cả WorkingDirectory.
        WorkingDirectory = [WildcardPattern]::Escape((Join-Path $ProjectRoot $Folder))
        RedirectStandardOutput = [WildcardPattern]::Escape((Join-Path $LogRoot "$Service.runner.out.log"))
        RedirectStandardError = [WildcardPattern]::Escape((Join-Path $LogRoot "$Service.runner.err.log"))
        WindowStyle = 'Hidden'
        PassThru = $true
    }
    $process = Start-Process @options
    try {
        $record = [pscustomobject]@{ Id = $process.Id; Creation = $null; Token = $token }
        $newRecords[$Service] = $record
        $info = Get-DevProcess $process.Id
        if (-not $info -or (Get-RunnerToken $info $Service) -ne $token -or -not (Get-DevCreation $info)) {
            throw "Không xác nhận được tiến trình $Service. Xem .dev/logs/$Service.log rồi thử lại."
        }
        $record.Creation = Get-DevCreation $info
        Write-DevRecord $Service $record
    } finally {
        $process.Dispose()
    }
}

function Wait-DevServices([int]$TimeoutSeconds = 30) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        $roots = @{}
        foreach ($service in $DevServices.Keys) {
            $roots[$service] = Get-OwnedRunner $newRecords[$service] $service
            if (-not $roots[$service]) { throw "Tiến trình $service đã thoát khi khởi động. Kiểm tra log rồi thử lại." }
        }
        $ready = @(Get-HealthyDevServices @(Get-DevListeners) $roots)
        if ($ready.Count -eq $DevServices.Count) { return }
        Start-Sleep -Milliseconds 250
    } while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds)
    $pending = @($DevServices.Keys | Where-Object { $_ -notin $ready })
    throw "Hết thời gian chờ dịch vụ $($pending -join ', '). Kiểm tra log và cổng rồi thử lại."
}

$lock = $null
$newRecords = @{}
$exitCode = 0
Write-Host '[1/10] Về thư mục gốc dự án.'
Push-Location -LiteralPath $ProjectRoot
try {
    $lock = Enter-DevLock
    Write-Host '[2/10] Kiểm tra Node.js, npm, Docker và Docker Compose.'
    $node = Find-DevTool 'node'
    $npm = Find-DevTool 'npm.cmd'
    $docker = Find-DevTool 'docker'
    $nodeVersion = Invoke-DevCommand $node @('--version')
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v([0-9]+)\.([0-9]+)\.[0-9]+$') {
        throw 'Không đọc được phiên bản Node.js. Hãy cài Node.js LTS rồi thử lại.'
    }
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if (-not (($major -eq 20 -and $minor -ge 19) -or ($major -eq 22 -and $minor -ge 12) -or $major -gt 22)) {
        throw "Node.js $nodeVersion không tương thích. Hãy dùng Node 20.19+ (nhánh 20) hoặc 22.12+."
    }
    Invoke-DevCommand $npm @('--version') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm.cmd không chạy được. Kiểm tra bản cài Node.js.' }
    $composeVersion = Invoke-DevCommand $docker @('compose', 'version', '--short')
    if ($LASTEXITCODE -ne 0 -or $composeVersion -notmatch '^v?([0-9]+)\.' -or [int]$Matches[1] -lt 2) {
        throw 'Cần Docker Compose v2 hoặc mới hơn. Kiểm tra bản cài Docker Desktop.'
    }
    Write-Host '[3/10] Kiểm tra Docker daemon.'
    Wait-Docker $docker

    Write-Host '[4/10] Kiểm tra tiến trình và cổng 5000, 5173.'
    $listeners = @(Get-DevListeners)
    $roots = @{}
    foreach ($service in $DevServices.Keys) {
        $roots[$service] = Get-OwnedRunner (Get-DevRecord $service) $service
    }
    $foreign = @(
        foreach ($service in $DevServices.Keys) {
            $listeners | Where-Object { $_.Port -eq $DevServices[$service] -and -not (Test-DevDescendant $_.Id $roots[$service]) }
        }
    )
    if ($foreign.Count -gt 0) {
        $foreign | ForEach-Object { Write-PortOwner $_ }
        throw 'Cổng dev đang bận. Kiểm tra tiến trình được báo trước khi chạy start lại.'
    }
    if (@($roots.Values | Where-Object { $_ }).Count -gt 0) {
        if ($roots.api -and $roots.web) {
            # Cho tiến trình đang tải lại một khoảng ngắn để nhận kết nối trở lại.
            for ($attempt = 0; $attempt -lt 6; $attempt++) {
                if (@(Get-HealthyDevServices $listeners $roots).Count -eq $DevServices.Count) {
                    Write-Host 'Backend và frontend đang chạy.'
                    Write-DevLinks
                    exit 0
                }
                Start-Sleep -Milliseconds 200
                $listeners = @(Get-DevListeners)
            }
        }
        throw 'Môi trường chỉ đang chạy một phần. Chạy scripts\stop.ps1 -KeepDb trước khi khởi động lại.'
    }
    if (-not (Get-DevProcess $PID)) { throw 'Không xác nhận được tiến trình bằng CIM. Kiểm tra quyền đọc Win32_Process.' }
    foreach ($service in $DevServices.Keys) { Clear-DevRecord $service }

    Write-Host '[5/10] Khởi động MongoDB và Redis bằng Docker Compose.'
    Invoke-DevCommand $docker @('compose', 'up', '-d', '--wait') | Out-Null
    $composeExit = $LASTEXITCODE
    if ($composeExit -ne 0) {
        throw "Docker Compose không khởi động được (mã $composeExit). Kiểm tra docker compose ps, docker compose logs và cổng MongoDB 27018, Redis 6379."
    }

    Write-Host '[6/10] Kiểm tra cấu hình backend.'
    Initialize-DevEnv $node

    Write-Host '[7/10] Cài thư viện khi cần.'
    Install-DevDependencies $npm 'backend'
    Install-DevDependencies $npm 'frontend'

    Write-Host '[8/10] Kiểm tra có cần seed dữ liệu mẫu.'
    Invoke-DevSeed $docker $npm $node

    Write-Host '[9/10] Khởi động backend và frontend ở chế độ nền.'
    [void][IO.Directory]::CreateDirectory($LogRoot)
    Start-DevService 'api' $npm 'backend'
    Start-DevService 'web' $npm 'frontend'

    Write-Host '[10/10] Chờ API health và cổng frontend.'
    Wait-DevServices
    Write-DevLinks
} catch {
    $exitCode = 1
    Write-Host "[LỖI] $($_.Exception.Message)"
    foreach ($service in $newRecords.Keys) {
        try {
            $log = Join-Path $LogRoot "$service.log"
            if (-not [IO.File]::Exists($log)) { $log = Join-Path $LogRoot "$service.runner.err.log" }
            if ([IO.File]::Exists($log)) {
                Write-Host "Log gần nhất của $service ($log)"
                Get-Content -LiteralPath $log -Encoding UTF8 -Tail 20 | ForEach-Object { Write-Host $_ }
            }
        } catch {
            Write-Host "Không đọc được log $service. Hãy xem file log sau khi dừng."
        }
        try {
            $record = $newRecords[$service]
            if (-not $record.Creation) {
                $info = Get-DevProcess $record.Id
                if ((Get-RunnerToken $info $service) -eq $record.Token) {
                    $record.Creation = Get-DevCreation $info
                }
            }
            $root = Get-OwnedRunner $record $service
            if (-not $root -or (Stop-VerifiedTree $root)) { Clear-DevRecord $service }
        } catch {
            Write-Host "[LỖI] $($_.Exception.Message)"
        }
    }
} finally {
    if ($lock) { $lock.Dispose() }
    Pop-Location
}
exit $exitCode
