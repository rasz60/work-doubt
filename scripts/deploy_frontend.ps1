# 웹 앱 배포: expo export(운영 API 주소로) → 압축 업로드 → 교체 → 번들 응답 확인
#
#   사용법:  .\scripts\deploy_frontend.ps1
#
# scp -r dist\* 는 Windows 에서 _expo 폴더가 빠질 수 있어 tar 로 묶어 올린다.

. "$PSScriptRoot\deploy-common.ps1"

$app     = Join-Path $ROOT 'app'
$dist    = Join-Path $app 'dist'
$archive = Join-Path $env:TEMP 'workout-web.tgz'

# 1. BUILD
# EXPO_PUBLIC_* 는 빌드 시 번들에 박히므로 운영 주소를 넣고 빌드한다. (app\.env 보다 셸 값이 우선)
Write-Step '빌드 (expo export -p web)'
$saved = @{ EXPO_PUBLIC_API_BASE_URL = $env:EXPO_PUBLIC_API_BASE_URL }
Push-Location $app
try {
    $env:EXPO_PUBLIC_API_BASE_URL = "https://$DOMAIN"
    npx expo export -p web --clear
    Assert-Exit 'expo export'
} finally {
    Restore-Env $saved
    Pop-Location
}

### 번들에 운영 주소가 들어갔는지 확인
$entry = Get-ChildItem (Join-Path $dist '_expo\static\js\web') -Filter 'entry-*.js' | Select-Object -First 1
if (-not $entry) { throw 'JS 번들(entry-*.js)을 찾을 수 없습니다' }
if (-not (Select-String -Path $entry.FullName -Pattern "https://$DOMAIN" -SimpleMatch -Quiet)) {
    throw "번들에 https://$DOMAIN 이 없습니다. 빌드 환경변수를 확인하세요"
}

# 2. UPLOAD
Write-Step "업로드 ($VM_IP)"
& "$env:SystemRoot\System32\tar.exe" -czf $archive -C $dist .
Assert-Exit 'tar'
try {
    Copy-ToVm $archive '/tmp/workout-web.tgz'
} finally {
    Remove-Item $archive -ErrorAction SilentlyContinue
}

# 3. REPLACE
Write-Step '교체 (/var/www/workout)'
Invoke-Ssh 'rm -rf /var/www/workout/* && tar -xzf /tmp/workout-web.tgz -C /var/www/workout --warning=no-unknown-keyword && rm /tmp/workout-web.tgz'

# 4. VERIFY
# 번들이 없으면 Caddy 가 index.html 로 대신 응답해 로딩 화면에서 멈추므로 Content-Type 으로 확인한다.
Write-Step '번들 응답 확인'
$res = Invoke-WebRequest "https://$DOMAIN/_expo/static/js/web/$($entry.Name)" -Method Head -UseBasicParsing
if ($res.Headers['Content-Type'] -notmatch 'javascript') {
    throw "JS 번들 대신 '$($res.Headers['Content-Type'])' 가 응답됩니다. /var/www/workout/_expo 를 확인하세요"
}
Write-Host "Frontend 배포 완료 (https://$DOMAIN)" -ForegroundColor Green
