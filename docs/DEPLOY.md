# 배포 가이드 (Oracle Cloud)

Oracle Cloud Infrastructure(OCI) **Always Free** VM 한 대에 백엔드와 웹 앱을 함께 올리는 절차입니다.
로컬 실행은 [RUN.md](RUN.md), 설계는 [ARCHITECTURE.md](ARCHITECTURE.md) 를 보세요.

## 0. 전체 구성

```
                    ┌──────────────── OCI VM (Ubuntu, ARM) ────────────────┐
브라우저 / 앱 ──443──▶│ Caddy (HTTPS 자동 발급)                               │
                    │   /api/*, /healthz  →  workout-api (Go, :8080)  ──────┼──▶ Supabase Postgres (풀러, IPv4)
                    │   그 외 경로        →  /var/www/workout (Expo 웹 정적 파일) │──▶ Anthropic API
                    └───────────────────────────────────────────────────────┘
```

| 결정 | 이유 |
|---|---|
| DB 는 **Supabase 를 그대로** 쓴다 | 이미 운영 중이고, VM 에 Postgres 를 따로 두면 백업·업데이트 부담이 생긴다 |
| 웹과 API 를 **같은 도메인**에 둔다 | 같은 출처라 CORS 문제가 사라지고, 인증서도 하나로 끝난다 |
| 리버스 프록시는 **Caddy** | Let's Encrypt 인증서 발급·갱신이 자동이고, AI 코치의 SSE(`text/event-stream`)를 버퍼링 없이 바로 흘려 준다 |
| 백엔드는 **바이너리 + systemd** | Go 단일 바이너리라 Docker 없이도 충분히 단순하다 |
| VM 은 **Ampere A1 (ARM64)** | Always Free 한도가 가장 넉넉하다(최대 4 OCPU / 24GB) |

이 문서에서 쓰는 자리표시자:

| 표기 | 의미 | 예시 |
|---|---|---|
| `<DOMAIN>` | 서비스 도메인 | `workout.example.com` |
| `<VM_IP>` | VM 의 공인 IP | `152.70.x.x` |
| `<KEY>` | SSH 개인 키 경로 | `C:\Users\devsi\.ssh\oci_workout` |

---

## 1. 순서 한눈에 보기

| 장 | 할 일 | 어디서 |
|---|---|---|
| 2 | 도메인 준비 | 도메인 업체 |
| 3 | OCI 계정·네트워크·VM 생성 | OCI 콘솔 |
| 4 | 서버 기본 설정 (방화벽, Caddy) | SSH |
| 5 | 운영용 환경변수 작성 | SSH |
| 6 | 백엔드 빌드·업로드·서비스 등록 | 로컬 PC → SSH |
| 7 | 웹 앱 빌드·업로드 | 로컬 PC → SSH |
| 8 | Caddy 설정 (HTTPS + 라우팅) | SSH |
| 9 | 외부 설정 갱신 (소셜 로그인 리디렉트 URI) | 각 콘솔 |
| 10 | 동작 확인 | 브라우저 / PowerShell |
| 11 | (선택) 모바일 앱 빌드 | EAS |

---

## 2. 도메인 준비

HTTPS 인증서는 **IP 가 아니라 도메인**에 발급됩니다. 그리고 HTTPS 가 없으면 다음과 같은 일이 생깁니다.

- 모바일 앱이 HTTP 요청을 막습니다 (iOS ATS, Android cleartext 정책)
- 로그인 비밀번호와 토큰이 평문으로 오갑니다
- 소셜 로그인 공급자 대부분이 HTTP 리디렉트 URI 를 받아 주지 않습니다

| 방법 | 비용 | 비고 |
|---|---|---|
| 도메인 구매 (가비아, Cloudflare, Namecheap 등) | 연 1~2만 원 | 권장 |
| DuckDNS 같은 무료 서브도메인 | 무료 | 테스트용으로 충분 |

VM 을 만든 뒤(3장) **A 레코드 `<DOMAIN>` → `<VM_IP>`** 를 등록합니다.

> Cloudflare 를 쓴다면 처음에는 프록시(주황 구름)를 **끄고(DNS only)** 시작하세요.
> 켜 두면 Caddy 의 인증서 발급이 꼬이거나 SSE 가 버퍼링될 수 있습니다.

---

## 3. OCI 리소스 만들기

### 3-1. 계정

