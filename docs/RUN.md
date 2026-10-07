# 실행 가이드

Windows + PowerShell 기준입니다. 설계 설명은 [ARCHITECTURE.md](ARCHITECTURE.md) 를 보세요.

## 0. 사전 준비

| 도구 | 확인 명령 | 이 PC 상태 |
|---|---|---|
| Go 1.24+ | `go version` | go1.26.2 ✔ |
| Node 20+ | `node -v` | v24.14.1 ✔ |
| Supabase 프로젝트 | — | `hsykrtillmitbhkyzruq` ✔ |
| Anthropic API 키 | — | AI 코치 탭에만 필요 |

**DB 는 Supabase 를 사용합니다. Docker 와 `psql` 은 필요 없습니다.**
마이그레이션은 Supabase 대시보드의 SQL Editor 에서 실행합니다.
`docker-compose.yml` 은 오프라인 개발용 대안으로만 남겨 두었습니다(9장).

---

## 1. 환경변수 (1회)

```powershell
cd C:\Users\devsi\workout
Copy-Item .env.example .env
```

`.env` 에서 **최소 두 개**를 채웁니다.

```ini
# Supabase 연결 문자열 (2장에서 복사)
DATABASE_URL=postgresql://postgres.hsykrtillmitbhkyzruq:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require

# 32바이트 이상 필수. 비어 있으면 서버가 기동하지 않습니다.
JWT_SECRET=<아래 명령으로 생성>

# AI 코치 탭을 쓸 때만 필요
ANTHROPIC_API_KEY=sk-ant-...
```

시크릿 생성:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

프론트엔드용 `.env` 도 하나 만듭니다 (Expo 는 앱 디렉터리의 `.env` 를 자동으로 읽습니다).

```powershell
"EXPO_PUBLIC_API_BASE_URL=http://localhost:8080" | Out-File -Encoding utf8 app\.env
```

---

## 2. 데이터베이스 (Supabase)

프로젝트: `https://hsykrtillmitbhkyzruq.supabase.co`

### 2-1. 연결 문자열 가져오기 — 반드시 **풀러**를 쓰세요

Supabase 는 두 가지 접속 경로를 줍니다. 이 PC 에서 확인한 결과:

```
db.hsykrtillmitbhkyzruq.supabase.co  →  AAAA 2406:da18:1248:be00::1357  (IPv6 전용, A 레코드 없음)
이 PC 의 글로벌 IPv6 주소: 없음      →  5432 직접 연결 실패
```

| 경로 | 호스트 | 주소 | 이 환경 |
|---|---|---|---|
| Direct connection | `db.<ref>.supabase.co:5432` | IPv6 전용 | ❌ 사용 불가 |
| **Session pooler** | `aws-0-<region>.pooler.supabase.com:5432` | IPv4 | ✅ **권장** |
| Transaction pooler | `aws-0-<region>.pooler.supabase.com:6543` | IPv4 | ✅ 가능 (`DB_QUERY_MODE=exec`) |

1. 대시보드 우측 상단 **[Connect]** 클릭
2. **Session pooler** 의 연결 문자열 복사 (사용자 이름이 `postgres.hsykrtillmitbhkyzruq` 형식인 것)
3. `[YOUR-PASSWORD]` 를 DB 비밀번호로 치환 (잊었으면 Settings → Database → Reset password)
4. 끝에 `?sslmode=require` 추가
5. `.env` 의 `DATABASE_URL` 에 붙여넣기

```ini
DATABASE_URL=postgresql://postgres.hsykrtillmitbhkyzruq:실제비밀번호@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require
```

> 비밀번호에 `@ : / ?` 같은 문자가 있으면 URL 인코딩해야 합니다(`@` → `%40`).
> 리전(`ap-northeast-2` 등)은 프로젝트마다 달라 대시보드 값을 그대로 쓰세요.

### 2-2. 스키마 적용

1. 대시보드 → **SQL Editor** → **New query**
2. [backend/migrations/0001_init.sql](../backend/migrations/0001_init.sql) 전체를 복사해 붙여넣고 **Run**

