$ProjectRoot = (Get-Item -LiteralPath (Join-Path $PSScriptRoot '..')).FullName
$DevRoot = Join-Path $ProjectRoot '.dev'
$LogRoot = Join-Path $DevRoot 'logs'
$RunnerPath = Join-Path $PSScriptRoot 'dev-runner.ps1'
$DevServices = [ordered]@{ api = 5000; web = 5173 }
$HealthUrl = "http://localhost:$($DevServices.api)/api/health"
$WebUrl = "http://localhost:$($DevServices.web)"

function Enter-DevLock {
    [void][IO.Directory]::CreateDirectory($DevRoot)
    # Giữ cùng một file khóa qua mọi lượt chạy. Windows tự nhả handle nếu tiến trình thoát.
    try {
        return [IO.File]::Open((Join-Path $DevRoot 'lifecycle.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch [IO.IOException] {
        if (($_.Exception.GetBaseException().HResult -band 0xffff) -in 32, 33) {
            throw 'Một lệnh start/stop đang chạy. Hãy đợi rồi thử lại.'
        }
        throw
    }
}

function Find-DevTool([string]$Name) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        throw "Thiếu $Name. Hãy cài Node.js LTS (kèm npm) và Docker Desktop (kèm Compose v2), rồi mở lại terminal."
    }
    return $command.Source
}

function Invoke-DevCommand([string]$Executable, [string[]]$CommandArgs) {
    # 5.1 có thể ném lỗi ngay khi lệnh ngoài ghi stderr. Đọc mã thoát ở nơi gọi.
    $ErrorActionPreference = 'Continue'
    & $Executable @CommandArgs 2>$null
}

function Get-DevNetstatRows {
    $rows = Invoke-DevCommand 'netstat.exe' @('-ano')
    if ($LASTEXITCODE -ne 0) { throw 'Không kiểm tra được cổng TCP bằng netstat. Hãy thử lại.' }
    return $rows
}

function Get-DevConnectionOwner([int]$Port, [Net.IPAddress]$Address) {
    $client = [Net.Sockets.TcpClient]::new($Address.AddressFamily)
    try {
        try {
            if (-not $client.ConnectAsync($Address, $Port).Wait(250)) { return }
        } catch [AggregateException] {
            if ($_.Exception.GetBaseException() -is [Net.Sockets.SocketException]) { return }
            throw
        }
        # Đối chiếu cả hai đầu kết nối để lấy PID của server, kể cả khi thiếu dòng LISTEN.
        $local = [regex]::Escape($client.Client.RemoteEndPoint.ToString())
        $remote = [regex]::Escape($client.Client.LocalEndPoint.ToString())
        foreach ($row in (Get-DevNetstatRows)) {
            if ($row -match "^\s*TCP\s+$local\s+$remote\s+\S+\s+([1-9][0-9]*)\s*$") {
                return [int]$Matches[1]
            }
        }
        return 0
    } finally {
        $client.Dispose()
    }
}

function Get-DevListeners {
    # Địa chỉ remote wildcard, cổng 0 nhận diện socket chờ kết nối, kể cả netstat bản địa hóa.
    $rows = Get-DevNetstatRows
    $ports = $DevServices.Values -join '|'
    $owners = @{}
    foreach ($row in $rows) {
        if ($row -match "^\s*TCP\s+\S+:($ports)\s+(?:0\.0\.0\.0|\[::\]):0\s+(?!(?:CLOSED|BOUND)\s)\S+\s+([1-9][0-9]*)\s*$") {
            $port = [int]$Matches[1]
            $owners[$port] += @([int]$Matches[2])
        }
    }
    foreach ($port in $DevServices.Values) {
        if (-not $owners.ContainsKey($port)) {
            $owners[$port] = @(
                Get-DevConnectionOwner $port ([Net.IPAddress]::Loopback)
                if ([Net.Sockets.Socket]::OSSupportsIPv6) {
                    Get-DevConnectionOwner $port ([Net.IPAddress]::IPv6Loopback)
                }
            )
        }
        foreach ($idValue in ($owners[$port] | Select-Object -Unique)) {
            [pscustomobject]@{ Port = $port; Id = $idValue }
        }
    }
}

function Get-DevProcess([int]$Id) {
    if ($Id -le 0) { return }
    try {
        Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $Id" -ErrorAction Stop
    } catch [Microsoft.Management.Infrastructure.CimException] {
        throw "Không đọc được Win32_Process cho PID $Id. Kiểm tra quyền CIM của terminal rồi thử lại."
    }
}

function Get-DevCreation($ProcessInfo) {
    if ($null -ne $ProcessInfo.CreationDate) {
        return $ProcessInfo.CreationDate.ToUniversalTime().Ticks.ToString()
    }
}

function Get-RunnerToken($ProcessInfo, [string]$Service) {
    $path = [regex]::Escape($RunnerPath)
    if ($ProcessInfo.Name -eq 'powershell.exe' -and
        $ProcessInfo.CommandLine -match ('(?:^|\s)-File "' + $path + '" -Service ' + $Service + ' -Owner ([a-f0-9]{32}) -NpmPath "')) {
        return $Matches[1]
    }
}

function Get-OwnedRunner($Record, [string]$Service) {
    if ($null -eq $Record) { return }
    $root = Get-DevProcess $Record.Id
    if ($root -and $Record.Creation -and $Record.Token -and
        (Get-DevCreation $root) -eq $Record.Creation -and
        (Get-RunnerToken $root $Service) -eq $Record.Token) {
        return $root
    }
}