1. cloud.oracle.com 에서 가입합니다. 카드 인증은 필요하지만 Always Free 범위 안에서는 과금되지 않습니다.
2. **Home Region** 을 고릅니다. 나중에 **변경할 수 없습니다.**
   - 한국 사용자라면 `South Korea Central (Seoul)` 또는 `South Korea North (Chuncheon)`
   - Supabase 프로젝트 리전(예: `ap-northeast-2`)과 가까울수록 DB 지연이 줄어듭니다

### 3-2. 네트워크 (VCN)

1. 콘솔 → **Networking → Virtual Cloud Networks → Start VCN Wizard**
2. **Create VCN with Internet Connectivity** 를 선택하고 기본값으로 생성합니다
3. 생성된 VCN → **Public Subnet → Default Security List → Add Ingress Rules**

| Source CIDR | Protocol | Dest Port | 용도 |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `80` | HTTP (인증서 발급, HTTPS 리디렉트) |
| `0.0.0.0/0` | TCP | `443` | HTTPS |

> 22번(SSH)은 마법사가 이미 열어 둡니다. **8080 은 열지 마세요.** 백엔드는 Caddy 를 통해서만 노출합니다.

### 3-3. VM (Compute Instance)

콘솔 → **Compute → Instances → Create instance**

| 항목 | 값 |
|---|---|
| Image | **Canonical Ubuntu 24.04** |
| Shape | **VM.Standard.A1.Flex** (Ampere) — 1~2 OCPU / 6~12GB 면 충분 |
| Networking | 3-2 의 VCN, **Public subnet**, `Assign a public IPv4 address` 체크 |
| SSH keys | **Generate a key pair** 후 개인 키를 내려받아 `<KEY>` 에 보관 |

- **`Out of capacity` 오류가 나면** A1 재고가 없는 것입니다. 다른 Availability Domain 을 고르거나, 시간을 두고 다시 시도하세요.
- 공인 IP 는 기본값이 Ephemeral 이라 인스턴스를 재생성하면 바뀝니다. 고정하려면 인스턴스 → **Attached VNICs → IPv4 Addresses** 에서 **Reserved public IP** 로 바꿉니다.

접속 확인:

```powershell
ssh -i <KEY> ubuntu@<VM_IP>
```

> Windows 에서 `Permissions for '<KEY>' are too open` 이 뜨면, 키 파일 권한을 본인만 읽을 수 있게 줄여야 합니다.
> ```powershell
> icacls <KEY> /inheritance:r /grant:r "$($env:USERNAME):R"
> ```

---

## 4. 서버 기본 설정

이후 명령은 모두 **VM 에 SSH 로 접속한 상태**에서 실행합니다.

### 4-1. 패키지 업데이트

```bash
sudo apt update && sudo apt -y upgrade
sudo timedatectl set-timezone Asia/Seoul
```

### 4-2. OS 방화벽 열기 — OCI 에서 가장 자주 막히는 곳

OCI 의 Ubuntu 이미지는 **iptables 에 기본 REJECT 규칙**이 들어 있습니다.
Security List(3-2)만 열어서는 접속이 안 되고, OS 방화벽도 열어야 합니다.

REJECT 줄 번호는 이미지마다 다르므로(5번 또는 6번), 번호를 직접 찾아서 **그 위에** 삽입합니다.

```bash
N=$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
echo "REJECT line: $N"
sudo iptables -I INPUT $N -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT $N -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT --line-numbers -n   # ACCEPT 80/443 이 REJECT 줄보다 위에 있어야 함
```

> 규칙이 REJECT 아래에 들어가면 Security List 를 열었어도 외부 접속이 막히고,
> Caddy 로그에 `acme:error:connection ... Error getting validation data` 가 반복됩니다.

> `ufw` 는 켜지 마세요. OCI 이미지의 iptables 규칙과 충돌합니다.

### 4-3. Caddy 설치

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 4-4. 실행 계정과 디렉터리

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin workout
sudo mkdir -p /opt/workout /etc/workout /var/www/workout
sudo chown ubuntu:ubuntu /opt/workout /var/www/workout   # 업로드는 ubuntu 계정으로
```

---

## 5. 운영용 환경변수

로컬 `.env` 를 그대로 복사하지 말고, **운영용 값으로 새로 작성**합니다.

```bash
sudo nano /etc/workout/api.env
```

```ini
PORT=8080
ALLOW_ORIGIN=https://<DOMAIN>

# Supabase Session pooler (IPv4). 로컬과 같은 값이어도 됨
DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require
DB_MAX_CONNS=5

# 운영용으로 새로 생성 (로컬 값 재사용 금지)
JWT_SECRET=<openssl rand -base64 48 결과>
ACCESS_TOKEN_TTL=30m
REFRESH_TOKEN_TTL=720h

ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-opus-5