클립보드로 복사:

```powershell
Get-Content C:\Users\devsi\workout\backend\migrations\0001_init.sql -Raw | Set-Clipboard
```

`Success. No rows returned` 가 나오면 완료입니다.
Table Editor 에 테이블 8개(`users`, `user_identities`, `refresh_tokens`, `groups`,
`group_members`, `body_metrics`, `coach_conversations`, `coach_messages`)가 보여야 합니다.

### 2-3. 이 마이그레이션이 Supabase 에서 추가로 하는 일

Supabase 는 `public` 스키마의 테이블을 **PostgREST 로 자동 노출**하고,
기본 권한 때문에 새 테이블이 `anon` / `authenticated` 역할에 그대로 열립니다.
즉 아무 조치를 안 하면 **anon 키만으로 모든 회원의 신체 지표를 읽을 수 있습니다.**

마이그레이션 끝부분이 이를 막습니다.

- 8개 테이블 전부 **RLS 활성화 + 정책 0개** → `anon` / `authenticated` 는 0행
- `public` 스키마 테이블·시퀀스 권한을 두 역할에서 **회수**

이 앱은 Supabase Auth 와 PostgREST 를 쓰지 않고 Go 백엔드가 `postgres` 역할로만
접속하므로 동작에는 영향이 없습니다(소유자는 RLS 를 우회).
나중에 PostgREST 를 쓰려면 그때 필요한 정책만 명시적으로 추가하세요.

> **스키마를 수정했다면** SQL Editor 에서 변경분만 다시 실행하면 됩니다.
> 처음부터 다시 만들려면 `DROP TABLE ... CASCADE` 후 전체 재실행하세요.

---

## 3. 백엔드

백엔드는 `.env` 파일을 직접 읽지 않고 **환경변수만** 봅니다. 셸에 먼저 올립니다.

```powershell
cd C:\Users\devsi\workout
. .\scripts\load-env.ps1        # 맨 앞의 점(.)이 중요합니다
cd backend
go run ./cmd/api
```

```
{"time":"...","level":"INFO","msg":"listening","addr":":8080"}
```

확인:

```powershell
Invoke-RestMethod http://localhost:8080/healthz
# status : ok
```

테스트와 정적 분석:

```powershell
cd C:\Users\devsi\workout\backend
go test ./...
go vet ./...
```

---

## 4. 프론트엔드

**새 터미널**에서 (백엔드는 계속 켜 둡니다):

```powershell
cd C:\Users\devsi\workout\app
npm install          # 최초 1회
npx expo start
```

터미널에 뜬 안내에서 플랫폼을 고릅니다.

