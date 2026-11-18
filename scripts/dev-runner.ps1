param(
    [Parameter(Mandatory = $true)][ValidateSet('api', 'web')][string]$Service,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{32}$')][string]$Owner,
    [Parameter(Mandatory = $true)][string]$NpmPath
)

. (Join-Path $PSScriptRoot 'dev-common.ps1')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$logPath = Join-Path $LogRoot "$Service.log"
$writer = [IO.StreamWriter]::new($logPath, $false, [Text.UTF8Encoding]::new($false))
$writer.AutoFlush = $true
try {
    $folder = if ($Service -eq 'api') { 'backend' } else { 'frontend' }
    Set-Location -LiteralPath (Join-Path $ProjectRoot $folder)
    # PowerShell 5.1 biến stderr của lệnh ngoài thành ErrorRecord. Vẫn ghi log và lấy mã thoát của npm.
    $ErrorActionPreference = 'Continue'
    & $NpmPath run dev 2>&1 | ForEach-Object { $writer.WriteLine($_.ToString()) }
    $code = $LASTEXITCODE
    if ($code -ne 0) { $writer.WriteLine("npm run dev kết thúc với mã $code.") }
    exit $code
} finally {
    $writer.Dispose()
}