# 소셜 로그인을 쓸 때만
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URL=https://<DOMAIN>/auth/callback/google
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URL=https://<DOMAIN>/auth/callback/kakao
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
NAVER_REDIRECT_URL=https://<DOMAIN>/auth/callback/naver
```

```bash
openssl rand -base64 48                 # JWT_SECRET 생성
sudo chown root:workout /etc/workout/api.env
sudo chmod 640 /etc/workout/api.env     # 시크릿 파일: 다른 계정은 읽지 못하게
```

| 로컬과 달라지는 값 | 이유 |
|---|---|
| `ALLOW_ORIGIN` | 웹이 `https://<DOMAIN>` 에서 열린다. 같은 출처라 실제로는 CORS 가 필요 없지만, `*` 로 열어 두지 않기 위해 명시한다 |
| `JWT_SECRET` | 로컬 토큰으로 운영에 접근할 수 없도록 분리 |
| `*_REDIRECT_URL` | 소셜 로그인 콜백이 운영 도메인으로 돌아와야 한다 |

> **Supabase 는 반드시 풀러 주소**를 쓰세요. OCI VM 은 기본적으로 IPv4 만 있어서 직접 연결(`db.<ref>.supabase.co`, IPv6 전용)은 실패합니다. ([RUN.md](RUN.md) 2-1 과 같은 이유)

---

## 6. 백엔드 배포

### 6-1. 로컬 PC 에서 빌드 (ARM64 리눅스용 교차 컴파일)

```powershell
cd C:\Users\devsi\workout\backend
$env:GOOS = "linux"; $env:GOARCH = "arm64"; $env:CGO_ENABLED = "0"
go build -trimpath -ldflags "-s -w" -o ..\dist\workout-api ./cmd/api
Remove-Item Env:GOOS, Env:GOARCH, Env:CGO_ENABLED   # 로컬 빌드 설정으로 원복
```

> VM 을 x86(`VM.Standard.E2.1.Micro`)으로 만들었다면 `GOARCH=amd64` 로 바꿉니다.

### 6-2. 업로드

```powershell
scp -i <KEY> ..\dist\workout-api ubuntu@<VM_IP>:/opt/workout/workout-api.new
```

### 6-3. systemd 서비스 등록 (최초 1회)

```bash
sudo tee /etc/systemd/system/workout-api.service > /dev/null <<'EOF'
[Unit]
Description=Workout API
After=network-online.target
Wants=network-online.target

[Service]
User=workout
Group=workout
EnvironmentFile=/etc/workout/api.env
ExecStart=/opt/workout/workout-api
Restart=on-failure
RestartSec=3
# 보안 하드닝: 바이너리는 파일을 쓸 일이 없다
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable workout-api
```

### 6-4. 교체·재시작 (배포할 때마다)

```bash
chmod +x /opt/workout/workout-api.new
mv /opt/workout/workout-api.new /opt/workout/workout-api
sudo systemctl restart workout-api
curl -s localhost:8080/healthz          # {"status":"ok"}
```

`main.go` 가 SIGTERM 을 받으면 15초 동안 graceful shutdown 하므로, 재시작해도 진행 중인 요청은 마무리됩니다.

---

## 7. 웹 앱 배포

### 7-1. 로컬 PC 에서 빌드

`EXPO_PUBLIC_*` 값은 **빌드할 때 번들에 박힙니다.** 운영 주소를 넣고 빌드해야 합니다.
같은 도메인에서 서비스하므로 API 주소는 `https://<DOMAIN>` 입니다.

```powershell
cd C:\Users\devsi\workout\app
$env:EXPO_PUBLIC_API_BASE_URL = "https://<DOMAIN>"
# 소셜 로그인을 쓸 때만 (ID 만, secret 은 절대 넣지 않음)
# $env:EXPO_PUBLIC_GOOGLE_CLIENT_ID = "..."
npx expo export -p web               # → app\dist 생성
Remove-Item Env:EXPO_PUBLIC_API_BASE_URL
```

> `app\.env` 에 `localhost` 값이 있어도, 셸 환경변수가 우선합니다.
> 빌드 결과를 확인하려면 `app\dist` 안의 JS 파일에서 `<DOMAIN>` 이 검색되는지 보면 됩니다.

### 7-2. 업로드

`scp -r .\dist\*` 는 Windows 에서 와일드카드 처리 때문에 `_expo` 폴더(JS 번들)가 빠질 수 있으므로, 압축해서 올립니다.