| 키 | 플랫폼 | 필요 조건 |
|---|---|---|
| `w` | **웹** (http://localhost:8081) | 없음 — 가장 빠른 확인 경로 |
| `a` | **Android** | Android Studio 에뮬레이터 또는 USB 연결 기기 + Expo Go |
| `i` | **iOS** | macOS + Xcode 필요 (Windows 에서는 실기기 Expo Go 로만) |
| QR | 실기기 | 같은 Wi-Fi + Expo Go 앱 |

### 플랫폼별 API 주소

`localhost` 는 기기마다 가리키는 대상이 다릅니다. `app\.env` 를 맞춰 주세요.

| 실행 환경 | `EXPO_PUBLIC_API_BASE_URL` |
|---|---|
| 웹 | `http://localhost:8080` |
| Android 에뮬레이터 | `http://10.0.2.2:8080` |
| iOS 시뮬레이터 | `http://localhost:8080` |
| 실기기 (같은 Wi-Fi) | `http://<PC의 LAN IP>:8080` |

PC 의 LAN IP 확인:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' }).IPAddress
```

실기기나 다른 포트를 쓸 때는 백엔드의 `ALLOW_ORIGIN` 도 함께 맞춰야 CORS 가 통과합니다
(기본값 `.env.example` 에서는 `http://localhost:8081`, 와일드카드는 `*`).

> `.env` 를 바꾼 뒤에는 Expo 를 재시작해야 반영됩니다: `npx expo start -c`

---

## 5. 동작 확인 (API 직접 호출)

UI 없이 백엔드만 점검하려면:

```powershell
# 가입 → 토큰 확보
$session = Invoke-RestMethod -Method Post http://localhost:8080/api/v1/auth/register `
  -ContentType 'application/json' `
  -Body '{"email":"test@example.com","password":"password123","display_name":"테스터"}'

$headers = @{ Authorization = "Bearer $($session.tokens.access_token)" }

# 지표 입력 (BMI 는 서버가 계산)
Invoke-RestMethod -Method Post http://localhost:8080/api/v1/metrics `
  -Headers $headers -ContentType 'application/json' `
  -Body '{"measured_at":"2026-10-01","height_cm":178,"weight_kg":79.5,"skeletal_muscle_kg":35.2,"body_fat_percentage":18.4}'

Invoke-RestMethod -Method Post http://localhost:8080/api/v1/metrics `
  -Headers $headers -ContentType 'application/json' `
  -Body '{"measured_at":"2026-10-06","weight_kg":77.8,"skeletal_muscle_kg":35.9,"body_fat_percentage":16.9}'

# 변동폭 차트 데이터
Invoke-RestMethod "http://localhost:8080/api/v1/metrics/series?kind=weight_kg" -Headers $headers |
  ConvertTo-Json -Depth 5
```

`stats.delta` 가 `-1.7` 로 나오면 변동폭 계산까지 정상입니다.
이제 앱의 **변동폭** 탭에서 같은 데이터가 차트로 보입니다.

AI 코치까지 확인하려면 (`ANTHROPIC_API_KEY` 필요):

```powershell
$conv = Invoke-RestMethod -Method Post http://localhost:8080/api/v1/coach/conversations `
  -Headers $headers -ContentType 'application/json' `
  -Body '{"goal":"fat_loss","title":"첫 상담"}'

# SSE 응답이므로 스트림이 그대로 출력됩니다
curl.exe -N -X POST "http://localhost:8080/api/v1/coach/conversations/$($conv.id)/ask" `
  -H "Authorization: Bearer $($session.tokens.access_token)" `
  -H "Content-Type: application/json" `
  -d '{\"question\":\"주 3회 운동할 수 있는데 어떤 루틴이 좋을까요?\"}'
```

---

## 6. 소셜 로그인 설정 (선택)

이메일 로그인만으로도 전부 동작합니다. 소셜을 붙일 때만 필요합니다.

1. 각 콘솔에서 앱을 만들고 **리디렉트 URI** 를 등록합니다.
   - 웹: `http://localhost:8081/auth/callback/<provider>`
   - 네이티브: `workout://auth/callback/<provider>` (scheme 은 `app.json` 의 `scheme`)
2. `.env` 에 서버용 값을 넣습니다 — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URL` (카카오·네이버 동일 패턴).
3. `app\.env` 에 클라이언트용 **ID 만** 넣습니다. **secret 은 절대 넣지 마세요** — `EXPO_PUBLIC_*` 는 앱 번들에 그대로 박힙니다.

```ini
EXPO_PUBLIC_GOOGLE_CLIENT_ID=...
EXPO_PUBLIC_KAKAO_CLIENT_ID=...
EXPO_PUBLIC_NAVER_CLIENT_ID=...
```

| 콘솔 | 주소 |
|---|---|
| Google | console.cloud.google.com → API 및 서비스 → 사용자 인증 정보 |
| Kakao | developers.kakao.com → 내 애플리케이션 → 카카오 로그인 |
| Naver | developers.naver.com → 애플리케이션 → 네아로 |

---

## 7. 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| `config: JWT_SECRET must be at least 32 bytes` | `load-env.ps1` 을 **dot-source** 하지 않았거나 `.env` 가 비어 있음. `. .\scripts\load-env.ps1` |
| `config: DATABASE_URL is required` | 같은 원인. 환경변수가 세션에 올라왔는지 `$env:DATABASE_URL` 로 확인 |
| `postgres: ping db.xxx.supabase.co:5432: ... no such host` 또는 네트워크 도달 불가 | **직접 연결(IPv6 전용)을 쓰고 있음.** 2-1 의 Session pooler 주소(`*.pooler.supabase.com`)로 교체. 서버 기동 시 경고 로그로도 알려줍니다 |
| `FATAL: Tenant or user not found` | 풀러 사용자 이름이 틀림. `postgres` 가 아니라 `postgres.hsykrtillmitbhkyzruq` 형식이어야 함 |
| `FATAL: password authentication failed` | 비밀번호 오류, 또는 특수문자 URL 인코딩 누락(`@` → `%40`). Settings → Database → Reset password |
| `prepared statement "stmtN" already exists` | Transaction 풀러(6543)를 쓰면서 캐시가 켜짐. `.env` 에 `DB_QUERY_MODE=exec` (그래도 나면 `simple`), 또는 포트 5432 로 변경 |
| `FATAL: max clients reached` / 연결이 간헐적으로 끊김 | 무료 플랜 연결 한도 초과. `DB_MAX_CONNS` 를 3~5 로 낮춤 |
| `relation "users" does not exist` | SQL Editor 에서 마이그레이션 미실행. 2-2 수행 |
| `permission denied for table users` | `postgres` 가 아닌 역할로 접속 중. 연결 문자열의 사용자 이름 확인(RLS 가 anon/authenticated 를 막습니다 — 의도된 동작) |
| TLS 관련 오류 | 연결 문자열 끝에 `?sslmode=require` 가 있는지 확인 |
| 앱에서 `Network request failed` | `EXPO_PUBLIC_API_BASE_URL` 이 플랫폼과 맞지 않음(4장 표 참고). 변경 후 `npx expo start -c` |
| 웹에서 CORS 오류 | 백엔드 `ALLOW_ORIGIN` 이 실제 접속 주소와 다름 |
| AI 코치가 `stream_failed` | `ANTHROPIC_API_KEY` 미설정/무효. 백엔드 로그의 `coach ask` 에러 확인 |
| 포트 8080/8081 사용 중 | `Get-NetTCPConnection -LocalPort 8080` 로 점유 프로세스 확인, 또는 `.env` 의 `PORT` 변경 |

---

## 8. 자주 쓰는 명령 요약

```powershell
# 터미널 1 — 백엔드 (DB 는 Supabase 이므로 띄울 것이 없음)
cd C:\Users\devsi\workout
. .\scripts\load-env.ps1          # 맨 앞 점 필수
cd backend; go run ./cmd/api

# 터미널 2 — 앱
cd C:\Users\devsi\workout\app; npx expo start

# 검증
cd C:\Users\devsi\workout\backend; go test ./...; go vet ./...
cd C:\Users\devsi\workout\app;     npx tsc --noEmit

# 마이그레이션 SQL 을 클립보드로 (→ Supabase SQL Editor 에 붙여넣기)
Get-Content C:\Users\devsi\workout\backend\migrations\0001_init.sql -Raw | Set-Clipboard
```

---

## 9. (선택) 로컬 Docker Postgres 로 대체

비행기 안이나 Supabase 장애 시처럼 오프라인으로 작업할 때만 씁니다.

```powershell
# Docker Desktop 이 실행 중이어야 합니다
cd C:\Users\devsi\workout
docker compose up -d db                    # 최초 기동 시 마이그레이션 자동 적용
docker compose exec db psql -U workout -d workout -c "\dt"
```

`.env` 의 `DATABASE_URL` 을 로컬 주소로 바꿔야 합니다.

```ini
DATABASE_URL=postgres://workout:workout@localhost:5432/workout?sslmode=disable
```

| 증상 | 해결 |
|---|---|
| `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` | Docker Desktop 이 실행되지 않음. 앱을 띄우고 `docker info` 가 응답하면 재시도 |
| 스키마 변경이 반영되지 않음 | 자동 적용은 최초 1회뿐. `docker compose down -v; docker compose up -d db` |

정리:

```powershell
docker compose down        # 데이터 유지
docker compose down -v     # 데이터까지 삭제
```
