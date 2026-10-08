# 백엔드 배포: linux/arm64 교차 컴파일 → 업로드 → 교체·재시작 → 헬스체크
#
#   사용법:  .\scripts\deploy_backend.ps1
#
# 스키마를 바꿨다면 먼저 Supabase SQL Editor 에서 변경분 SQL 을 실행한다.

. "$PSScriptRoot\deploy-common.ps1"

$binary = Join-Path $ROOT 'dist\workout-api'

# 1. BUILD
Write-Step '빌드 (linux/arm64)'
$saved = @{ GOOS = $env:GOOS; GOARCH = $env:GOARCH; CGO_ENABLED = $env:CGO_ENABLED }
Push-Location (Join-Path $ROOT 'backend')
try {
    $env:GOOS = 'linux'; $env:GOARCH = 'arm64'; $env:CGO_ENABLED = '0'
    go build -trimpath -ldflags '-s -w' -o $binary ./cmd/api
    Assert-Exit 'go build'
} finally {
    Restore-Env $saved
    Pop-Location
}

# 2. UPLOAD
Write-Step "업로드 ($VM_IP)"
Copy-ToVm $binary '/opt/workout/workout-api.new'

# 3. REPLACE & RESTART
Write-Step '교체·재시작'
Invoke-Ssh 'chmod +x /opt/workout/workout-api.new && mv /opt/workout/workout-api.new /opt/workout/workout-api && sudo systemctl restart workout-api'

# 4. HEALTH CHECK
Write-Step "헬스체크 (https://$DOMAIN/healthz)"
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
    try   { Invoke-RestMethod "https://$DOMAIN/healthz" -TimeoutSec 3 | Out-Null; $ok = $true; break }
    catch { Start-Sleep -Seconds 1 }
}
if (-not $ok) {
    Invoke-Ssh 'sudo journalctl -u workout-api -n 30 --no-pager'
    throw 'Backend health check failed'
}
Write-Host "Backend 배포 완료 (https://$DOMAIN)" -ForegroundColor Green
