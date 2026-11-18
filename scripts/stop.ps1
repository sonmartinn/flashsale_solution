param([switch]$KeepDb, [switch]$Help)

if ($Help) {
    Write-Host 'Cách chạy: powershell -ExecutionPolicy Bypass -File scripts\stop.ps1 [-KeepDb] [-Help]'
    Write-Host 'Tùy chọn -KeepDb giữ MongoDB và Redis tiếp tục chạy.'
    exit 0
}

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dev-common.ps1')

function Stop-ListeningDevNode($Listener, [string]$Service) {
    $node = Get-DevProcess $Listener.Id
    if (-not (Test-ProjectNode $node $Service)) { return $false }
    $root = $node
    foreach ($parent in (Get-DevAncestors $node)) {
        if (Get-RunnerToken $parent $Service) {
            $root = $parent
            break
        }
        if (Test-ProjectNode $parent $Service) { $root = $parent }
    }
    return Stop-VerifiedTree $root
}

$lock = $null
$exitCode = 0
$stopped = $false
Push-Location -LiteralPath $ProjectRoot
try {
    $lock = Enter-DevLock
    Write-Host '[1/4] Dừng các cây tiến trình backend và frontend của dự án.'
    foreach ($service in $DevServices.Keys) {
        $root = Get-OwnedRunner (Get-DevRecord $service) $service
        if ($root -and (Stop-VerifiedTree $root)) { $stopped = $true }
        foreach ($listener in @(Get-DevListeners | Where-Object Port -eq $DevServices[$service])) {
            if (Stop-ListeningDevNode $listener $service) { $stopped = $true }
        }
        Clear-DevRecord $service
    }

    Write-Host '[2/4] Xử lý container MongoDB và Redis.'
    if ($KeepDb) {
        Write-Host 'Giữ MongoDB và Redis đang chạy.'
    } else {
        $docker = Find-DevTool 'docker'
        $running = Invoke-DevCommand $docker @('compose', 'ps', '--status', 'running', '-q')
        if ($LASTEXITCODE -ne 0) {
            throw 'Không đọc được trạng thái container. Kiểm tra Docker Desktop hoặc chạy stop -KeepDb.'
        }
        Invoke-DevCommand $docker @('compose', 'stop') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Không dừng được container. Kiểm tra docker compose ps rồi thử lại.' }
        if ($running) { $stopped = $true }
    }

    Write-Host '[3/4] Kiểm tra lại cổng 5000, 5173.'
    $remaining = @(Get-DevListeners)
    if ($remaining.Count -gt 0) {
        $remaining | ForEach-Object { Write-PortOwner $_ }
        throw 'Cổng dev vẫn đang bận. Kiểm tra các PID được báo.'
    }
    Write-Host 'Hai cổng dev đã trống.'
    Write-Host '[4/4] Hoàn tất.'
    if (-not $stopped) { Write-Host 'Không có gì để dừng.' }
} catch {
    $exitCode = 1
    Write-Host "[LỖI] $($_.Exception.Message)"
} finally {
    if ($lock) { $lock.Dispose() }
    Pop-Location
}
exit $exitCode