function Get-DevRecord([string]$Service) {
    $path = Join-Path $DevRoot "$Service.owner.json"
    if (-not [IO.File]::Exists($path)) { return }
    try {
        $record = [IO.File]::ReadAllText($path) | ConvertFrom-Json -ErrorAction Stop
        $idValue = 0
        if ([int]::TryParse([string]$record.Id, [ref]$idValue) -and $idValue -gt 0 -and
            $record.Creation -match '^[0-9]+$' -and $record.Token -match '^[a-f0-9]{32}$') {
            return [pscustomobject]@{ Id = $idValue; Creation = [string]$record.Creation; Token = [string]$record.Token }
        }
    } catch [System.ArgumentException] {
        # File metadata bị hỏng được xử lý như đã mất.
    }
}

function Clear-DevRecord([string]$Service) {
    [IO.File]::Delete((Join-Path $DevRoot "$Service.pid"))
    [IO.File]::Delete((Join-Path $DevRoot "$Service.owner.json"))
}

function Write-DevRecord([string]$Service, $Record) {
    [IO.File]::WriteAllText((Join-Path $DevRoot "$Service.owner.json"), ($Record | ConvertTo-Json -Compress))
    [IO.File]::WriteAllText((Join-Path $DevRoot "$Service.pid"), [string]$Record.Id)
}

function Get-DevAncestors($ProcessInfo) {
    $child = $ProcessInfo
    while ($child -and $child.ParentProcessId -gt 0) {
        $parent = Get-DevProcess $child.ParentProcessId
        # Windows có thể tái sử dụng PID của cha sau khi cha đã thoát.
        if (-not $parent -or -not $parent.CreationDate -or -not $child.CreationDate -or
            $parent.ProcessId -eq $child.ProcessId -or $parent.CreationDate -gt $child.CreationDate) { break }
        $parent
        $child = $parent
    }
}

function Test-DevDescendant([int]$Id, $Root) {
    if (-not $Root) { return $false }
    foreach ($parent in (Get-DevAncestors (Get-DevProcess $Id))) {
        if ($parent.ProcessId -eq $Root.ProcessId -and (Get-DevCreation $parent) -eq (Get-DevCreation $Root)) {
            return $true
        }
    }
    return $false
}

function Test-ProjectNode($ProcessInfo, [string]$Service) {
    if (-not $ProcessInfo -or $ProcessInfo.Name -ne 'node.exe' -or -not $ProcessInfo.CommandLine) { return $false }
    $folder = 'frontend'
    if ($Service -eq 'api') { $folder = 'backend' }
    $packagePath = (Join-Path $ProjectRoot $folder) + '\'
    # Chuẩn hóa từng đối số đường dẫn để loại checkout cùng tiền tố và đoạn .. đi ra ngoài.
    foreach ($argument in [regex]::Matches($ProcessInfo.CommandLine, '"([^"]+)"|([^\s"]+)')) {
        $path = $argument.Groups[1].Value + $argument.Groups[2].Value
        if ($path -notmatch '^[a-z]:[/\\]') { continue }
        try {
            if ([IO.Path]::GetFullPath($path).StartsWith($packagePath, [StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }
        } catch [System.ArgumentException] {
            # Đối số này không phải đường dẫn Windows.
        }
    }
    return $false
}

function Stop-VerifiedTree($ProcessInfo) {
    if (-not $ProcessInfo -or -not $ProcessInfo.CommandLine -or -not (Get-DevCreation $ProcessInfo)) { return $false }
    $fresh = Get-DevProcess $ProcessInfo.ProcessId
    if (-not $fresh -or (Get-DevCreation $fresh) -ne (Get-DevCreation $ProcessInfo) -or
        $fresh.CommandLine -cne $ProcessInfo.CommandLine) { return $false }
    Invoke-DevCommand 'taskkill.exe' @('/PID', $fresh.ProcessId, '/T', '/F') | Out-Null
    if ($LASTEXITCODE -ne 0) {
        if (-not (Get-DevProcess $fresh.ProcessId)) { return $true }
        throw "Không dừng được cây tiến trình PID $($fresh.ProcessId). Kiểm tra quyền của terminal rồi chạy stop lại."
    }
    return $true
}

function Write-PortOwner($Listener) {
    if ($Listener.Id -eq 0) {
        Write-Host "Cổng $($Listener.Port) đang được giữ, nhưng không xác định được PID."
        return
    }
    $processName = (Get-Process -Id $Listener.Id -ErrorAction SilentlyContinue).ProcessName
    if (-not $processName) { $processName = 'không rõ tên' }
    Write-Host "Cổng $($Listener.Port) đang được giữ bởi PID $($Listener.Id) ($processName)."
}

function Test-ApiHealth {
    foreach ($loopback in '127.0.0.1', '[::1]') {
        try {
            $request = [Net.HttpWebRequest]::Create("http://${loopback}:$($DevServices.api)/api/health")
            $request.Proxy = $null
            $request.AllowAutoRedirect = $false
            $request.KeepAlive = $false
            $request.Timeout = 750
            $response = $request.GetResponse()
            try { if ([int]$response.StatusCode -eq 200) { return $true } }
            finally { $response.Dispose() }
        } catch [Net.WebException] {
            if ($_.Exception.Response) { $_.Exception.Response.Dispose() }
        }
    }
    return $false
}

function Write-DevLinks {
    Write-Host "Frontend: $WebUrl"
    Write-Host "API health: $HealthUrl"
    foreach ($service in $DevServices.Keys) {
        $log = (Join-Path $LogRoot "$service.log").Replace("'", "''")
        Write-Host "Get-Content -LiteralPath '$log' -Encoding UTF8 -Wait"
    }
    $stopPath = (Join-Path $PSScriptRoot 'stop.ps1').Replace("'", "''")
    Write-Host "powershell -ExecutionPolicy Bypass -File '$stopPath'"
}