```powershell
tar -czf web.tgz -C dist .
scp -i <KEY> web.tgz ubuntu@<VM_IP>:/tmp/web.tgz
ssh -i <KEY> ubuntu@<VM_IP> "rm -rf /var/www/workout/* && tar -xzf /tmp/web.tgz -C /var/www/workout && rm /tmp/web.tgz"
Remove-Item web.tgz
```

---

## 8. Caddy 설정 (HTTPS + 라우팅)

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
<DOMAIN> {
	# API: 압축하지 않는다(SSE 스트림이 버퍼링되지 않도록)
	handle /api/* {
		reverse_proxy localhost:8080
	}
	handle /healthz {
		reverse_proxy localhost:8080
	}

	# 웹 앱 (Expo static export)
	handle {
		root * /var/www/workout
		encode zstd gzip
		try_files {path} {path}.html /index.html
		file_server
	}

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
}
EOF

sudo sed -i "s/<DOMAIN>/workout.example.com/" /etc/caddy/Caddyfile   # 실제 도메인으로 치환
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

- 처음 reload 하면 Caddy 가 Let's Encrypt 인증서를 자동으로 받습니다. 이후 갱신도 자동입니다.
- 이 단계 전에 **DNS A 레코드(2장)가 VM IP 를 가리켜야** 발급에 성공합니다.
- Caddy 의 `reverse_proxy` 는 `text/event-stream` 응답을 받으면 즉시 흘려 보내므로, AI 코치 스트리밍에 별도 설정이 필요 없습니다.

---

## 9. 외부 설정 갱신

| 대상 | 바꿀 값 |
|---|---|
| Google / Kakao / Naver 콘솔 | 리디렉트 URI 에 `https://<DOMAIN>/auth/callback/<provider>` 추가 |
| Kakao 콘솔 | 플랫폼 → Web 사이트 도메인에 `https://<DOMAIN>` 추가 |
| Supabase | 변경 없음 (풀러는 IP 제한이 없음. Network Restrictions 를 켰다면 `<VM_IP>` 허용) |

---

## 10. 동작 확인

```powershell
# HTTPS + 백엔드
Invoke-RestMethod https://<DOMAIN>/healthz                 # status : ok

# 가입 → 지표 조회 (RUN.md 5장과 같은 흐름, 주소만 운영으로)
$session = Invoke-RestMethod -Method Post https://<DOMAIN>/api/v1/auth/register `
  -ContentType 'application/json' `
  -Body '{"email":"deploy-check@example.com","password":"password123","display_name":"배포확인"}'
$headers = @{ Authorization = "Bearer $($session.tokens.access_token)" }
Invoke-RestMethod "https://<DOMAIN>/api/v1/metrics/series?kind=weight_kg" -Headers $headers
```

브라우저에서 `https://<DOMAIN>` 접속 → 로그인 → 지표 입력 → **COACH** 탭에서 답변이 글자 단위로 흘러나오면 SSE 까지 정상입니다.

---

## 11. (선택) 모바일 앱

웹과 달리 모바일은 OCI 에 올리는 것이 아니라 **앱 빌드만 운영 API 를 바라보게** 하면 됩니다.

```powershell
npm install -g eas-cli
cd C:\Users\devsi\workout\app
eas login
eas build:configure
```

`eas.json` 의 `production` 프로필에 운영 주소를 넣습니다.

```json
{
  "build": {
    "production": {
      "env": { "EXPO_PUBLIC_API_BASE_URL": "https://<DOMAIN>" }
    }
  }
}
```

```powershell
eas build -p android --profile production   # Play 스토어용 AAB
eas build -p ios --profile production       # Apple Developer 계정(연 $99) 필요
```

---

## 12. 운영

### 12-1. 자주 쓰는 명령 (VM)

```bash
sudo systemctl status workout-api            # 상태
sudo journalctl -u workout-api -f            # 백엔드 로그 (JSON)
sudo journalctl -u caddy -f                  # 프록시·인증서 로그
sudo systemctl restart workout-api           # 재시작
```

### 12-2. 업데이트 배포 요약 (로컬 PC)

아래 절차는 스크립트로 묶여 있습니다. VM IP·도메인은 `scripts\deploy-common.ps1` 에 있고, SSH 키는 프로젝트 루트의 `oracle-key\`(git 제외)에 두며, 다른 키는 `$env:OCI_SSH_KEY` 로 지정합니다.

```powershell
.\scripts\deploy_backend.ps1    # 빌드 → 업로드 → 재시작 → /healthz 확인
.\scripts\deploy_frontend.ps1   # 빌드 → tar 업로드 → 교체 → JS 번들 Content-Type 확인
```

수동으로 할 때:

```powershell
# 백엔드
cd C:\Users\devsi\workout\backend
$env:GOOS="linux"; $env:GOARCH="arm64"; $env:CGO_ENABLED="0"
go build -trimpath -ldflags "-s -w" -o ..\dist\workout-api ./cmd/api
Remove-Item Env:GOOS, Env:GOARCH, Env:CGO_ENABLED
scp -i <KEY> ..\dist\workout-api ubuntu@<VM_IP>:/opt/workout/workout-api.new
ssh -i <KEY> ubuntu@<VM_IP> "chmod +x /opt/workout/workout-api.new && mv /opt/workout/workout-api.new /opt/workout/workout-api && sudo systemctl restart workout-api"

# 웹
cd C:\Users\devsi\workout\app
$env:EXPO_PUBLIC_API_BASE_URL="https://<DOMAIN>"; npx expo export -p web; Remove-Item Env:EXPO_PUBLIC_API_BASE_URL
tar -czf web.tgz -C dist .
scp -i <KEY> web.tgz ubuntu@<VM_IP>:/tmp/web.tgz
ssh -i <KEY> ubuntu@<VM_IP> "rm -rf /var/www/workout/* && tar -xzf /tmp/web.tgz -C /var/www/workout && rm /tmp/web.tgz"
Remove-Item web.tgz
```

**스키마를 바꿨다면** 배포 전에 Supabase SQL Editor 에서 변경분 SQL 을 먼저 실행합니다([RUN.md](RUN.md) 2-2).

### 12-3. Always Free 주의사항

- **유휴 인스턴스 회수:** 7일 동안 CPU·네트워크·메모리 사용률이 모두 매우 낮으면, Oracle 이 Always Free 인스턴스를 회수할 수 있습니다. 계정을 **Pay As You Go 로 업그레이드**하면 회수 대상에서 빠지고, 무료 한도 안에서는 여전히 과금되지 않습니다.
- **부트 볼륨 백업:** 콘솔 → Block Storage → Boot Volumes → Backups 에서 주기적으로 스냅샷을 만들어 두세요. Always Free 에 백업 5개가 포함됩니다.
- **데이터는 Supabase 에 있습니다.** VM 이 사라져도 이 문서대로 다시 만들면 복구됩니다.

---

## 13. 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| 브라우저에서 접속 자체가 안 됨 (타임아웃) | ① Security List 80/443 미개방(3-2) ② **OS iptables 미개방(4-2)** ← 가장 흔함 |
| Caddy 로그에 `obtaining certificate` 실패 / `Error getting validation data` | ① iptables 의 80/443 ACCEPT 가 **REJECT 줄 아래**에 있음(4-2) ② DNS A 레코드가 VM IP 를 가리키지 않음(`nslookup <DOMAIN>`) ③ Security List 80 미개방 |
| `502 Bad Gateway` | 백엔드가 죽어 있음. `journalctl -u workout-api` 확인 |
| 백엔드 기동 실패: `JWT_SECRET must be at least 32 bytes` | `/etc/workout/api.env` 권한 또는 값 문제. `sudo -u workout cat /etc/workout/api.env` 로 읽히는지 확인 |
| `exec format error` | 바이너리 아키텍처 불일치. ARM VM 이면 `GOARCH=arm64`, x86 이면 `amd64` |
| DB 연결 실패 `no route to host` / IPv6 주소 | Supabase 직접 연결 주소를 쓰고 있음. 풀러 주소로 교체 |
| 웹이 `localhost:8080` 으로 요청함 | `EXPO_PUBLIC_API_BASE_URL` 없이 빌드됨. 7-1 다시 빌드 |
| 첫 화면이 로딩 스피너에서 멈춤 | JS 번들이 업로드되지 않아 `index.html` 이 대신 내려감. `curl -I https://<DOMAIN>/_expo/static/js/web/<entry>.js` 가 `text/html` 이면 `/var/www/workout/_expo` 누락 → 7-2 로 재업로드 |
| 새로고침하면 404 | Caddyfile 의 `try_files` 누락 |
| AI 코치 답변이 한 번에 몰아서 나옴 | 중간에 버퍼링하는 프록시가 있음. Cloudflare 프록시(주황 구름)를 끄거나, `/api/*` 에 `encode` 를 걸지 않았는지 확인 |
| `Out of capacity for shape VM.Standard.A1.Flex` | A1 재고 부족. 다른 AD 를 선택하거나 나중에 재시도 |
