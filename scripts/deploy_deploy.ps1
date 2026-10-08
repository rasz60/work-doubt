param(
    [string]$ROOT = (Resolve-Path "$PSScriptRoot\.."),
    [string]$Backend= "backend",
    [string]$Frontend= "app"
)

# 1. RUN BACKEND
### env Load
. "$PSScriptRoot\load-env.ps1"

### RUN BACKEND
$backendPath = Join-Path $ROOT $Backend
$job = Start-Job -ScriptBlock { param($p) Set-Location $p; go run ./cmd/api } -ArgumentList $backendPath

### Check Health
$ok = $false
for ( $i = 0; $i -lt 30; $i++ ) {
    try   { Invoke-RestMethod http://localhost:8080/healthz -TimeoutSec 2 | Out-Null; $ok = $true; break }
    catch { Start-Sleep -Seconds 1 }
}
if (-not $ok) { Receive-Job $job; throw "Backend health check failed" }
Write-Host "Backend 실행 완료 ($ROOT$Backend)" -ForegroundColor Green


#2. RUN FRONTEND
Set-Location (Join-Path $ROOT $Frontend)
npx expo start