# 배포 스크립트 공통 설정. deploy_backend.ps1 / deploy_frontend.ps1 가 dot-source 한다.
# 서버 준비(방화벽, Caddy, systemd)는 docs/DEPLOY.md 를 따른다.
#
# SSH 키는 프로젝트 루트의 oracle-key\ 에 둔다(.gitignore 대상).
# 다른 키를 쓰려면:  $env:OCI_SSH_KEY = "C:\path\to\key"

$ErrorActionPreference = 'Stop'

$VM_IP   = '161.33.19.226'
$DOMAIN  = 'noworkdoubt.duckdns.org'
$VM_USER = 'ubuntu'
$ROOT   = (Resolve-Path "$PSScriptRoot\..").Path
$KEY    = if ($env:OCI_SSH_KEY) { $env:OCI_SSH_KEY } else { Join-Path $ROOT 'oracle-key\ssh-key-2026-10-08.key' }
$Remote = "$VM_USER@$VM_IP"

if (-not (Test-Path $KEY)) {
    throw "SSH 키를 찾을 수 없습니다: $KEY  (`$env:OCI_SSH_KEY 로 경로를 지정하세요)"
}

function Write-Step([string]$Message) {
    Write-Host "`n>> $Message" -ForegroundColor Cyan
}

# 네이티브 명령(go, npx, ssh, scp)은 실패해도 예외를 던지지 않으므로 종료 코드를 직접 확인한다.
function Assert-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step 실패 (exit $LASTEXITCODE)" }
}

function Invoke-Ssh([string]$Command) {
    ssh -i $KEY -o StrictHostKeyChecking=accept-new $Remote $Command
    Assert-Exit "ssh: $Command"
}

function Copy-ToVm([string]$Local, [string]$RemotePath) {
    scp -i $KEY -o StrictHostKeyChecking=accept-new $Local "${Remote}:$RemotePath"
    Assert-Exit "scp $Local"
}

# 빌드용으로 잠시 바꾼 환경변수를 원래 값(없었으면 삭제)으로 되돌린다.
function Restore-Env([hashtable]$Saved) {
    foreach ($name in $Saved.Keys) {
        if ($null -eq $Saved[$name]) {
            Remove-Item "env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item "env:$name" $Saved[$name]
        }
    }
}
